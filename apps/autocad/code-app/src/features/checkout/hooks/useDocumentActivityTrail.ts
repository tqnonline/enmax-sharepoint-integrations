import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAuditEventsForSubjects,
  type AuditEvent,
} from "./useDrawingAuditTrail";
import { lifecycleStepLabel } from "./auditSentence";

export interface DocumentActivityTrailOptions {
  sheetIds?: string[];
  focusedSheetId?: string;
  /** Reservation GUID — approval/created events are keyed to the reservation, not the drawing. */
  reservationId?: string;
  /** Drawing createdon — used to synthesize Allocated when issuance audit is missing (e.g. imports). */
  drawingCreatedOn?: string;
  /** Display name for synthetic Allocated (approver → submitter). */
  allocatedByName?: string;
}

function hasIssuanceEvent(events: AuditEvent[]): boolean {
  return events.some((ev) => {
    const step = lifecycleStepLabel(ev);
    return step === "Allocated" || step === "Issued";
  });
}

/**
 * When AutoCreate Allocated was never written (SharePoint import, older data), still show
 * issuance on Procedure/Standard/Drawing detail so Activity is not blank.
 */
export function ensureIssuanceActivity(
  events: AuditEvent[],
  opts: { drawingId: string; createdOn?: string; actedBy?: string },
): AuditEvent[] {
  if (!opts.drawingId || !opts.createdOn || hasIssuanceEvent(events)) return events;
  const synthetic: AuditEvent = {
    id: `synthetic-allocated-${opts.drawingId}`,
    event: 1,
    createdOn: opts.createdOn,
    eventLabel: "Created",
    actedBy: opts.actedBy ?? "",
    reason: "",
    fromState: "",
    toState: "Allocated",
  };
  return [...events, synthetic].sort((a, b) =>
    (b.createdOn ?? "").localeCompare(a.createdOn ?? ""),
  );
}

/**
 * Loads audit events for a document detail view: parent drawing, child sheets,
 * and the parent reservation (approval/created). Synthesizes Allocated when missing.
 */
export function useDocumentActivityTrail(
  drawingId?: string,
  options?: DocumentActivityTrailOptions,
) {
  const focusedSheetId = options?.focusedSheetId;
  const sheetIds = options?.sheetIds;
  const reservationId = options?.reservationId;
  const drawingCreatedOn = options?.drawingCreatedOn;
  const allocatedByName = options?.allocatedByName;

  const subjectIds = useMemo(() => {
    const ids = new Set<string>();
    if (drawingId) ids.add(drawingId);
    if (focusedSheetId) ids.add(focusedSheetId);
    if (reservationId) ids.add(reservationId);
    sheetIds?.forEach((id) => ids.add(id));
    return [...ids];
  }, [drawingId, focusedSheetId, reservationId, sheetIds]);

  const queryKey = useMemo(
    () => ["document-activity", ...[...subjectIds].map((id) => id.toLowerCase()).sort(), drawingCreatedOn ?? ""],
    [subjectIds, drawingCreatedOn],
  );

  return useQuery<AuditEvent[]>({
    queryKey,
    enabled: subjectIds.length > 0,
    staleTime: 60_000,
    throwOnError: false,
    queryFn: async () => {
      const events = await fetchAuditEventsForSubjects(subjectIds);
      if (!drawingId) return events;
      return ensureIssuanceActivity(events, {
        drawingId,
        createdOn: drawingCreatedOn,
        actedBy: allocatedByName,
      });
    },
  });
}
