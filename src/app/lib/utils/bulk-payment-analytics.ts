/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  formatIdNumber,
  parseMoneyToNumber,
  removeVietnameseTones,
} from "./data-utils";
import { getBusinessFromL07, mapL07 } from "./center-utils";

export interface PayrollBuMonthSummaryRow {
  id: string;
  "Tháng HOLD": string;
  "Kỳ báo cáo": string;
  BU: string;
  "HOLD phát sinh": number;
  "Số dư HOLD đầu kỳ": number;
  "Thanh toán HOLD tại kỳ": number;
  "Tháng thanh toán tại kỳ": string;
  "Các tháng đã thanh toán": string;
  "CANCEL tại kỳ": number;
  "BONUS tại kỳ": number;
  "Số dư HOLD còn lại": number;
  "Diễn biến tại kỳ": string;
  "Trạng thái HOLD": string;
}

export interface BulkPaymentAnalyticsResult {
  currentPeriod: string;
  businessUnits: string[];
  summaryRows: PayrollBuMonthSummaryRow[];
}

interface BuildBulkPaymentAnalyticsParams {
  /** Chỉ dùng để bổ sung BU/L07 khi dòng HOLD thiếu thông tin. */
  sheet1Rows: any[];
  holdRows: any[];
  /** Chỉ dùng để bổ sung BU/L07 khi dòng HOLD thiếu thông tin. */
  bankRows: any[];
  globalMonth: string;
}

interface MonthPeriod {
  month: number;
  year: number;
  key: string;
}

type HoldOperation = "HOLD" | "ADD" | "BONUS" | "CANCEL";

interface DimensionDescriptor {
  l07: string;
  business: string;
}

interface HoldEntry {
  reportPeriod: MonthPeriod;
  occurrencePeriod: MonthPeriod;
  operation: HoldOperation;
  amount: number;
  business: string;
}

interface HoldLifecycleBucket {
  business: string;
  occurrencePeriod: MonthPeriod;
  holdBeforePeriod: number;
  holdInPeriod: number;
  addBeforePeriod: number;
  addInPeriod: number;
  cancelBeforePeriod: number;
  cancelInPeriod: number;
  bonusInPeriod: number;
  addPaymentPeriods: Map<string, MonthPeriod>;
}

const readFirst = (row: any, keys: string[]): unknown => {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
};

const normalizeText = (value: unknown): string =>
  removeVietnameseTones(String(value ?? ""))
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

const normalizeAccount = (value: unknown): string =>
  String(value ?? "").replace(/\s+/g, "").trim().toUpperCase();

const periodFromParts = (month: number, year: number): MonthPeriod | null => {
  if (month < 1 || month > 12 || year < 1900 || year > 2200) return null;
  return {
    month,
    year,
    key: `${year}-${String(month).padStart(2, "0")}`,
  };
};

const parseMonthPeriod = (
  value: unknown,
  fallback?: MonthPeriod,
): MonthPeriod | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return periodFromParts(value.getMonth() + 1, value.getFullYear());
  }

  const raw = String(value ?? "").trim();
  if (!raw) return fallback || null;

  const normalized = normalizeText(raw).replace(/NAM|YEAR/g, " ");
  const yearFirst = normalized.match(
    /\b(19\d{2}|20\d{2})\s*[./_\- ]\s*(0?[1-9]|1[0-2])\b/,
  );
  if (yearFirst) {
    return periodFromParts(Number(yearFirst[2]), Number(yearFirst[1]));
  }

  const monthFirst = normalized.match(
    /(?:THANG|THG|T)?\s*(0?[1-9]|1[0-2])\s*[./_\- ]\s*(19\d{2}|20\d{2})\b/,
  );
  if (monthFirst) {
    return periodFromParts(Number(monthFirst[1]), Number(monthFirst[2]));
  }

  const monthOnly = normalized.match(/^(?:THANG|THG|T)\s*(0?[1-9]|1[0-2])$/);
  if (monthOnly && fallback) {
    return periodFromParts(Number(monthOnly[1]), fallback.year);
  }

  return fallback || null;
};

const comparePeriods = (left: MonthPeriod, right: MonthPeriod): number =>
  left.year === right.year ? left.month - right.month : left.year - right.year;

const formatPeriod = (period: MonthPeriod): string =>
  `${String(period.month).padStart(2, "0")}.${period.year}`;

const employeeIdOf = (row: any): string =>
  formatIdNumber(
    readFirst(row, [
      "ID Number",
      "Document ID",
      "Document ID / CCCD",
      "Mã nhân viên",
      "Mã NV",
      "Mã AE",
      "Mã ae",
      "CCCD",
      "CMND",
      "ID",
    ]),
  ).toUpperCase();

const fullNameOf = (row: any): string =>
  String(
    readFirst(row, [
      "Full name",
      "Full Name",
      "Beneficiary Name",
      "Họ và tên",
      "Họ tên",
      "Name",
    ]),
  ).trim();

const accountOf = (row: any): string =>
  normalizeAccount(
    readFirst(row, [
      "Bank Account Number",
      "Beneficiary Account No.",
      "Account Number",
      "Số tài khoản",
      "STK",
    ]),
  );

const dimensionsOf = (row: any): DimensionDescriptor => {
  const rawL07 = String(
    readFirst(row, [
      "L07",
      "L07 Code",
      "Center Code",
      "Charge to center",
      "charge_to_center_mkt",
      "Center",
      "Mã trung tâm",
      "Mã AE",
      "Mã ae",
    ]),
  ).trim();
  const mappedL07 = rawL07 ? mapL07(rawL07) : "";
  const l07 = String(mappedL07 || rawL07).trim().toUpperCase();
  const rawBusiness = String(
    readFirst(row, ["BU", "Business", "Bộ phận", "Department", "BUS"]),
  )
    .trim()
    .toUpperCase()
    .replace(/^AHN_HP$/, "AHP");

  return {
    l07,
    business: rawBusiness || (l07 ? getBusinessFromL07(l07) : ""),
  };
};

const moneyOf = (row: any): number =>
  parseMoneyToNumber(
    readFirst(row, [
      "Payment Amount",
      "Amount",
      "Số tiền",
      "Thành tiền",
      "TOTAL PAYMENT",
      "Total Payment",
      "Grand Total",
      "GRAND TOTAL",
    ]),
  );

const classifyHoldOperation = (row: any): HoldOperation | null => {
  const explicitCode = normalizeText(row?.["Nghiệp vụ"]);
  if (explicitCode === "H" || explicitCode === "HOLD") return "HOLD";
  if (explicitCode === "A" || explicitCode === "ADD") return "ADD";
  if (explicitCode === "B" || explicitCode === "BONUS") return "BONUS";
  if (explicitCode === "C" || explicitCode === "CANCEL") return "CANCEL";

  const source = normalizeText(row?.["Sheet Source"]);
  const status = normalizeText(
    readFirst(row, ["Trạng thái", "Tình trạng thanh toán"]),
  );
  const combined = `${explicitCode} ${source} ${status}`;

  if (combined.includes("CANCEL") || combined.includes("HUY")) return "CANCEL";
  if (
    combined.includes("BONUS") ||
    combined.includes("SUMMER") ||
    combined.includes("INSTRUCTOR") ||
    combined.includes("⏯") ||
    combined.includes("⏩")
  ) {
    return "BONUS";
  }
  if (
    combined.includes("ADD") ||
    combined.includes("RELEASE") ||
    combined.includes("UNHOLD") ||
    combined.includes("THANH TOAN") ||
    combined.includes("PAID")
  ) {
    return "ADD";
  }
  if (combined.includes("HOLD") || combined.includes("GIU LAI")) return "HOLD";

  return moneyOf(row) < 0 ? "HOLD" : "ADD";
};

const isUsableHoldRow = (row: any): boolean => {
  if (!row) return false;
  return !normalizeText(row["Sheet Source"]).includes("SHEET 1");
};

const buildIdentityResolver = (rows: any[]) => {
  const nameToIdentity = new Map<string, string>();
  const accountToIdentity = new Map<string, string>();
  const ambiguousNames = new Set<string>();
  const ambiguousAccounts = new Set<string>();

  const registerAlias = (
    alias: string,
    identityKey: string,
    target: Map<string, string>,
    ambiguous: Set<string>,
  ) => {
    if (!alias || ambiguous.has(alias)) return;
    const existing = target.get(alias);
    if (existing && existing !== identityKey) {
      target.delete(alias);
      ambiguous.add(alias);
      return;
    }
    target.set(alias, identityKey);
  };

  rows.forEach((row) => {
    const employeeId = employeeIdOf(row);
    if (!employeeId) return;
    const identityKey = `ID:${employeeId}`;
    registerAlias(
      normalizeText(fullNameOf(row)),
      identityKey,
      nameToIdentity,
      ambiguousNames,
    );
    registerAlias(
      accountOf(row),
      identityKey,
      accountToIdentity,
      ambiguousAccounts,
    );
  });

  return (row: any, fallbackIndex: number): string => {
    const employeeId = employeeIdOf(row);
    if (employeeId) return `ID:${employeeId}`;

    const account = accountOf(row);
    if (account && accountToIdentity.has(account)) {
      return accountToIdentity.get(account)!;
    }

    const normalizedName = normalizeText(fullNameOf(row));
    if (normalizedName && nameToIdentity.has(normalizedName)) {
      return nameToIdentity.get(normalizedName)!;
    }
    if (normalizedName) return `NAME:${normalizedName}`;
    if (account) return `ACCOUNT:${account}`;
    return `UNKNOWN:${String(row?.id || row?._recordId || fallbackIndex)}`;
  };
};

const createBucket = (
  business: string,
  occurrencePeriod: MonthPeriod,
): HoldLifecycleBucket => ({
  business,
  occurrencePeriod,
  holdBeforePeriod: 0,
  holdInPeriod: 0,
  addBeforePeriod: 0,
  addInPeriod: 0,
  cancelBeforePeriod: 0,
  cancelInPeriod: 0,
  bonusInPeriod: 0,
  addPaymentPeriods: new Map<string, MonthPeriod>(),
});

export function buildBulkPaymentAnalytics({
  sheet1Rows,
  holdRows,
  bankRows,
  globalMonth,
}: BuildBulkPaymentAnalyticsParams): BulkPaymentAnalyticsResult {
  const now = new Date();
  const currentPeriod =
    parseMonthPeriod(globalMonth) ||
    periodFromParts(now.getMonth() + 1, now.getFullYear())!;

  // Gross Pay/Transaction chỉ hỗ trợ nhận diện BU/L07. Số tiền ANALYS chỉ lấy
  // từ HOLD AE và bốn nghiệp vụ HOLD, ADD, CANCEL, BONUS.
  const referenceRows = [...sheet1Rows, ...holdRows, ...bankRows];
  const resolveIdentity = buildIdentityResolver(referenceRows);
  const dimensionHints = new Map<string, DimensionDescriptor>();

  referenceRows.forEach((row, index) => {
    const identityKey = resolveIdentity(row, index);
    const incoming = dimensionsOf(row);
    const existing = dimensionHints.get(identityKey);
    dimensionHints.set(identityKey, {
      l07: existing?.l07 || incoming.l07,
      business: existing?.business || incoming.business,
    });
  });

  const holdEntries: HoldEntry[] = holdRows.flatMap((row, index) => {
    if (!isUsableHoldRow(row)) return [];
    const operation = classifyHoldOperation(row);
    if (!operation) return [];

    const reportPeriod = parseMonthPeriod(
      readFirst(row, ["Tháng báo cáo", "_fileMonth", "Tháng", "Month"]),
      currentPeriod,
    );
    if (!reportPeriod) return [];

    const occurrencePeriod = parseMonthPeriod(
      readFirst(row, [
        "Tháng phát sinh",
        "Month of Occurrence",
        "Tháng lương",
      ]),
      reportPeriod,
    );
    if (!occurrencePeriod) return [];

    const identityKey = resolveIdentity(
      row,
      sheet1Rows.length + bankRows.length + index,
    );
    const directDimensions = dimensionsOf(row);
    const hint = dimensionHints.get(identityKey);
    const l07 = directDimensions.l07 || hint?.l07 || "CHƯA XÁC ĐỊNH";
    const business =
      directDimensions.business ||
      hint?.business ||
      (l07 !== "CHƯA XÁC ĐỊNH" ? getBusinessFromL07(l07) : "") ||
      "OTHER";

    return [
      {
        reportPeriod,
        occurrencePeriod,
        operation,
        amount: Math.abs(moneyOf(row)),
        business,
      },
    ];
  });

  const buckets = new Map<string, HoldLifecycleBucket>();
  holdEntries.forEach((entry) => {
    const reportCompare = comparePeriods(entry.reportPeriod, currentPeriod);
    const occurrenceCompare = comparePeriods(
      entry.occurrencePeriod,
      currentPeriod,
    );
    if (reportCompare > 0 || occurrenceCompare > 0) return;

    const key = `${entry.business}|${entry.occurrencePeriod.key}`;
    const bucket =
      buckets.get(key) || createBucket(entry.business, entry.occurrencePeriod);

    if (entry.operation === "HOLD") {
      // HOLD phat sinh thuoc ky nao duoc xac dinh boi "Thang phat sinh",
      // khong phai boi thang bao cao cua dong du lieu. Mot khoan HOLD cu co the
      // tiep tuc xuat hien trong file cua ky hien tai, nhung no chi la so du dau
      // ky va tuyet doi khong duoc ghi nhan lai vao HOLD phat sinh tai ky.
      if (occurrenceCompare < 0) bucket.holdBeforePeriod += entry.amount;
      else if (occurrenceCompare === 0 && reportCompare === 0) {
        bucket.holdInPeriod += entry.amount;
      }
    } else if (entry.operation === "ADD") {
      bucket.addPaymentPeriods.set(entry.reportPeriod.key, entry.reportPeriod);
      if (reportCompare < 0) bucket.addBeforePeriod += entry.amount;
      else bucket.addInPeriod += entry.amount;
    } else if (entry.operation === "CANCEL") {
      if (reportCompare < 0) bucket.cancelBeforePeriod += entry.amount;
      else bucket.cancelInPeriod += entry.amount;
    } else if (entry.operation === "BONUS" && reportCompare === 0) {
      bucket.bonusInPeriod += entry.amount;
    }

    buckets.set(key, bucket);
  });

  const reportLabel = formatPeriod(currentPeriod);
  const summaryRows = Array.from(buckets.values())
    .map((bucket): PayrollBuMonthSummaryRow => {
      const holdGross = bucket.holdBeforePeriod + bucket.holdInPeriod;
      const openingBalance = Math.max(
        bucket.holdBeforePeriod -
          bucket.addBeforePeriod +
          bucket.cancelBeforePeriod,
        0,
      );
      const remainingBalance = Math.max(
        holdGross -
          bucket.addBeforePeriod -
          bucket.addInPeriod +
          bucket.cancelBeforePeriod +
          bucket.cancelInPeriod,
        0,
      );
      const paymentMonths = Array.from(bucket.addPaymentPeriods.values())
        .sort(comparePeriods)
        .map(formatPeriod);
      const movements: string[] = [];
      if (bucket.holdInPeriod > 0) movements.push("HOLD mới");
      if (bucket.addInPeriod > 0) movements.push("Thanh toán HOLD");
      if (bucket.cancelInPeriod > 0) movements.push("CANCEL");
      if (bucket.bonusInPeriod > 0) movements.push("BONUS");

      let status = "Chưa thanh toán";
      if (holdGross <= 0) status = "Không có HOLD";
      else if (remainingBalance <= 0) status = "Đã tất toán";
      else if (bucket.addBeforePeriod + bucket.addInPeriod > 0) {
        status = "Thanh toán một phần";
      }

      return {
        id: `${bucket.business}|${bucket.occurrencePeriod.key}`,
        "Tháng HOLD": formatPeriod(bucket.occurrencePeriod),
        "Kỳ báo cáo": reportLabel,
        BU: bucket.business,
        // Bao ve quy tac hien thi: cac HOLD co thang phat sinh truoc ky bao cao
        // luon bang 0 tai nhom III. PHAT SINH TAI KY BAO CAO.
        "HOLD phát sinh":
          comparePeriods(bucket.occurrencePeriod, currentPeriod) === 0
            ? bucket.holdInPeriod
            : 0,
        "Số dư HOLD đầu kỳ": openingBalance,
        "Thanh toán HOLD tại kỳ": bucket.addInPeriod,
        "Tháng thanh toán tại kỳ":
          bucket.addInPeriod > 0 ? reportLabel : "",
        "Các tháng đã thanh toán": paymentMonths.join(", "),
        "CANCEL tại kỳ": bucket.cancelInPeriod,
        "BONUS tại kỳ": bucket.bonusInPeriod,
        "Số dư HOLD còn lại": remainingBalance,
        "Diễn biến tại kỳ": movements.join(" + ") || "Không phát sinh",
        "Trạng thái HOLD": status,
      };
    })
    .filter(
      (row) =>
        row["HOLD phát sinh"] > 0 ||
        row["Số dư HOLD đầu kỳ"] > 0 ||
        row["Thanh toán HOLD tại kỳ"] > 0 ||
        row["CANCEL tại kỳ"] > 0 ||
        row["BONUS tại kỳ"] > 0 ||
        row["Số dư HOLD còn lại"] > 0,
    )
    .sort((left, right) => {
      const businessCompare = left.BU.localeCompare(right.BU, "vi");
      if (businessCompare !== 0) return businessCompare;
      const leftPeriod = parseMonthPeriod(left["Tháng HOLD"], currentPeriod)!;
      const rightPeriod = parseMonthPeriod(right["Tháng HOLD"], currentPeriod)!;
      return comparePeriods(leftPeriod, rightPeriod);
    });

  const businessUnits = Array.from(
    new Set(summaryRows.map((row) => row.BU).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right, "vi"));

  return {
    currentPeriod: reportLabel,
    businessUnits,
    summaryRows,
  };
}
