import { sbFetch, cleanObj } from './supabaseAdmin.js';

const CAMPAIGN_TABLE = 'tool_intake_campaigns';
const ENTRY_TABLE = 'tool_intake_entries';
const EMAIL_LOG_TABLE = 'tool_intake_email_logs';

function campaignFromRow(row = {}) {
  return {
    id: row.id,
    name: row.name || '',
    slug: row.slug || '',
    title: row.title || '',
    description: row.description || '',
    successMessage: row.success_message || '',
    toolUrl: row.tool_url || '',
    deliveryMode: row.delivery_mode || 'manual',
    emailSubject: row.email_subject || '',
    emailHtml: row.email_html || '',
    buttonLabel: row.button_label || 'Đăng ký nhận tool',
    requirePhone: row.require_phone !== false,
    requireZalo: row.require_zalo === true,
    isActive: row.is_active !== false,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    totalEntries: Number(row.totalEntries || 0),
    grantedEntries: Number(row.grantedEntries || 0),
    sentEntries: Number(row.sentEntries || 0)
  };
}

function entryFromRow(row = {}) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    fullName: row.full_name || '',
    email: row.email || '',
    phone: row.phone || '',
    zalo: row.zalo || '',
    useCase: row.use_case || '',
    status: row.status || 'new',
    linkedUid: row.linked_uid || '',
    grantMessage: row.grant_message || '',
    emailStatus: row.email_status || 'not_sent',
    emailError: row.email_error || '',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    grantedAt: row.granted_at || null,
    emailSentAt: row.email_sent_at || null
  };
}

export async function listCampaigns() {
  const [campaignRows, entryRows] = await Promise.all([
    sbFetch(`${CAMPAIGN_TABLE}?select=*&order=created_at.desc&limit=200`),
    sbFetch(`${ENTRY_TABLE}?select=campaign_id,status,email_status&limit=10000`)
  ]);
  const counts = new Map();
  for (const row of entryRows || []) {
    const key = String(row.campaign_id || '');
    const current = counts.get(key) || { totalEntries: 0, grantedEntries: 0, sentEntries: 0 };
    current.totalEntries += 1;
    if (row.status === 'granted') current.grantedEntries += 1;
    if (row.email_status === 'sent') current.sentEntries += 1;
    counts.set(key, current);
  }
  return (campaignRows || []).map(row => campaignFromRow({ ...row, ...(counts.get(String(row.id)) || {}) }));
}

export async function getCampaignById(id) {
  const rows = await sbFetch(`${CAMPAIGN_TABLE}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  return rows?.[0] ? campaignFromRow(rows[0]) : null;
}

export async function getCampaignBySlug(slug) {
  const rows = await sbFetch(`${CAMPAIGN_TABLE}?slug=eq.${encodeURIComponent(slug)}&select=*&limit=1`);
  return rows?.[0] ? campaignFromRow(rows[0]) : null;
}

export async function saveCampaign(data = {}) {
  const now = new Date().toISOString();
  const body = cleanObj({
    name: data.name,
    slug: data.slug,
    title: data.title,
    description: data.description,
    success_message: data.successMessage,
    tool_url: data.toolUrl,
    delivery_mode: data.deliveryMode,
    email_subject: data.emailSubject,
    email_html: data.emailHtml,
    button_label: data.buttonLabel,
    require_phone: data.requirePhone,
    require_zalo: data.requireZalo,
    is_active: data.isActive,
    updated_at: now
  });
  if (data.id) {
    const rows = await sbFetch(`${CAMPAIGN_TABLE}?id=eq.${encodeURIComponent(data.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(body)
    });
    return rows?.[0] ? campaignFromRow(rows[0]) : null;
  }
  const rows = await sbFetch(CAMPAIGN_TABLE, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...body, created_at: now })
  });
  return rows?.[0] ? campaignFromRow(rows[0]) : null;
}

export async function setCampaignActive(id, isActive) {
  return saveCampaign({ id, isActive, updatedAt: new Date().toISOString() });
}

export async function deleteCampaign(id) {
  return sbFetch(`${CAMPAIGN_TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' }
  });
}

export async function findEntryByEmail(campaignId, email) {
  const path = `${ENTRY_TABLE}?campaign_id=eq.${encodeURIComponent(campaignId)}&email=eq.${encodeURIComponent(email)}&select=*&limit=1`;
  const rows = await sbFetch(path);
  return rows?.[0] ? entryFromRow(rows[0]) : null;
}

export async function findEntryByPhone(campaignId, phone) {
  const path = `${ENTRY_TABLE}?campaign_id=eq.${encodeURIComponent(campaignId)}&phone=eq.${encodeURIComponent(phone)}&select=*&limit=1`;
  const rows = await sbFetch(path);
  return rows?.[0] ? entryFromRow(rows[0]) : null;
}

export async function createEntry(data = {}) {
  const now = new Date().toISOString();
  const rows = await sbFetch(ENTRY_TABLE, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(cleanObj({
      campaign_id: data.campaignId,
      full_name: data.fullName,
      email: data.email,
      phone: data.phone,
      zalo: data.zalo,
      use_case: data.useCase,
      status: data.status || 'new',
      email_status: data.emailStatus || 'not_sent',
      ip_hash: data.ipHash || '',
      user_agent: data.userAgent || '',
      created_at: now,
      updated_at: now
    }))
  });
  return rows?.[0] ? entryFromRow(rows[0]) : null;
}

export async function listEntries(campaignId, limit = 2000) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 2000, 5000));
  const rows = await sbFetch(`${ENTRY_TABLE}?campaign_id=eq.${encodeURIComponent(campaignId)}&select=*&order=created_at.desc&limit=${safeLimit}`);
  return (rows || []).map(entryFromRow);
}

export async function updateEntry(id, data = {}) {
  const now = new Date().toISOString();
  const body = cleanObj({
    full_name: data.fullName,
    email: data.email,
    phone: data.phone,
    zalo: data.zalo,
    use_case: data.useCase,
    status: data.status,
    linked_uid: data.linkedUid,
    grant_message: data.grantMessage,
    email_status: data.emailStatus,
    email_error: data.emailError,
    granted_at: data.grantedAt,
    email_sent_at: data.emailSentAt,
    updated_at: now
  });
  const rows = await sbFetch(`${ENTRY_TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(body)
  });
  return rows?.[0] ? entryFromRow(rows[0]) : null;
}

export async function updateEntries(ids = [], data = {}) {
  const cleanIds = Array.from(new Set(ids.map(String).filter(Boolean))).slice(0, 200);
  if (!cleanIds.length) return [];
  return Promise.all(cleanIds.map(id => updateEntry(id, data)));
}

export async function deleteEntry(id) {
  return sbFetch(`${ENTRY_TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' }
  });
}

export async function addEmailLog(data = {}) {
  const rows = await sbFetch(EMAIL_LOG_TABLE, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(cleanObj({
      campaign_id: data.campaignId,
      entry_id: data.entryId,
      to_email: data.toEmail,
      subject: data.subject,
      status: data.status,
      error_message: data.errorMessage || '',
      created_at: new Date().toISOString()
    }))
  });
  return rows?.[0] || null;
}
