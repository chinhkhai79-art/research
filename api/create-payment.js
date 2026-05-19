import { db, FieldValue } from "../lib/firebaseAdmin.js";
import { setCors } from "../lib/cors.js";

const BANK_ID = "ACB";
const ACCOUNT_NO = "13131447";
const ACCOUNT_NAME = "LE VAN KHAI";

const APP_DOMAIN = "https://research.vanthemmo.com";
const ORDER_PREFIX = "RESEARCH";

const PLANS = {
  "1m": { name: "Gói 1 tháng", amount: 10000, days: 30 },
  "3m": { name: "Gói 3 tháng", amount: 180000, days: 90 },
  "6m": { name: "Gói 6 tháng", amount: 300000, days: 180 },
  "12m": { name: "Gói 1 năm", amount: 500000, days: 365 }
};

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        error: "Method not allowed. Use POST."
      });
    }

    const body = req.body || {};

    const planId = body.planId || body.packageId || "1m";
    const userEmail = body.userEmail || body.email || "guest";
    const userPhone = body.userPhone || body.phone || "";
    const userId = body.userId || body.uid || "";

    const plan = PLANS[planId] || PLANS["1m"];

    const orderCode =
      ORDER_PREFIX +
      Date.now().toString() +
      Math.floor(Math.random() * 900 + 100);

    const qrUrl =
      `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact2.png` +
      `?amount=${plan.amount}` +
      `&addInfo=${encodeURIComponent(orderCode)}` +
      `&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;

    const paymentUrl =
      `${APP_DOMAIN}/pay.html` +
      `?plan=${encodeURIComponent(planId)}` +
      `&amount=${encodeURIComponent(plan.amount)}` +
      `&content=${encodeURIComponent(orderCode)}` +
      `&userId=${encodeURIComponent(userId)}` +
      `&email=${encodeURIComponent(userEmail)}` +
      `&phone=${encodeURIComponent(userPhone)}`;

    await db.collection("payments").doc(orderCode).set({
      orderCode,
      app: "research",
      planId,
      planName: plan.name,
      amount: plan.amount,
      days: plan.days,
      userEmail,
      userPhone,
      userId,
      status: "pending",
      bankId: BANK_ID,
      accountNo: ACCOUNT_NO,
      accountName: ACCOUNT_NAME,
      qrUrl,
      paymentUrl,
      createdAt: FieldValue.serverTimestamp()
    });

    return res.status(200).json({
      success: true,
      orderCode,
      paymentCode: orderCode,
      planId,
      packageId: planId,
      planName: plan.name,
      packageName: plan.name,
      amount: plan.amount,
      days: plan.days,
      bankId: BANK_ID,
      accountNo: ACCOUNT_NO,
      accountName: ACCOUNT_NAME,
      qrUrl,
      paymentUrl
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Server error"
    });
  }
}
