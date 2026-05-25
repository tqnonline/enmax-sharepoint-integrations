import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Link,
  MessageBar,
  MessageBarBody,
  Select,
  Spinner,
  Switch,
  Text,
  Title2,
  Title3,
  Toast,
  ToastTitle,
  Toaster,
  makeStyles,
  tokens,
  useToastController,
} from "@fluentui/react-components";
import { useUiStore } from "../../store/uiStore";
import { useUserRole } from "../../auth/useUserRole";
import { useAppConfig } from "../../config/useAppConfig";
import { useUserPreferences, useSaveUserPreferences } from "./useUserPreferences";
import { useDiagnostics } from "../../lib/diagnostics";
import { APP_VERSION, APP_BUILD_DATE } from "../../lib/version";
import { Enmax_autocadappconfigsService } from "../../generated";

const TOASTER_ID = "settings-toaster";

const useStyles = makeStyles({
  root:    { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXL, maxWidth: "600px" },
  section: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM },
  row:     { display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalM },
  divider: { borderTop: `1px solid ${tokens.colorNeutralStroke2}`, margin: `${tokens.spacingVerticalM} 0` },
  aboutGrid: { display: "grid", gridTemplateColumns: "160px 1fr", gap: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}` },
});

export function SettingsPage() {
  const styles = useStyles();
  const { role } = useUserRole();
  const isAdmin = role === "Admin";
  const config  = useAppConfig();
  const { dispatchToast } = useToastController(TOASTER_ID);
  const queryClient = useQueryClient();

  const { themeOverride, setThemeOverride, viewAsEndUser, setViewAsEndUser } = useUiStore();
  const { on: diagnosticsOn, setOn: setDiagnosticsOn } = useDiagnostics();
  const prefsQuery = useUserPreferences();
  const savePrefsMutation = useSaveUserPreferences();

  const [emailEnabled, setEmailEnabled] = useState(true);
  const [teamsEnabled, setTeamsEnabled] = useState(true);
  const [singleAdminConfirmOpen, setSingleAdminConfirmOpen] = useState(false);
  const [savingAdminMode, setSavingAdminMode]               = useState(false);

  useEffect(() => {
    if (prefsQuery.data) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- initialise editable toggles from fetched prefs
      setEmailEnabled(prefsQuery.data.emailEnabled);
      setTeamsEnabled(prefsQuery.data.teamsEnabled);
    }
  }, [prefsQuery.data]);

  async function savePreferences(email: boolean, teams: boolean) {
    try {
      await savePrefsMutation.mutateAsync({
        id:           prefsQuery.data?.id ?? null,
        emailEnabled: email,
        teamsEnabled: teams,
      });
      dispatchToast(<Toast><ToastTitle>Preferences saved.</ToastTitle></Toast>, { intent: "success" });
    } catch {
      dispatchToast(<Toast><ToastTitle>Failed to save preferences.</ToastTitle></Toast>, { intent: "error" });
    }
  }

  async function setSingleAdminMode(next: boolean) {
    setSavingAdminMode(true);
    setSingleAdminConfirmOpen(false);
    try {
      const rows = await Enmax_autocadappconfigsService.getAll({
        filter: "enmax_acdnkey eq 'SingleAdminMode'",
        select: ["enmax_autocadappconfigid"],
      });
      const id = rows.data?.[0]?.enmax_autocadappconfigid;
      if (!id) {
        dispatchToast(<Toast><ToastTitle>Config row 'SingleAdminMode' not found — seed it first.</ToastTitle></Toast>, { intent: "error" });
        return;
      }
      await Enmax_autocadappconfigsService.update(id, { enmax_acdnvalue: next ? "true" : "false" } as Parameters<typeof Enmax_autocadappconfigsService.update>[1]);
      await queryClient.invalidateQueries({ queryKey: ["app-config"] });
      dispatchToast(<Toast><ToastTitle>Single Admin Mode {next ? "enabled" : "disabled"}.</ToastTitle></Toast>, { intent: next ? "warning" : "success" });
    } catch {
      dispatchToast(<Toast><ToastTitle>Failed to update Single Admin Mode.</ToastTitle></Toast>, { intent: "error" });
    } finally {
      setSavingAdminMode(false);
    }
  }

  return (
    <div>
      <Toaster toasterId={TOASTER_ID} />
      <Title2 as="h1" style={{ marginBottom: tokens.spacingVerticalL }}>Settings</Title2>

      {/* View as end user sticky banner */}
      {viewAsEndUser && (
        <MessageBar intent="warning" style={{ marginBottom: tokens.spacingVerticalM }}>
          <MessageBarBody>
            Viewing as end user.{" "}
            <Link onClick={() => setViewAsEndUser(false)}>Disable</Link>
          </MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.root}>
        {/* Theme */}
        <section className={styles.section} aria-labelledby="theme-heading">
          <Title3 id="theme-heading">Theme</Title3>
          <div className={styles.row}>
            <Text>Display theme</Text>
            <Select
              value={themeOverride ?? "system"}
              onChange={(_, d) => setThemeOverride(d.value as "light" | "dark" | "system" | null)}
              aria-label="Theme"
              style={{ width: "160px" }}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </Select>
          </div>
        </section>

        <div className={styles.divider} />

        {/* Notification preferences */}
        <section className={styles.section} aria-labelledby="notif-heading">
          <Title3 id="notif-heading">Notification Preferences</Title3>
          {prefsQuery.isPending && <Spinner size="tiny" />}

          <div className={styles.row}>
            <div>
              <Text block weight="semibold">Email notifications</Text>
              <Text size={200}>Receive reservation and checkout updates by email</Text>
            </div>
            <Switch
              checked={emailEnabled}
              onChange={(_, d) => {
                setEmailEnabled(d.checked);
                void savePreferences(d.checked, teamsEnabled);
              }}
              aria-label="Email notifications"
            />
          </div>

          <div className={styles.row}>
            <div>
              <Text block weight="semibold">Teams notifications</Text>
              <Text size={200}>Receive adaptive card notifications in Microsoft Teams</Text>
            </div>
            <Switch
              checked={teamsEnabled}
              onChange={(_, d) => {
                setTeamsEnabled(d.checked);
                void savePreferences(emailEnabled, d.checked);
              }}
              aria-label="Teams notifications"
            />
          </div>

          <div className={styles.row}>
            <div>
              <Text block weight="semibold">In-app notifications</Text>
              <Text size={200}>Bell notifications in the app (always enabled)</Text>
            </div>
            <Switch checked disabled aria-label="In-app notifications (always on)" />
          </div>
        </section>

        {/* Admin-only section */}
        {isAdmin && (
          <>
            <div className={styles.divider} />
            <section className={styles.section} aria-labelledby="admin-heading">
              <Title3 id="admin-heading">Administrator</Title3>

              <div className={styles.row}>
                <div>
                  <Text block weight="semibold">Single Admin Mode</Text>
                  <Text size={200}>Locks out end users from state-changing actions</Text>
                </div>
                <Button
                  appearance={config.SingleAdminMode ? "secondary" : "primary"}
                  disabled={savingAdminMode}
                  onClick={() => config.SingleAdminMode ? void setSingleAdminMode(false) : setSingleAdminConfirmOpen(true)}
                  aria-label={config.SingleAdminMode ? "Disable Single Admin Mode" : "Enable Single Admin Mode"}
                >
                  {config.SingleAdminMode ? "Disable" : "Enable"}
                </Button>
              </div>

              {config.SingleAdminMode && (
                <div className={styles.row}>
                  <div>
                    <Text block weight="semibold">View as end user</Text>
                    <Text size={200}>Preview the end-user experience without logging out</Text>
                  </div>
                  <Switch
                    checked={viewAsEndUser}
                    onChange={(_, d) => setViewAsEndUser(d.checked)}
                    aria-label="View as end user"
                  />
                </div>
              )}
            </section>
          </>
        )}

        <div className={styles.divider} />

        {/* Troubleshooting */}
        <section className={styles.section} aria-labelledby="diag-heading">
          <Title3 id="diag-heading">Troubleshooting</Title3>
          <div className={styles.row}>
            <div>
              <Text block weight="semibold">Diagnostics Mode</Text>
              <Text size={200}>
                Logs data &amp; API operations to the browser console (F12) to help diagnose issues.
                Secrets are redacted, and it turns off when you close the tab.
              </Text>
            </div>
            <Switch
              checked={diagnosticsOn}
              onChange={(_, d) => setDiagnosticsOn(d.checked)}
              aria-label="Diagnostics Mode"
            />
          </div>
        </section>

        <div className={styles.divider} />

        {/* About */}
        <section className={styles.section} aria-labelledby="about-heading">
          <Title3 id="about-heading">About</Title3>
          <div className={styles.aboutGrid}>
            <Text>Version</Text>         <Text>{APP_VERSION}</Text>
            <Text>Release Date</Text>    <Text>{APP_BUILD_DATE}</Text>
            <Text>Disclaimer</Text>      <Text size={200}>{config.FooterDisclaimer}</Text>
            <Text>Copyright</Text>       <Text size={200}>{config.FooterCopyright}</Text>
          </div>
        </section>
      </div>

      {/* Single Admin Mode confirm dialog */}
      <Dialog open={singleAdminConfirmOpen} onOpenChange={(_, d) => setSingleAdminConfirmOpen(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Enable Single Admin Mode?</DialogTitle>
            <DialogContent>
              All end users will be locked out of state-changing actions until you disable Single Admin Mode. Continue?
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setSingleAdminConfirmOpen(false)}>Cancel</Button>
              <Button appearance="primary" onClick={() => void setSingleAdminMode(true)}>Enable</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
