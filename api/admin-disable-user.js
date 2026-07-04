import { setCors } from '../lib/cors.js';
import { isSupabaseConfigured, findUserTargets as sbFindUserTargets, upsertUser as sbUpsertUser, addAdminLog as sbAddAdminLog } from '../lib/supabaseAdmin.js';

function getAdminToken(req) { return String(req.headers['x-admin-secret'] || req.headers['x-admin-key'] || req.headers.authorization || req.query.password || req.query.adminSecret || req.query.adminKey || req.body?.password || req.body?.adminSecret || req.body?.adminKey || '').replace(/^Bearer\s+/i, '').trim(); }
function requireAdmin(req, res) {
  const expected = String(process.env.ADMIN_SECRET || process.env.ADMIN_SETTINGS_PASSWORD || process.env.ADMIN_PASSWORD || process.env.ADMIN_SETTINGS_KEY || '').trim();
  if (!expected) { res.status(500).json({ success: false, error: 'Thiếu biến môi trường ADMIN_SECRET hoặc ADMIN_SETTINGS_PASSWORD trên Vercel.' }); return false; }
  if (getAdminToken(req) !== expected) { res.status(401).json({ success: false, error: 'Sai mật khẩu quản trị.' }); return false; }
  return true;
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (!requireAdmin(req, res)) return;
  try {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
    if (!isSupabaseConfigured()) return res.status(200).json({ success:false, code:'SUPABASE_NOT_CONFIGURED', error:'Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trên Vercel. Khóa PRO đã chuyển sang Supabase, không còn ghi Firestore.' });
    const body = req.body || {};
    const uid = String(body.uid || body.userId || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const reason = String(body.reason || '').trim();
    if (!uid && !email) return res.status(400).json({ success: false, error: 'Cần nhập UID hoặc email.' });
    const targets = await sbFindUserTargets({ uid, email });
    if (!targets.length) return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản cần khóa.' });
    const now = new Date();
    await Promise.all(targets.map(t => sbUpsertUser(t.uid, {
      ...t.data,
      account_type: 'expired', premium: false, isPro: false, pro: false, active: false,
      disabledByAdmin: true, disabledAt: now.toISOString(),
      premiumExpiresAt: now.toISOString(), expired_at: now.toISOString(), expiresAt: now.toISOString(),
      lastAdminAction: 'disable_pro', lastAdminReason: reason, updated_at: now.toISOString()
    })));
    await sbAddAdminLog({ action: 'disable_pro', targetUid: uid || targets.map(t => t.uid).join(','), targetEmail: email, affectedCount: targets.length, reason });
    return res.status(200).json({ success: true, message: 'Đã khóa/hủy PRO tài khoản.', affectedCount: targets.length, dataSource: 'supabase' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || 'Không khóa được tài khoản.' });
  }
}
