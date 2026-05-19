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

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  try {
    const userId = String(req.query.userId || req.query.uid || "").trim();
    const email = String(req.query.email || "").trim();
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
