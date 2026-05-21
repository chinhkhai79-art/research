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
    res.status(500).json({
      success: false,
      error: 'Thiếu biến môi trường ADMIN_SECRET hoặc ADMIN_SETTINGS_PASSWORD trên Vercel.'
    });
    return false;
  }

  if (getAdminToken(req) !== expected) {
    res.status(401).json({ success: false, error: 'Sai mật khẩu quản trị.' });
    return false;
  }

  return true;
}

function toDate(value) {
  return value?.toDate?.() || (value ? new Date(value) : null);
}

function toIso(value) {
  const d = toDate(value);
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

function remainText(iso) {
  if (!iso) return '---';
  const diff = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(diff) || diff <= 0) return 'Đã hết hạn';

  const totalHours = Math.floor(diff / 3600000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return days > 0 ? `${days} ngày ${hours} giờ` : `${hours} giờ`;
}

function normalizeUser(doc) {
  const d = doc.data() || {};
  const premiumExpiresAt = toIso(d.premiumExpiresAt || d.expired_at || d.expiresAt || d.proUntil);
  const trialExpiresAt = toIso(d.trialExpiresAt);
  const premiumActive = Boolean(d.premium || d.account_type === 'premium') && premiumExpiresAt && new Date(premiumExpiresAt).getTime() > Date.now();
  const trialActive = !premiumActive && d.account_type === 'trial' && trialExpiresAt && new Date(trialExpiresAt).getTime() > Date.now();
  const status = premiumActive ? 'PRO' : trialActive ? 'TRIAL' : 'HẾT HẠN';
  const expiresAt = premiumActive ? premiumExpiresAt : (premiumExpiresAt || trialExpiresAt);

  return {
    uid: doc.id,
    userId: d.userId || doc.id,
    email: d.email || d.userEmail || '',
    name: d.name || d.displayName || d.userName || '',
    photoUrl: d.photoUrl || '',
    accountType: premiumActive ? 'premium' : trialActive ? 'trial' : (d.account_type || 'expired'),
    status,
    active: Boolean(premiumActive || trialActive),
    premium: Boolean(premiumActive),
    planId: d.planId || '',
    planName: premiumActive ? (d.planName || 'GÓI PRO') : trialActive ? 'Dùng thử 1 giờ' : (d.planName || ''),
    premiumStartedAt: toIso(d.premiumStartedAt || d.started_at),
    trialStartedAt: toIso(d.trialStartedAt),
    expiresAt,
    premiumExpiresAt,
    trialExpiresAt,
    remainingText: remainText(expiresAt),
    lastPaymentOrderCode: d.lastPaymentOrderCode || d.lastOrderCode || d.last_paid_order || '',
    lastPaymentAmount: d.lastPaymentAmount || 0,
    disabledByAdmin: Boolean(d.disabledByAdmin),
    manualActivation: Boolean(d.manualActivation),
    migratedTo: d.migratedTo || '',
    createdAt: toIso(d.created_at || d.createdAt),
    updatedAt: toIso(d.updated_at || d.updatedAt)
  };
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const q = String(req.query.q || req.body?.q || '').trim().toLowerCase();
    const limit = Math.min(Number(req.query.limit || req.body?.limit || 500) || 500, 1000);

    const snap = await db.collection('users').limit(limit).get();
    let users = snap.docs.map(normalizeUser);

    if (q) {
      users = users.filter(u =>
        String(u.email || '').toLowerCase().includes(q) ||
        String(u.uid || '').toLowerCase().includes(q) ||
        String(u.userId || '').toLowerCase().includes(q) ||
        String(u.name || '').toLowerCase().includes(q)
      );
    }

    users.sort((a, b) => {
      const at = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bt = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bt - at;
    });

    return res.status(200).json({ success: true, users, count: users.length });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Không tải được danh sách tài khoản.'
    });
  }
}
