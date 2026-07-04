import { db, FieldValue, Timestamp } from "../../lib/firebaseAdmin.js";
import { setCors } from "../../lib/cors.js";

const MEMORY_CACHE_TTL_MS = 10 * 60 * 1000;
const MEMORY_STALE_TTL_MS = 24 * 60 * 60 * 1000;
const INIT_CACHE_TTL_MS = 5 * 60 * 1000;
const subscriptionMemoryCache = globalThis.__vtwSubscriptionMemoryCache || new Map();
globalThis.__vtwSubscriptionMemoryCache = subscriptionMemoryCache;

function toDate(value) {
  return value?.toDate?.() || (value ? new Date(value) : null);
}

function addHours(date, hours) {
  return new Date(date.getTime() + Number(hours) * 60 * 60 * 1000);
}

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
  return {
    success: true,
    active: false,
    premium: false,
    accountType,
    plan: null,
    planId: null,
    planName: null,
    startedAt: null,
    expiresAt: null,
    remainingMs: 0,
    remainingText: "---",
    userId
  };
}

function buildResponse(userId, data) {
  const sub = data?.subscriptionInfo || data?.subscription || {};
  const premiumExpiresAt =
    toDate(data.premiumExpiresAt) ||
    toDate(data.expired_at) ||
    toDate(data.expiresAt) ||
    toDate(data.proUntil) ||
    toDate(sub.expiresAt) ||
    toDate(sub.premiumExpiresAt);
  const trialExpiresAt = toDate(data.trialExpiresAt) || toDate(sub.trialExpiresAt);
  const premiumStartedAt =
    toDate(data.premiumStartedAt) ||
    toDate(data.started_at) ||
    toDate(data.activatedAt) ||
    toDate(sub.startedAt) ||
    toDate(sub.activatedAt);
  const trialStartedAt = toDate(data.trialStartedAt) || toDate(sub.trialStartedAt);

  const now = Date.now();
  const premiumFlag = Boolean(
    data.premium ||
    data.isPro ||
    data.pro ||
    data.account_type === "premium" ||
    String(data.status || "").toUpperCase() === "PRO" ||
    sub.premium ||
    sub.isPro ||
    String(sub.status || "").toUpperCase() === "PRO"
  );
  const premiumActive = premiumFlag && premiumExpiresAt && premiumExpiresAt.getTime() > now;
  const trialActive = !premiumActive && Boolean(data.account_type === "trial") && trialExpiresAt && trialExpiresAt.getTime() > now;

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

function cacheKey(userId) {
  return String(userId || "").trim();
}

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
  const exp =
    toDate(data?.premiumExpiresAt) ||
    toDate(data?.expired_at) ||
    toDate(data?.expiresAt) ||
    toDate(data?.subscriptionInfo?.expiresAt);
  return Boolean(data?.premium || data?.isPro || data?.pro || data?.account_type === "premium" || String(data?.status || "").toUpperCase() === "PRO") && exp && exp.getTime() > Date.now();
}

function isQuotaError(error) {
  const text = String(error?.message || error?.details || error?.code || "").toLowerCase();
  return error?.code === 8 || text.includes("resource_exhausted") || text.includes("quota") || text.includes("free daily read units");
}

async function findPendingEmailActivation(email, userId) {
  if (!email) return null;

  const snap = await db.collection("users").where("email", "==", email).limit(5).get();
  if (snap.empty) return null;

  const docs = snap.docs
    .filter(doc => doc.id !== userId)
    .map(doc => ({ id: doc.id, ref: doc.ref, data: doc.data() }))
    .filter(item => item.data?.manualActivation || isPremiumData(item.data));

  docs.sort((a, b) => {
    const ae = toDate(a.data.premiumExpiresAt || a.data.expired_at || a.data.expiresAt || a.data.subscriptionInfo?.expiresAt)?.getTime() || 0;
    const be = toDate(b.data.premiumExpiresAt || b.data.expired_at || b.data.expiresAt || b.data.subscriptionInfo?.expiresAt)?.getTime() || 0;
    return be - ae;
  });

  return docs[0] || null;
}

async function mergePendingEmailActivation({ email, userId, name, photoUrl, uidRef, uidExists, current }) {
  const pending = await findPendingEmailActivation(email, userId);
  if (!pending) return null;

  const currentData = current || {};
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
    updated_at: FieldValue.serverTimestamp(),
    migratedFrom: pending.id
  };

  if (usePendingPremium) {
    merged.account_type = "premium";
    merged.premium = true;
    merged.isPro = true;
    merged.pro = true;
    merged.active = true;
    merged.status = "PRO";
    merged.planId = pendingData.planId || currentData.planId || "manual";
    merged.planName = pendingData.planName || currentData.planName || "GÓI PRO";
    merged.premiumStartedAt = pendingData.premiumStartedAt || currentData.premiumStartedAt || FieldValue.serverTimestamp();
    merged.premiumExpiresAt = pendingData.premiumExpiresAt || pendingData.expired_at || pendingData.expiresAt || pendingData.subscriptionInfo?.expiresAt;
    merged.expired_at = pendingData.expired_at || pendingData.premiumExpiresAt || pendingData.expiresAt || pendingData.subscriptionInfo?.expiresAt;
    merged.expiresAt = pendingData.expiresAt || pendingData.premiumExpiresAt || pendingData.expired_at || pendingData.subscriptionInfo?.expiresAt;
    merged.lastAdminAction = pendingData.lastAdminAction || currentData.lastAdminAction || "email_activation_migrated";
  }

  if (!uidExists) merged.created_at = FieldValue.serverTimestamp();

  await uidRef.set(merged, { merge: true });
  await pending.ref.set({
    migratedTo: userId,
    migratedAt: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp()
  }, { merge: true });

  return merged;
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return res.status(405).json({ success: false, error: "Method not allowed" });
    }

    const source = req.method === "POST" ? (req.body || {}) : (req.query || {});
    const userId = String(source.userId || source.uid || "").trim();
    const email = String(source.email || "").trim().toLowerCase();
    const name = String(source.name || "").trim();
    const photoUrl = String(source.photoUrl || "").trim();
    const initTrial = String(source.initTrial || "0") === "1";
    const force = String(source.force || "0") === "1";

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId"
      });
    }

    const cached = !force ? readMemoryCache(userId, initTrial ? INIT_CACHE_TTL_MS : MEMORY_CACHE_TTL_MS) : null;
    if (cached && (!initTrial || cached.active)) {
      return res.status(200).json(cached);
    }

    const ref = db.collection("users").doc(userId);
    const snap = await ref.get();
    const user = snap.exists ? (snap.data() || {}) : null;

    // Chỉ tìm bản ghi kích hoạt thủ công theo email ở lần đăng nhập đầu tiên.
    // Các lần kiểm tra sau dùng cache/memory cache, không query email để giảm quota đọc Firestore.
    if (initTrial && email && (!snap.exists || !isPremiumData(user))) {
      const migrated = await mergePendingEmailActivation({
        email,
        userId,
        name,
        photoUrl,
        uidRef: ref,
        uidExists: snap.exists,
        current: user || {}
      });
      if (migrated) {
        const response = buildResponse(userId, migrated);
        saveMemoryCache(userId, response);
        return res.status(200).json(response);
      }
    }

    if (!snap.exists) {
      if (!initTrial) {
        const response = emptyResponse(userId);
        saveMemoryCache(userId, response);
        return res.status(200).json(response);
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
        trialStartedAt: Timestamp.fromDate(now),
        trialExpiresAt: Timestamp.fromDate(trialExpiresAt),
        created_at: FieldValue.serverTimestamp(),
        firstLoginAt: FieldValue.serverTimestamp(),
        lastLoginAt: FieldValue.serverTimestamp(),
        loginCount: 1,
        updated_at: FieldValue.serverTimestamp()
      };

      await ref.set(trialData, { merge: true });

      const response = buildResponse(userId, trialData);
      saveMemoryCache(userId, response);
      return res.status(200).json(response);
    }

    // Các lượt kiểm tra định kỳ chỉ đọc trạng thái, không ghi loginCount/updated_at liên tục.
    // Chỉ cập nhật thông tin đăng nhập ở lần initTrial và tối đa 1 lần/24 giờ để giảm quota.
    if (initTrial) {
      const lastLogin = toDate(user.lastLoginAt);
      const shouldTouchLogin = !lastLogin || (Date.now() - lastLogin.getTime() > 24 * 60 * 60 * 1000);
      const profileChanged =
        (email && email !== (user.email || "")) ||
        (name && name !== (user.name || "")) ||
        (photoUrl && photoUrl !== (user.photoUrl || ""));

      if (profileChanged || shouldTouchLogin) {
        await ref.set(
          {
            email: email || user.email || "",
            name: name || user.name || "",
            photoUrl: photoUrl || user.photoUrl || "",
            ...(shouldTouchLogin ? {
              lastLoginAt: FieldValue.serverTimestamp(),
              loginCount: FieldValue.increment(1),
              firstLoginAt: user.firstLoginAt || user.created_at || FieldValue.serverTimestamp()
            } : {}),
            updated_at: FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      }
    }

    const response = buildResponse(userId, user);
    saveMemoryCache(userId, response);
    return res.status(200).json(response);
  } catch (error) {
    const source = req.method === "POST" ? (req.body || {}) : (req.query || {});
    const userId = String(source.userId || source.uid || "").trim();
    const quota = isQuotaError(error);
    const stale = userId ? readMemoryCache(userId, MEMORY_STALE_TTL_MS) : null;
    if (quota && stale) {
      return res.status(200).json({
        ...stale,
        success: true,
        warning: "Firestore đã hết quota đọc miễn phí trong ngày. Hệ thống đang dùng tạm cache server để tránh treo trang."
      });
    }
    return res.status(quota ? 200 : 500).json({
      success: false,
      code: quota ? "FIRESTORE_QUOTA_EXHAUSTED" : "SUBSCRIPTION_SERVER_ERROR",
      error: quota
        ? "Firestore đã hết quota đọc miễn phí trong ngày. Hệ thống đã dừng gọi lặp để tránh treo trang. Hãy chờ quota reset hoặc bật billing/nâng quota cho Firebase."
        : (error.message || "Server error")
    });
  }
}
