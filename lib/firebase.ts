import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import fileFirebaseConfig from '../firebase-applet-config.json';

type FirebaseConfigWithDb = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  firestoreDatabaseId?: string;
};

const env = import.meta.env;
const fallbackConfig = fileFirebaseConfig as FirebaseConfigWithDb;

const clean = (value: unknown) => String(value || '').trim().replace(/^\"|\"$/g, '').replace(/^'|'$/g, '');
const isPlaceholder = (value: string) => {
  const v = value.toLowerCase();
  return !value || v.includes('nhập key') || v.includes('your_') || v.includes('my_') || v.includes('firebase_api_key');
};

const envFirebaseConfig: FirebaseConfigWithDb = {
  apiKey: clean(env.VITE_FIREBASE_API_KEY),
  authDomain: clean(env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: clean(env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: clean(env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: clean(env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: clean(env.VITE_FIREBASE_APP_ID),
  firestoreDatabaseId: clean(env.VITE_FIRESTORE_DATABASE_ID)
};

const hasValidEnvFirebaseConfig = Boolean(
  envFirebaseConfig.apiKey &&
  envFirebaseConfig.apiKey.startsWith('AIza') &&
  envFirebaseConfig.authDomain &&
  envFirebaseConfig.projectId &&
  envFirebaseConfig.appId &&
  !isPlaceholder(String(envFirebaseConfig.apiKey))
);

const baseFirebaseConfig = hasValidEnvFirebaseConfig ? envFirebaseConfig : fallbackConfig;

const firebaseConfig: FirebaseConfigWithDb = {
  apiKey: clean(baseFirebaseConfig.apiKey),
  authDomain: clean(baseFirebaseConfig.authDomain),
  projectId: clean(baseFirebaseConfig.projectId),
  storageBucket: clean(baseFirebaseConfig.storageBucket),
  messagingSenderId: clean(baseFirebaseConfig.messagingSenderId),
  appId: clean(baseFirebaseConfig.appId),
  firestoreDatabaseId: clean(baseFirebaseConfig.firestoreDatabaseId) || '(default)'
};

const firebaseConfigReady = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId &&
  !isPlaceholder(String(firebaseConfig.apiKey))
);

const app = initializeApp(firebaseConfig as any);

// Firebase chỉ còn dùng cho Authentication. Dữ liệu app/admin/thanh toán dùng Supabase/Postgres trên Vercel, không dùng Firestore client.
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export const loginWithGoogle = async () => {
  if (!firebaseConfigReady) {
    throw new Error(
      'Firebase login chưa có cấu hình hợp lệ. Hãy đặt VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID và VITE_FIREBASE_APP_ID trong Vercel Environment Variables, rồi redeploy. Đây là Firebase web config cho đăng nhập Google, không phải Gemini API key hoặc YouTube API key.'
    );
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Error signing in with Google:', error);
    console.error('Firebase config used:', {
      projectId: firebaseConfig.projectId,
      authDomain: firebaseConfig.authDomain,
      appId: firebaseConfig.appId,
      hasApiKey: Boolean(firebaseConfig.apiKey && !isPlaceholder(String(firebaseConfig.apiKey))),
      usingEnvConfig: hasValidEnvFirebaseConfig
    });
    throw error;
  }
};

export const logoutUser = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};
