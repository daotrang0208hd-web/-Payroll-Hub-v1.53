/**
 * Center Mapping Utilities
 * Provides mappings and resolution functions for converting center names,
 * AE Codes, and raw strings into standardized L07 center codes and Business Units (BU).
 */

export interface CenterInfo {
  l07: string;
  aeCode: string;
  bus: string;
  keys: string[];
}

export const CENTER_DATA: CenterInfo[] = [
  { l07: "BN0001.LTT", aeCode: "Ngo Si Lien", bus: "AHN", keys: ["BN0001.LTT", "BN0001", "NGO SI LIEN", "NSL", "BN01", "BN1", "LY THAI TO", "LÝ THÁI TỔ", "BN1.NSL"] },
  { l07: "BN0002.TSN", aeCode: "Tu Son", bus: "AHN", keys: ["BN0002.TSN", "BN0002", "TU SON", "TUS", "TSN", "BN02", "BN2", "BN2.TUS"] },
  { l07: "HN0001.PHY", aeCode: "Pho Hue Junior", bus: "AHN", keys: ["HN0001.PHY", "HN0001", "PHO HUE", "PHO HUE JUNIOR", "PHỐ HUẾ", "HN1.PH", "PHY", "PH", "HN01", "HN1"] },
  { l07: "HN0002.THA", aeCode: "Thai Ha (center Láng Hạ)", bus: "AHN", keys: ["HN0002.THA", "HN0002", "THAI HA", "THÁI HÀ", "THAI HA CENTER LANG HA", "THAI HA (CENTER LÁNG HẠ)", "LANG HA", "LÁNG HẠ", "TH", "THA", "HN02", "HN2", "HN2.TH"] },
  { l07: "HN0003.HQV", aeCode: "Hoang Quoc Viet", bus: "AHN", keys: ["HN0003.HQV", "HN0003", "HOANG QUOC VIET", "HOÀNG QUỐC VIỆT", "HQV", "HN03", "HN3", "HN3.HQV"] },
  { l07: "HN0004.LGI", aeCode: "Lieu Giai", bus: "AHN", keys: ["HN0004.LGI", "HN0004", "LIEU GIAI", "LIỄU GIAI", "LGI", "LG", "HN04", "HN4", "HN4.LG"] },
  { l07: "HN0005.NVL", aeCode: "Nguyen Van Linh", bus: "AHN", keys: ["HN0005.NVL", "HN0005", "NGUYEN VAN LINH", "NGUYỄN VĂN LINH", "NVL", "HN05", "HN5", "HN5.NVL"] },
  { l07: "HN0007.VQN", aeCode: "Van Quan", bus: "AHN", keys: ["HN0007.VQN", "HN0007", "VAN QUAN", "VĂN QUÁN", "VQ", "VQN", "HN07", "HN7", "HN7.VQ"] },
  { l07: "HN0010.MDH", aeCode: "My Dinh", bus: "AHN", keys: ["HN0010.MDH", "HN0010", "MY DINH", "MỸ ĐÌNH", "THE GARDEN", "MD", "MDH", "HN10", "HN10.TG"] },
  { l07: "HN0012.NHT", aeCode: "Nguyen Huu Tho", bus: "AHN", keys: ["HN0012.NHT", "HN0012", "NGUYEN HUU THO", "NGUYỄN HỮU THỌ", "HOANG MAI", "HOÀNG MAI", "NHT", "HM", "HN12", "HN12.NHT"] },
  { l07: "HN0014.TMI", aeCode: "Tan Mai", bus: "AHN", keys: ["HN0014.TMI", "HN0014", "TAN MAI", "TÂN MAI", "TMI", "TM", "HN14", "HN14.TM"] },
  { l07: "HN0015.VPU", aeCode: "Van Phu", bus: "AHN", keys: ["HN0015.VPU", "HN0015", "VAN PHU", "VĂN PHÚ", "VPU", "VP", "HN15", "HN15.VP"] },
  { l07: "HN0016.PDP", aeCode: "Phan Dinh Phung", bus: "AHN", keys: ["HN0016.PDP", "HN0016", "PHAN DINH PHUNG", "PHAN ĐÌNH PHÙNG", "PDP", "HN16", "HN16.PDP"] },
  { l07: "HN0017.HNI", aeCode: "Ham Nghi", bus: "AHN", keys: ["HN0017.HNI", "HN0017", "HAM NGHI", "HÀM NGHI", "HNI", "HN17", "HN17.HNI"] },
  { l07: "HN0018.VTP", aeCode: "Vu Tong Phan", bus: "AHN", keys: ["HN0018.VTP", "HN0018", "VU TONG PHAN", "VŨ TÔNG PHAN", "VTP", "HN18", "HN18.VTP"] },
  { l07: "HN0019.NTN", aeCode: "Nguyen Tuan", bus: "AHN", keys: ["HN0019.NTN", "HN0019", "NGUYEN TUAN", "NGUYỄN TUÂN", "NTN", "NT", "HN19", "HN19.NT"] },
  { l07: "HN0021.NGD", aeCode: "Ngoai Giao Doan", bus: "AHN", keys: ["HN0021.NGD", "HN0021", "NGOAI GIAO DOAN", "NGOẠI GIAO ĐOÀN", "NGD", "HN21", "HN21.NGD"] },
  { l07: "HN0022.NVO", aeCode: "Nguyen Van Loc", bus: "AHN", keys: ["HN0022.NVO", "HN0022", "NGUYEN VAN LOC", "NGUYỄN VĂN LỘC", "MO LAO", "MỖ LAO", "NVO", "HN22", "HN22.NVO"] },
  { l07: "HN0023.LDM", aeCode: "Linh Dam", bus: "AHN", keys: ["HN0023.LDM", "HN0023", "LINH DAM", "LINH ĐÀM", "LDM", "LD", "HN23", "HN23.LD"] },
  { l07: "HN0024.TCY", aeCode: "TIMES CITY", bus: "AHN", keys: ["HN0024.TCY", "HN0024", "TIMES CITY", "TCY", "TC", "HN24", "HN24.TC"] },
  { l07: "HN0025.LTT", aeCode: "Le Trong Tan", bus: "AHN", keys: ["HN0025.LTT", "HN0025", "LE TRONG TAN", "LÊ TRỌNG TẤN", "LTT", "HN25", "HN25.LTT"] },
  { l07: "HN0026.VHG", aeCode: "Viet Hung", bus: "AHN", keys: ["HN0026.VHG", "HN0026", "VIET HUNG", "VIỆT HƯNG", "VHG", "VH", "HN26", "HN26.VHG"] },
  { l07: "HN0027.OPK", aeCode: "Ocepark", bus: "AHN", keys: ["HN0027.OPK", "HN0027", "OCEAN PARK", "OCEPARK", "OPK", "OCP", "OP", "HN27", "HN27.OP"] },
  { l07: "HN0028.PVD", aeCode: "Pham Van Dong", bus: "AHN", keys: ["HN0028.PVD", "HN0028", "PHAM VAN DONG", "PHẠM VĂN ĐỒNG", "PVD", "HN28", "HN28.PVD"] },
  { l07: "HN0029.VPH", aeCode: "Vu Pham Ham", bus: "AHN", keys: ["HN0029.VPH", "HN0029", "VU PHAM HAM", "VŨ PHẠM HÀM", "VPH", "HN29", "HN29.VPH"] },
  { l07: "HN0030.AKH", aeCode: "An Khanh", bus: "AHN", keys: ["HN0030.AKH", "HN0030", "AN KHANH", "AN KHÁNH", "AKH", "AK", "HN30", "HN30.AKH"] },
  { l07: "HN0031.AHG", aeCode: "An Hung", bus: "AHN", keys: ["HN0031.AHG", "HN0031", "AN HUNG", "AN HƯNG", "AHG", "AH", "HN31", "HN31.AHG"] },
  { l07: "HN0032.LLQ", aeCode: "Xuan Dieu (đổi thành Lạc Long Quân)", bus: "AHN", keys: ["HN0032.LLQ", "HN0032", "LAC LONG QUAN", "LẠC LONG QUÂN", "XUAN DIEU", "XUÂN DIỆU", "LLQ", "HN32", "HN32.LLQ"] },
  { l07: "HN0033.DAH", aeCode: "HN33.DAH", bus: "AHN", keys: ["HN0033.DAH", "HN0033", "DONG ANH", "ĐÔNG ANH", "DAH", "DA", "HN33", "HN33.DAH"] },
  { l07: "HN0034.HTN", aeCode: "HN34.HTN", bus: "AHN", keys: ["HN0034.HTN", "HN0034", "HONG TIEN", "HỒNG TIẾN", "HTN", "HN34", "HN34.HTN"] },
  { l07: "HY0001.ECP", aeCode: "Ecopark", bus: "AHN", keys: ["HY0001.ECP", "HY0001", "ECOPARK", "ECP", "HY01", "HY01.ECP"] },
  { l07: "HP0001.LHP", aeCode: "Hai Phong 1", bus: "AHP", keys: ["HP0001.LHP", "HP0001", "HAI PHONG 1", "HẢI PHÒNG 1", "LHP", "HP1", "HP01", "HP1.LHP"] },
  { l07: "HP0002.HBT", aeCode: "Hai Phong 2", bus: "AHP", keys: ["HP0002.HBT", "HP0002", "HAI PHONG 2", "HẢI PHÒNG 2", "HBT", "HP2", "HP02", "HP2.HBT"] },
  { l07: "HP0003.VIN", aeCode: "Hai Phong 3", bus: "AHP", keys: ["HP0003.VIN", "HP0003", "HAI PHONG 3", "HẢI PHÒNG 3", "HP3", "HP03", "HP3.VIN"] },
  { l07: "QN0001.HLG", aeCode: "Quang Ninh", bus: "AHN", keys: ["QN0001.HLG", "QN0001", "QUANG NINH", "QUẢNG NINH", "HA LONG", "HẠ LONG", "HLG", "QN", "HL", "QN01", "QN1", "QN01.HL"] },
  { l07: "VIN001.CTG", aeCode: "Vinh", bus: "AHN", keys: ["VIN001.CTG", "VIN001", "VINH", "CTG", "VIN", "VIN01", "VIN1", "VIN01.CTG", "VIN01.CT"] },
  { l07: "VP0001.PCT", aeCode: "Vinh Phuc", bus: "AHN", keys: ["VP0001.PCT", "VP0001", "VINH PHUC", "VĨNH PHÚC", "PCT", "VP01", "VP1", "VP01.PCT"] },
  { l07: "TH0001.TPU", aeCode: "TH01.TPU", bus: "ATH", keys: ["TH0001.TPU", "TH0001", "THANH HOA", "THANH HÓA", "TPU", "TH01", "TH01.TPU", "MKT TH01.TPU"] },
  { l07: "TN0001.LNQ", aeCode: "TN01.LNQ", bus: "ATN", keys: ["TN0001.LNQ", "TN0001", "THAI NGUYEN", "THÁI NGUYÊN", "LNQ", "TN01", "TN01.LNQ", "MKT TN01.LNQ"] },
  { l07: "PT0001.HVG", aeCode: "PT01.HVG", bus: "APT", keys: ["PT0001.HVG", "PT0001", "PHU THO", "PHÚ THỌ", "HVG", "PT01", "PT01.HVG", "MKT PT01.HVG"] },
  { l07: "AA", aeCode: "Apollo Advance -South", bus: "AHN", keys: ["AA", "APOLLO ADVANCE -SOUTH", "APOLLO ADVANCE SOUTH"] },
  { l07: "AA_HP", aeCode: "Apollo Advance -South_HP", bus: "AHP", keys: ["AA_HP", "APOLLO ADVANCE -SOUTH_HP"] },
  { l07: "HN0200.ASP", aeCode: "ASP - HN", bus: "AHN", keys: ["HN0200.ASP", "HN0200", "ASP - HN", "ASP", "HN0.ASP"] },
  { l07: "MKT LOCAL NORTH", aeCode: "MKT LOCAL NORTH", bus: "AHN", keys: ["MKT LOCAL NORTH", "NTW", "NORTH.MKT INTERN", "MKT NORTH", "NORTH MKT", "NORTH"] },
  { l07: "ZHN0000.GY", aeCode: "Cambridge", bus: "AHN", keys: ["ZHN0000.GY", "CAMBRIDGE", "CONTEST"] },
  { l07: "MKT HP", aeCode: "MKT HP", bus: "AHP", keys: ["MKT HP"] },
];

export const CENTER_MAPPING: Record<string, { l07: string; aeCode: string; bus: string }> = {};

function normalizeCenterKey(str: string): string {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[Đđ]/g, "D")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export const NORTH_MKT_LOCAL_L07_CODES = [
  "MKT LOCAL NORTH",
  "MKT LOCAL NORTH_HP",
  "MKT LOCAL NORTH_TH",
  "MKT LOCAL NORTH_TN",
  "MKT LOCAL NORTH_PT",
] as const;

/**
 * Resolve the MKT Center values used by Sheet 1 / Gross Pay. This mapping is
 * deliberately opt-in and is not called by Pivot Master processing.
 */
export function resolveNorthMktLocalL07(rawCenter: string): string {
  const normalized = normalizeCenterKey(rawCenter);
  if (!normalized.includes("MKT")) return "";

  if (
    normalized.includes("MKTLOCALNORTHHP") ||
    normalized.includes("MKTHAIPHONG") ||
    normalized.includes("MKTHP") ||
    normalized.includes("HAIPHONG")
  ) {
    return "MKT LOCAL NORTH_HP";
  }

  // Check Thai Nguyen before the generic MKT TH prefix.
  if (
    normalized.includes("MKTLOCALNORTHTN") ||
    normalized.includes("MKTTHAINGUYEN") ||
    normalized.includes("MKTTN") ||
    normalized.includes("THAINGUYEN")
  ) {
    return "MKT LOCAL NORTH_TN";
  }

  if (
    normalized.includes("MKTLOCALNORTHTH") ||
    normalized.includes("MKTTHANHHOA") ||
    normalized.includes("MKTTH") ||
    normalized.includes("THANHHOA")
  ) {
    return "MKT LOCAL NORTH_TH";
  }

  if (
    normalized.includes("MKTLOCALNORTHPT") ||
    normalized.includes("MKTPHUTHO") ||
    normalized.includes("MKTPT") ||
    normalized.includes("PHUTHO")
  ) {
    return "MKT LOCAL NORTH_PT";
  }

  // MKT HN, BN, NA, HY, VIN, VINH, VP and other North MKT aliases.
  return "MKT LOCAL NORTH";
}

export function isNorthMktLocalL07(value: string): boolean {
  const upper = String(value || "").trim().toUpperCase();
  return (NORTH_MKT_LOCAL_L07_CODES as readonly string[]).includes(upper);
}

/**
 * Center resolver used only by MKT Local North Roster/Q_Roster. It mirrors the
 * original Pivot Master rules: normal center names resolve to their real L07,
 * while MKT aliases and the regional Hai Phong aggregate keep the dedicated
 * MKT Local L07.
 */
export function resolveMktRosterCenter(rawCenter: string): {
  l07: string;
  business: string;
} {
  const cleaned = String(rawCenter || "").trim();
  const normalized = normalizeCenterKey(cleaned);

  let l07 = "";
  if (normalized === "HAIPHONG") {
    l07 = "MKT LOCAL NORTH_HP";
  } else if (normalized.includes("MKT") || normalized.includes("MARKETING")) {
    l07 = resolveNorthMktLocalL07(cleaned) || "MKT LOCAL NORTH";
  } else {
    l07 = mapL07(cleaned) || cleaned || "UNKNOWN";
  }

  return {
    l07,
    business: getBusinessFromL07(l07),
  };
}

const LOOKUP_MAP = new Map<string, CenterInfo>();
const FILE_NAME_L07_CACHE = new Map<string, string>();
let fileNameCenterCandidates: Array<{ info: CenterInfo; key: string }> | null =
  null;

CENTER_DATA.forEach((info) => {
  const normL07 = normalizeCenterKey(info.l07);
  if (normL07) LOOKUP_MAP.set(normL07, info);

  const normAE = normalizeCenterKey(info.aeCode);
  if (normAE) LOOKUP_MAP.set(normAE, info);

  info.keys.forEach((k) => {
    const normK = normalizeCenterKey(k);
    if (normK) LOOKUP_MAP.set(normK, info);
  });

  CENTER_MAPPING[info.l07] = { l07: info.l07, aeCode: info.aeCode, bus: info.bus };
});

export function mapL07(l07OrAeCode: string): string {
  if (!l07OrAeCode) return "";
  const cleaned = String(l07OrAeCode).trim();
  const norm = normalizeCenterKey(cleaned);
  if (!norm) return cleaned;

  const found = LOOKUP_MAP.get(norm);
  if (found) return found.l07;

  // Substring/pattern matching fallbacks
  if (norm.includes("THAIHA") || norm.includes("LANGHA")) return "HN0002.THA";
  if (norm.includes("PHOHUE")) return "HN0001.PHY";
  if (norm.includes("HOANGQUOCVIET")) return "HN0003.HQV";
  if (norm.includes("LIEUGIAI")) return "HN0004.LGI";
  if (norm.includes("NGUYENVANLINH")) return "HN0005.NVL";
  if (norm.includes("VANQUAN")) return "HN0007.VQN";
  if (norm.includes("MYDINH") || norm.includes("THEGARDEN")) return "HN0010.MDH";
  if (norm.includes("NGUYENHUUTHO") || norm.includes("HOANGMAI")) return "HN0012.NHT";
  if (norm.includes("TANMAI")) return "HN0014.TMI";
  if (norm.includes("VANPHU")) return "HN0015.VPU";
  if (norm.includes("PHANDINHPHUNG")) return "HN0016.PDP";
  if (norm.includes("HAMNGHI")) return "HN0017.HNI";
  if (norm.includes("VUTONGPHAN")) return "HN0018.VTP";
  if (norm.includes("NGUYENTUAN")) return "HN0019.NTN";
  if (norm.includes("NGOAIGIAODOAN")) return "HN0021.NGD";
  if (norm.includes("NGUYENVANLOC") || norm.includes("MOLAO")) return "HN0022.NVO";
  if (norm.includes("LINHDAM")) return "HN0023.LDM";
  if (norm.includes("TIMESCITY")) return "HN0024.TCY";
  if (norm.includes("LETRONGTAN")) return "HN0025.LTT";
  if (norm.includes("VIETHUNG")) return "HN0026.VHG";
  if (norm.includes("OCEANPARK") || norm.includes("OCEPARK")) return "HN0027.OPK";
  if (norm.includes("PHAMVANDONG")) return "HN0028.PVD";
  if (norm.includes("VUPHAMHAM")) return "HN0029.VPH";
  if (norm.includes("ANKHANH")) return "HN0030.AKH";
  if (norm.includes("ANHUNG")) return "HN0031.AHG";
  if (norm.includes("LACLONGQUAN") || norm.includes("XUANDIEU")) return "HN0032.LLQ";
  if (norm.includes("DONGANH")) return "HN0033.DAH";
  if (norm.includes("HONGTIEN")) return "HN0034.HTN";
  if (norm.includes("NGOSILIEN") || norm.includes("LYTHAITO")) return "BN0001.LTT";
  if (norm.includes("TUSON")) return "BN0002.TSN";
  if (norm.includes("ECOPARK")) return "HY0001.ECP";
  if (norm.includes("QUANGNINH") || norm.includes("HALONG")) return "QN0001.HLG";
  if (norm.includes("THANHHOA")) return "TH0001.TPU";
  if (norm.includes("THAINGUYEN")) return "TN0001.LNQ";
  if (norm.includes("PHUTHO")) return "PT0001.HVG";
  if (norm.includes("VINHPHUC")) return "VP0001.PCT";
  if (norm === "VINH" || norm.includes("VINHCTG")) return "VIN001.CTG";
  if (norm.includes("MKTLOCALNORTH") || norm.includes("NORTHMKT") || norm.includes("MKTLOCAL")) return "MKT LOCAL NORTH";

  return cleaned;
}

export function getCenterInfoByAECode(aeCode: string): { l07: string; aeCode: string; bus: string } | null {
  if (!aeCode) return null;
  const cleaned = String(aeCode).trim();
  const norm = normalizeCenterKey(cleaned);
  let found = LOOKUP_MAP.get(norm);

  if (!found) {
    const mapped = mapL07(cleaned);
    if (mapped) {
      found = LOOKUP_MAP.get(normalizeCenterKey(mapped));
    }
  }

  if (found) {
    return { l07: found.l07, aeCode: found.aeCode, bus: found.bus };
  }

  return { l07: cleaned, aeCode: cleaned, bus: getBusinessFromL07(cleaned) };
}

export function getCenterInfoByL07(l07: string): { l07: string; aeCode: string; bus: string } | null {
  if (!l07) return null;
  const cleaned = String(l07).trim();
  const norm = normalizeCenterKey(cleaned);
  const found = LOOKUP_MAP.get(norm);

  if (found) {
    return { l07: found.l07, aeCode: found.aeCode, bus: found.bus };
  }

  return null;
}

export function resolveL07BuFromAeCode(code: string): { l07: string; bu: string } | null {
  if (!code) return null;
  const info = getCenterInfoByAECode(code);
  if (info) {
    return { l07: info.l07, bu: info.bus };
  }
  return { l07: code, bu: "AHN" };
}

export function getBusinessFromL07(l07: string): string {
  if (!l07) return "AHN";
  const rawUpper = String(l07).trim().toUpperCase();
  if (rawUpper === "MKT LOCAL NORTH_HP") return "AHP";
  if (rawUpper === "MKT LOCAL NORTH_TH") return "ATH";
  if (rawUpper === "MKT LOCAL NORTH_TN") return "ATN";
  if (rawUpper === "MKT LOCAL NORTH_PT") return "APT";

  const mapped = mapL07(l07);
  const info = getCenterInfoByL07(mapped);
  if (info?.bus) return info.bus;

  const upper = mapped.toUpperCase();
  if (upper.startsWith("HP") || upper.includes("HAI PHONG") || upper.includes("AHP")) return "AHP";
  if (upper.startsWith("TH") || upper.includes("THANH HOA") || upper.includes("ATH")) return "ATH";
  if (upper.startsWith("TN") || upper.includes("THAI NGUYEN") || upper.includes("ATN")) return "ATN";
  if (upper.startsWith("PT") || upper.includes("PHU THO") || upper.includes("APT")) return "APT";

  return "AHN";
}

export function resolveMktAndCenterL07(
  rawCenter: string,
  rawChargeToCenter = "",
  sheetSource = "",
  currentL07 = ""
): { isMktLocal: boolean; l07: string; business: string } {
  const combined = `${rawCenter} ${rawChargeToCenter} ${sheetSource} ${currentL07}`.toUpperCase();
  const isMktLocal = combined.includes("MKT") || combined.includes("MARKETING");

  let targetString = rawCenter || rawChargeToCenter || currentL07;
  if (isMktLocal && (!targetString || targetString.toUpperCase().includes("MKT"))) {
    targetString = "MKT LOCAL NORTH";
  }

  const l07 = mapL07(targetString) || "MKT LOCAL NORTH";
  const info = getCenterInfoByL07(l07) || getCenterInfoByAECode(targetString);
  const business = info?.bus || getBusinessFromL07(l07) || "AHN";

  return {
    isMktLocal,
    l07,
    business,
  };
}

export function getL07FromFileName(fileName: string): string {
  if (!fileName) return "";
  const normalizedName = String(fileName)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[Đđ]/g, "D")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const compactName = normalizedName.replace(/\s+/g, "");
  const cached = FILE_NAME_L07_CACHE.get(normalizedName);
  if (cached !== undefined) return cached;

  if (normalizedName.includes("MKT") || normalizedName.includes("MARKETING")) {
    const mktL07 = resolveNorthMktLocalL07(fileName) || "MKT LOCAL NORTH";
    FILE_NAME_L07_CACHE.set(normalizedName, mktL07);
    return mktL07;
  }

  if (!fileNameCenterCandidates) {
    fileNameCenterCandidates = CENTER_DATA.filter(
      (info) => !info.l07.toUpperCase().startsWith("MKT"),
    )
      .flatMap((info) =>
        [info.l07, info.aeCode, ...info.keys].map((key) => ({
          info,
          key: normalizeCenterKey(key),
        })),
      )
      .sort((left, right) => right.key.length - left.key.length);
  }

  const nameTokens = new Set(normalizedName.split(" ").filter(Boolean));
  const match = fileNameCenterCandidates.find(({ key }) => {
    if (!key) return false;
    if (key.length >= 5 && compactName.includes(key)) return true;
    return key.length >= 3 && nameTokens.has(key);
  });

  const resolvedL07 = match?.info.l07 || "";
  FILE_NAME_L07_CACHE.set(normalizedName, resolvedL07);
  return resolvedL07;
}

export function getL07FromChargeToCenterMkt(chargeToCenter: string): string {
  if (!chargeToCenter) return "";
  const cleaned = String(chargeToCenter).trim();
  const upper = cleaned.toUpperCase();
  if (upper.includes("MKT LOCAL NORTH_HP") || upper.includes("MKT HP")) return "MKT LOCAL NORTH_HP";
  if (upper.includes("MKT LOCAL NORTH_TN") || upper.includes("MKT TN")) return "MKT LOCAL NORTH_TN";
  if (upper.includes("MKT LOCAL NORTH_PT") || upper.includes("MKT PT")) return "MKT LOCAL NORTH_PT";
  if (upper.includes("MKT LOCAL NORTH_TH") || upper.includes("MKT TH")) return "MKT LOCAL NORTH_TH";
  if (upper.includes("MKT SOUTH") || upper.includes("MKT LOCAL SOUTH")) return "MKT LOCAL SOUTH";
  if (upper.includes("MKT")) return "MKT LOCAL NORTH";
  return mapL07(cleaned);
}

export function getAeCodeFromL07(l07: string): string {
  if (!l07) return "";
  const info = getCenterInfoByL07(l07);
  if (info?.aeCode) return info.aeCode;
  return l07;
}

export function extractCenterNameFromFileName(fileName: string): string {
  if (!fileName) return "";
  const l07 = getL07FromFileName(fileName);
  const info = getCenterInfoByL07(l07);
  return info ? info.aeCode : l07;
}
