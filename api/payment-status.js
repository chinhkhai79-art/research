import { isSupabaseConfigured, getPayment as sbGetPayment, patchPayment as sbPatchPayment } from '../lib/supabaseAdmin.js';

function cors(req,res){ res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Content-Type'); if(req.method==='OPTIONS'){res.status(200).end(); return true;} return false; }
function toDate(v){ try{ return v ? new Date(v) : null; }catch{return null;} }
function iso(v){ const d = toDate(v); return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null; }
const PENDING_TTL_MS = 5 * 60 * 1000;

export default async function handler(req,res){
  if(cors(req,res)) return;
  try{
    const orderCode = String(req.query.orderCode || req.query.content || '').trim().toUpperCase();
    if(!orderCode) return res.status(400).json({ success:false, paid:false, error:'Missing orderCode' });
    if (!isSupabaseConfigured()) return res.status(200).json({ success:true, paid:false, status:'pending', code:'SUPABASE_NOT_CONFIGURED', warning:'Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY. Trạng thái thanh toán đã chuyển sang Supabase, không còn đọc Firestore.' });
    const item = await sbGetPayment(orderCode);
    let data = item?.data || null;
    if(!data) return res.status(200).json({ success:true, paid:false, status:'pending', orderCode });
    const createdAt = toDate(data.createdAt || data.created_at);
    const expiresAt = toDate(data.expiresAt || data.expireAt) || (createdAt ? new Date(createdAt.getTime() + PENDING_TTL_MS) : null);
    let expired = !data.paid && expiresAt && expiresAt.getTime() <= Date.now();
    const expireRequest = String(req.query.expire || req.query.cancel || '0') === '1';
    if (!data.paid && expireRequest && expired && data.status !== 'expired') {
      data = await sbPatchPayment(orderCode, { ...data, status: 'expired', expiredAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) || { ...data, status: 'expired' };
      expired = true;
    }
    const common = {
      orderCode,
      amount:Number(data.amount || 0),
      planId:data.planId || '1m',
      planName:data.planName || 'GÓI 1 THÁNG',
      days:Number(data.days || 0),
      createdAt: iso(data.createdAt || createdAt),
      expiresAt: iso(data.expiresAt || data.expireAt),
      pendingExpiresAt: expiresAt ? expiresAt.toISOString() : null,
      expired:Boolean(expired),
      dataSource:'supabase'
    };
    if(!data.paid) return res.status(200).json({ success:true, paid:false, status:expired ? 'expired' : (data.status || 'pending'), ...common });
    return res.status(200).json({ success:true, paid:true, status:data.status || 'paid', ...common, expiresAt:iso(data.expiresAt), paidAt:iso(data.paidAt) });
  }catch(e){
    console.error('payment-status error:', e);
    return res.status(200).json({ success:true, paid:false, status:'pending', code:'PAYMENT_STATUS_SUPABASE_ERROR', warning:e.message || 'Không kiểm tra được trạng thái thanh toán.' });
  }
}
