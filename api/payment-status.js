import { db } from "../lib/firebaseAdmin.js";
import { setCors } from "../lib/cors.js";

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  try {
    const orderCode = String(
      req.query.orderCode || req.query.paymentCode || req.query.content || ""
    )
      .trim()
      .toUpperCase();

    if (!orderCode) {
      return res.status(400).json({
        success: false,
        paid: false,
        error: "Missing orderCode"
      });
    }

    const snap = await db.collection("paid_orders").doc(orderCode).get();

    if (!snap.exists) {
      return res.status(200).json({
        success: true,
        paid: false,
        status: "pending",
        orderCode
      });
    }

    const data = snap.data();

    return res.status(200).json({
      success: true,
      paid: Boolean(data.paid),
      status: data.status || "paid",
      orderCode,
      amount: data.amount || 0,
      planId: data.planId || "1m",
      planName: data.planName || "Gói 1 tháng",
      packageName: data.planName || "Gói 1 tháng",
      paidAt: data.paidAt?.toDate?.()?.toISOString?.() || null,
      expiresAt: data.expiresAt?.toDate?.()?.toISOString?.() || null
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      paid: false,
      error: error.message || "Server error"
    });
  }
}
