"""Purge ENMAX AutoCAD transaction tables (DEV reset; Prod emergency only).

Deletes rows child-first via BulkDelete (default) or parallel row DELETE fallback.
Never touches reference/master/config tables. UAT is the same host as Dev
(nrg-enmax-dev); there is no separate UAT purge host gate.

Usage:
    python solution/scripts/purge_transaction_data.py --auth azcli --dry-run
    python solution/scripts/purge_transaction_data.py --auth azcli --confirm-dev
    python solution/scripts/purge_transaction_data.py --auth azcli --confirm-dev --mode bulk
    python solution/scripts/purge_transaction_data.py --auth azcli --confirm-dev --mode row --workers 20

Requires DATAVERSE_URL (or pac-selected org). Pass --confirm-dev only when the
URL host is nrg-enmax-dev.crm3.dynamics.com.

Operator runbook: solution/scripts/OPS_LEGACY_IMPORT.md
Architecture (C4): docs/architecture/legacy-import-ops.md
"""

from __future__ import annotations

import argparse
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "solution" / "scripts"))

from dv_cli_common import (  # noqa: E402
    DEV_HOST,
    PROD_HOSTS,
    GateError,
    TokenHolder as _TokenHolder,
    host_from_url,
    odata_headers as _headers,
)
from seed import (  # noqa: E402
    _entity_set_name,
    _load_env_local,
    _require_env,
    acquire_token,
)

# Child-first delete order (FK-safe).
PURGE_TABLES: tuple[str, ...] = (
    "enmax_autocadcheckout",
    "enmax_autocadsheet",
    "enmax_autocaddrawing",
    "enmax_autocadinappnotification",
    "enmax_autocadauditevent",
    "enmax_autocadreservation",
    "enmax_autocadnumbersequence",
)

PAGE_SIZE = 500
DEFAULT_WORKERS = 20
DEFAULT_POLL_SECONDS = 15
DEFAULT_TIMEOUT_MINUTES = 120

# BulkDelete async operation terminal states.
_BULK_STATE_COMPLETED = 3
_BULK_STATUS_SUCCEEDED = 30


def assert_purge_allowed(
    dataverse_url: str,
    *,
    dry_run: bool,
    confirm_dev: bool,
    confirm_prod_emergency: bool,
    job_name: str | None,
    sandbox: bool,
) -> tuple[str, bool]:
    """Return (host, use_sandbox). Raises GateError on disallowed host/confirm.

    Note: RunJobForSandbox can report success without deleting standard-table rows
    in this org; Dev defaults to normal BulkDelete. Pass sandbox=True only via
    --sandbox when explicitly testing sandbox mode.
    """
    host = host_from_url(dataverse_url)

    if dry_run:
        if host == DEV_HOST:
            return host, sandbox
        if host in PROD_HOSTS:
            if sandbox:
                raise GateError("ERROR: sandbox BulkDelete is never allowed on Prod.")
            return host, False
        raise GateError(
            f"ERROR: dry-run purge is restricted to {DEV_HOST} or Prod hosts; got {host}."
        )

    if host == DEV_HOST:
        if not confirm_dev:
            raise GateError(
                "ERROR: pass --confirm-dev to acknowledge destructive purge on ENMAX DEV."
            )
        return host, sandbox

    if host in PROD_HOSTS:
        if sandbox:
            raise GateError("ERROR: sandbox BulkDelete is never allowed on Prod.")
        if not confirm_prod_emergency:
            raise GateError("ERROR: Prod purge requires --confirm-prod-emergency.")
        if not job_name:
            raise GateError("ERROR: Prod purge requires --job-name.")
        return host, False

    raise GateError(
        f"ERROR: purge is restricted to {DEV_HOST} or Prod emergency hosts; got {host}."
    )


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def build_bulk_delete_body(
    table: str,
    job_name: str,
    *,
    sandbox: bool,
) -> dict:
    body: dict = {
        "QuerySet": [
            {
                "EntityName": table,
                "ColumnSet": {"AllColumns": False, "Columns": []},
                "Criteria": {
                    "FilterOperator": "And",
                    "Conditions": [],
                    "Filters": [],
                },
            }
        ],
        "JobName": job_name,
        "SendEmailNotification": False,
        "ToRecipients": [],
        "CCRecipients": [],
        "RecurrencePattern": "",
        "StartDateTime": _utc_now_iso(),
    }
    if sandbox:
        body["Options"] = {"RunJobForSandbox": True}
    return body


def _parse_job_id(resp: requests.Response) -> str | None:
    if resp.content:
        try:
            data = resp.json()
        except ValueError:
            data = {}
        for key in ("JobId", "BulkDeleteOperationId", "AsyncOperationId"):
            val = data.get(key)
            if val:
                return str(val)
    entity_id = resp.headers.get("OData-EntityId", "")
    match = re.search(
        r"bulkdeleteoperations\(([0-9a-f-]{36})\)",
        entity_id,
        re.IGNORECASE,
    )
    if match:
        return match.group(1)
    match = re.search(r"([0-9a-f-]{36})", entity_id, re.IGNORECASE)
    if match:
        return match.group(1)
    return None


def count_rows(
    session: requests.Session,
    base: str,
    tokens: _TokenHolder,
    table: str,
) -> int | None:
    entity_set = _entity_set_name(table)
    for attempt in range(2):
        resp = session.get(
            f"{base}/api/data/v9.2/{entity_set}/$count",
            headers=_headers(tokens.get(force=attempt > 0)),
            timeout=120,
        )
        if resp.status_code == 401 and attempt == 0:
            tokens.get(force=True)
            continue
        break
    if resp.status_code == 404:
        return None
    if resp.status_code != 200:
        print(
            f"  ERROR count {table} → {resp.status_code}: {resp.text[:300]}",
            file=sys.stderr,
        )
        return None
    # Dataverse $count often prefixes UTF-8 BOM; decode via utf-8-sig.
    return int(resp.content.decode("utf-8-sig").strip())


def table_is_empty(
    session: requests.Session,
    base: str,
    tokens: _TokenHolder,
    table: str,
) -> bool:
    entity_set = _entity_set_name(table)
    id_attr = f"{table}id"
    for attempt in range(2):
        resp = session.get(
            f"{base}/api/data/v9.2/{entity_set}?$select={id_attr}&$top=1",
            headers=_headers(tokens.get(force=attempt > 0)),
            timeout=120,
        )
        if resp.status_code == 401 and attempt == 0:
            tokens.get(force=True)
            continue
        break
    if resp.status_code == 404:
        return True
    if resp.status_code != 200:
        raise RuntimeError(
            f"verify empty {table} failed → {resp.status_code}: {resp.text[:300]}"
        )
    return not resp.json().get("value", [])


def submit_bulk_delete(
    session: requests.Session,
    base: str,
    tokens: _TokenHolder,
    table: str,
    job_name: str,
    *,
    sandbox: bool,
) -> str | None:
    body = build_bulk_delete_body(table, job_name, sandbox=sandbox)
    for attempt in range(2):
        resp = session.post(
            f"{base}/api/data/v9.2/BulkDelete",
            headers=_headers(tokens.get(force=attempt > 0)),
            json=body,
            timeout=120,
        )
        if resp.status_code == 401 and attempt == 0:
            tokens.get(force=True)
            continue
        break
    if resp.status_code not in (200, 202, 204):
        print(
            f"  ERROR BulkDelete {table} → {resp.status_code}: {resp.text[:500]}",
            file=sys.stderr,
        )
        return None
    job_id = _parse_job_id(resp)
    if not job_id:
        print(
            f"  ERROR BulkDelete {table}: no JobId in response.",
            file=sys.stderr,
        )
    return job_id


def _job_success_count(
    session: requests.Session,
    base: str,
    tokens: _TokenHolder,
    async_job_id: str,
) -> int | None:
    resp = session.get(
        f"{base}/api/data/v9.2/bulkdeleteoperations"
        f"?$filter=_asyncoperationid_value eq {async_job_id}"
        f"&$select=successcount,failurecount&$top=1",
        headers=_headers(tokens.get()),
        timeout=120,
    )
    if resp.status_code != 200:
        return None
    rows = resp.json().get("value", [])
    if not rows:
        return None
    return rows[0].get("successcount")


def _print_failure_samples(
    session: requests.Session,
    base: str,
    tokens: _TokenHolder,
    *,
    async_job_id: str,
    job_name: str,
    limit: int = 5,
) -> None:
    # Prefer BulkDeleteOperation linked to the async job; fall back to name.
    op_resp = session.get(
        f"{base}/api/data/v9.2/bulkdeleteoperations"
        f"?$filter=_asyncoperationid_value eq {async_job_id}"
        f"&$select=bulkdeleteoperationid,successcount,failurecount"
        f"&$top=1",
        headers=_headers(tokens.get()),
        timeout=120,
    )
    bulk_id: str | None = None
    if op_resp.status_code == 200:
        rows = op_resp.json().get("value", [])
        if rows:
            bulk_id = rows[0].get("bulkdeleteoperationid")
            print(
                f"  bulkdeleteoperation success={rows[0].get('successcount')} "
                f"failure={rows[0].get('failurecount')}",
                file=sys.stderr,
            )
    if not bulk_id:
        name_safe = job_name.replace("'", "''")
        op_resp = session.get(
            f"{base}/api/data/v9.2/bulkdeleteoperations"
            f"?$filter=name eq '{name_safe}'"
            f"&$orderby=createdon desc&$top=1"
            f"&$select=bulkdeleteoperationid,successcount,failurecount",
            headers=_headers(tokens.get()),
            timeout=120,
        )
        if op_resp.status_code == 200:
            rows = op_resp.json().get("value", [])
            if rows:
                bulk_id = rows[0].get("bulkdeleteoperationid")

    if not bulk_id:
        print("  No bulkdeleteoperation row found for failure details.", file=sys.stderr)
        return

    resp = session.get(
        f"{base}/api/data/v9.2/bulkdeletefailures"
        f"?$filter=_bulkdeleteoperationid_value eq {bulk_id}"
        f"&$top={limit}",
        headers=_headers(tokens.get()),
        timeout=120,
    )
    if resp.status_code != 200:
        print(
            f"  ERROR listing bulkdeletefailures → {resp.status_code}: {resp.text[:300]}",
            file=sys.stderr,
        )
        return
    rows = resp.json().get("value", [])
    if not rows:
        print("  No bulkdeletefailure rows returned.", file=sys.stderr)
        return
    for row in rows:
        err_num = row.get("errornumber", "?")
        err_msg = row.get("errordescription", row.get("friendlymessage", ""))
        print(f"  failure: errornumber={err_num} {err_msg[:200]}", file=sys.stderr)


def poll_bulk_delete(
    session: requests.Session,
    base: str,
    tokens: _TokenHolder,
    job_id: str,
    *,
    job_name: str,
    poll_seconds: int,
    timeout_minutes: int,
) -> tuple[bool, str | None]:
    """Poll AsyncOperation (BulkDelete JobId). Optionally surface BulkDeleteOperation stats."""
    deadline = time.time() + timeout_minutes * 60
    while time.time() < deadline:
        token = tokens.get()  # refreshes periodically for long jobs
        try:
            resp = session.get(
                f"{base}/api/data/v9.2/asyncoperations({job_id})"
                f"?$select=name,statecode,statuscode,operationtype",
                headers=_headers(token),
                timeout=120,
            )
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as exc:
            print(f"  poll retry after {type(exc).__name__}...", flush=True)
            time.sleep(max(1, poll_seconds))
            continue
        if resp.status_code == 401:
            tokens.get(force=True)
            continue
        if resp.status_code != 200:
            return False, f"poll HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        statecode = data.get("statecode")
        statuscode = data.get("statuscode")
        if statecode == _BULK_STATE_COMPLETED:
            if statuscode == _BULK_STATUS_SUCCEEDED:
                return True, None
            _print_failure_samples(
                session, base, tokens, async_job_id=job_id, job_name=job_name
            )
            return False, f"completed with statuscode={statuscode}"
        time.sleep(max(1, poll_seconds))
    return False, f"timed out after {timeout_minutes} minutes"


def purge_table_bulk(
    session: requests.Session,
    base: str,
    tokens: _TokenHolder,
    table: str,
    job_name: str,
    *,
    sandbox: bool,
    dry_run: bool,
    poll_seconds: int,
    timeout_minutes: int,
    max_rounds: int = 100,
) -> bool:
    body = build_bulk_delete_body(table, job_name, sandbox=sandbox)
    qs = body["QuerySet"][0]
    row_count = count_rows(session, base, tokens, table)
    count_label = "unknown" if row_count is None else str(row_count)
    print(
        f"  {table}: rows≈{count_label} (Dataverse $count may cap at 5000) "
        f"QuerySet EntityName={qs['EntityName']} sandbox={sandbox}"
    )
    if dry_run:
        return True

    try:
        if table_is_empty(session, base, tokens, table):
            print(f"  {table}: already empty")
            return True
    except RuntimeError as exc:
        print(f"  ERROR {exc}", file=sys.stderr)
        return False

    for round_no in range(1, max_rounds + 1):
        round_job = job_name if round_no == 1 else f"{job_name}-r{round_no}"
        print(
            f"  {table}: submitting BulkDelete job {round_job!r} (round {round_no})...",
            flush=True,
        )
        job_id = submit_bulk_delete(
            session, base, tokens, table, round_job, sandbox=sandbox
        )
        if not job_id:
            return False

        print(f"  {table}: polling job {job_id}...", flush=True)
        ok, err = poll_bulk_delete(
            session,
            base,
            tokens,
            job_id,
            job_name=round_job,
            poll_seconds=poll_seconds,
            timeout_minutes=timeout_minutes,
        )
        if not ok:
            print(f"  ERROR {table}: BulkDelete failed: {err}", file=sys.stderr)
            return False

        deleted = _job_success_count(session, base, tokens, job_id)
        if deleted is not None:
            print(f"  {table}: round {round_no} deleted={deleted}", flush=True)

        try:
            empty = table_is_empty(session, base, tokens, table)
        except RuntimeError as exc:
            print(f"  ERROR {exc}", file=sys.stderr)
            return False
        if empty:
            print(f"  {table}: purged (verified empty after {round_no} job(s))")
            return True

        if deleted == 0:
            print(
                f"  ERROR {table}: BulkDelete succeeded but deleted 0 rows; "
                "stopping to avoid infinite loop",
                file=sys.stderr,
            )
            return False

        remaining = count_rows(session, base, tokens, table)
        print(
            f"  {table}: rows remain≈{remaining}; queuing another BulkDelete round...",
            flush=True,
        )

    print(
        f"  ERROR {table}: still not empty after {max_rounds} BulkDelete rounds",
        file=sys.stderr,
    )
    return False


def _delete_one(
    base: str,
    token: str,
    entity_set: str,
    rid: str,
) -> tuple[bool, str | None]:
    # One session per call keeps threads simple (requests.Session is not fully
    # thread-safe for concurrent use of one instance).
    last_err: str | None = None
    for attempt in range(3):
        try:
            with requests.Session() as s:
                d = s.delete(
                    f"{base}/api/data/v9.2/{entity_set}({rid})",
                    headers=_headers(token),
                    timeout=120,
                )
            if d.status_code in (200, 204, 404):
                return True, None
            if d.status_code == 429:
                time.sleep(int(d.headers.get("Retry-After", "3")))
                continue
            last_err = f"{rid}:{d.status_code}"
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as exc:
            last_err = f"{rid}:timeout:{type(exc).__name__}"
            time.sleep(1 + attempt)
    return False, last_err


def delete_all_rows(
    session: requests.Session,
    base: str,
    tokens: _TokenHolder,
    table: str,
    *,
    dry_run: bool,
    workers: int = DEFAULT_WORKERS,
) -> tuple[int, int, int]:
    """Return (seen, deleted, errors).

    Always re-query the first page after deletes. Following @odata.nextLink while
    deleting shifts the result window and silently skips rows.
    """
    entity_set = _entity_set_name(table)
    id_attr = f"{table}id"
    seen = deleted = err_count = 0
    list_url = (
        f"{base}/api/data/v9.2/{entity_set}?$select={id_attr}&$top={PAGE_SIZE}"
    )

    while True:
        token = tokens.get()
        resp = session.get(list_url, headers=_headers(token), timeout=120)
        if resp.status_code == 401:
            token = tokens.get(force=True)
            resp = session.get(list_url, headers=_headers(token), timeout=120)
        if resp.status_code == 404:
            print(f"  {table}: entity set not found")
            return seen, deleted, err_count
        if resp.status_code != 200:
            print(
                f"  ERROR list {table} → {resp.status_code}: {resp.text[:300]}",
                file=sys.stderr,
            )
            return seen, deleted, err_count + 1

        if dry_run:
            n = count_rows(session, base, tokens, table)
            if n is None:
                print(f"  {table}: dry-run count unavailable", file=sys.stderr)
                return 0, 0, 1
            print(f"  {table}: would delete≈{n} (Dataverse $count may cap at 5000)")
            return n, n, 0

        rows = resp.json().get("value", [])
        if not rows:
            break

        ids = [row[id_attr] for row in rows]
        seen += len(ids)

        errs: list[str] = []
        with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
            futs = [
                pool.submit(_delete_one, base, token, entity_set, rid) for rid in ids
            ]
            for fut in as_completed(futs):
                ok, err = fut.result()
                if ok:
                    deleted += 1
                elif err:
                    errs.append(err)

        err_count += len(errs)
        for e in errs[:5]:
            print(f"  ERROR DELETE {table}: {e}", file=sys.stderr)
        if len(errs) > 5:
            print(f"  ... {len(errs) - 5} more errors", file=sys.stderr)

        print(f"  {table}: progress deleted={deleted} (seen={seen})...", flush=True)

    action = "would delete" if dry_run else "deleted"
    print(f"  {table}: {action}={deleted} (seen={seen}) errors={err_count}")
    return seen, deleted, err_count


def _default_job_name(table: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"enmax-purge-{table}-{stamp}"


def main() -> int:
    _load_env_local()
    parser = argparse.ArgumentParser(description="Purge transaction tables on ENMAX DEV")
    parser.add_argument("--dry-run", action="store_true", help="Count rows only")
    parser.add_argument(
        "--confirm-dev",
        action="store_true",
        help=f"Required to purge {DEV_HOST}",
    )
    parser.add_argument(
        "--confirm-prod-emergency",
        action="store_true",
        help="Acknowledge emergency Prod purge (requires --job-name; never sandbox).",
    )
    parser.add_argument(
        "--job-name",
        default=None,
        help="BulkDelete job name (required for Prod emergency).",
    )
    parser.add_argument(
        "--mode",
        choices=("bulk", "row"),
        default="bulk",
        help="bulk = Web API BulkDelete (default); row = parallel single-row DELETE.",
    )
    parser.add_argument(
        "--poll-seconds",
        type=int,
        default=DEFAULT_POLL_SECONDS,
        help=f"BulkDelete poll interval (default {DEFAULT_POLL_SECONDS}).",
    )
    parser.add_argument(
        "--timeout-minutes",
        type=int,
        default=DEFAULT_TIMEOUT_MINUTES,
        help=f"BulkDelete per-table timeout (default {DEFAULT_TIMEOUT_MINUTES}).",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=DEFAULT_WORKERS,
        help=f"Parallel DELETE workers for --mode row (default {DEFAULT_WORKERS}).",
    )
    parser.add_argument(
        "--sandbox",
        action="store_true",
        help=(
            "Dev-only: set BulkDelete Options.RunJobForSandbox. "
            "Default is off — sandbox mode was observed to report success without "
            "deleting standard-table rows in this environment."
        ),
    )
    parser.add_argument(
        "--auth",
        choices=["spn", "device", "azcli", "interactive"],
        default="azcli",
    )
    args = parser.parse_args()

    dataverse_url = _require_env("DATAVERSE_URL").rstrip("/")
    try:
        _, use_sandbox = assert_purge_allowed(
            dataverse_url,
            dry_run=args.dry_run,
            confirm_dev=args.confirm_dev,
            confirm_prod_emergency=args.confirm_prod_emergency,
            job_name=args.job_name,
            sandbox=args.sandbox,
        )
    except GateError as exc:
        print(exc.message, file=sys.stderr)
        return 1

    print(f"Acquiring token (auth={args.auth})...")
    token = acquire_token(dataverse_url, args.auth)
    print("Token acquired.")
    tokens = _TokenHolder(
        token,
        base_url=dataverse_url,
        refresh_via_az=(args.auth == "azcli"),
    )

    session = requests.Session()
    print(
        f"Purge transaction data on {dataverse_url}  "
        f"dry_run={args.dry_run} mode={args.mode} sandbox={use_sandbox}"
    )

    if args.mode == "bulk":
        for table in PURGE_TABLES:
            # Keep JobName unique per table even when --job-name is shared (Prod).
            job_name = (
                f"{args.job_name}-{table}" if args.job_name else _default_job_name(table)
            )
            if not purge_table_bulk(
                session,
                dataverse_url,
                tokens,
                table,
                job_name,
                sandbox=use_sandbox,
                dry_run=args.dry_run,
                poll_seconds=max(1, args.poll_seconds),
                timeout_minutes=max(1, args.timeout_minutes),
            ):
                print("\nPurge aborted due to BulkDelete failure.", file=sys.stderr)
                return 1
        action = "Dry-run complete" if args.dry_run else "BulkDelete purge complete"
        print(f"\n{action} for {len(PURGE_TABLES)} tables.")
        return 0

    total_seen = total_deleted = total_errors = 0
    for table in PURGE_TABLES:
        seen, deleted, errors = delete_all_rows(
            session,
            dataverse_url,
            tokens,
            table,
            dry_run=args.dry_run,
            workers=max(1, args.workers),
        )
        total_seen += seen
        total_deleted += deleted
        total_errors += errors
        if not args.dry_run and errors == 0:
            try:
                if not table_is_empty(session, dataverse_url, tokens, table):
                    print(
                        f"  ERROR {table}: rows remain after row-mode purge",
                        file=sys.stderr,
                    )
                    total_errors += 1
            except RuntimeError as exc:
                print(f"  ERROR {exc}", file=sys.stderr)
                total_errors += 1

    print(
        f"\nPurge complete: seen={total_seen} deleted={total_deleted} errors={total_errors}"
    )
    return 1 if total_errors else 0


if __name__ == "__main__":
    sys.exit(main())
