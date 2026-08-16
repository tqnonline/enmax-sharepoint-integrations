/**
 * Parses the enmax_acdnissuednumbers JSON array and returns a zero-padded range
 * string like "0001 to 0005" (Heather: NNNN to YYYY), or "????" when not issued.
 */
import { formatBaseSequenceRange, formatNumberingGroup } from "../reserve/numberingTerms";

export function formatNumberRange(issuedNumbers: string | undefined | null): string {
  if (!issuedNumbers) return "????";
  try {
    const nums: number[] = JSON.parse(issuedNumbers);
    if (!Array.isArray(nums) || nums.length === 0) return "????";
    const first = nums[0];
    const last = nums[nums.length - 1];
    return formatBaseSequenceRange(first, last);
  } catch {
    return "????";
  }
}

/** enmax_acdnsequencetype option value for append-to-existing. */
export const SEQUENCE_TYPE_EXISTING = 2;

export function isAppendReservation(parts: {
  sequenceType?: number | null;
  targetDrawingId?: string | null;
}): boolean {
  return parts.sequenceType === SEQUENCE_TYPE_EXISTING && !!parts.targetDrawingId;
}

/** True when base numbers or appended child range have been recorded. */
export function reservationIssuanceComplete(parts: {
  enmax_acdnissuednumbers?: string | null;
  appendFirst?: number | null;
  appendLast?: number | null;
}): boolean {
  if (parts.enmax_acdnissuednumbers) return true;
  return parts.appendFirst != null && parts.appendLast != null;
}

/** Formats 3-digit child suffix range (-sss), e.g. "012" or "012–014". */
export function formatChildSuffixRange(first: number, last: number): string {
  const pad = (n: number) => String(n).padStart(3, "0");
  return first === last ? pad(first) : `${pad(first)}–${pad(last)}`;
}

/** Full drawing/document number for an append reservation, e.g. BASE-012–014. */
export function formatAppendDisplay(
  targetDrawingNumber: string | undefined | null,
  appendFirst?: number | null,
  appendLast?: number | null,
): string {
  if (!targetDrawingNumber) return "";
  if (appendFirst == null || appendLast == null) {
    return `${targetDrawingNumber}-???`;
  }
  return `${targetDrawingNumber}-${formatChildSuffixRange(appendFirst, appendLast)}`;
}

interface CompositionParts {
  businessCode?: string;
  assetCode?:    string;
  unitCode?:     string;
  domainCode?:   string;
  systemCode?:   string;
  kindCode?:     string;
  enmax_acdnissuednumbers?: string | null;
}

export interface ReservationDisplayParts extends CompositionParts {
  sequenceType?: number | null;
  targetDrawingId?: string | null;
  targetDrawingNumber?: string | null;
  appendFirst?: number | null;
  appendLast?: number | null;
}

export function formatComposition(parts: CompositionParts): string {
  const { businessCode, assetCode, unitCode, domainCode, systemCode, kindCode, enmax_acdnissuednumbers } = parts;
  const group = formatNumberingGroup({
    businessCode,
    assetCode,
    unitCode,
    domainCode,
    systemCode,
    kindCode,
  });
  const numberPart = formatNumberRange(enmax_acdnissuednumbers);
  return `${group}-${numberPart}`;
}

/** User-facing reservation number (new base issue or append-to-existing). */
export function formatReservationDisplay(parts: ReservationDisplayParts): string {
  if (isAppendReservation(parts)) {
    const append = formatAppendDisplay(
      parts.targetDrawingNumber,
      parts.appendFirst,
      parts.appendLast,
    );
    if (append) return append;
  }
  return formatComposition(parts);
}

/** Status suffix when approved but issuance/append has not completed. */
export function reservationAwaitingIssuanceLabel(parts: ReservationDisplayParts): string {
  return isAppendReservation(parts) ? "Approved — awaiting items" : "Approved — awaiting numbers";
}
