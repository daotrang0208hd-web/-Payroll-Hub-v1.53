import { createBrowserRouter } from "react-router";
import { Root } from "./pages/Root";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
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
        lazy: async () => ({
          Component: (await import("./pages/04-balance/HoldDashboardPage")).HoldDashboardPage,
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
