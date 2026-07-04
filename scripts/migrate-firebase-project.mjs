import fs from 'node:fs';
import process from 'node:process';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

const DEFAULT_COLLECTIONS = [
  'users',
  'subscriptions',
  'subscriptions_by_email',
  'payments',
  'paid_orders',
  'sepay_logs',
  'admin_logs',
  'app_settings',
  'system_trending_niches'
];

function env(name, fallback = '') {
  return String(process.env[name] || fallback || '').trim();
}

function parseBool(value, fallback = false) {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return fallback;
  return ['1', 'true', 'yes', 'y', 'on'].includes(v);
}

function readServiceAccount(prefix) {
  const json = env(`${prefix}_FIREBASE_SERVICE_ACCOUNT`) || env(`${prefix}_SERVICE_ACCOUNT`);
  const base64 = env(`${prefix}_FIREBASE_SERVICE_ACCOUNT_BASE64`) || env(`${prefix}_SERVICE_ACCOUNT_BASE64`);
  const file = env(`${prefix}_FIREBASE_SERVICE_ACCOUNT_FILE`) || env(`${prefix}_SERVICE_ACCOUNT_FILE`);

  let raw = json;
  if (!raw && base64) raw = Buffer.from(base64, 'base64').toString('utf8');
  if (!raw && file) raw = fs.readFileSync(file, 'utf8');
  if (!raw) {
    throw new Error(`Thiếu service account cho ${prefix}. Cần đặt ${prefix}_FIREBASE_SERVICE_ACCOUNT hoặc ${prefix}_FIREBASE_SERVICE_ACCOUNT_FILE.`);
  }

  const data = JSON.parse(raw);
  if (data.private_key) data.private_key = data.private_key.replace(/\\n/g, '\n');
  if (!data.project_id || !data.client_email || !data.private_key) {
    throw new Error(`Service account ${prefix} thiếu project_id, client_email hoặc private_key.`);
  }
  return data;
}

function createApp(prefix, appName) {
  const sa = readServiceAccount(prefix);
  const app = admin.initializeApp({ credential: admin.credential.cert(sa) }, appName);
  return { app, projectId: sa.project_id };
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function normalizeProviderData(providerData = []) {
  return providerData
    .filter(Boolean)
    .map(p => ({
      uid: p.uid,
      providerId: p.providerId,
      email: p.email || undefined,
      displayName: p.displayName || undefined,
      photoURL: p.photoURL || undefined,
      phoneNumber: p.phoneNumber || undefined
    }))
    .filter(p => p.uid && p.providerId);
}

async function migrateAuthUsers(srcApp, dstApp, { dryRun }) {
  const srcAuth = admin.auth(srcApp);
  const dstAuth = admin.auth(dstApp);
  let nextPageToken;
  let total = 0;
  let imported = 0;

  do {
    const result = await srcAuth.listUsers(1000, nextPageToken);
    nextPageToken = result.pageToken;
    const users = result.users.map(user => ({
      uid: user.uid,
      email: user.email || undefined,
      emailVerified: Boolean(user.emailVerified),
      displayName: user.displayName || undefined,
      photoURL: user.photoURL || undefined,
      phoneNumber: user.phoneNumber || undefined,
      disabled: Boolean(user.disabled),
      providerData: normalizeProviderData(user.providerData)
    }));

    total += users.length;
    if (dryRun) {
      console.log(`[dry-run] Auth users: sẽ import ${users.length} users trong batch này.`);
      continue;
    }

    for (const part of chunk(users, 1000)) {
      const response = await dstAuth.importUsers(part);
      imported += response.successCount || 0;
      if (response.failureCount) {
        console.warn('Auth import có lỗi:', response.errors.map(e => ({ index: e.index, reason: e.error?.message || e.error })));
      }
    }
  } while (nextPageToken);

  console.log(`Auth users: đã xử lý ${total}, import thành công ${dryRun ? 0 : imported}.`);
}

async function commitBatch(db, writes, dryRun) {
  if (!writes.length) return;
  if (dryRun) return;
  const batch = db.batch();
  for (const { ref, data } of writes) batch.set(ref, data, { merge: true });
  await batch.commit();
}

async function copySubcollections(srcDoc, dstDoc, { dryRun, batchSize }) {
  const subcollections = await srcDoc.ref.listCollections();
  let count = 0;
  for (const sub of subcollections) {
    const snap = await sub.get();
    let writes = [];
    for (const subDoc of snap.docs) {
      const targetRef = dstDoc.collection(sub.id).doc(subDoc.id);
      writes.push({ ref: targetRef, data: subDoc.data() });
      count += 1;
      if (writes.length >= batchSize) {
        await commitBatch(targetRef.firestore, writes, dryRun);
        writes = [];
      }
      count += await copySubcollections(subDoc, targetRef, { dryRun, batchSize });
    }
    if (writes.length) await commitBatch(dstDoc.firestore, writes, dryRun);
  }
  return count;
}

async function copyCollection(srcDb, dstDb, collectionName, { dryRun, batchSize, recursive }) {
  console.log(`Firestore: bắt đầu copy collection ${collectionName}`);
  const snap = await srcDb.collection(collectionName).get();
  let writes = [];
  let docs = 0;
  let subDocs = 0;

  for (const doc of snap.docs) {
    const ref = dstDb.collection(collectionName).doc(doc.id);
    writes.push({ ref, data: doc.data() });
    docs += 1;

    if (writes.length >= batchSize) {
      await commitBatch(dstDb, writes, dryRun);
      writes = [];
    }

    if (recursive) subDocs += await copySubcollections(doc, ref, { dryRun, batchSize });
  }

  if (writes.length) await commitBatch(dstDb, writes, dryRun);
  console.log(`Firestore: ${collectionName} xong ${docs} docs${recursive ? `, ${subDocs} subdocs` : ''}.${dryRun ? ' [dry-run]' : ''}`);
}

async function migrateFirestore(srcApp, dstApp, { dryRun }) {
  const sourceDbId = env('SOURCE_FIRESTORE_DATABASE_ID', env('FIRESTORE_SOURCE_DATABASE_ID', '(default)')) || '(default)';
  const targetDbId = env('TARGET_FIRESTORE_DATABASE_ID', env('DEST_FIRESTORE_DATABASE_ID', '(default)')) || '(default)';
  const srcDb = getFirestore(srcApp, sourceDbId);
  const dstDb = getFirestore(dstApp, targetDbId);
  const collections = env('MIGRATE_COLLECTIONS')
    ? env('MIGRATE_COLLECTIONS').split(',').map(v => v.trim()).filter(Boolean)
    : DEFAULT_COLLECTIONS;
  const batchSize = Math.min(Math.max(Number(env('MIGRATE_BATCH_SIZE', '400')) || 400, 1), 450);
  const recursive = parseBool(env('MIGRATE_SUBCOLLECTIONS'), false);

  for (const name of collections) {
    await copyCollection(srcDb, dstDb, name, { dryRun, batchSize, recursive });
  }
}

async function main() {
  const dryRun = parseBool(env('MIGRATE_DRY_RUN'), false);
  const migrateAuth = parseBool(env('MIGRATE_AUTH'), true);
  const migrateStore = parseBool(env('MIGRATE_FIRESTORE'), true);

  const source = createApp('SOURCE', 'source');
  const target = createApp('TARGET', 'target');

  console.log(`Nguồn: ${source.projectId}`);
  console.log(`Đích: ${target.projectId}`);
  console.log(`Chế độ: ${dryRun ? 'dry-run, không ghi dữ liệu' : 'ghi dữ liệu thật'}`);

  if (source.projectId === target.projectId) {
    throw new Error('Project nguồn và project đích đang giống nhau. Dừng để tránh ghi nhầm.');
  }

  if (migrateAuth) await migrateAuthUsers(source.app, target.app, { dryRun });
  if (migrateStore) await migrateFirestore(source.app, target.app, { dryRun });

  console.log('Hoàn tất migrate Firebase project.');
}

main().catch(error => {
  console.error('Migrate lỗi:', error?.message || error);
  process.exit(1);
});
