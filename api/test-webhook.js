import { getAppSettings, getEnabledPlans } from '../lib/appSettings.js';

export default async function handler(req, res) {
  try {
    const settings = await getAppSettings();
    const pay = settings.payment || {};
    const secret = String(pay.webhookSecret || settings.sepay?.webhookSecret || process.env.SEPAY_API_KEY || '').trim();

    if (!secret) {
      return res.status(400).json({
        success: false,
        message: 'Chưa cấu hình Webhook Secret. Hãy nhập API Key/Webhook Secret SePay rồi bấm Lưu.'
      });
    }

    const plans = Object.values(getEnabledPlans(settings));
    const amount = Number(req.query.amount || plans[0]?.amount || 180000);
    const prefix = String(pay.orderPrefix || settings.sepay?.paymentPrefix || 'RESEARCH').toUpperCase();
    const orderCode = String(req.query.orderCode || (prefix + Date.now())).toUpperCase();

    const host = req.headers['x-forwarded-host'] || req.headers.host || 'research.vanthemmo.com';
    const protocol = String(host).includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    const response = await fetch(`${baseUrl}/api/sepay-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Apikey ${secret}`
      },
      body: JSON.stringify({
        gateway: pay.bankId || settings.sepay?.bankName || 'ACB',
        transactionDate: new Date().toISOString(),
        accountNumber: pay.accountNo || settings.sepay?.bankAccount || '',
        content: orderCode,
        description: orderCode,
        transferType: 'in',
        transferAmount: amount,
        id: Math.floor(Math.random() * 1000000000)
      })
    });

    const data = await response.json().catch(() => ({}));

    return res.status(200).json({
      success: response.ok && data.success !== false,
      message: response.ok ? 'Webhook hoạt động đúng.' : 'Webhook test thất bại.',
      sent: { orderCode, amount, prefix },
      webhookStatus: response.status,
      webhookResponse: data,
      checkStatusUrl: `/api/payment-status?orderCode=${encodeURIComponent(orderCode)}`
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Test webhook error'
    });
  }
}
