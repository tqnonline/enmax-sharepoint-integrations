import type { AuditEvent } from "./useDrawingAuditTrail";
import { individualItemLabel } from "../../reserve/numberingTerms";

const LIFECYCLE_BY_TRANSITION: Record<string, string> = {
  "Available→CheckoutRequested": "Check-out requested",
  "Available→CheckedOut": "Checked out",
  "CheckoutRequested→CheckedOut": "Checked out",
  "CheckoutRequested→Available": "Check-out declined",
  "CheckedOut→AwaitingValidation": "Check-in requested",
  "CheckedOut→Available": "Checked in",
  "AwaitingValidation→Available": "Checked in",
  "AwaitingValidation→CheckedOut": "Check-in declined",
};

/** User-facing lifecycle step for timeline badges. */
export function lifecycleStepLabel(ev: AuditEvent): string {
  if (ev.eventLabel === "Created") {
    if (ev.toState === "Allocated") return "Allocated";
    return "Issued";
  }
  if (ev.eventLabel === "Approval Granted") {
    const key = `${ev.fromState}→${ev.toState}`;
    if (key === "CheckoutRequested→CheckedOut") return "Checked out";
    if (key === "AwaitingValidation→Available") return "Checked in";
    return "Approved";
  }
  if (ev.eventLabel === "Approval Denied") return "Declined";
  if (ev.eventLabel === "Force Checked In") return "Force checked in";
  if (ev.eventLabel === "Finalized") return "Finalized";

  const transition = `${ev.fromState}→${ev.toState}`;
  return LIFECYCLE_BY_TRANSITION[transition] ?? ev.eventLabel;
}

function lifecycleVerb(ev: AuditEvent, item: string): string | null {
  const step = lifecycleStepLabel(ev);
  switch (step) {
    case "Allocated":
      return `allocated the ${item}`;
    case "Issued":
      return `issued the ${item}`;
    case "Check-out requested":
      return `requested check-out for the ${item}`;
    case "Checked out":
      return `checked out the ${item}`;
    case "Check-out declined":
      return `declined check-out for the ${item}`;
    case "Check-in requested":
      return `requested check-in for the ${item}`;
    case "Checked in":
      return `checked in the ${item}`;
    case "Check-in declined":
      return `declined check-in for the ${item}`;
    case "Force checked in":
      return `force-checked-in the ${item}`;
    case "Finalized":
      return `finalized the ${item}`;
    case "Approved":
      return `approved the ${item}`;
    case "Declined":
      return `declined the ${item}`;
    default:
      return null;
  }
}

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
  const lifecycle = lifecycleVerb(ev, item);
  const verb = lifecycle ?? `${ev.eventLabel.toLowerCase()} the ${item}`;
  const when = ev.createdOn ? new Date(ev.createdOn).toLocaleString() : "";
  return `${who} ${verb}${when ? ` on ${when}` : ""}.`;
}

/**
 * Issuance historically wrote Allocated once per sheet plus the parent drawing.
 * Document/form detail should show a single Allocated step.
 */
export function collapseDuplicateAllocated(events: AuditEvent[]): AuditEvent[] {
  const allocated = events.filter((ev) => lifecycleStepLabel(ev) === "Allocated");
  if (allocated.length <= 1) return events;
  const keep = allocated.reduce((earliest, ev) => {
    const a = earliest.createdOn ? new Date(earliest.createdOn).getTime() : Number.POSITIVE_INFINITY;
    const b = ev.createdOn ? new Date(ev.createdOn).getTime() : Number.POSITIVE_INFINITY;
    return b < a ? ev : earliest;
  });
  return events.filter((ev) => lifecycleStepLabel(ev) !== "Allocated" || ev.id === keep.id);
}
