function cors(req,res){ res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Content-Type'); if(req.method==='OPTIONS'){res.status(200).end(); return true;} return false; }
async function getDb(){ const mod = await import('../lib/firebaseAdmin.js'); return mod.db; }
function iso(v){ try{ return v?.toDate?.()?.toISOString?.() || (v instanceof Date ? v.toISOString() : v || null); }catch{return null;} }
export default async function handler(req,res){
  if(cors(req,res)) return;
  try{
    const orderCode = String(req.query.orderCode || req.query.content || '').trim().toUpperCase();
    if(!orderCode) return res.status(400).json({ success:false, paid:false, error:'Missing orderCode' });
    const db = await getDb();
    let snap = await db.collection('payments').doc(orderCode).get();
    let data = snap.exists ? snap.data() : null;
    if(!data || !data.paid){
      const paidSnap = await db.collection('paid_orders').doc(orderCode).get();
      if(paidSnap.exists) data = { ...(data || {}), ...paidSnap.data(), paid:true, status:'paid' };
    }
    if(!data || !data.paid) return res.status(200).json({ success:true, paid:false, status:'pending', orderCode });
    return res.status(200).json({ success:true, paid:true, status:data.status || 'paid', orderCode, amount:data.amount || 0, planId:data.planId || '1m', planName:data.planName || 'GÓI 1 THÁNG', expiresAt:iso(data.expiresAt), paidAt:iso(data.paidAt) });
  }catch(e){ console.error('payment-status error:', e); return res.status(200).json({ success:true, paid:false, status:'pending', warning:e.message }); }
}
