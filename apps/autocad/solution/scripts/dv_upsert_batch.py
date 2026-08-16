"""Dataverse UpsertMultiple batching + contiguous checkpoint helpers."""
from __future__ import annotations

import json
import sys
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import requests

from dv_cli_common import TokenHolder, log_event, odata_headers


def contiguous_checkpoint(start_idx: int, ordered_ends: list[int], done_ends: set[int]) -> int:
    """Advance only through a completed prefix of chunk end offsets.

    Parallel workers must not checkpoint summed success counts — those are not a
    list prefix and --resume would skip unfinished rows.
    """
    cur = start_idx
    for end in ordered_ends:
        if end not in done_ends:
            break
        cur = end
    return cur


def classify_upsert_multiple_response(
    status: int, body: str
) -> Literal["ok", "unsupported", "retry", "split", "fail"]:
    """Classify UpsertMultiple HTTP outcome for retry / fallback / split decisions."""
    if status in (200, 204):
        return "ok"
    if status in (404, 501) or (
        status == 400
        and (
            "UpsertMultiple" in body
            or "0x80060890" in body
            or "DoesNotExist" in body
            or "Resource not found" in body
            or "not a defined key" in body
        )
    ):
        return "unsupported"
    if status == 429:
        return "retry"
    if status in (413, 500, 502, 504):
        return "split"
    return "fail"


def _patch_payload_from_target(target: dict, logical_name: str) -> dict:
    payload = {k: v for k, v in target.items() if not k.startswith("@odata.")}
    payload.pop(f"{logical_name}id", None)
    return payload


def _upsert_multiple_request(
    session: requests.Session,
    base: str,
    token: str,
    entity_set: str,
    targets: list[dict],
) -> requests.Response:
    url = f"{base.rstrip('/')}/api/data/v9.2/{entity_set}/Microsoft.Dynamics.CRM.UpsertMultiple"
    return session.post(
        url,
        json={"Targets": targets},
        headers=odata_headers(token),
        timeout=600,
    )


def _upsert_chunk_via_patch(
    session: requests.Session,
    base: str,
    token: str,
    entity_set: str,
    logical_name: str,
    targets: list[dict],
) -> tuple[int, list[str]]:
    """Fallback: one PATCH upsert per row. Returns (ok_count, error_msgs)."""
    import seed as seed_mod

    ok = 0
    errors: list[str] = []
    for target in targets:
        row_id = target.get(f"{logical_name}id") or target.get("@odata.id", "").split("(")[-1].rstrip(")")
        payload = _patch_payload_from_target(target, logical_name)
        if seed_mod._upsert_row(
            session, base, token, logical_name, uuid.UUID(str(row_id)), payload, False
        ):
            ok += 1
        else:
            errors.append(str(row_id))
    return ok, errors


def _save_checkpoint(
    path: Path | None,
    checkpoint: dict | None,
    phase: str,
    completed: int,
) -> None:
    if path is None or checkpoint is None:
        return
    checkpoint.setdefault("phases", {})[phase] = completed
    checkpoint["updated_at"] = datetime.now(timezone.utc).isoformat()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(checkpoint, indent=2), encoding="utf-8")


def load_checkpoint(path: Path | None, resume: bool) -> dict | None:
    if not resume or path is None or not path.exists():
        return {"phases": {}} if path is not None else None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        data.setdefault("phases", {})
        print(f"  loaded checkpoint {path}: {data.get('phases')}", flush=True)
        return data
    except Exception as exc:  # noqa: BLE001
        print(f"  WARNING: bad checkpoint {path}: {exc}", file=sys.stderr)
        return {"phases": {}}


# Back-compat alias
_load_checkpoint = load_checkpoint


def upsert_targets_chunked(
    session: requests.Session,
    base: str,
    token_holder: TokenHolder,
    *,
    entity_set: str,
    logical_name: str,
    targets: list[dict],
    chunk_size: int,
    workers: int,
    dry_run: bool,
    phase: str,
    checkpoint: dict | None,
    checkpoint_path: Path | None,
    legacy_row_upsert: bool,
) -> tuple[int, int]:
    """Upsert targets via UpsertMultiple (or row PATCH fallback).

    Returns (completed_prefix_count, error_count). Checkpoint advances only on a
    contiguous completed prefix so --resume never skips unfinished rows.
    """
    if not targets:
        return 0, 0
    if dry_run:
        print(f"  [DRY-RUN] {phase}: would upsert {len(targets)} via {entity_set}", flush=True)
        return len(targets), 0

    start_idx = 0
    if checkpoint:
        start_idx = int(checkpoint.get("phases", {}).get(phase, 0))
        if start_idx:
            print(f"  resume {phase}: skipping first {start_idx}", flush=True)

    remaining = targets[start_idx:]
    if not remaining:
        print(f"  {phase}: already complete ({len(targets)})", flush=True)
        return len(targets), 0

    chunks: list[tuple[int, list[dict]]] = []
    for offset in range(0, len(remaining), chunk_size):
        piece = remaining[offset : offset + chunk_size]
        abs_end = start_idx + offset + len(piece)
        chunks.append((abs_end, piece))
    ordered_ends = [abs_end for abs_end, _ in chunks]

    print(
        f"  {phase}: {len(remaining)} rows in {len(chunks)} chunk(s) "
        f"(size={chunk_size}, workers={workers}, mode={'row' if legacy_row_upsert else 'UpsertMultiple'})",
        flush=True,
    )
    log_event(
        "phase_start",
        phase=phase,
        remaining=len(remaining),
        chunks=len(chunks),
        chunk_size=chunk_size,
        workers=workers,
        mode="row" if legacy_row_upsert else "UpsertMultiple",
    )

    use_multiple = not legacy_row_upsert
    multiple_supported: bool | None = None
    done_ends: set[int] = set()
    err_total = 0
    ck_lock = threading.Lock()
    t0 = time.time()

    def _session_for_worker() -> requests.Session:
        # requests.Session is not guaranteed thread-safe; parallel path uses per-call sessions.
        return session if workers <= 1 else requests.Session()

    def run_one(abs_done: int, chunk: list[dict]) -> tuple[int, int, list[str], bool]:
        """Returns (abs_done, ok_in_chunk, errors, multiple_ok)."""
        token = token_holder.maybe_refresh()
        sess = _session_for_worker()
        if legacy_row_upsert or multiple_supported is False:
            n_ok, errs = _upsert_chunk_via_patch(
                sess, base, token, entity_set, logical_name, chunk
            )
            return abs_done, n_ok, errs, False

        resp = _upsert_multiple_request(sess, base, token, entity_set, chunk)
        body = resp.text or ""
        kind = classify_upsert_multiple_response(resp.status_code, body)

        if kind == "ok":
            return abs_done, len(chunk), [], True

        if kind == "unsupported":
            print(
                f"  WARNING: UpsertMultiple unavailable/miskeyed ({resp.status_code}); "
                f"falling back to row PATCH for remaining chunks",
                flush=True,
            )
            n_ok, errs = _upsert_chunk_via_patch(
                sess, base, token, entity_set, logical_name, chunk
            )
            return abs_done, n_ok, errs, False

        if kind == "retry":
            retry_after = int(resp.headers.get("Retry-After", "5"))
            time.sleep(retry_after)
            token2 = token_holder.maybe_refresh()
            resp2 = _upsert_multiple_request(sess, base, token2, entity_set, chunk)
            if classify_upsert_multiple_response(resp2.status_code, resp2.text or "") == "ok":
                return abs_done, len(chunk), [], True
            n_ok, errs = _upsert_chunk_via_patch(
                sess, base, token_holder.maybe_refresh(), entity_set, logical_name, chunk
            )
            return abs_done, n_ok, errs, True

        if kind == "split" and len(chunk) > 1:
            mid = len(chunk) // 2
            print(
                f"  chunk failed {resp.status_code}; splitting {len(chunk)} → {mid}+{len(chunk)-mid}",
                flush=True,
            )
            a = run_one(abs_done - len(chunk) + mid, chunk[:mid])
            b = run_one(abs_done, chunk[mid:])
            return abs_done, a[1] + b[1], a[2] + b[2], a[3] and b[3]

        err = f"{resp.status_code}: {resp.text[:400]}"
        print(f"  ERROR {phase} chunk ending@{abs_done}: {err}", file=sys.stderr, flush=True)
        n_ok, errs = _upsert_chunk_via_patch(
            sess, base, token, entity_set, logical_name, chunk
        )
        return abs_done, n_ok, errs, True

    def record_chunk(abs_done: int, n_ok: int, errs: list[str], chunk_len: int) -> int:
        nonlocal err_total
        err_total += len(errs)
        if errs:
            print(f"  {phase}: {len(errs)} row errors", file=sys.stderr, flush=True)
        with ck_lock:
            if n_ok == chunk_len:
                done_ends.add(abs_done)
            prefix = contiguous_checkpoint(start_idx, ordered_ends, done_ends)
            _save_checkpoint(checkpoint_path, checkpoint, phase, prefix)
            return prefix

    # First chunk probes UpsertMultiple support; then optional parallel.
    first_abs, first_chunk = chunks[0]
    abs_done, n_ok, errs, multi_ok = run_one(first_abs, first_chunk)
    multiple_supported = multi_ok if use_multiple else False
    ok_total = record_chunk(abs_done, n_ok, errs, len(first_chunk))
    print(f"  {phase} {ok_total}/{len(targets)}", flush=True)

    rest = chunks[1:]
    if not rest:
        elapsed = time.time() - t0
        rate = (ok_total - start_idx) / elapsed if elapsed else 0
        print(f"  {phase} done: {ok_total} ({rate:.1f}/s)", flush=True)
        return ok_total, err_total

    if workers <= 1 or not multiple_supported:
        for abs_end, chunk in rest:
            token_holder.maybe_refresh()
            abs_done, n_ok, errs, _ = run_one(abs_end, chunk)
            ok_total = record_chunk(abs_done, n_ok, errs, len(chunk))
            if ok_total % max(chunk_size, 1) == 0 or abs_done >= len(targets):
                print(f"  {phase} {ok_total}/{len(targets)}", flush=True)
    else:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futs = {pool.submit(run_one, abs_end, chunk): (abs_end, len(chunk)) for abs_end, chunk in rest}
            for fut in as_completed(futs):
                abs_end, chunk_len = futs[fut]
                abs_done, n_ok, errs, _ = fut.result()
                ok_total = record_chunk(abs_done, n_ok, errs, chunk_len)
                print(f"  {phase} prefix={ok_total}/{len(targets)} (chunk @{abs_end})", flush=True)

    elapsed = time.time() - t0
    rate = max(0, ok_total - start_idx) / elapsed if elapsed else 0
    print(f"  {phase} done: {ok_total} ({rate:.1f}/s) errors={err_total}", flush=True)
    log_event(
        "phase_done",
        phase=phase,
        ok=ok_total,
        errors=err_total,
        rate=round(rate, 2),
        workers=workers,
        chunk_size=chunk_size,
    )
    return ok_total, err_total
