# Drawing Document subtype — implementer contract

Work ONLY in this worktree. Branch: `feat/drawing-document-subtype`.

## Locked values

### Reservation type (`enmax_acdnreservationtype`)
- 0 None, 1 Drawing, 2 Document

### Document subtype (`enmax_acdndocumentsubtype`)
- 0 None
- 1 Drawing Document — type Drawing, base-only + singleton sheet, New only, Drawing* SP libs, checkout ON
- 2 Drawing — type Drawing, numbered children, New+Existing, Drawing* SP libs
- 3 Standard Document — type Document, base-only, Document* SP libs
- 4 Procedure — type Document, base-only, Document* SP libs
- 5 Form — type Document, numbered children, Existing only, Document* SP libs

### SharePoint App Config (two pairs only)
- `DrawingDropOffLibraryUrl` / `DrawingDestinationLibraryUrl` — type Drawing (incl. Drawing Document)
- `DocumentDropOffLibraryUrl` / `DocumentDestinationLibraryUrl` — type Document (Standard/Procedure/Form)
- Fallback OK: legacy `Drawings*` / `Documents*` / old StandardDocument* keys during cutover
- Kind CSVs (indexer only): `StandardDocumentKindCodes`, `ProcedureDocumentKindCodes`
- `AllowDrawingDocumentExistingSequence=false`
- `EnableDrawingDocumentCheckout` / `EnableDrawingDocumentCheckIn` default true

### Migration map
- Form 3→5, Procedure 2→4, Standard 1→3, Drawing type null/0 → subtype 2
- Tables: reservation, drawing, sheet

## Rules
- Rule 14: never issue numbers from client
- Rule 15: App Config only
- Surgical diffs; match existing style
- Commit when a coherent slice is green (user has authorized feature work; commit on this feature branch)
- Run tests for your slice; zero failures before commit
