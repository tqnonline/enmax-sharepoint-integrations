"""Unit tests for UpsertMultiple classify + contiguous checkpoint helpers."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS))

from dv_upsert_batch import (  # noqa: E402
    classify_upsert_multiple_response,
    contiguous_checkpoint,
)


@pytest.mark.parametrize(
    "status,body,expected",
    [
        (204, "", "ok"),
        (200, "{}", "ok"),
        (404, "Not Found", "unsupported"),
        (501, "Not Implemented", "unsupported"),
        (400, "UpsertMultiple is not supported", "unsupported"),
        (400, "error 0x80060890 DoesNotExist", "unsupported"),
        (400, "Resource not found for the segment", "unsupported"),
        (400, "not a defined key for this entity", "unsupported"),
        (429, "throttled", "retry"),
        (413, "payload too large", "split"),
        (500, "internal", "split"),
        (502, "bad gateway", "split"),
        (504, "gateway timeout", "split"),
        (400, "validation failed on field X", "fail"),
        (403, "forbidden", "fail"),
    ],
)
def test_classify_upsert_multiple_response(status: int, body: str, expected: str):
    assert classify_upsert_multiple_response(status, body) == expected


def test_contiguous_checkpoint_ignores_out_of_order_completion():
    """If a later chunk finishes first, prefix stays at start until earlier ends land."""
    ordered = [500, 1000, 1500]
    assert contiguous_checkpoint(0, ordered, {1500}) == 0
    assert contiguous_checkpoint(0, ordered, {1500, 500}) == 500
    assert contiguous_checkpoint(0, ordered, {500, 1000, 1500}) == 1500
    assert contiguous_checkpoint(200, ordered, {500}) == 500


def test_contiguous_checkpoint_resume_mid_list():
    # start_idx=1000 means first 1000 already done; new ends are absolute
    ordered = [1500, 2000, 2500]
    assert contiguous_checkpoint(1000, ordered, {2000}) == 1000
    assert contiguous_checkpoint(1000, ordered, {1500, 2000}) == 2000
