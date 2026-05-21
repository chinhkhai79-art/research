import { db } from '../lib/firebaseAdmin.js';
import { setCors } from '../lib/cors.js';

function getAdminToken(req) {
  return String(
    req.headers['x-admin-secret'] ||
    req.headers['x-admin-key'] ||
    req.headers.authorization ||
    req.query.password ||
    req.query.adminSecret ||
    req.query.adminKey ||
    req.body?.password ||
    req.body?.adminSecret ||
    req.body?.adminKey ||
    ''
  ).replace(/^Bearer\s+/i, '').trim();
}

function requireAdmin(req, res) {
  const expected = String(
    process.env.ADMIN_SECRET ||
    process.env.ADMIN_SETTINGS_PASSWORD ||
    process.env.ADMIN_PASSWORD ||
    process.env.ADMIN_SETTINGS_KEY ||
    ''
  ).trim();

  if (!expected) {
    res.status(500).json({ success: false, error: 'Thiếu biến môi trường ADMIN_SECRET hoặc ADMIN_SETTINGS_PASSWORD trên Vercel.' });
    return false;
  }

  if (getAdminToken(req) !== expected) {
    res.status(401).json({ success: false, error: 'Sai mật khẩu quản trị.' });
    return false;
  }

  return true;
}

function toIso(v) {
  const d = v?.toDate?.() || (v ? new Date(v) : null);
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (!requireAdmin(req, res)) return;

  try {
    const limit = Math.min(Number(req.query.limit || 100) || 100, 300);
    const snap = await db.collection('admin_logs').limit(limit).get();
    const logs = snap.docs.map(doc => {
      const d = doc.data() || {};
      return {
        id: doc.id,
        ...d,
        createdAt: toIso(d.createdAt),
        oldExpiresAt: toIso(d.oldExpiresAt),
        newExpiresAt: toIso(d.newExpiresAt)
      };
    }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    return res.status(200).json({ success: true, logs });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || 'Không tải được admin logs.' });
  }
}
