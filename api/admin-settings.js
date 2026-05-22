import { getAppSettings, saveAppSettings, maskSettings, requireAdmin, normalizeSettings } from '../lib/appSettings.js';

function cors(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization,x-admin-password,x-admin-key,x-admin-secret');
  if (req.method === 'OPTIONS') { res.status(200).end(); return true; }
  return false;
}
function send(res, status, data){ return res.status(status).json(data); }
function publicError(e){ return e?.message || 'Server error'; }

async function testEmail(settings, testEmail){
  const to = String(testEmail || '').trim();
  if (!to) throw new Error('Vui lòng nhập email nhận test.');
  const { sendGenericEmail } = await import('../lib/mailer.js');
  await sendGenericEmail({
    to,
    subject: 'Test SMTP - Văn Thế Web',
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6"><b>SMTP hoạt động.</b><br>Email test từ hệ thống Research.</div>`,
    settings
  });
  return true;
}

export default async function handler(req, res) {
  if (cors(req,res)) return;
  if (!requireAdmin(req,res)) return;
  try {
    const action = String(req.query?.action || req.body?.action || (req.method === 'GET' ? 'get' : 'save')).trim();

    if (req.method === 'GET' || action === 'get') {
      const settings = await getAppSettings();
      return send(res, 200, { success:true, settings: maskSettings(settings) });
    }

    if (req.method !== 'POST') return send(res, 405, { success:false, error:'Method not allowed' });

    if (action === 'save-payment') {
      const current = await getAppSettings();
      const next = await saveAppSettings({ payment: { ...(current.payment || {}), ...(req.body?.payment || req.body || {}) } });
      return send(res, 200, { success:true, message:'Đã lưu cấu hình thanh toán.', settings: maskSettings(next) });
    }

    if (action === 'save-smtp') {
      const current = await getAppSettings();
      const next = await saveAppSettings({ smtp: { ...(current.smtp || {}), ...(req.body?.smtp || req.body || {}) } });
      return send(res, 200, { success:true, message:'Đã lưu cấu hình SMTP.', settings: maskSettings(next) });
    }

    if (action === 'test-webhook') {
      const settings = normalizeSettings({ ...(await getAppSettings()), payment: { ...(req.body?.payment || {}) } });
      if (!settings.payment.bankAccount) throw new Error('Thiếu số tài khoản.');
      if (!settings.payment.paymentPrefix) throw new Error('Thiếu tiền tố nội dung chuyển khoản.');
      if (!settings.payment.webhookUrl) throw new Error('Thiếu Webhook URL.');
      // Không gọi ngược chính server để tránh vòng lặp/timeout. Chỉ kiểm tra cấu hình và trả URL chính xác.
      return send(res, 200, { success:true, message:'Webhook OK. Copy URL này dán vào SePay.', webhookUrl: settings.payment.webhookUrl });
    }

    if (action === 'test-email') {
      const current = await getAppSettings();
      const merged = normalizeSettings({ ...current, smtp: { ...(current.smtp || {}), ...(req.body?.smtp || {}) } });
      await testEmail(merged, req.body?.testEmail);
      return send(res, 200, { success:true, message:'Đã gửi email test.' });
    }

    const saved = await saveAppSettings(req.body?.settings || req.body || {});
    return send(res, 200, { success:true, settings: maskSettings(saved) });
  } catch (e) {
    console.error('admin-settings error:', e);
    return send(res, 500, { success:false, error: publicError(e) });
  }
}
