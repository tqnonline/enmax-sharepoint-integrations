import { createHashRouter, Outlet } from "react-router-dom";
import { AppShell } from "./app/AppShell";
import { RequireRole } from "./auth/RequireRole";
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

// Browser router — Power Apps host serves Code App at a deep URL with ?env=...
// query string. Browser router uses path segments; env query stays attached.
export const router = createHashRouter([
  {
    path: "/",
    element: <AppShell><Outlet /></AppShell>,
    errorElement: <NotFound />,
    children: [
      { index: true, element: <Home /> },
      { path: "reserve",        element: <RequireRole roles={["User", "Admin"]}><Reserve /></RequireRole> },
      { path: "search",         element: <Search /> },
      { path: "my-items",       element: <MyItems /> },
      { path: "approvals",      element: <RequireRole roles={["Approver", "Admin"]}><Approvals /></RequireRole> },
      { path: "reference-data", element: <RequireRole roles={["Admin"]}><ReferenceData /></RequireRole> },
      { path: "audit",          element: <RequireRole roles={["Admin"]}><Audit /></RequireRole> },
      { path: "broadcasts",     element: <RequireRole roles={["Admin"]}><Broadcasts /></RequireRole> },
      { path: "settings",       element: <Settings /> },
      { path: "*",              element: <NotFound /> },
    ],
  },
]);
