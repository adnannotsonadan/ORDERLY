import fs from 'fs';
import path from 'path';
import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const MISSING_ADMIN_CONFIG_ERROR =
  'Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_SERVICE_ACCOUNT_PATH, or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY.';

function parseServiceAccountJson() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawJson) {
    try {
      return JSON.parse(rawJson);
    } catch {
      return null;
    }
  }

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!serviceAccountPath) return null;

  try {
    const resolved = path.resolve(serviceAccountPath);
    const fileContents = fs.readFileSync(resolved, 'utf8');
    return JSON.parse(fileContents);
  } catch {
    return null;
  }
}

function buildCredential() {
  const serviceAccount = parseServiceAccountJson();
  if (serviceAccount) {
    return cert({
      ...serviceAccount,
      privateKey: serviceAccount.private_key?.replace(/\\n/g, '\n'),
    });
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    return cert({
      projectId,
      clientEmail,
      privateKey,
    });
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return applicationDefault();
  }

  return null;
}

function createUnavailableAdminAuth() {
  const missingConfigError = () => {
    throw new Error(MISSING_ADMIN_CONFIG_ERROR);
  };

  return {
    createSessionCookie: async () => missingConfigError(),
    verifySessionCookie: async () => missingConfigError(),
    verifyIdToken: async () => missingConfigError(),
    getUserByEmail: async () => missingConfigError(),
    createUser: async () => missingConfigError(),
    updateUser: async () => missingConfigError(),
  };
}

function createUnavailableFirestore() {
  const missingConfigError = () => {
    throw new Error(MISSING_ADMIN_CONFIG_ERROR);
  };

  return {
    collection: () => missingConfigError(),
    batch: () => missingConfigError(),
    runTransaction: () => missingConfigError(),
  };
}

export function hasFirebaseAdminConfig() {
  const serviceAccount = parseServiceAccountJson();
  if (serviceAccount) return true;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (projectId && clientEmail && privateKey) return true;

  return Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

const credential = buildCredential();
const adminApp = credential
  ? (getApps()[0] || initializeApp({
      credential,
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined,
    }))
  : null;

export const adminAuth = adminApp ? getAuth(adminApp) : createUnavailableAdminAuth();
export const firestore = adminApp ? getFirestore(adminApp) : createUnavailableFirestore();

if (adminApp) {
  firestore.settings({ ignoreUndefinedProperties: true });
}

export const firebasePublicConfig = {
  apiKey: process.env.FIREBASE_API_KEY || '',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.FIREBASE_PUBLIC_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '',
  appId: process.env.FIREBASE_APP_ID || '',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
};

export function hasFirebasePublicConfig() {
  return Boolean(
    firebasePublicConfig.apiKey &&
    firebasePublicConfig.authDomain &&
    firebasePublicConfig.projectId &&
    firebasePublicConfig.appId
  );
}

export { FieldValue, Timestamp };
