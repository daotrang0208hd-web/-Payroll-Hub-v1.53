/* eslint-disable @typescript-eslint/no-unused-vars */
import { Link, useLocation } from "react-router";
import {
  CircleDollarSign,
  Building2,
  Database,
  ShieldCheck,
  CreditCard,
  Table2,
  Bell,
  User,
  Settings,
  Settings2,
  Trash2,
  Menu,
  ListChecks,
  Users,
  BarChart3,
  Coins,
  Wallet,
  CalendarIcon,
  UploadCloud,
  RefreshCw,
  FileText,
  AlertCircle,
  ChevronDown,
  LayoutDashboard,
  Home,
} from "lucide-react";
import { motion } from "motion/react";
import { useState, useEffect } from "react";
import { useAppData } from "../../lib/contexts/AppDataContext";
import { TableData } from "../../types";
import { MonthPicker } from "../shared/MonthPicker";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

const navigationItems = [
  { id: "dashboard", label: "dashboard", icon: LayoutDashboard, path: "/" },
  { id: "centers", label: "timesheet", icon: BarChart3, path: "/centers" },
  { id: "audit", label: "audit", icon: ShieldCheck, path: "/audit" },
  { id: "master-ae", label: "master", icon: Database, path: "/master-ae" },
  { id: "hold-dashboard", label: "balance", icon: Wallet, path: "/hold-dashboard" },
];

const pageTabs: Record<string, { id: string; label: string; icon: React.ElementType }[]> = {
  "/centers": [
    { id: "employee", label: "Total Paid Hours", icon: Users },
    { id: "center", label: "Roster Center", icon: Building2 },
    { id: "mkt_local_north", label: "MKT Local North", icon: FileText },
    { id: "roster_raw", label: "Raw Data", icon: FileText },
    { id: "upload", label: "Cài đặt & Tải file (Timesheet)", icon: UploadCloud },
  ],
  "/audit": [
    { id: "main", label: "BẢNG TỔNG QUAN AUDIT", icon: ShieldCheck },
    { id: "detail", label: "BẢNG CHI TIẾT LỆCH AUDIT", icon: AlertCircle },
  ],
  "/master-ae": [
    { id: "Sheet1_AE", label: "Gross Pay", icon: Database },
    { id: "Hold_AE", label: "deductions", icon: Database },
    { id: "BulkPayment", label: "Bulk Payment", icon: Wallet },
    { id: "Pivot", label: "Pivot Master", icon: FileText },
    { id: "upload", label: "Cài đặt & Tải file (Master)", icon: UploadCloud },
  ],
};

interface NavbarProps {
  onToggleMobileMenu: () => void;
  onOpenSettings: () => void;
}

export function Navbar({ onToggleMobileMenu, onOpenSettings }: NavbarProps) {
  const location = useLocation();
  const { appData, updateAppData } = useAppData();
  const [timesheetActiveTabId, setTimesheetActiveTabId] = useState("employee");
  const [activeTabLabel, setActiveTabLabel] = useState(() => {
    return sessionStorage.getItem("active_timesheet_tab_label") || "Total Paid Hours";
  });

  useEffect(() => {
    const handleTabChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.label) {
        setActiveTabLabel(detail.label);
        sessionStorage.setItem("active_timesheet_tab_label", detail.label);
      }
      if (detail && detail.tab) {
        setTimesheetActiveTabId(detail.tab);
      }
    };
    window.addEventListener("timesheet-tab-changed", handleTabChange);
    return () => {
      window.removeEventListener("timesheet-tab-changed", handleTabChange);
    };
  }, []);

  const isTimesheetPage = location.pathname === "/centers";
  
  const [masterActiveTab, setMasterActiveTab] = useState(() => {
    return (localStorage.getItem("master_ae_active_tab") as string) || "Sheet1_AE";
  });

  const [auditActiveTab, setAuditActiveTab] = useState("main");

  useEffect(() => {
    const handleTabChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.tab) {
        setMasterActiveTab(detail.tab);
      }
    };
    window.addEventListener("master-ae-tab-changed", handleTabChange);
    return () => {
      window.removeEventListener("master-ae-tab-changed", handleTabChange);
    };
  }, []);

  useEffect(() => {
    const handleAuditTabChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.tab) {
        setAuditActiveTab(detail.tab);
      }
    };
    window.addEventListener("audit-tab-changed", handleAuditTabChange);
    return () => {
      window.removeEventListener("audit-tab-changed", handleAuditTabChange);
    };
  }, []);

  const lookupPath = location.pathname;
  const currentTabId =
    lookupPath === "/master-ae" ? masterActiveTab :
    lookupPath === "/audit" ? auditActiveTab :
    lookupPath === "/centers" ? timesheetActiveTabId : "";

  const currentTabObj = pageTabs[lookupPath]?.find((t) => t.id === currentTabId);

  const currentPageLabel = (
    location.pathname === "/" ? "Dashboard" :
    location.pathname === "/hold-dashboard" ? "Balance" :
    currentTabObj ? currentTabObj.label :
    (isTimesheetPage ? activeTabLabel : "Select View")
  );

  const showMonthCard = location.pathname === "/master-ae" || location.pathname === "/hold-dashboard" || location.pathname === "/payment" || location.pathname === "/pivot";
  const currentMonth = appData.globalMonth || "03.2026";

  return (
    <header 
      id="app-navbar"
      className="navbar-header px-4 pt-1 pb-1 flex justify-between items-center bg-transparent relative z-40 shrink-0 w-full max-w-full overflow-hidden"
      style={{ paddingTop: "0px", paddingBottom: "8px", height: "39.9943px", paddingLeft: "24px", paddingRight: "24px" }}
    >
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className={`flex items-center justify-center w-8 h-8 rounded-full border transition-all active:scale-95 outline-none focus:outline-none focus-visible:outline-none shadow-2xs ${
              location.pathname === "/" 
                ? "bg-rose-50 border-[#781D1D]/40 text-[#781D1D]" 
                : "bg-white border-[#e7dbdc] text-slate-700 hover:bg-rose-50/60 hover:text-[#781D1D] opacity-90 hover:opacity-100"
            }`}
            title="Dashboard Overview"
          >
            <Home className="w-4 h-4 text-[#781D1D]" />
          </Link>
          {location.pathname === "/" && (
            <div className="flex items-center animate-in fade-in slide-in-from-left-4 duration-500">
              <span
                className="flex items-center gap-2 h-8 text-primary font-black lowercase tracking-[0.05em] px-2 select-none"
                style={{ fontSize: "12px" }}
              >
                dashboard overview
              </span>
            </div>
          )}
          {location.pathname === "/hold-dashboard" && (
            <div className="flex items-center animate-in fade-in slide-in-from-left-4 duration-500">
              <span
                className="flex items-center gap-2 h-8 text-primary font-black lowercase tracking-[0.05em] px-2 select-none"
                style={{ fontSize: "12px" }}
              >
                balance
              </span>
            </div>
          )}
          {location.pathname !== "/" && pageTabs[lookupPath] && (
            <div className="flex items-center animate-in fade-in slide-in-from-left-4 duration-500">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center gap-2 h-8 text-primary hover:text-slate-900 transition-all group font-black lowercase tracking-[0.05em] cursor-pointer active:scale-95 px-2 outline-none focus:outline-none focus-visible:outline-none"
                    style={{ fontSize: "11px" }}
                  >
                    <span style={{ fontSize: "12px" }}>
                      {currentPageLabel}
                    </span>
                    <ChevronDown className="w-3 h-3 opacity-40" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48 p-1 bg-white border border-slate-200 shadow-xl rounded-xl z-[9999]">
                  {pageTabs[lookupPath].map((t) => (
                    <DropdownMenuItem
                      key={t.id}
                      onSelect={() => {
                        if (lookupPath === "/centers") {
                           window.dispatchEvent(new CustomEvent("timesheet-request-tab-change", { detail: { tab: t.id } }));
                        } else if (lookupPath === "/audit") {
                           window.dispatchEvent(new CustomEvent("audit-request-tab-change", { detail: { tab: t.id } }));
                        } else if (lookupPath === "/master-ae") {
                           window.dispatchEvent(new CustomEvent("master-ae-request-tab-change", { detail: { tab: t.id } }));
                        }
                      }}
                      className="text-[11px] font-bold lowercase tracking-tight px-3 py-2.5 rounded-lg cursor-pointer flex items-center gap-2 hover:bg-primary/5 focus:bg-primary/5 transition-colors outline-none focus:outline-none focus-visible:outline-none"
                    >
                      <t.icon className="w-3.5 h-3.5 opacity-60" />
                      {t.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-8 pr-4">
          <nav className="hidden md:flex gap-8 items-center" style={{ fontSize: "15px" }}>
              {navigationItems.filter((item) => item.id !== "dashboard").map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.id}
                    to={item.path}
                    className={`font-sans lowercase font-bold tracking-[0.1em] text-primary no-underline relative transition-opacity outline-none focus:outline-none focus-visible:outline-none ${
                      isActive ? "opacity-100 after:content-[''] after:absolute after:-bottom-[6px] after:left-0 after:w-full after:h-[1.5px] after:bg-primary" : "opacity-40 hover:opacity-100"
                    }`}
                    style={{ fontSize: "10px", lineHeight: "15.8px" }}
                  >
                    {item.label}
                  </Link>
                );
              })}
          </nav>
   
          <div className="text-right font-mono text-[0.65rem] tracking-[0.1em] text-primary flex items-center justify-end gap-3">
              {showMonthCard && (
                <div className="scale-90 origin-right">
                  <MonthPicker
                    value={currentMonth}
                    onChange={(newVal) => {
                      if (newVal) {
                        updateAppData((prev) => ({ ...prev, globalMonth: newVal }));
                      }
                    }}
                    align="end"
                  />
                </div>
              )}
          </div>
        </div>
    </header>
  );
}
