import { screen } from "@testing-library/react";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { DrawingDetailPanel } from "../../features/search/DrawingDetailPanel";
import type { DrawingRow } from "../../features/search/useSearchDrawings";

// ─── mock heavy sub-components ──────────────────────────────────────────────

vi.mock("../../features/checkout/components/DrawingActionsPanel", () => ({
  DrawingActionsPanel: () => <div data-testid="actions-panel" />,
}));

vi.mock("../../features/checkout/components/SheetDocumentActions", () => ({
  SheetDocumentActions: () => <div data-testid="sheet-actions" />,
}));

// ─── mock hooks ─────────────────────────────────────────────────────────────

const FULL_ROW: DrawingRow = {
  id: "drw-detail-001",
  enmax_acdnnumber: "GG-CG-00-ECS-AST-DD-0001",
  enmax_acdntitle: "Main Single Line Diagram",
  enmax_acdncurrentrevision: "C",
  enmax_acdnrevisiondate: "2026-01-15T00:00:00Z",
  enmax_acdnstate: 2,
  enmax_acdnsheetcount: 3,
  typeLabel: "Drawing",
  enmax_acdnsplibraryurl: "https://sharepoint.example.com/drawing1",
  enmax_acdnspdestinationurl: "",
  _enmax_acdnbusiness_value: "biz-001",
  _enmax_acdnasset_value: "ast-001",
  _enmax_acdnunit_value: "unit-001",
  _enmax_acdndomain_value: "dom-001",
  _enmax_acdnsystem_value: "sys-001",
  _enmax_acdnkind_value: "knd-001",
  _enmax_acdnrecordtype_value: "rt-001",
  _enmax_acdnrecordphase_value: "rp-001",
  _enmax_acdnvendor_value: "vnd-001",
  _createdby_value: "usr-001",
  submittedById: "usr-001",
  submittedByName: "M365 Developer",
  approvedById: "",
  approvedByName: "",
  businessDisplay: "Generation",
  assetDisplay: "Coal Gen",
  unitDisplay: "Unit 0",
  domainDisplay: "Electrical Control Systems",
  systemDisplay: "AST",
  kindDisplay: "Detailed Design",
  recordTypeDisplay: "Schematic",
  recordPhaseDisplay: "Issued",
  vendorDisplay: "ACME Corp",
  requesterDisplay: "M365 Developer",
};

vi.mock("../../features/search/useDrawingDetail", () => ({
  useDrawingDetail: () => ({ data: FULL_ROW, isPending: false }),
}));

const activitySpy = vi.fn();

vi.mock("../../features/search/DocumentActivityTimeline", () => ({
  DocumentActivityTimeline: (props: {
    events: Array<{ actedBy: string; fromState: string; toState: string }>;
    title?: string;
  }) => {
    activitySpy(props);
    const first = props.events[0];
    return (
      <div>
        <span>{props.title ?? "Activity"}</span>
        {first ? (
          <span>
            {first.actedBy} checked out the drawing document ({first.fromState} → {first.toState})
          </span>
        ) : (
          <span>No activity yet</span>
        )}
      </div>
    );
  },
}));

vi.mock("../../features/checkout/hooks/useDocumentActivityTrail", () => ({
  useDocumentActivityTrail: () => ({
    data: [
      {
        id: "a",
        event: 2,
        eventLabel: "State Changed",
        fromState: "Available",
        toState: "Checked Out",
        actedBy: "M365 Developer",
        reason: "",
        createdOn: "2026-05-24T11:10:00Z",
      },
    ],
    isPending: false,
  }),
}));

vi.mock("../../features/approvals/hooks/useDrawingSheets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../features/approvals/hooks/useDrawingSheets")>();
  return {
    ...actual,
    useDrawingSheets: () => ({ data: [], isPending: false }),
  };
});

vi.mock("../../features/approvals/hooks/useSheetCheckouts", () => ({
  useSheetCheckouts: () => ({ data: new Map(), isPending: false }),
}));

vi.mock("../../features/checkout/hooks/useDrawingCheckout", () => ({
  useDrawingCheckout: () => ({ data: undefined }),
}));

// ─── minimal drawing prop (id + number only) ─────────────────────────────────

const MINIMAL_DRAWING: DrawingRow = {
  id: "drw-detail-001",
  enmax_acdnnumber: "GG-CG-00-ECS-AST-DD-0001",
  enmax_acdntitle: "",
  enmax_acdncurrentrevision: "",
  enmax_acdnrevisiondate: "",
  enmax_acdnstate: 1,
  enmax_acdnsheetcount: 0,
  typeLabel: "Drawing",
  enmax_acdnsplibraryurl: "",
  enmax_acdnspdestinationurl: "",
  _enmax_acdnbusiness_value: "",
  _enmax_acdnasset_value: "",
  _enmax_acdnunit_value: "",
  _enmax_acdndomain_value: "",
  _enmax_acdnsystem_value: "",
  _enmax_acdnkind_value: "",
  _enmax_acdnrecordtype_value: "",
  _enmax_acdnrecordphase_value: "",
  _enmax_acdnvendor_value: "",
  _createdby_value: "",
  submittedById: "",
  submittedByName: "",
  approvedById: "",
  approvedByName: "",
  businessDisplay: "",
  assetDisplay: "",
  unitDisplay: "",
  domainDisplay: "",
  systemDisplay: "",
  kindDisplay: "",
  recordTypeDisplay: "",
  recordPhaseDisplay: "",
  vendorDisplay: "",
  requesterDisplay: "",
};

// ─── tests ───────────────────────────────────────────────────────────────────

test("DrawingDetailPanel shows fully-populated fields from useDrawingDetail", async () => {
  renderWithProviders(
    <DrawingDetailPanel drawing={MINIMAL_DRAWING} onClose={() => {}} />,
  );

  expect(await screen.findByText("Generation")).toBeInTheDocument();
});

test("DrawingDetailPanel renders sentence-style activity with from→to transition", async () => {
  activitySpy.mockClear();
  renderWithProviders(
    <DrawingDetailPanel drawing={MINIMAL_DRAWING} onClose={() => {}} />,
  );

  expect(
    await screen.findByText(/M365 Developer checked out the drawing document/i),
  ).toBeInTheDocument();
  expect(activitySpy).toHaveBeenCalled();
  expect(activitySpy.mock.calls.at(-1)?.[0].events[0]).toMatchObject({
    fromState: "Available",
    toState: "Checked Out",
  });
});

test("DrawingDetailPanel does not show base SharePoint link for Drawing type", async () => {
  renderWithProviders(
    <DrawingDetailPanel drawing={MINIMAL_DRAWING} onClose={() => {}} />,
  );

  expect(screen.queryByText(/Open in SharePoint/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/no linked file found yet/i)).not.toBeInTheDocument();
});
