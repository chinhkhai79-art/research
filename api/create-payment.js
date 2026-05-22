import { getAppSettings, getEnabledPlans, normalizePlanId } from '../lib/appSettings.js';

function cors(req,res){ res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Content-Type'); if(req.method==='OPTIONS'){res.status(200).end(); return true;} return false; }
function safe(v){ return String(v || '').trim(); }
function makeOrder(prefix){ return (safe(prefix)||'RESEARCH').toUpperCase().replace(/[^A-Z0-9]/g,'') + Date.now() + Math.floor(Math.random()*900+100); }
async function getDb(){ const mod = await import('../lib/firebaseAdmin.js'); return { db:mod.db, FieldValue:mod.FieldValue || { serverTimestamp:()=>new Date() } }; }
function qrUrl(payment, amount, orderCode){ return `https://img.vietqr.io/image/${encodeURIComponent(payment.bankId || payment.bankCode || '970416')}-${encodeURIComponent(payment.accountNo || payment.bankAccount)}-compact2.png?amount=${encodeURIComponent(amount)}&addInfo=${encodeURIComponent(orderCode)}&accountName=${encodeURIComponent(payment.accountName || payment.bankOwner || '')}`; }

export default async function handler(req,res){
  if(cors(req,res)) return;
  try{
    if(req.method !== 'POST') return res.status(405).json({ success:false, error:'Method not allowed. Use POST.' });
    const body = req.body || {};
    const settings = await getAppSettings();
    const plans = getEnabledPlans(settings);
    const planId = normalizePlanId(body.planId || body.plan || '3m', settings);
    const plan = plans[planId];
    const payment = settings.payment;
    const orderCode = safe(body.content || body.orderCode) || makeOrder(payment.paymentPrefix || payment.orderPrefix || 'RESEARCH');
    const amount = Number(body.amount || plan.amount);
    const uid = safe(body.uid || body.userId || body.user_id);
    const email = safe(body.email || body.userEmail || '');
    const returnUrl = safe(body.returnUrl || body.return || '/');
    const url = qrUrl(payment, amount, orderCode);
    try{
      const { db, FieldValue } = await getDb();
      await db.collection('payments').doc(orderCode).set({
        orderCode, status:'pending', paid:false, planId, planName:plan.name, amount, days:plan.days,
        uid, userId:uid, email, userEmail:email, returnUrl,
        bankName:payment.bankName, bankId:payment.bankId, accountNo:payment.accountNo, accountName:payment.accountName,
        qrUrl:url, createdAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp()
      }, { merge:true });
    }catch(storeErr){ console.error('create-payment store warning:', storeErr); }
    return res.status(200).json({ success:true, orderCode, paymentCode:orderCode, content:orderCode, planId, planName:plan.name, amount, days:plan.days, qrUrl:url, qrImageUrl:url, bankName:payment.bankName, bankId:payment.bankId, accountNo:payment.accountNo, accountNumber:payment.accountNo, accountName:payment.accountName, transferPrefix:payment.paymentPrefix });
  }catch(e){
    console.error('create-payment error:', e);
    return res.status(500).json({ success:false, error:e.message || 'Server error' });
  }
}
