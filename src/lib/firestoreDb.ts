import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDocFromServer,
  setDoc,
  collection,
  getDocs,
  deleteDoc
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
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

export async function saveUserRecordsToFirestore(userId: string, records: CompanyRecord[]) {
  const path = `users/${userId}/companies`;
  try {
    const promises = records.map((record) => {
      const ref = doc(db, 'users', userId, 'companies', record.id);
      return setDoc(ref, {
        ...record,
        userId,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    });
    await Promise.all(promises);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function getUserRecordsFromFirestore(userId: string): Promise<CompanyRecord[]> {
  const path = `users/${userId}/companies`;
  try {
    const colRef = collection(db, 'users', userId, 'companies');
    const snapshot = await getDocs(colRef);
    const records: CompanyRecord[] = [];
    snapshot.forEach((docSnap) => {
      records.push(docSnap.data() as CompanyRecord);
    });
    return records;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

export async function deleteUserRecordFromFirestore(userId: string, companyId: string) {
  const path = `users/${userId}/companies/${companyId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'companies', companyId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function deleteUserRecordsFromFirestore(userId: string, companyIds: string[]) {
  if (!companyIds || companyIds.length === 0) return;
  const path = `users/${userId}/companies`;
  try {
    const promises = companyIds.map((id) => deleteDoc(doc(db, 'users', userId, 'companies', id)));
    await Promise.all(promises);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function clearAllUserRecordsFromFirestore(userId: string) {
  const path = `users/${userId}/companies`;
  try {
    const colRef = collection(db, 'users', userId, 'companies');
    const snapshot = await getDocs(colRef);
    const promises: Promise<void>[] = [];
    snapshot.forEach((docSnap) => {
      promises.push(deleteDoc(docSnap.ref));
    });
    await Promise.all(promises);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// Staged Leads Vault Operations
export async function saveStagedLeadsToFirestore(userId: string, stagedLeads: CompanyRecord[]) {
  const path = `users/${userId}/staged_leads`;
  try {
    const promises = stagedLeads.map((record) => {
      const ref = doc(db, 'users', userId, 'staged_leads', record.id);
      return setDoc(ref, {
        ...record,
        userId,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    });
    await Promise.all(promises);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function getStagedLeadsFromFirestore(userId: string): Promise<CompanyRecord[]> {
  const path = `users/${userId}/staged_leads`;
  try {
    const colRef = collection(db, 'users', userId, 'staged_leads');
    const snapshot = await getDocs(colRef);
    const records: CompanyRecord[] = [];
    snapshot.forEach((docSnap) => {
      records.push(docSnap.data() as CompanyRecord);
    });
    return records;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

export async function deleteStagedLeadsFromFirestore(userId: string, leadIds: string[]) {
  if (!leadIds || leadIds.length === 0) return;
  const path = `users/${userId}/staged_leads`;
  try {
    const promises = leadIds.map((id) => deleteDoc(doc(db, 'users', userId, 'staged_leads', id)));
    await Promise.all(promises);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function clearAllStagedLeadsFromFirestore(userId: string) {
  const path = `users/${userId}/staged_leads`;
  try {
    const colRef = collection(db, 'users', userId, 'staged_leads');
    const snapshot = await getDocs(colRef);
    const promises: Promise<void>[] = [];
    snapshot.forEach((docSnap) => {
      promises.push(deleteDoc(docSnap.ref));
    });
    await Promise.all(promises);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

