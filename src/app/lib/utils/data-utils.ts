export function parseMoneyToNumber(val: any): number {
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (typeof val === "bigint") return Number(val);
  if (val instanceof Date) {
    // A calendar value is never a payroll amount. Converting it back to an
    // Excel serial leaks dates such as 20/07/2026 into charge columns as 46223.
    return 0;
  }
  if (val === null || val === undefined || val === "") return 0;

  const source = String(val).trim();
  if (!source) return 0;

  // Dates returned by the Excel worker are serialized to ISO strings. They
  // must never be stripped down to digits and treated as payroll amounts.
  if (
    /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/i.test(
      source,
    ) ||
    /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(source)
  ) {
    return 0;
  }

  // Preserve scientific notation when Excel/browser already supplied it.
  if (/^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/.test(source)) {
    const scientificValue = Number(source);
    return Number.isFinite(scientificValue) ? scientificValue : 0;
  }

  const isNegativeByParentheses = /^\(.*\)$/.test(source);
  let numericText = source
    .replace(/[\s\u00a0]/g, "")
    .replace(/[^\d.,+-]/g, "");

  const isNegative = isNegativeByParentheses || numericText.includes("-");
  numericText = numericText.replace(/[+-]/g, "");
  if (!numericText || !/\d/.test(numericText)) return 0;

  const dotCount = (numericText.match(/\./g) || []).length;
  const commaCount = (numericText.match(/,/g) || []).length;

  if (dotCount > 0 && commaCount > 0) {
    // When both separators exist, the last one is the decimal separator and
    // every earlier separator is a thousands separator.
    const decimalIndex = Math.max(
      numericText.lastIndexOf("."),
      numericText.lastIndexOf(","),
    );
    const integerPart = numericText.slice(0, decimalIndex).replace(/[.,]/g, "");
    const decimalPart = numericText.slice(decimalIndex + 1).replace(/[.,]/g, "");
    numericText = decimalPart
      ? `${integerPart}.${decimalPart}`
      : integerPart;
  } else if (dotCount > 0 || commaCount > 0) {
    const separator = dotCount > 0 ? "." : ",";
    const parts = numericText.split(separator);
    const lastPart = parts[parts.length - 1];
    const separatorIsDecimal =
      lastPart.length > 0 &&
      (lastPart.length <= 2 ||
        (parts.length === 2 &&
          lastPart.length === 3 &&
          parts[0].length > 3));

    numericText = separatorIsDecimal
      ? `${parts.slice(0, -1).join("")}.${lastPart}`
      : parts.join("");
  }

  const parsedValue = Number(numericText);
  if (!Number.isFinite(parsedValue)) return 0;
  return isNegative ? -Math.abs(parsedValue) : parsedValue;
}
export function formatNumber(
  val: any,
  type: "string" | "number" | "money" | "date" = "number",
): string {
  if (val === null || val === undefined || val === "") return "";
  if (type === "string") return String(val);
  if (type === "date") {
    const dateValue = val instanceof Date ? val : parseAnyDate(String(val));
    if (!dateValue || isNaN(dateValue.getTime())) return String(val);
    return dateValue.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  const numericValue = parseMoneyToNumber(val);
  const rounded = Math.round(numericValue);
  return new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rounded);
}
export function formatMoneyVND(val: any): string {
  const n = parseMoneyToNumber(val);
  const rounded = Math.round(n);
  return rounded.toLocaleString("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
export function removeVietnameseTones(str: string): string {
  if (!str) return '';
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

function normalizeColumnRuleKey(columnKey: string): string {
  return removeVietnameseTones(String(columnKey || ""))
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isNonSummableTextColumn(columnKey: string): boolean {
  const normalized = normalizeColumnRuleKey(columnKey);
  return (
    normalized === "THANG" ||
    normalized.includes("THANG PHAT SINH") ||
    normalized.includes("THANG BAO CAO") ||
    normalized.includes("THANG HOLD") ||
    normalized.includes("THANG THANH TOAN") ||
    normalized.includes("THANH TOAN VAO THANG") ||
    normalized.includes("CAC THANG") ||
    normalized.includes("KY BAO CAO") ||
    normalized.includes("KY DANG THEO DOI") ||
    normalized.includes("REPORTING MONTH") ||
    normalized.includes("ARISING MONTH") ||
    normalized.includes("SALARY SCALE")
  );
}

export function isChargeAmountColumn(columnKey: string): boolean {
  const normalized = normalizeColumnRuleKey(columnKey);
  const compact = normalized.replace(/\s+/g, "");

  if (
    normalized.includes("CHARGE TYPE") ||
    normalized.includes("CHARGE TO CENTER") ||
    normalized.includes("CHARGE CENTER") ||
    normalized.includes("CHARGE CODE")
  ) {
    return false;
  }

  return (
    normalized.includes("CHARGE") ||
    /^(LDEC|LDEM|LPAR|LRET|MOTH)\d*/.test(compact) ||
    normalized.includes("EXTRA SUMMER INSTRUCTORS")
  );
}
export function formatIdNumber(id: unknown): string {
  if (id === undefined || id === null || id === "") return "";

  let normalized = String(id).trim().replace(/[\s\u00a0]/g, "");

  // Excel can expose an ID as scientific notation or as a decimal ending in
  // zero. Convert those forms back to their integer representation first.
  if (/^[+]?\d+(?:\.\d+)?[eE][+-]?\d+$/.test(normalized)) {
    const numericId = Number(normalized);
    if (Number.isSafeInteger(numericId) && numericId >= 0) {
      normalized = numericId.toLocaleString("fullwide", {
        useGrouping: false,
        maximumFractionDigits: 0,
      });
    }
  } else if (/^\d+\.0+$/.test(normalized)) {
    normalized = normalized.replace(/\.0+$/, "");
  } else if (/^\+\d+$/.test(normalized)) {
    normalized = normalized.slice(1);
  }

  return /^\d+$/.test(normalized) && normalized.length < 12
    ? normalized.padStart(12, "0")
    : normalized;
}
export function prepareDataForExport(data: any[]): any[] {
  return data;
}
export function parseAnyDate(value: unknown, preferredYear?: number): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel serial date (1900 date system). Day-only headers are resolved by
    // their owning import flow instead of being treated as serial dates.
    if (value > 59 && value < 100000) {
      const excelEpoch = Date.UTC(1899, 11, 30);
      const parsed = new Date(excelEpoch + value * 86400000);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  // Recover Date objects serialized by the legacy roster mapper as
  // "undefined/undefined/Mon Jun 01 2026 ...". Existing browser data may
  // retain that shape even after the importer is upgraded.
  const legacyDateTail = raw.match(/^undefined\/undefined\/(.+)$/i);
  if (legacyDateTail) {
    const recovered = new Date(legacyDateTail[1]);
    return isNaN(recovered.getTime()) ? null : recovered;
  }

  if (/(?:^|[/\s])undefined(?:$|[/\s])/i.test(raw)) return null;

  const dmy = raw.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2}|\d{4}))$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    const parsed = new Date(year, month - 1, day);
    return parsed.getFullYear() === year &&
      parsed.getMonth() === month - 1 &&
      parsed.getDate() === day
      ? parsed
      : null;
  }

  const dayOnly = raw.match(/^(\d{1,2})$/);
  if (dayOnly && preferredYear) return null;

  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function isDateColumn(columnKey?: unknown, columnLabel?: unknown, type?: unknown): boolean {
  if (type === "date") return true;
  const normalized = removeVietnameseTones(
    `${String(columnKey || "")} ${String(columnLabel || "")}`,
  )
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return /(^| )(date|ngay|full date|session date)( |$)/.test(normalized);
}

export function normalizeDateFilterValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const raw = String(value).trim();
  if (!raw) return "";

  const isRecoverableLegacyDate = /^undefined\/undefined\//i.test(raw);
  if (!isRecoverableLegacyDate && /undefined|null|invalid date/i.test(raw)) {
    return "";
  }

  // Preserve the calendar day encoded by Excel/worker ISO strings. Formatting
  // an ISO midnight through the runtime timezone can otherwise shift it to the
  // previous day in the filter menu.
  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
  if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;

  const parsed = parseAnyDate(value);
  if (!parsed) return raw;
  return parsed.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}
const normalizedRowKeyCache = new WeakMap<object, Map<string, string>>();

function normalizeLookupKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[Đđ]/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Read the first matching value from an imported row.
 *
 * Excel/Google Sheet headers are user-controlled, so callers can provide a
 * list of aliases. Matching is accent/case/spacing insensitive and the
 * normalized key map is cached per row to avoid repeatedly scanning every
 * header while processing large workbooks.
 */
export function getVal(
  row: any,
  keyOrAliases: string | readonly string[],
): any {
  if (!row || typeof row !== "object") return null;

  const aliases = Array.isArray(keyOrAliases)
    ? keyOrAliases
    : [keyOrAliases];
  let firstDefinedValue: any = null;

  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) {
      const value = row[alias];
      if (value !== undefined && value !== null && value !== "") return value;
      if (firstDefinedValue === null && value !== undefined) {
        firstDefinedValue = value;
      }
    }
  }

  let normalizedKeys = normalizedRowKeyCache.get(row);
  if (!normalizedKeys) {
    normalizedKeys = new Map<string, string>();
    Object.keys(row).forEach((rowKey) => {
      const normalized = normalizeLookupKey(rowKey);
      if (normalized && !normalizedKeys!.has(normalized)) {
        normalizedKeys!.set(normalized, rowKey);
      }
    });
    normalizedRowKeyCache.set(row, normalizedKeys);
  }

  for (const alias of aliases) {
    const actualKey = normalizedKeys.get(normalizeLookupKey(alias));
    if (!actualKey) continue;
    const value = row[actualKey];
    if (value !== undefined && value !== null && value !== "") return value;
    if (firstDefinedValue === null && value !== undefined) {
      firstDefinedValue = value;
    }
  }

  return firstDefinedValue;
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

  const buffer = await file.arrayBuffer();
  if (file.name.toLowerCase().endsWith(".gsheet")) {
    const pointerText = new TextDecoder("utf-8").decode(buffer).trim();
    if (pointerText.startsWith("{")) {
      let pointer: {
        url?: unknown;
        doc_id?: unknown;
        resource_id?: unknown;
      } | null = null;
      try {
        pointer = JSON.parse(pointerText) as typeof pointer;
      } catch {
        // Nội dung .gsheet đã là CSV thật, không phải file con trỏ JSON.
      }

      if (pointer) {
        const url = String(pointer.url || "").trim();
        const documentId = String(pointer.doc_id || "").trim();
        const resourceId = String(pointer.resource_id || "")
          .replace(/^spreadsheet:/i, "")
          .trim();
        const source =
          url ||
          (documentId
            ? `https://docs.google.com/spreadsheets/d/${documentId}`
            : resourceId
              ? `https://docs.google.com/spreadsheets/d/${resourceId}`
              : "");

        if (source) {
          const downloadedFile = await fetchGoogleSheetAsFile(
            source,
            file.name,
          );
          return {
            buffer: await downloadedFile.arrayBuffer(),
            name: downloadedFile.name,
          };
        }
      }
    }
  }

  return {
    buffer,
    name: file.name,
  };
}
export function formatTime12Hour(timeStr: string): string {
  return String(timeStr);
}
export const COMMON_FIELD_ALIASES: Record<string, string[]> = {
  No: ["STT", "NO", "NUMBER", "SỐ THỨ TỰ"],
  "ID Number": [
    "ID",
    "MÃ NV",
    "CMND",
    "CCCD",
    "MÃ NHÂN VIÊN",
    "EMPLOYEE ID",
    "MÃ SỐ",
    "ID NUMBER",
  ],
  "Full Name": [
    "NAME",
    "TÊN",
    "HỌ VÀ TÊN",
    "TÊN NHÂN VIÊN",
    "FULL NAME",
    "TEACHER",
    "GIÁO VIÊN",
  ],
  "Full name": [
    "NAME",
    "TÊN",
    "HỌ VÀ TÊN",
    "TÊN NHÂN VIÊN",
    "FULL NAME",
  ],
  "Salary Scale": [
    "SCALE",
    "MỨC LƯƠNG",
    "RANK",
    "BẬC LƯƠNG",
    "SALARY RANK",
  ],
  From: [
    "FROM",
    "TỪ",
    "TỪ NGÀY",
    "START DATE",
    "NGÀY BẮT ĐẦU",
    "START",
    "DATE FROM",
    "FROM DATE",
  ],
  To: [
    "TO",
    "ĐẾN",
    "ĐẾN NGÀY",
    "END DATE",
    "NGÀY KẾT THÚC",
    "END",
    "DATE TO",
    "TO DATE",
  ],
  "Bank Account Number": [
    "ACCOUNT",
    "TÀI KHOẢN",
    "STK",
    "SỐ TÀI KHOẢN",
    "BANK ACCOUNT",
  ],
  "Bank Name": [
    "BANK NAME",
    "NGÂN HÀNG",
    "TÊN NGÂN HÀNG",
    "TEN NGAN HANG",
  ],
  "CITAD code": ["CITAD", "MÃ CITAD", "CITAD CODE"],
  "TAX CODE": ["TAX", "MST", "MÃ SỐ THUẾ", "TAX CODE"],
  "Contract No": [
    "CONTRACT",
    "HỢP ĐỒNG",
    "SỐ HỢP ĐỒNG",
    "CONTRACT NO",
  ],
  "CHARGE TO LXO": ["LXO", "CHARGE LXO", "CHARGE TO LXO"],
  "CHARGE TO EC": ["EC", "CHARGE EC", "CHARGE TO EC"],
  "CHARGE TO PT-DEMO": [
    "PT-DEMO",
    "CHARGE PT-DEMO",
    "CHARGE TO PT-DEMO",
  ],
  "Charge MKT Local": [
    "MKT",
    "MKT LOCAL",
    "CHARGE MKT LOCAL",
    "CHARGE TO MKT LOCAL",
    "CHARGE MKT",
    "CHARGE TO CENTER MKT",
  ],
  "CHARGE TO OTHER": ["CHARGE OTHER", "CHARGE TO OTHER", "OTHER"],
  "Charge Renewal Projects": [
    "RENEWAL",
    "RENEWAL PROJECTS",
    "CHARGE TO RENEWAL PROJECTS",
  ],
  "Charge Discovery Camp": [
    "DISCOVERY",
    "DISCOVERY CAMP",
    "CHARGE TO DISCOVERY CAMP",
  ],
  "Charge Summer Outing": [
    "SUMMER OUTING",
    "CHARGE TO SUMMER OUTING",
  ],
  "Charge Summer Instructors": [
    "SUMMER INSTRUCTORS",
    "CHARGE TO SUMMER INSTRUCTORS",
  ],
  "TOTAL PAYMENT": [
    "TOTAL",
    "TỔNG",
    "THỰC NHẬN",
    "TỔNG THANH TOÁN",
    "TOTAL PAYMENT",
    "NET PAY",
    "AMOUNT",
    "BONUS",
  ],
  Center: [
    "CENTER",
    "COST CENTER",
    "TRUNG TÂM",
    "AE CODE",
    "AE",
    "MÃ AE",
    "MÃ TT",
    "MÃ TRUNG TÂM",
    "L07",
  ],
  Business: ["BUSINESS", "KHỐI", "BUS", "BỘ PHẬN", "BU"],
  Type: ["TYPE", "EVENT TYPE", "CLASS TYPE", "LOẠI LỚP", "LOẠI"],
  Class: [
    "CLASS",
    "CLASS NAME",
    "TÊN LỚP",
    "LỚP",
    "MÃ LỚP",
    "CLASS CODE",
  ],
  Date: ["DATE", "NGÀY", "DATE OF CLASS", "NGÀY DẠY", "SCHEDULE DATE"],
  Duration: ["DURATION", "HOURS", "SỐ GIỜ", "GIỜ", "TOTAL HOURS"],
};

const normalizeHeaderForMatching = (value: string): string =>
  removeVietnameseTones(String(value || ""))
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getHeaderTokenScore = (left: string, right: string): number => {
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let intersectionSize = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) intersectionSize++;
  });
  return (
    (intersectionSize / (leftTokens.size + rightTokens.size - intersectionSize)) *
    100
  );
};

export function scoreMatch(
  header: string,
  target: string,
  aliases: string[] = [],
): number {
  const normalizedHeader = normalizeHeaderForMatching(header);
  const normalizedTarget = normalizeHeaderForMatching(target);
  if (!normalizedHeader || !normalizedTarget) return 0;
  if (normalizedHeader === normalizedTarget) return 100;

  const normalizedAliases = aliases.map(normalizeHeaderForMatching);
  if (normalizedAliases.includes(normalizedHeader)) return 95;

  if (normalizedHeader.includes(normalizedTarget)) {
    return 85;
  }

  if (
    normalizedAliases.some(
      (alias) =>
        alias &&
        normalizedHeader.includes(alias),
    )
  ) {
    return 80;
  }

  const candidateScores = [
    getHeaderTokenScore(normalizedHeader, normalizedTarget),
    ...normalizedAliases.map((alias) =>
      getHeaderTokenScore(normalizedHeader, alias),
    ),
  ];
  const bestTokenScore = Math.max(...candidateScores);
  return bestTokenScore >= 60 ? Math.min(79, bestTokenScore) : 0;
}
export function normalizeId(id: any): string { return String(id); }
export function toVietnamDateString(date: Date): string { return String(date); }
export function generateUUID(): string { return Math.random().toString(); }
export async function fetchGoogleSheetAsFile(
  url: string,
  name: string,
): Promise<File> {
  const sourceUrl = String(url || "").trim();
  if (!sourceUrl) {
    throw new Error("URL Google Sheet đang để trống.");
  }

  const response = await fetch("/api/gs-export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: sourceUrl }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    let message = responseText;
    try {
      const parsed = JSON.parse(responseText) as { error?: unknown };
      message = String(parsed.error || responseText);
    } catch {
      // Giữ nguyên nội dung lỗi dạng text từ API.
    }
    throw new Error(message || "Không thể tải dữ liệu Google Sheet.");
  }

  const contentType = (
    response.headers.get("content-type") ||
    "text/csv; charset=utf-8"
  ).toLowerCase();
  const encodedSourceName = response.headers.get("x-spreadsheet-name") || "";
  let sourceName = "";
  if (encodedSourceName) {
    try {
      sourceName = decodeURIComponent(encodedSourceName);
    } catch {
      sourceName = encodedSourceName;
    }
  }

  const isExcel =
    contentType.includes("spreadsheetml") ||
    contentType.includes("application/vnd.ms-excel");
  const extension = isExcel ? ".xlsx" : ".csv";
  const requestedName = String(sourceName || name || "GoogleSheet").trim();
  const finalName = /\.(xlsx?|xls|csv|txt|gsheet)$/i.test(requestedName)
    ? isExcel
      ? requestedName.replace(/\.(csv|txt|gsheet)$/i, extension)
      : requestedName.replace(/\.(xlsx?|xls)$/i, extension)
    : `${requestedName}${extension}`;
  const fileBuffer = await response.arrayBuffer();

  if (fileBuffer.byteLength === 0) {
    throw new Error("Google Sheet trả về file rỗng.");
  }

  return new File([fileBuffer], finalName, {
    type: isExcel
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "text/csv;charset=utf-8",
  });
}
export function isMoneyColumn(col: string): boolean {
  const normalized = normalizeColumnRuleKey(col);
  if (!normalized || isNonSummableTextColumn(col)) return false;

  if (
    normalized.includes("DATE") ||
    normalized.includes("NGAY") ||
    normalized === "FROM" ||
    normalized === "TO" ||
    normalized.includes("ID NUMBER") ||
    normalized.includes("ACCOUNT NUMBER") ||
    normalized.includes("BANK ACCOUNT") ||
    normalized.includes("CENTER") ||
    normalized.includes("CITAD") ||
    normalized.includes("TAX CODE") ||
    normalized.includes("CONTRACT")
  ) {
    return false;
  }

  return (
    isChargeAmountColumn(col) ||
    normalized.includes("TOTAL") ||
    normalized.includes("PAYMENT") ||
    normalized.includes("AMOUNT") ||
    normalized.includes("SALARY") ||
    normalized.includes("LUONG") ||
    normalized.includes("SO TIEN") ||
    normalized.includes("TIEN THUONG") ||
    normalized.includes("BONUS")
  );
}
export async function fetchWithBackoff(fn: any): Promise<any> { return await fn(); }
