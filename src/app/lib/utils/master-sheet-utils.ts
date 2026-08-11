/**
 * Normalize an Excel sheet name before matching it.
 *
 * The normalization is intentionally limited to matching only: the original
 * sheet name is still kept everywhere it is displayed or exported.
 */
export function normalizeMasterSheetName(sheetName: unknown): string {
  return String(sheetName ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[Đđ]/g, "D")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

const SHEET_ONE_PATTERN = /SHEET +1(?!\d)/;

function isNormalizedBankSheetName(normalizedName: string): boolean {
  return normalizedName.includes("BANK") || normalizedName.includes("NGAN HANG");
}

function isNormalizedSheetOneName(normalizedName: string): boolean {
  return SHEET_ONE_PATTERN.test(normalizedName);
}

export function isRosterMasterSheetName(sheetName: unknown): boolean {
  return normalizeMasterSheetName(sheetName).includes("ROSTER");
}

export function isBankMasterSheetName(sheetName: unknown): boolean {
  return isNormalizedBankSheetName(normalizeMasterSheetName(sheetName));
}

export function isSheetOneMasterSheetName(sheetName: unknown): boolean {
  const normalizedName = normalizeMasterSheetName(sheetName);

  // A real whitespace gap between SHEET and 1 is required. This accepts
  // "SHEET 1" and "SHEET    1", but rejects "SHEET1", "SHEET-1" and
  // longer sheet numbers such as "SHEET 10".
  return isNormalizedSheetOneName(normalizedName);
}

export function isHoldMasterSheetName(sheetName: unknown): boolean {
  return normalizeMasterSheetName(sheetName).includes("HOLD");
}

export function isBonusMasterSheetName(sheetName: unknown): boolean {
  return normalizeMasterSheetName(sheetName).includes("BONUS");
}

const BONUS_AMOUNT_HEADER_PRIORITY = [
  "BONUS",
  "BONUS AMOUNT",
  "TOTAL BONUS",
  "TOTAL PAYMENT",
  "SO TIEN BONUS",
  "SO TIEN THUONG",
  "TIEN THUONG",
  "THUONG",
  "AMOUNT",
] as const;

const BONUS_QUESTION_MARKERS = [
  "?",
  "DO YOU",
  "APPROVAL",
  "RECOMMEND",
  "REGARDING",
  "ELIGIB",
  "QUESTION",
  "COMMENT",
  "REASON",
  "NOTE",
] as const;

/**
 * Find the money column in a Bonus sheet.
 *
 * Exact aliases always win. This matters for real-world sheets that have both
 * a long survey question containing the word "bonus" and a separate column
 * whose header is exactly "Bonus".
 */
export function findBonusAmountColumn(headers: readonly unknown[]): number {
  const normalizedHeaders = headers.map(normalizeMasterSheetName);

  for (const alias of BONUS_AMOUNT_HEADER_PRIORITY) {
    const exactIndex = normalizedHeaders.indexOf(alias);
    if (exactIndex !== -1) return exactIndex;
  }

  let bestIndex = -1;
  let bestScore = -1;

  normalizedHeaders.forEach((header, index) => {
    if (
      !header ||
      BONUS_QUESTION_MARKERS.some((marker) => header.includes(marker))
    ) {
      return;
    }

    let score = -1;
    if (
      header.includes("SO TIEN BONUS") ||
      header.includes("SO TIEN THUONG") ||
      header.includes("TIEN THUONG")
    ) {
      score = 90;
    } else if (
      header.includes("BONUS") &&
      (header.includes("AMOUNT") ||
        header.includes("TOTAL") ||
        header.includes("PAYMENT") ||
        header.includes("VND"))
    ) {
      score = 80;
    } else if (
      header.includes("TOTAL PAYMENT") ||
      header.includes("PAYMENT AMOUNT")
    ) {
      score = 70;
    } else if (
      header.includes("BONUS") &&
      header.split(" ").length <= 4
    ) {
      score = 60;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

const isBonusIdentityHeader = (value: unknown): boolean => {
  const normalized = normalizeMasterSheetName(value);
  return (
    normalized.includes("CENTER") ||
    normalized.includes("TRUNG TAM") ||
    normalized.includes("MA AE") ||
    normalized === "L07" ||
    normalized.includes("FULL NAME") ||
    normalized.includes("HO VA TEN") ||
    normalized.includes("HO & TEN") ||
    normalized.includes("HO TEN") ||
    normalized.includes("NAME") ||
    normalized.includes("INSTRUCTOR") ||
    normalized.includes("ID NUMBER") ||
    normalized === "ID" ||
    normalized.endsWith(" ID") ||
    normalized.includes("CCCD") ||
    normalized.includes("EMAIL")
  );
};

/**
 * Locate the real column-header row in a Bonus sheet.
 * A one-cell title such as "Summer Instructors Bonus" is intentionally not
 * accepted as a header row because the amount and identity columns must be in
 * different cells.
 */
export function findBonusMasterHeaderRow(
  rows: unknown[][],
  maxRows = 100,
): number {
  let bestRowIndex = -1;
  let bestScore = -1;
  const rowLimit = Math.min(maxRows, rows.length);

  for (let rowIndex = 0; rowIndex < rowLimit; rowIndex++) {
    const row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
    const nonEmptyCells = row
      .map((value, columnIndex) => ({
        value,
        columnIndex,
        normalized: normalizeMasterSheetName(value),
      }))
      .filter((cell) => cell.normalized !== "");

    if (nonEmptyCells.length < 2) continue;

    const amountColumnIndex = findBonusAmountColumn(row);
    const identityColumns = nonEmptyCells.filter((cell) =>
      isBonusIdentityHeader(cell.value),
    );
    const hasDistinctAmountAndIdentity =
      amountColumnIndex !== -1 &&
      identityColumns.some(
        (identityCell) => identityCell.columnIndex !== amountColumnIndex,
      );

    if (!hasDistinctAmountAndIdentity) continue;

    const amountHeader = normalizeMasterSheetName(row[amountColumnIndex]);
    const amountScore = BONUS_AMOUNT_HEADER_PRIORITY.includes(
      amountHeader as (typeof BONUS_AMOUNT_HEADER_PRIORITY)[number],
    )
      ? 20
      : 10;

    const score =
      amountScore +
      identityColumns.length * 3 +
      Math.min(nonEmptyCells.length, 10);
    if (score > bestScore) {
      bestScore = score;
      bestRowIndex = rowIndex;
    }
  }

  return bestRowIndex;
}

export function isRelevantMasterSheetName(
  sheetName: unknown,
  isMktFile: boolean,
): boolean {
  const normalizedName = normalizeMasterSheetName(sheetName);
  // Roster/Q_roster is the authoritative MKT Local source. Detect it from
  // the sheet itself because file names, bank labels and sheet order vary.
  if (isRosterMasterSheetName(sheetName)) return true;

  if (isMktFile) {
    return isBonusMasterSheetName(sheetName);
  }

  return (
    isNormalizedBankSheetName(normalizedName) ||
    isNormalizedSheetOneName(normalizedName) ||
    normalizedName.includes("HOLD") ||
    normalizedName.includes("ADD") ||
    normalizedName.includes("SUMMER") ||
    normalizedName.includes("BONUS") ||
    normalizedName.includes("SO SANH AE")
  );
}

export type MasterSheetKind =
  | "roster"
  | "bank"
  | "sheet1"
  | "hold"
  | "bonus"
  | "compare"
  | "unknown";

/**
 * Detect a Master sheet from both its name and its header content. Real files
 * often rename sheets or place them in an arbitrary order, so name-only
 * filtering can incorrectly mark a valid upload as an invalid format.
 */
export function detectMasterSheetKind(
  sheetName: unknown,
  rows: readonly unknown[][] = [],
): MasterSheetKind {
  const normalizedName = normalizeMasterSheetName(sheetName);
  if (isRosterMasterSheetName(sheetName)) return "roster";
  if (isBankMasterSheetName(sheetName)) return "bank";
  if (isSheetOneMasterSheetName(sheetName)) return "sheet1";
  if (isHoldMasterSheetName(sheetName) || normalizedName.includes("ADD")) return "hold";
  if (isBonusMasterSheetName(sheetName)) return "bonus";
  if (normalizedName.includes("SO SANH AE")) return "compare";

  const rowLimit = Math.min(rows.length, 50);
  for (let rowIndex = 0; rowIndex < rowLimit; rowIndex++) {
    const cells = (Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [])
      .map(normalizeMasterSheetName)
      .filter(Boolean);
    if (cells.length === 0) continue;

    const rowText = cells.join(" | ");
    const hasCenter =
      rowText.includes("CENTER") ||
      rowText.includes("TRUNG TAM") ||
      rowText.includes("MA AE") ||
      rowText.includes("L07");
    const hasIdentity =
      rowText.includes("ID NUMBER") ||
      rowText.includes("FULL NAME") ||
      rowText.includes("HO VA TEN") ||
      rowText.includes("MA NV") ||
      rowText.includes("EMPLOYEE ID");
    const hasAccount =
      rowText.includes("BANK ACCOUNT") ||
      rowText.includes("SO TAI KHOAN") ||
      rowText.includes("STK");
    const hasTotal =
      rowText.includes("TOTAL PAYMENT") ||
      rowText.includes("THUC NHAN") ||
      rowText.includes("TONG THANH TOAN") ||
      rowText.includes("SO TIEN");
    const hasType =
      cells.some((cell) => cell === "TYPE" || cell === "TASK TYPE" || cell === "TASKTYPE");
    const hasDuration =
      rowText.includes("DURATION") ||
      rowText.includes("TOTAL HOURS") ||
      rowText.includes("SO GIO");
    const moneyChargeCount = cells.filter(
      (cell) =>
        (cell.includes("CHARGE") && !cell.includes("CHARGE TO CENTER")) ||
        /^(LDEC|LDEM|LPAR|LRET|MOTH)/.test(cell),
    ).length;

    if (hasCenter && hasType && hasDuration) return "roster";
    if (hasIdentity && moneyChargeCount > 0) return "sheet1";
    if (hasIdentity && hasAccount && hasTotal) return "bank";
    if (hasIdentity && hasCenter && hasTotal) return "sheet1";
    if (hasIdentity && hasTotal && rowText.includes("HOLD")) return "hold";
    if (hasIdentity && rowText.includes("BONUS")) return "bonus";
  }

  return "unknown";
}
