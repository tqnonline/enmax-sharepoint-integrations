"""Cross-checks the Python taxonomy matrix fixture against the seeded
enmax_acdn_documentsubtype option set YAML, and documents the expected
TS (apps/code-app/src/features/reserve/terminology.ts DOCUMENT_SUBTYPE_VALUE)
and C# (solution/plugins/IssueNumbers/TaxonomyConstants.cs) integer mapping
that the other two taxonomy_matrix fixtures must also honour.

See docs/drawing-document-subtype-CONTRACT.md for the locked values.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
SCRIPTS = REPO_ROOT / "solution" / "scripts"
SEED_DIR = REPO_ROOT / "solution" / "seed"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from taxonomy_matrix import TAXONOMY_MATRIX, find_row  # noqa: E402

# Locked TS (DOCUMENT_SUBTYPE_VALUE) / C# (TaxonomyConstants.DocumentSubtype) ints.
# Both fixtures must use these exact values for the matrix to be considered in sync.
EXPECTED_DOCUMENT_SUBTYPE_INTS = {
    "DrawingDocument": 1,
    "Drawing": 2,
    "Standard": 3,
    "Procedure": 4,
    "Form": 5,
}
EXPECTED_RESERVATION_TYPE_INTS = {"Drawing": 1, "Document": 2}

_LABEL_TO_SUBTYPE_KEY = {
    "Drawing Document": "DrawingDocument",
    "Drawing": "Drawing",
    "Standard": "Standard",
    "Procedure": "Procedure",
    "Form": "Form",
}


def _load_optionset_yaml() -> dict:
    path = SEED_DIR / "option_sets" / "document_subtype.yaml"
    with path.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def test_matrix_has_one_row_per_expected_subtype() -> None:
    subtypes = sorted(row.document_subtype for row in TAXONOMY_MATRIX)
    assert subtypes == sorted(EXPECTED_DOCUMENT_SUBTYPE_INTS.values())


def test_matrix_rows_use_locked_reservation_type_ints() -> None:
    for row in TAXONOMY_MATRIX:
        assert row.reservation_type in EXPECTED_RESERVATION_TYPE_INTS.values()


@pytest.mark.parametrize(
    ("label", "expected_key"),
    sorted(_LABEL_TO_SUBTYPE_KEY.items()),
)
def test_matrix_labels_map_to_expected_ts_cs_ints(label: str, expected_key: str) -> None:
    row = next(r for r in TAXONOMY_MATRIX if r.label == label)
    assert row.document_subtype == EXPECTED_DOCUMENT_SUBTYPE_INTS[expected_key]


def test_matrix_matches_seeded_optionset_values_and_labels() -> None:
    optionset = _load_optionset_yaml()
    values_by_label = {entry["label"]: entry["value"] for entry in optionset["values"]}

    for row in TAXONOMY_MATRIX:
        assert row.label in values_by_label, f"{row.label!r} missing from document_subtype.yaml"
        assert values_by_label[row.label] == row.document_subtype, (
            f"{row.label!r}: optionset value {values_by_label[row.label]} != "
            f"matrix document_subtype {row.document_subtype}"
        )

    # None (0) is the only optionset value with no matrix row.
    assert set(values_by_label.values()) - {row.document_subtype for row in TAXONOMY_MATRIX} == {0}


def test_drawing_procedure_and_form_create_children_existing_only_for_drawing_and_form() -> None:
    for row in TAXONOMY_MATRIX:
        creates_children = row.document_subtype in (
            EXPECTED_DOCUMENT_SUBTYPE_INTS["Drawing"],
            EXPECTED_DOCUMENT_SUBTYPE_INTS["Procedure"],
            EXPECTED_DOCUMENT_SUBTYPE_INTS["Form"],
        )
        existing_or_append = row.document_subtype in (
            EXPECTED_DOCUMENT_SUBTYPE_INTS["Drawing"],
            EXPECTED_DOCUMENT_SUBTYPE_INTS["Form"],
        )
        assert row.creates_children is creates_children
        assert row.existing_allowed is existing_or_append
        assert row.append_allowed is existing_or_append


def test_drawing_document_is_base_only_new_sequence_only_drawing_library() -> None:
    row = find_row(EXPECTED_RESERVATION_TYPE_INTS["Drawing"], EXPECTED_DOCUMENT_SUBTYPE_INTS["DrawingDocument"])
    assert row is not None
    assert row.creates_children is False
    assert row.existing_allowed is False
    assert row.library_pair == "Drawing"
    assert row.checkout_default is True


def test_document_type_subtypes_use_document_library_pair() -> None:
    for row in TAXONOMY_MATRIX:
        if row.reservation_type == EXPECTED_RESERVATION_TYPE_INTS["Document"]:
            assert row.library_pair == "Document"
