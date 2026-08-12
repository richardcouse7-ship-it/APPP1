import { useState, useEffect } from "react";

const SETTINGS_KEY = "irish_b2b_website_finder_settings_v1";

export interface BatchSettings {
  batchSize: number;
  requestDelay: number;
  selectedModel: string;
  useCache: boolean;
}

const DEFAULTS: BatchSettings = {
  batchSize: 10,
  requestDelay: 1.2,
  selectedModel: "gemini-3.6-flash",
  useCache: true,
};

/**
 * Manages batch processing settings with localStorage persistence.
 * Extracts settings state and auto-save logic from App.tsx.
 */
export function useBatchSettings() {
  const [settings, setSettings] = useState<BatchSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          batchSize:
            typeof parsed.batchSize === "number" && parsed.batchSize >= 1 && parsed.batchSize <= 50
              ? parsed.batchSize
              : DEFAULTS.batchSize,
          requestDelay:
            typeof parsed.requestDelay === "number" && parsed.requestDelay >= 0.1 && parsed.requestDelay <= 10
              ? parsed.requestDelay
              : DEFAULTS.requestDelay,
          selectedModel: parsed.selectedModel || DEFAULTS.selectedModel,
          useCache: typeof parsed.useCache === "boolean" ? parsed.useCache : DEFAULTS.useCache,
        };
      }
    } catch (e) {
      console.error("Failed to load batch settings from localStorage", e);
    }
    return DEFAULTS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error("Failed to auto-save batch settings to localStorage", e);
    }
  }, [settings]);

  const setBatchSize = (size: number) =>
    setSettings((prev) => ({ ...prev, batchSize: size }));
  const setRequestDelay = (delay: number) =>
    setSettings((prev) => ({ ...prev, requestDelay: delay }));
  const setSelectedModel = (model: string) =>
    setSettings((prev) => ({ ...prev, selectedModel: model }));
  const setUseCache = (enabled: boolean) =>
    setSettings((prev) => ({ ...prev, useCache: enabled }));
  const resetSettings = () => {
    localStorage.removeItem(SETTINGS_KEY);
    setSettings(DEFAULTS);
  };

  return {
    ...settings,
    setBatchSize,
    setRequestDelay,
    setSelectedModel,
    setUseCache,
    resetSettings,
  };
}
