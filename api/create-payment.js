import { db, FieldValue } from '../lib/firebaseAdmin.js';
import { setCors } from '../lib/cors.js';
import { getAppSettings, getEnabledPlans, normalizePlanId } from '../lib/appSettings.js';

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  try {
    if (req.method !== 'POST') return res.status(405).json({ success:false, error:'Method not allowed. Use POST.' });
    const settings = await getAppSettings();
    const pay = settings.payment;
    const plans = getEnabledPlans(settings);
    const body = req.body || {};
    const planId = normalizePlanId(body.planId || body.packageId || '3m', settings);
    const plan = plans[planId];
    const userId = String(body.userId || body.uid || body.uidFirebase || '').trim();
    const userEmail = String(body.userEmail || body.email || '').trim();
    const userPhone = String(body.userPhone || body.phone || '').trim();
    const userName = String(body.userName || body.name || body.displayName || '').trim();
    const orderCode = pay.orderPrefix + Date.now().toString() + Math.floor(Math.random() * 900 + 100);
    const qrUrl = `https://img.vietqr.io/image/${pay.bankId}-${pay.accountNo}-compact2.png?amount=${plan.amount}&addInfo=${encodeURIComponent(orderCode)}&accountName=${encodeURIComponent(pay.accountName)}`;
    const paymentUrl = `${pay.appDomain}/pay.html?plan=${encodeURIComponent(planId)}&amount=${encodeURIComponent(plan.amount)}&content=${encodeURIComponent(orderCode)}&uid=${encodeURIComponent(userId)}&userId=${encodeURIComponent(userId)}&email=${encodeURIComponent(userEmail)}`;
    await db.collection('payments').doc(orderCode).set({ app:'research', orderCode, planId, planName:plan.name, amount:plan.amount, days:plan.days, userId, userEmail, userPhone, userName, status:'pending', paid:false, bankId:pay.bankId, accountNo:pay.accountNo, accountName:pay.accountName, qrUrl, paymentUrl, createdAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp() });
    return res.status(200).json({ success:true, orderCode, paymentCode:orderCode, planId, packageId:planId, planName:plan.name, packageName:plan.name, amount:plan.amount, days:plan.days, bankId:pay.bankId, accountNo:pay.accountNo, accountName:pay.accountName, qrUrl, paymentUrl, plans });
  } catch(e){ console.error('CREATE PAYMENT ERROR:', e); return res.status(500).json({ success:false, error:e.message || 'Server error' }); }
}
