// api/create-payment.js
// Bản chống crash + luôn tạo QR VietQR đúng bankId/acqId.

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
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-password');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
}
function clean(v) { return String(v || '').trim(); }
function onlyDigits(v) { return clean(v).replace(/\D/g, ''); }
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
      out[id] = { id, name: String(p.name || id).toUpperCase(), amount: Number(p.amount || 0), days: Number(p.days || 0), enabled: p.enabled !== false };
    }
    if (Object.keys(out).length) return out;
  }
  if (Array.isArray(plans)) {
    const out = {};
    for (const p of plans) {
      if (!p) continue;
      let id = p.id === '1y' ? '12m' : String(p.id || '');
      if (!id || id === '1m') continue;
      out[id] = { id, name: String(p.name || id).toUpperCase(), amount: Number(p.amount || 0), days: Number(p.days || 0), enabled: p.enabled !== false };
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
  return { bankId, bankBin: bankId, bankCode, bankName: bankName || bankCode || 'ACB', accountNo, accountNumber: accountNo, bankAccount: accountNo, accountName, accountOwner: accountName, transferPrefix, prefix: transferPrefix, transferContentPrefix: transferPrefix, baseUrl, plans: normalizePlans(p.plans) };
}
function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return req.body;
}
async function getDb() {
  try {
    const mod = await import('../lib/firebaseAdmin.js');
    if (typeof mod.getFirestoreDb === 'function') return mod.getFirestoreDb();
    if (mod.db) return mod.db;
    if (mod.default?.db) return mod.default.db;
  } catch (e) { console.warn('[create-payment] firebase skipped:', e?.message || e); }
  return null;
}
async function readSavedPayment(db) {
  if (!db) return null;
  const tries = [['app_settings','main'], ['settings','main'], ['config','payment']];
  for (const [col, doc] of tries) {
    try {
      const snap = await db.collection(col).doc(doc).get();
      if (snap.exists) {
        const data = snap.data() || {};
        return data.payment || data.sepay || data;
      }
    } catch (e) { console.warn(`[create-payment] read ${col}/${doc} skipped:`, e?.message || e); }
  }
  return null;
}
function makeOrderCode(prefix) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const time = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${String(prefix || 'RESEARCH').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}${time}${rand}`;
}
function makeQrUrl(payment, amount, orderCode) {
  return `https://img.vietqr.io/image/${encodeURIComponent(payment.bankId)}-${encodeURIComponent(payment.accountNo)}-compact2.png?amount=${encodeURIComponent(amount)}&addInfo=${encodeURIComponent(orderCode)}&accountName=${encodeURIComponent(payment.accountName)}`;
}

export default async function handler(req, res) {
  setJson(res);
  if (req.method === 'OPTIONS') return res.status(200).json({ success: true });
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  try {
    const body = readBody(req);
    const db = await getDb();
    const payment = normalizePayment(await readSavedPayment(db));

    let planId = body.planId || body.plan || '3m';
    if (planId === '1y') planId = '12m';
    if (planId === '1m') planId = '3m';
    const enabledPlans = Object.fromEntries(Object.entries(payment.plans).filter(([, p]) => p && p.enabled !== false));
    const plan = enabledPlans[planId] || enabledPlans[Object.keys(enabledPlans)[0]] || DEFAULT_PAYMENT.plans['3m'];
    planId = plan.id || planId;

    const uid = clean(body.uid || body.userId || '');
    const email = clean(body.email || '');
    const orderCode = clean(body.content || body.orderCode || body.paymentCode) || makeOrderCode(payment.transferPrefix);
    const amount = Number(body.amount || plan.amount || 0);
    const days = Number(plan.days || 0);
    const qrUrl = makeQrUrl(payment, amount, orderCode);

    const record = {
      orderCode, paymentCode: orderCode, status: 'pending', paid: false,
      planId, planName: plan.name, amount, days, uid, userId: uid, email,
      bankId: payment.bankId, bankBin: payment.bankId, bankCode: payment.bankCode, bankName: payment.bankName,
      accountNo: payment.accountNo, accountNumber: payment.accountNo, bankAccount: payment.accountNo,
      accountName: payment.accountName, accountOwner: payment.accountName,
      transferPrefix: payment.transferPrefix, baseUrl: payment.baseUrl,
      qrUrl, qrImageUrl: qrUrl,
      createdAt: new Date().toISOString(),
    };

    try { if (db) await db.collection('payments').doc(orderCode).set(record, { merge: true }); }
    catch (e) { console.warn('[create-payment] save payment skipped:', e?.message || e); }

    return res.status(200).json({ success: true, ...record });
  } catch (e) {
    const payment = normalizePayment(null);
    const plan = DEFAULT_PAYMENT.plans['3m'];
    const orderCode = makeOrderCode(payment.transferPrefix);
    const amount = plan.amount;
    const qrUrl = makeQrUrl(payment, amount, orderCode);
    return res.status(200).json({
      success: true,
      fallback: true,
      warning: e?.message || String(e),
      orderCode, paymentCode: orderCode,
      planId: '3m', planName: plan.name, amount, days: plan.days,
      ...payment,
      qrUrl, qrImageUrl: qrUrl,
    });
  }
}
