import { db } from "../../lib/firebaseAdmin.js";
import { setCors } from "../../lib/cors.js";

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId"
      });
    }

    const userSnap = await db.collection("users").doc(String(userId)).get();

    if (!userSnap.exists) {
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

    const user = userSnap.data();

    const expiresAt =
      user.premiumExpiresAt?.toDate?.() ||
      user.expired_at?.toDate?.() ||
      (user.premiumExpiresAt ? new Date(user.premiumExpiresAt) : null);

    const isActive =
      Boolean(user.premium || user.active || user.account_type === "premium") &&
      expiresAt &&
      expiresAt.getTime() > Date.now();

    return res.status(200).json({
      success: true,
      active: Boolean(isActive),
      premium: Boolean(isActive),
      accountType: isActive ? "premium" : (user.account_type || "trial"),
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
