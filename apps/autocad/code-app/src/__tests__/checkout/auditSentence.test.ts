import { formatAuditSentence, lifecycleStepLabel, collapseDuplicateAllocated } from "../../features/checkout/hooks/auditSentence";
import {
  DOCUMENT_SUBTYPE_VALUE,
  RESERVATION_TYPE_VALUE,
} from "../../features/reserve/terminology";

test("check-out request reads as a lifecycle sentence", () => {
  const ev = {
    id: "1",
    event: 2,
    eventLabel: "State Changed",
    fromState: "Available",
    toState: "CheckoutRequested",
    actedBy: "M365 Developer",
    reason: "",
    createdOn: "2026-05-24T11:10:00Z",
  };
  expect(lifecycleStepLabel(ev)).toBe("Check-out requested");
  const s = formatAuditSentence(ev);
  expect(s).toMatch(/^M365 Developer requested check-out for the drawing sheet on .+\.$/);
});

test("check-in completion reads as checked in", () => {
  const ev = {
    id: "2",
    event: 3,
    eventLabel: "Approval Granted",
    fromState: "AwaitingValidation",
    toState: "Available",
    actedBy: "Heather",
    reason: "",
    createdOn: "2026-05-24T12:00:00Z",
  };
  expect(lifecycleStepLabel(ev)).toBe("Checked in");
  expect(formatAuditSentence(ev)).toContain("Heather checked in the drawing sheet on");
});

test("allocation reads as allocated", () => {
  const s = formatAuditSentence({
    id: "3",
    event: 1,
    eventLabel: "Created",
    fromState: "",
    toState: "Allocated",
    actedBy: "Bob",
    reason: "",
    createdOn: "2026-05-24T10:00:00Z",
  });
  expect(s).toContain("Bob allocated the drawing sheet on");
});

test("uses procedure form noun for procedure taxonomy", () => {
  const s = formatAuditSentence(
    {
      id: "4",
      event: 1,
      eventLabel: "Created",
      fromState: "",
      toState: "Allocated",
      actedBy: "Bob",
      reason: "",
      createdOn: "2026-05-24T10:00:00Z",
    },
    {
      reservationType: RESERVATION_TYPE_VALUE.Document,
      documentSubtype: DOCUMENT_SUBTYPE_VALUE.Procedure,
    },
  );
  expect(s).toContain("Bob allocated the procedure on");
});

test("uses standard document noun for standard taxonomy", () => {
  const s = formatAuditSentence(
    {
      id: "5",
      event: 9,
      eventLabel: "Finalized",
      fromState: "",
      toState: "",
      actedBy: "Carol",
      reason: "",
      createdOn: "2026-05-24T10:00:00Z",
    },
    {
      reservationType: RESERVATION_TYPE_VALUE.Document,
      documentSubtype: DOCUMENT_SUBTYPE_VALUE.Standard,
    },
  );
  expect(s).toContain("Carol finalized the standard document on");
});

test("collapseDuplicateAllocated keeps a single earliest Allocated row", () => {
  const events = [
    {
      id: "a1",
      event: 1,
      eventLabel: "Created",
      fromState: "",
      toState: "Allocated",
      actedBy: "SYSTEM",
      reason: "",
      createdOn: "2026-05-24T10:00:01Z",
    },
    {
      id: "a0",
      event: 1,
      eventLabel: "Created",
      fromState: "",
      toState: "Allocated",
      actedBy: "SYSTEM",
      reason: "",
      createdOn: "2026-05-24T10:00:00Z",
    },
    {
      id: "c1",
      event: 2,
      eventLabel: "State Changed",
      fromState: "Available",
      toState: "CheckedOut",
      actedBy: "Bob",
      reason: "",
      createdOn: "2026-05-24T11:00:00Z",
    },
  ];
  const collapsed = collapseDuplicateAllocated(events);
  expect(collapsed.filter((e) => e.toState === "Allocated")).toHaveLength(1);
  expect(collapsed.find((e) => e.toState === "Allocated")?.id).toBe("a0");
  expect(collapsed).toContainEqual(events[2]);
});
