async function getAdminDb() {
  try {
    const mod = await import('./firebaseAdmin.js');
    return mod.adminDb || mod.db || mod.default?.adminDb || mod.default?.db || null;
  } catch (e) {
    try {
      const mod = await import('../lib/firebaseAdmin.js');
      return mod.adminDb || mod.db || mod.default?.adminDb || mod.default?.db || null;
    } catch (e2) {
      return null;
    }
  }
}

const MEM = globalThis.__researchTrendingCache || (globalThis.__researchTrendingCache = { docs: {}, state: {} });

function normalizeRegion(region) {
  return String(region || 'VN').trim().toUpperCase() || 'VN';
}

async function readTrendingCache(region) {
  const code = normalizeRegion(region);
  const db = await getAdminDb();
  if (db) {
    const snap = await db.collection('system_trending_niches').doc(code).get();
    if (snap.exists) return snap.data();
  }
  return MEM.docs[code] || null;
}

async function writeTrendingCache(region, payload) {
  const code = normalizeRegion(region);
  const doc = { ...payload, region: code, updatedAt: payload.updatedAt || new Date().toISOString() };
  const db = await getAdminDb();
  if (db) {
    await db.collection('system_trending_niches').doc(code).set(doc, { merge: true });
    await db.collection('system_trending_niches').doc('_STATE').set({ lastRegion: code, updatedAt: doc.updatedAt }, { merge: true });
  }
  MEM.docs[code] = doc;
  MEM.state.lastRegion = code;
  MEM.state.updatedAt = doc.updatedAt;
  return doc;
}

async function readCronState() {
  const db = await getAdminDb();
  if (db) {
    const snap = await db.collection('system_trending_niches').doc('_STATE').get();
    return snap.exists ? snap.data() : {};
  }
  return MEM.state || {};
}

async function writeCronState(payload) {
  const db = await getAdminDb();
  if (db) {
    await db.collection('system_trending_niches').doc('_STATE').set(payload, { merge: true });
  }
  MEM.state = { ...(MEM.state || {}), ...payload };
  return MEM.state;
}

module.exports = { readTrendingCache, writeTrendingCache, readCronState, writeCronState, normalizeRegion };
