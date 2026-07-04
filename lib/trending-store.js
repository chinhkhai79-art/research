import { isSupabaseConfigured, getTrendingDoc, saveTrendingDoc } from './supabaseAdmin.js';

const MEM = globalThis.__researchTrendingCache || (globalThis.__researchTrendingCache = { docs: {}, state: {} });

export function normalizeRegion(region) {
  const raw = String(region || 'VN').trim().toUpperCase();
  if (!raw || raw === 'GLOBAL') return 'VN';
  return raw;
}

export async function readTrendingCache(region) {
  const code = normalizeRegion(region);
  if (isSupabaseConfigured()) {
    const doc = await getTrendingDoc(code);
    if (doc) return doc;
  }
  return MEM.docs[code] || null;
}

export async function writeTrendingCache(region, payload) {
  const code = normalizeRegion(region);
  const doc = { ...payload, region: code, updatedAt: payload.updatedAt || new Date().toISOString() };
  if (isSupabaseConfigured()) {
    await saveTrendingDoc(code, doc);
    await saveTrendingDoc('_STATE', { lastRegion: code, updatedAt: doc.updatedAt });
  }
  MEM.docs[code] = doc;
  MEM.state.lastRegion = code;
  MEM.state.updatedAt = doc.updatedAt;
  return doc;
}

export async function readCronState() {
  if (isSupabaseConfigured()) {
    const state = await getTrendingDoc('_STATE');
    if (state) return state;
  }
  return MEM.state || {};
}

export async function writeCronState(payload) {
  if (isSupabaseConfigured()) await saveTrendingDoc('_STATE', payload);
  MEM.state = { ...(MEM.state || {}), ...payload };
  return MEM.state;
}
