import { db, FieldValue, Timestamp } from "../lib/firebaseAdmin.js";

const SEPAY_API_KEY = process.env.SEPAY_API_KEY || "mysecret123";
const ORDER_PREFIX = "RESEARCH";

function getAuthToken(req) {
  const authorization = req.headers.authorization || "";
  const xApiKey = req.headers["x-api-key"] || "";
  const apiKey = req.headers.apikey || req.headers.api_key || "";

  return String(authorization || xApiKey || apiKey)
    .replace(/^Bearer\s+/i, "")
    .replace(/^Apikey\s+/i, "")
    .replace(/^ApiKey\s+/i, "")
    .trim();
}

function normalizeText(text) {
  return String(text || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Đ/g, "D");
}

function compactText(text) {
  return normalizeText(text).replace(/[^A-Z0-9]/g, "");
}

function pickAmount(body) {
  return Number(
    body.transferAmount ||
    body.amount ||
    body.money ||
    body.value ||
    body.transactionAmount ||
    body.transaction_amount ||
    body.data?.transferAmount ||
    body.data?.amount ||
    0
  );
}

function pickContent(body) {
  return String(
    body.content ||
    body.description ||
    body.transferContent ||
    body.transactionContent ||
    body.transaction_content ||
    body.note ||
    body.code ||
    body.referenceCode ||
    body.data?.content ||
    body.data?.description ||
    body.data?.transferContent ||
    ""
  );
}

function pickType(body) {
  return String(
    body.transferType ||
    body.type ||
    body.data?.transferType ||
    body.data?.type ||
    "in"
  ).toLowerCase();
}

function getPlanByAmount(amount) {
  if (amount >= 500000) return { planId: "12m", planName: "Gói 1 năm", days: 365 };
  if (amount >= 300000) return { planId: "6m", planName: "Gói 6 tháng", days: 180 };
  if (amount >= 180000) return { planId: "3m", planName: "Gói 3 tháng", days: 90 };
  return { planId: "1m", planName: "Gói 1 tháng", days: 30 };
}

function addDays(date, days) {
  return new Date(date.getTime() + Number(days) * 24 * 60 * 60 * 1000);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(200).json({
        success: true,
        message: "Research SePay webhook is running. Please send POST JSON.",
        endpoint: "/api/sepay-webhook",
        prefix: ORDER_PREFIX
      });
    }

    const token = getAuthToken(req);

    if (SEPAY_API_KEY && token && token !== SEPAY_API_KEY) {
      return res.status(401).json({
        success: false,
        message: "Invalid API Key"
      });
    }

    const body = req.body || {};
    const transferType = pickType(body);
    const amount = pickAmount(body);
    const content = pickContent(body);

    if (transferType && transferType !== "in") {
      return res.status(200).json({
        success: true,
        updated: false,
        message: "Skipped because this is not money in."
      });
    }

    const searchText = compactText(content + " " + JSON.stringify(body));
    const match = searchText.match(/RESEARCH\d+/i);

    if (!match) {
      await db.collection("sepay_logs").add({
        app: "research",
        status: "no_order_code",
        amount,
        content,
        body,
        createdAt: FieldValue.serverTimestamp()
      });

      return res.status(200).json({
        success: true,
        updated: false,
        message: "No RESEARCH order code found."
      });
    }

    const orderCode = match[0].toUpperCase();

    const paymentRef = db.collection("payments").doc(orderCode);
    const paymentSnap = await paymentRef.get();
    const payment = paymentSnap.exists ? paymentSnap.data() : null;

    const plan =
      payment?.planId
        ? {
            planId: payment.planId,
            planName: payment.planName || getPlanByAmount(amount).planName,
            days: Number(payment.days || getPlanByAmount(amount).days)
          }
        : getPlanByAmount(amount);

    const paidAtDate = new Date();
    const expiresAtDate = addDays(paidAtDate, plan.days);

    await db.collection("paid_orders").doc(orderCode).set(
      {
        app: "research",
        orderCode,
        paid: true,
        status: "paid",
        amount,
        content,
        planId: plan.planId,
        planName: plan.planName,
        days: plan.days,
        userId: payment?.userId || "",
        userEmail: payment?.userEmail || "",
        rawBody: body,
        paidAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiresAtDate),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    await paymentRef.set(
      {
        status: "paid",
        paid: true,
        paidAmount: amount,
        sepayContent: content,
        rawBody: body,
        paidAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiresAtDate),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    if (payment?.userId) {
      await db.collection("users").doc(String(payment.userId)).set(
        {
          account_type: "premium",
          premium: true,
          active: true,
          planId: plan.planId,
          planName: plan.planName,
          premiumExpiresAt: Timestamp.fromDate(expiresAtDate),
          expired_at: Timestamp.fromDate(expiresAtDate),
          lastPaymentOrderCode: orderCode,
          updated_at: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    await db.collection("sepay_logs").add({
      app: "research",
      status: "success_paid",
      orderCode,
      amount,
      content,
      body,
      createdAt: FieldValue.serverTimestamp()
    });

    return res.status(200).json({
      success: true,
      updated: true,
      paid: true,
      message: "Payment confirmed. PRO activated.",
      orderCode,
      amount,
      planId: plan.planId,
      planName: plan.planName,
      expiresAt: expiresAtDate.toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Webhook error",
      error: error.message || "Server error"
    });
  }
}
