import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const rawBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  if (!raw && !rawBase64) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT env");
  }

  let text = raw;
  if (!text && rawBase64) {
    try {
      text = Buffer.from(String(rawBase64).trim(), "base64").toString("utf8");
    } catch (error) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 is not valid base64: " + error.message);
    }
  }

  let serviceAccount;

  try {
    serviceAccount = JSON.parse(text);
  } catch (error) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON: " + error.message);
  }

  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }

  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT thiếu project_id, client_email hoặc private_key");
  }

  return serviceAccount;
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(parseServiceAccount())
  });
}

const databaseId =
  process.env.FIRESTORE_DATABASE_ID ||
  "(default)";

export const db = getFirestore(admin.app(), databaseId);
export const authAdmin = admin.auth(admin.app());
export const FieldValue = admin.firestore.FieldValue;
export const Timestamp = admin.firestore.Timestamp;
