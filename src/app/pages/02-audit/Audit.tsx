/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React, { useState, useMemo, useEffect, useCallback, useTransition, useDeferredValue } from "react";
import { useNavigate, useLocation } from "react-router";
import { useAppData } from "../../lib/contexts/AppDataContext";
import { useTeacherTaAuditLogic } from "../../hooks/useTeacherTaAuditLogic";
import { DataTable, Column } from "./AuditDataTable";
import {
  ShieldCheck,
  PlayCircle,
  Calendar,
  Trash2,
  Settings,
  Search,
  UploadCloud,
  ChevronRight,
  ChevronDown,
  FileSpreadsheet,
  Download,
  AlertCircle,
  FileText,
  PlusCircle,
  CheckCircle2,
  Users,
  Wrench,
  BadgeCheck,
  RefreshCw,
  Eye,
  EyeOff,
  Menu,
  PanelLeft,
} from "lucide-react";
import { parseAnyDate, getVal, formatIdNumber } from "../../lib/utils/data-utils";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "../../components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Input } from "../../components/ui/input";
import { X } from "lucide-react";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import * as XLSX from "xlsx";
import { prepareDataForExport } from "../../lib/utils/data-utils";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
} as const;

function DebouncedSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const [localValue, setLocalValue] = useState(value);
  const [prevValue, setPrevValue] = useState(value);

  if (value !== prevValue) {
    setPrevValue(value);
    if (value === "") {
      setLocalValue("");
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== value) {
        onChange(localValue);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localValue, value, onChange]);

  return (
    <input
      type="text"
      placeholder={placeholder}
      value={localValue}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setLocalValue(e.target.value)}
      onKeyDown={(e) => e.stopPropagation()}
      className="w-full bg-primary/5 border border-primary/10 rounded-full pl-9 pr-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-inner h-9 text-foreground"
      style={{ borderRadius: "24px" }}
      autoFocus
    />
  );
}

export function Audit() {
  const { appData, updateAppData } = useAppData();
  const navigate = useNavigate();

  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<"main" | "detail">("main");
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [detailManualFilter, setDetailManualFilter] = useState("");
  const deferredDetailFilter = useDeferredValue(detailManualFilter);
  const [isConfigHidden, setIsConfigHidden] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const handleRequestTabChange = (e: any) => {
      if (e.detail && e.detail.tab) {
        setActiveTab(e.detail.tab as any);
      }
    };
    window.addEventListener("audit-request-tab-change", handleRequestTabChange);
    return () => window.removeEventListener("audit-request-tab-change", handleRequestTabChange);
  }, []);

  // GIẢI PHÁP CHỐNG LAG 1: Dùng useTransition để nhường luồng xử lý UI (Không làm kẹt/đơ nút bấm)
  const [isPending, startTransition] = useTransition();

  const [tableFilteredCount, setTableFilteredCount] = useState<number | null>(null);

  const handleFilteredDataChange = useCallback((data: any[]) => {
    setTableFilteredCount(data.length);
  }, []);

  const handleRefreshData = () => {
    setIsRefreshing(true);
    updateAppData((prev) => ({ ...prev }));
    setTimeout(() => {
      setIsRefreshing(false);
      toast.success("Đã làm mới dữ liệu", {
        description: "Dữ liệu AUDIT đã được làm mới thành công.",
      });
    }, 600);
  };

  const handleMainRowClick = useCallback((row: any) => {
    if (row.className) {
      startTransition(() => {
        setSearchTerm(row.className);
        setDetailManualFilter(row.className);
        setActiveTab("detail");
        setIsConfigHidden(true);
      });
    }
  }, []);

  const handleDetailRowClick = useCallback((row: any, columnKey?: string) => {
    if (!row) return;

    const targetCenter = (row.displayCenter || row.center || "").trim();
    const targetClassName = (row._fullClassName || row.className || "").trim();
    const targetDate = (row._fullDate || row.dateStr || "").trim();
    const idStr = String(row.taId || "").trim();
    const nameStr = String(row.taName || "").trim();
    const teacherNameStr = String(row.teacherName || "").trim();

    const cascadeFilters: Record<string, string> = {};

    // Level 1: L07 (Center) - always included
    if (targetCenter) {
      cascadeFilters["l07"] = targetCenter;
    }

    let toastMsg = "Đang chuyển đến dữ liệu nguồn Raw Data...";

    if (columnKey === "center") {
      // Level 1: L07 only
      toastMsg = `Đang chuyển đến Raw Data & lọc L07: ${targetCenter}`;
    } else if (columnKey === "className") {
      // Level 1: L07 -> Level 2: Class
      if (targetClassName && targetClassName !== "KHÔNG CÓ LỚP HỌC") {
        cascadeFilters["class"] = targetClassName;
      }
      toastMsg = `Đang chuyển đến Raw Data & lọc L07: ${targetCenter} ➔ Lớp: ${targetClassName}`;
    } else if (columnKey === "dateStr") {
      // Level 1: L07 -> Level 2: Class -> Level 3: Date
      if (targetClassName && targetClassName !== "KHÔNG CÓ LỚP HỌC") {
        cascadeFilters["class"] = targetClassName;
      }
      if (targetDate) {
        cascadeFilters["ngay"] = targetDate;
      }
      toastMsg = `Đang chuyển đến Raw Data & lọc L07 ➔ Lớp ➔ Ngày: ${targetDate}`;
    } else if (columnKey === "taId") {
      // Level 1: L07 -> Level 2: Class -> Level 3: Date -> Level 4: ID NUMBER
      if (targetClassName && targetClassName !== "KHÔNG CÓ LỚP HỌC") {
        cascadeFilters["class"] = targetClassName;
      }
      if (targetDate) {
        cascadeFilters["ngay"] = targetDate;
      }
      if (idStr && idStr !== "-") {
        cascadeFilters["ma_nv"] = idStr;
      }
      toastMsg = `Đang chuyển đến Raw Data & lọc L07 ➔ Lớp ➔ Ngày ➔ ID TA: ${idStr || nameStr}`;
    } else if (columnKey === "taName" || columnKey === "teacherName") {
      // Level 1: L07 -> Level 2: Class -> Level 3: Date -> Level 4: ID NUMBER -> Level 5: FULL NAME
      if (targetClassName && targetClassName !== "KHÔNG CÓ LỚP HỌC") {
        cascadeFilters["class"] = targetClassName;
      }
      if (targetDate) {
        cascadeFilters["ngay"] = targetDate;
      }
      if (idStr && idStr !== "-") {
        cascadeFilters["ma_nv"] = idStr;
      }
      const personName = columnKey === "teacherName" ? teacherNameStr : nameStr;
      if (personName && personName !== "-" && personName !== "Không có giáo viên") {
        cascadeFilters["full_name"] = personName;
      }
      toastMsg = `Đang chuyển đến Raw Data & lọc L07 ➔ Lớp ➔ Ngày ➔ ID ➔ Tên: ${personName || idStr}`;
    } else {
      // Default: Level 1 + Level 2
      if (targetClassName && targetClassName !== "KHÔNG CÓ LỚP HỌC") {
        cascadeFilters["class"] = targetClassName;
      }
      toastMsg = `Đang chuyển đến Raw Data & lọc L07 ➔ Lớp: ${targetClassName}`;
    }

    const navigateState: any = {
      activeTab: "roster_raw",
      from: "audit",
      cascadeFilters,
      filterCenter: targetCenter,
      filterDate: cascadeFilters["ngay"] || "",
      searchTerm: cascadeFilters["class"] || cascadeFilters["ma_nv"] || cascadeFilters["full_name"] || "",
    };

    startTransition(() => {
      navigate("/centers", {
        state: navigateState,
      });
      toast.success(toastMsg);
    });
  }, [navigate]);

  const fromDate = appData.Timesheet_Dates?.from || "";
  const toDate = appData.Timesheet_Dates?.to || "";
  const rosterData = useMemo(() => appData.Q_Roster || [], [appData.Q_Roster]);

  const { state, computed, actions } = useTeacherTaAuditLogic(
    rosterData,
    fromDate,
    toDate,
  );
  const { fileNameA, fileNameConfig, isProcessing, errorMsg } = state;
  const { auditResults } = computed;
  const { handleUploadFileA, handleUploadFileConfig, clearData } = actions;

  // Helper for date range calculation
  const teacherDateRange = useMemo(() => {
    const { min, max } = auditResults.fileDateRangeA || { min: null, max: null };

    if (min === null || max === null) return "";
    
    const fmt = (ts: number) => {
      const d = new Date(ts);
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    }
    return `${fmt(min)} - ${fmt(max)}`;
  }, [auditResults.fileDateRangeA]);

  // Unified date calculations for Source B (Roster) and Source C (MR.07 Class Hour / CheckTAs Config)
  const { configDateRange, taDateRange, commonDateRange } = useMemo(() => {
    const fmt = (ts: number) => {
      const d = new Date(ts);
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    };

    // 1. Source A (Teacher)
    const minA: number | null = auditResults.fileDateRangeA?.min ?? null;
    const maxA: number | null = auditResults.fileDateRangeA?.max ?? null;

    // 2. Source B (Roster / TA)
    let minB: number | null = null;
    let maxB: number | null = null;
    rosterData.forEach((row: any) => {
      const dv = getVal(row, ["date", "ngày", "tk_date", "session date"]);
      const d = parseAnyDate(dv);
      if (d && !isNaN(d.getTime())) {
        const ts = d.getTime();
        if (minB === null || ts < minB) minB = ts;
        if (maxB === null || ts > maxB) maxB = ts;
      }
    });
    const taRange = (minB === null || maxB === null) ? "" : `${fmt(minB)} - ${fmt(maxB)}`;

    // 3. Source C (MR.07 / CheckTAs Config)
    let minC: number | null = null;
    let maxC: number | null = null;
    const updateMinMaxC = (d: Date | null) => {
      if (d && !isNaN(d.getTime())) {
        const ts = d.getTime();
        if (d.getFullYear() >= 2000 && d.getFullYear() <= 2100) {
          if (minC === null || ts < minC) minC = ts;
          if (maxC === null || ts > maxC) maxC = ts;
        }
      }
    };

    const configData = appData.Q_CheckTAs || [];
    if (configData.length > 0) {
      let cfgHdr = -1, cfgDt = -1, cfgMatrix = false;
      for (let i = 0; i < Math.min(20, configData.length); i++) {
        const row = configData[i]; if (!row) continue;
        const arr: any[] = Array.isArray(row) ? row : Object.values(row);
        const rs = arr.map((c) => String(c).toLowerCase()).join(" ");
        if (rs.includes("schedule date") || rs.includes("ngày dạy") || rs.includes("lịch dạy")) { 
          cfgMatrix = true; 
          cfgDt = i + 1; 
          if (cfgHdr === -1) cfgHdr = i; 
          break; 
        }
        let sc2 = 0; 
        if (rs.includes("class") || rs.includes("lớp")) sc2++; 
        if (rs.includes("student") || rs.includes("sĩ số") || rs.includes("sỹ số") || rs.includes("số học viên")) sc2++;
        if (sc2 >= 2) { 
          cfgHdr = i; 
          const pdr: any[] = Array.isArray(configData[i]) ? configData[i] : Object.values(configData[i]); 
          const ds = pdr.filter((c) => parseAnyDate(c)).length; 
          if (ds >= 1) { 
            cfgMatrix = true; 
            cfgDt = i; 
          } 
        }
      }

      if (cfgHdr !== -1) {
        const mH2: any[] = Array.isArray(configData[cfgHdr]) ? configData[cfgHdr] : Object.values(configData[cfgHdr]);
        const sH2: any[] = Array.isArray(configData[cfgHdr+1]) ? configData[cfgHdr+1] : Object.values(configData[cfgHdr+1] || []);
        const dR2: any[] = cfgDt !== -1 ? (Array.isArray(configData[cfgDt]) ? configData[cfgDt] : Object.values(configData[cfgDt])) : mH2;
        
        const cm: any = { class:-1, center:-1, students:-1, sessionDate:-1, dates:[] };
        [mH2, sH2].forEach((h) => h.forEach((v: any, idx: number) => {
          const s = String(v).toLowerCase();
          if (s.includes("class") || s.includes("lớp")) { if (cm.class === -1) cm.class = idx; }
          else if (s.includes("center") || s.includes("cơ sở") || s.includes("trung tâm")) { if (cm.center === -1) cm.center = idx; }
          else if (s.includes("student") || s.includes("sĩ số") || s.includes("sỹ số") || s.includes("size")) { if (cm.students === -1) cm.students = idx; }
          else if (s.includes("session date") || s.includes("ngày dạy") || s.includes("ngày học")) { if (cm.sessionDate === -1) cm.sessionDate = idx; }
        }));

        if (cfgMatrix) {
          for (let idx = 0; idx < dR2.length; idx++) { 
            if ([cm.class, cm.center].includes(idx)) continue; 
            const dt = parseAnyDate(dR2[idx]); 
            updateMinMaxC(dt);
          }
        } else {
          for (let i = cfgHdr+1; i < configData.length; i++) {
            const rr: any[] = Array.isArray(configData[i]) ? configData[i] : Object.values(configData[i]);
            if (cm.sessionDate !== -1 && rr[cm.sessionDate]) {
              const sDt = parseAnyDate(rr[cm.sessionDate]);
              updateMinMaxC(sDt);
            }
          }
        }
      }

      // Fallback sweep
      if (minC === null || maxC === null) {
        let dateColIdx = -1;
        const header = Array.isArray(configData[0]) ? configData[0] : Object.values(configData[0]);
        header.forEach((v: any, idx: number) => {
          const s = String(v).toLowerCase();
          if (s.includes("date") || s.includes("ngày") || s.includes("session")) {
            dateColIdx = idx;
          }
        });
        if (dateColIdx !== -1) {
          for (let i = 1; i < configData.length; i++) {
            const rr: any[] = Array.isArray(configData[i]) ? configData[i] : Object.values(configData[i]);
            const sDt = parseAnyDate(rr[dateColIdx]);
            updateMinMaxC(sDt);
          }
        }
      }
    }
    const configRange = (minC === null || maxC === null) ? "" : `${fmt(minC)} - ${fmt(maxC)}`;

    // 4. Common intersection of all active (uploaded) sources
    const activeRanges: { min: number; max: number }[] = [];
    if (minA !== null && maxA !== null) activeRanges.push({ min: minA, max: maxA });
    if (minB !== null && maxB !== null) activeRanges.push({ min: minB, max: maxB });
    if (minC !== null && maxC !== null) activeRanges.push({ min: minC, max: maxC });

    let commonRange = "";
    if (activeRanges.length >= 2) {
      const commonMin = Math.max(...activeRanges.map(r => r.min));
      const commonMax = Math.min(...activeRanges.map(r => r.max));
      commonRange = commonMin > commonMax ? "Không khớp thời gian" : `${fmt(commonMin)} - ${fmt(commonMax)}`;
    } else if (activeRanges.length === 1) {
      commonRange = `${fmt(activeRanges[0].min)} - ${fmt(activeRanges[0].max)}`;
    }

    return { 
      configDateRange: configRange, 
      taDateRange: taRange, 
      commonDateRange: commonRange 
    };
  }, [rosterData, auditResults.fileDateRangeA, appData.Q_CheckTAs]);

  const teacherGroupLabel = "TOTAL HOURS";
  const taGroupLabel = "TA";

  const location = useLocation();

  // Handle deep linking for tabs
  useEffect(() => {
    if (location.state?.activeTab) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab(location.state.activeTab);
      if (location.state.activeTab === "detail") {
        setIsConfigHidden(true);
      }
    }
  }, [location]);

  const clearAllFilters = () => {
    startTransition(() => {
      setSearchTerm("");
      setDetailManualFilter("");
      setSelectedDetailRow(null);
    });
  };

  const onFileAChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleUploadFileA(file);
    e.target.value = "";
    toast.success("Đã tải File Timesheet Giáo Viên");
  };

  const onFileConfigChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleUploadFileConfig(file);
    e.target.value = "";
    toast.success("Đã tải File Cấu Hình Sĩ Số");
  };

  const handleClearAudit = () => {
    clearData();
    setShowClearDialog(false);
    toast.success("Đã xoá dữ liệu đối soát");
  };

  // ----- MAIN DATA -----
  const mainData = useMemo(() => {
    return (
      auditResults.results?.map((r: any) => {
        let cName = (r.className || "").toString().trim();
        if (!cName || cName === "-" || cName === "") cName = "KHÔNG CÓ LỚP HỌC";
        
        return {
          ...r,
          className: cName,
          diffValue: r.actualTA - r.expected,
        };
      }) || []
    );
  }, [auditResults.results]);

  const mainColumns: Column[] = useMemo(() => [
    {
      key: "bu",
      label: "BU",
      sortable: true,
      filterable: true,
      width: 80,
      render: (val: string, row: any) => (
        <span className="font-bold text-slate-500">{val || row.bu || ""}</span>
      )
    },
    {
      key: "displayCenter",
      label: "L07",
      sortable: true,
      filterable: true,
      width: 120,
      headerClassName: "bg-[#F3EFE0] border-r border-[var(--grid-line-color,#E2E8F0)]",
      cellClassName: "bg-white border-r border-[var(--grid-line-color,#E2E8F0)]",
      render: (val: string) => (
        <span
          className="font-bold text-primary cursor-pointer hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            startTransition(() => {
              setDetailManualFilter(val);
              setActiveTab("detail");
              setIsConfigHidden(true);
            });
          }}
        >
          {val}
        </span>
      ),
    },
    {
      key: "className",
      label: "Lớp",
      sortable: true,
      filterable: true,
      width: 200,
      headerClassName: "bg-[#F3EFE0] border-r border-[var(--grid-line-color,#E2E8F0)]",
      cellClassName: "bg-white border-r border-[var(--grid-line-color,#E2E8F0)]",
      render: (val: string, row: any) => (
        <div
          className="font-bold text-foreground flex items-center gap-1.5 whitespace-nowrap cursor-pointer hover:text-primary"
          onClick={(e) => {
            e.stopPropagation();
            startTransition(() => {
              setDetailManualFilter(val);
              setActiveTab("detail");
              setIsConfigHidden(true);
            });
          }}
        >
          {val}
          {row.isKDG && (
            <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded-md text-[9px] font-black uppercase tracking-widest border border-primary/20">
              KDG
            </span>
          )}
        </div>
      ),
    },
    {
      key: "teacherHours",
      label: teacherGroupLabel,
      sortable: true,
      type: "number",
      width: 150,
      headerStyle: { backgroundColor: "#f8f8f8" },
      render: (val: any) => (
        <span className="tabular-nums font-bold text-primary">
          {(() => {
            const n = Number(val);
            return (val && val !== "-" && !isNaN(n) && n !== 0) ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
          })()}
        </span>
      ),
    },

    {
      key: "actualTA",
      label: taGroupLabel,
      sortable: true,
      type: "number",
      width: 207,
      headerStyle: {
        fontSize: "0.65rem",
        padding: "0.5rem",
      },
      render: (val: any) => (
        <span className="tabular-nums text-emerald-600 font-bold bg-emerald-50/50 px-2 py-1 rounded">
          {(() => {
            const n = Number(val);
            return (val && val !== "-" && !isNaN(n) && n !== 0) ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
          })()}
        </span>
      ),
    },
    {
      key: "numStudents",
      label: "STUDENTS",
      sortable: true,
      width: 100,
      align: "center",
      render: (val: any) => (
        <span
          className={`tabular-nums font-bold ${val && val !== 0 ? "text-primary" : "text-muted-foreground/30"}`}
        >
          {val && val !== 0 ? val : ""}
        </span>
      ),
    },
    {
      key: "expected",
      label: "ALLOWED TAs",
      sortable: true,
      type: "number",
      width: 140,
      render: (val: any, row: any) => (
        <div className="flex flex-col">
          <span className="text-slate-700 font-bold text-xs">
            {(() => {
              const n = Number(val);
              return (val && val !== "-" && !isNaN(n) && n !== 0) ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
            })()}
          </span>
          <span className="text-[10px] text-muted-foreground font-medium">
            {row.teacherHours > 0
              ? Number(row.expected / row.teacherHours || 0).toFixed(1)
              : 0}{" "}
            TAs Rule
          </span>
        </div>
      ),
    },
    
    {
      key: "diffValue",
      label: "Độ Lệch",
      sortable: true,
      type: "number",
      width: 150,
      render: (_: any, row: any) => (
        <span
          className={`font-bold ${row.statusColor === "emerald" ? "text-emerald-600" : row.statusColor === "amber" ? "text-amber-600" : "text-rose-600"}`}
        >
          {row.diffText}
        </span>
      ),
    },
    {
      key: "status",
      label: "TRẠNG THÁI",
      sortable: true,
      filterable: true,
      width: 150,
      headerStyle: {
        fontSize: "0.65rem",
        padding: "0.5rem",
      },
      render: (val: string, row: any) => (
        <div className="flex items-center gap-2 w-full pr-2">
          <span
            className={`px-3 py-1 rounded-full text-[0.625rem] font-bold uppercase tracking-widest flex items-center justify-center truncate tabular-nums shrink-0 ${
              row.statusColor === "emerald"
                ? "bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm w-[75px]"
                : row.statusColor === "amber"
                  ? "bg-amber-100 text-amber-700 border border-amber-200 shadow-sm flex-1 min-w-[120px]"
                  : "bg-rose-100 text-rose-700 border border-rose-200 shadow-sm flex-1 min-w-[120px]"
            }`}
            title={val}
          >
            {val}
          </span>
        </div>
      ),
    },
    {
      key: "actions",
      label: "",
      width: 76,
      headerClassName: "bg-slate-50 border-l border-slate-200",
      cellClassName: "bg-white border-l border-slate-200",
      render: (_: any, row: any) => (
        <div className="flex items-center justify-center w-full h-full gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              startTransition(() => {
                setDetailManualFilter(row.className || row.displayCenter);
                setActiveTab("detail");
                setIsConfigHidden(true);
              });
            }}
            title="Nhấp vào đây để xem chi tiết đối soát (chuyển sang tab Chi Tiết Lệch)"
            className={`p-1.5 rounded-lg transition-colors shrink-0 cursor-pointer flex items-center justify-center border shadow-sm active:scale-95 ${
              row.statusColor === "emerald" 
                ? "hover:bg-emerald-100 text-emerald-600 border-emerald-200 bg-emerald-50/50" 
                : row.statusColor === "amber"
                  ? "hover:bg-amber-100 text-amber-600 border-amber-200 bg-amber-50/50"
                  : "hover:bg-rose-100 text-rose-600 border-rose-200 bg-rose-50/50"
            }`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDetailRowClick(row, "className");
            }}
            title="Nhảy ra bảng dữ liệu Timesheet Cột O (Dữ liệu gốc ở cuối trang nguồn)"
            className="p-1.5 rounded-lg transition-colors shrink-0 cursor-pointer flex items-center justify-center border shadow-sm active:scale-95 text-primary bg-primary/5 hover:bg-primary/20 border-primary/20"
          >
            <AlertCircle className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ], [setActiveTab, setDetailManualFilter, setIsConfigHidden, teacherGroupLabel, taGroupLabel, handleDetailRowClick]);

  // ----- DETAIL DATA -----
  const [selectedDetailRow, setSelectedDetailRow] = useState<any>(null);

  const detailData = useMemo(() => {
    const getLocalAllowedTAs = (cls: string, students: number): number => {
      let c = String(cls).toLowerCase().replace(/\s+/g, "");
      c = c.replace(/kindy/g, "kdg").replace(/kin/g, "kdg");
      if (c.includes("kdg1") || c.includes("kdg2")) return students < 15 ? 2 : 3;
      if (c.includes("kdg3")) return students < 13 ? 1 : 2;
      if (c.includes("pristarter") || c.includes("primarystarter")) return 2;
      if (c.includes("pri1") || c.includes("primary1")) return students < 15 ? 1 : 2;
      if (c.includes("pri") || c.includes("primary")) return 1;
      if (c.includes("secstarter") || c.includes("secondarystarter")) return 1;
      return 0;
    };

    // Flatmap details - keeping all rows for detailed view, especially those with discrepancies
    const resultsToMap = auditResults.results || [];

    // 1. Flatten all sessions
    const allSessions: any[] = [];
    resultsToMap.forEach((row: any) => {
      row.alignedRows?.forEach((r: any) => {
        let parentClassName = (row.className || "").toString().trim();
        if (!parentClassName || parentClassName === "-") {
          parentClassName = "KHÔNG CÓ LỚP HỌC";
        }
        
        const fallbackTeacherName = row.teacherDetails?.length > 0
          ? Array.from(new Set(row.teacherDetails.map((td: any) => td?.name).filter(Boolean))).join(', ')
          : "Không có giáo viên";

        allSessions.push({
          ...r,
          _parentClassName: parentClassName,
          _parentCenter: row.displayCenter || row.center,
          _parentStatus: row.status,
          _parentBu: row.bu || "",
          _fallbackTeacherName: fallbackTeacherName,
          _type: r.teacher?.type || r.ta?.type || ""
        });
      });
    });

    // 2. Sort by Center, Class then Date (Using faster compare to prevent cross-center merging)
    allSessions.sort((a, b) => {
      const ctrA = a._parentCenter || "";
      const ctrB = b._parentCenter || "";
      if (ctrA !== ctrB) return ctrA < ctrB ? -1 : 1;
      const clsA = a._parentClassName || "";
      const clsB = b._parentClassName || "";
      if (clsA !== clsB) return clsA < clsB ? -1 : 1;
      const dateA = a.fullDate || "";
      const dateB = b.fullDate || "";
      return dateA < dateB ? -1 : 1;
    });

    // 3. Map with merge logic via rowSpans
    const finalData: any[] = [];
    const len = allSessions.length;
    let i = 0;
    while (i < len) {
      const current = allSessions[i];
      let j = i + 1;

      while (
        j < len &&
        allSessions[j].fullDate === current.fullDate &&
        allSessions[j]._parentClassName === current._parentClassName &&
        allSessions[j]._parentCenter === current._parentCenter
      ) {
        j++;
      }

      const span = j - i;
      let totalTaHoursForSpan = 0;
      let totalTeacherHoursForSpan = 0;
      let allowedTAs = 0;
      let maxStudentsInSpan = 0;
      const uniqueTAs = new Set();

      for (let k = i; k < j; k++) {
        const sess = allSessions[k];

        if (sess.ta) {
          if (sess.ta.hours) {
            totalTaHoursForSpan += sess.ta.hours;
            if (sess.ta.id) uniqueTAs.add(sess.ta.id);
          }
          if (sess.ta.allowedTAs) {
            allowedTAs = sess.ta.allowedTAs;
          }
          const sNum = parseInt(sess.ta.numStudents) || 0;
          if (sNum > maxStudentsInSpan) maxStudentsInSpan = sNum;
        }

        if (sess.teacher) {
          if (sess.teacher.hours) {
            totalTeacherHoursForSpan += sess.teacher.hours;
          }
          if (sess.teacher.allowedTAs) {
            allowedTAs = sess.teacher.allowedTAs;
          }
          const sNum = parseInt(sess.teacher.numStudents) || 0;
          if (sNum > maxStudentsInSpan) maxStudentsInSpan = sNum;
        }
      }

      if (!allowedTAs) {
        allowedTAs = getLocalAllowedTAs(current._parentClassName, maxStudentsInSpan);
      }

      let actualTAsCount = 0;
      for (let k = i; k < j; k++) {
        const sess = allSessions[k];
        if (sess.ta && (sess.ta.id || sess.ta.name || (sess.ta.hours && sess.ta.hours > 0))) {
          actualTAsCount++;
        }
      }

      const sessionStatus =
        actualTAsCount > allowedTAs ||
        totalTaHoursForSpan > totalTeacherHoursForSpan * allowedTAs + 0.05
          ? "Cần check lại"
          : "";

      const formattedTeacherHours =
        totalTeacherHoursForSpan > 0
          ? totalTeacherHoursForSpan.toFixed(2).replace(".", ",")
          : "0";
      const formattedAllowedTAs = String(allowedTAs).replace(".", ",");
      const formattedMaxStudents =
        maxStudentsInSpan > 0 ? String(maxStudentsInSpan) : "0";

      let totalTaHours = 0;
      let spanTeacherName = "";
      for (let k = i; k < j; k++) {
        totalTaHours += allSessions[k].ta?.hours || 0;
        if (!spanTeacherName && allSessions[k].teacher?.name && allSessions[k].teacher.name !== "-") {
          spanTeacherName = allSessions[k].teacher.name;
        }
      }
      if (!spanTeacherName) {
        spanTeacherName = current._fallbackTeacherName || "";
      }
      
      const formattedTotalTaHours = totalTaHours > 0 ? totalTaHours.toFixed(2).replace(".", ",") : "0";

      for (let k = i; k < j; k++) {
        const s = allSessions[k];
        const isFirst = k === i;
        finalData.push({
          groupId: i,
          isFirstInGroup: isFirst,
          id: `detail_${k}_${s._parentClassName}`,
          className: s._parentClassName || "KHÔNG CÓ LỚP HỌC",
          dateStr: s.fullDate || s.date || "",
          center: s._parentCenter || "",
          bu: s._parentBu || "",
          teacherName: spanTeacherName,
          teacherHours: formattedTeacherHours,
          taId: (s.ta?.id && s.ta.id !== "-") ? s.ta.id : "",
          taName: (s.ta?.name && s.ta.name !== "-") ? s.ta.name : "",
          taHours: (s.ta?.hours !== undefined && s.ta.hours !== 0)
            ? s.ta.hours.toFixed(2).replace(".", ",")
            : "",
          numStudents: formattedMaxStudents,
          allowedTAs: formattedAllowedTAs,
          actualTAs: actualTAsCount,
          variance: sessionStatus,
          type: s._type || "",
          _fullDate: s.fullDate || s.date || "",
          _fullClassName: s._parentClassName || "KHÔNG CÓ LỚP HỌC",
        });
      }
      i = j;
    }

    return finalData;
  }, [auditResults.results]);

  // Helper to capitalize names
  const capitalizeName = (name: any) => {
    const n = (name == null || name === "-" || name === "undefined") ? "" : String(name).trim();
    if (!n) return "";
    return n
      .toLowerCase()
      .split(" ")
      .filter((word) => word.length > 0)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // ----- FILTERED DETAIL DATA -----

  const filteredDetailData = useMemo(() => {
    // Show all detail rows by default so the table is not empty
    const result = detailData;

    if (!deferredDetailFilter) return result;

    const lower = deferredDetailFilter.toLowerCase();
    const groupMatches = new Set<number>();
    
    // Use standard for loop for performance
    for (let i = 0; i < result.length; i++) {
      const row = result[i];
      // Check specific fields that user might search for instead of Object.values
      if (
        (row.className && row.className.toLowerCase().includes(lower)) ||
        (row.teacherName && row.teacherName.toLowerCase().includes(lower)) ||
        (row.taName && row.taName.toLowerCase().includes(lower)) ||
        (row.dateStr && row.dateStr.toLowerCase().includes(lower)) ||
        (row.center && row.center.toLowerCase().includes(lower)) ||
        (row.variance && row.variance.toLowerCase().includes(lower))
      ) {
        groupMatches.add(row.groupId);
      }
    }

    // Filter using the set
    return result.filter(row => groupMatches.has(row.groupId));
  }, [detailData, deferredDetailFilter]);

  const detailColumns: Column[] = useMemo(() => [
    {
      key: "bu",
      label: "BU",
      group: "THÔNG TIN CHUNG",
      sortable: true,
      filterable: true,
      autoRowSpan: true,
      width: 80,
      render: (val: string, row: any) => {
        const displayBu = val || row.bu || "";
        return <span className="font-bold text-slate-500">{displayBu}</span>;
      }
    },
    {
      key: "center",
      label: "L07",
      group: "THÔNG TIN CHUNG",
      sortable: true,
      filterable: true,
      autoRowSpan: true,
      width: 140,
      headerClassName: "bg-[#F3EFE0] border-r border-[var(--grid-line-color,#E2E8F0)]",
      cellClassName: "bg-white border-r border-[var(--grid-line-color,#E2E8F0)]",
      render: (val: string, row: any) => (
        <span 
          className="font-bold text-slate-700 cursor-pointer hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            handleDetailRowClick(row, "center");
          }}
        >
          {val || row.displayCenter || "N/A"}
        </span>
      ),
    },
    {
      key: "className",
      label: "Lớp",
      group: "THÔNG TIN CHUNG",
      sortable: true,
      filterable: true,
      autoRowSpan: true,
      width: 140,
      headerClassName: "bg-[#F3EFE0] border-r border-[var(--grid-line-color,#E2E8F0)]",
      cellClassName: "bg-white border-r border-[var(--grid-line-color,#E2E8F0)]",
      render: (val: string, row: any) => {
        const displayVal = row._fullClassName || val || "KHÔNG CÓ LỚP HỌC";
        return (
          <span 
            className="font-bold text-primary cursor-pointer hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              handleDetailRowClick(row, "className");
            }}
          >
            {displayVal}
          </span>
        );
      },
    },
    {
      key: "dateStr",
      label: "DATE",
      group: "THÔNG TIN CHUNG",
      sortable: true,
      filterable: true,
      autoRowSpan: true,
      width: 100,
      render: (val: string, row: any) => (
        <span 
          className="font-bold text-primary cursor-pointer hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            handleDetailRowClick(row, "dateStr");
          }}
        >
          {val}
        </span>
      ),
    },

    // Group: Giáo Viên (Nguồn 1)
    {
      key: "teacherName",
      label: "GIÁO VIÊN",
      group: "THÔNG TIN CHUNG",
      sortable: true,
      filterable: true,
      autoRowSpan: true,
      width: 160,
      render: (val: string, row: any) => (
        <span 
          className="font-bold text-foreground cursor-pointer hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            handleDetailRowClick(row, "teacherName");
          }}
        >
          {capitalizeName(val)}
        </span>
      ),
    },
    {
      key: "teacherHours",
      label: "Giờ dạy (h)",
      group: "THÔNG TIN CHUNG",
      sortable: true,
      filterable: true,
      autoRowSpan: true,
      width: 90,
      align: "center",
      render: (val: string) => (
        <div 
          className="tabular-nums font-bold text-primary w-full h-full flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {(() => {
            const n = Number(val);
            return (val && val !== "-" && !isNaN(n) && n !== 0) ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : val;
          })()}
        </div>
      ),
    },

    // Group: Thông tin chung (Common Context)
    {
      key: "numStudents",
      label: "No. Students",
      group: "THÔNG TIN CHUNG",
      sortable: true,
      filterable: true,
      autoRowSpan: true,
      width: 100,
      align: "center",
      render: (val: any) => (
        <div
          className={`tabular-nums font-bold w-full h-full flex items-center justify-center ${val && val !== "0" && val !== 0 ? "text-primary" : "text-muted-foreground/30"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {val && val !== "0" && val !== 0 ? val : ""}
        </div>
      ),
    },
    {
      key: "allowedTAs",
      label: "Allowed TAs",
      group: "THÔNG TIN CHUNG",
      sortable: true,
      filterable: true,
      autoRowSpan: true,
      width: 90,
      align: "center",
      render: (val: any) => (
        <div className="tabular-nums font-bold text-slate-600 w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>{val || ""}</div>
      ),
    },
    {
      key: "actualTAs",
      label: "Actual TAs",
      group: "THÔNG TIN CHUNG",
      sortable: true,
      filterable: true,
      autoRowSpan: true,
      width: 90,
      align: "center",
      render: (val: any) => (
        <div className="tabular-nums font-bold text-emerald-600 w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>{val || ""}</div>
      ),
    },

    // Group: TA (Nguồn 2 - Thông tin riêng)
    {
      key: "taId",
      label: "ID NUMBER",
      group: "CHI TIẾT GIỜ LÀM TA",
      sortable: true,
      filterable: true,
      width: 120,
      render: (val: string, row: any) => (
        <span 
          className="tabular-nums text-[0.7rem] text-rose-600 font-bold cursor-pointer hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            handleDetailRowClick(row, "taId");
          }}
        >
          {formatIdNumber(val)}
        </span>
      ),
    },
    {
      key: "taName",
      label: taGroupLabel,
      group: "CHI TIẾT GIỜ LÀM TA",
      sortable: true,
      filterable: true,
      width: 180,
      render: (val: string, row: any) => (
        <span 
          className="font-bold text-emerald-700 cursor-pointer hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            handleDetailRowClick(row, "taName");
          }}
        >
          {capitalizeName(val)}
        </span>
      ),
    },
    {
      key: "taHours",
      label: "Giờ làm (h)", // Renamed to reflect merged sum
      group: "CHI TIẾT GIỜ LÀM TA",
      sortable: true,
      filterable: true,
      width: 90,
      align: "center",
      render: (val: string) => (
        <div className="tabular-nums text-emerald-600 font-bold w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          {(() => {
            const n = Number(val);
            return (val && val !== "-" && !isNaN(n) && n !== 0) ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : val;
          })()}
        </div>
      ),
    },

    // Group: Đối Soát (Kết luận)
    {
      key: "variance",
      label: "CHÊNH LỆCH",
      group: "CHI TIẾT GIỜ LÀM TA",
      sortable: true,
      filterable: true,
      width: 110,
      align: "center",
      render: (val: string) => (
        <div className="w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          <span
            className={`px-2 py-0.5 rounded-full text-[0.6rem] font-black tracking-widest border uppercase ${
              val?.includes("Khớp")
                ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                : "bg-rose-50 text-rose-600 border-rose-100"
            }`}
          >
            {val}
          </span>
        </div>
      ),
    },
    {
      key: "actions",
      label: "",
      width: 50,
      headerClassName: "bg-slate-50 border-l border-slate-200",
      cellClassName: "bg-white border-l border-slate-200",
      render: (_: any, row: any) => (
        <div className="flex items-center justify-center w-full h-full">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDetailRowClick(row, "className");
            }}
            title="Nhảy ra bảng dữ liệu Roster"
            className="p-1.5 rounded-lg transition-colors shrink-0 cursor-pointer flex items-center justify-center border shadow-sm active:scale-95 text-primary bg-primary/5 hover:bg-primary/20 border-primary/20"
          >
            <AlertCircle className="w-4 h-4" />
          </button>
        </div>
      )
    }
  ], [handleDetailRowClick, taGroupLabel]);

  const handleExportExcel = () => {
    if (!auditResults.results || auditResults.results.length === 0) {
      toast.error("Không có dữ liệu để xuất!");
      return;
    }

    // Main Report Export
    const exportData = mainData.map((row: any) => ({
      "BU": row.bu || "",
      "L07": row.displayCenter || row.center,
      Lớp: row.className,
      KDG: row.isKDG ? "Có" : "Không",
      "TOTAL HOURS": row.teacherHours,
      "TA Thực Tế (B)": row.actualTA,
      "Trạng Thái": row.status,
    }));

    // Details Export
    const exportDetails = detailData.map((row: any) => ({
      "BU": row.bu || "",
      "L07": row.center,
      Lớp: row.className,
      "Ngày Lịch": row.dateStr,
      "A - Tên GV": row.teacherName,
      "A - Sĩ Số": row.numStudents,
      "ALLOWED TAs": row.allowedTAs,
      "A - Giờ": row.teacherHours,
      "B - ID TA": row.taId,
      "B - Tên TA": row.taName,
      "B - Giờ": row.taHours,
      "Trạng Thái Lớp": row.variance,
    }));

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(prepareDataForExport(exportData));
    const ws2 = XLSX.utils.json_to_sheet(prepareDataForExport(exportDetails));

    XLSX.utils.book_append_sheet(wb, ws1, "Báo_Cáo_Tong_Hop");
    XLSX.utils.book_append_sheet(wb, ws2, "Chi_Tiet_Đoi_Soat");
    XLSX.writeFile(wb, `Audit_Report.xlsx`);
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="page-audit flex-1 flex flex-col min-h-0 bg-transparent px-5 pb-5 pt-2 gap-4 w-full h-full overflow-hidden"
      style={{ paddingTop: "12px", paddingBottom: "20px", paddingRight: "20px", paddingLeft: "20px" }}
    >
      <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] bg-emerald-500/5 rounded-full blur-[120px] -z-10" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[30%] h-[30%] bg-emerald-500/5 rounded-full blur-[100px] -z-10" />

      <div className="flex flex-col md:flex-row gap-2 w-full flex-1 min-h-0 min-w-0 relative z-10">
        {/* Left Panel - Source Selection (Swapped back to left) */}
        {!isConfigHidden && (
          <motion.div
            key="audit-config"
            initial={{ x: -320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="w-full md:w-[284px] bg-white border border-emerald-100 p-3 flex flex-col gap-4 relative md:flex-none shrink-0 z-[60] min-h-0 rounded-none soft-card shadow-lg"
            style={{ borderColor: "#d0d0d0", borderRadius: "0px" }}
          >
            <div className="absolute inset-0 bg-pattern-green opacity-[0.03] pointer-events-none rounded-none" style={{ borderRadius: "0px" }} />

            <div className="flex flex-col gap-5 flex-1 relative z-10 overflow-y-auto custom-scrollbar pr-1 w-full">
              {activeTab === "detail" && selectedDetailRow && (
                <div className="p-4 bg-emerald-50/50 rounded-none border border-emerald-200/60 shadow-sm animate-in fade-in zoom-in-95" style={{ borderRadius: "0px" }}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[0.6rem] font-black uppercase tracking-widest text-primary">
                      SESSION CONTEXT
                    </p>
                    <button
                      onClick={() => {
                        setSelectedDetailRow(null);
                        setSearchTerm("");
                      }}
                      className="text-primary hover:text-rose-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-black text-slate-800">
                      {selectedDetailRow._fullDate}
                    </p>
                    <p className="text-[0.65rem] font-bold text-primary/80 uppercase tracking-tight truncate">
                      {selectedDetailRow._fullClassName}
                    </p>
                  </div>
                  <div className="mt-3 pt-3 border-t border-emerald-100">
                    <p className="text-[0.55rem] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                      Rule Info
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-[0.65rem] font-bold text-slate-700">
                        Sĩ số: {selectedDetailRow.numStudents}
                      </span>
                      <span className="text-[0.65rem] font-black text-primary bg-emerald-100/40 px-2 py-0.5 rounded-full">
                        ALLOWED TAs: {selectedDetailRow.allowedTAs} TAs
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Source A Component */}
              <div className="audit-source-card flex w-full shrink-0 flex-col overflow-hidden border border-slate-200 bg-white shadow-2xs">
                <span className="flex min-h-7 items-center gap-2 border-b border-slate-200 bg-primary/[0.035] px-2.5 py-1 text-[0.62rem] font-extrabold uppercase tracking-widest text-slate-600">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <FileText className="h-3 w-3" />
                  </span>
                  <span className="whitespace-normal break-words">MR.03 - Teacher Timesheet</span>
                </span>
                <label
                  htmlFor="upload-file-a-audit"
                  className={`relative flex min-h-[68px] w-full cursor-pointer flex-col justify-center p-2.5 transition-all duration-300 group ${
                    fileNameA
                      ? "bg-emerald-50/45 hover:bg-emerald-50/70"
                      : "bg-white hover:bg-primary/[0.025]"
                  }`}
                >
                  <input
                    type="file"
                    id="upload-file-a-audit"
                    className="hidden"
                    accept=".xlsx,.xls,.csv,.gsheet"
                    onChange={onFileAChange}
                  />
                  {!fileNameA ? (
                    <div className="flex w-full flex-col items-center gap-1 py-1 text-center">
                      <PlusCircle className="h-6 w-6 text-slate-400 transition-transform duration-300 group-hover:scale-105 group-hover:text-primary" />
                      <span className="text-[0.65rem] font-extrabold text-slate-500 uppercase tracking-widest block mt-1">
                        Tải File GV
                      </span>
                      <span className="text-[0.55rem] text-slate-400 font-bold">
                        Hỗ trợ .xlsx, .xls, .csv
                      </span>
                    </div>
                  ) : (
                    <div className="w-full flex items-center gap-3">
                      <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center shrink-0 text-emerald-600 shadow-sm">
                        <CheckCircle2 className="w-5 h-5 animate-bounce-subtle" />
                      </div>
                      <div className="flex-1 min-w-0 py-1">
                        <p className="text-[0.65rem] font-bold text-slate-700 whitespace-normal break-words leading-snug uppercase tracking-wide">
                          {fileNameA}
                        </p>
                        <p className="text-[11px] leading-tight font-extrabold text-primary uppercase mt-0.5 whitespace-normal break-words" title={teacherDateRange || "Dữ liệu đã sẵn sàng"}>
                          {teacherDateRange || "Dữ liệu đã sẵn sàng"}
                        </p>
                        <span className="inline-block text-[8px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded mt-1 tracking-wider uppercase">
                          HOÀN TẤT
                        </span>
                      </div>
                    </div>
                  )}
                </label>
              </div>

              {/* Source Config Component */}
              <div className="audit-source-card flex w-full shrink-0 flex-col overflow-hidden border border-slate-200 bg-white shadow-2xs">
                <span className="flex min-h-7 items-center gap-2 border-b border-slate-200 bg-primary/[0.035] px-2.5 py-1 text-[0.62rem] font-extrabold uppercase tracking-widest text-slate-600">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <BadgeCheck className="h-3 w-3" />
                  </span>
                  <span className="whitespace-normal break-words">MR.07 - Class hour</span>
                </span>
                <label
                  htmlFor="upload-file-config-audit"
                  className={`relative flex min-h-[68px] w-full cursor-pointer flex-col justify-center p-2.5 transition-all duration-300 group ${
                    fileNameConfig
                      ? "bg-emerald-50/45 hover:bg-emerald-50/70"
                      : "bg-white hover:bg-primary/[0.025]"
                  }`}
                >
                  <input
                    type="file"
                    id="upload-file-config-audit"
                    className="hidden"
                    accept=".xlsx,.xls,.csv,.gsheet"
                    onChange={onFileConfigChange}
                  />
                  {!fileNameConfig ? (
                    <div className="flex flex-col items-center gap-1 py-1 text-center">
                      <PlusCircle className="h-6 w-6 text-slate-400 transition-transform duration-300 group-hover:scale-105 group-hover:text-primary" />
                      <span className="text-[0.65rem] font-extrabold text-slate-500 uppercase tracking-widest block mt-1">
                        Tải File Sĩ Số
                      </span>
                      <span className="text-[0.55rem] text-slate-400 font-bold">
                        Hỗ trợ .xlsx, .xls, .csv
                      </span>
                    </div>
                  ) : (
                    <div className="w-full flex items-center gap-3">
                      <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center shrink-0 text-emerald-600 shadow-sm">
                        <CheckCircle2 className="w-5 h-5 animate-bounce-subtle" />
                      </div>
                      <div className="flex-1 min-w-0 py-1">
                        <p className="text-[0.65rem] font-bold text-slate-700 whitespace-normal break-words leading-snug uppercase tracking-wide">
                          {fileNameConfig}
                        </p>
                        <p className="text-[11px] leading-tight font-extrabold text-primary uppercase mt-0.5 whitespace-normal break-words" title={configDateRange || "Dữ liệu sĩ số đã tải lên"}>
                          {configDateRange || "DỮ LIỆU SĨ SỐ OK"}
                        </p>
                        <span className="inline-block text-[8px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded mt-1 tracking-wider uppercase">
                          HOÀN TẤT
                        </span>
                      </div>
                    </div>
                  )}
                </label>
              </div>

              {/* Source B Component */}
              <div className="audit-source-card flex w-full shrink-0 flex-col overflow-hidden border border-slate-200 bg-white shadow-2xs">
                <span className="flex min-h-7 items-center gap-2 border-b border-slate-200 bg-primary/[0.035] px-2.5 py-1 text-[0.62rem] font-extrabold uppercase tracking-widest text-slate-600">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Users className="h-3 w-3" />
                  </span>
                  <span className="whitespace-normal break-words">Dữ liệu Lớp Học (B)</span>
                </span>
                <div
                  className={`relative flex min-h-[68px] w-full flex-col justify-center p-2.5 transition-all duration-300 group ${
                    rosterData?.length > 0
                      ? "bg-emerald-50/45"
                      : "bg-white"
                  }`}
                >
                  {!rosterData?.length ? (
                    <div className="flex w-full flex-col items-center gap-1 py-1 text-center">
                      <Users className="h-6 w-6 text-slate-400 animate-pulse-subtle" />
                      <span className="text-[0.65rem] font-extrabold text-slate-500 uppercase tracking-widest block mt-1">
                        Chưa có Roster
                      </span>
                      <span className="text-[0.55rem] text-slate-400 font-bold">
                        Cần tải dữ liệu ở Timesheet Hub
                      </span>
                    </div>
                  ) : (
                    <div className="w-full flex items-center gap-3">
                      <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center shrink-0 text-emerald-600 shadow-sm">
                        <CheckCircle2 className="w-5 h-5 animate-bounce-subtle" />
                      </div>
                      <div className="flex-1 min-w-0 py-1">
                        <p className="text-[0.65rem] font-bold text-slate-700 whitespace-normal break-words leading-snug uppercase tracking-wide">
                          {rosterData.length} dòng dữ liệu
                        </p>
                        <p className="text-[11px] leading-tight font-extrabold text-primary uppercase mt-0.5 whitespace-normal break-words" title={taDateRange || "Đang chờ dữ liệu"}>
                          {taDateRange || "Đang chờ dữ liệu"}
                        </p>
                        <span className="inline-block text-[8px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded mt-1 tracking-wider uppercase border border-emerald-200">
                          ROSTER GỐC OK
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Common Date Range Display */}
            {(teacherDateRange || taDateRange || configDateRange) && (
              <div className="audit-source-card mt-auto flex w-full shrink-0 flex-col overflow-hidden border border-slate-200 bg-white shadow-2xs">
                <div className="flex min-h-7 items-center gap-2 border-b border-slate-200 bg-primary/[0.035] px-2.5 py-1">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Calendar className="h-3 w-3" />
                  </span>
                  <h4 className="text-[0.6rem] font-extrabold uppercase tracking-wider text-slate-600">
                    Thời gian chung (A, B & MR.07)
                  </h4>
                </div>
                <div className="flex min-h-[44px] items-center px-2.5 py-2">
                  <div className="min-w-0 flex-1">
                    <p
                      className="whitespace-normal break-words text-[11px] font-black uppercase leading-snug text-primary"
                      title={commonDateRange || (isProcessing ? "Đang tính toán..." : "Chưa đủ dữ liệu")}
                    >
                      {commonDateRange || (isProcessing ? "Đang tính toán..." : "Chưa đủ dữ liệu")}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Right Panel - Results (Expanded to fill remaining space) */}
        <div 
          className="unified-table-frame flex-1 bg-white flex flex-col min-h-0 min-w-0 relative rounded-none overflow-hidden shadow-xs border border-slate-300 dark:border-slate-700"
          style={{ paddingTop: "0px", paddingBottom: "0px", borderRadius: "0px", borderWidth: "1px", borderColor: "#cbd5e1", marginBottom: "0px", paddingLeft: "0px", marginLeft: "6px" }}
        >
          <div className="absolute inset-0 bg-pattern-green opacity-[0.02] pointer-events-none" />
          <div 
            className="unified-table-frame-header px-6 md:px-8 py-2.5 flex items-center justify-between border-b border-emerald-50 bg-white shrink-0 relative z-[200] rounded-t-none"
            style={{ borderColor: "#e6e6e6" }}
          >
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsConfigHidden(!isConfigHidden)}
                  className="flex items-center justify-center rounded-full border border-slate-200/90 bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-all shadow-xs cursor-pointer w-7 h-7 p-0 active:scale-95 shrink-0"
                  title={!isConfigHidden ? "Ẩn Panel Sidebar" : "Hiện Panel Sidebar"}
                  type="button"
                >
                  <PanelLeft className="w-3.5 h-3.5 text-primary" />
                </button>
                {/* Section title or status could go here */}
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/40">
                  Audit reconciliation
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3">
              <AnimatePresence>
                {(searchTerm || selectedDetailRow) && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    onClick={clearAllFilters}
                    className="px-4 py-2 bg-rose-50 text-rose-600 border border-rose-100 rounded-[20px] text-[0.65rem] font-bold uppercase tracking-widest hover:bg-rose-100 transition-colors flex items-center gap-2 shadow-xs"
                    style={{ borderRadius: "20px" }}
                  >
                    <Trash2 className="w-3 h-3" />
                    Thoát Lọc
                  </motion.button>
                )}
              </AnimatePresence>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button 
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50 transition-all shadow-xs cursor-pointer active:scale-95 shrink-0"
                    title="Cài đặt & Công cụ"
                  >
                    <Wrench className="w-4 h-4 text-slate-600 hover:rotate-45 transition-transform duration-300" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-72 p-2 rounded-2xl shadow-xl border-border bg-white"
                >
                  <div className="p-2 pb-3 mb-1 border-b border-primary/5">
                    <div className="relative">
                      <DebouncedSearchInput
                        value={searchTerm}
                        onChange={setSearchTerm}
                        placeholder="TÌM KIẾM..."
                      />
                      <Search className="w-3.5 h-3.5 text-primary/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                  <DropdownMenuLabel className="text-[0.6rem] font-black uppercase tracking-widest text-muted-foreground/40 px-3 py-2">
                    Công cụ & Thao tác
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onClick={handleRefreshData}
                    disabled={isRefreshing}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  >
                    <RefreshCw className={`w-4 h-4 text-[#d1435b] ${isRefreshing ? "animate-spin" : ""}`} />
                    <span className="text-xs font-bold text-slate-700">
                      Làm mới dữ liệu đối soát
                    </span>
                  </DropdownMenuItem>



                  <DropdownMenuItem
                    onClick={() => window.dispatchEvent(new Event("open-ui-settings"))}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  >
                    <Settings className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-bold text-slate-700">
                      Cài đặt Giao diện
                    </span>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onClick={handleExportExcel}
                    disabled={
                      !auditResults.results || auditResults.results.length === 0
                    }
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs font-bold text-slate-700">
                      Xuất báo cáo Excel
                    </span>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => setShowClearDialog(true)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer text-rose-500 focus:text-rose-600 focus:bg-rose-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="text-xs font-bold">
                      Xóa dữ liệu đối soát
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Buttons moved into Settings Dropdown as per request */}
            </div>
          </div>
        </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-0">
          {auditResults?.isCalculating || isProcessing ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-white/50 relative z-10 w-full h-full p-6">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                <div className="w-8 h-8 rounded-full bg-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 shadow-inner" />
              </div>
              <p className="mt-8 text-xs font-black uppercase tracking-[0.3em] text-primary/70 animate-pulse text-center">
                Hệ thống đang đối soát dữ liệu...
              </p>
            </div>
          ) : !fileNameA || !auditResults.results || auditResults.results.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-primary/10 relative z-10 w-full h-full p-6 bg-transparent">
              <p className="text-2xl font-bold text-muted-foreground/60 italic text-center max-w-sm">
                Chưa có báo cáo để hiển thị
              </p>
              <p className="text-[0.625rem] font-bold uppercase opacity-40 tracking-[0.3em] mt-4 text-center">
                VUI LÒNG TẢI FILE Timesheet (A) VÀ File Lớp Học (B)
              </p>
            </div>
          ) : activeTab === "main" ? (
            <DataTable
              key="main-table"
              columns={mainColumns}
              data={mainData}
              isEditable={false}
              showRowNumber={true}
              hideSearch={false}
              showFooter={true}
              onFilteredDataChange={handleFilteredDataChange}
              externalSearchTerm={deferredSearchTerm}
              onExternalSearchChange={setSearchTerm}
              onRowClick={handleMainRowClick}
              storageKey="audit_main_v2"
              headerClassName="bg-slate-50 border-b border-border py-3"
              className="border-t-0 flex-1"
              striped={false}
            />
          ) : (
            <DataTable
              key="detail-table"
              columns={detailColumns}
              data={filteredDetailData}
              isEditable={false}
              showRowNumber={true}
              hideSearch={true}
              showFooter={true}
              onFilteredDataChange={handleFilteredDataChange}
              externalSearchTerm=""
              onExternalSearchChange={setDetailManualFilter}
              storageKey="audit_detail_v2"
              headerClassName="bg-slate-50 border-b border-border py-3"
              className="border-t-0 flex-1 audit-detail-table"
              title={`DEBUG: results=${detailData.length}, filtered=${filteredDetailData.length}, filter="${detailManualFilter}"`}
              striped={false}
            />
          )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
