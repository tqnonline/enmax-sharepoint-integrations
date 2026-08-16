# ADR-0024: Content-type patching removed from the engine

**Status:** Accepted — a functional regression, documented deliberately
**Date:** 2026-08-10

## Context

The original engine design included a `Patch_Content_Type` step, setting
each copied file's SharePoint content type to `Enmax Document`
(`0x010100C5939496BD3E0F4287FA702FBCF7C0BE`) after upload. This failed
live with a genuine SharePoint 400 error: `"The passed-in field
'ContentType' could not be found."` A follow-up attempt using the
content-type **ID** field instead of the name also failed with the same
class of error (`"ContentTypeId could not be found"` too), ruling out
simple field-name guessing as the cause.

The most likely root cause is a SharePoint library configuration
prerequisite not currently met: "Allow management of content types" not
enabled on the destination library, and/or the `Enmax Document` content
type not actually added to that library's available content types list —
neither of which is fixable from Bicep, the workflow definition, or any
script in this repository.

## Decision

Remove `Patch_Content_Type` (and the temporary diagnostic action
`Diag_Get_Item_Properties`) from `wf-copy-invoices` entirely, rather than
continue investigating the SharePoint-side schema. `On_Copy_Success`'s
success condition was updated to check `Create_File`'s own status
directly instead.

## Consequences

- **Current state: no content type is set by this integration at all.**
  Files land in SharePoint with whatever the destination library's
  default content type is.
- This is a genuine functional regression relative to the originally
  intended design, not a neutral simplification — documented explicitly so
  it isn't mistaken for the original plan if revisited.
- **Reopening condition, if this is ever revisited:** confirm with the
  SharePoint site/library owner that "Allow management of content types"
  is enabled and that the `Enmax Document` content type has been added to
  the destination library's available content types, before attempting to
  re-add `Patch_Content_Type`. The captured SharePoint 400 error response
  bodies are preserved in `PLAN.md`'s evidence log as a starting point.
