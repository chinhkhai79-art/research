const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  ''
).trim();

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function ensureSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.');
  }
}

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function sbFetch(path, options = {}) {
  ensureSupabase();
  const url = `${SUPABASE_URL}/rest/v1/${path.replace(/^\/+/, '')}`;
  const res = await fetch(url, {
    ...options,
    headers: headers(options.headers || {})
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!res.ok) {
    const msg = typeof data === 'object' ? (data.message || data.error || JSON.stringify(data)) : (data || res.statusText);
    throw new Error(`Supabase ${res.status}: ${msg}`);
  }
  return data;
}

function enc(v) { return encodeURIComponent(String(v ?? '')); }
function cleanObj(obj = {}) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
export function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value?.toDate === 'function') return toIso(value.toDate());
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function userRowToData(row = {}) {
  const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
  return {
    ...raw,
    userId: row.uid || raw.userId,
    uid: row.uid || raw.uid,
    email: row.email || raw.email || '',
    name: row.name || raw.name || raw.displayName || '',
    displayName: row.name || raw.displayName || raw.name || '',
    photoUrl: row.photo_url || raw.photoUrl || raw.photoURL || '',
    account_type: row.account_type || raw.account_type || 'expired',
    premium: row.premium ?? raw.premium ?? false,
    isPro: row.premium ?? raw.isPro ?? false,
    pro: row.premium ?? raw.pro ?? false,
    active: row.active ?? raw.active ?? false,
    planId: row.plan_id || raw.planId || '',
    planName: row.plan_name || raw.planName || '',
    premiumStartedAt: row.premium_started_at || raw.premiumStartedAt || raw.started_at || null,
    premiumExpiresAt: row.premium_expires_at || raw.premiumExpiresAt || raw.expired_at || raw.expiresAt || null,
    expired_at: row.premium_expires_at || raw.expired_at || raw.premiumExpiresAt || raw.expiresAt || null,
    expiresAt: row.premium_expires_at || row.trial_expires_at || raw.expiresAt || raw.expired_at || raw.premiumExpiresAt || null,
    trialStartedAt: row.trial_started_at || raw.trialStartedAt || null,
    trialExpiresAt: row.trial_expires_at || raw.trialExpiresAt || null,
    disabledByAdmin: row.disabled_by_admin ?? raw.disabledByAdmin ?? false,
    manualActivation: row.manual_activation ?? raw.manualActivation ?? false,
    migratedTo: row.migrated_to || raw.migratedTo || '',
    lastPaymentOrderCode: row.last_payment_order_code || raw.lastPaymentOrderCode || raw.lastOrderCode || '',
    lastPaymentAmount: Number(row.last_payment_amount || raw.lastPaymentAmount || 0),
    created_at: row.created_at || raw.created_at || raw.createdAt || null,
    createdAt: row.created_at || raw.createdAt || raw.created_at || null,
    updated_at: row.updated_at || raw.updated_at || raw.updatedAt || null,
    updatedAt: row.updated_at || raw.updatedAt || raw.updated_at || null,
    firstLoginAt: row.first_login_at || raw.firstLoginAt || null,
    lastLoginAt: row.last_login_at || raw.lastLoginAt || null,
    loginCount: Number(row.login_count || raw.loginCount || 0)
  };
}

function dataToUserRow(uid, data = {}) {
  const existingRaw = data.raw && typeof data.raw === 'object' ? data.raw : {};
  const raw = { ...existingRaw, ...data };
  const email = String(data.email || raw.email || '').trim().toLowerCase();
  const premiumExpiresAt = toIso(data.premiumExpiresAt || data.expired_at || data.expiresAt || raw.premiumExpiresAt || raw.expired_at || raw.expiresAt);
  const trialExpiresAt = toIso(data.trialExpiresAt || raw.trialExpiresAt);
  const accountType = data.account_type || raw.account_type || (data.premium ? 'premium' : (trialExpiresAt ? 'trial' : 'expired'));
  const premium = Boolean(data.premium ?? data.isPro ?? data.pro ?? raw.premium ?? raw.isPro ?? raw.pro ?? accountType === 'premium');
  const active = Boolean(data.active ?? raw.active ?? (premium && premiumExpiresAt && new Date(premiumExpiresAt) > new Date()));
  return cleanObj({
    uid: String(uid || data.userId || raw.userId || raw.uid || '').trim(),
    email,
    name: data.name || data.displayName || raw.name || raw.displayName || '',
    photo_url: data.photoUrl || data.photoURL || raw.photoUrl || raw.photoURL || '',
    account_type: accountType,
    premium,
    active,
    plan_id: data.planId || raw.planId || '',
    plan_name: data.planName || raw.planName || '',
    premium_started_at: toIso(data.premiumStartedAt || data.started_at || raw.premiumStartedAt || raw.started_at),
    premium_expires_at: premiumExpiresAt,
    trial_started_at: toIso(data.trialStartedAt || raw.trialStartedAt),
    trial_expires_at: trialExpiresAt,
    disabled_by_admin: Boolean(data.disabledByAdmin ?? raw.disabledByAdmin ?? false),
    manual_activation: Boolean(data.manualActivation ?? raw.manualActivation ?? false),
    migrated_to: data.migratedTo || raw.migratedTo || '',
    last_payment_order_code: data.lastPaymentOrderCode || data.lastOrderCode || raw.lastPaymentOrderCode || raw.lastOrderCode || '',
    last_payment_amount: Number(data.lastPaymentAmount || raw.lastPaymentAmount || 0),
    first_login_at: toIso(data.firstLoginAt || raw.firstLoginAt),
    last_login_at: toIso(data.lastLoginAt || raw.lastLoginAt),
    login_count: Number(data.loginCount || raw.loginCount || 0),
    raw,
    updated_at: new Date().toISOString()
  });
}

export async function getUserByUid(uid) {
  const rows = await sbFetch(`users?uid=eq.${enc(uid)}&select=*&limit=1`);
  return rows?.[0] ? { row: rows[0], data: userRowToData(rows[0]) } : null;
}

export async function findUsersByEmail(email, limit = 5) {
  if (!email) return [];
  const rows = await sbFetch(`users?email=eq.${enc(String(email).toLowerCase())}&select=*&limit=${Number(limit) || 5}`);
  return (rows || []).map(row => ({ row, data: userRowToData(row) }));
}

export async function upsertUser(uid, data = {}) {
  const row = dataToUserRow(uid, data);
  if (!row.uid) throw new Error('Thiếu UID khi lưu Supabase users.');
  const rows = await sbFetch('users?on_conflict=uid', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row)
  });
  return rows?.[0] ? { row: rows[0], data: userRowToData(rows[0]) } : { row, data: userRowToData(row) };
}

export async function patchUser(uid, data = {}) {
  const row = dataToUserRow(uid, data);
  const rows = await sbFetch(`users?uid=eq.${enc(uid)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row)
  });
  return rows?.[0] ? { row: rows[0], data: userRowToData(rows[0]) } : null;
}

export async function listUsers({ q = '', limit = 20 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit || 20), 1), 50);
  const term = String(q || '').trim().toLowerCase();
  let path = `users?select=*&order=updated_at.desc&limit=${safeLimit}`;
  if (term) {
    path += `&or=(uid.ilike.*${enc(term)}*,email.ilike.*${enc(term)}*,name.ilike.*${enc(term)}*)`;
  }
  const rows = await sbFetch(path);
  return (rows || []).map(row => ({ row, data: userRowToData(row) }));
}

export async function findUserTargets({ uid = '', email = '' } = {}) {
  if (uid) {
    const item = await getUserByUid(uid);
    return item ? [{ uid, ...item }] : [];
  }
  return (await findUsersByEmail(email, 10)).map(item => ({ uid: item.row.uid, ...item }));
}

export async function getAppSettingsRow() {
  const rows = await sbFetch('app_settings?key=eq.research_config&select=*&limit=1');
  return rows?.[0] || null;
}

export async function saveAppSettingsRow(settings) {
  const now = new Date().toISOString();
  const rows = await sbFetch('app_settings?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ key: 'research_config', settings, updated_at: now })
  });
  return rows?.[0] || { key: 'research_config', settings, updated_at: now };
}

export async function addAdminLog(data = {}) {
  const body = cleanObj({
    app: data.app || 'research',
    action: data.action || '',
    target_uid: data.targetUid || data.target_uid || '',
    target_email: data.targetEmail || data.target_email || '',
    plan_id: data.planId || data.plan_id || '',
    plan_name: data.planName || data.plan_name || '',
    days: data.days == null ? null : Number(data.days),
    amount: data.amount == null ? null : Number(data.amount),
    reason: data.reason || '',
    old_expires_at: toIso(data.oldExpiresAt || data.old_expires_at),
    new_expires_at: toIso(data.newExpiresAt || data.new_expires_at),
    ip: data.ip || '',
    data,
    created_at: new Date().toISOString()
  });
  const rows = await sbFetch('admin_logs', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(body)
  });
  return rows?.[0] || null;
}

export async function listAdminLogs(limit = 50) {
  const rows = await sbFetch(`admin_logs?select=*&order=created_at.desc&limit=${Math.min(Number(limit)||50, 80)}`);
  return (rows || []).map(row => ({
    id: row.id,
    ...(row.data || {}),
    app: row.app,
    action: row.action,
    targetUid: row.target_uid,
    targetEmail: row.target_email,
    planId: row.plan_id,
    planName: row.plan_name,
    days: row.days,
    amount: row.amount,
    reason: row.reason,
    createdAt: row.created_at,
    oldExpiresAt: row.old_expires_at,
    newExpiresAt: row.new_expires_at,
    source: 'supabase'
  }));
}

export async function listPayments({ limit = 150, paidOnly = false } = {}) {
  let path = `payments?select=*&order=created_at.desc&limit=${Math.min(Number(limit)||150, 500)}`;
  if (paidOnly) path += '&paid=eq.true';
  return await sbFetch(path);
}

export async function listSepayLogs(limit = 80) {
  return await sbFetch(`sepay_logs?select=*&order=created_at.desc&limit=${Math.min(Number(limit)||80, 100)}`);
}
