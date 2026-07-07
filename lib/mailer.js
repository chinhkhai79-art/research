import { getAppSettings, normalizeSettings, CANONICAL_BASE_URL } from './appSettings.js';
import { isSupabaseConfigured, getAppSettingsRow, saveAppSettingsRow } from './supabaseAdmin.js';

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
function sleep(ms){ return new Promise(resolve => setTimeout(resolve, Math.max(0, ms))); }
function todayKeyVN(){
  return new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Ho_Chi_Minh', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
}
function clampDelaySeconds(v){
  const n = Number(v || 10);
  if (!Number.isFinite(n)) return 10;
  return Math.min(Math.max(Math.round(n), 10), 60);
}
function readSendRules(settings){
  const s = normalizeSettings(settings || {}).smtp || {};
  return {
    dailyLimitEnabled: s.smtpDailyLimitEnabled !== false,
    dailyLimit: 300,
    sendDelayEnabled: s.smtpSendDelayEnabled !== false,
    delaySeconds: clampDelaySeconds(s.smtpSendDelaySeconds || 10)
  };
}
async function readRuntimeSettings(){
  const row = await getAppSettingsRow();
  const raw = row?.settings && typeof row.settings === 'object' ? row.settings : normalizeSettings();
  const runtime = raw.mailRuntime && typeof raw.mailRuntime === 'object' ? raw.mailRuntime : {};
  const today = todayKeyVN();
  const sameDay = String(runtime.date || '') === today;
  return {
    raw,
    today,
    runtime: {
      date: sameDay ? runtime.date : today,
      sentToday: sameDay ? Number(runtime.sentToday || 0) : 0,
      lastSentAt: runtime.lastSentAt || ''
    }
  };
}
async function saveRuntimeSettings(raw, runtime){
  await saveAppSettingsRow({ ...(raw || {}), mailRuntime: runtime });
}
async function enforceEmailSendRules(settings){
  const rules = readSendRules(settings);
  if (!rules.dailyLimitEnabled && !rules.sendDelayEnabled) return;
  if (!isSupabaseConfigured()) return;
  const { runtime } = await readRuntimeSettings();
  if (rules.dailyLimitEnabled && Number(runtime.sentToday || 0) >= rules.dailyLimit) {
    throw new Error(`Đã đạt giới hạn ${rules.dailyLimit} email hôm nay. Hệ thống tạm dừng gửi email đến ngày mới.`);
  }
  if (rules.sendDelayEnabled && runtime.lastSentAt) {
    const lastMs = new Date(runtime.lastSentAt).getTime();
    if (Number.isFinite(lastMs) && lastMs > 0) {
      const waitMs = (rules.delaySeconds * 1000) - (Date.now() - lastMs);
      if (waitMs > 0) await sleep(waitMs);
    }
  }
}
async function markEmailSent(settings){
  const rules = readSendRules(settings);
  if (!rules.dailyLimitEnabled && !rules.sendDelayEnabled) return;
  if (!isSupabaseConfigured()) return;
  const { raw, today, runtime } = await readRuntimeSettings();
  const nextRuntime = {
    date: today,
    sentToday: Number(runtime.sentToday || 0) + 1,
    lastSentAt: new Date().toISOString()
  };
  await saveRuntimeSettings(raw, nextRuntime);
}

export async function sendGenericEmail({ to, subject, html, text, settings }){
  to = String(to || '').trim();
  if(!to) throw new Error('Thiếu email nhận.');
  const normalized = normalizeSettings(settings || await getAppSettings());
  const s = normalized.smtp;
  if(!s.smtpUser || !s.smtpPass) throw new Error('Chưa cấu hình SMTP User hoặc App Password Gmail.');
  await enforceEmailSendRules(normalized);
  let nodemailer;
  try { nodemailer = (await import('nodemailer')).default; }
  catch(e){ throw new Error('Thiếu package nodemailer. Chạy: npm i nodemailer'); }
  const secure = String(s.smtpSecure).toLowerCase() === 'ssl' || Number(s.smtpPort) === 465;
  const transporter = nodemailer.createTransport({ host:s.smtpHost || 'smtp.gmail.com', port:Number(s.smtpPort || 465), secure, auth:{ user:s.smtpUser, pass:s.smtpPass } });
  await transporter.sendMail({ from:`${s.senderName || 'Văn Thế Web'} <${s.smtpUser}>`, to, subject, html, text:text || stripTags(html) });
  await markEmailSent(normalized);
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


function resolveAdminNotifyEmail(settings){
  const normalized = normalizeSettings(settings || {});
  return String(
    process.env.ADMIN_NOTIFY_EMAIL ||
    process.env.ADMIN_EMAIL ||
    process.env.SMTP_NOTIFY_EMAIL ||
    normalized.smtp?.adminNotifyEmail ||
    'vantheweb@gmail.com'
  ).trim();
}

export function buildAdminPaymentSuccessEmail({ email, userName, orderCode, planName, amount, paidAt, expiresAt, toolUrl, settings }){
  const normalized = normalizeSettings(settings || {});
  const tmpl = normalized.emailTemplates?.adminPaymentSuccess || {};
  const name = String(userName || '').trim() || defaultNameFromEmail(email) || email || 'user';
  const money = formatMoney(amount) || `${Number(amount || 0).toLocaleString('vi-VN')} VND`;
  const paidTime = formatDateVN(paidAt || new Date());
  const url = String(toolUrl || normalized.smtp?.emailBaseUrl || normalized.payment?.baseUrl || CANONICAL_BASE_URL).replace(/\/+$/,'') || CANONICAL_BASE_URL;
  const vars = {
    name,
    email: email || '',
    orderCode: orderCode || '',
    planName: planName || 'GÓI PRO',
    amount: money,
    paidAt: paidTime,
    expiresAt: expiresAt ? formatDateVN(expiresAt) : 'Đã cập nhật trong hệ thống',
    toolUrl: url,
    supportEmail: normalized.smtp?.smtpUser || '',
    bankAccount: normalized.payment?.bankAccount || '',
    bankOwner: normalized.payment?.bankOwner || ''
  };
  const subject = renderTemplate(tmpl.subject || 'Admin: Đơn hàng {{orderCode}} đã thanh toán thành công', vars) || 'Admin: Đơn hàng đã thanh toán thành công';
  const html = renderTemplate(tmpl.html || '', vars);
  return { subject, html, text: stripTags(html), vars };
}

export async function sendAdminPaymentSuccessEmail({ email, userName, orderCode, planName, amount, paidAt, expiresAt, toolUrl, settings, adminEmail }){
  const normalized = normalizeSettings(settings || await getAppSettings());
  if (normalized.emailTemplates?.adminPaymentSuccess?.enabled === false) return false;
  const to = String(adminEmail || resolveAdminNotifyEmail(normalized)).trim();
  if(!to) return false;
  const msg = buildAdminPaymentSuccessEmail({ email, userName, orderCode, planName, amount, paidAt, expiresAt, toolUrl, settings: normalized });
  return sendGenericEmail({ to, subject: msg.subject, html: msg.html, text: msg.text, settings: normalized });
}

export async function sendPaymentSuccessEmail({ email, userName, orderCode, planName, amount, paidAt, expiresAt, toolUrl, settings }){
  if(!email) return false;
  const normalized = normalizeSettings(settings || await getAppSettings());
  if (normalized.emailTemplates?.paymentSuccess?.enabled === false) return false;
  const msg = buildPaymentSuccessEmail({ email, userName, orderCode, planName, amount, paidAt, expiresAt, toolUrl, settings: normalized });
  return sendGenericEmail({ to:email, subject:msg.subject, html:msg.html, text:msg.text, settings: normalized });
}
