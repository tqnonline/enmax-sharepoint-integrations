#!/usr/bin/env python3
"""Create/update solution-aware modern Cloud Flows from solution/src/Workflows.

Why this exists
---------------
`pac solution pack` over the legacy XML source tree does NOT ship the JSON under
`solution/src/Workflows/`. Those files are source-of-truth definitions only.
This script upserts each flow into Dataverse (workflow category=5), adds it to
`enmax_autocadsln` as component type 29, and optionally activates it.

Usage:
    python solution/scripts/deploy_flows.py [--dry-run] [--activate] [--recreate]
        [--auth azcli|device|interactive|spn]
        [--catalog prod|admin]
        [--solution enmax_autocadsln]
        [--only On_Reservation_Created_Notify_Admins]
        [--cleanup-orphans]

--catalog selects which flow_catalog*.yaml drives this run: "prod" (default)
deploys only folders listed in flow_catalog.yaml into enmax_autocadsln;
"admin" deploys only folders listed in flow_catalog_admin.yaml (the UAT
harness flows) into enmax_autocadadminsln. Folders on disk that aren't in the
selected catalog are never touched — this is what keeps UAT harness flows out
of a production deploy. --solution overrides the catalog's default solution
if you need to target a non-standard unique name.

Prefer --recreate after regenerating workflow.json (build_workflow_clientdata.py)
so activation validates a fresh clientdata payload.

Child flows are referenced by workflowReferenceName (folder slug) in parent
definitions — deploy rewrites those to workflow GUIDs using folderSlug tags.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from urllib.parse import quote

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "solution" / "scripts"))

from flow_catalog import (  # noqa: E402
    SOLUTION_ADMIN,
    SOLUTION_PROD,
    flow_description,
    flow_display_name,
    load_catalog,
    parse_folder_slug_from_description,
)
from seed import _load_env_local, _require_env, acquire_token  # noqa: E402

WORKFLOWS_DIR = REPO_ROOT / "solution" / "src" / "Workflows"
DEFAULT_SOLUTION = SOLUTION_PROD

# Modern Flow / Definition (Microsoft Learn: manage-flows-with-code)
CATEGORY_MODERN_FLOW = 5
TYPE_DEFINITION = 1
STATE_DRAFT = 0
STATUS_DRAFT = 1
STATE_ACTIVATED = 1
STATUS_ACTIVATED = 2


def _headers(token: str, *, solution: str | None = None) -> dict[str, str]:
    h = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Content-Type": "application/json",
    }
    if solution:
        h["MSCRM.SolutionUniqueName"] = solution
    return h


def _list_flow_dirs(
    only: list[str] | None,
    catalog: dict[str, dict[str, str]],
) -> list[Path]:
    """List flow folders, restricted to those present in the selected catalog.

    Filtering by catalog membership (rather than deploying every folder under
    Workflows/) is the guard that keeps a prod deploy from ever shipping a UAT
    harness flow once it has been removed from flow_catalog.yaml.
    """
    dirs = sorted(
        p for p in WORKFLOWS_DIR.iterdir()
        if p.is_dir() and (p / "workflow.json").exists() and p.name in catalog
    )
    if only:
        wanted = set(only)
        dirs = [p for p in dirs if p.name in wanted]
        missing = wanted - {p.name for p in dirs}
        if missing:
            raise SystemExit(f"Unknown flow folder(s) (not in selected catalog): {', '.join(sorted(missing))}")
    return dirs


def _find_flow_by_name(
    session: requests.Session,
    base: str,
    token: str,
    name: str,
) -> dict | None:
    safe_name = name.replace("'", "''")
    filter_expr = f"name eq '{safe_name}' and category eq {CATEGORY_MODERN_FLOW}"
    url = (
        f"{base}/api/data/v9.2/workflows"
        f"?$select=workflowid,name,description,statecode,statuscode,category"
        f"&$filter={quote(filter_expr, safe='')}"
        f"&$top=5"
    )
    resp = session.get(url, headers=_headers(token), timeout=60)
    if resp.status_code != 200:
        raise RuntimeError(f"List workflows '{name}' → {resp.status_code}: {resp.text[:300]}")
    rows = resp.json().get("value", [])
    return rows[0] if rows else None


def _delete_flow(
    session: requests.Session,
    base: str,
    token: str,
    workflow_id: str,
    *,
    dry_run: bool,
) -> None:
    if dry_run:
        print(f"  DRY-RUN DELETE workflow {workflow_id}")
        return
    _set_state(session, base, token, workflow_id, activate=False, ignore_errors=True)
    resp = session.delete(
        f"{base}/api/data/v9.2/workflows({workflow_id})",
        headers=_headers(token),
        timeout=60,
    )
    if resp.status_code not in (204, 200):
        raise RuntimeError(f"DELETE {workflow_id} → {resp.status_code}: {resp.text[:300]}")
    print(f"  Deleted {workflow_id}")


def _upsert_flow(
    session: requests.Session,
    base: str,
    token: str,
    *,
    folder_slug: str,
    display_name: str,
    description: str,
    clientdata: dict,
    solution: str,
    dry_run: bool,
    recreate: bool,
) -> str:
    """Return workflowid of created/updated flow."""
    payload = {
        "category": CATEGORY_MODERN_FLOW,
        "type": TYPE_DEFINITION,
        "primaryentity": "none",
        "name": display_name,
        "description": description,
        "clientdata": json.dumps(clientdata, separators=(",", ":")),
    }
    existing = _find_flow_by_name(session, base, token, display_name)
    if existing and recreate:
        try:
            _delete_flow(session, base, token, existing["workflowid"], dry_run=dry_run)
            existing = None
        except Exception as exc:  # noqa: BLE001 — referenced flows cannot be deleted; patch instead
            print(f"  WARN: recreate delete failed, will patch in place: {exc}", file=sys.stderr)

    if existing:
        wid = existing["workflowid"]
        if dry_run:
            print(f"  DRY-RUN PATCH workflow {display_name} ({wid})")
            return wid
        if existing.get("statecode") == STATE_ACTIVATED:
            _set_state(session, base, token, wid, activate=False, ignore_errors=True)
        url = f"{base}/api/data/v9.2/workflows({wid})"
        resp = session.patch(url, headers=_headers(token, solution=solution), json=payload, timeout=120)
        if resp.status_code not in (204, 200):
            raise RuntimeError(f"PATCH {display_name} → {resp.status_code}: {resp.text[:400]}")
        print(f"  Updated {display_name} ({wid})")
        return wid

    if dry_run:
        print(f"  DRY-RUN POST workflow {display_name}")
        return "00000000-0000-0000-0000-000000000000"

    url = f"{base}/api/data/v9.2/workflows"
    resp = session.post(
        url,
        headers={**_headers(token, solution=solution), "Prefer": "return=representation"},
        json={
            **payload,
            "statecode": STATE_DRAFT,
            "statuscode": STATUS_DRAFT,
        },
        timeout=120,
    )
    if resp.status_code not in (201, 200):
        raise RuntimeError(f"POST {display_name} → {resp.status_code}: {resp.text[:500]}")
    wid = resp.json()["workflowid"]
    print(f"  Created {display_name} ({wid})")
    return wid


def _add_to_solution(
    session: requests.Session,
    base: str,
    token: str,
    *,
    workflow_id: str,
    solution: str,
    dry_run: bool,
) -> None:
    if dry_run:
        print(f"  DRY-RUN AddSolutionComponent {workflow_id} → {solution}")
        return
    url = f"{base}/api/data/v9.2/AddSolutionComponent"
    body = {
        "ComponentId": workflow_id,
        "ComponentType": 29,
        "SolutionUniqueName": solution,
        "AddRequiredComponents": False,
        "DoNotIncludeSubcomponents": False,
    }
    resp = session.post(url, headers=_headers(token), json=body, timeout=60)
    if resp.status_code in (200, 204):
        print(f"  Added to solution {solution}")
        return
    text = resp.text or ""
    if resp.status_code == 400 and (
        "already exists" in text.lower()
        or "already a member" in text.lower()
        or "0x80043b0b" in text.lower()
    ):
        print(f"  Already in solution {solution}")
        return
    raise RuntimeError(f"AddSolutionComponent → {resp.status_code}: {text[:400]}")


def _rewrite_child_workflow_refs(clientdata: dict, slug_to_id: dict[str, str]) -> dict:
    """Map workflowReferenceName folder slugs → Dataverse workflowid GUIDs."""

    def walk(node: object) -> object:
        if isinstance(node, list):
            return [walk(x) for x in node]
        if not isinstance(node, dict):
            return node
        out: dict = {}
        for key, value in node.items():
            if key == "workflowReferenceName" and isinstance(value, str) and value in slug_to_id:
                out[key] = slug_to_id[value]
            else:
                out[key] = walk(value)
        return out

    return walk(clientdata)  # type: ignore[return-value]


def _seed_slug_to_id(
    session: requests.Session,
    base: str,
    token: str,
    catalog: dict[str, dict[str, str]],
) -> dict[str, str]:
    """Build folder-slug → workflowid map from deployed flows."""
    slugs = set(catalog)
    url = (
        f"{base}/api/data/v9.2/workflows"
        f"?$select=workflowid,name,description"
        f"&$filter=category eq {CATEGORY_MODERN_FLOW}"
        f"&$top=200"
    )
    resp = session.get(url, headers=_headers(token), timeout=60)
    if resp.status_code != 200:
        return {}
    mapping: dict[str, str] = {}
    for row in resp.json().get("value", []):
        slug = parse_folder_slug_from_description(row.get("description"))
        if slug and slug in slugs:
            mapping[slug] = row["workflowid"]
            continue
        # Legacy snake_case flows keyed by Dataverse name == folder slug.
        name = row.get("name") or ""
        if name in slugs:
            mapping[name] = row["workflowid"]
    return mapping


def _cleanup_orphan_flows(
    session: requests.Session,
    base: str,
    token: str,
    *,
    catalog: dict[str, dict[str, str]],
    slug_to_id: dict[str, str],
    dry_run: bool,
) -> None:
    """Delete legacy snake_case flows superseded by catalog display names."""
    expected_slugs = set(catalog)
    url = (
        f"{base}/api/data/v9.2/workflows"
        f"?$select=workflowid,name,description,statecode"
        f"&$filter=category eq {CATEGORY_MODERN_FLOW}"
        f"&$top=200"
    )
    resp = session.get(url, headers=_headers(token), timeout=60)
    if resp.status_code != 200:
        print(f"  WARN: orphan cleanup list failed: {resp.status_code}", file=sys.stderr)
        return
    for row in resp.json().get("value", []):
        name = row.get("name") or ""
        slug = parse_folder_slug_from_description(row.get("description")) or name
        if slug not in expected_slugs:
            continue
        if name in expected_slugs and name == slug:
            display = flow_display_name(slug, catalog)
            if name != display:
                wid = row["workflowid"]
                print(f"  Orphan legacy flow '{name}' ({wid}) — deleting")
                try:
                    _delete_flow(session, base, token, wid, dry_run=dry_run)
                except Exception as exc:  # noqa: BLE001
                    print(f"  WARN: could not delete orphan '{name}': {exc}", file=sys.stderr)
                slug_to_id.pop(slug, None)


def _set_state(
    session: requests.Session,
    base: str,
    token: str,
    workflow_id: str,
    *,
    activate: bool,
    ignore_errors: bool = False,
) -> None:
    url = f"{base}/api/data/v9.2/workflows({workflow_id})"
    body = (
        {"statecode": STATE_ACTIVATED, "statuscode": STATUS_ACTIVATED}
        if activate
        else {"statecode": STATE_DRAFT, "statuscode": STATUS_DRAFT}
    )
    resp = session.patch(url, headers=_headers(token), json=body, timeout=90)
    if resp.status_code not in (204, 200):
        msg = (
            f"{'Activate' if activate else 'Deactivate'} {workflow_id} → "
            f"{resp.status_code}: {resp.text[:400]}"
        )
        if ignore_errors:
            print(f"  WARN: {msg}", file=sys.stderr)
            return
        raise RuntimeError(msg)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--activate",
        action="store_true",
        help="Turn flows On after upsert (default: leave Off/draft)",
    )
    parser.add_argument(
        "--recreate",
        action="store_true",
        help="Delete existing flow by name before create (use after clientdata fixes)",
    )
    parser.add_argument(
        "--cleanup-orphans",
        action="store_true",
        help="Delete legacy snake_case flows after deploy (name equals folder slug)",
    )
    parser.add_argument(
        "--auth",
        choices=("spn", "device", "azcli", "interactive"),
        default="azcli",
    )
    parser.add_argument(
        "--catalog",
        choices=("prod", "admin"),
        default="prod",
        help="Which flow catalog to deploy from (prod=flow_catalog.yaml, admin=flow_catalog_admin.yaml)",
    )
    parser.add_argument(
        "--solution",
        default=None,
        help="Override the target solution unique name (default: derived from --catalog)",
    )
    parser.add_argument(
        "--only",
        action="append",
        default=[],
        help="Deploy only this folder name (repeatable)",
    )
    args = parser.parse_args()

    if args.solution is None:
        args.solution = SOLUTION_ADMIN if args.catalog == "admin" else SOLUTION_PROD

    _load_env_local()
    os.environ.pop("DATAVERSE_ACCESS_TOKEN", None)
    base = _require_env("DATAVERSE_URL").rstrip("/")
    token = acquire_token(base, args.auth)
    catalog = load_catalog(args.catalog)

    dirs = _list_flow_dirs(args.only or None, catalog)
    print(f"Deploying {len(dirs)} flow(s) → {base} catalog={args.catalog} solution={args.solution}")
    session = requests.Session()
    failures: list[str] = []

    order = sorted(dirs, key=lambda p: (0 if p.name.startswith("Child_") else 1, p.name))
    slug_to_id = {} if args.dry_run else _seed_slug_to_id(session, base, token, catalog)

    for flow_dir in order:
        folder_slug = flow_dir.name
        display_name = flow_display_name(folder_slug, catalog)
        description = flow_description(folder_slug, catalog)
        print(f"\n== {folder_slug} → {display_name} ==")
        try:
            clientdata = json.loads((flow_dir / "workflow.json").read_text(encoding="utf-8"))
            if slug_to_id:
                clientdata = _rewrite_child_workflow_refs(clientdata, slug_to_id)
            wid = _upsert_flow(
                session, base, token,
                folder_slug=folder_slug,
                display_name=display_name,
                description=description,
                clientdata=clientdata,
                solution=args.solution,
                dry_run=args.dry_run,
                recreate=args.recreate,
            )
            slug_to_id[folder_slug] = wid
            _add_to_solution(
                session, base, token,
                workflow_id=wid,
                solution=args.solution,
                dry_run=args.dry_run,
            )
            if args.activate and not args.dry_run:
                _set_state(session, base, token, wid, activate=True)
                print("  Activated")
        except Exception as exc:  # noqa: BLE001
            print(f"  ERROR: {exc}", file=sys.stderr)
            failures.append(folder_slug)

    if args.cleanup_orphans and not args.dry_run:
        print("\n== Cleanup legacy snake_case flows ==")
        _cleanup_orphan_flows(
            session, base, token,
            catalog=catalog,
            slug_to_id=slug_to_id,
            dry_run=args.dry_run,
        )

    print(f"\nDone. ok={len(order) - len(failures)} failed={len(failures)}")
    if failures:
        print("Failed:", ", ".join(failures), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
