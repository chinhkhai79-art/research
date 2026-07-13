import { setCors } from '../cors.js';
import {
  isSupabaseConfigured,
  getUserByUid as sbGetUserByUid,
  findUsersByEmail as sbFindUsersByEmail,
  pickBestUserByEmail as sbPickBestUserByEmail,
  isRealUserItem as sbIsRealUserItem,
  upsertUser as sbUpsertUser,
  addAdminLog as sbAddAdminLog,
  listUsersForBulk as sbListUsersForBulk
} from '../supabaseAdmin.js';

const PLAN_MAP = {
  'manual_30d': { planId: 'manual_30d', planName: 'KÍCH HOẠT THỦ CÔNG 30 NGÀY', days: 30 },
  '30': { planId: '1m', planName: 'GÓI 1 THÁNG', days: 30 },
  '1m': { planId: '1m', planName: 'GÓI 1 THÁNG', days: 30 },
  '90': { planId: '3m', planName: 'GÓI 3 THÁNG', days: 90 },
  '180': { planId: '6m', planName: 'GÓI 6 THÁNG', days: 180 },
  '365': { planId: '12m', planName: 'GÓI 1 NĂM', days: 365 },
  '3m': { planId: '3m', planName: 'GÓI 3 THÁNG', days: 90 },
  '6m': { planId: '6m', planName: 'GÓI 6 THÁNG', days: 180 },
  '12m': { planId: '12m', planName: 'GÓI 1 NĂM', days: 365 }
};
const DEFAULT_BULK_REASON = 'Cộng ngày hàng loạt từ admin';
function getAdminToken(req) { return String(req.headers['x-admin-secret'] || req.headers['x-admin-key'] || req.headers.authorization || req.query.password || req.query.adminSecret || req.query.adminKey || req.body?.password || req.body?.adminSecret || req.body?.adminKey || '').replace(/^Bearer\s+/i, '').trim(); }
function requireAdmin(req, res) {
  const token = getAdminToken(req);
  const validSecrets = [
    process.env.ADMIN_SECRET,
    process.env.ADMIN_SETTINGS_PASSWORD,
    process.env.ADMIN_PASSWORD,
    process.env.ADMIN_SETTINGS_KEY,
    process.env.ADMIN_LOGIN_PASSWORD,
    'ThanhCong2027###'
  ].map(v => String(v || '').trim()).filter(Boolean);
  if (!validSecrets.length) { res.status(500).json({ success: false, error: 'Thiếu biến môi trường ADMIN_SECRET hoặc ADMIN_SETTINGS_PASSWORD trên Vercel.' }); return false; }
  if (!validSecrets.includes(token)) { res.status(401).json({ success: false, error: 'Sai mật khẩu quản trị.' }); return false; }
  return true;
}
function toDate(value) { if (!value) return null; if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value; const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d; }
function addDays(date, days) { return new Date(date.getTime() + Number(days) * 86400000); }
function compactEmail(email) { return String(email || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120); }
async function findSupabaseUser({ uid, email }) {
  if (uid) {
    const item = await sbGetUserByUid(uid);
    return { uid, data: item?.data || {}, exists: Boolean(item), emailMatches: [] };
  }
  if (email) {
    const found = await sbFindUsersByEmail(email, 50);
    const best = sbPickBestUserByEmail(found);
    if (best) return { uid: best.row.uid, data: best.data || {}, exists: true, emailMatches: found };
  }
  return { uid: `manual_${compactEmail(email) || Date.now()}`, data: {}, exists: false, manual: true, emailMatches: [] };
}
async function activateSupabaseUser({ uidInput, email, body, days, planId, planName, reason }) {
  const found = await findSupabaseUser({ uid: uidInput, email });
  const uid = found.uid;
  const current = found.data || {};
  const now = new Date();
  const oldExpiresAt = toDate(current.premiumExpiresAt || current.expired_at || current.expiresAt);
  const baseDate = oldExpiresAt && oldExpiresAt.getTime() > now.getTime() ? oldExpiresAt : now;
  const expiresAt = addDays(baseDate, days);
  const data = {
    ...current,
    userId: uid,
    uid,
    email: email || current.email || '',
    name: body.name || current.name || current.displayName || '',
    account_type: 'premium', premium: true, isPro: true, pro: true, active: true, status: 'PRO',
    planId, planName,
    premiumStartedAt: current.premiumStartedAt || now.toISOString(),
    premiumExpiresAt: expiresAt.toISOString(), expired_at: expiresAt.toISOString(), expiresAt: expiresAt.toISOString(),
    manualActivation: Boolean(found.manual && !found.exists),
    lastAdminAction: 'activate_or_extend', lastAdminReason: reason, lastAdminDays: days,
    updated_at: now.toISOString(), created_at: current.created_at || now.toISOString()
  };
  await sbUpsertUser(uid, data);

  // Nếu trước đó đã có bản ghi manual cùng email, đánh dấu đã gộp để app/admin không dùng nhầm bản ghi cũ.
  const matches = Array.isArray(found.emailMatches) ? found.emailMatches : [];
  await Promise.all(matches
    .filter(item => item?.row?.uid && item.row.uid !== uid && !sbIsRealUserItem(item))
    .map(item => sbUpsertUser(item.row.uid, {
      ...(item.data || {}),
      migratedTo: uid,
      migratedAt: now.toISOString(),
      active: false,
      premium: false,
      isPro: false,
      pro: false,
      account_type: 'expired',
      updated_at: now.toISOString()
    }).catch(() => null))
  );

  await sbAddAdminLog({ action: 'activate_or_extend', targetUid: uid, targetEmail: data.email, planId, planName, days, oldExpiresAt: oldExpiresAt ? oldExpiresAt.toISOString() : null, newExpiresAt: expiresAt.toISOString(), cumulative: Boolean(oldExpiresAt && oldExpiresAt.getTime() > now.getTime()), reason });
  return { uid, email: data.email, expiresAt, matchedExisting: found.exists, manual: Boolean(found.manual && !found.exists) };
}
async function bulkExtendUsers({ days, scope = 'pro_active', dryRun = false, reason = '', adminEmail = '' }) {
  reason = String(reason || DEFAULT_BULK_REASON).trim() || DEFAULT_BULK_REASON;
  const now = new Date();
  const rows = await sbListUsersForBulk({ limit: 5000 });
  const affected = [];
  const skipped = [];
  for (const item of rows) {
    const u = item.data || {};
    const uid = item.row?.uid || u.uid || u.userId;
    const email = u.email || '';
    if (!uid) { skipped.push({ uid: '', email, reason: 'missing_uid' }); continue; }
    if (u.migratedTo || item.row?.migrated_to) { skipped.push({ uid, email, reason: 'migrated' }); continue; }
    const oldExpires = toDate(u.premiumExpiresAt || u.expired_at || u.expiresAt || item.row?.premium_expires_at || item.row?.trial_expires_at);
    const isPremium = u.premium === true || u.isPro === true || u.pro === true || u.account_type === 'premium' || item.row?.account_type === 'premium' || item.row?.premium === true;
    const isActive = oldExpires && oldExpires.getTime() > now.getTime();
    let qualifies = false;
    if (scope === 'pro_active') qualifies = isPremium && isActive;
    else if (scope === 'pro_all') qualifies = isPremium;
    else if (scope === 'all_users') qualifies = true;
    if (!qualifies) { skipped.push({ uid, email, reason: scope === 'pro_active' ? (isActive ? 'not_premium' : 'expired') : 'not_premium' }); continue; }
    const baseDate = oldExpires && oldExpires.getTime() > now.getTime() ? oldExpires : now;
    const newExpires = addDays(baseDate, days);
    affected.push({ uid, email, planName: u.planName || '', oldExpiresAt: oldExpires ? oldExpires.toISOString() : null, newExpiresAt: newExpires.toISOString(), wasActive: Boolean(isActive) });
    if (!dryRun) {
      await sbUpsertUser(uid, { ...u, account_type:'premium', premium:true, isPro:true, pro:true, active:true, premiumExpiresAt:newExpires.toISOString(), expired_at:newExpires.toISOString(), expiresAt:newExpires.toISOString(), lastAdminAction:'bulk_extend', lastAdminReason:reason, lastAdminDays:days, bulkExtendedAt:now.toISOString(), updated_at:now.toISOString() });
    }
  }
  if (!dryRun) await sbAddAdminLog({ action:'bulk_extend', targetUid:'BULK', targetEmail:`${affected.length} users`, planName:`CỘNG ${days} NGÀY HÀNG LOẠT (${scope})`, days, affectedCount:affected.length, skippedCount:skipped.length, scope, reason, adminEmail });
  return { dryRun, scope, days, affectedCount: affected.length, skippedCount: skipped.length, affected: affected.slice(0, 100), skippedSample: skipped.slice(0, 20) };
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (!requireAdmin(req, res)) return;
  try {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
    if (!isSupabaseConfigured()) return res.status(200).json({ success:false, code:'SUPABASE_NOT_CONFIGURED', error:'Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trên Vercel. Kích hoạt PRO đã chuyển sang Supabase, không còn ghi Firestore.' });
    const body = req.body || {};
    const action = String(body.action || '').trim();
    if (action === 'bulk_extend_preview' || action === 'bulk_extend_apply') {
      const days = Math.max(1, Math.min(365, Number(body.days || 0)));
      if (!days) return res.status(400).json({ success: false, error: 'Cần nhập số ngày từ 1 đến 365.' });
      const scope = ['pro_active', 'pro_all', 'all_users'].includes(body.scope) ? body.scope : 'pro_active';
      const reason = String(body.reason || '').trim();
      const result = await bulkExtendUsers({ days, scope, reason: reason || DEFAULT_BULK_REASON, dryRun: action === 'bulk_extend_preview', adminEmail: String(body.adminEmail || '') });
      return res.status(200).json({ success: true, message: action === 'bulk_extend_preview' ? `Preview: ${result.affectedCount} user sẽ được cộng ${days} ngày.` : `Đã cộng ${days} ngày cho ${result.affectedCount} user.`, ...result, dataSource:'supabase' });
    }
    const uidInput = String(body.uid || body.userId || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const planKey = String(body.planId || body.plan || body.days || '90').trim();
    const selected = PLAN_MAP[planKey] || PLAN_MAP[String(body.days || '')] || PLAN_MAP['90'];
    const days = Math.max(1, Number(body.days || selected.days || 90));
    const planId = selected.planId;
    const planName = String(body.planName || selected.planName || `GÓI PRO ${days} NGÀY`).toUpperCase();
    const reason = String(body.reason || '').trim();
    if (!uidInput && !email) return res.status(400).json({ success: false, error: 'Cần nhập UID hoặc email.' });
    const result = await activateSupabaseUser({ uidInput, email, body, days, planId, planName, reason });
    return res.status(200).json({ success: true, message: 'Đã kích hoạt/cộng ngày PRO.', uid: result.uid, email: result.email, planId, planName, days, expiresAt: result.expiresAt.toISOString(), dataSource:'supabase' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || 'Không kích hoạt được tài khoản.' });
  }
}
