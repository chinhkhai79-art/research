import { db, FieldValue, Timestamp } from "../lib/firebaseAdmin.js";
import { setCors } from "../lib/cors.js";
import { sendPaymentSuccessEmail } from "../lib/mailer.js";

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

async function sendSuccessEmailOnce({
  orderCode,
  userEmail,
  userName,
  planName,
  amount,
  expiresAtDate,
  paidOrderBefore
}) {
  if (!userEmail) {
    return { success: false, skipped: true, error: "Missing userEmail" };
  }

  if (paidOrderBefore?.emailSent) {
    return {
      success: true,
      skipped: true,
      messageId: paidOrderBefore.emailMessageId || null,
      error: null
    };
  }

  const emailResult = await sendPaymentSuccessEmail({
    to: userEmail,
    name: userName || userEmail,
    planName,
    amount,
    orderCode,
    expiresAt: expiresAtDate,
    toolUrl: "https://research.vanthemmo.com/"
  });

  await db.collection("paid_orders").doc(orderCode).set(
    {
      emailSent: Boolean(emailResult.success),
      emailMessageId: emailResult.messageId || null,
      emailError: emailResult.error || null,
      emailSentAt: emailResult.success ? FieldValue.serverTimestamp() : null,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return emailResult;
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
    const paidOrderRef = db.collection("paid_orders").doc(orderCode);

    const [paymentSnap, paidOrderSnap] = await Promise.all([
      paymentRef.get(),
      paidOrderRef.get()
    ]);

    const payment = paymentSnap.exists ? paymentSnap.data() : null;
    const paidOrderBefore = paidOrderSnap.exists ? paidOrderSnap.data() : null;

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
    const userName = String(payment?.userName || payment?.displayName || userEmail || "").trim();

    let currentUser = null;

    if (userId) {
      const userSnap = await db.collection("users").doc(userId).get();
      currentUser = userSnap.exists ? userSnap.data() : null;
    }

    const oldExpiresAt =
      toDate(currentUser?.premiumExpiresAt) ||
      toDate(currentUser?.expired_at);

    const baseDate =
      oldExpiresAt && oldExpiresAt.getTime() > paidAtDate.getTime()
        ? oldExpiresAt
        : paidAtDate;

    const expiresAtDate = addDays(baseDate, plan.days);

    await paidOrderRef.set(
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
        userName,
        rawBody: body,
        cumulativeBaseAt: Timestamp.fromDate(baseDate),
        previousExpiresAt: oldExpiresAt ? Timestamp.fromDate(oldExpiresAt) : null,
        paidAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiresAtDate),
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
        cumulativeBaseAt: Timestamp.fromDate(baseDate),
        previousExpiresAt: oldExpiresAt ? Timestamp.fromDate(oldExpiresAt) : null,
        paidAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiresAtDate),
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
          premiumExpiresAt: Timestamp.fromDate(expiresAtDate),
          expired_at: Timestamp.fromDate(expiresAtDate),
          lastPaymentOrderCode: orderCode,
          lastPaymentAmount: amount,
          lastPaymentAt: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    const emailResult = await sendSuccessEmailOnce({
      orderCode,
      userEmail,
      userName,
      planName: plan.planName,
      amount,
      expiresAtDate,
      paidOrderBefore
    });

    await logWebhook({
      status: "success_paid",
      orderCode,
      amount,
      content,
      planId: plan.planId,
      userId,
      userEmail,
      emailSent: Boolean(emailResult.success),
      emailError: emailResult.error || null,
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
      userId,
      emailSent: Boolean(emailResult.success),
      emailError: emailResult.error || null
    });
  } catch (error) {
    console.error("SEPAY WEBHOOK ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Webhook error",
      error: error.message || "Server error",
      hint: "Kiểm tra FIREBASE_SERVICE_ACCOUNT / FIRESTORE_DATABASE_ID / SMTP_USER / SMTP_PASS trên Vercel."
    });
  }
}
