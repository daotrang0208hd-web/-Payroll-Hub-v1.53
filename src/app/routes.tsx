import { createBrowserRouter } from "react-router";
import { Root } from "./pages/Root";

// Import all pages statically for bulletproof reliability
import { Dashboard } from "./pages/00-dashboard/Dashboard";
import { TimesheetHub } from "./pages/01-timesheet/TimesheetHub";
import { MasterAE } from "./pages/03-master/MasterAE";
import { Audit } from "./pages/02-audit/Audit";
import { BulkPayment } from "./pages/04-balance/BulkPayment";
import { PivotSheet } from "./pages/04-balance/PivotSheet";
import { HoldDashboardPage } from "./pages/04-balance/HoldDashboardPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "centers", element: <TimesheetHub /> },
      { path: "master-ae", element: <MasterAE /> },
      { path: "hold-dashboard", element: <HoldDashboardPage /> },
      { path: "audit", element: <Audit /> },
      { path: "payment", element: <BulkPayment /> },
      { path: "pivot", element: <PivotSheet /> },
    ],
  },
]);

