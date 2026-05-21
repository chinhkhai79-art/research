// api/payment-config.js
// Bản chống crash + chuẩn hóa cấu hình để pay.html luôn có đủ bank/account/QR.

const BANK_CODE_MAP = {
  ACB: '970416',
  VCB: '970436', VIETCOMBANK: '970436',
  TCB: '970407', TECHCOMBANK: '970407',
  MB: '970422', MBBANK: '970422',
  BIDV: '970418',
  CTG: '970415', VIETINBANK: '970415',
  VIB: '970441',
  VPB: '970432', VPBANK: '970432',
  TPB: '970423', TPBANK: '970423',
  STB: '970403', SACOMBANK: '970403',
  HDB: '970437', HDBANK: '970437',
  SHB: '970443',
  OCB: '970448',
  MSB: '970426',
  EIB: '970431', EXIMBANK: '970431',
};

const DEFAULT_PAYMENT = {
  bankId: process.env.PAYMENT_BANK_ID || '970416',
  bankCode: process.env.PAYMENT_BANK_CODE || process.env.PAYMENT_BANK_NAME || 'ACB',
  bankName: process.env.PAYMENT_BANK_NAME || 'ACB',
  accountNo: process.env.PAYMENT_ACCOUNT_NUMBER || '13131447',
  accountNumber: process.env.PAYMENT_ACCOUNT_NUMBER || '13131447',
  accountName: process.env.PAYMENT_ACCOUNT_NAME || 'LE VAN KHAI',
  transferPrefix: process.env.PAYMENT_PREFIX || 'RESEARCH',
  baseUrl: process.env.PUBLIC_BASE_URL || 'https://research.vanthemmo.com',
  plans: {
    '3m': { id: '3m', name: 'GÓI 3 THÁNG', amount: 180000, days: 90, enabled: true },
    '6m': { id: '6m', name: 'GÓI 6 THÁNG', amount: 300000, days: 180, enabled: true },
    '12m': { id: '12m', name: 'GÓI 1 NĂM', amount: 500000, days: 365, enabled: true },
  },
};

function setJson(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-password');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
}

function clean(v) {
  return String(v || '').trim();
}

function onlyDigits(v) {
  return clean(v).replace(/\D/g, '');
}

function resolveBankId(value) {
  const raw = clean(value);
  if (!raw) return DEFAULT_PAYMENT.bankId;
  if (/^\d{6}$/.test(raw)) return raw;
  const key = raw.toUpperCase().replace(/\s+/g, '');
  return BANK_CODE_MAP[key] || raw;
}

function normalizePlans(plans) {
  if (plans && !Array.isArray(plans) && typeof plans === 'object') {
    const out = {};
    for (const [rawId, p] of Object.entries(plans)) {
      if (!p) continue;
      let id = rawId === '1y' ? '12m' : rawId;
      if (id === '1m') continue;
      out[id] = {
        id,
        name: String(p.name || id).toUpperCase(),
        amount: Number(p.amount || 0),
        days: Number(p.days || 0),
        enabled: p.enabled !== false,
      };
    }
    if (Object.keys(out).length) return out;
  }

  if (Array.isArray(plans)) {
    const out = {};
    for (const p of plans) {
      if (!p) continue;
      let id = p.id === '1y' ? '12m' : String(p.id || '');
      if (!id || id === '1m') continue;
      out[id] = {
        id,
        name: String(p.name || id).toUpperCase(),
        amount: Number(p.amount || 0),
        days: Number(p.days || 0),
        enabled: p.enabled !== false,
      };
    }
    if (Object.keys(out).length) return out;
  }

  return DEFAULT_PAYMENT.plans;
}

function normalizePayment(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};

  const bankName = clean(p.bankName || p.bank || p.bankCode || p.bankId || DEFAULT_PAYMENT.bankName);
  const bankCode = clean(p.bankCode || p.bankName || p.bank || DEFAULT_PAYMENT.bankCode);
  const bankId = resolveBankId(p.bankId || p.bankBin || p.bankCode || p.bankName || p.bank || DEFAULT_PAYMENT.bankId);
  const accountNo = onlyDigits(p.accountNo || p.accountNumber || p.bankAccount || p.account || p.stk || DEFAULT_PAYMENT.accountNo);
  const accountName = clean(p.accountName || p.accountOwner || p.beneficiaryName || p.ownerName || DEFAULT_PAYMENT.accountName);
  const transferPrefix = clean(p.transferPrefix || p.transferContentPrefix || p.prefix || p.contentPrefix || DEFAULT_PAYMENT.transferPrefix).replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || 'RESEARCH';
  const baseUrl = clean(p.baseUrl || p.publicBaseUrl || DEFAULT_PAYMENT.baseUrl).replace(/\/$/, '');

  return {
    bankId,
    bankBin: bankId,
    bankCode,
    bankName: bankName || bankCode || 'ACB',
    accountNo,
    accountNumber: accountNo,
    bankAccount: accountNo,
    accountName,
    accountOwner: accountName,
    transferPrefix,
    prefix: transferPrefix,
    transferContentPrefix: transferPrefix,
    baseUrl,
    plans: normalizePlans(p.plans),
  };
}

async function getDb() {
  try {
    const mod = await import('../lib/firebaseAdmin.js');
    if (typeof mod.getFirestoreDb === 'function') return mod.getFirestoreDb();
    if (mod.db) return mod.db;
    if (mod.default?.db) return mod.default.db;
  } catch (e) {
    console.warn('[payment-config] firebase skipped:', e?.message || e);
  }
  return null;
}

async function readSavedPayment() {
  const db = await getDb();
  if (!db) return null;

  const tries = [
    ['app_settings', 'main'],
    ['settings', 'main'],
    ['config', 'payment'],
  ];

  for (const [col, doc] of tries) {
    try {
      const snap = await db.collection(col).doc(doc).get();
      if (snap.exists) {
        const data = snap.data() || {};
        return data.payment || data.sepay || data;
      }
    } catch (e) {
      console.warn(`[payment-config] read ${col}/${doc} skipped:`, e?.message || e);
    }
  }
  return null;
}

export default async function handler(req, res) {
  setJson(res);
  if (req.method === 'OPTIONS') return res.status(200).json({ success: true });
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const saved = await readSavedPayment();
    const payment = normalizePayment(saved);
    return res.status(200).json({
      success: true,
      payment,
      // trả thêm top-level để pay.html cũ hoặc mới đều đọc được
      ...payment,
    });
  } catch (e) {
    const payment = normalizePayment(null);
    return res.status(200).json({ success: true, fallback: true, warning: e?.message || String(e), payment, ...payment });
  }
}
