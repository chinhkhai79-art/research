import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!raw) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT env");
  }

  const serviceAccount = JSON.parse(raw);

  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }

  return serviceAccount;
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(getServiceAccount())
  });
}

const databaseId =
  process.env.FIRESTORE_DATABASE_ID ||
  "ai-studio-241ae1a0-0ccd-40dd-9fe0-8cb4a56c0c29";

export const db = getFirestore(admin.app(), databaseId);
export const FieldValue = admin.firestore.FieldValue;
export const Timestamp = admin.firestore.Timestamp;
