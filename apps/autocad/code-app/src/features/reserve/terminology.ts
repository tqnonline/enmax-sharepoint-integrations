import type { ReserveForm } from "./schema";

// Dataverse option values for the WS1a taxonomy columns.
export const RESERVATION_TYPE_VALUE = { Drawing: 1, Document: 2 } as const;
export const DOCUMENT_SUBTYPE_VALUE = { Standard: 1, Procedure: 2 } as const;

export interface ReserveTerminology {
  /** Human label for the reservation type, e.g. "Drawing", "Standard Document". */
  typeLabel: string;
  /** Singular base noun, e.g. "drawing", "standard document", "procedure". */
  baseNoun: string;
  /** Plural base noun, e.g. "drawings". */
  baseNounPlural: string;
  /** Child item noun, or null when the type is base-only (Standard). */
  childNoun: string | null;
  /** Whether this type produces child items (-sss). Standard is base-only. */
  createsChildren: boolean;
}

/**
 * Type-aware terminology for the reserve wizard (ADR 0001 #1/#2).
 * - Drawing        -> base "drawing" + child "Drawing Document"
 * - Document/Standard  -> base-only "standard document" (no children)
 * - Document/Procedure -> base "procedure" + child "Procedure Form Document"
 */
export function reserveTerminology(
  reservationType: ReserveForm["reservationType"],
  documentSubtype: ReserveForm["documentSubtype"],
): ReserveTerminology {
  if (reservationType === "Document" && documentSubtype === "Standard") {
    return {
      typeLabel: "Standard Document",
      baseNoun: "standard document",
      baseNounPlural: "standard documents",
      childNoun: null,
      createsChildren: false,
    };
  }
  if (reservationType === "Document" && documentSubtype === "Procedure") {
    return {
      typeLabel: "Procedure",
      baseNoun: "procedure",
      baseNounPlural: "procedures",
      childNoun: "Procedure Form Document",
      createsChildren: true,
    };
  }
  return {
    typeLabel: "Drawing",
    baseNoun: "drawing",
    baseNounPlural: "drawings",
    childNoun: "Drawing Document",
    createsChildren: true,
  };
}
