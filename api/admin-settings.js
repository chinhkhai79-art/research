import { getAppSettings, saveAppSettings, maskSettings, requireAdmin, normalizeSettings, diffSettings, VIETNAM_BANKS, PLAN_IDS, PRICING_VERSION } from '../lib/appSettings.js';
import { isSupabaseConfigured, addAdminLog as sbAddAdminLog, getAppSettingsRow as sbGetAppSettingsRow } from '../lib/supabaseAdmin.js';

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-admin-password,x-admin-key,x-admin-secret');
  if (req.method === 'OPTIONS') { res.status(200).end(); return true; }
  return false;
}
function send(res, status, data) { return res.status(status).json(data); }
function publicError(e) { return e?.message || 'Server error'; }
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim();
}

// Ghi log mọi thay đổi cấu hình vào admin_logs để bạn theo dõi ai đổi gì khi nào.
async function logSettingsChange({ action, changes, ip, reason }) {
  if (!changes || changes.length === 0) return;
  try {
    if (!isSupabaseConfigured()) {
      console.warn('Supabase chưa cấu hình, bỏ qua log settings để không ghi Firestore.');
      return;
    }
    await sbAddAdminLog({
      action,
      targetUid: 'app_settings',
      targetEmail: 'research_config',
      changes,
      ip: ip || '',
      reason: reason || `Đổi ${changes.length} mục`
    });
  } catch (err) {
    console.error('logSettingsChange error:', err);
  }
}

async function testEmail(settings, testEmail) {
  const to = String(testEmail || '').trim();
  if (!to) throw new Error('Vui lòng nhập email nhận test.');
  const { sendGenericEmail } = await import('../lib/mailer.js');
  await sendGenericEmail({
    to,
    subject: 'Test SMTP - Văn Thế Web',
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6"><b>SMTP hoạt động.</b><br>Email test từ hệ thống Research.</div>`,
    settings
  });
  return true;
}


async function checkYoutubeTrialApiKey(key) {
  const clean = String(key || '').trim();
  if (!clean) throw new Error('Vui lòng nhập YouTube API Key V3 để kiểm tra.');
  const params = new URLSearchParams({ part: 'snippet', chart: 'mostPopular', regionCode: 'US', maxResults: '1', key: clean });
  const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`);
  const data = await r.json().catch(() => ({}));
  if (r.ok && !data?.error) return { ok: true, message: 'YouTube API Key V3 hợp lệ và gọi được dữ liệu thật.' };
  const reason = data?.error?.errors?.[0]?.reason || data?.error?.status || data?.error?.message || `HTTP ${r.status}`;
  throw new Error(`YouTube API Key chưa dùng được: ${reason}`);
}

async function checkGeminiTrialApiKey(key) {
  const clean = String(key || '').trim();
  if (!clean) throw new Error('Vui lòng nhập Gemini API Key để kiểm tra.');
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(clean)}`);
  const data = await r.json().catch(() => ({}));
  if (r.ok && !data?.error) return { ok: true, message: 'Gemini API Key hợp lệ và gọi được Google Generative Language API.' };
  const reason = data?.error?.message || data?.error?.status || `HTTP ${r.status}`;
  throw new Error(`Gemini API Key chưa dùng được: ${reason}`);
}

// === TÍNH NĂNG MỚI: trạng thái hệ thống ===
// Trả về flag cho biết các thành phần quan trọng đã cấu hình chưa.
async function getSystemStatus() {
  const settings = await getAppSettings();
  const p = settings.payment || {};
  const s = settings.smtp || {};
  const hasAdminSecret = Boolean(
    process.env.ADMIN_SECRET ||
    process.env.ADMIN_SETTINGS_PASSWORD ||
    process.env.ADMIN_PASSWORD ||
    process.env.ADMIN_SETTINGS_KEY
  );
  const hasSepaySecret = Boolean(p.sepaySecret || process.env.SEPAY_API_KEY || process.env.SEPAY_WEBHOOK_SECRET);
  const hasBankInfo = Boolean(p.bankAccount && p.bankOwner && p.bankId);
  const hasPaymentPrefix = Boolean(p.paymentPrefix);
  const hasSmtp = Boolean(s.smtpUser && s.smtpHost);

  // Check database
  let databaseOk = false;
  try {
    if (isSupabaseConfigured()) {
      await sbGetAppSettingsRow();
      databaseOk = true;
    }
  } catch (_) { databaseOk = false; }

  const checks = [
    { key: 'database', label: 'Supabase Postgres kết nối', ok: databaseOk, critical: true, hint: databaseOk ? '' : 'Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trên Vercel, hoặc chưa chạy SQL schema.' },
    { key: 'adminSecret', label: 'Mật khẩu quản trị (ADMIN_SECRET)', ok: hasAdminSecret, critical: true, hint: hasAdminSecret ? '' : 'Bạn đang dùng mật khẩu mặc định không an toàn. Vào Vercel Env đặt ADMIN_SECRET.' },
    { key: 'sepaySecret', label: 'API Key bảo vệ SePay webhook', ok: hasSepaySecret, critical: true, hint: hasSepaySecret ? '' : 'Webhook đang mở, kẻ tấn công có thể giả mạo. Đặt API Key SePay ngay.' },
    { key: 'bankInfo', label: 'Thông tin tài khoản ngân hàng', ok: hasBankInfo, critical: true },
    { key: 'paymentPrefix', label: 'Tiền tố nội dung chuyển khoản', ok: hasPaymentPrefix, critical: false },
    { key: 'smtp', label: 'SMTP gửi email (User + Host)', ok: hasSmtp, critical: false, hint: hasSmtp ? '' : 'Chưa cấu hình → khách thanh toán xong không nhận được email xác nhận.' }
  ];
  return { checks, summary: { ok: checks.filter(c => c.ok).length, total: checks.length, critical_missing: checks.filter(c => !c.ok && c.critical).length } };
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (!requireAdmin(req, res)) return;
  const ip = clientIp(req);

  try {
    const action = String(req.query?.action || req.body?.action || (req.method === 'GET' ? 'get' : 'save')).trim();

    // === Mới: trả về danh sách ngân hàng (check trước nhánh GET mặc định) ===
    if (action === 'get-banks') {
      return send(res, 200, { success: true, banks: VIETNAM_BANKS });
    }

    // === Mới: trạng thái hệ thống ===
    if (action === 'get-status') {
      const status = await getSystemStatus();
      return send(res, 200, { success: true, ...status });
    }

    if (action === 'get' || (req.method === 'GET' && !action)) {
      const settings = await getAppSettings();
      return send(res, 200, { success: true, settings: maskSettings(settings) });
    }

    if (req.method !== 'POST') return send(res, 405, { success: false, error: 'Method not allowed' });

    if (action === 'check-trial-youtube-key') {
      const result = await checkYoutubeTrialApiKey(req.body?.key || req.body?.trialYoutubeApiKey || req.body?.youtubeApiKey);
      return send(res, 200, { success: true, ...result });
    }

    if (action === 'check-trial-gemini-key') {
      const result = await checkGeminiTrialApiKey(req.body?.key || req.body?.trialGeminiApiKey || req.body?.geminiApiKey);
      return send(res, 200, { success: true, ...result });
    }

    if (action === 'save-payment') {
      const current = await getAppSettings();
      const incoming = req.body?.payment || req.body || {};
      const next = await saveAppSettings({ payment: { ...(current.payment || {}), ...incoming } });
      const changes = diffSettings(current, next);
      await logSettingsChange({ action: 'update_payment_settings', changes, ip, reason: req.body?.reason });
      return send(res, 200, { success: true, message: 'Đã lưu cấu hình thanh toán.', settings: maskSettings(next), changes });
    }

    if (action === 'save-smtp') {
      const current = await getAppSettings();
      const next = await saveAppSettings({ smtp: { ...(current.smtp || {}), ...(req.body?.smtp || req.body || {}) } });
      const changes = diffSettings(current, next);
      await logSettingsChange({ action: 'update_smtp_settings', changes, ip, reason: req.body?.reason });
      return send(res, 200, { success: true, message: 'Đã lưu cấu hình SMTP.', settings: maskSettings(next), changes });
    }

    if (action === 'save-email-template') {
      const current = await getAppSettings();
      const incoming = req.body?.emailTemplates || req.body?.templates || {};
      const payload = { ...(current.emailTemplates || {}) };
      if (incoming.paymentSuccess || req.body?.paymentSuccess) {
        payload.paymentSuccess = {
          ...(current.emailTemplates?.paymentSuccess || {}),
          ...(incoming.paymentSuccess || req.body?.paymentSuccess || {})
        };
      }
      if (incoming.adminPaymentSuccess || req.body?.adminPaymentSuccess) {
        payload.adminPaymentSuccess = {
          ...(current.emailTemplates?.adminPaymentSuccess || {}),
          ...(incoming.adminPaymentSuccess || req.body?.adminPaymentSuccess || {})
        };
      }
      const next = await saveAppSettings({ emailTemplates: payload });
      const changes = diffSettings(current, next);
      await logSettingsChange({ action: 'update_email_templates', changes, ip, reason: req.body?.reason || 'Cập nhật mẫu email thanh toán' });
      return send(res, 200, { success: true, message: 'Đã lưu mẫu email.', settings: maskSettings(next), changes });
    }

    if (action === 'save-trial') {
      const current = await getAppSettings();
      const incoming = req.body?.account || req.body?.trial || req.body || {};
      const next = await saveAppSettings({ account: { ...(current.account || {}), ...incoming } });
      const changes = diffSettings(current, next);
      await logSettingsChange({ action: 'update_trial_settings', changes, ip, reason: req.body?.reason || 'Đổi thời gian dùng thử tài khoản mới' });
      return send(res, 200, { success: true, message: 'Đã lưu thời gian dùng thử cho tài khoản mới.', settings: maskSettings(next), changes });
    }

    // Lưu riêng các gói (giá + ngày + bật/tắt). Giá này là nguồn chuẩn phía server.
    if (action === 'save-plans') {
      const current = await getAppSettings();
      const incomingPlans = req.body?.plans || {};
      const mergedPlans = { ...(current.payment.plans || {}) };

      for (const id of PLAN_IDS) {
        const incoming = incomingPlans[id];
        if (!incoming) continue;
        const name = String(incoming.name || '').trim().replace(/premium/gi, 'PRO').toUpperCase();
        const days = Number(incoming.days);
        const amount = Number(incoming.amount);
        if (!name) throw new Error(`Tên gói ${id} không được để trống.`);
        if (!Number.isInteger(days) || days < 1) throw new Error(`Số ngày của gói ${id} phải là số nguyên lớn hơn 0.`);
        if (!Number.isInteger(amount) || amount < 1000) throw new Error(`Giá của gói ${id} phải là số nguyên từ 1.000 VND trở lên.`);
        mergedPlans[id] = { id, name, days, amount, enabled: incoming.enabled !== false };
      }

      if (!PLAN_IDS.some(id => mergedPlans[id]?.enabled !== false)) {
        throw new Error('Phải bật bán ít nhất một gói PRO.');
      }

      const next = await saveAppSettings({
        payment: {
          ...(current.payment || {}),
          pricingVersion: PRICING_VERSION,
          plansManaged: true,
          plans: mergedPlans
        }
      });
      const changes = diffSettings(current, next);
      await logSettingsChange({ action: 'update_plans', changes, ip, reason: req.body?.reason });
      return send(res, 200, { success: true, message: 'Đã lưu giá và thời hạn các gói PRO.', settings: maskSettings(next), changes });
    }

    if (action === 'test-webhook') {
      const current = await getAppSettings();
      const incoming = req.body?.payment || req.body || {};
      const next = await saveAppSettings({ payment: { ...(current.payment || {}), ...incoming } });
      const changes = diffSettings(current, next);
      await logSettingsChange({ action: 'test_and_save_payment_webhook', changes, ip, reason: req.body?.reason || 'Kiểm tra webhook SePay và đồng bộ cấu hình thanh toán' });

      const settings = normalizeSettings(next);
      if (!settings.payment.bankAccount) throw new Error('Thiếu số tài khoản.');
      if (!settings.payment.paymentPrefix) throw new Error('Thiếu tiền tố nội dung chuyển khoản.');
      if (!settings.payment.webhookUrl) throw new Error('Thiếu Webhook URL.');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      let hookData = null;
      try {
        const hookRes = await fetch(settings.payment.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(settings.payment.sepaySecret ? {
              Authorization: `Bearer ${settings.payment.sepaySecret}`,
              'x-api-key': settings.payment.sepaySecret
            } : {})
          },
          body: JSON.stringify({
            __healthCheck: true,
            type: 'health_check',
            content: `${settings.payment.paymentPrefix}TESTWEBHOOK`,
            transferAmount: 0,
            transferType: 'in',
            source: 'admin-settings'
          }),
          signal: controller.signal
        });
        const raw = await hookRes.text();
        try { hookData = raw ? JSON.parse(raw) : {}; } catch { hookData = { success:false, error: raw || hookRes.statusText }; }
        if (!hookRes.ok || hookData.success === false) {
          throw new Error(hookData.error || hookData.message || `Webhook trả HTTP ${hookRes.status}`);
        }
      } finally {
        clearTimeout(timer);
      }

      return send(res, 200, {
        success: true,
        message: `Đã lưu cấu hình và kiểm tra webhook OK. STK đang dùng: ${settings.payment.bankAccount}. Chủ TK: ${settings.payment.bankOwner}.`,
        webhookUrl: settings.payment.webhookUrl,
        payment: maskSettings(settings).payment,
        hook: hookData
      });
    }

    if (action === 'test-email') {
      const current = await getAppSettings();
      const merged = normalizeSettings({ ...current, smtp: { ...(current.smtp || {}), ...(req.body?.smtp || {}) } });
      await testEmail(merged, req.body?.testEmail);
      return send(res, 200, { success: true, message: 'Đã gửi email test.' });
    }

    if (action === 'test-payment-email-template') {
      const current = await getAppSettings();
      const incoming = req.body?.emailTemplates || req.body?.templates || {};
      const merged = normalizeSettings({
        ...current,
        emailTemplates: {
          ...(current.emailTemplates || {}),
          paymentSuccess: {
            ...(current.emailTemplates?.paymentSuccess || {}),
            ...(incoming.paymentSuccess || req.body?.paymentSuccess || {})
          }
        }
      });
      const to = String(req.body?.testEmail || req.body?.email || '').trim();
      const { sendPaymentSuccessEmail } = await import('../lib/mailer.js');
      await sendPaymentSuccessEmail({
        email: to,
        userName: '',
        orderCode: 'TUBEKEY040726100259',
        planName: 'GÓI 1 THÁNG',
        amount: 299000,
        paidAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        toolUrl: merged.smtp.emailBaseUrl || merged.payment.baseUrl,
        settings: merged
      });
      return send(res, 200, { success: true, message: 'Đã gửi email test mẫu thanh toán thành công.' });
    }

    if (action === 'test-admin-payment-email-template') {
      const current = await getAppSettings();
      const incoming = req.body?.emailTemplates || req.body?.templates || {};
      const merged = normalizeSettings({
        ...current,
        emailTemplates: {
          ...(current.emailTemplates || {}),
          adminPaymentSuccess: {
            ...(current.emailTemplates?.adminPaymentSuccess || {}),
            ...(incoming.adminPaymentSuccess || req.body?.adminPaymentSuccess || {})
          }
        }
      });
      const to = String(req.body?.testEmail || req.body?.email || '').trim();
      const { sendAdminPaymentSuccessEmail } = await import('../lib/mailer.js');
      await sendAdminPaymentSuccessEmail({
        adminEmail: to,
        email: 'user@gmail.com',
        userName: 'User Test',
        orderCode: 'TUBEKEY040726100259',
        planName: 'GÓI 1 THÁNG',
        amount: 299000,
        paidAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        toolUrl: merged.smtp.emailBaseUrl || merged.payment.baseUrl,
        settings: merged
      });
      return send(res, 200, { success: true, message: 'Đã gửi test mẫu email thông báo Admin.' });
    }

    // Fallback: lưu toàn bộ
    const current = await getAppSettings();
    const saved = await saveAppSettings(req.body?.settings || req.body || {});
    const changes = diffSettings(current, saved);
    await logSettingsChange({ action: 'update_all_settings', changes, ip, reason: req.body?.reason });
    return send(res, 200, { success: true, settings: maskSettings(saved), changes });
  } catch (e) {
    console.error('admin-settings error:', e);
    return send(res, 500, { success: false, error: publicError(e) });
  }
}
