/* eslint-disable @typescript-eslint/no-explicit-any */
import { formatMoneyVND } from "../../../lib/utils/data-utils";
import { useMemo, useState, useEffect } from "react";

interface MktLocalNorthTableProps {
  data: any[];
  onFilteredDataChange?: (data: any[]) => void;
}

export function MktLocalNorthTable({ data, onFilteredDataChange }: MktLocalNorthTableProps) {
  const [filters, setFilters] = useState<Record<string, string>>({
    business: "",
    chargeToCenterMkt: "",
  });

  // Logic inside TimesheetHub.tsx copied here
  const { mktPivotRows, mktPivotUniqueTypes, mktPivotGrandTotals } = useMemo(() => {
    let rows = data;

    // Apply filters
    if (filters.business) {
      const lower = filters.business.toLowerCase();
      rows = rows.filter(r => r.business && String(r.business).toLowerCase().includes(lower));
    }
    if (filters.chargeToCenterMkt) {
      const lower = filters.chargeToCenterMkt.toLowerCase();
      rows = rows.filter(r => r.chargeToCenterMkt && String(r.chargeToCenterMkt).toLowerCase().includes(lower));
    }

    const types = new Set<string>();
    rows.forEach((r: any) => {
      Object.keys(r.values || {}).forEach((t) => types.add(t));
    });
    const uniqueTypes = Array.from(types).sort();

    const grandTotals = {
      totals: {} as Record<string, number>,
      grandTotal: 0,
    };
    rows.forEach((r: any) => {
      uniqueTypes.forEach((t) => {
        const val = r.values?.[t] || 0;
        grandTotals.totals[t] = (grandTotals.totals[t] || 0) + val;
      });
      grandTotals.grandTotal += r.total || 0;
    });

    return {
      mktPivotRows: rows,
      mktPivotUniqueTypes: uniqueTypes,
      mktPivotGrandTotals: grandTotals,
    };
  }, [data, filters]);

  // Notify filtered data change
  useEffect(() => {
    if (onFilteredDataChange) {
      onFilteredDataChange(mktPivotRows);
    }
  }, [mktPivotRows, onFilteredDataChange]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white border-t border-border overflow-hidden rounded-[40px]">
      {/* Summary Ribbon */}
      <div className="px-6 py-2 bg-primary/5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between font-sans text-[13px] font-bold text-primary tracking-wider uppercase shrink-0 gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
          <span>Bảng Pivot Phí MKT Local North (Đơn giá: Số giờ làm * 20.000đ)</span>
        </div>
        <div className="flex items-center gap-4 text-[13px]">
          <span>
            SỐ DÒNG: <span className="font-mono text-slate-800">{mktPivotRows.length}</span>
          </span>
          <span>
            LOẠI CÔNG VIỆC: <span className="font-mono text-slate-800">{mktPivotUniqueTypes.length}</span>
          </span>
          <span className="text-rose-700 font-extrabold bg-rose-50 px-2.5 py-1 rounded-md border border-rose-100">
            TỔNG PHÍ: {formatMoneyVND(mktPivotGrandTotals.grandTotal)}
          </span>
        </div>
      </div>

      {/* Scroll Container */}
      <div className="flex-1 overflow-auto custom-scrollbar relative">
        <table
          style={{ borderWidth: "0px", borderRadius: "0px" }}
          className="w-full text-left border-collapse min-w-max relative bg-white font-sans text-[13px]"
        >
          <thead className="sticky top-0 z-[40] shadow-[0_1px_3px_rgba(0,0,0,0.05)] bg-white">
            <tr className="bg-white text-slate-800 h-10 border-b border-border">
              <th
                style={{ padding: "0" }}
                className="text-xs font-black uppercase tracking-wider text-foreground text-center border-r border-border align-middle bg-white w-12"
              >
                No.
              </th>
              <th
                style={{ padding: "0" }}
                className="text-[13px] font-black uppercase tracking-wider text-foreground text-left border-r border-border align-middle bg-white"
              >
                <div className="resize-x overflow-hidden w-[130px] min-w-[60px] pl-5 py-2.5 flex items-center">
                  Business
                </div>
              </th>
              {mktPivotUniqueTypes.map((type) => (
                <th
                  key={type}
                  style={{ padding: "0" }}
                  className="text-xs font-black uppercase tracking-wider text-foreground text-center border-r border-border bg-white align-middle"
                >
                  <div className="resize-x overflow-hidden w-[130px] min-w-[60px] flex justify-center items-center py-2.5 mx-auto">
                    {type}
                  </div>
                </th>
              ))}
              <th
                style={{ padding: "0" }}
                className="text-xs font-black uppercase tracking-wider text-foreground text-right bg-white align-middle border-b border-border"
              >
                <div className="resize-x overflow-hidden w-[160px] min-w-[80px] pr-5 py-2.5 flex justify-end items-center mx-auto">
                  Grand Total
                </div>
              </th>
            </tr>
            {/* Column Text Filter Row */}
            <tr className="bg-white border-b border-border">
              <th className="p-1 border-r border-border bg-white text-center text-[10px] text-foreground/40 font-mono">#</th>
              <th className="p-1 border-r border-border bg-white">
                <div className="px-1.5 py-0.5">
                  <input
                    type="text"
                    placeholder="Lọc Business..."
                    value={filters.business}
                    onChange={(e) => setFilters(prev => ({ ...prev, business: e.target.value }))}
                    className="w-full h-7 bg-white border border-border rounded px-2 text-[10px] placeholder:text-foreground/60 font-normal focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 text-slate-800 transition-all shadow-sm"
                  />
                </div>
              </th>
              {mktPivotUniqueTypes.map((type) => (
                <th key={`filter-${type}`} className="p-1 border-r border-border bg-white" />
              ))}
              <th className="p-1 bg-white" />
            </tr>
          </thead>
          <tbody>
            {mktPivotRows.map((row, idx) => (
              <tr
                key={idx}
                className="bg-white h-11 border-b border-border"
              >
                <td className="px-2 py-2.5 text-xs font-mono font-bold text-center text-foreground/60 border-r border-border">
                  {idx + 1}
                </td>
                <td className="px-5 py-2.5 text-[11px] font-bold text-foreground border-r border-border">
                  {row.business}
                </td>
                {mktPivotUniqueTypes.map((type) => {
                  const val = row.values[type] || 0;
                  return (
                    <td
                      key={type}
                      className={`px-5 py-2.5 text-xs font-mono text-center border-r border-border font-semibold bg-white ${val === 0 ? "text-transparent select-none" : "text-slate-800"}`}
                    >
                      {val === 0 ? "0" : formatMoneyVND(val)}
                    </td>
                  );
                })}
                <td className="px-5 py-2.5 text-xs font-mono font-black text-right text-slate-800 bg-white">
                  {row.total === 0 ? "0" : formatMoneyVND(row.total)}
                </td>
              </tr>
            ))}

          </tbody>
          <tfoot className="sticky bottom-0 z-20 bg-white">
            {/* Grand Total Row */}
            <tr className="bg-white font-extrabold border-t-2 border-slate-300 h-12 text-foreground shadow-[0_-2px_6px_rgba(0,0,0,0.05)]">
              <td
                className="px-5 py-3 text-xs font-black uppercase tracking-wider text-foreground border-r border-border"
                colSpan={1}
                style={{ fontSize: "11px", lineHeight: "13.5px" }}
              >
                Tổng cộng / Grand Total
              </td>
              {mktPivotUniqueTypes.map((type) => {
                const totalVal = mktPivotGrandTotals.totals[type] || 0;
                return (
                  <td
                    key={type}
                    className="px-5 py-3 text-xs font-mono text-center border-r border-border text-foreground bg-white font-black"
                  >
                    {totalVal === 0 ? "0" : formatMoneyVND(totalVal)}
                  </td>
                );
              })}
              <td className="px-5 py-3 text-xs font-mono font-black text-right text-foreground bg-white">
                {formatMoneyVND(mktPivotGrandTotals.grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
