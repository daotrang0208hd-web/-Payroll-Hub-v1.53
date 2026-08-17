import { createBrowserRouter } from "react-router";
import { Root } from "./pages/Root";
import { loadHoldDashboardPage } from "./lib/lazy-routes";

import { TimesheetHub } from "./pages/01-timesheet/TimesheetHub";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    HydrateFallback: () => (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Đang tải giao diện...
      </div>
    ),
    children: [
      {
        index: true,
        lazy: async () => ({
          Component: (await import("./pages/00-dashboard/Dashboard")).Dashboard,
        }),
      },
      {
        path: "centers",
        Component: TimesheetHub,
      },
      {
        path: "master-ae",
        lazy: async () => ({
          Component: (await import("./pages/03-master/MasterAE")).MasterAE,
        }),
      },
      {
        path: "hold-dashboard",
        lazy: async () => ({
          Component: (await loadHoldDashboardPage()).HoldDashboardPage,
        }),
      },
      {
        path: "audit",
        lazy: async () => ({
          Component: (await import("./pages/02-audit/Audit")).Audit,
        }),
      },
      {
        path: "payment",
        lazy: async () => ({
          Component: (await import("./pages/04-balance/BulkPayment")).BulkPayment,
        }),
      },
      {
        path: "pivot",
        lazy: async () => ({
          Component: (await import("./pages/04-balance/PivotSheet")).PivotSheet,
        }),
      },
    ],
  },
]);
