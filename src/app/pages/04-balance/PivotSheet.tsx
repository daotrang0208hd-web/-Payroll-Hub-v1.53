/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/purity, @typescript-eslint/no-unused-vars */
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  Download,
  RefreshCw,
  FileSpreadsheet,
  Eye,
  Upload,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Trash2,
  Columns,
  Rows,
  Plus,
  X,
  Settings,
  Maximize2,
} from "lucide-react";
import { useAppData } from "../../lib/contexts/AppDataContext";
import {
  applyPivotMktTypeCache,
  buildPivotFromAppData,
  formatPivotTypeHeader,
  getPivotDataMonths,
  readPivotMktTypeCache,
  PIVOT_CACHE_VERSION,
  updatePivotMktTypeCache,
  writePivotMktTypeCache,
  type PivotGroupedData,
} from "../../lib/utils/pivot-utils";
import { resolveMktRosterCenter } from "../../lib/utils/center-utils";
import { parseDurationToHours } from "../../lib/schemas/excel-schema";
import { parseMoneyToNumber as parseExcelMoney } from "../../lib/utils/data-utils";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

// ==========================================
// HELPER UTILITIES EXPORTS FOR COMPATIBILITY
// ==========================================

export function parseMoneyToNumber(val: any): number {
  return parseExcelMoney(val);
}

export function formatNumber(val: any): string {
  const n = parseMoneyToNumber(val);
  const rounded = Math.round(n);
  return rounded.toLocaleString('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function formatMoneyVND(val: any): string {
  const n = parseMoneyToNumber(val);
  const rounded = Math.round(n);
  return rounded.toLocaleString('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function removeVietnameseTones(str: string): string {
  if (!str) return '';
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

export function formatIdNumber(id: any): string {
  return String(id || '').trim();
}

export function prepareDataForExport(data: any[]): any[] {
  return data;
}

export function parseAnyDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

export function getVal(row: any, key: string): any {
  return row ? row[key] : null;
}

export function parseTimeStrToHours(timeStr: string): number {
  if (!timeStr) return 0;
  const [h, m] = String(timeStr).split(':').map(Number);
  return (h || 0) + (m || 0) / 60;
}

export async function getExcelFileBuffer(
  file: File,
): Promise<{ buffer: ArrayBuffer; name: string }> {
  if (!file) {
    throw new Error("Không tìm thấy thông tin file để đọc.");
  }
  return {
    buffer: await file.arrayBuffer(),
    name: file.name,
  };
}

export function formatTime12Hour(timeStr: string): string {
  return String(timeStr);
}

export const COMMON_FIELD_ALIASES: Record<string, string[]> = {};
export function scoreMatch(a: string, b: string): number { return a === b ? 1 : 0; }
export function normalizeId(id: any): string { return String(id || ''); }
export function toVietnamDateString(date: Date): string { return String(date); }
export function generateUUID(): string { return Math.random().toString(36).substring(2, 9); }
export async function fetchGoogleSheetAsFile(url: string, name: string): Promise<File> { return new File([], name); }
export function isMoneyColumn(col: string): boolean { return Boolean(col && col.toLowerCase().includes('money')); }
export async function fetchWithBackoff(fn: any): Promise<any> { return await fn(); }

function mergePivotTypeColumns(
  currentColumns: string[],
  incomingColumns: string[],
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  [...(currentColumns || []), ...(incomingColumns || [])].forEach((column) => {
    const normalized = String(column || "").trim().toUpperCase();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });

  return result;
}

// ==========================================
// MAPPING DEFINITIONS & LOGIC FROM SPEC
// ==========================================

const rawCenterToMktMap: Record<string, string> = {
  "Ly Thai To": "BN0001.LTT", "Tu Son": "BN0002.TSN", "Pho Hue": "HN0001.PHY",
  "Thai Ha": "HN0002.THA", "Hoang Quoc Viet": "HN0003.HQV", "Lieu Giai": "HN0004.LGI",
  "Nguyen Van Linh": "HN0005.NVL", "Van Quan": "HN0007.VQN", "The Garden": "HN0010.MDH",
  "Nguyen Huu Tho": "HN0012.NHT", "Tan Mai": "HN0014.TMI", "Van Phu": "HN0015.VPU",
  "Phan Dinh Phung": "HN0016.PDP", "Ham Nghi": "HN0017.HNI", "Vu Tong Phan": "HN0018.VTP",
  "Nguyen Tuan": "HN0019.NTN", "Ngoai Giao Doan": "HN0021.NGD", "Mo Lao": "HN0022.NVO",
  "Linh Dam": "HN0023.LDM", "Times City": "HN0024.TCY", "Le Trong Tan": "HN0025.LTT",
  "Viet Hung": "HN0026.VHG", "Ocean Park": "HN0027.OPK", "Pham Van Dong": "HN0028.PVD",
  "Vu Pham Ham": "HN0029.VPH", "An Khanh": "HN0030.AKH", "An Hung": "HN0031.AHG",
  "Lac Long Quan": "HN0032.LLQ", "Dong Anh": "HN0033.DAH", "Hong Tien": "HN0034.HTN",
  "Ecopark": "HY0001.ECP", "Hai Phong": "Hai Phong", "Quang Ninh": "QN0001.HLG",
  "Vinh": "VIN001.CTG", "Vinh Phuc": "VP0001.PCT", "Thanh Hoa": "TH0001.TPU",
  "Thai Nguyen": "TN0001.LNQ", "Phu Tho": "PT0001.HVG", "NTW": "NTW"
};

const aeCodeToL07Map: Record<string, string> = {
  "Ngo Si Lien": "BN0001.LTT",
  "Tu Son": "BN0002.TSN",
  "Pho Hue Junior": "HN0001.PHY",
  "Pho Hue": "HN0001.PHY",
  "Thai Ha": "HN0002.THA",
  "Thai Ha (center Láng Hạ)": "HN0002.THA",
  "Thai Ha (center Lang Ha)": "HN0002.THA",
  "Hoang Quoc Viet": "HN0003.HQV",
  "Lieu Giai": "HN0004.LGI",
  "Nguyen Van Linh": "HN0005.NVL",
  "Van Quan": "HN0007.VQN",
  "My Dinh": "HN0010.MDH",
  "The Garden": "HN0010.MDH",
  "Hoang Mai": "HN0012.NHT",
  "Nguyen Huu Tho": "HN0012.NHT",
  "Tan Mai": "HN0014.TMI",
  "Van Phu": "HN0015.VPU",
  "Phan Dinh Phung": "HN0016.PDP",
  "Ham Nghi": "HN0017.HNI",
  "Vu Tong Phan": "HN0018.VTP",
  "Nguyen Tuan": "HN0019.NTN",
  "Ngoai Giao Doan": "HN0021.NGD",
  "Nguyen Van Loc": "HN0022.NVO",
  "Mo Lao": "HN0022.NVO",
  "Linh Dam": "HN0023.LDM",
  "TIMES CITY": "HN0024.TCY",
  "Le Trong Tan": "HN0025.LTT",
  "Viet Hung": "HN0026.VHG",
  "Ocepark": "HN0027.OPK",
  "Ocean Park": "HN0027.OPK",
  "Pham Van Dong": "HN0028.PVD",
  "Vu Pham Ham": "HN0029.VPH",
  "An Khanh": "HN0030.AKH",
  "An Hung": "HN0031.AHG",
  "Xuan Dieu (đổi thành Lạc Long Quân)": "HN0032.LLQ",
  "Xuan Dieu": "HN0032.LLQ",
  "Lac Long Quan": "HN0032.LLQ",
  "HN33.DAH": "HN0033.DAH",
  "Dong Anh": "HN0033.DAH",
  "HN34.HTN": "HN0034.HTN",
  "Hong Tien": "HN0034.HTN",
  "Ecopark": "HY0001.ECP",
  "Hai Phong": "MKT LOCAL NORTH_HP",
  "Hai Phong 1": "HP0001.LHP",
  "Hai Phong 2": "HP0002.HBT",
  "Hai Phong 3": "HP0003.VIN",
  "Ha Long": "QN0001.HLG",
  "Quang Ninh": "QN0001.HLG",
  "Vinh": "VIN001.CTG",
  "Vinh Phuc": "VP0001.PCT",
  "TH01.TPU": "TH0001.TPU",
  "Thanh Hoa": "TH0001.TPU",
  "TN01.LNQ": "TN0001.LNQ",
  "Thai Nguyen": "TN0001.LNQ",
  "PT01.HVG": "PT0001.HVG",
  "Phu Tho": "PT0001.HVG",
  "Apollo Advance -South": "AA",
  "ASP - HN": "HN0200.ASP",
  "MKT LOCAL NORTH": "MKT LOCAL NORTH",
  "Cambridge": "ZHN0000.GY",
  "MKT HP": "MKT LOCAL NORTH_HP",
  "MKT TN01.LNQ": "MKT LOCAL NORTH_TN",
  "MKT PT01.HVG": "MKT LOCAL NORTH_PT",
  "MKT TH01.TPU": "MKT LOCAL NORTH_TH",
  "NTW": "NTW",
  "Contest": "ZHN0000.GY"
};

function extractBankName(fileName: string, bankLabel?: string) {
  if (bankLabel) {
    const upperBank = bankLabel.toUpperCase();
    if (upperBank.includes("MKT")) return "MKT LOCAL";
  }
  const name = fileName.toUpperCase().replace(/\.[^/.]+$/, "");
  const tokens = name.replace(/[^A-Z0-9]/g, ' ').split(/\s+/);
  
  if (tokens.includes('MKT')) return 'MKT LOCAL';
  if (tokens.includes('TH')) return 'TH';
  if (tokens.includes('HP')) return 'HP';
  if (tokens.includes('TN')) return 'TN';
  if (tokens.includes('PT')) return 'PT';
  if (tokens.includes('NORTH')) return 'NORTH';
  
  return 'NORTH';
}

function processNorthLogic(rawCenter: string) {
  const cleaned = rawCenter ? String(rawCenter).trim() : "";
  let l07 = cleaned;

  for (const [key, value] of Object.entries(aeCodeToL07Map)) {
    if (key.toUpperCase() === cleaned.toUpperCase()) {
      l07 = value;
      break;
    }
  }

  if (l07 === cleaned) {
    const upperClean = cleaned.toUpperCase();
    if (upperClean.includes("THAI HA") || upperClean.includes("THÁI HÀ")) l07 = "HN0002.THA";
    else if (upperClean.includes("XUAN DIEU") || upperClean.includes("XUÂN DIỆU") || upperClean.includes("LAC LONG QUAN") || upperClean.includes("LẠC LONG QUÂN")) l07 = "HN0032.LLQ";
    else if (upperClean.includes("OCEAN PARK") || upperClean.includes("OCEPARK")) l07 = "HN0027.OPK";
  }

  let bu = "OTHER";
  if (l07 === "AA" || l07 === "ZHN0000.GY" || l07 === "HN0200.ASP" || l07.startsWith("HN") || l07.startsWith("BN") || l07.startsWith("HY") || l07.startsWith("QN") || l07.startsWith("VIN") || l07.startsWith("VP") || l07 === "MKT LOCAL NORTH") {
    bu = "AHN";
  } else if (l07.startsWith("HP") || l07.toUpperCase() === "HAI PHONG" || l07 === "MKT LOCAL NORTH_HP") {
    bu = "AHP";
  } else if (l07.startsWith("TN") || l07 === "MKT LOCAL NORTH_TN") {
    bu = "ATN";
  } else if (l07.startsWith("TH") || l07 === "MKT LOCAL NORTH_TH") {
    bu = "ATH";
  } else if (l07.startsWith("PT") || l07 === "MKT LOCAL NORTH_PT") {
    bu = "APT";
  }

  return { chargeToCenterMkt: "", l07, bu };
}

function processTimesheetMktLogic(inputData: { chargetocenterCode: string }) {
  const resolved = resolveMktRosterCenter(inputData.chargetocenterCode);
  return {
    chargeToCenterMkt: resolved.chargeToCenterMkt,
    l07: resolved.l07,
    bu: resolved.business || "OTHER",
  };
}

function parseMonthFromFileName(fileName: string, globalMonth?: string): string | null {
  if (!fileName) return null;
  const match = fileName.match(/\b(0?[1-9]|1[0-2])[./-](20\d{2})\b/);
  if (match) {
    const m = parseInt(match[1], 10);
    const y = parseInt(match[2], 10);
    return `${m < 10 ? "0" + m : m}.${y}`;
  }
  const tMatch = fileName.match(/(Th\w*|T|Month\s*)(0?[1-9]|1[0-2])\b/i);
  if (tMatch) {
    const m = parseInt(tMatch[2], 10);
    const ref = globalMonth || "03.2026";
    const refParts = ref.split(".");
    const currentMonthNum = parseInt(refParts[0], 10) || 3;
    const currentYearNum = parseInt(refParts[1], 10) || 2026;
    let y = currentYearNum;
    if (m === 11 || m === 12) {
      y = 2025;
    } else if (m > currentMonthNum) {
      y = currentYearNum - 1;
    }
    return `${m < 10 ? "0" + m : m}.${y}`;
  }
  return null;
}

// ==========================================
// MAIN PIVOT SHEET REACT COMPONENT
// ==========================================

export function PivotSheet() {
  const { appData } = useAppData();
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>(() => {
    try {
      const cached = localStorage.getItem("pivot_master_selected_month_filter");
      return cached || "ALL";
    } catch {
      return "ALL";
    }
  });

  const [groupedData, setGroupedData] = useState<Record<string, Record<string, Record<string, Record<string, number>>>>>(() => {
    try {
      const cached = localStorage.getItem("pivot_master_processed_data");
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.cacheVersion === PIVOT_CACHE_VERSION
          ? parsed.groupedData || {}
          : {};
      }
    } catch (e) {
      console.warn("Error reading pivot cache", e);
    }
    return {};
  });

  const [typeColumns, setTypeColumns] = useState<string[]>(() => {
    try {
      const cached = localStorage.getItem("pivot_master_processed_data");
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.cacheVersion === PIVOT_CACHE_VERSION
          ? parsed.typeColumns || []
          : [];
      }
    } catch {
      // ignore cache error
    }
    return [];
  });

  const [diagnosticLogs, setDiagnosticLogs] = useState<any[]>(() => {
    try {
      const cached = localStorage.getItem("pivot_master_processed_data");
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.cacheVersion === PIVOT_CACHE_VERSION
          ? parsed.diagnosticLogs || []
          : [];
      }
    } catch {
      // ignore cache error
    }
    return [];
  });

  const [_sourceInfo, _setSourceInfo] = useState<string>(() => {
    try {
      const cached = localStorage.getItem("pivot_master_processed_data");
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.cacheVersion === PIVOT_CACHE_VERSION
          ? parsed.sourceInfo || ""
          : "";
      }
    } catch {
      // ignore cache error
    }
    return "";
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [rowsPerPage, setRowsPerPage] = useState<number>(() => {
    try {
      const savedValue = localStorage.getItem("pivot_master_rows_per_page");
      if (savedValue === "all") return Infinity;
      const parsedValue = Number(savedValue);
      return Number.isFinite(parsedValue) && parsedValue > 0
        ? parsedValue
        : 50;
    } catch {
      return 50;
    }
  });
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [hiddenColumns, setHiddenColumns] = useState<Record<string, boolean>>({});
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const safeTypeColumns = useMemo(() => (Array.isArray(typeColumns) ? typeColumns : []), [typeColumns]);
  const safeGroupedData = useMemo(() => (groupedData && typeof groupedData === "object" ? groupedData : {}), [groupedData]);

  const uniqueMonths = useMemo(() => {
    const set = new Set<string>();

    const normalizeStr = (m: any) => {
      if (!m) return null;
      const str = String(m).trim();
      if (!str) return null;
      const match = str.match(/(?:THÁNG|THANG|T)?\s*(\d{1,2})[./\- ]\s*(\d{4})/i);
      if (match) {
        const mm = match[1].padStart(2, "0");
        const yyyy = match[2];
        return `${mm}.${yyyy}`;
      }
      const mOnly = str.match(/(?:THÁNG|THANG|T)?\s*(\d{1,2})\b/i);
      if (mOnly) {
        const mm = mOnly[1].padStart(2, "0");
        return `${mm}.2026`;
      }
      return str;
    };

    (appData.Ae_Global_Inputs || []).forEach((row) => {
      const m = row.month || parseMonthFromFileName(row.name || row.fileName || "", appData.globalMonth);
      const norm = normalizeStr(m);
      if (norm) set.add(norm);
    });

    (appData.Sheet1_AE?.data || []).forEach((r: any) => {
      const m = r["Tháng báo cáo"] || r["_fileMonth"] || r["Tháng"];
      const norm = normalizeStr(m);
      if (norm) set.add(norm);
    });

    (appData.Hold_AE?.data || []).forEach((r: any) => {
      const m = r["Tháng báo cáo"] || r["_fileMonth"] || r["Tháng phát sinh"];
      const norm = normalizeStr(m);
      if (norm) set.add(norm);
    });

    for (const bu in safeGroupedData) {
      for (const l07 in safeGroupedData[bu]) {
        for (const month in safeGroupedData[bu][l07]) {
          const norm = normalizeStr(month);
          if (norm) set.add(norm);
        }
      }
    }

    if (set.size === 0 && appData.globalMonth) {
      const norm = normalizeStr(appData.globalMonth);
      if (norm) set.add(norm);
    }

    return Array.from(set).sort((a, b) => {
      const [ma, ya] = a.split(".").map(Number);
      const [mb, yb] = b.split(".").map(Number);
      if ((ya || 0) !== (yb || 0)) return (ya || 0) - (yb || 0);
      return (ma || 0) - (mb || 0);
    });
  }, [appData.Ae_Global_Inputs, appData.Sheet1_AE?.data, appData.Hold_AE?.data, appData.globalMonth, safeGroupedData]);

  useEffect(() => {
    if (uniqueMonths.length > 0) {
      if (!selectedMonthFilter || (selectedMonthFilter !== "ALL" && !uniqueMonths.includes(selectedMonthFilter))) {
        const defaultMonth = uniqueMonths[0];
        setSelectedMonthFilter(defaultMonth);
        try {
          localStorage.setItem("pivot_master_selected_month_filter", defaultMonth);
        } catch {
          // ignore
        }
      }
    }
  }, [uniqueMonths, selectedMonthFilter]);

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const cached = localStorage.getItem("pivot_master_column_widths");
      if (cached) return JSON.parse(cached);
    } catch {
      // ignore
    }
    return {
      no: 50,
      month: 90,
      business: 90,
      charge: 220,
      grandTotal: 140,
    };
  });

  const resizingColRef = useRef<{ colKey: string; startX: number; startWidth: number } | null>(null);

  const handleResizeStart = (e: React.MouseEvent, colKey: string, defaultW = 120) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = columnWidths[colKey] || defaultW;
    resizingColRef.current = { colKey, startX, startWidth };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingColRef.current) return;
      const deltaX = moveEvent.clientX - resizingColRef.current.startX;
      const newWidth = Math.max(45, resizingColRef.current.startWidth + deltaX);
      setColumnWidths(prev => {
        const next = { ...prev, [resizingColRef.current!.colKey]: newWidth };
        try {
          localStorage.setItem("pivot_master_column_widths", JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    };

    const handleMouseUp = () => {
      resizingColRef.current = null;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const [editingCell, setEditingCell] = useState<{
    bu: string;
    l07: string;
    month: string;
    field: string;
  } | null>(null);

  const [editValue, setEditValue] = useState<string>("");

  const handleStartEdit = (bu: string, l07: string, month: string, field: string, currentValue: any) => {
    setEditingCell({ bu, l07, month, field });
    setEditValue(currentValue === undefined || currentValue === null ? "" : String(currentValue));
  };

  const saveToCache = (newGroupedData: any, newTypeColumns = safeTypeColumns) => {
    try {
      localStorage.setItem("pivot_master_processed_data", JSON.stringify({
        cacheVersion: PIVOT_CACHE_VERSION,
        groupedData: newGroupedData,
        typeColumns: newTypeColumns,
        diagnosticLogs,
        sourceInfo: _sourceInfo,
        filter: selectedMonthFilter,
        updatedAt: Date.now()
      }));
    } catch (e) {
      console.warn("Failed saving pivot data to cache", e);
    }
  };

  const handleSaveEdit = () => {
    if (!editingCell) return;
    const { bu, l07, month, field } = editingCell;

    setGroupedData(prev => {
      const nextData = JSON.parse(JSON.stringify(prev));
      if (!nextData[bu] || !nextData[bu][l07] || !nextData[bu][l07][month]) return prev;

      if (field === "bu") {
        const newBu = editValue.trim().toUpperCase() || "UNKNOWN";
        if (newBu !== bu) {
          if (!nextData[newBu]) nextData[newBu] = {};
          if (!nextData[newBu][l07]) nextData[newBu][l07] = {};
          nextData[newBu][l07][month] = nextData[bu][l07][month];
          delete nextData[bu][l07][month];
          if (Object.keys(nextData[bu][l07]).length === 0) delete nextData[bu][l07];
          if (Object.keys(nextData[bu]).length === 0) delete nextData[bu];
        }
      } else if (field === "l07") {
        const newL07 = editValue.trim() || "UNKNOWN";
        if (newL07 !== l07) {
          if (!nextData[bu][newL07]) nextData[bu][newL07] = {};
          nextData[bu][newL07][month] = nextData[bu][l07][month];
          delete nextData[bu][l07][month];
          if (Object.keys(nextData[bu][l07]).length === 0) delete nextData[bu][l07];
        }
      } else if (field === "month") {
        const newMonth = editValue.trim() || "UNKNOWN";
        if (newMonth !== month) {
          nextData[bu][l07][newMonth] = nextData[bu][l07][month];
          delete nextData[bu][l07][month];
        }
      } else {
        const rawNum = editValue.replace(/,/g, "").trim();
        const numVal = parseFloat(rawNum);
        const finalVal = isNaN(numVal) ? 0 : numVal;
        nextData[bu][l07][month][field] = finalVal;
      }

      saveToCache(nextData);
      return nextData;
    });

    setEditingCell(null);
    setEditValue("");
    toast.success("Đã cập nhật dữ liệu ô Pivot Master");
  };

  const handleCancelEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const handleAddRow = () => {
    const defaultBU = "AHN";
    const defaultL07 = `CENTER_${Date.now().toString().slice(-4)}`;
    const defaultMonth = selectedMonthFilter !== 'ALL' ? selectedMonthFilter : (appData.globalMonth || '03.2026');
    setGroupedData(prev => {
      const nextData = JSON.parse(JSON.stringify(prev));
      if (!nextData[defaultBU]) nextData[defaultBU] = {};
      if (!nextData[defaultBU][defaultL07]) nextData[defaultBU][defaultL07] = {};
      nextData[defaultBU][defaultL07][defaultMonth] = {};
      safeTypeColumns.forEach(t => {
        nextData[defaultBU][defaultL07][defaultMonth][t] = 0;
      });
      saveToCache(nextData);
      return nextData;
    });
    toast.success(`Đã thêm dòng mới với Center/L07: ${defaultL07}`);
  };

  const handleAddColumn = () => {
    const colName = window.prompt("Nhập tên cột mới:");
    if (!colName) return;
    const trimmed = colName.trim();
    if (!trimmed) return;
    
    if (safeTypeColumns.includes(trimmed)) {
      toast.error(`Cột "${trimmed}" đã tồn tại!`);
      return;
    }
    
    setTypeColumns(prev => {
      const next = [...prev, trimmed];
      try {
        const cached = localStorage.getItem("pivot_master_processed_data");
        if (cached) {
          const parsed = JSON.parse(cached);
          parsed.cacheVersion = PIVOT_CACHE_VERSION;
          parsed.typeColumns = next;
          localStorage.setItem("pivot_master_processed_data", JSON.stringify(parsed));
        }
      } catch {
        // ignore
      }
      return next;
    });
    
    toast.success(`Đã thêm cột mới: ${trimmed}`);
  };

  const handleDeleteRow = (bu: string, l07: string, month: string) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa dòng ${bu} - ${l07} (Tháng ${month})?`)) {
      setGroupedData(prev => {
        const nextData = JSON.parse(JSON.stringify(prev));
        if (nextData[bu] && nextData[bu][l07] && nextData[bu][l07][month]) {
          delete nextData[bu][l07][month];
          if (Object.keys(nextData[bu][l07]).length === 0) delete nextData[bu][l07];
          if (Object.keys(nextData[bu]).length === 0) delete nextData[bu];
        }
        saveToCache(nextData);
        return nextData;
      });
      toast.success(`Đã xóa dòng ${bu} - ${l07}`);
    }
  };
  
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [rowsPerPage, groupedData, typeColumns]);

  useEffect(() => {
    try {
      localStorage.setItem(
        "pivot_master_rows_per_page",
        rowsPerPage === Infinity ? "all" : String(rowsPerPage),
      );
    } catch {
      // ignore pagination preference write error
    }
  }, [rowsPerPage]);

  useEffect(() => {
    const handlePivotDataUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (!detail.groupedData || typeof detail.groupedData !== "object") return;

      const incomingTypeColumns = Array.isArray(detail.typeColumns)
        ? detail.typeColumns
        : [];
      const mktTypeCache = readPivotMktTypeCache(
        detail.groupedData,
        incomingTypeColumns,
      );
      const restoredGroupedData = applyPivotMktTypeCache(
        detail.groupedData,
        mktTypeCache,
      );
      const restoredTypeColumns = mergePivotTypeColumns(
        incomingTypeColumns,
        mktTypeCache.typeColumns,
      );

      setGroupedData(restoredGroupedData);
      setTypeColumns(restoredTypeColumns);
      setDiagnosticLogs(
        Array.isArray(detail.diagnosticLogs) ? detail.diagnosticLogs : [],
      );
      _setSourceInfo(String(detail.sourceInfo || ""));
    };

    window.addEventListener("pivot-data-updated", handlePivotDataUpdated);
    return () =>
      window.removeEventListener("pivot-data-updated", handlePivotDataUpdated);
  }, []);

  const processFileBuffers = useCallback(async (fileList: { name: string; bank?: string; buffer: ArrayBuffer; month: string }[]) => {
    const newGroupedData: Record<string, Record<string, Record<string, Record<string, number>>>> = {};
    const mktGroupedData: PivotGroupedData = {};
    const uniqueTypes = new Set<string>();
    const mktTypeColumns = new Set<string>();
    const mktMonths = new Set<string>();
    let processedMktFiles = 0;
    const newLogs: any[] = [];

    for (const item of fileList) {
      try {
        const displayBankName = extractBankName(item.name, item.bank);
        let processType = (displayBankName === 'MKT LOCAL') ? "MKT LOCAL NORTH" : "NORTH";
        
        const workbook = XLSX.read(item.buffer, { type: "array" });
        let targetSheetName = "";

        const rosterSheet = workbook.SheetNames.find(n => 
          n.toUpperCase().includes('ROSTER') || n.toUpperCase().includes('Q_ROSTER')
        );

        if (processType === "MKT LOCAL NORTH" || rosterSheet) {
          processType = "MKT LOCAL NORTH";
          if (rosterSheet) {
            targetSheetName = rosterSheet;
          } else {
            continue;
          }
        } else {
          targetSheetName = workbook.SheetNames.find(n => {
            const normName = (n || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toUpperCase().trim().replace(/\s+/g, " ");
            return normName === 'SHEET 1' || normName.includes('SHEET 1') || normName.includes('INTERN') || normName.includes('REPORT');
          }) || workbook.SheetNames.find(n => {
            const normName = (n || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toUpperCase().trim().replace(/\s+/g, " ");
            return normName.includes('DATA') || normName.includes('DU LIEU') || n.toUpperCase().includes('DỮ LIỆU');
          }) || workbook.SheetNames[0];
        }

        const worksheet = workbook.Sheets[targetSheetName];
        if (!worksheet) continue;

        const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
        if (jsonData.length <= 1) continue;

        let headerRowIdx = 0;
        for (let r = 0; r < Math.min(15, jsonData.length); r++) {
          const row = jsonData[r];
          if (!row || row.length === 0) continue;
          const rowStr = row.join(' ').toUpperCase();
          if (rowStr.includes('CENTER') || rowStr.includes('CHARGE') || rowStr.includes('TYPE') || rowStr.includes('MÃ TT')) {
            headerRowIdx = r;
            break;
          }
        }

        const headers = jsonData[headerRowIdx];
        if (!headers) continue;

        if (processType === "NORTH") {
          const centerColIdx = headers.findIndex((h: any) => {
            if (!h) return false;
            const val = String(h).trim().toUpperCase();
            return val === 'CENTER' || val === 'CENTERS' || val === 'CENTER CODE' || val === 'MÃ TT' || val.includes('TRUNG TÂM');
          });

          const bankAccColIdx = headers.findIndex((h: any) => {
            if (!h) return false;
            const val = String(h).trim().toUpperCase();
            return val === 'BANK ACCOUNT NUMBER' || val.includes('BANK ACCOUNT');
          });

          if (centerColIdx === -1 || bankAccColIdx === -1) continue;

          const chargeCols: { index: number; label: string }[] = [];
          headers.forEach((h: any, idx: number) => {
            if (h && String(h).toUpperCase().includes('CHARGE')) {
              let label = String(h).toUpperCase().replace('CHARGE TO ', '').replace('CHARGE ', '').trim();
              if (label === '') label = 'OTHER';
              chargeCols.push({ index: idx, label });
              uniqueTypes.add(label);
            }
          });

          for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || row.length === 0) continue;

            const bankAccVal = row[bankAccColIdx];
            if (bankAccVal === undefined || bankAccVal === null || String(bankAccVal).trim() === "") {
              continue;
            }

            const rawCenter = row[centerColIdx];
            if (!rawCenter) continue;

            if (String(rawCenter).toUpperCase().includes("MKT")) {
              continue;
            }

            const mapped = processNorthLogic(String(rawCenter));
            const { bu, l07 } = mapped;

            if (!newGroupedData[bu]) newGroupedData[bu] = {};
            if (!newGroupedData[bu][l07]) newGroupedData[bu][l07] = {};
            if (!newGroupedData[bu][l07][item.month]) newGroupedData[bu][l07][item.month] = {};

            chargeCols.forEach(col => {
              const rawVal = row[col.index];
              const val = parseExcelMoney(rawVal);

              if (val === 0 && rawVal) {
                newLogs.push({ Source: "NORTH", File: item.name, RawCenter: rawCenter, Column: col.label, RawValue: rawVal });
              }

              if (!newGroupedData[bu][l07][item.month][col.label]) {
                newGroupedData[bu][l07][item.month][col.label] = 0;
              }
              newGroupedData[bu][l07][item.month][col.label] += val;
            });
          }
        } else if (processType === "MKT LOCAL NORTH") {
          const centerColIdx = headers.findIndex((h: any) => {
            if (!h) return false;
            const val = String(h).trim().toUpperCase();
            return val === 'CHARGE TO CENTER' || val === 'CHARGETOCENTERCODE' || val.includes('CHARGE TO CENTER') || val === 'CENTER' || val === 'CENTERS' || val === 'MÃ TT';
          });
          const typeColIdx = headers.findIndex((h: any) => {
            if (!h) return false;
            const val = String(h).trim().toUpperCase();
            return val === 'TYPE';
          });
          const durationColIdx = headers.findIndex((h: any) => {
            if (!h) return false;
            const val = String(h).trim().toUpperCase();
            return val === 'DURATION';
          });

          if (centerColIdx === -1 || typeColIdx === -1 || durationColIdx === -1) continue;
          processedMktFiles += 1;
          mktMonths.add(item.month);

          for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || row.length === 0) continue;

            const rawCenter = row[centerColIdx];
            if (!rawCenter) continue;

            const mapped = processTimesheetMktLogic({ chargetocenterCode: String(rawCenter) });
            const { bu, l07 } = mapped;

            if (!l07 || l07.toUpperCase() === "MKT LOCAL NORTH") continue;

            if (!newGroupedData[bu]) newGroupedData[bu] = {};
            if (!newGroupedData[bu][l07]) newGroupedData[bu][l07] = {};
            if (!newGroupedData[bu][l07][item.month]) newGroupedData[bu][l07][item.month] = {};

            const durationHours = parseDurationToHours(row[durationColIdx]);
            const calculatedSalary = durationHours * 20000;
            if (calculatedSalary === 0) continue;

            const typeVal = formatPivotTypeHeader(
              String(row[typeColIdx] ?? "").trim() || "UNSPECIFIED",
            );
            if (typeVal === "EXCLUDE") continue;
            uniqueTypes.add(typeVal);
            mktTypeColumns.add(typeVal);

            if (!newGroupedData[bu][l07][item.month][typeVal]) {
              newGroupedData[bu][l07][item.month][typeVal] = 0;
            }
            newGroupedData[bu][l07][item.month][typeVal] += calculatedSalary;

            if (!mktGroupedData[bu]) mktGroupedData[bu] = {};
            if (!mktGroupedData[bu][l07]) mktGroupedData[bu][l07] = {};
            if (!mktGroupedData[bu][l07][item.month]) {
              mktGroupedData[bu][l07][item.month] = {};
            }
            if (!mktGroupedData[bu][l07][item.month][typeVal]) {
              mktGroupedData[bu][l07][item.month][typeVal] = 0;
            }
            mktGroupedData[bu][l07][item.month][typeVal] += calculatedSalary;
          }
        }
      } catch (err) {
        console.error("Error processing file buffer:", item.name, err);
      }
    }

    let unspecifiedTotal = 0;
    for (const bu in newGroupedData) {
      for (const l07 in newGroupedData[bu]) {
        for (const month in newGroupedData[bu][l07]) {
          unspecifiedTotal += newGroupedData[bu][l07][month]["UNSPECIFIED"] || 0;
        }
      }
    }
    if (unspecifiedTotal === 0) {
      uniqueTypes.delete("UNSPECIFIED");
    }

    return {
      groupedData: newGroupedData,
      typeColumns: Array.from(uniqueTypes).sort(),
      mktGroupedData,
      mktTypeColumns: Array.from(mktTypeColumns).sort(),
      mktMonths: Array.from(mktMonths).sort(),
      processedMktFiles,
      logs: newLogs,
    };
  }, []);

  useEffect(() => {
    if (appData.globalMonth) {
      setSelectedMonthFilter(appData.globalMonth);
    }
  }, [appData.globalMonth]);

  const loadMasterData = useCallback(async (showToastMsg = false) => {
    const cachedStr = localStorage.getItem("pivot_master_processed_data");
    let cachedGroupedData: PivotGroupedData = {};
    let cachedTypeColumns: string[] = [];
    if (cachedStr) {
      try {
        const parsed = JSON.parse(cachedStr);
        if (parsed.cacheVersion === PIVOT_CACHE_VERSION) {
          cachedGroupedData = parsed.groupedData || {};
          cachedTypeColumns = Array.isArray(parsed.typeColumns)
            ? parsed.typeColumns
            : [];
        }
        if (
          !showToastMsg &&
          parsed.cacheVersion === PIVOT_CACHE_VERSION &&
          parsed.groupedData &&
          Object.keys(parsed.groupedData).length > 0
        ) {
          setGroupedData(parsed.groupedData);
          setTypeColumns(parsed.typeColumns || []);
          setDiagnosticLogs(parsed.diagnosticLogs || []);
          _setSourceInfo(parsed.sourceInfo || "Đã tải từ cache");
          return;
        }
      } catch {
        // ignore cache parse error
      }
    }

    setIsProcessing(true);

    try {
      const processedSheet1 = appData.Sheet1_AE?.data || [];
      const processedRoster = (appData.Master_Roster || []).filter((row: any) => {
        const sourceFile = String(row?._sourceFile || "").trim().toUpperCase();
        const rowId = String(row?._rowId || "").trim().toLowerCase();
        return sourceFile !== "MOCK_ROSTER.XLSX" && !rowId.startsWith("mock-row-");
      });

      // Ưu tiên dữ liệu đã được bảng Master xử lý để đồng bộ nhanh và không
      // parse lại hàng loạt file Excel trên main thread.
      if (processedSheet1.length > 0 || processedRoster.length > 0) {
        const baseResult = buildPivotFromAppData(
          processedSheet1,
          [],
          [],
        );
        const rosterResult = buildPivotFromAppData([], [], processedRoster);
        let mktTypeCache = readPivotMktTypeCache(
          cachedGroupedData,
          cachedTypeColumns,
        );

        // Chỉ thay snapshot TYPE khi Master thực sự có dữ liệu MKT Local.
        // Nếu đợt tải Master thiếu file MKT, cache cũ được giữ nguyên.
        if (processedRoster.length > 0) {
          mktTypeCache = updatePivotMktTypeCache(
            mktTypeCache,
            rosterResult.groupedData || {},
            rosterResult.typeColumns || [],
            getPivotDataMonths(rosterResult.groupedData || {}),
          );
          writePivotMktTypeCache(mktTypeCache);
        }

        const restoredGroupedData = applyPivotMktTypeCache(
          baseResult.groupedData || {},
          mktTypeCache,
        );
        const restoredTypeColumns = mergePivotTypeColumns(
          baseResult.typeColumns || [],
          mktTypeCache.typeColumns,
        );

        setGroupedData(restoredGroupedData);
        setTypeColumns(restoredTypeColumns);
        setDiagnosticLogs([]);
        const infoStr = `Đồng bộ từ Master (${processedSheet1.length} dòng Gross Pay, ${processedRoster.length} dòng MKT Local; đã giữ TYPE MKT đã lưu)`;
        _setSourceInfo(infoStr);

        try {
          localStorage.setItem("pivot_master_processed_data", JSON.stringify({
            cacheVersion: PIVOT_CACHE_VERSION,
            groupedData: restoredGroupedData,
            typeColumns: restoredTypeColumns,
            diagnosticLogs: [],
            sourceInfo: infoStr,
            filter: selectedMonthFilter,
            updatedAt: Date.now(),
          }));
        } catch {
          // ignore cache write error
        }

        if (showToastMsg) {
          toast.success(
            `Đã đồng bộ Pivot Master từ dữ liệu đã xử lý trong bảng Master`,
          );
        }
        return;
      }

      const masterRows = appData.Ae_Global_Inputs || [];
      const fileBuffers: { name: string; bank?: string; buffer: ArrayBuffer; month: string }[] = [];

      for (const row of masterRows) {
        const rowMonth = row.month || parseMonthFromFileName(row.name || "", appData.globalMonth) || appData.globalMonth || "03.2026";

        if (row.fileObj && row.fileObj instanceof File) {
          try {
            const buffer = await row.fileObj.arrayBuffer();
            fileBuffers.push({ name: row.fileName || row.fileObj.name, bank: row.bank, buffer, month: rowMonth });
          } catch (fileErr) {
            console.warn(`Không thể đọc file buffer cho file ${row.fileName || row.name}:`, fileErr);
          }
        } else if (row.buffer && row.buffer instanceof ArrayBuffer) {
          fileBuffers.push({ name: row.fileName || row.name, bank: row.bank, buffer: row.buffer, month: rowMonth });
        }
      }

      let resGrouped: Record<string, Record<string, Record<string, Record<string, number>>>> = {};
      let resTypes: string[] = [];
      let infoStr = "";

      if (fileBuffers.length > 0) {
        const res = await processFileBuffers(fileBuffers);
        resGrouped = res?.groupedData || {};
        resTypes = res?.typeColumns || [];
        setDiagnosticLogs(res?.logs || []);
        infoStr = `Đồng bộ từ ${fileBuffers.length} file Master`;

        if ((res?.processedMktFiles || 0) > 0) {
          const currentMktTypeCache = readPivotMktTypeCache(
            cachedGroupedData,
            cachedTypeColumns,
          );
          const nextMktTypeCache = updatePivotMktTypeCache(
            currentMktTypeCache,
            res?.mktGroupedData || {},
            res?.mktTypeColumns || [],
            res?.mktMonths || [],
          );
          writePivotMktTypeCache(nextMktTypeCache);
        }
      }

      if (appData.Sheet1_AE?.data && appData.Sheet1_AE.data.length > 0) {
        const filteredSheet1 = appData.Sheet1_AE.data || [];
        const filteredRoster = appData.Master_Roster || [];

        const sheet1Res = buildPivotFromAppData(
          filteredSheet1,
          [],
          filteredRoster
        );
        const sheet1Grouped = sheet1Res?.groupedData || {};
        const sheet1Types = sheet1Res?.typeColumns || [];

        // Merge Sheet1_AE pivot data with fileBuffers pivot data if both present
        for (const bu in sheet1Grouped) {
          if (!resGrouped[bu]) resGrouped[bu] = {};
          for (const l07 in sheet1Grouped[bu]) {
            if (!resGrouped[bu][l07]) resGrouped[bu][l07] = {};
            for (const month in sheet1Grouped[bu][l07]) {
              if (!resGrouped[bu][l07][month]) resGrouped[bu][l07][month] = {};
              for (const col in sheet1Grouped[bu][l07][month]) {
                const val = sheet1Grouped[bu][l07][month][col] || 0;
                resGrouped[bu][l07][month][col] = (resGrouped[bu][l07][month][col] || 0) + val;
              }
            }
          }
        }

        const typeSet = new Set([...resTypes, ...sheet1Types]);
        resTypes = Array.from(typeSet);
        infoStr = infoStr ? `${infoStr} & Sheet1 AE` : `Đồng bộ từ dữ liệu Sheet1 AE (${filteredSheet1.length} dòng)`;
      }

      if (Object.keys(resGrouped).length > 0) {
        const mktTypeCache = readPivotMktTypeCache(
          cachedGroupedData,
          cachedTypeColumns,
        );
        const restoredGroupedData = applyPivotMktTypeCache(
          resGrouped,
          mktTypeCache,
        );
        const restoredTypeColumns = mergePivotTypeColumns(
          resTypes,
          mktTypeCache.typeColumns,
        );

        setGroupedData(restoredGroupedData);
        setTypeColumns(restoredTypeColumns);
        _setSourceInfo(infoStr);

        try {
          localStorage.setItem("pivot_master_processed_data", JSON.stringify({
            cacheVersion: PIVOT_CACHE_VERSION,
            groupedData: restoredGroupedData,
            typeColumns: restoredTypeColumns,
            diagnosticLogs,
            sourceInfo: infoStr,
            filter: selectedMonthFilter,
            updatedAt: Date.now()
          }));
        } catch {
          // ignore
        }

        if (showToastMsg) {
          toast.success("Đã đồng bộ lại dữ liệu Pivot Master từ bảng Cài đặt & Tải file (Master)");
        }
      } else {
        if (showToastMsg) {
          toast.info(
            "Chưa có dữ liệu Master đã xử lý. Đang mở bảng Cài đặt & tải file (Master).",
          );
          window.dispatchEvent(new Event("master-ae-request-upload"));
        }
      }
    } catch (err) {
      console.error("Error loading master data:", err);
      if (showToastMsg) {
        toast.error("Lỗi khi xử lý dữ liệu từ bảng Master");
      }
    } finally {
      setIsProcessing(false);
    }
  }, [
    appData.Ae_Global_Inputs,
    appData.globalMonth,
    appData.Sheet1_AE?.data,
    appData.Master_Roster,
    selectedMonthFilter,
    processFileBuffers,
    diagnosticLogs
  ]);

  useEffect(() => {
    loadMasterData(false);
  }, [loadMasterData]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    try {
      const fileBuffers: { name: string; buffer: ArrayBuffer; month: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const buffer = await file.arrayBuffer();
          const fileMonth = parseMonthFromFileName(file.name, appData.globalMonth) || appData.globalMonth || "06.2026";
          fileBuffers.push({ name: file.name, buffer, month: fileMonth });
        } catch (fErr) {
          console.warn(`Lỗi khi đọc file ${file.name}:`, fErr);
        }
      }

      const res = await processFileBuffers(fileBuffers);
      if ((res?.processedMktFiles || 0) === 0) {
        toast.error(
          "Không tìm thấy sheet Roster hoặc Q_Roster hợp lệ trong file MKT Local North.",
        );
        return;
      }

      const currentMktTypeCache = readPivotMktTypeCache(
        safeGroupedData,
        safeTypeColumns,
      );
      const nextMktTypeCache = updatePivotMktTypeCache(
        currentMktTypeCache,
        res?.mktGroupedData || {},
        res?.mktTypeColumns || [],
        res?.mktMonths || [],
      );
      writePivotMktTypeCache(nextMktTypeCache);

      // Áp dụng snapshot TYPE bằng phép thay thế có chọn lọc. Các cột không
      // thuộc MKT Local North không bị xóa, cộng thêm hay thay đổi giá trị.
      const mergedGroupedData = applyPivotMktTypeCache(
        safeGroupedData,
        nextMktTypeCache,
      );
      const mergedTypeColumns = mergePivotTypeColumns(
        safeTypeColumns,
        nextMktTypeCache.typeColumns,
      );
      const mergedLogs = [...diagnosticLogs, ...(res?.logs || [])];

      setGroupedData(mergedGroupedData);
      setTypeColumns(mergedTypeColumns);
      setDiagnosticLogs(mergedLogs);
      const infoStr = `Đã cập nhật ${res.processedMktFiles} file MKT Local (${nextMktTypeCache.typeColumns.length} cột TYPE); giữ nguyên các cột khác`;
      _setSourceInfo(infoStr);

      try {
        localStorage.setItem("pivot_master_processed_data", JSON.stringify({
          cacheVersion: PIVOT_CACHE_VERSION,
          groupedData: mergedGroupedData,
          typeColumns: mergedTypeColumns,
          diagnosticLogs: mergedLogs,
          sourceInfo: infoStr,
          filter: selectedMonthFilter,
          updatedAt: Date.now()
        }));
      } catch {
        // ignore cache write error
      }
      toast.success(
        `Đã cập nhật ${res.processedMktFiles} file MKT Local; ${nextMktTypeCache.typeColumns.length} cột TYPE đã được ghi nhớ, các cột khác giữ nguyên`,
      );
    } catch (err) {
      console.error("Error processing manual upload:", err);
      toast.error("Lỗi khi xử lý các file vừa chọn");
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDownloadDiagnosticCSV = () => {
    setIsSettingsOpen(false);
    if (diagnosticLogs.length === 0) {
      toast.info("Không có dòng log lỗi nào cần kiểm tra.");
      return;
    }

    const headers = ["Source", "File", "RawCenter", "Column", "RawValue"];
    const csvRows = [headers.join(",")];

    diagnosticLogs.forEach(log => {
      const row = [
        `"${log.Source || ""}"`,
        `"${log.File || ""}"`,
        `"${String(log.RawCenter || "").replace(/"/g, '""')}"`,
        `"${log.Column || ""}"`,
        `"${String(log.RawValue || "").replace(/"/g, '""')}"`
      ];
      csvRows.push(row.join(","));
    });

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `pivot-diagnostic-logs-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    setIsSettingsOpen(false);
    if (Object.keys(safeGroupedData).length === 0) {
      toast.error("Không có dữ liệu để xuất Excel!");
      return;
    }

    const wsData: any[][] = [];
    const headers = ["No.", "Business", "L07", "Tháng", ...safeTypeColumns, "TỔNG CỘNG"];
    wsData.push(headers);

    let rowId = 1;
    const grandTotals = new Array(safeTypeColumns.length).fill(0);
    let superGrandTotal = 0;
    const sortedBUs = Object.keys(safeGroupedData).sort();

    sortedBUs.forEach(bu => {
      const buTotals = new Array(safeTypeColumns.length).fill(0);
      let buGrandTotal = 0;
      const l07s = Object.keys(safeGroupedData[bu] || {}).sort();

      l07s.forEach(l07 => {
        const months = Object.keys(safeGroupedData[bu][l07] || {}).sort();
        months.forEach(month => {
          if (selectedMonthFilter !== "ALL") {
            const normM = month.match(/(?:THÁNG|THANG|T)?\s*(\d{1,2})[./\- ]\s*(\d{4})/i);
            const mNorm = normM ? `${normM[1].padStart(2, "0")}.${normM[2]}` : month;
            if (mNorm !== selectedMonthFilter && month !== selectedMonthFilter) return;
          }
          
          let rowTotal = 0;
          const rowVals = safeTypeColumns.map((type, idx) => {
            const val = safeGroupedData[bu][l07][month][type] || 0;
            buTotals[idx] += val;
            grandTotals[idx] += val;
            rowTotal += val;
            return val;
          });
          buGrandTotal += rowTotal;
          superGrandTotal += rowTotal;

          wsData.push([rowId++, bu, l07, month, ...rowVals, rowTotal]);
        });
      });

      wsData.push(["", bu, `${bu} Total`, "", ...buTotals, buGrandTotal]);
    });

    wsData.push(["", "", "", "TỔNG CỘNG", ...grandTotals, superGrandTotal]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pivot_Data");
    XLSX.writeFile(wb, "Pivot_Salary_Report.xlsx");
    toast.success("Đã xuất báo cáo Excel thành công!");
  };

  let totalCenters = 0;
  let totalSalarySum = 0;
  const grandTotals = new Array(safeTypeColumns.length).fill(0);
  let superGrandTotal = 0;

  const allFlatRows: Array<{
    globalRowId: number;
    month: string;
    bu: string;
    l07: string;
    values: number[];
    rowTotal: number;
  }> = [];

  let rIdx = 1;
  const currentSortedBUs = Object.keys(safeGroupedData).sort();
  currentSortedBUs.forEach(bu => {
    const l07s = Object.keys(safeGroupedData[bu] || {}).sort();
    l07s.forEach(l07 => {
      const months = Object.keys(safeGroupedData[bu][l07] || {}).sort();
      months.forEach(month => {
        if (selectedMonthFilter !== "ALL") {
          const normM = month.match(/(?:THÁNG|THANG|T)?\s*(\d{1,2})[./\- ]\s*(\d{4})/i);
          const mNorm = normM ? `${normM[1].padStart(2, "0")}.${normM[2]}` : month;
          if (mNorm !== selectedMonthFilter && month !== selectedMonthFilter) return;
        }
        
        let rowTotal = 0;
        const values = safeTypeColumns.map((type, idx) => {
          const val = safeGroupedData[bu][l07][month][type] || 0;
          grandTotals[idx] += val;
          rowTotal += val;
          return val;
        });

        if (rowTotal === 0 && bu === "OTHER" && (l07 === "UNKNOWN" || !l07)) {
          return;
        }

        totalCenters++;
        superGrandTotal += rowTotal;
        totalSalarySum += rowTotal;

        allFlatRows.push({
          globalRowId: rIdx++,
          month,
          bu,
          l07,
          values,
          rowTotal
        });
      });
    });
  });

  const sortedFlatRows = useMemo(() => {
    if (!sortField) return allFlatRows;
    return [...allFlatRows].sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;
      if (sortField === "no") {
        valA = a.globalRowId;
        valB = b.globalRowId;
      } else if (sortField === "month") {
        valA = a.month;
        valB = b.month;
      } else if (sortField === "bu") {
        valA = a.bu;
        valB = b.bu;
      } else if (sortField === "l07") {
        valA = a.l07;
        valB = b.l07;
      } else if (sortField === "rowTotal") {
        valA = a.rowTotal;
        valB = b.rowTotal;
      } else if (sortField.startsWith("type_")) {
        const typeName = sortField.replace("type_", "");
        const typeIdx = safeTypeColumns.indexOf(typeName);
        if (typeIdx !== -1) {
          valA = a.values[typeIdx] || 0;
          valB = b.values[typeIdx] || 0;
        }
      }
      if (typeof valA === "string") {
        const cmp = valA.localeCompare(valB, 'vi');
        return sortDirection === "asc" ? cmp : -cmp;
      }
      return sortDirection === "asc" ? valA - valB : valB - valA;
    });
  }, [allFlatRows, safeTypeColumns, sortField, sortDirection]);

  const autoFitAllColumns = useCallback(() => {
    const rowsToMeasure = sortedFlatRows.slice(0, 1000);
    const widthFor = (values: unknown[], header: string, min: number, max: number) => {
      const longest = values.reduce<number>(
        (length, value) => Math.max(length, String(value ?? "").length),
        header.length,
      );
      return Math.min(max, Math.max(min, longest * 7.5 + 28));
    };

    const nextWidths: Record<string, number> = {
      no: 62,
      business: widthFor(rowsToMeasure.map((row) => row.bu), "Business", 82, 150),
      charge: widthFor(rowsToMeasure.map((row) => row.l07), "L07", 120, 300),
      month: widthFor(rowsToMeasure.map((row) => row.month), "Tháng", 78, 120),
      grandTotal: widthFor(
        rowsToMeasure.map((row) => row.rowTotal?.toLocaleString("vi-VN")),
        "TỔNG CỘNG",
        110,
        190,
      ),
    };

    safeTypeColumns.forEach((type, typeIndex) => {
      nextWidths[`type_${type}`] = widthFor(
        rowsToMeasure.map((row) => (row.values[typeIndex] || 0).toLocaleString("vi-VN")),
        type,
        88,
        190,
      );
    });

    setColumnWidths(nextWidths);
    try {
      localStorage.setItem("pivot_master_column_widths", JSON.stringify(nextWidths));
    } catch {
      // Ignore local storage quota/privacy errors.
    }
  }, [safeTypeColumns, sortedFlatRows]);

  const totalRowsCount = sortedFlatRows.length;
  const totalPages =
    rowsPerPage === Infinity
      ? 1
      : Math.max(1, Math.ceil(totalRowsCount / rowsPerPage));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const startIndex =
    totalRowsCount === 0 || rowsPerPage === Infinity
      ? 0
      : (validCurrentPage - 1) * rowsPerPage;
  const endIndex =
    rowsPerPage === Infinity
      ? totalRowsCount
      : Math.min(startIndex + rowsPerPage, totalRowsCount);
  const paginatedRows =
    rowsPerPage === Infinity
      ? sortedFlatRows
      : sortedFlatRows.slice(startIndex, endIndex);
  const buSubtotals = new Map<
    string,
    { values: number[]; rowTotal: number }
  >();
  allFlatRows.forEach((row) => {
    const subtotal = buSubtotals.get(row.bu) || {
      values: new Array(safeTypeColumns.length).fill(0),
      rowTotal: 0,
    };
    row.values.forEach((value, index) => {
      subtotal.values[index] += value;
    });
    subtotal.rowTotal += row.rowTotal;
    buSubtotals.set(row.bu, subtotal);
  });
  const lastRowIdByBu = new Map<string, number>();
  sortedFlatRows.forEach((row) => {
    lastRowIdByBu.set(row.bu, row.globalRowId);
  });
  const pivotLabelColumnSpan = ["no", "business", "charge", "month"].filter(
    (key) => !hiddenColumns[key],
  ).length;

  const renderRows = () => {
    if (paginatedRows.length === 0) {
      return (
        <tr>
          <td colSpan={6 + safeTypeColumns.length} className="py-12 text-center text-slate-400 text-sm bg-white">
            <span>Chưa có dữ liệu. Vui lòng tải file ở bảng <span className="font-semibold text-slate-600">Cài đặt & Tải file (Master)</span> và nhấn <span className="font-semibold text-slate-600">Xử lý dữ liệu</span>.</span>
          </td>
        </tr>
      );
    }

    return paginatedRows.map((item) => {
      const isEditingThisRow = editingCell?.bu === item.bu && editingCell?.l07 === item.l07 && editingCell?.month === item.month;
      const showBuSubtotal = lastRowIdByBu.get(item.bu) === item.globalRowId;
      const buSubtotal = buSubtotals.get(item.bu);

      return (
        <React.Fragment key={`${item.bu}-${item.l07}-${item.month}`}>
          <tr
            className="transition-colors border-b border-[#e7dbdc] bg-[var(--card,#fff)] hover:bg-primary/[0.025]"
          >
          {!hiddenColumns.no && (
            <td 
              style={{ width: columnWidths["no"] || 50, minWidth: columnWidths["no"] || 50, maxWidth: columnWidths["no"] || 50 }}
              className="py-2 px-2 text-center border-r border-b border-[#e7dbdc] font-mono text-slate-600 text-xs relative group/no"
            >
              <span>{item.globalRowId}</span>
              <button
                onClick={() => handleDeleteRow(item.bu, item.l07, item.month)}
                className="opacity-0 group-hover/no:opacity-100 absolute right-1 top-1/2 -translate-y-1/2 text-rose-500 hover:text-rose-700 transition-opacity p-0.5 cursor-pointer"
                title="Xóa dòng"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </td>
          )}
          {!hiddenColumns.business && (
            <td 
              style={{ width: columnWidths["business"] || 90, minWidth: columnWidths["business"] || 90, maxWidth: columnWidths["business"] || 90 }}
              onDoubleClick={() => handleStartEdit(item.bu, item.l07, item.month, "bu", item.bu)}
              className="py-2 px-2.5 text-center border-r border-b border-[#e7dbdc] font-bold text-[var(--card-foreground)] text-xs bg-primary/[0.02] cursor-pointer hover:bg-primary/[0.06] transition-colors"
              title="Nhấp đúp để sửa Business"
            >
              {isEditingThisRow && editingCell.field === "bu" ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveEdit();
                    if (e.key === "Escape") handleCancelEdit();
                  }}
                  onBlur={handleSaveEdit}
                  className="w-full bg-amber-50 border border-amber-400 font-bold text-slate-900 text-xs px-1.5 py-0.5 rounded outline-none focus:ring-1 focus:ring-amber-500 text-center"
                />
              ) : (
                <span>{item.bu}</span>
              )}
            </td>
          )}
          {!hiddenColumns.charge && (
            <td 
              style={{ width: columnWidths["charge"] || 220, minWidth: columnWidths["charge"] || 220, maxWidth: columnWidths["charge"] || 220 }}
              onDoubleClick={() => handleStartEdit(item.bu, item.l07, item.month, "l07", item.l07)}
              className="py-2 px-2.5 text-left border-r border-b border-[#e7dbdc] text-[var(--card-foreground)] font-medium truncate text-xs cursor-pointer hover:bg-primary/[0.06] transition-colors"
              title={`Nhấp đúp để sửa L07 (${item.l07})`}
            >
              {isEditingThisRow && editingCell.field === "l07" ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveEdit();
                    if (e.key === "Escape") handleCancelEdit();
                  }}
                  onBlur={handleSaveEdit}
                  className="w-full bg-amber-50 border border-amber-400 font-medium text-slate-900 text-xs px-1.5 py-0.5 rounded outline-none focus:ring-1 focus:ring-amber-500"
                />
              ) : (
                <span>{item.l07}</span>
              )}
            </td>
          )}
          {!hiddenColumns.month && (
            <td 
              style={{ width: columnWidths["month"] || 90, minWidth: columnWidths["month"] || 90, maxWidth: columnWidths["month"] || 90 }}
              onDoubleClick={() => handleStartEdit(item.bu, item.l07, item.month, "month", item.month)}
              className="py-2 px-2.5 text-center border-r border-b border-[#e7dbdc] text-[var(--card-foreground)] text-xs font-mono cursor-pointer hover:bg-primary/[0.06] transition-colors"
              title="Nhấp đúp để sửa Tháng"
            >
              {isEditingThisRow && editingCell.field === "month" ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveEdit();
                    if (e.key === "Escape") handleCancelEdit();
                  }}
                  onBlur={handleSaveEdit}
                  className="w-full bg-amber-50 border border-amber-400 font-mono text-slate-900 text-xs px-1.5 py-0.5 rounded outline-none focus:ring-1 focus:ring-amber-500 text-center"
                />
              ) : (
                <span>{item.month}</span>
              )}
            </td>
          )}
          {safeTypeColumns.map((type, tIdx) => {
            if (hiddenColumns[`type_${type}`]) return null;
            const val = item.values[tIdx];
            const colKey = `type_${type}`;
            const w = columnWidths[colKey] || 120;

            return (
              <td 
                key={colKey}
                style={{ width: w, minWidth: w, maxWidth: w }}
                onDoubleClick={() => handleStartEdit(item.bu, item.l07, item.month, type, val)}
                className={`py-2 px-2.5 text-right border-r border-b border-[#e7dbdc] font-mono text-xs cursor-pointer hover:bg-primary/[0.06] transition-colors ${val > 0 ? "text-[var(--card-foreground)] font-semibold" : "text-[var(--muted-foreground)]"}`}
                title={`Nhấp đúp để sửa ${type}`}
              >
                {isEditingThisRow && editingCell.field === type ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit();
                      if (e.key === "Escape") handleCancelEdit();
                    }}
                    onBlur={handleSaveEdit}
                    className="w-full bg-amber-50 border border-amber-400 font-mono text-slate-900 text-xs px-1.5 py-0.5 rounded outline-none focus:ring-1 focus:ring-amber-500 text-right"
                  />
                ) : (
                  <span>{val ? formatNumber(val) : "0"}</span>
                )}
              </td>
            );
          })}
          {!hiddenColumns.grandTotal && (
            <td 
              style={{ width: columnWidths["grandTotal"] || 140, minWidth: columnWidths["grandTotal"] || 140, maxWidth: columnWidths["grandTotal"] || 140 }}
              className="py-2 px-3 text-right border-b border-[#e7dbdc] font-mono font-bold text-primary text-xs bg-primary/[0.035]"
            >
              {item.rowTotal ? formatNumber(item.rowTotal) : "0"}
            </td>
          )}
          </tr>
          {showBuSubtotal && buSubtotal && (
            <tr className="border-b border-primary/20 bg-primary/[0.045] text-primary">
              {pivotLabelColumnSpan > 0 && (
                <td
                  colSpan={pivotLabelColumnSpan}
                  className="border-r border-[#e7dbdc] px-2.5 py-2 text-left text-xs"
                >
                  TỔNG CỘNG {item.bu}
                </td>
              )}
              {buSubtotal.values.map((value, index) => {
                const type = safeTypeColumns[index];
                if (hiddenColumns[`type_${type}`]) return null;
                const colKey = `type_${type}`;
                const width = columnWidths[colKey] || 120;
                return (
                  <td
                    key={`${item.bu}-${type}`}
                    style={{ width, minWidth: width, maxWidth: width }}
                    className="border-r border-[#e7dbdc] px-2.5 py-2 text-right font-mono text-xs"
                  >
                    {value ? formatNumber(value) : "0"}
                  </td>
                );
              })}
              {!hiddenColumns.grandTotal && (
                <td
                  style={{
                    width: columnWidths["grandTotal"] || 140,
                    minWidth: columnWidths["grandTotal"] || 140,
                    maxWidth: columnWidths["grandTotal"] || 140,
                  }}
                  className="bg-primary/[0.055] px-3 py-2 text-right font-mono text-xs"
                >
                  {buSubtotal.rowTotal ? formatNumber(buSubtotal.rowTotal) : "0"}
                </td>
              )}
            </tr>
          )}
        </React.Fragment>
      );
    });
  };

  const toggleSort = (field: string) => {
    if (sortField === field) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        setSortField(null);
        setSortDirection("asc");
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  return (
    <div className="pivot-master-frame unified-table-frame relative flex h-full w-full flex-col gap-0 overflow-hidden border border-[#e7dbdc] bg-[var(--card,#fff)] p-0 text-[var(--card-foreground)]">
      {/* HEADER SECTION */}
      <div className="unified-table-frame-header flex min-h-[56px] flex-wrap items-center justify-between gap-3 border-b border-border bg-primary/[0.035] px-3 py-2">
        <div className="flex w-full items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <FileSpreadsheet className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[14px] font-bold leading-5 tracking-tight text-foreground">Pivot Master</h1>
            <p className="truncate text-[9px] font-medium leading-3.5 text-muted-foreground">
              Tổng hợp chi phí theo BU, L07 và loại · {totalCenters} trung tâm
            </p>
          </div>
          <div className="ml-auto hidden h-8 items-center border-l border-primary/15 pl-4 sm:flex">
            <div className="flex flex-col items-end leading-tight">
              <span className="text-[8px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">
                Tổng tiền
              </span>
              <span className="font-mono text-[12px] font-black text-primary">
                {formatNumber(superGrandTotal)}
              </span>
            </div>
          </div>
        </div>

        {/* SETTINGS: hiển thị ở chân bảng, giữ DOM tại đây để không tách logic thao tác. */}
        <div className="absolute bottom-[13px] left-[190px] z-50 flex items-center">
          <div className="relative" ref={settingsMenuRef}>
            <button
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className="flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-all hover:bg-muted active:scale-95"
              title="Cài đặt & Thao tác"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
            </button>

            {isSettingsOpen && (
              <div className="absolute bottom-full left-0 z-50 mb-2 flex w-72 flex-col gap-3 rounded-xl border border-border bg-card p-3.5 text-card-foreground shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Settings className="w-4 h-4 text-slate-600" /> Cài đặt & Thao tác
                  </span>
                  <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-slate-600 p-0.5">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* ACTION BUTTONS SECTION */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Thao tác dữ liệu</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => {
                        setIsSettingsOpen(false);
                        loadMasterData(true);
                      }}
                      disabled={isProcessing}
                      className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-lg transition-all disabled:opacity-50 cursor-pointer"
                      title="Tải lại dữ liệu từ bảng Cài đặt"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? "animate-spin text-amber-600" : ""}`} />
                      <span>{isProcessing ? "Đang xử lý..." : "Đồng bộ"}</span>
                    </button>

                    <label className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-lg cursor-pointer transition-all">
                      <Upload className="w-3.5 h-3.5 text-blue-600" />
                      <span>Tải file</span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".xlsx,.xls,.csv"
                        onChange={(e) => {
                          setIsSettingsOpen(false);
                          handleFileUpload(e);
                        }}
                        className="hidden"
                      />
                    </label>

                    <button
                      onClick={() => {
                        setIsSettingsOpen(false);
                        handleAddRow();
                      }}
                      className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 text-xs font-medium rounded-lg transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm dòng</span>
                    </button>

                    <button
                      onClick={() => {
                        setIsSettingsOpen(false);
                        handleAddColumn();
                      }}
                      className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-xs font-medium rounded-lg transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm cột</span>
                    </button>
                  </div>

                  <button
                    onClick={handleExportExcel}
                    className="w-full mt-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg shadow-2xs transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Xuất Excel</span>
                  </button>
                </div>

                <div className="border-t border-slate-100 pt-2 flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Ẩn/Hiện cột</span>
                  <div className="max-h-40 overflow-y-auto flex flex-col gap-1 pr-1">
                    <label className="flex items-center gap-2 hover:bg-slate-50 p-1 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!hiddenColumns.no}
                        onChange={(e) => setHiddenColumns(prev => ({ ...prev, no: !e.target.checked }))}
                        className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
                      />
                      <span className="text-xs font-medium text-slate-700">No.</span>
                    </label>
                    <label className="flex items-center gap-2 hover:bg-slate-50 p-1 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!hiddenColumns.business}
                        onChange={(e) => setHiddenColumns(prev => ({ ...prev, business: !e.target.checked }))}
                        className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
                      />
                      <span className="text-xs font-medium text-slate-700">Business</span>
                    </label>
                    <label className="flex items-center gap-2 hover:bg-slate-50 p-1 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!hiddenColumns.charge}
                        onChange={(e) => setHiddenColumns(prev => ({ ...prev, charge: !e.target.checked }))}
                        className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
                      />
                      <span className="text-xs font-medium text-slate-700">L07</span>
                    </label>
                    <label className="flex items-center gap-2 hover:bg-slate-50 p-1 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!hiddenColumns.month}
                        onChange={(e) => setHiddenColumns(prev => ({ ...prev, month: !e.target.checked }))}
                        className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
                      />
                      <span className="text-xs font-medium text-slate-700">Tháng</span>
                    </label>
                    {safeTypeColumns.map(type => (
                      <label key={type} className="flex items-center gap-2 hover:bg-slate-50 p-1 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!hiddenColumns[`type_${type}`]}
                          onChange={(e) => setHiddenColumns(prev => ({ ...prev, [`type_${type}`]: !e.target.checked }))}
                          className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
                        />
                        <span className="text-xs font-medium text-slate-700">{type}</span>
                      </label>
                    ))}
                    <label className="flex items-center gap-2 hover:bg-slate-50 p-1 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!hiddenColumns.grandTotal}
                        onChange={(e) => setHiddenColumns(prev => ({ ...prev, grandTotal: !e.target.checked }))}
                        className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
                      />
                      <span className="text-xs font-medium text-slate-700">TỔNG CỘNG</span>
                    </label>
                  </div>
                </div>

                {diagnosticLogs.length > 0 && (
                  <div className="border-t border-slate-100 pt-2">
                    <button
                      onClick={handleDownloadDiagnosticCSV}
                      className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-medium rounded-lg border border-rose-200 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Tải CSV Log lỗi ({diagnosticLogs.length})</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MAIN DATA TABLE */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--card,#fff)]">
        <div className="flex-1 overflow-auto relative">
          <table className="pivot-master-table w-full border-collapse select-none text-left text-xs" style={{ fontFamily: "var(--font-table, var(--font-mono))", fontSize: "13px" }}>
            <thead className="sticky top-0 z-20 border-b border-[#e7dbdc] bg-[var(--table-header-bg,var(--secondary,#FAF9F6))] font-bold text-primary shadow-2xs">
              <tr>
                {!hiddenColumns.no && (
                  <th 
                    style={{ width: columnWidths["no"] || 50, minWidth: columnWidths["no"] || 50, maxWidth: columnWidths["no"] || 50 }}
                    onClick={() => toggleSort("no")}
                    className="relative cursor-pointer border-r border-[#e7dbdc] bg-[var(--table-header-bg,var(--secondary,#FAF9F6))] px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-primary/[0.06]"
                  >
                    <span className="inline-flex items-center justify-center gap-1">
                      No.
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          autoFitAllColumns();
                        }}
                        className="inline-flex w-5 h-5 items-center justify-center rounded-full text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors"
                        title="Căn độ rộng tất cả cột theo dữ liệu"
                        aria-label="Căn độ rộng tất cả cột theo dữ liệu"
                      >
                        <Maximize2 className="w-3 h-3" />
                      </button>
                    </span>
                    <div
                      onMouseDown={(e) => handleResizeStart(e, "no", 50)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-amber-400 opacity-0 hover:opacity-100 transition-opacity"
                    />
                  </th>
                )}

                {!hiddenColumns.business && (
                  <th 
                    style={{ width: columnWidths["business"] || 90, minWidth: columnWidths["business"] || 90, maxWidth: columnWidths["business"] || 90 }}
                    onClick={() => toggleSort("bu")}
                    className="relative cursor-pointer border-r border-[#e7dbdc] bg-[var(--table-header-bg,var(--secondary,#FAF9F6))] px-2.5 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-primary transition-colors hover:bg-primary/[0.06]"
                  >
                    <span>Business</span>
                    <div
                      onMouseDown={(e) => handleResizeStart(e, "business", 90)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-amber-400 opacity-0 hover:opacity-100 transition-opacity"
                    />
                  </th>
                )}

                {!hiddenColumns.charge && (
                  <th 
                    style={{ width: columnWidths["charge"] || 220, minWidth: columnWidths["charge"] || 220, maxWidth: columnWidths["charge"] || 220 }}
                    onClick={() => toggleSort("l07")}
                    className="relative cursor-pointer border-r border-[#e7dbdc] bg-[var(--table-header-bg,var(--secondary,#FAF9F6))] px-2.5 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-primary transition-colors hover:bg-primary/[0.06]"
                  >
                    <span>L07</span>
                    <div
                      onMouseDown={(e) => handleResizeStart(e, "charge", 220)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-amber-400 opacity-0 hover:opacity-100 transition-opacity"
                    />
                  </th>
                )}

                {!hiddenColumns.month && (
                  <th 
                    style={{ width: columnWidths["month"] || 90, minWidth: columnWidths["month"] || 90, maxWidth: columnWidths["month"] || 90 }}
                    onClick={() => toggleSort("month")}
                    className="relative cursor-pointer border-r border-[#e7dbdc] bg-[var(--table-header-bg,var(--secondary,#FAF9F6))] px-2.5 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-primary transition-colors hover:bg-primary/[0.06]"
                  >
                    <span>Tháng</span>
                    <div
                      onMouseDown={(e) => handleResizeStart(e, "month", 90)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-amber-400 opacity-0 hover:opacity-100 transition-opacity"
                    />
                  </th>
                )}

                {safeTypeColumns.map(type => {
                  if (hiddenColumns[`type_${type}`]) return null;
                  const colKey = `type_${type}`;
                  const w = columnWidths[colKey] || 120;
                  return (
                    <th 
                      key={type}
                      style={{ width: w, minWidth: w, maxWidth: w }}
                      onClick={() => toggleSort(colKey)}
                      className="relative cursor-pointer border-r border-[#e7dbdc] bg-[var(--table-header-bg,var(--secondary,#FAF9F6))] px-2.5 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-primary transition-colors hover:bg-primary/[0.06]"
                    >
                      <span className="truncate block" title={type}>{type}</span>
                      <div
                        onMouseDown={(e) => handleResizeStart(e, colKey, 120)}
                        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-amber-400 opacity-0 hover:opacity-100 transition-opacity"
                      />
                    </th>
                  );
                })}

                {!hiddenColumns.grandTotal && (
                  <th 
                    style={{ width: columnWidths["grandTotal"] || 140, minWidth: columnWidths["grandTotal"] || 140, maxWidth: columnWidths["grandTotal"] || 140 }}
                    onClick={() => toggleSort("rowTotal")}
                    className="relative cursor-pointer bg-primary/[0.09] px-3 py-2.5 text-right text-[10px] font-extrabold uppercase tracking-wider text-primary transition-colors hover:bg-primary/[0.14]"
                  >
                    <span>TỔNG CỘNG</span>
                    <div
                      onMouseDown={(e) => handleResizeStart(e, "grandTotal", 140)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-amber-400 opacity-0 hover:opacity-100 transition-opacity"
                    />
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {renderRows()}
            </tbody>

            {/* GRAND TOTAL FOOTER ROW */}
            {paginatedRows.length > 0 && (
              <tfoot className="sticky bottom-0 z-10 border-t border-primary/25 bg-primary/[0.085] text-primary shadow-sm">
                <tr>
                  {pivotLabelColumnSpan > 0 && (
                    <td
                      colSpan={pivotLabelColumnSpan}
                      className="border-r border-[#e7dbdc] px-2.5 py-2.5 text-left text-primary"
                    >
                      TỔNG CỘNG TẤT CẢ
                    </td>
                  )}
                  {grandTotals.map((v, idx) => {
                    const type = safeTypeColumns[idx];
                    if (hiddenColumns[`type_${type}`]) return null;
                    const colKey = `type_${type}`;
                    const w = columnWidths[colKey] || 120;
                    return (
                      <td 
                        key={idx} 
                        style={{ width: w, minWidth: w, maxWidth: w }}
                        className="border-r border-[#e7dbdc] px-2.5 py-2.5 text-right font-mono text-xs text-primary"
                      >
                        {v ? formatNumber(v) : "0"}
                      </td>
                    );
                  })}
                  {!hiddenColumns.grandTotal && (
                    <td 
                      style={{ width: columnWidths["grandTotal"] || 140, minWidth: columnWidths["grandTotal"] || 140, maxWidth: columnWidths["grandTotal"] || 140 }}
                      className="bg-primary/[0.08] px-3 py-2.5 text-right font-mono text-xs text-primary"
                    >
                      {superGrandTotal ? formatNumber(superGrandTotal) : "0"}
                    </td>
                  )}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* PAGINATION FOOTER — đồng bộ với các bảng Master */}
        <div
          className="unified-table-frame-footer flex min-h-[52px] flex-wrap items-center justify-between gap-3 border-t border-[#e7dbdc] bg-[var(--table-header-bg,var(--secondary,#FAF9F6))] px-6 py-1.5 text-[var(--muted-foreground)]"
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="ml-2 whitespace-nowrap text-[11px] font-medium text-slate-600">
                Hiển thị:
              </span>
              <Select
                value={rowsPerPage === Infinity ? "all" : String(rowsPerPage)}
                onValueChange={(value) => {
                  setRowsPerPage(
                    value === "all" ? Infinity : Number(value),
                  );
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger
                  className="rounded-full border-slate-200 bg-white px-3 font-sans text-[11px] font-bold normal-case text-slate-700 shadow-2xs transition-colors hover:bg-slate-50"
                  style={{ height: "26px", width: "95px" }}
                >
                  <SelectValue placeholder="Chọn..." />
                </SelectTrigger>
                <SelectContent className="z-[99999] border-[#e7dbdc] bg-popover font-sans opacity-100">
                  <SelectItem value="10" className="font-sans text-[11px] font-medium normal-case">10 dòng</SelectItem>
                  <SelectItem value="20" className="font-sans text-[11px] font-medium normal-case">20 dòng</SelectItem>
                  <SelectItem value="50" className="font-sans text-[11px] font-medium normal-case">50 dòng</SelectItem>
                  <SelectItem value="100" className="font-sans text-[11px] font-medium normal-case">100 dòng</SelectItem>
                  <SelectItem value="all" className="font-sans text-[11px] font-medium normal-case">Tất cả</SelectItem>
                </SelectContent>
              </Select>
            </div>

          </div>

          <div className="flex h-6 items-center gap-1 border-l border-slate-200 pl-4">
            <button
              type="button"
              onClick={() => setCurrentPage(1)}
              disabled={validCurrentPage <= 1}
              className="flex h-7 w-7 cursor-pointer select-none items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-3xs transition-all hover:bg-slate-50 hover:text-slate-900 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white"
              title="Trang đầu"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={validCurrentPage <= 1}
              className="flex h-7 w-7 cursor-pointer select-none items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-3xs transition-all hover:bg-slate-50 hover:text-slate-900 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white"
              title="Trang trước"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            <span className="min-w-[90px] whitespace-nowrap px-3 text-center font-display text-[10.5px] font-black uppercase tracking-widest text-slate-700/80">
              TRANG {validCurrentPage} / {totalPages}
            </span>

            <button
              type="button"
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              disabled={validCurrentPage >= totalPages}
              className="flex h-7 w-7 cursor-pointer select-none items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-3xs transition-all hover:bg-slate-50 hover:text-slate-900 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white"
              title="Trang sau"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(totalPages)}
              disabled={validCurrentPage >= totalPages}
              className="flex h-7 w-7 cursor-pointer select-none items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-3xs transition-all hover:bg-slate-50 hover:text-slate-900 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white"
              title="Trang cuối"
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
