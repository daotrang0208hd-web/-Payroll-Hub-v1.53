import React from "react";
import { useAppData } from "../../lib/contexts/AppDataContext";
import { Clock } from "lucide-react";
import { format } from "date-fns";

export const SaveStatusCard: React.FC<{ 
  className?: string; 
  style?: React.CSSProperties;
  textStyle?: React.CSSProperties;
  iconStyle?: React.CSSProperties;
}> = ({ className, style, textStyle, iconStyle }) => {
  const { appData } = useAppData();
  
  const lastUpdated = appData?.updatedAt ? new Date(appData.updatedAt) : null;
  
  if (!lastUpdated) return null;

  // Format with AM/PM then replace to SA/CH for Vietnamese localization
  const formattedTime = format(lastUpdated, "dd/MM/yyyy hh:mm a");
  const formattedWithAmPm = formattedTime
    .replace("AM", "SA")
    .replace("PM", "CH");

  return (
    <div 
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50/80 border border-blue-200/60 shadow-sm relative z-10 animate-in fade-in zoom-in-95 w-max shrink-0 ${className || ""}`}
      style={style}
      title="Dữ liệu chỉ phản ánh các giá trị từ Roster Center/GG Sheet được ghi nhận trước thời điểm này. Bạn cần click 'Lưu dữ liệu' để chốt bản ghi mới."
    >
      <Clock 
        className="w-3.5 h-3.5 text-blue-500 animate-pulse shrink-0" 
        style={iconStyle}
      />
      <span 
        className="text-[0.65rem] font-bold tracking-wider text-blue-700 uppercase whitespace-nowrap"
        style={textStyle}
      >
        SAVED: {formattedWithAmPm}
      </span>
    </div>
  );
};
