import { requireAdminPassword } from '../lib/appSettings.js';
import { sendMail, buildPaymentSuccessEmail } from '../lib/mailer.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
    requireAdminPassword(req.body?.password);

    const to = req.body?.to;
    if (!to) return res.status(400).json({ success: false, message: 'Thiếu email nhận test.' });

    await sendMail({
      to,
      subject: 'Test SMTP thành công - Văn Thế Web',
      html: buildPaymentSuccessEmail({
        name: 'Khải',
        email: to,
        planName: 'Gói test',
        amount: 10000,
        orderCode: 'TEST-' + Date.now(),
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        appUrl: 'https://research.vanthemmo.com'
      })
    });

    return res.status(200).json({ success: true, message: 'Đã gửi email test.' });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ success: false, message: e.message || 'Không gửi được email test' });
  }
}
