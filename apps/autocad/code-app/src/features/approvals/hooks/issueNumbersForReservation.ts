import {
  assertCompleteComposition,
  fetchReservationComposition,
  type ReservationComposition,
} from "../compositionFromReservation";
import { issueNumbers } from "../../reserve/api/issueNumbersClient";

export interface IssueNumbersReservationInput {
  reservationId: string;
  businessCode?: string;
  assetCode?: string;
  unitCode?: string;
  domainCode?: string;
  systemCode?: string;
  kindCode?: string;
  drawingCount?: number;
}

function compositionFromInput(input: IssueNumbersReservationInput): ReservationComposition | null {
  const {
    businessCode, assetCode, unitCode, domainCode, systemCode, kindCode, drawingCount,
  } = input;
  if (!businessCode || !assetCode || !unitCode || !domainCode || !systemCode || !kindCode) {
    return null;
  }
  return {
    businessCode,
    assetCode,
    unitCode,
    domainCode,
    systemCode,
    kindCode,
    drawingCount: drawingCount ?? 0,
  };
}

/** Issue base numbers and stamp enmax_acdnissuednumbers (triggers AutoCreateDrawings). */
export async function issueNumbersForReservation(input: IssueNumbersReservationInput): Promise<void> {
  const fromInput = compositionFromInput(input);
  const composition = fromInput ?? await fetchReservationComposition(input.reservationId);
  assertCompleteComposition(composition);

  await issueNumbers({
    reservationId: input.reservationId,
    count:           composition.drawingCount,
    businessCode:    composition.businessCode,
    assetCode:       composition.assetCode,
    unitCode:        composition.unitCode,
    domainCode:      composition.domainCode,
    systemCode:      composition.systemCode,
    kindCode:        composition.kindCode,
  });
}
