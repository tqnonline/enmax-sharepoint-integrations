"""ADR 0003: drop Approved BB-AA and Asset-Unit combination tables from an environment.

Dataverse does NOT delete a table when a solution import stops including it.
This script prepares an environment for the schema drop by:

  0. Unregistering SdkMessageProcessingStep (+ images) bound to the tables
     (e.g. SetAppOwnerPlugin / AuditEmitter leftover steps — these block DeleteEntity).
  1. Counting (and optionally deleting) all rows in
     enmax_autocadbusinessasset / enmax_autocadassetunit.
  2. Attempting DeleteEntity metadata requests for both tables.

If DeleteEntity fails (common: table still in an unmanaged solution layer,
or has further dependent components), print the Maker UI path to finish manually:

    Solutions → EnmaxAutoCADNumbering → Tables → delete table
    or make.powerapps.com → Tables → delete

Usage:
    python solution/scripts/migrate_drop_combination_tables.py --auth azcli --delete-rows
    python solution/scripts/migrate_drop_combination_tables.py --auth azcli --dry-run

Prerequisites:
    Prefer running AFTER the solution that omits these tables is imported (steps
    already removed from PluginDefinitions.psd1). The unregister pass still
    cleans stale steps left in the environment from older plugin registrations.
    See docs/adr/0003-drop-combination-tables.md.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "solution" / "scripts"))

from seed import (  # noqa: E402
    _entity_set_name,
    _load_env_local,
    _require_env,
    acquire_token,
)

TABLES = (
    "enmax_autocadbusinessasset",
    "enmax_autocadassetunit",
)

PAGE_SIZE = 200


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Content-Type": "application/json",
    }


def _entity_exists(session: requests.Session, base: str, token: str, table: str) -> bool:
    url = f"{base}/api/data/v9.2/EntityDefinitions(LogicalName='{table}')?$select=LogicalName,MetadataId"
    resp = session.get(url, headers=_headers(token), timeout=60)
    if resp.status_code == 200:
        return True
    if resp.status_code == 404:
        return False
    print(f"  WARN: EntityDefinitions {table} → {resp.status_code}: {resp.text[:200]}", file=sys.stderr)
    return False


def _list_all(session: requests.Session, base: str, token: str, path_and_query: str) -> list[dict]:
    url = f"{base}/api/data/v9.2/{path_and_query}"
    out: list[dict] = []
    while url:
        resp = session.get(url, headers=_headers(token), timeout=120)
        if resp.status_code != 200:
            print(f"  ERROR GET {path_and_query.split('?')[0]} → {resp.status_code}: {resp.text[:300]}", file=sys.stderr)
            return out
        body = resp.json()
        out.extend(body.get("value", []))
        url = body.get("@odata.nextLink")
    return out


def _delete_by_id(
    session: requests.Session,
    base: str,
    token: str,
    entity_set: str,
    record_id: str,
    *,
    dry_run: bool,
    label: str,
) -> bool:
    if dry_run:
        print(f"  [DRY-RUN] DELETE {entity_set}({record_id})  # {label}")
        return True
    resp = session.delete(
        f"{base}/api/data/v9.2/{entity_set}({record_id})",
        headers=_headers(token),
        timeout=60,
    )
    if resp.status_code in (200, 204):
        print(f"  deleted {label}")
        return True
    print(f"  ERROR DELETE {label}: {resp.status_code} {resp.text[:250]}", file=sys.stderr)
    return False


def _is_our_custom_step(step: dict) -> bool:
    """Keep only our solution's steps — skip Microsoft ObjectModel / platform steps.

    System steps share the same sdkmessagefilter as ours (Create on the entity) but
    cannot be deleted and must never be targeted. Match by registration name prefix
    used in PluginDefinitions.psd1 / Register-PpPlugins.
    """
    name = (step.get("name") or "").strip()
    return name.startswith("Enmax.AutoCAD.")


def _steps_bound_to_table(
    session: requests.Session,
    base: str,
    token: str,
    table: str,
) -> list[dict]:
    """Resolve custom SdkMessageProcessingStep rows for a primary entity.

    Steps do not expose primaryentityname; the binding lives on sdkmessagefilter
    via primaryobjecttypecode. Prefer that path, then fall back to a name contains
    match for SetAppOwnerPlugin / AuditEmitter leftovers.

    Only Enmax.AutoCAD.* steps are returned — platform ObjectModel / External steps
    share the filter and must not be deleted.
    """
    safe = table.replace("'", "''")
    by_id: dict[str, dict] = {}

    filters = _list_all(
        session,
        base,
        token,
        "sdkmessagefilters"
        f"?$select=sdkmessagefilterid,primaryobjecttypecode"
        f"&$filter=primaryobjecttypecode eq '{safe}'"
        f"&$expand=sdkmessagefilterid_sdkmessageprocessingstep"
        f"($select=sdkmessageprocessingstepid,name,statecode,customizationlevel)",
    )
    for filt in filters:
        for step in filt.get("sdkmessagefilterid_sdkmessageprocessingstep") or []:
            sid = step.get("sdkmessageprocessingstepid")
            if sid and _is_our_custom_step(step):
                by_id[sid] = step

    # Fallback: registration names include the logical table name, e.g.
    # "Enmax.AutoCAD.SetAppOwnerPlugin: Create of enmax_autocadbusinessasset".
    named = _list_all(
        session,
        base,
        token,
        "sdkmessageprocessingsteps"
        f"?$select=sdkmessageprocessingstepid,name,statecode,customizationlevel"
        f"&$filter=contains(name,'Enmax.AutoCAD.') and contains(name,'{safe}')",
    )
    for step in named:
        sid = step.get("sdkmessageprocessingstepid")
        if sid and _is_our_custom_step(step):
            by_id[sid] = step

    return list(by_id.values())


def unregister_plugin_steps_for_table(
    session: requests.Session,
    base: str,
    token: str,
    table: str,
    *,
    dry_run: bool,
) -> int:
    """Delete custom SdkMessageProcessingStep (+ images) bound to `table`.

    Leftover Create steps for SetAppOwnerPlugin / AuditEmitter block DeleteEntity.
    Platform ObjectModel steps are ignored.
    """
    steps = _steps_bound_to_table(session, base, token, table)
    if not steps:
        print(f"  plugin steps: none of ours bound to {table}")
        return 0

    removed = 0
    for step in steps:
        step_id = step["sdkmessageprocessingstepid"]
        step_name = step.get("name") or step_id
        images = _list_all(
            session,
            base,
            token,
            "sdkmessageprocessingstepimages"
            f"?$select=sdkmessageprocessingstepimageid,name"
            f"&$filter=_sdkmessageprocessingstepid_value eq {step_id}",
        )
        for img in images:
            _delete_by_id(
                session, base, token,
                "sdkmessageprocessingstepimages",
                img["sdkmessageprocessingstepimageid"],
                dry_run=dry_run,
                label=f"step image '{img.get('name')}' on {step_name}",
            )
        if _delete_by_id(
            session, base, token,
            "sdkmessageprocessingsteps",
            step_id,
            dry_run=dry_run,
            label=f"plugin step '{step_name}'",
        ):
            removed += 1
    print(f"  plugin steps: removed {removed} for {table}")
    return removed


def _count_and_delete_rows(
    session: requests.Session,
    base: str,
    token: str,
    table: str,
    *,
    delete_rows: bool,
    dry_run: bool,
) -> tuple[int, int]:
    """Return (seen, deleted)."""
    entity_set = _entity_set_name(table)
    id_attr = f"{table}id"
    seen = deleted = 0
    url = (
        f"{base}/api/data/v9.2/{entity_set}"
        f"?$select={id_attr}&$top={PAGE_SIZE}"
    )

    while url:
        resp = session.get(url, headers=_headers(token), timeout=120)
        if resp.status_code == 404:
            print(f"  {table}: entity set not found (already dropped?)")
            return seen, deleted
        if resp.status_code != 200:
            print(f"  ERROR list {table} → {resp.status_code}: {resp.text[:300]}", file=sys.stderr)
            return seen, deleted

        body = resp.json()
        rows = body.get("value", [])
        if not rows and seen == 0:
            print(f"  {table}: 0 rows")
            return 0, 0

        for row in rows:
            rid = row[id_attr]
            seen += 1
            if not delete_rows:
                continue
            if dry_run:
                print(f"  [DRY-RUN] DELETE {entity_set}({rid})")
                deleted += 1
                continue
            d = session.delete(
                f"{base}/api/data/v9.2/{entity_set}({rid})",
                headers=_headers(token),
                timeout=60,
            )
            if d.status_code in (200, 204):
                deleted += 1
            else:
                print(f"  ERROR DELETE {rid}: {d.status_code} {d.text[:200]}", file=sys.stderr)

        url = body.get("@odata.nextLink")

    action = "would delete" if dry_run and delete_rows else ("deleted" if delete_rows else "counted")
    print(f"  {table}: seen={seen} {action}={deleted if delete_rows else seen}")
    return seen, deleted


def _delete_entity(
    session: requests.Session,
    base: str,
    token: str,
    table: str,
    *,
    dry_run: bool,
) -> bool:
    """Attempt DeleteEntity custom action. Returns True on success."""
    if dry_run:
        print(f"  [DRY-RUN] DeleteEntity LogicalName={table}")
        return True

    url = f"{base}/api/data/v9.2/DeleteEntity"
    resp = session.post(
        url,
        headers=_headers(token),
        json={"LogicalName": table},
        timeout=120,
    )
    if resp.status_code in (200, 204):
        print(f"  {table}: DeleteEntity OK")
        return True

    print(
        f"  {table}: DeleteEntity → {resp.status_code}: {resp.text[:400]}\n"
        f"           Finish in Maker: Tables → {table} → Delete table.\n"
        f"           If still blocked by plugins, re-run this script (step unregister is step 0).",
        file=sys.stderr,
    )
    return False


def main() -> int:
    _load_env_local()
    parser = argparse.ArgumentParser(description="Drop BB-AA / Asset-Unit combination tables")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--delete-rows",
        action="store_true",
        help="Hard-delete junction rows before DeleteEntity (required if tables have data).",
    )
    parser.add_argument(
        "--auth",
        choices=["spn", "device", "azcli", "interactive"],
        default="spn",
    )
    args = parser.parse_args()

    base = _require_env("DATAVERSE_URL").rstrip("/")
    print(f"Acquiring token (auth={args.auth})...")
    token = acquire_token(base, args.auth)
    session = requests.Session()
    print(f"Drop combination tables on {base}  dry_run={args.dry_run} delete_rows={args.delete_rows}")

    # Always clear SDK steps first — they block DeleteEntity even when the table
    # still exists (and even if rows are empty).
    print("\n== unregister plugin steps ==")
    for table in TABLES:
        unregister_plugin_steps_for_table(
            session, base, token, table, dry_run=args.dry_run,
        )

    any_present = False
    for table in TABLES:
        print(f"\n== {table} ==")
        if not _entity_exists(session, base, token, table):
            print(f"  already absent — skip")
            continue
        any_present = True
        _count_and_delete_rows(
            session, base, token, table, delete_rows=args.delete_rows, dry_run=args.dry_run,
        )
        if not args.delete_rows and not args.dry_run:
            print("  (row delete skipped — pass --delete-rows to purge data before DeleteEntity)")
        _delete_entity(session, base, token, table, dry_run=args.dry_run)

    if not any_present:
        print("\nBoth tables already absent (plugin steps cleaned if any). Nothing else to do.")
        return 0

    print(
        "\nNext: pack + import the updated solution (tables omitted), then re-register plugins.\n"
        "If DeleteEntity failed, remove the tables in Maker first, then import."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
