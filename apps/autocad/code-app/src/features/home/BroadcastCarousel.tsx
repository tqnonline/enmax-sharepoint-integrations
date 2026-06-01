import { useEffect, useState } from "react";
import { Button, Text, tokens, makeStyles, mergeClasses } from "@fluentui/react-components";
import {
  Info20Filled, Warning20Filled, ErrorCircle20Filled, Megaphone20Filled,
  ChevronLeft16Regular, ChevronRight16Regular, Pin16Filled,
  type FluentIcon,
} from "@fluentui/react-icons";
import type { HomeBroadcast } from "./useHomeData";
import { broadcastSeverityIntent, type SeverityIntent } from "./homeUtils";
import { BroadcastDetailDialog } from "./BroadcastDetailDialog";

const ROTATE_MS = 6000;

// Severity → theme tokens (no hardcoded colors) + a matching glyph.
const SEV: Record<SeverityIntent, { bg: string; fg: string; border: string; Icon: FluentIcon }> = {
  info: { bg: tokens.colorNeutralBackground3, fg: tokens.colorNeutralForeground2, border: tokens.colorNeutralStroke1, Icon: Info20Filled },
  warning: { bg: tokens.colorStatusWarningBackground1, fg: tokens.colorStatusWarningForeground1, border: tokens.colorStatusWarningBorder1, Icon: Warning20Filled },
  error: { bg: tokens.colorStatusDangerBackground1, fg: tokens.colorStatusDangerForeground1, border: tokens.colorStatusDangerBorder1, Icon: ErrorCircle20Filled },
  success: { bg: tokens.colorStatusSuccessBackground1, fg: tokens.colorStatusSuccessForeground1, border: tokens.colorStatusSuccessBorder1, Icon: Megaphone20Filled },
};

const ellipsis = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const SLIDE_IN = { from: { opacity: "0", transform: "translateX(14px)" }, to: { opacity: "1", transform: "translateX(0)" } };
const BAR_GROW = { from: { transform: "scaleX(0)" }, to: { transform: "scaleX(1)" } };

const useStyles = makeStyles({
  card: {
    position: "relative",
    overflow: "hidden",
    borderRadius: tokens.borderRadiusLarge,
    borderLeftWidth: "4px",
    borderLeftStyle: "solid",
    boxShadow: tokens.shadow4,
  },
  progress: {
    position: "absolute", top: 0, left: 0, height: "2px", width: "100%",
    transformOrigin: "left",
    animationName: BAR_GROW, animationDuration: `${ROTATE_MS}ms`,
    animationTimingFunction: "linear", animationFillMode: "forwards",
    opacity: 0.55,
  },
  row: {
    display: "flex", alignItems: "center", gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    cursor: "pointer", minWidth: 0,
    ":hover": { backgroundColor: tokens.colorSubtleBackgroundHover },
    ":focus-visible": { outline: `2px solid ${tokens.colorStrokeFocus2}`, outlineOffset: "-2px" },
  },
  icon: { flexShrink: 0, display: "flex", fontSize: "24px" },
  slide: {
    flexGrow: 1, minWidth: 0,
    animationName: SLIDE_IN, animationDuration: "320ms",
    animationFillMode: "both", animationTimingFunction: "ease-out",
  },
  title: { display: "block", color: tokens.colorNeutralForeground1, ...ellipsis },
  body: { display: "block", color: tokens.colorNeutralForeground2, ...ellipsis },
  tail: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS, flexShrink: 0 },
  pin: { display: "flex", color: tokens.colorNeutralForeground3 },
  read: { whiteSpace: "nowrap", fontWeight: tokens.fontWeightSemibold },
  footer: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalL}`,
    borderTopWidth: tokens.strokeWidthThin, borderTopStyle: "solid",
    borderTopColor: tokens.colorNeutralStroke2,
  },
  dots: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS },
  dot: {
    width: "7px", height: "7px", padding: 0, border: "none",
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralStroke1, cursor: "pointer",
    transitionProperty: "transform, background-color", transitionDuration: tokens.durationNormal,
  },
  dotActive: { backgroundColor: tokens.colorNeutralForeground2, transform: "scale(1.25)" },
  nav: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXXS },
  counter: { color: tokens.colorNeutralForeground3, minWidth: "44px", textAlign: "center" },
});

/** Every active, role-targeted broadcast shown on Home as a single auto-rotating banner. Click opens a
 *  modal with the full content; non-pinned offer Acknowledge/Dismiss, pinned are sticky. Rotation +
 *  progress bar pause on hover or while the modal is open. */
export function BroadcastCarousel({ broadcasts }: { broadcasts: HomeBroadcast[] }) {
  const styles = useStyles();
  const [idx, setIdx] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const count = broadcasts.length;
  const modalOpen = openId !== null;

  // Auto-advance, paused while hovered or reading.
  useEffect(() => {
    if (count <= 1 || paused || modalOpen) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % count), ROTATE_MS);
    return () => clearInterval(t);
  }, [count, paused, modalOpen]);

  if (count === 0) return null;

  const safeIdx = Math.min(idx, count - 1);
  const b = broadcasts[safeIdx];
  const sev = SEV[broadcastSeverityIntent(b.severity)];
  const Icon = sev.Icon;
  const selected = openId ? broadcasts.find((x) => x.id === openId) ?? null : null;
  const open = (id: string) => setOpenId(id);

  return (
    <div
      className={styles.card}
      style={{ borderLeftColor: sev.border, backgroundColor: sev.bg }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {count > 1 && (
        <div
          key={`bar-${b.id}`}
          className={styles.progress}
          style={{ backgroundColor: sev.fg, animationPlayState: paused || modalOpen ? "paused" : "running" }}
        />
      )}

      <div
        className={styles.row}
        role="button"
        tabIndex={0}
        aria-label={`Open broadcast: ${b.title}`}
        onClick={() => open(b.id)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(b.id); } }}
      >
        <span className={styles.icon} style={{ color: sev.fg }}><Icon /></span>
        <div key={b.id} className={styles.slide}>
          <Text weight="semibold" size={300} className={styles.title}>{b.title}</Text>
          <Text size={200} className={styles.body}>{b.body}</Text>
        </div>
        <span className={styles.tail}>
          {b.pinned && <span className={styles.pin} title="Pinned"><Pin16Filled /></span>}
          <Text size={200} className={styles.read} style={{ color: sev.fg }}>Read →</Text>
        </span>
      </div>

      {count > 1 && (
        <div className={styles.footer}>
          <div className={styles.dots}>
            {broadcasts.map((bc, i) => (
              <button
                key={bc.id}
                type="button"
                className={mergeClasses(styles.dot, i === safeIdx && styles.dotActive)}
                aria-label={`Show broadcast ${i + 1} of ${count}`}
                aria-current={i === safeIdx}
                onClick={() => setIdx(i)}
              />
            ))}
          </div>
          <div className={styles.nav}>
            <Button
              size="small" appearance="subtle" icon={<ChevronLeft16Regular />}
              aria-label="Previous broadcast"
              onClick={() => setIdx((i) => (i - 1 + count) % count)}
            />
            <Text size={200} className={styles.counter}>{safeIdx + 1} of {count}</Text>
            <Button
              size="small" appearance="subtle" icon={<ChevronRight16Regular />}
              aria-label="Next broadcast"
              onClick={() => setIdx((i) => (i + 1) % count)}
            />
          </div>
        </div>
      )}

      <BroadcastDetailDialog broadcast={selected} open={modalOpen} onClose={() => setOpenId(null)} />
    </div>
  );
}
