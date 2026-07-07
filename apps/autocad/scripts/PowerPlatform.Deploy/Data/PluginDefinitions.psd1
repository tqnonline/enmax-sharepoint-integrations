#
# PluginDefinitions.psd1
# Project-specific Custom API and plugin step definitions for the Enmax AutoCAD solution.
# Loaded via Import-PowerShellDataFile by Register-PpPlugins.
#
# CustomAPI bindingtype:           0=Global  1=Entity  2=EntityCollection
# CustomAPIRequestParameter type:  5=EntityReference  7=Integer  9=Picklist  10=String
# CustomAPIResponseProperty type:  same codes
# PluginStep stage:                20=PreOperation  40=PostOperation
# PluginStep mode:                 0=Synchronous  1=Asynchronous
#
# Entity-bound APIs (bindingtype=1) receive Target automatically from the
# URL segment — do NOT register Target as an explicit request parameter.
#
# NOTE: [ordered]@{} is NOT valid in .psd1 data files. All ordered dicts are
# converted to plain @{} — key lookup by name is used everywhere, order is irrelevant.

@{
    CustomAPIDefs = @(

        # ── Global: IssueNumbers ──────────────────────────────────────────────
        @{
            UniqueName  = "enmax_acdnIssueNumbers"
            DisplayName = "Issue ENMAX Numbers"
            Description = "Concurrency-safe issuance of sequential drawing numbers (Rule 14). Atomically reserves the next Count (1-1000) numbers for the Business-Asset-Unit-Domain-System-Kind sequence with optimistic locking. If a Reservation is supplied, writes them onto it to trigger drawing creation. Approver/Admin only."
            PluginClass = "Enmax.AutoCAD.IssueNumbersPlugin"
            BindingType = 0
            BoundEntity = $null
            Params = @(
                @{ Name="Business";    Type=10; Optional=$false }
                @{ Name="Asset";       Type=10; Optional=$false }
                @{ Name="Unit";        Type=10; Optional=$false }
                @{ Name="Domain";      Type=10; Optional=$false }
                @{ Name="System";      Type=10; Optional=$false }
                @{ Name="Kind";        Type=10; Optional=$false }
                @{ Name="Count";       Type=7;  Optional=$false }
                @{ Name="Reservation"; Type=5;  Optional=$true  }
            )
            Response = @(
                @{ Name="IssuedNumbers";  Type=10 }
                @{ Name="SequenceKey";    Type=10 }
                @{ Name="NewLastIssued";  Type=7  }
                @{ Name="Status";         Type=9  }
            )
        }

        # ── Unbound (Global): Reservation lifecycle ─────────────────────────
        # Kept unbound. An entity-bound migration was attempted and reverted:
        # at runtime the bound URL segment routing returned
        # "Resource not found for the segment '<uniquename>'" immediately
        # after delete+recreate, even though the CA records had bindingtype=1
        # and boundentitylogicalname set (verified via REST). Likely an
        # SdkMessage/metadata propagation gap on recreate. Until that path
        # is understood, these stay Global with Target passed explicitly in
        # the request body (Type=5 EntityReference). Plugins read Target
        # from InputParameters; the Code App sends Target with full
        # @odata.type EntityReference shape (see useApproveReservation.ts).
        @{
            UniqueName  = "enmax_acdnApproveReservation"
            DisplayName = "Approve Reservation"
            Description = "Approves a pending reservation (Approver/Admin only). Moves Pending to Approved, stamps the approver and timestamp, writes an audit event, and notifies the requester. Idempotent: re-approving an already-approved reservation is a no-op. Target is the reservation."
            PluginClass = "Enmax.AutoCAD.ApproveReservationPlugin"
            BindingType = 0
            BoundEntity = $null
            Params = @(
                @{ Name="Target"; Type=5; Optional=$false }
            )
            Response    = @()
        }

        @{
            UniqueName  = "enmax_acdnDeclineReservation"
            DisplayName = "Decline Reservation"
            Description = "Declines a pending reservation with a reason (Approver/Admin only). Moves Pending to Declined, stores the reason, writes an audit event, and notifies the requester with the reason. Inputs: Target (reservation) and Reason."
            PluginClass = "Enmax.AutoCAD.DeclineReservationPlugin"
            BindingType = 0
            BoundEntity = $null
            Params = @(
                @{ Name="Target"; Type=5; Optional=$false }
                @{ Name="Reason"; Type=10; Optional=$true }
            )
            Response = @()
        }

        @{
            UniqueName  = "enmax_acdnCreateDrawings"
            DisplayName = "Create Drawings"
            Description = "Creates one Drawing per issued number, plus its Sheets, for an approved reservation (Approver/Admin only). Every record is owned by the reservation requester, not the approver. Inputs: Target (reservation), IssuedNumbers (JSON array), SequenceKey. Returns DrawingsCreated."
            PluginClass = "Enmax.AutoCAD.CreateDrawingsPlugin"
            BindingType = 0
            BoundEntity = $null
            Params = @(
                @{ Name="Target";        Type=5;  Optional=$false }
                @{ Name="IssuedNumbers"; Type=10; Optional=$false }
                @{ Name="SequenceKey";   Type=10; Optional=$false }
            )
            Response = @(
                @{ Name="DrawingsCreated"; Type=7 }
            )
        }

        # ── Global: Add to Existing (append child items) ─────────────────────
        # ADR 0001 #2/#6: appends the next Count child items (-sss) to an
        # already-issued base number (Drawing or Procedure), continuing after the
        # last existing child. Standard documents are base-only and rejected.
        # Unbound with explicit Drawing (Type=5) — same routing rationale as the
        # reservation lifecycle APIs above. Concurrency backstop is the
        # enmax_acdnsheet_drawing_num_ak alt key (Rule 14); caller retries on
        # DuplicateDetected. Approver/Admin only.
        @{
            UniqueName  = "enmax_acdnAddChildItems"
            DisplayName = "Add Child Items to Existing Number"
            Description = "Appends the next Count child items (-sss) to an already-issued base Drawing or Procedure number, continuing after the last existing child (Approver/Admin only). New children are owned by the base drawing's owner. Rejects Standard (base-only) documents. Inputs: Drawing (base), Count (1-999). Returns ChildrenCreated, FirstChildNumber, LastChildNumber, BaseNumber."
            PluginClass = "Enmax.AutoCAD.AddChildItemsPlugin"
            BindingType = 0
            BoundEntity = $null
            Params = @(
                @{ Name="Drawing"; Type=5; Optional=$false }
                @{ Name="Count";   Type=7; Optional=$false }
            )
            Response = @(
                @{ Name="ChildrenCreated";  Type=7  }
                @{ Name="FirstChildNumber"; Type=7  }
                @{ Name="LastChildNumber";  Type=7  }
                @{ Name="BaseNumber";       Type=10 }
            )
        }

        # ── Entity-bound: Drawing checkout ───────────────────────────────────
        @{
            UniqueName  = "enmax_acdnCheckOutDrawing"
            DisplayName = "Check Out Drawing"
            Description = "Checks out an Available drawing for revision (drawing owner or Admin only). Moves Available to CheckedOut with optimistic concurrency to block simultaneous check-outs, creates an Open checkout owned by the caller, and propagates sheet state. Target is the drawing. Returns CheckoutId."
            PluginClass = "Enmax.AutoCAD.CheckOutDrawingPlugin"
            BindingType = 1
            BoundEntity = "enmax_autocaddrawing"
            Params      = @()
            Response = @(
                @{ Name="CheckoutId"; Type=10 }
            )
        }

        @{
            UniqueName  = "enmax_acdnApproveCheckin"
            DisplayName = "Approve Check-In"
            Description = "Validates a submitted check-in (Approver/Admin only). Approve: checkout closes, drawing returns to Available with the new revision, sheets follow. Decline (reason 10+ chars): checkout reopens, drawing reverts to CheckedOut. Submitter notified. Inputs: Target, Decision (1 or 2), Reason."
            PluginClass = "Enmax.AutoCAD.ApproveCheckinPlugin"
            BindingType = 1
            BoundEntity = "enmax_autocadcheckout"
            Params = @(
                @{ Name="Decision"; Type=7;  Optional=$false }
                @{ Name="Reason";   Type=10; Optional=$true  }
            )
            Response = @(
                @{ Name="CheckoutId";   Type=10 }
                @{ Name="NewStatus";    Type=7  }
                @{ Name="DrawingState"; Type=7  }
            )
        }

        @{
            UniqueName  = "enmax_acdnApproveCheckout"
            DisplayName = "Approve Check Out"
            Description = "Resolves a gated Check Out request (Approver/Admin only). Approve: checkout Requested -> Open, drawing Available -> CheckedOut with optimistic concurrency, sheets follow, and the drop-off upload window opens for the requester. Decline (reason 10+ chars): checkout -> ClosedDeclined, drawing stays Available. Requester notified; audited against the drawing. Inputs: Target, Decision (1 or 2), Reason."
            PluginClass = "Enmax.AutoCAD.ApproveCheckoutPlugin"
            BindingType = 1
            BoundEntity = "enmax_autocadcheckout"
            Params = @(
                @{ Name="Decision"; Type=7;  Optional=$false }
                @{ Name="Reason";   Type=10; Optional=$true  }
            )
            Response = @(
                @{ Name="CheckoutId";   Type=10 }
                @{ Name="NewStatus";    Type=7  }
                @{ Name="DrawingState"; Type=7  }
            )
        }

        @{
            UniqueName  = "enmax_acdnForceCheckin"
            DisplayName = "Force Check-In"
            Description = "Administrative force-close of an open or stuck checkout (Approver/Admin only). Closes it as ClosedForced, returns the drawing to Available, propagates sheets, audits, and notifies the affected user. Inputs: Target, Reason (required); NewRevision (optional, legacy — an internal cycle token is stamped when omitted)."
            PluginClass = "Enmax.AutoCAD.ForceCheckinPlugin"
            BindingType = 1
            BoundEntity = "enmax_autocadcheckout"
            Params = @(
                @{ Name="NewRevision"; Type=10; Optional=$true  }
                @{ Name="Reason";      Type=10; Optional=$false }
            )
            Response = @(
                @{ Name="CheckoutId";   Type=10 }
                @{ Name="DrawingState"; Type=7  }
            )
        }

        # ── Entity-bound: Drawing lifecycle (plan-12) ────────────────────────
        @{
            UniqueName  = "enmax_acdnSubmitRevision"
            DisplayName = "Submit Revision"
            Description = "Checks in a revised drawing on an open checkout (checkout owner only). Captures mandatory Submission Information (Project, WO#, ...); the revision number is gone — SharePoint version history is the revision trail. AppConfig RequireCheckInApproval off: checkout closes, drawing returns to Available. On: both move to AwaitingValidation for approval. Inputs: Target, SubmissionInfo."
            PluginClass = "Enmax.AutoCAD.SubmitRevisionPlugin"
            BindingType = 1
            BoundEntity = "enmax_autocadcheckout"
            Params = @(
                @{ Name="SubmissionInfo"; Type=10; Optional=$false }
            )
            Response = @(
                @{ Name="NewStatus";    Type=7 }
                @{ Name="DrawingState"; Type=7 }
            )
        }

        @{
            UniqueName  = "enmax_acdnFinalizeDrawing"
            DisplayName = "Finalize Drawing"
            Description = "Finalises a drawing as the canonical, locked revision - terminal (drawing owner or Admin only). Requires a reason (10+ chars) and at least one prior check-in. Moves Available to Finalized with optimistic concurrency, finalises sheets, audits, notifies the owner. Inputs: Target, Reason."
            PluginClass = "Enmax.AutoCAD.FinalizeDrawingPlugin"
            BindingType = 1
            BoundEntity = "enmax_autocaddrawing"
            Params = @(
                @{ Name="Reason"; Type=10; Optional=$false }
            )
            Response = @()
        }

        @{
            UniqueName  = "enmax_acdnMarkObsolete"
            DisplayName = "Mark Drawing Obsolete"
            Description = "Marks a non-terminal drawing Obsolete - do not use (Admin only). Requires at least one prior check-in. Transitions to Obsolete with optimistic concurrency, propagates to sheets, writes an audit event, and notifies the owner. Inputs: Target (drawing) and Reason (optional)."
            PluginClass = "Enmax.AutoCAD.MarkObsoletePlugin"
            BindingType = 1
            BoundEntity = "enmax_autocaddrawing"
            Params = @(
                @{ Name="Reason"; Type=10; Optional=$true }
            )
            Response = @()
        }

        # ── Entity-bound: F-06 release unused reserved number (plan-14a) ─────
        @{
            UniqueName  = "enmax_acdnReleaseDrawing"
            DisplayName = "Release Drawing"
            Description = "Releases an unused, Available, never-checked-out reserved number - F-06. Owner self-releases; Admin force-releases anyone's (owner notified). Drawing and sheets move to Void; the number stays burned, never reused. Used drawings must use Mark Obsolete. Inputs: Target, Reason (10+ chars)."
            PluginClass = "Enmax.AutoCAD.ReleaseDrawingPlugin"
            BindingType = 1
            BoundEntity = "enmax_autocaddrawing"
            Params = @(
                @{ Name="Reason"; Type=10; Optional=$false }
            )
            Response = @(
                @{ Name="DrawingId";         Type=10 }
                @{ Name="NewState";          Type=10 }
                @{ Name="SequenceKeyBurned"; Type=10 }
            )
        }

        # ── Global: SharePoint indexer upsert (WS5) ───────────────────────────
        # Unbound with explicit Target (Type=5). The indexer flow passes discovered
        # PDF metadata as a JSON array; the plug-in runs SharePointLinkMatcher and
        # idempotently writes drop-off/destination URLs + present flags + last-indexed.
        @{
            UniqueName  = "enmax_acdnUpsertSharePointLinks"
            DisplayName = "Upsert SharePoint Link Metadata"
            Description = "WS5 indexer: matches FoundFiles (JSON array of PDF metadata) to a drawing or sheet by deterministic filename, then idempotently upserts drop-off/destination URLs, present-in-library flags, and last-indexed timestamp. Inputs: Target (drawing or sheet), RecordNumber (must match the record), FoundFiles (JSON array; empty clears links). Returns UpdateNeeded, DropOffUrl, DestinationUrl, PresentInDropOff, PresentInDestination."
            PluginClass = "Enmax.AutoCAD.UpsertSharePointLinksPlugin"
            BindingType = 0
            BoundEntity = $null
            Params = @(
                @{ Name="Target";       Type=5;  Optional=$false }
                @{ Name="RecordNumber"; Type=10; Optional=$false }
                @{ Name="FoundFiles";   Type=10; Optional=$true  }
            )
            Response = @(
                @{ Name="UpdateNeeded";          Type=0 }
                @{ Name="DropOffUrl";            Type=10 }
                @{ Name="DestinationUrl";        Type=10 }
                @{ Name="PresentInDropOff";      Type=0 }
                @{ Name="PresentInDestination";  Type=0 }
            )
        }
    )

    StepDefs = @(

        # ── SetAppOwnerPlugin — PreValidation/Create/Synchronous on all config+ref tables ──
        # Stage 10 (PreValidation), NOT 20 (PreOperation): on Create the platform
        # resolves ownerid before PreOperation, so a PreOp Target ownerid override is
        # ignored. PreValidation reliably stamps ownerid = the BU app-owner team.
        @{
            Name             = "Enmax.AutoCAD.SetAppOwnerPlugin: Create of enmax_autocadappconfig"
            PluginClass      = "Enmax.AutoCAD.SetAppOwnerPlugin"
            Message          = "Create"
            Entity           = "enmax_autocadappconfig"
            Stage            = 10
            Mode             = 0    # Synchronous
            Rank             = 1
            FilterAttributes = $null
            Images           = @()
        }

        @{
            Name             = "Enmax.AutoCAD.SetAppOwnerPlugin: Create of enmax_autocadbroadcast"
            PluginClass      = "Enmax.AutoCAD.SetAppOwnerPlugin"
            Message          = "Create"
            Entity           = "enmax_autocadbroadcast"
            Stage            = 10
            Mode             = 0    # Synchronous
            Rank             = 1
            FilterAttributes = $null
            Images           = @()
        }

        @{
            Name             = "Enmax.AutoCAD.SetAppOwnerPlugin: Create of enmax_autocadauditevent"
            PluginClass      = "Enmax.AutoCAD.SetAppOwnerPlugin"
            Message          = "Create"
            Entity           = "enmax_autocadauditevent"
            Stage            = 10
            Mode             = 0    # Synchronous
            Rank             = 1
            FilterAttributes = $null
            Images           = @()
        }

        @{
            Name             = "Enmax.AutoCAD.SetAppOwnerPlugin: Create of enmax_autocadnumbersequence"
            PluginClass      = "Enmax.AutoCAD.SetAppOwnerPlugin"
            Message          = "Create"
            Entity           = "enmax_autocadnumbersequence"
            Stage            = 10
            Mode             = 0    # Synchronous
            Rank             = 1
            FilterAttributes = $null
            Images           = @()
        }

        @{
            Name             = "Enmax.AutoCAD.SetAppOwnerPlugin: Create of enmax_autocadbusiness"
            PluginClass      = "Enmax.AutoCAD.SetAppOwnerPlugin"
            Message          = "Create"
            Entity           = "enmax_autocadbusiness"
            Stage            = 10
            Mode             = 0    # Synchronous
            Rank             = 1
            FilterAttributes = $null
            Images           = @()
        }

        @{
            Name             = "Enmax.AutoCAD.SetAppOwnerPlugin: Create of enmax_autocadasset"
            PluginClass      = "Enmax.AutoCAD.SetAppOwnerPlugin"
            Message          = "Create"
            Entity           = "enmax_autocadasset"
            Stage            = 10
            Mode             = 0    # Synchronous
            Rank             = 1
            FilterAttributes = $null
            Images           = @()
        }

        @{
            Name             = "Enmax.AutoCAD.SetAppOwnerPlugin: Create of enmax_autocadunit"
            PluginClass      = "Enmax.AutoCAD.SetAppOwnerPlugin"
            Message          = "Create"
            Entity           = "enmax_autocadunit"
            Stage            = 10
            Mode             = 0    # Synchronous
            Rank             = 1
            FilterAttributes = $null
            Images           = @()
        }

        @{
            Name             = "Enmax.AutoCAD.SetAppOwnerPlugin: Create of enmax_autocaddomain"
            PluginClass      = "Enmax.AutoCAD.SetAppOwnerPlugin"
            Message          = "Create"
            Entity           = "enmax_autocaddomain"
            Stage            = 10
            Mode             = 0    # Synchronous
            Rank             = 1
            FilterAttributes = $null
            Images           = @()
        }

        @{
            Name             = "Enmax.AutoCAD.SetAppOwnerPlugin: Create of enmax_autocadsystem"
            PluginClass      = "Enmax.AutoCAD.SetAppOwnerPlugin"
            Message          = "Create"
            Entity           = "enmax_autocadsystem"
            Stage            = 10
            Mode             = 0    # Synchronous
            Rank             = 1
            FilterAttributes = $null
            Images           = @()
        }

        @{
            Name             = "Enmax.AutoCAD.SetAppOwnerPlugin: Create of enmax_autocadkind"
            PluginClass      = "Enmax.AutoCAD.SetAppOwnerPlugin"
            Message          = "Create"
            Entity           = "enmax_autocadkind"
            Stage            = 10
            Mode             = 0    # Synchronous
            Rank             = 1
            FilterAttributes = $null
            Images           = @()
        }

        @{
            Name             = "Enmax.AutoCAD.SetAppOwnerPlugin: Create of enmax_autocadrecordtype"
            PluginClass      = "Enmax.AutoCAD.SetAppOwnerPlugin"
            Message          = "Create"
            Entity           = "enmax_autocadrecordtype"
            Stage            = 10
            Mode             = 0    # Synchronous
            Rank             = 1
            FilterAttributes = $null
            Images           = @()
        }

        @{
            Name             = "Enmax.AutoCAD.SetAppOwnerPlugin: Create of enmax_autocadrecordphase"
            PluginClass      = "Enmax.AutoCAD.SetAppOwnerPlugin"
            Message          = "Create"
            Entity           = "enmax_autocadrecordphase"
            Stage            = 10
            Mode             = 0    # Synchronous
            Rank             = 1
            FilterAttributes = $null
            Images           = @()
        }

        @{
            Name             = "Enmax.AutoCAD.SetAppOwnerPlugin: Create of enmax_autocadvendor"
            PluginClass      = "Enmax.AutoCAD.SetAppOwnerPlugin"
            Message          = "Create"
            Entity           = "enmax_autocadvendor"
            Stage            = 10
            Mode             = 0    # Synchronous
            Rank             = 1
            FilterAttributes = $null
            Images           = @()
        }

        @{
            Name             = "Enmax.AutoCAD.SetAppOwnerPlugin: Create of enmax_autocadbusinessasset"
            PluginClass      = "Enmax.AutoCAD.SetAppOwnerPlugin"
            Message          = "Create"
            Entity           = "enmax_autocadbusinessasset"
            Stage            = 10
            Mode             = 0    # Synchronous
            Rank             = 1
            FilterAttributes = $null
            Images           = @()
        }

        @{
            Name             = "Enmax.AutoCAD.SetAppOwnerPlugin: Create of enmax_autocadassetunit"
            PluginClass      = "Enmax.AutoCAD.SetAppOwnerPlugin"
            Message          = "Create"
            Entity           = "enmax_autocadassetunit"
            Stage            = 10
            Mode             = 0    # Synchronous
            Rank             = 1
            FilterAttributes = $null
            Images           = @()
        }

        @{
            Name             = "Enmax.AutoCAD.SetAppOwnerPlugin: Create of enmax_autocadsystemscope"
            PluginClass      = "Enmax.AutoCAD.SetAppOwnerPlugin"
            Message          = "Create"
            Entity           = "enmax_autocadsystemscope"
            Stage            = 10
            Mode             = 0    # Synchronous
            Rank             = 1
            FilterAttributes = $null
            Images           = @()
        }

        @{
            Name             = "Enmax.AutoCAD.OnReservationCreatedPlugin: Create of enmax_autocadreservation"
            PluginClass      = "Enmax.AutoCAD.OnReservationCreatedPlugin"
            Message          = "Create"
            Entity           = "enmax_autocadreservation"
            Stage            = 40
            Mode             = 0    # Synchronous
            Rank             = 1
            FilterAttributes = $null
            Images           = @()
        }

        @{
            Name             = "Enmax.AutoCAD.AutoCreateDrawingsPlugin: Update of enmax_autocadreservation"
            PluginClass      = "Enmax.AutoCAD.AutoCreateDrawingsPlugin"
            Message          = "Update"
            Entity           = "enmax_autocadreservation"
            Stage            = 40
            Mode             = 1    # Asynchronous
            Rank             = 1
            FilterAttributes = "enmax_acdnissuednumbers"
            Images           = @(
                @{
                    Name       = "postImage"
                    ImageType  = 1   # PostImage
                    Attributes = "enmax_acdnstatus,enmax_acdnissuednumbers,enmax_acdnsheetsperdrawing,enmax_acdnreservationtype,enmax_acdndocumentsubtype,ownerid,enmax_acdnbusiness,enmax_acdnasset,enmax_acdnunit,enmax_acdndomain,enmax_acdnsystem,enmax_acdnkind"
                }
            )
        }
    )
}
