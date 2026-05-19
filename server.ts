import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Load config manually to avoid import assertion issues
const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

// Initialize Firebase Admin
let db: any = null;

try {
  if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.log("Initializing Firebase Admin with Service Account...");
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else {
      console.log("Initializing Firebase Admin with config project ID:", firebaseConfig.projectId);
      admin.initializeApp({
        projectId: firebaseConfig.projectId
      });
    }
  }
  
  // Use specific database ID
  const dbId = firebaseConfig.firestoreDatabaseId;
  db = getFirestore(admin.app(), dbId);
  console.log("Firebase Admin initialized successfully (Firestore) for DB:", dbId);
} catch (error) {
  console.error('Firebase admin initialization failed (continuing without DB):', error);
}

// Helper functions from user sample
function firstValue(data: any, keys: string[], fallback: any = "") {
  for (const key of keys) {
    if (data && data[key] !== undefined && data[key] !== null && data[key] !== "") {
      return data[key];
    }
  }
  return fallback;
}

function cleanAmount(value: any) {
  if (typeof value === "number") return value;
  return Number(String(value || "").replace(/[^\d]/g, "")) || 0;
}

function compactPaymentText(text: string) {
  return (text || "").toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
      console.log(`[API Log] ${req.method} ${req.url}`);
    }
    next();
  });

  app.get("/api/youtube-suggestions", async (req, res) => {
    const { q } = req.query;
    if (!q) return res.json([]);
    try {
      // Use node-fetch style fetch available in newer Node versions
      const response = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(String(q))}&hl=vi`);
      const data = await response.json();
      res.json(data);
    } catch (e: any) {
      console.error("[Proxy Error]", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/debug", (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      env: {
        hasServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
        nodeVersion: process.version
      },
      message: 'YouTube Niche & Analyze Pro Backend is running via server.ts'
    });
  });

    app.post("/api/create-payment", async (req, res) => {
    try {
      const { planId = "1m", userEmail = "guest", userId = "", orderCode: customOrderCode } = req.body;
      const plans: any = {
        "1m": { name: "Gói 1 tháng", amount: 10000, days: 30 },
        "3m": { name: "Gói 3 tháng", amount: 180000, days: 90 },
        "6m": { name: "Gói 6 tháng", amount: 300000, days: 180 },
        "12m": { name: "Gói 1 năm", amount: 500000, days: 365 }
      };
      const plan = plans[planId] || plans["1m"];
      const orderCode = customOrderCode || ("RESEARCH" + Date.now() + Math.floor(Math.random() * 900 + 100));
      
      const BANK_ID = "ACB";
      const ACCOUNT_NO = "13131447";
      const ACCOUNT_NAME = "LE VAN RESEARCH";
      const APP_DOMAIN = "https://research.vanthemmo.com";
      
      const qrUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact2.png?amount=${plan.amount}&addInfo=${encodeURIComponent(orderCode)}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;
      const paymentUrl = `/pay.html?plan=${encodeURIComponent(planId)}&amount=${encodeURIComponent(plan.amount)}&content=${encodeURIComponent(orderCode)}&email=${encodeURIComponent(userEmail)}`;

      if (db) {
        await db.collection("payments").doc(orderCode).set({
          orderCode, app: "research", planId, planName: plan.name, amount: plan.amount, days: plan.days,
          userEmail, userId, status: "pending", createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      res.json({ success: true, orderCode, qrUrl, paymentUrl });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get("/api/payment-status", async (req, res) => {
    const { orderCode } = req.query;
    if (!orderCode) return res.status(400).json({ success: false, message: 'Missing orderCode' });

    if (!db) return res.status(503).json({ success: false, message: 'Database not initialized' });

    try {
      // Check both collections as per JS version logic (paid_orders is where successful ones go)
      const paidDoc = await db.collection('paid_orders').doc(orderCode as string).get();
      if (paidDoc.exists) {
        const data = paidDoc.data();
        return res.json({
          success: true, paid: true, orderCode, amount: data?.amount, planId: data?.planId,
          planName: data?.planName, paidAt: data?.paidAt?.toDate?.()?.toISOString() || null,
          expiresAt: data?.expiresAt?.toDate?.()?.toISOString() || null
        });
      }
      
      return res.json({ success: true, paid: false, status: "pending", orderCode });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get("/api/me/subscription", async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId) return res.status(400).json({ success: false, error: "Missing userId" });
      if (!db) return res.status(503).json({ success: false, error: "Database not initialized" });

      const userSnap = await db.collection("users").doc(String(userId)).get();
      if (!userSnap.exists) {
        return res.json({
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

      const user = userSnap.data() || {};
      const expiresAt = user.premiumExpiresAt?.toDate?.() || 
                        user.expired_at?.toDate?.() || 
                        (user.premiumExpiresAt ? new Date(user.premiumExpiresAt) : null);

      const isActive = Boolean(user.premium || user.active || user.account_type === "premium") && 
                       expiresAt && expiresAt.getTime() > Date.now();

      res.json({
        success: true,
        active: Boolean(isActive),
        premium: Boolean(isActive),
        accountType: isActive ? "premium" : (user.account_type || "trial"),
        plan: user.planId || null,
        planName: user.planName || null,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        userId
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/sepay-webhook", async (req, res) => {
    const data = req.body || {};
    const apiKey = process.env.SEPAY_API_KEY;
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    const validValues = apiKey ? [`Apikey ${apiKey}`, `ApiKey ${apiKey}`, `Bearer ${apiKey}`, apiKey] : [];

    if (apiKey && !validValues.includes(String(authHeader).trim())) {
      console.log("Invalid API Key:", authHeader);
      return res.status(401).json({ success: false, message: 'Invalid API Key' });
    }

    const transferType = String(firstValue(data, ["transferType", "type", "transactionType"], "in")).toLowerCase();
    if (transferType && !["in", "deposit", "credit", "money_in", "receive"].includes(transferType)) {
      return res.json({ success: true, updated: false, message: 'Not money in' });
    }

    const amount = cleanAmount(firstValue(data, ["transferAmount", "amount", "transaction_amount", "money", "value"], 0));
    const content = String(firstValue(data, ["content", "description", "transaction_content", "transferContent", "transactionContent", "code", "referenceCode", "reference_code"], ""));
    const description = String(firstValue(data, ["description", "content", "transaction_content", "transferContent", "transactionContent"], ""));
    const referenceCode = String(firstValue(data, ["referenceCode", "reference_code", "bankReferenceCode", "bank_reference_code"], ""));

    const searchText = `${content} ${description} ${referenceCode}`.toUpperCase();
    const compactTextSearch = compactPaymentText(searchText);
    const match = compactTextSearch.match(/RESEARCH\d+/i);
    const orderCode = match ? match[0] : "";
    
    if (!orderCode) {
      console.log("No RESEARCH orderCode found in:", searchText);
      return res.json({ success: true, updated: false, message: 'No relevant order code' });
    }

    if (!db) {
      return res.status(503).json({ success: false, message: 'Database not initialized' });
    }

    try {
      const paymentRef = db.collection("payments").doc(orderCode);
      const paymentSnap = await paymentRef.get();
      const payment = paymentSnap.exists ? paymentSnap.data() : null;

      const getPlan = (amt: number) => {
        if (amt >= 500000) return { planId: "12m", planName: "Gói 1 năm", days: 365 };
        if (amt >= 300000) return { planId: "6m", planName: "Gói 6 tháng", days: 180 };
        if (amt >= 180000) return { planId: "3m", planName: "Gói 3 tháng", days: 90 };
        return { planId: "1m", planName: "Gói 1 tháng", days: 30 };
      };

      const plan = payment?.planId ? { planId: payment.planId, planName: payment.planName, days: payment.days } : getPlan(amount);
      const expiresAt = new Date(Date.now() + plan.days * 24 * 60 * 60 * 1000);

      await db.collection("paid_orders").doc(orderCode).set({
        app: "research", orderCode, paid: true, status: "paid", amount, content,
        planId: plan.planId, planName: plan.planName, days: plan.days,
        userId: payment?.userId || "", userEmail: payment?.userEmail || "",
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt)
      }, { merge: true });

      await paymentRef.set({ status: "paid", paid: true, paidAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

      if (payment?.userId) {
        await db.collection("users").doc(String(payment.userId)).set({
          premium: true, active: true, planId: plan.planId, planName: plan.planName,
          premiumExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt)
        }, { merge: true });
      }

      console.log(`Payment confirmed for ${orderCode}, amount: ${amount}`);
      return res.json({ success: true, updated: true, orderCode });
    } catch (error: any) {
      console.error('Webhook processing error:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting Vite in middleware mode...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite middleware mounted.");
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
