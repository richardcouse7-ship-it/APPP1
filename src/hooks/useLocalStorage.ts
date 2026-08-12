import { useState, useEffect, useCallback, SetStateAction } from "react";

/**
 * Generic localStorage-backed state hook.
 *
 * Automatically persists state to localStorage on every change.
 * Handles JSON serialization/deserialization and crash recovery.
 *
 * @param key          localStorage key
 * @param initialValue Fallback value when key is missing or invalid
 * @returns [value, setValue, clearValue] tuple
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: SetStateAction<T>) => void, () => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) {
        return JSON.parse(saved) as T;
      }
    } catch (e) {
      console.error(`Failed to load "${key}" from localStorage`, e);
    }
    return initialValue;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error(`Failed to save "${key}" to localStorage`, e);
    }
  }, [key, value]);

  const clearValue = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.error(`Failed to clear "${key}" from localStorage`, e);
    }
    setValue(initialValue);
  }, [key, initialValue]);

  return [value, setValue, clearValue];
}
