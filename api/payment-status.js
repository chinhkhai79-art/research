function cors(req,res){ res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Content-Type'); if(req.method==='OPTIONS'){res.status(200).end(); return true;} return false; }
async function getDb(){ const mod = await import('../lib/firebaseAdmin.js'); return { db: mod.db, FieldValue: mod.FieldValue || { serverTimestamp:()=>new Date() } }; }
function toDate(v){ try{ return v?.toDate?.() || (v ? new Date(v) : null); }catch{return null;} }
function iso(v){ const d = toDate(v); return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null; }
function isQuotaError(error){ const text = String(error?.message || error?.details || error?.code || '').toLowerCase(); return error?.code === 8 || text.includes('resource_exhausted') || text.includes('quota') || text.includes('free daily read units'); }
const PENDING_TTL_MS = 5 * 60 * 1000;

export default async function handler(req,res){
  if(cors(req,res)) return;
  try{
    const orderCode = String(req.query.orderCode || req.query.content || '').trim().toUpperCase();
    if(!orderCode) return res.status(400).json({ success:false, paid:false, error:'Missing orderCode' });
    const { db, FieldValue } = await getDb();
    const ref = db.collection('payments').doc(orderCode);
    const snap = await ref.get();
    let data = snap.exists ? snap.data() : null;

    // Bình thường chỉ đọc 1 document payments/{orderCode} để giảm một nửa số read khi trang QR đang poll.
    // Fallback paid_orders chỉ dùng khi truyền legacy=1 để kiểm tra đơn rất cũ.
    if((!data || !data.paid) && String(req.query.legacy || '0') === '1'){
      const paidSnap = await db.collection('paid_orders').doc(orderCode).get();
      if(paidSnap.exists) data = { ...(data || {}), ...paidSnap.data(), paid:true, status:'paid' };
    }

    if(!data) return res.status(200).json({ success:true, paid:false, status:'pending', orderCode });

    const createdAt = toDate(data.createdAt || data.created_at);
    const expiresAt = toDate(data.expiresAt || data.expireAt) || (createdAt ? new Date(createdAt.getTime() + PENDING_TTL_MS) : null);
    let expired = !data.paid && expiresAt && expiresAt.getTime() <= Date.now();
    const expireRequest = String(req.query.expire || req.query.cancel || '0') === '1';
    if (!data.paid && expireRequest && expired && data.status !== 'expired') {
      await ref.set({
        status: 'expired',
        expiredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge:true });
      data = { ...data, status:'expired' };
      expired = true;
    }
    const common = {
      orderCode,
      amount:Number(data.amount || 0),
      planId:data.planId || '1m',
      planName:data.planName || 'GÓI 1 THÁNG',
      days:Number(data.days || 0),
      createdAt: iso(createdAt),
      expiresAt: iso(data.expiresAt || data.expireAt),
      pendingExpiresAt: expiresAt ? expiresAt.toISOString() : null,
      expired:Boolean(expired)
    };
    if(!data.paid) return res.status(200).json({ success:true, paid:false, status:expired ? 'expired' : (data.status || 'pending'), ...common });
    return res.status(200).json({ success:true, paid:true, status:data.status || 'paid', ...common, expiresAt:iso(data.expiresAt), paidAt:iso(data.paidAt) });
  }catch(e){
    console.error('payment-status error:', e);
    return res.status(200).json({ success:true, paid:false, status:'pending', code:isQuotaError(e)?'FIRESTORE_QUOTA_EXHAUSTED':'PAYMENT_STATUS_ERROR', warning:isQuotaError(e)?'Firestore đã hết quota đọc, tạm dừng kiểm tra tự động.':(e.message || 'Không kiểm tra được trạng thái thanh toán.') });
  }
}
