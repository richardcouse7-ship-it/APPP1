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

  // Tombstone list of deleted record IDs to prevent resurrection on refresh / Firestore sync
  const [deletedRecordIds, setDeletedRecordIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(DELETED_IDS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return new Set(parsed);
      }
    } catch (e) {
      console.error('Failed to load deleted record IDs', e);
    }
    return new Set();
  });

  // Load Tier 1 Staged Leads Vault from localStorage
  const [stagedLeads, setStagedLeads] = useState<CompanyRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STAGED_VAULT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
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

  // Load saved batch settings from localStorage
  const [batchSize, setBatchSize] = useState<number>(() => {
    try {
      const savedSettings = localStorage.getItem(SETTINGS_KEY);
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        if (typeof parsed.batchSize === 'number' && parsed.batchSize >= 1 && parsed.batchSize <= 50) {
          return parsed.batchSize;
        }
      }
    } catch (e) {
      console.error('Failed to load batchSize setting from localStorage', e);
    }
    return 10;
  });

  const [requestDelay, setRequestDelay] = useState<number>(() => {
    try {
      const savedSettings = localStorage.getItem(SETTINGS_KEY);
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        if (typeof parsed.requestDelay === 'number' && parsed.requestDelay >= 0.1 && parsed.requestDelay <= 10) {
          return parsed.requestDelay;
        }
      }
    } catch (e) {
      console.error('Failed to load requestDelay setting from localStorage', e);
    }
    return 1.2;
  });

  // AI Model Engine & Cost Optimization Settings
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.6-flash');
  const [useCache, setUseCache] = useState<boolean>(true);

  const [isRunningBatch, setIsRunningBatch] = useState<boolean>(false);
  const [currentActiveCompany, setCurrentActiveCompany] = useState<CompanyRecord | null>(null);
  const [selectedCompanyModal, setSelectedCompanyModal] = useState<CompanyRecord | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);
  const [isReEnrichingSingle, setIsReEnrichingSingle] = useState<boolean>(false);
  const [rateLimitNotice, setRateLimitNotice] = useState<string | null>(null);
  const stopBatchRef = useRef<boolean>(false);

  // Google Workspace Auth State
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  useEffect(() => {
    // Test connection mandate
    testFirestoreConnection();

    const unsubscribe = initAuth(
      async (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);

        // Load saved datasets from Firestore when user logs in
        if (currentUser) {
          try {
            const firestoreRecords = await getUserRecordsFromFirestore(currentUser.uid);
            if (firestoreRecords && firestoreRecords.length > 0) {
              // Filter out tombstoned deleted IDs
              const validRecords = firestoreRecords.filter((r) => !deletedRecordIds.has(r.id));
              setRecords(validRecords);
            }
            const firestoreStaged = await getStagedLeadsFromFirestore(currentUser.uid);
            if (firestoreStaged && firestoreStaged.length > 0) {
              setStagedLeads(firestoreStaged);
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

        // Sync Firestore records upon sign in
        try {
          const firestoreRecords = await getUserRecordsFromFirestore(result.user.uid);
          if (firestoreRecords && firestoreRecords.length > 0) {
            const validRecords = firestoreRecords.filter((r) => !deletedRecordIds.has(r.id));
            setRecords(validRecords);
          } else if (records.length > 0) {
            await saveUserRecordsToFirestore(result.user.uid, records);
          }
          const firestoreStaged = await getStagedLeadsFromFirestore(result.user.uid);
          if (firestoreStaged && firestoreStaged.length > 0) {
            setStagedLeads(firestoreStaged);
          } else if (stagedLeads.length > 0) {
            await saveStagedLeadsToFirestore(result.user.uid, stagedLeads);
          }
        } catch (e) {
          console.warn('Error syncing Firestore on sign-in:', e);
        }
      }
    } catch (err: any) {
      console.error('Google Sign-In failed:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await logoutUser();
    setUser(null);
    setAccessToken(null);
  };

  // Auto-save records and staged leads to localStorage and Firestore
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      localStorage.setItem(STAGED_VAULT_KEY, JSON.stringify(stagedLeads));
      localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(Array.from(deletedRecordIds)));

      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastSavedAt(timeStr);

      if (user) {
        saveUserRecordsToFirestore(user.uid, records).catch((e) =>
          console.warn('Background Firestore sync warning:', e)
        );
        saveStagedLeadsToFirestore(user.uid, stagedLeads).catch((e) =>
          console.warn('Background Firestore staged sync warning:', e)
        );
      }
    } catch (e) {
      console.error('Failed to auto-save records', e);
    }
  }, [records, stagedLeads, deletedRecordIds, user]);

  // Auto-save batch settings (batchSize, requestDelay) to localStorage on every setting change
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ batchSize, requestDelay }));
    } catch (e) {
      console.error('Failed to auto-save batch settings to localStorage', e);
    }
  }, [batchSize, requestDelay]);

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
  const handlePromoteAndEnrichStagedLeads = (leadsToPromote: CompanyRecord[]) => {
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
    setActiveTab('FINAL_TABLE');

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

  // Auto clean deduplicate handler
  const handleAutoDeduplicate = () => {
    const { cleanedRecords } = deduplicateDataset(records);
    const remainingIds = new Set(cleanedRecords.map((r) => r.id));
    const removedIds = records.filter((r) => !remainingIds.has(r.id)).map((r) => r.id);

    setRecords(cleanedRecords);
    setIsDuplicateBannerDismissed(true);

    if (removedIds.length > 0) {
      setDeletedRecordIds((prev) => {
        const next = new Set([...prev, ...removedIds]);
        localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(Array.from(next)));
        return next;
      });
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
      setDeletedRecordIds((prev) => {
        const next = new Set([...prev, ...removedIds]);
        localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(Array.from(next)));
        return next;
      });
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
      setDeletedRecordIds(new Set(allIds));
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      localStorage.setItem(STAGED_VAULT_KEY, JSON.stringify([]));
      localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(allIds));
      localStorage.removeItem(SETTINGS_KEY);
      setBatchSize(10);
      setRequestDelay(1.2);

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
    const newDeletedIds = new Set([...deletedRecordIds, ...idsToDelete]);
    setDeletedRecordIds(newDeletedIds);
    localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(Array.from(newDeletedIds)));

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
      const res = await fetch('/api/enrich-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  // Run Batch Enrichment process with pacing delay and rate limit resilience
  const runBatchEnrichment = async () => {
    if (isRunningBatch) return;

    setRateLimitNotice(null);

    // If active tab is staging vault or no pending in records, auto-promote staged leads first!
    if (stagedLeads.length > 0 && records.filter((r) => r.status === 'PENDING').length === 0) {
      handlePromoteAndEnrichStagedLeads(stagedLeads);
    }

    // Filter strictly PENDING records (deduplication guarantee)
    const pendingRecords = records.filter((r) => r.status === 'PENDING');
    if (pendingRecords.length === 0) return;

    const itemsToProcess = pendingRecords.slice(0, batchSize);
    setIsRunningBatch(true);
    stopBatchRef.current = false;

    for (let i = 0; i < itemsToProcess.length; i++) {
      if (stopBatchRef.current) break;

      const targetItem = itemsToProcess[i];
      setCurrentActiveCompany(targetItem);

      // Mark row as processing in UI
      setRecords((prev) =>
        prev.map((r) => (r.id === targetItem.id ? { ...r, status: 'PROCESSING' } : r))
      );

      try {
        const res = await fetch('/api/enrich-single', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: targetItem.id,
            companyName: targetItem.companyName,
            county: targetItem.county,
            companyNumber: targetItem.companyNumber,
            modelName: selectedModel,
            forceRefresh: !useCache,
          }),
        });

        if (res.status === 429) {
          setRateLimitNotice('Gemini API rate limit reached. Pausing batch to let quota refresh. You can click "Run Batch Enrichment" again in a few seconds.');
          setRecords((prev) =>
            prev.map((r) => (r.id === targetItem.id ? { ...r, status: 'PENDING' } : r))
          );
          break;
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          if (errData.error?.includes('rate limit') || errData.error?.includes('quota')) {
            setRateLimitNotice('Gemini API rate limit reached. Pausing batch to let quota refresh.');
            setRecords((prev) =>
              prev.map((r) => (r.id === targetItem.id ? { ...r, status: 'PENDING' } : r))
            );
            break;
          }
          throw new Error(errData.error || `API error ${res.status}`);
        }

        const data = await res.json();

        setRecords((prev) =>
          prev.map((r) => {
            if (r.id === targetItem.id) {
              return {
                ...r,
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
            }
            return r;
          })
        );
      } catch (err: any) {
        console.error(`Error enriching ${targetItem.companyName}:`, err);
        setRecords((prev) =>
          prev.map((r) =>
            r.id === targetItem.id
              ? {
                  ...r,
                  status: 'FAILED',
                  official_website_url: null,
                  confidence_score: 'LOW',
                  match_type: 'NOT_FOUND',
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
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 font-sans antialiased selection:bg-emerald-500 selection:text-white">
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
        <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 border border-emerald-800/60 rounded-2xl p-4 shadow-lg text-white flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/20 border border-emerald-400/30 rounded-xl">
              <Sparkles className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Gemini Intelligence & Grounding Suite
              </h3>
              <p className="text-xs text-slate-300">
                Voice Assistant &bull; Google Maps Geographic Search &bull; AI Lead Strategy & Outreach
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => setIsVoiceModalOpen(true)}
              className="inline-flex items-center px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all cursor-pointer gap-1.5"
            >
              <Mic className="w-4 h-4" />
              Voice Assistant
            </button>

            <button
              onClick={() => setIsAiModalOpen(true)}
              className="inline-flex items-center px-3.5 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all cursor-pointer gap-1.5"
            >
              <Brain className="w-4 h-4" />
              Lead Strategy & Scoring
            </button>

            <button
              onClick={() => setIsMapsModalOpen(true)}
              className="inline-flex items-center px-3.5 py-2 text-xs font-semibold rounded-xl bg-teal-700 hover:bg-teal-600 text-white shadow-sm transition-all cursor-pointer gap-1.5"
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
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start justify-between text-amber-900 text-xs shadow-xs animate-in fade-in">
            <div className="flex items-center space-x-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <span className="font-bold text-amber-900">Batch Processing Paused</span>
                <p className="text-amber-800 mt-0.5">{rateLimitNotice}</p>
              </div>
            </div>
            <button
              onClick={() => setRateLimitNotice(null)}
              className="p-1 text-amber-600 hover:text-amber-900 rounded-md hover:bg-amber-100"
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
          onRunBatch={runBatchEnrichment}
          onStopBatch={handleStopBatch}
          isRunning={isRunningBatch}
          totalPending={stats.remaining + stagedLeads.length}
          totalProcessed={stats.processed}
          totalRecords={stats.total + stagedLeads.length}
          currentActiveRowName={currentActiveCompany?.companyName}
          processedInCurrentSession={stats.processed}
        />

        {/* Tier 1 vs Tier 2 Dataset Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setActiveTab('FINAL_TABLE')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs inline-flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'FINAL_TABLE'
                  ? 'bg-emerald-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Building2 className="w-4 h-4 text-emerald-400" />
              Tier 2: Final Enriched Data Table ({records.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('STAGING_VAULT')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs inline-flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'STAGING_VAULT'
                  ? 'bg-amber-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Database className="w-4 h-4 text-amber-400" />
              Tier 1: Staged Raw Leads Vault ({stagedLeads.length})
            </button>
          </div>

          {stagedLeads.length > 0 && activeTab === 'FINAL_TABLE' && (
            <button
              type="button"
              onClick={() => handlePromoteAndEnrichStagedLeads(stagedLeads)}
              className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-900 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <ArrowRight className="w-3.5 h-3.5 text-amber-700" />
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
          'Decision Maker Name': r.decisionMakerName || '',
          'Decision Maker Role': r.decisionMakerRole || '',
        }))}
        onConfirmImport={(newRecords) => {
          setRecords(newRecords);
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

