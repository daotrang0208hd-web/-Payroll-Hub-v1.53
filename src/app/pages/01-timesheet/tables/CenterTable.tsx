/* eslint-disable @typescript-eslint/no-explicit-any */
import { PanelLeft } from "lucide-react";
import { DataTable } from "../../../components/DataTable";
import { CENTER_COLUMNS } from "../../../constants/timesheet-columns";

import { useMemo } from "react";

interface CenterTableProps {
  data: Record<string, unknown>[];
  mktLocalNorthData?: Record<string, unknown>[];
  onFilteredDataChange?: (data: any[]) => void;
  tableRef?: any;
  onColumnFiltersChange?: (hasFilters: boolean) => void;
  showSidebar?: boolean;
  onToggleSidebar?: () => void;
}

export function CenterTable({ 
  data, 
  mktLocalNorthData = [],
  onFilteredDataChange,
  tableRef,
  onColumnFiltersChange,
  showSidebar,
  onToggleSidebar
}: CenterTableProps) {
  const normalizeCenter = (value: unknown) =>
    String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");

  const { centerColumns, centerRows } = useMemo(() => {
    const types = Array.from(
      new Set(
        mktLocalNorthData
          .map((row) => String(row.taskType || "").trim().toUpperCase())
          .filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right, "vi"));

    const valuesByCenter = new Map<string, Record<string, number>>();
    mktLocalNorthData.forEach((row) => {
      if (String(row.overlap_check || "").startsWith("Trùng lịch")) return;
      const type = String(row.taskType || "").trim().toUpperCase();
      if (!type) return;
      const centerKey = normalizeCenter(
        row.chargeToCenterMkt || row.charge_to_center_mkt || row.l07 || row.center,
      );
      if (!centerKey) return;
      const current = valuesByCenter.get(centerKey) || {};
      const hours = Number(row.duration ?? row.workingHours) || 0;
      current[type] = (current[type] || 0) + hours * 20_000;
      valuesByCenter.set(centerKey, current);
    });

    const dynamicColumns = types.map((type) => ({
      key: `mktLocalNorth::${type}`,
      label: type,
      group: "MKT LOCAL NORTH_TIMESHEET",
      type: "currency" as const,
      width: 140,
    }));
    const staticColumns = CENTER_COLUMNS.filter(
      (column) => column.key !== "chargeMktLocal",
    );
    const totalIndex = staticColumns.findIndex(
      (column) => column.key === "totalSalary",
    );
    const columns = [...staticColumns];
    columns.splice(
      totalIndex >= 0 ? totalIndex : columns.length,
      0,
      ...dynamicColumns,
    );

    const rows = data.map((row) => {
      const centerKey = normalizeCenter(row.l07 || row.center);
      const values = valuesByCenter.get(centerKey) || {};
      const additions = Object.fromEntries(
        types.map((type) => [`mktLocalNorth::${type}`, values[type] || 0]),
      );
      return { ...row, ...additions };
    });

    return { centerColumns: columns, centerRows: rows };
  }, [data, mktLocalNorthData]);

  const totalHours = useMemo(() => {
    return data.reduce((sum, r) => sum + (Number(r.totalHours) || 0), 0);
  }, [data]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-transparent overflow-hidden">
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-transparent border-0">
      <div 
        className="bg-white border-b border-slate-100 flex items-center justify-between shrink-0"
        style={{ height: "48px", paddingLeft: "12px", paddingRight: "12px", paddingBottom: "12px", paddingTop: "12px" }}
      >
        <div className="flex items-center gap-2" style={{ paddingRight: "0px" }}>
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="flex items-center justify-center rounded-full border border-slate-200/90 bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-all shadow-xs cursor-pointer w-7 h-7 p-0 active:scale-95 shrink-0"
              title={showSidebar ? "Ẩn Panel Sidebar" : "Hiện Panel Sidebar"}
              type="button"
            >
              <PanelLeft className="w-3.5 h-3.5 text-primary" />
            </button>
          )}
          <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
          <h3 className="font-bold uppercase tracking-wider text-primary text-[11px]">
            BẢNG TỔNG HỢP GIỜ LÀM THEO TRUNG TÂM (CENTER)
          </h3>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-[8px] font-bold text-foreground/60 uppercase tracking-tighter whitespace-nowrap">TRUNG TÂM</span>
            <span className="text-xs font-black text-foreground">{data.length}</span>
          </div>
          <div className="flex flex-col items-end border-l border-border pl-4" style={{ color: "#d997a8" }}>
            <span className="text-[8px] font-bold text-foreground/60 uppercase tracking-tighter whitespace-nowrap">TỔNG GIỜ LÀM</span>
            <div className="bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                <span className="text-xs font-black text-foreground tracking-tight">{totalHours.toLocaleString()}h</span>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <DataTable
          ref={tableRef}
          columns={centerColumns as any}
          data={centerRows as any}
          isEditable={false}
          showRowNumber={true}
          selectable={false}
          striped={false}
          stickyHeader={true}
          storageKey="timesheet_center"
          className="border-none"
          
          footerClassName="bg-[var(--secondary)] text-foreground font-black border-t border-border"
          showFooter={true}
          onFilteredDataChange={onFilteredDataChange}
          onColumnFiltersChange={onColumnFiltersChange}
          autoHideZeroSumColumns={true}
        />
      </div>
      </div>
    </div>
  );
}
