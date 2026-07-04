import { getAppSettings, normalizeSettings, CANONICAL_BASE_URL } from './appSettings.js';

function escapeHtml(v){
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function stripTags(v){ return String(v || '').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); }
function formatMoney(v){
  const n = Number(v || 0);
  return Number.isFinite(n) && n > 0 ? `${n.toLocaleString('vi-VN')} VND` : '';
}
function formatDateVN(v){
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
}
function defaultNameFromEmail(email){
  const local = String(email || '').split('@')[0] || 'bạn';
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim() || 'bạn';
}
function renderTemplate(template, vars = {}){
  return String(template || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => escapeHtml(vars[key] ?? ''));
}

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
  await transporter.sendMail({ from:`${s.senderName || 'Văn Thế Web'} <${s.smtpUser}>`, to, subject, html, text:text || stripTags(html) });
  return true;
}

export function buildPaymentSuccessEmail({ email, userName, orderCode, planName, amount, paidAt, expiresAt, toolUrl, settings }){
  const normalized = normalizeSettings(settings || {});
  const tmpl = normalized.emailTemplates?.paymentSuccess || {};
  const url = String(toolUrl || normalized.smtp?.emailBaseUrl || normalized.payment?.baseUrl || CANONICAL_BASE_URL).replace(/\/+$/,'') || CANONICAL_BASE_URL;
  const vars = {
    name: String(userName || '').trim() || defaultNameFromEmail(email),
    email: email || '',
    orderCode: orderCode || '',
    planName: planName || 'GÓI PRO',
    amount: formatMoney(amount),
    paidAt: formatDateVN(paidAt || new Date()),
    expiresAt: expiresAt ? formatDateVN(expiresAt) : 'Đã cập nhật trong hệ thống',
    toolUrl: url,
    supportEmail: normalized.smtp?.smtpUser || '',
    bankAccount: normalized.payment?.bankAccount || '',
    bankOwner: normalized.payment?.bankOwner || ''
  };
  const subject = renderTemplate(tmpl.subject || 'Thanh toán thành công - {{orderCode}}', vars) || 'Thanh toán thành công - Tài khoản đã nâng cấp PRO';
  const html = renderTemplate(tmpl.html || '', vars);
  return { subject, html, text: stripTags(html), vars };
}

export async function sendPaymentSuccessEmail({ email, userName, orderCode, planName, amount, paidAt, expiresAt, toolUrl, settings }){
  if(!email) return false;
  const normalized = normalizeSettings(settings || await getAppSettings());
  if (normalized.emailTemplates?.paymentSuccess?.enabled === false) return false;
  const msg = buildPaymentSuccessEmail({ email, userName, orderCode, planName, amount, paidAt, expiresAt, toolUrl, settings: normalized });
  return sendGenericEmail({ to:email, subject:msg.subject, html:msg.html, text:msg.text, settings: normalized });
}
