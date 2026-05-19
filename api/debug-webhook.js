import { db } from "../lib/firebaseAdmin.js";
import { setCors } from "../lib/cors.js";

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  try {
    const orderCode = String(req.query.orderCode || "").trim().toUpperCase();

    const result = {
      success: true,
      message: "Research payment debug",
      hasSepayApiKey: Boolean(process.env.SEPAY_API_KEY),
      firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID || "(default)",
      orderCode: orderCode || null,
      payment: null,
      paidOrder: null,
      recentLogs: []
    };

    if (orderCode) {
      const paymentSnap = await db.collection("payments").doc(orderCode).get();
      const paidSnap = await db.collection("paid_orders").doc(orderCode).get();

      result.payment = paymentSnap.exists ? paymentSnap.data() : null;
      result.paidOrder = paidSnap.exists ? paidSnap.data() : null;
    }

    const logsSnap = await db
      .collection("sepay_logs")
      .where("app", "==", "research")
      .limit(10)
      .get();

    result.recentLogs = logsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Debug webhook error"
    });
  }
}
