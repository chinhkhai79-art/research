import { db, FieldValue, Timestamp } from "../../lib/firebaseAdmin.js";
import { setCors } from "../../lib/cors.js";

const TRIAL_MS = 60 * 60 * 1000;

function toDate(value) {
  return value?.toDate?.() || (value ? new Date(value) : null);
}

function iso(value) {
  const d = toDate(value);
  return d ? d.toISOString() : null;
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  try {
    const userId = String(req.query.userId || req.query.uid || "").trim();
    const email = String(req.query.email || "").trim();
    const name = String(req.query.name || "").trim();

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId"
      });
    }

    const userRef = db.collection("users").doc(userId);
    const snap = await userRef.get();

    if (!snap.exists) {
      const now = new Date();
      const trialExpiresAtDate = new Date(now.getTime() + TRIAL_MS);

      await userRef.set({
        app: "research",
        userId,
        email,
        name,
        account_type: "trial",
        premium: false,
        active: true,
        planId: "trial_1h",
        planName: "Dùng thử 1 giờ",
        trialStartedAt: Timestamp.fromDate(now),
        trialExpiresAt: Timestamp.fromDate(trialExpiresAtDate),
        premiumExpiresAt: null,
        expired_at: Timestamp.fromDate(trialExpiresAtDate),
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp()
      });

      return res.status(200).json({
        success: true,
        active: true,
        premium: false,
        accountType: "trial",
        plan: "trial_1h",
        planName: "Dùng thử 1 giờ",
        trialStartedAt: now.toISOString(),
        trialExpiresAt: trialExpiresAtDate.toISOString(),
        expiresAt: trialExpiresAtDate.toISOString(),
        remainingMs: trialExpiresAtDate.getTime() - Date.now(),
        userId
      });
    }

    const user = snap.data();

    const premiumExpiresAt = toDate(user.premiumExpiresAt || user.expired_at);
    const trialExpiresAt = toDate(user.trialExpiresAt);
    const now = Date.now();

    const premiumActive =
      Boolean(user.premium || user.account_type === "premium") &&
      premiumExpiresAt &&
      premiumExpiresAt.getTime() > now;

    const trialActive =
      !premiumActive &&
      user.account_type === "trial" &&
      trialExpiresAt &&
      trialExpiresAt.getTime() > now;

    const active = Boolean(premiumActive || trialActive);
    const expiresAt = premiumActive ? premiumExpiresAt : trialActive ? trialExpiresAt : (premiumExpiresAt || trialExpiresAt || null);

    await userRef.set(
      {
        email: email || user.email || "",
        name: name || user.name || "",
        active,
        updated_at: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    return res.status(200).json({
      success: true,
      active,
      premium: Boolean(premiumActive),
      accountType: premiumActive ? "premium" : (trialActive ? "trial" : (user.account_type || "expired")),
      plan: premiumActive ? (user.planId || null) : (trialActive ? "trial_1h" : (user.planId || null)),
      planName: premiumActive ? (user.planName || "Premium") : (trialActive ? "Dùng thử 1 giờ" : (user.planName || null)),
      trialStartedAt: iso(user.trialStartedAt),
      trialExpiresAt: iso(user.trialExpiresAt),
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      remainingMs: expiresAt ? Math.max(0, expiresAt.getTime() - now) : 0,
      userId
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Server error"
    });
  }
}
