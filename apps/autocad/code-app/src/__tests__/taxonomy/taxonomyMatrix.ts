/**
 * Taxonomy matrix — the single source of truth for reservation type ×
 * document subtype behaviour (docs/drawing-document-subtype-CONTRACT.md).
 *
 * This fixture is intentionally duplicated (same rows, same shape) in:
 *   - apps/code-app/src/__tests__/taxonomy/taxonomyMatrix.ts (this file)
 *   - solution/plugins/IssueNumbers.Tests/TaxonomyMatrix.cs
 *   - solution/scripts/tests/taxonomy_matrix.py
 * Keep all three in sync when the taxonomy changes.
 */

export type LibraryPair = "Drawing" | "Document";

export interface TaxonomyMatrixRow {
  /** enmax_acdnreservationtype option value. */
  reservationType: number;
  /** enmax_acdndocumentsubtype option value. */
  documentSubtype: number;
  /** Display name, matches the option set label. */
  label: string;
  /** Whether the base record produces numbered child sheets (-SSS) shown in lists. */
  createsChildren: boolean;
  /** Whether a base PDF is generated/expected for the base record itself. */
  basePdf: boolean;
  /** Which SharePoint library pair (Drawing* vs Document*) this subtype uses. */
  libraryPair: LibraryPair;
  /** Whether "Existing" sequence type (append to an existing base) is allowed. */
  existingAllowed: boolean;
  /** Default value of the per-taxonomy checkout enable toggle. */
  checkoutDefault: boolean;
  /** Whether numbered children may be appended to an existing base after creation. */
  appendAllowed: boolean;
}

export const TAXONOMY_MATRIX: readonly TaxonomyMatrixRow[] = [
  {
    reservationType: 1,
    documentSubtype: 1,
    label: "Drawing Document",
    createsChildren: false,
    basePdf: true,
    libraryPair: "Drawing",
    existingAllowed: false,
    checkoutDefault: true,
    appendAllowed: false,
  },
  {
    reservationType: 1,
    documentSubtype: 2,
    label: "Drawing",
    createsChildren: true,
    basePdf: true,
    libraryPair: "Drawing",
    existingAllowed: true,
    checkoutDefault: true,
    appendAllowed: true,
  },
  {
    reservationType: 2,
    documentSubtype: 3,
    label: "Standard",
    createsChildren: false,
    basePdf: true,
    libraryPair: "Document",
    existingAllowed: false,
    checkoutDefault: true,
    appendAllowed: false,
  },
  {
    reservationType: 2,
    documentSubtype: 4,
    label: "Procedure",
    createsChildren: true,
    basePdf: true,
    libraryPair: "Document",
    existingAllowed: false,
    checkoutDefault: true,
    appendAllowed: false,
  },
  {
    reservationType: 2,
    documentSubtype: 5,
    label: "Form",
    createsChildren: true,
    basePdf: false,
    libraryPair: "Document",
    existingAllowed: true,
    checkoutDefault: true,
    appendAllowed: true,
  },
] as const;

export function taxonomyMatrixRow(
  reservationType: number,
  documentSubtype: number,
): TaxonomyMatrixRow | undefined {
  return TAXONOMY_MATRIX.find(
    (row) => row.reservationType === reservationType && row.documentSubtype === documentSubtype,
  );
}
