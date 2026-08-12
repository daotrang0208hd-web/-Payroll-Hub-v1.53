/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, @typescript-eslint/no-unused-vars, react-refresh/only-export-components */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { DEFAULT_CENTERS } from "../../constants";
import localforage from "localforage";
import { toast } from "sonner";
import { AppData } from "../../types";
import { INITIAL_APP_DATA } from "../../constants/initial-data";
import { parseMoneyToNumber, removeVietnameseTones, formatIdNumber } from "../utils/data-utils";
import { resolveL07BuFromAeCode } from "../utils/center-utils";
import { fillMissingHoldBankAccounts } from "../utils/bank-account-resolver";

// Configure localforage
localforage.config({
  name: "PayrollApp",
  storeName: "app_data",
});

const STORAGE_KEY = "PayrollApp_Data";

// ─── Split into 2 contexts to avoid re-rendering data consumers on meta changes ───

interface AppDataCtx {
  appData: AppData;
  isLoading: boolean;
}

interface AppActionsCtx {
  updateAppData: (
    updater: (prev: AppData) => AppData,
    saveToHistory?: boolean,
  ) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isSyncing: boolean;
}

const AppDataContext = createContext<AppDataCtx | undefined>(undefined);
const AppActionsContext = createContext<AppActionsCtx | undefined>(undefined);

interface HistoryState {
  past: AppData[];
  present: AppData;
  future: AppData[];
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<HistoryState>({
    past: [],
    present: INITIAL_APP_DATA,
    future: [],
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // ── Load from storage on mount ──
  useEffect(() => {
    const loadData = async () => {
      try {
        let saved = await localforage.getItem<AppData>(STORAGE_KEY);
        if (!saved) {
          const legacySaved = localStorage.getItem(STORAGE_KEY);
          if (legacySaved) {
            try {
              saved = JSON.parse(legacySaved);
              await localforage.setItem(STORAGE_KEY, saved);
            } catch (e) {
              console.error("Failed to parse legacy data", e);
            }
          }
        }

        if (saved) {
          // --- MIGRATION FOR HOLD_AE ---
          if (saved.Hold_AE) {
            let h = saved.Hold_AE.headers;
            if (
              h.includes("LOẠI CK") ||
              h.includes("CENTER NOTE") ||
              h.includes("No") ||
              h.includes("STT")
            ) {
              saved.Hold_AE.headers = h
                .filter((x) => x !== "LOẠI CK")
                .map((x) =>
                  x === "CENTER NOTE" ? "Mã ae" : (x === "No" || x === "STT") ? "No." : x,
                );
              h = saved.Hold_AE.headers;
              saved.Hold_AE.data = saved.Hold_AE.data.map((row) => {
                const newRow = { ...row };
                delete newRow["LOẠI CK"];
                if ("CENTER NOTE" in newRow) {
                  newRow["Mã ae"] = newRow["CENTER NOTE"];
                  delete newRow["CENTER NOTE"];
                }
                if ("No" in newRow) {
                  newRow["No."] = newRow["No"];
                  delete newRow["No"];
                }
                if ("STT" in newRow) {
                  newRow["No."] = newRow["STT"];
                  delete newRow["STT"];
                }
                return newRow;
              });
            }

            // Migrate STT/No to No. on all datasets for consistency
            const keysToMigrate: ("Hold_AE" | "Sheet1_AE" | "Bank_North_AE" | "SoSanh_AE")[] = [
              "Hold_AE",
              "Sheet1_AE",
              "Bank_North_AE",
              "SoSanh_AE",
            ];
            keysToMigrate.forEach((k) => {
              if (saved[k]) {
                const headers = saved[k].headers || [];
                if (headers.includes("STT") || headers.includes("No")) {
                  saved[k].headers = headers.map((x: string) =>
                    x === "STT" || x === "No" ? "No." : x
                  );
                  if (saved[k].data && Array.isArray(saved[k].data)) {
                    saved[k].data = saved[k].data.map((row: any) => {
                      const newRow = { ...row };
                      if ("STT" in newRow) {
                        newRow["No."] = newRow["STT"];
                        delete newRow["STT"];
                      }
                      if ("No" in newRow) {
                        newRow["No."] = newRow["No"];
                        delete newRow["No"];
                      }
                      return newRow;
                    });
                  }
                }
              }
            });
            if (saved.Hold_AE.data && Array.isArray(saved.Hold_AE.data)) {
              saved.Hold_AE.data = saved.Hold_AE.data.map((row: any) => {
                const newRow = { ...row };
                if (!newRow["Sheet Source"]) newRow["Sheet Source"] = "Unknown";
                return newRow;
              });
            }
            if (saved.Sheet1_AE && saved.Sheet1_AE.data && Array.isArray(saved.Sheet1_AE.data)) {
              saved.Sheet1_AE.data = saved.Sheet1_AE.data.map((row: any) => {
                const newRow = { ...row };
                return newRow;
              });
            }
          }
          // ------------------------------

          // Ensure BankExport and other structures are structurally populated to prevent legacy TypeError crashes
          if (!saved.BankExport) {
            saved.BankExport = { ...INITIAL_APP_DATA.BankExport };
          }
          if (!saved.CustomReport) {
            saved.CustomReport = { ...INITIAL_APP_DATA.CustomReport };
          }

          // Ensure PivotConfig and critical fields are structurally populated to prevent legacy TypeError crashes
          if (!saved.PivotConfig) {
            saved.PivotConfig = { ...INITIAL_APP_DATA.PivotConfig };
          } else {
            saved.PivotConfig = {
              headers: {
                ...INITIAL_APP_DATA.PivotConfig?.headers,
                ...saved.PivotConfig.headers,
              },
              chargeCols: (() => {
                const baseCols = [...(INITIAL_APP_DATA.PivotConfig?.chargeCols || [])];
                const savedCols = saved.PivotConfig.chargeCols && saved.PivotConfig.chargeCols.length > 0
                  ? [...saved.PivotConfig.chargeCols]
                  : [];

                // Reconstruct to maintain correct order and ensure all default columns exist,
                // while preserving user edits (custom label, code) for any column keys that match.
                const finalCols = baseCols.map((baseCol) => {
                  const matchingSaved = savedCols.find((sc: any) => sc.key === baseCol.key);
                  if (matchingSaved) {
                    // Fix any old label mapping where Charge MKT Local was mislabeled as CHARGE OTHER
                    if (matchingSaved.key === "Charge MKT Local" && matchingSaved.label === "CHARGE OTHER") {
                      return { key: "Charge MKT Local", label: "CHARGE MKT LOCAL", code: "E1" };
                    }
                    return matchingSaved;
                  }
                  return baseCol;
                });

                // Also append any extra custom columns that the user inserted manually using "Insert Column"
                savedCols.forEach((sc: any) => {
                  if (!finalCols.some((fc: any) => fc.key === sc.key)) {
                    finalCols.push(sc);
                  }
                });

                return finalCols;
              })(),
            };
          }

          setState((prev) => ({
            ...prev,
            present: {
              ...saved,
            },
          }));
        }
      } catch (e) {
        console.error("Failed to load app data from storage", e);
        toast.error("Không thể tải dữ liệu đã lưu.");
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // ── Debounced sync to storage (1.5s) ──
  useEffect(() => {
    if (isLoading) return;

    const saveData = async () => {
      setIsSyncing(true);
      try {
        const dataToSave = { ...state.present };
        const stripFileObj = (item: any) => {
          const { fileObj, _file, ...rest } = item;
          return rest;
        };
        if (dataToSave.Timesheet_InputList)
          dataToSave.Timesheet_InputList =
            dataToSave.Timesheet_InputList.map(stripFileObj);
        if (dataToSave.Ae_Global_Inputs)
          dataToSave.Ae_Global_Inputs =
            dataToSave.Ae_Global_Inputs.map(stripFileObj);
        await localforage.setItem(STORAGE_KEY, dataToSave);
      } catch (e) {
        console.error("Failed to save app data to storage", e);
        try {
          const minimalData = {
            ...state.present,
            Q_Staff: [],
            Q_Salary_Scale: [],
            Q_Roster: [],
            Q_Cache: [],
            Timesheets: [],
          };
          const stripFileObj = (item: any) => {
            const { fileObj, _file, ...rest } = item;
            return rest;
          };
          if (minimalData.Timesheet_InputList)
            minimalData.Timesheet_InputList =
              minimalData.Timesheet_InputList.map(stripFileObj);
          if (minimalData.Ae_Global_Inputs)
            minimalData.Ae_Global_Inputs =
              minimalData.Ae_Global_Inputs.map(stripFileObj);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(minimalData));
        } catch (lsError) {
          console.error("LocalStorage also failed", lsError);
          toast.error("Không thể lưu dữ liệu: Bộ nhớ trình duyệt đã đầy.");
        }
      } finally {
        setIsSyncing(false);
      }
    };

    const id = setTimeout(saveData, 3000); // debounce 3s để giảm tải localforage
    return () => clearTimeout(id);
  }, [state.present, isLoading]);

  // ── Default center seeding ──
  useEffect(() => {
    if (isLoading) return;
    setState((prev) => {
      const nextPresent = { ...prev.present };
      let changed = false;
      if (
        !prev.present.Timesheet_InputList ||
        prev.present.Timesheet_InputList.length === 0
      ) {
        nextPresent.Timesheet_InputList = DEFAULT_CENTERS.map((item, idx) => ({
          ...item,
          id: `ts-default-${idx}`,
          status: "ready",
        }));
        changed = true;
      }
      if (!changed) return prev;
      return { ...prev, present: nextPresent };
    });
  }, [isLoading]);

  // ── Actions (stable references — never cause re-render) ──
  const updateAppData = useCallback(
    (updater: (prev: AppData) => AppData, saveToHistory: boolean = true) => {
      setState((prev) => {
        const nextPresent = updater(prev.present);
        if (nextPresent === prev.present) return prev;
        return {
          past: saveToHistory
            ? [...prev.past, prev.present].slice(-3)
            : prev.past,
          present: nextPresent,
          future: saveToHistory ? [] : prev.future,
        };
      });
    },
    [],
  );

  const undo = useCallback(() => {
    setState((prev) => {
      if (prev.past.length === 0) return prev;
      const previous = prev.past[prev.past.length - 1];
      return {
        past: prev.past.slice(0, -1),
        present: previous,
        future: [prev.present, ...prev.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[0];
      return {
        past: [...prev.past, prev.present],
        present: next,
        future: prev.future.slice(1),
      };
    });
  }, []);

  // ── Memoized context values — only re-create when actual data changes ──
  const { Hold_AE, Sheet1_AE, globalMonth } = state.present;

  // Persist missing Hold AE bank accounts as soon as the matching source data
  // is available. This keeps the lookup result across report-month changes and
  // future uploads where a source file may be omitted.
  useEffect(() => {
    if (isLoading) return;

    setState((prev) => {
      const holdRows = prev.present.Hold_AE?.data || [];
      const { rows, updatedCount } = fillMissingHoldBankAccounts({
        holdRows,
        grossPayRows: prev.present.Sheet1_AE?.data || [],
        transactionRows: [
          ...(prev.present.BankExport?.data || []),
          ...(prev.present.Bank_North_AE?.data || []),
        ],
        reportMonth: prev.present.globalMonth,
      });

      if (updatedCount === 0) return prev;
      return {
        ...prev,
        present: {
          ...prev.present,
          Hold_AE: {
            ...prev.present.Hold_AE,
            data: rows,
          },
        },
      };
    });
  }, [
    isLoading,
    state.present.Hold_AE?.data,
    state.present.Sheet1_AE?.data,
    state.present.BankExport?.data,
    state.present.Bank_North_AE?.data,
    state.present.globalMonth,
  ]);

  const computedHoldAE = useMemo(() => {
    if (!Hold_AE || !Hold_AE.data) return Hold_AE;

    const currentPeriodParts = (globalMonth || "03.2026").split(".");
    const currentMonthNum = parseInt(currentPeriodParts[0], 10) || 3;
    const currentYearNum = parseInt(currentPeriodParts[1], 10) || 2026;
    const currentTotal = currentYearNum * 12 + currentMonthNum;

    // First compute userLedgers
    const ledgers: Record<
      string,
      {
        totalHold: number;
        totalAdd: number;
      }
    > = {};

    const idToSheet1: Record<string, string> = {};
    const nameToSheet1: Record<string, string> = {};
    const accToSheet1: Record<string, string> = {};

    const sheet1Rows = Sheet1_AE?.data || [];
    sheet1Rows.forEach((row) => {
      const id = formatIdNumber(row["ID Number"]);
      const name = removeVietnameseTones(
        String(row["Full name"] || ""),
      ).toUpperCase();
      const acc = String(row["Bank Account Number"] || "").trim();
      let biz = row["Business"] || "Unknown";
      if (biz === "AHN_HP") biz = "AHP";
      if (id) idToSheet1[id] = biz;
      if (name) nameToSheet1[name] = biz;
      if (acc) accToSheet1[acc] = biz;
    });

    const holdRows = (Hold_AE?.data || []).filter(Boolean);
    holdRows.forEach((row, index) => {
      if (!row) return;
      const id = formatIdNumber(row["ID Number"]);
      const name = String(row["Full name"] || "").trim();
      const normalizedName = removeVietnameseTones(name).toUpperCase();
      const acc = String(row["Bank Account Number"] || "").trim();
      const key = id || normalizedName || `idx-${index}`;

      let bu = row["BU"] || row["Business"] || "";
      if (bu) bu = String(bu).trim().toUpperCase();
      if (bu === "AHN_HP") bu = "AHP";

      if (!bu || bu === "UNKNOWN") bu = idToSheet1[id];
      if ((!bu || bu === "UNKNOWN") && acc) bu = accToSheet1[acc];
      if ((!bu || bu === "UNKNOWN") && normalizedName)
        bu = nameToSheet1[normalizedName];
      if (!bu || bu === "UNKNOWN") bu = "AHN";

      const val = parseMoneyToNumber(row["TOTAL PAYMENT"] || 0);
      const absVal = Math.abs(val);

      const rawSource = String(row["Sheet Source"] || "");
      const trangThaiVal =
        row["Tháng phát sinh"] !== undefined
          ? row["Tháng phát sinh"]
          : row["Trạng thái"] !== undefined
          ? row["Trạng thái"]
          : rawSource;
      const upNvu = String(row["Nghiệp vụ"] || "").toUpperCase();
      const label =
        String(trangThaiVal || "").toUpperCase() || (val >= 0 ? "ADD" : "HOLD");
      const isHold = label.includes("HOLD") || upNvu.includes("HOLD");
      const isCancel = label.includes("CANCEL") || upNvu.includes("CANCEL");
      const isAdd = label.includes("ADD") || upNvu.includes("ADD") || (!isHold && !isCancel && val > 0);
      
      // Determine month of the row
      let itemMonthNum = currentMonthNum;
      let itemYearNum = currentYearNum;
      const originMonthStr = String(row["Tháng"] || row["_fileMonth"] || row["Tháng báo cáo"] || "").trim();
      
      const matchMonthYear = originMonthStr.match(/(?:THÁNG|THANG|T)?\s*(\d{1,2})[./\- ]\s*(\d{4})/i);
      const matchMonthDotYear = originMonthStr.match(/(\d{2})\.(\d{4})/);
      if (matchMonthYear) {
        itemMonthNum = parseInt(matchMonthYear[1], 10);
        itemYearNum = parseInt(matchMonthYear[2], 10);
      } else if (matchMonthDotYear) {
        itemMonthNum = parseInt(matchMonthDotYear[1], 10);
        itemYearNum = parseInt(matchMonthDotYear[2], 10);
      } else {
        const originMatch = originMonthStr.match(/(\d+)/);
        if (originMatch) {
            itemMonthNum = parseInt(originMatch[0], 10);
        }
        if (itemMonthNum === 11 || itemMonthNum === 12) {
          itemYearNum = currentYearNum === 2025 ? 2025 : (currentYearNum === 2026 ? 2025 : currentYearNum);
        } else if (itemMonthNum > currentMonthNum && (currentYearNum === 2025 || currentYearNum === 2026)) {
          itemYearNum = currentYearNum - 1;
        } else {
          itemYearNum = currentYearNum;
        }
      }
      const itemTotal = itemYearNum * 12 + itemMonthNum;
      const isPastMonthHold = isHold && (itemTotal < currentTotal);
      const effectiveAbsVal = isPastMonthHold ? 0 : absVal;

      if (!ledgers[key]) {
        ledgers[key] = {
          totalHold: 0,
          totalAdd: 0,
        };
      }

      if (isHold) {
        ledgers[key].totalHold += effectiveAbsVal;
      } else if (isAdd) {
        ledgers[key].totalAdd += absVal;
      }
    });

    // Now construct computed rows with "Tháng báo cáo", "Trạng thái", "Nghiệp vụ"

    const computedData = holdRows.map((row, index) => {
      if (!row) return null as any;
      const id = formatIdNumber(row["ID Number"]);
      const name = String(row["Full name"] || "").trim();
      const normalizedName = removeVietnameseTones(name).toUpperCase();

      const val = parseMoneyToNumber(row["TOTAL PAYMENT"] || 0);
      const rawSource = String(row["Sheet Source"] || "");

      // 1. Determine "Tháng báo cáo" (Reporting Month) strictly based on the "Tháng" column on the master file from AE.
      // "viết lại logic của Cột Tháng báo cáo trên bảng Master AE Hold => DỰA VÀO CỘT THÁNG TRÊN BẢNG MASTER_UPLOAD FILE FROM AE"
      let originMonthNum = currentMonthNum;
      let originYearNum = currentYearNum;

      const originMonthStr = String(
        row["Tháng"] || row["_fileMonth"] || row["Tháng báo cáo"] || "",
      ).trim();

      const matchMonthYear = originMonthStr.match(
        /(?:THÁNG|THANG|T)?\s*(\d{1,2})[./\- ]\s*(\d{4})/i,
      );
      const matchMonthDotYear = originMonthStr.match(/(\d{2})\.(\d{4})/);
      if (matchMonthYear) {
        originMonthNum = parseInt(matchMonthYear[1], 10);
        originYearNum = parseInt(matchMonthYear[2], 10);
      } else if (matchMonthDotYear) {
        originMonthNum = parseInt(matchMonthDotYear[1], 10);
        originYearNum = parseInt(matchMonthDotYear[2], 10);
      } else {
        const originMatch = originMonthStr.match(/(\d+)/);
        if (originMatch) {
          originMonthNum = parseInt(originMatch[0], 10);
        }
        if (originMonthNum === 11 || originMonthNum === 12) {
          // Dynamically respect selected report month; changed hardcoded check from 2026 to 2025
          originYearNum = currentYearNum === 2025 ? 2025 : (currentYearNum === 2026 ? 2025 : currentYearNum);
        } else if (
          originMonthNum > currentMonthNum &&
          (currentYearNum === 2025 || currentYearNum === 2026)
        ) {
          originYearNum = currentYearNum - 1;
        } else {
          originYearNum = currentYearNum;
        }
      }
      const finalReportingMonthStr = `${String(originMonthNum).padStart(2, "0")}.${originYearNum}`;

      // 2. Determine "khoản đó của tháng nào" (item month) based on the "Sheet Source" column containing the month.
      // "còn khoản đó của tháng nào thì dựa vào cột sheet source chứa tháng"
      let itemMonthNum = originMonthNum;
      let itemYearNum = originYearNum;

      const rawTrangThaiOrPhatSinh = String(row["Tháng phát sinh"] || row["Trạng thái"] || "").trim().toUpperCase();
      const rawSourceUpper = rawSource.toUpperCase();
      const isBonusSummer = rawSourceUpper.includes("BONUS") && (
        rawSourceUpper.includes("SUMMER") || 
        rawSourceUpper.includes("INSTRUCTOR") || 
        rawSourceUpper.includes("INTROSTION")
      );

      if (isBonusSummer) {
        // Force Tháng phát sinh to be the reporting month (Tháng báo cáo)
        itemMonthNum = originMonthNum;
        itemYearNum = originYearNum;
      } else {
        // Check if already is custom mm.yyyy
        const customMmYyyyMatch = rawTrangThaiOrPhatSinh.match(/^(\d{2})\.(\d{4})$/);
        if (customMmYyyyMatch) {
          itemMonthNum = parseInt(customMmYyyyMatch[1], 10);
          itemYearNum = parseInt(customMmYyyyMatch[2], 10);
        } else {
          const ssMatch =
            rawSource.match(/T[HÁNG]*\s*(\d+)/i) ||
            String(row["Note"] || "").match(/T[HÁNG]*\s*(\d+)/i) ||
            rawTrangThaiOrPhatSinh.match(/T[HÁNG]*\s*(\d+)/i);
          if (ssMatch) {
            itemMonthNum = parseInt(ssMatch[1], 10);
          }
          if (itemMonthNum > originMonthNum && originMonthNum <= 6 && (originYearNum === 2025 || originYearNum === 2026)) {
            itemYearNum = originYearNum - 1;
          }
        }
      }

      const computedThangPhatSinh = `${String(itemMonthNum).padStart(2, "0")}.${itemYearNum}`;

      // Determine 'Nghiệp vụ' operation type
      let type = "Add";
      const upNvu = String(row["Nghiệp vụ"] || "")
        .trim()
        .toUpperCase();
      const rawTrangThai = String(row["Tháng phát sinh"] || row["Trạng thái"] || "")
        .trim()
        .toUpperCase();
      if (upNvu.includes("HOLD") || rawTrangThai.includes("HOLD")) {
        type = "Hold";
      } else if (upNvu.includes("CANCEL") || rawTrangThai.includes("CANCEL")) {
        type = "Cancel";
      } else if (upNvu.includes("ADD") || rawTrangThai.includes("ADD")) {
        type = "Add";
      } else if (upNvu.includes("BONUS") || upNvu.includes("⏩") || upNvu.includes("⏯")) {
        type = "⏩";
      } else {
        type = val >= 0 ? "Add" : "Hold";
      }

      let tinhTrangThanhToan = "";
      if (type.toUpperCase() === "HOLD") {
        tinhTrangThanhToan = `Pending từ tháng ${computedThangPhatSinh}`;
      } else if (type.toUpperCase() === "ADD" || type === "⏩" || type === "⏯") {
        tinhTrangThanhToan = `Đã thanh toán tại tháng ${finalReportingMonthStr}`;
      } else if (type.toUpperCase() === "CANCEL") {
        tinhTrangThanhToan = `Cancel từ tháng ${finalReportingMonthStr}`;
      }

      const isPastMonthHoldOrCancel =
        (type.toUpperCase() === "HOLD" || type.toUpperCase() === "CANCEL") &&
        (itemYearNum * 12 + itemMonthNum < originYearNum * 12 + originMonthNum);

      let l07 = String(row["L07"] || row["Mã ae"] || "").trim();
      let bu = String(row["BU"] || "").trim();
      const resolved = resolveL07BuFromAeCode(l07);
      if (resolved) {
        l07 = resolved.l07;
        if (!bu) bu = resolved.bu;
      }

      return {
        ...row,
        "L07": l07,
        "BU": bu,
        _originalIndex: index,
        _originalTinhTrangThanhToan: row["Tình trạng thanh toán"] !== undefined ? String(row["Tình trạng thanh toán"]) : "",
        "Tháng báo cáo": finalReportingMonthStr,
        "Tháng phát sinh": computedThangPhatSinh,
        "Trạng thái": computedThangPhatSinh,
        "Tình trạng thanh toán": tinhTrangThanhToan,
        "Nghiệp vụ": type,
        Note: row["Note"] !== undefined ? String(row["Note"]) : "",
        "Diễn giải": row["Diễn giải"] !== undefined ? String(row["Diễn giải"]) : "",
        _dimmed: isPastMonthHoldOrCancel,
        _isPastMonthHoldOrCancel: isPastMonthHoldOrCancel,
      };
    });

    // Ensure headers include our target computed columns and are in the correct order
    let newHeaders = [...Hold_AE.headers];
    newHeaders = newHeaders.filter(
      (h) => h !== "Mã GD" && h !== "Trạng thái công nợ",
    );
    const targetHeaders = [
      "Tháng báo cáo",
      "Nghiệp vụ",
      "Tháng phát sinh",
      "Tình trạng thanh toán",
    ];
    targetHeaders.forEach((th) => {
      if (!newHeaders.includes(th)) {
        newHeaders.push(th);
      }
    });

    const totalPaymentIdx = newHeaders.indexOf("TOTAL PAYMENT");
    let baseHeaders: string[] = [];
    if (totalPaymentIdx !== -1) {
      baseHeaders = newHeaders.slice(0, totalPaymentIdx + 1);
    } else {
      baseHeaders = [
        "No.",
        "Tháng báo cáo",
        "BU",
        "L07",
        "ID Number",
        "Full name",
        "Bank Account Number",
        "TAX CODE",
        "Contract No",
        "TOTAL PAYMENT",
      ];
    }

    const reorderedHeaders = [
      ...baseHeaders.filter(
        (h) =>
          h !== "TÊN FILE" &&
          h !== "Sheet Source" &&
          h !== "Note" &&
          h !== "Nghiệp vụ" &&
          h !== "Trạng thái" &&
          h !== "Tháng phát sinh" &&
          h !== "Tình trạng thanh toán" &&
          h !== "Mã ae",
      ),
      "Sheet Source",
      "Nghiệp vụ",
      "Tháng phát sinh",
      "Tình trạng thanh toán",
      "Note",
    ];

    return {
      ...Hold_AE,
      headers: reorderedHeaders,
      data: computedData.filter(Boolean),
    };
  }, [
    Hold_AE,
    Sheet1_AE?.data,
    globalMonth,
  ]);

  const computedPresent = useMemo(() => {
    if (!state.present.Hold_AE || state.present.Hold_AE === computedHoldAE) {
      return state.present;
    }
    return {
      ...state.present,
      Hold_AE: computedHoldAE,
    };
  }, [state.present, computedHoldAE]);

  const dataValue = useMemo<AppDataCtx>(
    () => ({ appData: computedPresent, isLoading }),
    [computedPresent, isLoading],
  );

  const actionsValue = useMemo<AppActionsCtx>(
    () => ({
      updateAppData,
      undo,
      redo,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      isSyncing,
    }),
    [
      updateAppData,
      undo,
      redo,
      state.past.length,
      state.future.length,
      isSyncing,
    ],
  );

  return (
    <AppDataContext.Provider value={dataValue}>
      <AppActionsContext.Provider value={actionsValue}>
        {children}
      </AppActionsContext.Provider>
    </AppDataContext.Provider>
  );
}

// ── Hooks ──

export function useAppData() {
  const dataCtx = useContext(AppDataContext);
  const actionsCtx = useContext(AppActionsContext);
  if (!dataCtx || !actionsCtx)
    throw new Error("useAppData must be used within AppDataProvider");
  // Merge để backward compatible — giữ nguyên API cũ
  return {
    appData: dataCtx.appData,
    isLoading: dataCtx.isLoading,
    updateAppData: actionsCtx.updateAppData,
    undo: actionsCtx.undo,
    redo: actionsCtx.redo,
    canUndo: actionsCtx.canUndo,
    canRedo: actionsCtx.canRedo,
    isSyncing: actionsCtx.isSyncing,
  };
}

/** Chỉ subscribe data — không re-render khi isSyncing/canUndo/canRedo thay đổi */
export function useAppDataOnly() {
  const ctx = useContext(AppDataContext);
  if (!ctx)
    throw new Error("useAppDataOnly must be used within AppDataProvider");
  return ctx;
}

/** Chỉ subscribe actions — không re-render khi data thay đổi */
export function useAppActions() {
  const ctx = useContext(AppActionsContext);
  if (!ctx)
    throw new Error("useAppActions must be used within AppDataProvider");
  return ctx;
}
