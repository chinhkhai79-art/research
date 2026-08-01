import { requireAdmin } from '../lib/appSettings.js';
import { isSupabaseConfigured, sbFetch, addAdminLog } from '../lib/supabaseAdmin.js';

const KEEPALIVE_KEY = 'research_keepalive';
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DEFAULT_STATE = Object.freeze({
  enabled: true,
  intervalDays: 1,
  runHourVietnam: 8,
  lastRunAt: '',
  lastSuccessAt: '',
  nextRunAt: '',
  lastError: '',
  lastSource: '',
  lastVerifiedAt: '',
  totalRuns: 0,
  totalSuccess: 0,
  nonce: '',
  history: []
});

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-admin-password,x-admin-key,x-admin-secret');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

function parseBody(req) {
  if (!req?.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}

function clampDays(value) {
  const n = Math.round(Number(value || 1));
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(n, 1), 6);
}

function normalizeState(value = {}) {
  const raw = value && typeof value === 'object' ? value : {};
  const history = Array.isArray(raw.history) ? raw.history.slice(0, 15) : [];
  return {
    ...DEFAULT_STATE,
    ...raw,
    enabled: raw.enabled !== false,
    intervalDays: clampDays(raw.intervalDays),
    runHourVietnam: 8,
    lastRunAt: String(raw.lastRunAt || ''),
    lastSuccessAt: String(raw.lastSuccessAt || ''),
    nextRunAt: String(raw.nextRunAt || ''),
    lastError: String(raw.lastError || ''),
    lastSource: String(raw.lastSource || ''),
    lastVerifiedAt: String(raw.lastVerifiedAt || ''),
    totalRuns: Math.max(0, Number(raw.totalRuns || 0)),
    totalSuccess: Math.max(0, Number(raw.totalSuccess || 0)),
    nonce: String(raw.nonce || ''),
    history
  };
}

function nextVietnamRun(lastSuccessAt, intervalDays) {
  const baseMs = lastSuccessAt ? new Date(lastSuccessAt).getTime() : Date.now();
  const safeBase = Number.isFinite(baseMs) ? baseMs : Date.now();
  const vn = new Date(safeBase + VN_OFFSET_MS);
  return new Date(Date.UTC(
    vn.getUTCFullYear(),
    vn.getUTCMonth(),
    vn.getUTCDate() + clampDays(intervalDays),
    1, 0, 0, 0
  )).toISOString();
}

function isDue(state) {
  if (!state.lastSuccessAt) return true;
  const dueAt = state.nextRunAt || nextVietnamRun(state.lastSuccessAt, state.intervalDays);
  const dueMs = new Date(dueAt).getTime();
  return !Number.isFinite(dueMs) || Date.now() >= dueMs;
}

async function readState() {
  const rows = await sbFetch(`app_settings?key=eq.${KEEPALIVE_KEY}&select=key,settings,updated_at&limit=1`);
  const row = rows?.[0] || null;
  const state = normalizeState(row?.settings || {});
  if (!state.nextRunAt && state.lastSuccessAt) {
    state.nextRunAt = nextVietnamRun(state.lastSuccessAt, state.intervalDays);
  }
  return { row, state };
}

async function writeState(state) {
  const normalized = normalizeState(state);
  const updatedAt = new Date().toISOString();
  const rows = await sbFetch('app_settings?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ key: KEEPALIVE_KEY, settings: normalized, updated_at: updatedAt })
  });
  return rows?.[0] || { key: KEEPALIVE_KEY, settings: normalized, updated_at: updatedAt };
}

function isVercelCron(req) {
  const auth = String(req.headers?.authorization || '');
  const cronSecret = String(process.env.CRON_SECRET || process.env.ADMIN_CRON_SECRET || '').trim();
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  const userAgent = String(req.headers?.['user-agent'] || '').toLowerCase();
  return userAgent.includes('vercel-cron/1.0');
}

function publicState(state) {
  const s = normalizeState(state);
  return {
    ...s,
    databaseConfigured: isSupabaseConfigured(),
    cronSecretConfigured: Boolean(process.env.CRON_SECRET || process.env.ADMIN_CRON_SECRET),
    cronScheduleUtc: '0 1 * * *',
    cronScheduleVietnam: '08:00 mỗi ngày (Vercel Hobby có thể chạy trong khoảng 08:00–08:59)',
    serverlessFunctions: 10,
    serverlessLimitHobby: 12
  };
}

async function runHeartbeat(source = 'manual') {
  const before = await readState();
  const now = new Date().toISOString();
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const totalRuns = Number(before.state.totalRuns || 0) + 1;

  try {
    // Bước 1: ghi mã heartbeat mới vào database.
    await writeState({
      ...before.state,
      lastRunAt: now,
      lastError: '',
      lastSource: source,
      totalRuns,
      nonce
    });

    // Bước 2: đọc lại để xác minh đây là hoạt động database thật.
    const verified = await readState();
    if (verified.state.nonce !== nonce) {
      throw new Error('Đã ghi heartbeat nhưng không đọc lại đúng mã xác minh.');
    }

    // Bước 3: lưu trạng thái thành công và lịch chạy tiếp theo.
    const successAt = new Date().toISOString();
    const historyItem = {
      at: successAt,
      source,
      status: 'success',
      message: 'Đã ghi và đọc xác minh dữ liệu Supabase.'
    };
    const finalState = normalizeState({
      ...verified.state,
      lastRunAt: now,
      lastSuccessAt: successAt,
      nextRunAt: nextVietnamRun(successAt, verified.state.intervalDays),
      lastError: '',
      lastSource: source,
      lastVerifiedAt: successAt,
      totalRuns,
      totalSuccess: Number(before.state.totalSuccess || 0) + 1,
      nonce,
      history: [historyItem, ...(before.state.history || [])].slice(0, 15)
    });
    await writeState(finalState);
    const finalVerified = await readState();
    return publicState(finalVerified.state);
  } catch (error) {
    const failureAt = new Date().toISOString();
    const failure = normalizeState({
      ...before.state,
      lastRunAt: now,
      lastError: error?.message || 'Heartbeat Supabase thất bại.',
      lastSource: source,
      totalRuns,
      history: [{
        at: failureAt,
        source,
        status: 'error',
        message: error?.message || 'Heartbeat Supabase thất bại.'
      }, ...(before.state.history || [])].slice(0, 15)
    });
    try { await writeState(failure); } catch (_) {}
    throw error;
  }
}

async function logAdmin(action, reason, data = {}) {
  try {
    await addAdminLog({
      app: 'research',
      action,
      targetUid: 'supabase_keepalive',
      targetEmail: KEEPALIVE_KEY,
      reason,
      data
    });
  } catch (error) {
    console.warn('Không ghi được admin log keepalive:', error?.message || error);
  }
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (!isSupabaseConfigured()) {
    return res.status(500).json({ success: false, error: 'Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trên Vercel.' });
  }

  const body = parseBody(req);
  const action = String(req.query?.action || body.action || '').trim().toLowerCase();
  const cronRequest = req.method === 'GET' && (action === 'cron' || isVercelCron(req));

  try {
    if (cronRequest) {
      if (!isVercelCron(req)) {
        return res.status(401).json({ success: false, error: 'Cron request không hợp lệ.' });
      }
      const current = await readState();
      if (!current.state.enabled) {
        return res.status(200).json({ success: true, skipped: true, reason: 'Tính năng đang tắt.' });
      }
      if (!isDue(current.state)) {
        return res.status(200).json({
          success: true,
          skipped: true,
          reason: 'Chưa đến chu kỳ chạy tiếp theo.',
          state: publicState(current.state)
        });
      }
      const state = await runHeartbeat('vercel-cron');
      return res.status(200).json({ success: true, ran: true, state });
    }

    if (!requireAdmin(req, res)) return;

    if (req.method === 'GET' || action === 'status' || action === 'get') {
      const current = await readState();
      return res.status(200).json({ success: true, state: publicState(current.state) });
    }

    if (action === 'save') {
      const current = await readState();
      const next = normalizeState({
        ...current.state,
        enabled: body.enabled !== false,
        intervalDays: clampDays(body.intervalDays),
        nextRunAt: current.state.lastSuccessAt
          ? nextVietnamRun(current.state.lastSuccessAt, body.intervalDays)
          : ''
      });
      await writeState(next);
      await logAdmin('keepalive_settings_saved', `Đã ${next.enabled ? 'bật' : 'tắt'} giữ Supabase hoạt động, chu kỳ ${next.intervalDays} ngày.`, {
        enabled: next.enabled,
        intervalDays: next.intervalDays
      });
      return res.status(200).json({ success: true, state: publicState(next) });
    }

    if (action === 'run-now' || action === 'run_now') {
      const state = await runHeartbeat('admin-manual');
      await logAdmin('keepalive_manual_run', 'Admin kích hoạt heartbeat Supabase thủ công.', {
        lastSuccessAt: state.lastSuccessAt,
        totalSuccess: state.totalSuccess
      });
      return res.status(200).json({ success: true, state });
    }

    return res.status(400).json({ success: false, error: 'Action không hợp lệ.' });
  } catch (error) {
    console.error('supabase-keepalive error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Không thể kích hoạt Supabase.' });
  }
}
