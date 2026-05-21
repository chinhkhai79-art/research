async function getFirestoreDb() {
  const mod = await import('./firebaseAdmin.js');
  if (mod.db) return mod.db;
  if (mod.adminDb) return mod.adminDb;
  if (mod.firestore) return mod.firestore;
  if (mod.admin?.firestore) return mod.admin.firestore();
  if (mod.default?.db) return mod.default.db;
  if (mod.default?.adminDb) return mod.default.adminDb;
  if (mod.default?.admin?.firestore) return mod.default.admin.firestore();
  throw new Error('Không tìm thấy Firestore db trong lib/firebaseAdmin.js. Hãy export db hoặc adminDb.');
}

function clean(obj) {
  return JSON.parse(JSON.stringify(obj, (k, v) => v === undefined ? null : v));
}

export async function getAppSettings() {
  const db = await getFirestoreDb();
  const snap = await db.collection('app_settings').doc('admin_settings').get();
  if (!snap.exists) {
    return {
      sepay: {
        bankOwner: 'LE VAN KHAI',
        bankName: 'ACB',
        bankAccount: '13131447',
        paymentPrefix: 'RESEARCH',
        appBaseUrl: 'https://research.vanthemmo.com',
        webhookUrl: 'https://research.vanthemmo.com/api/sepay-webhook',
        plans: [
          { id: '3m', name: 'Gói 3 tháng', amount: 180000, days: 90 },
          { id: '6m', name: 'Gói 6 tháng', amount: 300000, days: 180 },
          { id: '1y', name: 'Gói 1 năm', amount: 500000, days: 365 }
        ]
      },
      smtp: {
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        fromName: 'Văn Thế Web',
        baseUrl: 'https://research.vanthemmo.com'
      }
    };
  }
  return snap.data() || {};
}

export async function saveAppSettings(next) {
  const db = await getFirestoreDb();
  const current = await getAppSettings();
  const merged = {
    ...current,
    sepay: { ...(current.sepay || {}), ...(next.sepay || {}) },
    smtp: { ...(current.smtp || {}), ...(next.smtp || {}) },
    updatedAt: new Date().toISOString()
  };
  if (!next.sepay?.webhookSecret) merged.sepay.webhookSecret = current.sepay?.webhookSecret || '';
  if (!next.smtp?.pass) merged.smtp.pass = current.smtp?.pass || '';
  await db.collection('app_settings').doc('admin_settings').set(clean(merged), { merge: true });
  return merged;
}

export function publicSafeSettings(settings) {
<<<<<<< HEAD
  // Endpoint /api/admin-settings đã bắt buộc mật khẩu quản trị, nên trả về full cấu hình
  // để trang admin có thể hiển thị lại Webhook Secret SePay và SMTP App Password đã lưu.
  // Không dùng hàm này cho endpoint công khai /api/payment-config.
  const s = mergeAliases(settings || {});
  return {
    sepay: { ...(s.sepay || {}) },
    payment: { ...(s.payment || {}) },
    smtp: { ...(s.smtp || {}) },
=======
  const s = settings || {};
  return {
    sepay: { ...(s.sepay || {}), webhookSecret: s.sepay?.webhookSecret ? '********' : '' },
    smtp: { ...(s.smtp || {}), pass: s.smtp?.pass ? '********' : '' },
>>>>>>> parent of ec7ddce (smtp)
    updatedAt: s.updatedAt || null
  };
}

export function publicPaymentConfig(settings) {
  const sepay = settings?.sepay || {};
  return {
    success: true,
    bankOwner: sepay.bankOwner || '',
    bankName: sepay.bankName || 'ACB',
    bankAccount: sepay.bankAccount || '',
    paymentPrefix: sepay.paymentPrefix || 'RESEARCH',
    appBaseUrl: sepay.appBaseUrl || '',
    plans: sepay.plans || []
  };
}

export function requireAdminPassword(inputPassword) {
  const expected = process.env.ADMIN_SETTINGS_PASSWORD || process.env.ADMIN_PASSWORD || '';
  if (!expected) throw new Error('Thiếu biến môi trường ADMIN_SETTINGS_PASSWORD trên Vercel.');
  if (!inputPassword || inputPassword !== expected) {
    const err = new Error('Sai mật khẩu quản trị.');
    err.statusCode = 401;
    throw err;
  }
}
