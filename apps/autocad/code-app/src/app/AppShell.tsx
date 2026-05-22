import { type ReactNode } from "react";
import { makeStyles, tokens } from "@fluentui/react-components";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { CommandBar } from "./CommandBar";
import { Footer } from "./Footer";
import { MaintenanceBanner } from "./MaintenanceBanner";

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
  contentInner: {
    width: "100%",
    maxWidth: "1600px",
    margin: "0 auto",
  },
});

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const styles = useStyles();

  return (
    <div className={styles.root}>
      <a href="#main-content" className={styles.skipNav}>Skip to main content</a>
      <MaintenanceBanner />
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <main className={styles.main}>
          <CommandBar />
          <div className={styles.content} id="main-content">
            <div className={styles.contentInner}>
              {children}
            </div>
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
}
