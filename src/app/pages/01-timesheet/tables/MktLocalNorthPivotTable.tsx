/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect, useMemo } from "react";
import { Table2, Eye, EyeOff, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { formatMoneyVND } from "../../../lib/utils/data-utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";

interface MktLocalNorthPivotTableRow {
  business: string;
  center: string;
  chargeToCenterMkt: string;
  values: Record<string, number>;
  total: number;
  [key: string]: unknown;
}

interface MktLocalNorthPivotTableProps {
  rows: MktLocalNorthPivotTableRow[];
  types: string[];
  grandTotals: {
    totals: Record<string, number>;
    grandTotal: number;
    [key: string]: unknown;
  };
  showSidebar?: boolean;
  onToggleSidebar?: () => void;
}

export const MktLocalNorthPivotTable: React.FC<MktLocalNorthPivotTableProps> = ({
  rows,
  types,
  grandTotals,
  showSidebar = true,
  onToggleSidebar,
}) => {
  const [itemsPerPage, setItemsPerPage] = useState<number | typeof Infinity>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [rows.length, itemsPerPage]);

  const totalPages = itemsPerPage === Infinity ? 1 : Math.max(1, Math.ceil(rows.length / Number(itemsPerPage)));
  const validCurrentPage = Math.max(1, Math.min(currentPage, totalPages));

  const paginatedRows = useMemo(() => {
    if (itemsPerPage === Infinity) return rows;
    const start = (validCurrentPage - 1) * Number(itemsPerPage);
    return rows.slice(start, start + Number(itemsPerPage));
  }, [rows, validCurrentPage, itemsPerPage]);

  const startIdx = itemsPerPage === Infinity ? 0 : (validCurrentPage - 1) * Number(itemsPerPage);
  const endIdx = itemsPerPage === Infinity ? rows.length : Math.min(startIdx + Number(itemsPerPage), rows.length);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-transparent overflow-hidden">
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-transparent border-0">
      {/* Header Info - Consistent with other tables */}
      <div 
        className="flex items-center justify-between shrink-0"
        style={{ height: "64px", paddingLeft: "20px", paddingRight: "39px", paddingBottom: "12px", paddingTop: "12px" }}
      >
        <div className="flex items-center gap-3" style={{ paddingRight: "0px" }}>
          <div className="flex items-center gap-2">
            {onToggleSidebar && (
              <button
                onClick={onToggleSidebar}
                className="flex items-center justify-center p-1.5 rounded-full border border-primary/10 text-primary hover:bg-primary/5 transition-all cursor-pointer active:scale-95 shadow-sm"
                title={showSidebar ? "Ẩn thanh bên" : "Hiện thanh bên"}
              >
                {showSidebar ? (
                  <Eye className="w-4 h-4" />
                ) : (
                  <EyeOff className="w-4 h-4 text-slate-400" />
                )}
              </button>
            )}
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
               <Table2 className="w-4 h-4 text-primary" />
            </div>
          </div>
          <div>
            <h3 className="font-display font-black text-[15px] text-foreground tracking-tight uppercase leading-none">
              PIVOT TABLE
            </h3>
            <p className="text-[10px] text-muted-foreground font-medium mt-0.5 uppercase tracking-[0.05em]">
              MKT LOCAL NORTH • Payroll Summary
            </p>
          </div>
        </div>
        <div 
          className="flex items-center gap-6"
        >
          <div className="flex flex-col items-end">
            <span className="text-[9px] font-bold text-foreground/60 uppercase tracking-tighter">SỐ DÒNG</span>
            <span className="text-sm font-black text-foreground">{rows.length}</span>
          </div>
          <div className="flex flex-col items-end border-l border-border pl-6" style={{ color: "#d997a8" }}>
            <span className="text-[9px] font-bold text-foreground/60 uppercase tracking-tighter">TỔNG PHÍ</span>
            <div className="bg-accent/10 px-2.5 py-0.5 rounded-lg border border-accent/20">
                <span className="text-sm font-black text-accent tracking-tight">{formatMoneyVND(grandTotals.grandTotal)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar relative bg-slate-50/30">
        <table className="w-full border-separate border-spacing-0 font-sans text-[12px]" style={{ borderCollapse: "separate" }}>
          <thead className="sticky top-0 z-[110] bg-slate-100">
            <tr className="h-10">
              <th className="border-r border-b border-slate-300/80 px-2 py-2 text-center font-black uppercase tracking-wider text-slate-700 bg-slate-100 shadow-[0_1px_0_rgba(0,0,0,0.05)] text-[10px] w-12">
                STT
              </th>
              <th className="border-r border-b border-slate-300/80 px-3 py-2 text-center font-black uppercase tracking-wider text-slate-700 bg-slate-100 shadow-[0_1px_0_rgba(0,0,0,0.05)] text-[10px] min-w-[120px]">
                BUSINESS
              </th>
              <th className="border-r border-b border-slate-300/80 px-3 py-2 text-center font-black uppercase tracking-wider text-slate-700 bg-slate-100 shadow-[0_1px_0_rgba(0,0,0,0.05)] text-[10px] min-w-[160px]">
                L07
              </th>
              {types.map((type) => (
                <th key={type} className="border-r border-b border-slate-300/80 px-3 py-2 text-center font-black uppercase tracking-wider text-slate-700 bg-slate-100 shadow-[0_1px_0_rgba(0,0,0,0.05)] text-[10px] min-w-[110px]">
                  {type}
                </th>
              ))}
              <th className="border-r border-b border-slate-300/80 px-3 py-2 text-center font-black uppercase tracking-wider text-white bg-slate-800 shadow-[0_1px_0_rgba(0,0,0,0.05)] text-[10px] min-w-[130px]">
                GRAND TOTAL
              </th>
            </tr>
          </thead>
          <tbody className="divide-y-0">
            {paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={4 + types.length} className="py-8 text-center text-slate-400 text-xs bg-white">
                  Chưa có dữ liệu Pivot
                </td>
              </tr>
            ) : (
              paginatedRows.map((row, idx) => (
                <tr key={idx} className="transition-all hover:bg-slate-200/40 group h-9 border-b border-slate-200">
                  <td className="border-r border-b border-slate-200/60 px-2 py-1 text-center font-mono font-bold text-slate-500 text-[10px] bg-white/50 group-hover:bg-slate-50 transition-colors">
                    {startIdx + idx + 1}
                  </td>
                  <td className="border-r border-b border-slate-200/60 px-3 py-1 font-bold text-slate-800 uppercase text-[11px] bg-white/50 group-hover:bg-slate-50 transition-colors">
                    {row.business}
                  </td>
                  <td className="border-r border-b border-slate-200/60 px-3 py-1 font-bold text-slate-500 uppercase text-[10px] bg-white/50 group-hover:bg-slate-50 transition-colors truncate max-w-[200px]">
                    {row.chargeToCenterMkt}
                  </td>
                  {types.map((type) => (
                    <td 
                      key={type} 
                      className={`border-r border-b border-slate-200/60 px-3 py-1 text-right font-mono text-[11px] group-hover:bg-slate-50 transition-colors ${row.values[type] ? "text-slate-900 font-bold" : "text-slate-300"}`}
                    >
                      {row.values[type] ? formatMoneyVND(row.values[type]).replace(" ₫", "") : "—"}
                    </td>
                  ))}
                  <td className="border-r border-b border-slate-200/60 px-3 py-1 text-right font-mono text-[11px] font-black text-slate-950 bg-slate-100/50 group-hover:bg-slate-200/30 transition-colors">
                    {formatMoneyVND(row.total).replace(" ₫", "")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="sticky bottom-0 z-20 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
            <tr className="font-black uppercase tracking-wider text-[11px] h-11">
              <td 
                colSpan={3} 
                className="border-r border-b border-slate-300 px-3 py-2 text-slate-900 font-black bg-slate-100"
              >
                SUMMARY TOTAL
              </td>
              {types.map((type) => (
                <td key={type} className="border-r border-b border-slate-300 px-3 py-2 text-right font-mono text-[11px] font-black text-slate-900 bg-slate-100">
                  {formatMoneyVND(grandTotals.totals[type] || 0).replace(" ₫", "")}
                </td>
              ))}
              <td className="border-r border-b border-slate-300 px-3 py-2 text-right font-mono text-[11px] font-black text-white bg-slate-800">
                {formatMoneyVND(grandTotals.grandTotal).replace(" ₫", "")}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* FOOTER BAR WITH PAGE SIZE SELECTOR MATCHING SỐ GIỜ LÀM VIỆC (DATATABLE) */}
      <div 
        className="px-4 py-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs font-sans bg-slate-50/80 text-slate-700 shrink-0"
        style={{ minHeight: "44px" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-600 whitespace-nowrap">
              Hiển thị:
            </span>
            <Select
              value={itemsPerPage === Infinity ? "all" : String(itemsPerPage)}
              onValueChange={(val) => {
                setItemsPerPage(val === "all" ? Infinity : Number(val));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger 
                className="rounded-[15px] px-2.5 text-[12px] font-bold text-slate-800 border-[#e7dbdc] bg-white hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer h-7" 
                style={{ height: "28px", width: "100px" }}
              >
                <SelectValue placeholder="Chọn..." />
              </SelectTrigger>
              <SelectContent className="bg-white border-[#e7dbdc] z-[99999] opacity-100 shadow-xl rounded-xl">
                <SelectItem value="10" className="text-[12px] font-bold cursor-pointer">10 dòng</SelectItem>
                <SelectItem value="20" className="text-[12px] font-bold cursor-pointer">20 dòng</SelectItem>
                <SelectItem value="50" className="text-[12px] font-bold cursor-pointer">50 dòng</SelectItem>
                <SelectItem value="100" className="text-[12px] font-bold cursor-pointer">100 dòng</SelectItem>
                <SelectItem value="all" className="text-[12px] font-bold cursor-pointer">Tất cả</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <span className="text-[11px] font-medium text-slate-500 border-l border-slate-200 pl-3">
            {itemsPerPage === Infinity
              ? `Tổng ${rows.length} dòng`
              : rows.length === 0
                ? "0 dòng"
                : `Hiển thị ${startIdx + 1} - ${endIdx} / ${rows.length} dòng`}
          </span>
        </div>

        {/* Pagination Navigation Controls */}
        {itemsPerPage !== Infinity && totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={validCurrentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Trang đầu"
            >
              <ChevronsLeft className="w-3.5 h-3.5 text-slate-700" />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={validCurrentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Trang trước"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-slate-700" />
            </button>

            <span className="text-[11px] font-bold px-2.5 text-slate-700">
              Trang {validCurrentPage} / {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={validCurrentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Trang sau"
            >
              <ChevronRight className="w-3.5 h-3.5 text-slate-700" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={validCurrentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Trang cuối"
            >
              <ChevronsRight className="w-3.5 h-3.5 text-slate-700" />
            </button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};
