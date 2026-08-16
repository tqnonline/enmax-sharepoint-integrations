import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { AuditPage } from "../../features/audit/AuditPage";
import { buildAuditFilter } from "../../features/audit/auditFilter";
import { Enmax_autocadauditeventsService } from "../../generated";
import type { Role } from "../../auth/useUserRole";

const mockRole: { value: Role } = { value: "Admin" };

vi.mock("../../auth/useUserRole", () => ({
  useUserRole: () => ({ role: mockRole.value, isPending: false }),
}));

vi.mock("../../config/useAppConfig", () => ({
  useAppConfig: () => ({ GridPageSize: 50 }),
}));

vi.mock("../../generated", () => ({
  Enmax_autocadauditeventsService: {
    getAll: vi.fn().mockResolvedValue({
      success: true,
      data: [
        {
          enmax_autocadauditeventid:    "evt-001",
          createdon:                    "2026-05-20T10:00:00Z",
          enmax_acdnevent:              8,
          enmax_acdnsource:             1,
          enmax_acdnsubjecttable:       "enmax_autocadbusinesses",
          enmax_acdnsubjectid:          "biz-001",
          enmax_acdnfromstate:          "",
          enmax_acdntostate:            "",
          enmax_acdnreason:             "Added new business",
          "_enmax_acdnactedby_value@OData.Community.Display.V1.FormattedValue": "Alice Smith",
          "_enmax_acdnactedonbehalfof_value@OData.Community.Display.V1.FormattedValue": "",
        },
      ],
    }),
  },
}));

import { GRID_DEFAULT_FROM_DAYS, isoDateDaysAgo, isoDateToday } from "../../lib/dateRangeDefaults";

const FIXED_NOW = new Date("2026-07-09T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXED_NOW);
});
afterEach(() => {
  mockRole.value = "Admin";
  vi.clearAllMocks();
  vi.useRealTimers();
});

// Default date range = last 30 days (aligned with all other grid pages)
test(`default from-date is set to ${GRID_DEFAULT_FROM_DAYS} days ago`, () => {
  renderWithProviders(<AuditPage />);
  const fromInput = screen.getByLabelText("From date") as HTMLInputElement;
  expect(fromInput.value).toBe(isoDateDaysAgo(GRID_DEFAULT_FROM_DAYS, FIXED_NOW));
});

// Test 29 — All filters compose correctly (data renders)
test("audit rows render with event and source labels", async () => {
  renderWithProviders(<AuditPage />);
  // Wait for a text unique to the data row (not the filter dropdowns)
  await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument(), { timeout: 3000 });
  // "Code App" appears in both the filter select option and the table row
  expect(screen.getAllByText("Code App").length).toBeGreaterThanOrEqual(1);
});

// Test 30 — No row action buttons present (read-only)
test("audit table has no edit/delete/action buttons — read-only", async () => {
  renderWithProviders(<AuditPage />);
  await waitFor(() => expect(screen.getByText("Reference Data Changed")).toBeInTheDocument(), { timeout: 3000 });
  expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /deactivate/i })).not.toBeInTheDocument();
});

// Clear filters resets from-date to default 30-day window
test("Clear button resets date range to last 30 days", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderWithProviders(<AuditPage />);
  const fromInput = screen.getByLabelText("From date") as HTMLInputElement;
  await user.clear(fromInput);
  await user.type(fromInput, "2026-01-01");
  expect(fromInput.value).toBe("2026-01-01");
  await user.click(screen.getByRole("button", { name: /clear/i }));
  expect(fromInput.value).toBe(isoDateDaysAgo(GRID_DEFAULT_FROM_DAYS, FIXED_NOW));
});

test(`default from-date is ${GRID_DEFAULT_FROM_DAYS} days ago`, () => {
  renderWithProviders(<AuditPage />);
  const from = screen.getByLabelText("From date") as HTMLInputElement;
  expect(from.value).toBe(isoDateDaysAgo(GRID_DEFAULT_FROM_DAYS, FIXED_NOW));
});
test("Subject Table filter is a dropdown (select)", () => {
  renderWithProviders(<AuditPage />);
  expect((screen.getByLabelText("Filter by subject table") as HTMLElement).tagName.toLowerCase()).toBe("select");
});
test("has a Query button", () => {
  renderWithProviders(<AuditPage />);
  expect(screen.getByRole("button", { name: /query/i })).toBeInTheDocument();
});
test("single Export CSV button", () => {
  mockRole.value = "Admin";
  renderWithProviders(<AuditPage />);
  expect(screen.getAllByRole("button", { name: /export csv/i })).toHaveLength(1);
});

// Regression: Dataverse rejects quoted DateTimeOffset literals. The date bounds
// must be UNQUOTED or the audit query throws and nothing loads.
test("date filter emits unquoted DateTimeOffset literals", () => {
  const filter = buildAuditFilter({
    dateFrom: "2026-05-18", dateTo: "2026-05-25",
    filterEvent: "", filterTable: "", filterSubjectId: "", filterSource: "",
  });
  expect(filter).toContain("createdon ge 2026-05-18T00:00:00Z");
  expect(filter).toContain("createdon le 2026-05-25T23:59:59Z");
  expect(filter).not.toContain("createdon ge '"); // not quoted
});

// String fields (subject id, table) stay quoted; numeric/enum fields unquoted.
test("subject id stays quoted, event/source stay unquoted", () => {
  const filter = buildAuditFilter({
    dateFrom: "", dateTo: "",
    filterEvent: "3", filterTable: "enmax_autocadbusinesses",
    filterSubjectId: "biz-1", filterSource: "1",
  });
  expect(filter).toContain("enmax_acdnsubjectid eq 'biz-1'");
  expect(filter).toContain("enmax_acdnsubjecttable eq 'enmax_autocadbusinesses'");
  expect(filter).toContain("enmax_acdnevent eq 3");
  expect(filter).toContain("enmax_acdnsource eq 1");
});

// Default To-date is today, so the preloaded filters show the full 30-day window.
test("default to-date is today", () => {
  renderWithProviders(<AuditPage />);
  const toInput = screen.getByLabelText("To date") as HTMLInputElement;
  expect(toInput.value).toBe(isoDateToday(FIXED_NOW));
});

// Regression: Dataverse rejects $skip ("Skip Clause is not supported in CRM").
// The audit query must page client-side, never sending a skip clause.
test("audit query never sends a skip clause", async () => {
  renderWithProviders(<AuditPage />);
  await waitFor(() => expect(Enmax_autocadauditeventsService.getAll).toHaveBeenCalled());
  const opts = vi.mocked(Enmax_autocadauditeventsService.getAll).mock.calls[0][0];
  expect(opts).not.toHaveProperty("skip");
});
