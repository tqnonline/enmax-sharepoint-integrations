/**
 * Formerly surfaced a "No PDF linked yet" warning on document detail.
 * Product decision: do not show that banner — keep this stub so any leftover
 * imports compile until call sites are fully cleaned up.
 */
export function SharePointLinkStatus(props: {
  presentInDropOff?: boolean;
  presentInDestination?: boolean;
  recordNumber?: string;
}): null {
  void props; // deliberate stub: props kept for call-site compatibility
  return null;
}
