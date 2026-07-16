const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
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

export async function sbFetch(path, options = {}) {
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
export function cleanObj(obj = {}) {
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
  const safeLimit = Math.min(Math.max(Number(limit || 5), 1), 100);
  const rows = await sbFetch(`users?email=eq.${enc(String(email).toLowerCase())}&select=*&order=updated_at.desc&limit=${safeLimit}`);
  return (rows || []).map(row => ({ row, data: userRowToData(row) }));
}

function userSortTime(item) {
  const d = item?.data || {};
  const candidates = [d.lastLoginAt, d.updated_at, d.premiumExpiresAt, d.trialExpiresAt, d.created_at];
  for (const v of candidates) {
    const t = v ? new Date(v).getTime() : 0;
    if (Number.isFinite(t) && t > 0) return t;
  }
  return 0;
}
export function isManualUid(uid = '') {
  return String(uid || '').toLowerCase().startsWith('manual_');
}
export function isRealUserItem(item) {
  const uid = item?.row?.uid || item?.data?.uid || item?.data?.userId || '';
  const d = item?.data || {};
  return Boolean(uid) && !isManualUid(uid) && !d.manualActivation && !d.migratedTo;
}
export function pickBestUserByEmail(items = []) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) return null;
  const real = list.filter(isRealUserItem);
  const pool = real.length ? real : list.filter(item => !item?.data?.migratedTo);
  const candidates = (pool.length ? pool : list).slice();
  candidates.sort((a, b) => {
    const ap = Boolean(a?.data?.premium || a?.data?.isPro || a?.data?.pro || a?.data?.account_type === 'premium');
    const bp = Boolean(b?.data?.premium || b?.data?.isPro || b?.data?.pro || b?.data?.account_type === 'premium');
    if (ap !== bp) return bp ? 1 : -1;
    return userSortTime(b) - userSortTime(a);
  });
  return candidates[0] || null;
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

export async function listUsers({ q = '', limit = 50, page = 1, offset = null } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit || 50), 1), 50);
  const safePage = Math.max(Number(page || 1), 1);
  const safeOffset = offset == null ? (safePage - 1) * safeLimit : Math.max(Number(offset || 0), 0);
  const term = String(q || '').trim().toLowerCase();
  let path = `users?select=*&order=updated_at.desc&limit=${safeLimit}&offset=${safeOffset}`;
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
  const rows = await sbFetch('app_settings?key=eq.research_config&select=*&order=updated_at.desc&limit=1');
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
  return await sbFetch(`sepay_logs?select=*&order=created_at.desc&limit=${Math.min(Number(limit)||80, 500)}`);
}


export function requireSupabaseConfigured() {
  ensureSupabase();
  return true;
}

function paymentRowToData(row = {}) {
  const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
  return {
    ...raw,
    orderCode: row.order_code || raw.orderCode || raw.paymentCode || '',
    paymentCode: row.order_code || raw.paymentCode || raw.orderCode || '',
    status: row.status || raw.status || 'pending',
    paid: Boolean(row.paid),
    uid: row.uid || row.user_id || raw.uid || raw.userId || '',
    userId: row.user_id || row.uid || raw.userId || raw.uid || '',
    email: row.email || raw.email || raw.userEmail || '',
    userEmail: row.email || raw.userEmail || raw.email || '',
    planId: row.plan_id || raw.planId || '1m',
    planName: row.plan_name || raw.planName || 'GÓI 1 THÁNG',
    days: Number(row.days || raw.days || 0),
    amount: Number(row.amount || raw.amount || 0),
    expectedAmount: Number(row.expected_amount || row.amount || raw.expectedAmount || raw.amount || 0),
    amountMismatchReceived: Number(row.amount_mismatch_received || raw.amountMismatchReceived || 0),
    content: row.content || raw.content || row.order_code || '',
    paidAt: row.paid_at || raw.paidAt || null,
    expiresAt: row.expires_at || raw.expiresAt || raw.pendingExpiresAt || null,
    createdAt: row.created_at || raw.createdAt || null,
    updatedAt: row.updated_at || raw.updatedAt || null,
    raw
  };
}

function dataToPaymentRow(data = {}) {
  const raw = { ...(data.raw && typeof data.raw === 'object' ? data.raw : {}), ...data };
  const orderCode = String(data.orderCode || data.paymentCode || raw.orderCode || raw.paymentCode || '').trim().toUpperCase();
  if (!orderCode) throw new Error('Thiếu orderCode khi lưu Supabase payments.');
  return cleanObj({
    order_code: orderCode,
    uid: data.uid || data.userId || raw.uid || raw.userId || '',
    user_id: data.userId || data.uid || raw.userId || raw.uid || '',
    email: String(data.email || data.userEmail || raw.email || raw.userEmail || '').trim().toLowerCase(),
    plan_id: data.planId || raw.planId || '',
    plan_name: data.planName || raw.planName || '',
    days: data.days == null ? null : Number(data.days),
    amount: data.amount == null ? 0 : Number(data.amount),
    expected_amount: data.expectedAmount == null ? Number(data.amount || 0) : Number(data.expectedAmount),
    amount_mismatch_received: data.amountMismatchReceived == null ? undefined : Number(data.amountMismatchReceived),
    status: data.status || raw.status || 'pending',
    paid: Boolean(data.paid ?? raw.paid ?? false),
    content: data.content || raw.content || orderCode,
    paid_at: toIso(data.paidAt || raw.paidAt),
    expires_at: toIso(data.expiresAt || data.pendingExpiresAt || raw.expiresAt || raw.pendingExpiresAt),
    raw,
    updated_at: new Date().toISOString()
  });
}

export async function createPayment(data = {}) {
  const row = dataToPaymentRow(data);
  const rows = await sbFetch('payments', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...row, created_at: new Date().toISOString() })
  });
  return rows?.[0] ? paymentRowToData(rows[0]) : paymentRowToData(row);
}

export async function getPayment(orderCode) {
  if (!orderCode) return null;
  const rows = await sbFetch(`payments?order_code=eq.${enc(String(orderCode).toUpperCase())}&select=*&limit=1`);
  return rows?.[0] ? { row: rows[0], data: paymentRowToData(rows[0]) } : null;
}

export async function patchPayment(orderCode, data = {}) {
  const row = dataToPaymentRow({ ...data, orderCode });
  const rows = await sbFetch(`payments?order_code=eq.${enc(String(orderCode).toUpperCase())}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row)
  });
  return rows?.[0] ? paymentRowToData(rows[0]) : null;
}

export async function addSepayLog(data = {}) {
  const body = cleanObj({
    status: data.status || '',
    reason: data.reason || '',
    order_code: data.orderCode || data.order_code || '',
    received_amount: data.receivedAmount == null ? (data.amount == null ? null : Number(data.amount)) : Number(data.receivedAmount),
    expected_amount: data.expectedAmount == null ? null : Number(data.expectedAmount),
    diff: data.diff == null ? null : Number(data.diff),
    amount: data.amount == null ? null : Number(data.amount),
    content: data.content || '',
    ip: data.ip || '',
    raw: data.raw || data.body || data.rawBody || data || {},
    created_at: new Date().toISOString()
  });
  const rows = await sbFetch('sepay_logs', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(body)
  });
  return rows?.[0] || null;
}

export async function listUsersForBulk({ limit = 5000 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit || 5000), 1), 5000);
  const rows = await sbFetch(`users?select=*&order=updated_at.desc&limit=${safeLimit}`);
  return (rows || []).map(row => ({ row, data: userRowToData(row) }));
}

export async function deleteAdminHistory() {
  // Supabase REST bắt buộc có filter. Dùng điều kiện luôn đúng theo khóa chính không null.
  const deleted = {};
  const specs = [
    ['admin_logs', 'id=not.is.null'],
    ['sepay_logs', 'id=not.is.null'],
    ['payments', 'order_code=not.is.null']
  ];
  for (const [table, filter] of specs) {
    const rows = await sbFetch(`${table}?${filter}&select=*`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' }
    });
    deleted[table] = Array.isArray(rows) ? rows.length : 0;
  }
  await addAdminLog({ action: 'reset_history', targetUid: 'SYSTEM', targetEmail: 'history', reason: 'Reset lịch sử thanh toán, doanh thu và logs trên Supabase', data: { deleted } });
  return deleted;
}

export async function getTrendingDoc(key) {
  const rows = await sbFetch(`system_trending_niches?key=eq.${enc(key)}&select=*&limit=1`);
  return rows?.[0]?.data || null;
}

export async function saveTrendingDoc(key, data = {}) {
  const now = new Date().toISOString();
  const rows = await sbFetch('system_trending_niches?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ key, data, updated_at: now })
  });
  return rows?.[0]?.data || data;
}
