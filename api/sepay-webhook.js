import { getAppSettings } from '../lib/appSettings.js';
import {
  isSupabaseConfigured,
  getPayment as sbGetPayment,
  patchPayment as sbPatchPayment,
  upsertUser as sbUpsertUser,
  addSepayLog as sbAddSepayLog,
  getUserByUid as sbGetUserByUid,
  findUsersByEmail as sbFindUsersByEmail
} from '../lib/supabaseAdmin.js';

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-api-key,apikey,api_key');
  if (req.method === 'OPTIONS') { res.status(200).end(); return true; }
  return false;
}
function s(v) { return String(v ?? '').trim(); }
function compact(v) { return s(v).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Đ/g, 'D').replace(/[^A-Z0-9]/g, ''); }
function amountOf(b) { return Number(b.transferAmount || b.amount || b.money || b.value || b.transactionAmount || b.data?.transferAmount || b.data?.amount || 0); }
function contentOf(b) { return s(b.content || b.description || b.transferContent || b.transactionContent || b.note || b.code || b.data?.content || b.data?.description || b.data?.transferContent || ''); }
function typeOf(b) { return s(b.transferType || b.type || b.data?.transferType || b.data?.type || 'in').toLowerCase(); }
function tokenOf(req) { return s(req.headers.authorization || req.headers['x-api-key'] || req.headers.apikey || req.headers.api_key || '').replace(/^Bearer\s+/i, '').replace(/^Apikey\s+/i, '').replace(/^ApiKey\s+/i, ''); }
function addDays(base, days) { const d = new Date(base); d.setDate(d.getDate() + Number(days || 0)); return d; }
function toDate(v) { try { return v ? new Date(v) : null; } catch { return null; } }
function findOrderCode(text, prefix) { const c = compact(text); const p = compact(prefix || 'TUBEKEY'); const re = new RegExp(p + '\\d{12,}(?:\\d+)?'); const m = c.match(re); return m ? m[0] : ''; }
async function safeLog(data) { try { await sbSepayLog(data); } catch (e) { console.error('sepay log error:', e); } }
async function sbSepayLog(data) { return sbAddSepayLog(data); }

async function activateSubscription({ payment, orderCode, body }) {
  const uid = s(payment.uid || payment.userId || body.uid || body.userId);
  const email = s(payment.email || payment.userEmail || body.email).toLowerCase();
  const days = Number(payment.days || 0);
  const now = new Date();
  const planName = payment.planName || 'GÓI PRO';
  const planId = payment.planId || 'pro';
  let current = null;
  if (uid) current = (await sbGetUserByUid(uid))?.data || null;
  if (!current && email) {
    const byEmail = await sbFindUsersByEmail(email, 1);
    current = byEmail[0]?.data || null;
  }
  const currentExpires = toDate(current?.premiumExpiresAt || current?.expired_at || current?.expiresAt || current?.subscriptionInfo?.expiresAt);
  const base = currentExpires && currentExpires > now ? currentExpires : now;
  const expiresAt = addDays(base, days || 30);
  const data = {
    ...(current || {}),
    uid: uid || current?.uid || current?.userId || `manual_${email || orderCode}`,
    userId: uid || current?.userId || current?.uid || `manual_${email || orderCode}`,
    email: email || current?.email || '',
    active: true,
    premium: true,
    isPro: true,
    pro: true,
    status: 'PRO',
    account_type: 'premium',
    planId,
    planName,
    expiresAt: expiresAt.toISOString(),
    premiumExpiresAt: expiresAt.toISOString(),
    expired_at: expiresAt.toISOString(),
    premiumStartedAt: current?.premiumStartedAt || now.toISOString(),
    updatedAt: now.toISOString(),
    updated_at: now.toISOString(),
    lastPaymentOrderCode: orderCode,
    lastPaymentAmount: Number(payment.amount || payment.expectedAmount || 0)
  };
  await sbUpsertUser(data.userId, data);
  return expiresAt;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method === 'GET') return res.status(200).json({ success: true, message: 'SePay webhook OK. Dùng URL này dán vào SePay.', method: 'POST' });
  try {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
    if (!isSupabaseConfigured()) return res.status(500).json({ success:false, code:'SUPABASE_NOT_CONFIGURED', error:'Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY. Webhook đã chuyển sang Supabase, không còn ghi Firestore.' });
    const settings = await getAppSettings();
    const secret = s(settings.payment.sepaySecret || process.env.SEPAY_API_KEY || process.env.SEPAY_WEBHOOK_SECRET || '');
    const got = tokenOf(req);
    if (secret) {
      if (!got) {
        await safeLog({ status:'reject_missing_token', reason:'Webhook không gửi token mà server đã cấu hình secret bắt buộc.', ip:s(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || ''), raw:req.body || {} });
        return res.status(401).json({ success: false, error: 'Missing SePay API Key/Webhook token' });
      }
      if (got !== secret) {
        await safeLog({ status:'reject_invalid_token', reason:'Token không khớp.', ip:s(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || ''), raw:req.body || {} });
        return res.status(401).json({ success: false, error: 'Invalid SePay API Key/Webhook Secret' });
      }
    } else {
      await safeLog({ status:'warning_no_secret_configured', reason:'Webhook chưa cấu hình SEPAY_API_KEY/sepaySecret. Vui lòng đặt để bật xác thực.', raw:req.body || {} });
    }
    const body = req.body || {};
    const transferType = typeOf(body);
    const amount = amountOf(body);
    const content = contentOf(body);
    if (transferType && !['in', 'receive', 'deposit', 'credit'].includes(transferType)) return res.status(200).json({ success: true, updated: false, message: 'Skipped non-in transaction' });
    const orderCode = findOrderCode(content + ' ' + JSON.stringify(body), settings.payment.paymentPrefix);
    if (!orderCode) {
      await safeLog({ status:'no_order_code', amount, content, raw:body });
      return res.status(200).json({ success: true, updated: false, message: 'No order code found' });
    }
    const item = await sbGetPayment(orderCode);
    if (!item) {
      await safeLog({ status:'reject_unknown_order', orderCode, amount, content, raw:body });
      return res.status(200).json({ success: true, updated: false, paid: false, orderCode, error: 'Unknown order', message: 'Không tìm thấy đơn thanh toán đã được tạo trên hệ thống.' });
    }
    const payment = item.data;
    const expectedAmount = Number(payment.amount || payment.expectedAmount || 0);
    const amountOk = expectedAmount > 0 && Number(amount) === expectedAmount;
    if (!amountOk) {
      await safeLog({ status:'reject_amount_mismatch', orderCode, receivedAmount:amount, expectedAmount, diff:amount - expectedAmount, content, raw:body });
      await sbPatchPayment(orderCode, { ...payment, status:'amount_mismatch', amountMismatchReceived: amount, amountMismatchAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      return res.status(200).json({ success: true, updated: false, paid: false, orderCode, error: 'Amount mismatch', received: amount, expected: expectedAmount, message: `Số tiền chuyển (${amount.toLocaleString('vi-VN')} VND) không khớp đơn (${expectedAmount.toLocaleString('vi-VN')} VND). Đã ghi log, không kích hoạt PRO.` });
    }
    if (payment.paid === true) {
      await safeLog({ status:'duplicate_paid_skipped', orderCode, amount, content, raw:body });
      return res.status(200).json({ success: true, updated: false, paid: true, orderCode, message: 'Đơn đã được thanh toán trước đó.' });
    }
    const expiresAt = await activateSubscription({ payment, orderCode, body });
    const paidData = {
      ...payment,
      orderCode,
      paid: true,
      status: 'paid',
      amount: amount || payment.amount || 0,
      expectedAmount,
      content,
      rawBody: body,
      planId: payment.planId || '1m',
      planName: payment.planName || 'GÓI PRO',
      days: payment.days || 30,
      email: payment.email || payment.userEmail || body.email || '',
      uid: payment.uid || payment.userId || body.uid || body.userId || '',
      expiresAt: expiresAt.toISOString(),
      paidAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await sbPatchPayment(orderCode, paidData);
    await safeLog({ status:'success_paid', orderCode, amount, expectedAmount, content, raw:body });
    const email = paidData.email;
    if (email) {
      import('../lib/mailer.js').then(m => m.sendPaymentSuccessEmail({ email, orderCode, planName: paidData.planName, amount: paidData.amount, expiresAt: expiresAt?.toISOString?.(), settings })).catch(err => console.error('send email warning:', err));
    }
    return res.status(200).json({ success: true, updated: true, paid: true, orderCode, expiresAt: expiresAt.toISOString(), message: 'Payment confirmed. PRO activated.', dataSource:'supabase' });
  } catch (e) {
    console.error('sepay webhook error:', e);
    return res.status(500).json({ success: false, error: e.message || 'Webhook error' });
  }
}
