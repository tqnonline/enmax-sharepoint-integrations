import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  makeStyles,
  tokens,
  Input,
  Button,
  Text,
  Tooltip,
  Badge,
  Spinner,
  Divider,
} from "@fluentui/react-components";
import {
  Search24Regular,
  Navigation24Regular,
  DocumentMultiple20Regular,
} from "@fluentui/react-icons";
import { NotificationBell } from "./NotificationBell";
import { useCurrentUser } from "../auth/useCurrentUser";
import { useUiStore } from "../store/uiStore";
import { useHeaderSearch, type HeaderSearchResult } from "./useHeaderSearch";
import { useCompositionLookups } from "../features/approvals/hooks/useCompositionLookups";
import { matchingGuidsFromQuery, guidsToCompositionFilter } from "../features/search/compositionQuery";
import {
  buildDocumentDetailUrl,
  buildSearchPageUrl,
  type HeaderSearchTab,
} from "../features/search/searchUrlState";
import { GLOBAL_SEARCH_PLACEHOLDER } from "../features/reserve/numberingTerms";
import enmaxLogo from "../assets/brand/ENX_Logo_RED.svg";

type BadgeColor = "success" | "warning" | "informative" | "subtle";

const STATE_BADGE: Record<string, BadgeColor> = {
  Available: "success",
  "Checked Out": "warning",
  "Awaiting Validation": "informative",
  "Checked In": "success",
  Finalized: "subtle",
  Obsolete: "subtle",
  Void: "subtle",
};

const TABS: { key: HeaderSearchTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "drawings", label: "Drawings" },
  { key: "documents", label: "Documents" },
];

function relativeTime(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const useStyles = makeStyles({
  root: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    alignItems: "center",
    columnGap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    minHeight: "52px",
    position: "relative",
    zIndex: 100,
  },
  brandGroup: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  logo: { height: "28px", flexShrink: 0 },
  title: {
    fontWeight: "600",
    whiteSpace: "nowrap",
    "@media (max-width: 768px)": { display: "none" },
  },
  searchArea: {
    display: "flex",
    justifyContent: "center",
    position: "relative",
  },
  searchInput: {
    width: "min(480px, 100%)",
  },
  dropdown: {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: "50%",
    transform: "translateX(-50%)",
    width: "min(580px, 90vw)",
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow16,
    zIndex: 9000,
    overflow: "hidden",
  },
  tabBar: {
    display: "flex",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: `0 ${tokens.spacingHorizontalS}`,
    gap: "2px",
  },
  tab: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    cursor: "pointer",
    border: "none",
    background: "none",
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    borderBottom: "2px solid transparent",
    fontFamily: "inherit",
    ":hover": { color: tokens.colorNeutralForeground1 },
  },
  tabActive: {
    color: tokens.colorBrandForeground1,
    borderBottomColor: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  dropdownItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    cursor: "pointer",
    textDecoration: "none",
    color: "inherit",
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  dropdownItemIcon: {
    color: tokens.colorNeutralForeground3,
    marginTop: "2px",
    flexShrink: 0,
  },
  dropdownItemBody: {
    flex: 1,
    minWidth: 0,
  },
  dropdownItemTitle: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    marginBottom: "2px",
    flexWrap: "wrap",
  },
  dropdownItemComp: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    letterSpacing: "0.04em",
    marginBottom: "2px",
  },
  dropdownItemMeta: {
    color: tokens.colorNeutralForeground3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  dropdownItemDate: {
    flexShrink: 0,
    color: tokens.colorNeutralForeground3,
    paddingLeft: tokens.spacingHorizontalS,
  },
  dropdownFooter: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    cursor: "pointer",
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  dropdownCenter: {
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalM}`,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    color: tokens.colorNeutralForeground3,
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    justifyContent: "flex-end",
  },
  userGreeting: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "2px",
  },
  userName: {
    color: tokens.colorNeutralForeground1,
    whiteSpace: "nowrap",
  },
  userJobTitle: {
    color: tokens.colorNeutralForeground3,
    whiteSpace: "nowrap",
  },
});

export function Header() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState("");
  const [highlighted, setHighlighted] = useState(-1);
  const [activeTab, setActiveTab] = useState<HeaderSearchTab>("all");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { data: lookups } = useCompositionLookups();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), 300);
    return () => clearTimeout(t);
  }, [value]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional highlight reset when result set changes
  useEffect(() => { setHighlighted(-1); }, [debounced, activeTab]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const matchingGuids = useMemo(
    () => (lookups ? matchingGuidsFromQuery(debounced, lookups) : undefined),
    [lookups, debounced],
  );

  const { data: results = [], isFetching } = useHeaderSearch(debounced, activeTab, matchingGuids);
  const showDropdown = open && value.trim().length >= 2;

  const searchReturnUrl = useCallback(() => buildSearchPageUrl({
    q: debounced,
    tab: activeTab,
    composition: guidsToCompositionFilter(matchingGuids),
  }), [debounced, activeTab, matchingGuids]);

  const handleSelect = useCallback((r: HeaderSearchResult) => {
    const returnTo = searchReturnUrl();
    navigate(buildDocumentDetailUrl({
      documentId: r.id,
      drawingId: r.drawingId,
      tab: r.tab,
      returnTo,
    }), { state: { returnTo } });
    setValue("");
    setOpen(false);
  }, [navigate, searchReturnUrl]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const idx = highlighted >= 0 ? highlighted : 0;
      if (results[idx]) handleSelect(results[idx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <header className={styles.root}>
      <div className={styles.brandGroup}>
        <Tooltip content="Toggle navigation" relationship="label">
          <Button
            appearance="subtle"
            icon={<Navigation24Regular />}
            onClick={toggleSidebar}
            aria-label="Toggle navigation"
          />
        </Tooltip>
        <img src={enmaxLogo} alt="ENMAX" className={styles.logo} />
        <Text className={styles.title}>EEC Generation Document Management system</Text>
      </div>

      <div className={styles.searchArea} ref={wrapperRef}>
        <Input
          className={styles.searchInput}
          contentBefore={<Search24Regular />}
          placeholder={GLOBAL_SEARCH_PLACEHOLDER}
          value={value}
          onChange={(_, d) => { setValue(d.value); setOpen(true); }}
          onFocus={() => { if (value.trim().length >= 2) setOpen(true); }}
          onKeyDown={handleKeyDown}
          aria-label="Search documents"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          autoComplete="off"
        />

        {showDropdown && (
          <div className={styles.dropdown} role="listbox">
            <div className={styles.tabBar} role="tablist">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  className={`${styles.tab}${activeTab === tab.key ? ` ${styles.tabActive}` : ""}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {isFetching && (
              <div className={styles.dropdownCenter}>
                <Spinner size="tiny" />
                <Text size={200}>Searching…</Text>
              </div>
            )}

            {!isFetching && results.length === 0 && (
              <div className={styles.dropdownCenter}>
                <Text size={200}>No documents for "{value}"</Text>
              </div>
            )}

            {!isFetching && results.map((r, i) => {
              const badgeColor = STATE_BADGE[r.stateLabel] ?? "informative";
              return (
                <div
                  key={`${r.tab}-${r.id}`}
                  className={styles.dropdownItem}
                  role="option"
                  aria-selected={i === highlighted}
                  style={i === highlighted ? { backgroundColor: tokens.colorNeutralBackground1Hover } : undefined}
                  onClick={() => handleSelect(r)}
                  onMouseEnter={() => setHighlighted(i)}
                >
                  <DocumentMultiple20Regular className={styles.dropdownItemIcon} />
                  <div className={styles.dropdownItemBody}>
                    <div className={styles.dropdownItemTitle}>
                      <Text size={300} weight="semibold" style={{ fontFamily: tokens.fontFamilyMonospace }}>
                        {r.documentNumber}
                      </Text>
                      <Badge appearance="tint" color={badgeColor} size="small">{r.stateLabel}</Badge>
                      <Badge appearance="outline" size="small">{r.typeLabel}</Badge>
                    </div>
                    {r.compositionSummary && (
                      <div className={styles.dropdownItemComp}>{r.compositionSummary}</div>
                    )}
                    <Text size={200} className={styles.dropdownItemMeta}>
                      {r.filename || r.title}
                    </Text>
                  </div>
                  <Text size={200} className={styles.dropdownItemDate}>
                    {relativeTime(r.revisionDate)}
                  </Text>
                </div>
              );
            })}

            {!isFetching && results.length > 0 && (
              <>
                <Divider />
                <div
                  className={styles.dropdownFooter}
                  onClick={() => {
                    navigate(searchReturnUrl());
                    setOpen(false);
                  }}
                >
                  <Text size={200} style={{ color: tokens.colorBrandForeground1 }}>
                    View all results for "{value}"
                  </Text>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <NotificationBell />
        <div className={styles.userGreeting}>
          <Text size={200} weight="semibold" className={styles.userName}>
            Welcome, {user?.displayName ?? "…"}
          </Text>
          {user?.jobTitle && (
            <Text size={100} className={styles.userJobTitle}>{user.jobTitle}</Text>
          )}
        </div>
      </div>
    </header>
  );
}
