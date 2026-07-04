import { setCors } from '../lib/cors.js';
import { isSupabaseConfigured, listUsers as sbListUsers } from '../lib/supabaseAdmin.js';

const ADMIN_USERS_CACHE_TTL_MS = 2 * 60 * 1000;
const adminUsersMemoryCache = globalThis.__vtwAdminUsersMemoryCache || new Map();
globalThis.__vtwAdminUsersMemoryCache = adminUsersMemoryCache;
function cacheGet(key){ const item = adminUsersMemoryCache.get(key); if(!item || Date.now() - item.cachedAt > ADMIN_USERS_CACHE_TTL_MS) return null; return item.data; }
function cacheSet(key,data){ adminUsersMemoryCache.set(key,{cachedAt:Date.now(),data}); if(adminUsersMemoryCache.size > 200){ const first = adminUsersMemoryCache.keys().next().value; if(first) adminUsersMemoryCache.delete(first); } }
function getAdminToken(req) {
  return String(req.headers['x-admin-secret'] || req.headers['x-admin-key'] || req.headers.authorization || req.query.password || req.query.adminSecret || req.query.adminKey || req.body?.password || req.body?.adminSecret || req.body?.adminKey || '').replace(/^Bearer\s+/i, '').trim();
}
function requireAdmin(req, res) {
  const expected = String(process.env.ADMIN_SECRET || process.env.ADMIN_SETTINGS_PASSWORD || process.env.ADMIN_PASSWORD || process.env.ADMIN_SETTINGS_KEY || '').trim();
  if (!expected) { res.status(500).json({ success: false, error: 'Thiếu biến môi trường ADMIN_SECRET hoặc ADMIN_SETTINGS_PASSWORD trên Vercel.' }); return false; }
  if (getAdminToken(req) !== expected) { res.status(401).json({ success: false, error: 'Sai mật khẩu quản trị.' }); return false; }
  return true;
}
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function toIso(value) { const d = toDate(value); return d ? d.toISOString() : null; }
function remainText(iso) {
  if (!iso) return '---';
  const diff = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(diff) || diff <= 0) return 'Đã hết hạn';
  const totalHours = Math.floor(diff / 3600000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return days > 0 ? `${days} ngày ${hours} giờ` : `${hours} giờ`;
}
function normalizeSupabaseUser(item) {
  const d = item.data || {};
  const uid = d.userId || item.row?.uid || d.uid || '';
  const premiumExpiresAt = toIso(d.premiumExpiresAt || d.expired_at || d.expiresAt || d.proUntil);
  const trialExpiresAt = toIso(d.trialExpiresAt);
  const premiumActive = Boolean(d.premium || d.isPro || d.pro || d.account_type === 'premium') && premiumExpiresAt && new Date(premiumExpiresAt).getTime() > Date.now();
  const trialActive = !premiumActive && d.account_type === 'trial' && trialExpiresAt && new Date(trialExpiresAt).getTime() > Date.now();
  const status = premiumActive ? 'PRO' : trialActive ? 'TRIAL' : 'HẾT HẠN';
  const expiresAt = premiumActive ? premiumExpiresAt : (premiumExpiresAt || trialExpiresAt);
  return {
    uid,
    userId: uid,
    email: d.email || '',
    name: d.name || d.displayName || '',
    photoUrl: d.photoUrl || '',
    accountType: premiumActive ? 'premium' : trialActive ? 'trial' : (d.account_type || 'expired'),
    status,
    active: Boolean(premiumActive || trialActive),
    premium: Boolean(premiumActive),
    planId: d.planId || '',
    planName: premiumActive ? (d.planName || 'GÓI PRO') : trialActive ? 'Dùng thử 1 giờ' : (d.planName || ''),
    premiumStartedAt: toIso(d.premiumStartedAt || d.started_at),
    trialStartedAt: toIso(d.trialStartedAt),
    expiresAt,
    premiumExpiresAt,
    trialExpiresAt,
    remainingText: remainText(expiresAt),
    lastPaymentOrderCode: d.lastPaymentOrderCode || d.lastOrderCode || '',
    lastPaymentAmount: d.lastPaymentAmount || 0,
    disabledByAdmin: Boolean(d.disabledByAdmin),
    manualActivation: Boolean(d.manualActivation),
    migratedTo: d.migratedTo || '',
    createdAt: toIso(d.created_at || d.createdAt),
    updatedAt: toIso(d.updated_at || d.updatedAt),
    firstLoginAt: toIso(d.firstLoginAt),
    lastLoginAt: toIso(d.lastLoginAt),
    loginCount: Number(d.loginCount || 0),
    source: 'supabase'
  };
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (!requireAdmin(req, res)) return;
  try {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
    if (!isSupabaseConfigured()) return res.status(200).json({ success:false, code:'SUPABASE_NOT_CONFIGURED', error:'Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trên Vercel. Danh sách tài khoản đã chuyển sang Supabase, không còn đọc Firestore.' });
    const q = String(req.query.q || req.body?.q || '').trim().toLowerCase();
    const limit = Math.min(Math.max(Number(req.query.limit || req.body?.limit || 50) || 50, 1), 50);
    const page = Math.max(Number(req.query.page || req.body?.page || 1) || 1, 1);
    const offset = (page - 1) * limit;
    const force = String(req.query.force || req.body?.force || '0') === '1';
    const cacheKey = `${q || '_recent'}:${limit}:${page}`;
    if (!force) { const cached = cacheGet(cacheKey); if (cached) return res.status(200).json({ ...cached, fromMemoryCache:true }); }
    const rows = await sbListUsers({ q, limit, page, offset });
    const users = rows.map(normalizeSupabaseUser);
    const response = { success: true, users, count: users.length, limit, page, pageSize: limit, offset, hasPrev: page > 1, hasNext: users.length === limit, nextPage: users.length === limit ? page + 1 : null, prevPage: page > 1 ? page - 1 : null, nextCursor: null, exhausted: users.length < limit, source: 'supabase' };
    cacheSet(cacheKey, response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(200).json({ success: false, code: 'ADMIN_USERS_SUPABASE_ERROR', error: error.message || 'Không tải được danh sách tài khoản từ Supabase.' });
  }
}
