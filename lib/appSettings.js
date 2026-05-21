async function getFirestoreDb() {
  const mod = await import('./firebaseAdmin.js');
  if (mod.db) return mod.db;
  if (mod.adminDb) return mod.adminDb;
  if (mod.firestore) return mod.firestore;
  if (mod.admin?.firestore) return mod.admin.firestore();
  if (mod.default?.db) return mod.default.db;
  if (mod.default?.adminDb) return mod.default.adminDb;
  if (mod.default?.admin?.firestore) return mod.default.admin.firestore();
  throw new Error('Không tìm thấy Firestore db trong lib/firebaseAdmin.js. Hãy export db hoặc adminDb.');
}

function clean(obj) {
  return JSON.parse(JSON.stringify(obj, (k, v) => v === undefined ? null : v));
}

const DEFAULT_PLANS = [
  { id: '3m', name: 'GÓI 3 THÁNG', amount: 180000, days: 90, enabled: true },
  { id: '6m', name: 'GÓI 6 THÁNG', amount: 300000, days: 180, enabled: true },
  { id: '12m', name: 'GÓI 1 NĂM', amount: 500000, days: 365, enabled: true }
];

const DEFAULT_SETTINGS = {
  sepay: {
    bankOwner: 'LE VAN KHAI',
    bankName: 'ACB',
    bankAccount: '13131447',
    paymentPrefix: 'RESEARCH',
    appBaseUrl: 'https://research.vanthemmo.com',
    webhookUrl: 'https://research.vanthemmo.com/api/sepay-webhook',
    webhookSecret: '',
    plans: DEFAULT_PLANS
  },
  smtp: {
    user: '',
    pass: '',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    fromName: 'Văn Thế Web',
    baseUrl: 'https://research.vanthemmo.com'
  }
};

function normalizePlanArray(plans) {
  const arr = Array.isArray(plans) && plans.length ? plans : DEFAULT_PLANS;
  return arr
    .filter(Boolean)
    .map((p) => ({
      id: String(p.id || p.planId || '').trim() || '3m',
      name: String(p.name || p.planName || 'GÓI PRO').trim().toUpperCase(),
      amount: Number(p.amount || p.price || 0),
      days: Number(p.days || p.durationDays || 0),
      enabled: p.enabled !== false
    }))
    .filter((p) => p.amount > 0 && p.days > 0);
}

function plansArrayToObject(plans) {
  const obj = {};
  for (const p of normalizePlanArray(plans)) obj[p.id] = p;
  return obj;
}

function buildPaymentFromSettings(settings) {
  const s = settings || {};
  const sepay = { ...DEFAULT_SETTINGS.sepay, ...(s.sepay || {}) };
  const payment = { ...(s.payment || {}) };
  const plansArray = normalizePlanArray(payment.plans || sepay.plans);
  const bankName = payment.bankId || payment.bankName || sepay.bankName || 'ACB';
  const accountNo = payment.accountNo || sepay.bankAccount || '13131447';
  const accountName = payment.accountName || sepay.bankOwner || 'LE VAN KHAI';
  const appDomain = String(payment.appDomain || sepay.appBaseUrl || 'https://research.vanthemmo.com').replace(/\/$/, '');
  const orderPrefix = payment.orderPrefix || sepay.paymentPrefix || 'RESEARCH';

  return {
    bankId: bankName,
    bankName,
    accountNo,
    accountName,
    orderPrefix,
    appDomain,
    webhookUrl: payment.webhookUrl || sepay.webhookUrl || `${appDomain}/api/sepay-webhook`,
    webhookSecret: payment.webhookSecret || sepay.webhookSecret || '',
    plans: plansArrayToObject(plansArray),
    plansArray
  };
}

function mergeAliases(settings) {
  const s = {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    sepay: { ...DEFAULT_SETTINGS.sepay, ...((settings || {}).sepay || {}) },
    smtp: { ...DEFAULT_SETTINGS.smtp, ...((settings || {}).smtp || {}) }
  };
  const payment = buildPaymentFromSettings(s);
  s.payment = payment;
  s.sepay = {
    ...s.sepay,
    bankOwner: payment.accountName,
    bankName: payment.bankId,
    bankAccount: payment.accountNo,
    paymentPrefix: payment.orderPrefix,
    appBaseUrl: payment.appDomain,
    webhookUrl: payment.webhookUrl,
    webhookSecret: payment.webhookSecret,
    plans: payment.plansArray
  };
  return s;
}

export async function getAppSettings() {
  const db = await getFirestoreDb();
  const snap = await db.collection('app_settings').doc('admin_settings').get();
  if (!snap.exists) return mergeAliases(DEFAULT_SETTINGS);
  return mergeAliases(snap.data() || {});
}

export async function saveAppSettings(next) {
  const db = await getFirestoreDb();
  const current = await getAppSettings();
  const incomingSepay = next.sepay || {};
  const incomingPayment = next.payment || {};
  const incomingSmtp = next.smtp || {};

  const merged = mergeAliases({
    ...current,
    sepay: { ...(current.sepay || {}), ...incomingSepay },
    payment: { ...(current.payment || {}), ...incomingPayment },
    smtp: { ...(current.smtp || {}), ...incomingSmtp },
    updatedAt: new Date().toISOString()
  });

  if (!incomingSepay.webhookSecret && !incomingPayment.webhookSecret) {
    merged.sepay.webhookSecret = current.sepay?.webhookSecret || current.payment?.webhookSecret || '';
    merged.payment.webhookSecret = merged.sepay.webhookSecret;
  }
  if (!incomingSmtp.pass) merged.smtp.pass = current.smtp?.pass || '';

  await db.collection('app_settings').doc('admin_settings').set(clean(merged), { merge: true });
  return merged;
}

export function publicSafeSettings(settings) {
  // Endpoint /api/admin-settings đã bắt buộc mật khẩu quản trị, nên trả về full cấu hình
  // để trang admin có thể hiển thị lại Webhook Secret SePay và SMTP App Password đã lưu.
  // Không dùng hàm này cho endpoint công khai /api/payment-config.
  const s = mergeAliases(settings || {});
  return {
    sepay: { ...(s.sepay || {}) },
    payment: { ...(s.payment || {}) },
    smtp: { ...(s.smtp || {}) },
    updatedAt: s.updatedAt || null
  };
}

export function publicPaymentConfig(settings) {
  const s = mergeAliases(settings || {});
  const payment = { ...(s.payment || {}) };
  delete payment.webhookSecret;
  return {
    success: true,
    payment,
    bankOwner: payment.accountName || '',
    bankName: payment.bankId || 'ACB',
    bankAccount: payment.accountNo || '',
    paymentPrefix: payment.orderPrefix || 'RESEARCH',
    appBaseUrl: payment.appDomain || '',
    plans: payment.plansArray || Object.values(payment.plans || {})
  };
}

export function getEnabledPlans(settings) {
  const payment = buildPaymentFromSettings(mergeAliases(settings || {}));
  const out = {};
  for (const [id, plan] of Object.entries(payment.plans || {})) {
    if (plan && plan.enabled !== false) out[id] = plan;
  }
  return out;
}

export function normalizePlanId(planId, settings) {
  let id = String(planId || '3m').trim().toLowerCase();
  if (id === '1y' || id === '12' || id === 'year' || id === '1nam') id = '12m';
  if (id === '1m') id = '3m';
  const plans = getEnabledPlans(settings || DEFAULT_SETTINGS);
  if (!plans[id]) return Object.keys(plans)[0] || '3m';
  return id;
}

export function requireAdminPassword(inputPassword) {
  const expected = process.env.ADMIN_SETTINGS_PASSWORD || process.env.ADMIN_PASSWORD || '';
  if (!expected) throw new Error('Thiếu biến môi trường ADMIN_SETTINGS_PASSWORD trên Vercel.');
  if (!inputPassword || inputPassword !== expected) {
    const err = new Error('Sai mật khẩu quản trị.');
    err.statusCode = 401;
    throw err;
  }
}
