import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDocFromServer,
  setDoc,
  collection,
  getDocs,
  deleteDoc,
  writeBatch,
  WriteBatch
} from 'firebase/firestore';
import { auth } from './firebaseAuth';
import firebaseConfig from '../../firebase-applet-config.json';
import { CompanyRecord } from '../types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.warn(`[Firestore Safe Fallback] ${operationType} on ${path}:`, errInfo.error);
}

/**
 * Exponential backoff retry wrapper for transient network/quota errors.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 2, initialDelayMs = 300): Promise<T> {
  let attempt = 0;
  let delay = initialDelayMs;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      if (attempt > retries) {
        throw err;
      }
      await new Promise((res) => setTimeout(res, delay));
      delay *= 2;
    }
  }
}

/**
 * Helper to execute chunked writeBatch calls (max 450 ops per batch)
 */
async function commitChunkedBatch<T>(
  items: T[],
  addOpToBatch: (batch: WriteBatch, item: T) => void
): Promise<void> {
  if (!items || items.length === 0) return;
  const CHUNK_SIZE = 450;
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((item) => addOpToBatch(batch, item));
    await withRetry(() => batch.commit());
  }
}

export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore offline or connection pending.');
    }
  }
}

export async function saveUserRecordsToFirestore(userId: string, records: CompanyRecord[]) {
  if (!userId || !records) return;
  const path = `users/${userId}/companies`;
  try {
    const now = new Date().toISOString();
    await commitChunkedBatch(records, (batch, record) => {
      const ref = doc(db, 'users', userId, 'companies', record.id);
      batch.set(ref, {
        ...record,
        userId,
        updatedAt: now,
      }, { merge: true });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function getUserRecordsFromFirestore(userId: string): Promise<CompanyRecord[]> {
  if (!userId) return [];
  const path = `users/${userId}/companies`;
  try {
    return await withRetry(async () => {
      const colRef = collection(db, 'users', userId, 'companies');
      const snapshot = await getDocs(colRef);
      const records: CompanyRecord[] = [];
      snapshot.forEach((docSnap) => {
        records.push(docSnap.data() as CompanyRecord);
      });
      return records;
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

export async function deleteUserRecordFromFirestore(userId: string, companyId: string) {
  if (!userId || !companyId) return;
  const path = `users/${userId}/companies/${companyId}`;
  try {
    await withRetry(() => deleteDoc(doc(db, 'users', userId, 'companies', companyId)));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function deleteUserRecordsFromFirestore(userId: string, companyIds: string[]) {
  if (!userId || !companyIds || companyIds.length === 0) return;
  const path = `users/${userId}/companies`;
  try {
    await commitChunkedBatch(companyIds, (batch, id) => {
      const ref = doc(db, 'users', userId, 'companies', id);
      batch.delete(ref);
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function clearAllUserRecordsFromFirestore(userId: string) {
  if (!userId) return;
  const path = `users/${userId}/companies`;
  try {
    const colRef = collection(db, 'users', userId, 'companies');
    const snapshot = await getDocs(colRef);
    const docIds: string[] = [];
    snapshot.forEach((docSnap) => docIds.push(docSnap.id));
    await deleteUserRecordsFromFirestore(userId, docIds);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// Staged Leads Vault Operations
export async function saveStagedLeadsToFirestore(userId: string, stagedLeads: CompanyRecord[]) {
  if (!userId || !stagedLeads) return;
  const path = `users/${userId}/staged_leads`;
  try {
    const now = new Date().toISOString();
    await commitChunkedBatch(stagedLeads, (batch, record) => {
      const ref = doc(db, 'users', userId, 'staged_leads', record.id);
      batch.set(ref, {
        ...record,
        userId,
        updatedAt: now,
      }, { merge: true });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function getStagedLeadsFromFirestore(userId: string): Promise<CompanyRecord[]> {
  if (!userId) return [];
  const path = `users/${userId}/staged_leads`;
  try {
    return await withRetry(async () => {
      const colRef = collection(db, 'users', userId, 'staged_leads');
      const snapshot = await getDocs(colRef);
      const records: CompanyRecord[] = [];
      snapshot.forEach((docSnap) => {
        records.push(docSnap.data() as CompanyRecord);
      });
      return records;
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

export async function deleteStagedLeadsFromFirestore(userId: string, leadIds: string[]) {
  if (!userId || !leadIds || leadIds.length === 0) return;
  const path = `users/${userId}/staged_leads`;
  try {
    await commitChunkedBatch(leadIds, (batch, id) => {
      const ref = doc(db, 'users', userId, 'staged_leads', id);
      batch.delete(ref);
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function clearAllStagedLeadsFromFirestore(userId: string) {
  if (!userId) return;
  const path = `users/${userId}/staged_leads`;
  try {
    const colRef = collection(db, 'users', userId, 'staged_leads');
    const snapshot = await getDocs(colRef);
    const docIds: string[] = [];
    snapshot.forEach((docSnap) => docIds.push(docSnap.id));
    await deleteStagedLeadsFromFirestore(userId, docIds);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}
