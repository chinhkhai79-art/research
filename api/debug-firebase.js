import { setCors } from "../lib/cors.js";

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

    if (!raw) {
      return res.status(500).json({
        success: false,
        error: "Missing FIREBASE_SERVICE_ACCOUNT env",
        hint: "Vào Vercel > Environment Variables > thêm FIREBASE_SERVICE_ACCOUNT rồi Redeploy."
      });
    }

    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch (parseError) {
      return res.status(500).json({
        success: false,
        error: "FIREBASE_SERVICE_ACCOUNT is not valid JSON",
        details: parseError.message
      });
    }

    return res.status(200).json({
      success: true,
      message: "Firebase env exists",
      project_id: parsed.project_id || null,
      client_email: parsed.client_email || null,
      has_private_key: Boolean(parsed.private_key),
      firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID || null
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Debug firebase error",
      stack: error.stack || null
    });
  }
}
