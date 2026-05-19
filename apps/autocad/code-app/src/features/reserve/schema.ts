import { z } from "zod";

export const reserveSchema = z.object({
  recordType: z.literal("Drawing"),
  business:   z.string().min(1, "Business required"),
  asset:      z.string().min(1, "Asset required"),
  unit:       z.string().min(1, "Unit required"),
  domain:     z.string().min(1, "Domain required"),
  system:     z.string().min(1, "System required"),
  kind:       z.string().min(1, "Kind required"),
  count:      z.coerce.number().int().min(1, "Count must be at least 1").max(10),
  sheetsPerDrawing: z.coerce.number().int().min(1, "Sheets must be at least 1"),
  sequenceType: z.enum(["New", "Existing"]),
  reason:     z.string().min(10, "Reason must be at least 10 characters").max(2000),
  override:   z.boolean().default(false),
  overrideReason: z.string().max(2000).optional(),
}).refine(
  (data) => !data.override || (data.overrideReason && data.overrideReason.length >= 10),
  { message: "Override justification required (min 10 chars)", path: ["overrideReason"] },
);

export type ReserveForm = z.infer<typeof reserveSchema>;
