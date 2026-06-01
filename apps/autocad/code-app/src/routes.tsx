import { createHashRouter, Outlet } from "react-router-dom";
import { AppShell } from "./app/AppShell";
import { RequireRole } from "./auth/RequireRole";
import Home from "./pages/Home";
import Search from "./pages/Search";
import MyItems from "./pages/MyItems";
import ReferenceData from "./pages/ReferenceData";
import Audit from "./pages/Audit";
import AppConfig from "./pages/AppConfig";
import Broadcasts from "./pages/Broadcasts";
import Settings from "./pages/Settings";
import Notifications from "./pages/Notifications";
import NotFound from "./pages/NotFound";
import { ReservePage } from "./features/reserve/ReservePage";
import { ReserveSuccess } from "./features/reserve/ReserveSuccess";
import { ApprovalsPage } from "./features/approvals/ApprovalsPage";
import ReservationDetail from "./pages/ReservationDetail";

// Browser router — Power Apps host serves Code App at a deep URL with ?env=...
// query string. Browser router uses path segments; env query stays attached.
export const router = createHashRouter([
  {
    path: "/",
    element: <AppShell><Outlet /></AppShell>,
    errorElement: <NotFound />,
    children: [
      { index: true, element: <Home /> },
      {
        path: "reserve",
        element: <RequireRole roles={["User", "Admin"]}><Outlet /></RequireRole>,
        children: [
          { index: true,       element: <ReservePage /> },
          { path: "success",   element: <ReserveSuccess /> },
        ],
      },
      { path: "search",         element: <Search /> },
      { path: "my-items",            element: <MyItems /> },
      { path: "reservations/:reservationId", element: <ReservationDetail /> },
      { path: "approvals",      element: <RequireRole roles={["Approver", "Admin"]}><ApprovalsPage /></RequireRole> },
      { path: "reference-data", element: <RequireRole roles={["Admin"]}><ReferenceData /></RequireRole> },
      { path: "audit",          element: <RequireRole roles={["Admin"]}><Audit /></RequireRole> },
      { path: "app-config",     element: <RequireRole roles={["Admin"]}><AppConfig /></RequireRole> },
      { path: "broadcasts",     element: <RequireRole roles={["Admin"]}><Broadcasts /></RequireRole> },
      { path: "settings",       element: <Settings /> },
      { path: "notifications",  element: <Notifications /> }, // reachable from the bell, not the sidebar
      { path: "*",              element: <NotFound /> },
    ],
  },
]);
