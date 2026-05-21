import { db, FieldValue, Timestamp } from '../lib/firebaseAdmin.js';
import { setCors } from '../lib/cors.js';
import { sendPaymentSuccessEmail } from '../lib/mailer.js';
import { getAppSettings, getEnabledPlans } from '../lib/appSettings.js';

function getAuthToken(req){
  return String(
    req.headers.authorization ||
    req.headers['x-api-key'] ||
    req.headers['x-webhook-secret'] ||
    req.headers.apikey ||
    req.headers.api_key ||
    ''
  )
    .replace(/^Bearer\s+/i,'')
    .replace(/^Apikey\s+/i,'')
    .replace(/^ApiKey\s+/i,'')
    .trim();
}
function norm(t){ return String(t||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/Đ/g,'D'); }
function compact(t){ return norm(t).replace(/[^A-Z0-9]/g,''); }
function amount(b){
  const r = b.transferAmount ?? b.amount ?? b.money ?? b.value ?? b.transactionAmount ?? b.transaction_amount ?? b.data?.transferAmount ?? b.data?.amount ?? 0;
  return typeof r === 'number' ? r : Number(String(r||'').replace(/[^\d]/g,'')) || 0;
}
function content(b){
  return String(b.content || b.description || b.transferContent || b.transactionContent || b.transaction_content || b.note || b.code || b.referenceCode || b.reference_code || b.data?.content || b.data?.description || b.data?.transferContent || '');
}
function typeOf(b){ return String(b.transferType || b.type || b.transactionType || b.data?.transferType || b.data?.type || 'in').toLowerCase(); }
function toDate(v){ return v?.toDate?.() || (v ? new Date(v) : null); }
function addDays(d, days){ return new Date(d.getTime() + Number(days) * 86400000); }
async function logWebhook(data){ try{ await db.collection('sepay_logs').add({ app:'research', ...data, createdAt:FieldValue.serverTimestamp() }); }catch(e){ console.error('LOG WEBHOOK ERROR:', e); } }
function planByAmount(v, settings){
  const arr = Object.entries(getEnabledPlans(settings)).sort((a,b)=>Number(b[1].amount)-Number(a[1].amount));
  for (const [id,p] of arr) if (v >= Number(p.amount)) return { planId:id, planName:p.name, days:Number(p.days) };
  const [id,p] = arr[arr.length-1] || ['3m',{name:'GÓI 3 THÁNG',days:90}];
  return { planId:id, planName:p.name, days:Number(p.days) };
}

async function sendSuccessEmailOnce({ orderCode, userEmail, userName, planName, amount, expiresAtDate, paidOrderBefore, smtp, toolUrl }){
  if (!userEmail) return { success:false, skipped:true, error:'Missing userEmail' };
  if (paidOrderBefore?.emailSent) return { success:true, skipped:true, messageId:paidOrderBefore.emailMessageId || null };
  const result = await sendPaymentSuccessEmail({ to:userEmail, name:userName || userEmail, planName, amount, orderCode, expiresAt:expiresAtDate, toolUrl }, smtp);
  await db.collection('paid_orders').doc(orderCode).set({
    emailSent:Boolean(result.success),
    emailSkipped:Boolean(result.skipped),
    emailMessageId:result.messageId || null,
    emailError:result.error || null,
    emailSentAt:result.success ? FieldValue.serverTimestamp() : null,
    updatedAt:FieldValue.serverTimestamp()
  }, { merge:true });
  return result;
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  let settings;
  try {
    settings = await getAppSettings();
  } catch (e) {
    console.error('LOAD SETTINGS ERROR:', e);
    return res.status(500).json({ success:false, message:'Không tải được cấu hình Firestore/appSettings.', error:e.message || String(e) });
  }

  const pay = settings.payment || {};
  const secret = String(
    pay.webhookSecret ||
    settings.sepay?.webhookSecret ||
    process.env.SEPAY_API_KEY ||
    ''
  ).trim();

  // Quan trọng: mở trực tiếp /api/sepay-webhook trên trình duyệt phải trả 200 để dễ kiểm tra, không crash 500.
  if (req.method !== 'POST') {
    return res.status(200).json({
      success:true,
      message:'Research SePay webhook is running. Please send POST JSON from SePay.',
      endpoint:'/api/sepay-webhook',
      prefix: pay.orderPrefix || 'RESEARCH',
      hasWebhookSecret: Boolean(secret),
      method:req.method
    });
  }

  try {
    if (!secret) {
      await logWebhook({ status:'missing_webhook_secret', body:req.body || {} });
      return res.status(500).json({ success:false, message:'Chưa cấu hình Webhook Secret. Vào /admin-settings.html nhập API Key/Webhook Secret SePay.' });
    }

    const token = getAuthToken(req);
    if (!token || token !== secret) {
      await logWebhook({ status:'invalid_api_key', tokenPreview: token ? token.slice(0,6)+'...' : '(empty)', body:req.body || {} });
      return res.status(401).json({ success:false, message:'Invalid API Key' });
    }

    const body = req.body || {};
    const transferType = typeOf(body);
    const receivedAmount = amount(body);
    const receivedContent = content(body);

    if (transferType && !['in','deposit','credit','money_in','receive'].includes(transferType)) {
      await logWebhook({ status:'skip_not_money_in', transferType, amount:receivedAmount, content:receivedContent, body });
      return res.status(200).json({ success:true, updated:false, message:'Skipped because this is not money in.' });
    }

    const orderPrefix = pay.orderPrefix || 'RESEARCH';
    const match = compact(receivedContent + ' ' + JSON.stringify(body)).match(new RegExp(compact(orderPrefix) + '\\d+', 'i'));
    if (!match) {
      await logWebhook({ status:'no_order_code', amount:receivedAmount, content:receivedContent, body });
      return res.status(200).json({ success:true, updated:false, message:`No ${orderPrefix} order code found.` });
    }

    const orderCode = match[0].toUpperCase();
    const paymentRef = db.collection('payments').doc(orderCode);
    const paidOrderRef = db.collection('paid_orders').doc(orderCode);
    const [paymentSnap, paidOrderSnap] = await Promise.all([paymentRef.get(), paidOrderRef.get()]);
    const payment = paymentSnap.exists ? paymentSnap.data() : null;
    const paidOrderBefore = paidOrderSnap.exists ? paidOrderSnap.data() : null;
    const amountPlan = planByAmount(receivedAmount, settings);
    const plan = payment?.planId
      ? { planId:payment.planId, planName:payment.planName || amountPlan.planName, days:Number(payment.days || amountPlan.days) }
      : amountPlan;

    const paidAtDate = new Date();
    const userId = String(payment?.userId || '').trim();
    const userEmail = String(payment?.userEmail || '').trim();
    const userName = String(payment?.userName || payment?.displayName || userEmail || '').trim();

    let currentUser = null;
    if (userId) {
      const userSnap = await db.collection('users').doc(userId).get();
      currentUser = userSnap.exists ? userSnap.data() : null;
    }

    const oldExpiresAt = toDate(currentUser?.premiumExpiresAt) || toDate(currentUser?.expired_at);
    const baseDate = oldExpiresAt && oldExpiresAt.getTime() > paidAtDate.getTime() ? oldExpiresAt : paidAtDate;
    const expiresAtDate = addDays(baseDate, plan.days);

    const common = {
      app:'research', orderCode, paid:true, status:'paid', amount:receivedAmount, content:receivedContent,
      planId:plan.planId, planName:plan.planName, days:plan.days,
      userId, userEmail, userName, rawBody:body,
      cumulative:Boolean(oldExpiresAt && oldExpiresAt.getTime() > paidAtDate.getTime()),
      cumulativeBaseAt:Timestamp.fromDate(baseDate),
      previousExpiresAt:oldExpiresAt ? Timestamp.fromDate(oldExpiresAt) : null,
      paidAt:FieldValue.serverTimestamp(),
      expiresAt:Timestamp.fromDate(expiresAtDate),
      updatedAt:FieldValue.serverTimestamp()
    };

    await paidOrderRef.set(common, { merge:true });
    await paymentRef.set({ ...common, paidAmount:receivedAmount, sepayContent:receivedContent }, { merge:true });

    if (userId) {
      await db.collection('users').doc(userId).set({
        account_type:'premium', premium:true, active:true,
        planId:plan.planId, planName:plan.planName,
        premiumStartedAt:Timestamp.fromDate(paidAtDate),
        premiumExpiresAt:Timestamp.fromDate(expiresAtDate),
        expired_at:Timestamp.fromDate(expiresAtDate),
        lastPaymentOrderCode:orderCode,
        lastPaymentAmount:receivedAmount,
        lastPaymentAt:FieldValue.serverTimestamp(),
        updated_at:FieldValue.serverTimestamp()
      }, { merge:true });
    }

    const emailResult = await sendSuccessEmailOnce({
      orderCode, userEmail, userName, planName:plan.planName, amount:receivedAmount,
      expiresAtDate, paidOrderBefore, smtp:settings.smtp, toolUrl:(pay.appDomain || 'https://research.vanthemmo.com') + '/'
    });

    await logWebhook({ status:'success_paid', orderCode, amount:receivedAmount, content:receivedContent, planId:plan.planId, userId, userEmail, emailSent:Boolean(emailResult.success), emailSkipped:Boolean(emailResult.skipped), emailError:emailResult.error || null, body });

    return res.status(200).json({ success:true, updated:true, paid:true, message:'Payment confirmed. PRO activated.', orderCode, amount:receivedAmount, planId:plan.planId, planName:plan.planName, expiresAt:expiresAtDate.toISOString(), userId, emailSent:Boolean(emailResult.success), emailSkipped:Boolean(emailResult.skipped), emailError:emailResult.error || null });
  } catch(e){
    console.error('SEPAY WEBHOOK ERROR:', e);
    await logWebhook({ status:'error', error:e.message || String(e), body:req.body || {} });
    return res.status(500).json({ success:false, message:'Webhook error', error:e.message || 'Server error' });
  }
}
