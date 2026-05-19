import { db, FieldValue, Timestamp } from "../lib/firebaseAdmin.js";
import { setCors } from "../lib/cors.js";

const SEPAY_API_KEY = process.env.SEPAY_API_KEY || "mysecret123";

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
  const raw =
    body.transferAmount ??
    body.amount ??
    body.money ??
    body.value ??
    body.transactionAmount ??
    body.transaction_amount ??
    body.data?.transferAmount ??
    body.data?.amount ??
    0;

  if (typeof raw === "number") return raw;
  return Number(String(raw || "").replace(/[^\d]/g, "")) || 0;
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
      body.reference_code ||
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
      body.transactionType ||
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

function toDate(value) {
  return value?.toDate?.() || (value ? new Date(value) : null);
}

function addDays(date, days) {
  return new Date(date.getTime() + Number(days) * 24 * 60 * 60 * 1000);
}

async function logWebhook(data) {
  try {
    await db.collection("sepay_logs").add({
      app: "research",
      ...data,
      createdAt: FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error("LOG WEBHOOK ERROR:", error);
  }
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  try {
    if (req.method !== "POST") {
      return res.status(200).json({
        success: true,
        message: "Research SePay webhook is running. Please send POST JSON.",
        endpoint: "/api/sepay-webhook",
        prefix: "RESEARCH"
      });
    }

    const token = getAuthToken(req);

    if (SEPAY_API_KEY && token && token !== SEPAY_API_KEY) {
      await logWebhook({
        status: "invalid_api_key",
        tokenPreview: token.slice(0, 6) + "...",
        body: req.body || {}
      });

      return res.status(401).json({
        success: false,
        message: "Invalid API Key"
      });
    }

    const body = req.body || {};
    const transferType = pickType(body);
    const amount = pickAmount(body);
    const content = pickContent(body);

    if (transferType && !["in", "deposit", "credit", "money_in", "receive"].includes(transferType)) {
      await logWebhook({
        status: "skip_not_money_in",
        transferType,
        amount,
        content,
        body
      });

      return res.status(200).json({
        success: true,
        updated: false,
        message: "Skipped because this is not money in."
      });
    }

    const searchText = compactText(content + " " + JSON.stringify(body));
    const match = searchText.match(/RESEARCH\d+/i);

    if (!match) {
      await logWebhook({
        status: "no_order_code",
        amount,
        content,
        body
      });

      return res.status(200).json({
        success: true,
        updated: false,
        message: "No RESEARCH order code found.",
        receivedAmount: amount,
        receivedContent: content
      });
    }

    const orderCode = match[0].toUpperCase();

    const paymentRef = db.collection("payments").doc(orderCode);
    const paymentSnap = await paymentRef.get();
    const payment = paymentSnap.exists ? paymentSnap.data() : null;

    const amountPlan = getPlanByAmount(amount);
    const plan =
      payment?.planId
        ? {
            planId: payment.planId,
            planName: payment.planName || amountPlan.planName,
            days: Number(payment.days || amountPlan.days)
          }
        : amountPlan;

    const paidAtDate = new Date();
    const userId = String(payment?.userId || "").trim();
    const userEmail = String(payment?.userEmail || "").trim();

    let baseDate = paidAtDate;
    let premiumStartedAtDate = paidAtDate;

    if (userId) {
      const userSnap = await db.collection("users").doc(userId).get();

      if (userSnap.exists) {
        const user = userSnap.data();
        const currentPremiumExpiresAt = toDate(user.premiumExpiresAt) || toDate(user.expired_at);
        const currentTrialExpiresAt = toDate(user.trialExpiresAt);

        if (currentPremiumExpiresAt && currentPremiumExpiresAt.getTime() > paidAtDate.getTime()) {
          baseDate = currentPremiumExpiresAt;
        } else if (currentTrialExpiresAt && currentTrialExpiresAt.getTime() > paidAtDate.getTime()) {
          baseDate = currentTrialExpiresAt;
        }

        premiumStartedAtDate = toDate(user.premiumStartedAt) || toDate(user.started_at) || paidAtDate;
      }
    }

    const expiresAtDate = addDays(baseDate, plan.days);

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
        userId,
        userEmail,
        rawBody: body,
        paidAt: FieldValue.serverTimestamp(),
        baseExpiresAtBeforePurchase: Timestamp.fromDate(baseDate),
        expiresAt: Timestamp.fromDate(expiresAtDate),
        cumulative: baseDate.getTime() > paidAtDate.getTime(),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    await paymentRef.set(
      {
        app: "research",
        orderCode,
        paid: true,
        status: "paid",
        paidAmount: amount,
        amount,
        planId: plan.planId,
        planName: plan.planName,
        days: plan.days,
        sepayContent: content,
        rawBody: body,
        paidAt: FieldValue.serverTimestamp(),
        baseExpiresAtBeforePurchase: Timestamp.fromDate(baseDate),
        expiresAt: Timestamp.fromDate(expiresAtDate),
        cumulative: baseDate.getTime() > paidAtDate.getTime(),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    if (userId) {
      await db.collection("users").doc(userId).set(
        {
          account_type: "premium",
          premium: true,
          active: true,
          planId: plan.planId,
          planName: plan.planName,
          premiumStartedAt: Timestamp.fromDate(premiumStartedAtDate),
          started_at: Timestamp.fromDate(premiumStartedAtDate),
          premiumExpiresAt: Timestamp.fromDate(expiresAtDate),
          expired_at: Timestamp.fromDate(expiresAtDate),
          lastPaymentOrderCode: orderCode,
          updated_at: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    await logWebhook({
      status: "success_paid",
      orderCode,
      amount,
      content,
      planId: plan.planId,
      userId,
      userEmail,
      cumulative: baseDate.getTime() > paidAtDate.getTime(),
      baseExpiresAtBeforePurchase: baseDate.toISOString(),
      expiresAt: expiresAtDate.toISOString(),
      body
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
      expiresAt: expiresAtDate.toISOString(),
      cumulative: baseDate.getTime() > paidAtDate.getTime(),
      userId
    });
  } catch (error) {
    console.error("SEPAY WEBHOOK ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Webhook error",
      error: error.message || "Server error",
      hint: "Kiểm tra FIREBASE_SERVICE_ACCOUNT / FIRESTORE_DATABASE_ID trên Vercel."
    });
  }
}
