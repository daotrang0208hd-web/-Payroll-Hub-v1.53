import { createBrowserRouter } from "react-router";
import { Root } from "./pages/Root";
import { HoldDashboardPage } from "./pages/04-balance/HoldDashboardPage";

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
        lazy: async () => ({
          Component: (await import("./pages/01-timesheet/TimesheetHub")).TimesheetHub,
        }),
      },
      {
        path: "master-ae",
        lazy: async () => ({
          Component: (await import("./pages/03-master/MasterAE")).MasterAE,
        }),
      },
      {
        path: "hold-dashboard",
        Component: HoldDashboardPage,
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
