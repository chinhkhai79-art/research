import { getAppSettings } from '../lib/appSettings.js';

function cors(req,res){ res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization,x-api-key,apikey,api_key'); if(req.method==='OPTIONS'){res.status(200).end(); return true;} return false; }
function s(v){ return String(v ?? '').trim(); }
function compact(v){ return s(v).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/Đ/g,'D').replace(/[^A-Z0-9]/g,''); }
function amountOf(b){ return Number(b.transferAmount || b.amount || b.money || b.value || b.transactionAmount || b.data?.transferAmount || b.data?.amount || 0); }
function contentOf(b){ return s(b.content || b.description || b.transferContent || b.transactionContent || b.note || b.code || b.data?.content || b.data?.description || b.data?.transferContent || ''); }
function typeOf(b){ return s(b.transferType || b.type || b.data?.transferType || b.data?.type || 'in').toLowerCase(); }
function tokenOf(req){ return s(req.headers.authorization || req.headers['x-api-key'] || req.headers.apikey || req.headers.api_key || '').replace(/^Bearer\s+/i,'').replace(/^Apikey\s+/i,'').replace(/^ApiKey\s+/i,''); }
async function getDb(){ const mod = await import('../lib/firebaseAdmin.js'); return { db:mod.db, FieldValue:mod.FieldValue || { serverTimestamp:()=>new Date() } }; }
function addDays(base, days){ const d = new Date(base); d.setDate(d.getDate() + Number(days || 0)); return d; }
function toDate(v){ try { return v?.toDate?.() || (v ? new Date(v) : null); } catch { return null; } }
function findOrderCode(text, prefix){
  const c = compact(text);
  const p = compact(prefix || 'RESEARCH');
  const re = new RegExp(p + '\\d{8,}');
  const m = c.match(re);
  return m ? m[0] : '';
}

async function activateSubscription({ db, FieldValue, payment, orderCode, body }){
  const uid = s(payment.uid || payment.userId || body.uid || body.userId);
  const email = s(payment.email || payment.userEmail || body.email);
  const days = Number(payment.days || 0);
  const now = new Date();
  const planName = payment.planName || 'GÓI PRO';
  const planId = payment.planId || 'pro';
  let currentExpires = null;
  if(uid){
    const u = await db.collection('users').doc(uid).get();
    currentExpires = toDate(u.data()?.subscriptionInfo?.expiresAt || u.data()?.expiresAt);
  }
  const base = currentExpires && currentExpires > now ? currentExpires : now;
  const expiresAt = addDays(base, days || 30);
  const data = { active:true, isPro:true, status:'PRO', planId, planName, expiresAt, updatedAt:FieldValue.serverTimestamp(), lastPaymentOrderCode:orderCode, email };
  if(uid){
    await db.collection('users').doc(uid).set({ uid, email, isPro:true, pro:true, subscriptionInfo:data, planId, planName, expiresAt, updatedAt:FieldValue.serverTimestamp() }, { merge:true });
    await db.collection('subscriptions').doc(uid).set({ uid, ...data }, { merge:true });
  }
  if(email){
    await db.collection('subscriptions_by_email').doc(email.toLowerCase()).set({ email, ...data }, { merge:true });
  }
  return expiresAt;
}

export default async function handler(req,res){
  if(cors(req,res)) return;
  if(req.method === 'GET') return res.status(200).json({ success:true, message:'SePay webhook OK. Dùng URL này dán vào SePay.', method:'POST' });
  try{
    if(req.method !== 'POST') return res.status(405).json({ success:false, error:'Method not allowed' });
    const settings = await getAppSettings();
    const secret = s(settings.payment.sepaySecret || process.env.SEPAY_API_KEY || process.env.SEPAY_WEBHOOK_SECRET || '');
    const got = tokenOf(req);
    // Nếu SePay có gửi token thì kiểm tra. Nếu không gửi token vẫn xử lý để tránh miss giao dịch do cấu hình SePay khác kiểu header.
    if(secret && got && got !== secret) return res.status(401).json({ success:false, error:'Invalid SePay API Key/Webhook Secret' });
    const body = req.body || {};
    const transferType = typeOf(body);
    const amount = amountOf(body);
    const content = contentOf(body);
    if(transferType && !['in','receive','deposit','credit'].includes(transferType)) return res.status(200).json({ success:true, updated:false, message:'Skipped non-in transaction' });
    const orderCode = findOrderCode(content + ' ' + JSON.stringify(body), settings.payment.paymentPrefix);
    const { db, FieldValue } = await getDb();
    if(!orderCode){
      await db.collection('sepay_logs').add({ status:'no_order_code', amount, content, body, createdAt:FieldValue.serverTimestamp() });
      return res.status(200).json({ success:true, updated:false, message:'No order code found' });
    }
    const ref = db.collection('payments').doc(orderCode);
    const snap = await ref.get();
    const payment = snap.exists ? snap.data() : { orderCode, amount, planId:'3m', planName:'GÓI 3 THÁNG', days:90 };
    const expiresAt = await activateSubscription({ db, FieldValue, payment, orderCode, body });
    const paidData = { orderCode, paid:true, status:'paid', amount:amount || payment.amount || 0, content, rawBody:body, planId:payment.planId || '3m', planName:payment.planName || 'GÓI 3 THÁNG', days:payment.days || 90, email:payment.email || payment.userEmail || body.email || '', uid:payment.uid || payment.userId || body.uid || body.userId || '', expiresAt, paidAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp() };
    await ref.set(paidData, { merge:true });
    await db.collection('paid_orders').doc(orderCode).set(paidData, { merge:true });
    await db.collection('sepay_logs').add({ status:'success_paid', orderCode, amount, content, createdAt:FieldValue.serverTimestamp() });

    // Trả kết quả ngay cho SePay, email gửi nền để giảm độ trễ.
    const email = paidData.email;
    if(email){
      import('../lib/mailer.js').then(m => m.sendPaymentSuccessEmail({ email, orderCode, planName:paidData.planName, amount:paidData.amount, expiresAt:expiresAt?.toISOString?.(), settings })).catch(err => console.error('send email warning:', err));
    }
    return res.status(200).json({ success:true, updated:true, paid:true, orderCode, expiresAt, message:'Payment confirmed. PRO activated.' });
  }catch(e){ console.error('sepay webhook error:', e); return res.status(500).json({ success:false, error:e.message || 'Webhook error' }); }
}
