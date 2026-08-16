"""Shared taxonomy predicates for Heather document subtypes.

Single Python home for base-only / child-producing rules used by the SharePoint
indexer and placeholder seeder (docs/drawing-document-subtype-CONTRACT.md).
"""
from __future__ import annotations

RESERVATION_TYPE_DRAWING = 1
RESERVATION_TYPE_DOCUMENT = 2

DOCUMENT_SUBTYPE_DRAWING_DOCUMENT = 1
DOCUMENT_SUBTYPE_DRAWING = 2
DOCUMENT_SUBTYPE_STANDARD = 3
DOCUMENT_SUBTYPE_PROCEDURE = 4
DOCUMENT_SUBTYPE_FORM = 5

# SharePoint Record Type choice labels → stub Taxonomy strings (CreateSharePointImportStub).
RECORD_TYPE_LABEL_TO_TAXONOMY: dict[str, str] = {
    "Drawing Number": "Drawing",
    "Drawing Document": "DrawingDocument",
    "Standard Document": "Standard",
    "Procedure": "Procedure",
    "Form": "Form",
}


def normalize_document_subtype(
    reservation_type: int | None,
    document_subtype: int | None,
) -> int | None:
    """Dual-read pre-Heather Document ints (Standard=1, Procedure=2)."""
    if reservation_type != RESERVATION_TYPE_DOCUMENT or document_subtype is None:
        return document_subtype
    if document_subtype == 1:
        return DOCUMENT_SUBTYPE_STANDARD
    if document_subtype == 2:
        return DOCUMENT_SUBTYPE_PROCEDURE
    return document_subtype


def is_base_only_document(rtype: int | None, stype: int | None) -> bool:
    """Drawing Document / Standard / Procedure carry the PDF on the base record."""
    stype = normalize_document_subtype(rtype, stype)
    if rtype == RESERVATION_TYPE_DRAWING:
        return stype == DOCUMENT_SUBTYPE_DRAWING_DOCUMENT
    if rtype == RESERVATION_TYPE_DOCUMENT:
        return stype in (DOCUMENT_SUBTYPE_STANDARD, DOCUMENT_SUBTYPE_PROCEDURE)
    return False


def creates_child_items(rtype: int | None, stype: int | None) -> bool:
    """Drawing (numbered) and Form produce -SSS children."""
    stype = normalize_document_subtype(rtype, stype)
    if rtype == RESERVATION_TYPE_DOCUMENT:
        return stype == DOCUMENT_SUBTYPE_FORM
    if rtype == RESERVATION_TYPE_DRAWING:
        return stype != DOCUMENT_SUBTYPE_DRAWING_DOCUMENT
    return True


def taxonomy_label_from_record_type(record_type_sp: str, record_type_map: dict[str, str]) -> str | None:
    """Map a SharePoint Record Type label via App Config (or built-in defaults)."""
    label = (record_type_sp or "").strip()
    if not label:
        return None
    mapped = (record_type_map.get(label) or RECORD_TYPE_LABEL_TO_TAXONOMY.get(label) or "").strip()
    return mapped or None
