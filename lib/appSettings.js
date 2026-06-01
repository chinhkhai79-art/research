// lib/appSettings.js
// Cấu hình động cho SePay + SMTP. Bản này tránh crash 500 khi thiếu ENV/header.

export const DEFAULT_SETTINGS = {
  payment: {
    sepaySecret: '',
    bankOwner: 'LE VAN KHAI',
    bankName: 'ACB',
    bankCode: 'ACB',
    bankId: '970416',
    bankAccount: '13131447',
    accountNo: '13131447',
    accountNumber: '13131447',
    accountName: 'LE VAN KHAI',
    paymentPrefix: 'RESEARCH',
    transferPrefix: 'RESEARCH',
    orderPrefix: 'RESEARCH',
    baseUrl: 'https://research.vanthemmo.com',
    webhookUrl: 'https://research.vanthemmo.com/api/sepay-webhook',
    plans: {
      '3m': { id:'3m', name:'GÓI 3 THÁNG', amount:180000, days:90, enabled:true },
      '6m': { id:'6m', name:'GÓI 6 THÁNG', amount:300000, days:180, enabled:true },
      '12m': { id:'12m', name:'GÓI 1 NĂM', amount:500000, days:365, enabled:true }
    }
  },
  smtp: {
    smtpUser: '',
    smtpPass: '',
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecure: 'ssl',
    senderName: 'Văn Thế Web',
    emailBaseUrl: 'https://research.vanthemmo.com'
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
function digits(v){ return str(v).replace(/\D/g,''); }
function cleanPrefix(v){ return str(v,'RESEARCH').toUpperCase().replace(/[^A-Z0-9]/g,'') || 'RESEARCH'; }
function cleanBase(v){ return str(v, DEFAULT_SETTINGS.payment.baseUrl).replace(/\/+$/,''); }
function bankBin(code){
  const c = str(code, 'ACB').toUpperCase().replace(/\s+/g,'');
  if (/^\d{6}$/.test(c)) return c;
  return BANK_BIN[c] || DEFAULT_SETTINGS.payment.bankId;
}

export function normalizeSettings(input={}){
  const raw = deepMerge(DEFAULT_SETTINGS, input || {});
  const p = raw.payment || {};
  const s = raw.smtp || {};
  const bankName = str(p.bankName || p.bankCode || p.bank || 'ACB').toUpperCase();
  const bankId = bankBin(p.bankId || p.bankBin || bankName);
  const bankAccount = digits(p.bankAccount || p.accountNo || p.accountNumber || p.account || DEFAULT_SETTINGS.payment.bankAccount);
  const bankOwner = str(p.bankOwner || p.accountName || p.accountOwner || p.owner || DEFAULT_SETTINGS.payment.bankOwner).toUpperCase();
  const prefix = cleanPrefix(p.paymentPrefix || p.transferPrefix || p.orderPrefix || p.prefix || 'RESEARCH');
  const baseUrl = cleanBase(p.baseUrl || p.appDomain || p.domain || DEFAULT_SETTINGS.payment.baseUrl);
  const plans = {};
  const sourcePlans = p.plans || DEFAULT_SETTINGS.payment.plans;
  for (const id of ['3m','6m','12m']) {
    const x = sourcePlans[id] || DEFAULT_SETTINGS.payment.plans[id];
    plans[id] = { id, name: str(x.name, DEFAULT_SETTINGS.payment.plans[id].name), amount: Number(x.amount || DEFAULT_SETTINGS.payment.plans[id].amount), days: Number(x.days || DEFAULT_SETTINGS.payment.plans[id].days), enabled: x.enabled !== false };
  }
  return {
    payment: {
      sepaySecret: str(p.sepaySecret || p.webhookSecret || p.secret || ''),
      bankOwner, bankName, bankCode: bankName, bankId, bankBin: bankId,
      bankAccount, accountNo: bankAccount, accountNumber: bankAccount,
      accountName: bankOwner, beneficiaryName: bankOwner,
      paymentPrefix: prefix, transferPrefix: prefix, orderPrefix: prefix,
      baseUrl, appDomain: baseUrl, webhookUrl: baseUrl + '/api/sepay-webhook',
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
    }
  };
}

async function getFirebase(){
  const mod = await import('./firebaseAdmin.js');
  const db = mod.db || mod.default?.db;
  const FieldValue = mod.FieldValue || mod.default?.FieldValue || { serverTimestamp: () => new Date() };
  if (!db) throw new Error('Không tìm thấy db trong lib/firebaseAdmin.js');
  return { db, FieldValue };
}

export async function getAppSettings(){
  const { db, FieldValue } = await getFirebase();
  const ref = db.collection('app_settings').doc('research_config');
  const snap = await ref.get();
  if (!snap.exists) {
    const def = normalizeSettings();
    await ref.set({ ...def, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge:true });
    return def;
  }
  return normalizeSettings(snap.data() || {});
}

export async function saveAppSettings(input={}){
  const { db, FieldValue } = await getFirebase();
  const current = await getAppSettings();
  const merged = deepMerge(current, input || {});
  // Nếu không nhập lại secret/pass thì giữ secret/pass cũ.
  if (!input.payment?.sepaySecret && current.payment?.sepaySecret) merged.payment.sepaySecret = current.payment.sepaySecret;
  if (!input.smtp?.smtpPass && current.smtp?.smtpPass) merged.smtp.smtpPass = current.smtp.smtpPass;
  const next = normalizeSettings(merged);
  await db.collection('app_settings').doc('research_config').set({ ...next, updatedAt: FieldValue.serverTimestamp() }, { merge:true });
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
  for (const [id,p] of Object.entries(plans)) if (p.enabled !== false && Number(p.amount) > 0 && Number(p.days) > 0) out[id] = p;
  return Object.keys(out).length ? out : DEFAULT_SETTINGS.payment.plans;
}

export function normalizePlanId(id, settings){
  id = str(id || '3m').toLowerCase();
  if (id === '1y' || id === 'year' || id === '12') id = '12m';
  if (id === '1m') id = '3m';
  const plans = getEnabledPlans(settings);
  return plans[id] ? id : Object.keys(plans)[0];
}

export function requireAdmin(req, res){
  const expected = str(process.env.ADMIN_SETTINGS_PASSWORD || process.env.ADMIN_SETTINGS_KEY || process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD || '123456');
  const got = str(req.headers['x-admin-password'] || req.headers['x-admin-key'] || req.headers['x-admin-secret'] || req.query?.adminPassword || req.query?.adminKey || req.body?.adminPassword || req.body?.adminKey || '').replace(/^Bearer\s+/i,'');
  if (!expected) return true;
  if (got !== expected) {
    res.status(401).json({ success:false, error:'Sai mật khẩu quản trị. Kiểm tra ADMIN_SETTINGS_PASSWORD trên Vercel.' });
    return false;
  }
  return true;
}

// So sánh cấu hình cũ và mới để lưu log thay đổi.
// Trả về list các field đã đổi, secret được mask (chỉ báo có thay đổi, không lộ giá trị).
const TRACKED_FIELDS = {
  payment: ['bankOwner', 'bankName', 'bankId', 'bankAccount', 'paymentPrefix', 'baseUrl'],
  smtp: ['smtpUser', 'smtpHost', 'smtpPort', 'smtpSecure', 'senderName', 'emailBaseUrl']
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
  return changes;
}
