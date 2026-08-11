// Robust VN number formatter — does NOT depend on browser locale
export function formatVNRobust(num: number, decimals: number = 0): string {
  if (isNaN(num)) return "0";
  const rounded = Math.round(num);

  return new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rounded);
}