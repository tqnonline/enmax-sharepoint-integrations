import { useMemo } from "react";
import { useDrawingAuditTrail } from "./useDrawingAuditTrail";

/**
 * Loads audit events for a document detail view: parent drawing plus any child
 * sheets (checkout/check-in events are keyed to sheet IDs; issuance is on the drawing).
 */
export function useDocumentActivityTrail(
  drawingId?: string,
  options?: { sheetIds?: string[]; focusedSheetId?: string },
) {
  const focusedSheetId = options?.focusedSheetId;
  const sheetIds = options?.sheetIds;

  const subjectIds = useMemo(() => {
    const ids = new Set<string>();
    if (drawingId) ids.add(drawingId);
    if (focusedSheetId) ids.add(focusedSheetId);
    sheetIds?.forEach((id) => ids.add(id));
    return [...ids];
  }, [drawingId, focusedSheetId, sheetIds]);

  return useDrawingAuditTrail(subjectIds);
}
