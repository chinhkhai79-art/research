import { db, FieldValue, Timestamp } from '../lib/firebaseAdmin.js';
import { setCors } from '../lib/cors.js';
import { isSupabaseConfigured, getUserByUid as sbGetUserByUid, findUsersByEmail as sbFindUsersByEmail, upsertUser as sbUpsertUser, addAdminLog as sbAddAdminLog } from '../lib/supabaseAdmin.js';

const PLAN_MAP = {
  '30': { planId: '1m', planName: 'GÓI 1 THÁNG', days: 30 },
  '1m': { planId: '1m', planName: 'GÓI 1 THÁNG', days: 30 },
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


async function findSupabaseUser({ uid, email }) {
  if (uid) {
    const item = await sbGetUserByUid(uid);
    return { uid, data: item?.data || {}, exists: Boolean(item) };
  }
  if (email) {
    const found = await sbFindUsersByEmail(email, 5);
    if (found.length) return { uid: found[0].row.uid, data: found[0].data || {}, exists: true };
  }
  return { uid: `manual_${compactEmail(email) || Date.now()}`, data: {}, exists: false, manual: true };
}

async function activateSupabaseUser({ uidInput, email, body, selected, days, planId, planName, reason }) {
  const found = await findSupabaseUser({ uid: uidInput, email });
  const uid = found.uid;
  const current = found.data || {};
  const now = new Date();
  const oldExpiresAt = toDate(current.premiumExpiresAt || current.expired_at || current.expiresAt);
  const baseDate = oldExpiresAt && oldExpiresAt.getTime() > now.getTime() ? oldExpiresAt : now;
  const expiresAt = addDays(baseDate, days);
  const data = {
    ...current,
    userId: uid,
    email: email || current.email || '',
    name: body.name || current.name || current.displayName || '',
    account_type: 'premium',
    premium: true,
    isPro: true,
    pro: true,
    active: true,
    planId,
    planName,
    premiumStartedAt: current.premiumStartedAt || now.toISOString(),
    premiumExpiresAt: expiresAt.toISOString(),
    expired_at: expiresAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    manualActivation: Boolean(found.manual || current.manualActivation),
    lastAdminAction: 'activate_or_extend',
    lastAdminReason: reason,
    lastAdminDays: days,
    updated_at: now.toISOString(),
    created_at: current.created_at || now.toISOString()
  };
  await sbUpsertUser(uid, data);
  await sbAddAdminLog({
    action: 'activate_or_extend',
    targetUid: uid,
    targetEmail: data.email,
    planId,
    planName,
    days,
    oldExpiresAt: oldExpiresAt ? oldExpiresAt.toISOString() : null,
    newExpiresAt: expiresAt.toISOString(),
    cumulative: Boolean(oldExpiresAt && oldExpiresAt.getTime() > now.getTime()),
    reason
  });
  return { uid, email: data.email, expiresAt };
}

// === Cộng ngày hàng loạt cho user PRO ===
// Dùng khi hệ thống có sự cố, cần compensate cho tất cả khách đang dùng PRO.
//
// scope:
//   'pro_active'   — chỉ user đang còn hạn PRO (mặc định, an toàn nhất)
//   'pro_all'      — cả user PRO đã hết hạn (gia hạn thêm cho họ)
//   'all_users'    — TẤT CẢ user kể cả trial / chưa bao giờ mua (KHÔNG khuyến nghị)
//
// dryRun: true → chỉ đếm số user bị ảnh hưởng, không thực sự cộng ngày.
async function bulkExtendUsers({ days, scope = 'pro_active', dryRun = false, reason = '', adminEmail = '' }) {
  const now = new Date();
  const usersSnap = await db.collection('users').limit(5000).get();
  const affected = [];
  const skipped = [];

  for (const doc of usersSnap.docs) {
    const u = doc.data() || {};
    const uid = doc.id;
    const email = u.email || '';
    const oldExpires = toDate(u.premiumExpiresAt || u.expired_at || u.expiresAt);
    const isPremium = u.premium === true || u.account_type === 'premium' || u.isPro === true;
    const isActive = oldExpires && oldExpires.getTime() > now.getTime();

    // Filter theo scope
    let qualifies = false;
    if (scope === 'pro_active') {
      qualifies = isPremium && isActive;
    } else if (scope === 'pro_all') {
      qualifies = isPremium;
    } else if (scope === 'all_users') {
      qualifies = true;
    }

    if (!qualifies) {
      skipped.push({ uid, email, reason: scope === 'pro_active' ? (isActive ? 'not_premium' : 'expired') : 'not_premium' });
      continue;
    }

    // Tính expiresAt mới: cộng tiếp từ ngày hết hạn cũ nếu còn hạn, hoặc từ now nếu đã hết.
    const baseDate = oldExpires && oldExpires.getTime() > now.getTime() ? oldExpires : now;
    const newExpires = addDays(baseDate, days);

    affected.push({
      uid,
      email,
      planName: u.planName || '',
      oldExpiresAt: oldExpires ? oldExpires.toISOString() : null,
      newExpiresAt: newExpires.toISOString(),
      wasActive: isActive
    });

    // Nếu là dryRun thì chỉ preview, không ghi DB
    if (dryRun) continue;

    await doc.ref.set({
      premium: true,
      active: true,
      premiumExpiresAt: Timestamp.fromDate(newExpires),
      expired_at: Timestamp.fromDate(newExpires),
      lastAdminAction: 'bulk_extend',
      lastAdminReason: reason,
      lastAdminDays: days,
      bulkExtendedAt: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp()
    }, { merge: true });
  }

  // Ghi log đặc biệt cho thao tác hàng loạt
  if (!dryRun) {
    await writeAdminLog({
      action: 'bulk_extend',
      targetUid: 'BULK',
      targetEmail: `${affected.length} users`,
      planName: `CỘNG ${days} NGÀY HÀNG LOẠT (${scope})`,
      days,
      affectedCount: affected.length,
      skippedCount: skipped.length,
      scope,
      reason,
      adminEmail
    });
  }

  return {
    dryRun,
    scope,
    days,
    affectedCount: affected.length,
    skippedCount: skipped.length,
    affected: affected.slice(0, 100),
    skippedSample: skipped.slice(0, 20)
  };
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
    }

    const body = req.body || {};
    const action = String(body.action || '').trim();

    // === Bulk extend (preview hoặc apply) ===
    if (action === 'bulk_extend_preview' || action === 'bulk_extend_apply') {
      const days = Math.max(1, Math.min(365, Number(body.days || 0)));
      if (!days) return res.status(400).json({ success: false, error: 'Cần nhập số ngày từ 1 đến 365.' });
      const scope = ['pro_active', 'pro_all', 'all_users'].includes(body.scope) ? body.scope : 'pro_active';
      const reason = String(body.reason || '').trim();
      if (action === 'bulk_extend_apply' && !reason) {
        return res.status(400).json({ success: false, error: 'Cần nhập lý do cộng ngày hàng loạt (bắt buộc để truy vết).' });
      }
      const result = await bulkExtendUsers({
        days,
        scope,
        reason,
        dryRun: action === 'bulk_extend_preview',
        adminEmail: String(body.adminEmail || '')
      });
      return res.status(200).json({
        success: true,
        message: action === 'bulk_extend_preview'
          ? `Preview: ${result.affectedCount} user sẽ được cộng ${days} ngày.`
          : `Đã cộng ${days} ngày cho ${result.affectedCount} user.`,
        ...result
      });
    }

    // === Action mặc định: kích hoạt 1 user (giữ nguyên hành vi cũ) ===
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

    if (isSupabaseConfigured()) {
      const result = await activateSupabaseUser({ uidInput, email, body, selected, days, planId, planName, reason });
      return res.status(200).json({
        success: true,
        message: 'Đã kích hoạt/cộng ngày PRO.',
        uid: result.uid,
        email: result.email,
        planId,
        planName,
        days,
        expiresAt: result.expiresAt.toISOString(),
        dataSource: 'supabase'
      });
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
