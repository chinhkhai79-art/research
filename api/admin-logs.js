import { setCors } from '../lib/cors.js';
import { isSupabaseConfigured, listAdminLogs as sbListAdminLogs, listPayments as sbListPayments, listSepayLogs as sbListSepayLogs, deleteAdminHistory as sbDeleteAdminHistory, listUsersForBulk as sbListUsersForBulk } from '../lib/supabaseAdmin.js';

function getAdminToken(req) { return String(req.headers['x-admin-secret'] || req.headers['x-admin-key'] || req.headers.authorization || req.query.password || req.query.adminSecret || req.query.adminKey || req.body?.password || req.body?.adminSecret || req.body?.adminKey || '').replace(/^Bearer\s+/i, '').trim(); }
function requireAdmin(req, res) {
  const token = getAdminToken(req);
  const validSecrets = [
    process.env.ADMIN_SECRET,
    process.env.ADMIN_SETTINGS_PASSWORD,
    process.env.ADMIN_PASSWORD,
    process.env.ADMIN_SETTINGS_KEY,
    process.env.ADMIN_LOGIN_PASSWORD,
    'ThanhCong2027###'
  ].map(v => String(v || '').trim()).filter(Boolean);
  if (!validSecrets.length) { res.status(500).json({ success: false, error: 'Thiếu biến môi trường ADMIN_SECRET hoặc ADMIN_SETTINGS_PASSWORD trên Vercel.' }); return false; }
  if (!validSecrets.includes(token)) { res.status(401).json({ success: false, error: 'Sai mật khẩu quản trị.' }); return false; }
  return true;
}
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

async function handleResetHistory(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success:false, error:'Method not allowed. Use POST.' });
  const confirmText = String(req.body?.confirmText || req.query.confirmText || '').trim().toUpperCase();
  if (confirmText !== 'XOA') return res.status(400).json({ success:false, error:'Nhập XOA để xác nhận xóa lịch sử thanh toán, doanh thu và logs.' });
  const deleted = await sbDeleteAdminHistory();
  return res.status(200).json({ success:true, resetAt: new Date().toISOString(), deleted, source:'supabase' });
}
async function handleAdminLogs(req, res) {
  const limit = Math.min(Number(req.query.limit || 50) || 50, 80);
  const logs = await sbListAdminLogs(limit);
  return res.status(200).json({ success: true, logs, resetAt: null, source: 'supabase' });
}
async function handleRevenue(req, res) {
  const rangeDays = Math.min(Math.max(Number(req.query.days || 30) || 30, 1), 365);
  const limit = Math.min(Math.max(Number(req.query.limit || 500) || 500, 50), 500);
  const [paymentRows, logRows, userRows] = await Promise.all([
    sbListPayments({ limit }),
    sbListSepayLogs(500),
    sbListUsersForBulk({ limit: 500 })
  ]);

  // Một số webhook cũ đã cộng PRO thành công nhưng record payments chưa kịp đổi paid=true.
  // Doanh thu phải tính cả log SePay success_paid và lastPaymentOrderCode của user để admin không bị 0đ sai.
  const successLogByOrder = new Map();
  for (const l of (logRows || [])) {
    const code = String(l.order_code || '').trim().toUpperCase();
    if (!code) continue;
    if (['success_paid','duplicate_paid_skipped'].includes(String(l.status || '').toLowerCase())) {
      if (!successLogByOrder.has(code)) successLogByOrder.set(code, l);
    }
  }
  const paidStatuses = new Set(['paid','success','success_paid','completed','complete','confirmed']);
  const isPaidPayment = (p) => {
    const code = String(p.order_code || '').trim().toUpperCase();
    return p.paid === true || paidStatuses.has(String(p.status || '').toLowerCase()) || successLogByOrder.has(code);
  };
  const byOrder = new Map();
  for (const p of (paymentRows || [])) {
    const code = String(p.order_code || '').trim().toUpperCase();
    if (!code || !isPaidPayment(p)) continue;
    const log = successLogByOrder.get(code) || null;
    byOrder.set(code, {
      orderCode: code,
      email: p.email || '',
      uid: p.uid || p.user_id || '',
      planId: p.plan_id || '',
      planName: p.plan_name || '',
      days: Number(p.days || 0),
      amount: Number(p.amount || p.expected_amount || log?.received_amount || log?.amount || 0),
      expectedAmount: Number(p.expected_amount || p.amount || log?.expected_amount || 0),
      content: p.content || p.order_code || log?.content || '',
      paidAt: p.paid_at || log?.created_at || p.updated_at || p.created_at,
      expiresAt: p.expires_at || null,
      createdAt: p.created_at,
      source: p.paid === true || String(p.status||'').toLowerCase()==='paid' ? 'payments' : 'sepay_logs'
    });
  }
  // Fallback cuối: user đã được cộng PRO và có mã đơn gần nhất nhưng payments/log chưa đồng bộ.
  for (const u of (userRows || [])) {
    const d = u.data || {};
    const code = String(d.lastPaymentOrderCode || '').trim().toUpperCase();
    if (!code || byOrder.has(code)) continue;
    const amount = Number(d.lastPaymentAmount || 0);
    if (!amount) continue;
    byOrder.set(code, {
      orderCode: code,
      email: d.email || '',
      uid: d.uid || d.userId || u.row?.uid || '',
      planId: d.planId || '',
      planName: d.planName || 'GÓI PRO',
      days: 0,
      amount,
      expectedAmount: amount,
      content: code,
      paidAt: d.updatedAt || d.updated_at || d.premiumStartedAt || d.premiumExpiresAt || u.row?.updated_at || u.row?.created_at,
      expiresAt: d.premiumExpiresAt || d.expired_at || d.expiresAt || null,
      createdAt: u.row?.created_at || null,
      source: 'users_last_payment'
    });
  }
  const orders = Array.from(byOrder.values()).sort((a,b)=>new Date(b.paidAt||0)-new Date(a.paidAt||0));
  const pending = (paymentRows || []).filter(p => !isPaidPayment(p)).map(p => ({
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
  const issueStatuses = new Set(['no_order_code','reject_amount_mismatch','reject_missing_token','reject_invalid_token','warning_no_secret_configured','reject_unknown_order']);
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
  return res.status(200).json({ success:true, rangeDays, resetAt:null, source:'supabase', stats:{ totalPaid,totalRevenue,todayPaid,todayRevenue,weekRevenue,monthRevenue,rangeRevenue,pendingCount:pending.length,issueCount:issues.length,planBreakdown,dailyRevenue }, orders:orders.slice(0,500), pending:pending.slice(0,500), issues });
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (!requireAdmin(req, res)) return;
  try {
    if (!isSupabaseConfigured()) return res.status(200).json({ success:false, code:'SUPABASE_NOT_CONFIGURED', error:'Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trên Vercel. Admin logs/doanh thu đã chuyển sang Supabase, không còn đọc Firestore.' });
    const type = String(req.query.type || req.body?.type || '').trim().toLowerCase();
    if (type === 'reset-history') return handleResetHistory(req, res);
    if (type === 'revenue' || type === 'orders') return handleRevenue(req, res);
    return handleAdminLogs(req, res);
  } catch (error) {
    return res.status(200).json({ success:false, code:'ADMIN_LOGS_SUPABASE_ERROR', error:error.message || 'Không tải được dữ liệu Supabase.' });
  }
}
