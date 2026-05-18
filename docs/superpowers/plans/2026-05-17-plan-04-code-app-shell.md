# Plan #04 — Code App Shell (Fluent UI v9 + Routing + App Config + Auth)

**Date:** 2026-05-17
**Owner:** Engineering (Claude Code agent + one human reviewer: Rahul Akmol)
**Spec:** `2026-05-17-phase-1-cut-line-spec.md`
**PRD refs:** sections 6 (info arch + screens), 12 (security), 13 (App Config), 15 (stack), 16 (UX system), 17 (two-app split), 22 (deterministic seeds)
**Decisions:** `2026-05-17-open-questions-decision-memo.md`
**Estimated effort:** 10–14 hours (one long day; theme + bootstrap are the slow parts)
**Branch:** `feat/004-code-app-shell` → PR to `dev`
**Blocked by:**
- Plan #01 merged to `dev` (Code App scaffold exists)
- Plan #02 merged to `dev` (App Configuration table + seed values exist so bootstrap has something to read)
- **Plan #03 NOT required** — shell does not invoke the IssueNumbers custom action; that wiring lives in plan #05

## Context

This plan delivers the empty Code App shell: the persistent visual frame every feature page will render inside. Per PRD section 6, the shell is a Model-Driven-App-style layout with sidebar navigation, command bar, header (brand + global search + bell + user menu), maintenance banner, and footer. Every top-level destination from PRD section 6 ships as a placeholder route ("coming in plan #N") so navigation can be exercised end-to-end before any feature lands.

After this plan merges, plans #05–#08 add feature pages by replacing the placeholders one at a time. The shell itself is feature-complete: theme, routing, auth, App Config bootstrap, bell-panel structure, and maintenance-banner behaviour are all wired and tested.

This plan does **not** ship: the reservation wizard, search grid, approvals queue, reference-data editor, audit log viewer, broadcast author, settings, or any data-fetching beyond App Configuration. Those are plans #05–#08.

## Prerequisites

- Plan #01 merged. `apps/code-app/` scaffold present (Vite + React 18 + TypeScript + Fluent UI v9 + tests). `power-apps init` was **deferred** from plan #01 and is the first step of this plan.
- Plan #02 merged. App Configuration table populated with 21 seeded rows including `BrandPrimary`, `BrandSecondary`, `BrandAccent`, `DefaultTheme`, `SingleAdminMode`, `MaintenanceBanner*`, `FooterDisclaimer`, `FooterCopyright`.
- Dev tenant environment ID known and stored as `DEV_POWER_APPS_ENV_ID` GitHub secret.
- Dev app play URL (returned by first `power-apps push`) captured as `DEV_APP_PLAY_URL` secret.
- ENMAX brand SVGs available in `.worktrees/specs/docs/superpowers/specs/_assets/design/branding/_svg/` (`ENX_Logo_RED.svg`, `ENX_Logo_WHITE.svg`, `ENX_Logo_BLACK.svg`) — copy into `apps/code-app/src/assets/brand/` in Step 2.
- Service account holds Basic User role in dev tenant per PRD section 12.3.
- All three Entra security groups (`sg-enmax-autocad-users/approvers/admins`) exist with at least one test user in each (runbook #002).

## Out of Scope for This Plan

- Feature pages (Reserve wizard, Search grid, My Items, Approvals queue, Reference Data editor, Audit log viewer, Broadcasts author, Settings detail). Each destination ships as a placeholder page with a one-line "implemented in plan #N" note.
- Any Dataverse data fetching beyond App Configuration (no Reservation, Drawing, Sheet, etc. queries — they belong to feature plans).
- In-app notification feed content (panel structure ships, real queries land in plan #08).
- Global search behaviour (input ships in header; result wiring is plan #07).
- CSV export, column visibility, column filters on grids (no grids ship in this plan).
- Real broadcast banner content (maintenance banner ships; broadcast banner is plan #08).
- Model-driven Administration app authoring (plan #02 schema is sufficient; the model-driven app is auto-generated when needed — separate runbook activity, not a plan).

## Step 1 — Bind Code App workspace to dev environment

Deferred from plan #01 because it requires a real environment ID.

```powershell
Set-Location apps/code-app
npx power-apps init `
  --displayName "Enmax AutoCAD Document Numbering" `
  --environmentId $env:DEV_POWER_APPS_ENV_ID
```

This generates / updates `apps/code-app/power.config.json` (gitignored) and provisions the Power Apps host registration in the dev tenant. The app is now publishable but has no real UI yet.

**Verification:** `npx power-apps run` starts the local dev server, opens a browser tab against `https://localhost:<port>/...?env=<DEV_ENV_ID>`, the Power Apps host loads, SSO completes, and the Vite default page renders inside the host frame.

## Step 2 — Brand assets + Fluent UI v9 theme

**Copy brand SVGs:**

```powershell
$src = "..\..\.worktrees\specs\docs\superpowers\specs\_assets\design\branding\_svg"
$dst = "src\assets\brand"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item "$src\ENX_Logo_RED.svg"   "$dst\"
Copy-Item "$src\ENX_Logo_WHITE.svg" "$dst\"
Copy-Item "$src\ENX_Logo_BLACK.svg" "$dst\"
```

**Brand variants + themes** (`src/theme/brand.ts`):

Per PRD section 16:
- Primary: Cinnabar `#E1393E` (light) / `#FF6B73` (dark)
- Secondary: Chathams Blue `#0F487A` (light) / `#5BA3E8` (dark)
- Accent: Marzipan `#F7DB9C` (light) / `#E8C76A` (dark)

```typescript
// src/theme/brand.ts
import {
  BrandVariants,
  createLightTheme,
  createDarkTheme,
  Theme,
} from "@fluentui/react-components";

// Brand ramp seeded from Cinnabar. Generated via Fluent UI Theme Designer
// (https://fluentuipr.z22.web.core.windows.net/heads/master/theming-designer/index.html)
// using #E1393E as the accent. The 16-step ramp is then hand-tuned at index 80
// to match the Cinnabar hex exactly.
export const enmaxBrandRamp: BrandVariants = {
  10:  "#0A0203",
  20:  "#1F0708",
  30:  "#36100F",
  40:  "#491614",
  50:  "#5E1B17",
  60:  "#73201A",
  70:  "#88251D",
  80:  "#9D2A1F",
  90:  "#B12F22",
  100: "#C53324",
  110: "#D03828",   // approach Cinnabar
  120: "#E1393E",   // Cinnabar (brand primary, light theme)
  130: "#E85A5F",
  140: "#EE7A7E",
  150: "#F39A9E",
  160: "#F8BABD",
};

export const enmaxLightTheme: Theme = {
  ...createLightTheme(enmaxBrandRamp),
  // Override neutrals where design.md diverges from Fluent defaults — none required Phase 1
};

export const enmaxDarkTheme: Theme = {
  ...createDarkTheme(enmaxBrandRamp),
  // Per PRD section 16: Cinnabar shifts to #FF6B73 in dark; this is achieved
  // by the brand ramp's higher indices being used for accent in dark theme.
  // The createDarkTheme function picks index 100 by default. Override if QA
  // shows mismatch against design.md dark mockups.
};

// Secondary + accent are NOT part of Fluent's BrandVariants (which only exposes
// a single brand ramp). They're surfaced as CSS custom properties consumed by
// non-Fluent components and ad-hoc styling.
export const enmaxCssVars = {
  "--enmax-secondary":      "#0F487A",
  "--enmax-secondary-dark": "#5BA3E8",
  "--enmax-accent":         "#F7DB9C",
  "--enmax-accent-dark":    "#E8C76A",
} as const;
```

**Theme provider at app root** (`src/main.tsx`):

```typescript
import { FluentProvider } from "@fluentui/react-components";
import { enmaxLightTheme, enmaxDarkTheme } from "./theme/brand";
// theme selection driven by useThemeMode() (see Step 5 Settings)
```

**Verification:** local dev server renders the Vite default page inside `FluentProvider`. Primary button (`<Button appearance="primary">`) shows Cinnabar. Switching `prefers-color-scheme` flips to dark theme and dark-Cinnabar `#FF6B73`-ish.

## Step 3 — App shell layout

Per PRD section 6: persistent left sidebar + horizontal command bar + header (brand + global search + bell + user menu) + maintenance banner + footer.

**File tree to create:**

```
src/
├── app/
│   ├── AppShell.tsx              # Top-level layout component
│   ├── Header.tsx                # Brand + search + bell + user menu
│   ├── Sidebar.tsx               # Persistent left nav
│   ├── CommandBar.tsx            # Per-destination command bar (renders children)
│   ├── Footer.tsx                # Version, date, disclaimer, copyright
│   ├── MaintenanceBanner.tsx     # Top banner when SingleAdminMode=true
│   └── NotificationBell.tsx      # Bell icon + panel; empty feed in this plan
├── theme/
│   ├── brand.ts                  # From Step 2
│   └── useThemeMode.ts           # light/dark/system selector hook
├── auth/
│   ├── useCurrentUser.ts         # Wraps Power Apps SDK current-user
│   └── useUserRole.ts            # Derives role from team membership
├── config/
│   ├── useAppConfig.ts           # React Query + Zustand-backed config
│   └── AppConfigSchema.ts        # Zod parser for the 21 keys
├── store/
│   └── uiStore.ts                # Zustand store: sidebar collapsed state, theme override
├── pages/
│   ├── Home.tsx                  # Placeholder (plan #08 fills)
│   ├── Reserve.tsx               # Placeholder (plan #05)
│   ├── Search.tsx                # Placeholder (plan #07)
│   ├── MyItems.tsx               # Placeholder (plan #07)
│   ├── Approvals.tsx             # Placeholder (plan #05/06)
│   ├── ReferenceData.tsx         # Placeholder (plan #07)
│   ├── Audit.tsx                 # Placeholder (plan #07)
│   ├── Broadcasts.tsx            # Placeholder (plan #08)
│   ├── Settings.tsx              # Placeholder (this plan ships theme toggle only)
│   └── NotFound.tsx              # 404
├── lib/
│   └── version.ts                # Build-time injected version + date
└── routes.tsx                    # React Router v6 route table
```

**Sidebar destinations** (per PRD section 6 table, with role gating per section 12):

| Label | Path | Roles | Icon | Plan that fills |
|-------|------|-------|------|-----------------|
| Home | `/` | All | `Home24Regular` | #08 |
| Reserve | `/reserve` | User, Admin | `DocumentAdd24Regular` | #05 |
| Search | `/search` | All | `Search24Regular` | #07 |
| My Items | `/my-items` | All | `BookmarkMultiple24Regular` | #07 |
| Approvals | `/approvals` | Approver, Admin | `Checkmark24Regular` | #05, #06 |
| Reference Data | `/reference-data` | Admin | `Database24Regular` | #07 |
| Audit | `/audit` | Admin | `History24Regular` | #07 |
| Broadcasts | `/broadcasts` | Admin | `Megaphone24Regular` | #08 |
| Settings | `/settings` | All | `Settings24Regular` | This plan (theme toggle); #08 fills notification prefs |

**Role-gating rule** (`Sidebar.tsx`):

```typescript
const visibleDestinations = useMemo(
  () => DESTINATIONS.filter(d => d.roles.includes("All") || d.roles.includes(role)),
  [role],
);
```

Where `role` comes from `useUserRole()`. Non-matching destinations are simply not rendered (not greyed out) — cleaner UX and matches Model-Driven App convention.

**Placeholder page template** (`src/pages/_Placeholder.tsx`):

```typescript
import { MessageBar, MessageBarBody, MessageBarTitle } from "@fluentui/react-components";

export function Placeholder({ pageName, plan }: { pageName: string; plan: string }) {
  return (
    <MessageBar intent="info">
      <MessageBarBody>
        <MessageBarTitle>{pageName}</MessageBarTitle>
        Implementation in {plan}. Shell wiring (route, sidebar, breadcrumb) is in place.
      </MessageBarBody>
    </MessageBar>
  );
}
```

Each `pages/*.tsx` is a one-liner: `export default () => <Placeholder pageName="Reserve" plan="plan #05" />;`. They exist so the router has render targets and Playwright a11y tests can exercise every route.

## Step 4 — Routing (React Router v6)

**`src/routes.tsx`:**

```typescript
import { createBrowserRouter, RouterProvider, Outlet } from "react-router-dom";
import { AppShell } from "./app/AppShell";
import Home from "./pages/Home";
import Reserve from "./pages/Reserve";
import Search from "./pages/Search";
import MyItems from "./pages/MyItems";
import Approvals from "./pages/Approvals";
import ReferenceData from "./pages/ReferenceData";
import Audit from "./pages/Audit";
import Broadcasts from "./pages/Broadcasts";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import { RequireRole } from "./auth/RequireRole";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell><Outlet /></AppShell>,
    errorElement: <NotFound />,
    children: [
      { index: true, element: <Home /> },
      { path: "reserve", element: <RequireRole roles={["User", "Admin"]}><Reserve /></RequireRole> },
      { path: "search", element: <Search /> },
      { path: "my-items", element: <MyItems /> },
      { path: "approvals", element: <RequireRole roles={["Approver", "Admin"]}><Approvals /></RequireRole> },
      { path: "reference-data", element: <RequireRole roles={["Admin"]}><ReferenceData /></RequireRole> },
      { path: "audit", element: <RequireRole roles={["Admin"]}><Audit /></RequireRole> },
      { path: "broadcasts", element: <RequireRole roles={["Admin"]}><Broadcasts /></RequireRole> },
      { path: "settings", element: <Settings /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
```

**`RequireRole`** redirects to `/` with a "you don't have access" `MessageBar` if the user's role isn't in the allow-list — defensive, in case a user types a URL directly.

**Browser router not hash router:** the Power Apps host serves the Code App at a deep URL with `?env=...` query string. Browser router uses path segments; the env query stays attached. Confirmed compatible with Code App hosting per MS Learn.

## Step 5 — Auth pass-through + user / role hooks

**`src/auth/useCurrentUser.ts`:**

```typescript
import { useQuery } from "@tanstack/react-query";
import { PowerProvider } from "@microsoft/power-apps";   // or whichever export the SDK uses

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      // PowerProvider.getCurrentUser is the documented API at the time of writing.
      // If the SDK shape changes between v1.0.4 and the version installed at execution
      // time, adjust this call site only — consumers stay stable.
      const me = await PowerProvider.getCurrentUser();
      return {
        id: me.id,                                  // Dataverse SystemUser GUID
        azureObjectId: me.azureObjectId,
        userPrincipalName: me.userPrincipalName,
        displayName: me.displayName,
        givenName: me.givenName,
        surname: me.surname,
      };
    },
    staleTime: Infinity,    // identity does not change during a session
    gcTime: Infinity,
  });
}
```

**`src/auth/useUserRole.ts`:**

```typescript
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "./useCurrentUser";

export type Role = "Admin" | "Approver" | "User" | "Unknown";

export function useUserRole(): Role {
  const { data: user } = useCurrentUser();
  const { data: teams } = useQuery({
    queryKey: ["user-teams", user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchUserTeams(user!.id),       // Web API: GET teammemberships
    staleTime: 60 * 1000,                          // 60s — bounded stale-role UX window per architecture review Finding 5.10
  });

  if (!teams) return "Unknown";
  if (teams.some(t => t.name === "team-enmax-autocad-admins"))     return "Admin";
  if (teams.some(t => t.name === "team-enmax-autocad-approvers"))  return "Approver";
  if (teams.some(t => t.name === "team-enmax-autocad-users"))      return "User";
  return "Unknown";
}
```

**Why client-side role derivation:** the Code App needs to gate UI affordances based on role, not to enforce security. Real enforcement lives in Dataverse role privileges (PRD section 12.4 matrix). A user who manipulates the client-side role state still cannot write a Reservation they're not permitted to write — the platform rejects it. This is the standard defence-in-depth pattern.

**`useCurrentUser` and `useUserRole` are the only auth-related hooks in the shell.** Feature plans consume them; they do not implement their own auth.

## Step 6 — App Configuration bootstrap

**`src/config/AppConfigSchema.ts`** — Zod parser for the 21 keys from plan #02 Step 9:

```typescript
import { z } from "zod";

export const AppConfigSchema = z.object({
  SingleAdminMode: z.boolean(),
  MaxDrawingsPerReservation: z.number().int().min(1),
  MaxSheetsPerDrawing: z.number().int().min(1),
  DefaultSheetsPerDrawing: z.number().int().min(1),
  StaleCheckoutMonths: z.string().regex(/^(\d+,)*\d+$/),
  ApproverTeamName: z.string(),
  AdminTeamName: z.string(),
  SharedMailboxAddress: z.string().email(),
  SharePointSiteUrl: z.string().url(),
  BusinessUnitName: z.string(),
  BrandPrimary: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  BrandSecondary: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  BrandAccent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  DefaultTheme: z.enum(["light", "dark", "system"]),
  EnableTelemetry: z.boolean(),
  MaintenanceBannerTitle: z.string(),
  MaintenanceBannerBody: z.string(),
  MaintenanceBannerSeverity: z.enum(["Info", "Warning", "Critical"]),
  FooterDisclaimer: z.string(),
  FooterCopyright: z.string(),
  BroadcastFanOutCadenceMinutes: z.number().int().min(1),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
```

**`src/config/useAppConfig.ts`:**

- Fetches `enmax_autocadappconfigs` via Dataverse Web API on first render
- Parses each row's `enmax_acdnvalue` according to `enmax_acdnvaluetype` (Boolean → `true/false`; Integer → `parseInt`; String → as-is; Json → `JSON.parse`)
- Validates the resulting object against `AppConfigSchema`; throws on validation failure (fail-loud per CLAUDE.md Rule 12)
- Caches in React Query for the session; manual reload exposed via Settings page
- Suspends the app on first load (suspense boundary in `AppShell`) so the shell never renders against undefined config

**Bootstrap order** (in `main.tsx`):

```
1. FluentProvider with default theme       // safe fallback if config fetch fails
2. QueryClientProvider
3. <Suspense fallback={<AppLoadingSplash />}>
4.   AppConfigGate
       ├─ throws Suspense promise until config loaded
       └─ on success, re-renders FluentProvider with theme from BrandPrimary
5.   RouterProvider with router
```

**`AppLoadingSplash`** is a Fluent `Spinner` + ENMAX logo on a neutral background. Visible <2 seconds typically; PRD section 6 NFR requires first-interactive in <2s on corporate laptop.

## Step 7 — UI store (Zustand)

**`src/store/uiStore.ts`:**

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  sidebarCollapsed: boolean;
  themeOverride: "light" | "dark" | "system" | null;   // null = use AppConfig.DefaultTheme
  toggleSidebar: () => void;
  setThemeOverride: (t: UiState["themeOverride"]) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      themeOverride: null,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setThemeOverride: (t) => set({ themeOverride: t }),
    }),
    { name: "enmax-autocad-ui" },                       // localStorage key
  ),
);
```

Only **UI preferences** live here. Server state (Reservations, Drawings, etc.) is React Query exclusively per the stack from PRD section 15.

## Step 8 — Maintenance banner + bell panel

**`src/app/MaintenanceBanner.tsx`:**

```typescript
import { MessageBar, MessageBarBody, MessageBarTitle } from "@fluentui/react-components";
import { useAppConfig } from "../config/useAppConfig";

export function MaintenanceBanner() {
  const config = useAppConfig();
  if (!config.SingleAdminMode) return null;

  const intent = (
    { Info: "info", Warning: "warning", Critical: "error" } as const
  )[config.MaintenanceBannerSeverity];

  return (
    <MessageBar intent={intent} layout="multiline" politeness="assertive">
      <MessageBarBody>
        <MessageBarTitle>{config.MaintenanceBannerTitle}</MessageBarTitle>
        {config.MaintenanceBannerBody}
      </MessageBarBody>
    </MessageBar>
  );
}
```

**Non-dismissible:** no `<MessageBarActions>` with a dismiss button. Renders at the top of `AppShell` above the header, so it's always visible.

**`src/app/NotificationBell.tsx`** — structure only:

```typescript
export function NotificationBell() {
  // Real feed query lands in plan #08. Bell renders with badge count = 0 here.
  return (
    <ToolbarButton aria-label="Notifications" icon={<Alert24Regular />}>
      {/* Popover panel renders an "No notifications" empty state */}
    </ToolbarButton>
  );
}
```

Bell panel structure + empty state ships; real data wiring is plan #08.

## Step 9 — Tests (shell-scope only)

Per PRD section 23 + CLAUDE.md Rule 9 (tests encode WHY).

**Unit + component tests (Vitest + React Testing Library):**

| # | Test | Asserts | Why |
|---|------|---------|-----|
| 1 | `useAppConfig parses Boolean values` | `"true"`/`"false"` → JS boolean | Zod schema doesn't auto-coerce; loader must |
| 2 | `useAppConfig parses Integer values` | `"10"` → `10` (number) | |
| 3 | `useAppConfig parses Json values` | `'[1,2,3]'` → `[1,2,3]` | |
| 4 | `useAppConfig throws on validation failure` | Missing `BrandPrimary` → ZodError surfaced | Fail-loud per Rule 12 |
| 5 | `useAppConfig throws on invalid hex` | `BrandPrimary = "red"` → ZodError | Catches typo in seed YAML |
| 6 | `useUserRole returns Admin for admin team member` | Mock teams query returns admin team → role=Admin | Role derivation correctness |
| 7 | `useUserRole returns Unknown when team query fails` | Network error → role=Unknown (NOT Admin) | Defensive fail-closed |
| 8 | `Sidebar hides Approvals from non-Approver` | role=User → "Approvals" not in DOM | Role gating |
| 9 | `Sidebar shows all destinations to Admin` | role=Admin → all 9 destinations rendered | |
| 10 | `MaintenanceBanner renders only when SingleAdminMode=true` | config.SingleAdminMode=false → null | |
| 11 | `MaintenanceBanner is non-dismissible` | No dismiss button present | UX requirement |
| 12 | `Theme switches on system pref change` | `prefers-color-scheme: dark` → enmaxDarkTheme applied | |
| 13 | `Theme override beats system pref` | uiStore.themeOverride="light", system=dark → light theme | User preference wins |
| 14 | `Footer renders all 4 elements` | Version + date + disclaimer + copyright in DOM | A17 acceptance criterion |
| 15 | `RequireRole redirects unauthorised user` | role=User, navigate to /approvals → redirected to / | Defence-in-depth |

**Playwright + axe-core (a11y):**

| # | Test | Asserts |
|---|------|---------|
| 1 | Each of the 9 routes loads w/o axe violations | Per PRD: zero new violations in CI |
| 2 | Sidebar is keyboard-navigable end-to-end | Tab order matches visual order |
| 3 | Bell button has accessible name `Notifications` | Screen-reader semantic |
| 4 | Theme toggle in Settings is keyboard-reachable | |
| 5 | Maintenance banner uses `aria-live="assertive"` | Screen-reader announces state change |

**No real Dataverse calls in any test** — App Config is fetched via MSW (Mock Service Worker) in component tests; concurrency / E2E tests for real Dataverse belong to plan #03 (plug-in) and plan #07+ (feature pages).

## Step 10 — Run + first push to dev

```powershell
Set-Location apps/code-app

# Local dev (against dev env, hot reload)
npx power-apps run

# Production build
npm run build

# Publish to dev tenant
npx power-apps push --environmentId $env:DEV_POWER_APPS_ENV_ID

# Capture play URL for DEV_APP_PLAY_URL secret if not already set
# (printed in the push output)
```

After first successful push, the dev tenant has a published Code App with the shell live. Admins, Approvers, and Users in the three test groups can open it via the play URL, see role-appropriate navigation, navigate every route (placeholder content), and exercise the maintenance banner by toggling `SingleAdminMode` in the App Configuration table via the model-driven Administration app.

## Verification — End-to-End Checklist

```powershell
Set-Location apps/code-app

# 1. Local checks
npm run lint                                          # zero errors
npm test                                              # all 15 component tests pass
npx playwright test                                   # all a11y tests pass; zero axe violations

# 2. Production build
npm run build                                         # tsc -b && vite build; dist/ produced

# 3. Push to dev
npx power-apps push --environmentId $env:DEV_POWER_APPS_ENV_ID

# 4. Manual smoke (in browser against dev play URL)
#    - SSO completes for a test User account
#    - Sidebar shows Home / Reserve / Search / My Items / Settings (NOT Approvals/Reference Data/Audit/Broadcasts)
#    - Every visible route renders its placeholder MessageBar
#    - Footer shows version (from package.json), today's date, ENMAX disclaimer, copyright
#    - Bell icon present with badge "0"
#
#    Switch to an Admin account:
#    - All 9 destinations visible
#    - All routes render
#
#    Toggle App Configuration SingleAdminMode=true (via model-driven app or via Web API):
#    - Maintenance banner appears at top of viewport, non-dismissible
#    - End-user account can still navigate but action affordances (when they exist in future plans) will be disabled
#    - Admin account sees banner but operates normally

# 5. CI verification
git push -u origin feat/004-code-app-shell
gh pr create --base dev --title "feat(shell): code app shell per plan #04" --body "Implements plan #04."
gh pr checks                                          # ci.yml green; cd-dev.yml runs on merge
```

**Acceptance:**
- All 15 component tests + 5 a11y tests pass
- PR `feat(shell): code app shell per plan #04` is green, reviewed by Rahul, squash-merged into `dev`
- Dev tenant has the shell live at the play URL
- Manual smoke against three test accounts (one per role) confirms role-gated navigation
- Maintenance banner toggle works end-to-end
- First interactive < 2 seconds (PRD section 6 NFR) verified via Lighthouse on the published URL

## Critical Files to Read Before Starting

| File | Why |
|------|-----|
| PRD sections 6, 12, 15, 16, 17 | Authoritative shell + auth + theme + boundary |
| `2026-05-17-phase-1-cut-line-spec.md` | Confirms shell-only scope, no feature drift |
| `2026-05-17-plan-02-dataverse-schema-and-seed.md` Step 9 | App Configuration keys + values shell consumes |
| `_assets/design/design.md` (in specs worktree) | Fluent UI v9 theme + brand details beyond PRD section 16 |
| [Fluent UI v9 docs](https://react.fluentui.dev/) | `BrandVariants`, `createLightTheme`, `createDarkTheme`, `FluentProvider`, `MessageBar` |
| [@microsoft/power-apps SDK docs](https://learn.microsoft.com/en-us/power-apps/maker/code-apps/) | `PowerProvider.getCurrentUser`, lifecycle |
| [React Router v6 docs](https://reactrouter.com/) | `createBrowserRouter`, `RouterProvider`, outlets |

## Downstream Plans Unblocked by This Plan

| Plan | Unblocked? | Why |
|------|------------|-----|
| #05 Reservation flow + 3-channel notifications | Yes | Wizard renders inside shell at `/reserve`; auth + App Config + theme already in place |
| #06 Check-Out / Check-In + revision | Yes | Drawer panels and grid render inside shell |
| #07 Search + admin surfaces | Yes | Grids render at `/search`, `/reference-data`, `/audit`, `/my-items`; column-visibility / CSV-export pattern established here for grids to inherit |
| #08 Broadcast + notifications | Yes | Bell panel structure exists; broadcast banner pattern mirrors maintenance banner |
| #09 UAT promotion | No | Blocked on feature completeness |

## Risks + Mitigations

| Risk | Mitigation |
|------|------------|
| `@microsoft/power-apps` SDK API surface changes between v1.0.4 and the version installed at execution | All SDK calls isolated in `src/auth/useCurrentUser.ts` and the bootstrap path; one-place change. SDK version pinned exactly in `package.json` (no `^`). |
| Brand ramp generated from Cinnabar produces accessibility-failing contrast in some Fluent components | A11y tests on every route catch this. If a specific token (e.g. brand button text) fails AA, override the token in `enmaxLightTheme`/`enmaxDarkTheme` rather than tweaking the brand ramp. Document any override with the WCAG contrast ratio measured. |
| Theme switching causes visible flash on first paint | Pre-resolve theme synchronously from `localStorage` (read by inline `<script>` in `index.html`) before React mounts. Use the result for the initial `FluentProvider` theme; React Query rehydration replaces it later. Standard pattern. |
| App Configuration fetch fails on bootstrap (e.g. service account permission regression) | Suspense fallback shows splash; after 10s timeout, replace with an error screen "App configuration unavailable. Contact admin." with a Retry button. Do NOT render the app with default config — that hides the real problem (fail-loud per CLAUDE.md Rule 12). |
| Power Apps host SSO loop / silent failure | Defer to Power Apps platform error handling; the host displays platform-level errors above our app. Our code does no auth — if the host fails, we are not the cause. Documented for IT triage. |
| Sidebar role gating drifts from real Dataverse role privileges | Client gating is for UX only; platform enforces. If a User sees an action button they shouldn't (because of a gating regression), pressing it triggers a 403 from Dataverse; we surface a friendly toast. Defence-in-depth holds. |
| FluentProvider re-render cost when theme changes | Theme object identity must be stable (`useMemo` on theme construction); changing it only when the actual theme key changes prevents whole-tree re-render. |
| `useThemeMode` + system preference + manual override produces a 3-way state-machine bug | Explicit priority order in one place: `uiStore.themeOverride ?? appConfig.DefaultTheme ?? "system"`, then `"system"` resolves via `window.matchMedia`. Single source of truth in `useThemeMode.ts`; tested by #12 + #13. |
| Bundle size bloat from Fluent UI v9 default imports | Use Fluent's documented per-component imports (`@fluentui/react-components/Button`); confirm bundle size <500 KB gzipped on `npm run build`. Add a CI step in plan #04 follow-up if size matters: `vite-bundle-visualizer` runs on PR. |

## TODOs Left in This Plan

- **Lighthouse perf budget integration:** PRD requires <2s first-interactive on corporate laptop. Manual verification in this plan; consider Lighthouse CI integration as a follow-up plan if perf regressions emerge.
- **Bundle-size CI gate:** noted under risks; defer to a small follow-up plan if/when bundle bloats.
- **Brand ramp regeneration tooling:** the ramp in `src/theme/brand.ts` is hand-tuned; if ENMAX brand updates, document the regen process (Fluent Theme Designer URL + index 80 hand-tune).
- **`useCurrentUser` SDK call site:** exact API name may differ from `PowerProvider.getCurrentUser`; the SDK README at execution time is authoritative. Update during Step 5 implementation.
