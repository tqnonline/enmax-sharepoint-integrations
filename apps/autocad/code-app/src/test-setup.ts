import "@testing-library/jest-dom";

function createLocalStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
}

const localStorageMock = createLocalStorageMock();
Object.defineProperty(window, "localStorage", { value: localStorageMock, writable: true });

beforeEach(() => {
  localStorageMock.clear();
});

// Global default: every test that renders a grid-containing page gets a working
// AppConfig without needing its own mock. Per-file vi.mock() will override this.
vi.mock("./config/useAppConfig", () => ({
  useAppConfig: () => ({
    SingleAdminMode: false,
    MaxRecordsPerReservation: 10,
    MaxSheetsPerDrawing: 50,
    DefaultSheetsPerDrawing: 5,
    StaleCheckoutMonths: "3,6,12",
    SharedMailboxAddress: "noreply@example.com",
    SharePointSiteUrl: "https://example.com",
    CheckInUploadLibraryUrl: "https://example.com/library",
    DrawingsDropOffLibraryUrl: "https://example.com/drawings-dropoff",
    DrawingsDestinationLibraryUrl: "https://example.com/drawings-dest",
    DocumentsDropOffLibraryUrl: "https://example.com/documents-dropoff",
    DocumentsDestinationLibraryUrl: "https://example.com/documents-dest",
    DrawingDropOffLibraryUrl: "https://example.com/drawings-dropoff",
    DrawingDestinationLibraryUrl: "https://example.com/drawings-dest",
    DocumentDropOffLibraryUrl: "https://example.com/documents-dropoff",
    DocumentDestinationLibraryUrl: "https://example.com/documents-dest",
    StandardDocumentDropOffLibraryUrl: "https://example.com/standard-dropoff",
    StandardDocumentDestinationLibraryUrl: "https://example.com/standard-dest",
    ProcedureDocumentDropOffLibraryUrl: "https://example.com/procedure-dropoff",
    ProcedureDocumentDestinationLibraryUrl: "https://example.com/procedure-dest",
    FormDocumentDropOffLibraryUrl: "https://example.com/form-dropoff",
    FormDocumentDestinationLibraryUrl: "https://example.com/form-dest",
    BusinessUnitName: "ENMAX",
    BrandPrimary: "#E1393E",
    BrandSecondary: "#0F487A",
    BrandAccent: "#F7DB9C",
    DefaultTheme: "system",
    EnableTelemetry: false,
    MaintenanceBannerTitle: "",
    MaintenanceBannerBody: "",
    MaintenanceBannerSeverity: "Info",
    FooterDisclaimer: "",
    FooterCopyright: "",
    BroadcastFanOutCadenceMinutes: 60,
    GridPageSize: 10,
    GridDefaultFromDays: 30,
    RequireCheckInApproval: false,
    RequireCheckOutApproval: false,
    ShowFinalizeButton: false,
    ShowObsoleteButton: false,
    EnableDrawingCheckout: true,
    EnableDrawingCheckIn: true,
    EnableDrawingDocumentCheckout: true,
    EnableDrawingDocumentCheckIn: true,
    EnableProcedureCheckout: true,
    EnableProcedureCheckIn: true,
    EnableStandardCheckout: true,
    EnableStandardCheckIn: true,
    EnableFormCheckout: true,
    EnableFormCheckIn: true,
    AllowDrawingDocumentExistingSequence: false,
  }),
}));

window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver;

// useVirtualizer measures via getBoundingClientRect; jsdom returns 0 height.
// Mock renders up to 30 items to simulate a windowed view without DOM layout.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({
    count,
    estimateSize,
    getItemKey,
  }: {
    count: number;
    estimateSize?: (i: number) => number;
    getItemKey?: (i: number) => string | number;
  }) => {
    const sz = estimateSize ? estimateSize(0) : 40;
    const keyFn = getItemKey ?? ((i: number) => i);
    const windowSize = Math.min(count, 30);
    return {
      getVirtualItems: () =>
        Array.from({ length: windowSize }, (_, i) => ({
          key: keyFn(i),
          index: i,
          start: i * sz,
          size: sz,
          lane: 0,
        })),
      getTotalSize: () => count * sz,
      scrollToIndex: vi.fn(),
      measure: vi.fn(),
      measureElement: () => void 0,
    };
  },
}));
