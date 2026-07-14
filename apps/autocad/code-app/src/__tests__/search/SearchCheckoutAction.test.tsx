import { screen } from "@testing-library/react";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { SearchCheckoutAction } from "../../features/search/SearchCheckoutAction";
import type { SearchDocumentRow } from "../../features/search/useSearchDocuments";
import { DrawingState } from "../../features/checkout/api/checkoutClient";
import {
  DOCUMENT_SUBTYPE_VALUE,
  RESERVATION_TYPE_VALUE,
} from "../../features/reserve/terminology";
import type { AppConfig } from "../../config/AppConfigSchema";

const mutateDrawing = vi.fn();
const mutateSheets = vi.fn();

const appConfigRef: { value: Partial<AppConfig> } = {
  value: {
    EnableDrawingCheckout: true,
    EnableStandardCheckout: true,
    EnableProcedureCheckout: true,
    EnableFormCheckout: true,
    RequireCheckOutApproval: true,
  },
};

vi.mock("../../config/useAppConfig", () => ({
  useAppConfig: () => ({
    EnableDrawingCheckout: true,
    EnableDrawingCheckIn: true,
    EnableProcedureCheckout: true,
    EnableProcedureCheckIn: true,
    EnableStandardCheckout: true,
    EnableStandardCheckIn: true,
    EnableFormCheckout: true,
    EnableFormCheckIn: true,
    RequireCheckOutApproval: true,
    ...appConfigRef.value,
  }),
}));

vi.mock("../../features/checkout/hooks/useCheckOut", () => ({
  useCheckOut: () => ({
    mutate: mutateDrawing,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

vi.mock("../../features/checkout/hooks/useCheckOutSheets", () => ({
  useCheckOutSheets: () => ({
    mutate: mutateSheets,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

function row(overrides: Partial<SearchDocumentRow> = {}): SearchDocumentRow {
  return {
    id: "sheet-1",
    drawingId: "drawing-1",
    documentNumber: "GG-CG-00-ECS-AST-DD-0001-001",
    baseNumber: "GG-CG-00-ECS-AST-DD-0001",
    title: "",
    filename: "file.pdf",
    typeLabel: "Drawing Document",
    state: DrawingState.Available,
    stateLabel: "Available",
    enmax_acdnreservationtype: RESERVATION_TYPE_VALUE.Drawing,
    enmax_acdndocumentsubtype: undefined,
    sharePointUrl: "",
    destinationUrl: "",
    revisionDate: "",
    currentRevision: "",
    businessDisplay: "",
    assetDisplay: "",
    unitDisplay: "",
    domainDisplay: "",
    systemDisplay: "",
    kindDisplay: "",
    compositionSummary: "",
    submittedByName: "",
    approvedByName: "",
    isChildDocument: true,
    ...overrides,
  };
}

afterEach(() => {
  mutateDrawing.mockReset();
  mutateSheets.mockReset();
  appConfigRef.value = {
    EnableDrawingCheckout: true,
    EnableStandardCheckout: true,
    EnableProcedureCheckout: true,
    RequireCheckOutApproval: true,
  };
});

test("shows Request Check Out when Available and taxonomy enabled", () => {
  renderWithProviders(<SearchCheckoutAction row={row()} />);
  expect(screen.getByRole("button", { name: /request check out/i })).toBeInTheDocument();
});

test("hides action when taxonomy checkout is disabled", () => {
  appConfigRef.value = { ...appConfigRef.value, EnableDrawingCheckout: false };
  renderWithProviders(<SearchCheckoutAction row={row()} />);
  expect(screen.queryByRole("button", { name: /check out/i })).not.toBeInTheDocument();
});

test("hides action when document is not Available", () => {
  renderWithProviders(
    <SearchCheckoutAction row={row({ state: DrawingState.CheckedOut, stateLabel: "Checked Out" })} />,
  );
  expect(screen.queryByRole("button", { name: /check out/i })).not.toBeInTheDocument();
});

test("hides Standard Document checkout when EnableStandardCheckout is false", () => {
  appConfigRef.value = { ...appConfigRef.value, EnableStandardCheckout: false };
  renderWithProviders(
    <SearchCheckoutAction
      row={row({
        isChildDocument: false,
        enmax_acdnreservationtype: RESERVATION_TYPE_VALUE.Document,
        enmax_acdndocumentsubtype: DOCUMENT_SUBTYPE_VALUE.Standard,
        typeLabel: "Standard Document",
      })}
    />,
  );
  expect(screen.queryByRole("button", { name: /check out/i })).not.toBeInTheDocument();
});
