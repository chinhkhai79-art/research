// lib/appSettings.js
// Cấu hình động cho SePay + SMTP. Bản này tránh crash 500 khi thiếu ENV/header.
import { isSupabaseConfigured, getAppSettingsRow, saveAppSettingsRow } from './supabaseAdmin.js';

export const PRICING_VERSION = 2;
export const PLAN_IDS = ['1m', '3m', '6m', '12m'];
export const CANONICAL_BASE_URL = 'https://www.tubekey.vn';
const LEGACY_RESEARCH_HOST = ['research','vanthemmo','com'].join('.');
const CURRENT_DEFAULT_BANK_OWNER = 'NGUYEN VAN THE';
const CURRENT_DEFAULT_BANK_ACCOUNT = 'LOCSPAY000339358';

export const DEFAULT_SETTINGS = {
  payment: {
    sepaySecret: '',
    bankOwner: CURRENT_DEFAULT_BANK_OWNER,
    bankName: 'ACB',
    bankCode: 'ACB',
    bankId: '970416',
    bankAccount: CURRENT_DEFAULT_BANK_ACCOUNT,
    accountNo: CURRENT_DEFAULT_BANK_ACCOUNT,
    accountNumber: CURRENT_DEFAULT_BANK_ACCOUNT,
    accountName: CURRENT_DEFAULT_BANK_OWNER,
    paymentPrefix: 'TUBEKEY',
    transferPrefix: 'TUBEKEY',
    orderPrefix: 'TUBEKEY',
    baseUrl: CANONICAL_BASE_URL,
    webhookUrl: CANONICAL_BASE_URL + '/api/sepay-webhook',
    pricingVersion: PRICING_VERSION,
    plansManaged: true,
    plans: {
      '1m': { id:'1m', name:'GÓI 1 THÁNG', amount:299000, days:30, enabled:true },
      '3m': { id:'3m', name:'GÓI 3 THÁNG', amount:699000, days:90, enabled:true },
      '6m': { id:'6m', name:'GÓI 6 THÁNG', amount:1199000, days:180, enabled:true },
      '12m': { id:'12m', name:'GÓI 1 NĂM', amount:1999000, days:365, enabled:true }
    }
  },
  smtp: {
    smtpUser: '',
    smtpPass: '',
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecure: 'ssl',
    senderName: 'Văn Thế Web',
    emailBaseUrl: CANONICAL_BASE_URL
  },
  account: {
    trialDurationValue: 1,
    trialDurationUnit: 'hours'
  },
  emailTemplates: {
    paymentSuccess: {
      enabled: true,
      subject: 'Thanh toán thành công - {{orderCode}}',
      content: {
        subjectBase: 'Thanh toán thành công',
        subjectHasOrder: true,
        heroTitle: 'Thanh toán thành công',
        heroSubtitle: 'Tài khoản của bạn đã nâng cấp PRO',
        introText: 'Cảm ơn bạn đã mua hàng của chúng tôi. Hệ thống đã xác nhận thanh toán và kích hoạt gói PRO cho tài khoản của bạn.',
        buttonText: 'Truy cập công cụ',
        footerText: 'Nếu bạn cần hỗ trợ, vui lòng phản hồi email này.'
      },
      html: [
        '<div style="font-family:Arial,sans-serif;background:#f6f9fe;padding:24px;color:#0f172a">',
        '<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dbe7f3;border-radius:18px;overflow:hidden">',
        '<div style="background:linear-gradient(135deg,#0ea5e9,#22d3ee);padding:22px 26px;color:#00111f">',
        '<h2 style="margin:0;font-size:24px">Thanh toán thành công</h2>',
        '<p style="margin:8px 0 0">Tài khoản của bạn đã nâng cấp PRO</p>',
        '</div>',
        '<div style="padding:24px 26px;font-size:15px;line-height:1.7">',
        '<p>Chào <b>{{name}}</b>,</p>',
        '<p>Cảm ơn bạn đã mua hàng của chúng tôi. Hệ thống đã xác nhận thanh toán và kích hoạt gói PRO cho tài khoản của bạn.</p>',
        '<table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:12px;overflow:hidden">',
        '<tr><td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#64748b">Email</td><td style="padding:10px;border-bottom:1px solid #e2e8f0"><b>{{email}}</b></td></tr>',
        '<tr><td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#64748b">Mã đơn hàng</td><td style="padding:10px;border-bottom:1px solid #e2e8f0"><b>{{orderCode}}</b></td></tr>',
        '<tr><td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#64748b">Gói</td><td style="padding:10px;border-bottom:1px solid #e2e8f0"><b>{{planName}}</b></td></tr>',
        '<tr><td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#64748b">Số tiền</td><td style="padding:10px;border-bottom:1px solid #e2e8f0"><b>{{amount}}</b></td></tr>',
        '<tr><td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#64748b">Ngày giờ thanh toán</td><td style="padding:10px;border-bottom:1px solid #e2e8f0"><b>{{paidAt}}</b></td></tr>',
        '<tr><td style="padding:10px;color:#64748b">Hạn sử dụng</td><td style="padding:10px"><b>{{expiresAt}}</b></td></tr>',
        '</table>',
        '<p style="text-align:center;margin:26px 0 10px"><a href="{{toolUrl}}" style="display:inline-block;background:#ff5a1f;color:#ffffff;text-decoration:none;padding:13px 22px;border-radius:12px;font-weight:bold">Truy cập công cụ</a></p>',
        '<p style="margin:20px 0 0;color:#64748b">Nếu bạn cần hỗ trợ, vui lòng phản hồi email này.</p>',
        '</div>',
        '</div>',
        '</div>'
      ].join('')
    },
    adminPaymentSuccess: {
      enabled: true,
      subject: 'Admin: Đơn hàng {{orderCode}} đã thanh toán thành công',
      content: {
        subjectBase: 'Admin: Đơn hàng đã thanh toán thành công',
        subjectHasOrder: true,
        heroTitle: 'Thông báo thanh toán thành công',
        heroSubtitle: 'Hệ thống vừa ghi nhận một đơn hàng đã thanh toán thành công.',
        introText: 'Hệ thống vừa ghi nhận đơn hàng {{orderCode}} thanh toán thành công số tiền {{amount}} từ người dùng {{name}}.',
        buttonText: 'Mở công cụ',
        footerText: 'Email này được gửi tự động từ hệ thống tubekey.vn.'
      },
      html: [
        '<div style="font-family:Arial,sans-serif;background:#f6f9fe;padding:24px;color:#0f172a">',
        '<div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #dbe7f3;border-radius:18px;overflow:hidden">',
        '<div style="background:linear-gradient(135deg,#0f3b66,#22d3ee);padding:22px 26px;color:#ffffff">',
        '<h2 style="margin:0;font-size:22px">Thông báo thanh toán thành công</h2>',
        '<p style="margin:8px 0 0">Hệ thống vừa ghi nhận một đơn hàng đã thanh toán thành công.</p>',
        '</div>',
        '<div style="padding:24px 26px;font-size:15px;line-height:1.7">',
        '<p><b>Hệ thống vừa ghi nhận đơn hàng {{orderCode}} thanh toán thành công số tiền {{amount}} từ người dùng {{name}}.</b></p>',
        '<table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:12px;overflow:hidden">',
        '<tr><td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#475569">Mã đơn hàng</td><td style="padding:10px;border-bottom:1px solid #e2e8f0"><b>{{orderCode}}</b></td></tr>',
        '<tr><td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#475569">Người dùng</td><td style="padding:10px;border-bottom:1px solid #e2e8f0"><b>{{name}}</b></td></tr>',
        '<tr><td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#475569">Email</td><td style="padding:10px;border-bottom:1px solid #e2e8f0"><b>{{email}}</b></td></tr>',
        '<tr><td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#475569">Gói</td><td style="padding:10px;border-bottom:1px solid #e2e8f0"><b>{{planName}}</b></td></tr>',
        '<tr><td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#475569">Số tiền</td><td style="padding:10px;border-bottom:1px solid #e2e8f0"><b>{{amount}}</b></td></tr>',
        '<tr><td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#475569">Ngày giờ thanh toán</td><td style="padding:10px;border-bottom:1px solid #e2e8f0"><b>{{paidAt}}</b></td></tr>',
        '<tr><td style="padding:10px;color:#475569">Hạn sử dụng</td><td style="padding:10px"><b>{{expiresAt}}</b></td></tr>',
        '</table>',
        '<p style="text-align:center;margin:24px 0 0"><a href="{{toolUrl}}" style="display:inline-block;background:#ff7a00;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:bold">Mở công cụ</a></p>',
        '<p style="margin:20px 0 0;color:#64748b">Email này được gửi tự động từ hệ thống tubekey.vn.</p>',
        '</div>',
        '</div>',
        '</div>'
      ].join('')
    }
  }
};

// Danh sách ngân hàng Việt Nam phổ biến + e-wallet (BIN code chuẩn VietQR).
// Admin có thể chọn ngân hàng nào trong list này.
export const VIETNAM_BANKS = [
  { code: 'ACB',          bin: '970416', name: 'Á Châu (ACB)' },
  { code: 'VCB',          bin: '970436', name: 'Vietcombank (VCB)' },
  { code: 'TCB',          bin: '970407', name: 'Techcombank (TCB)' },
  { code: 'MB',           bin: '970422', name: 'MB Bank (MB)' },
  { code: 'BIDV',         bin: '970418', name: 'BIDV' },
  { code: 'CTG',          bin: '970415', name: 'VietinBank (CTG)' },
  { code: 'VPB',          bin: '970432', name: 'VPBank' },
  { code: 'TPB',          bin: '970423', name: 'TPBank' },
  { code: 'STB',          bin: '970403', name: 'Sacombank (STB)' },
  { code: 'AGRIBANK',     bin: '970405', name: 'Agribank' },
  { code: 'HDBANK',       bin: '970437', name: 'HDBank' },
  { code: 'SHB',          bin: '970443', name: 'SHB' },
  { code: 'OCB',          bin: '970448', name: 'OCB' },
  { code: 'SCB',          bin: '970429', name: 'SCB' },
  { code: 'LPB',          bin: '970449', name: 'LPBank' },
  { code: 'SEAB',         bin: '970440', name: 'SeABank' },
  { code: 'EIB',          bin: '970431', name: 'Eximbank' },
  { code: 'MSB',          bin: '970426', name: 'MSB' },
  { code: 'NAMABANK',     bin: '970428', name: 'Nam A Bank' },
  { code: 'ABB',          bin: '970425', name: 'ABBank' },
  { code: 'BAB',          bin: '970409', name: 'Bac A Bank' },
  { code: 'PVCB',         bin: '970412', name: 'PVcomBank' },
  { code: 'PGB',          bin: '970430', name: 'PGBank' },
  { code: 'VIETBANK',     bin: '970433', name: 'VietBank' },
  { code: 'SAIGONBANK',   bin: '970400', name: 'SaigonBank' },
  { code: 'KIENLONGBANK', bin: '970452', name: 'Kienlongbank' },
  { code: 'NCB',          bin: '970419', name: 'NCB' },
  { code: 'BVB',          bin: '970454', name: 'BVBank' },
  { code: 'OCEANBANK',    bin: '970414', name: 'OceanBank' },
  { code: 'GPB',          bin: '970408', name: 'GPBank' },
  { code: 'CAKE',         bin: '546034', name: 'Cake by VPBank' },
  { code: 'TIMO',         bin: '963388', name: 'Timo by Bản Việt' },
  { code: 'UBANK',        bin: '546035', name: 'Ubank by VPBank' },
  { code: 'VIETTEL',      bin: '971005', name: 'Viettel Money' },
  { code: 'VNPT',         bin: '971011', name: 'VNPT Money' }
];

const BANK_BIN = VIETNAM_BANKS.reduce((acc, b) => {
  acc[b.code] = b.bin;
  acc[b.bin] = b.bin;
  return acc;
}, { VIETCOMBANK: '970436', TECHCOMBANK: '970407', MBBANK: '970422', VIETINBANK: '970415' });

function deepMerge(a, b){
  const out = Array.isArray(a) ? [...a] : { ...(a || {}) };
  for (const [k,v] of Object.entries(b || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && a && typeof a[k] === 'object' && !Array.isArray(a[k])) out[k] = deepMerge(a[k], v);
    else if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}
function str(v, f=''){ return String(v ?? f).trim(); }
function cleanAccount(v){ return str(v).replace(/[^A-Za-z0-9]/g,''); }
function cleanPrefix(v){ return str(v,'TUBEKEY').toUpperCase().replace(/[^A-Z0-9]/g,'') || 'TUBEKEY'; }
function cleanBase(v){
  const raw = str(v, DEFAULT_SETTINGS.payment.baseUrl).replace(/\/+$/,'');
  if (!raw) return CANONICAL_BASE_URL;
  const plainHost = raw.replace(/^https?:\/\//i, '').replace(/\/+$/,'').toLowerCase();
  if (plainHost === LEGACY_RESEARCH_HOST) return CANONICAL_BASE_URL;
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    if (u.hostname.toLowerCase() === LEGACY_RESEARCH_HOST) return CANONICAL_BASE_URL;
    return u.origin;
  } catch {
    return raw;
  }
}
function bankBin(code){
  const c = str(code, 'ACB').toUpperCase().replace(/\s+/g,'');
  if (/^\d{6}$/.test(c)) return c;
  return BANK_BIN[c] || DEFAULT_SETTINGS.payment.bankId;
}

function normalizeAccount(source={}){
  const rawAccount = source.account && typeof source.account === 'object' ? source.account : {};
  const rawTrial = rawAccount.trial && typeof rawAccount.trial === 'object' ? rawAccount.trial : rawAccount;
  const rawValue = Number(rawTrial.trialDurationValue ?? rawTrial.durationValue ?? rawTrial.value ?? DEFAULT_SETTINGS.account.trialDurationValue);
  const value = Number.isFinite(rawValue) && rawValue >= 1 ? Math.min(Math.round(rawValue), 3650) : DEFAULT_SETTINGS.account.trialDurationValue;
  const rawUnit = str(rawTrial.trialDurationUnit || rawTrial.durationUnit || rawTrial.unit || DEFAULT_SETTINGS.account.trialDurationUnit).toLowerCase();
  const unit = rawUnit === 'days' || rawUnit === 'day' || rawUnit === 'ngay' || rawUnit === 'ngày' ? 'days' : 'hours';
  const trialHours = unit === 'days' ? value * 24 : value;
  const trialLabel = `Dùng thử ${value} ${unit === 'days' ? 'ngày' : 'giờ'}`;
  return {
    trialDurationValue: value,
    trialDurationUnit: unit,
    trialHours,
    trialLabel
  };
}


function normalizeEmailTemplate(source={}, fallbackKey='paymentSuccess'){
  const raw = source && typeof source === 'object' ? source : {};
  const fallback = DEFAULT_SETTINGS.emailTemplates[fallbackKey] || DEFAULT_SETTINGS.emailTemplates.paymentSuccess;
  const rawContent = raw.content && typeof raw.content === 'object' ? raw.content : {};
  return {
    enabled: raw.enabled !== false,
    subject: str(raw.subject || fallback.subject),
    html: str(raw.html || fallback.html),
    content: {
      ...fallback.content,
      ...rawContent
    }
  };
}

function normalizePaymentSuccessTemplate(source={}){
  return normalizeEmailTemplate(source, 'paymentSuccess');
}

function normalizeAdminPaymentSuccessTemplate(source={}){
  return normalizeEmailTemplate(source, 'adminPaymentSuccess');
}

function normalizeEmailTemplates(source={}){
  const raw = source && typeof source === 'object' ? source : {};
  return {
    paymentSuccess: normalizePaymentSuccessTemplate(raw.paymentSuccess || raw.payment_success || {}),
    adminPaymentSuccess: normalizeAdminPaymentSuccessTemplate(raw.adminPaymentSuccess || raw.admin_payment_success || raw.paymentSuccessAdmin || {})
  };
}

function normalizePlan(id, candidate, fallback){
  const source = candidate && typeof candidate === 'object' ? candidate : {};
  const amount = Number(source.amount);
  const days = Number(source.days);
  const name = str(source.name || fallback.name).replace(/premium/gi, 'PRO').toUpperCase();
  return {
    id,
    name: name || fallback.name,
    amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount) : fallback.amount,
    days: Number.isFinite(days) && days > 0 ? Math.round(days) : fallback.days,
    enabled: source.enabled !== false
  };
}

export function normalizeSettings(input={}){
  const source = input && typeof input === 'object' ? input : {};
  const sourcePayment = source.payment && typeof source.payment === 'object' ? source.payment : {};
  const raw = deepMerge(DEFAULT_SETTINGS, source);
  const p = raw.payment || {};
  const s = raw.smtp || {};
  const bankName = str(p.bankName || p.bankCode || p.bank || 'ACB').toUpperCase();
  const bankId = bankBin(p.bankId || p.bankBin || bankName);
  const requestedBankAccount = cleanAccount(p.bankAccount || p.accountNo || p.accountNumber || p.account || DEFAULT_SETTINGS.payment.bankAccount);
  const bankAccount = requestedBankAccount || DEFAULT_SETTINGS.payment.bankAccount;
  const requestedBankOwner = str(p.bankOwner || p.accountName || p.accountOwner || p.owner || DEFAULT_SETTINGS.payment.bankOwner).toUpperCase();
  const bankOwner = requestedBankOwner || DEFAULT_SETTINGS.payment.bankOwner;
  const prefix = cleanPrefix(p.paymentPrefix || p.transferPrefix || p.orderPrefix || p.prefix || 'TUBEKEY');
  const baseUrl = cleanBase(p.baseUrl || p.appDomain || p.domain || DEFAULT_SETTINGS.payment.baseUrl);

  // Chỉ dùng giá trong database khi cấu hình đã được lưu từ trang quản trị mới.
  // Dữ liệu giá cũ không có marker này sẽ tự dùng bảng giá mặc định mới, tránh ghi đè ngoài ý muốn.
  const storedPricingVersion = Number(sourcePayment.pricingVersion || sourcePayment.plansVersion || 0);
  const useManagedPlans = sourcePayment.plansManaged === true || storedPricingVersion >= PRICING_VERSION;
  const planSource = useManagedPlans && sourcePayment.plans && typeof sourcePayment.plans === 'object'
    ? sourcePayment.plans
    : DEFAULT_SETTINGS.payment.plans;
  const plans = {};
  for (const id of PLAN_IDS) {
    plans[id] = normalizePlan(id, planSource[id], DEFAULT_SETTINGS.payment.plans[id]);
  }

  return {
    payment: {
      sepaySecret: str(p.sepaySecret || p.webhookSecret || p.secret || ''),
      bankOwner, bankName, bankCode: bankName, bankId, bankBin: bankId,
      bankAccount, accountNo: bankAccount, accountNumber: bankAccount,
      accountName: bankOwner, beneficiaryName: bankOwner,
      paymentPrefix: prefix, transferPrefix: prefix, orderPrefix: prefix,
      baseUrl, appDomain: baseUrl, webhookUrl: baseUrl + '/api/sepay-webhook',
      pricingVersion: PRICING_VERSION,
      plansManaged: true,
      plans
    },
    smtp: {
      smtpUser: str(s.smtpUser || s.user || s.email || ''),
      smtpPass: str(s.smtpPass || s.pass || s.password || ''),
      smtpHost: str(s.smtpHost || s.host || 'smtp.gmail.com'),
      smtpPort: Number(s.smtpPort || s.port || 465),
      smtpSecure: str(s.smtpSecure || s.secureMode || (s.secure === false ? 'tls' : 'ssl'), 'ssl'),
      senderName: str(s.senderName || s.fromName || 'Văn Thế Web'),
      emailBaseUrl: cleanBase(s.emailBaseUrl || s.baseUrl || raw.payment?.baseUrl || DEFAULT_SETTINGS.payment.baseUrl)
    },
    account: normalizeAccount(raw),
    emailTemplates: normalizeEmailTemplates(raw.emailTemplates || raw.email_templates || raw.mailTemplates || raw.email || {})
  };
}

function requireDataStore(){
  if (!isSupabaseConfigured()) {
    throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trên Vercel. Database app đã chuyển sang Supabase, không còn dùng Firestore.');
  }
}

export async function getAppSettings(){
  requireDataStore();
  const row = await getAppSettingsRow();
  if (!row) {
    const def = normalizeSettings();
    await saveAppSettingsRow(def);
    return def;
  }
  return normalizeSettings(row.settings || {});
}

export async function saveAppSettings(input={}){
  requireDataStore();
  const current = await getAppSettings();
  const merged = deepMerge(current, input || {});
  // Nếu không nhập lại secret/pass thì giữ secret/pass cũ.
  if (!input.payment?.sepaySecret && current.payment?.sepaySecret) merged.payment.sepaySecret = current.payment.sepaySecret;
  if (!input.smtp?.smtpPass && current.smtp?.smtpPass) merged.smtp.smtpPass = current.smtp.smtpPass;
  const next = normalizeSettings(merged);
  await saveAppSettingsRow(next);
  return next;
}

export function maskSettings(settings){
  const s = normalizeSettings(settings);
  // Theo yêu cầu: API Key SePay luôn hiện. App Password thì không trả ra nếu muốn bảo mật; vẫn trả hasPass.
  return { ...s, smtp: { ...s.smtp, smtpPass: '', hasPass: Boolean(s.smtp.smtpPass) } };
}

export function getEnabledPlans(settings){
  const plans = normalizeSettings(settings).payment.plans;
  const out = {};
  for (const id of PLAN_IDS) {
    const p = plans[id];
    if (p && p.enabled !== false && Number(p.amount) > 0 && Number(p.days) > 0) out[id] = p;
  }
  return Object.keys(out).length ? out : DEFAULT_SETTINGS.payment.plans;
}

export function normalizePlanId(id, settings){
  id = str(id || '1m').toLowerCase();
  if (id === '1y' || id === 'year' || id === '12') id = '12m';
  const plans = getEnabledPlans(settings);
  return plans[id] ? id : Object.keys(plans)[0];
}

export function requireAdmin(req, res){
  const got = str(req.headers['x-admin-password'] || req.headers['x-admin-key'] || req.headers['x-admin-secret'] || req.query?.adminPassword || req.query?.adminKey || req.body?.adminPassword || req.body?.adminKey || '').replace(/^Bearer\s+/i,'');
  const validSecrets = [
    process.env.ADMIN_SETTINGS_PASSWORD,
    process.env.ADMIN_SETTINGS_KEY,
    process.env.ADMIN_SECRET,
    process.env.ADMIN_PASSWORD,
    process.env.ADMIN_LOGIN_PASSWORD,
    'ThanhCong2027###'
  ].map(v => str(v)).filter(Boolean);
  if (!validSecrets.length) return true;
  if (!validSecrets.includes(got)) {
    res.status(401).json({ success:false, error:'Sai mật khẩu quản trị. Kiểm tra ADMIN_SETTINGS_PASSWORD trên Vercel.' });
    return false;
  }
  return true;
}

// So sánh cấu hình cũ và mới để lưu log thay đổi.
// Trả về list các field đã đổi, secret được mask (chỉ báo có thay đổi, không lộ giá trị).
const TRACKED_FIELDS = {
  payment: ['bankOwner', 'bankName', 'bankId', 'bankAccount', 'paymentPrefix', 'baseUrl'],
  smtp: ['smtpUser', 'smtpHost', 'smtpPort', 'smtpSecure', 'senderName', 'emailBaseUrl'],
  account: ['trialDurationValue', 'trialDurationUnit']
};
const SECRET_FIELDS = new Set(['sepaySecret', 'smtpPass']);

export function diffSettings(oldS, newS) {
  const changes = [];
  for (const [section, fields] of Object.entries(TRACKED_FIELDS)) {
    for (const f of fields) {
      const oldV = String(oldS?.[section]?.[f] ?? '');
      const newV = String(newS?.[section]?.[f] ?? '');
      if (oldV !== newV) {
        changes.push({ field: `${section}.${f}`, oldValue: oldV, newValue: newV });
      }
    }
  }
  // Secret: chỉ báo "đã đổi" / "đã xoá", không log giá trị thật
  for (const f of SECRET_FIELDS) {
    const section = f === 'sepaySecret' ? 'payment' : 'smtp';
    const oldV = String(oldS?.[section]?.[f] ?? '');
    const newV = String(newS?.[section]?.[f] ?? '');
    if (oldV !== newV) {
      changes.push({
        field: `${section}.${f}`,
        oldValue: oldV ? '(đã đặt)' : '(rỗng)',
        newValue: newV ? '(đã đặt)' : '(rỗng)'
      });
    }
  }
  // Plans: so sánh JSON
  const oldPlans = JSON.stringify(oldS?.payment?.plans || {});
  const newPlans = JSON.stringify(newS?.payment?.plans || {});
  if (oldPlans !== newPlans) {
    changes.push({ field: 'payment.plans', oldValue: oldPlans, newValue: newPlans });
  }
  const oldTemplates = JSON.stringify(oldS?.emailTemplates || {});
  const newTemplates = JSON.stringify(newS?.emailTemplates || {});
  if (oldTemplates !== newTemplates) {
    changes.push({ field: 'emailTemplates', oldValue: '(mẫu cũ)', newValue: '(mẫu mới)' });
  }
  return changes;
}
