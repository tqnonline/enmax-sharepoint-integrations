import { type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { makeStyles, tokens } from "@fluentui/react-components";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { CommandBar } from "./CommandBar";
import { Footer } from "./Footer";
import { MaintenanceBanner } from "./MaintenanceBanner";
import { DiagnosticsIndicator } from "./DiagnosticsIndicator";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    overflow: "hidden",
  },
  skipNav: {
    position: "absolute",
    top: tokens.spacingVerticalS,
    left: tokens.spacingHorizontalS,
    zIndex: 9999,
    transform: "translateY(-200%)",
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    textDecoration: "none",
    ":focus": { transform: "translateY(0)" },
  },
  body: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
    minHeight: 0,
  },
  main: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    overflow: "hidden",
    minHeight: 0,
  },
  content: {
    flex: 1,
    overflow: "auto",
    minHeight: 0,
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalXL}`,
  },
  contentFullBleed: {
    flex: 1,
    overflow: "auto",
    minHeight: 0,
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
    paddingLeft: `max(clamp(${tokens.spacingHorizontalM}, 2vw, ${tokens.spacingHorizontalXXL}), env(safe-area-inset-left, 0px))`,
    paddingRight: `max(clamp(${tokens.spacingHorizontalM}, 2vw, ${tokens.spacingHorizontalXXL}), env(safe-area-inset-right, 0px))`,
    WebkitOverflowScrolling: "touch",
  },
  contentInner: {
    width: "100%",
    maxWidth: "1600px",
    margin: "0 auto",
  },
  contentInnerFullBleed: {
    width: "100%",
    maxWidth: "none",
    margin: 0,
  },
  contentSearch: {
    flex: 1,
    overflow: "hidden",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
  },
  contentInnerSearch: {
    width: "100%",
    maxWidth: "none",
    margin: 0,
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },
});

function isFullBleedRoute(pathname: string): boolean {
  return pathname.includes("/search/documents/")
    || pathname.includes("/reservations/");
}

function isSearchListRoute(pathname: string): boolean {
  return pathname === "/search" || pathname.endsWith("/search");
}

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const styles = useStyles();
  const { pathname } = useLocation();
  const fullBleed = isFullBleedRoute(pathname);
  const searchList = isSearchListRoute(pathname);
  const contentClass = fullBleed
    ? styles.contentFullBleed
    : searchList
      ? styles.contentSearch
      : styles.content;
  const innerClass = fullBleed
    ? styles.contentInnerFullBleed
    : searchList
      ? styles.contentInnerSearch
      : styles.contentInner;

  return (
    <div className={styles.root}>
      <a href="#main-content" className={styles.skipNav}>Skip to main content</a>
      <MaintenanceBanner />
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <main className={styles.main}>
          <CommandBar />
          <div
            className={contentClass}
            id="main-content"
          >
            <div className={innerClass}>
              {children}
            </div>
          </div>
        </main>
      </div>
      <Footer />
      <DiagnosticsIndicator />
    </div>
  );
}
