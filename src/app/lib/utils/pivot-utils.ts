/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  getBusinessFromL07,
  mapL07,
  resolveMktRosterCenter,
} from "./center-utils";
import { parseDurationToHours } from "../schemas/excel-schema";

export const PIVOT_CACHE_VERSION = 4;

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

  return t.toUpperCase();
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
  "BUSINESS", "BU", "L07", "_RAWAE", "THÁNG", "SALARY SCALE", "FROM", "TO", "TYPE",
  "CHARGE TO CENTER", "CHARGE TO CENTER MKT", "CHARGE TO CENTER CODE", "CHARGETOCENTERCODE"
]);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function buildPivotFromAppData(sheet1Rows: any[] = [], _holdRows: any[] = [], rosterRows: any[] = []) {
  const newGroupedData: Record<string, Record<string, Record<string, Record<string, number>>>> = {};
  const uniqueTypes = new Set<string>();

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
    let month = (monthRaw || "03.2026").trim();

    // Sanity check: swap if BU is a month format (e.g. 03.2026, 03/2026, THÁNG 3) or month is a known BU
    const isMonthStr = (s: string) => /^\d{1,2}[./-]\d{2,4}$/.test(s) || /^(THÁNG|THANG|MONTH)\b/i.test(s);
    const isKnownBU = (s: string) => ["AHN", "EC", "LXO", "OTHER", "AFL", "AEC", "KINDY", "PRIMARY", "SECONDARY", "MKT"].includes(s.toUpperCase());

    if (isMonthStr(bu) || (isKnownBU(month) && !isKnownBU(bu))) {
      const temp = bu;
      bu = month.toUpperCase();
      month = temp;
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

  const rosterAllocations = rosterRows.flatMap((row) => {
    if (!row) return [];

    const rawChargeToCenter = String(
      row["chargeToCenterCode"] ||
        row["CHARGE TO CENTER"] ||
        row["chargeToCenterMkt"] ||
        row["charge_to_center_mkt"] ||
        row["Charge to Center MKT"] ||
        row["Center"] ||
        row["center"] ||
        "",
    ).trim();
    const resolved = resolveMktRosterCenter(rawChargeToCenter);
    const storedL07 = String(row["l07"] || row["L07"] || "").trim();
    const l07 = resolved.l07 || storedL07;

    // The aggregate is replaced by allocations to real Charge To Center L07s.
    if (!l07 || l07.toUpperCase() === "MKT LOCAL NORTH") return [];

    const rawDuration =
      row["duration"] ?? row["DURATION"] ?? row["HOURS"] ?? "";
    let duration = parseDurationToHours(rawDuration);

    // Recover legacy rows that were already persisted with the old 1899-hour
    // bug. Their From/To cells still retain the original Excel clock values.
    if (duration <= 0 && rawDuration !== "") {
      const startHours = parseDurationToHours(
        row["gio_vao"] ?? row["from"] ?? row["From"] ?? "",
      );
      const endHours = parseDurationToHours(
        row["gio_ra"] ?? row["to"] ?? row["To"] ?? "",
      );
      if (endHours > 0 && startHours >= 0) {
        duration = endHours >= startHours
          ? endHours - startHours
          : 24 - startHours + endHours;
      }
    }
    const calculatedSalary = parseMoney(
      row["calculatedSalary"] || row["CALCULATED SALARY"] || 0,
    );
    const hasRawDuration =
      rawDuration !== null &&
      rawDuration !== undefined &&
      String(rawDuration).trim() !== "";
    const salary = duration > 0
      ? duration * 20000
      : hasRawDuration
        ? 0
        : calculatedSalary;
    const month = String(
      row["month"] || row["_fileMonth"] || row["Tháng"] || "03.2026",
    ).trim();
    const type = String(
      row["type"] ||
        row["Type"] ||
        row["LOẠI"] ||
        row["Phân loại"] ||
        row["Nghiệp vụ"] ||
        "UNSPECIFIED",
    ).trim();

    if (!type || salary <= 0 || !Number.isFinite(salary)) return [];

    return [
      {
        bu:
          resolved.business ||
          row["bu"] ||
          row["Business"] ||
          row["business"] ||
          getBusinessFromL07(l07),
        l07,
        month,
        type,
        salary,
      },
    ];
  });

  const rosterAllocationMonths = new Set(
    rosterAllocations.map((allocation) => allocation.month),
  );

  sheet1Rows.forEach((row) => {
    if (!row) return;
    const rawCenter =
      row["Center"] ||
      row["CENTER"] ||
      row["CHARGE TO CENTER"] ||
      row["Charge to Center"] ||
      "";
    const mappedCenterL07 = rawCenter ? mapL07(String(rawCenter)) : "";
    const l07 = row["L07"] || mappedCenterL07 || rawCenter || "";
    const bu = row["Business"] || row["BU"] || getBusinessFromL07(l07);
    const month = row["Tháng báo cáo"] || row["_fileMonth"] || row["Tháng"] || "03.2026";
    if (!l07) return;
    if (
      String(l07).trim().toUpperCase() === "MKT LOCAL NORTH" &&
      rosterAllocationMonths.has(String(month).trim())
    ) {
      return;
    }

    // Check if row contains individual charge columns
    let processedChargeCols = false;
    Object.keys(row).forEach((key) => {
      const uKey = key.toUpperCase().trim();
      if (KNOWN_NON_CHARGE_KEYS.has(uKey)) return;
      if (uKey.includes("CENTER") || uKey.includes("TRUNG TÂM")) return;

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

  rosterAllocations.forEach(({ bu, l07, month, type, salary }) => {
    addAmount(String(bu), l07, month, type, salary);
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
