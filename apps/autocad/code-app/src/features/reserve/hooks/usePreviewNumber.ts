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
  const b  = s.businessCode || "??";
  const a  = s.assetCode    || "??";
  const u  = s.unitCode     || "??";
  const d  = s.domainCode   || "???";
  const sy = s.systemCode   || "???";
  const k  = s.kindCode     || "??";
  return `${b}-${a}-${u}-${d}-${sy}-${k}-????`;
}

export const SEQUENCE_TOOLTIP = "Sequence number assigned at admin approval.";
