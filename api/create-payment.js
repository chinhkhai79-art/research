import { getAppSettings, getEnabledPlans, normalizePlanId } from '../lib/appSettings.js';
import { isSupabaseConfigured, createPayment as sbCreatePayment } from '../lib/supabaseAdmin.js';

function cors(req,res){ res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Content-Type'); if(req.method==='OPTIONS'){res.status(200).end(); return true;} return false; }
function safe(v){ return String(v || '').trim(); }
function datePartsVN(){
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date()).reduce((acc, part) => { acc[part.type] = part.value; return acc; }, {});
  return `${parts.day}${parts.month}${parts.year}${parts.hour}${parts.minute}${parts.second}`;
}
function makeOrderBase(prefix){ return (safe(prefix)||'TUBEKEY').toUpperCase().replace(/[^A-Z0-9]/g,'') + datePartsVN(); }
function isAlreadyExistsError(err){ const msg = String(err?.message || err || '').toLowerCase(); return msg.includes('409') || msg.includes('duplicate key') || msg.includes('already exists') || msg.includes('already_exist') || msg.includes('payments_pkey'); }
function qrUrl(payment, amount, orderCode){ return `https://img.vietqr.io/image/${encodeURIComponent(payment.bankId || payment.bankCode || '970416')}-${encodeURIComponent(payment.accountNo || payment.bankAccount)}-compact2.png?amount=${encodeURIComponent(amount)}&addInfo=${encodeURIComponent(orderCode)}&accountName=${encodeURIComponent(payment.accountName || payment.bankOwner || '')}`; }

export default async function handler(req,res){
  if(cors(req,res)) return;
  try{
    if(req.method !== 'POST') return res.status(405).json({ success:false, error:'Method not allowed. Use POST.' });
    if (!isSupabaseConfigured()) return res.status(500).json({ success:false, code:'SUPABASE_NOT_CONFIGURED', error:'Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trên Vercel. Thanh toán đã chuyển sang Supabase, không còn ghi Firestore.' });
    const body = req.body || {};
    const settings = await getAppSettings();
    const plans = getEnabledPlans(settings);
    const planId = normalizePlanId(body.planId || body.plan || '1m', settings);
    const plan = plans[planId];
    const payment = settings.payment;
    const pendingExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const amount = Number(plan.amount);
    const uid = safe(body.uid || body.userId || body.user_id);
    const email = safe(body.email || body.userEmail || '').toLowerCase();
    const returnUrl = safe(body.returnUrl || body.return || '/');
    const baseOrderCode = makeOrderBase(payment.paymentPrefix || payment.orderPrefix || 'TUBEKEY');
    let orderCode = '';
    let url = '';
    for (let i = 0; i < 100; i++) {
      const candidate = i === 0 ? baseOrderCode : `${baseOrderCode}${i + 1}`;
      const candidateUrl = qrUrl(payment, amount, candidate);
      try {
        await sbCreatePayment({
          orderCode: candidate,
          status: 'pending',
          paid: false,
          planId,
          planName: plan.name,
          amount,
          expectedAmount: amount,
          days: plan.days,
          uid,
          userId: uid,
          email,
          userEmail: email,
          returnUrl,
          bankName: payment.bankName,
          bankId: payment.bankId,
          accountNo: payment.accountNo,
          accountName: payment.accountName,
          qrUrl: candidateUrl,
          expiresAt: pendingExpiresAt.toISOString(),
          pendingExpiresAt: pendingExpiresAt.toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        orderCode = candidate;
        url = candidateUrl;
        break;
      } catch (err) {
        if (isAlreadyExistsError(err)) continue;
        throw err;
      }
    }
    if (!orderCode) throw new Error('Không tạo được mã chuyển khoản duy nhất. Vui lòng thử lại.');
    return res.status(200).json({ success:true, orderCode, paymentCode:orderCode, content:orderCode, planId, planName:plan.name, amount, days:plan.days, qrUrl:url, qrImageUrl:url, bankName:payment.bankName, bankId:payment.bankId, accountNo:payment.accountNo, accountNumber:payment.accountNo, accountName:payment.accountName, transferPrefix:payment.paymentPrefix, pendingExpiresAt:pendingExpiresAt.toISOString(), expiresAt:pendingExpiresAt.toISOString(), dataSource:'supabase' });
  }catch(e){
    console.error('create-payment error:', e);
    return res.status(500).json({ success:false, error:e.message || 'Server error' });
  }
}
