import "@testing-library/jest-dom";

// Global default: every test that renders a grid-containing page gets a working
// AppConfig without needing its own mock. Per-file vi.mock() will override this.
vi.mock("./config/useAppConfig", () => ({
  useAppConfig: () => ({
    SingleAdminMode: false,
    MaxDrawingsPerReservation: 10,
    MaxSheetsPerDrawing: 50,
    DefaultSheetsPerDrawing: 5,
    StaleCheckoutMonths: "3,6,12",
    SharedMailboxAddress: "noreply@example.com",
    SharePointSiteUrl: "https://example.com",
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
    RequireCheckInApproval: false,
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
