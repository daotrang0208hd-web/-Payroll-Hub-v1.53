/* eslint-disable @typescript-eslint/no-explicit-any */
import { parseMoneyToNumber, removeVietnameseTones } from "./data-utils";

export interface GrossPaySourceChargeColumn {
  sourceIndex: number;
  sourceHeader: string;
  outputHeader: string;
}

const GROSS_PAY_CHARGE_ALIASES: Array<{
  outputHeader: string;
  aliases: string[];
}> = [
  {
    outputHeader: "CHARGE TO LXO",
    aliases: ["CHARGE TO LXO", "CHARGE LXO", "LXO", "CHARGE LXP"],
  },
  {
    outputHeader: "CHARGE TO EC",
    aliases: ["CHARGE TO EC", "CHARGE EC", "EC"],
  },
  {
    outputHeader: "CHARGE TO PT-DEMO",
    aliases: [
      "CHARGE TO PT DEMO",
      "CHARGE PT DEMO",
      "PT DEMO",
    ],
  },
  {
    outputHeader: "Charge MKT Local",
    aliases: [
      "CHARGE MKT LOCAL",
      "CHARGE TO MKT LOCAL",
      "CHARGE MKT",
      "MKT LOCAL",
      "CHARGE TO CENTER MKT",
      "MKT",
    ],
  },
  {
    outputHeader: "CHARGE TO OTHER",
    aliases: ["CHARGE TO OTHER", "CHARGE OTHER", "OTHER"],
  },
  {
    outputHeader: "Charge Renewal Projects",
    aliases: [
      "CHARGE RENEWAL PROJECTS",
      "CHARGE TO RENEWAL PROJECTS",
      "RENEWAL PROJECTS",
      "CHARGE RENEWAL",
      "RENEWAL",
    ],
  },
  {
    outputHeader: "Charge Discovery Camp",
    aliases: [
      "CHARGE DISCOVERY CAMP",
      "CHARGE TO DISCOVERY CAMP",
      "DISCOVERY CAMP",
      "CHARGE DISCOVERY",
      "DISCOVERY",
    ],
  },
  {
    outputHeader: "Charge Summer Outing",
    aliases: [
      "CHARGE SUMMER OUTING",
      "CHARGE TO SUMMER OUTING",
      "SUMMER OUTING",
      "CHARGE SUMMER",
    ],
  },
  {
    outputHeader: "Charge Summer Instructors",
    aliases: [
      "CHARGE SUMMER INSTRUCTORS",
      "CHARGE TO SUMMER INSTRUCTORS",
      "SUMMER INSTRUCTORS",
      "CHARGE INSTRUCTOR",
      "CHARGE INSTRUCTORS",
    ],
  },
  {
    outputHeader: "Extra Summer Instructors",
    aliases: [
      "EXTRA SUMMER INSTRUCTORS",
      "CHARGE TO EXTRA SUMMER INSTRUCTORS",
      "EXTRA SUMMER INSTRUCTOR",
      "EXTRA INSTRUCTOR",
      "EXTRA INSTRUCTORS",
    ],
  },
];

function normalizeGrossPayHeader(value: unknown): string {
  return removeVietnameseTones(String(value || ""))
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GROSS_PAY_ALIAS_LOOKUP = new Map<string, string>();
GROSS_PAY_CHARGE_ALIASES.forEach(({ outputHeader, aliases }) => {
  GROSS_PAY_ALIAS_LOOKUP.set(normalizeGrossPayHeader(outputHeader), outputHeader);
  aliases.forEach((alias) => {
    GROSS_PAY_ALIAS_LOOKUP.set(normalizeGrossPayHeader(alias), outputHeader);
  });
});

/**
 * Convert one Sheet 1 charge header to the column displayed by Gross Pay.
 * Empty string means the source column is metadata/text and must not be added
 * to TOTAL PAYMENT.
 */
export function canonicalizeGrossPayChargeHeader(
  sourceHeader: unknown,
): string {
  const original = String(sourceHeader || "").trim();
  const normalized = normalizeGrossPayHeader(original);
  if (!normalized) return "";

  const knownHeader = GROSS_PAY_ALIAS_LOOKUP.get(normalized);
  if (knownHeader) return knownHeader;

  // CHARGE TO CENTER is a center code in Roster. Only the explicit MKT
  // amount alias above is a money column in Gross Pay.
  if (
    normalized === "CHARGE TO CENTER" ||
    normalized === "CHARGE CENTER" ||
    normalized.includes("CENTER CODE") ||
    normalized.includes("CHARGE TYPE") ||
    normalized.includes("CHARGE CODE") ||
    normalized.includes("CHARGE NOTE") ||
    normalized.includes("TOTAL") ||
    normalized.includes("TONG")
  ) {
    return "";
  }

  if (normalized.includes("CHARGE")) return original;
  return "";
}

export function getGrossPaySourceChargeColumns(
  headers: readonly unknown[],
): GrossPaySourceChargeColumn[] {
  const result: GrossPaySourceChargeColumn[] = [];

  headers.forEach((sourceHeader, sourceIndex) => {
    const outputHeader = canonicalizeGrossPayChargeHeader(sourceHeader);
    if (!outputHeader) return;
    result.push({
      sourceIndex,
      sourceHeader: String(sourceHeader || "").trim(),
      outputHeader,
    });
  });

  return result;
}

export function isGrossPayChargeAmountColumn(header: unknown): boolean {
  return canonicalizeGrossPayChargeHeader(header) !== "";
}

/** Add newly discovered Sheet 1 amount columns immediately before TOTAL. */
export function mergeGrossPayHeaders(
  baseHeaders: readonly string[],
  additionalHeaders: readonly string[],
): string[] {
  const result = [...baseHeaders];
  const existing = new Set(result.map(normalizeGrossPayHeader));

  additionalHeaders.forEach((rawHeader) => {
    const header = canonicalizeGrossPayChargeHeader(rawHeader) || rawHeader;
    const normalized = normalizeGrossPayHeader(header);
    if (!normalized || existing.has(normalized)) return;

    const totalIndex = result.findIndex(
      (value) => normalizeGrossPayHeader(value) === "TOTAL PAYMENT",
    );
    result.splice(totalIndex === -1 ? result.length : totalIndex, 0, header);
    existing.add(normalized);
  });

  return result;
}

export function calculateGrossPayTotal(
  row: Record<string, any>,
  headers: readonly string[],
): number {
  const visited = new Set<string>();
  let total = 0;

  headers.forEach((header) => {
    const canonical = canonicalizeGrossPayChargeHeader(header);
    const key = normalizeGrossPayHeader(canonical);
    if (!canonical || visited.has(key)) return;
    visited.add(key);
    total += parseMoneyToNumber(row[header]);
  });

  return total;
}

/**
 * Apply the only Gross Pay-specific charge reassignment, then calculate the
 * displayed TOTAL PAYMENT from every displayed amount column.
 */
export function finalizeGrossPayAmounts(
  row: Record<string, any>,
  headers: readonly string[],
  moveOtherToMktLocal: boolean,
): number {
  if (moveOtherToMktLocal) {
    const otherAmount = parseMoneyToNumber(row["CHARGE TO OTHER"]);
    if (otherAmount !== 0) {
      row["Charge MKT Local"] =
        parseMoneyToNumber(row["Charge MKT Local"]) + otherAmount;
      row["CHARGE TO OTHER"] = 0;
    }
  }

  const total = calculateGrossPayTotal(row, headers);
  row["TOTAL PAYMENT"] = total;
  return total;
}

/** Stable identity that does not change when a payroll amount is corrected. */
export function getGrossPayRowIdentity(
  row: Record<string, any>,
  fallbackMonth = "",
): string {
  const sourceFile = normalizeGrossPayHeader(
    row["TÊN FILE"] || row._sourceFile,
  );
  const sourceSheet = normalizeGrossPayHeader(
    row._sourceSheet || row["Sheet Source"],
  );
  const sourceRow = String(row._sourceRow || "").trim();
  const month = normalizeGrossPayHeader(
    row["Tháng báo cáo"] || row._fileMonth || fallbackMonth,
  );

  if (sourceFile && sourceRow) {
    return `${sourceFile}|${sourceSheet}|${sourceRow}|${month}`;
  }

  const id = normalizeGrossPayHeader(row["ID Number"]);
  const fullName = normalizeGrossPayHeader(row["Full name"]);
  const l07 = normalizeGrossPayHeader(row.L07);
  const account = String(row["Bank Account Number"] || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  const total = Math.round(parseMoneyToNumber(row["TOTAL PAYMENT"]));
  return `${id}|${fullName}|${l07}|${account}|${month}|${total}`;
}
