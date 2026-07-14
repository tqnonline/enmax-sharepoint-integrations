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
        [--solution enmax_autocadsln]
        [--only On_Reservation_Created_Notify_Admins]

Prefer --recreate after regenerating workflow.json (build_workflow_clientdata.py)
so activation validates a fresh clientdata payload.

Child flows are referenced by workflowReferenceName (folder name) in parent
definitions — the created flow `name` matches the folder name exactly.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "solution" / "scripts"))

from seed import _load_env_local, _require_env, acquire_token  # noqa: E402

WORKFLOWS_DIR = REPO_ROOT / "solution" / "src" / "Workflows"
DEFAULT_SOLUTION = "enmax_autocadsln"

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
        # Creates the component inside the unmanaged solution when possible.
        h["MSCRM.SolutionUniqueName"] = solution
    return h


def _list_flow_dirs(only: list[str] | None) -> list[Path]:
    dirs = sorted(
        p for p in WORKFLOWS_DIR.iterdir()
        if p.is_dir() and (p / "workflow.json").exists()
    )
    if only:
        wanted = set(only)
        dirs = [p for p in dirs if p.name in wanted]
        missing = wanted - {p.name for p in dirs}
        if missing:
            raise SystemExit(f"Unknown flow folder(s): {', '.join(sorted(missing))}")
    return dirs


def _find_flow_by_name(
    session: requests.Session,
    base: str,
    token: str,
    name: str,
) -> dict | None:
    # Exact name match — child workflowReferenceName relies on this.
    url = (
        f"{base}/api/data/v9.2/workflows"
        f"?$select=workflowid,name,statecode,statuscode,category"
        f"&$filter=name eq '{name.replace(chr(39), chr(39)+chr(39))}' and category eq {CATEGORY_MODERN_FLOW}"
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
    # Draft before delete — activated flows often reject DELETE.
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
    name: str,
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
        "name": name,
        "description": f"Enmax AutoCAD solution flow ({name})",
        "clientdata": json.dumps(clientdata, separators=(",", ":")),
    }
    existing = _find_flow_by_name(session, base, token, name)
    if existing and recreate:
        _delete_flow(session, base, token, existing["workflowid"], dry_run=dry_run)
        existing = None

    if existing:
        wid = existing["workflowid"]
        if dry_run:
            print(f"  DRY-RUN PATCH workflow {name} ({wid})")
            return wid
        # Must be draft to update clientdata; deactivate if currently on.
        if existing.get("statecode") == STATE_ACTIVATED:
            _set_state(session, base, token, wid, activate=False)
        url = f"{base}/api/data/v9.2/workflows({wid})"
        resp = session.patch(url, headers=_headers(token, solution=solution), json=payload, timeout=120)
        if resp.status_code not in (204, 200):
            raise RuntimeError(f"PATCH {name} → {resp.status_code}: {resp.text[:400]}")
        print(f"  Updated {name} ({wid})")
        return wid

    if dry_run:
        print(f"  DRY-RUN POST workflow {name}")
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
        raise RuntimeError(f"POST {name} → {resp.status_code}: {resp.text[:500]}")
    wid = resp.json()["workflowid"]
    print(f"  Created {name} ({wid})")
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
        "ComponentType": 29,  # Workflow
        "SolutionUniqueName": solution,
        "AddRequiredComponents": False,
        "DoNotIncludeSubcomponents": False,
    }
    resp = session.post(url, headers=_headers(token), json=body, timeout=60)
    # 200/204 success; some envs return fault if already present — tolerate "already exists"
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


def _rewrite_child_workflow_refs(clientdata: dict, name_to_id: dict[str, str]) -> dict:
    """Map workflowReferenceName display names → Dataverse workflowid GUIDs.

    Power Automate's Run-a-child-flow action resolves by workflow id. Display-name
    references (kept in source for readability) fail activation with OData
    query-syntax errors when the flow was created outside solution import.
    """

    def walk(node: object) -> object:
        if isinstance(node, list):
            return [walk(x) for x in node]
        if not isinstance(node, dict):
            return node
        out: dict = {}
        for key, value in node.items():
            if key == "workflowReferenceName" and isinstance(value, str) and value in name_to_id:
                out[key] = name_to_id[value]
            else:
                out[key] = walk(value)
        return out

    return walk(clientdata)  # type: ignore[return-value]


def _seed_child_ids(
    session: requests.Session,
    base: str,
    token: str,
) -> dict[str, str]:
    url = (
        f"{base}/api/data/v9.2/workflows"
        f"?$select=workflowid,name"
        f"&$filter=category eq {CATEGORY_MODERN_FLOW} and startswith(name,'Child_')"
        f"&$top=50"
    )
    resp = session.get(url, headers=_headers(token), timeout=60)
    if resp.status_code != 200:
        return {}
    return {row["name"]: row["workflowid"] for row in resp.json().get("value", [])}


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
        "--auth",
        choices=("spn", "device", "azcli", "interactive"),
        default="azcli",
    )
    parser.add_argument("--solution", default=DEFAULT_SOLUTION)
    parser.add_argument(
        "--only",
        action="append",
        default=[],
        help="Deploy only this folder name (repeatable)",
    )
    args = parser.parse_args()

    _load_env_local()
    # Drop stale exported tokens so --auth can acquire a fresh one.
    os.environ.pop("DATAVERSE_ACCESS_TOKEN", None)
    base = _require_env("DATAVERSE_URL").rstrip("/")
    token = acquire_token(base, args.auth)

    dirs = _list_flow_dirs(args.only or None)
    print(f"Deploying {len(dirs)} flow(s) → {base} solution={args.solution}")
    session = requests.Session()
    failures: list[str] = []

    # Children first so parents can resolve workflowReferenceName after create.
    order = sorted(dirs, key=lambda p: (0 if p.name.startswith("Child_") else 1, p.name))
    name_to_id = {} if args.dry_run else _seed_child_ids(session, base, token)

    for flow_dir in order:
        name = flow_dir.name
        print(f"\n== {name} ==")
        try:
            clientdata = json.loads((flow_dir / "workflow.json").read_text(encoding="utf-8"))
            if not name.startswith("Child_") and name_to_id:
                clientdata = _rewrite_child_workflow_refs(clientdata, name_to_id)
            wid = _upsert_flow(
                session, base, token,
                name=name,
                clientdata=clientdata,
                solution=args.solution,
                dry_run=args.dry_run,
                recreate=args.recreate,
            )
            name_to_id[name] = wid
            _add_to_solution(
                session, base, token,
                workflow_id=wid,
                solution=args.solution,
                dry_run=args.dry_run,
            )
            if args.activate and not args.dry_run:
                _set_state(session, base, token, wid, activate=True)
                print("  Activated")
        except Exception as exc:  # noqa: BLE001 — report all failures, keep going
            print(f"  ERROR: {exc}", file=sys.stderr)
            failures.append(name)

    print(f"\nDone. ok={len(order) - len(failures)} failed={len(failures)}")
    if failures:
        print("Failed:", ", ".join(failures), file=sys.stderr)
        return 1
    return 0


# Late import guard for optional env cleanup note
import os  # noqa: E402


if __name__ == "__main__":
    raise SystemExit(main())
