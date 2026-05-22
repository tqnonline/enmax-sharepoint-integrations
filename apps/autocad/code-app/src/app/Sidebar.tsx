import { useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  makeStyles,
  tokens,
  Text,
  mergeClasses,
  Tooltip,
} from "@fluentui/react-components";
import {
  Home24Regular,
  DocumentAdd24Regular,
  Search24Regular,
  BookmarkMultiple24Regular,
  Checkmark24Regular,
  Database24Regular,
  History24Regular,
  Megaphone24Regular,
  Settings24Regular,
} from "@fluentui/react-icons";
import { type Role, useUserRole } from "../auth/useUserRole";
import { useUiStore } from "../store/uiStore";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    width: "220px",
    minWidth: "220px",
    backgroundColor: tokens.colorNeutralBackground2,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    transition: "width 0.2s ease",
    overflow: "hidden",
  },
  collapsed: { width: "52px", minWidth: "52px" },
  links: {
    display: "flex",
    flexDirection: "column",
    padding: tokens.spacingVerticalS,
    gap: 0,
  },
  groupSection: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
  },
  groupSectionSpacing: {
    marginTop: tokens.spacingVerticalL,
  },
  groupLabel: {
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalXXS}`,
    whiteSpace: "nowrap",
  },
  groupDivider: {
    height: "1px",
    backgroundColor: tokens.colorNeutralStroke2,
    margin: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
  },
  link: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    textDecoration: "none",
    color: tokens.colorNeutralForeground1,
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  collapsedLink: {
    justifyContent: "center",
    padding: tokens.spacingVerticalXXS,
    height: "44px",
  },
  active: { backgroundColor: tokens.colorNeutralBackground1Selected, fontWeight: "600" },
  label: { whiteSpace: "nowrap" },
});

type Destination = {
  label: string;
  path: string;
  roles: (Role | "All")[];
  icon: React.ReactNode;
};

type NavGroup = {
  label: string;
  destinations: Destination[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    destinations: [
      { label: "Home",      path: "/",          roles: ["All"],               icon: <Home24Regular /> },
      { label: "Reserve",   path: "/reserve",   roles: ["User", "Admin"],     icon: <DocumentAdd24Regular /> },
      { label: "My Reservations", path: "/my-items", roles: ["All"], icon: <BookmarkMultiple24Regular /> },
      { label: "Search",    path: "/search",    roles: ["All"],               icon: <Search24Regular /> },
      { label: "Approvals", path: "/approvals", roles: ["Approver", "Admin"], icon: <Checkmark24Regular /> },
    ],
  },
  {
    label: "Administration",
    destinations: [
      { label: "Reference Data", path: "/reference-data", roles: ["Admin"], icon: <Database24Regular /> },
      { label: "Audit",          path: "/audit",          roles: ["Admin"], icon: <History24Regular /> },
      { label: "Broadcasts",     path: "/broadcasts",     roles: ["Admin"], icon: <Megaphone24Regular /> },
      { label: "Settings",       path: "/settings",       roles: ["All"],   icon: <Settings24Regular /> },
    ],
  },
];

export function Sidebar() {
  const styles = useStyles();
  const { role } = useUserRole();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const { pathname } = useLocation();

  const visibleGroups = useMemo(
    () =>
      NAV_GROUPS.map((g) => ({
        ...g,
        destinations: g.destinations.filter(
          (d) => d.roles.includes("All") || d.roles.includes(role),
        ),
      })).filter((g) => g.destinations.length > 0),
    [role],
  );

  return (
    <nav
      className={mergeClasses(styles.root, collapsed && styles.collapsed)}
      aria-label="Navigation"
    >
      <div className={styles.links}>
        {visibleGroups.map((group, gi) => (
          <div
            key={group.label}
            className={mergeClasses(styles.groupSection, gi > 0 && styles.groupSectionSpacing)}
          >
            {collapsed ? (
              gi > 0 && <div className={styles.groupDivider} />
            ) : (
              <Text className={styles.groupLabel}>{group.label}</Text>
            )}

            {group.destinations.map((d) =>
              collapsed ? (
                <Tooltip key={d.path} content={d.label} relationship="label" positioning="after">
                  <NavLink
                    to={d.path}
                    end={d.path === "/"}
                    className={mergeClasses(styles.link, styles.collapsedLink, pathname === d.path && styles.active)}
                    aria-current={pathname === d.path ? "page" : undefined}
                  >
                    {d.icon}
                  </NavLink>
                </Tooltip>
              ) : (
                <NavLink
                  key={d.path}
                  to={d.path}
                  end={d.path === "/"}
                  className={mergeClasses(styles.link, pathname === d.path && styles.active)}
                  aria-current={pathname === d.path ? "page" : undefined}
                >
                  {d.icon}
                  <Text className={styles.label}>{d.label}</Text>
                </NavLink>
              )
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}
