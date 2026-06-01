import { db } from '../lib/firebaseAdmin.js';
import { setCors } from '../lib/cors.js';

/**
 * Admin revenue endpoint.
 *
 * GET /api/admin-revenue?password=...&days=30
 *
 * Trả về:
 *  - orders: list các đơn paid (paid_orders), sắp xếp mới → cũ
 *  - pending: list các đơn đang chờ thanh toán (payments.status='pending')
 *  - issues: list các giao dịch SePay không khớp (no_order_code, amount_mismatch, reject_*)
 *  - stats: { totalPaid, totalRevenue, todayPaid, todayRevenue, weekRevenue, monthRevenue,
 *             planBreakdown: { '3m': {count, revenue}, ... } }
 *  - rangeDays: filter window cho stats (default 30, max 365)
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

function toDate(v) {
  return v?.toDate?.() || (v ? new Date(v) : null);
}
function toIso(v) {
  const d = toDate(v);
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (!requireAdmin(req, res)) return;

  try {
    const rangeDays = Math.min(Math.max(Number(req.query.days || 30) || 30, 1), 365);
    const limit = Math.min(Math.max(Number(req.query.limit || 500) || 500, 50), 2000);

    const [paidSnap, pendingSnap, logsSnap] = await Promise.all([
      db.collection('paid_orders').limit(limit).get(),
      db.collection('payments').limit(limit).get(),
      db.collection('sepay_logs').limit(300).get()
    ]);

    // --- Paid orders ---
    const orders = paidSnap.docs.map(doc => {
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

    // --- Pending payments (status != paid) ---
    const pending = pendingSnap.docs
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

    // --- SePay issues (need admin attention) ---
    const issueStatuses = new Set([
      'no_order_code',
      'reject_amount_mismatch',
      'reject_missing_token',
      'reject_invalid_token',
      'warning_no_secret_configured'
    ]);
    const issues = logsSnap.docs
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

    // --- Stats ---
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
    const dailyRevenue = {}; // YYYY-MM-DD → revenue

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
      stats: {
        totalPaid,
        totalRevenue,
        todayPaid,
        todayRevenue,
        weekRevenue,
        monthRevenue,
        rangeRevenue,
        pendingCount: pending.length,
        issueCount: issues.length,
        planBreakdown,
        dailyRevenue
      },
      orders: orders.slice(0, 200),
      pending: pending.slice(0, 100),
      issues
    });
  } catch (error) {
    console.error('admin-revenue error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Không tải được dữ liệu doanh thu.' });
  }
}
