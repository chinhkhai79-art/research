// lib/appSettings.js
// Central settings helper for Vercel serverless functions.
// Works even when Firebase is not available, so API routes always return JSON instead of crashing.

export const DEFAULT_APP_SETTINGS = {
  payment: {
    sepaySecret: process.env.SEPAY_WEBHOOK_SECRET || process.env.SEPAY_API_KEY || '',
    accountName: process.env.PAYMENT_ACCOUNT_NAME || 'LE VAN KHAI',
    bankName: process.env.PAYMENT_BANK_NAME || 'ACB',
    accountNumber: process.env.PAYMENT_ACCOUNT_NUMBER || '13131447',
    transferPrefix: process.env.PAYMENT_PREFIX || 'RESEARCH',
    baseUrl: process.env.PUBLIC_BASE_URL || 'https://research.vanthemmo.com',
    plans: [
      { id: '3m', name: 'Gói 3 tháng', amount: 180000, days: 90 },
      { id: '6m', name: 'Gói 6 tháng', amount: 300000, days: 180 },
      { id: '1y', name: 'Gói 1 năm', amount: 500000, days: 365 }
    ]
  },
  smtp: {
    email: process.env.SMTP_USER || '',
    appPassword: process.env.SMTP_PASS || '',
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secureMode: process.env.SMTP_SECURE_MODE || 'ssl',
    senderName: process.env.SMTP_FROM_NAME || 'Văn Thế Web',
    baseUrl: process.env.PUBLIC_BASE_URL || 'https://research.vanthemmo.com'
  }
};

function mergeSettings(remote = {}) {
  return {
    ...DEFAULT_APP_SETTINGS,
    ...remote,
    payment: {
      ...DEFAULT_APP_SETTINGS.payment,
      ...(remote.payment || {}),
      plans: Array.isArray(remote?.payment?.plans) && remote.payment.plans.length
        ? remote.payment.plans
        : DEFAULT_APP_SETTINGS.payment.plans
    },
    smtp: {
      ...DEFAULT_APP_SETTINGS.smtp,
      ...(remote.smtp || {})
    }
  };
}

async function getDb() {
  try {
    const mod = await import('./firebaseAdmin.js');
    if (typeof mod.getFirestoreDb === 'function') return mod.getFirestoreDb();
    if (mod.db) return mod.db;
    if (mod.default?.db) return mod.default.db;
  } catch (e) {
    console.warn('[appSettings] Firebase Admin unavailable, using defaults:', e?.message || e);
  }
  return null;
}

export async function getAppSettings() {
  const db = await getDb();
  if (!db) return mergeSettings({});

  try {
    const snap = await db.collection('app_settings').doc('main').get();
    if (!snap.exists) return mergeSettings({});
    return mergeSettings(snap.data() || {});
  } catch (e) {
    console.warn('[appSettings] Read settings failed, using defaults:', e?.message || e);
    return mergeSettings({});
  }
}

export async function saveAppSettings(partial = {}) {
  const db = await getDb();
  if (!db) throw new Error('Firebase Admin chưa sẵn sàng. Kiểm tra biến môi trường Firebase trên Vercel.');

  const current = await getAppSettings();
  const next = mergeSettings({
    ...current,
    ...partial,
    payment: { ...current.payment, ...(partial.payment || {}) },
    smtp: { ...current.smtp, ...(partial.smtp || {}) }
  });

  await db.collection('app_settings').doc('main').set({
    ...next,
    updatedAt: new Date().toISOString()
  }, { merge: true });

  return next;
}

export function publicPaymentSettings(settings) {
  const p = settings.payment || DEFAULT_APP_SETTINGS.payment;
  return {
    bankName: p.bankName || 'ACB',
    accountNumber: p.accountNumber || '',
    accountName: p.accountName || '',
    transferPrefix: p.transferPrefix || 'RESEARCH',
    baseUrl: p.baseUrl || 'https://research.vanthemmo.com',
    plans: Array.isArray(p.plans) && p.plans.length ? p.plans : DEFAULT_APP_SETTINGS.payment.plans
  };
}
