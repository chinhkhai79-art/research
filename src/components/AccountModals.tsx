import React, { useState } from 'react';
import { 
  X, 
  Mail, 
  Lock, 
  User as UserIcon, 
  ArrowRight, 
  Loader2, 
  AlertCircle,
  CreditCard,
  CheckCircle2,
  Zap,
  Star,
  ShieldCheck,
  Copy,
  Check,
  Eye,
  EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc, Timestamp, collection, addDoc, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import toast from 'react-hot-toast';

import { UserProfile } from '../hooks/useAuth';
import { useEffect } from 'react';

// --- Constants ---
const API_BASE_URL = ""; // Empty to use current origin in AIS environment

export const PACKAGES = [
  { 
    id: '1m', 
    name: 'Gói 1 Tháng', 
    price: 10000, 
    displayPrice: '10k', 
    months: 1,
    duration: '30 ngày sử dụng',
    badge: 'Cơ bản',
    features: ['Toàn bộ tính năng AI', 'Cập nhật trọn đời', 'Hỗ trợ 24/7']
  },
  { 
    id: '3m', 
    name: 'Gói 3 Tháng', 
    price: 180000, 
    displayPrice: '180k', 
    months: 3,
    duration: '90 ngày sử dụng',
    badge: 'Phổ biến',
    features: ['Toàn bộ tính năng AI', 'Cập nhật trọn đời', 'Hỗ trợ 24/7']
  },
  { 
    id: '6m', 
    name: 'Gói 6 Tháng', 
    price: 300000, 
    displayPrice: '300k', 
    months: 6,
    duration: '180 ngày sử dụng',
    badge: 'Tiết kiệm 10%',
    features: ['Toàn bộ tính năng AI', 'Cập nhật trọn đời', 'Hỗ trợ Ưu tiên', 'Nhiều máy tính']
  },
  { 
    id: '1y', 
    name: 'Gói 1 Năm', 
    price: 500000, 
    displayPrice: '500k', 
    months: 12,
    duration: '365 ngày sử dụng',
    badge: 'Tốt nhất',
    features: ['Toàn bộ tính năng AI', 'Cập nhật trọn đời', 'Hỗ trợ VIP', 'Tất cả nền tảng']
  },
];

const BANK_INFO = {
  name: 'ACB',
  acc: '13131447',
  owner: 'LE VAN RESEARCH'
};

// --- Helpers ---
export enum OperationType {
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
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  toast.error('Lỗi hệ thống: Vui lòng thử lại sau hoặc liên hệ hỗ trợ.');
  throw new Error(JSON.stringify(errInfo));
}

// --- Auth Portal (Integrated Login & Payment) ---

export const AuthPortal = ({ 
  isOpen, 
  onClose, 
  user,
  profile,
  initialView = 'login'
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  user: any, 
  profile: UserProfile | null,
  initialView?: 'login' | 'packages' | 'payment'
}) => {
  const [view, setView] = useState<'packages' | 'payment'>(initialView === 'login' ? 'packages' : (initialView as any));
  const [paymentData, setPaymentData] = useState<any>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'checking' | 'success' | 'error' | 'not_matched'>('idle');

  // Sync view when initialView changes or portal opens
  useEffect(() => {
    if (isOpen) {
      if (initialView === 'login') {
        setView('packages');
      } else {
        setView(initialView as any);
      }
    }
  }, [isOpen, initialView]);

  // Polling for payment status
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (view === 'payment' && paymentData?.orderCode && paymentStatus !== 'success') {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/payment-status?orderCode=${paymentData.orderCode}`);
          if (!res.ok) return;
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const data = await res.json();
            if (data.paid) {
              setPaymentStatus('success');
              clearInterval(interval);
            }
          }
        } catch (e) {
          console.error("Polling error:", e);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [view, paymentData, paymentStatus]);

  const isPremiumStatus = profile?.account_type === 'premium' || profile?.premium;

  useEffect(() => {
    if (isPremiumStatus && isOpen && view === 'payment' && paymentStatus === 'success') {
      toast.success('Nâng cấp Premium thành công! Chào mừng bạn đến với YouTube Niche & Analyze Pro.', {
        duration: 5000,
        icon: '🚀'
      });
      setTimeout(() => onClose(), 2000);
    }
  }, [isPremiumStatus, view, isOpen, onClose, paymentStatus]);

  const [loading, setLoading] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState(PACKAGES[2]);
  const [zaloPhone, setZaloPhone] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [copied, setCopied] = useState<'stk'|'content'|null>(null);
  const [testingWebhook, setTestingWebhook] = useState(false);

  // Sync email when user changes
  useEffect(() => {
    if (user?.email) setEmail(user.email);
  }, [user]);

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      const userRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(userRef);
      
      if (!docSnap.exists()) {
        const shortId = Math.floor(100000 + Math.random() * 900000).toString();
        const trialDuration = 24 * 60 * 60 * 1000;
        const trialEnd = new Date(Date.now() + trialDuration);
        
        await setDoc(userRef, {
          fullname: user.displayName || 'Người dùng Google',
          email: user.email,
          account_type: 'trial',
          trial_end: Timestamp.fromDate(trialEnd),
          short_id: shortId,
          created_at: serverTimestamp(),
          is_google: true
        });
      }
      toast.success('Đăng nhập Google thành công!');
      setLoading(false);
    } catch (error: any) {
      console.error(error);
      toast.error('Lỗi đăng nhập Google: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, type: 'stk'|'content') => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
    toast.success('Đã sao chép!');
  };

  const handleCreatePayment = async () => {
    if (!user) {
      toast.error('Vui lòng đăng nhập Google trước khi thực hiện thanh toán.');
      return;
    }

    if (!email || !email.includes("@")) {
      toast.error("Vui lòng nhập Gmail hợp lệ.");
      return;
    }

    if (!zaloPhone || zaloPhone.trim().length < 4) {
      toast.error("Vui lòng nhập số điện thoại Zalo.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/create-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim() || user.email,
          phone: zaloPhone.trim(),
          packageId: selectedPkg.id,
          userId: user.uid
        })
      });
      
      let data = null;
      try {
        data = await res.json();
      } catch (error) {
        setLoading(false);
        toast.error("API create-payment không trả về JSON hợp lệ.");
        return;
      }

      if (!res.ok || !data.success) {
        setLoading(false);
        toast.error(data.message || data.error || "Không tạo được mã thanh toán.");
        return;
      }

      setPaymentData(data);
      setView('payment');
      setPaymentStatus('idle');
    } catch (e: any) {
      console.error("CREATE PAYMENT ERROR:", e);
      toast.error('Lỗi kết nối API: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const testSepayWebhook = async () => {
    toast('Đây là tính năng kỹ thuật.', { icon: 'ℹ️' });
    try {
      setTestingWebhook(true);
      await fetch(`${API_BASE_URL}/api/sepay-webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Apikey mysecret123",
        },
        body: JSON.stringify({
          gateway: "ACB",
          transactionDate: new Date().toISOString(),
          accountNumber: "13131447",
          content: paymentData?.orderCode || `RESEARCH_TEST`,
          transferType: "in",
          transferAmount: selectedPkg.price,
          id: Math.floor(Math.random() * 100000000),
        }),
      });
      toast.success('Đã gửi webhook test.');
    } catch (error: any) {
      toast.error('Lỗi kết nối webhook test.');
    } finally {
      setTestingWebhook(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-6 bg-slate-950/90 backdrop-blur-xl overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-[#121a25] border border-slate-700/50 rounded-[32px] shadow-3xl w-full max-w-md overflow-hidden relative"
      >
        <button onClick={onClose} className="absolute top-6 right-6 p-2 text-slate-500 hover:text-white transition-colors z-[10]">
          <X size={24} />
        </button>

        <div className="p-10 space-y-8">
          {view === 'packages' && (
            <div className="space-y-7">
              <div className="text-center space-y-2">
                <h3 className="text-3xl font-black text-white tracking-tight uppercase">Thông tin của bạn</h3>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest leading-none">Chọn gói dịch vụ và nhập thông tin</p>
              </div>

              {!user && (
                <div className="bg-orange-500/10 border border-orange-500/50 p-6 rounded-2xl space-y-4 shadow-lg shadow-orange-500/10">
                   <div className="space-y-1 text-center">
                    <p className="text-white font-black text-sm uppercase tracking-tight">Yêu cầu đăng nhập</p>
                    <p className="text-slate-400 text-[10px] uppercase font-bold">Bạn cần đăng nhập Google để kích hoạt Premium</p>
                  </div>
                  <button 
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="w-full bg-white text-slate-900 font-black py-4 rounded-xl flex items-center justify-center gap-3 hover:bg-slate-100 transition-all active:scale-95 shadow-xl"
                  >
                    <img src="https://www.google.com/favicon.ico" alt="google" className="w-5 h-5" />
                    <span className="text-sm tracking-tight text-slate-800">Đăng nhập tài khoản Google</span>
                  </button>
                </div>
              )}

              <div className="space-y-3">
                {PACKAGES.map(pkg => (
                  <button
                    key={pkg.id}
                    onClick={() => setSelectedPkg(pkg)}
                    className={`w-full p-5 rounded-2xl border-2 flex items-center justify-between transition-all relative ${
                      selectedPkg.id === pkg.id 
                        ? 'bg-cyan-500/10 border-cyan-500 shadow-[0_0_25px_rgba(6,182,212,0.2)]' 
                        : 'bg-[#1e293b] border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selectedPkg.id === pkg.id ? 'border-cyan-500 bg-cyan-500 ring-4 ring-cyan-500/20' : 'border-slate-600'}`}>
                        {selectedPkg.id === pkg.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <span className={`font-black text-sm uppercase tracking-tight transition-colors ${selectedPkg.id === pkg.id ? 'text-white' : 'text-slate-400'}`}>{pkg.name}</span>
                    </div>
                    <span className={`font-black text-sm tracking-tight transition-colors ${selectedPkg.id === pkg.id ? 'text-cyan-400' : 'text-slate-400'}`}>{pkg.displayPrice}</span>
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] pl-1">Địa chỉ Gmail (Bắt buộc)</label>
                  <input 
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Nhập Gmail nhận tài khoản..."
                    className="w-full bg-[#1e293b] border border-slate-700 rounded-xl py-4 px-6 text-white text-sm font-bold outline-none focus:border-cyan-500 transition-all shadow-inner"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] pl-1">Số điện thoại có Zalo (Bắt buộc)</label>
                  <input 
                    type="tel"
                    value={zaloPhone}
                    onChange={(e) => setZaloPhone(e.target.value)}
                    placeholder="Nhập số điện thoại của bạn"
                    className="w-full bg-[#1e293b] border border-slate-700 rounded-xl py-4 px-6 text-white text-sm font-bold outline-none focus:border-cyan-500 transition-all shadow-inner"
                  />
                  <p className="text-[10px] text-slate-500 font-bold leading-relaxed pl-1 italic">Mục đích để hỗ trợ bạn.</p>
                </div>
              </div>

              <button 
                onClick={handleCreatePayment}
                disabled={!email || !zaloPhone || loading}
                className="w-full bg-cyan-500 text-white font-black uppercase tracking-widest py-4.5 rounded-xl hover:bg-cyan-400 transition-all shadow-2xl shadow-cyan-500/30 active:scale-95 disabled:opacity-30 disabled:grayscale flex items-center justify-center gap-2"
              >
                {loading && <Loader2 size={20} className="animate-spin" />}
                Tiếp tục Thanh Toán
              </button>

              <button onClick={onClose} className="w-full text-center text-[10px] font-black text-slate-500 uppercase hover:text-slate-300 transition-colors tracking-widest">
                Đóng cửa sổ
              </button>
            </div>
          )}

          {view === 'payment' && (
            <div className="space-y-6">
               <div className="text-center space-y-2">
                {isPremiumStatus ? (
                  <>
                    <h3 className="text-2xl font-black text-green-400 tracking-tight uppercase">Thành công!</h3>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest leading-none">Tài khoản đã được nâng cấp Premium</p>
                  </>
                ) : (
                  <>
                    <h3 className="text-2xl font-black text-white tracking-tight uppercase">Thanh toán</h3>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest leading-none">Quét mã QR để nâng cấp Premium</p>
                  </>
                )}
              </div>

              {!isPremiumStatus && (
                <div className="bg-white p-5 rounded-[40px] shadow-3xl flex flex-col items-center">
                  <div className="aspect-square w-full max-w-[200px] bg-white rounded-2xl flex items-center justify-center overflow-hidden mb-4 p-2">
                    <img src={paymentData?.qrUrl} alt="Bank QR" className="w-full h-full object-contain" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-2xl font-black text-slate-900 leading-none">{selectedPkg.price.toLocaleString('vi-VN')} đ</p>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Số tiền cần chuyển khoản</p>
                  </div>
                </div>
              )}

              {isPremiumStatus ? (
                <div className="py-8">
                  <button 
                    onClick={onClose}
                    className="w-full bg-green-500 text-white font-black uppercase tracking-widest py-4.5 rounded-xl hover:bg-green-400 transition-all shadow-2xl shadow-green-500/30 active:scale-95"
                  >
                    Bắt đầu sử dụng ngay
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <div className="p-4 bg-slate-800/40 rounded-2xl border border-slate-700/50">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1 shadow-sm">Cú pháp chuyển khoản</p>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-black text-white">{paymentData?.orderCode}</p>
                        <button onClick={() => copyToClipboard(paymentData?.orderCode, 'content')} className="p-1.5 hover:bg-slate-700 rounded-lg text-cyan-400">
                          {copied === 'content' ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-800/40 rounded-2xl border border-slate-700/50">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1 shadow-sm">Thụ hưởng</p>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-black text-white">{BANK_INFO.acc}</p>
                          <p className="text-[9px] font-bold text-slate-500 uppercase">{BANK_INFO.name} - {BANK_INFO.owner}</p>
                        </div>
                        <button onClick={() => copyToClipboard(BANK_INFO.acc, 'stk')} className="p-1.5 hover:bg-slate-700 rounded-lg text-cyan-400">
                          {copied === 'stk' ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-4 w-full mt-4">
                    <div className="flex flex-col items-center p-6 bg-[#1a2b3c] border border-slate-700/50 rounded-2xl w-full">
                      {paymentStatus === 'success' ? (
                        <div className="flex flex-col items-center gap-3 text-emerald-400 mb-2">
                          <CheckCircle2 size={40} className="mb-2" />
                          <span className="font-black uppercase tracking-widest text-lg">THÀNH CÔNG!</span>
                          <p className="text-sm font-bold text-center">Tài khoản đã được nâng cấp Premium.</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-3 text-cyan-400 mb-2">
                          <Loader2 className="animate-spin" size={20} />
                          <span className="font-black uppercase tracking-widest text-sm">Đang chờ thanh toán tự động</span>
                        </div>
                      )}
                    </div>

                    {paymentStatus !== 'success' && (
                      <button 
                        onClick={testSepayWebhook}
                        disabled={testingWebhook}
                        className="w-full py-3 px-4 border border-cyan-500/30 bg-cyan-500/5 rounded-xl text-cyan-400 text-[10px] font-black uppercase tracking-widest hover:bg-cyan-500/10 transition-all flex items-center justify-center gap-2"
                      >
                        {testingWebhook ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                        Test kỹ thuật Webhook
                      </button>
                    )}
                  </div>

                  <button onClick={() => setView('packages')} className="w-full text-center text-[10px] font-black text-slate-500 uppercase hover:text-slate-300 transition-colors tracking-widest pt-2">
                    Thay đổi gói dịch vụ
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// Placeholder modals to avoid missing components when used elsewhere
export const LoginModal = ({ isOpen, onClose, onSwitch }: any) => null;
export const RegisterModal = ({ isOpen, onClose, onSwitch }: any) => null;
export const PaymentModal = ({ isOpen, onClose, userId, userEmail, profile }: any) => null;
