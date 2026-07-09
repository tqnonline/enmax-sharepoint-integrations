import type { AuditEvent } from "./useDrawingAuditTrail";
import { individualItemLabel } from "../../reserve/numberingTerms";

const VERB: Record<string, (item: string) => string> = {
  Created: (item) => `created the ${item}`,
  "State Changed": () => "changed state",
  "Approval Granted": () => "approved the revision",
  "Approval Denied": () => "declined the revision",
  "Force Checked In": (item) => `force-checked-in the ${item}`,
  Finalized: (item) => `finalized the ${item}`,
};

export interface AuditSentenceContext {
  reservationType?: number | null;
  documentSubtype?: number | null;
}

export function formatAuditSentence(
  ev: AuditEvent,
  context: AuditSentenceContext = {},
): string {
  const who = ev.actedBy || "Someone";
  const item = individualItemLabel(context.reservationType, context.documentSubtype).toLowerCase();
  const verbFn = VERB[ev.eventLabel];
  const verb = verbFn ? verbFn(item) : ev.eventLabel.toLowerCase();
  const transition = ev.fromState && ev.toState ? ` from ${ev.fromState} to ${ev.toState}` : "";
  const when = ev.createdOn ? new Date(ev.createdOn).toLocaleString() : "";
  return `${who} ${verb}${transition}${when ? ` on ${when}` : ""}.`;
}
