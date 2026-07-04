import { db, authAdmin } from '../lib/firebaseAdmin.js';
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
    updatedAt: toIso(d.updated_at || d.updatedAt),
    firstLoginAt: toIso(d.firstLoginAt),
    lastLoginAt: toIso(d.lastLoginAt),
    loginCount: Number(d.loginCount || 0),
    source: 'firestore'
  };
}

function normalizeAuthUser(u) {
  return {
    uid: u.uid,
    userId: u.uid,
    email: u.email || '',
    name: u.displayName || '',
    photoUrl: u.photoURL || '',
    accountType: 'unknown',
    status: 'CHƯA KIỂM TRA',
    active: false,
    premium: false,
    planId: '',
    planName: 'Chưa đọc được Firestore',
    premiumStartedAt: null,
    trialStartedAt: null,
    expiresAt: null,
    premiumExpiresAt: null,
    trialExpiresAt: null,
    remainingText: '---',
    lastPaymentOrderCode: '',
    lastPaymentAmount: 0,
    disabledByAdmin: Boolean(u.disabled),
    manualActivation: false,
    migratedTo: '',
    createdAt: u.metadata?.creationTime ? new Date(u.metadata.creationTime).toISOString() : null,
    updatedAt: null,
    firstLoginAt: null,
    lastLoginAt: u.metadata?.lastSignInTime ? new Date(u.metadata.lastSignInTime).toISOString() : null,
    loginCount: 0,
    source: 'firebase_auth_fallback'
  };
}

function isQuotaError(error) {
  const text = String(error?.message || error?.details || error?.code || '').toLowerCase();
  return error?.code === 8 || text.includes('resource_exhausted') || text.includes('quota') || text.includes('free daily read units');
}

async function listUsersFromFirestore({ q, limit }) {
  const docs = new Map();

  if (q) {
    const direct = await db.collection('users').doc(q).get();
    if (direct.exists) docs.set(direct.id, direct);

    const byEmail = await db.collection('users').where('email', '==', q).limit(Math.min(limit, 20)).get();
    byEmail.docs.forEach(doc => docs.set(doc.id, doc));

    const byUserId = await db.collection('users').where('userId', '==', q).limit(Math.min(limit, 20)).get();
    byUserId.docs.forEach(doc => docs.set(doc.id, doc));

    // Nếu người quản trị gõ một phần email/tên thì chỉ đọc tối đa 100 bản ghi gần nhất để lọc,
    // không quét 500-1000 tài khoản như trước để tránh hết quota.
    if (docs.size === 0 && q.length >= 3) {
      const sample = await db.collection('users').limit(Math.min(100, Math.max(limit, 50))).get();
      sample.docs.forEach(doc => docs.set(doc.id, doc));
    }
  } else {
    const snap = await db.collection('users').limit(limit).get();
    snap.docs.forEach(doc => docs.set(doc.id, doc));
  }

  let users = Array.from(docs.values()).map(normalizeUser);

  if (q) {
    const qLower = q.toLowerCase();
    users = users.filter(u =>
      String(u.email || '').toLowerCase().includes(qLower) ||
      String(u.uid || '').toLowerCase().includes(qLower) ||
      String(u.userId || '').toLowerCase().includes(qLower) ||
      String(u.name || '').toLowerCase().includes(qLower)
    );
  }

  users.sort((a, b) => {
    const at = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bt = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bt - at;
  });

  return { users: users.slice(0, limit), nextCursor: null, exhausted: users.length < limit };
}

async function listUsersFromAuthFallback({ q, limit }) {
  const list = await authAdmin.listUsers(limit);
  let users = (list.users || []).map(normalizeAuthUser);
  if (q) {
    const qLower = q.toLowerCase();
    users = users.filter(u =>
      String(u.email || '').toLowerCase().includes(qLower) ||
      String(u.uid || '').toLowerCase().includes(qLower) ||
      String(u.name || '').toLowerCase().includes(qLower)
    );
  }
  return users;
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const q = String(req.query.q || req.body?.q || '').trim().toLowerCase();
    const limit = Math.min(Math.max(Number(req.query.limit || req.body?.limit || 50) || 50, 1), 100);
    try {
      const result = await listUsersFromFirestore({ q, limit });
      return res.status(200).json({
        success: true,
        users: result.users,
        count: result.users.length,
        limit,
        nextCursor: result.nextCursor,
        exhausted: result.exhausted,
        source: 'firestore'
      });
    } catch (error) {
      if (!isQuotaError(error)) throw error;

      const users = await listUsersFromAuthFallback({ q, limit });
      return res.status(200).json({
        success: true,
        users,
        count: users.length,
        limit,
        nextCursor: null,
        exhausted: true,
        source: 'firebase_auth_fallback',
        warning: 'Firestore đã hết quota đọc miễn phí trong ngày nên đang hiển thị tạm danh sách từ Firebase Authentication. Trạng thái PRO/Trial sẽ đọc lại khi quota Firestore được reset hoặc bật billing.'
      });
    }
  } catch (error) {
    return res.status(200).json({
      success: false,
      code: isQuotaError(error) ? 'FIRESTORE_QUOTA_EXHAUSTED' : 'ADMIN_USERS_ERROR',
      error: isQuotaError(error)
        ? 'Firestore đã hết quota đọc miễn phí trong ngày. Hãy chờ quota reset hoặc bật billing/nâng quota Firebase để tải đủ dữ liệu.'
        : (error.message || 'Không tải được danh sách tài khoản.')
    });
  }
}
