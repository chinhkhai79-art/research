import { getAppSettingsRow, saveAppSettingsRow } from './supabaseAdmin.js';
import { normalizeSettings } from './appSettings.js';

const LIMIT_MESSAGE = 'Hệ thống dùng thử đang quá tải (Đạt giới hạn 20 người dùng cùng lúc). Vui lòng thử lại sau ít phút!';

export function getClientIp(req = {}) {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded
    || String(req.headers?.['x-real-ip'] || '').trim()
    || String(req.headers?.['cf-connecting-ip'] || '').trim()
    || String(req.socket?.remoteAddress || '').trim()
    || 'unknown';
}

export async function checkTrialIpAccess(req) {
  const row = await getAppSettingsRow();
  const rawSettings = row?.settings && typeof row.settings === 'object' ? row.settings : {};
  const settings = normalizeSettings(rawSettings);
  const account = settings.account || {};

  if (!account.trialIpLimitEnabled) {
    return {
      allowed: true,
      enabled: false,
      ip: getClientIp(req),
      activeCount: 0,
      maxActive: 20,
      ttlMinutes: 10,
      message: 'IP limit đang tắt.'
    };
  }

  const ip = getClientIp(req).slice(0, 96) || 'unknown';
  const maxActive = 20;
  const ttlMinutes = 10;
  const ttlMs = ttlMinutes * 60 * 1000;
  const now = Date.now();
  const runtime = rawSettings.trialIpRuntime && typeof rawSettings.trialIpRuntime === 'object' ? rawSettings.trialIpRuntime : {};
  const rawIps = runtime.activeIps && typeof runtime.activeIps === 'object' ? runtime.activeIps : {};
  const activeIps = {};

  for (const [storedIp, ts] of Object.entries(rawIps)) {
    const cleanIp = String(storedIp || '').slice(0, 96);
    const n = Number(ts);
    if (cleanIp && Number.isFinite(n) && now - n <= ttlMs) activeIps[cleanIp] = n;
  }

  const alreadyActive = Object.prototype.hasOwnProperty.call(activeIps, ip);
  const activeCount = Object.keys(activeIps).length;

  if (!alreadyActive && activeCount >= maxActive) {
    const nextSettings = {
      ...rawSettings,
      trialIpRuntime: {
        activeIps,
        lastUpdatedAt: new Date(now).toISOString()
      }
    };
    try { await saveAppSettingsRow(nextSettings); } catch (error) { console.error('[trial-ip-limit cleanup]', error); }
    return {
      allowed: false,
      enabled: true,
      ip,
      activeCount,
      maxActive,
      ttlMinutes,
      message: LIMIT_MESSAGE
    };
  }

  activeIps[ip] = now;
  const nextSettings = {
    ...rawSettings,
    trialIpRuntime: {
      activeIps,
      lastUpdatedAt: new Date(now).toISOString()
    }
  };
  await saveAppSettingsRow(nextSettings);

  return {
    allowed: true,
    enabled: true,
    ip,
    activeCount: Object.keys(activeIps).length,
    maxActive,
    ttlMinutes,
    message: 'Đã cho phép IP dùng key trải nghiệm.'
  };
}
