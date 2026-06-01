#
# PluginDefinitions.psd1
# Project-specific Custom API and plugin step definitions for the Enmax AutoCAD solution.
# Loaded via Import-PowerShellDataFile by Register-PpPlugins.
#
# CustomAPI bindingtype:           0=Global  1=Entity  2=EntityCollection
# CustomAPIRequestParameter type:  5=EntityReference  7=Integer  9=Picklist  10=String
# CustomAPIResponseProperty type:  same codes
# PluginStep stage:                20=PreValidation  40=PostOperation
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
            DisplayName = "Issue Drawing Numbers"
            PluginClass = "Enmax.AutoCAD.IssueNumbersPlugin"
            BindingType = 0
            BoundEntity = $null
            Params = @(
                @{ Name="Business"; Type=10; Optional=$false }
                @{ Name="Asset";    Type=10; Optional=$false }
                @{ Name="Unit";     Type=10; Optional=$false }
                @{ Name="Domain";   Type=10; Optional=$false }
                @{ Name="System";   Type=10; Optional=$false }
                @{ Name="Kind";     Type=10; Optional=$false }
                @{ Name="Count";    Type=7;  Optional=$false }
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

        # ── Entity-bound: Drawing checkout ───────────────────────────────────
        @{
            UniqueName  = "enmax_acdnCheckOutDrawing"
            DisplayName = "Check Out Drawing"
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
            UniqueName  = "enmax_acdnForceCheckin"
            DisplayName = "Force Check-In"
            PluginClass = "Enmax.AutoCAD.ForceCheckinPlugin"
            BindingType = 1
            BoundEntity = "enmax_autocadcheckout"
            Params = @(
                @{ Name="NewRevision"; Type=10; Optional=$false }
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
            PluginClass = "Enmax.AutoCAD.SubmitRevisionPlugin"
            BindingType = 1
            BoundEntity = "enmax_autocadcheckout"
            Params = @(
                @{ Name="NewRevision"; Type=10; Optional=$false }
                @{ Name="Reason";      Type=10; Optional=$true  }
            )
            Response = @(
                @{ Name="NewStatus";    Type=7 }
                @{ Name="DrawingState"; Type=7 }
            )
        }

        @{
            UniqueName  = "enmax_acdnFinalizeDrawing"
            DisplayName = "Finalize Drawing"
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
    )

    StepDefs = @(

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
                    Attributes = "enmax_acdnstatus,enmax_acdnissuednumbers,enmax_acdnsheetsperdrawing,ownerid,enmax_acdnbusiness,enmax_acdnasset,enmax_acdnunit,enmax_acdndomain,enmax_acdnsystem,enmax_acdnkind"
                }
            )
        }
    )
}
