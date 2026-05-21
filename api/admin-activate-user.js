import { db, FieldValue, Timestamp } from '../lib/firebaseAdmin.js';
import { setCors } from '../lib/cors.js';

const PLAN_MAP = {
  '30': { planId: 'manual_30d', planName: 'KÍCH HOẠT THỦ CÔNG 30 NGÀY', days: 30 },
  '90': { planId: '3m', planName: 'GÓI 3 THÁNG', days: 90 },
  '180': { planId: '6m', planName: 'GÓI 6 THÁNG', days: 180 },
  '365': { planId: '12m', planName: 'GÓI 1 NĂM', days: 365 },
  '3m': { planId: '3m', planName: 'GÓI 3 THÁNG', days: 90 },
  '6m': { planId: '6m', planName: 'GÓI 6 THÁNG', days: 180 },
  '12m': { planId: '12m', planName: 'GÓI 1 NĂM', days: 365 }
};

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

function toDate(value) {
  return value?.toDate?.() || (value ? new Date(value) : null);
}

function addDays(date, days) {
  return new Date(date.getTime() + Number(days) * 86400000);
}

function compactEmail(email) {
  return String(email || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120);
}

async function findUserDoc({ uid, email }) {
  if (uid) {
    const ref = db.collection('users').doc(uid);
    return { ref, snap: await ref.get(), uid };
  }

  if (email) {
    const q = await db.collection('users').where('email', '==', email).limit(5).get();
    if (!q.empty) {
      const doc = q.docs[0];
      return { ref: doc.ref, snap: doc, uid: doc.id };
    }
  }

  const manualUid = `manual_${compactEmail(email) || Date.now()}`;
  const ref = db.collection('users').doc(manualUid);
  return { ref, snap: await ref.get(), uid: manualUid, manual: true };
}

async function writeAdminLog(data) {
  try {
    await db.collection('admin_logs').add({
      app: 'research',
      ...data,
      createdAt: FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('WRITE ADMIN LOG ERROR:', error);
  }
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
    }

    const body = req.body || {};
    const uidInput = String(body.uid || body.userId || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const planKey = String(body.planId || body.plan || body.days || '90').trim();
    const selected = PLAN_MAP[planKey] || PLAN_MAP[String(body.days || '')] || PLAN_MAP['90'];
    const days = Math.max(1, Number(body.days || selected.days || 90));
    const planId = selected.planId;
    const planName = String(body.planName || selected.planName || `GÓI PRO ${days} NGÀY`).toUpperCase();
    const reason = String(body.reason || '').trim();

    if (!uidInput && !email) {
      return res.status(400).json({ success: false, error: 'Cần nhập UID hoặc email.' });
    }

    const { ref, snap, uid, manual } = await findUserDoc({ uid: uidInput, email });
    const current = snap.exists ? snap.data() : {};
    const now = new Date();
    const oldExpiresAt = toDate(current.premiumExpiresAt || current.expired_at || current.expiresAt);
    const baseDate = oldExpiresAt && oldExpiresAt.getTime() > now.getTime() ? oldExpiresAt : now;
    const expiresAt = addDays(baseDate, days);

    const data = {
      userId: uid,
      email: email || current.email || '',
      name: body.name || current.name || current.displayName || '',
      account_type: 'premium',
      premium: true,
      active: true,
      planId,
      planName,
      premiumStartedAt: current.premiumStartedAt || Timestamp.fromDate(now),
      premiumExpiresAt: Timestamp.fromDate(expiresAt),
      expired_at: Timestamp.fromDate(expiresAt),
      lastAdminAction: 'activate_or_extend',
      lastAdminReason: reason,
      lastAdminDays: days,
      manualActivation: Boolean(manual || current.manualActivation),
      updated_at: FieldValue.serverTimestamp()
    };

    if (!snap.exists) data.created_at = FieldValue.serverTimestamp();

    await ref.set(data, { merge: true });

    await writeAdminLog({
      action: 'activate_or_extend',
      targetUid: uid,
      targetEmail: data.email,
      planId,
      planName,
      days,
      oldExpiresAt: oldExpiresAt ? Timestamp.fromDate(oldExpiresAt) : null,
      newExpiresAt: Timestamp.fromDate(expiresAt),
      cumulative: Boolean(oldExpiresAt && oldExpiresAt.getTime() > now.getTime()),
      reason
    });

    return res.status(200).json({
      success: true,
      message: 'Đã kích hoạt/cộng ngày PRO.',
      uid,
      email: data.email,
      planId,
      planName,
      days,
      expiresAt: expiresAt.toISOString()
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || 'Không kích hoạt được tài khoản.' });
  }
}
