import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { SearchPage } from "../../features/search/SearchPage";
import type { SearchDocumentRow } from "../../features/search/useSearchDocuments";

const MOCK_DOCUMENT: SearchDocumentRow = {
  id: "sheet-001",
  drawingId: "drw-001",
  documentNumber: "GG-CG-00-ECS-AST-DD-0001-001",
  baseNumber: "GG-CG-00-ECS-AST-DD-0001",
  sheetNumber: 1,
  title: "Main Single Line Diagram",
  filename: "SLD-001.dwg",
  typeLabel: "Drawing",
  state: 2,
  stateLabel: "Available",
  sharePointUrl: "https://sharepoint.example.com/drawing1",
  destinationUrl: "",
  revisionDate: "2026-01-15T00:00:00Z",
  currentRevision: "C",
  businessDisplay: "Generation",
  assetDisplay: "Coal Gen",
  unitDisplay: "Unit 0",
  domainDisplay: "Electrical Control Systems",
  systemDisplay: "AST",
  kindDisplay: "Detailed Design",
  compositionSummary: "Generation · Coal Gen · Unit 0 · Electrical Control Systems · AST · Detailed Design",
  submittedByName: "Jane Doe",
  approvedByName: "",
  isChildDocument: true,
};

vi.mock("../../auth/useUserRole", () => ({
  useUserRole: () => ({ role: "Admin", isPending: false }),
}));

vi.mock("../../features/reserve/hooks/useReferenceData", () => ({
  useReferenceData: () => ({
    data: {
      businesses: [{ id: "biz-001", code: "GG", name: "Generation" }],
      assets: [],
      units: [],
      domains: [],
      systems: [],
      kinds: [],
    },
    isPending: false,
  }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../../features/search/useSearchDocuments", () => ({
  fetchSearchDocuments: vi.fn(async () => ({
    rows: [MOCK_DOCUMENT],
    totalCount: 1,
  })),
}));

async function runQuery(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^Query$/i }));
}

afterEach(() => {
  mockNavigate.mockClear();
  vi.clearAllMocks();
});

test("shows drawing documents tab and composition filters", async () => {
  renderWithProviders(<SearchPage />);
  expect(screen.getByRole("tab", { name: /Drawings \(Drawing Documents\)/i })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /Standard Documents, Procedures & Forms/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/Business/i)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText("1 matching document")).toBeInTheDocument());
});

test("query shows individual document results", async () => {
  const user = userEvent.setup();
  renderWithProviders(<SearchPage />);
  await runQuery(user);
  await waitFor(() => expect(screen.getByText("GG-CG-00-ECS-AST-DD-0001-001")).toBeInTheDocument());
  expect(screen.getByText("1 matching document")).toBeInTheDocument();
  expect(screen.getByText(/SLD-001\.dwg/i)).toBeInTheDocument();
});

test("clicking a result navigates to document detail page", async () => {
  const user = userEvent.setup();
  renderWithProviders(<SearchPage />);
  await runQuery(user);
  await waitFor(() => expect(screen.getByText("GG-CG-00-ECS-AST-DD-0001-001")).toBeInTheDocument());
  await user.click(screen.getByText("GG-CG-00-ECS-AST-DD-0001-001"));
  expect(mockNavigate).toHaveBeenCalledWith(
    expect.stringContaining("/search/documents/sheet-001?"),
    expect.objectContaining({ state: expect.objectContaining({ returnTo: expect.any(String) }) }),
  );
});

test("documents tab shows type filter", async () => {
  const user = userEvent.setup();
  renderWithProviders(<SearchPage />);
  await user.click(screen.getByRole("tab", { name: /Standard Documents, Procedures & Forms/i }));
  expect(screen.getByLabelText(/Filter by document type/i)).toBeInTheDocument();
});

test("shows pagination and matching count when results exceed page size", async () => {
  const { fetchSearchDocuments } = await import("../../features/search/useSearchDocuments");
  vi.mocked(fetchSearchDocuments).mockResolvedValueOnce({
    rows: Array.from({ length: 10 }, (_, i) => ({
      ...MOCK_DOCUMENT,
      id: `sheet-${i}`,
      documentNumber: `GG-CG-00-ECS-AST-DD-0001-${String(i + 1).padStart(3, "0")}`,
    })),
    totalCount: 25,
  });

  renderWithProviders(<SearchPage />);
  await waitFor(() => expect(screen.getByText("25 matching documents")).toBeInTheDocument());
  expect(screen.getByText(/Showing 1–10 of 25/i)).toBeInTheDocument();
  expect(screen.getByText(/Page 1 of 3/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Next/i })).toBeEnabled();
  expect(screen.getByRole("button", { name: /Previous/i })).toBeDisabled();
});

test("SharePoint link opens in new tab from result card", async () => {
  const user = userEvent.setup();
  renderWithProviders(<SearchPage />);
  await runQuery(user);
  await waitFor(() => expect(screen.getByLabelText(/Open in SharePoint/i)).toBeInTheDocument());
  const link = screen.getByLabelText(/Open in SharePoint/i);
  expect(link).toHaveAttribute("href", "https://sharepoint.example.com/drawing1");
  expect(link).toHaveAttribute("target", "_blank");
});
