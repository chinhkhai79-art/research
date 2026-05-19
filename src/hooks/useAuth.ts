import { useState, useEffect } from 'react';
import { onAuthStateChanged, User, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export interface UserProfile {
  uid: string;
  fullname: string;
  email: string;
  account_type: 'trial' | 'premium';
  trial_start: any;
  trial_end: any;
  expired_at: any;
  created_at: any;
  short_id?: string;
  contact_phone?: string;
  premium?: boolean;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (user) {
        // Listen to profile updates
        const userRef = doc(db, 'users', user.uid);
        
        try {
          // Initial check and creation if needed
          const docSnap = await getDoc(userRef);
          if (!docSnap.exists() || !docSnap.data()?.short_id || !docSnap.data()?.trial_end) {
            const shortId = Math.floor(100000 + Math.random() * 900000).toString();
            // Default 24h trial for new users
            const trialDuration = 24 * 60 * 60 * 1000;
            const trialEnd = new Date(Date.now() + trialDuration);

            await setDoc(userRef, {
              uid: user.uid,
              fullname: user.displayName || 'User',
              email: user.email || '',
              account_type: 'trial',
              trial_end: Timestamp.fromDate(trialEnd),
              created_at: serverTimestamp(),
              short_id: shortId,
              ...docSnap.data()
            }, { merge: true });
          }

          unsubProfile = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
              setProfile({ uid: user.uid, ...docSnap.data() } as UserProfile);
            } else {
              setProfile(null);
            }
            setLoading(false);
          }, (error) => {
            handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
          });

          // Explicit server-side subscription check on load/refresh
          const checkSub = async () => {
            try {
              console.log("[Auth] Checking subscription for:", user.uid);
              const res = await fetch(`/api/me/subscription?userId=${user.uid}`);
              console.log("[Auth] Check sub response status:", res.status);
              
              if (!res.ok) {
                console.warn("[Auth] Server subscription check failed:", res.status);
                return;
              }
              const contentType = res.headers.get("content-type");
              console.log("[Auth] Content-Type:", contentType);
              
              if (contentType && contentType.includes("application/json")) {
                const data = await res.json();
                if (data.success && data.accountType) {
                  console.log("[Auth] Server subscription check success:", data);
                }
              } else {
                const text = await res.text();
                console.warn("[Auth] Server subscription check returned non-JSON (HTML/Text):", text.slice(0, 200));
              }
            } catch (e) {
              console.error("[Auth] Failed to check sub with server:", e);
            }
          };
          checkSub();
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
        }
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    return signInWithPopup(auth, provider);
  };

  const logout = () => signOut(auth);

  const isTrialActive = () => {
    if (!profile) return false;
    if (profile.account_type === 'premium') return false;
    if (profile.trial_end) {
      try {
        const end = typeof profile.trial_end.toDate === 'function'
          ? profile.trial_end.toDate()
          : new Date(profile.trial_end);
        return new Date() < end;
      } catch (e) {
        return false;
      }
    }
    return false;
  };

  const isPremium = () => {
    if (!profile) return false;
    if (profile.account_type === 'premium' || profile.premium) {
      if (profile.expired_at) {
        try {
          const expired = typeof profile.expired_at.toDate === 'function'
            ? profile.expired_at.toDate()
            : new Date(profile.expired_at);
          return new Date() < expired;
        } catch (e) {
          return true; // Default to true if we can't parse but they are premium
        }
      }
      return true;
    }
    return false;
  };

  const isValidUser = () => {
    if (!user) return false;
    if (isPremium()) return true;
    return isTrialActive();
  };

  const getRemainingTrialTime = () => {
    if (!profile?.trial_end) return null;
    try {
      const end = typeof profile.trial_end.toDate === 'function'
        ? profile.trial_end.toDate()
        : new Date(profile.trial_end);
      const now = new Date();
      const diff = end.getTime() - now.getTime();
      if (diff <= 0) return 0;
      return Math.floor(diff / (1000 * 60 * 60)); // hours
    } catch (e) {
      return null;
    }
  };

  const getRemainingTimeVerbose = () => {
    const targetDate = profile?.account_type === 'premium' ? profile.expired_at : profile?.trial_end;
    if (!targetDate) return null;

    try {
      const end = typeof targetDate.toDate === 'function' ? targetDate.toDate() : new Date(targetDate);
      const now = new Date();
      const diff = end.getTime() - now.getTime();

      if (diff <= 0) return { totalDays: 0, text: 'Hết hạn' };

      const totalDays = Math.floor(diff / (1000 * 60 * 60 * 24));
      const years = Math.floor(totalDays / 365);
      const remainingDaysAfterYears = totalDays % 365;
      const months = Math.floor(remainingDaysAfterYears / 30);
      const days = remainingDaysAfterYears % 30;

      let parts = [];
      if (years > 0) parts.push(`${years} năm`);
      if (months > 0) parts.push(`${months} tháng`);
      if (days > 0 || parts.length === 0) parts.push(`${days} ngày`);

      return {
        totalDays,
        years,
        months,
        days,
        text: parts.join(' ')
      };
    } catch (e) {
      return null;
    }
  };

  return { 
    user, 
    profile, 
    loading, 
    loginWithGoogle,
    logout,
    isTrialActive, 
    isPremium, 
    isValidUser, 
    getRemainingTrialTime, 
    getRemainingTimeVerbose 
  };
}
