import type { AuditEvent } from "./useDrawingAuditTrail";

const VERB: Record<string, string> = {
  "Created": "created the drawing",
  "State Changed": "changed state",
  "Approval Granted": "approved the revision",
  "Approval Denied": "declined the revision",
  "Force Checked In": "force-checked-in the drawing",
  "Finalized": "finalized the drawing",
};

export function formatAuditSentence(ev: AuditEvent): string {
  const who = ev.actedBy || "Someone";
  const verb = VERB[ev.eventLabel] ?? ev.eventLabel.toLowerCase();
  const transition = ev.fromState && ev.toState ? ` from ${ev.fromState} to ${ev.toState}` : "";
  const when = ev.createdOn ? new Date(ev.createdOn).toLocaleString() : "";
  return `${who} ${verb}${transition}${when ? ` on ${when}` : ""}.`;
}
