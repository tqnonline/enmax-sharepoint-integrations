import { z } from "zod";

// Taxonomy (ADR 0001 #1, docs/drawing-document-subtype-CONTRACT.md): a reservation
// is a Drawing (Drawing Document | Drawing) or a Document (Standard | Procedure |
// Form). Drawing Document and Standard/Procedure are base-only; Drawing and Form
// produce numbered children. The six composition segments are independent
// (ADR 0001 #4): any active value may be chosen for each, with no cascade
// filtering and no Approved-combination gate.
export const reserveSchema = z.object({
  reservationType: z.enum(["Drawing", "Document"]),
  documentSubtype: z.enum(["DrawingDocument", "Drawing", "Standard", "Procedure", "Form"]).optional(),
  business:   z.string().min(1, "Business required"),
  asset:      z.string().min(1, "Asset required"),
  unit:       z.string().min(1, "Unit required"),
  domain:     z.string().min(1, "Domain required"),
  system:     z.string().min(1, "System required"),
  kind:       z.string().min(1, "Kind required"),
  count:      z.coerce.number().int().min(1, "Count must be at least 1").max(999),
  sheetsPerDrawing: z.coerce.number().int().min(1, "Must be at least 1"),
  sequenceType: z.enum(["New", "Existing"]),
  reason:     z.string().min(10, "Reason must be at least 10 characters").max(2000),
}).refine(
  (data) => data.reservationType !== "Drawing"
    || data.documentSubtype === "DrawingDocument"
    || data.documentSubtype === "Drawing",
  { message: "Select Drawing Document or Drawing", path: ["documentSubtype"] },
).refine(
  (data) => data.reservationType !== "Document"
    || data.documentSubtype === "Standard"
    || data.documentSubtype === "Procedure"
    || data.documentSubtype === "Form",
  { message: "Select Standard, Procedure, or Form", path: ["documentSubtype"] },
);

export type ReserveForm = z.infer<typeof reserveSchema>;
