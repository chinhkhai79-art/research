import nodemailer from 'nodemailer';
import { getAppSettings } from './appSettings.js';

export async function getTransporter() {
  const settings = await getAppSettings();
  const smtp = settings.smtp || {};
  if (!smtp.user || !smtp.pass) throw new Error('Chưa cấu hình SMTP user/pass trong /admin-settings.html');

  return nodemailer.createTransport({
    host: smtp.host || 'smtp.gmail.com',
    port: Number(smtp.port || 465),
    secure: smtp.secure !== false,
    auth: { user: smtp.user, pass: smtp.pass }
  });
}

export async function sendMail({ to, subject, html, text }) {
  const settings = await getAppSettings();
  const smtp = settings.smtp || {};
  const transporter = await getTransporter();
  return transporter.sendMail({
    from: `"${smtp.fromName || 'Văn Thế Web'}" <${smtp.user}>`,
    to,
    subject,
    html,
    text: text || subject
  });
}

export function buildPaymentSuccessEmail({ name, email, planName, amount, orderCode, expiresAt, appUrl }) {
  const money = Number(amount || 0).toLocaleString('vi-VN') + ' đ';
  const exp = expiresAt ? new Date(expiresAt).toLocaleString('vi-VN') : '---';
  return `
  <div style="background:#f1f5f9;padding:32px;font-family:Arial,sans-serif;color:#0f172a">
    <div style="max-width:680px;margin:auto;background:#fff;border-radius:18px;padding:32px;border:1px solid #e2e8f0">
      <h1 style="color:#0284c7;margin:0 0 18px;font-size:28px">Thanh toán thành công</h1>
      <p>Xin chào <b>${name || email || 'anh/chị'}</b>,</p>
      <p>Bạn đã thanh toán thành công và tài khoản đã được nâng cấp PRO.</p>
      <div style="background:#f8fafc;border-radius:14px;padding:18px;margin:22px 0">
        <p><b>Gói:</b> ${planName || 'Gói Pro'}</p>
        <p><b>Số tiền:</b> ${money}</p>
        <p><b>Mã đơn:</b> ${orderCode || '---'}</p>
        <p><b>Hạn sử dụng:</b> ${exp}</p>
      </div>
      <p>Vui lòng truy cập trang dưới đây để sử dụng tool:</p>
      <p><a href="${appUrl || '#'}" style="display:inline-block;background:#0284c7;color:#fff;text-decoration:none;padding:14px 22px;border-radius:12px;font-weight:700">Mở tool ngay</a></p>
      <p style="color:#64748b;font-size:13px;margin-top:26px">Email này được gửi tự động sau khi hệ thống xác nhận thanh toán qua SePay.</p>
    </div>
  </div>`;
}
