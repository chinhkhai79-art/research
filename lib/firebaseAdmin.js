import admin from "firebase-admin";

function parseServiceAccount(raw) {
  if (!raw) return null;
  try {
    const trimmed = String(raw).trim();
    const json = trimmed.startsWith('{') ? trimmed : Buffer.from(trimmed, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    if (parsed.private_key) parsed.private_key = String(parsed.private_key).replace(/\\n/g, '\n');
    return parsed;
  } catch (error) {
    console.error('FIREBASE_SERVICE_ACCOUNT parse error:', error?.message || error);
    return null;
  }
}

const serviceAccount = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '');

if (!admin.apps.length) {
  if (serviceAccount) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else {
    admin.initializeApp();
  }
}

// Firebase Admin chỉ giữ lại cho các tác vụ Authentication nếu cần sau này.
// Dữ liệu app/admin/thanh toán/logs/settings đã chuyển sang Supabase/Postgres.
export const authAdmin = admin.auth();
export default admin;
