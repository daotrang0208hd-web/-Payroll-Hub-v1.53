/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router";
import {
  Download,
  Settings,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Trash2,
  Scale,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { toast } from "sonner";
import { useUiSettings } from "../../../lib/ui-settings";
import { useAppData } from "../../../lib/contexts/AppDataContext";
import { parseMoneyToNumber, removeVietnameseTones } from "../../../lib/utils/data-utils";
import {
  resolveL07BuFromAeCode,
  getCenterInfoByAECode,
  getCenterInfoByL07,
} from "../../../lib/utils/center-utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";

const fmt = (n: number) => {
  const rounded = Math.round(n);
  return new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rounded);
};

const toRoman = (num: number) => {
  const roman = [
    "",
    "I",
    "II",
    "III",
    "IV",
    "V",
    "VI",
    "VII",
    "VIII",
    "IX",
    "X",
    "XI",
    "XII",
  ];
  return roman[num] || num.toString();
};

const parseMonthFromFileName = (
  fileName: string,
  globalMonth?: string,
): string | null => {
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
    const y = m > currentMonthNum ? currentYearNum - 1 : currentYearNum;
    return `${m < 10 ? "0" + m : m}.${y}`;
  }
  return null;
};

const getNextMonthStr = (periodStr: string): string => {
  if (!periodStr) return "";
  const regex = /(?:tháng|thang|t)?\s*(\d{1,2})[/\-.]\s*(\d{4})/i;
  const match = periodStr.match(regex);
  if (match) {
    let m = parseInt(match[1], 10);
    let y = parseInt(match[2], 10);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    return `Tháng ${m}/${y}`;
  }
  const parts = periodStr.split(".");
  if (parts.length === 2) {
    let m = parseInt(parts[0], 10);
    let y = parseInt(parts[1], 10);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    return `${m < 10 ? "0" + m : m}.${y}`;
  }
  return periodStr;
};

const isSameMonthForSumIf = (rowMonthRaw?: string, workMonthRaw?: string): boolean => {
  if (!workMonthRaw) return false;
  if (!rowMonthRaw) return true; // If no month is specified in row, assume it matches the target context
  
  const parsePartsStr = (s: string) => {
    // Clean string: trim, lower case, remove spaces, replace Vietnamese "tháng" if any
    const clean = s.trim().toLowerCase()
      .replace(/\s+/g, "")
      .replace(/^tháng/, ""); // remove prefix "tháng" if any
    
    // Now standard separators are /, -, _, .
    const dotSep = clean.replace(/[-_/]/g, ".");
    const parts = dotSep.split(".");
    
    if (parts.length >= 2) {
      // Find year (4 digits)
      const yearIdx = parts.findIndex(p => p.length === 4 && !isNaN(parseInt(p, 10)));
      if (yearIdx !== -1) {
        const year = parseInt(parts[yearIdx], 10);
        let month = 0;
        if (yearIdx === 1) {
          month = parseInt(parts[0], 10);
        } else if (yearIdx === 2) {
          month = parseInt(parts[1], 10);
        } else if (yearIdx === 0) {
          month = parseInt(parts[1], 10);
        }
        if (month >= 1 && month <= 12 && year > 0) {
          return { month, year };
        }
      } else {
        // Fallback: e.g. "01.26" -> [01, 26]
        const first = parseInt(parts[0], 10);
        const second = parseInt(parts[1], 10);
        if (!isNaN(first) && !isNaN(second)) {
          if (first > 12) {
            return { month: second, year: first < 100 ? first + 2000 : first };
          } else {
            return { month: first, year: second < 100 ? second + 2000 : second };
          }
        }
      }
    }
    
    // Try matching formats like "tháng 3/2026", etc via regex
    const match = s.match(/(tháng|thg)?\s*(\d{1,2})\s*([./-])\s*(\d{4})/i);
    if (match) {
      return { month: parseInt(match[2], 10), year: parseInt(match[3], 10) };
    }
    
    return null;
  };

  const p1 = parsePartsStr(rowMonthRaw);
  const p2 = parsePartsStr(workMonthRaw);
  
  if (p1 && p2) {
    return p1.month === p2.month && p1.year === p2.year;
  }
  
  // Last resort: simple clean direct compare
  const directClean = (str: string) => str.trim().toLowerCase()
    .replace(/\s+/g, "")
    .replace(/^tháng/, "")
    .replace(/[/_]/g, ".");
  return directClean(rowMonthRaw) === directClean(workMonthRaw);
};

const isExactReportPeriod = (
  row: Pick<BuRow, "reportMonth" | "month">,
  period: string,
) => {
  const reportMonth = String(row.reportMonth || row.month || "").trim();
  return reportMonth.length > 0 && isSameMonthForSumIf(reportMonth, period);
};

const isPastMonthHold = (row: any, currentMonthNum: number, currentYearNum: number): boolean => {
  if (!row) return false;

  const rawSource = String(row["Sheet Source"] || "").toUpperCase();
  const isBonusSummer = rawSource.includes("BONUS") && (
    rawSource.includes("SUMMER") || 
    rawSource.includes("INSTRUCTOR") || 
    rawSource.includes("INTROSTION")
  );
  if (isBonusSummer) return false;

  let phatSinh = "";
  for (const k of Object.keys(row)) {
    const kNorm = k.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\u0111/g, "d")
      .trim();
    if (kNorm === "thang phat sinh") {
      phatSinh = String(row[k] || "").trim();
      break;
    }
  }

  if (!phatSinh) {
    phatSinh = String(
      row["Tháng phát sinh"] || 
      row["tháng phát sinh"] || 
      row["Thang phat sinh"] || 
      row["thang phat sinh"] || 
      row["Tháng Phát Sinh"] ||
      ""
    ).trim();
  }

  if (phatSinh) {
    const parts = phatSinh.split(/[./-]/);
    if (parts.length === 2) {
      const m = parseInt(parts[0], 10);
      const y = parseInt(parts[1], 10);
      let nghiepVu = String(row["Nghiệp vụ"] || "").trim().toUpperCase();
      if (!nghiepVu) {
        for (const k of Object.keys(row)) {
          const kLower = k.toLowerCase();
          if (kLower.includes("nghiệp vụ") || kLower.includes("nghiệp vụ") || kLower.includes("nghiep vu")) {
            nghiepVu = String(row[k] || "").trim().toUpperCase();
            break;
          }
        }
      }
      const isHoldOrCancel = nghiepVu.includes("HOLD") || nghiepVu.includes("CANCEL");
      if (isHoldOrCancel && !isNaN(m) && !isNaN(y)) {
        if (y < currentYearNum || (y === currentYearNum && m < currentMonthNum)) {
          return true;
        }
      }
    }
  }

  // Extract from any possible "Tình trạng thanh toán" or "Trạng thái" key
  let tttt = "";
  for (const k of Object.keys(row)) {
    const kLower = k.toLowerCase();
    if (kLower.includes("tình trạng thanh toán") || kLower.includes("tình trạng") || kLower.includes("tttt") || kLower.includes("tinh trang thanh toan")) {
      tttt = String(row[k] || "");
      break;
    }
  }
  if (!tttt) {
    tttt = String(row["Tình trạng thanh toán"] || row["Tình Trạng Thanh Toán"] || row["TÌNH TRẠNG THANH TOÁN"] || row["Tháng phát sinh"] || row["tháng phát sinh"] || row["Trạng thái"] || row["trạng thái"] || "");
  }

  const ttttLower = tttt.toLowerCase().trim();
  if (ttttLower.includes("pending")) {
    const pendingMatch = ttttLower.match(/pending\s*(?:tháng|thg|t)?\s*(\d+)(\s*([./-])\s*(\d+))?/i);
    if (pendingMatch) {
      const m = parseInt(pendingMatch[1], 10);
      let y = currentYearNum;
      
      const yrMatch = ttttLower.match(/\b(202\d)\b/);
      if (yrMatch) {
        y = parseInt(yrMatch[1], 10);
      } else if (m === 11 || m === 12) {
        y = 2025;
      }
      
      // If of a past month
      if (y < currentYearNum || (y === currentYearNum && m < currentMonthNum)) {
        return true;
      }
    }
  }
  return false;
};

interface BuRow {
  id: string;
  month: string;
  reportMonth?: string;
  bu: string;
  thu: number;
  chi: number;
  add: number;
  hold: number;
  cancel: number;
  bonus: number;
  rawAdd: number;
  rawHold: number;
  rawCancel: number;
  rawBonus: number;
  rawHoldPending: number;
  ghiChu: string;
  confirmed: boolean;
  displayMonth?: string;
  customMonthDisplay?: string;
  openHold?: number;
  rawOpenHold?: number;
  _dimmed?: boolean;
  _excludeFromTotals?: boolean;
  _isPastHoldApprove?: boolean;
  _isOpeningHold?: boolean;
  lenh?: string;
  isPaidStatus?: boolean;
}

export function HoldAddDashboard() {
  const uiSettings = useUiSettings();
  const { appData, updateAppData } = useAppData();
  const navigate = useNavigate();
  const [yearFilter, setYearFilter] = useState("all");
  const [itemsPerPage, setItemsPerPage] = useState<number | "all">("all");
  const currentPeriodVal = appData.globalMonth || "03.2026";
  const currentPeriodParts = currentPeriodVal.split(".");
  const currentPeriodMonthNum = parseInt(currentPeriodParts[0], 10) || 3;
  const currentPeriodYearNum = parseInt(currentPeriodParts[1], 10) || 2026;
  const currentPeriod = `Tháng ${currentPeriodMonthNum}/${currentPeriodYearNum}`;

  const [expanded, setExpanded] = useState<Set<string>>(
    new Set([
      "Kỳ hiện tại",
      currentPeriod,
      "Tháng 1/2026",
      "Tháng 12/2025",
      "Tháng 2/2026",
    ]),
  );

  // Confirmed tracking state (simulating 'Lệnh' user action)
  const confirmedIds = useMemo(() => {
    return new Set<string>(appData.ConfirmedIds_HoldAdd || []);
  }, [appData.ConfirmedIds_HoldAdd]);

  const getSavedDataForPeriod = useCallback((map: Record<string, any> | undefined, month: string) => {
    if (!map || !month) return undefined;
    if (map[month]) return map[month];
    const matchM = month.match(/\b([1-9]|1[0-2])\b/);
    const matchY = month.match(/20\d{2}/);
    if (matchM) {
      const mNum = parseInt(matchM[0], 10);
      const yNum = matchY ? parseInt(matchY[0], 10) : 2026;
      const v1 = `Tháng ${mNum}/${yNum}`;
      const v2 = `Tháng ${String(mNum).padStart(2, "0")}/${yNum}`;
      const v3 = `${String(mNum).padStart(2, "0")}.${yNum}`;
      const v4 = `Tháng ${mNum}.${yNum}`;
      const v5 = `Tháng ${String(mNum).padStart(2, "0")}.${yNum}`;
      return map[v1] || map[v2] || map[v3] || map[v4] || map[v5];
    }
    return undefined;
  }, []);

  const isPeriodSaved = useCallback(
    (month: string) => {
      if (!month || !appData.SavedPeriods_HoldAdd) return false;
      return !!getSavedDataForPeriod(appData.SavedPeriods_HoldAdd, month);
    },
    [appData.SavedPeriods_HoldAdd, getSavedDataForPeriod],
  );

  const handleDeleteSavedPeriod = useCallback(() => {
    updateAppData((prev: any) => {
      const nextSavedAll = prev.SavedBal_PayrollTrial
        ? JSON.parse(JSON.stringify(prev.SavedBal_PayrollTrial))
        : {};
      const nextSavedPeriods = prev.SavedPeriods_HoldAdd
        ? JSON.parse(JSON.stringify(prev.SavedPeriods_HoldAdd))
        : {};
      const nextSavedRows = prev.SavedRows_HoldAdd
        ? JSON.parse(JSON.stringify(prev.SavedRows_HoldAdd))
        : {};
      const nextSavedRowsMeta = prev.SavedRows_HoldAdd_Meta
        ? JSON.parse(JSON.stringify(prev.SavedRows_HoldAdd_Meta))
        : {};

      const currentMonthVal = appData.globalMonth || "03.2026";
      const currentMonthNum = parseInt(currentMonthVal.split(".")[0], 10) || 3;
      const currentYearNum = parseInt(currentMonthVal.split(".")[1], 10) || 2026;
      const variations = [
        currentPeriod,
        `Tháng ${currentMonthNum}/${currentYearNum}`,
        `Tháng ${String(currentMonthNum).padStart(2, "0")}/${currentYearNum}`,
        `Tháng ${currentMonthNum}.${currentYearNum}`,
        `Tháng ${String(currentMonthNum).padStart(2, "0")}.${currentYearNum}`,
        `${String(currentMonthNum).padStart(2, "0")}.${currentYearNum}`,
      ];

      variations.forEach((v) => {
        delete nextSavedPeriods[v];
        delete nextSavedRows[v];
        delete nextSavedRowsMeta[v];
      });

      const nextMonthStr = getNextMonthStr(currentPeriod);
      if (nextMonthStr) {
        delete nextSavedAll[nextMonthStr];
        const nextMonthNum = (currentMonthNum % 12) + 1;
        const nextYearNum = currentMonthNum === 12 ? currentYearNum + 1 : currentYearNum;
        const nextVariations = [
          nextMonthStr,
          `Tháng ${nextMonthNum}/${nextYearNum}`,
          `Tháng ${String(nextMonthNum).padStart(2, "0")}/${nextYearNum}`,
          `Tháng ${nextMonthNum}.${nextYearNum}`,
          `Tháng ${String(nextMonthNum).padStart(2, "0")}.${nextYearNum}`,
          `${String(nextMonthNum).padStart(2, "0")}.${nextYearNum}`,
        ];
        nextVariations.forEach((nv) => {
          delete nextSavedAll[nv];
        });
      }

      return {
        ...prev,
        SavedBal_PayrollTrial: nextSavedAll,
        SavedPeriods_HoldAdd: nextSavedPeriods,
        SavedRows_HoldAdd: nextSavedRows,
        SavedRows_HoldAdd_Meta: nextSavedRowsMeta,
      };
    });
    toast.success(`Đã xóa dữ liệu đã lưu ${currentPeriod}!`);
  }, [updateAppData, currentPeriod, appData.globalMonth]);

  // Extracted month conversion utility that preserves the year
  const extractMonth = useCallback(
    (str: string) => {
      if (!str) return null;
      const s = str.toUpperCase().trim();

      // 1. Matches "Tháng MM/YYYY", "T MM/YYYY", "MM/YYYY"
      const yrMatch = s.match(
        /(?:THÁNG|THANG|T)?\s*(\d{1,2})(?:[./\- ]|NAM\s+|YEAR\s+)+(\d{4})/i,
      );
      if (yrMatch) {
         const m = parseInt(yrMatch[1], 10);
         const y = parseInt(yrMatch[2], 10);
         if (m >= 1 && m <= 12) return `Tháng ${m}/${y}`;
      }

      // 2. Matches [D]D/[M]M e.g. "15/1", "1/2"
      const dmMatch = s.match(/\b\d{1,2}[./-]\s*(\d{1,2})\b/);
      if (dmMatch) {
         const m = parseInt(dmMatch[1], 10);
         if (m >= 1 && m <= 12) {
           let y = currentPeriodYearNum;
           // If extracted month > current month, it's likely from the previous year
           if (m > currentPeriodMonthNum && (currentPeriodYearNum === 2025 || currentPeriodYearNum === 2026)) {
             y = currentPeriodYearNum - 1;
           }
           return `Tháng ${m}/${y}`;
         }
      }

      // 3. Matches "T MM", "Tháng MM"
      const tMatch = s.match(/T[HÁNG]*\s*(\d+)/i);
      if (tMatch) {
        const m = parseInt(tMatch[1], 10);
        if (m >= 1 && m <= 12) {
          let y = currentPeriodYearNum;
          if (m === 11 || m === 12) {
            y = currentPeriodYearNum === 2025 ? 2025 : (currentPeriodYearNum === 2026 ? 2025 : currentPeriodYearNum);
          } else if (m > currentPeriodMonthNum && (currentPeriodYearNum === 2025 || currentPeriodYearNum === 2026)) {
            y = currentPeriodYearNum - 1;
          }
          return `Tháng ${m}/${y}`;
        }
      }

      // 4. Matches "MM.YYYY" (e.g. 02.2026)
      const dotMatch = s.match(/^(\d{1,2})\.(\d{4})$/);
      if (dotMatch) {
        return `Tháng ${parseInt(dotMatch[1], 10)}/${parseInt(dotMatch[2], 10)}`;
      }

      return null;
    },
    [currentPeriodMonthNum, currentPeriodYearNum],
  );

  const getMonthNum = useCallback(
    (mStr: string) => {
      if (!mStr) return 0;
      const match = mStr.match(/(\d+)\/(\d+)/);
      if (match) {
        const m = parseInt(match[1], 10);
        const y = parseInt(match[2], 10);
        return y * 100 + m;
      }
      const matchOnlyMonth = mStr.match(/\d+/);
      if (matchOnlyMonth) {
        const m = parseInt(matchOnlyMonth[0], 10);
        let y = currentPeriodYearNum;
        if (m > currentPeriodMonthNum && (currentPeriodYearNum === 2025 || currentPeriodYearNum === 2026)) {
          y = currentPeriodYearNum - 1;
        }
        return y * 100 + m;
      }
      return 0;
    },
    [currentPeriodMonthNum, currentPeriodYearNum],
  );
  const currentPeriodNum = useMemo(
    () => getMonthNum(currentPeriod),
    [currentPeriod, getMonthNum],
  );

  // Comparison metrics check
  const selectedMonth = appData.globalMonth || "03.2026";
  const fileMonths = useMemo(() => {
    return (
      appData.Ae_Global_Inputs?.map(
        (f: any) =>
          f?.month ||
          parseMonthFromFileName(f?.name || "", appData.globalMonth) ||
          "03.2026",
      ) || []
    );
  }, [appData.Ae_Global_Inputs, appData.globalMonth]);
  const isMonthMatched = fileMonths.includes(selectedMonth);

  const bulkPaymentDiff = useMemo(() => {
    const currentMonthVal = appData.globalMonth || "03.2026";
    const currentPeriodParts = currentMonthVal.split(".");
    const currentMonthNum = parseInt(currentPeriodParts[0], 10) || 3;
    const currentYearNum = parseInt(currentPeriodParts[1], 10) || 2026;
    const targetMonthLabelComp = `Tháng ${currentMonthNum}/${currentYearNum}`;
    const monthShortStrComp = `T${currentMonthNum}`;
    const monthDashStrComp = `${currentMonthNum}/${currentYearNum}`;
  
    const monMatchComp = (s: string) => {
      if (!s) return null;
      const up = String(s).toUpperCase().trim();
      const yrMatch = up.match(
        /(?:THÁNG|THANG|T)?\s*(\d{1,2})(?:[./\- ]|NAM\s+|YEAR\s+)+(\d{4})/i,
      );
      if (yrMatch) {
        const m = parseInt(yrMatch[1], 10);
        const y = parseInt(yrMatch[2], 10);
        return `Tháng ${m}/${y}`;
      }
      const mMatch = up.match(/(?:THÁNG|THANG|T)\s*(\d+)/i);
      if (mMatch) {
        const m = parseInt(mMatch[1], 10);
        let y = currentYearNum;
        if (m === 11 || m === 12) {
          y = currentYearNum === 2025 ? 2025 : (currentYearNum === 2026 ? 2025 : currentYearNum);
        } else if (m > currentMonthNum && (currentYearNum === 2025 || currentYearNum === 2026)) {
          y = currentYearNum - 1;
        }
        return `Tháng ${m}/${y}`;
      }
      const dmMatch = up.match(/\b\d{1,2}[./-]\s*(\d{1,2})\b/);
      if (dmMatch) {
        const m = parseInt(dmMatch[1], 10);
        let y = currentYearNum;
        if (m > currentMonthNum && (currentYearNum === 2025 || currentYearNum === 2026)) {
          y = currentYearNum - 1;
        }
        return `Tháng ${m}/${y}`;
      }
      return null;
    };
  
    const isMonthInStrComp = (s: string) => {
      const up = String(s || "").toUpperCase();
      return (
        up.includes(targetMonthLabelComp.toUpperCase()) ||
        up.includes(monthShortStrComp.toUpperCase()) ||
        up.includes(monthDashStrComp)
      );
    };

    const sheet1Total = appData.Sheet1_AE?.data?.reduce(
      (sum: number, r: any) => {
        const rowMonthStr = String(r["Tháng báo cáo"] || r["_fileMonth"] || r["Tháng"] || "").trim();
        if (rowMonthStr && !isSameMonthForSumIf(rowMonthStr, currentMonthVal)) return sum;
        
        let biz = String(r["Business"] || r["BU"] || "Unknown").trim().toUpperCase();
        if (biz === "AHN_HP") biz = "AHP";
        if (biz !== "AHN" && biz !== "AHP" && biz !== "ATH" && biz !== "ATN" && biz !== "APT") return sum;
        
        return sum + parseMoneyToNumber(
          r["TOTAL PAYMENT"] || 
          r["Total Payment"] || 
          r["Payment Amount"] || 
          r["Grand Total"] || 
          r["GRAND TOTAL"] || 
          r["PAYMENT AMOUNT"] || 
          0
        );
      },
      0
    ) || 0;

    const idToSheet1: Record<string, string> = {};
    const nameToSheet1: Record<string, string> = {};
    const accToSheet1: Record<string, string> = {};

    appData.Sheet1_AE?.data?.forEach((row: any) => {
      const id = String(row["ID Number"] || row["Mã AE"] || row["Mã ae"] || "").trim();
      const name = removeVietnameseTones(row["Full name"] || row["Beneficiary Name"] || "").toUpperCase();
      const acc = String(row["Bank Account Number"] || row["Beneficiary Account No."] || "").trim();
      
      let biz = row["Business"] || row["BU"] || "Unknown";
      if (biz === "AHN_HP") biz = "AHP";
      
      if (id) idToSheet1[id] = biz;
      if (name) nameToSheet1[name] = biz;
      if (acc) accToSheet1[acc] = biz;
    });

    let holdTotal = 0;
    appData.Hold_AE?.data?.forEach((row: any) => {
      const rowMonthRaw = String(row["Tháng báo cáo"] || row["_fileMonth"] || row["Tháng"] || "").trim();
      const extracted = monMatchComp(rowMonthRaw);

      if (extracted && extracted !== targetMonthLabelComp) return;
      if (!extracted && rowMonthRaw && !isMonthInStrComp(rowMonthRaw)) return;

      let biz = row["BU"] || row["Business"] || "";
      if (biz) biz = String(biz).trim().toUpperCase();
      if (biz === "AHN_HP") biz = "AHP";

      const id = String(row["ID Number"] || row["Mã AE"] || row["Mã ae"] || "").trim();
      const name = removeVietnameseTones(row["Full name"] || row["Beneficiary Name"] || "").toUpperCase();
      const acc = String(row["Bank Account Number"] || row["Beneficiary Account No."] || "").trim();

      if (!biz || biz === "UNKNOWN") biz = idToSheet1[id];
      if ((!biz || biz === "UNKNOWN") && acc) biz = accToSheet1[acc];
      if ((!biz || biz === "UNKNOWN") && name) biz = nameToSheet1[name];

      // fallback
      if (!biz || biz === "UNKNOWN") {
        const textToMatch = [ row["Sheet Source"], row["CENTER NOTE"], row["Mã ae"], row["Note"], row["Full name"] ]
          .map(v => String(v || "").toUpperCase()).join(" ");
        if (textToMatch.includes("HN") || textToMatch.includes("AHN")) biz = "AHN";
        else if (textToMatch.includes("AHP") || textToMatch.includes("HAIPHONG")) biz = "AHP";
        else if (textToMatch.includes("ATH") || textToMatch.includes("THANH HOA")) biz = "ATH";
        else if (textToMatch.includes("ATN") || textToMatch.includes("THAI NGUYEN")) biz = "ATN";
        else if (textToMatch.includes("APT") || textToMatch.includes("PHU THO")) biz = "APT";
        else biz = "AHN";
      }

      if (biz === "AHN_HP") biz = "AHP";

      if (biz !== "AHN" && biz !== "AHP" && biz !== "ATH" && biz !== "ATN" && biz !== "APT") return;

      let val = parseMoneyToNumber(row["TOTAL PAYMENT"] || row["Grand Total"] || row["GRAND TOTAL"] || row["Payment Amount"] || 0);
      const nghiepVu = String(row["Nghiệp vụ"] || "").toLowerCase();
      const label = String(row["Sheet Source"] || "").toUpperCase() || (val >= 0 ? "ADD" : "HOLD");
      const isHold = label.includes("HOLD") || nghiepVu.includes("hold");
      const isAdd = label.includes("ADD") || (!isHold && val > 0) || nghiepVu.includes("add");

      const command = String(row["Lệnh"] || "").trim().toUpperCase();
      if (command === "-") return;
      
      const sheetSource = String(row["Sheet Source"] || "").toLowerCase();

      if (sheetSource.includes("sheet 1 ae") || sheetSource.includes("sheet 1")) return;
      if (row._dimmed) return;

      const phatSinhRaw = String(row["Tháng phát sinh"] || row["tháng phát sinh"] || row["Thang phat sinh"] || "").trim();
      const psMonth = monMatchComp(phatSinhRaw) || extracted;
      const getMonthNumLocal = (mStr: string) => {
        if (!mStr) return 0;
        const match = mStr.match(/(\d+)\/(\d+)/);
        if (match) {
          return parseInt(match[2], 10) * 100 + parseInt(match[1], 10);
        }
        return 0;
      };
      const isTargetHC = (isHold || nghiepVu === "cancel" || nghiepVu.includes("cancel")) &&
                          extracted === targetMonthLabelComp &&
                          (psMonth ? getMonthNumLocal(psMonth) <= getMonthNumLocal(targetMonthLabelComp) : true);

      if (isPastMonthHold(row, currentMonthNum, currentYearNum) && !isTargetHC) {
        val = 0;
      } else if (isAdd) {
        val = Math.abs(val);
      } else {
        val = -Math.abs(val);
      }

      if (val !== 0) {
        holdTotal += val;
      }
    });

    const calculatedTotal = sheet1Total + holdTotal;

    const aeTotal = appData.Bank_North_AE?.data?.reduce(
      (sum: number, r: any) => {
        const rowMonthRaw = String(r["Tháng báo cáo"] || r["_fileMonth"] || r["Tháng"] || "").trim();
        const extracted = monMatchComp(rowMonthRaw);
        
        const fMonthRaw = String(r["_fileMonth"] || "").trim();
        const fMonthExtracted = monMatchComp(fMonthRaw);
        
        let isMonthMatch = false;
        if (fMonthExtracted === targetMonthLabelComp) {
          isMonthMatch = true;
        } else if (extracted && extracted === targetMonthLabelComp) {
          isMonthMatch = true;
        } else if (!extracted && rowMonthRaw && isMonthInStrComp(rowMonthRaw)) {
          isMonthMatch = true;
        }

        if (!isMonthMatch) return sum;

        // Resolve business unit for each bank row to ensure we only sum AHN & AHP
        let biz = r["Business"] || r["BU"] || "";
        if (biz) biz = String(biz).trim().toUpperCase();
        if (biz === "AHN_HP") biz = "AHP";

        const id = String(r["ID Number"] || r["Mã AE"] || r["Mã ae"] || "").trim();
        const name = removeVietnameseTones(r["Full name"] || r["Beneficiary Name"] || "").toUpperCase();
        const acc = String(r["Bank Account Number"] || r["Beneficiary Account No."] || "").trim();

        if (!biz || biz === "UNKNOWN") biz = idToSheet1[id];
        if ((!biz || biz === "UNKNOWN") && acc) biz = accToSheet1[acc];
        if ((!biz || biz === "UNKNOWN") && name) biz = nameToSheet1[name];

        // fallback based on text in the bank row
        if (!biz || biz === "UNKNOWN") {
          const textToMatch = [ r["Sheet Source"], r["CENTER NOTE"], r["Mã ae"], r["Note"], r["Full name"], r["Payment details"] ]
            .map(v => String(v || "").toUpperCase()).join(" ");
          if (textToMatch.includes("HN") || textToMatch.includes("AHN")) biz = "AHN";
          else if (textToMatch.includes("AHP") || textToMatch.includes("HAIPHONG")) biz = "AHP";
          else if (textToMatch.includes("ATH") || textToMatch.includes("THANH HOA")) biz = "ATH";
          else if (textToMatch.includes("ATN") || textToMatch.includes("THAI NGUYEN")) biz = "ATN";
          else if (textToMatch.includes("APT") || textToMatch.includes("PHU THO")) biz = "APT";
          else biz = "AHN"; // default fallback to AHN
        }

        if (biz === "AHN_HP") biz = "AHP";

        if (biz !== "AHN" && biz !== "AHP" && biz !== "ATH" && biz !== "ATN" && biz !== "APT") return sum;

        return sum + (parseMoneyToNumber(r["TOTAL PAYMENT"]) || 0);
      },
      0
    ) || 0;

    return calculatedTotal - aeTotal;
  }, [
    appData.Sheet1_AE?.data,
    appData.Hold_AE?.data,
    appData.Bank_North_AE?.data,
    appData.globalMonth
  ]);

  const isBulkDiffZero = Math.abs(bulkPaymentDiff) < 1;
  const isOkToDisplayValues = isMonthMatched && isBulkDiffZero;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _discrepancyCandidates = useMemo(() => {
    const list: { type: string; label: string; amount: number }[] = [];
    const targetDiff = Math.abs(bulkPaymentDiff);
    if (targetDiff < 1) return list;

    const holdRows = appData.Hold_AE?.data || [];
    const bankRows = appData.Bank_North_AE?.data || [];

    // Single rows from Hold_AE matching targetDiff
    holdRows.forEach((r: any, idx: number) => {
      const val = parseMoneyToNumber(r["TOTAL PAYMENT"] || r["TOTAL"] || r["Total"] || 0);
      const absVal = Math.abs(val);
      if (Math.abs(absVal - targetDiff) < 10) {
        list.push({
          type: "Hold/Add Row",
          label: `Bảng Hold AE (Dòng #${idx + 1}): AE "${r["Full name"] || "N/A"}" có số tiền ${val.toLocaleString()} (Bản ghi ở nguồn Hold đang ${val < 0 ? "trừ" : "cộng"} số tiền này).`,
          amount: val
        });
      }
    });

    // Single rows from Bank_North_AE matching targetDiff
    bankRows.forEach((r: any, idx: number) => {
      const val = parseMoneyToNumber(r["TOTAL PAYMENT"] || r["Payment Amount"] || 0);
      const absVal = Math.abs(val);
      if (Math.abs(absVal - targetDiff) < 10) {
        list.push({
          type: "Bank North Row",
          label: `Bảng Bank North (Dòng #${idx + 1}): AE "${r["Full name"] || r["Beneficiary Name"] || "N/A"}" có số tiền thanh toán thực tế là ${val.toLocaleString()}.`,
          amount: val
        });
      }
    });

    // Pair of rows from Hold_AE matching targetDiff (if row counts under 500 to keep it highly performant)
    if (list.length < 5 && holdRows.length < 500) {
      for (let i = 0; i < holdRows.length; i++) {
        const val1 = parseMoneyToNumber(holdRows[i]["TOTAL PAYMENT"] || 0);
        const name1 = holdRows[i]["Full name"] || "N/A";
        for (let j = i + 1; j < holdRows.length; j++) {
          const val2 = parseMoneyToNumber(holdRows[j]["TOTAL PAYMENT"] || 0);
          const name2 = holdRows[j]["Full name"] || "N/A";

          if (Math.abs(Math.abs(val1) + Math.abs(val2) - targetDiff) < 10) {
            list.push({
              type: "Hold Pair (Sum)",
              label: `Khớp tổng 2 dòng Hold: "${name1}" (${val1.toLocaleString()} đ) + "${name2}" (${val2.toLocaleString()} đ) = ${(Math.abs(val1) + Math.abs(val2)).toLocaleString()} đ.`,
              amount: Math.abs(val1) + Math.abs(val2)
            });
          }
          if (Math.abs(val1 + val2 - targetDiff) < 10) {
            list.push({
              type: "Hold Pair (Sum)",
              label: `Khớp tổng 2 dòng Hold: "${name1}" (${val1.toLocaleString()} đ) & "${name2}" (${val2.toLocaleString()} đ) = ${(val1 + val2).toLocaleString()} đ.`,
              amount: val1 + val2
            });
          }
        }
      }
    }

    return list.slice(0, 5); // display top 5 most relevant possibilities
  }, [appData.Hold_AE?.data, appData.Bank_North_AE?.data, bulkPaymentDiff]);

  const data = useMemo(() => {
    const sheet1Rows = appData.Sheet1_AE?.data || [];
    const holdRows = appData.Hold_AE?.data || [];

    let defaultMonth = currentPeriod;
    for (const r of sheet1Rows) {
      const m = extractMonth(
        String(r["_fileMonth"] || r["Tháng"] || r["Tháng báo cáo"] || ""),
      );
      if (m) {
        defaultMonth = m;
        break;
      }
    }

    const buStats: Record<
      string,
      BuRow & {
        rawThu: number;
        rawChi: number;
      }
    > = {};

    const getBuKey = (m: string, b: string) => `${m}_${b}`;

    const accToBU: Record<string, string> = {};
    const extractBU = (str: string) => {
      const u = str.toUpperCase();
      if (u.includes("HN") || u.includes("AHN")) return "AHN";
      if (u.includes("HP") || u.includes("AHP") || u.includes("HAI PHONG"))
        return "AHP";
      if (u.includes("TH") || u.includes("ATH") || u.includes("THANH HOA"))
        return "ATH";
      if (u.includes("TN") || u.includes("ATN") || u.includes("THAI NGUYEN"))
        return "ATN";
      if (u.includes("VT") || u.includes("AVT")) return "AVT";
      return "UNKNOWN";
    };

    sheet1Rows.forEach((r: any) => {
      let biz = String(r["Business"] || "").trim();
      const l07 = String(r["L07"] || r["Mã AE"] || r["Mã ae"] || "").trim();
      if (!biz && l07) {
        const resolved =
          resolveL07BuFromAeCode(l07) ||
          getCenterInfoByAECode(l07) ||
          getCenterInfoByL07(l07);
        if (resolved) {
          biz =
            ("bu" in resolved
              ? resolved.bu
              : "bus" in resolved
                ? resolved.bus
                : "") || biz;
        }
      }
      if (!biz)
        biz = extractBU(
          String(r["CENTER NOTE"] || r["Note"] || r["L07"] || ""),
        );
      if (!biz || biz === "UNKNOWN") biz = "AHN";
      if (biz === "AHN_HP") biz = "AHP";

      const acc = String(
        r["Bank Account Number"] || r["Beneficiary Account No."] || "",
      ).trim();
      if (acc) accToBU[acc] = biz;

      const rawMonthStr = String(
        r["Tháng báo cáo"] || "",
      ).trim();
      const monthStr = extractMonth(rawMonthStr);
      
      // Also check transaction month for Sheet 1 if available
      const transStr = String(r["Tháng phát sinh"] || r["tháng phát sinh"] || r["Thang phat sinh"] || "").trim();
      const psMonth = extractMonth(transStr);

      const month = monthStr || psMonth || defaultMonth;
      
      // Enforce: only allow the selected month (currentPeriod) to appear on the Trial Balance dashboard
      if (month !== currentPeriod) return;

      const key = getBuKey(month, biz);

      if (!buStats[key]) {
        buStats[key] = {
          id: key,
          month,
          reportMonth: month,
          displayMonth: month,
          bu: biz,
          rawThu: 0,
          rawChi: 0,
          thu: 0,
          chi: 0,
          add: 0,
          hold: 0,
          cancel: 0,
          rawAdd: 0,
          rawHold: 0,
          rawCancel: 0,
          bonus: 0,
          rawBonus: 0,
          rawHoldPending: 0,
          ghiChu: "",
          lenh: "",
          confirmed: false,
        };
      }
      buStats[key].rawThu += parseMoneyToNumber(
        r["TOTAL PAYMENT"] ||
          r["Grand Total"] ||
          r["GRAND TOTAL"] ||
          r["Payment Amount"] ||
          0,
      );
      buStats[key].thu = buStats[key].rawThu;
    });

    // Bank Export (bulkRows) is NO LONGER USED to define `chi` (Lương Hold của tháng).
    // Specifically: "lương hold của tháng tại trial balance = cột nghiệp vụ bảng hold ae = HOLD +
    // sheet source chứa tháng báo cáo hiện tại + tháng báo cáo = card chọn tháng chọn = giá trị tại cột +
    // cột total payment mang giá trị âm, không đưa giá trị sheet 1 ae vào cột lương hold"

    holdRows.forEach((r: any) => {
      let biz = String(r["BU"] || r["Business"] || "")
        .trim()
        .toUpperCase();
      if (biz === "AHN_HP") biz = "AHP";
      const acc = String(
        r["Bank Account Number"] || r["Beneficiary Account No."] || "",
      ).trim();
      const l07 = String(r["L07"] || r["Mã AE"] || r["Mã ae"] || "").trim();
      
      const rowMonthRaw = String(r["Tháng báo cáo"] || r["_fileMonth"] || r["Tháng"] || "").trim();
      const rowMonthLabel = extractMonth(rowMonthRaw);

      const transactionMonthStr = String(
        r["Tháng phát sinh"] ||
          r["tháng phát sinh"] ||
          r["Thang phat sinh"] ||
          r["Trạng thái"] ||
          r["Sheet Source"] ||
          r["Tình trạng thanh toán"] ||
          r["Tháng"] ||
          r["_fileMonth"] ||
          r["Tháng báo cáo"] ||
          "",
      );

      const ttttUpper = String(r["Tình trạng thanh toán"] || "").toUpperCase();
      const noteUpper = String(r["Note"] || "").toUpperCase();
      const notesUpper = String(r["Notes"] || "").toUpperCase();

      const groupMonthStr = String(
        r["Tháng báo cáo"] ||
          r["_fileMonth"] ||
          r["Tháng"] ||
          defaultMonth
      );
      const month = extractMonth(groupMonthStr) || defaultMonth; 

      // Enforce: only allow the selected month (currentPeriod) to appear on the Trial Balance dashboard
      if (month !== currentPeriod) {
        return;
      }

      const displayMonth = extractMonth(transactionMonthStr) || month;

      // Skip future arising months, but allow historical and current entries
      if (getMonthNum(displayMonth) > currentPeriodNum) {
        return;
      }
      
      const monthShortStr = `T${currentPeriodMonthNum}`;
      const monthDashStr = `${currentPeriodMonthNum}/${currentPeriodYearNum}`;
      const isMonthInStr = (s: string) => {
        if (!s) return true;
        const up = s.toUpperCase();
        return up.includes(currentPeriod.toUpperCase()) || 
               up.includes(monthShortStr.toUpperCase()) || 
               up.includes(monthDashStr);
      };

      // If no month label at all, and no mention of the current month in status fields, skip.
      if (!rowMonthLabel && rowMonthRaw && !isMonthInStr(rowMonthRaw)) {
        return;
      }

      let command = String(r["Lệnh"] || "")
        .trim()
        .toUpperCase();

      const isPaidStatus =
        ttttUpper.includes("ĐÃ THANH TOÁN") ||
        ttttUpper.includes("THANH TOÁN") ||
        ttttUpper.includes("ĐÒ TT") ||
        ttttUpper.includes("PAID") ||
        ttttUpper.includes("ĐÒ CHI") ||
        noteUpper.includes("ĐÃ THANH TOÁN") ||
        noteUpper.includes("THANH TOÁN") ||
        noteUpper.includes("ĐÒ TT") ||
        noteUpper.includes("PAID") ||
        noteUpper.includes("ĐÒ CHI") ||
        notesUpper.includes("ĐÃ THANH TOÁN") ||
        notesUpper.includes("THANH TOÁN") ||
        notesUpper.includes("ĐÒ TT") ||
        notesUpper.includes("PAID") ||
        notesUpper.includes("ĐÒ CHI") ||
        command === "OK";

      if (isPaidStatus) {
        command = "-";
      }


      if (!biz || biz === "UNKNOWN") {
        if (l07) {
          const resolved =
            resolveL07BuFromAeCode(l07) ||
            getCenterInfoByAECode(l07) ||
            getCenterInfoByL07(l07);
          if (resolved) {
            biz =
              ("bu" in resolved
                ? resolved.bu
                : "bus" in resolved
                  ? resolved.bus
                  : "") || biz;
          }
        }
      }
      if (!biz || biz === "UNKNOWN") biz = accToBU[acc];
      if (!biz || biz === "UNKNOWN")
        biz = extractBU(String(r["Note"] || r["Sheet Source"] || ""));
      if (!biz || biz === "UNKNOWN") biz = "AHN";
      if (biz === "AHN_HP") biz = "AHP";

      const nv = String(r["Nghiệp vụ"] || "").toLowerCase();
      const st = String(r["Trạng thái"] || "").toLowerCase();
      const ss = String(r["Sheet Source"] || "").toLowerCase();

      // If Trạng thái or Nghiệp vụ contains bonus, add directly to the base row's rawThu/thu
      const isBonusRow = nv.includes("bonus") || st.includes("bonus") || ss.includes("bonus");
      if (isBonusRow) {
        const tpRaw = parseMoneyToNumber(
          r["TOTAL PAYMENT"] ||
            r["Grand Total"] ||
            r["GRAND TOTAL"] ||
            r["Payment Amount"] ||
            0,
        );
        const baseKey = getBuKey(month, biz);
        if (!buStats[baseKey]) {
          buStats[baseKey] = {
            id: baseKey,
            month,
            reportMonth: month,
            displayMonth: month,
            bu: biz,
            rawThu: 0,
            rawChi: 0,
            thu: 0,
            chi: 0,
            add: 0,
            hold: 0,
            cancel: 0,
            rawAdd: 0,
            rawHold: 0,
            rawCancel: 0,
            bonus: 0,
            rawBonus: 0,
            rawHoldPending: 0,
            ghiChu: "",
            confirmed: false,
            lenh: "",
          };
        }
        buStats[baseKey].rawThu += tpRaw;
        buStats[baseKey].thu = buStats[baseKey].rawThu;
        return;
      }

      let type = "add";

      // If Trạng thái or Nghiệp vụ contains bonus
      /* bonus merged */
      if (nv.includes("cancel") || st.includes("cancel") || ss.includes("cancel") || ttttUpper.includes("CANCEL")) {
        type = "cancel";
      }
      // Khong dua gia tri sheet 1 ae vao cot luong hold
      else if (ss.includes("sheet 1 ae")) {
        // Not considered hold
        type = "other";
      }
      // If Trạng thái or Nghiệp vụ contains hold but not add
      else if (
        (nv === "hold" || nv.includes("hold") || st.includes("hold") || ss.includes("hold")) &&
        !(nv.includes("add") || st.includes("add") || ss.includes("add"))
      ) {
        type = "hold";
      }

      // Khoản add phải có tháng báo cáo trùng card chọn tháng
      if (type === "add" && month !== currentPeriod) {
        return;
      }

      // Khoản cancel phải có tháng báo cáo trùng card chọn tháng
      if (type === "cancel" && month !== currentPeriod) {
        return;
      }

      const tpRaw = parseMoneyToNumber(
        r["TOTAL PAYMENT"] ||
          r["Grand Total"] ||
          r["GRAND TOTAL"] ||
          r["Payment Amount"] ||
          0,
      );

      const isPastMonth = getMonthNum(displayMonth) < getMonthNum(month);
      // We don't dim past holds if they are processed in the current file month! They are legitimate transactions of the current month.
      const isDimmedHold = false;

      const groupMonth = displayMonth || month;

      // Accumulate ADD/HOLD/CANCEL directly into distinct summary rows separated by displayMonth
      const key = `${groupMonth}_${biz}_${displayMonth}_${type}_${month}`;
      
      // Do not merge hold/add/cancel into base row.
      // If the user wants Bonus merged into the base row, we'll handle it below.
      // For now, keep keys distinct so they are processed properly.
      // const key = `${groupMonth}_${biz}_${displayMonth}_${type}_${month}`; // already set

      const formatAdjustmentMonth = (value: string) => {
        const raw = String(value || "").trim();
        const match = raw.match(/(?:Th[aá]ng\s*)?(\d{1,2})[/-]\s*(\d{4})/i);
        if (!match) return raw;
        const m = parseInt(match[1], 10);
        return `${m < 10 ? "0" + m : m}.${match[2]}`;
      };

      let customMonthDisplay = ``;
      const rawNv = String(r["Nghiệp vụ"] || "").trim();
      const rawThangPhatSinh = String(r["Tháng phát sinh"] || "").trim();

      if (rawNv) {
        const capitalizedNv = rawNv.charAt(0).toUpperCase() + rawNv.slice(1).toLowerCase();
        const finalPhatSinh = rawThangPhatSinh || displayMonth || month;
        customMonthDisplay = `${capitalizedNv} lương tháng ${finalPhatSinh}`;
      } else {
        const stDisplay = String(r["Trạng thái"] || "").trim();
        const stDisplayUpper = stDisplay.toUpperCase();

        if (stDisplayUpper.startsWith("HOLD T") || stDisplayUpper === "HOLD") {
          customMonthDisplay = `Hold lương tháng ${displayMonth}`;
        } else if (stDisplayUpper.startsWith("ADD T") || stDisplayUpper === "ADD") {
          customMonthDisplay = `Add lương tháng ${displayMonth}`;
        } else if (stDisplayUpper.startsWith("CANCEL T") || stDisplayUpper === "CANCEL") {
          customMonthDisplay = `Cancel lương tháng ${displayMonth}`;
        } else if (stDisplay) {
          if (stDisplayUpper.includes("HOLD")) {
            customMonthDisplay = `Hold lương tháng ${displayMonth}`;
          } else if (stDisplayUpper.includes("ADD")) {
            customMonthDisplay = `Add lương tháng ${displayMonth}`;
          } else if (stDisplayUpper.includes("CANCEL")) {
            customMonthDisplay = `Cancel lương tháng ${displayMonth}`;
          } else {
            customMonthDisplay = stDisplay;
          }
        } else if (type === "add") {
          customMonthDisplay = `Add lương tháng ${displayMonth}`;
        } else if (type === "hold") {
          customMonthDisplay = `Hold lương tháng ${displayMonth}`;
        } else if (type === "cancel") {
          customMonthDisplay = `Cancel lương tháng ${displayMonth}`;
        }
      }

      if (type === "hold" || type === "add" || type === "cancel" || false) {
        const label =
          type === "hold" ? "Hold" : type === "add" ? "Add" : "Cancel";
        const descriptionMonth = formatAdjustmentMonth(
          rawThangPhatSinh || displayMonth || month,
        );
        customMonthDisplay = `${label} lương tháng ${descriptionMonth}`;
      }

      if (key === getBuKey(month, biz)) {
        customMonthDisplay = ""; // Base row shouldn't have adjustment labels
      }

      if (!buStats[key]) {
        buStats[key] = {
          id: key,
          month: groupMonth,
          reportMonth: month,
          displayMonth,
          bu: biz,
          rawThu: 0,
          rawChi: 0,
          thu: 0,
          chi: 0,
          add: 0,
          hold: 0,
          cancel: 0,
          rawAdd: 0,
          rawHold: 0,
          rawCancel: 0,
          bonus: 0,
          rawBonus: 0,
          rawHoldPending: 0,
          ghiChu: "",
          confirmed: false,
          lenh: command,
          customMonthDisplay,
          rawOpenHold: 0,
          isPaidStatus,
        };
      } else {
        if (command === "OK" || (command === "-" && buStats[key].lenh !== "OK")) {
          buStats[key].lenh = command;
        }
        if (isPaidStatus) {
          buStats[key].isPaidStatus = true;
        }
      }

      if (isDimmedHold) {
        // We will calculate openHold/open balances chronologically
        buStats[key].rawOpenHold = 0;
      }

      if (type === "cancel") {
        buStats[key].rawCancel += tpRaw;
        if (!buStats[key].ghiChu) {
          buStats[key].ghiChu = "cancel";
        }
      } else if (type === "hold") {
        buStats[key].rawHold += tpRaw;
        const tttt = String(
          r["_originalTinhTrangThanhToan"] !== undefined
            ? r["_originalTinhTrangThanhToan"]
            : r["Tình trạng thanh toán"] || "",
        ).toUpperCase().trim();
        if (tttt.includes("PENDING") || tttt === "") {
           buStats[key].rawHoldPending += tpRaw;
        }
      } else {
        buStats[key].rawAdd += tpRaw;
        if (isPastMonth) {
          buStats[key].ghiChu = "Add hold tháng quá khứ";
        }
      }

      if (r["Notes"] || r["Note"]) {
        const notesText = String(r["Notes"] || r["Note"] || "");
        if (notesText) {
          buStats[key].ghiChu =
            isPastMonth && type === "add"
              ? "Add hold tháng quá khứ"
              : notesText;
        }
      }
    });

    // --- USE STANDARD COMPILED STATS ---
    const testBuStats = { ...buStats };

    Object.values(testBuStats).forEach((s) => {
      if (s.rawCancel !== undefined) s.cancel = s.rawCancel;
      if (s.rawHold !== undefined) s.hold = s.rawHold;
      if (s.rawAdd !== undefined) s.add = s.rawAdd;
      if (s.rawBonus !== undefined) s.bonus = isNaN(s.rawBonus) ? 0 : s.rawBonus;
      if (s.rawOpenHold !== undefined) s.openHold = s.rawOpenHold;
    });

    // Make sure we have currentPeriod slots for all unique BUs so they can receive carried-forward amounts
    const allBUs = new Set(Object.values(testBuStats).map((b) => b.bu));
    allBUs.forEach((biz) => {
      const currentKey = getBuKey(currentPeriod, biz);
      if (!testBuStats[currentKey]) {
        testBuStats[currentKey] = {
          id: currentKey,
          month: currentPeriod,
          reportMonth: currentPeriod,
          displayMonth: currentPeriod,
          bu: biz,
          rawThu: 0,
          rawChi: 0,
          thu: 0,
          chi: 0,
          add: 0,
          hold: 0,
          cancel: 0,
          rawAdd: 0,
          rawHold: 0,
          rawCancel: 0,
          bonus: 0,
          rawBonus: 0,
          rawHoldPending: 0,
          ghiChu: "",
          confirmed: false,
          openHold: 0,
        };
      }
    });

    const baseRows = Object.values(testBuStats);
    const adjustmentRows: typeof baseRows = [];
    const openingHoldRows: typeof baseRows = [];

    const formatOpeningHoldMonth = (value: string) => {
      const raw = String(value || "").trim();
      const match = raw.match(/(?:Th[aá]ng\s*)?(\d{1,2})[/-]\s*(\d{4})/i);
      if (!match) return raw;
      const month = match[1].padStart(2, "0");
      return `${month}.${match[2]}`;
    };

    const openingMovements: Record<string, Record<string, number>> = {};
    Object.values(testBuStats).forEach((s) => {
      const sourceMonth = s.displayMonth || s.month;
      const isPastMonth = getMonthNum(sourceMonth) < getMonthNum(s.month);
      if (isPastMonth) {
        const id = String(s.id).toLowerCase();
        let movement = 0;
        if (id.includes("_hold")) movement = Math.abs(s.rawHold || 0);
        if (id.includes("_add")) movement = -Math.abs(s.rawAdd || 0);
        if (id.includes("_cancel")) movement = -Math.abs(s.rawCancel || 0);
        if (movement !== 0) {
          if (!openingMovements[s.bu]) openingMovements[s.bu] = {};
          openingMovements[s.bu][sourceMonth] =
            (openingMovements[s.bu][sourceMonth] || 0) + movement;
        }
      }
    });

    const savedOpeningByBu = appData.SavedBal_PayrollTrial?.[currentPeriod] || {};
    const finalOpenBal: Record<string, Record<string, number>> = {};

    // Live Transaction history is authoritative whenever it contains a
    // movement for the BU/source month. This prevents an already-saved HOLD
    // from being added twice and lets a later CANCEL reduce it to zero.
    Object.entries(openingMovements).forEach(([bu, months]) => {
      if (!finalOpenBal[bu]) finalOpenBal[bu] = {};
      Object.entries(months).forEach(([sourceMonth, movement]) => {
        const outstandingAmount = Math.max(0, movement);
        if (outstandingAmount >= 1) {
          finalOpenBal[bu][sourceMonth] = outstandingAmount;
        }
      });
    });

    Object.entries(savedOpeningByBu).forEach(([bu, savedData]: [string, any]) => {
      if (!finalOpenBal[bu]) finalOpenBal[bu] = {};
      const openBalByMonth = savedData?.openBalByMonth || {};
      Object.entries(openBalByMonth).forEach(([sourceMonth, amountRaw]) => {
        if (
          Object.prototype.hasOwnProperty.call(
            openingMovements[bu] || {},
            sourceMonth,
          )
        ) {
          return;
        }
        const amount = Math.abs(Number(amountRaw) || 0);
        if (amount > 0) {
          const displayMonth = sourceMonth === "general" ? currentPeriod : sourceMonth;
          finalOpenBal[bu][displayMonth] = Math.max(finalOpenBal[bu][displayMonth] || 0, amount);
        }
      });
    });

    Object.entries(finalOpenBal).forEach(([bu, months]) => {
      Object.entries(months).forEach(([displayMonth, amount]) => {
        if (amount <= 0) return;
        const descriptionMonth = formatOpeningHoldMonth(displayMonth);
        openingHoldRows.push({
          id: `${currentPeriod}_${bu}_opening_hold_${displayMonth}`,
          month: currentPeriod,
          reportMonth: currentPeriod,
          displayMonth,
          bu,
          rawThu: 0,
          rawChi: 0,
          thu: 0,
          chi: 0,
          add: 0,
          hold: 0,
          cancel: 0,
          rawAdd: 0,
          rawHold: 0,
          rawCancel: 0,
          bonus: 0,
          rawBonus: 0,
          rawHoldPending: 0,
          ghiChu: "Hold tháng trong quá khứ",
          confirmed: true,
          customMonthDisplay: `Hold lương tháng ${descriptionMonth}`,
          openHold: amount,
          rawOpenHold: amount,
          _isOpeningHold: true,
          lenh: "OK",
        });
      });
    });

    const uniqueBUs = Array.from(new Set(baseRows.map((e) => e.bu)));
    const uniqueMonths = Array.from(new Set(baseRows.map((e) => e.month))).sort(
      (a, b) => getMonthNum(a) - getMonthNum(b),
    );

    // We process each month chronologically to compute carry-forward and confirmation logic
    uniqueMonths.forEach((m) => {
      uniqueBUs.forEach((bu) => {
        const prevHoldBal = 0; // We no longer auto-carry forward holds, SDĐK handles this via Lưu Dữ Liệu

        // Find standard rows and hold/add/cancel rows in this month for this BU
        const rowsInMonth = baseRows.filter(
          (e) => e.month === m && e.bu === bu,
        );

        // Find specific hold rows
        const holdRows = rowsInMonth.filter((e) =>
          String(e.id).includes("_hold"),
        );

        holdRows.forEach((holdRow) => {
          holdRow.rawOpenHold = prevHoldBal;
          holdRow.openHold = prevHoldBal;

          const isDefaultApproved = holdRow.lenh === "OK" || holdRow.isPaidStatus;
          const isConf =
            isPeriodSaved(holdRow.month) ||
            isPeriodSaved(currentPeriod) ||
            (holdRow.lenh === "-" ? true : (isDefaultApproved ? !confirmedIds.has(holdRow.id) : confirmedIds.has(holdRow.id)));
          if (isConf) {
            // Approved: goes to Lương Hold của tháng (chi) for its own month
            holdRow.add = 0;
            holdRow.hold = 0;
            holdRow.cancel = 0;
            // For both past and current months, items are included in Lương Hold của tháng
            holdRow.chi = (holdRow.lenh === "-" && !holdRow.isPaidStatus) ? 0 : Math.abs(holdRow.rawHold || 0);
            if (holdRow.month !== currentPeriod || getMonthNum(holdRow.displayMonth || "") < getMonthNum(currentPeriod)) {
              holdRow._isPastHoldApprove = true;
            }
            if (holdRow.lenh === "-" && !holdRow.isPaidStatus) holdRow._excludeFromTotals = true;
            holdRow.thu = 0;
          } else {
            // Unapproved: goes/remains in Tạm tính Hold
            holdRow.chi = 0;
            holdRow.thu = 0;
            holdRow.hold = Math.abs(holdRow.rawHold || 0);
          }
        });

        // Process Add and Cancel rows in this month for this BU
        const addRows = rowsInMonth.filter((e) =>
          String(e.id).includes("_add"),
        );
        addRows.forEach((addRow) => {
          const isDefaultApproved = addRow.lenh === "OK" || addRow.isPaidStatus;
          const isConf =
            isPeriodSaved(addRow.month) ||
            isPeriodSaved(currentPeriod) ||
            (addRow.lenh === "-" ? true : (isDefaultApproved ? !confirmedIds.has(addRow.id) : confirmedIds.has(addRow.id)));

          if (addRow.lenh === "-" && !addRow.isPaidStatus) {
            addRow.add = 0;
            addRow.thu = 0;
            addRow.chi = 0;
            addRow._excludeFromTotals = true;
          } else if (isConf) {
            // khi bấm nút trên cột Lệnh từ duyệt thành oke thì số tiền nhảy từ cột tạm tính sang cột Lương TA trong tháng
            addRow.add = 0;
            addRow.thu = Math.abs(addRow.rawAdd);
            addRow.chi = 0;
          } else {
            // Chưa duyệt (nút "Duyệt"): số tiền nằm ở cột Tạm tính ADD
            addRow.add = Math.abs(addRow.rawAdd);
            addRow.thu = 0;
            addRow.chi = 0;
          }
          if (addRow.month !== currentPeriod || getMonthNum(addRow.displayMonth || "") < getMonthNum(currentPeriod)) {
            addRow._isPastHoldApprove = true;
          }
        });

        const cancelRows = rowsInMonth.filter((e) =>
          String(e.id).includes("_cancel"),
        );
        cancelRows.forEach((cancelRow) => {
          const isDefaultApproved = cancelRow.lenh === "OK" || cancelRow.isPaidStatus;
          const isConf =
            isPeriodSaved(cancelRow.month) ||
            isPeriodSaved(currentPeriod) ||
            (cancelRow.lenh === "-" ? true : (isDefaultApproved ? !confirmedIds.has(cancelRow.id) : confirmedIds.has(cancelRow.id)));
          if (isConf) {
            cancelRow.add = 0;
            cancelRow.hold = 0;
            cancelRow.cancel = 0;
            // Never spawn adjustment rows in currentPeriod, always apply locally to the row's defined month
            cancelRow.chi = (cancelRow.lenh === "-" && !cancelRow.isPaidStatus) ? 0 : -Math.abs(cancelRow.rawCancel); // This is intentionally negative to subtract
            cancelRow.thu = 0;
            if (cancelRow.month !== currentPeriod || getMonthNum(cancelRow.displayMonth || "") < getMonthNum(currentPeriod)) {
              cancelRow._isPastHoldApprove = true;
            }
            if (cancelRow.lenh === "-" && !cancelRow.isPaidStatus) cancelRow._excludeFromTotals = true;
          } else {
            cancelRow.thu = 0;
            cancelRow.chi = 0;
            cancelRow.cancel = cancelRow.rawCancel;
          }
        });

        const bonusRows = rowsInMonth.filter((e) =>
          String(e.id).includes("_bonus"),
        );
        bonusRows.forEach((bonusRow) => {
          const isOK = 
            bonusRow.lenh === "OK" || 
            bonusRow.isPaidStatus || 
            isPeriodSaved(bonusRow.month) || 
            isPeriodSaved(currentPeriod);
          
          const rawBonusVal = isNaN(bonusRow.rawBonus) ? 0 : bonusRow.rawBonus;

          if (isOK) {
            // After being moved to OK status, the amount jumps to the salary adjustment column (Thu/Ps trong kỳ)
            bonusRow.add = 0;
            bonusRow.hold = 0;
            bonusRow.cancel = 0;
            bonusRow.bonus = 0;
            bonusRow.thu = Math.abs(rawBonusVal);
            bonusRow.chi = 0;
            if (bonusRow.month !== currentPeriod || getMonthNum(bonusRow.displayMonth || "") < getMonthNum(currentPeriod)) {
              bonusRow._isPastHoldApprove = true;
            }
          } else {
            // When in "Duyệt" status (or any non-OK status), the amount remains in the Tạm tính Bonus column
            bonusRow.thu = 0;
            bonusRow.chi = 0;
            bonusRow.bonus = rawBonusVal;
          }
          
          if (bonusRow.lenh === "-" && !bonusRow.isPaidStatus) {
             bonusRow._excludeFromTotals = true;
             bonusRow.bonus = 0;
          }
        });
      });
    });

    let processedResult = [...baseRows, ...openingHoldRows, ...adjustmentRows].filter(r => {
      // If it's an adjustment row (hold, add, or cancel) from a past month imported in the current period,
      // and NOT explicitly approved ("OK"), filter it out entirely to avoid showing up in the current month or affecting SĐCK.
      const isPastMonth = r.displayMonth && getMonthNum(r.displayMonth) < getMonthNum(currentPeriod);
      const isAdjustment = String(r.id).includes("_hold") || String(r.id).includes("_add") || String(r.id).includes("_cancel") ;
      const isHoldOrCancel = String(r.id).includes("_hold") || String(r.id).includes("_cancel") ;
      
      if (isAdjustment && isPastMonth && r.reportMonth === currentPeriod && r.lenh !== "OK" && !r.isPaidStatus && !isHoldOrCancel) {
        return false;
      }

      if (r._excludeFromTotals) {
        const repNum = getMonthNum(r.reportMonth || r.month || "");
        const dNum = getMonthNum(r.displayMonth || r.month || "");
        if (repNum > currentPeriodNum && dNum > currentPeriodNum) return false;
      }
      return true;
    });

    // Snapshot substitution & Frozen approval logic
    const savedPeriods = appData.SavedPeriods_HoldAdd || {};
    const savedRowsMap = appData.SavedRows_HoldAdd || {};
    const savedRowsMeta = appData.SavedRows_HoldAdd_Meta || {};
    const transactionVersions = appData.TrialBalanceTransactionVersions || {};
    const finalRows: typeof processedResult = [];

    // Group the raw computed result rows by reporting month to align snapshot and live data
    const resultMap = new Map<string, typeof processedResult>();
    processedResult.forEach((r) => {
      const repM = r.reportMonth || r.month;
      if (!resultMap.has(repM)) {
        resultMap.set(repM, []);
      }
      resultMap.get(repM)!.push(r);
    });

    const allMonths = new Set([
      ...resultMap.keys(),
      ...Object.keys(savedRowsMap),
    ]);

    allMonths.forEach((m) => {
      const isSaved = !!savedPeriods[m];
      const live = resultMap.get(m) || [];
      const snapshotVersion = savedRowsMeta[m]?.transactionVersion || 0;
      const requiredTransactionVersion = transactionVersions[m] || 0;
      const snapshotIsCurrent =
        snapshotVersion >= requiredTransactionVersion;

      if (isSaved && savedRowsMap[m] && snapshotIsCurrent) {
        const snap = savedRowsMap[m];

        // Return exactly the state of Hold, Add, Cancel from the snapshot
        const snapHoldAdd = snap.filter(
          (r: any) =>
            String(r.id).includes("_hold") ||
            String(r.id).includes("_add") ||
            String(r.id).includes("_cancel") ||
            r.customMonthDisplay,
        );
        const snapIds = new Set(snapHoldAdd.map((r: any) => r.id));
        const liveOpeningHold = live.filter(
          (r) => r._isOpeningHold && !snapIds.has(r.id),
        );

        // Keep live data for standard rows (Lương Ta) so it updates if they upload new main files
        let liveStandard = live.filter(
          (r) =>
            !String(r.id).includes("_hold") &&
            !String(r.id).includes("_add") &&
            !String(r.id).includes("_cancel") &&
            !r.customMonthDisplay,
        );

        if (liveStandard.length === 0) {
          liveStandard = snap.filter(
            (r: any) =>
              !String(r.id).includes("_hold") &&
              !String(r.id).includes("_add") &&
              !String(r.id).includes("_cancel") &&
              !r.customMonthDisplay,
          );
        }

        finalRows.push(...snapHoldAdd, ...liveOpeningHold, ...liveStandard);
      } else {
        finalRows.push(...live);
      }
    });

    // CANCEL is a movement of one report period, not a carried balance item.
    // Snapshots from older periods may still be needed for HOLD opening balances,
    // but their CANCEL rows must never reappear in the next sidebar period.
    processedResult = finalRows.filter((row) => {
      const isCancel = String(row.id).toLowerCase().includes("_cancel");
      return !isCancel || isExactReportPeriod(row, currentPeriod);
    });

    return processedResult.sort((a, b) => {
      const mA = a.reportMonth === currentPeriod ? 99999999 : getMonthNum(a.month);
      const mB = b.reportMonth === currentPeriod ? 99999999 : getMonthNum(b.month);
      if (mA !== mB) return mB - mA; // newest first

      if (a.bu !== b.bu) return a.bu.localeCompare(b.bu); // Group by BU

      const dMa = getMonthNum(a.displayMonth || a.month);
      const dMb = getMonthNum(b.displayMonth || b.month);
      if (dMa !== dMb) return dMa - dMb; // source month A -> B

      const typeWeight = (id: string) => {
        const sid = String(id);
        if (!sid.includes("_hold") && !sid.includes("_add") && !sid.includes("_cancel") && !sid.includes("_past_")) return 0;
        if (sid.includes("_hold")) return 1;
        if (sid.includes("_add")) return 2;
        if (sid.includes("_cancel")) return 3;
        return 4;
      };

      const wA = typeWeight(String(a.id));
      const wB = typeWeight(String(b.id));
      if (wA !== wB) return wA - wB; // standard -> hold -> add -> cancel

      return 0;
    });
  }, [
    appData.Sheet1_AE?.data,
    appData.Hold_AE?.data,
    appData.SavedBal_PayrollTrial,
    appData.SavedPeriods_HoldAdd,
    appData.SavedRows_HoldAdd,
    appData.SavedRows_HoldAdd_Meta,
    appData.TrialBalanceTransactionVersions,
    currentPeriod,
    confirmedIds,
    currentPeriodNum,
    getMonthNum,
    extractMonth,
    isPeriodSaved,
    currentPeriodMonthNum,
    currentPeriodYearNum,
  ]);

  const toggleConfirm = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentSet = new Set<string>(appData.ConfirmedIds_HoldAdd || []);
    if (currentSet.has(id)) {
      currentSet.delete(id);
    } else {
      currentSet.add(id);
    }
    updateAppData((prevAppData: any) => ({
      ...prevAppData,
      ConfirmedIds_HoldAdd: Array.from(currentSet),
    }));
  };

  const handleSaveBalances = () => {
    updateAppData((prev: any) => {
      const nextMonthStr = getNextMonthStr(currentPeriod);
      // Giữ lại state cũ
      const nextSavedAll = prev.SavedBal_PayrollTrial
        ? JSON.parse(JSON.stringify(prev.SavedBal_PayrollTrial))
        : {};

      const currentRows = data.filter((d) => d.reportMonth === currentPeriod);
      const buMap: Record<
        string,
        {
          thu: number;
          chi: number;
          chiForSDCK: number;
          hold: number;
          openHold: number;
          add: number;
          cancel: number;
        }
      > = {};
      currentRows.forEach((r) => {
        if (!buMap[r.bu]) {
          buMap[r.bu] = {
            thu: 0,
            chi: 0,
            chiForSDCK: 0,
            hold: 0,
            openHold: 0,
            add: 0,
            cancel: 0,
          };
        }
        const isHold = String(r.id).includes("_hold");
        const isPastHold = isHold && getMonthNum(r.displayMonth || r.month) < getMonthNum(currentPeriod);
        const isCancel = String(r.id).includes("_cancel");
        buMap[r.bu].thu += !r._excludeFromTotals ? r.thu : 0;
        buMap[r.bu].chi += !r._excludeFromTotals ? r.chi : 0;
        let rowChiForSDCK = !r._excludeFromTotals && !isPastHold && !isCancel ? r.chi : 0;
        if (isHold && !isPastHold) {
          rowChiForSDCK = Math.abs(r.rawHoldPending || r.chi || r.hold || 0);
        }
        buMap[r.bu].chiForSDCK += rowChiForSDCK;
        buMap[r.bu].hold += !r._excludeFromTotals ? r.hold : 0;
        buMap[r.bu].openHold += !r._excludeFromTotals ? r.openHold || 0 : 0;
        buMap[r.bu].add += !r._excludeFromTotals ? r.add : 0;
        buMap[r.bu].cancel += !r._excludeFromTotals ? r.cancel : 0;
      });

      // Tạo object lưu trữ cho tháng N+1
      const nextMonthData: Record<string, any> =
        nextSavedAll[nextMonthStr] || {};

      Object.keys(buMap).forEach((bu) => {
        const openingBalByMonth = buBalancesByMonth[currentPeriod]?.[bu]?.openBalByMonth || {};
        const nextOpenBalByMonth: Record<string, number> = { ...openingBalByMonth };

        const rowsForBu = currentRows.filter(r => r.bu === bu);

        rowsForBu.forEach((r) => {
          const isHold = String(r.id).includes("_hold");
          const isAdd = String(r.id).includes("_add");
          const isCancel = String(r.id).includes("_cancel");
          const dMonth = r.displayMonth || r.month;

          if (isHold) {
            const amt = !r._excludeFromTotals ? r.chi + r.hold : 0;
            if (amt > 0) {
              nextOpenBalByMonth[dMonth] = (nextOpenBalByMonth[dMonth] || 0) + amt;
            }
          } else if (isAdd || isCancel) {
            const releasedAmount = isCancel
              ? Math.abs(r.rawCancel || r.cancel || r.chi || 0)
              : Math.abs(r.rawAdd || r.add || r.thu || 0);
            if (releasedAmount > 0) {
              const remaining = Math.max(
                0,
                (nextOpenBalByMonth[dMonth] || 0) - releasedAmount,
              );
              if (remaining < 1) delete nextOpenBalByMonth[dMonth];
              else nextOpenBalByMonth[dMonth] = remaining;
            }
          }
        });

        const totalHoldToTransfer = Object.values(nextOpenBalByMonth).reduce((s, v) => s + v, 0);

        nextMonthData[bu] = {
          openBal: totalHoldToTransfer,
          openBalByMonth: nextOpenBalByMonth,
          holdAmt: totalHoldToTransfer,
        };

        // Self-sanity check: Clear faulty legacy own-month carryover in the underlying saved states
        if (nextSavedAll[currentPeriod] && nextSavedAll[currentPeriod][bu]) {
          const currentSavedOpenBal =
            nextSavedAll[currentPeriod][bu].openBal || 0;
          if (
            Math.round(currentSavedOpenBal) === Math.round(totalHoldToTransfer)
          ) {
            delete nextSavedAll[currentPeriod][bu];
            if (Object.keys(nextSavedAll[currentPeriod]).length === 0) {
              delete nextSavedAll[currentPeriod];
            }
          }
        }
      });

      nextSavedAll[nextMonthStr] = nextMonthData;

      const nextSavedPeriods = prev.SavedPeriods_HoldAdd
        ? JSON.parse(JSON.stringify(prev.SavedPeriods_HoldAdd))
        : {};
      nextSavedPeriods[currentPeriod] = true;

      // Snapshot formulation for currentPeriod
      // Just save rows as they are currently rendered!
      const snapshotRows = currentRows.map((r) => {
        return { ...r };
      });

      const nextSavedRows = prev.SavedRows_HoldAdd
        ? JSON.parse(JSON.stringify(prev.SavedRows_HoldAdd))
        : {};
      nextSavedRows[currentPeriod] = snapshotRows;

      const nextSavedRowsMeta = prev.SavedRows_HoldAdd_Meta
        ? JSON.parse(JSON.stringify(prev.SavedRows_HoldAdd_Meta))
        : {};
      nextSavedRowsMeta[currentPeriod] = {
        transactionVersion:
          prev.TrialBalanceTransactionVersions?.[currentPeriod] || 0,
        savedAt: new Date().toISOString(),
      };

      return {
        ...prev,
        SavedBal_PayrollTrial: nextSavedAll,
        SavedPeriods_HoldAdd: nextSavedPeriods,
        SavedRows_HoldAdd: nextSavedRows,
        SavedRows_HoldAdd_Meta: nextSavedRowsMeta,
      };
    });
    toast.success("Đã lưu dữ liệu: Chuyển Lương sang SDĐK kỳ sau!");
  };

  // Group by Report Month - Show ALL rows grouped by their reportMonth
  const grouped = useMemo(() => {
    const map = new Map<string, BuRow[]>();
    for (const row of data) {
      // Use reportMonth if set, otherwise use current period
      const rowReportMonth = row.reportMonth || currentPeriod;
      
      if (rowReportMonth) {
        if (!map.has(rowReportMonth)) map.set(rowReportMonth, []);
        map.get(rowReportMonth)!.push(row);
      }
    }
    return map;
  }, [data, currentPeriod]);
  const monthKeys = useMemo(() => {
    return [...grouped.keys()].sort((a, b) => getMonthNum(b) - getMonthNum(a));
  }, [grouped, getMonthNum]);

  const allOpen =
    monthKeys.length > 0 && monthKeys.every((k) => expanded.has(k));
  const toggleAll = () => setExpanded(allOpen ? new Set() : new Set(monthKeys));
  const toggle = (mk: string) =>
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(mk)) {
        s.delete(mk);
      } else {
        s.add(mk);
      }
      return s;
    });

  const buBalancesByMonth = useMemo(() => {
    const balances: Record<
      string,
      Record<string, { openBal: number; openBalByMonth: Record<string, number>; closeBal: number }>
    > = {};

    const allMonths = [...grouped.keys()]
      .sort((a, b) => getMonthNum(a) - getMonthNum(b));
    
    allMonths.forEach((mk) => {
      balances[mk] = {};
      const rows = grouped.get(mk) || [];
      const uniqueBUsInGroup = Array.from(new Set(rows.map((e) => e.bu)));
      const sortedIdx = allMonths.indexOf(mk);

      uniqueBUsInGroup.forEach((bu) => {
        const savedData = appData.SavedBal_PayrollTrial?.[mk]?.[bu];
        const savedVal = savedData?.openBal || 0;
        const savedOpenBalByMonth = savedData?.openBalByMonth;

        let openBal = 0;
        let openBalByMonth: Record<string, number> = {};

        if (savedVal !== 0) {
          openBal = Math.abs(savedVal);
          if (savedOpenBalByMonth) {
            openBalByMonth = { ...savedOpenBalByMonth };
          } else {
            openBalByMonth = { "general": openBal };
          }
        } else if (sortedIdx > 0) {
          const prevMk = allMonths[sortedIdx - 1];
          const prevBalInfo = balances[prevMk]?.[bu];
          
          if (prevBalInfo) {
            openBalByMonth = { ...(prevBalInfo.openBalByMonth || {}) };
            const prevRows = grouped.get(prevMk) || [];
            const prevRowsForBu = prevRows.filter((r) => r.bu === bu);
            
            prevRowsForBu.forEach((r) => {
              const isHold = String(r.id).includes("_hold");
              const dMonth = r.displayMonth || r.month;

              if (isHold) {
                const amt = !r._excludeFromTotals ? r.chi + r.hold : 0;
                if (amt > 0) {
                  openBalByMonth[dMonth] = (openBalByMonth[dMonth] || 0) + amt;
                }
              }
            });

            openBal = Object.values(openBalByMonth).reduce((s, v) => s + v, 0);
          }
        }

        const rowsForBu = rows.filter((r) => r.bu === bu);
        const buThu = rowsForBu.reduce((s, r) => s + r.thu, 0);
        const buChiForSDCK = rowsForBu.reduce(
          (s, r) => {
            const isHold = String(r.id).includes("_hold");
            const isCancel = String(r.id).includes("_cancel");
            
            if (isCancel) return s;
            
            // Regular rows (not hold/add/cancel)
            if (!isHold) {
              return s + (!r._excludeFromTotals ? r.chi : 0);
            }
            
            // For HOLD: only subtract from SDCK if reportMonth = displayMonth
            // Normalize both for comparison (remove extra spaces, zero-pad months)
            const normalizeMonth = (str: string | undefined) => {
              if (!str) return "";
              // Remove spaces, convert to lowercase
              const cleaned = str.replace(/\s+/g, "").toLowerCase();
              // Normalize "tháng2" or "tháng02" to "tháng2"
              return cleaned.replace(/tháng0?(\d+)/i, "tháng$1");
            };
            const normReportMonth = normalizeMonth(r.reportMonth);
            const normDisplayMonth = normalizeMonth(r.displayMonth || r.month);
            
            if (isHold && normReportMonth === normDisplayMonth) {
              return s + Math.abs(r.rawHoldPending || r.chi || r.hold || 0);
            }
            
            return s;
          },
          0,
        );

        const closeBal = buThu - buChiForSDCK;

        balances[mk][bu] = { openBal, openBalByMonth, closeBal };
      });
    });

    return balances;
  }, [grouped, appData.SavedBal_PayrollTrial, getMonthNum]);

  const computedMonthTotals = useMemo(() => {
    const totals: Record<
      string,
      {
        openBal: number;
        psThu: number;
        psChi: number;
        closeBal: number;
        addAmt: number;
        holdAmt: number;
        cancelAmt: number;
        bonusAmt: number;
      }
    > = {};

    monthKeys.forEach((mk) => {
      const rows = grouped.get(mk) || [];
      const uniqueBUsInGroup = Array.from(new Set(rows.map((e) => e.bu)));

      let openBal = 0;
      uniqueBUsInGroup.forEach((bu) => {
        openBal += buBalancesByMonth[mk]?.[bu]?.openBal || 0;
      });

      // Only sum rows that belong to this period month
      const rowsThisMonth = rows.filter((row) =>
        isExactReportPeriod(row, mk),
      );

      const psThu = rowsThisMonth
        .filter(
          (e) =>
            !e.id.includes("_hold") &&
            !e.id.includes("_cancel") &&
            !e.id.includes("_past_"),
        )
        .reduce((s, e) => s + e.thu, 0);
      const psChi = rowsThisMonth.reduce((s, e) => {
        const isCancel = String(e.id).includes("_cancel");
        return s + (!isCancel ? e.chi : 0);
      }, 0);

      const psChiForSDCK = rowsThisMonth.reduce(
        (s, e) => {
          const isHold = String(e.id).includes("_hold");
          const isCancel = String(e.id).includes("_cancel");
          
          if (isCancel) {
            return s;
          }
          
          // Regular rows (not hold/add/cancel)
          if (!isHold) {
            return s + (!e._excludeFromTotals ? e.chi : 0);
          }
          
          // For HOLD: only subtract from SDCK if reportMonth = displayMonth
          // Normalize both for comparison (remove extra spaces, zero-pad months)
          const normalizeMonth = (str: string | undefined) => {
            if (!str) return "";
            // Remove spaces, convert to lowercase
            const cleaned = str.replace(/\s+/g, "").toLowerCase();
            // Normalize "tháng2" or "tháng02" to "tháng2"
            return cleaned.replace(/tháng0?(\d+)/i, "tháng$1");
          };
          const normReportMonth = normalizeMonth(e.reportMonth);
          const normDisplayMonth = normalizeMonth(e.displayMonth || e.month);
          
          if (isHold && normReportMonth === normDisplayMonth) {
            return s + Math.abs(e.rawHoldPending || e.chi || e.hold || 0);
          }
          
          return s;
        },
        0,
      );

      const closeBal = psThu - psChiForSDCK;

      const addAmt = rowsThisMonth
        .reduce((s, e) => s + Math.abs(e.add), 0);
      const holdAmt = rowsThisMonth
        .reduce((s, e) => s + Math.abs(e.hold), 0);
      const cancelAmt = rowsThisMonth
        .filter((row) => isExactReportPeriod(row, mk))
        .reduce((s, e) => s + Math.abs(e.cancel), 0);
      const bonusAmt = rowsThisMonth
        .reduce((s, e) => s + Math.abs(isNaN(e.bonus) ? 0 : e.bonus), 0);

      totals[mk] = {
        openBal: Math.abs(openBal),
        psThu,
        psChi,
        closeBal,
        addAmt,
        holdAmt,
        cancelAmt,
        bonusAmt,
      };
    });

    return totals;
  }, [grouped, monthKeys, buBalancesByMonth]);

  const {
    grandOpenBal,
    grandThu,
    grandChi,
    grandAdd,
    grandHold,
    grandCancel,
    grandBal,
    filteredData,
    rowRCloseBalances,
  } = useMemo(() => {
    let open = 0;
    let thu = 0;
    let chi = 0;
    let add = 0;
    let hold = 0;
    let cancel = 0;

    monthKeys.forEach((mk) => {
      const t = computedMonthTotals[mk];
      if (t) {
        open += t.openBal;
        thu += t.psThu;
        chi += t.psChi;
        add += t.addAmt;
        hold += t.holdAmt;
        cancel += t.cancelAmt;
      }
    });

    const rowRCloseBalances: Record<string, number> = {};
    let lastRowRClose = 0;
    monthKeys.forEach((mk) => {
      const rows = grouped.get(mk) || [];
      let runningClose = 0;

      rows.forEach((e) => {
        const isHold = String(e.id).includes("_hold");
        const isCancel = String(e.id).includes("_cancel");
        const isPastHold = isHold && getMonthNum(e.displayMonth || e.month) < getMonthNum(currentPeriod);

        if (e._isOpeningHold) {
          rowRCloseBalances[e.id] = 0;
          return;
        }

        const displayedThu = e.thu;
        let chiForRClose = !e._excludeFromTotals && !isPastHold && !isCancel ? e.chi : 0;

        const normalizeMonth = (str: string | undefined) => {
          if (!str) return "";
          const cleaned = str.replace(/\s+/g, "").toLowerCase();
          return cleaned.replace(/tháng0?(\d+)/i, "tháng$1");
        };
        const normReportMonth = normalizeMonth(e.reportMonth);
        const normDisplayMonth = normalizeMonth(e.displayMonth || e.month);
        const holdReportEqualsOccurrence = isHold && normReportMonth === normDisplayMonth;

        if (isHold) {
          chiForRClose = holdReportEqualsOccurrence
            ? Math.abs(e.rawHoldPending || e.chi || e.hold || 0)
            : 0;
        }

        if (!isPastHold || (isCancel && !e._excludeFromTotals) || holdReportEqualsOccurrence) {
          runningClose += displayedThu - chiForRClose;
          rowRCloseBalances[e.id] = runningClose;
        } else {
          rowRCloseBalances[e.id] = runningClose;
        }
        lastRowRClose = runningClose;
      });
    });

    const filtered = data.filter((r) => !r._excludeFromTotals);

    return {
      grandOpenBal: open,
      grandThu: thu,
      grandChi: chi,
      grandAdd: add,
      grandHold: hold,
      grandCancel: cancel,
      grandBal: lastRowRClose,
      filteredData: filtered,
      rowRCloseBalances,
    };
  }, [monthKeys, computedMonthTotals, data, grouped, getMonthNum, currentPeriod]);

  const normalizeMonthLabel = useCallback(
    (value?: string) => {
      if (!value) return "";
      const extracted = extractMonth(value);
      if (extracted) return extracted;
      return String(value).trim();
    },
    [extractMonth],
  );

  const isCurrentPeriodRow = useCallback(
    (row: any) => {
      const reportMonth = row?.reportMonth || row?.month;
      return (
        normalizeMonthLabel(String(reportMonth || "")) === currentPeriod
      );
    },
    [currentPeriod, normalizeMonthLabel],
  );

  const currentPeriodRows = useMemo(() => {
    return data.filter(isCurrentPeriodRow);
  }, [data, isCurrentPeriodRow]);

  const countBusinesses = useCallback((rows: BuRow[]) => {
    return new Set(
      rows
        .filter((row) => !row._excludeFromTotals && row.bu)
        .map((row) => row.bu),
    ).size;
  }, []);

  const grandAddPillValue = useMemo(() => {
    return currentPeriodRows
      .filter((e) => {
        const idLower = String(e.id).toLowerCase();
        const display = String(
          e.customMonthDisplay || e.month || "",
        ).toUpperCase();
        return (
          idLower.includes("_add") ||
          idLower.includes("add") ||
          display.includes("ADD")
        );
      })
      .reduce((s, e) => s + e.thu + (e.add || 0), 0);
  }, [currentPeriodRows]);

  const chiPhiLuongTaPillValue = useMemo(() => {
    return currentPeriodRows
      .filter(
        (e) =>
          !e.id.includes("_hold") &&
          !e.id.includes("_add") &&
          !e.id.includes("_cancel") &&
          !e.id.includes("_past_"),
      )
      .reduce((s, e) => s + e.thu, 0);
  }, [currentPeriodRows]);

  const holdPillValue = useMemo(() => {
    return currentPeriodRows
      .filter((e) => {
        const idLower = String(e.id).toLowerCase();
        const display = String(
          e.customMonthDisplay || e.month || "",
        ).toUpperCase();
        return (
          idLower.includes("_hold") ||
          idLower.includes("hold") ||
          display.includes("HOLD")
        );
      })
      .reduce((s, e) => s + e.chi + (e.hold || 0), 0);
  }, [currentPeriodRows]);

  const cancelPillValue = useMemo(() => {
    return currentPeriodRows
      .filter((e) => {
        const idLower = String(e.id).toLowerCase();
        const display = String(
          e.customMonthDisplay || e.month || "",
        ).toUpperCase();
        return (
          idLower.includes("_cancel") ||
          idLower.includes("cancel") ||
          display.includes("CANCEL")
        );
      })
      .reduce((s, e) => s + Math.abs(e.chi) + (e.cancel || 0), 0);
  }, [currentPeriodRows]);

  const handleExportExcel = useCallback(() => {
    if (!data || data.length === 0) {
      return;
    }

    const exportRows = data.map((row: any, idx: number) => ({
      "STT": idx + 1,
      "Tháng": row.month || "",
      "Business": row.bu || "",
      "Số dư đầu kỳ": row.open_bal || 0,
      "Lương TA trong tháng": row.thu || 0,
      "Lương Hold trong tháng": row.chi || 0,
      "Số dư cuối kỳ": row.close_bal || 0,
      "Số tiền Add": row.add || 0,
      "Số tiền Hold": row.hold || 0,
      "Số tiền Cancel": row.cancel || 0,
      "Lệnh": row.command || "",
      "Ghi chú": row.note || "",
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Trial Balance");
    XLSX.writeFile(wb, `Trial_Balance_${new Date().toISOString().split("T")[0]}.xlsx`);
  }, [data]);

  return (
    <div className="trial-balance-frame unified-table-frame h-full flex-1 flex flex-col min-h-0 overflow-hidden bg-transparent w-full" style={{ borderRadius: "0px" }}>
      {/* Toolbar */}
      <div
        className="trial-balance-header unified-table-frame-header flex-shrink-0 bg-transparent py-0 flex items-center justify-between"
        style={{ height: "62.9735px", minHeight: "62.9735px", paddingTop: "0px", paddingBottom: "0px", paddingLeft: "12px", paddingRight: "12px", borderRadius: "0px" }}
      >
        <div className="trial-balance-header-content w-full flex items-center justify-between flex-wrap gap-3 py-2 h-full" style={{ borderRadius: "0px" }}>
          {/* Summary Pills on Top Header Bar (Replacing Payroll Hub title & icon) */}
          <div id="trial-balance-summary" className="flex items-center gap-2 flex-wrap" style={{ borderRadius: "0px", minHeight: "38px" }}>
            <span className="text-[12px] font-black tracking-widest uppercase text-[#600032] dark:text-rose-300 font-sans mr-1 inline-flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-primary shrink-0" />
              TRIAL BALANCE
            </span>
            <span className="text-[11px] bg-transparent border-0 rounded-none px-1.5 py-0.5 text-foreground flex items-center gap-1.5 shadow-none">
              <span className="text-muted-foreground font-bold uppercase tracking-wider text-[9px] font-sans">
                CHI PHÍ LƯƠNG TA
              </span>
              <span
                className="font-sans font-bold text-[#4e1c2d] text-[11px]"
                style={{ lineHeight: "14px" }}
              >
                {fmt(chiPhiLuongTaPillValue)}
              </span>
            </span>
            <span className="text-[11px] bg-transparent border-0 rounded-none px-1.5 py-0.5 text-foreground flex items-center gap-1.5 shadow-none">
              <span className="text-muted-foreground font-bold uppercase tracking-wider text-[9px] font-sans">HOLD</span>
              <span className="font-sans font-bold text-rose-600 text-[11px]">
                {fmt(holdPillValue)}
              </span>
            </span>
            <span className="text-[11px] bg-transparent border-0 rounded-none px-1.5 py-0.5 text-foreground flex items-center gap-1.5 shadow-none">
              <span className="text-muted-foreground font-bold uppercase tracking-wider text-[9px] font-sans">Add</span>
              <span
                className="font-sans font-bold text-[#68182e] text-[11px]"
              >
                {fmt(grandAddPillValue)}
              </span>
            </span>
            <span className="text-[11px] bg-transparent border-0 rounded-none px-1.5 py-0.5 text-foreground flex items-center gap-1.5 shadow-none">
              <span className="text-muted-foreground font-bold uppercase tracking-wider text-[9px] font-sans">Cancel</span>
              <span
                className="font-sans font-bold text-[#e65100] text-[11px]"
              >
                {fmt(cancelPillValue)}
              </span>
            </span>

            {!isOkToDisplayValues && (
              <div className="group relative mt-0 ml-1">
                <button
                  onClick={() => {
                    localStorage.setItem("master_ae_active_tab", "Hold_AE");
                    navigate("/master-ae");
                  }}
                  className="flex items-center justify-center w-6 h-6 rounded-full bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-colors shadow-xs cursor-pointer text-[12px]"
                >
                  ⚠️
                </button>
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 w-72 p-3 bg-white border border-rose-200 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                  <p className="text-xs text-rose-800" style={{ lineHeight: "1.4" }}>
                    {!isMonthMatched
                      ? `Tháng được chọn trên sidebar (${selectedMonth}) chưa trùng khớp với bất kỳ dòng THÁNG nào của file AE tải lên (${fileMonths.join(", ") || "Chưa tải file"}).`
                      : `Sự chênh lệch tài chính giữa (Sheet 1 + Hoạt động Hold AE) & Bank North AE khác 0 (Chênh lệch hiện tại: ${fmt(bulkPaymentDiff)}).`}
                  </p>
                </div>
              </div>
            )}
          </div>
          {/* Controls */}
          <div className="flex gap-2 items-center flex-wrap">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="p-0 bg-white dark:bg-card border border-[#e7dbdc] text-foreground hover:bg-muted/50 cursor-pointer shadow-xs rounded-[18px]"
                  style={{ width: "32px", height: "32px" }}
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-[240px] bg-white dark:bg-card border-[#e7dbdc] shadow-xl p-2 flex flex-col gap-2"
              >
                <div className="h-8 flex items-center justify-center px-4 bg-primary/10 text-primary rounded-md font-nunito font-bold tracking-wider text-[11px]">
                  Kỳ: {currentPeriod}
                </div>
                
                {/* Save and Delete action buttons inside Settings dropdown */}
                <Button
                  size="sm"
                  onClick={handleSaveBalances}
                  disabled={isPeriodSaved(currentPeriod)}
                  className="h-8 text-[12px] w-full justify-start gap-2 rounded-md font-bold shadow-xs border disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                  style={{
                    backgroundColor: isPeriodSaved(currentPeriod) ? "#9ca3af" : "#b183ad",
                    color: "#ffffff",
                    borderColor: "#e8eae9",
                  }}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {isPeriodSaved(currentPeriod) ? "Đã Lưu Dữ Liệu" : "Lưu Dữ Liệu"}
                </Button>
                {isPeriodSaved(currentPeriod) && (
                  <Button
                    size="sm"
                    onClick={handleDeleteSavedPeriod}
                    className="h-8 text-[12px] w-full justify-start gap-2 rounded-md font-bold shadow-xs bg-rose-600 hover:bg-rose-700 text-white border border-rose-500 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Xóa Dữ Liệu
                  </Button>
                )}

                <Select value={yearFilter} onValueChange={setYearFilter}>
                  <SelectTrigger className="h-8 text-[12px] w-full bg-background border-[#e7dbdc] text-foreground rounded-md">
                    <SelectValue placeholder="Năm" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-card border border-[#e7dbdc]">
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="2026">2026</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => window.dispatchEvent(new Event("open-ui-settings"))}
                  variant="outline"
                  size="sm"
                  className="h-8 text-[12px] w-full justify-start gap-2 bg-background border-[#e7dbdc] text-foreground hover:bg-muted cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-500" />
                  Cài đặt Giao diện
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportExcel}
                  className="h-8 text-[12px] w-full justify-start gap-2 bg-background border-[#e7dbdc] text-foreground hover:bg-muted cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Xuất Excel
                </Button>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      <div
        id="trial-balance-table-body"
        className="table-body-region flex-1 min-h-0 overflow-auto custom-scrollbar border-0 shadow-none"
        style={{ borderRadius: "0px" }}
      >
          <table
            className="trial-balance-table w-full border-separate border-spacing-0 table-auto bg-white dark:bg-card"
            style={{
              fontFamily: uiSettings.tableFont || "var(--font-main)",
              fontSize: uiSettings.fontSize || "13px",
            }}
          >
            <thead className="sticky top-0 z-20 shadow-sm border-b-2 border-[#e7dbdc] dark:border-slate-700 bg-[#F4F2EE] dark:bg-slate-900">
              <tr>
                <th
                  className="border-r border-b border-[#e7dbdc] dark:border-slate-800 px-3 py-2.5 text-center font-sans font-bold text-[12px] uppercase tracking-wider text-slate-800 dark:text-slate-200 bg-[#F4F2EE] dark:bg-slate-900 whitespace-nowrap"
                  rowSpan={2}
                >
                  <div className="flex items-center justify-center gap-2 w-full">
                    <span>#</span>
                    <button
                      onClick={toggleAll}
                      title={allOpen ? "Thu gọn tất cả" : "Mở tất cả"}
                      className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 opacity-80 hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                    >
                      {allOpen ? (
                        <ChevronsDownUp className="w-4 h-4" />
                      ) : (
                        <ChevronsUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </th>
                <th
                  className="border-r border-b border-[#e7dbdc] dark:border-slate-800 px-3 py-2.5 text-center font-sans font-bold text-[12px] uppercase tracking-wider text-slate-800 dark:text-slate-200 bg-[#F4F2EE] dark:bg-slate-900 whitespace-nowrap"
                  rowSpan={2}
                >
                  Ngày / Tháng
                </th>
                <th
                  className="border-r border-b border-[#e7dbdc] dark:border-slate-800 px-4 py-2.5 text-center font-sans font-bold text-[12px] uppercase tracking-wider text-slate-800 dark:text-slate-200 bg-[#F4F2EE] dark:bg-slate-900 min-w-[200px]"
                  rowSpan={2}
                >
                  Business
                </th>
                <th
                  className="border-r border-b border-[#e7dbdc] dark:border-slate-800 px-3 py-2.5 text-center font-sans font-bold text-[12px] uppercase tracking-wider text-slate-800 dark:text-slate-200 bg-[#F4F2EE] dark:bg-slate-900 whitespace-nowrap min-w-[100px]"
                  rowSpan={2}
                >
                  Số dư ĐK
                </th>
                <th
                  className="border-r border-b border-[#e7dbdc] dark:border-slate-800 px-3 py-2.5 text-center font-sans font-bold text-[12px] uppercase tracking-wider text-slate-800 dark:text-slate-200 bg-[#F4F2EE] dark:bg-slate-900 whitespace-nowrap"
                  colSpan={2}
                >
                  Phát sinh trong kỳ
                </th>
                <th
                  className="border-r border-b border-[#e7dbdc] dark:border-slate-800 px-3 py-2.5 text-center font-sans font-bold text-[12px] uppercase tracking-wider text-slate-800 dark:text-slate-200 bg-[#F4F2EE] dark:bg-slate-900 whitespace-nowrap min-w-[100px]"
                  rowSpan={2}
                >
                  Số dư CK
                </th>
                <th
                  className="border-r border-b border-[#e7dbdc] dark:border-slate-800 px-3 py-2.5 text-center font-sans font-bold text-[12px] uppercase tracking-wider text-amber-900 dark:text-amber-200 bg-amber-50/80 dark:bg-amber-950/50 whitespace-nowrap"
                  colSpan={3}
                >
                  Tạm tính
                </th>
                <th
                  className="border-r border-b border-[#e7dbdc] dark:border-slate-800 px-3 py-2.5 text-center font-sans font-bold text-[12px] uppercase tracking-wider text-slate-800 dark:text-slate-200 bg-[#F4F2EE] dark:bg-slate-900 whitespace-nowrap"
                  rowSpan={2}
                >
                  Lệnh
                </th>
                <th
                  className="border-r border-b border-[#e7dbdc] dark:border-slate-800 px-3 py-2.5 text-center font-sans font-bold text-[12px] uppercase tracking-wider text-slate-800 dark:text-slate-200 bg-[#F4F2EE] dark:bg-slate-900 whitespace-nowrap min-w-[200px]"
                  rowSpan={2}
                >
                  Note
                </th>
              </tr>
              <tr>
                <th 
                  className="border-r border-b border-[#e7dbdc] dark:border-slate-800 px-3 py-1.5 text-center font-sans font-bold text-[11px] uppercase tracking-wider text-slate-800 dark:text-slate-200 bg-[#F4F2EE] dark:bg-slate-900 whitespace-nowrap min-w-[100px]"
                >
                  Lương TA của tháng
                </th>
                <th 
                  className="border-r border-b border-[#e7dbdc] dark:border-slate-800 px-3 py-1.5 text-center font-sans font-bold text-[11px] uppercase tracking-wider text-slate-800 dark:text-slate-200 bg-[#F4F2EE] dark:bg-slate-900 whitespace-nowrap min-w-[100px]"
                >
                  Lương Hold của tháng
                </th>
                <th 
                  className="border-r border-b border-[#e7dbdc] dark:border-slate-800 px-3 py-1.5 text-center font-sans font-bold text-[11px] uppercase tracking-wider text-amber-900 dark:text-amber-200 bg-amber-50/70 dark:bg-amber-950/40 whitespace-nowrap min-w-[100px]"
                >
                  Add
                </th>
                <th 
                  className="border-r border-b border-[#e7dbdc] dark:border-slate-800 px-3 py-1.5 text-center font-sans font-bold text-[11px] uppercase tracking-wider text-amber-900 dark:text-amber-200 bg-amber-50/70 dark:bg-amber-950/40 whitespace-nowrap min-w-[100px]"
                >
                  Hold
                </th>
                <th 
                  className="border-r border-b border-[#e7dbdc] dark:border-slate-800 px-3 py-1.5 text-center font-sans font-bold text-[11px] uppercase tracking-wider text-amber-900 dark:text-amber-200 bg-amber-50/70 dark:bg-amber-950/40 whitespace-nowrap min-w-[100px]"
                >
                  Cancel
                </th>
              </tr>
            </thead>

            <tbody>
              {monthKeys.length === 0 && (
                <tr>
                  <td
                    colSpan={11}
                    className="p-10 text-center text-muted-foreground italic font-medium bg-white dark:bg-card border-r border-b border-[#e7dbdc] dark:border-slate-800"
                  >
                    Không có dữ liệu phù hợp thỏa mãn điều kiện tìm kiếm.
                  </td>
                </tr>
              )}

              {(() => {
                return monthKeys.map((mk, mi) => {
                  const rows = grouped.get(mk) || [];

                    const {
                      openBal,
                      psThu,
                      psChi,
                      closeBal,
                      addAmt,
                      holdAmt,
                      cancelAmt,
                    } = computedMonthTotals[mk] || {
                      openBal: 0,
                      psThu: 0,
                      psChi: 0,
                      closeBal: 0,
                      addAmt: 0,
                      holdAmt: 0,
                      cancelAmt: 0,
                    };
                  const isOpen = expanded.has(mk);

                  return [
                    // Month row
                    <tr
                      key={`m-${mk}`}
                      className="trial-month-total-row cursor-pointer group transition-colors"
                      onClick={() => toggle(mk)}
                    >
                      <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-3 text-center text-slate-800 dark:text-slate-200 font-bold !bg-[#FAF9F6]/80 dark:!bg-slate-800/60 whitespace-nowrap text-[13px]">
                        {toRoman(mi + 1)}
                      </td>
                      <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-3 text-left text-slate-800 dark:text-slate-200 font-bold !bg-[#FAF9F6]/80 dark:!bg-slate-800/60 whitespace-nowrap text-[13px] pl-3">
                        <span className="flex items-center gap-2">
                          {isOpen ? (
                            <ChevronDown className="w-4 h-4 text-slate-800 dark:text-slate-200 stroke-[2.5px] shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-800 dark:text-slate-200 stroke-[2.5px] shrink-0" />
                          )}
                          {mk === currentPeriod ? `Tháng ${currentPeriodVal}` : mk}
                        </span>
                      </td>
                      <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-3 text-center text-slate-800 dark:text-slate-200 font-bold !bg-[#FAF9F6]/80 dark:!bg-slate-800/60 whitespace-nowrap text-[13px]">
                        {countBusinesses(rows)} BU
                      </td>
                      <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-3 text-right text-slate-800 dark:text-slate-200 font-bold font-mono text-xs !bg-[#FAF9F6]/80 dark:!bg-slate-800/60 whitespace-nowrap">
                        {openBal !== 0 ? fmt(openBal) : "0"}
                      </td>
                      <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-3 text-right text-slate-800 dark:text-slate-200 font-bold font-mono text-xs !bg-[#FAF9F6]/80 dark:!bg-slate-800/60 whitespace-nowrap">
                        {psThu !== 0 ? fmt(psThu) : "0"}
                      </td>
                      <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-3 text-right text-slate-800 dark:text-slate-200 font-bold font-mono text-xs !bg-[#FAF9F6]/80 dark:!bg-slate-800/60 whitespace-nowrap">
                        {psChi !== 0 ? fmt(psChi) : "0"}
                      </td>
                      <td className="trial-month-close-balance border-r border-b border-[#e7dbdc] dark:border-slate-800 p-3 text-right text-slate-800 dark:text-slate-200 font-bold font-mono text-xs !bg-[#FAF9F6]/80 dark:!bg-slate-800/60 whitespace-nowrap">
                        {fmt(closeBal)}
                      </td>
                      <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-3 text-right text-slate-800 dark:text-slate-200 font-bold font-mono text-xs !bg-amber-100/60 dark:!bg-amber-900/40 whitespace-nowrap">
                        {addAmt !== 0 ? fmt(addAmt) : "0"}
                      </td>
                      <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-3 text-right text-slate-800 dark:text-slate-200 font-bold font-mono text-xs !bg-amber-100/60 dark:!bg-amber-900/40 whitespace-nowrap">
                        {holdAmt !== 0 ? fmt(holdAmt) : "0"}
                      </td>
                      <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-3 text-right text-slate-800 dark:text-slate-200 font-bold font-mono text-xs !bg-amber-100/60 dark:!bg-amber-900/40 whitespace-nowrap">
                        {cancelAmt !== 0 ? fmt(cancelAmt) : "0"}
                      </td>

                      <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 whitespace-nowrap !bg-[#FAF9F6]/80 dark:!bg-slate-800/60"></td>
                      <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 min-w-[200px] !bg-[#FAF9F6]/80 dark:!bg-slate-800/60"></td>
                    </tr>,

                    // Detail rows
                    ...(isOpen
                      ? (() => {
                          const uniqueBUs = Array.from(new Set(rows.map(r => r.bu)));
                          let globalRi = 0;
                          return uniqueBUs.flatMap((bu) => {
                            const buRows = rows.filter(r => r.bu === bu);
                            
                            let sumOpenBal = 0;
                            let sumThu = 0;
                            let sumChi = 0;
                            let sumAdd = 0;
                            let sumHold = 0;
                            let sumCancel = 0;
                            
                            const renderedBuRows = buRows.map((e, localRi) => {
                              const ri = globalRi++;
                              const isFirstRowOfBuInMonth = localRi === 0;
                              const buBalInfo = buBalancesByMonth[mk]?.[e.bu];
                              let rowOpenBal = 0;
                              if (e._isOpeningHold) {
                                const dMonth = e.displayMonth || e.month;
                                rowOpenBal =
                                  buBalInfo?.openBalByMonth?.[dMonth] ||
                                  e.openHold ||
                                  0;
                              } else if (isFirstRowOfBuInMonth) {
                                const totalOpenBal = buBalInfo?.openBal || 0;
                                const holdRowsInMonth = rows.filter(
                                  (r) => r.bu === e.bu && r._isOpeningHold
                                );
                                let allocated = 0;
                                holdRowsInMonth.forEach((hr) => {
                                  const hrMonth = hr.displayMonth || hr.month;
                                  allocated += buBalInfo?.openBalByMonth?.[hrMonth] || 0;
                                });
                                const unallocated = totalOpenBal - allocated;
                                if (unallocated > 0) {
                                  rowOpenBal = unallocated;
                                }
                              }
                              const displayedThu = e.thu;
                              const displayedChi = Math.abs(e.chi);
                              const displayedCancel = isExactReportPeriod(e, mk)
                                ? e.cancel || 0
                                : 0;
                              const rClose = rowRCloseBalances[e.id] ?? 0;
                              const isDefaultApproved = e.lenh === "OK" || e.isPaidStatus;
                              const hasTamTinh = (e.add || 0) !== 0 || (e.hold || 0) !== 0 || displayedCancel !== 0 || (e.bonus || 0) !== 0 || (e.rawAdd || 0) !== 0 || (e.rawHold || 0) !== 0 || (isExactReportPeriod(e, mk) && (e.rawCancel || 0) !== 0) || (e.rawBonus || 0) !== 0;
                              const isConf =
                                isPeriodSaved(e.month) ||
                                isPeriodSaved(currentPeriod) ||
                                (e.lenh === "-" && !hasTamTinh ? true : (isDefaultApproved ? !confirmedIds.has(e.id) : confirmedIds.has(e.id)));
                              const isRowDimmed =
                                !!e._dimmed && isPeriodSaved(e.month);
                              const displayedRCloseStr = rClose !== 0 ? fmt(rClose) : "0";
                              
                              sumOpenBal += rowOpenBal;
                              sumThu += isRowDimmed ? 0 : displayedThu;
                              sumChi += isRowDimmed ? 0 : displayedChi;
                              sumAdd += isRowDimmed ? 0 : (e.add || 0);
                              sumHold += isRowDimmed ? 0 : (e.hold || 0);
                              sumCancel += isRowDimmed ? 0 : displayedCancel;

                              return (
                                <tr
                                  key={e.id}
                                  className={`group ${isRowDimmed ? "opacity-35 select-none bg-slate-100/50 dark:bg-slate-800/10 italic text-muted-foreground/60 line-through" : "bg-white dark:bg-card"} transition-colors`}
                                >
                                  <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-2 text-center text-slate-500 dark:text-muted-foreground/60 font-medium whitespace-nowrap text-[13px]">
                                    {ri + 1}
                                  </td>
                                  <td
                                    className={`border-r border-b border-[#e7dbdc] dark:border-slate-800 px-3 py-2 text-left whitespace-nowrap min-w-[120px] text-[13px] ${e.customMonthDisplay ? "text-slate-800 dark:text-slate-200 font-medium" : "text-slate-700 dark:text-slate-300 font-medium"}`}
                                    title={e.customMonthDisplay || e.month}
                                  >
                                    {(() => {
                                      const monthStr = e.customMonthDisplay || e.month;
                                      if (!monthStr) return monthStr;
                                      if (e.customMonthDisplay) return e.customMonthDisplay;
                                      
                                      // Pattern 1: "Tháng M/YYYY" or "Tháng M-YYYY" or similar
                                      let monthMatch = monthStr.match(/(?:Th[aá]ng\s+)?(\d{1,2})[/-]\s*(\d{4})/i);
                                      
                                      // Pattern 2: If above fails, try "M/YYYY YYYY" format (e.g., "11/2025" or "12/2025")
                                      if (!monthMatch) {
                                        monthMatch = monthStr.match(/^(\d{1,2})[/-]\s*(\d{4})$/);
                                      }
                                      
                                      if (monthMatch) {
                                        const month = monthMatch[1].padStart(2, "0");
                                        const year = monthMatch[2];
                                        return `Tháng ${month}.${year}`;
                                      }
                                      return monthStr;
                                    })()}
                                  </td>
                                  <td
                                    className="border-r border-b border-[#e7dbdc] dark:border-slate-800 px-3 py-2 text-center text-slate-800 dark:text-slate-100 font-normal whitespace-nowrap text-[13px]"
                                    title={e.bu}
                                  >
                                    {e.bu}
                                  </td>
                                  <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-2 text-right text-slate-700 dark:text-slate-300 font-mono text-xs whitespace-nowrap min-w-[75px]">
                                    {rowOpenBal !== 0 ? (
                                      <span className="text-slate-800 dark:text-slate-100 font-normal">
                                        {fmt(rowOpenBal)}
                                      </span>
                                    ) : (
                                      "0"
                                    )}
                                  </td>
                                  <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-2 text-right font-mono text-xs whitespace-nowrap min-w-[80px]">
                                    {!isRowDimmed && displayedThu !== 0 ? (
                                      <span className="text-slate-800 dark:text-slate-100 font-normal">
                                        {fmt(displayedThu)}
                                      </span>
                                    ) : (
                                      "0"
                                    )}
                                  </td>
                                  <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-2 text-right font-mono text-xs whitespace-nowrap min-w-[80px]">
                                    {!isRowDimmed && displayedChi !== 0 ? (
                                      <span className="text-slate-800 dark:text-slate-100 font-normal">
                                        {fmt(displayedChi)}
                                      </span>
                                    ) : (
                                      "0"
                                    )}
                                  </td>
                                  <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-2 text-right font-mono text-xs whitespace-nowrap min-w-[80px]">
                                    <span className="text-rose-600 dark:text-rose-400 font-semibold">
                                      {displayedRCloseStr}
                                    </span>
                                  </td>
                                  <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-2 text-right font-mono text-xs whitespace-nowrap min-w-[80px] bg-amber-50/60 dark:bg-amber-950/25">
                                    {e.add !== 0 ? (
                                      <span className="text-blue-600 dark:text-blue-400 font-medium">
                                        {fmt(e.add)}
                                      </span>
                                    ) : (
                                      "0"
                                    )}
                                  </td>
                                  <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-2 text-right font-mono text-xs whitespace-nowrap min-w-[80px] bg-amber-50/60 dark:bg-amber-950/25">
                                    {e.hold !== 0 ? (
                                      <span className="text-amber-600 dark:text-amber-400 font-medium">
                                        {fmt(e.hold)}
                                      </span>
                                    ) : (
                                      "0"
                                    )}
                                  </td>
                                  <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-2 text-right font-mono text-xs whitespace-nowrap min-w-[80px] bg-amber-50/60 dark:bg-amber-950/25">
                                    {displayedCancel !== 0 ? (
                                      <span className="text-slate-500 dark:text-slate-400 font-medium">
                                        {fmt(displayedCancel)}
                                      </span>
                                    ) : (
                                      "0"
                                    )}
                                  </td>

                                  <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-1.5 text-center whitespace-nowrap text-[13px]">
                                    {(() => {
                                      const isInteractive =
                                        hasTamTinh ||
                                        (e.rawAdd || 0) !== 0 ||
                                        (e.rawHold || 0) !== 0 ||
                                        (e.rawCancel || 0) !== 0 ||
                                        (e.rawBonus || 0) !== 0 ||
                                        (e.add || 0) !== 0 ||
                                        (e.hold || 0) !== 0 ||
                                        (e.cancel || 0) !== 0 ||
                                        (e.bonus || 0) !== 0;
                                      if (!isInteractive) {
                                        return (
                                          <span className="text-slate-400 dark:text-slate-500 font-medium">
                                            0
                                          </span>
                                        );
                                      }
                                      // If pre-processed/canceled in the file and has NO Tam Tinh balance
                                      if (e.lenh === "-" && !hasTamTinh) {
                                        return (
                                          <span className="text-slate-400 dark:text-slate-500 font-medium">
                                            0
                                          </span>
                                        );
                                      }
                                      // If saved/locked rent/month and no Tam Tinh balance
                                      if ((isPeriodSaved(e.month) || isPeriodSaved(currentPeriod)) && !hasTamTinh) {
                                        return (
                                          <span className="font-bold text-slate-800 dark:text-slate-100">
                                            {isConf ? "OK" : "?"}
                                          </span>
                                        );
                                      }
                                      // Otherwise, it is interactive and user can toggle
                                      if (isConf) {
                                        return (
                                          <button
                                            onClick={(ev) => {
                                              ev.stopPropagation();
                                              toggleConfirm(e.id, ev);
                                            }}
                                            className="px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 rounded border border-emerald-200 dark:border-emerald-900/60 cursor-pointer shadow-sm hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-all duration-150 active:scale-95 active:translate-y-[1px]"
                                            title="Hủy duyệt"
                                          >
                                            OK
                                          </button>
                                        );
                                      } else {
                                        return (
                                          <button
                                            onClick={(ev) => {
                                              ev.stopPropagation();
                                              toggleConfirm(e.id, ev);
                                            }}
                                            className="px-2.5 py-0.5 text-[11px] font-bold text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded border border-blue-200 dark:border-blue-900/40 cursor-pointer shadow-sm transition-all duration-150 active:scale-95 active:translate-y-[1px]"
                                            title="Duyệt"
                                          >
                                            Duyệt
                                          </button>
                                        );
                                      }
                                    })()}
                                  </td>
                                  <td
                                    className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-2 text-left text-muted-foreground min-w-[200px] text-[13px]"
                                    title={e.ghiChu}
                                  >
                                    {e.ghiChu || ""}
                                  </td>
                                </tr>
                              );
                            });
                            
                            const buBalInfo = buBalancesByMonth[mk]?.[bu];
                            const lastBuRow = buRows[buRows.length - 1];
                            const finalCloseBal = lastBuRow ? (rowRCloseBalances[lastBuRow.id] ?? 0) : (buBalInfo?.closeBal || 0);
                            
                            const subtotalRow = (
                              <tr key={`subtotal-${mk}-${bu}`} className="!bg-[#FAF9F6]/70 dark:!bg-slate-800/30 font-bold border-y-2 border-[#e7dbdc] dark:border-slate-800">
                                <td colSpan={3} className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-2 text-center text-slate-700 dark:text-slate-300 font-sans uppercase tracking-wider text-[11px]">
                                  TỔNG BU - {bu}
                                </td>
                                <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-2 text-right text-slate-700 dark:text-slate-200 font-mono text-xs whitespace-nowrap">
                                  {sumOpenBal !== 0 ? fmt(sumOpenBal) : "0"}
                                </td>
                                <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-2 text-right text-slate-700 dark:text-slate-200 font-mono text-xs whitespace-nowrap">
                                  {sumThu !== 0 ? fmt(sumThu) : "0"}
                                </td>
                                <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-2 text-right text-slate-700 dark:text-slate-200 font-mono text-xs whitespace-nowrap">
                                  {sumChi !== 0 ? fmt(sumChi) : "0"}
                                </td>
                                <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-2 text-right font-mono text-xs whitespace-nowrap text-rose-600 dark:text-rose-400 font-bold">
                                  {finalCloseBal !== 0 ? fmt(finalCloseBal) : "0"}
                                </td>
                                <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-2 text-right text-slate-700 dark:text-slate-200 font-mono text-xs whitespace-nowrap bg-amber-100/50 dark:bg-amber-900/30">
                                  {sumAdd !== 0 ? fmt(sumAdd) : "0"}
                                </td>
                                <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-2 text-right text-slate-700 dark:text-slate-200 font-mono text-xs whitespace-nowrap bg-amber-100/50 dark:bg-amber-900/30">
                                  {sumHold !== 0 ? fmt(sumHold) : "0"}
                                </td>
                                <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-2 text-right text-slate-700 dark:text-slate-200 font-mono text-xs whitespace-nowrap bg-amber-100/50 dark:bg-amber-900/30">
                                  {sumCancel !== 0 ? fmt(sumCancel) : "0"}
                                </td>

                                <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-1.5 !bg-[#FAF9F6]/70 dark:!bg-slate-800/30"></td>
                                <td className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-2 !bg-[#FAF9F6]/70 dark:!bg-slate-800/30"></td>
                              </tr>
                            );
                            
                            return [...renderedBuRows, subtotalRow];
                          });
                        })()
                      : []),
                  ];
                });
              })()}
            </tbody>

            <tfoot className="sticky bottom-0 z-20 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
              <tr className="border-t-2 border-[#e7dbdc] dark:border-slate-700 bg-[#FAF9F6] dark:bg-slate-900">
                <td
                  colSpan={3}
                  className="border-r border-b border-[#e7dbdc] dark:border-slate-800 px-3 py-3 text-center font-sans font-bold text-[12px] uppercase tracking-wider text-slate-800 dark:text-slate-200 whitespace-nowrap bg-[#FAF9F6] dark:bg-slate-900 sticky bottom-0 z-20"
                >
                  TỔNG CỘNG THÁNG {currentPeriodVal} —{" "}
                  <span className="opacity-70 font-bold ml-1 tracking-normal font-mono text-xs">
                    {countBusinesses(filteredData)} BU
                  </span>
                </td>
                <td 
                  className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-3 text-right font-mono text-xs font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap bg-[#FAF9F6] dark:bg-slate-900 sticky bottom-0 z-20"
                >
                  {grandOpenBal !== 0 ? fmt(grandOpenBal) : "0"}
                </td>
                <td 
                  className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-3 text-right font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap bg-[#FAF9F6] dark:bg-slate-900 sticky bottom-0 z-20"
                >
                  {grandThu !== 0 ? fmt(grandThu) : "0"}
                </td>
                <td 
                  className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-3 text-right font-mono text-xs font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap bg-[#FAF9F6] dark:bg-slate-900 sticky bottom-0 z-20"
                >
                  {grandChi !== 0 ? fmt(grandChi) : "0"}
                </td>
                <td
                  className={`border-r border-b border-[#e7dbdc] dark:border-slate-800 p-3 text-right font-mono text-xs font-bold whitespace-nowrap bg-[#FAF9F6] dark:bg-slate-900 sticky bottom-0 z-20 ${grandBal >= 0 ? "text-slate-800 dark:text-slate-100" : "text-rose-600"}`}
                >
                  {fmt(grandBal)}
                </td>
                <td 
                  className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-3 text-right font-mono text-xs font-bold text-blue-600 dark:text-blue-450 whitespace-nowrap bg-amber-100/70 dark:bg-amber-950/50 sticky bottom-0 z-20"
                >
                  {grandAdd !== 0 ? fmt(grandAdd) : "0"}
                </td>
                <td 
                  className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-3 text-right font-mono text-xs font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap bg-amber-100/70 dark:bg-amber-950/50 sticky bottom-0 z-20"
                >
                  {grandHold !== 0 ? fmt(grandHold) : "0"}
                </td>
                <td 
                  className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-3 text-right font-mono text-xs font-bold text-slate-500 dark:text-slate-450 whitespace-nowrap bg-amber-100/70 dark:bg-amber-950/50 sticky bottom-0 z-20"
                >
                  {grandCancel !== 0 ? fmt(grandCancel) : "0"}
                </td>
                <td 
                  className="border-r border-b border-[#e7dbdc] dark:border-slate-800 p-3 text-center font-sans font-bold text-[11px] text-slate-700 dark:text-slate-300 whitespace-nowrap bg-[#FAF9F6] dark:bg-slate-900 sticky bottom-0 z-20"
                >
                  {confirmedIds.size} đã duyệt
                </td>
                <td 
                  className="border-r border-b border-[#e7dbdc] dark:border-slate-800 min-w-[200px] bg-[#FAF9F6] dark:bg-slate-900 sticky bottom-0 z-20"
                />
              </tr>
            </tfoot>
          </table>
      </div>

      {/* Caption & Footer Pagination Controls */}
      <div
        className="table-footer-pagination flex-shrink-0 py-2 px-4 bg-[#FDFBF7] dark:bg-slate-900 flex items-center justify-between gap-3 text-xs w-full"
        style={{ height: "50.9848px", minHeight: "50.9848px" }}
      >
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 font-sans">
              Hiển thị:
            </span>
            <Select
              value={String(itemsPerPage)}
              onValueChange={(val) => {
                setItemsPerPage(val === "all" ? "all" : Number(val));
              }}
            >
              <SelectTrigger 
                className="rounded-full px-3 text-[11px] font-bold font-sans text-slate-700 dark:text-slate-200 border-[#e7dbdc] bg-white dark:bg-slate-800 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
                style={{ height: "26px", width: "100px" }}
              >
                <SelectValue placeholder="Tất cả" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-800 border-[#e7dbdc] z-[99999] opacity-100 font-sans">
                <SelectItem value="10" className="text-[11px] font-medium font-sans">10 dòng</SelectItem>
                <SelectItem value="20" className="text-[11px] font-medium font-sans">20 dòng</SelectItem>
                <SelectItem value="50" className="text-[11px] font-medium font-sans">50 dòng</SelectItem>
                <SelectItem value="100" className="text-[11px] font-medium font-sans">100 dòng</SelectItem>
                <SelectItem value="all" className="text-[11px] font-medium font-sans">Tất cả</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 font-sans">
            Tổng số: {monthKeys.length} kỳ ({currentPeriodRows.length} dòng dữ liệu)
          </div>
      </div>
    </div>
  );
}
