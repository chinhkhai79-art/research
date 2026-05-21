import { db } from '../lib/firebaseAdmin.js';
import { setCors } from '../lib/cors.js';
const iso = v => v?.toDate?.()?.toISOString?.() || null;
export default async function handler(req, res) {
  if (setCors(req, res)) return;
  try {
    const orderCode = String(req.query.orderCode || req.query.paymentCode || req.query.content || '').trim().toUpperCase();
    if (!orderCode) return res.status(400).json({ success:false, paid:false, error:'Missing orderCode' });
    const paidSnap = await db.collection('paid_orders').doc(orderCode).get();
    if (paidSnap.exists) { const d = paidSnap.data(); return res.status(200).json({ success:true, paid:Boolean(d.paid), status:d.status || 'paid', orderCode, amount:d.amount || 0, planId:d.planId || '3m', planName:d.planName || 'GÓI 3 THÁNG', packageName:d.planName || 'GÓI 3 THÁNG', paidAt:iso(d.paidAt), expiresAt:iso(d.expiresAt), cumulative:Boolean(d.cumulative) }); }
    const paymentSnap = await db.collection('payments').doc(orderCode).get();
    if (!paymentSnap.exists || !paymentSnap.data()?.paid) return res.status(200).json({ success:true, paid:false, status:'pending', orderCode });
    const p = paymentSnap.data();
    return res.status(200).json({ success:true, paid:true, status:p.status || 'paid', orderCode, amount:p.paidAmount || p.amount || 0, planId:p.planId || '3m', planName:p.planName || 'GÓI 3 THÁNG', packageName:p.planName || 'GÓI 3 THÁNG', paidAt:iso(p.paidAt), expiresAt:iso(p.expiresAt), cumulative:Boolean(p.cumulative) });
  } catch(e){ return res.status(500).json({ success:false, paid:false, error:e.message || 'Server error' }); }
}
