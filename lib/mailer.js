import { getAppSettings, normalizeSettings } from './appSettings.js';

export async function sendGenericEmail({ to, subject, html, text, settings }){
  to = String(to || '').trim();
  if(!to) throw new Error('Thiếu email nhận.');
  const s = normalizeSettings(settings || await getAppSettings()).smtp;
  if(!s.smtpUser || !s.smtpPass) throw new Error('Chưa cấu hình SMTP User hoặc App Password Gmail.');
  let nodemailer;
  try { nodemailer = (await import('nodemailer')).default; }
  catch(e){ throw new Error('Thiếu package nodemailer. Chạy: npm i nodemailer'); }
  const secure = String(s.smtpSecure).toLowerCase() === 'ssl' || Number(s.smtpPort) === 465;
  const transporter = nodemailer.createTransport({ host:s.smtpHost || 'smtp.gmail.com', port:Number(s.smtpPort || 465), secure, auth:{ user:s.smtpUser, pass:s.smtpPass } });
  await transporter.sendMail({ from:`${s.senderName || 'Văn Thế Web'} <${s.smtpUser}>`, to, subject, html, text:text || String(html || '').replace(/<[^>]+>/g,' ') });
  return true;
}

export async function sendPaymentSuccessEmail({ email, orderCode, planName, amount, expiresAt, settings }){
  if(!email) return false;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#0f172a">
    <h2 style="margin:0 0 10px;color:#2563eb">Thanh toán thành công</h2>
    <p>Tài khoản của bạn đã được nâng cấp <b>PRO</b>.</p>
    <p><b>Gói:</b> ${planName || ''}<br><b>Mã đơn:</b> ${orderCode || ''}<br><b>Số tiền:</b> ${Number(amount||0).toLocaleString('vi-VN')} đ<br><b>Hạn sử dụng:</b> ${expiresAt ? new Date(expiresAt).toLocaleString('vi-VN') : 'Đã cập nhật trong hệ thống'}</p>
    <p>Cảm ơn bạn đã sử dụng công cụ Văn Thế Web.</p>
  </div>`;
  return sendGenericEmail({ to:email, subject:'Thanh toán thành công - Tài khoản đã nâng cấp PRO', html, settings });
}
