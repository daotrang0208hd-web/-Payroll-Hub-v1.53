/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useMemo, useEffect } from "react";
import { PanelLeft } from "lucide-react";
import { DataTable } from "../../../components/DataTable";
import { DETAIL_COLUMNS } from "../../../constants/timesheet-columns";

interface RosterRawTableProps {
  data: Record<string, unknown>[];
  onFilteredDataChange?: (data: any[]) => void;
  onCellChange?: (row: any, colKey: string, value: any) => void;
  tableRef?: any;
  onColumnFiltersChange?: (hasFilters: boolean) => void;
  showSidebar?: boolean;
  onToggleSidebar?: () => void;
}

export function RosterRawTable({ 
  data, 
  onFilteredDataChange, 
  onCellChange,
  tableRef,
  onColumnFiltersChange,
  showSidebar,
  onToggleSidebar
}: RosterRawTableProps) {
  useEffect(() => {
    const handleOverlapFilter = (e: any) => {
      const { ma_nv, ngay } = e.detail;
      if (tableRef?.current && tableRef.current.setMultipleColumnFilters) {
        tableRef.current.setMultipleColumnFilters({
          ma_nv: new Set([String(ma_nv)]),
          ngay: new Set([ngay])
        });
      }
    };
    window.addEventListener("overlap-filter-requested", handleOverlapFilter);
    return () => window.removeEventListener("overlap-filter-requested", handleOverlapFilter);
  }, [tableRef]);

  const sanitizedData = useMemo(() => {
    return data.map(row => ({
      ...row,
      ma_nv: row.ma_nv !== undefined && row.ma_nv !== null ? String(row.ma_nv) : row.ma_nv,
    }));
  }, [data]);

  const columns = useMemo(() => {
    return DETAIL_COLUMNS;
  }, []);

  const totalHours = useMemo(() => {
    return sanitizedData.reduce((sum, r) => {
      const val = Number(r.gio_lam || r.workingHours || r.totalHours || r.hours) || 0;
      return sum + val;
    }, 0);
  }, [sanitizedData]);

  return (
    <div 
      className="flex-1 flex flex-col min-h-0 bg-transparent overflow-hidden"
    >
      <div className="flex-1 flex flex-col overflow-hidden bg-transparent border-0 scroll-wrapper">
        <div 
          className="bg-white border-b border-slate-100 flex items-center justify-between shrink-0"
          style={{ height: "48px", paddingLeft: "12px", paddingRight: "12px", paddingBottom: "12px", paddingTop: "12px" }}
        >
          <div className="flex items-center gap-2">
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
              BẢNG Roster từ Center&AE (RAW DATA)
            </h3>
          </div>
          <div className="flex items-center gap-4">

            <div className="flex flex-col items-end border-l border-border pl-4">
              <span className="text-[8px] font-bold text-foreground/60 uppercase tracking-tighter whitespace-nowrap">SỐ DÒNG</span>
              <span className="text-xs font-black text-foreground">{sanitizedData.length}</span>
            </div>
            <div className="flex flex-col items-end border-l border-border pl-4">
              <span className="text-[8px] font-bold text-foreground/60 uppercase tracking-tighter whitespace-nowrap">TỔNG GIỜ LÀM</span>
              <div className="bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                <span className="text-xs font-black text-foreground tracking-tight">{totalHours.toLocaleString()}h</span>
              </div>
            </div>
          </div>
        </div>
        <DataTable
          ref={tableRef}
          columns={columns as any}
          data={sanitizedData as any}
          isEditable={true}
          showRowNumber={true}
          selectable={false}
          striped={false}
          stickyHeader={true}
          storageKey="timesheet_roster_raw"
          className="border-none"
          
          footerClassName="bg-[var(--secondary)] text-foreground font-black border-t border-border"
          showFooter={true}
          onFilteredDataChange={onFilteredDataChange}
          onColumnFiltersChange={onColumnFiltersChange}
          onCellChange={onCellChange}
          autoHideZeroSumColumns={true}
        />
      </div>
    </div>
  );
}
