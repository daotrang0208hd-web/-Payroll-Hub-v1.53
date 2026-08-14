/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Settings2,
  Trash2,
  Target,
  ChevronDown,
  PaintBucket,
  Type,
  SquareDashed,
  Maximize2,
  PanelTopOpen,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import localforage from "localforage";
import { useAppData } from "../lib/contexts/AppDataContext";
import { ConfirmDialog } from "./shared/ConfirmDialog";
import {
  type UiSettings,
  defaultSettings,
  UI_SETTINGS_KEY,
  applyUiSettings,
  loadUiSettings,
  TASTE_PRESETS,
  isSafeCustomSelector,
  normalizeCssLength,
} from "../lib/ui-settings";

// Helper utilities for parsing CSS shorthand paddings/margins
const parseShorthand = (val: string) => {
  if (!val) return { top: "", right: "", bottom: "", left: "" };
  const parts = val.trim().split(/\s+/);
  if (parts.length === 1) {
    const v = parts[0];
    return { top: v, right: v, bottom: v, left: v };
  } else if (parts.length === 2) {
    const t = parts[0];
    const r = parts[1];
    return { top: t, right: r, bottom: t, left: r };
  } else if (parts.length === 3) {
    const t = parts[0];
    const r = parts[1];
    const b = parts[2];
    return { top: t, right: r, bottom: b, left: r };
  } else if (parts.length >= 4) {
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
  }
  return { top: "", right: "", bottom: "", left: "" };
};

const cleanUnit = (val: string) => {
  if (!val) return "";
  if (val === "0px") return "0";
  const match = val.match(/^([\d.]+)(px)$/);
  if (match) {
    return match[1];
  }
  return val;
};

interface SelectedDivInfo {
  tag: string;
  selector: string;
  background: string;
  color: string;
  border: string;
  radius: string;
  padding: string;
  margin: string;
  fontSize: string;
  width: string;
  height: string;
}

interface SelectedDivRect {
  top: number;
  left: number;
  width: number;
}

export function UiSettingsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<UiSettings>(defaultSettings);
  const persistedSettingsRef = useRef<UiSettings>(defaultSettings);
  const wasOpenRef = useRef(false);
  const { updateAppData } = useAppData();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState<"general" | "div_selector">("general");

  // States for new custom selector style rule
  const [newSelector, setNewSelector] = useState("");
  const [newRadius, setNewRadius] = useState("");
  const [newBg, setNewBg] = useState("");
  const [newColor, setNewColor] = useState("");
  const [newBorder, setNewBorder] = useState("");
  const [newWidth, setNewWidth] = useState("");
  const [newHeight, setNewHeight] = useState("");
  const [newFontSize, setNewFontSize] = useState("");

  // Split padding states
  const [padTop, setPadTop] = useState("");
  const [padRight, setPadRight] = useState("");
  const [padBottom, setPadBottom] = useState("");
  const [padLeft, setPadLeft] = useState("");

  // Split margin states
  const [marTop, setMarTop] = useState("");
  const [marRight, setMarRight] = useState("");
  const [marBottom, setMarBottom] = useState("");
  const [marLeft, setMarLeft] = useState("");
  const selectedElementRef = useRef<HTMLElement | null>(null);
  const [selectedDivInfo, setSelectedDivInfo] = useState<SelectedDivInfo | null>(null);
  const [selectedDivRect, setSelectedDivRect] = useState<SelectedDivRect | null>(null);
  const [isCompactInspector, setIsCompactInspector] = useState(false);

  // Dynamic selector values helper for padding/margin
  const getCombinedPadding = useCallback(() => {
    const t = padTop.trim();
    const r = padRight.trim();
    const b = padBottom.trim();
    const l = padLeft.trim();
    
    if (!t && !r && !b && !l) return "";
    const toPx = (v: string) => {
      if (!v) return "0px";
      if (/^\d+(\.\d+)?$/.test(v)) return `${v}px`;
      return v;
    };
    return `${toPx(t)} ${toPx(r)} ${toPx(b)} ${toPx(l)}`;
  }, [padTop, padRight, padBottom, padLeft]);

  const getCombinedMargin = useCallback(() => {
    const t = marTop.trim();
    const r = marRight.trim();
    const b = marBottom.trim();
    const l = marLeft.trim();
    
    if (!t && !r && !b && !l) return "";
    const toPx = (v: string) => {
      if (!v) return "0px";
      if (/^\d+(\.\d+)?$/.test(v)) return `${v}px`;
      return v;
    };
    return `${toPx(t)} ${toPx(r)} ${toPx(b)} ${toPx(l)}`;
  }, [marTop, marRight, marBottom, marLeft]);

  const updatePaddingStates = useCallback((padVal: string) => {
    const parsed = parseShorthand(padVal);
    setPadTop(cleanUnit(parsed.top));
    setPadRight(cleanUnit(parsed.right));
    setPadBottom(cleanUnit(parsed.bottom));
    setPadLeft(cleanUnit(parsed.left));
  }, []);

  const updateMarginStates = useCallback((marVal: string) => {
    const parsed = parseShorthand(marVal);
    setMarTop(cleanUnit(parsed.top));
    setMarRight(cleanUnit(parsed.right));
    setMarBottom(cleanUnit(parsed.bottom));
    setMarLeft(cleanUnit(parsed.left));
  }, []);

  const resetCustomRuleFields = useCallback(() => {
    setNewRadius("");
    setNewBg("");
    setNewColor("");
    setNewBorder("");
    updatePaddingStates("");
    updateMarginStates("");
    setNewWidth("");
    setNewHeight("");
    setNewFontSize("");
  }, [updatePaddingStates, updateMarginStates]);

  const captureSelectedElement = useCallback((element: HTMLElement, selector: string) => {
    const computed = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    selectedElementRef.current = element;
    setSelectedDivInfo({
      tag: element.tagName.toLowerCase(),
      selector,
      background: computed.backgroundColor,
      color: computed.color,
      border: computed.border,
      radius: computed.borderRadius,
      padding: computed.padding,
      margin: computed.margin,
      fontSize: computed.fontSize,
      width: `${Math.round(rect.width)}px`,
      height: `${Math.round(rect.height)}px`,
    });
    setSelectedDivRect({
      top: rect.top,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  const handleSelectorChange = useCallback((selector: string, targetElement?: HTMLElement) => {
    setNewSelector(selector);
    const cleanSelector = selector.trim();
    if (!cleanSelector) {
      resetCustomRuleFields();
      selectedElementRef.current = null;
      setSelectedDivInfo(null);
      setSelectedDivRect(null);
      return;
    }

    let resolvedElement = targetElement;
    if (!resolvedElement && isSafeCustomSelector(cleanSelector)) {
      try {
        resolvedElement = document.querySelector<HTMLElement>(cleanSelector) || undefined;
      } catch {
        resolvedElement = undefined;
      }
    }
    if (resolvedElement) {
      captureSelectedElement(resolvedElement, cleanSelector);
    }

    const existingRule = settings.customRules?.find(
      (r) => r.selector === cleanSelector
    );
    if (existingRule) {
      setNewRadius(existingRule.radius || "");
      setNewBg(existingRule.bg || "");
      setNewColor(existingRule.color || "");
      setNewBorder(existingRule.border || "");
      updatePaddingStates(existingRule.padding || "");
      updateMarginStates(existingRule.margin || "");
      setNewWidth(existingRule.width || "");
      setNewHeight(existingRule.height || "");
      setNewFontSize(existingRule.fontSize || "");
    } else {
      // A new selection starts with no overrides. Copying computed width,
      // height, spacing and typography into a rule would freeze the current
      // layout even when the user only intended to change one property.
      resetCustomRuleFields();
    }
  }, [settings.customRules, resetCustomRuleFields, updatePaddingStates, updateMarginStates, captureSelectedElement]);

  // State and effect for element inspector mode
  const [isInspecting, setIsInspecting] = useState(false);

  useEffect(() => {
    if (!isInspecting) return;

    // Create a style element for highlighting the hovered element
    const styleEl = document.createElement("style");
    styleEl.id = "inspector-hover-style";
    styleEl.innerHTML = `
      .inspector-hovered {
        outline: 3px solid #6b2636 !important;
        outline-offset: -3px !important;
        cursor: crosshair !important;
        transition: outline 0.08s ease-in-out !important;
      }
    `;
    document.head.appendChild(styleEl);

    let activeEl: HTMLElement | null = null;

    const handleMouseOver = (e: MouseEvent) => {
      e.stopPropagation();
      const target = e.target as HTMLElement;
      
      // Do not highlight elements inside the settings panel itself
      if (target.closest('[data-ui-settings-shell="true"]')) return;

      if (activeEl && activeEl !== target) {
        activeEl.classList.remove("inspector-hovered");
      }
      activeEl = target;
      activeEl.classList.add("inspector-hovered");
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      target.classList.remove("inspector-hovered");
    };

    const getReadableSelector = (el: HTMLElement): string => {
      const escapeIdentifier = (value: string) =>
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? CSS.escape(value)
          : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");

      if (el.id) {
        return `#${escapeIdentifier(el.id)}`;
      }

      // List of highly unique/semantic classes that we can return directly if matched
      const knownUniqueClasses = [
        "navbar-header",
        "side-panel",
        "content-area",
        "table-container",
        "data-table-wrapper",
        "stat-card",
        "stat-group",
        "filter-toolbar",
        "table-card",
        "modal-content",
        "pivot-table-container",
        "master-ae-table-wrapper",
        "btn-primary",
        "btn-secondary",
        "dashboard-card",
        "section-label",
        "hero-badge"
      ];

      for (const cls of knownUniqueClasses) {
        if (
          el.classList.contains(cls) &&
          document.querySelectorAll(`.${escapeIdentifier(cls)}`).length === 1
        ) {
          return `.${cls}`;
        }
      }

      const path: string[] = [];
      let current: HTMLElement | null = el;

      while (current && current !== document.body) {
        if (current.id) {
          path.unshift(`#${escapeIdentifier(current.id)}`);
          break;
        }

        let foundUniqueParent = false;
        for (const cls of knownUniqueClasses) {
          if (
            current.classList.contains(cls) &&
            document.querySelectorAll(`.${escapeIdentifier(cls)}`).length === 1
          ) {
            path.unshift(`.${cls}`);
            foundUniqueParent = true;
            break;
          }
        }
        if (foundUniqueParent) {
          break;
        }

        const tag = current.tagName.toLowerCase();
        if (
          (tag === "main" ||
            tag === "header" ||
            tag === "nav" ||
            tag === "table" ||
            tag === "thead" ||
            tag === "tbody") &&
          document.querySelectorAll(tag).length === 1
        ) {
          path.unshift(tag);
          break;
        }

        // Filter out Tailwind utility classes, hover state classes, and custom inspector classes
        const classes = Array.from(current.classList).filter((c) => {
          return c !== "inspector-hovered" &&
                 !c.includes(":") &&
                 !c.startsWith("hover:") &&
                 !c.startsWith("focus:") &&
                 !c.startsWith("p-") &&
                 !c.startsWith("px-") &&
                 !c.startsWith("py-") &&
                 !c.startsWith("m-") &&
                 !c.startsWith("mx-") &&
                 !c.startsWith("my-") &&
                 !c.startsWith("bg-") &&
                 !c.startsWith("text-") &&
                 !c.startsWith("border-") &&
                 !c.startsWith("rounded-") &&
                 !c.startsWith("w-") &&
                 !c.startsWith("h-") &&
                 !c.startsWith("flex") &&
                 !c.startsWith("grid") &&
                 !c.startsWith("gap-") &&
                 !c.startsWith("items-") &&
                 !c.startsWith("justify-") &&
                 !c.startsWith("font-") &&
                 !c.startsWith("shadow-") &&
                 !c.startsWith("transition-") &&
                 !c.startsWith("animate-") &&
                 !c.startsWith("duration-");
        });

        // Filter to standard alphanumeric class names to avoid any special characters
        const safeClasses = classes.filter(c => /^[a-zA-Z0-9_-]+$/.test(c));

        let segment = tag;
        if (safeClasses.length > 0) {
          segment += `.${escapeIdentifier(safeClasses[0])}`;
        }

        const parent = current.parentElement;
        if (parent) {
          const sameTagSiblings = Array.from(parent.children).filter(
            (child) => child.tagName === current!.tagName,
          );
          if (sameTagSiblings.length > 1) {
            segment += `:nth-of-type(${sameTagSiblings.indexOf(current) + 1})`;
          }
        }

        path.unshift(segment);
        current = current.parentElement;
      }

      const finalSelector = path.join(" > ");
      return finalSelector || el.tagName.toLowerCase();
    };

    const handleClick = (e: MouseEvent) => {
      // Prevent standard browser action & bubbling
      e.preventDefault();
      e.stopPropagation();

      const target = e.target as HTMLElement;
      if (target.closest('[data-ui-settings-shell="true"]')) return;

      const selector = getReadableSelector(target);
      handleSelectorChange(selector, target);
      setIsInspecting(false);
      setIsCompactInspector(true);
      toast.dismiss();
      toast.success(`Đã chọn phần tử: ${selector}`);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsInspecting(false);
        toast.dismiss();
        toast.info("Đã huỷ chọn phần tử.");
      }
    };

    document.addEventListener("mouseover", handleMouseOver, true);
    document.addEventListener("mouseout", handleMouseOut, true);
    document.addEventListener("click", handleClick, true);
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      if (activeEl) {
        activeEl.classList.remove("inspector-hovered");
      }
      document.removeEventListener("mouseover", handleMouseOver, true);
      document.removeEventListener("mouseout", handleMouseOut, true);
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      styleEl.remove();
    };
  }, [isInspecting, handleSelectorChange]);

  useEffect(() => {
    if (!isCompactInspector || !selectedElementRef.current) return;

    const updateSelectedPosition = () => {
      const element = selectedElementRef.current;
      if (!element || !document.contains(element)) return;
      const rect = element.getBoundingClientRect();
      setSelectedDivRect({ top: rect.top, left: rect.left, width: rect.width });
    };

    updateSelectedPosition();
    window.addEventListener("scroll", updateSelectedPosition, true);
    window.addEventListener("resize", updateSelectedPosition);
    return () => {
      window.removeEventListener("scroll", updateSelectedPosition, true);
      window.removeEventListener("resize", updateSelectedPosition);
    };
  }, [isCompactInspector, newBg, newColor, newBorder, newRadius, newWidth, newHeight, newFontSize, getCombinedPadding, getCombinedMargin]);

  const addCustomRule = (keepSelection = false): UiSettings | null => {
    if (!newSelector.trim()) {
      toast.error("Vui lòng nhập hoặc chọn một CSS selector!");
      return null;
    }
    const cleanSelector = newSelector.trim();
    if (!isSafeCustomSelector(cleanSelector)) {
      toast.error("CSS selector không hợp lệ. Vui lòng chọn lại phần tử.");
      return null;
    }

    const normalizedRadius = normalizeCssLength(newRadius);
    const normalizedWidth = normalizeCssLength(newWidth);
    const normalizedHeight = normalizeCssLength(newHeight);
    const normalizedFontSize = normalizeCssLength(newFontSize);
    const padding = getCombinedPadding() || undefined;
    const margin = getCombinedMargin() || undefined;
    const hasOverride = Boolean(
      normalizedRadius ||
      newBg.trim() ||
      newColor.trim() ||
      newBorder.trim() ||
      padding ||
      margin ||
      normalizedWidth ||
      normalizedHeight ||
      normalizedFontSize,
    );
    if (!hasOverride) {
      toast.error("Hãy nhập ít nhất một thuộc tính cần thay đổi.");
      return null;
    }

    const supports = (property: string, value?: string) =>
      !value || typeof CSS === "undefined" || CSS.supports(property, value);
    if (
      !supports("border-radius", normalizedRadius) ||
      !supports("background-color", newBg.trim()) ||
      !supports("color", newColor.trim()) ||
      !supports("border", newBorder.trim()) ||
      !supports("padding", padding) ||
      !supports("margin", margin) ||
      !supports("width", normalizedWidth) ||
      !supports("height", normalizedHeight) ||
      !supports("font-size", normalizedFontSize)
    ) {
      toast.error("Có giá trị CSS không hợp lệ. Vui lòng kiểm tra lại đơn vị hoặc màu.");
      return null;
    }

    const existingRules = settings.customRules || [];
    const index = existingRules.findIndex((r) => r.selector === cleanSelector);

    const newRule = {
      id: index >= 0 ? existingRules[index].id : "rule-" + Date.now(),
      selector: cleanSelector,
      radius: normalizedRadius,
      bg: newBg.trim() || undefined,
      color: newColor.trim() || undefined,
      border: newBorder.trim() || undefined,
      padding,
      margin,
      width: normalizedWidth,
      height: normalizedHeight,
      fontSize: normalizedFontSize,
    };

    let updatedRules;
    if (index >= 0) {
      updatedRules = [...existingRules];
      updatedRules[index] = newRule;
    } else {
      updatedRules = [...existingRules, newRule];
    }

    const updatedSettings = { ...settings, customRules: updatedRules };
    setSettings(updatedSettings);
    
    if (!keepSelection) {
      setNewSelector("");
      resetCustomRuleFields();
      selectedElementRef.current = null;
      setSelectedDivInfo(null);
      setSelectedDivRect(null);
    }
    toast.success(index >= 0 ? "Đã cập nhật style cho selector!" : "Đã thêm style custom cho selector!");
    return updatedSettings;
  };

  const removeCustomRule = (id: string) => {
    const updatedRules = (settings.customRules || []).filter((r) => r.id !== id);
    setSettings({ ...settings, customRules: updatedRules });
    toast.success("Đã xoá style custom.");
  };

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const loaded = await loadUiSettings();
        persistedSettingsRef.current = loaded;
        setSettings(loaded);
      } catch (e) {
        console.error("Failed to load UI settings", e);
      }
    };

    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      return;
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    setIsInspecting(false);
    setIsCompactInspector(false);
    setNewSelector("");
    selectedElementRef.current = null;
    setSelectedDivInfo(null);
    setSelectedDivRect(null);
    resetCustomRuleFields();
    applyUiSettings(persistedSettingsRef.current);
  }, [isOpen, resetCustomRuleFields]);

  useEffect(() => {
    if (isOpen) {
      const previewRule = {
        selector: newSelector.trim(),
        radius: newRadius,
        bg: newBg,
        color: newColor,
        border: newBorder,
        padding: getCombinedPadding(),
        margin: getCombinedMargin(),
        width: newWidth,
        height: newHeight,
        fontSize: newFontSize,
      };
      applyUiSettings(settings, previewRule);
    }
  }, [settings, isOpen, newSelector, newRadius, newBg, newColor, newBorder, getCombinedPadding, getCombinedMargin, newWidth, newHeight, newFontSize]);

  const saveSettings = async () => {
    try {
      await localforage.setItem(UI_SETTINGS_KEY, settings);
      persistedSettingsRef.current = settings;
      const { bgImage, ...smallSettings } = settings;
      localStorage.setItem(
        UI_SETTINGS_KEY + "_small",
        JSON.stringify(smallSettings),
      );
      toast.dismiss();
      toast.success("Đã lưu cài đặt!");
      window.dispatchEvent(new Event("ui-settings-changed"));
    } catch (e) {
      console.error("Failed to save UI settings", e);
      toast.dismiss();
      toast.error("Không thể lưu cài đặt.");
      return;
    }

    onClose();
  };

  const saveCompactSettings = async () => {
    const updatedSettings = addCustomRule(true);
    if (!updatedSettings) return;

    try {
      await localforage.setItem(UI_SETTINGS_KEY, updatedSettings);
      persistedSettingsRef.current = updatedSettings;
      const { bgImage, ...smallSettings } = updatedSettings;
      localStorage.setItem(UI_SETTINGS_KEY + "_small", JSON.stringify(smallSettings));
      window.dispatchEvent(new Event("ui-settings-changed"));
      toast.success("Đã lưu style của DIV!");
      onClose();
    } catch (error) {
      console.error("Failed to save selected DIV style", error);
      toast.error("Không thể lưu style của DIV.");
    }
  };

  const resetSettings = async () => {
    toast.info("Đang reset cài đặt...");
    setSettings(defaultSettings);
    persistedSettingsRef.current = defaultSettings;
    await localforage.setItem(UI_SETTINGS_KEY, defaultSettings);
    localStorage.setItem(
      UI_SETTINGS_KEY + "_small",
      JSON.stringify(defaultSettings),
    );
    toast.success("Đã reset cài đặt!");
    window.dispatchEvent(new Event("ui-settings-changed"));
    applyUiSettings(defaultSettings);
    onClose();
  };

  const handleClearAll = () => {
    updateAppData((prev: any) => ({
      ...prev,
      Final_AE: { ...prev.Final_AE, data: [] },
      Bank_North_AE: { ...prev.Bank_North_AE, data: [] },
      Sheet1_AE: { ...prev.Sheet1_AE, data: [] },
      // KHÔNG XOÁ Hold_AE và SoSanh_AE
      AuditReport: { ...prev.AuditReport, data: [] },
      Timesheet_InputList: prev.Timesheet_InputList?.map((row: any) => ({
        ...row,
        url: "",
        fileObj: undefined,
        fileName: "",
        sheetName: undefined,
        count: undefined,
        date: undefined,
        columnMapping: undefined,
        status: "pending",
        hasError: false,
        errorRaw: "",
        errorMessage: "",
      })),
      BankExport: { ...prev.BankExport, data: [] },
      CustomReport: { ...prev.CustomReport, data: [] },
      Q_Staff: [],
      Q_Salary_Scale: [],
      Timesheet_Roster: [],
      Master_Roster: [],
      Q_Cache: [],
      Timesheets: [],
    }));
    setShowClearConfirm(false);
    toast.success("Đã xóa toàn bộ dữ liệu ứng dụng.");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {isInspecting && (
        <div data-ui-settings-shell="true" className="fixed top-4 left-1/2 -translate-x-1/2 bg-[#6b2636] text-white px-4 py-2.5 rounded-lg shadow-2xl z-[100001] flex items-center gap-3 border-2 border-white font-sans text-xs font-bold pointer-events-auto select-none animate-in fade-in slide-in-from-top-4 duration-300">
          <Target className="w-4 h-4 animate-pulse text-rose-300" />
          <span>Di chuột và click vào phần tử trên màn hình để chọn. Nhấn ESC để huỷ.</span>
          <button
            type="button"
            onClick={() => setIsInspecting(false)}
            className="bg-white/20 hover:bg-white/30 text-white px-2.5 py-1 rounded cursor-pointer transition-all border border-white/30 text-[10px] uppercase font-bold"
          >
            Huỷ
          </button>
        </div>
      )}

      {isCompactInspector && selectedDivInfo && selectedDivRect && (
        <>
          <div
            data-ui-settings-shell="true"
            className="pointer-events-none fixed z-[100000] overflow-hidden border border-slate-600 bg-slate-950/95 text-white shadow-2xl backdrop-blur-md"
            style={{
              top: Math.max(8, selectedDivRect.top - 54),
              left: Math.max(8, selectedDivRect.left),
              width: Math.max(260, Math.min(selectedDivRect.width, 620, window.innerWidth - 16)),
            }}
          >
            <div className="flex h-6 items-center gap-2 border-b border-white/10 bg-white/10 px-2 font-mono text-[10px]">
              <span className="bg-white px-1.5 py-0.5 font-black uppercase text-slate-950">
                {selectedDivInfo.tag}
              </span>
              <span className="min-w-0 flex-1 truncate text-slate-200">{selectedDivInfo.selector}</span>
            </div>
            <div className="flex h-7 items-center gap-x-3 overflow-hidden px-2 font-mono text-[9px] text-slate-300">
              <span>BG <b className="text-white">{newBg || selectedDivInfo.background}</b></span>
              <span>COLOR <b className="text-white">{newColor || selectedDivInfo.color}</b></span>
              <span>BORDER <b className="text-white">{newBorder || selectedDivInfo.border}</b></span>
              <span>RADIUS <b className="text-white">{newRadius || selectedDivInfo.radius}</b></span>
            </div>
          </div>

          <div
            data-ui-settings-shell="true"
            className="fixed bottom-5 left-1/2 z-[100001] flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-stretch overflow-x-auto border border-white/15 bg-[#1f1f21] text-white shadow-2xl"
          >
            <button
              type="button"
              onClick={() => {
                setIsCompactInspector(false);
                setIsInspecting(true);
              }}
              className="flex min-w-14 items-center justify-center border-r border-white/10 px-3 hover:bg-white/10"
              title="Chọn DIV khác"
            >
              <Target className="h-4 w-4" />
            </button>
            {[
              { label: "Nền", icon: PaintBucket, value: newBg, fallback: selectedDivInfo.background, setter: setNewBg },
              { label: "Chữ", icon: Type, value: newColor, fallback: selectedDivInfo.color, setter: setNewColor },
              { label: "Viền", icon: SquareDashed, value: newBorder, fallback: selectedDivInfo.border, setter: setNewBorder },
              { label: "Bo góc", icon: Maximize2, value: newRadius, fallback: selectedDivInfo.radius, setter: setNewRadius },
            ].map(({ label, icon: Icon, value, fallback, setter }) => (
              <label key={label} className="flex min-w-32 items-center gap-2 border-r border-white/10 px-3 py-2">
                <Icon className="h-4 w-4 shrink-0 text-slate-300" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">{label}</span>
                  <input
                    value={value}
                    onChange={(event) => setter(event.target.value)}
                    placeholder={fallback}
                    aria-label={`Chỉnh ${label.toLowerCase()} của DIV`}
                    className="w-24 border-0 bg-transparent p-0 font-mono text-[10px] text-white outline-none placeholder:text-slate-400"
                  />
                </span>
              </label>
            ))}
            <button
              type="button"
              onClick={() => setIsCompactInspector(false)}
              className="flex min-w-16 flex-col items-center justify-center border-r border-white/10 px-3 text-[8px] font-black uppercase tracking-wider text-slate-300 hover:bg-white/10 hover:text-white"
              title="Mở bảng cài đặt đầy đủ"
            >
              <PanelTopOpen className="mb-1 h-4 w-4" />
              Mở rộng
            </button>
            <button
              type="button"
              onClick={() => addCustomRule(true)}
              className="flex min-w-16 flex-col items-center justify-center border-r border-white/10 px-3 text-[8px] font-black uppercase tracking-wider text-slate-300 hover:bg-white/10 hover:text-white"
              title="Áp dụng style vào danh sách"
            >
              <Check className="mb-1 h-4 w-4" />
              Áp dụng
            </button>
            <button
              type="button"
              onClick={saveCompactSettings}
              className="min-w-20 bg-white px-4 text-[10px] font-black uppercase tracking-widest text-slate-950 hover:bg-slate-200"
            >
              Lưu
            </button>
          </div>
        </>
      )}

      <div 
        data-ui-settings-shell="true"
        className={`fixed inset-0 z-[10000] flex items-center justify-center p-4 transition-all duration-300 ${
          isInspecting || isCompactInspector
            ? "bg-transparent pointer-events-none" 
            : "bg-black/45 backdrop-blur-sm pointer-events-auto overflow-y-auto"
        }`}
        onClick={onClose}
      >
        <div 
          className={`bg-white border-4 border-primary rounded-2xl shadow-hard-lg max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden transition-all duration-300 pointer-events-auto ${
            isInspecting || isCompactInspector ? "opacity-0 pointer-events-none scale-95 invisible" : "scale-100"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 flex justify-between items-center bg-background border-b-2 border-primary/10">
            <div className="flex items-center gap-3">
              <div className="relative">
                <select
                  value={activeModalTab}
                  onChange={(e) => setActiveModalTab(e.target.value as "general" | "div_selector")}
                  aria-label="Chọn chế độ hiển thị cài đặt giao diện"
                  className="appearance-none bg-white border-2 border-primary rounded-lg pl-3 pr-8 py-1.5 font-bold text-xs text-primary focus:outline-none cursor-pointer shadow-sm"
                >
                  <option value="general">⚙️ Cài đặt chung (General)</option>
                  <option value="div_selector">📐 Quản lý DIV & Style (Trang lớn)</option>
                </select>
                <ChevronDown className="w-4 h-4 text-primary absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <h3 className="font-black text-lg uppercase flex items-center gap-2 text-primary tracking-wide hidden sm:flex">
                <Settings2 className="w-5 h-5 text-accent animate-pulse" /> {activeModalTab === "general" ? "Cài đặt Giao diện" : "Trang Quản lý DIV & Style"}
              </h3>
            </div>
            <button
              onClick={onClose}
              aria-label="Đóng cài đặt giao diện"
              className="p-1.5 hover:bg-primary/10 rounded-lg border-2 border-transparent hover:border-primary transition-all text-primary cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 flex-1 overflow-y-auto bg-slate-50/50 text-primary custom-scrollbar">
            {activeModalTab === "div_selector" ? (
              /* Trang Quản lý DIV & Style: CHỈ CHỨA MỤC 2 */
              <div className="max-w-4xl mx-auto w-full">
                <div className="bg-white p-5 rounded-xl border-2 border-primary/10 shadow-sm flex flex-col gap-4">
                  <h4 className="font-black text-sm text-primary tracking-widest uppercase border-b-2 border-primary/10 pb-2">
                    2. FONT CHỮ & HIỂN THỊ (QUẢN LÝ DIV & STYLE)
                  </h4>
                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-[0.8125rem]">
                      Font chữ Bảng (Table Font)
                    </label>
                    <select
                      value={settings.tableFont || "var(--font-mono)"}
                      onChange={(e) =>
                        setSettings({ ...settings, tableFont: e.target.value })
                      }
                      className="w-full border-2 border-primary rounded-lg p-2 font-bold text-sm outline-none focus:shadow-hard-sm transition-all bg-white text-primary"
                    >
                      <option value="var(--font-mono)">Mặc định hệ thống (Space Grotesk)</option>
                      <option value="var(--font-space-grotesk)">Space Grotesk (Hiện đại / Rõ nét)</option>
                      <option value="var(--font-jetbrains-mono)">JetBrains Mono (Sắc sảo / Kỹ thuật)</option>
                      <option value="var(--font-inter)">Inter (Hiện đại / Tối giản)</option>
                      <option value="var(--font-newsreader)">Newsreader (Cổ điển / Báo chí)</option>
                      <option value="var(--font-nunito)">Nunito (Mềm mại)</option>
                      <option value="var(--font-quicksand)">Quicksand (Tròn trịa)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1 mt-2">
                    <div className="flex items-center justify-between">
                      <label htmlFor="table-font-size" className="font-bold text-[0.8125rem]">
                        Cỡ chữ của bảng
                      </label>
                      <span className="text-xs font-bold">{settings.fontSize || "13px"}</span>
                    </div>
                    <input
                      id="table-font-size"
                      type="range"
                      min="9"
                      max="20"
                      step="1"
                      value={parseFloat(settings.fontSize || "13") || 13}
                      onChange={(e) =>
                        setSettings({ ...settings, fontSize: `${e.target.value}px` })
                      }
                      className="w-full accent-primary"
                    />
                    <p className="text-[10px] font-medium text-gray-500">
                      Áp dụng đồng nhất cho tiêu đề, nội dung, dòng tổng và chân phân trang.
                    </p>
                  </div>

                  {/* Table Border Radius Slider */}
                  <div className="flex flex-col gap-1 mt-2">
                    <div className="flex justify-between items-center">
                      <label htmlFor="table-radius" className="font-bold text-[0.8125rem]">
                        Bo góc của bảng (Table Radius)
                      </label>
                      <span className="text-xs font-bold">{settings.tableRadius || "12px"}</span>
                    </div>
                    <input
                      id="table-radius"
                      type="range"
                      min="0"
                      max="30"
                      value={parseInt(settings.tableRadius || "12") || 0}
                      onChange={(e) =>
                        setSettings({ ...settings, tableRadius: `${e.target.value}px` })
                      }
                      className="w-full accent-primary"
                    />
                  </div>

                  {/* Custom Element Selector Styles */}
                  <div className="flex flex-col gap-2 mt-3 border-t border-primary/10 pt-3">
                      <label className="font-black text-xs text-primary/75 uppercase tracking-wider">
                        Chỉ định DIV & sửa styles
                      </label>
                      <p className="text-[10px] font-medium leading-relaxed text-primary/60">
                        Chỉ nhập thuộc tính muốn đổi. Ô để trống sẽ giữ nguyên định dạng gốc của DIV và các phần tử con.
                      </p>
                    
                    <div className="flex flex-col gap-2 bg-slate-50 p-3 rounded-lg border border-primary/10 text-xs">
                      {/* Preset selectors quick pick */}
                      <div className="flex flex-col gap-1">
                        <span className="text-[0.65rem] font-bold text-primary/60 uppercase">Chọn nhanh phần tử:</span>
                        <div className="flex flex-wrap gap-1">
                          {[
                            { label: "Bảng điều khiển (Navbar)", val: "#app-navbar, .navbar-header" },
                            { label: "Thanh bên (Sidebar)", val: "#app-sidebar, .side-panel" },
                            { label: "Vùng làm việc (Main Content)", val: "#main-content, .content-area" },
                            { label: "Vùng chứa Bảng (Table)", val: ".table-container, .data-table-wrapper" },
                            { label: "Vùng chứa trong Bảng (Table Div)", val: ".master-ae-table-wrapper > div.min-h-0" },
                            { label: "Tiêu đề Bảng (Header TH)", val: ".table-container thead th, .data-table-wrapper thead th" },
                            { label: "Thẻ Thống kê (Stat Card)", val: ".stat-card, .stat-group" },
                            { label: "Nút bấm chính (Button)", val: "button.btn-primary, .btn-primary" },
                            { label: "Thanh bộ lọc (Filter Toolbar)", val: ".filter-toolbar" }
                          ].map((p) => (
                            <button
                              key={p.val}
                              onClick={() => handleSelectorChange(p.val)}
                              type="button"
                              className="text-[0.55rem] font-bold bg-white border border-primary/20 hover:border-primary hover:bg-primary/5 px-2 py-1 rounded text-primary transition-all cursor-pointer"
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Selector Input */}
                      <div className="flex flex-col gap-1 mt-1">
                        <div className="flex justify-between items-center">
                          <span className="text-[0.65rem] font-bold text-primary/60 uppercase">CSS Selector:</span>
                          <button
                            type="button"
                            onClick={() => setIsInspecting(!isInspecting)}
                            className={`text-[0.6rem] font-bold px-1.5 py-0.5 rounded transition-all cursor-pointer border flex items-center gap-1 ${
                              isInspecting
                                ? "bg-red-500 text-white border-red-500 hover:bg-red-600 animate-pulse"
                                : "bg-primary/5 text-primary border-primary/20 hover:bg-primary/10 hover:border-primary"
                            }`}
                          >
                            <Target className="w-3 h-3" />
                            {isInspecting ? "Đang chọn... (Nhấn ESC)" : "Chọn từ màn hình"}
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="e.g. .side-panel hoặc #my-div"
                          value={newSelector}
                          onChange={(e) => handleSelectorChange(e.target.value)}
                          className="w-full border border-primary/20 rounded p-1.5 bg-white text-primary text-xs outline-none focus:border-primary"
                        />
                      </div>

                      {/* Styles Inputs */}
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <div className="flex flex-col gap-1">
                          <span className="text-[0.6rem] font-bold text-primary/60">Bo góc (Radius):</span>
                          <input
                            type="text"
                            placeholder="e.g. 16px hoặc 1rem"
                            value={newRadius}
                            onChange={(e) => setNewRadius(e.target.value)}
                            className="border border-primary/20 rounded p-1 bg-white text-primary text-xs outline-none"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[0.6rem] font-bold text-primary/60">Màu nền (Bg):</span>
                          <input
                            type="text"
                            placeholder="e.g. #ff0000, red, transparent"
                            value={newBg}
                            onChange={(e) => setNewBg(e.target.value)}
                            className="border border-primary/20 rounded p-1 bg-white text-primary text-xs outline-none"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[0.6rem] font-bold text-primary/60">Màu chữ (Color):</span>
                          <input
                            type="text"
                            placeholder="e.g. #000, white"
                            value={newColor}
                            onChange={(e) => setNewColor(e.target.value)}
                            className="border border-primary/20 rounded p-1 bg-white text-primary text-xs outline-none"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[0.6rem] font-bold text-primary/60">Viền (Border):</span>
                          <input
                            type="text"
                            placeholder="e.g. 2px solid #000"
                            value={newBorder}
                            onChange={(e) => setNewBorder(e.target.value)}
                            className="border border-primary/20 rounded p-1 bg-white text-primary text-xs outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5 mt-1 border-t border-primary/5 pt-2">
                        <span className="text-[0.65rem] font-bold text-primary/70 uppercase">Khoảng đệm (Padding):</span>
                        <div className="grid grid-cols-4 gap-1.5">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[0.55rem] font-bold text-primary/60 text-center">Top (px)</span>
                            <input
                              type="text"
                              placeholder="0"
                              value={padTop}
                              onChange={(e) => setPadTop(e.target.value)}
                              className="border border-primary/20 rounded p-1 bg-white text-primary text-xs outline-none text-center"
                            />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[0.55rem] font-bold text-primary/60 text-center">Right (px)</span>
                            <input
                              type="text"
                              placeholder="0"
                              value={padRight}
                              onChange={(e) => setPadRight(e.target.value)}
                              className="border border-primary/20 rounded p-1 bg-white text-primary text-xs outline-none text-center"
                            />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[0.55rem] font-bold text-primary/60 text-center">Bottom (px)</span>
                            <input
                              type="text"
                              placeholder="0"
                              value={padBottom}
                              onChange={(e) => setPadBottom(e.target.value)}
                              className="border border-primary/20 rounded p-1 bg-white text-primary text-xs outline-none text-center"
                            />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[0.55rem] font-bold text-primary/60 text-center">Left (px)</span>
                            <input
                              type="text"
                              placeholder="0"
                              value={padLeft}
                              onChange={(e) => setPadLeft(e.target.value)}
                              className="border border-primary/20 rounded p-1 bg-white text-primary text-xs outline-none text-center"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5 mt-1 border-t border-primary/5 pt-2">
                        <span className="text-[0.65rem] font-bold text-primary/70 uppercase">Lề ngoài (Margin):</span>
                        <div className="grid grid-cols-4 gap-1.5">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[0.55rem] font-bold text-primary/60 text-center">Top (px)</span>
                            <input
                              type="text"
                              placeholder="0"
                              value={marTop}
                              onChange={(e) => setMarTop(e.target.value)}
                              className="border border-primary/20 rounded p-1 bg-white text-primary text-xs outline-none text-center"
                            />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[0.55rem] font-bold text-primary/60 text-center">Right (px)</span>
                            <input
                              type="text"
                              placeholder="0"
                              value={marRight}
                              onChange={(e) => setMarRight(e.target.value)}
                              className="border border-primary/20 rounded p-1 bg-white text-primary text-xs outline-none text-center"
                            />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[0.55rem] font-bold text-primary/60 text-center">Bottom (px)</span>
                            <input
                              type="text"
                              placeholder="0"
                              value={marBottom}
                              onChange={(e) => setMarBottom(e.target.value)}
                              className="border border-primary/20 rounded p-1 bg-white text-primary text-xs outline-none text-center"
                            />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[0.55rem] font-bold text-primary/60 text-center">Left (px)</span>
                            <input
                              type="text"
                              placeholder="0"
                              value={marLeft}
                              onChange={(e) => setMarLeft(e.target.value)}
                              className="border border-primary/20 rounded p-1 bg-white text-primary text-xs outline-none text-center"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mt-1">
                        <div className="flex flex-col gap-1">
                          <span className="text-[0.6rem] font-bold text-primary/60">Cỡ chữ (Font Size):</span>
                          <input
                            type="text"
                            placeholder="e.g. 14px, 1rem"
                            value={newFontSize}
                            onChange={(e) => setNewFontSize(e.target.value)}
                            className="border border-primary/20 rounded p-1 bg-white text-primary text-xs outline-none"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[0.6rem] font-bold text-primary/60">Rộng (Width):</span>
                          <input
                            type="text"
                            placeholder="e.g. 280px hoặc 100%"
                            value={newWidth}
                            onChange={(e) => setNewWidth(e.target.value)}
                            className="border border-primary/20 rounded p-1 bg-white text-primary text-xs outline-none"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[0.6rem] font-bold text-primary/60">Cao (Height):</span>
                          <input
                            type="text"
                            placeholder="e.g. 500px hoặc auto"
                            value={newHeight}
                            onChange={(e) => setNewHeight(e.target.value)}
                            className="border border-primary/20 rounded p-1 bg-white text-primary text-xs outline-none"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => addCustomRule()}
                        className="mt-2 w-full bg-primary text-white hover:bg-primary/90 font-bold py-1.5 rounded transition-all text-[0.65rem] uppercase tracking-wider cursor-pointer"
                      >
                        ÁP DỤNG STYLE MỚI
                      </button>
                    </div>

                    {/* List of custom styles configured */}
                    {settings.customRules && settings.customRules.length > 0 && (
                      <div className="flex flex-col gap-1.5 mt-2 max-h-40 overflow-y-auto border border-primary/10 rounded-lg p-2 bg-white">
                        <span className="text-[0.6rem] font-black uppercase text-primary/50">Danh sách style đã đổi:</span>
                        {settings.customRules.map((rule) => (
                          <div key={rule.id} className="flex justify-between items-center text-[0.65rem] border-b border-primary/5 pb-1 gap-2">
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="font-mono text-primary font-bold truncate">{rule.selector}</span>
                              <span className="text-primary/60 font-medium text-[0.55rem] truncate">
                                {[
                                  rule.radius && `r: ${rule.radius}`,
                                  rule.bg && `bg: ${rule.bg}`,
                                  rule.color && `c: ${rule.color}`,
                                  rule.fontSize && `fs: ${rule.fontSize}`,
                                  rule.border && `b: ${rule.border}`,
                                  rule.padding && `p: ${rule.padding}`,
                                  rule.margin && `m: ${rule.margin}`,
                                  rule.width && `w: ${rule.width}`,
                                  rule.height && `h: ${rule.height}`
                                ].filter(Boolean).join(" // ")}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeCustomRule(rule.id)}
                              className="text-red-500 hover:text-red-700 font-bold px-1 rounded hover:bg-red-50 cursor-pointer text-[0.55rem] uppercase tracking-wider shrink-0"
                            >
                              Xoá
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Cài đặt chung (General Mode): MỤC 1 & MỤC 3 */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Left Column: MỤC 1. MÀU SẮC & NỀN */}
                <div className="flex flex-col gap-6">
                  <div className="bg-white p-5 rounded-xl border-2 border-primary/10 shadow-sm flex flex-col gap-4">
                    <h4 className="font-black text-sm text-primary tracking-widest uppercase border-b-2 border-primary/10 pb-2">
                      1. MÀU SẮC & NỀN (COLORS & BG)
                    </h4>
                    <div className="flex flex-col gap-1.5 border-b border-dashed border-primary/10 pb-4 mb-2">
                      <label htmlFor="preset-select" className="font-bold text-[0.8125rem] text-accent flex items-center gap-1.5">
                        <span>🎨 Giao diện mẫu (Taste Preset)</span>
                      </label>
                      <select
                        id="preset-select"
                        value={settings.preset || "systematic"}
                        onChange={(e) => {
                          const pId = e.target.value;
                          const presetData = TASTE_PRESETS[pId];
                          if (presetData) {
                            setSettings((prev) => ({
                              ...prev,
                              preset: pId,
                              bg: presetData.bg,
                              accent: presetData.accent,
                              text: presetData.text,
                              border: presetData.border,
                              stripeColor1: presetData.stripeColor1,
                              stripeColor2: presetData.stripeColor2,
                              gridLineColor: presetData.gridLineColor,
                              tableHeaderBg: presetData.tableHeaderBg,
                              tableFooterBg: presetData.tableFooterBg,
                              tableFont: presetData.tableFont,
                              tableRadius: presetData.tableRadius,
                            }));
                            toast.success(`Đã áp dụng giao diện: ${presetData.name}`);
                          }
                        }}
                        className="w-full border-2 border-primary rounded-lg p-2 font-bold text-sm outline-none focus:shadow-hard-sm transition-all bg-white text-primary"
                      >
                        {Object.values(TASTE_PRESETS).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-gray-500 font-medium">
                        * Thay đổi giao diện mẫu sẽ tự động cấu hình các thông số màu sắc, bo góc và phông chữ của bảng theo chuẩn Taste-Skill.
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="accent-color"
                        className="font-bold text-[0.8125rem]"
                      >
                        Màu nhấn (Accent/Table)
                      </label>
                      <input
                        id="accent-color"
                        type="color"
                        value={
                          settings.accent?.startsWith("#") && settings.accent.length === 7
                            ? settings.accent
                            : "#C88493"
                        }
                        onChange={(e) =>
                          setSettings({ ...settings, accent: e.target.value })
                        }
                        className="w-10 h-10 cursor-pointer border-2 border-primary rounded-lg p-0.5 shadow-hard-sm"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label htmlFor="text-color" className="font-bold text-[0.8125rem]">
                        Màu chữ (Text)
                      </label>
                      <input
                        id="text-color"
                        type="color"
                        value={
                          settings.text?.startsWith("#") && settings.text.length === 7
                            ? settings.text
                            : "#5D111A"
                        }
                        onChange={(e) =>
                          setSettings({ ...settings, text: e.target.value })
                        }
                        className="w-10 h-10 cursor-pointer border-2 border-primary rounded-lg p-0.5 shadow-hard-sm"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="stripe-color1"
                        className="font-bold text-[0.8125rem]"
                      >
                        Nền Web: Màu sọc 1
                      </label>
                      <input
                        id="stripe-color1"
                        type="color"
                        value={
                          settings.stripeColor1?.startsWith("#") &&
                          settings.stripeColor1.length === 7
                            ? settings.stripeColor1
                            : "#F6F4F0"
                        }
                        onChange={(e) =>
                          setSettings({ ...settings, stripeColor1: e.target.value })
                        }
                        className="w-10 h-10 cursor-pointer border-2 border-primary rounded-lg p-0.5 shadow-hard-sm"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="stripe-color2"
                        className="font-bold text-[0.8125rem]"
                      >
                        Nền Web: Màu sọc 2
                      </label>
                      <input
                        id="stripe-color2"
                        type="color"
                        value={
                          settings.stripeColor2?.startsWith("#") &&
                          settings.stripeColor2.length === 7
                            ? settings.stripeColor2
                            : "#F4ECD8"
                        }
                        onChange={(e) =>
                          setSettings({ ...settings, stripeColor2: e.target.value })
                        }
                        className="w-10 h-10 cursor-pointer border-2 border-primary rounded-lg p-0.5 shadow-hard-sm"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="border-color"
                        className="font-bold text-[0.8125rem]"
                      >
                        Viền & Đổ bóng (Border)
                      </label>
                      <input
                        id="border-color"
                        type="color"
                        value={
                          settings.border?.startsWith("#") && settings.border.length === 7
                            ? settings.border
                            : "#E7DBDC"
                        }
                        onChange={(e) =>
                          setSettings({ ...settings, border: e.target.value })
                        }
                        className="w-10 h-10 cursor-pointer border-2 border-primary rounded-lg p-0.5 shadow-hard-sm"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="grid-color"
                        className="font-bold text-[0.8125rem]"
                      >
                        Màu kẻ lưới (Grid Line)
                      </label>
                      <input
                        id="grid-color"
                        type="color"
                        value={
                          settings.gridLineColor?.startsWith("#") &&
                          settings.gridLineColor.length === 7
                            ? settings.gridLineColor
                            : "#e2e8f0"
                        }
                        onChange={(e) =>
                          setSettings({ ...settings, gridLineColor: e.target.value })
                        }
                        className="w-10 h-10 cursor-pointer border-2 border-primary rounded-lg p-0.5 shadow-hard-sm"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="table-header-bg"
                        className="font-bold text-[0.8125rem]"
                      >
                        Nền Tiêu đề Bảng (Header Bg)
                      </label>
                      <input
                        id="table-header-bg"
                        type="color"
                        value={
                          settings.tableHeaderBg?.startsWith("#") &&
                          settings.tableHeaderBg.length === 7
                            ? settings.tableHeaderBg
                            : "#f4efe2"
                        }
                        onChange={(e) =>
                          setSettings({ ...settings, tableHeaderBg: e.target.value })
                        }
                        className="w-10 h-10 cursor-pointer border-2 border-primary rounded-lg p-0.5 shadow-hard-sm"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="table-footer-bg"
                        className="font-bold text-[0.8125rem]"
                      >
                        Nền Chân Bảng (Footer Bg)
                      </label>
                      <input
                        id="table-footer-bg"
                        type="color"
                        value={
                          settings.tableFooterBg?.startsWith("#") &&
                          settings.tableFooterBg.length === 7
                            ? settings.tableFooterBg
                            : "#f8f4ec"
                        }
                        onChange={(e) =>
                          setSettings({ ...settings, tableFooterBg: e.target.value })
                        }
                        className="w-10 h-10 cursor-pointer border-2 border-primary rounded-lg p-0.5 shadow-hard-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Right Column: MỤC 3. DỮ LIỆU & LƯU TRỮ */}
                <div className="flex flex-col gap-6">
                  <div className="bg-white p-5 rounded-xl border-2 border-primary/10 shadow-sm flex flex-col gap-4">
                    <h4 className="font-black text-sm text-red-500 tracking-widest uppercase border-b-2 border-red-500/10 pb-2">
                      3. DỮ LIỆU & LƯU TRỮ (DATA & ACTIONS)
                    </h4>
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={() => setShowClearConfirm(true)}
                        className="flex items-center justify-center gap-2 w-full bg-red-50 text-red-600 hover:bg-red-100 py-3 rounded-xl font-bold border-2 border-red-200 transition-colors cursor-pointer text-sm uppercase tracking-wide"
                      >
                        <Trash2 className="w-5 h-5" /> Xoá Toàn Bộ Dữ Liệu
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

  <div className="p-4 flex gap-3 bg-background border-t-2 border-primary/10 shrink-0">
    <button
      onClick={saveSettings}
      className="flex-1 text-primary-foreground py-2.5 rounded-xl font-bold border-2 border-primary bg-primary hover:bg-primary/95 hover:shadow-none shadow-hard-sm active:translate-x-[1px] active:translate-y-[1px] transition-all cursor-pointer text-sm uppercase tracking-wider"
    >
      Lưu Lại
    </button>
    <button
      onClick={resetSettings}
      className="flex-1 bg-white text-primary py-2.5 rounded-xl font-bold border-2 border-primary hover:bg-primary/5 hover:shadow-none shadow-hard-sm active:translate-x-[1px] active:translate-y-[1px] transition-all cursor-pointer text-sm uppercase tracking-wider"
    >
      Mặc định
    </button>
  </div>

  <ConfirmDialog
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleClearAll}
        title="Xác nhận xóa toàn bộ dữ liệu"
        description="Hành động này sẽ xóa sạch toàn bộ dữ liệu đã tải lên và các kết quả tính toán. Bạn có chắc chắn muốn tiếp tục?"
        confirmText="Xoá sạch"
        variant="destructive"
      />
    </div>
  </div>
  </>
  );
}
