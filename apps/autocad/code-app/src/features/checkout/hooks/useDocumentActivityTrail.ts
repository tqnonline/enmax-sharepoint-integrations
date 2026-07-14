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
  const subjectIds = useMemo(() => {
    const ids = new Set<string>();
    if (drawingId) ids.add(drawingId);
    options?.focusedSheetId && ids.add(options.focusedSheetId);
    options?.sheetIds?.forEach((id) => ids.add(id));
    return [...ids];
  }, [drawingId, options?.focusedSheetId, options?.sheetIds]);

  return useDrawingAuditTrail(subjectIds);
}
