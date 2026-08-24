import crypto from 'node:crypto';
import { isSupabaseConfigured } from '../lib/supabaseAdmin.js';
import { sendGenericEmail } from '../lib/mailer.js';
import { buildToolIntakeXlsx } from '../lib/toolIntakeXlsx.js';
import {
  addEmailLog,
  createEntry,
  deleteCampaign,
  deleteEntry,
  findEntryByEmail,
  findEntryByPhone,
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
const ENTRY_STATUSES = new Set(['new', 'granted', 'sent', 'rejected']);
const RESERVED_SLUGS = new Set(['api', 'admin', 'pay', 'nhan-tool', 'assets', 'favicon', 'login']);

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

const EMAIL_DOMAIN_CORRECTIONS = new Map([
  ['gmai.com', 'gmail.com'], ['gmial.com', 'gmail.com'], ['gmail.co', 'gmail.com'],
  ['gmail.con', 'gmail.com'], ['gmail.cm', 'gmail.com'], ['gmail.om', 'gmail.com'],
  ['googlemai.com', 'googlemail.com'], ['googlemail.co', 'googlemail.com'],
  ['outlok.com', 'outlook.com'], ['outlook.co', 'outlook.com'], ['outlook.con', 'outlook.com'],
  ['hotmai.com', 'hotmail.com'], ['hotmal.com', 'hotmail.com'], ['hotmail.co', 'hotmail.com'],
  ['hotmail.con', 'hotmail.com'], ['yaho.com', 'yahoo.com'], ['yhoo.com', 'yahoo.com'],
  ['yahoo.co', 'yahoo.com'], ['yahoo.con', 'yahoo.com'], ['icloud.co', 'icloud.com'],
  ['icloud.con', 'icloud.com'], ['iclod.com', 'icloud.com']
]);

function validateEmail(value) {
  const clean = text(value, 190).toLowerCase();
  const invalid = 'Email không hợp lệ. Hãy nhập đầy đủ, ví dụ: tenban@gmail.com.';
  const parts = clean.split('@');
  if (parts.length !== 2) return { value: '', error: invalid };
  const [local, domain] = parts;
  if (!local || local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    return { value: '', error: invalid };
  }
  if (!/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/i.test(local) || !domain || domain.length > 253 || !domain.includes('.')) {
    return { value: '', error: invalid };
  }
  const labels = domain.split('.');
  if (labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) {
    return { value: '', error: invalid };
  }
  const tld = labels[labels.length - 1];
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i.test(tld)) return { value: '', error: invalid };
  const correction = EMAIL_DOMAIN_CORRECTIONS.get(domain);
  if (correction) {
    return { value: '', error: `Bạn có nhập nhầm đuôi email “@${domain}”? Vui lòng dùng “@${correction}”.` };
  }
  return { value: clean, error: '' };
}

function phone(value) {
  let digits = text(value, 30).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('84')) digits = `0${digits.slice(2)}`;
  return digits;
}

function validVietnamPhone(value) {
  return /^0(?:3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-46-9])\d{7}$/.test(String(value || ''));
}

function zaloGroupUrl(value) {
  const raw = text(value, 200);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'zalo.me' || parsed.search || parsed.hash) return '';
    const match = parsed.pathname.match(/^\/g\/([A-Za-z0-9_-]{8,80})\/?$/);
    return match ? `https://zalo.me/g/${match[1]}` : '';
  } catch {
    return '';
  }
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
    buttonLabel: campaign.buttonLabel === 'Đăng ký nhận tool'
      ? 'Đăng ký nâng cấp PRO'
      : (campaign.buttonLabel || 'Đăng ký nâng cấp PRO'),
    requirePhone: campaign.requirePhone,
    requireZalo: campaign.requireZalo,
    active: campaign.isActive,
    publicUrl: `${baseUrl(req)}/${encodeURIComponent(campaign.slug)}`
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
  const checkedEmail = validateEmail(req.body?.email);
  const cleanEmail = checkedEmail.value;
  const cleanPhone = phone(req.body?.phone);
  const zalo = zaloGroupUrl(req.body?.zalo);
  const useCase = text(req.body?.useCase, 1000);
  if (fullName.length < 2) return res.status(400).json({ success: false, error: 'Vui lòng nhập đầy đủ họ tên.' });
  if (!cleanEmail) return res.status(400).json({ success: false, error: checkedEmail.error });
  if (!validVietnamPhone(cleanPhone)) return res.status(400).json({ success: false, error: 'Số điện thoại không hợp lệ. Hãy nhập đúng số di động Việt Nam gồm 10 số.' });
  if (!zalo) return res.status(400).json({ success: false, error: 'Link nhóm Zalo không hợp lệ. Link phải có dạng https://zalo.me/g/xxxxxxxx.' });

  const [existingEmail, existingPhone] = await Promise.all([
    findEntryByEmail(campaign.id, cleanEmail),
    findEntryByPhone(campaign.id, cleanPhone)
  ]);
  if (existingEmail || existingPhone) {
    const both = existingEmail && existingPhone;
    const error = both
      ? 'Email và số điện thoại này đã đăng ký trước đó. Vui lòng kiểm tra lại thông tin.'
      : existingEmail
        ? 'Email này đã đăng ký trước đó. Vui lòng dùng email khác hoặc liên hệ admin.'
        : 'Số điện thoại này đã đăng ký trước đó. Vui lòng dùng số khác hoặc liên hệ admin.';
    return res.status(409).json({
      success: false,
      code: both ? 'DUPLICATE_EMAIL_PHONE' : (existingEmail ? 'DUPLICATE_EMAIL' : 'DUPLICATE_PHONE'),
      error
    });
  }
  const ipHash = crypto.createHash('sha256').update(`${requestIp(req)}:${process.env.ADMIN_SECRET || 'tool-intake'}`).digest('hex');
  let entry;
  try {
    entry = await createEntry({
      campaignId: campaign.id,
      fullName,
      email: cleanEmail,
      phone: cleanPhone,
      zalo,
      useCase,
      ipHash,
      userAgent: text(req.headers['user-agent'], 500)
    });
  } catch (error) {
    if (/23505|duplicate key|tool_intake_entries_campaign_(?:email|phone)_uq/i.test(String(error?.message || ''))) {
      return res.status(409).json({ success: false, code: 'DUPLICATE_REGISTRATION', error: 'Email hoặc số điện thoại này đã đăng ký trước đó.' });
    }
    throw error;
  }
  return res.status(201).json({
    success: true,
    message: campaign.successMessage || 'Đăng ký thành công. Hệ thống đã tiếp nhận thông tin của bạn.',
    entryId: entry.id
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
    if (RESERVED_SLUGS.has(campaignSlug)) return res.status(400).json({ success: false, error: 'Đường dẫn này thuộc hệ thống. Vui lòng chọn đường dẫn khác.' });
    const deliveryMode = 'manual';
    const toolUrl = '';
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
      buttonLabel: text(req.body?.buttonLabel, 80) || 'Đăng ký nâng cấp PRO',
      requirePhone: true,
      requireZalo: true,
      isActive: bool(req.body?.isActive, true)
    });
    return res.status(200).json({ success: true, message: 'Đã lưu link đăng ký nâng cấp PRO.', campaign });
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
    const updatedName = req.body?.fullName === undefined ? undefined : text(req.body.fullName, 150);
    const checkedEmail = req.body?.email === undefined ? undefined : validateEmail(req.body.email);
    const updatedEmail = checkedEmail === undefined ? undefined : checkedEmail.value;
    const updatedPhone = req.body?.phone === undefined ? undefined : phone(req.body.phone);
    const updatedZalo = req.body?.zalo === undefined ? undefined : zaloGroupUrl(req.body.zalo);
    if (updatedName !== undefined && updatedName.length < 2) return res.status(400).json({ success: false, error: 'Họ và tên không hợp lệ.' });
    if (updatedEmail !== undefined && !updatedEmail) return res.status(400).json({ success: false, error: checkedEmail.error });
    if (updatedPhone !== undefined && !validVietnamPhone(updatedPhone)) return res.status(400).json({ success: false, error: 'Số điện thoại không hợp lệ.' });
    if (updatedZalo !== undefined && !updatedZalo) return res.status(400).json({ success: false, error: 'Link nhóm Zalo phải có dạng https://zalo.me/g/xxxxxxxx.' });
    const entry = await updateEntry(text(req.body?.id, 80), {
      fullName: updatedName,
      email: updatedEmail,
      phone: updatedPhone,
      zalo: updatedZalo,
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
    const publicUrl = `${baseUrl(req)}/${encodeURIComponent(campaign.slug)}`;
    const workbook = await buildToolIntakeXlsx({ campaign, entries, publicUrl });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="dang-ky-pro-${campaign.slug}.xlsx"`);
    res.setHeader('Content-Length', String(workbook.length));
    return res.status(200).send(workbook);
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
