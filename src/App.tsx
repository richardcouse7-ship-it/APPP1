import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Header } from './components/Header';
import { StatsCards } from './components/StatsCards';
import { FileUpload } from './components/FileUpload';
import { BatchControls } from './components/BatchControls';
import { ResultsTable } from './components/ResultsTable';
import { StagedLeadsVault } from './components/StagedLeadsVault';
import { CompanyDetailModal } from './components/CompanyDetailModal';
import { DuplicateBanner } from './components/DuplicateBanner';
import { DuplicateCleanupModal } from './components/DuplicateCleanupModal';
import { ColumnMappingModal } from './components/ColumnMappingModal';
import { VoiceAssistantModal } from './components/VoiceAssistantModal';
import { AiIntelligenceModal } from './components/AiIntelligenceModal';
import { GoogleMapsGroundingModal } from './components/GoogleMapsGroundingModal';
import { CompanyRecord, SummaryStats } from './types';
import { SAMPLE_IRISH_COMPANIES } from './data/sampleCompanies';
import { analyzeDuplicates, deduplicateDataset } from './utils/duplicateUtils';
import { cleanNullableField } from './utils/normalize';
import { mergeRelabeledRecords } from './utils/csvUtils';
import { Sparkles, Building2, ShieldCheck, Database, FileSpreadsheet, CheckCircle2, AlertTriangle, X, Mic, MapPin, Brain, ArrowRight, Layers } from 'lucide-react';
import { initAuth, googleSignIn, logoutUser } from './lib/firebaseAuth';
import {
  testFirestoreConnection,
  saveUserRecordsToFirestore,
  getUserRecordsFromFirestore,
  deleteUserRecordsFromFirestore,
  clearAllUserRecordsFromFirestore,
  saveStagedLeadsToFirestore,
  getStagedLeadsFromFirestore,
  deleteStagedLeadsFromFirestore,
  clearAllStagedLeadsFromFirestore
} from './lib/firestoreDb';
import { User } from 'firebase/auth';
import { apiFetch } from './lib/apiClient';
import { useBatchSettings } from './hooks/useBatchSettings';
import { useDeletedRecords } from './hooks/useDeletedRecords';

const STORAGE_KEY = 'irish_b2b_website_finder_records_v1';
const STAGED_VAULT_KEY = 'irish_b2b_staged_leads_vault_v1';
const DELETED_IDS_KEY = 'irish_b2b_deleted_record_ids_v1';
const SETTINGS_KEY = 'irish_b2b_website_finder_settings_v1';

export default function App() {
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Modals for Gemini & Maps capabilities
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState<boolean>(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [isMapsModalOpen, setIsMapsModalOpen] = useState<boolean>(false);

  // Active view tab in UI: 'FINAL_TABLE' | 'STAGING_VAULT'
  const [activeTab, setActiveTab] = useState<'FINAL_TABLE' | 'STAGING_VAULT'>('FINAL_TABLE');

  // Tombstone list of deleted record IDs — managed by useDeletedRecords hook
  const { deletedRecordIds, addDeletedIds, clearDeletedIds, setAllDeletedIds } = useDeletedRecords();

  // Load Tier 1 Staged Leads Vault from localStorage
  const [stagedLeads, setStagedLeads] = useState<CompanyRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STAGED_VAULT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const savedDeleted = localStorage.getItem(DELETED_IDS_KEY);
          const deletedSet = savedDeleted ? new Set(JSON.parse(savedDeleted)) : new Set();
          return parsed.filter((l: CompanyRecord) => !deletedSet.has(l.id));
        }
      }
    } catch (e) {
      console.error('Failed to load staged leads from localStorage', e);
    }
    return [];
  });

  // Load saved records from localStorage with crash recovery
  const [records, setRecords] = useState<CompanyRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Filter out tombstoned deleted IDs immediately
          const savedDeleted = localStorage.getItem(DELETED_IDS_KEY);
          const deletedSet = savedDeleted ? new Set(JSON.parse(savedDeleted)) : new Set();
          return parsed
            .filter((r: CompanyRecord) => !deletedSet.has(r.id))
            .map((r: CompanyRecord) =>
              r.status === 'PROCESSING' ? { ...r, status: 'PENDING' } : r
            );
        }
      }
    } catch (e) {
      console.error('Failed to load records from localStorage', e);
    }
    return SAMPLE_IRISH_COMPANIES;
  });

  // Batch settings — managed by useBatchSettings hook
  const {
    batchSize, setBatchSize,
    requestDelay, setRequestDelay,
    selectedModel, setSelectedModel,
    useCache, setUseCache,
    resetSettings,
  } = useBatchSettings();

  const [isRunningBatch, setIsRunningBatch] = useState<boolean>(false);
  const [currentActiveCompany, setCurrentActiveCompany] = useState<CompanyRecord | null>(null);
  const [selectedCompanyModal, setSelectedCompanyModal] = useState<CompanyRecord | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);
  const [isReEnrichingSingle, setIsReEnrichingSingle] = useState<boolean>(false);
  const [rateLimitNotice, setRateLimitNotice] = useState<string | null>(null);
  const stopBatchRef = useRef<boolean>(false);
  const activeAbortControllerRef = useRef<AbortController | null>(null);

  // Google Workspace Auth State
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Helper to merge local state and remote Firestore datasets without losing data
  const mergeRecordsList = (local: CompanyRecord[], remote: CompanyRecord[], deletedIds: Set<string>): CompanyRecord[] => {
    const map = new Map<string, CompanyRecord>();
    local.forEach((r) => {
      if (!deletedIds.has(r.id)) map.set(r.id, r);
    });
    remote.forEach((r) => {
      if (!deletedIds.has(r.id)) {
        const existing = map.get(r.id);
        if (!existing) {
          map.set(r.id, r);
        } else if (r.status === 'SUCCESS' && existing.status !== 'SUCCESS') {
          map.set(r.id, r);
        }
      }
    });
    return Array.from(map.values());
  };

  useEffect(() => {
    // Test connection mandate
    testFirestoreConnection();

    const unsubscribe = initAuth(
      async (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);

        // Safely merge saved datasets from Firestore when user logs in
        if (currentUser) {
          try {
            const firestoreRecords = await getUserRecordsFromFirestore(currentUser.uid);
            if (firestoreRecords && firestoreRecords.length > 0) {
              setRecords((prev) => mergeRecordsList(prev, firestoreRecords, deletedRecordIds));
            }
            const firestoreStaged = await getStagedLeadsFromFirestore(currentUser.uid);
            if (firestoreStaged && firestoreStaged.length > 0) {
              setStagedLeads((prev) => mergeRecordsList(prev, firestoreStaged, deletedRecordIds));
            }
          } catch (e) {
            console.warn('Could not load Firestore records:', e);
          }
        }
      },
      () => {
        setUser(null);
        setAccessToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);

        // Sync and merge Firestore records upon sign in
        try {
          const firestoreRecords = await getUserRecordsFromFirestore(result.user.uid);
          if (firestoreRecords && firestoreRecords.length > 0) {
            setRecords((prev) => mergeRecordsList(prev, firestoreRecords, deletedRecordIds));
          } else if (records.length > 0) {
            await saveUserRecordsToFirestore(result.user.uid, records);
          }
          const firestoreStaged = await getStagedLeadsFromFirestore(result.user.uid);
          if (firestoreStaged && firestoreStaged.length > 0) {
            setStagedLeads((prev) => mergeRecordsList(prev, firestoreStaged, deletedRecordIds));
          } else if (stagedLeads.length > 0) {
            await saveStagedLeadsToFirestore(result.user.uid, stagedLeads);
          }
        } catch (e) {
          console.warn('Error syncing Firestore on sign-in:', e);
        }
      }
    } catch (err: any) {
      console.error('Google Sign-In failed:', err);
      if (err?.code !== 'auth/popup-closed-by-user') {
        setRateLimitNotice(
          `Google Sign-In error (${err.code || 'origin_mismatch'}): Ensure http://localhost:3000 is added to Authorized JavaScript Origins in Google Cloud Console.`
        );
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await logoutUser();
    setUser(null);
    setAccessToken(null);
  };

  // Auto-save records and staged leads to localStorage immediately, debouncing Firestore writes by 1.5s
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      localStorage.setItem(STAGED_VAULT_KEY, JSON.stringify(stagedLeads));

      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastSavedAt(timeStr);
    } catch (e) {
      console.error('Failed to auto-save records to localStorage', e);
    }

    if (!user) return;

    // Debounce Firestore background sync to prevent write quota exhaustion during rapid batch enrichment
    const timer = setTimeout(() => {
      saveUserRecordsToFirestore(user.uid, records).catch((e) =>
        console.warn('Background Firestore sync warning:', e)
      );
      saveStagedLeadsToFirestore(user.uid, stagedLeads).catch((e) =>
        console.warn('Background Firestore staged sync warning:', e)
      );
    }, 1500);

    return () => clearTimeout(timer);
  }, [records, stagedLeads, user]);

  // Check health status on mount
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (data.hasApiKey !== undefined) {
          setHasApiKey(data.hasApiKey);
        }
      })
      .catch((err) => {
        console.warn('API health check error:', err);
      });
  }, []);

  // Compute summary stats
  const stats: SummaryStats = useMemo(() => {
    const total = records.length;
    const processed = records.filter((r) => r.status === 'SUCCESS' || r.status === 'FAILED').length;
    const remaining = total - processed;
    const officialFound = records.filter((r) => r.match_type === 'OFFICIAL_WEBSITE').length;
    const facebookFallback = records.filter((r) => r.match_type === 'FACEBOOK_FALLBACK').length;
    const notFound = records.filter((r) => r.match_type === 'NOT_FOUND' && r.status === 'SUCCESS').length;
    const failed = records.filter((r) => r.status === 'FAILED').length;
    const officialPercentage = processed > 0 ? Math.round((officialFound / processed) * 100) : 0;

    return {
      total,
      processed,
      remaining,
      officialFound,
      facebookFallback,
      notFound,
      failed,
      officialPercentage,
    };
  }, [records]);

  const [isDuplicateBannerDismissed, setIsDuplicateBannerDismissed] = useState<boolean>(false);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState<boolean>(false);
  const [isTableMappingOpen, setIsTableMappingOpen] = useState<boolean>(false);

  // Edit / Relabel a single record
  const handleEditRecord = (updatedRecord: CompanyRecord) => {
    setRecords((prev) =>
      prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r))
    );
    if (selectedCompanyModal && selectedCompanyModal.id === updatedRecord.id) {
      setSelectedCompanyModal(updatedRecord);
    }
  };

  // Automated duplicate analysis
  const duplicateAnalysis = useMemo(() => {
    return analyzeDuplicates(records);
  }, [records]);

  // Handle uploading raw records from CSV/XLSX: Places them into Tier 1 Staged Vault
  const handleRecordsUploaded = (newRecords: CompanyRecord[]) => {
    setStagedLeads(newRecords);
    setActiveTab('STAGING_VAULT');
    setIsDuplicateBannerDismissed(false);

    if (user) {
      clearAllStagedLeadsFromFirestore(user.uid).then(() => {
        saveStagedLeadsToFirestore(user.uid, newRecords);
      }).catch((e) => console.warn('Firestore staged sync error:', e));
    }
  };

  // Load sample data into Staged Vault
  const handleLoadSampleData = () => {
    setStagedLeads(SAMPLE_IRISH_COMPANIES);
    setActiveTab('STAGING_VAULT');
    setIsDuplicateBannerDismissed(false);

    if (user) {
      saveStagedLeadsToFirestore(user.uid, SAMPLE_IRISH_COMPANIES).catch((e) =>
        console.warn('Firestore staged sync error:', e)
      );
    }
  };

  // Promote & bring through staged leads into Final Enriched Results Data Table (Tier 2)
  const handlePromoteAndEnrichStagedLeads = (leadsToPromote: CompanyRecord[], switchTab: boolean = true) => {
    if (!leadsToPromote || leadsToPromote.length === 0) return;

    const promoteIds = new Set(leadsToPromote.map((l) => l.id));

    // Append to active records table
    setRecords((prev) => {
      const existingIds = new Set(prev.map((r) => r.id));
      const freshLeads = leadsToPromote.filter((l) => !existingIds.has(l.id));
      return [...prev, ...freshLeads];
    });

    // Remove promoted leads from Staging Vault
    setStagedLeads((prev) => prev.filter((l) => !promoteIds.has(l.id)));
    if (switchTab) {
      setActiveTab('FINAL_TABLE');
    }

    if (user) {
      deleteStagedLeadsFromFirestore(user.uid, Array.from(promoteIds)).catch((e) =>
        console.warn('Firestore staged delete error:', e)
      );
    }
  };

  // Delete staged leads from Tier 1 Vault
  const handleDeleteStagedLeads = (idsToDelete: string[]) => {
    if (!idsToDelete || idsToDelete.length === 0) return;
    setStagedLeads((prev) => prev.filter((l) => !idsToDelete.includes(l.id)));
    if (user) {
      deleteStagedLeadsFromFirestore(user.uid, idsToDelete).catch((e) =>
        console.warn('Firestore staged delete error:', e)
      );
    }
  };

  const handleClearStagingVault = () => {
    if (window.confirm('Clear all staged raw leads from vault?')) {
      setStagedLeads([]);
      localStorage.setItem(STAGED_VAULT_KEY, JSON.stringify([]));
      if (user) {
        clearAllStagedLeadsFromFirestore(user.uid).catch((e) =>
          console.warn('Firestore clear staged error:', e)
        );
      }
    }
  };

  const handleResetDisqualifiedStagedLeads = () => {
    setStagedLeads((prev) =>
      prev.map((l) =>
        l.match_type === 'DISQUALIFIED'
          ? { ...l, status: 'PENDING', match_type: 'UNPROCESSED', notes: undefined }
          : l
      )
    );
  };

  // Auto clean deduplicate handler
  const handleAutoDeduplicate = () => {
    const { cleanedRecords } = deduplicateDataset(records);
    const remainingIds = new Set(cleanedRecords.map((r) => r.id));
    const removedIds = records.filter((r) => !remainingIds.has(r.id)).map((r) => r.id);

    setRecords(cleanedRecords);
    setIsDuplicateBannerDismissed(true);

    if (removedIds.length > 0) {
      addDeletedIds(removedIds);
      if (user) {
        deleteUserRecordsFromFirestore(user.uid, removedIds).catch((e) =>
          console.warn('Firestore delete error:', e)
        );
      }
    }
  };

  const handleKeepRecordInGroup = (normalizedGroupNumber: string, keepId: string) => {
    const removedIds: string[] = [];
    setRecords((prev) =>
      prev.filter((r) => {
        const norm = (r.companyNumber || '').toString().trim().toLowerCase();
        if (norm === normalizedGroupNumber) {
          if (r.id !== keepId) {
            removedIds.push(r.id);
            return false;
          }
        }
        return true;
      })
    );

    if (removedIds.length > 0) {
      addDeletedIds(removedIds);
      if (user) {
        deleteUserRecordsFromFirestore(user.uid, removedIds).catch((e) =>
          console.warn('Firestore delete error:', e)
        );
      }
    }
  };

  // Reset entire session
  const handleResetSession = () => {
    if (window.confirm('Are you sure you want to reset and clear all business records and saved settings?')) {
      const allIds = records.map((r) => r.id);
      setRecords([]);
      setStagedLeads([]);
      setAllDeletedIds(allIds);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      localStorage.setItem(STAGED_VAULT_KEY, JSON.stringify([]));
      resetSettings();

      if (user) {
        clearAllUserRecordsFromFirestore(user.uid).catch((e) =>
          console.warn('Firestore clear error:', e)
        );
        clearAllStagedLeadsFromFirestore(user.uid).catch((e) =>
          console.warn('Firestore clear staged error:', e)
        );
      }
    }
  };

  // PERMANENT DELETION OF SPECIFIC RECORDS
  const handleDeleteRecords = (idsToDelete: string[]) => {
    if (!idsToDelete || idsToDelete.length === 0) return;

    // 1. Immediately remove from local state
    setRecords((prev) => prev.filter((r) => !idsToDelete.includes(r.id)));

    // 2. Mark in Tombstone deleted list so reload/refresh never resurrects them
    addDeletedIds(idsToDelete);

    // 3. Immediately purge from local storage
    const updatedRecords = records.filter((r) => !idsToDelete.includes(r.id));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedRecords));

    // 4. Delete from Firestore permanently
    if (user) {
      deleteUserRecordsFromFirestore(user.uid, idsToDelete).catch((e) =>
        console.warn('Firestore delete error:', e)
      );
    }
  };

  // Re-queue specific records back to PENDING
  const handleResetRecordStatus = (idsToReset: string[]) => {
    setRecords((prev) =>
      prev.map((r) =>
        idsToReset.includes(r.id)
          ? {
              ...r,
              status: 'PENDING',
              official_website_url: null,
              confidence_score: 'NONE',
              match_type: 'UNPROCESSED',
              notes: undefined,
            }
          : r
      )
    );
  };

  // Save manual URL edit
  const handleSaveManualUrl = (id: string, newUrl: string) => {
    setRecords((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          const isFb = newUrl.toLowerCase().includes('facebook.com');
          return {
            ...r,
            official_website_url: newUrl || null,
            status: 'SUCCESS',
            match_type: newUrl ? (isFb ? 'FACEBOOK_FALLBACK' : 'OFFICIAL_WEBSITE') : 'NOT_FOUND',
            confidence_score: newUrl ? 'HIGH' : 'LOW',
            isManualEdit: true,
            notes: newUrl ? 'Manually updated by user.' : 'Manually marked as not found.',
          };
        }
        return r;
      })
    );

    if (selectedCompanyModal && selectedCompanyModal.id === id) {
      setSelectedCompanyModal((prev) =>
        prev
          ? {
              ...prev,
              official_website_url: newUrl || null,
              status: 'SUCCESS',
              match_type: newUrl ? (newUrl.toLowerCase().includes('facebook.com') ? 'FACEBOOK_FALLBACK' : 'OFFICIAL_WEBSITE') : 'NOT_FOUND',
              confidence_score: newUrl ? 'HIGH' : 'LOW',
            }
          : null
      );
    }
  };

  // Re-enrich a single company
  const handleReEnrichSingle = async (company: CompanyRecord) => {
    setIsReEnrichingSingle(true);
    setRecords((prev) =>
      prev.map((r) => (r.id === company.id ? { ...r, status: 'PROCESSING' } : r))
    );

    try {
      const res = await apiFetch('/api/enrich-single', {
        method: 'POST',
        body: JSON.stringify({
          id: company.id,
          companyName: company.companyName,
          county: company.county,
          companyNumber: company.companyNumber,
          modelName: selectedModel,
          forceRefresh: true, // Manual single re-enrich forces fresh lookup
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      const updatedRecord: CompanyRecord = {
        ...company,
        status: 'SUCCESS',
        official_website_url: data.official_website_url,
        industry: data.industry,
        companySummary: data.companySummary,
        decisionMakerName: data.decisionMakerName,
        decisionMakerRole: data.decisionMakerRole,
        linkedinUrl: data.linkedinUrl,
        linkedinType: data.linkedinType,
        phoneNumber: data.phoneNumber,
        contactEmail: data.contactEmail,
        verificationStatus: data.verificationStatus,
        confidence_score: data.confidence_score,
        match_type: data.match_type,
        notes: data.notes,
        grounding_sources: data.grounding_sources,
        processedAt: new Date().toISOString(),
      };

      setRecords((prev) => prev.map((r) => (r.id === company.id ? updatedRecord : r)));
      if (selectedCompanyModal && selectedCompanyModal.id === company.id) {
        setSelectedCompanyModal(updatedRecord);
      }
    } catch (err: any) {
      console.error(`Re-enrich failed for ${company.companyName}:`, err);
      setRecords((prev) =>
        prev.map((r) =>
          r.id === company.id
            ? { ...r, status: 'FAILED', notes: `Error: ${err.message}` }
            : r
        )
      );
    } finally {
      setIsReEnrichingSingle(false);
    }
  };

  // Run Batch Enrichment (Tier 2 full research) or Light Sweep (Tier 1 fast match),
  // sharing the same pacing/429-pause/cancellation infrastructure.
  const runBatchEnrichment = async (tier: 'STAGED' | 'FINAL' = 'FINAL') => {
    if (isRunningBatch) return;

    setRateLimitNotice(null);

    const mode: 'LIGHT_SWEEP' | 'FULL_ENRICHMENT' = tier === 'STAGED' ? 'LIGHT_SWEEP' : 'FULL_ENRICHMENT';
    const sourceList = tier === 'STAGED' ? stagedLeads : records;
    const pendingRecords = sourceList.filter((r) => r.status === 'PENDING');
    if (pendingRecords.length === 0) return;

    const sweepBatchLimit = mode === 'LIGHT_SWEEP' ? Math.min(pendingRecords.length, 50) : batchSize;
    const itemsToProcess = pendingRecords.slice(0, sweepBatchLimit);
    setIsRunningBatch(true);
    stopBatchRef.current = false;

    // Apex domains already present in Tier 2, seeded before the run so a Light Sweep
    // catches shared-domain matches against earlier sweep runs, not just this one.
    const seenApexDomains = new Set<string>(
      records.filter((r) => r.apexDomain).map((r) => r.apexDomain as string)
    );

    for (let i = 0; i < itemsToProcess.length; i++) {
      if (stopBatchRef.current) break;

      const targetItem = itemsToProcess[i];
      setCurrentActiveCompany(targetItem);

      const applyToSourceTier = (updater: (prev: CompanyRecord[]) => CompanyRecord[]) => {
        if (tier === 'STAGED') setStagedLeads(updater);
        else setRecords(updater);
      };

      // Mark row as processing in UI
      applyToSourceTier((prev) =>
        prev.map((r) => (r.id === targetItem.id ? { ...r, status: 'PROCESSING' } : r))
      );

      const controller = new AbortController();
      activeAbortControllerRef.current = controller;

      const timeoutId = setTimeout(() => {
        controller.abort('TIMEOUT');
      }, 22000);

      try {
        const res = await apiFetch('/api/enrich-single', {
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify({
            id: targetItem.id,
            companyName: targetItem.companyName,
            county: targetItem.county,
            companyNumber: targetItem.companyNumber,
            eircode: targetItem.eircode,
            rawRowData: targetItem.rawRowData,
            modelName: selectedModel,
            forceRefresh: !useCache,
            mode,
          }),
        });

        clearTimeout(timeoutId);
        activeAbortControllerRef.current = null;

        if (res.status === 429) {
          setRateLimitNotice('Gemini API rate limit reached. Pausing batch to let quota refresh. You can click "Run Batch Enrichment" again in a few seconds.');
          applyToSourceTier((prev) =>
            prev.map((r) => (r.id === targetItem.id ? { ...r, status: 'PENDING' } : r))
          );
          break;
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          if (errData.error?.includes('rate limit') || errData.error?.includes('quota')) {
            setRateLimitNotice('Gemini API rate limit reached. Pausing batch to let quota refresh.');
            applyToSourceTier((prev) =>
              prev.map((r) => (r.id === targetItem.id ? { ...r, status: 'PENDING' } : r))
            );
            break;
          }
          throw new Error(errData.error || `API error ${res.status}`);
        }

        const data = await res.json();

        if (tier === 'STAGED') {
          const isTradingOrMatched = data.tradingStatus === 'TRADING' || Boolean(data.official_website_url);

          if (isTradingOrMatched) {
            const apexDomain: string | null = data.apexDomain || null;
            const isSharedDomain = apexDomain !== null && seenApexDomains.has(apexDomain);
            if (apexDomain) seenApexDomains.add(apexDomain);

            const promotedRecord: CompanyRecord = {
              ...targetItem,
              status: 'SUCCESS',
              official_website_url: data.official_website_url || null,
              tradingStatus: data.tradingStatus || 'TRADING',
              category: data.category || null,
              phoneNumber: data.phoneNumber || null,
              apexDomain,
              confidence_score: data.official_website_url ? 'HIGH' : 'MEDIUM',
              match_type: isSharedDomain ? 'SHARED_DOMAIN' : 'LIGHT_SWEEP_COMPLETE',
              notes: data.notes || (data.official_website_url ? 'Verified trading with official website via Light Sweep.' : 'Confirmed active trading business; website pending Tier 2 full enrichment.'),
              processedAt: new Date().toISOString(),
            };
            handlePromoteAndEnrichStagedLeads([promotedRecord], false);
          } else {
            setStagedLeads((prev) =>
              prev.map((r) =>
                r.id === targetItem.id
                  ? {
                      ...r,
                      status: 'SUCCESS',
                      tradingStatus: data.tradingStatus || 'NOT_FOUND',
                      category: data.category || null,
                      phoneNumber: data.phoneNumber || null,
                      match_type: 'DISQUALIFIED',
                      notes: data.notes || 'Light Sweep found no evidence of active trading.',
                      processedAt: new Date().toISOString(),
                    }
                  : r
              )
            );
          }
        } else {
          setRecords((prev) =>
            prev.map((r) => {
              if (r.id === targetItem.id) {
                return {
                  ...r,
                  status: 'SUCCESS',
                  official_website_url: data.official_website_url,
                  apexDomain: data.apexDomain,
                  industry: data.industry,
                  companySummary: data.companySummary,
                  decisionMakerName: data.decisionMakerName,
                  decisionMakerRole: data.decisionMakerRole,
                  linkedinUrl: data.linkedinUrl,
                  linkedinType: data.linkedinType,
                  phoneNumber: data.phoneNumber,
                  contactEmail: data.contactEmail,
                  verificationStatus: data.verificationStatus,
                  confidence_score: data.confidence_score,
                  match_type: data.match_type,
                  notes: data.notes,
                  grounding_sources: data.grounding_sources,
                  processedAt: new Date().toISOString(),
                };
              }
              return r;
            })
          );
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        activeAbortControllerRef.current = null;

        if (err.name === 'AbortError' || err === 'TIMEOUT') {
          if (stopBatchRef.current) {
            applyToSourceTier((prev) =>
              prev.map((r) => (r.id === targetItem.id ? { ...r, status: 'PENDING' } : r))
            );
            break;
          } else {
            console.warn(`Enrichment request timed out for ${targetItem.companyName}`);
            applyToSourceTier((prev) =>
              prev.map((r) =>
                r.id === targetItem.id
                  ? {
                      ...r,
                      status: 'FAILED',
                      official_website_url: null,
                      confidence_score: 'LOW',
                      match_type: tier === 'STAGED' ? 'DISQUALIFIED' : 'NOT_FOUND',
                      notes: 'Enrichment request timed out after 22 seconds.',
                    }
                  : r
              )
            );
            continue;
          }
        }

        console.error(`Error enriching ${targetItem.companyName}:`, err);
        applyToSourceTier((prev) =>
          prev.map((r) =>
            r.id === targetItem.id
              ? {
                  ...r,
                  status: 'FAILED',
                  official_website_url: null,
                  confidence_score: 'LOW',
                  match_type: tier === 'STAGED' ? 'DISQUALIFIED' : 'NOT_FOUND',
                  notes: `Enrichment error: ${err.message}`,
                }
              : r
          )
        );
      }

      if (i < itemsToProcess.length - 1 && !stopBatchRef.current) {
        await new Promise((resolve) => setTimeout(resolve, requestDelay * 1000));
      }
    }

    setIsRunningBatch(false);
    setCurrentActiveCompany(null);
  };

  const handleStopBatch = () => {
    stopBatchRef.current = true;
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    setIsRunningBatch(false);
    setCurrentActiveCompany(null);
  };

  return (
    <div className="min-h-screen bg-void text-ash font-body antialiased selection:bg-ember selection:text-void">
      {/* Header */}
      <Header
        hasApiKey={hasApiKey}
        totalRecords={stats.total}
        processedRecords={stats.processed}
        user={user}
        isLoggingIn={isLoggingIn}
        lastSavedAt={lastSavedAt}
        onGoogleSignIn={handleGoogleSignIn}
        onGoogleSignOut={handleGoogleSignOut}
        onReset={handleResetSession}
        onLoadSample={handleLoadSampleData}
      />

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* KPI Summary Header Stats */}
        <StatsCards stats={stats} />

        {/* Gemini Intelligence Suite Toolbar */}
        <div className="bg-char border border-char-light rounded-2xl p-4 text-ash flex flex-col md:flex-row items-center justify-between gap-4 font-body">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-void/60 border border-char-light rounded-xl">
              <Sparkles className="w-5 h-5 text-gold" />
            </div>
            <div>
              <h3 className="font-display text-sm font-semibold text-ash flex items-center gap-2">
                Gemini Intelligence & Grounding Suite
              </h3>
              <p className="text-xs text-smoke">
                Voice Assistant &bull; Google Maps Geographic Search &bull; AI Lead Strategy & Outreach
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => setIsVoiceModalOpen(true)}
              className="inline-flex items-center px-3.5 py-2 text-xs font-semibold rounded-full bg-void/60 hover:bg-void border border-char-light text-ash transition-all cursor-pointer gap-1.5"
            >
              <Mic className="w-4 h-4 text-gold" />
              Voice Assistant
            </button>

            <button
              onClick={() => setIsAiModalOpen(true)}
              className="inline-flex items-center px-3.5 py-2 text-xs font-semibold rounded-full bg-void/60 hover:bg-void border border-char-light text-ash transition-all cursor-pointer gap-1.5"
            >
              <Brain className="w-4 h-4 text-gold" />
              Lead Strategy & Scoring
            </button>

            <button
              onClick={() => setIsMapsModalOpen(true)}
              className="inline-flex items-center px-3.5 py-2 text-xs font-semibold rounded-full bg-gradient-to-r from-ember to-gold text-void transition-all cursor-pointer gap-1.5"
            >
              <MapPin className="w-4 h-4" />
              Google Maps Search
            </button>
          </div>
        </div>

        {/* Import & Data Source Setup */}
        <FileUpload
          onRecordsUploaded={handleRecordsUploaded}
          onLoadSampleData={handleLoadSampleData}
          currentCount={records.length}
          user={user}
          accessToken={accessToken}
          onGoogleSignIn={handleGoogleSignIn}
        />

        {/* Automated Upload Check: Duplicate Companies Banner */}
        {!isDuplicateBannerDismissed && duplicateAnalysis.hasDuplicates && (
          <DuplicateBanner
            analysis={duplicateAnalysis}
            onAutoClean={handleAutoDeduplicate}
            onReviewDuplicates={() => setIsDuplicateModalOpen(true)}
            onDismiss={() => setIsDuplicateBannerDismissed(true)}
          />
        )}

        {/* Rate Limit Notice Banner */}
        {rateLimitNotice && (
          <div className="bg-ember/10 border border-ember/30 rounded-xl p-4 flex items-start justify-between text-ash text-xs animate-in fade-in font-body">
            <div className="flex items-center space-x-2.5">
              <AlertTriangle className="w-5 h-5 text-ember shrink-0" />
              <div>
                <span className="font-bold text-ash">Batch Processing Paused</span>
                <p className="text-smoke mt-0.5">{rateLimitNotice}</p>
              </div>
            </div>
            <button
              onClick={() => setRateLimitNotice(null)}
              className="p-1 text-ember hover:text-ash rounded-full hover:bg-ember/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Batch Enrichment Controls */}
        <BatchControls
          batchSize={batchSize}
          onBatchSizeChange={setBatchSize}
          requestDelay={requestDelay}
          onRequestDelayChange={setRequestDelay}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          useCache={useCache}
          onToggleCache={setUseCache}
          onRunBatch={() => runBatchEnrichment('FINAL')}
          onStopBatch={handleStopBatch}
          isRunning={isRunningBatch}
          totalPending={stats.remaining + stagedLeads.length}
          totalProcessed={stats.processed}
          totalRecords={stats.total + stagedLeads.length}
          currentActiveRowName={currentActiveCompany?.companyName}
          processedInCurrentSession={stats.processed}
        />

        {/* Tier 1 vs Tier 2 Dataset Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-char-light pb-2 font-body">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setActiveTab('FINAL_TABLE')}
              className={`px-4 py-2.5 rounded-full font-bold text-xs inline-flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'FINAL_TABLE'
                  ? 'bg-gradient-to-r from-ember to-gold text-void'
                  : 'bg-char text-smoke hover:text-ash border border-char-light'
              }`}
            >
              <Building2 className="w-4 h-4" />
              Tier 2: Final Enriched Data Table ({records.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('STAGING_VAULT')}
              className={`px-4 py-2.5 rounded-full font-bold text-xs inline-flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'STAGING_VAULT'
                  ? 'bg-gradient-to-r from-ember to-gold text-void'
                  : 'bg-char text-smoke hover:text-ash border border-char-light'
              }`}
            >
              <Database className="w-4 h-4" />
              Tier 1: Staged Raw Leads Vault ({stagedLeads.length})
            </button>
          </div>

          {stagedLeads.length > 0 && activeTab === 'FINAL_TABLE' && (
            <button
              type="button"
              onClick={() => handlePromoteAndEnrichStagedLeads(stagedLeads)}
              className="px-3 py-1.5 bg-void/60 hover:bg-void border border-char-light text-gold rounded-full text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              Bring Through {stagedLeads.length} Staged Leads to Table
            </button>
          )}
        </div>

        {/* Active Tab View Rendering */}
        {activeTab === 'STAGING_VAULT' ? (
          <StagedLeadsVault
            stagedLeads={stagedLeads}
            onPromoteAndEnrich={handlePromoteAndEnrichStagedLeads}
            onDeleteStagedLeads={handleDeleteStagedLeads}
            onClearStagingVault={handleClearStagingVault}
            onResetDisqualifiedStagedLeads={handleResetDisqualifiedStagedLeads}
            onRunLightSweep={() => runBatchEnrichment('STAGED')}
            onStopLightSweep={handleStopBatch}
            isRunningSweep={isRunningBatch}
            currentActiveRowName={currentActiveCompany?.companyName}
          />
        ) : (
          <ResultsTable
            records={records}
            onSelectCompany={(company) => setSelectedCompanyModal(company)}
            onReEnrichSingle={handleReEnrichSingle}
            onDeleteRecords={handleDeleteRecords}
            onResetRecordStatus={handleResetRecordStatus}
            onEditRecord={handleEditRecord}
            onOpenColumnMapping={() => setIsTableMappingOpen(true)}
            isProcessingBatch={isRunningBatch}
            user={user}
            accessToken={accessToken}
            onGoogleSignIn={handleGoogleSignIn}
          />
        )}
      </main>

      {/* Detail Modal */}
      <CompanyDetailModal
        company={selectedCompanyModal}
        onClose={() => setSelectedCompanyModal(null)}
        onSaveManualUrl={handleSaveManualUrl}
        onReEnrichSingle={handleReEnrichSingle}
        isReEnriching={isReEnrichingSingle}
      />

      {/* Duplicate Review & Cleanup Modal */}
      <DuplicateCleanupModal
        isOpen={isDuplicateModalOpen}
        onClose={() => setIsDuplicateModalOpen(false)}
        duplicateGroups={duplicateAnalysis.duplicateGroups}
        onAutoCleanAll={handleAutoDeduplicate}
        onDeleteRecord={(id) => handleDeleteRecords([id])}
        onKeepRecordInGroup={handleKeepRecordInGroup}
      />

      {/* Dataset Level Column Mapping & Relabeling Modal */}
      <ColumnMappingModal
        isOpen={isTableMappingOpen}
        onClose={() => setIsTableMappingOpen(false)}
        fileName="Active Master Dataset"
        headers={['Company Name', 'CRO Reg Number', 'County', 'Decision Maker Name', 'Decision Maker Role']}
        rows={records.map((r) => ({
          'Company Name': r.companyName,
          'CRO Reg Number': r.companyNumber,
          'County': r.county,
          'Decision Maker Name': cleanNullableField(r.decisionMakerName) || '',
          'Decision Maker Role': cleanNullableField(r.decisionMakerRole) || '',
          __recordId: r.id,
        }))}
        onConfirmImport={(newRecords) => {
          // This modal only maps 5 fields (name/CRO/county/decision maker);
          // merge the relabeled values back onto the existing Tier 2 records
          // instead of replacing state wholesale, so enrichment fields it
          // doesn't know about (website, industry, phone, email, etc.)
          // aren't wiped out.
          setRecords((prev) => mergeRelabeledRecords(prev, newRecords));
          setIsTableMappingOpen(false);
        }}
      />

      {/* Voice Assistant Modal */}
      <VoiceAssistantModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        recordCount={records.length}
        statsText={`${stats.processed} enriched, ${stats.officialFound} official websites, ${stats.facebookFallback} Facebook fallbacks`}
      />

      {/* Gemini B2B Lead Intelligence & Strategy Modal */}
      <AiIntelligenceModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        records={records}
      />

      {/* Google Maps Grounding Modal */}
      <GoogleMapsGroundingModal
        isOpen={isMapsModalOpen}
        onClose={() => setIsMapsModalOpen(false)}
        onAddCompaniesToDataset={(newCompanies) => {
          setRecords((prev) => [
            ...newCompanies.map((nc) => ({
              id: nc.id || `map-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              companyName: nc.companyName || 'Discovered Business',
              companyNumber: '',
              county: nc.county || 'Dublin',
              official_website_url: nc.official_website_url || null,
              confidence_score: (nc.confidence_score as any) || 'MEDIUM',
              match_type: (nc.match_type as any) || 'OFFICIAL_WEBSITE',
              status: 'PENDING' as const,
              notes: nc.notes || 'Added from Google Maps Grounding search.',
              grounding_sources: [],
            })),
            ...prev,
          ]);
        }}
      />
    </div>
  );
}

