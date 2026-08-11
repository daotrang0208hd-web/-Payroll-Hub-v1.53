/* eslint-disable @typescript-eslint/no-explicit-any */
import * as XLSX from "xlsx";
import {
  COMMON_FIELD_ALIASES,
  getExcelFileBuffer,
  scoreMatch,
} from "../lib/utils/data-utils";
import {
  detectMasterSheetKind,
  isRelevantMasterSheetName,
} from "../lib/utils/master-sheet-utils";

export interface MasterSheetPayload {
  sheetName: string;
  rows: any[][];
}

export interface MasterWorkbookPayload {
  fileName: string;
  sheetNames: string[];
  mapping: Record<string, string>;
  sheets: MasterSheetPayload[];
}

interface ParseRequest {
  requestId: string;
  file: File;
  isMktFile: boolean;
  targetFields: string[];
  includeRows?: boolean;
}

function buildMapping(
  sheets: MasterSheetPayload[],
  targetFields: string[],
) {
  const headers: string[] = [];
  const seen = new Set<string>();

  sheets.forEach(({ rows }) => {
    for (let rowIndex = 0; rowIndex < Math.min(50, rows.length); rowIndex++) {
      const row = rows[rowIndex];
      if (!Array.isArray(row)) continue;
      const rowValues = row
        .map((cell) => String(cell ?? "").trim().replace(/\s+/g, " "))
        .filter((value) => value && Number.isNaN(Number(value)));
      const matchedTargetCount = targetFields.reduce((count, target) => {
        const aliases = COMMON_FIELD_ALIASES[target] || [target.toUpperCase()];
        const bestScore = rowValues.reduce(
          (best, value) => Math.max(best, scoreMatch(value, target, aliases)),
          0,
        );
        return bestScore >= 60 ? count + 1 : count;
      }, 0);

      // A real header row has several field labels. Scanning arbitrary data
      // cells made values such as contract codes containing "MKT" become a
      // fake mapping for Charge MKT Local.
      if (matchedTargetCount < 3) continue;

      rowValues.forEach((value) => {
        const key = value.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        headers.push(value);
      });
    }
  });

  const mapping: Record<string, string> = {};
  targetFields.forEach((target) => {
    const aliases = COMMON_FIELD_ALIASES[target] || [target.toUpperCase()];
    let bestHeader = "";
    let bestScore = 0;
    headers.forEach((header) => {
      const score = scoreMatch(header, target, aliases);
      if (score > bestScore) {
        bestScore = score;
        bestHeader = header;
      }
    });
    if (bestScore >= 60) mapping[target] = bestHeader;
  });

  return mapping;
}

export async function parseMasterWorkbook(
  file: File,
  isMktFile: boolean,
  targetFields: string[],
  includeRows = true,
): Promise<MasterWorkbookPayload> {
  const { buffer, name } = await getExcelFileBuffer(file);
  const lowerName = name.toLowerCase();
  const isCsv =
    lowerName.endsWith(".csv") ||
    lowerName.endsWith(".gsheet") ||
    lowerName.endsWith(".txt");

  const workbook = isCsv
    ? XLSX.read(new TextDecoder("utf-8").decode(buffer), {
        type: "string",
        cellDates: true,
        raw: true,
      })
    : XLSX.read(buffer, {
        type: "array",
        cellDates: true,
        raw: true,
        dense: true,
      });

  const readRows = (sheetName: string, maxRows?: number) => {
    const worksheet = workbook.Sheets[sheetName];
    const ref = worksheet?.["!ref"];
    let range: XLSX.Range | undefined;
    if (maxRows && ref) {
      range = XLSX.utils.decode_range(ref);
      range.e.r = Math.min(range.e.r, maxRows - 1);
    }

    return XLSX.utils.sheet_to_json<any[]>(worksheet, {
      header: 1,
      defval: "",
      raw: true,
      blankrows: false,
      ...(range ? { range } : {}),
    });
  };

  const headerSamples = new Map(
    workbook.SheetNames.map((sheetName) => [sheetName, readRows(sheetName, 50)]),
  );
  const relevantSheetNames = workbook.SheetNames.filter(
    (sheetName) =>
      isRelevantMasterSheetName(sheetName, isMktFile) ||
      detectMasterSheetKind(sheetName, headerSamples.get(sheetName) || []) !==
        "unknown",
  );

  // Mapping only needs the header area. Returning every row while the user is
  // merely confirming many files duplicates all workbook data in main-thread
  // memory and can make the tab crash.
  const mappingSheets = relevantSheetNames.map((sheetName) => ({
    sheetName,
    rows: headerSamples.get(sheetName) || [],
  }));
  const sheets = includeRows
    ? relevantSheetNames.map((sheetName) => ({
        sheetName,
        rows: readRows(sheetName),
      }))
    : [];

  return {
    fileName: name,
    sheetNames: workbook.SheetNames,
    mapping: buildMapping(mappingSheets, targetFields),
    sheets,
  };
}

if (typeof self !== "undefined") {
  self.onmessage = async (event: MessageEvent<ParseRequest>) => {
    const { requestId, file, isMktFile, targetFields, includeRows } = event.data;
    try {
      const result = await parseMasterWorkbook(
        file,
        isMktFile,
        targetFields,
        includeRows,
      );
      self.postMessage({ requestId, success: true, result: JSON.stringify(result) });
    } catch (error: any) {
      self.postMessage({
        requestId,
        success: false,
        error: error?.message || String(error),
      });
    }
  };
}
