import fs from 'fs';
import path from 'path';
import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

function parseServiceAccountJson() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawJson) {
    return JSON.parse(rawJson);
  }

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!serviceAccountPath) return null;

  const resolved = path.resolve(serviceAccountPath);
  const fileContents = fs.readFileSync(resolved, 'utf8');
  return JSON.parse(fileContents);
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

  throw new Error(
    'Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_SERVICE_ACCOUNT_PATH, or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY.'
  );
}

const adminApp = getApps()[0] || initializeApp({
  credential: buildCredential(),
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined,
});

export const adminAuth = getAuth(adminApp);
export const firestore = getFirestore(adminApp);
firestore.settings({ ignoreUndefinedProperties: true });

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
