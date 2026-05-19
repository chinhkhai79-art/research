import { db } from "../lib/firebaseAdmin.js";
import { setCors } from "../lib/cors.js";

function tsToISO(value) {
  return value?.toDate?.()?.toISOString?.() || null;
}

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

    const paidSnap = await db.collection("paid_orders").doc(orderCode).get();

    if (paidSnap.exists) {
      const data = paidSnap.data();

      return res.status(200).json({
        success: true,
        paid: Boolean(data.paid),
        status: data.status || "paid",
        orderCode,
        amount: data.amount || 0,
        planId: data.planId || "1m",
        planName: data.planName || "Gói 1 tháng",
        packageName: data.planName || "Gói 1 tháng",
        paidAt: tsToISO(data.paidAt),
        expiresAt: tsToISO(data.expiresAt),
        cumulative: Boolean(data.cumulative)
      });
    }

    const paymentSnap = await db.collection("payments").doc(orderCode).get();

    if (!paymentSnap.exists || !paymentSnap.data()?.paid) {
      return res.status(200).json({
        success: true,
        paid: false,
        status: "pending",
        orderCode
      });
    }

    const payment = paymentSnap.data();

    return res.status(200).json({
      success: true,
      paid: true,
      status: payment.status || "paid",
      orderCode,
      amount: payment.paidAmount || payment.amount || 0,
      planId: payment.planId || "1m",
      planName: payment.planName || "Gói 1 tháng",
      packageName: payment.planName || "Gói 1 tháng",
      paidAt: tsToISO(payment.paidAt),
      expiresAt: tsToISO(payment.expiresAt),
      cumulative: Boolean(payment.cumulative)
    });
  } catch (error) {
    console.error("PAYMENT STATUS ERROR:", error);

    return res.status(500).json({
      success: false,
      paid: false,
      error: error.message || "Server error",
      hint: "Kiểm tra FIREBASE_SERVICE_ACCOUNT / FIRESTORE_DATABASE_ID trên Vercel."
    });
  }
}
