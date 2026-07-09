import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Title2,
  Text,
  Spinner,
  MessageBar,
  MessageBarBody,
  TabList,
  Tab,
  CounterBadge,
  useToastController,
  Toast,
  ToastTitle,
  Toaster,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import { usePendingReservations, type PendingReservation } from "./hooks/usePendingReservations";
import { useApproveReservation } from "./hooks/useApproveReservation";
import { approveInputFromReservation } from "./approveInputFromReservation";
import { ReservationQueueGrid } from "./ReservationQueueGrid";
import { ReservationDetailPanel } from "./ReservationDetailPanel";
import { BulkApproveDialog } from "./BulkApproveDialog";
import { BulkCheckoutApproveDialog } from "./BulkCheckoutApproveDialog";
import {
  expandCheckoutSelectionToBatches,
  groupCheckoutRowsByBatch,
} from "./checkoutBatchApprove";
import type { BulkActionResult } from "./bulkActionResult";
import { ReservationDrawingsPanel } from "../checkout/components/ReservationDrawingsPanel";
import type { CheckinRow } from "./hooks/useCheckins";
import { usePendingApprovals } from "./hooks/usePendingApprovals";
import { CheckinQueueGrid } from "./CheckinQueueGrid";
import { CheckoutRequestQueueGrid } from "./CheckoutRequestQueueGrid";
import { useApproveCheckout } from "../checkout/hooks/useApproveCheckout";
import { CheckoutStatus } from "../checkout/api/checkoutClient";
import { CHECKIN_STATUS_AWAITING } from "./hooks/useCheckins";
import {
  applyCheckinApprovalFilters,
  applyReservationApprovalFilters,
  type ApprovalListFilters,
} from "./approvalListFilters";
import { GridQueryFilterBar } from "../../components/DataGrid";
import { defaultGridDateRange } from "../../lib/dateRangeDefaults";

const TOASTER_ID = "approvals-toaster";

type SectionValue = "reservations" | "documents";
type ReservationTab = "pending" | "approved" | "rejected";
type DocumentTab = "checkout" | "checkin";

const TAB_STATUS: Record<ReservationTab, 1 | 2 | 3> = { pending: 1, approved: 2, rejected: 3 };

const RESERVATION_EMPTY: Record<ReservationTab, string> = {
  pending:  "No reservations awaiting approval.",
  approved: "No approved reservations.",
  rejected: "No rejected reservations.",
};

const DOCUMENTS_SECTION_LABEL = "Drawings, Documents, Procedures & Forms";

function parseSection(searchParams: URLSearchParams): SectionValue {
  const section = searchParams.get("section");
  if (section === "documents") return "documents";
  const tab = searchParams.get("tab");
  if (tab === "pendingApprovals" || tab === "checkins" || tab === "checkin" || tab === "checkout") {
    return "documents";
  }
  return "reservations";
}

function parseReservationTab(searchParams: URLSearchParams): ReservationTab {
  const tab = searchParams.get("tab");
  if (tab === "approved" || tab === "rejected") return tab;
  return "pending";
}

function parseDocumentTab(searchParams: URLSearchParams): DocumentTab {
  const tab = searchParams.get("tab");
  if (tab === "checkin" || tab === "checkins") return "checkin";
  return "checkout";
}

const FADE_UP = {
  from: { opacity: "0", transform: "translateY(8px)" },
  to:   { opacity: "1", transform: "translateY(0)" },
};

const EMPTY_MESSAGES = RESERVATION_EMPTY;

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
  },
  header: {
    paddingLeft: tokens.spacingHorizontalL,
    borderLeftWidth: "4px",
    borderLeftStyle: "solid",
    borderLeftColor: tokens.colorBrandForeground1,
    animationName: FADE_UP,
    animationDuration: "200ms",
    animationFillMode: "both",
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
    marginTop: tokens.spacingVerticalXS,
    display: "block",
  },
  content: {
    animationName: FADE_UP,
    animationDuration: "150ms",
    animationFillMode: "both",
  },
  nestedTabs: {
    marginTop: tokens.spacingVerticalS,
  },
});

export function ApprovalsPage() {
  const styles = useStyles();
  const [searchParams] = useSearchParams();
  const [activeSection, setActiveSection] = useState<SectionValue>(() => parseSection(searchParams));
  const [reservationTab, setReservationTab] = useState<ReservationTab>(() => parseReservationTab(searchParams));
  const [documentTab, setDocumentTab] = useState<DocumentTab>(() => parseDocumentTab(searchParams));
  const [selectedReservation, setSelectedReservation] = useState<PendingReservation | null>(null);
  const [bulkApproveList, setBulkApproveList]   = useState<PendingReservation[]>([]);
  const [bulkDialogOpen, setBulkDialogOpen]     = useState(false);
  const [bulkCheckoutRows, setBulkCheckoutRows] = useState<CheckinRow[]>([]);
  const [bulkCheckoutDialogOpen, setBulkCheckoutDialogOpen] = useState(false);
  const [bulkCheckoutSubmitting, setBulkCheckoutSubmitting] = useState(false);
  const [bulkCheckoutProgress, setBulkCheckoutProgress] = useState<{ current: number; total: number } | null>(null);
  const [bulkCheckoutResult, setBulkCheckoutResult] = useState<BulkActionResult>(null);

  const defaultRange = useMemo(() => defaultGridDateRange(), []);
  const [filterDraft, setFilterDraft] = useState({
    number: "",
    from: defaultRange.from,
    to: defaultRange.to,
    peopleIds: [] as string[],
  });
  const [appliedFilters, setAppliedFilters] = useState<ApprovalListFilters>(() => ({
    number: "",
    from: defaultRange.from,
    to: defaultRange.to,
    peopleIds: [],
  }));

  const queryClient = useQueryClient();

  const isReservationsSection = activeSection === "reservations";
  const isDocumentsSection = activeSection === "documents";
  const pendingApprovalsQuery = usePendingApprovals(isDocumentsSection);
  const pendingReservationsQuery = usePendingReservations(1);
  const currentQuery = usePendingReservations(
    isReservationsSection ? TAB_STATUS[reservationTab] : 1,
  );
  const approveMutation = useApproveReservation();
  const approveCheckoutMutation = useApproveCheckout();
  const { dispatchToast } = useToastController(TOASTER_ID);

  function handleSectionChange(_: unknown, data: { value: unknown }) {
    setActiveSection(data.value as SectionValue);
    setSelectedReservation(null);
    if (data.value === "documents") setDocumentTab("checkout");
    if (data.value === "reservations") setReservationTab("pending");
  }

  function handleReservationTabChange(_: unknown, data: { value: unknown }) {
    setReservationTab(data.value as ReservationTab);
    setSelectedReservation(null);
  }

  function handleDocumentTabChange(_: unknown, data: { value: unknown }) {
    setDocumentTab(data.value as DocumentTab);
  }

  const checkoutRequestRows = useMemo(
    () => applyCheckinApprovalFilters(
      pendingApprovalsQuery.rows.filter((row) => row.status === CheckoutStatus.Requested),
      appliedFilters,
    ),
    [pendingApprovalsQuery.rows, appliedFilters],
  );
  const checkinValidationRows = useMemo(
    () => applyCheckinApprovalFilters(
      pendingApprovalsQuery.rows.filter((row) => row.status === CHECKIN_STATUS_AWAITING),
      appliedFilters,
    ),
    [pendingApprovalsQuery.rows, appliedFilters],
  );
  const allCheckoutRequestRows = pendingApprovalsQuery.rows.filter(
    (row) => row.status === CheckoutStatus.Requested,
  );
  const allCheckinValidationRows = pendingApprovalsQuery.rows.filter(
    (row) => row.status === CHECKIN_STATUS_AWAITING,
  );

  const filteredReservations = useMemo(
    () => applyReservationApprovalFilters(currentQuery.data ?? [], appliedFilters),
    [currentQuery.data, appliedFilters],
  );

  function handleQuery() {
    setAppliedFilters({
      number: filterDraft.number,
      from: filterDraft.from,
      to: filterDraft.to,
      peopleIds: filterDraft.peopleIds,
    });
  }

  function handleClearFilters() {
    const { from, to } = defaultGridDateRange();
    const cleared = { number: "", from, to, peopleIds: [] as string[] };
    setFilterDraft(cleared);
    setAppliedFilters(cleared);
  }

  const filterBar = (
    <GridQueryFilterBar
      numberLabel={isReservationsSection ? "Reservation #" : "Issued number"}
      draft={{ number: filterDraft.number, from: filterDraft.from, to: filterDraft.to }}
      onDraftChange={(patch) => setFilterDraft((prev) => ({ ...prev, ...patch }))}
      onQuery={handleQuery}
      onClear={handleClearFilters}
      personLabel={isReservationsSection ? "Submitted or approved by" : "Requested or submitted by"}
      peopleIds={filterDraft.peopleIds}
      onPeopleChange={(ids) => setFilterDraft((prev) => ({ ...prev, peopleIds: ids }))}
    />
  );

  async function handleBulkApprove() {
    let successCount = 0;
    let failCount    = 0;

    for (const reservation of bulkApproveList) {
      try {
        await approveMutation.mutateAsync(approveInputFromReservation(reservation, "Approved"));
        successCount++;
      } catch {
        failCount++;
      }
    }

    setBulkDialogOpen(false);
    setBulkApproveList([]);

    dispatchToast(
      <Toast>
        <ToastTitle>
          {successCount > 0 && `${successCount} approved.`}
          {failCount > 0 && ` ${failCount} failed — check the queue.`}
        </ToastTitle>
      </Toast>,
      { intent: failCount > 0 ? "error" : "success" },
    );
  }

  function openBulkCheckoutDialog(selected: CheckinRow[]) {
    const expanded = expandCheckoutSelectionToBatches(selected, checkoutRequestRows);
    if (expanded.length === 0) {
      dispatchToast(
        <Toast><ToastTitle>No pending check-out requests in the selected batch(es).</ToastTitle></Toast>,
        { intent: "warning" },
      );
      return;
    }
    setBulkCheckoutRows(expanded);
    setBulkCheckoutResult(null);
    setBulkCheckoutProgress(null);
    setBulkCheckoutDialogOpen(true);
  }

  async function handleBulkApproveByBatch() {
    const rows = bulkCheckoutRows;
    if (rows.length === 0) return;

    setBulkCheckoutSubmitting(true);
    setBulkCheckoutResult(null);
    setBulkCheckoutProgress({ current: 0, total: rows.length });

    let approved = 0;
    let failed = 0;
    let firstError: string | null = null;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      setBulkCheckoutProgress({ current: i + 1, total: rows.length });
      try {
        await approveCheckoutMutation.mutateAsync({
          checkoutId: row.checkoutId,
          decision: "Approved",
        });
        approved++;
      } catch (err) {
        failed++;
        if (!firstError) {
          firstError = err instanceof Error ? err.message : "Approve check-out failed";
        }
      }
    }

    setBulkCheckoutSubmitting(false);
    setBulkCheckoutProgress(null);

    const result: BulkActionResult = failed === 0
      ? { status: "success", successCount: approved, failedCount: 0 }
      : approved > 0
        ? { status: "partial", successCount: approved, failedCount: failed, errorMessage: firstError ?? undefined }
        : { status: "error", successCount: 0, failedCount: failed, errorMessage: firstError ?? undefined };
    setBulkCheckoutResult(result);

    if (failed === 0) {
      setBulkCheckoutDialogOpen(false);
      setBulkCheckoutRows([]);
    }

    void queryClient.invalidateQueries({ queryKey: ["checkins-all"] });

    dispatchToast(
      <Toast>
        <ToastTitle>
          {approved > 0 && `${approved} check-out request${approved === 1 ? "" : "s"} approved.`}
          {failed > 0 && ` ${failed} failed${firstError ? `: ${firstError}` : ""}.`}
        </ToastTitle>
      </Toast>,
      { intent: failed > 0 ? "error" : "success" },
    );
  }

  const bulkCheckoutGroups = groupCheckoutRowsByBatch(bulkCheckoutRows);

  const isPendingReservationTab = reservationTab === "pending";
  const loadedCount = filteredReservations.length;
  const allReservationCount = currentQuery.data?.length ?? 0;
  const pendingReservationCount = pendingReservationsQuery.data?.length ?? 0;
  const pendingDocumentCount = pendingApprovalsQuery.rows.length;

  return (
    <div className={styles.page}>
      <Toaster toasterId={TOASTER_ID} />

      <div className={styles.header}>
        <Title2 as="h1">Approvals</Title2>
        <Text size={300} className={styles.subtitle}>
          Review reservation requests and check-in/check-out actions for drawings, documents, and procedure forms.
        </Text>
      </div>

      <TabList selectedValue={activeSection} onTabSelect={handleSectionChange}>
        <Tab value="reservations">
          Reservations
          {!pendingReservationsQuery.isPending && pendingReservationCount > 0 && (
            <CounterBadge count={pendingReservationCount} color="danger" size="small" style={{ marginLeft: "6px" }} />
          )}
        </Tab>
        <Tab value="documents">
          {DOCUMENTS_SECTION_LABEL}
          {!pendingApprovalsQuery.isPending && pendingDocumentCount > 0 && (
            <CounterBadge count={pendingDocumentCount} color="danger" size="small" style={{ marginLeft: "6px" }} />
          )}
        </Tab>
      </TabList>

      {isReservationsSection && (
        <>
          <TabList
            className={styles.nestedTabs}
            selectedValue={reservationTab}
            onTabSelect={handleReservationTabChange}
            size="small"
          >
            <Tab value="pending">
              Pending
              {reservationTab === "pending" && !currentQuery.isPending && loadedCount > 0 && (
                <CounterBadge count={loadedCount} color="danger" size="small" style={{ marginLeft: "6px" }} />
              )}
            </Tab>
            <Tab value="approved">
              Approved
              {reservationTab === "approved" && !currentQuery.isPending && loadedCount > 0 && (
                <CounterBadge count={loadedCount} color="brand" size="small" style={{ marginLeft: "6px" }} />
              )}
            </Tab>
            <Tab value="rejected">
              Rejected
              {reservationTab === "rejected" && !currentQuery.isPending && loadedCount > 0 && (
                <CounterBadge count={loadedCount} color="informative" size="small" style={{ marginLeft: "6px" }} />
              )}
            </Tab>
          </TabList>

          {filterBar}

          {currentQuery.isPending && <Spinner label="Loading…" />}

          {currentQuery.isError && (
            <MessageBar intent="error">
              <MessageBarBody>Failed to load reservations. Please refresh.</MessageBarBody>
            </MessageBar>
          )}

          {currentQuery.data && (
            <div className={styles.content}>
              <ReservationQueueGrid
                reservations={filteredReservations}
                onSelect={(r) => setSelectedReservation(r)}
                emptyMessage={EMPTY_MESSAGES[reservationTab]}
                allRecordsCount={allReservationCount}
                onBulkApprove={isPendingReservationTab
                  ? (list) => { setBulkApproveList(list); setBulkDialogOpen(true); }
                  : undefined
                }
              />
            </div>
          )}

          {reservationTab === "approved" ? (
            <ReservationDrawingsPanel
              reservation={selectedReservation}
              onClose={() => setSelectedReservation(null)}
            />
          ) : (
            <ReservationDetailPanel
              reservation={selectedReservation}
              onClose={() => setSelectedReservation(null)}
              readonly={!isPendingReservationTab}
              onApproved={(num) =>
                dispatchToast(
                  <Toast><ToastTitle>{num} approved — numbers issued.</ToastTitle></Toast>,
                  { intent: "success" },
                )
              }
              onDeclined={(num) =>
                dispatchToast(
                  <Toast><ToastTitle>{num} declined.</ToastTitle></Toast>,
                  { intent: "warning" },
                )
              }
            />
          )}
        </>
      )}

      {isDocumentsSection && (
        <div className={styles.content}>
          {pendingApprovalsQuery.isPending && <Spinner label="Loading…" />}
          {pendingApprovalsQuery.isError && (
            <MessageBar intent="error">
              <MessageBarBody>Failed to load pending approvals. Please refresh.</MessageBarBody>
            </MessageBar>
          )}
          {!pendingApprovalsQuery.isPending && !pendingApprovalsQuery.isError && (
            <>
              <TabList
                className={styles.nestedTabs}
                selectedValue={documentTab}
                onTabSelect={handleDocumentTabChange}
                size="small"
              >
                <Tab value="checkout">
                  Check Out Requests
                  {checkoutRequestRows.length > 0 && (
                    <CounterBadge count={checkoutRequestRows.length} color="danger" size="small" style={{ marginLeft: "6px" }} />
                  )}
                </Tab>
                <Tab value="checkin">
                  Check In Validation
                  {checkinValidationRows.length > 0 && (
                    <CounterBadge count={checkinValidationRows.length} color="important" size="small" style={{ marginLeft: "6px" }} />
                  )}
                </Tab>
              </TabList>

              {filterBar}

              {documentTab === "checkout" ? (
                <CheckoutRequestQueueGrid
                  requests={checkoutRequestRows}
                  allRecordsCount={allCheckoutRequestRows.length}
                  onBulkApproveByBatch={openBulkCheckoutDialog}
                  bulkSubmitting={bulkCheckoutSubmitting}
                />
              ) : (
                <CheckinQueueGrid
                  checkins={checkinValidationRows}
                  allRecordsCount={allCheckinValidationRows.length}
                />
              )}
            </>
          )}
        </div>
      )}

      <BulkApproveDialog
        open={bulkDialogOpen}
        reservations={bulkApproveList}
        onClose={() => setBulkDialogOpen(false)}
        onConfirm={() => void handleBulkApprove()}
        isSubmitting={approveMutation.isPending}
      />

      <BulkCheckoutApproveDialog
        open={bulkCheckoutDialogOpen}
        groups={bulkCheckoutGroups}
        onClose={() => {
          if (!bulkCheckoutSubmitting) {
            setBulkCheckoutDialogOpen(false);
            setBulkCheckoutRows([]);
            setBulkCheckoutResult(null);
          }
        }}
        onConfirm={() => void handleBulkApproveByBatch()}
        isSubmitting={bulkCheckoutSubmitting}
        progress={bulkCheckoutProgress}
        result={bulkCheckoutResult}
      />
    </div>
  );
}
