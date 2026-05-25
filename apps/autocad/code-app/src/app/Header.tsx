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
import { useHeaderSearch, type HeaderSearchResult, type MatchingGuids } from "./useHeaderSearch";
import { useCompositionLookups } from "../features/approvals/hooks/useCompositionLookups";
import enmaxLogo from "../assets/brand/ENX_Logo_RED.svg";

type BadgeColor = "success" | "warning" | "informative" | "subtle";
const STATUS: Record<number, { label: string; color: BadgeColor }> = {
  1: { label: "Pending",  color: "informative" },
  2: { label: "Approved", color: "success" },
  3: { label: "Declined", color: "subtle" },
};

type SearchTab = "all" | "pending" | "approved" | "rejected";
const TAB_STATUS: Record<SearchTab, number | undefined> = {
  all: undefined, pending: 1, approved: 2, rejected: 3,
};
const TABS: { key: SearchTab; label: string }[] = [
  { key: "all",      label: "All" },
  { key: "pending",  label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

function relativeTime(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
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
  const styles      = useStyles();
  const navigate    = useNavigate();
  const { data: user }  = useCurrentUser();
  const toggleSidebar   = useUiStore((s) => s.toggleSidebar);

  const [value, setValue]         = useState("");
  const [open, setOpen]           = useState(false);
  const [debounced, setDebounced] = useState("");
  const [highlighted, setHighlighted] = useState(-1);
  const [activeTab, setActiveTab] = useState<SearchTab>("all");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { data: lookups } = useCompositionLookups();

  // Debounce input → query
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), 300);
    return () => clearTimeout(t);
  }, [value]);

  // Reset highlight when results change
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional highlight reset when result set changes
  useEffect(() => { setHighlighted(-1); }, [debounced, activeTab]);

  // Click outside → close
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const matchingGuids = useMemo((): MatchingGuids | undefined => {
    if (!lookups || debounced.trim().length < 2) return undefined;
    const q = debounced.trim().toLowerCase();

    // Composition search: "DG-VS-00" → positional match (part[0]=biz, part[1]=asset, ...)
    const parts = q.split("-").filter((p) => p.length > 0);
    if (parts.length >= 2) {
      const [p0 = "", p1 = "", p2 = "", p3 = "", p4 = "", p5 = ""] = parts;
      const ids = (map: Map<string, string>, part: string) =>
        part ? [...map.entries()].filter(([, c]) => c.toLowerCase().startsWith(part)).map(([id]) => id) : [];
      return {
        businessIds: ids(lookups.bizMap,    p0),
        assetIds:    ids(lookups.assetMap,  p1),
        unitIds:     ids(lookups.unitMap,   p2),
        domainIds:   ids(lookups.domainMap, p3),
        systemIds:   ids(lookups.sysMap,    p4),
        kindIds:     ids(lookups.kindMap,   p5),
        positional:  true,
      };
    }

    // Single-token search: substring match across all lookup codes
    return {
      businessIds: [...lookups.bizMap.entries()].filter(([, code]) => code.toLowerCase().includes(q)).map(([id]) => id),
      assetIds:    [...lookups.assetMap.entries()].filter(([, code]) => code.toLowerCase().includes(q)).map(([id]) => id),
      unitIds:     [...lookups.unitMap.entries()].filter(([, code]) => code.toLowerCase().includes(q)).map(([id]) => id),
      domainIds:   [...lookups.domainMap.entries()].filter(([, code]) => code.toLowerCase().includes(q)).map(([id]) => id),
      systemIds:   [...lookups.sysMap.entries()].filter(([, code]) => code.toLowerCase().includes(q)).map(([id]) => id),
      kindIds:     [...lookups.kindMap.entries()].filter(([, code]) => code.toLowerCase().includes(q)).map(([id]) => id),
    };
  }, [lookups, debounced]);

  const { data: results = [], isFetching } = useHeaderSearch(debounced, TAB_STATUS[activeTab], matchingGuids);
  const showDropdown = open && value.trim().length >= 2;

  const handleSelect = useCallback((r: HeaderSearchResult) => {
    navigate(`/reservations/${r.id}`);
    setValue("");
    setOpen(false);
  }, [navigate]);

  function buildComp(r: HeaderSearchResult): string {
    if (!lookups) return "";
    const parts = [
      r.businessId ? lookups.bizMap.get(r.businessId)   : undefined,
      r.assetId    ? lookups.assetMap.get(r.assetId)    : undefined,
      r.unitId     ? lookups.unitMap.get(r.unitId)      : undefined,
      r.domainId   ? lookups.domainMap.get(r.domainId)  : undefined,
      r.systemId   ? lookups.sysMap.get(r.systemId)     : undefined,
      r.kindId     ? lookups.kindMap.get(r.kindId)      : undefined,
    ].filter(Boolean);
    return parts.join("-");
  }

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
      {/* Left: nav toggle + brand */}
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
        <Text className={styles.title}>AutoCAD Document Numbering</Text>
      </div>

      {/* Centre: search */}
      <div className={styles.searchArea} ref={wrapperRef}>
        <Input
          className={styles.searchInput}
          contentBefore={<Search24Regular />}
          placeholder="Search reservations…"
          value={value}
          onChange={(_, d) => { setValue(d.value); setOpen(true); }}
          onFocus={() => { if (value.trim().length >= 2) setOpen(true); }}
          onKeyDown={handleKeyDown}
          aria-label="Search reservations"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          autoComplete="off"
        />

        {showDropdown && (
          <div className={styles.dropdown} role="listbox">
            {/* Tabs */}
            <div className={styles.tabBar} role="tablist">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
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
                <Text size={200}>No results for "{value}"</Text>
              </div>
            )}

            {!isFetching && results.map((r, i) => {
              const s = STATUS[r.status] ?? STATUS[1];
              const comp = buildComp(r);
              return (
                <div
                  key={r.id}
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
                        {r.number}
                      </Text>
                      <Badge appearance="tint" color={s.color} size="small">{s.label}</Badge>
                    </div>
                    {comp && (
                      <div className={styles.dropdownItemComp}>{comp}</div>
                    )}
                    <Text size={200} className={styles.dropdownItemMeta}>
                      {r.creatorName ? `${r.creatorName}` : ""}
                      {r.creatorName && r.reason ? " · " : ""}
                      {r.reason ? r.reason.slice(0, 80) : ""}
                    </Text>
                  </div>
                  <Text size={200} className={styles.dropdownItemDate}>
                    {relativeTime(r.createdon)}
                  </Text>
                </div>
              );
            })}

            {!isFetching && results.length > 0 && (
              <>
                <Divider />
                <div
                  className={styles.dropdownFooter}
                  onClick={() => { navigate(`/search?q=${encodeURIComponent(value)}`); setOpen(false); }}
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

      {/* Right: actions */}
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
