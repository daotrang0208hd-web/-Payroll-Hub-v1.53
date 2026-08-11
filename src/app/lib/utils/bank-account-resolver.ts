/* eslint-disable @typescript-eslint/no-explicit-any */

export type BankAccountSource = "Gross Pay" | "Transaction" | "HOLD AE";

export interface BankAccountMatch {
  accountNumber: string;
  source: BankAccountSource;
  row: Record<string, any>;
}

const ID_KEYS = [
  "ID Number",
  "Document ID",
  "Document ID / CCCD",
  "CCCD",
  "Mã AE",
  "Mã ae",
] as const;

const ACCOUNT_KEYS = [
  "Bank Account Number",
  "Beneficiary Account No.",
  "Beneficiary Account No",
  "Số tài khoản",
  "STK",
] as const;

export function normalizePayrollId(value: unknown): string {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\.0+$/, "")
    .replace(/[^A-Z0-9]/g, "");

  return normalized === "0" ? "" : normalized;
}

export function getPayrollId(row: Record<string, any> | null | undefined): string {
  if (!row) return "";
  for (const key of ID_KEYS) {
    const id = normalizePayrollId(row[key]);
    if (id) return id;
  }
  return "";
}

export function normalizeBankAccount(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date || (typeof value === "number" && !Number.isFinite(value))) {
    return "";
  }

  const account = String(value).trim().replace(/\.0+$/, "");
  if (!account || account === "-" || account === "0") return "";
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(account)) return "";
  return account;
}

export function getBankAccount(row: Record<string, any> | null | undefined): string {
  if (!row) return "";
  for (const key of ACCOUNT_KEYS) {
    const account = normalizeBankAccount(row[key]);
    if (account) return account;
  }
  return "";
}

export function buildBankAccountIndex(
  sources: Array<{
    source: BankAccountSource;
    rows: Array<Record<string, any>> | null | undefined;
  }>,
): Map<string, BankAccountMatch> {
  const index = new Map<string, BankAccountMatch>();

  sources.forEach(({ source, rows }) => {
    (rows || []).forEach((row) => {
      const id = getPayrollId(row);
      const accountNumber = getBankAccount(row);
      if (!id || !accountNumber || index.has(id)) return;
      index.set(id, { accountNumber, source, row });
    });
  });

  return index;
}

export function normalizeReportMonth(value: unknown): string {
  const text = String(value ?? "").trim();
  const match = text.match(/(?:THÁNG|THANG|T)?\s*(\d{1,2})[./\- ]\s*(\d{4})/i);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}.${match[2]}`;
}

export function rowBelongsToReportMonth(
  row: Record<string, any>,
  reportMonth: string | undefined,
): boolean {
  const target = normalizeReportMonth(reportMonth);
  if (!target) return true;

  const rowMonth = normalizeReportMonth(
    row["Tháng báo cáo"] ?? row["_fileMonth"] ?? row["Tháng"] ?? row["Month"],
  );
  return !rowMonth || rowMonth === target;
}
