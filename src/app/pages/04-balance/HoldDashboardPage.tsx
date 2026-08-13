import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { HoldAddDashboard } from "./components/HoldAddDashboard";

export function HoldDashboardPage(): React.ReactElement {
  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
      <AnimatePresence initial={false}>
        <motion.div
          key="hold-dashboard-main"
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14, ease: "easeOut" }}
          className="absolute inset-0 flex flex-col min-h-0 bg-transparent p-3 md:p-4 items-center overflow-hidden"
        >
          {/* Main Content Card matching Master AE and Pivot Sheet styles */}
          <div 
            className="bg-white dark:bg-card force-light dark:force-dark flex-1 flex flex-col min-h-0 relative z-10 w-full overflow-hidden border border-[#e7dbdc] shadow-sm hold-dashboard-card rounded-md"
            style={{ padding: "0px" }}
          >
            <HoldAddDashboard />
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
