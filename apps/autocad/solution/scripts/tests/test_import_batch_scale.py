"""Unit tests for import --batch-scale parsing and chunk sizing."""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

SCRIPTS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS))

from import_legacy_coded_pdfs import (  # noqa: E402
    ALLOWED_BATCH_SCALES,
    chunk_size_for_scale,
    max_merge_sequence_seed,
    parse_batch_scale,
    sequence_seeds_from_rows,
)


def test_allowed_scales_map_to_rows():
    assert chunk_size_for_scale(1) == 500
    assert chunk_size_for_scale(1.5) == 750
    assert chunk_size_for_scale(2) == 1000
    assert chunk_size_for_scale(2.5) == 1250
    assert chunk_size_for_scale(3) == 1500
    assert chunk_size_for_scale(3.5) == 1750
    assert chunk_size_for_scale(4) == 2000


def test_parse_accepts_x_suffix():
    assert parse_batch_scale("2") == 2.0
    assert parse_batch_scale("2x") == 2.0
    assert parse_batch_scale("1.5X") == 1.5


def test_parse_rejects_invalid():
    with pytest.raises(ValueError):
        parse_batch_scale("5")
    with pytest.raises(ValueError):
        parse_batch_scale("1.2")


def test_allowed_batch_scales_frozen():
    assert ALLOWED_BATCH_SCALES == frozenset({1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0})


def test_sequence_seeds_from_rows_uses_max_nnnn_per_family():
    rows = [
        SimpleNamespace(coding="AA-BB-00-DDD-SYS-KN", sequence_family="DRW", nnnn=10),
        SimpleNamespace(coding="AA-BB-00-DDD-SYS-KN", sequence_family="DRW", nnnn=42),
        SimpleNamespace(coding="AA-BB-00-DDD-SYS-KN", sequence_family="STD", nnnn=3),
        SimpleNamespace(coding="ZZ-ZZ-00-DDD-SYS-KN", sequence_family="", nnnn=99),
    ]
    assert sequence_seeds_from_rows(rows) == {
        "AA-BB-00-DDD-SYS-KN|DRW": 42,
        "AA-BB-00-DDD-SYS-KN|STD": 3,
    }


def test_max_merge_sequence_seed_keeps_higher_partitioned_live():
    live = {"AA|DRW": 100, "AA": 50}
    assert max_merge_sequence_seed("AA|DRW", 40, live) == 100


def test_max_merge_sequence_seed_considers_legacy_coding_for_drw():
    """Import without purge must not seed coding|DRW below pre-partition high-water."""
    live = {"AA-BB-00-DDD-SYS-KN": 900}
    assert max_merge_sequence_seed("AA-BB-00-DDD-SYS-KN|DRW", 42, live) == 900


def test_max_merge_sequence_seed_ignores_legacy_coding_for_non_drw():
    live = {"AA-BB-00-DDD-SYS-KN": 900, "AA-BB-00-DDD-SYS-KN|STD": 3}
    assert max_merge_sequence_seed("AA-BB-00-DDD-SYS-KN|STD", 42, live) == 42
    assert max_merge_sequence_seed("AA-BB-00-DDD-SYS-KN|STD", 1, live) == 3


def test_max_merge_sequence_seed_prefers_import_seed_when_highest():
    live = {"AA|DRW": 10, "AA": 20}
    assert max_merge_sequence_seed("AA|DRW", 50, live) == 50
