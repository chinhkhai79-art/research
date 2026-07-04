import { db } from '../lib/firebaseAdmin.js';
import { setCors } from '../lib/cors.js';
import { isSupabaseConfigured, listAdminLogs as sbListAdminLogs, listPayments as sbListPayments, listSepayLogs as sbListSepayLogs } from '../lib/supabaseAdmin.js';

/**
 * Admin logs + Revenue endpoint (gộp 2 chức năng vào 1 function để không
 * vượt giới hạn 12 Serverless Functions của Vercel Hobby plan).
 *
 * Cách dùng:
 *  - GET /api/admin-logs?password=...                  → trả về admin logs (mặc định)
 *  - GET /api/admin-logs?password=...&type=revenue     → trả về dữ liệu doanh thu
 *  - GET /api/admin-logs?type=revenue&days=30          → doanh thu 30 ngày
 */

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

function toDate(v) { return v?.toDate?.() || (v ? new Date(v) : null); }
function toIso(v) {
  const d = toDate(v);
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function isQuotaError(error) { const text = String(error?.message || error?.details || error?.code || '').toLowerCase(); return error?.code === 8 || text.includes('resource_exhausted') || text.includes('quota') || text.includes('free daily read units'); }

function getResetRef() {
  return db.collection('app_settings').doc('admin_history_reset');
}

function getDocMillis(docData, keys) {
  for (const k of keys) {
    const d = toDate(docData?.[k]);
    if (d && !Number.isNaN(d.getTime())) return d.getTime();
  }
  return 0;
}

async function getHistoryResetAt() {
  const snap = await getResetRef().get();
  if (!snap.exists) return null;
  return toDate((snap.data() || {}).resetAt);
}

function isAfterReset(docData, resetAt, keys) {
  if (!resetAt) return true;
  const t = getDocMillis(docData, keys);
  return t >= resetAt.getTime();
}

async function deleteCollection(collectionName, batchSize = 250, maxRounds = 80) {
  let total = 0;
  for (let round = 0; round < maxRounds; round++) {
    const snap = await db.collection(collectionName).limit(batchSize).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    total += snap.size;
    if (snap.size < batchSize) break;
  }
  return total;
}

async function handleResetHistory(req, res) {
  if (isSupabaseConfigured()) {
    return res.status(200).json({ success:false, error:'Reset lịch sử Supabase chưa bật trong bản này để tránh xóa nhầm dữ liệu. Có thể xóa bằng SQL riêng khi cần.' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ success:false, error:'Method not allowed. Use POST.' });
  }

  const confirmText = String(req.body?.confirmText || req.query.confirmText || '').trim().toUpperCase();
  if (confirmText !== 'XOA') {
    return res.status(400).json({ success:false, error:'Nhập XOA để xác nhận xóa lịch sử thanh toán, doanh thu và logs.' });
  }

  const resetAt = new Date();
  const collections = ['payments', 'paid_orders', 'sepay_logs', 'admin_logs'];
  const deleted = {};
  for (const name of collections) {
    deleted[name] = await deleteCollection(name);
  }

  await getResetRef().set({
    resetAt,
    resetAtIso: resetAt.toISOString(),
    deleted,
    note: 'Reset lịch sử thanh toán, đơn hàng, doanh thu và logs. Dữ liệu mới sẽ tính từ thời điểm này.',
    updatedAt: resetAt
  }, { merge:true });

  return res.status(200).json({
    success:true,
    resetAt: resetAt.toISOString(),
    deleted
  });
}


// ============== HANDLER: admin logs (cũ) ==============
async function handleAdminLogs(req, res) {
  const limit = Math.min(Number(req.query.limit || 50) || 50, 80);
  if (isSupabaseConfigured()) {
    const logs = await sbListAdminLogs(limit);
    return res.status(200).json({ success: true, logs, resetAt: null, source: 'supabase' });
  }
  const resetAt = await getHistoryResetAt();
  const snap = await db.collection('admin_logs').limit(limit).get();
  const logs = snap.docs
    .filter(doc => isAfterReset(doc.data() || {}, resetAt, ['createdAt', 'updatedAt']))
    .map(doc => {
      const d = doc.data() || {};
      return {
        id: doc.id,
        ...d,
        createdAt: toIso(d.createdAt),
        oldExpiresAt: toIso(d.oldExpiresAt),
        newExpiresAt: toIso(d.newExpiresAt)
      };
    }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  return res.status(200).json({ success: true, logs, resetAt: toIso(resetAt) });
}

// ============== HANDLER: revenue (mới — gộp vào đây) ==============
async function handleRevenue(req, res) {
  const rangeDays = Math.min(Math.max(Number(req.query.days || 30) || 30, 1), 365);
  const limit = Math.min(Math.max(Number(req.query.limit || 150) || 150, 30), 500);
  if (isSupabaseConfigured()) {
    const [paymentRows, logRows] = await Promise.all([
      sbListPayments({ limit }),
      sbListSepayLogs(80)
    ]);
    const orders = (paymentRows || []).filter(p => p.paid === true || p.status === 'paid').map(p => ({
      orderCode: p.order_code,
      email: p.email || '',
      uid: p.uid || p.user_id || '',
      planId: p.plan_id || '',
      planName: p.plan_name || '',
      days: Number(p.days || 0),
      amount: Number(p.amount || p.expected_amount || 0),
      expectedAmount: Number(p.expected_amount || p.amount || 0),
      content: p.content || p.order_code || '',
      paidAt: p.paid_at || p.updated_at || p.created_at,
      expiresAt: p.expires_at || null,
      createdAt: p.created_at
    })).sort((a,b)=>new Date(b.paidAt||0)-new Date(a.paidAt||0));
    const pending = (paymentRows || []).filter(p => !(p.paid === true || p.status === 'paid')).map(p => ({
      orderCode: p.order_code,
      status: p.status || 'pending',
      paid: false,
      email: p.email || '',
      uid: p.uid || p.user_id || '',
      planId: p.plan_id || '',
      planName: p.plan_name || '',
      amount: Number(p.amount || p.expected_amount || 0),
      amountMismatchReceived: Number(p.amount_mismatch_received || 0),
      createdAt: p.created_at,
      updatedAt: p.updated_at
    }));
    const issueStatuses = new Set(['no_order_code','reject_amount_mismatch','reject_missing_token','reject_invalid_token','warning_no_secret_configured']);
    const issues = (logRows || []).map(l => ({
      id: l.id,
      status: l.status || '',
      reason: l.reason || '',
      orderCode: l.order_code || '',
      receivedAmount: Number(l.received_amount || l.amount || 0),
      expectedAmount: Number(l.expected_amount || 0),
      diff: Number(l.diff || 0),
      content: l.content || '',
      ip: l.ip || '',
      createdAt: l.created_at
    })).filter(x=>issueStatuses.has(x.status));
    const now = new Date();
    const startToday = startOfDay(now);
    const startWeek = new Date(now.getTime() - 7 * 86400000);
    const startMonth = new Date(now.getTime() - 30 * 86400000);
    const startRange = new Date(now.getTime() - rangeDays * 86400000);
    let totalPaid = orders.length, totalRevenue = 0, todayPaid = 0, todayRevenue = 0, weekRevenue = 0, monthRevenue = 0, rangeRevenue = 0;
    const planBreakdown = {}, dailyRevenue = {};
    for (const o of orders) {
      totalRevenue += o.amount;
      const paidAt = o.paidAt ? new Date(o.paidAt) : null;
      if (paidAt) {
        if (paidAt >= startToday) { todayPaid++; todayRevenue += o.amount; }
        if (paidAt >= startWeek) weekRevenue += o.amount;
        if (paidAt >= startMonth) monthRevenue += o.amount;
        if (paidAt >= startRange) { rangeRevenue += o.amount; const dayKey = paidAt.toISOString().slice(0,10); dailyRevenue[dayKey] = (dailyRevenue[dayKey] || 0) + o.amount; }
      }
      const planKey = o.planId || 'unknown';
      if (!planBreakdown[planKey]) planBreakdown[planKey] = { count:0, revenue:0, name:o.planName || planKey };
      planBreakdown[planKey].count++; planBreakdown[planKey].revenue += o.amount;
    }
    return res.status(200).json({ success:true, rangeDays, resetAt:null, source:'supabase', stats:{ totalPaid,totalRevenue,todayPaid,todayRevenue,weekRevenue,monthRevenue,rangeRevenue,pendingCount:pending.length,issueCount:issues.length,planBreakdown,dailyRevenue }, orders:orders.slice(0,80), pending:pending.slice(0,50), issues });
  }
  const resetAt = await getHistoryResetAt();

  const [paidSnap, pendingSnap, logsSnap] = await Promise.all([
    db.collection('paid_orders').limit(limit).get(),
    db.collection('payments').limit(limit).get(),
    db.collection('sepay_logs').limit(80).get()
  ]);

  // Paid orders
  const orders = paidSnap.docs
  .filter(doc => isAfterReset(doc.data() || {}, resetAt, ['paidAt', 'createdAt', 'created_at', 'updatedAt']))
  .map(doc => {
    const d = doc.data() || {};
    return {
      orderCode: doc.id,
      email: d.email || d.userEmail || '',
      uid: d.uid || d.userId || '',
      planId: d.planId || '',
      planName: d.planName || '',
      days: Number(d.days || 0),
      amount: Number(d.amount || 0),
      expectedAmount: Number(d.expectedAmount || 0),
      content: d.content || '',
      paidAt: toIso(d.paidAt),
      expiresAt: toIso(d.expiresAt),
      createdAt: toIso(d.createdAt || d.created_at)
    };
  }).sort((a, b) => new Date(b.paidAt || 0) - new Date(a.paidAt || 0));

  // Pending payments
  const pending = pendingSnap.docs
    .filter(doc => isAfterReset(doc.data() || {}, resetAt, ['createdAt', 'created_at', 'updatedAt', 'updated_at']))
    .map(doc => {
      const d = doc.data() || {};
      return {
        orderCode: doc.id,
        status: d.status || (d.paid ? 'paid' : 'pending'),
        paid: Boolean(d.paid),
        email: d.email || d.userEmail || '',
        uid: d.uid || d.userId || '',
        planId: d.planId || '',
        planName: d.planName || '',
        amount: Number(d.amount || 0),
        amountMismatchReceived: Number(d.amountMismatchReceived || 0),
        createdAt: toIso(d.createdAt || d.created_at),
        updatedAt: toIso(d.updatedAt || d.updated_at)
      };
    })
    .filter(p => !p.paid)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  // SePay issues
  const issueStatuses = new Set([
    'no_order_code',
    'reject_amount_mismatch',
    'reject_missing_token',
    'reject_invalid_token',
    'warning_no_secret_configured'
  ]);
  const issues = logsSnap.docs
    .filter(doc => isAfterReset(doc.data() || {}, resetAt, ['createdAt', 'updatedAt']))
    .map(doc => {
      const d = doc.data() || {};
      return {
        id: doc.id,
        status: d.status || '',
        reason: d.reason || '',
        orderCode: d.orderCode || '',
        receivedAmount: Number(d.receivedAmount || d.amount || 0),
        expectedAmount: Number(d.expectedAmount || 0),
        diff: Number(d.diff || 0),
        content: d.content || '',
        ip: d.ip || '',
        createdAt: toIso(d.createdAt)
      };
    })
    .filter(x => issueStatuses.has(x.status))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 100);

  // Stats
  const now = new Date();
  const startToday = startOfDay(now);
  const startWeek = new Date(now.getTime() - 7 * 86400000);
  const startMonth = new Date(now.getTime() - 30 * 86400000);
  const startRange = new Date(now.getTime() - rangeDays * 86400000);

  let totalPaid = orders.length;
  let totalRevenue = 0;
  let todayPaid = 0;
  let todayRevenue = 0;
  let weekRevenue = 0;
  let monthRevenue = 0;
  let rangeRevenue = 0;
  const planBreakdown = {};
  const dailyRevenue = {};

  for (const o of orders) {
    totalRevenue += o.amount;
    const paidAt = o.paidAt ? new Date(o.paidAt) : null;
    if (paidAt) {
      if (paidAt >= startToday) { todayPaid++; todayRevenue += o.amount; }
      if (paidAt >= startWeek) weekRevenue += o.amount;
      if (paidAt >= startMonth) monthRevenue += o.amount;
      if (paidAt >= startRange) {
        rangeRevenue += o.amount;
        const dayKey = paidAt.toISOString().slice(0, 10);
        dailyRevenue[dayKey] = (dailyRevenue[dayKey] || 0) + o.amount;
      }
    }
    const planKey = o.planId || 'unknown';
    if (!planBreakdown[planKey]) {
      planBreakdown[planKey] = { count: 0, revenue: 0, name: o.planName || planKey };
    }
    planBreakdown[planKey].count++;
    planBreakdown[planKey].revenue += o.amount;
  }

  return res.status(200).json({
    success: true,
    rangeDays,
    resetAt: toIso(resetAt),
    stats: {
      totalPaid, totalRevenue,
      todayPaid, todayRevenue,
      weekRevenue, monthRevenue, rangeRevenue,
      pendingCount: pending.length,
      issueCount: issues.length,
      planBreakdown, dailyRevenue
    },
    orders: orders.slice(0, 80),
    pending: pending.slice(0, 50),
    issues
  });
}

// ============== MAIN HANDLER (router) ==============
export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (!requireAdmin(req, res)) return;

  try {
    const type = String(req.query.type || '').trim().toLowerCase();
    if (type === 'reset-history' || type === 'reset') {
      return await handleResetHistory(req, res);
    }
    if (type === 'revenue') {
      return await handleRevenue(req, res);
    }
    // Mặc định: admin logs (giữ tương thích ngược)
    return await handleAdminLogs(req, res);
  } catch (error) {
    console.error('admin-logs error:', error);
    if (isQuotaError(error)) {
      const type = String(req.query.type || '').trim().toLowerCase();
      if (type === 'revenue') {
        return res.status(200).json({
          success: true,
          warning: 'Firestore đã hết quota đọc miễn phí trong ngày. Tạm dừng tải doanh thu để tránh lỗi trang admin.',
          stats: { totalPaid:0,totalRevenue:0,todayPaid:0,todayRevenue:0,weekRevenue:0,monthRevenue:0,rangeRevenue:0,pendingCount:0,issueCount:0,planBreakdown:{},dailyRevenue:{} },
          orders: [], pending: [], issues: []
        });
      }
      return res.status(200).json({ success:true, warning:'Firestore đã hết quota đọc miễn phí trong ngày. Tạm dừng tải logs để tránh lỗi trang admin.', logs: [] });
    }
    return res.status(200).json({ success: false, error: error.message || 'Không tải được dữ liệu.' });
  }
}
