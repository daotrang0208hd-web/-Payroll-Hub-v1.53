/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  getBusinessFromL07,
  resolveMktRosterCenter,
} from "./center-utils";
import { parseDurationToHours } from "../schemas/excel-schema";

export const PIVOT_CACHE_VERSION = 7;
export const PIVOT_MKT_TYPE_CACHE_KEY = "pivot_master_mkt_type_data";
export const PIVOT_MKT_TYPE_CACHE_VERSION = 1;

export type PivotGroupedData = Record<
  string,
  Record<string, Record<string, Record<string, number>>>
>;

export interface PivotMktTypeCache {
  cacheVersion: number;
  groupedData: PivotGroupedData;
  typeColumns: string[];
  months: string[];
  updatedAt: number;
}

export function formatPivotTypeHeader(typeRaw: string): string {
  if (!typeRaw) return "UNSPECIFIED";
  let t = String(typeRaw).trim();
  if (!t || t.toUpperCase() === "N/A" || t.toUpperCase() === "NAN") return "UNSPECIFIED";

  // Strip prefix "CHARGE TO " or "CHARGE " (case insensitive)
  if (/^CHARGE\s+TO\s+/i.test(t)) {
    t = t.replace(/^CHARGE\s+TO\s+/i, "").trim();
  } else if (/^CHARGE\s+/i.test(t)) {
    t = t.replace(/^CHARGE\s+/i, "").trim();
  }

  const cleanUpper = t.toUpperCase();
  if (cleanUpper === "ADD" || cleanUpper === "CANCEL") return "EXCLUDE";
  if (cleanUpper === "CENTER MKT" || cleanUpper === "MKT LOCAL NORTH" || cleanUpper === "MKT LOCAL") return "MKT LOCAL";
  if (!t) return "UNSPECIFIED";

  // The reference Master logic groups every Roster task into the five
  // standard payroll columns. Some source files contain a suffix/description
  // after the code, while older files only contain the four-letter prefix.
  // Canonicalize both variants so amounts cannot be split into hidden columns.
  if (cleanUpper.startsWith("LPAR")) return "LPAR01";
  if (cleanUpper.startsWith("LRET")) return "LRET01";
  if (cleanUpper.startsWith("LDEM")) return "LDEM01";
  if (cleanUpper.startsWith("LDEC")) return "LDEC01";
  if (cleanUpper.startsWith("MOTH")) return "MOTH01";

  return cleanUpper;
}

export function isMktRosterTypeColumn(typeRaw: string): boolean {
  const type = formatPivotTypeHeader(typeRaw);
  return /^(LDEC|LDEM|LPAR|LRET|MOTH)/.test(type);
}

const clonePivotGroupedData = (data: PivotGroupedData = {}): PivotGroupedData =>
  JSON.parse(JSON.stringify(data || {}));

export function getPivotDataMonths(data: PivotGroupedData = {}): string[] {
  const months = new Set<string>();
  Object.values(data || {}).forEach((l07Rows) => {
    Object.values(l07Rows || {}).forEach((monthRows) => {
      Object.keys(monthRows || {}).forEach((month) => {
        const normalized = String(month || "").trim();
        if (normalized) months.add(normalized);
      });
    });
  });
  return Array.from(months);
}

export function extractPivotMktTypeData(
  data: PivotGroupedData = {},
  knownTypeColumns: string[] = [],
): PivotMktTypeCache {
  const managedTypes = new Set(
    (knownTypeColumns || [])
      .map(formatPivotTypeHeader)
      .filter(isMktRosterTypeColumn),
  );
  const groupedData: PivotGroupedData = {};
  const months = new Set<string>();

  Object.entries(data || {}).forEach(([bu, l07Rows]) => {
    Object.entries(l07Rows || {}).forEach(([l07, monthRows]) => {
      Object.entries(monthRows || {}).forEach(([month, typeRows]) => {
        Object.entries(typeRows || {}).forEach(([rawType, rawAmount]) => {
          const type = formatPivotTypeHeader(rawType);
          if (!managedTypes.has(type) && !isMktRosterTypeColumn(type)) return;
          const amount = Number(rawAmount);
          if (!Number.isFinite(amount)) return;

          managedTypes.add(type);
          months.add(month);
          if (!groupedData[bu]) groupedData[bu] = {};
          if (!groupedData[bu][l07]) groupedData[bu][l07] = {};
          if (!groupedData[bu][l07][month]) groupedData[bu][l07][month] = {};
          groupedData[bu][l07][month][type] =
            (groupedData[bu][l07][month][type] || 0) + amount;
        });
      });
    });
  });

  return {
    cacheVersion: PIVOT_MKT_TYPE_CACHE_VERSION,
    groupedData,
    typeColumns: Array.from(managedTypes).sort(),
    months: Array.from(months).sort(),
    updatedAt: Date.now(),
  };
}

export function readPivotMktTypeCache(
  fallbackData: PivotGroupedData = {},
  fallbackTypeColumns: string[] = [],
): PivotMktTypeCache {
  try {
    if (typeof localStorage !== "undefined") {
      const cached = localStorage.getItem(PIVOT_MKT_TYPE_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (
          parsed?.cacheVersion === PIVOT_MKT_TYPE_CACHE_VERSION &&
          parsed.groupedData &&
          Array.isArray(parsed.typeColumns) &&
          Array.isArray(parsed.months)
        ) {
          return parsed as PivotMktTypeCache;
        }
      }
    }
  } catch (error) {
    console.warn("Không thể đọc cache TYPE MKT Local của Pivot Master", error);
  }

  // Migration cho dữ liệu đã có trước khi tách cache TYPE MKT Local.
  return extractPivotMktTypeData(fallbackData, fallbackTypeColumns);
}

export function writePivotMktTypeCache(cache: PivotMktTypeCache): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(PIVOT_MKT_TYPE_CACHE_KEY, JSON.stringify(cache));
    }
  } catch (error) {
    console.warn("Không thể lưu cache TYPE MKT Local của Pivot Master", error);
  }
}

export function updatePivotMktTypeCache(
  currentCache: PivotMktTypeCache,
  incomingData: PivotGroupedData,
  incomingTypeColumns: string[],
  affectedMonths: string[],
): PivotMktTypeCache {
  const monthsToReplace = new Set(
    (affectedMonths || []).map((month) => String(month || "").trim()).filter(Boolean),
  );
  const groupedData = clonePivotGroupedData(currentCache?.groupedData || {});

  // File MKT cua mot thang la nguon chinh thuc cho cac cot TYPE cua thang do.
  // Xoa snapshot TYPE cu cua dung thang truoc khi nap snapshot moi de khong
  // cong trung khi nguoi dung tai lai cung mot file.
  Object.keys(groupedData).forEach((bu) => {
    Object.keys(groupedData[bu] || {}).forEach((l07) => {
      Object.keys(groupedData[bu][l07] || {}).forEach((month) => {
        if (monthsToReplace.has(month)) delete groupedData[bu][l07][month];
      });
      if (Object.keys(groupedData[bu][l07] || {}).length === 0) {
        delete groupedData[bu][l07];
      }
    });
    if (Object.keys(groupedData[bu] || {}).length === 0) delete groupedData[bu];
  });

  const managedTypes = new Set(
    [...(currentCache?.typeColumns || []), ...(incomingTypeColumns || [])]
      .map(formatPivotTypeHeader)
      .filter((type) => type && type !== "EXCLUDE"),
  );

  Object.entries(incomingData || {}).forEach(([bu, l07Rows]) => {
    Object.entries(l07Rows || {}).forEach(([l07, monthRows]) => {
      Object.entries(monthRows || {}).forEach(([month, typeRows]) => {
        if (monthsToReplace.size > 0 && !monthsToReplace.has(month)) return;
        Object.entries(typeRows || {}).forEach(([rawType, rawAmount]) => {
          const type = formatPivotTypeHeader(rawType);
          if (!managedTypes.has(type)) return;
          const amount = Number(rawAmount);
          if (!Number.isFinite(amount)) return;

          if (!groupedData[bu]) groupedData[bu] = {};
          if (!groupedData[bu][l07]) groupedData[bu][l07] = {};
          if (!groupedData[bu][l07][month]) groupedData[bu][l07][month] = {};
          groupedData[bu][l07][month][type] =
            (groupedData[bu][l07][month][type] || 0) + amount;
        });
      });
    });
  });

  return {
    cacheVersion: PIVOT_MKT_TYPE_CACHE_VERSION,
    groupedData,
    typeColumns: Array.from(managedTypes).sort(),
    months: Array.from(
      new Set([...(currentCache?.months || []), ...monthsToReplace]),
    ).sort(),
    updatedAt: Date.now(),
  };
}

export function applyPivotMktTypeCache(
  baseData: PivotGroupedData,
  cache: PivotMktTypeCache,
): PivotGroupedData {
  const result = clonePivotGroupedData(baseData || {});
  const managedTypes = new Set(
    (cache?.typeColumns || []).map(formatPivotTypeHeader).filter(Boolean),
  );
  const managedMonths = new Set(cache?.months || []);

  // Chi xoa/cap nhat cac cot TYPE MKT trong cac thang da duoc quan ly.
  // Toan bo cot Gross Pay/Pivot khac van duoc giu nguyen.
  Object.keys(result).forEach((bu) => {
    Object.keys(result[bu] || {}).forEach((l07) => {
      Object.entries(result[bu][l07] || {}).forEach(([month, typeRows]) => {
        if (!managedMonths.has(month)) return;
        Object.keys(typeRows || {}).forEach((rawType) => {
          if (managedTypes.has(formatPivotTypeHeader(rawType))) {
            delete typeRows[rawType];
          }
        });
        if (Object.keys(typeRows || {}).length === 0) {
          delete result[bu][l07][month];
        }
      });
      if (Object.keys(result[bu][l07] || {}).length === 0) delete result[bu][l07];
    });
    if (Object.keys(result[bu] || {}).length === 0) delete result[bu];
  });

  Object.entries(cache?.groupedData || {}).forEach(([bu, l07Rows]) => {
    Object.entries(l07Rows || {}).forEach(([l07, monthRows]) => {
      Object.entries(monthRows || {}).forEach(([month, typeRows]) => {
        Object.entries(typeRows || {}).forEach(([rawType, rawAmount]) => {
          const type = formatPivotTypeHeader(rawType);
          if (!managedTypes.has(type)) return;
          const amount = Number(rawAmount);
          if (!Number.isFinite(amount)) return;

          if (!result[bu]) result[bu] = {};
          if (!result[bu][l07]) result[bu][l07] = {};
          if (!result[bu][l07][month]) result[bu][l07][month] = {};
          result[bu][l07][month][type] = amount;
        });
      });
    });
  });

  return result;
}

export function sanitizePivotData(
  groupedData: Record<string, Record<string, Record<string, number>>>,
  typeColumns: string[] = []
) {
  const newGroupedData: Record<string, Record<string, Record<string, number>>> = {};
  const uniqueTypes = new Set<string>();

  if (groupedData) {
    Object.keys(groupedData).forEach(bu => {
      const buObj = groupedData[bu];
      if (!buObj) return;
      if (!newGroupedData[bu]) newGroupedData[bu] = {};

      Object.keys(buObj).forEach(l07 => {
        const l07Obj = buObj[l07];
        if (!l07Obj) return;
        if (!newGroupedData[bu][l07]) newGroupedData[bu][l07] = {};

        Object.keys(l07Obj).forEach(rawType => {
          const amount = l07Obj[rawType];
          if (!amount || isNaN(amount)) return;
          const cleanType = formatPivotTypeHeader(rawType);
          if (cleanType === "EXCLUDE" || cleanType === "ADD" || cleanType === "CANCEL") return;

          uniqueTypes.add(cleanType);

          if (!newGroupedData[bu][l07][cleanType]) {
            newGroupedData[bu][l07][cleanType] = 0;
          }
          newGroupedData[bu][l07][cleanType] += amount;
        });
      });
    });
  }

  if (typeColumns && typeColumns.length > 0) {
    typeColumns.forEach(t => {
      const clean = formatPivotTypeHeader(t);
      if (clean !== "EXCLUDE" && clean !== "ADD" && clean !== "CANCEL") {
        uniqueTypes.add(clean);
      }
    });
  }

  const sortedTypes = Array.from(uniqueTypes).sort((a, b) => {
    if (a === "MKT LOCAL") return -1;
    if (b === "MKT LOCAL") return 1;
    if (a === "UNSPECIFIED") return 1;
    if (b === "UNSPECIFIED") return -1;
    return a.localeCompare(b);
  });

  return {
    groupedData: newGroupedData,
    typeColumns: sortedTypes
  };
}

const KNOWN_NON_CHARGE_KEYS = new Set([
  "NO", "ID NUMBER", "FULL NAME", "BANK ACCOUNT NUMBER", "BANK NAME",
  "CITAD CODE", "TAX CODE", "CONTRACT NO", "TOTAL PAYMENT", "CENTER",
  "BUSINESS", "BU", "L07", "_RAWAE", "THÁNG", "SALARY SCALE", "FROM", "TO", "TYPE"
]);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function buildPivotFromAppData(
  sheet1Rows: any[] = [],
  _holdRows: any[] = [],
  rosterRows: any[] = [],
  reportingMonth?: string,
) {
  const newGroupedData: Record<string, Record<string, Record<string, Record<string, number>>>> = {};
  const uniqueTypes = new Set<string>();
  const activeReportingMonth = String(reportingMonth || "")
    .trim()
    .replace("/", ".");

  const parseMoney = (val: any): number => {
    if (typeof val === "number") return val;
    if (!val) return 0;
    const str = String(val).replace(/,/g, "").trim();
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  };

  const addAmount = (buRaw: string, l07Raw: string, monthRaw: string, typeRaw: string, amount: number) => {
    if (!amount || isNaN(amount)) return;
    let bu = (buRaw || "").trim().toUpperCase();
    const sourceMonth = (monthRaw || "03.2026").trim();
    let month = activeReportingMonth || sourceMonth;

    // Sanity check: swap if BU is a month format (e.g. 03.2026, 03/2026, THÁNG 3) or month is a known BU
    const isMonthStr = (s: string) => /^\d{1,2}[./-]\d{2,4}$/.test(s) || /^(THÁNG|THANG|MONTH)\b/i.test(s);
    const isKnownBU = (s: string) => ["AHN", "EC", "LXO", "OTHER", "AFL", "AEC", "KINDY", "PRIMARY", "SECONDARY", "MKT"].includes(s.toUpperCase());

    if (isMonthStr(bu) || (isKnownBU(sourceMonth) && !isKnownBU(bu))) {
      const temp = bu;
      bu = sourceMonth.toUpperCase();
      if (!activeReportingMonth) month = temp;
    }

    if (!bu || bu === "UNKNOWN" || isMonthStr(bu)) {
      bu = "OTHER";
    }

    const l07 = (l07Raw || "UNKNOWN").trim();
    const type = formatPivotTypeHeader(typeRaw);

    if (type === "EXCLUDE" || type === "ADD" || type === "CANCEL") return;

    uniqueTypes.add(type);

    if (!newGroupedData[bu]) newGroupedData[bu] = {};
    if (!newGroupedData[bu][l07]) newGroupedData[bu][l07] = {};
    if (!newGroupedData[bu][l07][month]) newGroupedData[bu][l07][month] = {};
    if (!newGroupedData[bu][l07][month][type]) newGroupedData[bu][l07][month][type] = 0;
    newGroupedData[bu][l07][month][type] += amount;
  };

  sheet1Rows.forEach((row) => {
    if (!row) return;
    const bu = row["Business"] || row["BU"] || "";
    const l07 = row["L07"] || row["Center"] || row["CHARGE TO CENTER"] || "";
    const month = row["Tháng báo cáo"] || row["_fileMonth"] || row["Tháng"] || "03.2026";
    if (!l07) return;

    // MKT LOCAL NORTH is only the temporary Gross Pay bucket. Its Roster
    // amounts are distributed to the real L07 rows below, therefore it must
    // remain zero in Pivot Master (matching the reference report).
    if (String(l07).trim().toUpperCase() === "MKT LOCAL NORTH") return;

    // Check if row contains individual charge columns
    let processedChargeCols = false;
    Object.keys(row).forEach((key) => {
      const uKey = key.toUpperCase().trim();
      if (KNOWN_NON_CHARGE_KEYS.has(uKey)) return;
      // Keep identity Center columns out, but do not discard the monetary
      // column named "Charge To Center MKT".
      if (
        !uKey.includes("CHARGE") &&
        (uKey.includes("CENTER") || uKey.includes("TRUNG TÂM"))
      ) return;

      if (uKey.includes("CHARGE") || uKey.startsWith("LDEC") || uKey.startsWith("LDEM") || uKey.startsWith("LPAR") || uKey.startsWith("LRET") || uKey.startsWith("MOTH")) {
        const amt = parseMoney(row[key]);
        const cleanType = formatPivotTypeHeader(key);
        if (amt !== 0 && cleanType !== "EXCLUDE" && cleanType !== "ADD" && cleanType !== "CANCEL") {
          processedChargeCols = true;
          addAmount(bu, l07, month, key, amt);
        }
      }
    });

    if (!processedChargeCols) {
      const totalPay = parseMoney(row["TOTAL PAYMENT"] || row["TOTAL"] || 0);
      const type = row["Type"] || row["LOẠI"] || row["Phân loại"] || row["Nghiệp vụ"] || "UNSPECIFIED";
      const cleanType = formatPivotTypeHeader(type);
      if (totalPay !== 0 && cleanType !== "EXCLUDE" && cleanType !== "ADD" && cleanType !== "CANCEL") {
        addAmount(bu, l07, month, type, totalPay);
      }
    }
  });

  // holdRows removed as per user request ("xóa hold đi, ko lấy dữ liệu sheet hold ae_master")

  rosterRows.forEach((row) => {
    if (!row) return;
    const center = String(
      row["chargeToCenterCode"] ||
        row["chargeToCenterMkt"] ||
        row["CHARGE TO CENTER"] ||
        row["Charge To Center MKT"] ||
        row["Center"] ||
        "",
    ).trim();
    const resolvedCenter = resolveMktRosterCenter(center);
    const l07 = resolvedCenter.l07 || row["l07"] || row["L07"] || "";
    if (!l07 || String(l07).trim().toUpperCase() === "MKT LOCAL NORTH") return;

    const rawDuration =
      row["durationHours"] ??
      row["duration"] ??
      row["DURATION"] ??
      row["HOURS"] ??
      0;
    const durationHours = row["durationHours"] !== undefined
      ? parseMoney(row["durationHours"])
      : parseDurationToHours(rawDuration);
    const salary = durationHours > 0
      ? durationHours * 20000
      : parseMoney(
          row["calculatedSalary"] ||
            row["TOTAL PAYMENT"] ||
            row["TOTAL"] ||
            row["totalPayment"] ||
            0,
        );
    const bu =
      resolvedCenter.business ||
      row["bu"] ||
      row["Business"] ||
      row["business"] ||
      getBusinessFromL07(l07);
    const month = row["month"] || row["_fileMonth"] || row["Tháng"] || "03.2026";
    const rowType = row["type"] || row["Type"] || row["LOẠI"] || row["Phân loại"] || row["Nghiệp vụ"] || "MKT LOCAL";

    if (salary > 0 && l07) {
      addAmount(bu, l07, month, rowType, salary);
    }
  });

  const sortedTypes = Array.from(uniqueTypes).sort((a, b) => {
    if (a === "MKT LOCAL") return -1;
    if (b === "MKT LOCAL") return 1;
    if (a === "UNSPECIFIED") return 1;
    if (b === "UNSPECIFIED") return -1;
    return a.localeCompare(b);
  });

  return { groupedData: newGroupedData, typeColumns: sortedTypes };
}
