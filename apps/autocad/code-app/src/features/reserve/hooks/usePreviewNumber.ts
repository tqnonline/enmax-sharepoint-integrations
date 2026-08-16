export interface PreviewSegments {
  businessCode: string;
  assetCode:    string;
  unitCode:     string;
  domainCode:   string;
  systemCode:   string;
  kindCode:     string;
}

export function buildPreviewNumber(segments: Partial<PreviewSegments>): string {
  const s = segments;
  const b  = s.businessCode || "BB";
  const a  = s.assetCode    || "AA";
  const u  = s.unitCode     || "UU";
  const d  = s.domainCode   || "DDD";
  const sy = s.systemCode   || "SSS";
  const k  = s.kindCode     || "KK";
  return `${b}-${a}-${u}-${d}-${sy}-${k}-????`;
}

export const SEQUENCE_TOOLTIP = "Sequence number assigned at admin approval.";
