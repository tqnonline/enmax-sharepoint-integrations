// Dataverse GUID shape. Used to validate IDs before interpolating them into OData
// filters — an unvalidated id is the data-isolation boundary for owner-scoped queries.
export const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isGuid(value: string | null | undefined): value is string {
  return !!value && GUID_RE.test(value);
}
