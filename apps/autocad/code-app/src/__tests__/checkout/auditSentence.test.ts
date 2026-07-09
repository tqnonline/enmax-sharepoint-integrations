import { formatAuditSentence } from "../../features/checkout/hooks/auditSentence";
import {
  DOCUMENT_SUBTYPE_VALUE,
  RESERVATION_TYPE_VALUE,
} from "../../features/reserve/terminology";

test("state-change reads as a sentence with from→to, date, actor", () => {
  const s = formatAuditSentence({
    id: "1",
    event: 2,
    eventLabel: "State Changed",
    fromState: "Available",
    toState: "Checked Out",
    actedBy: "M365 Developer",
    reason: "",
    createdOn: "2026-05-24T11:10:00Z",
  });
  expect(s).toMatch(/^M365 Developer changed state from Available to Checked Out on .+\.$/);
});

test("event without states omits transition", () => {
  const s = formatAuditSentence({
    id: "2",
    event: 1,
    eventLabel: "Created",
    fromState: "",
    toState: "",
    actedBy: "Alice",
    reason: "",
    createdOn: "2026-05-24T10:00:00Z",
  });
  expect(s).toContain("Alice created the drawing document on");
  expect(s).not.toContain("from");
});

test("uses procedure form noun for procedure taxonomy", () => {
  const s = formatAuditSentence(
    {
      id: "3",
      event: 1,
      eventLabel: "Created",
      fromState: "",
      toState: "",
      actedBy: "Bob",
      reason: "",
      createdOn: "2026-05-24T10:00:00Z",
    },
    {
      reservationType: RESERVATION_TYPE_VALUE.Document,
      documentSubtype: DOCUMENT_SUBTYPE_VALUE.Procedure,
    },
  );
  expect(s).toContain("Bob created the procedure form on");
});

test("uses standard document noun for standard taxonomy", () => {
  const s = formatAuditSentence(
    {
      id: "4",
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
