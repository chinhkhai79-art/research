import { setCors } from "../../lib/cors.js";
import {
  isSupabaseConfigured,
  getUserByUid as sbGetUserByUid,
  findUsersByEmail as sbFindUsersByEmail,
  upsertUser as sbUpsertUser
} from "../../lib/supabaseAdmin.js";

const MEMORY_CACHE_TTL_MS = 10 * 60 * 1000;
const MEMORY_STALE_TTL_MS = 24 * 60 * 60 * 1000;
const INIT_CACHE_TTL_MS = 5 * 60 * 1000;
const subscriptionMemoryCache = globalThis.__vtwSubscriptionMemoryCache || new Map();
globalThis.__vtwSubscriptionMemoryCache = subscriptionMemoryCache;

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function addHours(date, hours) { return new Date(date.getTime() + Number(hours) * 60 * 60 * 1000); }
function getRemainingText(expiresAt) {
  if (!expiresAt) return "---";
  const diff = expiresAt.getTime() - Date.now();
  if (diff <= 0) return "Đã hết hạn";
  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} ngày ${hours} giờ`;
  if (hours > 0) return `${hours} giờ ${minutes} phút`;
  return `${Math.max(1, minutes)} phút`;
}
function emptyResponse(userId, accountType = "none") {
  return { success: true, active: false, premium: false, accountType, plan: null, planId: null, planName: null, startedAt: null, expiresAt: null, remainingMs: 0, remainingText: "---", userId };
}
function buildResponse(userId, data = {}) {
  const sub = data?.subscriptionInfo || data?.subscription || {};
  const premiumExpiresAt = toDate(data.premiumExpiresAt || data.expired_at || data.expiresAt || data.proUntil || sub.expiresAt || sub.premiumExpiresAt);
  const trialExpiresAt = toDate(data.trialExpiresAt || sub.trialExpiresAt);
  const premiumStartedAt = toDate(data.premiumStartedAt || data.started_at || data.activatedAt || sub.startedAt || sub.activatedAt);
  const trialStartedAt = toDate(data.trialStartedAt || sub.trialStartedAt);
  const now = Date.now();
  const premiumFlag = Boolean(data.premium || data.isPro || data.pro || data.account_type === "premium" || String(data.status || "").toUpperCase() === "PRO" || sub.premium || sub.isPro || String(sub.status || "").toUpperCase() === "PRO");
  const premiumActive = premiumFlag && premiumExpiresAt && premiumExpiresAt.getTime() > now;
  const trialActive = !premiumActive && data.account_type === "trial" && trialExpiresAt && trialExpiresAt.getTime() > now;
  const active = Boolean(premiumActive || trialActive);
  const accountType = premiumActive ? "premium" : trialActive ? "trial" : (data.account_type || (premiumFlag ? "expired" : "expired"));
  const expiresAt = premiumActive ? premiumExpiresAt : trialActive ? trialExpiresAt : (premiumExpiresAt || trialExpiresAt);
  const startedAt = premiumActive ? premiumStartedAt : trialActive ? trialStartedAt : (premiumStartedAt || trialStartedAt);
  const planId = data.planId || sub.planId || null;
  const planName = data.planName || sub.planName || null;
  return {
    success: true,
    active,
    premium: Boolean(premiumActive),
    accountType,
    plan: planId,
    planId,
    planName: premiumActive ? (planName || "Gói PRO") : trialActive ? "Dùng thử 1 giờ" : (planName || null),
    startedAt: startedAt ? startedAt.toISOString() : null,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    remainingMs: expiresAt ? Math.max(0, expiresAt.getTime() - now) : 0,
    remainingText: getRemainingText(expiresAt),
    userId
  };
}
function cacheKey(userId) { return String(userId || "").trim(); }
function readMemoryCache(userId, maxAgeMs = MEMORY_CACHE_TTL_MS) {
  const item = subscriptionMemoryCache.get(cacheKey(userId));
  if (!item || !item.data || !item.cachedAt) return null;
  if (Date.now() - item.cachedAt > maxAgeMs) return null;
  const data = { ...item.data };
  if (data.expiresAt) {
    const exp = new Date(data.expiresAt);
    data.remainingMs = Number.isNaN(exp.getTime()) ? 0 : Math.max(0, exp.getTime() - Date.now());
    data.remainingText = Number.isNaN(exp.getTime()) ? "---" : getRemainingText(exp);
    if (data.remainingMs <= 0) {
      data.active = false;
      data.premium = false;
      data.accountType = data.accountType === "trial" ? "expired" : (data.accountType || "expired");
    }
  }
  return { ...data, fromMemoryCache: true };
}
function saveMemoryCache(userId, data) {
  if (!userId || !data || data.success === false) return;
  subscriptionMemoryCache.set(cacheKey(userId), { cachedAt: Date.now(), data: { ...data } });
  if (subscriptionMemoryCache.size > 2000) {
    const firstKey = subscriptionMemoryCache.keys().next().value;
    if (firstKey) subscriptionMemoryCache.delete(firstKey);
  }
}
function isPremiumData(data) {
  const exp = toDate(data?.premiumExpiresAt || data?.expired_at || data?.expiresAt || data?.subscriptionInfo?.expiresAt);
  return Boolean(data?.premium || data?.isPro || data?.pro || data?.account_type === "premium" || String(data?.status || "").toUpperCase() === "PRO") && exp && exp.getTime() > Date.now();
}
async function findPendingEmailActivationSupabase(email, userId) {
  if (!email) return null;
  const items = await sbFindUsersByEmail(email, 10);
  const docs = items.filter(item => item.row?.uid !== userId).filter(item => item.data?.manualActivation || isPremiumData(item.data));
  docs.sort((a, b) => {
    const ae = toDate(a.data.premiumExpiresAt || a.data.expired_at || a.data.expiresAt || a.data.subscriptionInfo?.expiresAt)?.getTime() || 0;
    const be = toDate(b.data.premiumExpiresAt || b.data.expired_at || b.data.expiresAt || b.data.subscriptionInfo?.expiresAt)?.getTime() || 0;
    return be - ae;
  });
  return docs[0] || null;
}
async function handleSubscriptionSupabase({ userId, email, name, photoUrl, initTrial, force }) {
  const cached = !force ? readMemoryCache(userId, initTrial ? INIT_CACHE_TTL_MS : MEMORY_CACHE_TTL_MS) : null;
  if (cached && (!initTrial || cached.active)) return cached;

  const existing = await sbGetUserByUid(userId);
  let user = existing?.data || null;

  if (initTrial && email && (!user || !isPremiumData(user))) {
    const pending = await findPendingEmailActivationSupabase(email, userId);
    if (pending) {
      const currentData = user || {};
      const pendingData = pending.data || {};
      const currentExp = toDate(currentData.premiumExpiresAt || currentData.expired_at || currentData.expiresAt || currentData.subscriptionInfo?.expiresAt);
      const pendingExp = toDate(pendingData.premiumExpiresAt || pendingData.expired_at || pendingData.expiresAt || pendingData.subscriptionInfo?.expiresAt);
      const usePendingPremium = pendingExp && (!currentExp || pendingExp.getTime() > currentExp.getTime());
      const merged = {
        ...currentData,
        userId,
        email: email || currentData.email || pendingData.email || "",
        name: name || currentData.name || pendingData.name || pendingData.displayName || "",
        photoUrl: photoUrl || currentData.photoUrl || pendingData.photoUrl || "",
        migratedFrom: pending.row.uid,
        updated_at: new Date().toISOString()
      };
      if (usePendingPremium) {
        Object.assign(merged, {
          account_type: "premium", premium: true, isPro: true, pro: true, active: true, status: "PRO",
          planId: pendingData.planId || currentData.planId || "manual",
          planName: pendingData.planName || currentData.planName || "GÓI PRO",
          premiumStartedAt: pendingData.premiumStartedAt || currentData.premiumStartedAt || new Date().toISOString(),
          premiumExpiresAt: pendingData.premiumExpiresAt || pendingData.expired_at || pendingData.expiresAt || pendingData.subscriptionInfo?.expiresAt,
          expired_at: pendingData.expired_at || pendingData.premiumExpiresAt || pendingData.expiresAt || pendingData.subscriptionInfo?.expiresAt,
          expiresAt: pendingData.expiresAt || pendingData.premiumExpiresAt || pendingData.expired_at || pendingData.subscriptionInfo?.expiresAt,
          lastAdminAction: pendingData.lastAdminAction || currentData.lastAdminAction || "email_activation_migrated"
        });
      }
      const saved = await sbUpsertUser(userId, merged);
      await sbUpsertUser(pending.row.uid, { ...pendingData, migratedTo: userId, migratedAt: new Date().toISOString() });
      const response = buildResponse(userId, saved.data);
      saveMemoryCache(userId, response);
      return response;
    }
  }

  if (!user) {
    if (!initTrial) {
      const response = emptyResponse(userId);
      saveMemoryCache(userId, response);
      return response;
    }
    const now = new Date();
    const trialExpiresAt = addHours(now, 1);
    const trialData = {
      userId,
      email,
      name,
      photoUrl,
      account_type: "trial",
      premium: false,
      active: true,
      planId: "trial_1h",
      planName: "Dùng thử 1 giờ",
      trialStartedAt: now.toISOString(),
      trialExpiresAt: trialExpiresAt.toISOString(),
      created_at: now.toISOString(),
      firstLoginAt: now.toISOString(),
      lastLoginAt: now.toISOString(),
      loginCount: 1,
      updated_at: now.toISOString()
    };
    const saved = await sbUpsertUser(userId, trialData);
    const response = buildResponse(userId, saved.data);
    saveMemoryCache(userId, response);
    return response;
  }

  if (initTrial) {
    const lastLogin = toDate(user.lastLoginAt);
    const shouldTouchLogin = !lastLogin || (Date.now() - lastLogin.getTime() > 24 * 60 * 60 * 1000);
    const profileChanged = (email && email !== (user.email || "")) || (name && name !== (user.name || "")) || (photoUrl && photoUrl !== (user.photoUrl || ""));
    if (profileChanged || shouldTouchLogin) {
      const saved = await sbUpsertUser(userId, {
        ...user,
        email: email || user.email || "",
        name: name || user.name || "",
        photoUrl: photoUrl || user.photoUrl || "",
        ...(shouldTouchLogin ? {
          lastLoginAt: new Date().toISOString(),
          loginCount: Number(user.loginCount || 0) + 1,
          firstLoginAt: user.firstLoginAt || user.created_at || new Date().toISOString()
        } : {})
      });
      user = saved.data;
    }
  }

  const response = buildResponse(userId, user);
  saveMemoryCache(userId, response);
  return response;
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  try {
    if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });
    const source = req.method === "POST" ? (req.body || {}) : (req.query || {});
    const userId = String(source.userId || source.uid || "").trim();
    const email = String(source.email || "").trim().toLowerCase();
    const name = String(source.name || "").trim();
    const photoUrl = String(source.photoUrl || "").trim();
    const initTrial = String(source.initTrial || "0") === "1";
    const force = String(source.force || "0") === "1";
    if (!userId) return res.status(400).json({ success: false, error: "Missing userId" });
    if (!isSupabaseConfigured()) {
      const stale = readMemoryCache(userId, MEMORY_STALE_TTL_MS);
      if (stale) return res.status(200).json({ ...stale, warning: "Thiếu Supabase ENV. Đang dùng tạm cache server." });
      return res.status(200).json({ success: false, code: "SUPABASE_NOT_CONFIGURED", error: "Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trên Vercel. Dữ liệu app đã chuyển sang Supabase, không còn đọc Firestore." });
    }
    const response = await handleSubscriptionSupabase({ userId, email, name, photoUrl, initTrial, force });
    return res.status(200).json({ ...response, dataSource: "supabase" });
  } catch (error) {
    const source = req.method === "POST" ? (req.body || {}) : (req.query || {});
    const userId = String(source.userId || source.uid || "").trim();
    const stale = userId ? readMemoryCache(userId, MEMORY_STALE_TTL_MS) : null;
    if (stale) return res.status(200).json({ ...stale, warning: "Supabase tạm lỗi. Đang dùng tạm cache server để tránh treo trang." });
    return res.status(500).json({ success: false, code: "SUBSCRIPTION_SUPABASE_ERROR", error: error.message || "Server error" });
  }
}
