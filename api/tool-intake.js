import crypto from 'node:crypto';
import { isSupabaseConfigured } from '../lib/supabaseAdmin.js';
import { sendGenericEmail } from '../lib/mailer.js';
import {
  addEmailLog,
  createEntry,
  deleteCampaign,
  deleteEntry,
  findEntryByEmail,
  getCampaignById,
  getCampaignBySlug,
  listCampaigns,
  listEntries,
  saveCampaign,
  updateEntries,
  updateEntry
} from '../lib/toolIntakeStore.js';

const rateBuckets = globalThis.__toolIntakeRateBuckets || new Map();
globalThis.__toolIntakeRateBuckets = rateBuckets;
const PUBLIC_ACTIONS = new Set(['public-campaign', 'register']);
const DELIVERY_MODES = new Set(['manual', 'show_link', 'email_link']);
const ENTRY_STATUSES = new Set(['new', 'granted', 'sent', 'rejected']);

function setCors(req, res) {
  const origin = String(req.headers.origin || '');
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-admin-password,x-admin-key,x-admin-secret');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

function adminToken(req) {
  return String(
    req.headers['x-admin-secret'] || req.headers['x-admin-key'] || req.headers['x-admin-password'] ||
    req.headers.authorization || ''
  ).replace(/^Bearer\s+/i, '').trim();
}

function requireAdmin(req, res) {
  const allowed = [
    process.env.ADMIN_SECRET,
    process.env.ADMIN_SETTINGS_PASSWORD,
    process.env.ADMIN_PASSWORD,
    process.env.ADMIN_SETTINGS_KEY,
    process.env.ADMIN_LOGIN_PASSWORD,
    'ThanhCong2027###'
  ].map(v => String(v || '').trim()).filter(Boolean);
  if (!allowed.includes(adminToken(req))) {
    res.status(401).json({ success: false, error: 'Sai mật khẩu quản trị.' });
    return false;
  }
  return true;
}

function text(value, max = 500) {
  return String(value ?? '').replace(/\0/g, '').trim().slice(0, max);
}

function email(value) {
  const clean = text(value, 190).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) ? clean : '';
}

function phone(value) {
  return text(value, 30).replace(/[^0-9+]/g, '');
}

function slugify(value) {
  return text(value, 140).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function actionOf(req) {
  return text(req.query?.action || req.body?.action, 50).toLowerCase();
}

function schemaError(error) {
  const message = String(error?.message || '');
  return /tool_intake_|PGRST205|42P01|permission denied/i.test(message);
}

function sendError(res, error) {
  if (schemaError(error)) {
    return res.status(503).json({
      success: false,
      code: 'TOOL_INTAKE_SCHEMA_REQUIRED',
      error: 'Chưa cài bảng Link nhận tool trên Supabase. Hãy chạy file scripts/supabase-tool-intake.sql một lần.'
    });
  }
  return res.status(500).json({ success: false, error: error?.message || 'Không xử lý được dữ liệu link nhận tool.' });
}

function requestIp(req) {
  return text(String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0], 96);
}

function rateLimit(req, slug) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const key = `${requestIp(req)}:${slug}`;
  const recent = (rateBuckets.get(key) || []).filter(ts => now - ts < windowMs);
  if (recent.length >= 8) return false;
  recent.push(now);
  rateBuckets.set(key, recent);
  if (rateBuckets.size > 2000) {
    for (const [bucketKey, values] of rateBuckets) {
      if (!values.some(ts => now - ts < windowMs)) rateBuckets.delete(bucketKey);
    }
  }
  return true;
}

function baseUrl(req) {
  const host = text(req.headers['x-forwarded-host'] || req.headers.host || 'www.tubekey.vn', 200);
  const proto = text(req.headers['x-forwarded-proto'] || 'https', 10);
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function publicCampaign(campaign, req) {
  return {
    id: campaign.id,
    slug: campaign.slug,
    title: campaign.title || campaign.name,
    description: campaign.description,
    buttonLabel: campaign.buttonLabel || 'Đăng ký nhận tool',
    requirePhone: campaign.requirePhone,
    requireZalo: campaign.requireZalo,
    active: campaign.isActive,
    publicUrl: `${baseUrl(req)}/nhan-tool/${encodeURIComponent(campaign.slug)}`
  };
}

function tokenMap(entry, campaign) {
  return {
    name: entry.fullName || 'bạn',
    email: entry.email || '',
    phone: entry.phone || '',
    zalo: entry.zalo || '',
    campaign: campaign.title || campaign.name || 'Nhận tool',
    toolUrl: campaign.toolUrl || 'https://www.tubekey.vn'
  };
}

function htmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function replaceTokens(value, vars, escapeValues = false) {
  return String(value || '').replace(/\{\{\s*(name|email|phone|zalo|campaign|toolUrl)\s*\}\}/gi, (_, key) => {
    const matched = Object.keys(vars).find(k => k.toLowerCase() === String(key).toLowerCase());
    const replacement = matched ? String(vars[matched] || '') : '';
    return escapeValues ? htmlEscape(replacement) : replacement;
  });
}

function defaultEmailHtml() {
  return [
    '<div style="font-family:Arial,sans-serif;background:#f3f7fb;padding:24px;color:#17324d">',
    '<div style="max-width:640px;margin:auto;background:#fff;border:1px solid #d9e6f2;border-radius:18px;overflow:hidden">',
    '<div style="padding:22px 26px;background:linear-gradient(135deg,#0f4c81,#16a3e0);color:#fff"><h2 style="margin:0">Bạn đã đăng ký nhận tool</h2></div>',
    '<div style="padding:24px 26px;line-height:1.7"><p>Chào <b>{{name}}</b>,</p>',
    '<p>Thông tin của bạn đã được tiếp nhận trong chiến dịch <b>{{campaign}}</b>.</p>',
    '<p style="text-align:center;margin:24px 0"><a href="{{toolUrl}}" style="display:inline-block;background:#f47b20;color:#fff;text-decoration:none;padding:13px 24px;border-radius:12px;font-weight:bold">MỞ TOOL</a></p>',
    '<p style="color:#64748b">Email đăng ký: {{email}}</p></div></div></div>'
  ].join('');
}

async function sendToolEmail(entry, campaign) {
  const vars = tokenMap(entry, campaign);
  const subject = replaceTokens(campaign.emailSubject || 'Link nhận tool - {{campaign}}', vars).replace(/[\r\n]+/g, ' ').slice(0, 300);
  const html = replaceTokens(campaign.emailHtml || defaultEmailHtml(), vars, true);
  try {
    await sendGenericEmail({ to: entry.email, subject, html });
    await Promise.all([
      updateEntry(entry.id, { status: entry.status === 'granted' ? 'granted' : 'sent', emailStatus: 'sent', emailError: '', emailSentAt: new Date().toISOString() }),
      addEmailLog({ campaignId: campaign.id, entryId: entry.id, toEmail: entry.email, subject, status: 'sent' })
    ]);
    return { success: true, entryId: entry.id, email: entry.email };
  } catch (error) {
    await Promise.allSettled([
      updateEntry(entry.id, { emailStatus: 'failed', emailError: text(error.message, 500) }),
      addEmailLog({ campaignId: campaign.id, entryId: entry.id, toEmail: entry.email, subject, status: 'failed', errorMessage: text(error.message, 1000) })
    ]);
    return { success: false, entryId: entry.id, email: entry.email, error: error.message || 'Gửi email thất bại.' };
  }
}

async function handlePublicCampaign(req, res) {
  const slug = slugify(req.query?.slug || req.body?.slug);
  if (!slug) return res.status(400).json({ success: false, error: 'Thiếu mã link nhận tool.' });
  const campaign = await getCampaignBySlug(slug);
  if (!campaign) return res.status(404).json({ success: false, error: 'Link nhận tool không tồn tại.' });
  if (!campaign.isActive) return res.status(410).json({ success: false, code: 'CAMPAIGN_PAUSED', error: 'Link nhận tool đang tạm dừng.' });
  return res.status(200).json({ success: true, campaign: publicCampaign(campaign, req) });
}

async function handleRegister(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Chỉ chấp nhận POST.' });
  const slug = slugify(req.body?.slug);
  if (!slug) return res.status(400).json({ success: false, error: 'Thiếu mã link nhận tool.' });
  if (text(req.body?.website, 200)) return res.status(200).json({ success: true, message: 'Đã tiếp nhận thông tin.' });
  if (!rateLimit(req, slug)) return res.status(429).json({ success: false, error: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.' });
  const campaign = await getCampaignBySlug(slug);
  if (!campaign) return res.status(404).json({ success: false, error: 'Link nhận tool không tồn tại.' });
  if (!campaign.isActive) return res.status(410).json({ success: false, error: 'Link nhận tool đang tạm dừng.' });

  const fullName = text(req.body?.fullName, 150);
  const cleanEmail = email(req.body?.email);
  const cleanPhone = phone(req.body?.phone);
  const zalo = text(req.body?.zalo, 200);
  const useCase = text(req.body?.useCase, 1000);
  if (fullName.length < 2) return res.status(400).json({ success: false, error: 'Vui lòng nhập đầy đủ họ tên.' });
  if (!cleanEmail) return res.status(400).json({ success: false, error: 'Email không hợp lệ.' });
  if (campaign.requirePhone && !/^(?:\+?84|0)[0-9]{8,10}$/.test(cleanPhone)) return res.status(400).json({ success: false, error: 'Số điện thoại không hợp lệ.' });
  if (campaign.requireZalo && zalo.length < 5) return res.status(400).json({ success: false, error: 'Vui lòng nhập Zalo.' });

  const existing = await findEntryByEmail(campaign.id, cleanEmail);
  if (existing) {
    return res.status(200).json({
      success: true,
      duplicate: true,
      message: 'Email này đã đăng ký nhận tool trước đó.',
      toolUrl: campaign.deliveryMode === 'show_link' ? campaign.toolUrl : ''
    });
  }
  const ipHash = crypto.createHash('sha256').update(`${requestIp(req)}:${process.env.ADMIN_SECRET || 'tool-intake'}`).digest('hex');
  const entry = await createEntry({
    campaignId: campaign.id,
    fullName,
    email: cleanEmail,
    phone: cleanPhone,
    zalo,
    useCase,
    ipHash,
    userAgent: text(req.headers['user-agent'], 500)
  });
  let emailResult = null;
  if (campaign.deliveryMode === 'email_link' && campaign.toolUrl) emailResult = await sendToolEmail(entry, campaign);
  return res.status(201).json({
    success: true,
    message: campaign.successMessage || 'Đăng ký thành công. Hệ thống đã tiếp nhận thông tin của bạn.',
    toolUrl: campaign.deliveryMode === 'show_link' ? campaign.toolUrl : '',
    emailSent: emailResult ? emailResult.success : false,
    emailWarning: emailResult && !emailResult.success ? 'Đã lưu đăng ký nhưng email chưa gửi được. Admin sẽ xử lý lại.' : ''
  });
}

async function handleAdmin(req, res, action) {
  if (action === 'campaigns' && req.method === 'GET') {
    const campaigns = await listCampaigns();
    return res.status(200).json({ success: true, campaigns });
  }
  if (action === 'save-campaign' && req.method === 'POST') {
    const name = text(req.body?.name, 150);
    const campaignSlug = slugify(req.body?.slug || name);
    if (!name || !campaignSlug) return res.status(400).json({ success: false, error: 'Cần nhập tên chiến dịch và đường dẫn.' });
    const deliveryMode = DELIVERY_MODES.has(req.body?.deliveryMode) ? req.body.deliveryMode : 'manual';
    const toolUrl = text(req.body?.toolUrl, 1000);
    if (toolUrl && !/^https?:\/\//i.test(toolUrl)) return res.status(400).json({ success: false, error: 'Link tool phải bắt đầu bằng http:// hoặc https://.' });
    if (deliveryMode !== 'manual' && !toolUrl) return res.status(400).json({ success: false, error: 'Cách giao tool đã chọn cần một link tool hợp lệ.' });
    const campaign = await saveCampaign({
      id: text(req.body?.id, 80) || undefined,
      name,
      slug: campaignSlug,
      title: text(req.body?.title, 200) || name,
      description: text(req.body?.description, 3000),
      successMessage: text(req.body?.successMessage, 1000),
      toolUrl,
      deliveryMode,
      emailSubject: text(req.body?.emailSubject, 300),
      emailHtml: String(req.body?.emailHtml || '').slice(0, 50000),
      buttonLabel: text(req.body?.buttonLabel, 80) || 'Đăng ký nhận tool',
      requirePhone: bool(req.body?.requirePhone, true),
      requireZalo: bool(req.body?.requireZalo, false),
      isActive: bool(req.body?.isActive, true)
    });
    return res.status(200).json({ success: true, message: 'Đã lưu link nhận tool.', campaign });
  }
  if (action === 'toggle-campaign' && req.method === 'POST') {
    const campaign = await getCampaignById(text(req.body?.id, 80));
    if (!campaign) return res.status(404).json({ success: false, error: 'Không tìm thấy link.' });
    const updated = await saveCampaign({ id: campaign.id, isActive: !campaign.isActive });
    return res.status(200).json({ success: true, campaign: updated });
  }
  if (action === 'delete-campaign' && req.method === 'DELETE') {
    await deleteCampaign(text(req.query?.id || req.body?.id, 80));
    return res.status(200).json({ success: true, message: 'Đã xóa link và toàn bộ đăng ký liên quan.' });
  }
  if (action === 'entries' && req.method === 'GET') {
    const campaignId = text(req.query?.campaignId, 80);
    const q = text(req.query?.q, 200).toLowerCase();
    let entries = await listEntries(campaignId);
    if (q) entries = entries.filter(item => [item.fullName, item.email, item.phone, item.zalo, item.useCase, item.status].join(' ').toLowerCase().includes(q));
    return res.status(200).json({ success: true, entries, total: entries.length });
  }
  if (action === 'update-entry' && req.method === 'POST') {
    const status = ENTRY_STATUSES.has(req.body?.status) ? req.body.status : undefined;
    const entry = await updateEntry(text(req.body?.id, 80), {
      fullName: req.body?.fullName === undefined ? undefined : text(req.body.fullName, 150),
      email: req.body?.email === undefined ? undefined : email(req.body.email),
      phone: req.body?.phone === undefined ? undefined : phone(req.body.phone),
      zalo: req.body?.zalo === undefined ? undefined : text(req.body.zalo, 200),
      useCase: req.body?.useCase === undefined ? undefined : text(req.body.useCase, 1000),
      status,
      linkedUid: req.body?.linkedUid === undefined ? undefined : text(req.body.linkedUid, 160),
      grantMessage: req.body?.grantMessage === undefined ? undefined : text(req.body.grantMessage, 500),
      grantedAt: status === 'granted' ? new Date().toISOString() : undefined
    });
    return res.status(200).json({ success: true, entry });
  }
  if (action === 'mark-granted' && req.method === 'POST') {
    const entries = await updateEntries(Array.isArray(req.body?.ids) ? req.body.ids : [], {
      status: 'granted',
      linkedUid: text(req.body?.linkedUid, 160),
      grantMessage: text(req.body?.grantMessage, 500) || 'Đã kích hoạt quyền dùng thử.',
      grantedAt: new Date().toISOString()
    });
    return res.status(200).json({ success: true, entries });
  }
  if (action === 'delete-entry' && req.method === 'DELETE') {
    await deleteEntry(text(req.query?.id || req.body?.id, 80));
    return res.status(200).json({ success: true, message: 'Đã xóa đăng ký.' });
  }
  if (action === 'send-tool' && req.method === 'POST') {
    const campaign = await getCampaignById(text(req.body?.campaignId, 80));
    if (!campaign) return res.status(404).json({ success: false, error: 'Không tìm thấy chiến dịch.' });
    if (!campaign.toolUrl) return res.status(400).json({ success: false, error: 'Chiến dịch chưa có link tool.' });
    const wanted = new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(String).slice(0, 20));
    const entries = (await listEntries(campaign.id)).filter(item => wanted.has(String(item.id)));
    if (!entries.length) return res.status(400).json({ success: false, error: 'Chưa chọn người nhận.' });
    const results = [];
    for (const entry of entries) results.push(await sendToolEmail(entry, campaign));
    const sent = results.filter(item => item.success).length;
    return res.status(200).json({ success: sent > 0, message: `Đã gửi ${sent}/${results.length} email.`, sent, failed: results.length - sent, results });
  }
  if (action === 'export' && req.method === 'GET') {
    const campaign = await getCampaignById(text(req.query?.campaignId, 80));
    if (!campaign) return res.status(404).json({ success: false, error: 'Không tìm thấy chiến dịch.' });
    const entries = await listEntries(campaign.id, 5000);
    const safeCell = value => {
      let clean = String(value ?? '').replace(/[\r\n]+/g, ' ');
      if (/^[=+\-@]/.test(clean)) clean = `'${clean}`;
      return `"${clean.replace(/"/g, '""')}"`;
    };
    const rows = [['STT','Họ tên','Email','Số điện thoại','Zalo','Mục đích','Trạng thái','Email tool','Ngày đăng ký']];
    entries.forEach((item, index) => rows.push([index + 1, item.fullName, item.email, item.phone, item.zalo, item.useCase, item.status, item.emailStatus, item.createdAt]));
    const csv = '\uFEFF' + rows.map(row => row.map(safeCell).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="nhan-tool-${campaign.slug}.csv"`);
    return res.status(200).send(csv);
  }
  return res.status(400).json({ success: false, error: 'Action link nhận tool không hợp lệ.' });
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (!isSupabaseConfigured()) return res.status(503).json({ success: false, code: 'SUPABASE_NOT_CONFIGURED', error: 'Thiếu cấu hình Supabase trên Vercel.' });
  const action = actionOf(req);
  try {
    if (PUBLIC_ACTIONS.has(action)) {
      if (action === 'public-campaign') return await handlePublicCampaign(req, res);
      return await handleRegister(req, res);
    }
    if (!requireAdmin(req, res)) return;
    return await handleAdmin(req, res, action);
  } catch (error) {
    console.error('[tool-intake]', action, error);
    return sendError(res, error);
  }
}
