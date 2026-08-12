import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  FileSpreadsheet,
  Download,
  Settings,
  RefreshCw,
  Trash2,
  Copy,
  Plus,
  ArrowLeft,
  ChevronDown,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { useAppData } from "../../lib/contexts/AppDataContext";
import { isSupabaseConfigured } from "../../lib/supabase";
import { syncRosterToSupabase, SQL_SETUP_SCRIPT } from "../../lib/supabase-sync-utils";
import { useTimesheetCalculations } from "../../hooks/useTimesheetCalculations";
import { getDynamicEmployeeColumns, CENTER_COLUMNS } from "../../constants/timesheet-columns";
import { TimesheetInputTable } from "./components/TimesheetInputTable";
import type { TimesheetInputRow } from "./components/TimesheetInputTable";
import { AppData } from "../../types";
import {
  getL07FromFileName,
  getCenterInfoByL07,
  getCenterInfoByAECode,
  mapL07,
  getBusinessFromL07,
} from "../../lib/utils/center-utils";
import { 
  generateUUID, 
  prepareDataForExport,
  getVal,
  getExcelFileBuffer,
  fetchGoogleSheetAsFile,
} from "../../lib/utils/data-utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";

import ExcelWorker from "../../workers/excelParser.worker?worker";
import type {
  ExcelParseMode,
  ExcelParseResult,
} from "../../workers/excelParser.worker";

type PendingExcelRequest = {
  resolve: (result: ExcelParseResult) => void;
  reject: (error: Error) => void;
};

let excelWorker: Worker | null = null;
const pendingExcelRequests = new Map<string, PendingExcelRequest>();

function getExcelWorker() {
  if (excelWorker) return excelWorker;
  excelWorker = new ExcelWorker();
  excelWorker.onmessage = (event: MessageEvent) => {
    const requestId = String(event.data?.requestId || "");
    const pending = pendingExcelRequests.get(requestId);
    if (!pending) return;
    pendingExcelRequests.delete(requestId);
    if (event.data?.success) {
      pending.resolve(event.data.result as ExcelParseResult);
    } else {
      pending.reject(
        new Error(event.data?.error || "Không thể đọc dữ liệu Excel."),
      );
    }
  };
  excelWorker.onerror = (event) => {
    const error = new Error(event.message || "Excel Worker đã dừng bất thường.");
    pendingExcelRequests.forEach(({ reject }) => reject(error));
    pendingExcelRequests.clear();
    excelWorker?.terminate();
    excelWorker = null;
  };
  return excelWorker;
}

const parseExcelInWorker = async (
  file: File,
  options: { fileId?: string; mode?: ExcelParseMode } = {},
): Promise<ExcelParseResult> => {
  const { buffer, name } = await getExcelFileBuffer(file);
  const requestId = crypto.randomUUID();
  const worker = getExcelWorker();

  return new Promise((resolve, reject) => {
    pendingExcelRequests.set(requestId, { resolve, reject });
    worker.postMessage(
      {
        requestId,
        fileBuffer: buffer,
        fileName: name,
        fileId: options.fileId,
        mode: options.mode || "auto",
      },
      [buffer],
    );
  });
};

const DEFAULT_FOLDER_URL = "https://drive.google.com/drive/folders/1gU6Hcrv94Bx_yv1qNTqH0vQNy7ElKzXJ";

interface TimesheetSummaryPageProps {
  onBack?: () => void;
}

export default function TimesheetSummaryPage({ onBack }: TimesheetSummaryPageProps = {}) {
  const { appData, updateAppData } = useAppData();

  const [activeTab] = useState<"files">("files");
  const [fromDate] = useState("");
  const [toDate] = useState("");
  const [debouncedFromDate, setDebouncedFromDate] = useState("");
  const [debouncedToDate, setDebouncedToDate] = useState("");

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [totalSyncRows, setTotalSyncRows] = useState(0);
  const [syncedRowsCount, setSyncedRowsCount] = useState(0);
  const [showSqlDialog, setShowSqlDialog] = useState(false);

  const [isFetchingGgSheet, setIsFetchingGgSheet] = useState(false);
  const [bulkUploadProgress, setBulkUploadProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [, setRefreshKey] = useState(0);

  const handleUrlInput = async (id: string, url: string) => {
    if (!url.trim()) return;
    const isFolder = url.includes("folders/") || url.includes("drive/folders/") || url.includes("?id=");

    setIsFetchingGgSheet(true);
    try {
      if (isFolder) {
        let folderId = url.trim();
        const match = url.match(/folders\/([a-zA-Z0-9-_]+)/);
        if (match) {
          folderId = match[1];
        } else {
          try {
            const urlObj = new URL(url);
            if (urlObj.searchParams.has("id")) {
              folderId = urlObj.searchParams.get("id") || folderId;
            }
          } catch { /* ignore */ }
        }

        const response = await fetch(`/api/drive-folder-files?folderId=${encodeURIComponent(folderId)}`);
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || "Không thể lấy danh sách file từ thư mục. Vui lòng kiểm tra lại link hoặc quyền chia sẻ.");
        }

        const data = await response.json();
        if (!data.success || !data.files || data.files.length === 0) {
          throw new Error("Không tìm thấy file nào trong thư mục này.");
        }

        const driveFiles = (data.files || []).filter((f: Record<string, unknown>) => {
          const name = String(f.name || "").toLowerCase();
          return !name.includes("copy");
        });

        if (driveFiles.length === 0 && data.files.length > 0) {
          throw new Error("Tất cả các file trong thư mục đều là file 'copy' nên hệ thống tự động bỏ qua.");
        }

        toast.info(`Tìm thấy ${driveFiles.length} file hợp lệ. Đang tự động đối chiếu và nạp dữ liệu...`);

        const currentInputs = [...(appData.Timesheet_InputList || [])];
        const toProcess: { id: string; file: File }[] = [];
        let successCount = 0;
        let skipCount = 0;

        for (const f of driveFiles) {
          const fileName = String(f.name || "");
          const l07 = getL07FromFileName(fileName) || "";
          if (!l07) {
            skipCount++;
            continue;
          }
          const centerInfo = getCenterInfoByL07(l07);
          const aeCode = centerInfo?.aeCode || "";
          const bu = getBusinessFromL07(l07);

          // Matching logic similar to bulk Excel upload
          let matchIndex = currentInputs.findIndex((r) => {
            const rowL07 = r.l07 ? mapL07(r.l07).toLowerCase() : "";
            const rowAE = r.aeCode ? r.aeCode.toLowerCase() : "";
            const matchL07 = l07 && rowL07 === l07.toLowerCase();
            const matchAE = aeCode && rowAE === aeCode.toLowerCase();
            return matchL07 || matchAE;
          });

          if (matchIndex === -1) {
            matchIndex = currentInputs.findIndex(r => !r.l07 && !r.fileName && (r.status === "pending" || r.status === "ready"));
          }

          let rowId: string;
          if (matchIndex !== -1) {
            rowId = currentInputs[matchIndex].id;
            currentInputs[matchIndex] = {
              ...currentInputs[matchIndex],
              l07: l07,
              aeCode: aeCode,
              bus: bu,
              status: "processing",
            };
          } else {
            rowId = crypto.randomUUID();
            currentInputs.push({
              id: rowId,
              l07: l07,
              aeCode: aeCode,
              bus: bu,
              status: "processing",
              url: ""
            });
          }

          const sheetUrl = `https://docs.google.com/spreadsheets/d/${f.id}`;
          const fileContent = JSON.stringify({ url: sheetUrl });
          const blob = new Blob([fileContent], { type: 'application/json' });
          let name = fileName;
          if (!name.toLowerCase().endsWith(".gsheet")) {
            name = name.replace(/\.(xlsx|xls|csv)$/i, "") + ".gsheet";
          }
          const fileObj = new File([blob], name, { type: 'application/json' });
          toProcess.push({ id: rowId, file: fileObj });
          successCount++;
        }

        if (successCount > 0) {
          // Set matched rows to a "ready" status first, but don't start processing yet
          const readyInputs = currentInputs.map(r => {
            const match = toProcess.find(tp => tp.id === r.id);
            if (match && r.status !== "success") {
              return { ...r, status: "ready" as const };
            }
            return r;
          });
          
          updateAppData(prev => ({ ...prev, Timesheet_InputList: readyInputs }), false);
          
          // Sequential processing with delay
          for (let i = 0; i < toProcess.length; i++) {
            const item = toProcess[i];
            
            // 1. Set individual row to processing for UI feedback
            handleUpdateRow(item.id, "status", "processing");
            
            // 2. Process the file (this includes the fetch)
            try {
              await handleUploadFile(item.id, item.file);
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(`Failed to process ${item.file.name}:`, err);
              handleUpdateRow(item.id, "status", "error");
              toast.error(`Lỗi xử lý ${item.file.name}: ${msg}`);
            }
            
            // 3. Wait 1500ms before next file to avoid rate limits (except for the last one)
            if (i < toProcess.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1500));
            }
          }
          
          toast.success(`Đã nạp xong từ thư mục! Thành công: ${successCount} trung tâm${skipCount > 0 ? `, Bỏ qua: ${skipCount}` : ""}.`);
        } else {
          toast.warning(`Không tìm thấy trung tâm nào khớp với các file trong thư mục.`);
        }
      } else {
        const selectedRow = inputRows.find(r => r.id === id);
        const l07 = selectedRow?.l07 || "GoogleSheet";
        
        const file = await fetchGoogleSheetAsFile(url, `${l07}_GoogleSheet.gsheet`);
        await handleUploadFile(id, file);
        toast.success(`Đã nạp dữ liệu từ link cho trung tâm ${l07}!`);
      }
    } catch (error: unknown) {
      console.error(error);
      const msg = error instanceof Error ? error.message : "Lỗi xử lý link";
      toast.error(msg);
    } finally {
      setIsFetchingGgSheet(false);
    }
  };

  const lastSummaryRef = useRef("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFromDate(fromDate);
      setDebouncedToDate(toDate);
    }, 500);
    return () => clearTimeout(timer);
  }, [fromDate, toDate]);

  useEffect(() => {
    if (!debouncedFromDate || !debouncedToDate) return;

    updateAppData((prev) => {
      if (
        prev.Timesheet_Dates?.from === debouncedFromDate &&
        prev.Timesheet_Dates?.to === debouncedToDate
      ) {
        return prev;
      }

      return {
        ...prev,
        Timesheet_Dates: { from: debouncedFromDate, to: debouncedToDate },
      };
    }, false);
  }, [debouncedFromDate, debouncedToDate, updateAppData]);



  const rosterData = useMemo(
    () => appData.Timesheet_Roster || [],
    [appData.Timesheet_Roster],
  );
  const salaryScaleData = useMemo(() => appData.Q_Salary_Scale || [], [appData.Q_Salary_Scale]);
  const staffData = useMemo(() => appData.Q_Staff || [], [appData.Q_Staff]);
  const cacheData = useMemo(() => appData.Q_Cache || [], [appData.Q_Cache]);
  const inputRows = useMemo(() => appData.Timesheet_InputList || [
    { id: "1", l07: "", aeCode: "", bus: "", url: "", status: "pending" },
  ], [appData.Timesheet_InputList]);

  const handleAddRow = () => {
    updateAppData((prev) => ({
      ...prev,
      Timesheet_InputList: [
        ...inputRows,
        {
          id: generateUUID(),
          l07: "",
          aeCode: "",
          bus: "",
          url: "",
          status: "pending",
        },
      ],
    }));
  };
  const handleUpdateRow = (
    id: string,
    field: keyof TimesheetInputRow,
    val: string | number | boolean | Record<string, unknown> | undefined,
  ) => {
    updateAppData(
      (prev) => ({
        ...prev,
        Timesheet_InputList: (prev.Timesheet_InputList || []).map((r) => {
          if (r.id === id) {
            const updated = { ...r, [field]: val };
            if (
              (field === "l07" && val === "MKT LOCAL NORTH") ||
              (field === "aeCode" && (val === "MKT LOCAL NORTH" || val === "NTW"))
            ) {
              updated.url = "https://docs.google.com/spreadsheets/d/1z7DJYJAyWqBw8IXNYbEIHhGXBMumsRA4rUHT1prBsFo/edit?gid=1119129159#gid=1119129159";
            }
            return updated;
          }
          return r;
        }),
      }),
      false,
    );
  };
  const handleClearRow = (id: string) => {
    updateAppData((prev) => ({
      ...prev,
      Timesheet_InputList: (prev.Timesheet_InputList || []).map((r) =>
        r.id === id
          ? {
              ...r,
              url: "",
              fileName: undefined,
              sheetName: undefined,
              status: "pending",
              count: undefined,
              date: undefined,
              columnMapping: undefined,
            }
          : r,
      ),
      Timesheet_Roster: (prev.Timesheet_Roster || []).filter(
        (r) => r._rowId !== id,
      ),
      Q_Salary_Scale: (prev.Q_Salary_Scale || []).filter((r) => r._rowId !== id),
      Q_Staff: (prev.Q_Staff || []).filter((r) => r._rowId !== id),
      Q_Cache: (prev.Q_Cache || []).filter((r) => r._rowId !== id),
    }));
  };
  const handleClearAll = () => {
    updateAppData((prev) => ({
      ...prev,
      Timesheet_InputList: (prev.Timesheet_InputList || []).map((r) => ({
        ...r,
        url: "",
        fileName: undefined,
        sheetName: undefined,
        status: "pending",
        count: undefined,
        date: undefined,
        columnMapping: undefined,
      })),
      Timesheet_Roster: [],
      Q_Salary_Scale: [],
      Q_Staff: [],
      Q_Cache: [],
    }));
    toast?.success("Đã xóa toàn bộ dữ liệu (đã giữ lại thông tin center).");
  };

  const handleClearEmptyL07 = () => {
    updateAppData((prev) => ({
      ...prev,
      Timesheet_InputList: (prev.Timesheet_InputList || []).filter(
        (r) => r.l07 && r.l07.trim() !== "",
      ),
    }));
    toast?.success("Đã xóa các dòng chưa có mã L07.");
  };

  useEffect(() => {
    if (rosterData.length === 0) return;

    const centerSet = new Map<
      string,
      { l07: string; aeCode: string; bus: string }
    >();
    rosterData.forEach((t) => {
      const rawCenterCol = String(
        getVal(t, ["center", "location", "cơ sở"]) || "",
      ).trim();
      const rawAECol = String(getVal(t, ["mã ae", "ae"]) || "").trim();
      const info =
        getCenterInfoByAECode(rawAECol) ||
        getCenterInfoByL07(rawCenterCol) ||
        getCenterInfoByL07(mapL07(rawCenterCol));

      const l07 = info?.l07 || rawCenterCol || rawAECol || "UNKNOWN";
      const aeCode = info?.aeCode || rawAECol || "";
      const bus = info?.bus || "";
      const key = `${l07}|${aeCode}|${bus}`;

      if (!centerSet.has(key)) {
        centerSet.set(key, { l07, aeCode, bus });
      }
    });

    updateAppData((prev) => {
      const currentInputs = prev.Timesheet_InputList || [];
      const existingKeys = new Set(
        currentInputs.map((r) => `${r.l07}|${r.aeCode}|${r.bus}`),
      );
      
      let hasChanges = false;
      let newInputs = [...currentInputs];

      if (
        centerSet.size > 0 &&
        newInputs.length === 1 &&
        !newInputs[0].l07 &&
        !newInputs[0].url
      ) {
        newInputs = [];
        hasChanges = true;
      }

      centerSet.forEach((val, key) => {
        if (!existingKeys.has(key)) {
          const defaultUrl = val.l07 === "MKT LOCAL NORTH"
            ? "https://docs.google.com/spreadsheets/d/1z7DJYJAyWqBw8IXNYbEIHhGXBMumsRA4rUHT1prBsFo/edit?gid=1119129159#gid=1119129159"
            : "";
          newInputs.push({
            id: generateUUID(),
            l07: val.l07,
            aeCode: val.aeCode,
            bus: val.bus,
            url: defaultUrl,
            status: "pending",
          });
          hasChanges = true;
        }
      });

      if (hasChanges) {
        return {
          ...prev,
          Timesheet_InputList: newInputs,
        };
      }
      return prev;
    }, false);
  }, [rosterData, updateAppData]);

  const handleRecalculate = () => {
    setRefreshKey((prev) => prev + 1);
    toast?.success("Đã tổng hợp lại dữ liệu.");
  };

  const handleSaveData = async () => {
    updateAppData(prev => ({
      ...prev,
      updatedAt: new Date().toISOString()
    }), true);
    
    if (isSupabaseConfigured()) {
      toast.info("Đang tự động đồng bộ dữ liệu hiện tại lên Supabase...");
      await handleSyncToSupabase();
    } else {
      toast.success("Đã lưu dữ liệu hiện tại offline thành công!");
    }
  };

  const handleSyncToSupabase = async () => {
    if (!isSupabaseConfigured()) {
      toast.error("Supabase chưa được cấu hình! Vui lòng cài đặt URL và Anon Key trong phần cấu hình.");
      return;
    }

    if (!rosterData || rosterData.length === 0) {
      toast.warning("Không có dữ liệu Roster để đồng bộ.");
      return;
    }

    setIsSyncing(true);
    setTotalSyncRows(rosterData.length);
    setSyncedRowsCount(0);
    setSyncProgress(0);

    try {
      const dataToSync = (computedData.processedRosterData && computedData.processedRosterData.length > 0) 
        ? computedData.processedRosterData 
        : rosterData;

      const { successCount, totalRows } = await syncRosterToSupabase(
        dataToSync as Record<string, unknown>[],
        (current, total) => {
          setSyncedRowsCount(current);
          setTotalSyncRows(total);
          setSyncProgress(Math.round((current / total) * 100));
        }
      );

      toast.success(`Đồng bộ thành công ${successCount.toLocaleString()}/${totalRows.toLocaleString()} dòng lên Supabase.`);
      
      updateAppData((prev: AppData) => ({
        ...prev,
        updatedAt: new Date().toISOString(),
        lastSupabaseSyncAt: new Date().toISOString()
      }), true);
      toast.success("Đã tự động lưu cứng dữ liệu trên web.");
    } catch (err: unknown) {
      console.error("Supabase Sync Error:", err);
      let errMsg = err instanceof Error ? err.message : String(err);
      
      if (errMsg.includes("Failed to fetch") || errMsg.includes("fetch")) {
        errMsg = "Không thể kết nối tới Supabase (Failed to fetch). Vui lòng kiểm tra lại URL Supabase trong phần Settings và đảm bảo Project của bạn đang hoạt động (không bị tạm dừng).";
      }

      // Detailed alert as requested for debugging RLS and column issues
      alert('Lỗi Supabase: ' + errMsg);
      toast.error(`Đồng bộ thất bại: ${errMsg}`);
      if (errMsg.includes("Bảng 'roster_cham_cong' chưa tồn tại") || errMsg.includes("Thiếu cột 'charge_to_center_mkt'")) {
        setShowSqlDialog(true);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleReloadFromFolder = async (id: string, l07: string) => {
    if (!l07) {
      toast.error("Không có mã L07 để tìm kiếm.");
      return;
    }

    setIsFetchingGgSheet(true);
    try {
      let folderId = "";
      const match = DEFAULT_FOLDER_URL.match(/folders\/([a-zA-Z0-9-_]+)/);
      if (match) {
        folderId = match[1];
      }

      if (!folderId) throw new Error("Thư mục mặc định không hợp lệ.");

      const response = await fetch(`/api/drive-folder-files?folderId=${encodeURIComponent(folderId)}`);
      if (!response.ok) {
        throw new Error("Không thể lấy danh sách file từ thư mục. Vui lòng kiểm tra lại quyền truy cập.");
      }

      const data = await response.json();
      if (!data.success || !data.files || data.files.length === 0) {
        throw new Error("Không tìm thấy file nào trong thư mục.");
      }

      const driveFiles = (data.files || []).filter((f: { name?: string }) => !String(f.name).toLowerCase().includes("copy"));
      
      const file = driveFiles.find((f: { name?: string }) => {
        const fileL07 = getL07FromFileName(f.name || "");
        return fileL07 && fileL07.toLowerCase() === l07.toLowerCase();
      });

      if (!file) {
        toast.error(`Không tìm thấy file nào cho trung tâm ${l07} trong thư mục GDrive.`);
        return;
      }

      const url = `https://docs.google.com/spreadsheets/d/${file.id}/edit`;
      
      // Calculate file upload/modified date
      const fileTime = file.modifiedTime || file.createdTime;
      const fileDateObj = fileTime ? new Date(fileTime) : new Date();
      const now = new Date();

      const formattedUploadDate = fileDateObj.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });

      const isEarlierThanNow = fileDateObj.getTime() <= now.getTime();

      handleUpdateRow(id, "url", url);
      handleUpdateRow(id, "fileName", file.name);
      handleUpdateRow(id, "date", formattedUploadDate);

      let msg = `Đã tìm thấy link cho ${l07} (Upload/Cập nhật ngày ${formattedUploadDate}).`;
      if (isEarlierThanNow) {
        msg += ` Tự động đè dữ liệu mới cho ${l07} lên dữ liệu cũ để tránh trùng lặp!`;
      }
      toast.success(msg, { duration: 6000 });

      setTimeout(() => {
        handleSyncRow(id, url, formattedUploadDate);
      }, 500);

    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Có lỗi xảy ra khi tìm link.";
      toast.error(errorMsg);
    } finally {
      setIsFetchingGgSheet(false);
    }
  };

  const handleSyncRow = async (id: string, urlOverride?: string, customUploadDate?: string) => {
    const row = (appData.Timesheet_InputList || []).find(r => r.id === id);
    if (!row) {
      toast.error("Không tìm thấy dòng tương ứng.");
      return;
    }
    const finalUrl = urlOverride || row.url;
    if (!finalUrl) {
      toast.error("Vui lòng nhập URL/ID Google Sheet trước.");
      return;
    }

    handleUpdateRow(id, "status", "processing");
    if (urlOverride) {
      handleUpdateRow(id, "url", urlOverride);
    }
    try {
      const file = await fetchGoogleSheetAsFile(finalUrl, row.sheetName || "Sheet1");
      if (file) {
         const parsed = await parseExcelInWorker(file, {
           fileId: id,
           mode: "roster",
         });
         const mapped = parsed.rows;
         
         const targetL07 = (row.l07 || "").trim();
         const centerInfo = targetL07 ? getCenterInfoByL07(targetL07) : null;
         const aeCode = (row.aeCode || centerInfo?.aeCode || "").trim();
         const targetL07Lower = targetL07.toLowerCase();
         const aeCodeLower = aeCode.toLowerCase();

         updateAppData((prev) => {
            const next = { ...prev };
            
            // Remove existing roster rows for this rowId OR for this center/aeCode to overwrite and prevent duplicate entries
            next.Timesheet_Roster = (next.Timesheet_Roster || []).filter((r: Record<string, unknown>) => {
              if (r._rowId === id) return false;
              if (targetL07Lower) {
                const rCenter = String(r.charge_to_center_mkt || r.l07 || "").trim().toLowerCase();
                const rAe = String(r.aeCode || "").trim().toLowerCase();
                if (rCenter === targetL07Lower) return false;
                if (aeCodeLower && rAe === aeCodeLower) return false;
              }
              return true;
            });

            next.Timesheet_Roster = next.Timesheet_Roster.concat(mapped);
            
            const displayDate = customUploadDate || row.date || new Date().toLocaleString("vi-VN", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit"
            });

            const newList = (prev.Timesheet_InputList || []).map(r => 
              r.id === id ? { 
                ...r, 
                status: "success", 
                count: mapped.length, 
                date: displayDate, 
                fileName: file.name,
                url: finalUrl
              } : r
            );
            next.Timesheet_InputList = newList;
            return next;
         }, false);
         
         toast.success(`Đã đồng bộ ${row.l07}: ${mapped.length} dòng (Đã ghi đè dữ liệu cũ).`);
      } else {
        throw new Error("Không lấy được nội dung file.");
      }
    } catch (err: unknown) {
      console.error(err);
      handleUpdateRow(id, "status", "error");
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi: ${msg}`);
      if (msg.includes("BẠN CHƯA CẤP QUYỀN")) {
        alert(msg);
      }
    }
  };

  const handleUploadFiles = async (files: File[]) => {
    const currentInputs = appData.Timesheet_InputList || [];
    const updatedInputs = [...currentInputs];
    const toProcess: { id: string; file: File }[] = [];

    const filteredFiles = files.filter(f => !f.name.toLowerCase().includes("copy"));
    if (filteredFiles.length === 0 && files.length > 0) {
      toast.info("Tất cả các file đã chọn đều là file copy nên hệ thống tự động bỏ qua.");
      return;
    }

    for (const file of filteredFiles) {
      const l07 = getL07FromFileName(file.name) || "";
      const centerInfo = l07 ? getCenterInfoByL07(l07) : null;
      const aeCode = centerInfo?.aeCode || "";

      const matchIndex = updatedInputs.findIndex((r) => {
        const matchL07 =
          l07 && r.l07 && r.l07.toLowerCase() === l07.toLowerCase();
        const matchAE =
          aeCode && r.aeCode && r.aeCode.toLowerCase() === aeCode.toLowerCase();
        return matchL07 || matchAE;
      });

      if (matchIndex !== -1) {
        updatedInputs[matchIndex] = {
          ...updatedInputs[matchIndex],
          status: "processing",
        };
        toProcess.push({ id: updatedInputs[matchIndex].id, file });
      } else {
        const defaultUrl = l07 === "MKT LOCAL NORTH"
          ? "https://docs.google.com/spreadsheets/d/1z7DJYJAyWqBw8IXNYbEIHhGXBMumsRA4rUHT1prBsFo/edit?gid=1119129159#gid=1119129159"
          : "";
        const newId = crypto.randomUUID();
        updatedInputs.push({
          id: newId,
          l07: l07,
          aeCode: aeCode,
          bus: centerInfo?.bus || "",
          status: "processing",
          url: defaultUrl
        });
        toProcess.push({ id: newId, file });
      }
    }

    const latestFileByRow = new Map<string, { id: string; file: File }>();
    toProcess.forEach((item) => latestFileByRow.set(item.id, item));
    const queue = Array.from(latestFileByRow.values());
    if (queue.length === 0) return;

    type BatchResult = {
      id: string;
      file: File;
      parsed?: ExcelParseResult;
      error?: Error;
    };
    const results: BatchResult[] = [];
    setBulkUploadProgress({ current: 0, total: queue.length });

    for (let index = 0; index < queue.length; index++) {
      const item = queue[index];
      try {
        const parsed = await parseExcelInWorker(item.file, {
          fileId: item.id,
          mode: "auto",
        });
        results.push({ ...item, parsed });
      } catch (error: unknown) {
        results.push({
          ...item,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
      setBulkUploadProgress({ current: index + 1, total: queue.length });
    }

    updateAppData((prev) => {
      let nextRoster = prev.Timesheet_Roster || [];
      let nextSalary = prev.Q_Salary_Scale || [];
      let nextStaff = prev.Q_Staff || [];
      let nextCache = prev.Q_Cache || [];
      const statusById = new Map(
        results.map((result) => [result.id, result] as const),
      );

      results.forEach((result) => {
        const input = updatedInputs.find((row) => row.id === result.id);
        const targetL07 = String(input?.l07 || "").trim().toLowerCase();
        const targetAe = String(input?.aeCode || "").trim().toLowerCase();

        nextRoster = nextRoster.filter((row: Record<string, unknown>) => {
          if (row._rowId === result.id) return false;
          if (!targetL07) return true;
          const rowCenter = String(
            row.charge_to_center_mkt || row.l07 || "",
          ).trim().toLowerCase();
          const rowAe = String(row.aeCode || "").trim().toLowerCase();
          return rowCenter !== targetL07 && (!targetAe || rowAe !== targetAe);
        });
        nextSalary = nextSalary.filter(
          (row: Record<string, unknown>) => row._rowId !== result.id,
        );
        nextStaff = nextStaff.filter(
          (row: Record<string, unknown>) => row._rowId !== result.id,
        );
        nextCache = nextCache.filter(
          (row: Record<string, unknown>) => row._rowId !== result.id,
        );

        if (!result.parsed) return;
        if (result.parsed.kind === "salary") {
          nextSalary = nextSalary.concat(result.parsed.rows);
        } else if (result.parsed.kind === "staff") {
          nextStaff = nextStaff.concat(result.parsed.rows);
        } else if (result.parsed.kind === "cache") {
          nextCache = nextCache.concat(result.parsed.rows);
        } else {
          nextRoster = nextRoster.concat(result.parsed.rows);
        }
      });

      const now = new Date();
      const dateLabel = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")} ${now.getDate()}/${now.getMonth() + 1}`;
      const nextInputs = updatedInputs.map((input) => {
        const result = statusById.get(input.id);
        if (!result) return input;
        const detectedL07 = getL07FromFileName(result.file.name) || "";
        const centerInfo = detectedL07
          ? getCenterInfoByL07(detectedL07)
          : null;
        return {
          ...input,
          l07: input.l07 || detectedL07,
          aeCode: input.aeCode || centerInfo?.aeCode || "",
          bus:
            input.bus ||
            centerInfo?.bus ||
            (detectedL07 ? getBusinessFromL07(detectedL07) : ""),
          status: result.error ? ("error" as const) : ("success" as const),
          count: result.parsed?.rows.length || 0,
          fileName: result.file.name,
          date: dateLabel,
        };
      });

      return {
        ...prev,
        Timesheet_Roster: nextRoster,
        Q_Salary_Scale: nextSalary,
        Q_Staff: nextStaff,
        Q_Cache: nextCache,
        Timesheet_InputList: nextInputs,
      };
    }, false);

    setBulkUploadProgress(null);
    const successCount = results.filter((result) => result.parsed).length;
    const errorCount = results.length - successCount;
    if (successCount > 0) {
      toast.success(`Đã xử lý ${successCount}/${results.length} file Excel.`);
    }
    if (errorCount > 0) {
      const firstError = results.find((result) => result.error)?.error?.message;
      toast.error(`${errorCount} file bị lỗi${firstError ? `: ${firstError}` : "."}`);
    }
  };

  const handleUploadFile = async (rowId: string, file: File) => {
    if (file.name.toLowerCase().includes("copy")) {
      toast?.info(`Hệ thống tự động bỏ qua file có tên 'copy': ${file.name}`);
      return;
    }

    handleUpdateRow(rowId, "status", "processing");
    try {
      const parsed = await parseExcelInWorker(file, {
        fileId: rowId,
        mode: "auto",
      });
      const allRows = parsed.rows;

      if (allRows.length > 0) {
        updateAppData((prev) => {
          const next = { ...prev };
          
          const targetRow = (prev.Timesheet_InputList || []).find(r => r.id === rowId);
          const detectedL07 = getL07FromFileName(file.name);
          const finalL07 = targetRow?.l07 || detectedL07 || "";
          const centerInfo = finalL07 ? getCenterInfoByL07(finalL07) : null;
          const targetL07Lower = finalL07.trim().toLowerCase();
          const aeCodeLower = (targetRow?.aeCode || centerInfo?.aeCode || "").trim().toLowerCase();

          next.Timesheet_Roster = (next.Timesheet_Roster || []).filter((r: Record<string, unknown>) => {
            if (r._rowId === rowId) return false;
            if (targetL07Lower) {
              const rCenter = String(r.charge_to_center_mkt || r.l07 || "").trim().toLowerCase();
              const rAe = String(r.aeCode || "").trim().toLowerCase();
              if (rCenter === targetL07Lower) return false;
              if (aeCodeLower && rAe === aeCodeLower) return false;
            }
            return true;
          });
          next.Q_Salary_Scale = (next.Q_Salary_Scale || []).filter((r: Record<string, unknown>) => r._rowId !== rowId);
          next.Q_Staff = (next.Q_Staff || []).filter((r: Record<string, unknown>) => r._rowId !== rowId);
          next.Q_Cache = (next.Q_Cache || []).filter((r: Record<string, unknown>) => r._rowId !== rowId);

          if (parsed.kind === "salary")
            next.Q_Salary_Scale = next.Q_Salary_Scale.concat(allRows);
          else if (parsed.kind === "staff")
            next.Q_Staff = next.Q_Staff.concat(allRows);
          else if (parsed.kind === "cache")
            next.Q_Cache = next.Q_Cache.concat(allRows);
          else next.Timesheet_Roster = next.Timesheet_Roster.concat(allRows);

          const d = new Date();
          const bu = detectedL07 ? getBusinessFromL07(detectedL07) : "";

          next.Timesheet_InputList = (next.Timesheet_InputList || []).map((input) =>
            input.id === rowId
              ? {
                  ...input,
                  l07: input.l07 || detectedL07 || "",
                  aeCode: input.aeCode || centerInfo?.aeCode || "",
                  bus: input.bus || bu || "",
                  status: "success",
                  fileName: file.name,
                  date: `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")} ${d.getDate()}/${d.getMonth() + 1}`,
                }
              : input
          );

          return next;
        }, false);

        toast?.success(`Đọc thành công ${file.name}`);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      const errName = file.name;
      console.error(`[TimesheetSummary] Error reading ${errName}:`, err);
      handleUpdateRow(rowId, "status", "error");
      toast?.error(
        `Lỗi đọc ${errName}: ${errMsg}`,
      );
    }
  };

  const computedData = useTimesheetCalculations(
    rosterData,
    salaryScaleData,
    staffData,
    cacheData,
    debouncedFromDate,
    debouncedToDate
  );

  useEffect(() => {
    const signature = JSON.stringify({
      emp: computedData.employeeSummary?.length || 0,
      center: computedData.centerSummary?.length || 0,
    });

    if (lastSummaryRef.current === signature) return;
    lastSummaryRef.current = signature;

    updateAppData(
      (prev: AppData) => ({
        ...prev,
        TA_Employee_Summary: {
          headers: getDynamicEmployeeColumns(rosterData).map((c) =>
            String(c.label),
          ),
          data: computedData.employeeSummary,
        },
        TA_Center_Summary: {
          headers: CENTER_COLUMNS.map((c) => c.label),
          data: computedData.centerSummary,
        },
      }),
      false,
    );
  }, [computedData.employeeSummary, computedData.centerSummary, rosterData, updateAppData]);

  const activeData = inputRows;

  const handleUploadFileA = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { rows: allRows } = await parseExcelInWorker(file, { mode: "raw" });

      console.log("Parsed File A:", allRows.slice(0, 5));
      updateAppData((prev) => ({ ...prev, Q_TeacherHours: allRows }));
      toast?.success(`Tải lên File A thành công (${allRows.length} dòng)`);
      if (e.target) e.target.value = "";
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Lỗi khi đọc File A";
      toast?.error(msg);
      if (e.target) e.target.value = "";
    }
  };

  const handleExport = () => {
    if (activeData.length === 0) {
      toast?.error("Không có dữ liệu");
      return;
    }
    const ws = XLSX.utils.json_to_sheet(prepareDataForExport(activeData));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeTab);
    XLSX.writeFile(wb, `Timesheet_Export_${activeTab}.xlsx`);
  };

  return (
    <div 
      className="page-timesheet-summary flex-1 flex flex-col min-h-0 bg-transparent m-0 gap-4 w-full h-full overflow-hidden"
      style={{
        paddingLeft: "6px",
        paddingTop: "6px",
        paddingBottom: "6px",
        paddingRight: "6px"
      }}
    >
      <button data-action="save-data" className="hidden" onClick={handleSaveData} />
      
      <input
        type="file"
        id="fileA"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleUploadFileA}
      />

      <div 
        className="bg-card flex-1 flex flex-col min-h-0 w-full relative border-border rounded-none border-[0.5px]"
        style={{ paddingLeft: "0px", paddingTop: "0px", paddingBottom: "0px", paddingRight: "0px" }}
      >
        <div className="absolute inset-0 bg-accent/5 opacity-[0.05] pointer-events-none hidden" />

        <div
          id="timesheet-summary-header"
          className="unified-table-frame-header relative z-10 flex min-h-[56px] w-full min-w-0 shrink-0 flex-col items-stretch justify-between gap-2 bg-primary/[0.035] px-3 py-2 md:flex-row md:items-center"
        >
          {computedData?.error && (
            <div className="absolute top-0 left-0 right-0 bg-red-100 text-red-600 p-2 text-center text-xs font-bold z-50">
              WORKER ERROR: {computedData.error}
            </div>
          )}
          {isSyncing && (
            <div className="absolute top-0 left-0 right-0 bg-secondary text-primary-foreground border-b border-none px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 z-50 animate-in fade-in slide-in-from-top duration-300">
              <div className="flex items-center gap-3">
                <RefreshCw className="w-5 h-5 text-primary animate-spin" />
                <div>
                  <p className="text-xs font-black text-primary uppercase tracking-wider">
                    Đang đồng bộ dữ liệu lên Supabase...
                  </p>
                  <p className="text-[10px] font-bold text-foreground uppercase mt-0.5">
                    Đã lưu thành công: {syncedRowsCount.toLocaleString()} / {totalSyncRows.toLocaleString()} dòng ({syncProgress}%)
                  </p>
                </div>
              </div>
              <div className="w-full sm:w-64 bg-accent/20 rounded-full h-2.5 overflow-hidden relative">
                <div 
                  className="bg-primary h-full rounded-full transition-all duration-300"
                  style={{ width: `${syncProgress}%` }}
                />
              </div>
            </div>
          )}
          <div className="relative z-10 flex min-w-0 flex-1 items-center gap-2.5">
            {onBack && (
              <button
                onClick={onBack}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-all hover:bg-muted active:scale-95"
                title="Quay lại"
                aria-label="Quay lại bảng Timesheet"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
              <FileSpreadsheet className="h-4 w-4" />
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[14px] font-bold leading-5 tracking-tight text-foreground">
                Cài đặt &amp; tải file Timesheet
              </h1>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-medium leading-4 text-muted-foreground">
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  <strong className="font-bold text-foreground">{inputRows.length || 0}</strong>
                  trung tâm
                </span>
                <span aria-hidden="true" className="text-border">•</span>
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  <strong className="font-bold text-foreground">{computedData?.employeeSummary?.length || 0}</strong>
                  nhân sự
                </span>
                <span aria-hidden="true" className="text-border">•</span>
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  <strong className="font-bold text-foreground">{(computedData?.processedRosterData?.length || 0).toLocaleString()}</strong>
                  bản ghi
                </span>
              </div>
            </div>
          </div>

          <div className="relative z-10 flex shrink-0 items-center justify-end">
            <div className="flex items-center">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button 
                    id="summary-settings-btn"
                    className="group relative z-10 flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 text-foreground shadow-sm transition-all hover:bg-muted active:scale-95"
                    aria-label="Mở cài đặt Timesheet"
                  >
                    <Settings className="h-3.5 w-3.5 shrink-0 text-primary transition-transform duration-300 group-hover:rotate-45" />
                    <span className="hidden select-none text-[10px] font-bold uppercase tracking-wide sm:inline">
                      CÀI ĐẶT
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-64 border border-border/50 shadow-2xl p-2 bg-[var(--card)] opacity-100 rounded-2xl z-[999999]"
                >
                  <DropdownMenuLabel className="text-[0.625rem] font-bold uppercase tracking-widest text-[#0f2a4a]/60 px-3 py-2">
                    CÀI ĐẶT & TIỆN ÍCH
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-border/50 mx-1" />

                  <DropdownMenuItem
                    onSelect={() => window.dispatchEvent(new Event("open-ui-settings"))}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-accent/10 transition-colors"
                  >
                    <Settings className="w-4 h-4 text-[#7A1C1C]" />
                    <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-[#0f2a4a]">
                      Cấu hình Giao diện
                    </span>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator className="bg-border/50 mx-1" />
                  
                  <DropdownMenuItem
                    onSelect={handleAddRow}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-accent/10 transition-colors font-bold text-[0.6875rem] uppercase tracking-wider"
                  >
                    <Plus className="w-4 h-4 text-accent" />
                    <span>Thêm dòng trung tâm</span>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator className="bg-border/50 mx-1" />

                  <DropdownMenuItem
                    onSelect={handleClearAll}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-accent/10 transition-colors text-accent"
                  >
                    <Trash2 className="w-4 h-4 text-accent" />
                    <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-accent">
                      Xóa toàn bộ
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-border/50 mx-1" />
                  <DropdownMenuItem
                    onSelect={() => handleUrlInput(inputRows[0].id, DEFAULT_FOLDER_URL)}
                    disabled={isFetchingGgSheet}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-amber-50 transition-colors text-amber-600 disabled:opacity-50"
                  >
                    <FileSpreadsheet className={`w-4 h-4 text-amber-600 ${isFetchingGgSheet ? "animate-spin" : ""}`} />
                    <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-amber-600">
                      Đồng bộ google sheet (Folder)
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-border/50 mx-1" />
                  <DropdownMenuItem
                    onSelect={handleSyncToSupabase}
                    disabled={isSyncing}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-secondary text-primary-foreground transition-colors text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className={`w-4 h-4 text-primary ${isSyncing ? "animate-spin" : ""}`} />
                    <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-primary">
                      ĐỒNG BỘ LÊN SUPABASE
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-border/50 mx-1" />

                  <DropdownMenuItem
                    onSelect={handleExport}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-secondary/50 transition-colors"
                  >
                    <Download className="w-4 h-4 text-primary" />
                    <span className="text-[0.6875rem] font-bold uppercase tracking-wider">
                      Xuất Excel
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        
        {/* Service Account Info Card removed as requested */}


        <div className="flex-1 flex flex-col min-h-0 relative rounded-none overflow-hidden p-0">
          <TimesheetInputTable
            rows={inputRows}
            onAddRow={handleAddRow}
            onUpdateRow={handleUpdateRow}
            onClearRow={handleClearRow}
            onClearAll={handleClearAll}
            onClearEmptyL07={handleClearEmptyL07}
            onUploadFile={handleUploadFile}
            onUploadFiles={handleUploadFiles}
            onUrlInput={handleUrlInput}
            onRefresh={handleRecalculate}
            onSyncRow={handleSyncRow}
            onReloadFromFolder={handleReloadFromFolder}
            isProcessing={isFetchingGgSheet || bulkUploadProgress !== null}
          />
        </div>
      </div>

      <Dialog open={showSqlDialog} onOpenChange={setShowSqlDialog}>
        <DialogContent className="max-w-2xl bg-card rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-primary p-8 text-primary-foreground">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black uppercase tracking-wider">Thiết lập Bảng Supabase</DialogTitle>
              <DialogDescription className="text-primary-foreground/80 font-medium">
                Bảng 'roster_cham_cong' chưa tồn tại hoặc thiếu cột dữ liệu. Vui lòng copy script bên dưới và chạy trong SQL Editor của Supabase để cập nhật cấu trúc bảng.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="p-8">
            <div className="relative group">
              <pre className="bg-foreground text-secondary p-6 rounded-2xl text-[10px] font-mono leading-relaxed overflow-x-auto max-h-[300px] border border-primary/20 shadow-inner custom-scrollbar">
                {SQL_SETUP_SCRIPT}
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-4 right-4 bg-card/10 hover:bg-card/20 border-white/20 text-primary-foreground gap-2 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all"
                onClick={() => {
                  navigator.clipboard.writeText(SQL_SETUP_SCRIPT);
                  toast.success("Đã copy script SQL!");
                }}
              >
                <Copy className="w-3.5 h-3.5" />
                SAO CHÉP
              </Button>
            </div>
            <div className="mt-6 space-y-4">
              <h4 className="text-xs font-black uppercase tracking-widest text-foreground/50">Các bước thực hiện:</h4>
              <ol className="text-[11px] font-bold text-foreground/80 space-y-2 list-decimal pl-4">
                <li>Truy cập vào Dashboard Supabase của bạn.</li>
                <li>Chọn dự án và vào phần <span className="text-primary">SQL Editor</span>.</li>
                <li>Bấm <span className="text-primary">New Query</span> và dán nội dung script trên vào.</li>
                <li>Bấm <span className="text-primary">Run</span> để tạo bảng và cấu hình quyền truy cập (RLS).</li>
                <li>Quay lại đây và thử Đồng bộ lại.</li>
              </ol>
            </div>
          </div>
          <DialogFooter className="p-6 bg-background border-t border-border/50">
            <Button 
              onClick={() => setShowSqlDialog(false)}
              className="bg-primary hover:opacity-90 text-primary-foreground rounded-xl px-8 font-black uppercase tracking-widest text-[10px]"
            >
              Tôi đã hiểu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
