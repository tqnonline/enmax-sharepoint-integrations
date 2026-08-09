#!/usr/bin/env python3
"""Import legacy GF / EEC coded PDFs into Dataverse + Heather Excel reports.

Operator runbook: solution/scripts/OPS_LEGACY_IMPORT.md
Architecture (C4): docs/architecture/legacy-import-ops.md

Usage:
  python solution/scripts/import_legacy_coded_pdfs.py --stream gf --dry-run \\
      --gf-excel /path/to/ENMAX_GF_Coded_PDF_Records.xlsx
  python solution/scripts/import_legacy_coded_pdfs.py --stream eec --dry-run --auth pac \\
      --eec-excel /path/to/ENMAX_EEC_Coded_PDF_Records.xlsx
  python solution/scripts/import_legacy_coded_pdfs.py --stream all --apply --auth azcli --confirm-dev \\
      --gf-excel /path/to/GF.xlsx --eec-excel /path/to/EEC.xlsx
  python solution/scripts/import_legacy_coded_pdfs.py --stream gf --apply --confirm-dev \\
      --gf-excel /path/to/GF.xlsx --limit 50 --batch-scale 2
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from dv_cli_common import (  # noqa: E402
    GateError,
    TokenHolder,
    odata_headers,
    require_dev_confirm,
    resolve_dataverse_url,
)
from dv_upsert_batch import (  # noqa: E402
    load_checkpoint,
    upsert_targets_chunked,
)
from legacy_coded_pdf_parse import (  # noqa: E402
    STREAM_EEC,
    STREAM_GF,
    ParseResult,
    ParsedRow,
    load_seed_ref_codes,
    parse_excel_stream,
)
from legacy_coded_pdf_report import write_heather_workbook  # noqa: E402


def _seed():
    """Lazy-import seed (requires msal) only for live apply/token paths."""
    import seed as seed_mod

    return seed_mod


DRAWING_STATE_AVAILABLE = 1
SHEET_STATE_AVAILABLE = 2

BASE_BATCH_ROWS = 500
ALLOWED_BATCH_SCALES = frozenset({1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0})


def parse_batch_scale(raw: str) -> float:
    s = raw.strip().lower()
    if s.endswith("x"):
        s = s[:-1]
    try:
        val = float(s)
    except ValueError as exc:
        raise ValueError(f"invalid --batch-scale {raw!r}") from exc
    if val not in ALLOWED_BATCH_SCALES:
        raise ValueError(
            f"--batch-scale must be one of {sorted(ALLOWED_BATCH_SCALES)}; got {raw!r}"
        )
    return val


def chunk_size_for_scale(scale: float) -> int:
    if scale not in ALLOWED_BATCH_SCALES:
        raise ValueError(f"unsupported batch scale: {scale}")
    return int(scale * BASE_BATCH_ROWS)


def sequence_seeds_from_rows(rows: list[ParsedRow]) -> dict[str, int]:
    """Max NNNN per coding|family for rows actually being applied."""
    seeds: dict[str, int] = {}
    for r in rows:
        if not r.sequence_family:
            continue
        key = f"{r.coding}|{r.sequence_family}"
        if r.nnnn > seeds.get(key, 0):
            seeds[key] = r.nnnn
    return seeds


def max_merge_sequence_seed(key: str, seed: int, live: dict[str, int]) -> int:
    """Monotonic merge of import seed with live counters.

    For ``coding|DRW``, also consider the pre-partition legacy key ``coding``
    so import without a prior sequence purge cannot seed below the historical
    Drawing high-water (IssueNumbers prefers coding|DRW once it exists).
    """
    candidates = [seed, int(live.get(key, 0) or 0)]
    if "|" in key:
        coding, family = key.rsplit("|", 1)
        if family.upper() == "DRW":
            candidates.append(int(live.get(coding, 0) or 0))
    return max(candidates)

ENTITY_DRAWING = "enmax_autocaddrawing"
ENTITY_SHEET = "enmax_autocadsheet"
ENTITY_SEQUENCE = "enmax_autocadnumbersequence"
ESET_DRAWING = "enmax_autocaddrawings"
ESET_SHEET = "enmax_autocadsheets"
ESET_SEQUENCE = "enmax_autocadnumbersequences"

REF_TABLES = {
    "Business": ("enmax_autocadbusinesses", "enmax_acdncode"),
    "Asset": ("enmax_autocadassets", "enmax_acdncode"),
    "Unit": ("enmax_autocadunits", "enmax_acdncode"),
    "Domain": ("enmax_autocaddomains", "enmax_acdncode"),
    "System": ("enmax_autocadsystems", "enmax_acdncode"),
    "Kind": ("enmax_autocadkinds", "enmax_acdncode"),
}

BINDS = {
    "Business": ("enmax_acdnBusiness", "enmax_autocadbusinesses"),
    "Asset": ("enmax_acdnAsset", "enmax_autocadassets"),
    "Unit": ("enmax_acdnUnit", "enmax_autocadunits"),
    "Domain": ("enmax_acdnDomain", "enmax_autocaddomains"),
    "System": ("enmax_acdnSystem", "enmax_autocadsystems"),
    "Kind": ("enmax_acdnKind", "enmax_autocadkinds"),
}


def load_live_ref_codes(session: requests.Session, base: str, token: str) -> dict[str, set[str]]:
    out: dict[str, set[str]] = {}
    for dim, (entity_set, code_attr) in REF_TABLES.items():
        codes: set[str] = set()
        url = f"{base}/api/data/v9.2/{entity_set}?$select={code_attr}&$top=5000"
        while url:
            resp = session.get(url, headers=odata_headers(token), timeout=120)
            resp.raise_for_status()
            body = resp.json()
            for row in body.get("value", []):
                c = row.get(code_attr)
                if c:
                    codes.add(str(c).upper())
            url = body.get("@odata.nextLink")
        out[dim] = codes
        print(f"  live {dim}: {len(codes)} codes")
    return out


def load_live_ref_id_maps(
    session: requests.Session, base: str, token: str
) -> dict[str, dict[str, str]]:
    """code → GUID for each dimension."""
    maps: dict[str, dict[str, str]] = {}
    id_attrs = {
        "Business": "enmax_autocadbusinessid",
        "Asset": "enmax_autocadassetid",
        "Unit": "enmax_autocadunitid",
        "Domain": "enmax_autocaddomainid",
        "System": "enmax_autocadsystemid",
        "Kind": "enmax_autocadkindid",
    }
    for dim, (entity_set, code_attr) in REF_TABLES.items():
        id_attr = id_attrs[dim]
        m: dict[str, str] = {}
        url = f"{base}/api/data/v9.2/{entity_set}?$select={code_attr},{id_attr}&$top=5000"
        while url:
            resp = session.get(url, headers=odata_headers(token), timeout=120)
            resp.raise_for_status()
            body = resp.json()
            for row in body.get("value", []):
                c = row.get(code_attr)
                rid = row.get(id_attr)
                if c and rid:
                    m[str(c).upper()] = rid
            url = body.get("@odata.nextLink")
        maps[dim] = m
    return maps


def drawing_nk(number: str, subtype: int) -> str:
    return f"{number}|{subtype}"


def sheet_nk(parent_number: str, subtype: int, sss: int) -> str:
    return f"{parent_number}|{subtype}|{sss:03d}"


def _drawing_number(row: ParsedRow) -> str:
    if row.sss is not None:
        return row.parent_number
    return row.display_number


def build_drawing_target(
    row: ParsedRow,
    id_maps: dict[str, dict[str, str]],
    *,
    with_url: bool = True,
) -> tuple[str, dict] | None:
    """Return (row_id, UpsertMultiple target) or None if refs missing."""
    number = _drawing_number(row)
    nk = drawing_nk(number, row.document_subtype)
    row_id = str(_seed().deterministic_id(ENTITY_DRAWING, nk))
    # UpsertMultiple identifies by primary key in the body — do NOT set @odata.id
    # (that path expects alternate-key attributes and returns 0x80060890).
    payload: dict = {
        "@odata.type": f"Microsoft.Dynamics.CRM.{ENTITY_DRAWING}",
        f"{ENTITY_DRAWING}id": row_id,
        "enmax_acdnnumber": number,
        "enmax_acdntitle": (row.title if with_url and row.sss is None else None) or number,
        "enmax_acdnstate": DRAWING_STATE_AVAILABLE,
        "enmax_acdnreservationtype": row.reservation_type,
        "enmax_acdndocumentsubtype": row.document_subtype,
        "enmax_acdnsequencenumber": row.nnnn,
    }
    if with_url and row.sss is None and row.url:
        payload["enmax_acdnspdestinationurl"] = row.url
        payload["enmax_acdnpresentindestination"] = True

    codes = {
        "Business": row.bb,
        "Asset": row.aa,
        "Unit": row.uu,
        "Domain": row.ddd,
        "System": row.sys,
        "Kind": row.kn,
    }
    for dim, (nav, eset) in BINDS.items():
        guid = id_maps[dim].get(codes[dim])
        if not guid:
            print(f"  ERROR missing {dim}={codes[dim]} for {number}", file=sys.stderr)
            return None
        payload[f"{nav}@odata.bind"] = f"/{eset}({guid})"
    return row_id, payload


def build_sheet_target(row: ParsedRow, drawing_id: str) -> tuple[str, dict]:
    assert row.sss is not None
    nk = sheet_nk(row.parent_number, row.document_subtype, row.sss)
    row_id = str(_seed().deterministic_id(ENTITY_SHEET, nk))
    payload = {
        "@odata.type": f"Microsoft.Dynamics.CRM.{ENTITY_SHEET}",
        f"{ENTITY_SHEET}id": row_id,
        "enmax_acdnsheetnumber": row.sss,
        "enmax_acdnfilename": row.leaf or row.display_number,
        "enmax_acdnstate": SHEET_STATE_AVAILABLE,
        "enmax_acdnreservationtype": row.reservation_type,
        "enmax_acdndocumentsubtype": row.document_subtype,
        "enmax_acdnspdestinationurl": row.url,
        "enmax_acdnpresentindestination": True,
        "enmax_acdnDrawing@odata.bind": f"/enmax_autocaddrawings({drawing_id})",
    }
    return row_id, payload


def build_sequence_target(sequence_key: str, last_issued: int) -> tuple[str, dict]:
    row_id = str(_seed().deterministic_id(ENTITY_SEQUENCE, sequence_key))
    payload = {
        "@odata.type": f"Microsoft.Dynamics.CRM.{ENTITY_SEQUENCE}",
        f"{ENTITY_SEQUENCE}id": row_id,
        "enmax_acdnsequencekey": sequence_key,
        "enmax_acdnlastissued": last_issued,
        "enmax_acdnseedvalue": 0,
        "enmax_acdnseedreason": "legacy coded PDF import high-water mark",
    }
    return row_id, payload


def load_live_sequence_lastissued(
    session: requests.Session, base: str, token: str
) -> dict[str, int]:
    """Map sequencekey → live lastissued for monotonic max-merge on import."""
    out: dict[str, int] = {}
    url = (
        f"{base.rstrip('/')}/api/data/v9.2/{ESET_SEQUENCE}"
        f"?$select=enmax_acdnsequencekey,enmax_acdnlastissued&$top=5000"
    )
    headers = odata_headers(token)
    while url:
        resp = session.get(url, headers=headers, timeout=120)
        resp.raise_for_status()
        payload = resp.json()
        for row in payload.get("value", []):
            key = row.get("enmax_acdnsequencekey")
            if not key:
                continue
            out[key] = int(row.get("enmax_acdnlastissued") or 0)
        url = payload.get("@odata.nextLink")
    return out


def apply_result(
    result: ParseResult,
    session: requests.Session,
    base: str,
    token_holder: TokenHolder,
    id_maps: dict[str, dict[str, str]],
    *,
    dry_run: bool,
    limit: int | None,
    chunk_size: int = 500,
    workers: int = 1,
    checkpoint_path: Path | None = None,
    resume: bool = False,
    legacy_row_upsert: bool = False,
) -> tuple[dict[str, str], bool]:
    """Apply parse result. Returns (applied_ids, ok).

    applied_ids is populated only for phases that fully succeed so Heather reports
    do not claim GUIDs for rows that never landed.
    """
    applied: dict[str, str] = {}
    ok = True
    checkpoint = load_checkpoint(checkpoint_path, resume)
    if checkpoint is not None and checkpoint_path is not None:
        checkpoint["stream_hint"] = str(checkpoint_path.name)

    parents = result.parents_needed[:limit] if limit else result.parents_needed
    bases = [r for r in result.eligible if r.sss is None]
    if limit is not None:
        bases = bases[: max(0, limit - len(parents))]
    sheets = [r for r in result.eligible if r.sss is not None]
    if limit is not None:
        sheets = sheets[:limit]

    def _run_phase(
        phase: str,
        entity_set: str,
        logical_name: str,
        targets: list[dict],
    ) -> bool:
        nonlocal ok
        completed, errors = upsert_targets_chunked(
            session,
            base,
            token_holder,
            entity_set=entity_set,
            logical_name=logical_name,
            targets=targets,
            chunk_size=chunk_size,
            workers=workers,
            dry_run=dry_run,
            phase=phase,
            checkpoint=checkpoint,
            checkpoint_path=checkpoint_path,
            legacy_row_upsert=legacy_row_upsert,
        )
        phase_ok = errors == 0 and completed >= len(targets)
        if not phase_ok:
            print(
                f"  ERROR {phase}: completed={completed}/{len(targets)} errors={errors}",
                file=sys.stderr,
                flush=True,
            )
            ok = False
        return phase_ok

    # --- Parents ---
    print(f"Upserting {len(parents)} parent bases (no PDF)...", flush=True)
    parent_targets: list[dict] = []
    parent_ids: dict[tuple[str, int], str] = {}
    parent_keys: list[tuple[ParsedRow, str]] = []
    build_skips = 0
    for row in parents:
        built = build_drawing_target(row, id_maps, with_url=False)
        if not built:
            build_skips += 1
            continue
        rid, target = built
        parent_ids[(row.parent_number, row.document_subtype)] = rid
        parent_keys.append((row, rid))
        parent_targets.append(target)

    # --- Bases ---
    print(f"Upserting {len(bases)} base documents...", flush=True)
    base_targets: list[dict] = []
    base_keys: list[tuple[ParsedRow, str]] = []
    for row in bases:
        built = build_drawing_target(row, id_maps, with_url=True)
        if not built:
            build_skips += 1
            continue
        rid, target = built
        parent_ids[(row.parent_number, row.document_subtype)] = rid
        base_keys.append((row, rid))
        base_targets.append(target)

    if build_skips:
        ok = False
        print(
            f"  ERROR: skipped {build_skips} drawing target(s) (missing ref binds) — "
            f"failing apply so Heather GUIDs stay honest",
            file=sys.stderr,
            flush=True,
        )

    if _run_phase("parents", ESET_DRAWING, ENTITY_DRAWING, parent_targets):
        for row, rid in parent_keys:
            applied[f"{row.display_number}|{row.document_subtype}"] = rid

    if _run_phase("bases", ESET_DRAWING, ENTITY_DRAWING, base_targets):
        for row, rid in base_keys:
            applied[f"{row.display_number}|{row.document_subtype}"] = rid

    # --- Sheets (ensure parent id known; create missing parents in one batch first) ---
    print(f"Upserting {len(sheets)} sheets...", flush=True)
    missing_parent_rows: list[ParsedRow] = []
    seen_missing: set[tuple[str, int]] = set()
    for row in sheets:
        key = (row.parent_number, row.document_subtype)
        if key not in parent_ids and key not in seen_missing:
            nk = drawing_nk(row.parent_number, row.document_subtype)
            parent_ids[key] = str(_seed().deterministic_id(ENTITY_DRAWING, nk))
            missing_parent_rows.append(row)
            seen_missing.add(key)

    if missing_parent_rows:
        mp_targets: list[dict] = []
        for row in missing_parent_rows:
            built = build_drawing_target(row, id_maps, with_url=False)
            if built:
                rid, target = built
                parent_ids[(row.parent_number, row.document_subtype)] = rid
                mp_targets.append(target)
        print(f"  ensuring {len(mp_targets)} sheet parents...", flush=True)
        sheet_parents_ok = _run_phase("sheet_parents", ESET_DRAWING, ENTITY_DRAWING, mp_targets)
    else:
        sheet_parents_ok = True

    sheet_targets: list[dict] = []
    sheet_keys: list[tuple[ParsedRow, str]] = []
    if sheet_parents_ok:
        for row in sheets:
            key = (row.parent_number, row.document_subtype)
            did = parent_ids.get(key)
            if not did:
                continue
            rid, target = build_sheet_target(row, did)
            sheet_keys.append((row, rid))
            sheet_targets.append(target)

        if _run_phase("sheets", ESET_SHEET, ENTITY_SHEET, sheet_targets):
            for row, rid in sheet_keys:
                applied[f"{row.display_number}|{row.document_subtype}"] = rid
    else:
        print(
            "  SKIP sheets: sheet_parents phase failed",
            file=sys.stderr,
            flush=True,
        )

    # --- Sequences: only when earlier phases succeeded (avoid seeding from failed apply) ---
    if not ok:
        print(
            "  SKIP sequences: earlier phase failures — fix and --resume before seeding counters",
            file=sys.stderr,
            flush=True,
        )
        return applied, ok

    if limit is not None:
        seq_map = sequence_seeds_from_rows([*parents, *bases, *sheets])
    else:
        seq_map = dict(result.sequence_seeds)
    seq_items = sorted(seq_map.items())
    if not dry_run and seq_items:
        live = load_live_sequence_lastissued(session, base, token_holder.maybe_refresh())
        merged: list[tuple[str, int]] = []
        lowered = 0
        for key, seed in seq_items:
            merged_n = max_merge_sequence_seed(key, seed, live)
            if merged_n > seed:
                lowered += 1
            merged.append((key, merged_n))
        if lowered:
            print(
                f"  sequence max-merge: kept live high-water for {lowered} key(s)",
                flush=True,
            )
        seq_items = merged
    print(f"Upserting {len(seq_items)} number sequences...", flush=True)
    seq_targets = [build_sequence_target(k, v)[1] for k, v in seq_items]
    _run_phase("sequences", ESET_SEQUENCE, ENTITY_SEQUENCE, seq_targets)

    return applied, ok


def run_stream(
    stream: str,
    excel: Path,
    *,
    env: str,
    mode: str,
    auth: str,
    apply: bool,
    limit: int | None,
    report_dir: Path,
    ref_codes: dict[str, set[str]] | None,
    session: requests.Session | None,
    base: str | None,
    token: str | None,
    id_maps: dict[str, dict[str, str]] | None,
    chunk_size: int = 500,
    workers: int = 1,
    resume: bool = False,
    legacy_row_upsert: bool = False,
) -> tuple[ParseResult, bool]:
    print(f"\n=== {stream.upper()} parse: {excel} ===")
    result = parse_excel_stream(stream, excel, ref_codes=ref_codes)
    print(
        f"rows={result.total_rows} eligible={len(result.eligible)} "
        f"rejected={len(result.rejected)} dups={len(result.duplicates_dropped)} "
        f"parents={len(result.parents_needed)} sequences={len(result.sequence_seeds)}"
    )

    applied: dict[str, str] = {}
    apply_ok = True
    if apply:
        assert session and base and token and id_maps is not None
        holder = TokenHolder(
            token,
            refresh_via_az=(auth == "azcli"),
            base_url=base,
        )
        ck = report_dir / f"checkpoint_{stream}_{env}.json"
        applied, apply_ok = apply_result(
            result,
            session,
            base,
            holder,
            id_maps,
            dry_run=False,
            limit=limit,
            chunk_size=chunk_size,
            workers=workers,
            checkpoint_path=ck,
            resume=resume,
            legacy_row_upsert=legacy_row_upsert,
        )
        if not apply_ok:
            print(f"ERROR: {stream.upper()} apply had phase failures", file=sys.stderr)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = report_dir / f"Heather_{stream.upper()}_Import_Report_{env}_{stamp}.xlsx"
    write_heather_workbook(result, out, env=env, mode=mode, applied_ids=applied)
    print(f"Wrote {out}")
    return result, apply_ok


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stream", choices=["gf", "eec", "all"], default="all")
    parser.add_argument(
        "--gf-excel",
        type=Path,
        default=None,
        help="Path to GF coded-PDF extract (required for gf/all).",
    )
    parser.add_argument(
        "--eec-excel",
        type=Path,
        default=None,
        help="Path to EEC coded-PDF extract (required for eec/all).",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--auth",
        default="azcli",
        help="seed.acquire_token auth mode (azcli/device/interactive/spn). DATAVERSE_ACCESS_TOKEN overrides.",
    )
    parser.add_argument("--environment", default="dev")
    parser.add_argument("--confirm-dev", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument(
        "--batch-scale",
        default="1",
        help="UpsertMultiple size as Nx500 rows: 1, 1.5, 2, 2.5, 3, 3.5, 4 (default 1 → 500).",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="Parallel UpsertMultiple chunk workers (default 1).",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume from checkpoint_{stream}_{env}.json in --report-dir.",
    )
    parser.add_argument(
        "--legacy-row-upsert",
        action="store_true",
        help="Use one PATCH per row instead of UpsertMultiple (debug).",
    )
    parser.add_argument(
        "--report-dir",
        type=Path,
        default=REPO / "solution/scripts/reports/legacy_import",
    )
    parser.add_argument(
        "--ref-from-seed",
        action="store_true",
        help="Use seed YAML codes instead of live Dataverse (offline preflight)",
    )
    args = parser.parse_args()

    if args.apply and args.dry_run:
        print("Choose only one of --apply / --dry-run", file=sys.stderr)
        return 2
    if not args.apply and not args.dry_run:
        args.dry_run = True
    try:
        batch_scale = parse_batch_scale(args.batch_scale)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    chunk_size = chunk_size_for_scale(batch_scale)
    if args.workers < 1:
        print("ERROR: --workers must be >= 1", file=sys.stderr)
        return 2

    mode = "apply" if args.apply else "preflight"
    streams = [STREAM_GF, STREAM_EEC] if args.stream == "all" else [args.stream]

    for stream in streams:
        excel = args.gf_excel if stream == STREAM_GF else args.eec_excel
        if excel is None:
            flag = "--gf-excel" if stream == STREAM_GF else "--eec-excel"
            print(
                f"ERROR: {flag} is required for stream={stream} "
                f"(no machine-local default paths)",
                file=sys.stderr,
            )
            return 2

    session = None
    base = None
    token = None
    id_maps = None
    ref_codes = None

    if args.ref_from_seed and not args.apply:
        ref_codes = load_seed_ref_codes(REPO / "solution/seed/reference")
        print(f"Using seed reference codes ({sum(len(v) for v in ref_codes.values())} total)")
    else:
        try:
            base = resolve_dataverse_url()
        except RuntimeError:
            print(
                "ERROR: Set DATAVERSE_URL or select pac org (or pass --ref-from-seed)",
                file=sys.stderr,
            )
            return 1

        if args.apply:
            try:
                require_dev_confirm(base, confirm_dev=args.confirm_dev, action="apply")
            except GateError as exc:
                print(exc.message, file=sys.stderr)
                return 1

        token = _seed().acquire_token(base, args.auth)
        session = requests.Session()
        print(f"Connected to {base}")
        print("Loading live reference codes...")
        ref_codes = load_live_ref_codes(session, base, token)
        if args.apply:
            id_maps = load_live_ref_id_maps(session, base, token)

    args.report_dir.mkdir(parents=True, exist_ok=True)
    all_ok = True
    for stream in streams:
        excel = args.gf_excel if stream == STREAM_GF else args.eec_excel
        assert excel is not None
        if not excel.exists():
            print(f"ERROR: missing excel {excel}", file=sys.stderr)
            return 1
        _, stream_ok = run_stream(
            stream,
            excel,
            env=args.environment,
            mode=mode,
            auth=args.auth,
            apply=args.apply,
            limit=args.limit,
            report_dir=args.report_dir,
            ref_codes=ref_codes,
            session=session,
            base=base,
            token=token,
            id_maps=id_maps,
            chunk_size=chunk_size,
            workers=args.workers,
            resume=args.resume,
            legacy_row_upsert=args.legacy_row_upsert,
        )
        all_ok = all_ok and stream_ok

    if not all_ok:
        print("\nDone with ERRORS.", file=sys.stderr)
        return 1
    print("\nDone.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
