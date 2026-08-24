import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://mock.supabase.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-secret-key';
process.env.ADMIN_SECRET = 'test-admin-secret';

const campaigns = [{
  id: 1,
  name: 'Nhận TubeKey',
  slug: 'nhan-tubekey',
  title: 'Đăng ký nhận TubeKey',
  description: 'Mô tả kiểm thử',
  success_message: 'Đã tiếp nhận.',
  tool_url: 'https://www.tubekey.vn',
  delivery_mode: 'manual',
  email_subject: 'Link nhận tool - {{campaign}}',
  email_html: '',
  button_label: 'Đăng ký nhận tool',
  require_phone: true,
  require_zalo: false,
  is_active: true,
  created_at: '2026-08-24T00:00:00.000Z',
  updated_at: '2026-08-24T00:00:00.000Z'
}];
const entries = [];

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

globalThis.fetch = async (url, options = {}) => {
  const target = new URL(url);
  const table = target.pathname.split('/').pop();
  const method = String(options.method || 'GET').toUpperCase();
  if (table === 'tool_intake_campaigns') {
    if (method === 'GET') {
      const slug = target.searchParams.get('slug')?.replace(/^eq\./, '');
      const id = target.searchParams.get('id')?.replace(/^eq\./, '');
      return jsonResponse(campaigns.filter(row => (!slug || row.slug === slug) && (!id || String(row.id) === id)));
    }
    if (method === 'POST') {
      const body = JSON.parse(options.body || '{}');
      const row = { id: campaigns.length + 1, ...body };
      campaigns.push(row);
      return jsonResponse([row], 201);
    }
    if (method === 'PATCH') {
      const id = target.searchParams.get('id')?.replace(/^eq\./, '');
      const row = campaigns.find(item => String(item.id) === id);
      Object.assign(row, JSON.parse(options.body || '{}'));
      return jsonResponse([row]);
    }
  }
  if (table === 'tool_intake_entries') {
    if (method === 'GET') {
      const campaignId = target.searchParams.get('campaign_id')?.replace(/^eq\./, '');
      const wantedEmail = target.searchParams.get('email')?.replace(/^eq\./, '');
      return jsonResponse(entries.filter(row => (!campaignId || String(row.campaign_id) === campaignId) && (!wantedEmail || row.email === wantedEmail)));
    }
    if (method === 'POST') {
      const body = JSON.parse(options.body || '{}');
      const row = { id: entries.length + 1, ...body };
      entries.push(row);
      return jsonResponse([row], 201);
    }
  }
  if (table === 'tool_intake_email_logs') return jsonResponse([]);
  throw new Error(`Unexpected mock request: ${method} ${url}`);
};

const { default: handler } = await import('../api/tool-intake.js');

function responseCapture() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
    end() { return this; }
  };
}

async function invoke({ method = 'GET', query = {}, body = {}, headers = {} } = {}) {
  const req = { method, query, body, headers, socket: { remoteAddress: '127.0.0.1' } };
  const res = responseCapture();
  await handler(req, res);
  return res;
}

const publicResult = await invoke({ query: { action: 'public-campaign', slug: 'nhan-tubekey' } });
assert.equal(publicResult.statusCode, 200);
assert.equal(publicResult.body.campaign.title, 'Đăng ký nhận TubeKey');
assert.equal(publicResult.body.campaign.buttonLabel, 'Đăng ký nâng cấp PRO');
assert.equal(publicResult.body.campaign.publicUrl, 'https://www.tubekey.vn/nhan-tubekey');
assert.equal('toolUrl' in publicResult.body.campaign, false, 'Public campaign must not expose the tool URL.');

const invalidResult = await invoke({
  method: 'POST',
  query: { action: 'register' },
  body: { slug: 'nhan-tubekey', fullName: 'Nguyễn Văn A', email: 'sai-email', phone: '0900000000', zalo: 'https://zalo.me/g/stmbujxgboawdcem8wjk' }
});
assert.equal(invalidResult.statusCode, 400);

const invalidPhoneResult = await invoke({
  method: 'POST',
  query: { action: 'register' },
  body: { slug: 'nhan-tubekey', fullName: 'Nguyễn Văn A', email: 'phone@example.com', phone: '0123456789', zalo: 'https://zalo.me/g/stmbujxgboawdcem8wjk' }
});
assert.equal(invalidPhoneResult.statusCode, 400);

const invalidZaloResult = await invoke({
  method: 'POST',
  query: { action: 'register' },
  body: { slug: 'nhan-tubekey', fullName: 'Nguyễn Văn A', email: 'user@example.com', phone: '0900000000', zalo: 'https://zalo.me/0900000000' }
});
assert.equal(invalidZaloResult.statusCode, 400);

const registerResult = await invoke({
  method: 'POST',
  query: { action: 'register' },
  body: { slug: 'nhan-tubekey', fullName: 'Nguyễn Văn A', email: 'user@example.com', phone: '0900000000', zalo: 'https://zalo.me/g/stmbujxgboawdcem8wjk' }
});
assert.equal(registerResult.statusCode, 201);
assert.equal(registerResult.body.success, true);
assert.equal(entries.length, 1);
assert.equal(entries[0].phone, '0900000000');
assert.equal(entries[0].zalo, 'https://zalo.me/g/stmbujxgboawdcem8wjk');

const duplicateResult = await invoke({
  method: 'POST',
  query: { action: 'register' },
  body: { slug: 'nhan-tubekey', fullName: 'Nguyễn Văn A', email: 'user@example.com', phone: '0900000000', zalo: 'https://zalo.me/g/stmbujxgboawdcem8wjk' }
});
assert.equal(duplicateResult.statusCode, 200);
assert.equal(duplicateResult.body.duplicate, true);

const unauthorized = await invoke({ query: { action: 'campaigns' } });
assert.equal(unauthorized.statusCode, 401);

const adminCampaigns = await invoke({ query: { action: 'campaigns' }, headers: { 'x-admin-secret': 'test-admin-secret' } });
assert.equal(adminCampaigns.statusCode, 200);
assert.equal(adminCampaigns.body.campaigns[0].totalEntries, 1);

const exportResult = await invoke({
  query: { action: 'export', campaignId: '1' },
  headers: { 'x-admin-secret': 'test-admin-secret' }
});
assert.equal(exportResult.statusCode, 200);
assert.equal(exportResult.headers['content-type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
assert.equal(Buffer.isBuffer(exportResult.body), true);
assert.equal(exportResult.body.subarray(0, 2).toString('ascii'), 'PK');

console.log('tool-intake tests passed: direct public URL, strict validation, registration, duplicate handling, admin auth/counts and XLSX export.');
