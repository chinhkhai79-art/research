import { db } from "../lib/firebaseAdmin.js";

export default async function handler(req, res) {
  const result = {
    success: false,
    app: "YouTube Niche & Analyze Pro",
    domain: "research.vanthemmo.com",
    checks: {},
    errors: [],
    fixes: []
  };

  try {
    result.checks.hasFirebaseEnv = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);
    result.checks.hasSepayApiKey = Boolean(process.env.SEPAY_API_KEY);
    result.checks.firestoreDatabaseId =
      process.env.FIRESTORE_DATABASE_ID || "not_set";

    if (!result.checks.hasFirebaseEnv) {
      result.errors.push("Missing FIREBASE_SERVICE_ACCOUNT");
      result.fixes.push("Thêm FIREBASE_SERVICE_ACCOUNT vào Vercel Environment Variables.");
    }

    if (!result.checks.hasSepayApiKey) {
      result.errors.push("Missing SEPAY_API_KEY");
      result.fixes.push("Thêm SEPAY_API_KEY = mysecret123 vào Vercel Environment Variables.");
    }

    const testRef = db.collection("_debug").doc("research_connection_test");

    await testRef.set({
      ok: true,
      app: "research",
      updatedAt: new Date().toISOString()
    });

    const snap = await testRef.get();

    result.checks.firestoreWrite = true;
    result.checks.firestoreRead = snap.exists;
    result.success = true;
    result.message = "Firebase Admin + Firestore cho research.vanthemmo.com đang hoạt động tốt.";

    return res.status(200).json(result);
  } catch (error) {
    const msg = error?.message || String(error);

    result.success = false;
    result.error = msg;
    result.errorCode = error?.code || null;
    result.errorName = error?.name || "UnknownError";

    if (msg.includes("5 NOT_FOUND") || String(error?.code).includes("5")) {
      result.fixes.push(
        "Sai Firestore database ID hoặc chưa có database. Kiểm tra FIRESTORE_DATABASE_ID trong Vercel."
      );
    }

    if (msg.includes("Missing FIREBASE_SERVICE_ACCOUNT")) {
      result.fixes.push("Thiếu biến FIREBASE_SERVICE_ACCOUNT trong Vercel.");
    }

    if (msg.includes("private_key")) {
      result.fixes.push("Private key sai định dạng. Kiểm tra JSON service account trong Vercel.");
    }

    return res.status(500).json(result);
  }
}
