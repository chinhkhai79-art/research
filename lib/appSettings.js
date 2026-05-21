import { db, FieldValue } from './firebaseAdmin.js';

export const DEFAULT_SETTINGS = {
  payment: {
    bankId: 'ACB', accountNo: '13131447', accountName: 'LE VAN KHAI',
    appDomain: 'https://research.vanthemmo.com', orderPrefix: 'RESEARCH',
    plans: {
      '3m': { name: 'GÓI 3 THÁNG', amount: 180000, days: 90, enabled: true },
      '6m': { name: 'GÓI 6 THÁNG', amount: 300000, days: 180, enabled: true },
      '12m': { name: 'GÓI 1 NĂM', amount: 500000, days: 365, enabled: true }
    }
  },
  smtp: { enabled: false, host: 'smtp.gmail.com', port: 465, secure: true, user: '', pass: '', fromName: 'Văn Thế Web', testTo: '' }
};

function merge(a, b) {
  const o = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    o[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? merge(a[k], v) : v;
  }
  return o;
}

export function normalizeSettings(raw = {}) {
  const s = merge(DEFAULT_SETTINGS, raw);
  const plans = {};
  for (const id of ['3m', '6m', '12m']) {
    const p = s.payment.plans?.[id] || DEFAULT_SETTINGS.payment.plans[id];
    plans[id] = { name: String(p.name || DEFAULT_SETTINGS.payment.plans[id].name).toUpperCase(), amount: Number(p.amount || 0), days: Number(p.days || 0), enabled: p.enabled !== false };
  }
  return {
    payment: {
      bankId: String(s.payment.bankId || 'ACB').trim().toUpperCase(),
      accountNo: String(s.payment.accountNo || '').trim(),
      accountName: String(s.payment.accountName || '').trim().toUpperCase(),
      appDomain: String(s.payment.appDomain || '').trim().replace(/\/+$/, ''),
      orderPrefix: String(s.payment.orderPrefix || 'RESEARCH').trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || 'RESEARCH',
      plans
    },
    smtp: {
      enabled: Boolean(s.smtp.enabled), host: String(s.smtp.host || 'smtp.gmail.com').trim(), port: Number(s.smtp.port || 465),
      secure: s.smtp.secure === false ? false : true, user: String(s.smtp.user || '').trim(), pass: String(s.smtp.pass || ''),
      fromName: String(s.smtp.fromName || 'Văn Thế Web').trim(), testTo: String(s.smtp.testTo || '').trim()
    }
  };
}

export async function getAppSettings() {
  const ref = db.collection('app_settings').doc('research_config');
  const snap = await ref.get();
  if (!snap.exists) {
    const s = normalizeSettings();
    await ref.set({ ...s, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return s;
  }
  return normalizeSettings(snap.data());
}

export async function saveAppSettings(input) {
  const current = await getAppSettings();
  const nextInput = { ...input, smtp: { ...(input.smtp || {}) } };
  if (!nextInput.smtp.pass) nextInput.smtp.pass = current.smtp.pass || '';
  const next = normalizeSettings(nextInput);
  await db.collection('app_settings').doc('research_config').set({ ...next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return next;
}

export function getEnabledPlans(settings) {
  const plans = normalizeSettings(settings).payment.plans;
  const out = {};
  for (const [id, p] of Object.entries(plans)) if (p.enabled && p.amount > 0 && p.days > 0) out[id] = p;
  return Object.keys(out).length ? out : DEFAULT_SETTINGS.payment.plans;
}

export function normalizePlanId(value, settings) {
  const id = String(value || '3m').toLowerCase();
  const fixed = ['1y', 'year', '1year'].includes(id) ? '12m' : id;
  const plans = getEnabledPlans(settings);
  return plans[fixed] ? fixed : Object.keys(plans)[0] || '3m';
}

export function maskSettings(settings) {
  const s = normalizeSettings(settings);
  return { ...s, smtp: { ...s.smtp, pass: '', hasPass: Boolean(s.smtp.pass) } };
}

export function requireAdmin(req, res) {
  const key = String(process.env.ADMIN_SETTINGS_KEY || '').trim();
  if (!key) { res.status(500).json({ success: false, error: 'Missing ADMIN_SETTINGS_KEY' }); return false; }
  const token = String(req.headers['x-admin-key'] || req.headers.authorization || req.query.adminKey || req.body?.adminKey || '').replace(/^Bearer\s+/i, '').trim();
  if (token !== key) { res.status(401).json({ success: false, error: 'Unauthorized' }); return false; }
  return true;
}
