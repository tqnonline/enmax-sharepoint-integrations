"""
Seed a realistic, backdated transaction dataset into a Dataverse environment.

Reuses seed.py's lookup-resolution, option-set and upsert logic (so the exact
column / navigation-property remaps stay in one place). On top of that it:
  * re-dates the bundled sample data to span WINDOW_START .. WINDOW_END
    (createdon backdated via overriddencreatedon),
  * owns reservations / drawings / checkouts by the acting user (USER_EMAIL),
  * sets checkouts checked-out-by the user and closed-by the approver,
  * caps drawings to ~MAX_DRAWINGS and drops checkouts on dropped drawings,
  * writes number-sequence rows whose last-issued matches the seeded drawings
    (sequence key = business-asset-unit-domain-system-kind).

Auth (no service principal needed): set DATAVERSE_ACCESS_TOKEN (bring-your-own,
e.g. `az account get-access-token`) + DATAVERSE_URL, then run.
"""
from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import requests  # noqa: E402
import yaml  # noqa: E402
import seed  # noqa: E402  -- reuse remaps + helpers

USER_EMAIL     = "rakmol@enmax.com"          # requester / owner (the "user")
APPROVER_EMAIL = "HQuan@enmax.com"           # approver / closer (admin: Heather)
APP_TEAM_ID    = "e617bc6c-195e-f111-a826-7c1e5254cf7d"  # enmax-autocad-app team (number-sequence owner)
WINDOW_START   = dt.date(2025, 4, 1)
WINDOW_END     = dt.date(2026, 6, 1)
MAX_DRAWINGS   = 24

DIM_COLS = ("business_code", "asset_code", "unit_code", "domain_code", "system_code", "kind_code")


def _iso(d: dt.date, hh: int = 9, mm: int = 0) -> str:
    return f"{d.isoformat()}T{hh:02d}:{mm:02d}:00Z"


def _spread(i: int, n: int) -> dt.date:
    span = (WINDOW_END - WINDOW_START).days
    return WINDOW_START + dt.timedelta(days=int(span * i / max(n, 1)))


def _seed_rows(table, lookups, rows, nk_field, sess, url, token, loaded, owner_bind):
    loaded.setdefault(table, {})
    print(f"Seeding {table}: {len(rows)} rows")
    failed = 0
    for row in rows:
        row = seed._resolve_templates_in_row(row)
        nk = str(row[nk_field])
        row_id = seed.deterministic_id(table, nk)
        resolved = seed._resolve_lookups(row, lookups, loaded)
        payload = seed._build_payload(resolved, lookups, loaded)
        if owner_bind:
            payload["ownerid@odata.bind"] = owner_bind
        if row.get("_createdon"):
            payload["overriddencreatedon"] = row["_createdon"]
        if seed._upsert_row(sess, url, token, table, row_id, payload, False):
            loaded[table][nk] = row_id
        else:
            failed += 1
    return failed


def main() -> int:
    url = seed._require_env("DATAVERSE_URL").rstrip("/")
    token = seed.acquire_token(url, "spn")  # DATAVERSE_ACCESS_TOKEN overrides
    sess = requests.Session()
    seed._load_option_sets()

    uid = seed._fetch_systemuser_id(sess, url, token, USER_EMAIL)
    aid = seed._fetch_systemuser_id(sess, url, token, APPROVER_EMAIL)
    if not uid or not aid:
        print(f"ERROR: could not resolve users ({USER_EMAIL}={uid}, {APPROVER_EMAIL}={aid})", file=sys.stderr)
        return 1
    loaded = {"systemuser": {USER_EMAIL: uid, APPROVER_EMAIL: aid}}
    user_bind = f"/systemusers({uid})"
    team_bind = f"/teams({APP_TEAM_ID})"

    sdir = seed.SEED_DIR / "sample"
    res = yaml.safe_load((sdir / "reservation.yaml").read_text(encoding="utf-8"))
    dwg = yaml.safe_load((sdir / "drawing.yaml").read_text(encoding="utf-8"))
    chk = yaml.safe_load((sdir / "checkout.yaml").read_text(encoding="utf-8"))

    # --- re-date reservations across the window ---
    res_rows = res["rows"]
    res_base: dict[str, dt.date] = {}
    for i, r in enumerate(res_rows):
        base = _spread(i, len(res_rows))
        res_base[r["_nk"]] = base
        r["_createdon"] = _iso(base, 9)
        r.pop("enmax_acdnissuednumbers", None)  # don't trip AutoCreateDrawings (Update step)
        if r.get("enmax_acdnstatus") == "Approved":
            r["enmax_acdnapprovedon"] = _iso(base + dt.timedelta(days=6), 14)

    # --- cap + re-date drawings; track 6-dim sequence maxima ---
    kept_dwg: list[dict] = []
    kept_numbers: set[str] = set()
    dwg_date: dict[str, dt.date] = {}
    seq_max: dict[str, int] = {}
    for d in dwg["rows"]:
        if len(kept_dwg) >= MAX_DRAWINGS:
            break
        base = res_base.get(d.get("reservation_nk")) or _spread(len(kept_dwg), MAX_DRAWINGS)
        ddate = min(base + dt.timedelta(days=10), WINDOW_END)
        d["_createdon"] = _iso(ddate, 10)
        d["enmax_acdnrevisiondate"] = ddate.isoformat()
        kept_dwg.append(d)
        kept_numbers.add(d["number"])
        dwg_date[d["number"]] = ddate
        key = "-".join(str(d[c]) for c in DIM_COLS)
        seq_max[key] = max(seq_max.get(key, 0), int(d.get("enmax_acdnsequencenumber", 1)))

    # --- checkouts on surviving drawings; users + dates ---
    kept_chk: list[dict] = []
    for c in chk["rows"]:
        if c["drawing_number"] not in kept_numbers:
            continue
        status = c.get("enmax_acdnstatus", "")
        co = dwg_date[c["drawing_number"]] + dt.timedelta(days=20)
        if status in ("Open", "Awaiting Validation"):  # keep active ones recent
            co = max(co, WINDOW_END - dt.timedelta(days=5))
        co = min(co, WINDOW_END)
        c["enmax_acdncheckedouton"] = _iso(co, 9)
        c["_createdon"] = _iso(co, 9)
        c["user_email"] = USER_EMAIL
        if status.startswith("Closed"):
            c["closed_by_email"] = APPROVER_EMAIL
            c["enmax_acdnclosedon"] = _iso(min(co + dt.timedelta(days=7), WINDOW_END), 16)
        else:
            c.pop("closed_by_email", None)
            c.pop("enmax_acdnclosedon", None)
        kept_chk.append(c)

    errs = 0
    errs += _seed_rows("enmax_autocadreservation", res["lookups"], res_rows, "_nk", sess, url, token, loaded, user_bind)
    errs += _seed_rows("enmax_autocaddrawing", dwg["lookups"], kept_dwg, "number", sess, url, token, loaded, user_bind)

    # --- sheets per drawing. AutoCreateDrawings makes these for app-issued drawings;
    # the demo-seeded drawings need them created here. Sheet-state ints differ from
    # drawing-state (Available=2 not 1, etc.), so map explicitly and send the int
    # (a str would be label-resolved against the wrong option set for this column). ---
    DRAWING_TO_SHEET_STATE = {"Available": 2, "Checked Out": 3, "Awaiting Validation": 4, "Checked In": 2, "Obsolete": 5, "Void": 6}
    sheet_rows = []
    for d in kept_dwg:
        sstate = DRAWING_TO_SHEET_STATE.get(d.get("enmax_acdnstate", "Available"), 2)
        for i in range(1, int(d.get("enmax_acdnsheetcount", 1)) + 1):
            sheet_rows.append({
                "_nk": f"{d['number']}-S{i}",  # deterministic-id key only; sheet has no name column
                "drawing_number": d["number"],
                "enmax_acdnsheetnumber": i,
                "enmax_acdnstate": sstate,
                "_createdon": d.get("_createdon"),
            })
    errs += _seed_rows("enmax_autocadsheet", {"drawing": {"table": "enmax_autocaddrawing", "key": "number", "source_column": "drawing_number"}}, sheet_rows, "_nk", sess, url, token, loaded, user_bind)

    errs += _seed_rows("enmax_autocadcheckout", chk["lookups"], kept_chk, "name", sess, url, token, loaded, user_bind)

    ns_rows = [
        {"sequence_key": k, "enmax_acdnlastissued": v, "enmax_acdnstatus": "Healthy", "enmax_acdnseedvalue": 0}
        for k, v in sorted(seq_max.items())
    ]
    errs += _seed_rows("enmax_autocadnumbersequence", {}, ns_rows, "sequence_key", sess, url, token, loaded, team_bind)

    # --- broadcasts (team-owned) + notifications (recipient = user) + dismissals (user) ---
    bc = yaml.safe_load((sdir / "broadcast.yaml").read_text(encoding="utf-8"))
    for b in bc["rows"]:
        if b.get("enmax_acdnstartsat"):
            b["_createdon"] = b["enmax_acdnstartsat"]
    errs += _seed_rows("enmax_autocadbroadcast", {}, bc["rows"], "title", sess, url, token, loaded, team_bind)

    nt = yaml.safe_load((sdir / "in_app_notification.yaml").read_text(encoding="utf-8"))
    for n in nt["rows"]:
        n["user_email"] = USER_EMAIL
        n["_createdon"] = n.get("enmax_acdnreadon") or _iso(WINDOW_END - dt.timedelta(days=3), 9)
    errs += _seed_rows("enmax_autocadinappnotification", nt["lookups"], nt["rows"], "title", sess, url, token, loaded, user_bind)

    bd = yaml.safe_load((sdir / "broadcast_dismissal.yaml").read_text(encoding="utf-8"))
    for d in bd["rows"]:
        d["user_email"] = USER_EMAIL
        if d.get("enmax_acdndismissedon"):
            d["_createdon"] = d["enmax_acdndismissedon"]
    errs += _seed_rows("enmax_autocadbroadcastdismissal", bd["lookups"], bd["rows"], "name", sess, url, token, loaded, user_bind)

    print(
        f"\nDemo seed complete: {len(res_rows)} reservations, {len(kept_dwg)} drawings, "
        f"{len(sheet_rows)} sheets, {len(kept_chk)} checkouts, {len(ns_rows)} sequences, {len(bc['rows'])} broadcasts, "
        f"{len(nt['rows'])} notifications, {len(bd['rows'])} dismissals. Errors: {errs}"
    )
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
