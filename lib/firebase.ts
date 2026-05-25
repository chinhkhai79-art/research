import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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

const clean = (value: unknown) => String(value || '').trim();
const isPlaceholder = (value: string) => {
  const v = value.toLowerCase();
  return !value || v.includes('nhập key') || v.includes('your_') || v.includes('my_') || v.includes('firebase_api_key');
};

const firebaseConfig: FirebaseConfigWithDb = {
  apiKey: clean(env.VITE_FIREBASE_API_KEY) || clean(fallbackConfig.apiKey),
  authDomain: clean(env.VITE_FIREBASE_AUTH_DOMAIN) || clean(fallbackConfig.authDomain),
  projectId: clean(env.VITE_FIREBASE_PROJECT_ID) || clean(fallbackConfig.projectId),
  storageBucket: clean(env.VITE_FIREBASE_STORAGE_BUCKET) || clean(fallbackConfig.storageBucket),
  messagingSenderId: clean(env.VITE_FIREBASE_MESSAGING_SENDER_ID) || clean(fallbackConfig.messagingSenderId),
  appId: clean(env.VITE_FIREBASE_APP_ID) || clean(fallbackConfig.appId),
  firestoreDatabaseId: clean(env.VITE_FIRESTORE_DATABASE_ID) || clean(fallbackConfig.firestoreDatabaseId) || '(default)'
};

const firebaseConfigReady = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId &&
  !isPlaceholder(String(firebaseConfig.apiKey))
);

const app = initializeApp(firebaseConfig as any);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');
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
      hasApiKey: Boolean(firebaseConfig.apiKey && !isPlaceholder(String(firebaseConfig.apiKey)))
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
