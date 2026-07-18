"""Tests for _is_base_only_document (docs/drawing-document-subtype-CONTRACT.md).

index_sharepoint_dropoff.py and seed_sharepoint_placeholders_dev.py both import
this helper to decide whether a record's PDF lives on the base record or on
numbered child sheets; it must track the new subtype integers exactly.
"""
from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS))

import seed_sharepoint_placeholders_dev as seedsp  # noqa: E402


def test_drawing_document_is_base_only() -> None:
    assert seedsp._is_base_only_document(1, 1) is True


def test_drawing_is_not_base_only() -> None:
    assert seedsp._is_base_only_document(1, 2) is False


def test_standard_document_is_base_only() -> None:
    assert seedsp._is_base_only_document(2, 3) is True


def test_procedure_is_base_only() -> None:
    assert seedsp._is_base_only_document(2, 4) is True


def test_form_is_not_base_only() -> None:
    # Form (5) creates numbered children just like Drawing — unlike Standard/
    # Procedure it must NOT be treated as base-only.
    assert seedsp._is_base_only_document(2, 5) is False


def test_unknown_or_missing_values_are_not_base_only() -> None:
    assert seedsp._is_base_only_document(None, None) is False
    assert seedsp._is_base_only_document(2, None) is False
