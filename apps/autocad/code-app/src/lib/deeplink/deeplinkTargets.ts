// Deep-link capability for the Power Apps Code App.
//
// The Power Apps player runs the Code App inside an iframe and normalizes the
// outer URL to `?<params>#` (empty hash) on launch, so an inbound hash route
// (e.g. `#/reservations/{id}`) is dropped before the app ever sees it. The
// supported channel is query-string parameters, surfaced via
// `getContext().app.queryParams`. This module is the single contract between the
// external link (email / share button) and the internal hash route:
//
//   external:  {CodeAppBaseUrl}?target=<key>&id=<guid>[&section=<tab>]
//   internal:  /reservations/{guid}  (navigated to on boot)
//
// To make a new page deep-linkable, add one entry to DEEP_LINK_TARGETS.

export type DeepLinkTargetKey = "reservation" | "approvals" | "document" | "myitems";

export interface DeepLinkParams {
  id?: string;
  section?: string;
  tab?: string;
}

// Each builder returns the internal (hash-router) path, or null when a required
// parameter is missing so a malformed link degrades to "no redirect" rather than
// navigating to a broken route.
type PathBuilder = (params: DeepLinkParams) => string | null;

function withQuery(path: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

export const DEEP_LINK_TARGETS: Record<DeepLinkTargetKey, PathBuilder> = {
  reservation: ({ id }) => (id ? `/reservations/${id}` : null),
  approvals: ({ section, tab }) => withQuery("/approvals", { section, tab }),
  document: ({ id }) => (id ? `/search/documents/${id}` : null),
  myitems: () => "/my-items",
};

function isTargetKey(value: string | undefined): value is DeepLinkTargetKey {
  return !!value && Object.prototype.hasOwnProperty.call(DEEP_LINK_TARGETS, value);
}

/**
 * Map inbound query parameters to an internal route path. Pure and total: any
 * unknown/missing target or missing required param yields null (no redirect).
 */
export function resolveDeepLink(
  queryParams: Record<string, string> | null | undefined,
): string | null {
  if (!queryParams) return null;
  const target = queryParams.target;
  if (!isTargetKey(target)) return null;
  return DEEP_LINK_TARGETS[target]({
    id: queryParams.id || undefined,
    section: queryParams.section || undefined,
    tab: queryParams.tab || undefined,
  });
}

/**
 * Build the external deep-link URL for an app-generated share link. `baseUrl` is
 * the player URL up to (and optionally including) an existing query string; the
 * separator is chosen accordingly so a base that already carries `?tenantId=...`
 * is extended with `&`.
 */
export function buildDeepLinkUrl(
  baseUrl: string,
  target: DeepLinkTargetKey,
  params: DeepLinkParams = {},
): string {
  const search = new URLSearchParams({ target });
  if (params.id) search.set("id", params.id);
  if (params.section) search.set("section", params.section);
  if (params.tab) search.set("tab", params.tab);
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}${search.toString()}`;
}
