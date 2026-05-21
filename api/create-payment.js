import { getAppSettings, publicPaymentSettings } from '../lib/appSettings.js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

function pick(obj, keys, fallback = '') {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== '') return String(obj[k]).trim();
  }
  return fallback;
}

function onlyDigits(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

async function getDbSafe() {
  try {
    const mod = await import('../lib/firebaseAdmin.js');
    if (typeof mod.getFirestoreDb === 'function') return mod.getFirestoreDb();
    if (mod.db) return mod.db;
    if (mod.default?.db) return mod.default.db;
  } catch (e) {
    console.warn('[create-payment] Firebase unavailable:', e?.message || e);
  }
  return null;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).json({ success: true });
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = await readBody(req);
    const q = req.query || {};
    const input = { ...q, ...body };

    const settings = await getAppSettings();
    const payment = publicPaymentSettings(settings);
    const plans = payment.plans || [];

    const planId = pick(input, ['planId', 'plan', 'id'], '3m');
    const selectedPlan = plans.find(p => String(p.id) === String(planId)) || plans[0] || { id: '3m', name: 'Gói 3 tháng', amount: 180000, days: 90 };

    const amount = Number(onlyDigits(pick(input, ['amount'], selectedPlan.amount))) || Number(selectedPlan.amount) || 180000;
    const uid = pick(input, ['uid', 'userId'], 'guest');
    const email = pick(input, ['email'], '');
    const prefix = (payment.transferPrefix || 'RESEARCH').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20) || 'RESEARCH';
    const paymentCode = `${prefix}${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
    const transferContent = paymentCode;

    const bankName = payment.bankName || 'ACB';
    const accountNumber = payment.accountNumber || '';
    const accountName = payment.accountName || '';

    const qrUrl = `https://img.vietqr.io/image/${encodeURIComponent(bankName)}-${encodeURIComponent(accountNumber)}-compact2.png?amount=${encodeURIComponent(amount)}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(accountName)}`;

    let saved = false;
    let saveWarning = '';
    const db = await getDbSafe();
    if (db) {
      try {
        await db.collection('payments').doc(paymentCode).set({
          status: 'pending',
          paymentCode,
          orderCode: paymentCode,
          transferContent,
          uid,
          userId: uid,
          email,
          planId: selectedPlan.id,
          planName: selectedPlan.name,
          days: Number(selectedPlan.days) || 0,
          amount,
          bankName,
          accountNumber,
          accountName,
          createdAt: new Date().toISOString(),
          source: 'create-payment'
        }, { merge: true });
        saved = true;
      } catch (e) {
        saveWarning = e?.message || String(e);
        console.warn('[create-payment] cannot save payment:', saveWarning);
      }
    } else {
      saveWarning = 'Firebase Admin chưa sẵn sàng nên chưa lưu được đơn pending.';
    }

    return res.status(200).json({
      success: true,
      paid: false,
      saved,
      warning: saveWarning || undefined,
      plan: selectedPlan,
      planId: selectedPlan.id,
      planName: selectedPlan.name,
      days: selectedPlan.days,
      amount,
      bankName,
      accountNumber,
      accountName,
      email,
      uid,
      userId: uid,
      paymentCode,
      orderCode: paymentCode,
      transferContent,
      qrUrl,
      qrImage: qrUrl
    });
  } catch (error) {
    console.error('[create-payment] fatal:', error);
    return res.status(200).json({
      success: false,
      error: error?.message || String(error)
    });
  }
}
