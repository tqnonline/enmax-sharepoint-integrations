"""Taxonomy matrix — the single source of truth for reservation type x
document subtype behaviour (docs/drawing-document-subtype-CONTRACT.md).

This fixture is intentionally duplicated (same rows, same shape) in:
  - apps/code-app/src/__tests__/taxonomy/taxonomyMatrix.ts
  - solution/plugins/IssueNumbers.Tests/TaxonomyMatrix.cs
  - solution/scripts/tests/taxonomy_matrix.py (this file)
Keep all three in sync when the taxonomy changes.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TaxonomyMatrixRow:
    reservation_type: int
    document_subtype: int
    label: str
    creates_children: bool
    base_pdf: bool
    library_pair: str  # "Drawing" | "Document"
    existing_allowed: bool
    checkout_default: bool
    append_allowed: bool


TAXONOMY_MATRIX: tuple[TaxonomyMatrixRow, ...] = (
    TaxonomyMatrixRow(
        reservation_type=1,
        document_subtype=1,
        label="Drawing Document",
        creates_children=False,
        base_pdf=True,
        library_pair="Drawing",
        existing_allowed=False,
        checkout_default=True,
        append_allowed=False,
    ),
    TaxonomyMatrixRow(
        reservation_type=1,
        document_subtype=2,
        label="Drawing",
        creates_children=True,
        base_pdf=True,
        library_pair="Drawing",
        existing_allowed=True,
        checkout_default=True,
        append_allowed=True,
    ),
    TaxonomyMatrixRow(
        reservation_type=2,
        document_subtype=3,
        label="Standard",
        creates_children=False,
        base_pdf=True,
        library_pair="Document",
        existing_allowed=False,
        checkout_default=True,
        append_allowed=False,
    ),
    TaxonomyMatrixRow(
        reservation_type=2,
        document_subtype=4,
        label="Procedure",
        creates_children=True,
        base_pdf=True,
        library_pair="Document",
        existing_allowed=False,
        checkout_default=True,
        append_allowed=False,
    ),
    TaxonomyMatrixRow(
        reservation_type=2,
        document_subtype=5,
        label="Form",
        creates_children=True,
        base_pdf=False,
        library_pair="Document",
        existing_allowed=True,
        checkout_default=True,
        append_allowed=True,
    ),
)


def find_row(reservation_type: int, document_subtype: int) -> TaxonomyMatrixRow | None:
    for row in TAXONOMY_MATRIX:
        if row.reservation_type == reservation_type and row.document_subtype == document_subtype:
            return row
    return None
