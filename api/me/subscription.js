import { db } from "../../lib/firebaseAdmin.js";
import { setCors } from "../../lib/cors.js";

function toDate(value) {
  return value?.toDate?.() || (value ? new Date(value) : null);
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  try {
    const userId = String(req.query.userId || req.query.uid || "").trim();

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId"
      });
    }

    const snap = await db.collection("users").doc(userId).get();

    if (!snap.exists) {
      return res.status(200).json({
        success: true,
        active: false,
        premium: false,
        accountType: "none",
        plan: null,
        planName: null,
        expiresAt: null,
        userId
      });
    }

    const user = snap.data();
    const expiresAt =
      toDate(user.premiumExpiresAt) ||
      toDate(user.expired_at);

    const active =
      Boolean(user.premium || user.active || user.account_type === "premium") &&
      expiresAt &&
      expiresAt.getTime() > Date.now();

    return res.status(200).json({
      success: true,
      active: Boolean(active),
      premium: Boolean(active),
      accountType: active ? "premium" : (user.account_type || "trial"),
      plan: user.planId || null,
      planName: user.planName || null,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      userId
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Server error"
    });
  }
}
