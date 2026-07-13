import { setCors } from '../../lib/cors.js';
import { authAdmin } from '../../lib/firebaseAdmin.js';
import { getAppSettings } from '../../lib/appSettings.js';
import { isSupabaseConfigured, getUserByUid } from '../../lib/supabaseAdmin.js';

function bearerToken(req) {
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

function toTime(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function splitKeys(value) {
  return Array.from(new Set(
    String(value || '')
      .split(/\r?\n|,|;/)
      .map(key => key.trim())
      .filter(Boolean)
  ));
}

function premiumIsActive(data) {
  const sub = data?.subscriptionInfo || data?.subscription || {};
  const expiresAt = toTime(
    data?.premiumExpiresAt || data?.expired_at || data?.expiresAt ||
    data?.proUntil || sub?.expiresAt || sub?.premiumExpiresAt
  );
  const premiumFlag = Boolean(
    data?.premium || data?.isPro || data?.pro || data?.account_type === 'premium' ||
    String(data?.status || '').toUpperCase() === 'PRO' || sub?.premium || sub?.isPro
  );
  return premiumFlag && expiresAt > Date.now();
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Authorization');

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const token = bearerToken(req);
    if (!token) {
      return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', error: 'Vui lòng đăng nhập lại.' });
    }

    const decoded = await authAdmin.verifyIdToken(token);
    const uid = String(decoded?.uid || '').trim();
    const requestedUid = String(req.query?.userId || req.query?.uid || '').trim();
    if (!uid || (requestedUid && requestedUid !== uid)) {
      return res.status(403).json({ success: false, code: 'UID_MISMATCH', error: 'Tài khoản không hợp lệ.' });
    }
    if (!isSupabaseConfigured()) {
      return res.status(503).json({ success: false, code: 'SUPABASE_NOT_CONFIGURED', error: 'Hệ thống dữ liệu chưa sẵn sàng.' });
    }

    const row = await getUserByUid(uid);
    const user = row?.data || null;
    const trialExpiresAt = toTime(user?.trialExpiresAt || user?.subscriptionInfo?.trialExpiresAt);
    const isTrial = Boolean(
      user &&
      user.account_type === 'trial' &&
      !premiumIsActive(user) &&
      trialExpiresAt > Date.now()
    );

    if (!isTrial) {
      return res.status(403).json({
        success: false,
        code: 'TRIAL_EXPIRED',
        error: 'Tài khoản không còn trong thời gian dùng thử.'
      });
    }

    const settings = await getAppSettings();
    const geminiApiKeys = splitKeys(settings?.account?.trialGeminiApiKey);
    const youtubeApiKeys = splitKeys(settings?.account?.trialYoutubeApiKey);

    return res.status(200).json({
      success: true,
      accountType: 'trial',
      expiresAt: new Date(trialExpiresAt).toISOString(),
      geminiApiKeys,
      youtubeApiKeys,
      configured: {
        gemini: geminiApiKeys.length > 0,
        youtube: youtubeApiKeys.length > 0
      }
    });
  } catch (error) {
    const message = String(error?.code || '').startsWith('auth/')
      ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'
      : (error?.message || 'Không lấy được API key dùng thử.');
    const status = String(error?.code || '').startsWith('auth/') ? 401 : 500;
    console.error('trial-keys error:', error);
    return res.status(status).json({ success: false, code: 'TRIAL_KEYS_ERROR', error: message });
  }
}
