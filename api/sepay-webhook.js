import { getAppSettings } from '../lib/appSettings.js';

/**
 * SePay webhook — kích hoạt PRO khi nhận được tiền chuyển khoản.
 *
 * BẢO MẬT (rất quan trọng):
 * 1. BẮT BUỘC verify API key/secret: nếu env SEPAY_API_KEY hoặc settings.payment.sepaySecret
 *    được cấu hình, request KHÔNG có token đúng sẽ bị reject (401). Trước đó code
 *    "Nếu SePay có gửi token thì kiểm tra. Nếu không gửi token vẫn xử lý..." cho phép
 *    bất kỳ ai POST body giả mạo để kích hoạt PRO miễn phí.
 * 2. CHECK AMOUNT khớp tuyệt đối với đơn đã tạo trong payments/{orderCode}.
 *    Không nhận giá do trình duyệt gửi và không kích hoạt đơn không tồn tại.
 */

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
function tokenOf(req) {
  return s(req.headers.authorization || req.headers['x-api-key'] || req.headers.apikey || req.headers.api_key || '')
    .replace(/^Bearer\s+/i, '').replace(/^Apikey\s+/i, '').replace(/^ApiKey\s+/i, '');
}
async function getDb() {
  const mod = await import('../lib/firebaseAdmin.js');
  return { db: mod.db, FieldValue: mod.FieldValue || { serverTimestamp: () => new Date() } };
}
function addDays(base, days) { const d = new Date(base); d.setDate(d.getDate() + Number(days || 0)); return d; }
function toDate(v) { try { return v?.toDate?.() || (v ? new Date(v) : null); } catch { return null; } }
function findOrderCode(text, prefix) {
  const c = compact(text);
  const p = compact(prefix || 'TUBEKEY');
  const re = new RegExp(p + '\\d{12,}(?:\\d+)?');
  const m = c.match(re);
  return m ? m[0] : '';
}

async function activateSubscription({ db, FieldValue, payment, orderCode, body }) {
  const uid = s(payment.uid || payment.userId || body.uid || body.userId);
  const email = s(payment.email || payment.userEmail || body.email);
  const days = Number(payment.days || 0);
  const now = new Date();
  const planName = payment.planName || 'GÓI PRO';
  const planId = payment.planId || 'pro';
  let currentExpires = null;
  if (uid) {
    const u = await db.collection('users').doc(uid).get();
    currentExpires = toDate(u.data()?.premiumExpiresAt || u.data()?.expired_at || u.data()?.expiresAt || u.data()?.subscriptionInfo?.expiresAt);
  }
  const base = currentExpires && currentExpires > now ? currentExpires : now;
  const expiresAt = addDays(base, days || 30);
  const data = {
    active: true,
    premium: true,
    isPro: true,
    pro: true,
    status: 'PRO',
    account_type: 'premium',
    planId,
    planName,
    expiresAt,
    premiumExpiresAt: expiresAt,
    expired_at: expiresAt,
    premiumStartedAt: now,
    updatedAt: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
    lastPaymentOrderCode: orderCode,
    email
  };
  if (uid) {
    await db.collection('users').doc(uid).set({ uid, userId: uid, email, ...data, subscriptionInfo: data }, { merge: true });
    await db.collection('subscriptions').doc(uid).set({ uid, ...data }, { merge: true });
  }
  if (email) {
    await db.collection('subscriptions_by_email').doc(email.toLowerCase()).set({ email, ...data }, { merge: true });
  }
  return expiresAt;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method === 'GET') return res.status(200).json({ success: true, message: 'SePay webhook OK. Dùng URL này dán vào SePay.', method: 'POST' });

  try {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    const settings = await getAppSettings();
    const secret = s(settings.payment.sepaySecret || process.env.SEPAY_API_KEY || process.env.SEPAY_WEBHOOK_SECRET || '');
    const got = tokenOf(req);
    const { db, FieldValue } = await getDb();

    // === FIX #2: BẮT BUỘC verify nếu secret được cấu hình ===
    if (secret) {
      if (!got) {
        await db.collection('sepay_logs').add({
          status: 'reject_missing_token',
          reason: 'Webhook không gửi token mà server đã cấu hình secret bắt buộc.',
          ip: s(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || ''),
          rawBody: req.body || {},
          createdAt: FieldValue.serverTimestamp()
        });
        return res.status(401).json({ success: false, error: 'Missing SePay API Key/Webhook token' });
      }
      if (got !== secret) {
        await db.collection('sepay_logs').add({
          status: 'reject_invalid_token',
          reason: 'Token không khớp.',
          ip: s(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || ''),
          rawBody: req.body || {},
          createdAt: FieldValue.serverTimestamp()
        });
        return res.status(401).json({ success: false, error: 'Invalid SePay API Key/Webhook Secret' });
      }
    } else {
      // Chưa cấu hình secret — ghi cảnh báo để admin nhớ bật.
      await db.collection('sepay_logs').add({
        status: 'warning_no_secret_configured',
        reason: 'Webhook chưa cấu hình SEPAY_API_KEY/sepaySecret. Vui lòng đặt để bật xác thực.',
        createdAt: FieldValue.serverTimestamp()
      });
    }

    const body = req.body || {};
    const transferType = typeOf(body);
    const amount = amountOf(body);
    const content = contentOf(body);

    if (transferType && !['in', 'receive', 'deposit', 'credit'].includes(transferType)) {
      return res.status(200).json({ success: true, updated: false, message: 'Skipped non-in transaction' });
    }

    const orderCode = findOrderCode(content + ' ' + JSON.stringify(body), settings.payment.paymentPrefix);
    if (!orderCode) {
      await db.collection('sepay_logs').add({
        status: 'no_order_code',
        amount, content, body,
        createdAt: FieldValue.serverTimestamp()
      });
      return res.status(200).json({ success: true, updated: false, message: 'No order code found' });
    }

    const ref = db.collection('payments').doc(orderCode);
    const snap = await ref.get();
    if (!snap.exists) {
      await db.collection('sepay_logs').add({
        status: 'reject_unknown_order',
        orderCode, amount, content, body,
        createdAt: FieldValue.serverTimestamp()
      });
      return res.status(200).json({ success: true, updated: false, paid: false, orderCode, error: 'Unknown order', message: 'Không tìm thấy đơn thanh toán đã được tạo trên hệ thống.' });
    }
    const payment = snap.data();

    // Đối chiếu đúng số tiền đã được server chốt tại thời điểm tạo đơn.
    const expectedAmount = Number(payment.amount || 0);
    const amountOk = expectedAmount > 0 && Number(amount) === expectedAmount;

    if (!amountOk) {
      await db.collection('sepay_logs').add({
        status: 'reject_amount_mismatch',
        orderCode,
        receivedAmount: amount,
        expectedAmount,
        diff: amount - expectedAmount,
        content, body,
        createdAt: FieldValue.serverTimestamp()
      });
      await ref.set({
        status: 'amount_mismatch',
        amountMismatchReceived: amount,
        amountMismatchAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      return res.status(200).json({
        success: true, updated: false, paid: false, orderCode,
        error: 'Amount mismatch', received: amount, expected: expectedAmount,
        message: `Số tiền chuyển (${amount.toLocaleString('vi-VN')} VND) không khớp đơn (${expectedAmount.toLocaleString('vi-VN')} VND). Đã ghi log, không kích hoạt PRO.`
      });
    }

    // Idempotency: đơn đã paid → không activate lại
    if (payment.paid === true) {
      await db.collection('sepay_logs').add({
        status: 'duplicate_paid_skipped',
        orderCode, amount, content,
        createdAt: FieldValue.serverTimestamp()
      });
      return res.status(200).json({ success: true, updated: false, paid: true, orderCode, message: 'Đơn đã được thanh toán trước đó.' });
    }

    const expiresAt = await activateSubscription({ db, FieldValue, payment, orderCode, body });
    const paidData = {
      orderCode, paid: true, status: 'paid',
      amount: amount || payment.amount || 0,
      expectedAmount,
      content, rawBody: body,
      planId: payment.planId || '1m',
      planName: payment.planName || 'GÓI PRO',
      days: payment.days || 30,
      email: payment.email || payment.userEmail || body.email || '',
      uid: payment.uid || payment.userId || body.uid || body.userId || '',
      expiresAt,
      paidAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    await ref.set(paidData, { merge: true });
    await db.collection('paid_orders').doc(orderCode).set(paidData, { merge: true });
    await db.collection('sepay_logs').add({
      status: 'success_paid',
      orderCode, amount, expectedAmount, content,
      createdAt: FieldValue.serverTimestamp()
    });

    const email = paidData.email;
    if (email) {
      import('../lib/mailer.js').then(m => m.sendPaymentSuccessEmail({
        email, orderCode, planName: paidData.planName, amount: paidData.amount,
        expiresAt: expiresAt?.toISOString?.(), settings
      })).catch(err => console.error('send email warning:', err));
    }
    return res.status(200).json({ success: true, updated: true, paid: true, orderCode, expiresAt, message: 'Payment confirmed. PRO activated.' });
  } catch (e) {
    console.error('sepay webhook error:', e);
    return res.status(500).json({ success: false, error: e.message || 'Webhook error' });
  }
}
