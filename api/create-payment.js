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

function normalizePlanId(value) {
  const id = String(value || "1m").trim().toLowerCase();

  if (id === "1y" || id === "1year" || id === "year") {
    return "12m";
  }

  return PLANS[id] ? id : "1m";
}

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
    const planId = normalizePlanId(body.planId || body.packageId || "1m");
    const plan = PLANS[planId];

    const userId = String(body.userId || body.uid || body.uidFirebase || "").trim();
    const userEmail = String(body.userEmail || body.email || "").trim();
    const userPhone = String(body.userPhone || body.phone || "").trim();

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
      `&uid=${encodeURIComponent(userId)}` +
      `&userId=${encodeURIComponent(userId)}` +
      `&email=${encodeURIComponent(userEmail)}`;

    await db.collection("payments").doc(orderCode).set({
      app: "research",
      orderCode,
      planId,
      planName: plan.name,
      amount: plan.amount,
      days: plan.days,
      userId,
      userEmail,
      userPhone,
      status: "pending",
      paid: false,
      bankId: BANK_ID,
      accountNo: ACCOUNT_NO,
      accountName: ACCOUNT_NAME,
      qrUrl,
      paymentUrl,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
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
    console.error("CREATE PAYMENT ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Server error",
      hint: "Kiểm tra FIREBASE_SERVICE_ACCOUNT và FIRESTORE_DATABASE_ID trên Vercel."
    });
  }
}
