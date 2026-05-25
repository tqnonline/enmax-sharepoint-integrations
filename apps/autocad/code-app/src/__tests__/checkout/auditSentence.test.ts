import { formatAuditSentence } from "../../features/checkout/hooks/auditSentence";

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
  expect(s).toContain("Alice created the drawing on");
  expect(s).not.toContain("from");
});
