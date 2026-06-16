import dotenv from 'dotenv';
import { adminAuth, firestore, FieldValue } from '../firebase.js';
import { DEFAULT_THEME } from '../firebase-store.js';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const DELETE_OLD_DOCS = String(process.env.FIRESTORE_MIGRATE_DELETE_OLD_DOCS || '').trim().toLowerCase();
const SHOULD_DELETE_OLD_DOCS = ['1', 'true', 'yes', 'y'].includes(DELETE_OLD_DOCS);

function cafesCollection() {
  return firestore.collection('cafes');
}

function usersCollection() {
  return firestore.collection('users');
}

function cafeRef(cafeId) {
  return cafesCollection().doc(String(cafeId));
}

function userRef(uid) {
  return usersCollection().doc(String(uid));
}

function memberRef(cafeId, uid) {
  return cafeRef(cafeId).collection('members').doc(String(uid));
}

function themeRef(cafeId) {
  return cafeRef(cafeId).collection('settings').doc('theme');
}

function oldCounterRef(cafeId) {
  return cafeRef(cafeId).collection('meta').doc('counter_order');
}

function newCounterRef(cafeId) {
  return cafeRef(cafeId).collection('counters').doc('order');
}

async function migrateCafe(cafeDoc) {
  const cafeId = cafeDoc.id;
  const cafeData = cafeDoc.data() || {};
  const themeSnapshot = await themeRef(cafeId).get();
  const oldCounterSnapshot = await oldCounterRef(cafeId).get();
  const newCounterSnapshot = await newCounterRef(cafeId).get();
  const ownerEmail = String(cafeData.email || '').trim().toLowerCase();
  const ownerName = String(cafeData.name || 'Our Cafe').trim() || 'Our Cafe';

  const rootUpdates = {
    owner_uid: String(cafeData.owner_uid || cafeId),
    brandColor: cafeData.brandColor || themeSnapshot.data()?.brandColor || DEFAULT_THEME.brandColor,
    bgColor: cafeData.bgColor || themeSnapshot.data()?.bgColor || DEFAULT_THEME.bgColor,
    surfaceColor: cafeData.surfaceColor || themeSnapshot.data()?.surfaceColor || DEFAULT_THEME.surfaceColor,
    textColor: cafeData.textColor || themeSnapshot.data()?.textColor || DEFAULT_THEME.textColor,
    fontFamily: cafeData.fontFamily || themeSnapshot.data()?.fontFamily || DEFAULT_THEME.fontFamily,
    logoUrl: cafeData.logoUrl || themeSnapshot.data()?.logoUrl || DEFAULT_THEME.logoUrl,
    updated_at: FieldValue.serverTimestamp(),
  };

  if (!cafeData.created_at) {
    rootUpdates.created_at = FieldValue.serverTimestamp();
  }

  await cafeRef(cafeId).set(rootUpdates, { merge: true });

  if (!newCounterSnapshot.exists && oldCounterSnapshot.exists) {
    const oldCounterValue = Number(oldCounterSnapshot.data()?.value || 0);
    await newCounterRef(cafeId).set({
      value: oldCounterValue,
      updated_at: FieldValue.serverTimestamp(),
    });
  } else if (!newCounterSnapshot.exists) {
    await newCounterRef(cafeId).set({
      value: 0,
      updated_at: FieldValue.serverTimestamp(),
    });
  }

  const userSnapshot = await userRef(cafeId).get();
  if (!userSnapshot.exists) {
    await userRef(cafeId).set({
      email: ownerEmail,
      display_name: ownerName,
      status: 'active',
      default_cafe_id: String(cafeId),
      created_by: String(cafeId),
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
  } else {
    await userRef(cafeId).set({
      email: ownerEmail || userSnapshot.data()?.email || '',
      display_name: ownerName || userSnapshot.data()?.display_name || 'Our Cafe',
      status: 'active',
      default_cafe_id: String(cafeId),
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  await memberRef(cafeId, cafeId).set({
    uid: String(cafeId),
    email: ownerEmail,
    display_name: ownerName,
    role: 'owner',
    status: 'active',
    invited_by: null,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });

  if (SHOULD_DELETE_OLD_DOCS) {
    await Promise.allSettled([
      themeSnapshot.exists ? themeRef(cafeId).delete() : Promise.resolve(),
      oldCounterSnapshot.exists ? oldCounterRef(cafeId).delete() : Promise.resolve(),
    ]);
  }

  return {
    cafeId,
    migratedTheme: themeSnapshot.exists,
    migratedCounter: oldCounterSnapshot.exists,
  };
}

async function main() {
  const cafesSnapshot = await cafesCollection().get();
  let migrated = 0;
  let skipped = 0;

  for (const cafeDoc of cafesSnapshot.docs) {
    try {
      await migrateCafe(cafeDoc);
      migrated += 1;
      console.log(`Migrated cafe ${cafeDoc.id}`);
    } catch (error) {
      skipped += 1;
      console.error(`Failed to migrate cafe ${cafeDoc.id}:`, error.message);
    }
  }

  console.log('Firestore schema migration complete.');
  console.log(`Total cafes processed: ${cafesSnapshot.size}`);
  console.log(`Migrated: ${migrated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Deleted old docs: ${SHOULD_DELETE_OLD_DOCS ? 'yes' : 'no'}`);
}

main().catch((error) => {
  console.error('Firestore schema migration failed:', error.message);
  process.exitCode = 1;
});
