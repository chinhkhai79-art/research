import { db, FieldValue, Timestamp } from "../../lib/firebaseAdmin.js";
import { setCors } from "../../lib/cors.js";

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

function buildResponse(userId, data) {
  const premiumExpiresAt = toDate(data.premiumExpiresAt) || toDate(data.expired_at);
  const trialExpiresAt = toDate(data.trialExpiresAt);
  const premiumStartedAt = toDate(data.premiumStartedAt) || toDate(data.started_at);
  const trialStartedAt = toDate(data.trialStartedAt);

  const now = Date.now();
  const premiumActive = Boolean(data.premium || data.account_type === "premium") && premiumExpiresAt && premiumExpiresAt.getTime() > now;
  const trialActive = !premiumActive && Boolean(data.account_type === "trial") && trialExpiresAt && trialExpiresAt.getTime() > now;

  const active = Boolean(premiumActive || trialActive);
  const accountType = premiumActive ? "premium" : trialActive ? "trial" : (data.account_type || "expired");
  const expiresAt = premiumActive ? premiumExpiresAt : trialActive ? trialExpiresAt : (premiumExpiresAt || trialExpiresAt);
  const startedAt = premiumActive ? premiumStartedAt : trialActive ? trialStartedAt : (premiumStartedAt || trialStartedAt);

  return {
    success: true,
    active,
    premium: Boolean(premiumActive),
    accountType,
    plan: data.planId || null,
    planId: data.planId || null,
    planName: premiumActive ? (data.planName || "Gói Premium") : trialActive ? "Dùng thử 1 giờ" : (data.planName || null),
    startedAt: startedAt ? startedAt.toISOString() : null,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    remainingMs: expiresAt ? Math.max(0, expiresAt.getTime() - now) : 0,
    remainingText: getRemainingText(expiresAt),
    userId
  };
}

function isPremiumData(data) {
  const exp = toDate(data?.premiumExpiresAt) || toDate(data?.expired_at);
  return Boolean(data?.premium || data?.account_type === "premium") && exp && exp.getTime() > Date.now();
}

async function findPendingEmailActivation(email, userId) {
  if (!email) return null;

  const snap = await db.collection("users").where("email", "==", email).limit(10).get();
  if (snap.empty) return null;

  const docs = snap.docs
    .filter(doc => doc.id !== userId)
    .map(doc => ({ id: doc.id, ref: doc.ref, data: doc.data() }))
    .filter(item => item.data?.manualActivation || isPremiumData(item.data));

  docs.sort((a, b) => {
    const ae = toDate(a.data.premiumExpiresAt || a.data.expired_at)?.getTime() || 0;
    const be = toDate(b.data.premiumExpiresAt || b.data.expired_at)?.getTime() || 0;
    return be - ae;
  });

  return docs[0] || null;
}

async function mergePendingEmailActivation({ email, userId, name, photoUrl }) {
  const pending = await findPendingEmailActivation(email, userId);
  if (!pending) return null;

  const uidRef = db.collection("users").doc(userId);
  const uidSnap = await uidRef.get();
  const current = uidSnap.exists ? uidSnap.data() : {};
  const pendingData = pending.data || {};

  const currentExp = toDate(current.premiumExpiresAt || current.expired_at);
  const pendingExp = toDate(pendingData.premiumExpiresAt || pendingData.expired_at);
  const usePendingPremium = pendingExp && (!currentExp || pendingExp.getTime() > currentExp.getTime());

  const merged = {
    ...current,
    userId,
    email: email || current.email || pendingData.email || "",
    name: name || current.name || pendingData.name || pendingData.displayName || "",
    photoUrl: photoUrl || current.photoUrl || pendingData.photoUrl || "",
    updated_at: FieldValue.serverTimestamp(),
    migratedFrom: pending.id
  };

  if (usePendingPremium) {
    merged.account_type = "premium";
    merged.premium = true;
    merged.active = true;
    merged.planId = pendingData.planId || current.planId || "manual";
    merged.planName = pendingData.planName || current.planName || "GÓI PRO";
    merged.premiumStartedAt = pendingData.premiumStartedAt || current.premiumStartedAt || FieldValue.serverTimestamp();
    merged.premiumExpiresAt = pendingData.premiumExpiresAt || pendingData.expired_at;
    merged.expired_at = pendingData.expired_at || pendingData.premiumExpiresAt;
    merged.lastAdminAction = pendingData.lastAdminAction || current.lastAdminAction || "email_activation_migrated";
  }

  if (!uidSnap.exists) merged.created_at = FieldValue.serverTimestamp();

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
    const userId = String(req.query.userId || req.query.uid || "").trim();
    const email = String(req.query.email || "").trim().toLowerCase();
    const name = String(req.query.name || "").trim();
    const photoUrl = String(req.query.photoUrl || "").trim();
    const initTrial = String(req.query.initTrial || "0") === "1";

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId"
      });
    }

    const ref = db.collection("users").doc(userId);
    const snap = await ref.get();

    // Quan trọng: nếu admin đã kích hoạt thủ công bằng email trước khi khách đăng nhập,
    // lần đăng nhập Google đầu tiên sẽ tự gộp quyền PRO từ bản ghi manual_EMAIL sang UID thật.
    const migrated = await mergePendingEmailActivation({ email, userId, name, photoUrl });
    if (migrated) {
      return res.status(200).json(buildResponse(userId, migrated));
    }

    if (!snap.exists) {
      if (!initTrial) {
        return res.status(200).json({
          success: true,
          active: false,
          premium: false,
          accountType: "none",
          plan: null,
          planName: null,
          startedAt: null,
          expiresAt: null,
          remainingMs: 0,
          remainingText: "---",
          userId
        });
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
        updated_at: FieldValue.serverTimestamp()
      };

      await ref.set(trialData, { merge: true });

      return res.status(200).json(buildResponse(userId, trialData));
    }

    const user = snap.data();

    if (email || name || photoUrl) {
      await ref.set(
        {
          email: email || user.email || "",
          name: name || user.name || "",
          photoUrl: photoUrl || user.photoUrl || "",
          updated_at: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    return res.status(200).json(buildResponse(userId, user));
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Server error"
    });
  }
}
