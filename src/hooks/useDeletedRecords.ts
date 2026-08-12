import { useState, useCallback } from "react";

const DELETED_IDS_KEY = "irish_b2b_deleted_record_ids_v1";

/**
 * Manages the "tombstone" list of deleted record IDs.
 *
 * Deleted IDs are tracked to prevent records from being resurrected
 * when localStorage data is merged with Firestore data on sign-in
 * or page reload.
 *
 * @returns { deletedRecordIds, addDeletedIds, clearDeletedIds }
 */
export function useDeletedRecords() {
  const [deletedRecordIds, setDeletedRecordIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(DELETED_IDS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return new Set(parsed);
      }
    } catch (e) {
      console.error("Failed to load deleted record IDs", e);
    }
    return new Set();
  });

  const persist = useCallback((ids: Set<string>) => {
    try {
      localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(Array.from(ids)));
    } catch (e) {
      console.error("Failed to persist deleted record IDs", e);
    }
  }, []);

  const addDeletedIds = useCallback(
    (ids: string[]) => {
      setDeletedRecordIds((prev) => {
        const next = new Set([...prev, ...ids]);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const clearDeletedIds = useCallback(() => {
    setDeletedRecordIds(new Set());
    try {
      localStorage.setItem(DELETED_IDS_KEY, JSON.stringify([]));
    } catch (e) {
      console.error("Failed to clear deleted record IDs", e);
    }
  }, []);

  const setAllDeletedIds = useCallback(
    (ids: string[]) => {
      const next = new Set(ids);
      setDeletedRecordIds(next);
      persist(next);
    },
    [persist]
  );

  return {
    deletedRecordIds,
    addDeletedIds,
    clearDeletedIds,
    setAllDeletedIds,
  };
}
