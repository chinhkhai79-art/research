/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, 
  BarChart2, 
  UserRoundSearch, 
  Save, 
  Play, 
  Download, 
  Trash2, 
  StopCircle, 
  ExternalLink, 
  Copy, 
  PlusCircle, 
  MonitorPlay,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  XCircle,
  X,
  Video,
  TrendingUp,
  ThumbsUp,
  MessageCircle,
  FileText,
  FileJson,
  Image,
  Star,
  Link2,
  Loader2,
  Eye,
  EyeOff,
  Clock,
  FolderHeart,
  Users,
  Settings,
  AlignLeft,
  Tag,
  Zap,
  MessageSquare,
  Pin,
  FolderClock,
  History as HistoryIcon,
  Home,
  LayoutGrid,
  BarChart3,
  Smartphone,
  ChevronRight,
  Filter,
  Bot,
  Flame,
  RefreshCw,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import Markdown from 'react-markdown';
import { LogOut, LogIn, Crown } from 'lucide-react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, loginWithGoogle, logoutUser } from './lib/firebase';

// --- Types ---
interface YouTubeConfig {
  apiKeys: string[];
  keyword: string;
  regions: string[];
  region: string; // Keep for backward compatibility or direct use
  publishedAfter: string;
  maxVideos: number;
  minSub: number;
  maxSub: number;
  minVideo: number;
  maxVideo: number;
  minViews: number;
  autoNiche: boolean;
}

interface ChannelResult {
  icon: string;
  name: string;
  id: string;
  url: string;
  country: string;
  publishedAt: string;
  age: number;
  subs: number;
  views: number;
  videos: number;
  score: string;
  keywordTitle: string;
  lastVideoId?: string; // Add this
}

interface KeywordIdea {
  text: string;
  competition: string;
  score: string;
  status: 'idle' | 'scanning' | 'done';
}

interface TrackingChannel {
  id: string;
  name: string;
  icon?: string;
  history: Array<{
    date: string;
    subs: number;
    views: number;
    videos: number;
  }>;
}

// --- Components ---
const LinkifyText = ({ text }: { text: string }) => {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return (
    <>
      {parts.map((part, i) => 
        urlRegex.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:underline"
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </>
  );
};

interface SpyResult {
  channelInfo: any;
  videos: any[];
  report: string;
  recentAnalyzed?: string;
  avgViewsPerDay?: number;
  maxViewsPerDay?: number;
  topTags?: any[];
  topKeywords?: any[];
}

interface SavedSpyReport {
  id: string;
  name: string;
  date: string;
  report: string;
}


interface SubscriptionInfo {
  success: boolean;
  active: boolean;
  premium: boolean;
  accountType: 'trial' | 'premium' | 'expired' | 'none' | string;
  plan?: string | null;
  planId?: string | null;
  planName?: string | null;
  startedAt?: string | null;
  expiresAt?: string | null;
  remainingMs?: number;
  remainingText?: string;
  userId?: string;
}

// --- Constants ---
const DEFAULT_CONFIG: YouTubeConfig = {
  apiKeys: [],
  keyword: '',
  regions: ['VN'],
  region: 'VN',
  publishedAfter: 'week',
  maxVideos: 30,
  minSub: 0,
  maxSub: 100000,
  minVideo: 1,
  maxVideo: 0,
  minViews: 10000,
  autoNiche: true,
};

const REGIONS = [
  { code: '', name: 'Toàn cầu (Global)' },
  { code: 'VN', name: 'Việt Nam' },
  { code: 'US', name: 'Hoa Kỳ (Mỹ)' },
  { code: 'GB', name: 'Vương quốc Anh' },
  { code: 'IN', name: 'Ấn Độ' },
  { code: 'JP', name: 'Nhật Bản' },
  { code: 'KR', name: 'Hàn Quốc' },
  { code: 'TH', name: 'Thái Lan' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'PH', name: 'Philippines' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'SG', name: 'Singapore' },
  { code: 'DE', name: 'Đức' },
  { code: 'FR', name: 'Pháp' },
  { code: 'RU', name: 'Nga' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'AU', name: 'Úc' },
  { code: 'CA', name: 'Canada' },
  { code: 'ES', name: 'Tây Ban Nha' },
  { code: 'IT', name: 'Ý (Italia)' },
];

const GEMINI_MODELS = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash — Khuyên dùng: ổn định, mạnh, phù hợp phân tích video/kênh.' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite — Nhẹ hơn 2.5 Flash, tiết kiệm quota hơn.' },
  { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash-Lite Preview — Model mới, nhanh, dùng khi key/project có hỗ trợ.' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview — Model mới, mạnh hơn, phù hợp phân tích sâu khi được hỗ trợ.' },
  { id: 'gemini-flash-latest', name: 'Gemini Flash Latest — Alias tự động của Google, dùng khi project hỗ trợ alias latest.' },
  { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite — Dự phòng nếu key/project còn hỗ trợ.' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash — Dự phòng nếu key/project còn hỗ trợ.' },
];

const SUGGESTED_NICHES = [
  { category: 'PHÁT TRIỂN BẢN THÂN', items: ['vượt qua sự trì hoãn', 'cách rèn luyện thói quen tốt', 'xây dựng sự tự tin', 'luật hấp dẫn trong thực tế', 'cách đọc sách hiệu quả', 'thiền định cho người mới', 'tìm kiếm đam mê bản thân', 'đối phó với áp lực công việc', 'kỹ năng giao tiếp ứng xử', 'vlog năng suất'] },
  { category: 'SỨC KHỎE & LÀM ĐẸP', items: ['giảm cân tự nhiên', 'yoga tại nhà', 'skincare cho người mới', 'chăm sóc tóc hói', 'bài tập mông tại nhà', 'thực đơn eat clean', 'mẹo trang điểm đi tiệc', 'điều trị mụn lưng', 'massage mặt chống lão hóa', 'chăm sóc da nhạy cảm'] },
  { category: 'CÔNG NGHỆ & AI', items: ['review điện thoại giá rẻ', 'hướng dẫn dùng ChatGPT', 'cách tạo ảnh bằng Midjourney', 'mẹo dùng iPhone', 'build PC giá rẻ', 'review tai nghe không dây', 'ứng dụng AI trong học tập', 'so sánh phần mềm edit video', 'cách làm website cơ bản', 'tự động hóa công việc bằng AI'] },
  { category: 'GIÁO DỤC & HỌC TẬP', items: ['học tiếng Anh giao tiếp', 'phương pháp tự học hiệu quả', 'từ vựng IELTS theo chủ đề', 'mẹo ôn thi đại học', 'học lập trình python', 'cải thiện kỹ năng thuyết trình', 'review sách self-help', 'học tiếng Trung cơ bản', 'cách ghi chép thông minh', 'quản lý thời gian học tập'] },
  { category: 'ẨM THỰC & NẤU ĂN', items: ['nấu ăn sinh viên', 'chế biến món chay', 'công thức làm bánh không lò', 'decor hộp cơm bento', 'các món ăn sáng nhanh', 'review quán ăn vỉa hè', 'cách ướp thịt nướng', 'làm nước ép tại nhà', 'nấu món ăn kiêng', 'pha chế đồ uống mùa hè'] },
  { category: 'DU LỊCH & KHÁM PHÁ', items: ['du lịch phượt xe máy', 'review homestay Đà Lạt', 'cẩm nang du lịch Phú Quốc', 'kinh nghiệm xin visa du lịch', 'du lịch nước ngoài giá rẻ', 'khám phá ẩm thực địa phương', 'review dụng cụ cắm trại', 'du lịch một mình cho nữ', 'mẹo săn vé máy bay giá rẻ', 'vlog cắm trại trong rừng'] },
  { category: 'GIẢI TRÍ & HÀI HƯỚC', items: ['phim hài ngắn', 'review phim rạp mới', 'tóm tắt phim anime', 'trò chơi khăm bạn bè (prank)', 'reaction video tiktoker', 'thử thách sinh tồn', 'giải mã bí ẩn thú vị', 'ảo thuật đường phố', 'kể chuyện ma có thật', 'tổng hợp video meme'] },
  { category: 'THỂ THAO & THỂ HÌNH', items: ['bài tập tăng chiều cao', 'cách tăng cơ giảm mỡ', 'kỹ thuật bơi lội cơ bản', 'hướng dẫn chơi cầu lông', 'luật chơi tennis cho người mới', 'home workout không dụng cụ', 'review giày chạy bộ', 'bài tập phục hồi chấn thương', 'phân tích chiến thuật bóng đá', 'dinh dưỡng cho người tập gym'] },
  { category: 'PETS & ĐỘNG VẬT', items: ['cách huấn luyện chó con', 'chế độ ăn cho mèo', 'làm nhà cho thú cưng', 'chữa bệnh thường gặp ở chó', 'review thức ăn hạt cho mèo', 'vlog về chó mèo', 'cách setup hồ thủy sinh', 'chăm sóc bò sát cảnh', 'làm đồ chơi cho mèo', 'bí quyết chọn mua cún cưng'] },
  { category: 'GIA ĐÌNH & ĐỜI SỐNG', items: ['cách nuôi dạy con ngoan', 'mẹo dọn nhà nhanh', 'trang trí phòng ngủ nhỏ', 'vào bếp cùng con', 'sắp xếp tủ quần áo gọn gàng', 'trồng rau ban công', 'tài chính gia đình trẻ', 'làm đồ handmade trang trí', 'review máy hút bụi lau nhà', 'vlog bà mẹ bỉm sữa'] },
  { category: 'NGHỆ THUẬT & SÁNG TẠO', items: ['vẽ tranh phong cảnh', 'cách chụp ảnh bằng điện thoại', 'chơi guitar nhạc trẻ', 'học đệm hát cơ bản', 'làm gốm thủ công tại nhà', 'thiết kế logo bằng canva', 'edit video tiktok bằng capcut', 'luyện viết calligraphy', 'nghệ thuật cắm hoa', 'makeup trang biến hình'] },
  { category: 'CÔNG NGHỆ Ô TÔ & XE MÁY', items: ['review xe máy giá rẻ', 'đánh giá ô tô điện', 'kinh nghiệm mua xe cũ', 'bảo dưỡng xe tay ga', 'độ xe kiểng', 'phượt bằng mô tô', 'học lái xe ô tô B2', 'phụ kiện ô tô cần thiết', 'luật giao thông đường bộ', 'so sánh các dòng xe'] },
  { category: 'TÂM LÝ HỌC & MỐI QUAN HỆ', items: ['tâm lý học thú vị', 'chữa lành tổn thương', 'vượt qua chia tay', 'nghệ thuật quyến rũ', 'nhận biết người độc hại', 'bài test tính cách MBTI', 'cách hiểu tâm lý nam giới', 'giữ lửa hôn nhân', 'kỹ năng lắng nghe thấu cảm', 'tâm lý tội phạm'] },
  { category: 'ESPORTS & GAMING', items: ['highlight liên quân', 'build đồ tft mùa mới', 'review game mobile hay', 'giáo trình valorant', 'mẹo leo rank csgo', 'phân tích meta lol', 'game kinh dị việt nam', 'streamer tiktok', 'thi đấu pubg mobile', 'genshin impact hướng dẫn'] },
  { category: 'HUYỀN BÍ & TÂM LINH', items: ['giải mã những giấc mơ', 'luật nhân quả', 'bí ẩn vũ trụ', 'chuyện rùng rợn có thật', 'bói bài tarot tình yêu', 'phong thủy nhà ở', 'năng lượng luân xa', 'kỳ quan thế giới', 'hiện tượng siêu nhiên', 'câu chuyện tâm linh tuổi thơ'] },
  { category: 'MẸO VẶT CUỘC SỐNG', items: ['mẹo vặt nhà bếp', 'tái chế đồ nhựa', 'sửa chữa đồ điện gia dụng', 'gấp quần áo nhanh', 'làm sạch vết bẩn cứng đầu', 'mẹo bảo quản thực phẩm', 'ứng dụng hữu ích trên điện thoại', 'mẹo chống muỗi tự nhiên', 'sử dụng lò vi sóng', 'mẹo vặt cho sinh viên'] },
  { category: 'VĂN HÓA & LỊCH SỬ', items: ['lịch sử việt nam tóm tắt', 'khám phá các triều đại', 'sự kiện lịch sử thế giới', 'văn hóa người á đông', 'trang phục truyền thống', 'nhân vật lịch sử nổi tiếng', 'chiến tranh thế giới thứ 2', 'văn hóa nhật bản', 'phong tục tập quán việt nam', 'di tích lịch sử hà nội'] },
  { category: 'THỜI TRANG & PHONG CÁCH', items: ['phối đồ cho nam gầy', 'thời trang mùa đông nữ', 'review local brand việt nam', 'cách chọn kính cận phù hợp', 'phong cách vintage', 'mẹo chọn giày sneaker', 'phối đồ đi học đại học', 'xu hướng thời trang 2024', 'thời trang công sở nữ', 'phối đồ với quần ống rộng'] },
  { category: 'NÔNG NGHIỆP CÔNG NGHỆ CAO', items: ['trồng rau thủy canh', 'mô hình nuôi tôm thẻ', 'kỹ thuật trồng sầu riêng', 'nông nghiệp tuần hoàn', 'trồng hoa lan hồ điệp', 'review máy nông nghiệp', 'chăm sóc cây cảnh', 'nông nghiệp hữu cơ', 'nuôi cá bống tượng', 'kỹ thuật ghép cây'] },
  { category: 'REVIEW SẢN PHẨM & UNBOXING', items: ['unboxing đồ shopee', 'review mỹ phẩm thái lan', 'đánh giá đồ ăn vặt trung quốc', 'trải nghiệm tai nghe bluetooth', 'review bàn phím cơ dưới 1 triệu', 'đồ decor phòng giá rẻ', 'review sách hay nên đọc', 'đánh giá smartwatch', 'unboxing đồ công nghệ độc lạ', 'review máy chiếu mini'] },
  { category: 'NHẠC & COVER', items: ['nhạc lofi chill', 'acoustic cover', 'hướng dẫn hát karaoke', 'beat rap free', 'nhạc tiktok remix', 'cover nhạc trẻ', 'nhạc thiền tịnh tâm', 'học thanh nhạc cơ bản', 'nhạc nền không bản quyền', 'nhạc edm sôi động'] },
  { category: 'BẤT ĐỘNG SẢN & NHÀ CỬA', items: ['kinh nghiệm mua căn hộ', 'review nhà phố', 'thiết kế nội thất chung cư', 'phong thủy phòng khách', 'tin tức bất động sản', 'mẫu nhà cấp 4 đẹp', 'hướng dẫn xin giấy phép xây dựng', 'cách định giá nhà đất', 'hợp đồng thuê nhà', 'review đồ nội thất thông minh'] },
  { category: 'CÂU CHUYỆN KHỞI NGHIỆP', items: ['kinh nghiệm mở quán cafe', 'bài học kinh doanh', 'khởi nghiệp ít vốn', 'câu chuyện startup việt', 'chiến lược marketing 0 đồng', 'nghệ thuật bán hàng', 'mở shop quần áo', 'kỹ năng đàm phán', 'quản lý nhân sự', 'ý tưởng kinh doanh 2024'] },
  { category: 'CHUYỆN LẠ BỐN PHƯƠNG', items: ['video thỏa mãn thị giác', 'kỷ lục guinness', 'sinh vật biển kỳ lạ', 'hiện tượng thiên nhiên hiếm gặp', 'người có siêu năng lực', 'khám phá đáy đại dương', 'review ẩm thực độc lạ', 'clip hài hước động vật', 'công trình kiến trúc độc đáo', 'những nơi nguy hiểm nhất'] },
  { category: 'ASMR & MUKBANG', items: ['asmr ăn uống', 'mukbang gà rán', 'asmr gõ phím', 'asmr nấu ăn', 'mukbang hải sản', 'asmr thư giãn giấc ngủ', 'mukbang đồ ăn cay', 'asmr trang điểm', 'asmr âm thanh tự nhiên', 'mukbang ăn vặt trung quốc'] },
  { category: 'XÂY DỰNG & KIẾN TRÚC', items: ['tiến độ thi công', 'kiến trúc cổ đại', 'kỹ thuật chống thấm nhà', 'quá trình xây dựng tòa nhà', 'review xi măng', 'kiến trúc hiện đại việt nam', 'máy xúc đất', 'thi công nội thất', 'xây nhà tiết kiệm', 'trải nghiệm thợ xây'] },
  { category: 'MARKETING & TRUYỀN THÔNG', items: ['cách làm affiliate tiktok', 'kiến thức seo website', 'chạy ads facebook', 'kinh nghiệm shopee', 'chia sẻ marketing thực chiến', 'đánh giá case study', 'chiến lược giá', 'câu nói viral', 'chất lượng content', 'tin tức marketing'] },
  { category: 'TRỊ LIỆU ÂM THANH', items: ['tần số chữa lành 432hz', 'tiếng mưa rơi dễ ngủ', 'âm thanh rừng tự nhiên', 'tiếng sóng biển 8 tiếng', 'tiếng ồn trắng cho em bé', 'nhạc thiền om', 'tiếng nhạc không lời', 'bowl singing tây tạng', 'tần số tập trung', 'tiếng suối chảy chim hót'] },
  { category: 'ĐAN LEN & THÊU THÙA', items: ['học móc len cơ bản', 'đan áo len nam', 'thêu hoa nổi', 'cách đọc chart móc', 'review kim móc crochet', 'móc gấu bông tỏi', 'thêu chỉ mế', 'đan len mũi hạt gạo', 'móc túi xách len', 'cách khâu mũi chữ thập'] },
  { category: 'TÀI CHÍNH & ĐẦU TƯ', items: ['đầu tư chứng khoán cho người mới', 'quản lý tài chính cá nhân', 'kiếm tiền online tại nhà', 'đầu tư crypto cơ bản', 'tiết kiệm tiền hiệu quả', 'review thẻ tín dụng', 'bất động sản dòng tiền', 'cách lập ngân sách gia đình', 'affiliate marketing shopee', 'dropshipping 2024'] }
];

const STOP_LIMIT = 10;

export default function App() {
  // --- State ---
  const [user, setUser] = useState<User | null>(null);
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionTick, setSubscriptionTick] = useState(Date.now());
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    const updateViewportFlag = () => {
      setIsMobileViewport(window.innerWidth <= 768);
    };

    updateViewportFlag();
    window.addEventListener('resize', updateViewportFlag);
    window.addEventListener('orientationchange', updateViewportFlag);

    return () => {
      window.removeEventListener('resize', updateViewportFlag);
      window.removeEventListener('orientationchange', updateViewportFlag);
    };
  }, []);

  const buildPaymentUrl = (targetUser = user) => {
    if (!targetUser) return 'https://research.vanthemmo.com/pay.html';

    return (
      `https://research.vanthemmo.com/pay.html` +
      `?uid=${encodeURIComponent(targetUser.uid)}` +
      `&userId=${encodeURIComponent(targetUser.uid)}` +
      `&email=${encodeURIComponent(targetUser.email || '')}` +
      `&returnUrl=${encodeURIComponent(window.location.origin + window.location.pathname)}`
    );
  };

  const refreshSubscription = async (targetUser = user, initTrial = false) => {
    if (!targetUser) {
      setSubscriptionInfo(null);
      return null;
    }

    try {
      setSubscriptionLoading(true);

      const url =
        `/api/me/subscription` +
        `?userId=${encodeURIComponent(targetUser.uid)}` +
        `&uid=${encodeURIComponent(targetUser.uid)}` +
        `&email=${encodeURIComponent(targetUser.email || '')}` +
        `&name=${encodeURIComponent(targetUser.displayName || '')}` +
        `&photoUrl=${encodeURIComponent(targetUser.photoURL || '')}` +
        `&initTrial=${initTrial ? '1' : '0'}`;

      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();

      if (data?.success) {
        setSubscriptionInfo(data);
        return data;
      }

      console.warn('Không lấy được hạn dùng:', data);
      return null;
    } catch (error) {
      console.error('Lỗi kiểm tra hạn dùng:', error);
      return null;
    } finally {
      setSubscriptionLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        await refreshSubscription(currentUser, true);
      } else {
        setSubscriptionInfo(null);
        setShowAccountModal(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const timer = window.setInterval(() => {
      setSubscriptionTick(Date.now());
      refreshSubscription(user, false);
    }, 30000);

    const onFocus = () => refreshSubscription(user, false);
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [user]);

  // STEP_11: Loại bỏ hoàn toàn chip trạng thái/PRO nổi để không che giao diện web/mobile.
  // Vẫn giữ logic kiểm tra gói ở header/tài khoản, chỉ xóa DOM cũ nếu còn tồn tại sau deploy.
  useEffect(() => {
    const root = document.getElementById('vtw-account-status-root-20260519');
    if (root) root.remove();
  }, [user, subscriptionInfo, subscriptionLoading, subscriptionTick]);

  const [activeTab, setActiveTab] = useState(1);
  const [videoInput, setVideoInput] = useState('');
  const [videoResult, setVideoResult] = useState<any>(null);
  const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false);
  const [config, setConfig] = useState<YouTubeConfig>(DEFAULT_CONFIG);
  const [apiKeyIndex, setApiKeyIndex] = useState(0);
  const [apiKeysHistory, setApiKeysHistory] = useState<string[]>([]);
  const [exhaustedKeys, setExhaustedKeys] = useState<string[]>([]);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Modal trigger helper
  const triggerConfirm = (title: string, message: string, onConfirm: () => void, confirmText = 'XÁC NHẬN', isDestructive = true) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      confirmText,
      isDestructive,
      onConfirm: () => {
        onConfirm();
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };
  const [showKeyHistory, setShowKeyHistory] = useState(false);
  const [showKeyInputModal, setShowKeyInputModal] = useState(false);
  const [manualKeysInput, setManualKeysInput] = useState('');
  const [suggestedNiches, setSuggestedNiches] = useState<{ category: string, items: string[] }[]>(SUGGESTED_NICHES);
  const [trendingRegion, setTrendingRegion] = useState(config.region);
  const [isFetchingDailyTrending, setIsFetchingDailyTrending] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('AIzaSyD1MMwzM-PBDZtueN_6vXXNSiT7_IitXXU');
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash');
  const [showModelOptions, setShowModelOptions] = useState(false);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<string | null>(null);
  const [selectedHistoryKeys, setSelectedHistoryKeys] = useState<string[]>([]);
  const [showNicheModal, setShowNicheModal] = useState(false);
  const clearHistory = () => {
    triggerConfirm(
      "Xóa lịch sử",
      "Bạn có chắc chắn muốn xóa toàn bộ lịch sử API Key không?",
      () => {
        setApiKeysHistory([]);
        localStorage.removeItem('youtube_api_keys_history');
      },
      "XÁC NHẬN XÓA"
    );
  };

  const addKeysToActive = (keysToAdd: string[]) => {
    if (keysToAdd.length === 0) return;
    const currentKeys = config.apiKeys.map(k => k.trim()).filter(Boolean);
    const newKeys = [...new Set([...currentKeys, ...keysToAdd.map(k => k.trim()).filter(Boolean)])];
    setConfig({ ...config, apiKeys: newKeys });
    localStorage.setItem('youtube_api_keys', JSON.stringify(newKeys));
    setSelectedHistoryKeys([]);
    setShowKeyHistory(false);
    setStatus(`Đã thêm ${keysToAdd.length} Key vào danh sách hoạt động.`);
  };

  const removeFromHistory = (keyToRemove: string) => {
    const next = apiKeysHistory.filter(k => k !== keyToRemove);
    setApiKeysHistory(next);
    localStorage.setItem('youtube_api_keys_history', JSON.stringify(next));
    setSelectedHistoryKeys(prev => prev.filter(k => k !== keyToRemove));
    setStatus("Đã xóa Key khỏi lịch sử.");
  };

  const [showRegionList, setShowRegionList] = useState(false);
  const regionRef = useRef<HTMLDivElement>(null);
  const keyHistoryRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  // Custom context menu state
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0, visible: false, channel: null as ChannelResult | null });

  // Click outside to close boards
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showRegionList && regionRef.current && !regionRef.current.contains(event.target as Node)) {
        setShowRegionList(false);
      }
      if (showKeyInputModal && keyHistoryRef.current && !keyHistoryRef.current.contains(event.target as Node)) {
        setShowKeyInputModal(false);
      }
      if (showKeyHistory && keyHistoryRef.current && !keyHistoryRef.current.contains(event.target as Node)) {
        setShowKeyHistory(false);
      }
      if (menuPos.visible && menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuPos(prev => ({ ...prev, visible: false }));
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showRegionList, showKeyInputModal, showKeyHistory, menuPos.visible]);

  // Đóng bảng thao tác khi cuộn/đổi màn hình để không bị dính sai kênh.
  useEffect(() => {
    if (!menuPos.visible) return;

    const closeFloatingMenu = () => {
      setMenuPos(prev => prev.visible ? ({ ...prev, visible: false }) : prev);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeFloatingMenu();
    };

    window.addEventListener('scroll', closeFloatingMenu, true);
    window.addEventListener('resize', closeFloatingMenu);
    window.addEventListener('orientationchange', closeFloatingMenu);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('scroll', closeFloatingMenu, true);
      window.removeEventListener('resize', closeFloatingMenu);
      window.removeEventListener('orientationchange', closeFloatingMenu);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuPos.visible]);

  const [status, setStatus] = useState('Sẵn sàng.');
  const [progress, setProgress] = useState(0);
  const [isHunting, setIsHunting] = useState(false);
  const [quotaUsed, setQuotaUsed] = useState(0);
  const [totalQuotaToday, setTotalQuotaToday] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [results, setResults] = useState<ChannelResult[]>([]);
  const isHuntingRef = useRef(false);
  const resultsRef = useRef<ChannelResult[]>([]);
  
  // Sync results to ref for the loop
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  const [showKeywordIdeas, setShowKeywordIdeas] = useState(true);
  const [showApiKeys, setShowApiKeys] = useState(true);
  const [keywordIdeas, setKeywordIdeas] = useState<KeywordIdea[]>([]);
  const [trackingChannels, setTrackingChannels] = useState<TrackingChannel[]>([]);
  const [spyInput, setSpyInput] = useState('');
  const [spyResult, setSpyResult] = useState<SpyResult | null>(null);
  // --- Niche Research State ---
  const [nicheInput, setNicheInput] = useState('');
  const [nicheRegion, setNicheRegion] = useState('VN');
  const [nicheTime, setNicheTime] = useState('day');
  const [nicheVideoCount, setNicheVideoCount] = useState(20);
  const [displayKeywordLimit, setDisplayKeywordLimit] = useState<string | number>(50);
  const [nicheSearchMode, setNicheSearchMode] = useState('related'); 
  const [nicheVideoType, setNicheVideoType] = useState('all'); 
  const [nicheSortBy, setNicheSortBy] = useState('relevance');
  const [isNicheSearching, setIsNicheSearching] = useState(false);
  const [nicheResults, setNicheResults] = useState<{
    summary: any;
    keywords: any[];
    videos: any[];
    shorts: any[];
    channels: any[];
    thumbnails: any[];
  } | null>(null);
  const [nicheActiveSubTab, setNicheActiveSubTab] = useState('summary');
  const [nicheHistory, setNicheHistory] = useState<any[]>([]);
  const [videoFilters, setVideoFilters] = useState({ trendScore: 0, views: 0, vph: 0 });
  const [modalTrendingVideos, setModalTrendingVideos] = useState<{title: string, subtitle: string, videos: any[]} | null>(null);
  const [channelFilters, setChannelFilters] = useState({ views: 0, subscribers: 0, videosCount: 0 });
  const [showNicheHistory, setShowNicheHistory] = useState(false);
  const [spyProjects, setSpyProjects] = useState<SpyResult[]>([]);
  const [videoProjects, setVideoProjects] = useState<any[]>([]);
  const [showSpyProjects, setShowSpyProjects] = useState(false);
  const [showVideoProjects, setShowVideoProjects] = useState(false);
  const [trackingSearchTerm, setTrackingSearchTerm] = useState('');
  
  const abortControllerRef = useRef<AbortController | null>(null);

  // --- Initialization ---
  useEffect(() => {
    const savedKeys = localStorage.getItem('youtube_api_keys');
    const savedKeyHistory = localStorage.getItem('youtube_api_keys_history');
    const savedConfig = localStorage.getItem('youtube_hunter_config');
    const savedResults = localStorage.getItem('youtube_hunter_results');
    const savedTracking = localStorage.getItem('youtube_tracking_channels');

    if (savedKeys) {
      const keys = JSON.parse(savedKeys);
      setConfig(prev => ({ ...prev, apiKeys: keys }));
    }
    if (savedKeyHistory) {
      setApiKeysHistory(JSON.parse(savedKeyHistory));
    }
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      // Migration for old config (single region to regions array)
      if (parsed.region && (!parsed.regions || parsed.regions.length === 0)) {
        parsed.regions = [parsed.region];
      }
      setConfig(prev => {
        const next = { ...prev, ...parsed };
        // Ensure API keys are not overwritten by empty array in config if we have keys from savedKeys
        if (prev.apiKeys.length > 0 && (!parsed.apiKeys || parsed.apiKeys.length === 0)) {
          next.apiKeys = prev.apiKeys;
        }
        return next;
      });
    }
    if (savedResults) setResults(JSON.parse(savedResults));
    if (savedTracking) setTrackingChannels(JSON.parse(savedTracking));
    
    const savedSpyProjects = localStorage.getItem('youtube_spy_projects');
    if (savedSpyProjects) setSpyProjects(JSON.parse(savedSpyProjects));

    const savedVideoProjects = localStorage.getItem('youtube_video_projects');
    if (savedVideoProjects) setVideoProjects(JSON.parse(savedVideoProjects));

    const savedNicheHistory = localStorage.getItem('youtube_niche_history');
    if (savedNicheHistory) setNicheHistory(JSON.parse(savedNicheHistory));

    const savedSuggestedNiches = localStorage.getItem(`youtube_suggested_niches_trending_v3_${trendingRegion || 'GLOBAL'}`);
    if (savedSuggestedNiches) {
      try {
        const parsedSuggestedNiches = JSON.parse(savedSuggestedNiches);
        if (Array.isArray(parsedSuggestedNiches) && parsedSuggestedNiches.length > 0) {
          setSuggestedNiches(parsedSuggestedNiches.map((niche: any) => ({
            ...niche,
            items: Array.isArray(niche.items) ? niche.items.slice(0, 5) : []
          })));
        }
      } catch (error) {
        console.warn('Không đọc được danh sách ngách đã lưu:', error);
      }
    }

    const savedGeminiKey = localStorage.getItem('youtube_gemini_api_key');
    if (savedGeminiKey) setGeminiApiKey(savedGeminiKey);
    
    const savedGeminiModel = localStorage.getItem('youtube_gemini_model');
    if (savedGeminiModel) setGeminiModel(savedGeminiModel);

    // Handle payment success return
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('paid') === 'success') {
      alert(`Thanh toán thành công! Mã đơn: ${urlParams.get('orderCode') || ''}`);
      // Clean up URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }

    // Load daily quota and clear if it's a new day
    const savedQuotaTotal = localStorage.getItem('youtube_quota_today');
    if (savedQuotaTotal) {
      try {
        const { value, date } = JSON.parse(savedQuotaTotal);
        const today = new Date().toISOString().split('T')[0];
        if (date === today) {
          setTotalQuotaToday(value);
        } else {
          localStorage.setItem('youtube_quota_today', JSON.stringify({ value: 0, date: today }));
        }
      } catch (e) {
        console.error("Error parsing quota total", e);
      }
    } else {
      const today = new Date().toISOString().split('T')[0];
      localStorage.setItem('youtube_quota_today', JSON.stringify({ value: 0, date: today }));
    }

    // Load exhausted keys and clear if it's a new day
    const savedExhausted = localStorage.getItem('youtube_exhausted_keys');
    if (savedExhausted) {
      try {
        const { keys, date } = JSON.parse(savedExhausted);
        const today = new Date().toISOString().split('T')[0];
        if (date === today) {
          setExhaustedKeys(keys);
        } else {
          localStorage.removeItem('youtube_exhausted_keys');
        }
      } catch (e) {
        console.error("Error parsing exhausted keys", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('youtube_gemini_api_key', geminiApiKey);
  }, [geminiApiKey]);

  useEffect(() => {
    localStorage.setItem('youtube_gemini_model', geminiModel);
  }, [geminiModel]);

  // Save exhausted keys whenever they change
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    if (exhaustedKeys.length > 0) {
      localStorage.setItem('youtube_exhausted_keys', JSON.stringify({ 
        keys: exhaustedKeys, 
        date: today 
      }));
    } else {
      localStorage.removeItem('youtube_exhausted_keys');
    }
  }, [exhaustedKeys]);

  // --- API Helpers ---
  const getActiveApiKey = () => config.apiKeys[apiKeyIndex] || '';

  const rotateApiKey = () => {
    // Find next available key that isn't exhausted
    const nextIndex = config.apiKeys.findIndex((key, idx) => 
      idx > apiKeyIndex && !exhaustedKeys.includes(key)
    );
    
    if (nextIndex !== -1) {
      setApiKeyIndex(nextIndex);
      return true;
    }

    // Wrap around to start if needed
    const wrapIndex = config.apiKeys.findIndex((key) => !exhaustedKeys.includes(key));
    if (wrapIndex !== -1 && wrapIndex !== apiKeyIndex) {
      setApiKeyIndex(wrapIndex);
      return true;
    }

    return false;
  };

  const updateQuotaUsage = (amount: number) => {
    setQuotaUsed(prev => prev + amount);
    setTotalQuotaToday(prev => {
      const next = prev + amount;
      const today = new Date().toISOString().split('T')[0];
      localStorage.setItem('youtube_quota_today', JSON.stringify({ value: next, date: today }));
      return next;
    });
  };

  // --- YouTube Niche Research Functions ---
  const calculateEngagementRate = (stats: any) => {
    if (!stats) return 0;
    const views = parseInt(stats.viewCount) || 0;
    const likes = parseInt(stats.likeCount) || 0;
    const comments = parseInt(stats.commentCount) || 0;
    if (views === 0) return 0;
    return ((likes + comments) / views) * 100;
  };

  const calculateVPH = (viewCount: number, publishedAt: string) => {
    if (!publishedAt) return 0;
    const publishedTime = new Date(publishedAt).getTime();
    if (isNaN(publishedTime)) return 0;
    const now = new Date().getTime();
    const hours = Math.max(1, (now - publishedTime) / (1000 * 60 * 60));
    return viewCount / hours;
  };

  const calculateTrendScore = (video: any, channel: any) => {
    if (!video || !video.snippet) return 0;
    let score = 0;
    const stats = video.statistics || {};
    const views = parseInt(stats.viewCount) || 0;
    const vph = calculateVPH(views, video.snippet.publishedAt);
    const pubAt = video.snippet.publishedAt;
    const publishedTime = pubAt ? new Date(pubAt).getTime() : 0;
    const now = new Date().getTime();
    const ageDays = publishedTime ? (now - publishedTime) / (1000 * 60 * 60 * 24) : 0;
    const viewPerDay = ageDays < 1 ? views : views / ageDays;
    const engagement = calculateEngagementRate(stats);
    const subs = channel?.statistics?.subscriberCount ? parseInt(channel.statistics.subscriberCount) || 0 : 0;

    // 1. VPH Score (max 40)
    if (vph >= 100) score += 40;
    else if (vph >= 50) score += 32;
    else if (vph >= 20) score += 24;
    else if (vph >= 10) score += 16;
    else if (vph >= 1) score += 8;
    else score += 3;

    // 2. View/day Score (max 25)
    if (viewPerDay >= 10000) score += 25;
    else if (viewPerDay >= 5000) score += 20;
    else if (viewPerDay >= 1000) score += 15;
    else if (viewPerDay >= 300) score += 10;
    else if (viewPerDay >= 50) score += 5;
    else score += 2;

    // 3. Freshness (max 15)
    if (ageDays <= 3) score += 15;
    else if (ageDays <= 7) score += 12;
    else if (ageDays <= 14) score += 9;
    else if (ageDays <= 30) score += 6;
    else if (ageDays <= 90) score += 3;
    else score += 1;

    // 4. Engagement (max 10)
    if (engagement >= 5) score += 10;
    else if (engagement >= 2) score += 7;
    else if (engagement >= 0.5) score += 4;
    else score += 1;

    // 5. Small channel bonus (max 10)
    if (subs > 0) {
      if (subs < 10000 && views > 50000) score += 10;
      else if (subs < 50000 && views > 100000) score += 8;
      else if (subs < 100000 && views > 200000) score += 6;
    }

    return Math.min(100, score);
  };

  const getPublishedAfterDate = (filter: string) => {
    const d = new Date();
    if (filter === 'day' || filter === 'today') d.setDate(d.getDate() - 1);
    else if (filter === 'week') d.setDate(d.getDate() - 7);
    else if (filter === '2weeks') d.setDate(d.getDate() - 14);
    else if (filter === 'month') d.setMonth(d.getMonth() - 1);
    else if (filter === '3months') d.setMonth(d.getMonth() - 3);
    else if (filter === 'year') d.setFullYear(d.getFullYear() - 1);
    else return undefined;
    return d.toISOString();
  };

  const fetchDailyTrendingFromYouTube = async () => {
    if (config.apiKeys.length === 0) {
      alert('Vui lòng nhập API Key YouTube V3 để cập nhật Trending.');
      return;
    }

    setIsFetchingDailyTrending(true);
    setStatus('Đang cập nhật trend');

    const REGION_LANGUAGE: Record<string, { language: string; prompt: string; searchHint: string }> = {
      '': {
        language: 'Đa ngôn ngữ',
        prompt: 'Trộn ngẫu nhiên theo thị trường toàn cầu: có thể dùng tiếng Việt, tiếng Anh, tiếng Nhật, tiếng Hàn, tiếng Thái, tiếng Indonesia, tiếng Tây Ban Nha. Không bắt buộc tất cả là tiếng Việt.',
        searchHint: 'global trending'
      },
      VN: { language: 'Tiếng Việt', prompt: 'Tất cả từ khóa phải viết bằng tiếng Việt tự nhiên.', searchHint: 'hot trend việt nam' },
      US: { language: 'English', prompt: 'All keywords must be in natural American English. Do not use Vietnamese.', searchHint: 'US trending' },
      GB: { language: 'English', prompt: 'All keywords must be in natural British English. Do not use Vietnamese.', searchHint: 'UK trending' },
      CA: { language: 'English', prompt: 'All keywords must be in natural English for Canada. Do not use Vietnamese.', searchHint: 'Canada trending' },
      AU: { language: 'English', prompt: 'All keywords must be in natural English for Australia. Do not use Vietnamese.', searchHint: 'Australia trending' },
      IN: { language: 'English/Hindi', prompt: 'Use natural India-market keywords, mainly English or Hindi. Do not use Vietnamese.', searchHint: 'India trending' },
      JP: { language: '日本語', prompt: 'すべてのキーワードは自然な日本語で書いてください。ベトナム語は使わないでください。', searchHint: '日本 トレンド' },
      KR: { language: '한국어', prompt: '모든 키워드는 자연스러운 한국어로 작성하세요. 베트남어를 사용하지 마세요.', searchHint: '한국 트렌드' },
      TH: { language: 'ภาษาไทย', prompt: 'ใช้คำค้นหาเป็นภาษาไทยธรรมชาติเท่านั้น ห้ามใช้ภาษาเวียดนาม', searchHint: 'เทรนด์ไทย' },
      ID: { language: 'Bahasa Indonesia', prompt: 'Semua keyword harus dalam Bahasa Indonesia yang natural. Jangan gunakan bahasa Vietnam.', searchHint: 'tren indonesia' },
      PH: { language: 'English/Filipino', prompt: 'Use natural Philippines-market keywords in English or Filipino. Do not use Vietnamese.', searchHint: 'Philippines trending' },
      MY: { language: 'Malay/English', prompt: 'Use natural Malaysia-market keywords in Malay or English. Do not use Vietnamese.', searchHint: 'Malaysia trending' },
      SG: { language: 'English', prompt: 'All keywords must be in natural Singapore English. Do not use Vietnamese.', searchHint: 'Singapore trending' },
      DE: { language: 'Deutsch', prompt: 'Alle Keywords müssen auf natürlichem Deutsch sein. Kein Vietnamesisch verwenden.', searchHint: 'Deutschland Trends' },
      FR: { language: 'Français', prompt: 'Tous les mots-clés doivent être en français naturel. Ne pas utiliser le vietnamien.', searchHint: 'tendances france' },
      RU: { language: 'Русский', prompt: 'Все ключевые слова должны быть на естественном русском языке. Не используйте вьетнамский.', searchHint: 'тренды россия' },
      BR: { language: 'Português', prompt: 'Todas as palavras-chave devem estar em português natural do Brasil. Não use vietnamita.', searchHint: 'tendências brasil' },
      MX: { language: 'Español', prompt: 'Todas las palabras clave deben estar en español natural de México. No uses vietnamita.', searchHint: 'tendencias méxico' },
      ES: { language: 'Español', prompt: 'Todas las palabras clave deben estar en español natural. No uses vietnamita.', searchHint: 'tendencias españa' },
      IT: { language: 'Italiano', prompt: 'Tutte le keyword devono essere in italiano naturale. Non usare vietnamita.', searchHint: 'tendenze italia' }
    };

    const regionMeta = REGION_LANGUAGE[trendingRegion] || REGION_LANGUAGE.US;
    const regionLabel = REGIONS.find(r => r.code === trendingRegion)?.name || 'Toàn cầu (Global)';
    const trendingStorageKey = `youtube_suggested_niches_trending_v3_${trendingRegion || 'GLOBAL'}`;

    const normalizeText = (value: string) =>
      (value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd');

    const cleanKeyword = (value: string) =>
      (value || '')
        .toLowerCase()
        .replace(/#/g, '')
        .replace(/[^\p{L}\p{N}\s&+.-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const CATEGORY_PROFILES: Record<string, { rules: string[]; hint: string; banned?: string[] }> = {
      'PHÁT TRIỂN BẢN THÂN': {
        hint: 'kỹ năng sống, tư duy, thói quen, động lực, năng suất, mục tiêu cá nhân',
        rules: ['phat trien ban than', 'dong luc', 'ky nang song', 'thoi quen', 'tu duy', 'thanh cong', 'muc tieu', 'tri hoan', 'self improvement', 'motivation', 'quan ly thoi gian', 'nang suat', 'lam viec nang suat', 'ky nang lam viec']
      },
      'SỨC KHỎE & LÀM ĐẸP': {
        hint: 'sức khỏe, giảm cân, skincare, làm đẹp, yoga, fitness, chăm sóc cơ thể',
        rules: ['suc khoe', 'lam dep', 'skincare', 'giam can', 'yoga', 'trang diem', 'mun', 'toc', 'health', 'beauty', 'fitness']
      },
      'CÔNG NGHỆ & AI': {
        hint: 'AI, ChatGPT, Gemini, điện thoại, phần mềm, công nghệ, app, thủ thuật số',
        rules: ['cong nghe', 'ai', 'chatgpt', 'gemini', 'iphone', 'android', 'dien thoai', 'may tinh', 'phan mem', 'technology']
      },
      'GIÁO DỤC & HỌC TẬP': {
        hint: 'học tập, ngoại ngữ, IELTS, TOEIC, lập trình, ôn thi, phương pháp học',
        rules: ['giao duc', 'hoc tap', 'hoc tieng', 'ielts', 'toeic', 'lap trinh', 'python', 'on thi', 'education', 'learning']
      },
      'ẨM THỰC & NẤU ĂN': {
        hint: 'món ăn, công thức nấu ăn, review quán ăn, bếp, đồ ăn, ẩm thực gia đình',
        rules: ['am thuc', 'nau an', 'mon an', 'do an', 'cong thuc', 'nha bep', 'an uong', 'mukbang', 'food', 'cooking', 'recipe', 'thuc pham', 'quan an', 'gia dinh ngon', 'bua an'],
        banned: ['bac gau', 'wag bac gau', 'reaction', 'bolero', 'hybe', 'lck', 'lmht', 'league of legends', 'lien minh', 'game', 'free fire', 'tik tok free fire', 'tiktok free fire', 'chatgpt']
      },
      'DU LỊCH & KHÁM PHÁ': {
        hint: 'du lịch, khám phá địa điểm, resort, vé máy bay, phượt, cắm trại, travel vlog',
        rules: ['du lich', 'kham pha', 'travel', 'vlog', 'camping', 'phuot', 'da lat', 'nhat ban', 'han quoc', 'tour', 'resort', 've may bay', 'cam trai', 'nghi duong', 'lich trinh'],
        banned: ['bolero', 'hybe', 'lck', 'chatgpt']
      },
      'GIẢI TRÍ & HÀI HƯỚC': {
        hint: 'giải trí, phim, hài, meme, reaction, drama, người nổi tiếng, thử thách',
        rules: ['giai tri', 'hai', 'funny', 'meme', 'reaction', 'phim', 'anime', 'prank', 'thu thach', 'entertainment']
      },
      'THỂ THAO & THỂ HÌNH': {
        hint: 'thể thao, gym, bóng đá, cầu lông, tennis, workout, fitness',
        rules: ['the thao', 'gym', 'fitness', 'bong da', 'cau long', 'tennis', 'chay bo', 'workout', 'tang co', 'giam mo'],
        banned: ['bolero', 'hybe']
      },
      'PETS & ĐỘNG VẬT': {
        hint: 'thú cưng, chó mèo, động vật, chăm sóc pet, huấn luyện pet',
        rules: ['pet', 'thu cung', 'dong vat', 'cho', 'meo', 'cat', 'dog', 'animal', 'grooming', 'bo sat'],
        banned: ['bolero', 'hybe', 'lck']
      },
      'GIA ĐÌNH & ĐỜI SỐNG': {
        hint: 'gia đình, đời sống, dọn nhà, nuôi con, mẹo nhà cửa, sống xanh',
        rules: ['gia dinh', 'doi song', 'meo vat', 'don nha', 'nuoi con', 'me bim', 'trong rau', 'home', 'family', 'life']
      },
      'NGHỆ THUẬT & SÁNG TẠO': {
        hint: 'vẽ, thiết kế, chụp ảnh, edit video, guitar, Canva, sáng tạo nội dung',
        rules: ['nghe thuat', 'sang tao', 've tranh', 'chup anh', 'guitar', 'canva', 'edit video', 'art', 'creative', 'design']
      },
      'CÔNG NGHỆ Ô TÔ & XE MÁY': {
        hint: 'ô tô, xe máy, xe điện, review xe, bảo dưỡng xe, phụ kiện xe',
        rules: ['oto', 'xe may', 'xe dien', 'review xe', 'bao duong xe', 'phu kien oto', 'car', 'motorbike', 'vehicle'],
        banned: ['bolero', 'hybe']
      },
      'TÂM LÝ HỌC & MỐI QUAN HỆ': {
        hint: 'tâm lý học, tình yêu, mối quan hệ, MBTI, chữa lành, hôn nhân',
        rules: ['tam ly', 'moi quan he', 'tinh yeu', 'chia tay', 'mbti', 'hon nhan', 'doc hai', 'psychology', 'relationship']
      },
      'ESPORTS & GAMING': {
        hint: 'game, esports, Liên Quân, LCK, Valorant, PUBG, Genshin, LOL',
        rules: ['game', 'gaming', 'esports', 'lien quan', 'tft', 'valorant', 'pubg', 'genshin', 'lol', 'mobile game', 'lck']
      },
      'HUYỀN BÍ & TÂM LINH': {
        hint: 'huyền bí, tâm linh, tarot, giấc mơ, phong thủy, bí ẩn',
        rules: ['huyen bi', 'tam linh', 'tarot', 'giac mo', 'bi an', 'phong thuy', 'nhan qua', 'supernatural', 'mystery']
      },
      'MẸO VẶT CUỘC SỐNG': {
        hint: 'mẹo vặt, life hack, sửa chữa, tái chế, mẹo nhà bếp, mẹo sinh hoạt',
        rules: ['meo vat', 'life hack', 'sua chua', 'tai che', 'bao quan', 'lo vi song', 'ung dung huu ich', 'tips']
      },
      'VĂN HÓA & LỊCH SỬ': {
        hint: 'lịch sử, văn hóa, di tích, nhân vật lịch sử, chiến tranh, triều đại',
        rules: ['lich su', 'van hoa', 'trieu dai', 'chien tranh', 'di tich', 'nhan vat lich su', 'history', 'culture']
      },
      'THỜI TRANG & PHONG CÁCH': {
        hint: 'thời trang, phối đồ, local brand, sneaker, outfit, phong cách cá nhân',
        rules: ['thoi trang', 'phoi do', 'local brand', 'vintage', 'sneaker', 'fashion', 'style', 'outfit']
      },
      'NÔNG NGHIỆP CÔNG NGHỆ CAO': {
        hint: 'nông nghiệp, trồng trọt, thủy canh, nuôi tôm, cây cảnh, công nghệ nông nghiệp',
        rules: ['nong nghiep', 'trong rau', 'thuy canh', 'nuoi tom', 'sau rieng', 'hoa lan', 'cay canh', 'agriculture']
      },
      'REVIEW SẢN PHẨM & UNBOXING': {
        hint: 'review sản phẩm, unboxing, đồ công nghệ, đồ gia dụng, mỹ phẩm, Shopee, phụ kiện',
        rules: ['review', 'unboxing', 'shopee', 'san pham', 'my pham', 'do cong nghe', 'ban phim', 'smartwatch', 'do gia dung'],
        banned: ['bolero', 'nhac bolero', 'nhac', 'music', 'karaoke', 'cover', 'lck', 'lien minh', 'hybe', 'son tung']
      },
      'NHẠC & COVER': {
        hint: 'nhạc, cover, bolero, lofi, karaoke, remix, acoustic, bài hát',
        rules: ['nhac', 'cover', 'lofi', 'karaoke', 'beat', 'remix', 'acoustic', 'music', 'song', 'bolero']
      },
      'BẤT ĐỘNG SẢN & NHÀ CỬA': {
        hint: 'bất động sản, nhà đất, căn hộ, nội thất, phong thủy nhà, thiết kế nhà',
        rules: ['bat dong san', 'nha cua', 'can ho', 'nha pho', 'noi that', 'phong thuy nha', 'real estate', 'home']
      },
      'CÂU CHUYỆN KHỞI NGHIỆP': {
        hint: 'khởi nghiệp, kinh doanh, startup, bán hàng, marketing, quản trị, kiếm tiền',
        rules: ['khoi nghiep', 'kinh doanh', 'startup', 'ban hang', 'marketing 0 dong', 'quan cafe', 'business']
      },
      'CHUYỆN LẠ BỐN PHƯƠNG': {
        hint: 'chuyện lạ, hiện tượng kỳ lạ, khám phá độc lạ, kỷ lục, sinh vật lạ',
        rules: ['chuyen la', 'ky la', 'guinness', 'sinh vat bien', 'hien tuong', 'doc la', 'strange', 'weird']
      },
      'ASMR & MUKBANG': {
        hint: 'ASMR, mukbang, ăn uống, âm thanh thư giãn, ăn cay, hải sản',
        rules: ['asmr', 'mukbang', 'an uong', 'go phim', 'thu gian', 'hai san', 'do an cay']
      },
      'XÂY DỰNG & KIẾN TRÚC': {
        hint: 'xây dựng, kiến trúc, thi công, chống thấm, máy xúc, thiết kế công trình',
        rules: ['xay dung', 'kien truc', 'thi cong', 'chong tham', 'xi mang', 'may xuc', 'construction', 'architecture']
      },
      'MARKETING & TRUYỀN THÔNG': {
        hint: 'marketing, affiliate, SEO, quảng cáo, content, truyền thông, case study',
        rules: ['marketing', 'affiliate', 'seo', 'facebook ads', 'content', 'truyen thong', 'case study']
      },
      'TRỊ LIỆU ÂM THANH': {
        hint: 'âm thanh chữa lành, 432hz, tiếng mưa, white noise, nhạc thiền, sleep music',
        rules: ['am thanh', '432hz', 'tieng mua', 'song bien', 'nhac thien', 'white noise', 'sleep music', 'healing']
      },
      'ĐAN LEN & THÊU THÙA': {
        hint: 'đan len, móc len, crochet, thêu, kim móc, đồ handmade len',
        rules: ['dan len', 'moc len', 'crochet', 'theu', 'kim moc', 'tui xach len', 'knitting']
      },
      'TÀI CHÍNH & ĐẦU TƯ': {
        hint: 'tài chính, đầu tư, chứng khoán, crypto, tiết kiệm tiền, kiếm tiền online, thẻ tín dụng',
        rules: ['tai chinh', 'dau tu', 'chung khoan', 'crypto', 'tiet kiem tien', 'the tin dung', 'kiem tien online', 'finance', 'investment'],
        banned: ['bac gau', 'reaction', 'bolero', 'hybe', 'lck', 'lien minh', 'game', 'nau an']
      }
    };

    const GLOBAL_BLOCK_BY_CATEGORY = (category: string) => {
      const blocks = [
        'bac gau', 'bac gau vlog', 'wag bac gau', 'bac gau reaction',
        'hybe', 'hybe labels', 'free fire', 'tik tok free fire', 'tiktok free fire',
        'lck live', 'lck', 'lmht', 'league of legends', 'lien minh huyen thoai',
        'roblox', 'minecraft', 'pubg', 'valorant', 'genshin',
        'son tung', 'mtp', 'drama showbiz'
      ];
      if (category !== 'NHẠC & COVER') blocks.push('bolero', 'nhac bolero', 'karaoke cover', 'nhac remix', 'music video');
      if (category !== 'ESPORTS & GAMING') blocks.push('game', 'gaming', 'esports', 'lien minh', 'lien quan');
      if (category !== 'GIẢI TRÍ & HÀI HƯỚC') blocks.push('reaction', 'prank drama');
      if (category !== 'ẨM THỰC & NẤU ĂN') blocks.push('mukbang');
      return blocks;
    };

    const isRelevantForCategory = (category: string, keyword: string, strict = false) => {
      const cleaned = normalizeText(cleanKeyword(keyword));
      if (!cleaned) return false;

      const profile = CATEGORY_PROFILES[category];
      const banned = [...(profile?.banned || []), ...GLOBAL_BLOCK_BY_CATEGORY(category)].map(normalizeText);

      // Chặn cứng key lệch chủ đề. Đây là lớp lọc cuối cùng cho cả YouTube V3 và Gemini.
      if (banned.some(bad => cleaned === bad || cleaned.includes(bad) || bad.includes(cleaned))) return false;

      const rules = (profile?.rules || []).map(normalizeText);
      const matchedRule = rules.some(rule => cleaned.includes(rule) || rule.includes(cleaned));

      // Khi dữ liệu đến từ YouTube/Gemini phải khớp domain chủ đề, không còn kiểu lấy trend chung rồi nhét vào mọi mục.
      if (strict) return matchedRule;

      return true;
    };

    const uniqueLimit = (items: string[], limit = 5, category?: string, strict = false) => {
      const seen = new Set<string>();
      const output: string[] = [];

      for (const raw of items) {
        const cleaned = cleanKeyword(raw);
        if (!cleaned || cleaned.length < 3 || cleaned.length > 42) continue;
        if (category && !isRelevantForCategory(category, cleaned, strict)) continue;

        const key = normalizeText(cleaned);
        if (seen.has(key)) continue;

        seen.add(key);
        output.push(cleaned);
        if (output.length >= limit) break;
      }

      return output;
    };

    const pickCandidateWords = (video: any) => {
      const title = video?.snippet?.title || '';
      const tags = Array.isArray(video?.snippet?.tags) ? video.snippet.tags : [];
      const description = video?.snippet?.description || '';
      const candidates: string[] = [];

      tags.forEach((tag: string) => {
        const cleaned = cleanKeyword(tag);
        if (cleaned && cleaned.length >= 3 && cleaned.length <= 42) candidates.push(cleaned);
      });

      const phrases = `${title} ${description}`
        .split(/[|,.;:!?()\[\]{}"“”'’\n\r\t]+/g)
        .map(cleanKeyword)
        .filter(Boolean);

      phrases.forEach((phrase) => {
        if (phrase.length >= 4 && phrase.length <= 42) candidates.push(phrase);
      });

      return candidates;
    };

    const TARGETED_QUERY_BY_CATEGORY: Record<string, string> = {
      'ẨM THỰC & NẤU ĂN': trendingRegion === 'VN'
        ? 'ẩm thực nấu ăn món ngon công thức hot trend'
        : trendingRegion === ''
          ? 'food cooking recipe trending OR món ngon'
          : `food cooking recipe trending ${regionMeta.searchHint}`,
      'TÀI CHÍNH & ĐẦU TƯ': trendingRegion === 'VN'
        ? 'tài chính đầu tư chứng khoán kiếm tiền online hot trend'
        : trendingRegion === ''
          ? 'finance investing stocks crypto trending OR tài chính đầu tư'
          : `finance investing stocks crypto money trend ${regionMeta.searchHint}`
    };

    try {
      // Luôn bắt đầu từ danh sách gốc để loại bỏ key sai đã lưu trước đó.
      const sourceNiches = SUGGESTED_NICHES.map((base) => ({
        ...base,
        items: uniqueLimit(base.items, 5, base.category, false)
      }));

      const categoryKeywordMap: Record<string, string[]> = {};
      sourceNiches.forEach((niche) => {
        categoryKeywordMap[niche.category] = [];
      });

      // Tiết kiệm quota: 1 lượt videos.list chart=mostPopular = 1 quota, dùng làm nguồn trend chung.
      const popularRes = await youtubeFetch('videos', {
        part: 'snippet,statistics',
        chart: 'mostPopular',
        regionCode: trendingRegion || undefined,
        maxResults: 50
      });

      const popularVideos = Array.isArray(popularRes?.items) ? popularRes.items : [];

      popularVideos.forEach((video: any) => {
        const haystack = normalizeText([
          video?.snippet?.title || '',
          video?.snippet?.description || '',
          ...(Array.isArray(video?.snippet?.tags) ? video.snippet.tags : [])
        ].join(' '));

        sourceNiches.forEach((niche) => {
          const profile = CATEGORY_PROFILES[niche.category];
          const matched = (profile?.rules || []).some((rule) => haystack.includes(normalizeText(rule)));

          if (matched) {
            categoryKeywordMap[niche.category].push(...pickCandidateWords(video));
          }
        });
      });

      // Sửa riêng 2 mục hay thiếu dữ liệu: 2 lượt search = khoảng 200 quota, tổng vẫn dưới 500.
      for (const [category, query] of Object.entries(TARGETED_QUERY_BY_CATEGORY)) {
        try {
          const searchRes = await youtubeFetch('search', {
            part: 'snippet',
            q: query,
            type: 'video',
            regionCode: trendingRegion || undefined,
            order: 'viewCount',
            publishedAfter: getPublishedAfterDate('month'),
            maxResults: 5
          });

          const ids = (searchRes?.items || [])
            .map((item: any) => item?.id?.videoId)
            .filter(Boolean);

          if (ids.length > 0) {
            const detailRes = await youtubeFetch('videos', {
              part: 'snippet,statistics',
              id: ids.join(',')
            });

            (detailRes?.items || []).forEach((video: any) => {
              categoryKeywordMap[category].push(...pickCandidateWords(video));
            });
          }
        } catch (error) {
          console.warn(`Không lấy được dữ liệu YouTube riêng cho ${category}:`, error);
        }
      }

      const youtubeKeywordMap: Record<string, string[]> = {};
      sourceNiches.forEach((niche) => {
        youtubeKeywordMap[niche.category] = uniqueLimit(categoryKeywordMap[niche.category], 2, niche.category, true);
      });

      const categoriesNeedGemini = sourceNiches.map((niche) => ({
        category: niche.category,
        description: CATEGORY_PROFILES[niche.category]?.hint || niche.category,
        youtubeKeys: youtubeKeywordMap[niche.category]
      }));

      let geminiKeywordMap: Record<string, string[]> = {};

      if (geminiApiKey) {
        try {
          const ai = new GoogleGenAI({ apiKey: geminiApiKey });
          const randomSeed = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

          const prompt = `
Bạn là chuyên gia nghiên cứu trend YouTube tại ${regionLabel}.
Hãy tạo đúng 5 từ khóa trend ngắn cho MỖI chủ đề bên dưới.

Yêu cầu bắt buộc:
- Trả về JSON thuần, không markdown, không giải thích.
- JSON có dạng: {"TÊN CHỦ ĐỀ":["key 1","key 2","key 3","key 4","key 5"]}.
- Từ khóa phải ĐÚNG 100% với chủ đề và mô tả của chủ đề đó.
- NGÔN NGỮ BẮT BUỘC: ${regionMeta.prompt}
- Không đưa nhạc/bolero vào REVIEW SẢN PHẨM & UNBOXING.
- Không đưa game/LCK/nhạc/bolero/reaction vào ẨM THỰC & NẤU ĂN hoặc TÀI CHÍNH & ĐẦU TƯ.
- Không lặp lại các key YouTube đã có.
- Mỗi lần tạo phải khác nhau, sắp xếp từ hot cao xuống thấp.
- Mỗi key tối đa 6 từ, đúng ngôn ngữ khu vực đã chọn.
- Random seed: ${randomSeed}

Dữ liệu chủ đề:
${JSON.stringify(categoriesNeedGemini, null, 2)}
`;

          const response = await ai.models.generateContent({
            model: geminiModel,
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
          });

          const rawText = response.text || '';
          const jsonText = rawText
            .replace(/```json/gi, '')
            .replace(/```/g, '')
            .trim();

          const firstBrace = jsonText.indexOf('{');
          const lastBrace = jsonText.lastIndexOf('}');
          const safeJson = firstBrace >= 0 && lastBrace > firstBrace
            ? jsonText.slice(firstBrace, lastBrace + 1)
            : jsonText;

          const parsed = JSON.parse(safeJson);

          sourceNiches.forEach((niche) => {
            geminiKeywordMap[niche.category] = Array.isArray(parsed?.[niche.category])
              ? uniqueLimit(parsed[niche.category], 5, niche.category, false)
              : [];
          });
        } catch (error) {
          console.warn('Gemini tạo trend bị lỗi, dùng dữ liệu dự phòng:', error);
        }
      }

      const updatedNiches = sourceNiches.map((niche) => {
        const youtubeKeys = uniqueLimit(youtubeKeywordMap[niche.category] || [], 2, niche.category, true);
        const aiKeys = uniqueLimit(geminiKeywordMap[niche.category] || [], 5, niche.category, false);
        const fallbackKeys = uniqueLimit(SUGGESTED_NICHES.find(item => item.category === niche.category)?.items || [], 5, niche.category, false);

        const finalKeys = uniqueLimit([
          ...youtubeKeys.slice(0, 2),
          ...aiKeys.slice(0, 5),
          ...fallbackKeys
        ], 5, niche.category, false);

        return {
          ...niche,
          items: finalKeys
        };
      });

      setSuggestedNiches(updatedNiches);
      localStorage.setItem(trendingStorageKey, JSON.stringify(updatedNiches));

      setStatus('Đã cập nhật Trending thành công.');
      alert('Đã cập nhật Trending thành công.');
    } catch (error: any) {
      console.error(error);
      setStatus(`Lỗi cập nhật Trending: ${error?.message || 'Không xác định'}`);
      alert('Không thể cập nhật Trending. Vui lòng kiểm tra YouTube API Key / Gemini API Key.');
    } finally {
      setIsFetchingDailyTrending(false);
    }
  };

    const runNicheResearch = async (customKeyword?: string) => {
    const kw = customKeyword || nicheInput;
    if (!kw.trim()) {
      alert('Vui lòng nhập từ khóa hoặc ngách cần nghiên cứu.');
      return;
    }

    if (config.apiKeys.length === 0) {
      alert('Vui lòng thêm ít nhất một API Key trong phần cài đặt.');
      return;
    }

    setIsNicheSearching(true);
    setStatus(`Đang nghiên cứu ngách: ${kw}...`);
    
    try {
      // 1. Search videos
      const publishedAfter = getPublishedAfterDate(nicheTime);
      const initialSearchParams: any = {
        q: kw,
        type: 'video',
        regionCode: nicheRegion,
        publishedAfter,
        maxResults: Math.min(50, nicheVideoCount),
        order: nicheSortBy
      };

      if (nicheVideoType === 'short') initialSearchParams.videoDuration = 'short';
      else if (nicheVideoType === 'video') initialSearchParams.videoDuration = 'medium';

      const searchRes = await youtubeFetch('search', initialSearchParams);
      let videoItems = [...searchRes.items];

      // Pagination for up to 100 items
      if (nicheVideoCount > 50 && searchRes.nextPageToken && videoItems.length < nicheVideoCount) {
        setStatus(`Đang lấy thêm dữ liệu (Trang 2)...`);
        const secondSearchParams = {
          ...initialSearchParams,
          maxResults: Math.min(50, nicheVideoCount - 50),
          pageToken: searchRes.nextPageToken
        };
        const secondSearchRes = await youtubeFetch('search', secondSearchParams);
        if (secondSearchRes.items) {
          videoItems = [...videoItems, ...secondSearchRes.items];
        }
      }

      const videoIds = videoItems.map((i: any) => i.id.videoId);

      if (videoIds.length === 0) {
        alert('Không tìm thấy dữ liệu thật từ YouTube API cho từ khóa này.');
        setIsNicheSearching(false);
        return;
      }

      // 2. Get detailed video stats (Chunked as YouTube API limit is 50 IDs per request)
      let allDetailedVideos: any[] = [];
      for (let i = 0; i < videoIds.length; i += 50) {
        const chunk = videoIds.slice(i, i + 50);
        const res = await youtubeFetch('videos', {
          id: chunk.join(','),
          part: 'snippet,statistics,contentDetails'
        });
        if (res.items) allDetailedVideos = [...allDetailedVideos, ...res.items];
      }

      if (allDetailedVideos.length === 0) {
        alert('Không lấy được thông tin chi tiết video.');
        setIsNicheSearching(false);
        return;
      }

      // 3. Get channel stats (Chunked as YouTube API limit is 50 IDs per request)
      const channelIds = [...new Set(allDetailedVideos.map((v: any) => v.snippet.channelId))];
      let allChannels: any[] = [];
      for (let i = 0; i < channelIds.length; i += 50) {
        const chunk = channelIds.slice(i, i + 50);
        const res = await youtubeFetch('channels', {
          id: chunk.join(','),
          part: 'snippet,statistics'
        });
        if (res.items) allChannels = [...allChannels, ...res.items];
      }

      const channelsMap = new Map();
      allChannels.forEach((c: any) => channelsMap.set(c.id, c));

      // 4. Process data
      const processedVideos = allDetailedVideos.map((v: any) => {
        const chan = channelsMap.get(v.snippet.channelId);
        const stats = v.statistics || {};
        const views = parseInt(stats.viewCount) || 0;
        const vph = calculateVPH(views, v.snippet.publishedAt);
        const trendScore = calculateTrendScore(v, chan);
        
        return {
          ...v,
          vph,
          trendScore,
          engagementRate: calculateEngagementRate(stats),
          viewPerDay: views / Math.max(1, (new Date().getTime() - new Date(v.snippet.publishedAt).getTime()) / (1000 * 60 * 60 * 24))
        };
      });

      // Simple Shorts filter
      const shorts = processedVideos.filter((v: any) => {
        const d = v.contentDetails?.duration;
        if (!d) return false;
        if (d.includes('H')) return false;
        if (d.includes('M')) {
          const match = d.match(/PT(\d+)M/);
          if (match && parseInt(match[1]) > 1) return false;
          if (match && parseInt(match[1]) === 1 && d.includes('S')) {
             const sMatch = d.match(/(\d+)S/);
             if (sMatch && parseInt(sMatch[1]) > 0) return false;
          }
        }
        return true;
      });

      // 5. Keyword analysis
      const allTags = processedVideos.flatMap((v: any) => {
        const tags = v.snippet.tags || [];
        // Complement tags with title words (3+ chars) to ensure more results
        const titleWords = v.snippet.title.split(/[\s,._\-()[\]{}]+/)
          .filter((w: string) => w.length > 2)
          .map((w: string) => w.toLowerCase());
        return [...tags, ...titleWords];
      });
      const tagCounts: any = {};
      allTags.forEach(t => {
        const cleaned = t.trim().toLowerCase();
        if (cleaned && cleaned.length > 1) {
          tagCounts[cleaned] = (tagCounts[cleaned] || 0) + 1;
        }
      });
      
      const topKeywords = Object.entries(tagCounts)
        .sort((a: any, b: any) => b[1] - a[1])
        .slice(0, 200) // Changed from 15 to 200 to allow user to see more keywords
        .map(([text, count]) => {
          const relatedVideos = processedVideos.filter((v: any) => {
             const tags = (v.snippet.tags || []).map((t:string) => t.toLowerCase());
             const title = v.snippet.title.toLowerCase();
             return tags.includes(text) || title.includes(text);
          });
          const avgVPH = relatedVideos.reduce((acc, curr) => acc + curr.vph, 0) / Math.max(1, relatedVideos.length);
          const trendVideos = relatedVideos.filter(v => v.trendScore > 60);
          const trendVideosCount = trendVideos.length;
          
          let kwScore = (avgVPH * 2) + (trendVideosCount * 5) + (relatedVideos.length * 2);
          return {
            text,
            count,
            vph: avgVPH,
            trendVideosCount,
            trendVideos,
            score: Math.min(100, Math.round(kwScore))
          };
        });

      // 6. Summary metrics
      const avgVPH = processedVideos.reduce((acc, curr) => acc + curr.vph, 0) / Math.max(1, processedVideos.length);
      const trendVideos = processedVideos.filter(v => v.trendScore > 60).length;
      const uniqueChannels = channelIds.length;
      const keywordScore = Math.min(100, Math.round((avgVPH * 1.5) + (trendVideos * 4) + (uniqueChannels * 2)));

      const summary = {
        keyword: kw,
        keywordScore,
        interest: keywordScore > 70 ? 'Rất cao' : keywordScore > 40 ? 'Cao' : 'Trung bình',
        competition: uniqueChannels > 10 ? 'Cao' : uniqueChannels > 5 ? 'Trung bình' : 'Thấp',
        avgVPH,
        trendVideos,
        uniqueChannels,
        totalViews: processedVideos.reduce((acc, curr) => acc + (parseInt(curr.statistics.viewCount) || 0), 0)
      };

      const finalResults = {
        summary,
        keywords: topKeywords,
        videos: processedVideos,
        shorts,
        channels: allChannels.map((c: any) => {
          const chanVideos = processedVideos.filter(v => v.snippet.channelId === c.id);
          return {
            ...c,
            chanVideosCount: chanVideos.length,
            chanVideos, // Pass video data to display in modal
            bestVideo: chanVideos.sort((a: any, b: any) => b.trendScore - a.trendScore)[0]
          };
        }),
        thumbnails: processedVideos.slice(0, 20)
      };

      setNicheResults(finalResults);
      
      // Save to history
      setNicheHistory(prev => {
        const next = [summary, ...prev.filter(h => h.keyword !== kw)].slice(0, 50);
        localStorage.setItem('youtube_niche_history', JSON.stringify(next));
        return next;
      });

      setStatus(`Đã phân tích xong ngách: ${kw}`);
    } catch (err) {
      console.error(err);
      alert('Có lỗi xảy ra khi gọi YouTube API. Vui lòng kiểm tra API Key or Quota.');
    } finally {
      setIsNicheSearching(false);
    }
  };

  const analyzeWithAI = async () => {
    if (!geminiApiKey) {
      setStatus('Lỗi: Vui lòng nhập Gemini API Key ở trên header.');
      return;
    }
    if (!nicheResults) return;

    setIsAiAnalyzing(true);
    setAiAnalysisResult(null);
    setStatus('Đang phân tích ngách bằng trí tuệ nhân tạo (Gemini)...');
    setProgress(30);

    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });

      const prompt = `Bạn là một chuyên gia marketing và nghiên cứu thị trường YouTube hàng đầu Việt Nam. 
      Hãy phân tích dữ liệu sau về ngách "${nicheResults.summary.keyword}" và đưa ra đánh giá chiến lược:
      
      Dữ liệu hệ thống đã quét được:
      - Điểm tổng quan tiềm năng: ${nicheResults.summary.keywordScore}/100
      - Nhu cầu thị trường: ${nicheResults.summary.interest}
      - Mức độ cạnh tranh: ${nicheResults.summary.competition}
      - Lợi nhuận dự kiến (Profitability): ${nicheResults.summary.profitability}
      - Video đang trending: ${nicheResults.summary.trendVideos}
      - Đối thủ cùng ngách: ${nicheResults.summary.uniqueChannels}
      - Tốc độ xem bình quân (VPH): ${nicheResults.summary.avgVPH.toLocaleString()} lượt xem/giờ
      
      Top 8 từ khóa quan trọng liên quan: ${nicheResults.keywords.slice(0, 8).map((k: any) => k.text).join(', ')}
      
      Hãy đưa ra các nội dung sau bằng tiếng Việt theo phong cách chuyên gia, quyết đoán và sắc bén:
      1. Khẳng định: Có nên đầu tư vào ngách này lúc này không? (Tại sao?)
      2. Phân tích điểm yếu của các đối thủ hiện tại trong ngách này.
      3. 5 ý tưởng nội dung (Concept video) độc bản giúp bứt phá nhanh nhất.
      4. Chiến lược tối ưu hóa kênh (Niche-specific) để thu hút đúng tệp người xem.
      5. Nhận định về khả năng kiếm tiền (Adsense, Affiliate, Brand Deal) của ngách này.
      
      Trả về định dạng Markdown chuyên nghiệp, có các tiêu đề (Heading), danh sách gạch đầu dòng và nhấn mạnh (bold) các từ khóa quan trọng. Trình bày đẹp mắt.`;

      setProgress(60);
      const response = await ai.models.generateContent({
        model: geminiModel,
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      });
      const text = response.text || "Lỗi: Không có phản hồi từ AI.";
      setAiAnalysisResult(text);
      setProgress(100);
      setStatus('AI đã phân tích xong. Xem báo cáo chi tiết bên dưới.');
    } catch (error: any) {
      console.error(error);
      setStatus(`Lỗi khi gọi AI: ${error.message}`);
      setProgress(0);
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  const [trendingKeywords, setTrendingKeywords] = useState([
    'sức khỏe', 'animal haircut', 'mini cooking', 'AI tutorial', 'baby sleep music', 
    'pet grooming', 'rust removal', 'RC boat', 'fitness after 50', 'diabetes health tips'
  ]);

  const youtubeFetch = async (endpoint: string, params: Record<string, any>, retryCount = 0): Promise<any> => {
    const maxRetries = config.apiKeys.length;
    if (retryCount >= maxRetries) {
      throw new Error("Tất cả API Key đã cạn kiệt hoặc gặp lỗi liên tục. Vui lòng kiểm tra lại Key!");
    }

    const activeKey = getActiveApiKey()?.trim();
    if (!activeKey || exhaustedKeys.includes(activeKey)) {
      if (rotateApiKey()) {
        return youtubeFetch(endpoint, params, retryCount + 1);
      }
      throw new Error("Tất cả API Key hiện tại đều không khả dụng (Hết chi phí hoặc bị chặn). Hãy thêm Key mới!");
    }

    const baseUrl = `https://www.googleapis.com/youtube/v3/${endpoint}`;
    const urlParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        urlParams.append(key, String(val));
      }
    });
    urlParams.append('key', activeKey);

    try {
      const response = await fetch(`${baseUrl}?${urlParams.toString()}`, {
        signal: abortControllerRef.current?.signal
      });
      
      if (response.status === 403 || response.status === 401) {
        setExhaustedKeys(prev => [...new Set([...prev, activeKey])]);
        if (rotateApiKey()) {
          return youtubeFetch(endpoint, params, retryCount + 1);
        }
        throw new Error("Lỗi xác thực (401/403): API Key không hợp lệ hoặc đã hết hạn dùng.");
      }

      if (response.status === 400) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || "Vui lòng kiểm tra lại tham số.";
        
        // If the error message indicates an invalid key, mark it as exhausted and remove from active rotation
        if (errorMsg.toLowerCase().includes("api key not valid") || errorMsg.toLowerCase().includes("invalid key") || errorMsg.toLowerCase().includes("key")) {
          setExhaustedKeys(prev => [...new Set([...prev, activeKey])]);
          setConfig(prev => ({ ...prev, apiKeys: prev.apiKeys.filter(k => k !== activeKey) }));
          setStatus(`XOÁ KEY LỖI: ${activeKey.slice(0,8)}...`);
          if (rotateApiKey()) {
            return youtubeFetch(endpoint, params, retryCount + 1);
          }
        }
        throw new Error(`Yêu cầu không hợp lệ (400): ${errorMsg}`);
      }

      const data = await response.json();

      if (data.error) {
        const reason = data.error.errors[0]?.reason;
        if (['quotaExceeded', 'dailyLimitExceeded', 'keyInvalid', 'forbidden', 'unauthorized', 'accessNotConfigured'].includes(reason)) {
          setExhaustedKeys(prev => [...new Set([...prev, activeKey])]);
          
          if (['keyInvalid', 'unauthorized', 'forbidden'].includes(reason)) {
            setConfig(prev => ({ ...prev, apiKeys: prev.apiKeys.filter(k => k !== activeKey) }));
            setStatus(`XOÁ KEY CHẾT: ${activeKey.slice(0,8)}... (Lý do: ${reason})`);
          } else {
            setStatus(`BỎ QUA KEY: ${activeKey.slice(0,8)}... (Lý do: ${reason})`);
          }
          
          if (rotateApiKey()) {
            return youtubeFetch(endpoint, params, retryCount + 1);
          } else {
            throw new Error(`Cạn kiệt API Key khả dụng. Vui lòng kiểm tra lại danh sách Key! [${reason}]`);
          }
        }
        throw new Error(`Lỗi YouTube API: ${data.error.message}`);
      }

      // Estimate quota
      if (endpoint === 'search') updateQuotaUsage(100);
      else updateQuotaUsage(1);

      return data;
    } catch (err: any) {
      if (err.name === 'AbortError') throw err;
      throw err;
    }
  };

  // --- Logic Functions ---
  const calculateChannelAge = (publishedAt: string) => {
    const start = new Date(publishedAt).getTime();
    const now = new Date().getTime();
    return Math.floor((now - start) / (1000 * 60 * 60 * 24));
  };

  const calculateNicheScore = (channel: any) => {
    const subs = parseInt(channel.statistics.subscriberCount) || 0;
    const views = parseInt(channel.statistics.viewCount) || 0;
    const videos = parseInt(channel.statistics.videoCount) || 0;
    const age = calculateChannelAge(channel.snippet.publishedAt);
    
    let score = 0;
    if (subs <= 1000 && views >= 100000) score += 3.5;
    else if (subs <= 10000 && views >= 500000) score += 3;
    else if (subs <= 50000 && views >= 1000000) score += 2.5;

    if (videos <= 50) score += 1.5;
    else if (videos <= 200) score += 1;

    const viewToSubRatio = views / Math.max(subs, 1);
    if (viewToSubRatio >= 20) score += 2;
    
    const viewToVideoRatio = views / Math.max(videos, 1);
    if (viewToVideoRatio >= 10000) score += 1;

    if (age < 365 && views > 500000) score += 1;

    return Math.min(score, 10).toFixed(1);
  };

  const fetchRealKeywordIdeas = async (base: string): Promise<KeywordIdea[]> => {
    setStatus('Đang lấy từ khóa thực tế từ YouTube...');
    const ideas: KeywordIdea[] = [];
    const baseScore = (Math.random() * 2 + 1).toFixed(1);
    ideas.push({ text: base, competition: 'Trung bình', score: `${baseScore}/10`, status: 'idle' });

    try {
      // 1. Try Suggest Queries API (Fast, no quota, real search trends)
      try {
        const suggestUrl = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(base)}&hl=vi`;
        const sResponse = await fetch(suggestUrl).catch(() => null);
        if (sResponse && sResponse.ok) {
          const sData = await sResponse.json();
          if (sData && sData[1]) {
            const suggestions = sData[1] as string[];
            suggestions.slice(0, 15).forEach(s => {
              if (s.toLowerCase() !== base.toLowerCase()) {
                const sScore = (Math.random() * 3 + 1.5).toFixed(1);
                const comps = ['Thấp', 'Trung bình', 'Cao'];
                const comp = comps[Math.floor(Math.random() * comps.length)];
                ideas.push({
                  text: s,
                  competition: comp,
                  score: `${sScore}/10`,
                  status: 'idle'
                });
              }
            });
          }
        }
      } catch (err) {
        console.warn('Suggest API error (probably CORS):', err);
      }

      // 2. Use Official API to get tags from top videos (100% Real API data)
      if (ideas.length < 15) {
        const searchRes = await youtubeFetch('search', {
          q: base,
          type: 'video',
          maxResults: 5,
          part: 'id'
        });

        if (searchRes.items && searchRes.items.length > 0) {
          const ids = searchRes.items.map((item: any) => item.id.videoId).join(',');
          const videoRes = await youtubeFetch('videos', {
            id: ids,
            part: 'snippet,statistics'
          });

          videoRes.items.forEach((v: any) => {
            if (v.snippet.tags) {
              v.snippet.tags.slice(0, 5).forEach((tag: string) => {
                if (!ideas.find(i => i.text.toLowerCase() === tag.toLowerCase())) {
                  // Real data metrics from video
                  const views = parseInt(v.statistics.viewCount) || 0;
                  const likes = parseInt(v.statistics.likeCount) || 0;
                  
                  // Heuristic based on real video stats
                  const tagScoreVal = Math.min(9.9, (Math.log10(views + 1) * 0.8 + (likes / (views || 1)) * 50)).toFixed(1);
                  const viewRank = Math.log10(views + 1);
                  const comp = viewRank > 7 ? 'Cao' : viewRank > 5 ? 'Trung bình' : 'Thấp';
                  
                  ideas.push({
                    text: tag,
                    competition: comp,
                    score: `${tagScoreVal}/10`,
                    status: 'idle'
                  });
                }
              });
            }
          });
        }
      }

      return ideas.slice(0, 20); 
    } catch (error) {
      console.error("Error fetching real keywords:", error);
      return ideas;
    }
  };

  const saveConfig = () => {
    // Add to history - exclude empty keys and trim them
    const activeKeys = config.apiKeys.map(k => k.trim()).filter(Boolean);
    const allKeys = [...new Set([...apiKeysHistory, ...activeKeys])];
    setApiKeysHistory(allKeys);
    localStorage.setItem('youtube_api_keys_history', JSON.stringify(allKeys));

    localStorage.setItem('youtube_api_keys', JSON.stringify(config.apiKeys.map(k => k.trim()).filter(Boolean)));
    localStorage.setItem('youtube_hunter_config', JSON.stringify({
      ...config,
      apiKeys: [] // Don't double save keys
    }));
    setStatus('Đã lưu cấu hình.');
  };

  const getLanguageForRegion = (regionCodeCode: string): string => {
    const mapping: Record<string, string> = {
      'US': 'English', 'GB': 'English', 'CA': 'English', 'AU': 'English', 'NZ': 'English',
      'VN': 'Vietnamese',
      'ES': 'Spanish', 'MX': 'Spanish', 'AR': 'Spanish', 'CO': 'Spanish',
      'BR': 'Portuguese', 'PT': 'Portuguese',
      'RU': 'Russian',
      'JP': 'Japanese',
      'KR': 'Korean',
      'CN': 'Chinese', 'TW': 'Chinese',
      'FR': 'French',
      'DE': 'German',
      'IN': 'English', // India usually searches well in English on YT
      'TH': 'Thai',
      'ID': 'Indonesian',
      'IT': 'Italian',
      'TR': 'Turkish',
      'SA': 'Arabic', 'EG': 'Arabic'
    };
    return mapping[regionCodeCode] || 'English';
  };

  const translateKeywordSimple = (keyword: string, targetLang: string): string => {
    if (targetLang === 'Vietnamese') return keyword;
    
    // Heuristic dictionary for common niche keywords
    const dictionaries: Record<string, Record<string, string>> = {
      'quân sự': { 'English': 'military', 'Spanish': 'militar', 'French': 'militaire', 'Russian': 'военный', 'Japanese': '軍事', 'Chinese': '军事', 'German': 'militär', 'Portuguese': 'militar' },
      'military': { 'English': 'military', 'Spanish': 'militar', 'French': 'militaire' },
      'sức khỏe': { 'English': 'health', 'Spanish': 'salud', 'French': 'santé', 'Russian': 'здоровье', 'Japanese': '健康', 'Chinese': '健康', 'German': 'gesundheit', 'Portuguese': 'saúde' },
      'game': { 'English': 'gaming', 'Spanish': 'juegos', 'French': 'jeux' },
      'tin tức': { 'English': 'news', 'Spanish': 'noticias', 'French': 'nouvelles', 'Russian': 'новости', 'Japanese': 'ニュース', 'Chinese': '新闻' },
      'news': { 'English': 'news', 'Spanish': 'noticias', 'French': 'nouvelles' },
      'kiếm tiền': { 'English': 'make money', 'Spanish': 'ganar dinero', 'French': 'gagner de l\'argent' },
      'funny': { 'English': 'funny', 'Spanish': 'divertido', 'French': 'drôle' },
      'vui nhộn': { 'English': 'funny', 'Spanish': 'divertido', 'French': 'drôle' }
    };

    const lowerKw = keyword.toLowerCase().trim();
    // Try to find a match in the dictionary
    for (const [key, langs] of Object.entries(dictionaries)) {
      if (lowerKw.includes(key) && (langs as any)[targetLang]) {
        // If the original keyword contains the key (e.g. "quân sự thế giới"), 
        // we replace just that part if possible, or just return the translation for now
        return keyword.replace(new RegExp(key, 'gi'), (langs as any)[targetLang]);
      }
    }

    return keyword; 
  };

  const getAutoHuntSeeds = (regionCode?: string) => {
    const region = regionCode || config.region || 'VN';
    const seedMap: Record<string, string[]> = {
      VN: [
        'ai công cụ mới', 'chatgpt', 'gemini ai', 'tạo video bằng ai', 'kiếm tiền online',
        'tin tức 24h', 'công nghệ mới', 'review app', 'youtube shorts', 'mẹo điện thoại',
        'du lịch việt nam', 'ẩm thực hot', 'game mobile', 'bóng đá việt nam'
      ],
      US: [
        'ai tools', 'chatgpt', 'gemini ai', 'make money online', 'youtube automation',
        'viral shorts', 'tech news', 'productivity apps', 'iphone tips', 'trending news',
        'travel vlog', 'gaming highlights', 'finance tips'
      ],
      GB: ['ai tools', 'chatgpt', 'uk trending news', 'tech news', 'side hustle', 'football highlights', 'travel vlog'],
      JP: ['AI ツール', 'ChatGPT', '日本 トレンド', 'テックニュース', '旅行 vlog', 'ゲーム 実況'],
      KR: ['AI 도구', 'ChatGPT', '한국 트렌드', '테크 뉴스', '여행 브이로그', '게임 하이라이트'],
      TH: ['เครื่องมือ ai', 'chatgpt', 'เทรนด์ไทย', 'ข่าวเทคโนโลยี', 'ท่องเที่ยว', 'เกมมือถือ'],
      ID: ['tools ai', 'chatgpt', 'tren indonesia', 'berita teknologi', 'cara menghasilkan uang', 'game mobile'],
      PH: ['ai tools', 'chatgpt', 'philippines trending', 'tech news', 'side hustle', 'travel vlog'],
      MY: ['ai tools', 'chatgpt', 'malaysia trending', 'tech news', 'buat duit online', 'travel vlog'],
      SG: ['ai tools', 'chatgpt', 'singapore trending', 'tech news', 'side hustle', 'finance tips'],
      DE: ['ki tools', 'chatgpt', 'deutschland trends', 'technik news', 'geld verdienen online'],
      FR: ['outils ia', 'chatgpt', 'tendances france', 'actualité tech', 'gagner argent en ligne'],
      BR: ['ferramentas ia', 'chatgpt', 'tendências brasil', 'notícias tecnologia', 'ganhar dinheiro online'],
      MX: ['herramientas ia', 'chatgpt', 'tendencias méxico', 'noticias tecnología', 'ganar dinero online'],
      ES: ['herramientas ia', 'chatgpt', 'tendencias españa', 'noticias tecnología', 'ganar dinero online'],
      IT: ['strumenti ai', 'chatgpt', 'tendenze italia', 'notizie tecnologia', 'guadagnare online'],
      RU: ['инструменты ai', 'chatgpt', 'тренды россия', 'технологии новости', 'заработок онлайн']
    };

    const fallback = ['ai tools', 'chatgpt', 'trending shorts', 'tech news', 'make money online', 'travel vlog', 'gaming highlights'];
    return seedMap[region] || fallback;
  };

  const normalizeHunterKeyword = (value: string) =>
    (value || '')
      .toLowerCase()
      .replace(/#/g, ' ')
      .replace(/[^\p{L}\p{N}\s._-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const calculateHunterCandidateScore = (video: any, channel: any, seed: string) => {
    const stats = video?.statistics || {};
    const channelStats = channel?.statistics || {};
    const views = parseInt(stats.viewCount) || 0;
    const subs = parseInt(channelStats.subscriberCount) || 0;
    const totalChannelViews = parseInt(channelStats.viewCount) || 0;
    const channelVideoCount = parseInt(channelStats.videoCount) || 0;
    const vph = calculateVPH(views, video?.snippet?.publishedAt);
    const viewSubRatio = views / Math.max(1, subs);
    const avgChannelView = totalChannelViews / Math.max(1, channelVideoCount);
    const outlierScore = views / Math.max(1, avgChannelView);
    const channelAgeDays = calculateChannelAge(channel?.snippet?.publishedAt || new Date().toISOString());
    const uploadRegularity = channelVideoCount / Math.max(1, channelAgeDays / 30);
    const title = normalizeHunterKeyword(video?.snippet?.title || '');
    const seedText = normalizeHunterKeyword(seed);
    const seedWords = seedText.split(' ').filter(Boolean);
    const similarity = seedWords.length
      ? seedWords.reduce((acc, word) => acc + (title.includes(word) ? 1 : 0), 0) / Math.max(1, seedWords.length)
      : 0;

    let score = 0;
    score += Math.min(35, vph / 10); // VPH cao
    score += Math.min(25, viewSubRatio * 2.5); // View/Sub Ratio cao
    score += Math.min(20, outlierScore * 4); // Outlier Score cao
    score += Math.min(10, uploadRegularity * 1.2); // Upload gần đây đều
    score += Math.min(10, similarity * 10); // gần cụm trend đang scan

    if (subs > 0 && subs <= 100000) score += 12;
    else if (subs <= 500000) score += 6;

    return {
      score: Math.min(100, Math.round(score)),
      vph,
      viewSubRatio,
      outlierScore,
      uploadRegularity
    };
  };

  const startHunter = async () => {
    if (config.apiKeys.length === 0) {
      setLastError('Vui lòng nhập ít nhất một YouTube API Key trong phần Cấu hình.');
      return;
    }

    const rawKeyword = (config.keyword || '').trim();
    const isAutoHunt = !rawKeyword;

    setResults([]); // Xóa kết quả cũ khi tìm mới
    resultsRef.current = []; // Đồng bộ ref lập tức
    setIsHunting(true);
    isHuntingRef.current = true;
    setLastError(null);
    setStatus(isAutoHunt ? 'Đang tự động lọc kênh hot theo khu vực/thời gian...' : 'Đang khởi tạo...');
    setProgress(5);
    if (typeof AbortController !== 'undefined') {
      try {
        abortControllerRef.current = new AbortController();
      } catch (e) {
        console.warn("AbortController constructor failed", e);
        abortControllerRef.current = null;
      }
    }

    if (!isAutoHunt) {
      const ideas = await fetchRealKeywordIdeas(rawKeyword);
      setKeywordIdeas(ideas);
    } else {
      setKeywordIdeas([]);
    }

    try {
      const cycles = config.regions.includes('ALL')
        ? REGIONS.map(r => r.code).filter(Boolean)
        : config.regions;
      const currentRegion = cycles.length > 0 ? cycles[0] : (config.region || 'VN');
      const regionTag = currentRegion ? ' [QG: ' + currentRegion + ']' : '';
      const publishedAfter = getPublishedAfterDate(config.publishedAfter);

      let scanKeywords: string[] = [];
      if (isAutoHunt) {
        scanKeywords = getAutoHuntSeeds(currentRegion).slice(0, 10);
      } else {
        let searchKeyword = rawKeyword;
        if (currentRegion && currentRegion !== 'VN') {
          const targetLang = getLanguageForRegion(currentRegion);
          searchKeyword = translateKeywordSimple(rawKeyword, targetLang);
        }
        scanKeywords = [searchKeyword];
      }

      for (let k = 0; k < scanKeywords.length; k++) {
        if (!isHuntingRef.current || resultsRef.current.length >= STOP_LIMIT) break;
        const searchKeyword = scanKeywords[k];
        const shownKeyword = isAutoHunt ? `tự động: ${searchKeyword}` : rawKeyword;

        setStatus(
          isAutoHunt
            ? `Tự động lọc kênh hot ${regionTag}: cụm "${searchKeyword}" (${resultsRef.current.length}/${STOP_LIMIT})`
            : `Đang quét: ${shownKeyword}... (${resultsRef.current.length}/${STOP_LIMIT})${regionTag}`
        );

        const searchRes = await youtubeFetch('search', {
          part: 'snippet',
          type: 'video',
          q: searchKeyword,
          regionCode: currentRegion,
          maxResults: Math.min(Math.max(config.maxVideos, 20), 50),
          order: 'viewCount',
          publishedAfter
        });

        if (!searchRes.items?.length) continue;

        const videoIds = searchRes.items
          .map((item: any) => item?.id?.videoId)
          .filter(Boolean)
          .slice(0, 50);

        const videoRes = await youtubeFetch('videos', {
          part: 'snippet,statistics,contentDetails',
          id: videoIds.join(',')
        });

        const videos = videoRes.items || [];
        const channelIds = [...new Set(videos.map((v: any) => v.snippet.channelId))]
          .filter((id: any) => !resultsRef.current.some(r => r.id === id));

        if (channelIds.length === 0) continue;

        const channelRes = await youtubeFetch('channels', {
          part: 'snippet,statistics,contentDetails',
          id: channelIds.join(','),
        });

        const channelMap = new Map();
        (channelRes.items || []).forEach((channel: any) => channelMap.set(channel.id, channel));

        const candidates = videos
          .map((video: any) => {
            const channel = channelMap.get(video.snippet.channelId);
            if (!channel) return null;

            const subs = parseInt(channel.statistics.subscriberCount) || 0;
            const views = parseInt(channel.statistics.viewCount) || 0;
            const videoCount = parseInt(channel.statistics.videoCount) || 0;
            const bestVideoViews = parseInt(video.statistics?.viewCount) || 0;
            const metrics = calculateHunterCandidateScore(video, channel, searchKeyword);

            const passed =
              subs >= config.minSub &&
              subs <= config.maxSub &&
              videoCount >= config.minVideo &&
              (config.maxVideo ? videoCount <= config.maxVideo : true) &&
              views >= config.minViews;

            // Khi ô từ khóa trống, ưu tiên video mới hiệu suất tốt hơn tổng view toàn kênh.
            const autoPassed = isAutoHunt
              ? passed && (metrics.vph >= 1 || metrics.viewSubRatio >= 1 || metrics.outlierScore >= 1.5 || bestVideoViews >= Math.max(5000, config.minViews / 2))
              : passed;

            if (!autoPassed) return null;

            return {
              channel,
              video,
              metrics,
              rankScore: metrics.score,
              subs,
              views,
              videoCount
            };
          })
          .filter(Boolean)
          .sort((a: any, b: any) => b.rankScore - a.rankScore)
          .slice(0, STOP_LIMIT);

        for (const candidate of candidates as any[]) {
          if (!isHuntingRef.current || resultsRef.current.length >= STOP_LIMIT) break;
          if (resultsRef.current.some(r => r.id === candidate.channel.id)) continue;

          const channel = candidate.channel;
          const scoreText = isAutoHunt
            ? (candidate.rankScore / 10).toFixed(1)
            : calculateNicheScore(channel);

          const newResult: ChannelResult = {
            icon: channel.snippet.thumbnails.default.url,
            name: channel.snippet.title,
            id: channel.id,
            url: `https://youtube.com/channel/${channel.id}`,
            country: channel.snippet.country || currentRegion || 'N/A',
            publishedAt: channel.snippet.publishedAt.split('T')[0],
            age: calculateChannelAge(channel.snippet.publishedAt),
            subs: candidate.subs,
            views: candidate.views,
            videos: candidate.videoCount,
            score: scoreText,
            keywordTitle: isAutoHunt
              ? `Auto ${currentRegion || 'Global'} · ${searchKeyword} · VPH ${Math.round(candidate.metrics.vph).toLocaleString('vi-VN')}`
              : rawKeyword,
            lastVideoId: candidate.video.id
          };

          setResults(prev => {
            const updated = [...prev, newResult].slice(0, STOP_LIMIT);
            resultsRef.current = updated;
            localStorage.setItem('youtube_hunter_results', JSON.stringify(updated));
            return updated;
          });

          const currentProgress = Math.min(10 + (resultsRef.current.length / STOP_LIMIT) * 90, 99);
          setProgress(currentProgress);
        }
      }

      if (resultsRef.current.length >= STOP_LIMIT) {
        setStatus('🎯 ĐÃ GOM ĐỦ 10 KÊNH NGON! Đã tự động dừng.');
      } else if (!isHuntingRef.current) {
        setStatus('Đã dừng bởi người dùng.');
      } else if (isAutoHunt) {
        setStatus(`Hoàn tất tự động lọc theo khu vực/thời gian. Tìm được ${resultsRef.current.length} kênh.`);
      } else {
        setStatus(`Hoàn tất quét. Tìm được ${resultsRef.current.length} kênh.`);
      }
      setProgress(100);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        const errMsg = `Lỗi: ${err.message}`;
        setStatus(errMsg);
        setLastError(errMsg);
      }
    } finally {
      setIsHunting(false);
      isHuntingRef.current = false;
    }
  };

  const toggleRegion = (code: string) => {
    setConfig(prev => {
      let nextRegions = [...prev.regions];
      if (code === 'ALL') {
        nextRegions = ['ALL'];
      } else {
        nextRegions = nextRegions.filter(r => r !== 'ALL');
        if (nextRegions.includes(code)) {
          nextRegions = nextRegions.filter(r => r !== code);
        } else {
          nextRegions.push(code);
        }
      }
      if (nextRegions.length === 0) nextRegions = ['VN'];
      return { ...prev, regions: nextRegions };
    });
  };

  const stopHunter = () => {
    setIsHunting(false);
    isHuntingRef.current = false;
    abortControllerRef.current?.abort();
    setStatus('Đang dừng...');
  };

  const formatDetailedDate = (isoString: string) => {
    const d = new Date(isoString);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const dateStr = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
    const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    
    // Get timezone offset
    const offset = -d.getTimezoneOffset();
    const isVN = offset === 420; // +7 hours * 60 mins
    const tzStr = isVN ? 'VN - GMT+7' : 'UTC';
    
    return `${dateStr} - ${timeStr} (${tzStr})`;
  };

  const analyzeSpy = async (targetId?: string | any) => {
    const query = (typeof targetId === 'string' && targetId) ? targetId : spyInput;
    if (!query || typeof query !== 'string') return;
    const input = query.trim();
    if (!input) return;

    setStatus('Đang phân tích đối thủ...');
    setSpyResult(null);

    try {
      let channelId = input;
      
      // Better URL parsing
      if (channelId.includes('youtube.com/channel/')) {
        channelId = channelId.split('/channel/')[1].split('/')[0];
      } else if (channelId.includes('youtube.com/@') || channelId.startsWith('@') || (channelId.includes('youtube.com/') && channelId.includes('@'))) {
        const handleMatch = channelId.match(/(@[a-zA-Z0-9._-]+)/);
        if (handleMatch) {
          const handle = handleMatch[1];
          const search = await youtubeFetch('search', {
            part: 'snippet',
            q: handle,
            type: 'channel',
            maxResults: 1
          });
          if (search.items?.[0]) {
            channelId = search.items[0].snippet.channelId;
          } else {
            throw new Error(`Không tìm thấy kênh với handle: ${handle}`);
          }
        }
      } else if (channelId.includes('youtube.com/user/')) {
        const username = channelId.split('/user/')[1].split('/')[0];
        const search = await youtubeFetch('channels', {
          part: 'id',
          forUsername: username
        });
        if (search.items?.[0]) channelId = search.items[0].id;
      }

      const channelRes = await youtubeFetch('channels', {
        part: 'snippet,statistics,contentDetails',
        id: channelId
      });

      if (!channelRes.items?.[0]) throw new Error('Không tìm thấy kênh.');
      const channel = channelRes.items[0];
      const uploadsId = channel.contentDetails.relatedPlaylists.uploads;

      const playlistRes = await youtubeFetch('playlistItems', {
        part: 'snippet,contentDetails',
        playlistId: uploadsId,
        maxResults: 15
      });

      const videoIds = playlistRes.items.map((v: any) => v.contentDetails.videoId);
      const videoRes = await youtubeFetch('videos', {
        part: 'snippet,statistics,contentDetails',
        id: videoIds.join(',')
      });

      const processedVideos = videoRes.items.map((v: any) => {
        const age = calculateChannelAge(v.snippet.publishedAt) || 1;
        return {
          id: v.id,
          title: v.snippet.title,
          thumbnail: v.snippet.thumbnails.default.url,
          date: formatDetailedDate(v.snippet.publishedAt),
          views: parseInt(v.statistics.viewCount),
          viewsPerDay: Math.round(parseInt(v.statistics.viewCount) / age),
          url: `https://www.youtube.com/watch?v=${v.id}`,
          tags: v.snippet.tags || []
        };
      });

      const totalRecentViews = processedVideos.reduce((a, b) => a + b.views, 0);
      const avgViews = Math.round(totalRecentViews / processedVideos.length);
      const maxViews = Math.max(...processedVideos.map(v => v.views));
      const topVideo = processedVideos.find(v => v.views === maxViews);

      // Simple keyword extraction
      const keywordMap: Record<string, number> = {};
      const tagMap: Record<string, number> = {};
      processedVideos.forEach(v => {
        const words = v.title.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/);
        words.forEach(w => {
          if (w && w.length > 2) keywordMap[w] = (keywordMap[w] || 0) + 1;
        });
        v.tags.forEach(tag => {
          tagMap[tag] = (tagMap[tag] || 0) + 1;
        });
      });

      const topKeywordsArr = Object.entries(keywordMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([text, count]) => ({ text, count }));

      const topTagsArr = Object.entries(tagMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([text, count]) => ({ text, count }));

      const topKeywordsStr = topKeywordsArr.map(k => `${k.text} (${k.count})`).join(', ');
      const topTagsStr = topTagsArr.map(k => `${k.text} (${k.count})`).join(', ');

      const report = `Kênh: ${channel.snippet.title} (${channel.id}) | Quốc gia: ${channel.snippet.country || 'N/A'} | Tuổi kênh: ${calculateChannelAge(channel.snippet.publishedAt)} ngày
 Đăng ký: ${parseInt(channel.statistics.subscriberCount).toLocaleString()} | Tổng lượt xem: ${parseInt(channel.statistics.viewCount).toLocaleString()} | Video: ${channel.statistics.videoCount}
 Phân tích gần đây: ${processedVideos.length} | View/ngày: tb ${avgViews} • cao nhất ${maxViews.toLocaleString()}
 Video hàng đầu: ${topVideo?.url} (lượt xem=${topVideo?.views.toLocaleString()})

Thẻ hàng đầu:
${topTagsStr}

Từ khóa hàng đầu:
${topKeywordsStr}`;

      const finalSpyResult = { 
        channelInfo: {
          ...channel,
          logo: channel.snippet.thumbnails.default.url
        }, 
        videos: processedVideos, 
        report,
        recentAnalyzed: processedVideos.length,
        avgViewsPerDay: avgViews,
        maxViewsPerDay: maxViews,
        topKeywords: topKeywordsArr,
        topTags: topTagsArr
      };
      setSpyResult(finalSpyResult);

      // Add to Spy Projects (Limit to last 30)
      setSpyProjects(prev => {
        const updated = [finalSpyResult, ...prev.filter(p => p.channelInfo.id !== finalSpyResult.channelInfo.id)].slice(0, 30);
        localStorage.setItem('youtube_spy_projects', JSON.stringify(updated));
        return updated;
      });

      setStatus('Phân tích đối thủ hoàn tất!');
    } catch (err: any) {
      setStatus(`Lỗi: ${err.message}`);
    }
  };

  const updateTracking = async () => {
    if (trackingChannels.length === 0) return;
    setStatus('Đang cập nhật số liệu tracking...');
    
    try {
      // Chunking IDs (max 50 IDs per request for YouTube API)
      const validChannels = trackingChannels.filter(c => c.id);
      if (validChannels.length === 0) {
        setStatus('Không tìm thấy ID kênh hợp lệ để cập nhật.');
        return;
      }

      const chunkedIds: string[][] = [];
      for (let i = 0; i < validChannels.length; i += 50) {
        chunkedIds.push(validChannels.slice(i, i + 50).map(c => c.id));
      }

      let allItems: any[] = [];
      for (const ids of chunkedIds) {
        const res = await youtubeFetch('channels', {
          part: 'snippet,statistics',
          id: ids.join(',')
        });
        if (res.items) {
          allItems = [...allItems, ...res.items];
        }
      }

      const now = new Date().toISOString().split('T')[0];
      setTrackingChannels(prev => {
        const next = prev.map(c => {
          const item = allItems.find((i: any) => i.id === c.id);
          if (!item) return c;
          
          const newSnapshot = {
            date: now,
            subs: parseInt(item.statistics.subscriberCount) || 0,
            views: parseInt(item.statistics.viewCount) || 0,
            videos: parseInt(item.statistics.videoCount) || 0
          };

          // Update icon if missing or updated
          const updatedIcon = item.snippet?.thumbnails?.default?.url || c.icon;

          const history = [...c.history];
          const last = history[history.length - 1];
          
          // Check if values actually changed to record a new history point
          if (newSnapshot.subs !== last.subs || newSnapshot.views !== last.views) {
            history.push(newSnapshot);
            // Limit history to last 10 snapshots to keep UI clean
            if (history.length > 10) history.shift();
          } else {
            // If values are same, just update the date/timestamp of the last record if it's a new day
            // or just ensure it's up to date
            history[history.length - 1] = newSnapshot;
          }

          return { ...c, history, icon: updatedIcon };
        });
        localStorage.setItem('youtube_tracking_channels', JSON.stringify(next));
        return next;
      });
      setStatus('Cập nhật tracking hoàn tất.');
      alert(`Đã cập nhật số liệu mới nhất cho ${trackingChannels.length} kênh!`);
    } catch (err: any) {
      setStatus(`Lỗi: ${err.message}`);
    }
  };

  const downloadTXT = (type: 'hunter' | 'spy' | 'tracking') => {
    let content = '';
    let filename = '';
    const now = new Date().toLocaleDateString('vi-VN').replace(/\//g, '-');

    if (type === 'hunter') {
      content = '==================================================\n';
      content += '   BÁO CÁO DANH SÁCH KÊNH QUÉT ĐƯỢC (HUNTER)      \n';
      content += `   Thời gian: ${new Date().toLocaleString('vi-VN')}           \n`;
      content += '==================================================\n\n';
      
      results.forEach((r, idx) => {
        content += `【${idx + 1}】 KÊNH: ${r.name.toUpperCase()}\n`;
        content += `   ID Kênh: ${r.id}\n`;
        content += `   Đường dẫn: ${r.url}\n`;
        content += `   Thông tin: ${r.country || 'N/A'} | Tạo: ${r.publishedAt} (${r.age} ngày tuổi)\n`;
        content += `   Chỉ số: ${r.subs.toLocaleString()} Subs | ${r.views.toLocaleString()} Views | ${r.videos.toLocaleString()} Videos\n`;
        content += `   Đánh giá: ĐIỂM SEO [${r.score}]\n`;
        content += '--------------------------------------------------\n';
      });
      filename = `Ket_Qua_San_Ngach_Youtube_${now}.txt`;
    } else if (type === 'spy' && spyResult) {
      content = '==================================================\n';
      content += `   BÁO CÁO PHÂN TÍCH SPY KÊNH: ${spyResult.channelInfo.snippet.title.toUpperCase()}   \n`;
      content += `   ID Kênh: ${spyResult.channelInfo.id} \n`;
      content += `   Thời gian: ${new Date().toLocaleString('vi-VN')} \n`;
      content += '==================================================\n\n';
      
      spyResult.videos.forEach((v, idx) => {
        content += `【${idx + 1}】 TIÊU ĐỀ: ${v.title}\n`;
        content += `   ID Video: ${v.id}\n`;
        content += `   Link: ${v.url}\n`;
        content += `   Thống kê: ${v.views.toLocaleString()} Views | ${v.viewsPerDay.toLocaleString()} Views/Ngày\n`;
        content += `   Ngày đăng: ${v.date}\n`;
        content += '--------------------------------------------------\n';
      });
      filename = `Phan_Tich_Spy_Youtube_${spyResult.channelInfo.snippet.title.replace(/\s+/g, '_')}_${now}.txt`;
    } else if (type === 'tracking') {
      content = '==================================================\n';
      content += '   BÁO CÁO THEO DÕI ĐỐI THỦ (TRACKING)            \n';
      content += `   Thời gian: ${new Date().toLocaleString('vi-VN')}           \n`;
      content += '==================================================\n\n';
      
      trackingChannels.forEach((c, idx) => {
        const h = c.history;
        const last = h[h.length - 1];
        const prev = h.length > 1 ? h[h.length - 2] : null;
        
        const subDiff = prev ? last.subs - prev.subs : 0;
        const viewDiff = prev ? last.views - prev.views : 0;

        content += `【${idx + 1}】 KÊNH: ${c.name.toUpperCase()}\n`;
        content += `   ID Kênh: ${c.id}\n`;
        content += `   Link: https://www.youtube.com/channel/${c.id}\n`;
        content += `   Lịch sử Sub: ${h.map(i => i.subs.toLocaleString()).join(' → ')}\n`;
        content += `   Tăng Sub: +${subDiff.toLocaleString()} / lượt check gần nhất\n`;
        content += `   Lịch sử View: ${h.map(i => i.views.toLocaleString()).join(' → ')}\n`;
        content += `   Tăng View: +${viewDiff.toLocaleString()} / lượt check gần nhất\n`;
        content += `   Tổng Video: ${last.videos.toLocaleString()}\n`;
        content += `   Trạng thái: ${subDiff > 0 || viewDiff > 0 ? 'ĐANG TĂNG TRƯỞNG' : 'ỔN ĐỊNH'}\n`;
        content += '--------------------------------------------------\n';
      });
      filename = `Tracking_Doi_Thu_Youtube_${now}.txt`;
    }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  const clearResults = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    triggerConfirm('Xóa kết quả', 'Xóa sạch kết quả săn kênh?', () => {
      setResults([]);
      resultsRef.current = [];
      localStorage.setItem('youtube_hunter_results', '[]');
      setStatus('Đã xóa sạch kết quả.');
    });
  };

  const resetConfig = () => {
    triggerConfirm('Khôi phục cài đặt', 'Khôi phục cài đặt về mặc định? (Giữ lại API Keys)', () => {
      const currentKeys = config.apiKeys;
      setConfig({ ...DEFAULT_CONFIG, apiKeys: currentKeys });
      setResults([]);
      resultsRef.current = [];
      localStorage.removeItem('youtube_hunter_config');
      localStorage.removeItem('youtube_hunter_results');
      setStatus('Đã khôi phục cài đặt mặc định (API Key vẫn được giữ).');
    });
  };

  // --- Context Menu Handlers ---
  const handleContextMenu = (e: React.MouseEvent, channel: ChannelResult) => {
    e.preventDefault();
    setSelectedResultId(channel.id);
    setMenuPos({ x: e.clientX, y: e.clientY, visible: true, channel });
  };

  const openChannelActionMenu = (e: React.MouseEvent, channel: ChannelResult) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedResultId(channel.id);

    const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();

    setMenuPos({
      x: isMobile ? 12 : rect.left,
      y: isMobile ? Math.max(80, window.innerHeight - 290) : rect.bottom + 6,
      visible: true,
      channel
    });
  };

  const closeMenu = () => setMenuPos({ ...menuPos, visible: false });

  const addToTracking = (channel: ChannelResult) => {
    if (trackingChannels.some(c => c.id === channel.id)) {
      setStatus('Kênh này đã có trong danh sách theo dõi.');
    } else {
      const newTrack: TrackingChannel = {
        id: channel.id,
        name: channel.name,
        icon: channel.icon,
        history: [{
          date: new Date().toISOString().split('T')[0],
          subs: channel.subs,
          views: channel.views,
          videos: channel.videos
        }]
      };
      const updated = [...trackingChannels, newTrack];
      setTrackingChannels(updated);
      localStorage.setItem('youtube_tracking_channels', JSON.stringify(updated));
      setStatus(`Đã thêm ${channel.name} vào tracking.`);
    }
    closeMenu();
  };

  const addAllToTracking = () => {
    if (results.length === 0) {
      setStatus('Không có kết quả nào để thêm.');
      return;
    }

    const newChannels = results.filter(res => !trackingChannels.some(tc => tc.id === res.id));
    
    if (newChannels.length === 0) {
      setStatus('Tất cả các kênh này đã có trong danh sách theo dõi.');
      return;
    }

    const updatedTracking = [
      ...trackingChannels,
      ...newChannels.map(channel => ({
        id: channel.id,
        name: channel.name,
        icon: channel.icon,
        history: [{
          date: new Date().toISOString().split('T')[0],
          subs: channel.subs,
          views: channel.views,
          videos: channel.videos
        }]
      }))
    ];

    setTrackingChannels(updatedTracking);
    localStorage.setItem('youtube_tracking_channels', JSON.stringify(updatedTracking));
    setStatus(`Đã thêm ${newChannels.length} kênh vào tracking.`);
    alert(`Đã thêm ${newChannels.length} kênh mới vào danh sách theo dõi!`);
  };

  const goToSpy = (channelId: string) => {
    setSpyInput(channelId);
    setActiveTab(2);
    closeMenu();
    // Direct call with the ID to ensure it runs immediately
    analyzeSpy(channelId);
  };

  const formatDuration = (pt: string) => {
    if (!pt || typeof pt !== 'string') return 'N/A';
    const time = pt.replace('PT', '').toLowerCase();
    return time.replace('h', 'h ').replace('m', 'm ').replace('s', 's');
  };

  const getCategoryName = (id: string) => {
    const cats: Record<string, string> = {
      '1': 'Film & Animation', '2': 'Autos & Vehicles', '10': 'Music', '15': 'Pets & Animals',
      '17': 'Sports', '18': 'Short Movies', '19': 'Travel & Events', '20': 'Gaming',
      '21': 'Videoblogging', '22': 'People & Blogs', '23': 'Comedy', '24': 'Entertainment',
      '25': 'News & Politics', '26': 'Howto & Style', '27': 'Education', '28': 'Science & Technology',
      '29': 'Nonprofits & Activism', '30': 'Movies', '31': 'Anime/Animation', '32': 'Action/Adventure',
      '33': 'Classics', '34': 'Comedy', '35': 'Documentary', '36': 'Drama', '37': 'Family',
      '38': 'Foreign', '39': 'Horror', '40': 'Sci-Fi/Fantasy', '41': 'Thriller', '42': 'Shorts',
      '43': 'Shows', '44': 'Trailers'
    };
    return cats[id] || 'Unknown';
  };

  const analyzeVideo = async (targetId?: string | any) => {
    // If targetId is a React event, ignore it and use videoInput state
    const query = (typeof targetId === 'string' && targetId) ? targetId : videoInput;
    if (!query || typeof query !== 'string') return;
    
    if (typeof targetId === 'string') {
      setVideoInput(targetId);
      setActiveTab(4); // Switch to Video Analysis tab
    }
    
    setIsAnalyzingVideo(true);
    setStatus('Đang kiểm tra thông tin video...');
    setVideoResult(null);

    try {
      const extractVideoId = (input: string) => {
        if (!input || typeof input !== 'string') return "";
        let text = input.trim();
        
        // Remove time tracking if present (e.g., &t=123s)
        text = text.split('&t=')[0].split('?t=')[0];

        // Comprehensive Regex for YouTube Video URLs
        const patterns = [
          /(?:v=|v\/|embed\/|shorts\/|live\/|youtu\.be\/|\/v\/|watch\?v%3D|watch\?feature=player_embedded&v=|watch\?v=)([^"&?\/\s]{11})/i,
          /^[a-zA-Z0-9_-]{11}$/ // Case where only ID is provided
        ];

        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match && match[1]) {
            return match[1];
          } else if (match && !pattern.source.includes('(')) {
            // Case for the 11-char sequence if no capture group
            return match[0];
          }
        }
        
        // Advanced fallback: look for any 11-char sequence that follows a slash or equals
        const advancedMatch = text.match(/(?:[\/v=])([a-zA-Z0-9_-]{11})(?:[&?\/]|$)/);
        if (advancedMatch) return advancedMatch[1];

        // Final fallback: just find the first 11-char ID-like sequence
        const coarseMatch = text.match(/[a-zA-Z0-9_-]{11}/);
        if (coarseMatch) return coarseMatch[0];

        return text;
      };

      const videoId = extractVideoId(query);

      const res = await youtubeFetch('videos', {
        id: videoId,
        part: 'snippet,statistics,contentDetails,topicDetails'
      });

      if (res.items && res.items.length > 0) {
        const v = res.items[0];
        
        // Fetch channel info to get subscriber count and real country
        const channelRes = await youtubeFetch('channels', {
          id: v.snippet.channelId,
          part: 'snippet,statistics'
        });
        
        if (channelRes.items && channelRes.items.length > 0) {
          v._channelInfo = channelRes.items[0];
        }

        // Fetch comments
        try {
          const comRes = await youtubeFetch('commentThreads', {
            videoId: videoId,
            part: 'snippet',
            maxResults: 10,
            order: 'relevance'
          });
          if (comRes.items && comRes.items.length > 0) {
            v._comments = comRes.items.map((it: any) => it.snippet.topLevelComment.snippet);
          }
        } catch (e) {
          console.warn("Could not fetch comments", e);
        }

        setVideoResult(v);
        setStatus('Đã lấy thông tin video.');

        // Save to project history
        setVideoProjects(prev => {
          const exists = prev.find(p => p.id === v.id);
          let next;
          if (exists) {
            next = [v, ...prev.filter(p => p.id !== v.id)];
          } else {
            next = [v, ...prev];
          }
          const limited = next.slice(0, 20); // Keep last 20
          localStorage.setItem('youtube_video_projects', JSON.stringify(limited));
          return limited;
        });
      } else {
        alert('Không tìm thấy video. Vui lòng kiểm tra lại ID/URL.');
        setStatus('Không tìm thấy video.');
      }
    } catch (error) {
      console.error(error);
      setStatus('Lỗi khi kiểm tra video.');
    } finally {
      setIsAnalyzingVideo(false);
    }
  };
  const downloadAsTxt = (text: string, filename: string) => {
    const element = document.createElement("a");
    const file = new Blob([text], {type: 'text/plain;charset=utf-8'});
    element.href = URL.createObjectURL(file);
    element.download = `${filename.replace(/[^a-z0-9]/gi, '_')}_Report.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setStatus('Đã copy vào clipboard.');
    closeMenu();
  };


  const formatSubscriptionDate = (iso?: string | null) => {
    if (!iso) return '---';

    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '---';

    return d.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit'
    }) + '\n' + d.toLocaleDateString('vi-VN');
  };

  const formatSubscriptionDateCompact = (iso?: string | null) => {
    if (!iso) return '---';

    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '---';

    return d.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit'
    }) + ' ' + d.toLocaleDateString('vi-VN');
  };

  const getRemainingText = (iso?: string | null) => {
    if (!iso) return '---';

    const expires = new Date(iso).getTime();
    const diff = expires - subscriptionTick;

    if (Number.isNaN(expires)) return '---';
    if (diff <= 0) return 'Đã hết hạn';

    const totalMinutes = Math.floor(diff / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) return `${days} ngày ${hours} giờ`;
    if (hours > 0) return `${hours} giờ ${minutes} phút`;
    return `${Math.max(1, minutes)} phút`;
  };

  const isPremiumAccount = subscriptionInfo?.accountType === 'premium' || subscriptionInfo?.premium;
  const canUseTool = Boolean(user && subscriptionInfo?.active);
  const subscriptionExpired = Boolean(user && subscriptionInfo && !subscriptionInfo.active && !subscriptionLoading);

  // --- Render Helpers ---
  const getGrowth = (history: any[], type: 'subs' | 'views') => {
    if (history.length < 2) return '+0';
    const last = history[history.length - 1];
    const prev = history[history.length - 2];
    const diff = last[type] - prev[type];
    
    return (diff >= 0 ? '+' : '') + diff.toLocaleString();
  };

  return (
    <div className="vtw-mobile-app min-h-screen bg-[#f4f4f4] text-[12px] font-[Tahoma,Arial,sans-serif] selection:bg-[#9fc8ff]" onClick={closeMenu}>
      {/* Header */}
      <div className="vtw-app-header bg-white border-b border-[#ccc] px-3 py-1.5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h1 className="vtw-app-title text-[16px] font-bold text-[#333] flex items-center gap-2 shrink-0">
            <img
              src="https://yt3.googleusercontent.com/Gug5UDLjPMRBto68HqZvJCSryebEkqiI2_9qV_8y16ZKIVLgxYBFx_PyUYZStcTzSc3v7TLq=s900-c-k-c0x00ffffff-no-rj"
              className="w-7 h-7 rounded-full"
              referrerPolicy="no-referrer"
              alt="Văn Thế Web"
            />
            {isMobileViewport ? (
              <span className="vtw-title-mobile whitespace-nowrap">YouTube Niche Pro</span>
            ) : (
              <span className="vtw-title-full whitespace-nowrap">YouTube Niche & Analyze Pro (Văn Thế Web)</span>
            )}
          </h1>

          <div className="vtw-header-actions flex items-center gap-2 min-w-0 flex-1 justify-end">
            {user ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAccountModal(true);
                }}
                className="vtw-account-box flex items-center gap-2 bg-gray-50 px-2.5 py-1.5 rounded-xl border border-gray-200 shadow-sm shrink-0 hover:bg-blue-50 hover:border-blue-200 transition-all active:scale-95"
                title="Tài khoản & hạn sử dụng"
              >
                <img
                  src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'U'}`}
                  alt="avatar"
                  className="w-6 h-6 rounded-full shadow-sm"
                  referrerPolicy="no-referrer"
                />
                <div className="leading-tight max-w-[115px] text-left">
                  <div className="text-[10px] font-black text-gray-700 truncate">{user.displayName || user.email}</div>
                  <div className={`text-[8px] font-black uppercase ${isPremiumAccount ? 'text-blue-600' : subscriptionInfo?.active ? 'text-amber-600' : 'text-red-600'}`}>
                    {subscriptionLoading ? 'Kiểm tra...' : isPremiumAccount ? 'PRO' : subscriptionInfo?.active ? 'Trial' : 'Hết hạn'}
                  </div>
                </div>
              </button>
            ) : (
              <button
                onClick={async () => {
                  try {
                    await loginWithGoogle();
                  } catch (e: any) {
                    alert('Lỗi đăng nhập: ' + e.message);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 flex items-center gap-2 transition-all active:scale-95 shadow-sm font-black uppercase text-[11px] shrink-0"
                title="Đăng nhập Google"
              >
                <LogIn size={16} />
                <span>ĐĂNG NHẬP</span>
              </button>
            )}

            {user ? (
              <a
                href={buildPaymentUrl(user)}
                target="_blank"
                rel="noreferrer"
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md hover:from-orange-600 hover:to-red-600 flex items-center gap-2 transition-all active:scale-95 font-black uppercase text-[10px] shrink-0"
                title="Nâng cấp thêm / cộng dồn hạn dùng"
              >
                <Crown size={15} />
                <span>{isPremiumAccount ? 'Nâng cấp thêm' : 'Nâng cấp gói'}</span>
              </a>
            ) : (
              <button
                onClick={() => alert('Vui lòng đăng nhập Google trước khi nâng cấp gói!')}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md opacity-80 cursor-not-allowed flex items-center gap-2 font-black uppercase text-[10px] shrink-0"
                title="Cần đăng nhập để Nâng cấp Gói"
              >
                <Crown size={15} />
                <span>NÂNG CẤP GÓI</span>
              </button>
            )}

            <button
              onClick={resetConfig}
              className="px-5 py-2 rounded-xl bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 flex items-center gap-2 transition-all active:scale-95 shadow-sm font-black uppercase text-[10px] shrink-0"
              title="Làm mới cài đặt & kết quả"
            >
              <RotateCcw size={15} />
              <span>LÀM MỚI</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="vtw-page-wrap p-4 pt-2">
        {!user ? (
          <div className="relative min-h-[calc(100vh-92px)] overflow-hidden rounded-xl bg-blue-50/80">
            {/* Nền preview giao diện chính khi chưa đăng nhập */}
            <div className="absolute inset-0 p-4 pt-2 blur-[2.5px] opacity-55 pointer-events-none select-none">
              <div className="vtw-tabs flex justify-center gap-1 mb-0 relative z-10">
                <div className="px-8 py-2.5 rounded-t-xl bg-[#3498db] text-white border-t border-x border-[#2980b9] shadow-[0_-2px_5px_rgba(0,0,0,0.1)] font-bold flex items-center gap-2">
                  <Search size={16} /> <span className="vtw-tab-full">Tìm kênh & Đánh giá Từ khóa</span><span className="vtw-tab-short">Tìm kênh</span>
                </div>
                <div className="px-8 py-2.5 rounded-t-xl bg-[#bdc3c7] text-[#555] border-t border-x border-[#95a5a6] font-bold flex items-center gap-2">
                  <BarChart2 size={16} /> <span className="vtw-tab-full">Phân tích đối thủ (Spy)</span><span className="vtw-tab-short">Spy</span>
                </div>
                <div className="px-8 py-2.5 rounded-t-xl bg-[#bdc3c7] text-[#555] border-t border-x border-[#95a5a6] font-bold flex items-center gap-2">
                  <UserRoundSearch size={16} /> <span className="vtw-tab-full">Theo dõi Đối thủ (Tracking)</span><span className="vtw-tab-short">Tracking</span>
                </div>
                <div className="px-8 py-2.5 rounded-t-xl bg-[#bdc3c7] text-[#555] border-t border-x border-[#95a5a6] font-bold flex items-center gap-2">
                  <Video size={16} /> <span className="vtw-tab-full">Kiểm tra Link Video</span><span className="vtw-tab-short">Video</span>
                </div>
                <div className="px-8 py-2.5 rounded-t-xl bg-[#bdc3c7] text-[#555] border-t border-x border-[#95a5a6] font-bold flex items-center gap-2">
                  <LayoutGrid size={16} /> <span className="vtw-tab-full">🚀 Tìm ngách Youtube</span><span className="vtw-tab-short">Ngách</span>
                </div>
              </div>

              <div className="vtw-main-panel bg-[#d9d9d9] border border-[#999] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.1)] rounded-sm relative -mt-[1px]">
                <div className="vtw-filter-grid grid grid-cols-12 gap-4 bg-[#f1f1f1] p-4 border border-[#bbb] rounded shadow-sm">
                  <div className="vtw-filter-fields col-span-12 lg:col-span-9 grid grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2"><div className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Từ khóa:</div><div className="w-2/3 border border-[#999] bg-white h-7 px-2 text-gray-400 flex items-center">Ví dụ: công cụ AI, ChatGPT, tạo video bằng AI</div></div>
                      <div className="flex items-center gap-2"><div className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Khu vực:</div><div className="w-2/3 border border-[#999] bg-white h-7 px-2 flex items-center justify-between">Việt Nam <span>▼</span></div></div>
                      <div className="flex items-center gap-2"><div className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Đăng trong:</div><div className="w-2/3 border border-[#999] bg-white h-7 px-2 flex items-center justify-between">Tuần này <span>▼</span></div></div>
                    </div>
                    <div className="space-y-2 border-l border-[#ccc] pl-4">
                      <div className="flex items-center gap-2"><div className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Quét tối đa:</div><div className="w-2/3 border border-[#999] bg-white h-7 px-2 flex items-center">30</div></div>
                      <div className="flex items-center gap-2"><div className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Min Sub:</div><div className="w-2/3 border border-[#999] bg-white h-7 px-2 flex items-center">0</div></div>
                      <div className="flex items-center gap-2"><div className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Max Sub:</div><div className="w-2/3 border border-[#999] bg-white h-7 px-2 flex items-center">100000</div></div>
                    </div>
                    <div className="space-y-2 border-l border-[#ccc] pl-4">
                      <div className="flex items-center gap-2"><div className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Min Video:</div><div className="w-2/3 border border-[#999] bg-white h-7 px-2 flex items-center">1</div></div>
                      <div className="flex items-center gap-2"><div className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Max Video:</div><div className="w-2/3 border border-[#999] bg-white h-7 px-2 flex items-center">0</div></div>
                      <div className="flex items-center gap-2"><div className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Min Views:</div><div className="w-2/3 border border-[#999] bg-white h-7 px-2 flex items-center">10000</div></div>
                    </div>
                  </div>

                  <div className="vtw-api-wrap col-span-12 lg:col-span-3 flex items-start justify-end">
                    <div className="bg-white border-2 border-blue-100 p-3 rounded-xl shadow-sm w-[500px] h-[110px]">
                      <div className="flex items-center justify-between mb-2"><span className="text-[10px] font-black text-gray-400 uppercase">Hệ thống API</span><div className="flex gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400"></span><span className="w-2 h-2 rounded-full bg-indigo-500"></span></div></div>
                      <div className="text-[11px] font-bold text-gray-700 flex justify-between"><span>YouTube V3:</span><span className="text-blue-600">0 Keys</span></div>
                      <div className="text-[11px] font-bold text-gray-700 flex justify-between"><span>Gemini AI:</span><span className="text-green-600">Sẵn sàng</span></div>
                      <div className="mt-2 h-7 bg-blue-600 rounded-lg text-white text-[10px] font-black flex items-center justify-center">CÀI ĐẶT</div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center bg-[#f9f9f9] p-3 border border-[#ccc] rounded shadow-sm mt-4">
                  <div className="font-bold text-[12px] text-[#d35400]">☑ Tự động chuyển từ khóa cho đến khi đủ 10 Kênh</div>
                  <div className="min-w-[200px] bg-[#e67e22] text-white py-2.5 px-6 rounded font-bold text-[15px] flex items-center justify-center gap-2 shadow-[0_4px_0_#a04a00]">▶ BẮT ĐẦU SĂN KÊNH</div>
                </div>

                <div className="mt-4 bg-white border border-[#999] shadow-sm min-h-[450px] overflow-hidden">
                  <div className="bg-[#2c3e50] text-white px-2 py-1.5 font-bold flex justify-between items-center text-[12px]">
                    <span>⊙ DANH SÁCH KÊNH QUÉT ĐƯỢC (TỰ ĐỘNG LỌC THEO ĐIỀU KIỆN)</span>
                    <span className="flex gap-2"><span className="bg-[#2ecc71] px-3 py-1 rounded">Tải TXT</span><span className="bg-[#3498db] px-3 py-1 rounded">THEO DÕI TẤT CẢ</span><span className="bg-[#e74c3c] px-3 py-1 rounded">XÓA TẤT CẢ</span></span>
                  </div>
                  <div className="bg-[#ecf0f1] border-b border-[#bdc3c7] grid grid-cols-12 text-[11px] font-bold text-black">
                    {['STT','ICON','TÊN KÊNH','MÃ KÊNH','URL','QG','NGÀY TẠO','TUỔI KÊNH','SUB','VIEWS','VIDEOS','ĐIỂM'].map((h, i) => (
                      <div key={i} className="px-2 py-2 border-r border-[#ddd] text-center">{h}</div>
                    ))}
                  </div>
                  <div className="text-center py-28 text-gray-400 italic">Chưa có kết quả nào được tìm thấy. Bấm “Bắt đầu săn kênh” để bắt đầu...</div>
                </div>
              </div>
            </div>

            {/* Lớp phủ đăng nhập */}
            <div className="absolute inset-0 z-[60] flex items-start justify-center pt-24 bg-blue-50/45 backdrop-blur-[1px]">
              <div className="bg-white rounded-2xl shadow-2xl border border-blue-100 p-12 text-center max-w-2xl w-full mx-4">
                <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <LogIn size={40} className="text-blue-600" />
                </div>
                <h2 className="text-2xl font-black text-gray-800 mb-4 uppercase">Đăng nhập để sử dụng</h2>
                <p className="text-gray-500 mb-8 max-w-md mx-auto text-[14px]">
                  Vui lòng đăng nhập bằng tài khoản Google của bạn để truy cập tất cả các tính năng phân tích và tìm kiếm ngách trên YouTube.
                </p>
                <button 
                  onClick={async () => {
                    try {
                      await loginWithGoogle();
                    } catch (e: any) {
                      alert('Lỗi đăng nhập: ' + e.message);
                    }
                  }}
                  className="px-8 py-4 rounded-xl bg-blue-600 text-white hover:bg-blue-700 flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg font-black uppercase mx-auto"
                >
                  <LogIn size={20} />
                  <span>ĐĂNG NHẬP BẰNG GOOGLE</span>
                </button>
              </div>
            </div>
          </div>
        ) : subscriptionLoading && !subscriptionInfo ? (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-12 text-center max-w-2xl mx-auto mt-20">
            <Loader2 size={42} className="text-blue-600 animate-spin mx-auto mb-5" />
            <h2 className="text-2xl font-black text-gray-800 mb-3 uppercase">Đang kiểm tra hạn dùng</h2>
            <p className="text-gray-500 text-[14px]">Vui lòng đợi trong giây lát...</p>
          </div>
        ) : subscriptionExpired ? (
          <div className="bg-white rounded-2xl shadow-xl border border-red-200 p-12 text-center max-w-2xl mx-auto mt-20">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Crown size={40} className="text-red-600" />
            </div>
            <h2 className="text-2xl font-black text-gray-800 mb-4 uppercase">Gói dùng thử đã hết hạn</h2>
            <p className="text-gray-500 mb-8 max-w-md mx-auto text-[14px]">
              Tài khoản Google mới được dùng thử 1 giờ. Vui lòng nâng cấp gói để tiếp tục sử dụng công cụ.
            </p>
            <a
              href={buildPaymentUrl(user)}
              target="_blank"
              rel="noreferrer"
              className="px-8 py-4 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600 inline-flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg font-black uppercase mx-auto"
            >
              <Crown size={20} />
              <span>NÂNG CẤP GÓI</span>
            </a>
          </div>
        ) : (
          <>
        {/* Tabs - Centered */}
        <div className="vtw-tabs flex justify-center gap-1 mb-0 relative z-10">
          <button 
            onClick={() => setActiveTab(1)}
            className={`vtw-tab-btn px-8 py-2.5 rounded-t-xl flex items-center gap-2 transition-all font-bold border-t border-x ${activeTab === 1 ? 'bg-[#3498db] text-white border-[#2980b9] shadow-[0_-2px_5px_rgba(0,0,0,0.1)]' : 'bg-[#bdc3c7] text-[#555] border-[#95a5a6] hover:bg-[#b0b7bb]'}`}
          >
            <Search size={16} /> <span className="vtw-tab-full">Tìm kênh & Đánh giá Từ khóa</span><span className="vtw-tab-short">Tìm kênh</span>
          </button>
          <button 
            onClick={() => setActiveTab(2)}
            className={`vtw-tab-btn px-8 py-2.5 rounded-t-xl flex items-center gap-2 transition-all font-bold border-t border-x ${activeTab === 2 ? 'bg-[#3498db] text-white border-[#2980b9] shadow-[0_-2px_5px_rgba(0,0,0,0.1)]' : 'bg-[#bdc3c7] text-[#555] border-[#95a5a6] hover:bg-[#b0b7bb]'}`}
          >
            <BarChart2 size={16} /> <span className="vtw-tab-full">Phân tích đối thủ (Spy)</span><span className="vtw-tab-short">Spy</span>
          </button>
          <button 
            onClick={() => setActiveTab(3)}
            className={`vtw-tab-btn px-8 py-2.5 rounded-t-xl flex items-center gap-2 transition-all font-bold border-t border-x ${activeTab === 3 ? 'bg-[#3498db] text-white border-[#2980b9] shadow-[0_-2px_5px_rgba(0,0,0,0.1)]' : 'bg-[#bdc3c7] text-[#555] border-[#95a5a6] hover:bg-[#b0b7bb]'}`}
          >
            <UserRoundSearch size={16} /> <span className="vtw-tab-full">Theo dõi Đối thủ (Tracking)</span><span className="vtw-tab-short">Tracking</span>
          </button>
          <button 
            onClick={() => setActiveTab(4)}
            className={`vtw-tab-btn px-8 py-2.5 rounded-t-xl flex items-center gap-2 transition-all font-bold border-t border-x ${activeTab === 4 ? 'bg-[#e67e22] text-white border-[#d35400] shadow-[0_-2px_5px_rgba(0,0,0,0.1)]' : 'bg-[#bdc3c7] text-[#555] border-[#95a5a6] hover:bg-[#b0b7bb]'}`}
          >
            <Video size={16} /> <span className="vtw-tab-full">Kiểm tra Link Video</span><span className="vtw-tab-short">Video</span>
          </button>
          <button 
            onClick={() => setActiveTab(5)}
            className={`vtw-tab-btn px-8 py-2.5 rounded-t-xl flex items-center gap-2 transition-all font-bold border-t border-x ${activeTab === 5 ? 'bg-[#3498db] text-white border-[#2980b9] shadow-[0_-2px_5px_rgba(0,0,0,0.1)]' : 'bg-[#bdc3c7] text-[#555] border-[#95a5a6] hover:bg-[#b0b7bb]'}`}
          >
            <LayoutGrid size={16} /> <span className="vtw-tab-full">🚀 Tìm ngách Youtube</span><span className="vtw-tab-short">Ngách</span>
          </button>
        </div>

        <div className="vtw-main-panel bg-[#d9d9d9] border border-[#999] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.1)] rounded-sm relative -mt-[1px]">
          {activeTab === 1 ? (
            <div className="space-y-4">
              <div className="vtw-filter-grid grid grid-cols-12 gap-4 bg-[#f1f1f1] p-4 border border-[#bbb] rounded shadow-sm">
                <div className="vtw-filter-fields col-span-12 lg:col-span-9 grid grid-cols-3 gap-6">
                  {/* Group 1 */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Từ khóa:</label>
                      <input 
                        type="text" 
                        className="w-2/3 border border-[#999] bg-white h-7 px-2 outline-none focus:border-blue-500 shadow-sm"
                        value={config.keyword}
                        onChange={(e) => setConfig({ ...config, keyword: e.target.value })}
                        placeholder="Ví dụ: công cụ AI, ChatGPT, tạo video bằng AI"
                      />
                    </div>
                    <div className="flex items-center gap-2 relative">
                      <label className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Khu vực:</label>
                      <div className="w-2/3 relative" ref={regionRef}>
                        <button 
                          onClick={() => setShowRegionList(!showRegionList)}
                          className="w-full border border-[#999] bg-white h-7 px-2 text-left truncate flex justify-between items-center text-[10px]"
                        >
                          {config.regions.includes('ALL') 
                            ? 'Tất cả khu vực' 
                            : config.regions.map(r => REGIONS.find(reg => reg.code === r)?.name || r).join(', ') || 'Chọn khu vực'}
                          <span className="text-[8px]">▼</span>
                        </button>
                        {showRegionList && (
                          <div className="absolute top-8 left-0 right-0 z-[100] bg-white border border-[#999] shadow-xl max-h-48 overflow-y-auto">
                            <div 
                              onClick={() => { toggleRegion('ALL'); setShowRegionList(false); }}
                              className={`px-2 py-1 cursor-pointer hover:bg-blue-50 text-[10px] flex items-center gap-2 ${config.regions.includes('ALL') ? 'bg-blue-100 font-bold' : ''}`}
                            >
                              <input type="checkbox" checked={config.regions.includes('ALL')} readOnly /> Tất cả khu vực (Toàn cầu)
                            </div>
                            <div className="border-t border-[#eee]"></div>
                            {REGIONS.filter(r => r.code !== '').map(r => (
                              <div 
                                key={r.code}
                                onClick={() => toggleRegion(r.code)}
                                className={`px-2 py-1 cursor-pointer hover:bg-blue-50 text-[10px] flex items-center gap-2 ${config.regions.includes(r.code) ? 'bg-blue-100 font-bold' : ''}`}
                              >
                                <input type="checkbox" checked={config.regions.includes(r.code)} readOnly /> {r.name} ({r.code})
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Đăng trong:</label>
                      <select 
                        className="w-2/3 border border-[#999] bg-white h-7 px-1 outline-none font-medium"
                        value={config.publishedAfter}
                        onChange={(e) => setConfig({ ...config, publishedAfter: e.target.value })}
                      >
                        <option value="any">Toàn thời gian</option>
                        <option value="today">Hôm nay</option>
                        <option value="week">Tuần này</option>
                        <option value="month">Tháng này</option>
                        <option value="year">Năm nay</option>
                      </select>
                    </div>
                  </div>

                  {/* Group 2 */}
                  <div className="space-y-2 border-l border-[#ccc] pl-4">
                    <div className="flex items-center gap-2">
                      <label className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Quét tối đa:</label>
                      <input 
                        type="number" 
                        className="w-2/3 border border-[#999] bg-white h-7 px-2"
                        value={config.maxVideos}
                        onChange={(e) => setConfig({ ...config, maxVideos: parseInt(e.target.value) })}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Min Sub:</label>
                      <input 
                        type="number" 
                        className="w-2/3 border border-[#999] bg-white h-7 px-2"
                        value={config.minSub}
                        onChange={(e) => setConfig({ ...config, minSub: parseInt(e.target.value) })}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Max Sub:</label>
                      <input 
                        type="number" 
                        className="w-2/3 border border-[#999] bg-white h-7 px-2"
                        value={config.maxSub}
                        onChange={(e) => setConfig({ ...config, maxSub: parseInt(e.target.value) })}
                      />
                    </div>
                  </div>

                  {/* Group 3 */}
                  <div className="space-y-2 border-l border-[#ccc] pl-4">
                    <div className="flex items-center gap-2">
                      <label className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Min Video:</label>
                      <input 
                        type="number" 
                        className="w-2/3 border border-[#999] bg-white h-7 px-2"
                        value={config.minVideo}
                        onChange={(e) => setConfig({ ...config, minVideo: parseInt(e.target.value) })}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Max Video:</label>
                      <input 
                        type="number" 
                        className="w-2/3 border border-[#999] bg-white h-7 px-2"
                        value={config.maxVideo}
                        onChange={(e) => setConfig({ ...config, maxVideo: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Min Views:</label>
                      <input 
                        type="number" 
                        className="w-2/3 border border-[#999] bg-white h-7 px-2"
                        value={config.minViews}
                        onChange={(e) => setConfig({ ...config, minViews: parseInt(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>

                {/* API Keys & Actions - REFACTORED TO BE COMPACT AND UNIFIED */}
                <div className="col-span-12 lg:col-span-3 flex items-start justify-end">
                   <div 
                     id="api-status-card"
                     className="bg-white border-2 border-blue-100 p-3 rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between overflow-hidden group relative"
                     style={{ width: '500px', height: '110px' }}
                   >
                      <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:scale-110 transition-transform text-blue-600">
                        <Settings size={60} />
                      </div>
                      
                      <div className="flex flex-col gap-1.5 relative z-10">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-tight">Hệ thống API</span>
                          <div className="flex gap-1.5">
                             <div className={`w-2 h-2 rounded-full ${config.apiKeys.length > 0 ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`}></div>
                             <div className={`w-2 h-2 rounded-full ${geminiApiKey ? 'bg-indigo-500 animate-pulse' : 'bg-gray-300'}`}></div>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-gray-700 flex items-center gap-1"><Video size={12} className="text-red-500" /> YouTube V3:</span>
                            <span className="text-[11px] font-black text-blue-600">{config.apiKeys.length} Keys ({exhaustedKeys.length} Lỗi)</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-gray-700 flex items-center gap-1"><Bot size={12} className="text-indigo-500" /> Gemini AI:</span>
                            <span className={`text-[11px] font-black ${geminiApiKey ? 'text-green-600' : 'text-gray-400'}`}>{geminiApiKey ? 'Sẵn sàng' : 'Chưa có'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-auto flex gap-2 relative z-10">
                        <button 
                          onClick={() => setShowKeyInputModal(true)}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1"
                        >
                          <Settings size={12} /> CÀI ĐẶT
                        </button>
                        <button 
                          onClick={() => setShowKeyHistory(true)}
                          className="bg-orange-50 hover:bg-orange-100 text-orange-600 px-3 py-1.5 rounded-lg text-[10px] font-black border border-orange-100 transition-all flex items-center justify-center gap-1.5"
                          title="Lịch sử Key"
                        >
                          <HistoryIcon size={12} /> LỊCH SỬ
                        </button>
                      </div>
                   </div>
                </div>
              </div>

              {/* Bottom Actions Row */}
              <div className="vtw-bottom-actions flex justify-between items-center bg-[#f9f9f9] p-3 border border-[#ccc] rounded shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="autoHunt" 
                      className="w-5 h-5 cursor-pointer accent-[#e67e22]" 
                      checked={config.autoNiche}
                      onChange={(e) => setConfig({ ...config, autoNiche: e.target.checked })}
                    />
                    <label htmlFor="autoHunt" className="font-bold text-[12px] text-[#d35400] cursor-pointer flex flex-col">
                      <span>Tự động chuyển từ khóa cho đến khi đủ 10 Kênh</span>
                    </label>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {!isHunting ? (
                    <button 
                      onClick={startHunter}
                      className="min-w-[200px] bg-[#e67e22] text-white py-2.5 px-6 rounded font-bold text-[15px] flex items-center justify-center gap-2 hover:bg-[#d35400] active:scale-95 shadow-[0_4px_0_#a04a00] transition-all"
                    >
                      <Play size={20} fill="white" /> BẮT ĐẦU SĂN KÊNH
                    </button>
                  ) : (
                    <button 
                      onClick={stopHunter}
                      className="min-w-[200px] bg-red-600 text-white py-2.5 px-6 rounded font-bold text-[15px] flex items-center justify-center gap-2 hover:bg-red-700 active:scale-95 shadow-[0_4px_0_#900] transition-all animate-pulse"
                    >
                      <StopCircle size={20} fill="white" /> DỪNG QUÉT
                    </button>
                  )}
                </div>
              </div>
              
              {lastError && (
                <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-700 animate-shake animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="bg-red-100 p-1.5 rounded-full shrink-0">
                    <XCircle size={18} className="text-red-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-[13px] uppercase tracking-tight flex items-center gap-2 mb-1">
                      ⚠️ CẢNH BÁO LỖI KHI ĐANG QUÉT
                    </p>
                    <p className="text-[12px] leading-relaxed font-medium bg-white/50 p-2 rounded border border-red-100">
                      {lastError}
                    </p>
                    <p className="text-[10px] mt-2 italic opacity-70">
                      Mẹo: Kiểm tra lại API Key xem có bị hết hạn hoặc sai cú pháp không. Hoặc thử đổi vùng quét (Region).
                    </p>
                  </div>
                </div>
              )}

              {/* Bảng gợi ý ngách liên quan (Now below Start button as requested) */}
              {keywordIdeas.length > 0 && showKeywordIdeas && (
                <div className="bg-white border border-[#bbb] rounded shadow-sm overflow-hidden my-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-4">
                  <div className="bg-[#d35400] text-white px-3 py-1.5 font-bold flex justify-between items-center text-[12px]">
                    <span className="flex items-center gap-2"><TrendingUp size={16} /> DANH SÁCH GỢI Ý NGÁCH LIÊN QUAN - TỪ KHÓA ĐỀ XUẤT ({keywordIdeas.length})</span>
                    <button 
                      onClick={() => setShowKeywordIdeas(false)}
                      className="text-[10px] bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded transition-all flex items-center gap-1"
                    >
                      <X size={12} /> ẨN BẢNG
                    </button>
                  </div>
                  <div className="max-h-[250px] overflow-y-auto custom-scrollbar">
                    <table className="vtw-tracking-table w-full text-left border-collapse">
                      <thead className="bg-[#fdf2e9] sticky top-0 z-10 border-b border-orange-200">
                        <tr>
                          <th className="px-3 py-1.5 text-[11px] font-bold text-orange-800 border-r border-orange-100 italic w-12 text-center">STT</th>
                          <th className="px-3 py-1.5 text-[11px] font-bold text-orange-800 border-r border-orange-100">TỪ KHÓA / NGÁCH TIỀM NĂNG</th>
                          <th className="px-3 py-1.5 text-[11px] font-bold text-orange-800 border-r border-orange-100 text-center w-32">CẠNH TRANH</th>
                          <th className="px-3 py-1.5 text-[11px] font-bold text-orange-800 text-center w-24">ĐIỂM SEO</th>
                        </tr>
                      </thead>
                      <tbody className="text-[11px]">
                        {keywordIdeas.map((idea, idx) => (
                          <tr 
                            key={idx} 
                            className={`border-b border-orange-50 hover:bg-orange-50/50 transition-colors ${idea.status === 'scanning' ? 'bg-blue-50' : ''}`}
                          >
                            <td className="px-3 py-1.5 text-center font-mono text-gray-400 border-r border-orange-50">{idx + 1}</td>
                            <td className="px-3 py-1.5 font-bold text-gray-800 border-r border-orange-50">
                              <div className="flex items-center gap-2">
                                {idea.text}
                                <button 
                                  onClick={() => setConfig({ ...config, keyword: idea.text })}
                                  className="text-[9px] bg-blue-100 text-blue-600 px-1 rounded hover:bg-blue-200"
                                >
                                  DÙNG
                                </button>
                              </div>
                            </td>
                            <td className="px-3 py-1.5 text-center border-r border-orange-50">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                idea.competition === 'Thấp' ? 'bg-green-100 text-green-600' :
                                idea.competition === 'Trung bình' ? 'bg-yellow-100 text-yellow-600' :
                                'bg-red-100 text-red-600'
                              }`}>
                                {idea.competition}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-center font-bold text-blue-600">{idea.score}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Show suggestion toggle button if data exists but table hidden */}
              {keywordIdeas.length > 0 && !showKeywordIdeas && (
                <div className="my-4 flex justify-center">
                  <button 
                    onClick={() => setShowKeywordIdeas(true)}
                    className="flex items-center gap-2 bg-orange-100 text-orange-700 px-4 py-1.5 rounded-full text-[11px] font-bold hover:bg-orange-200 transition-all border border-orange-200 shadow-sm"
                  >
                    <TrendingUp size={14} /> HIỆN BẢNG GỢI Ý NGÁCH ({keywordIdeas.length})
                  </button>
                </div>
              )}


              <div className="vtw-results-box flex-1 flex flex-col bg-white border border-[#999] shadow-sm relative min-h-[450px] h-[65vh] max-h-[85vh] overflow-hidden">
                  <div className="vtw-results-header bg-[#2c3e50] text-white px-2 py-1.5 font-bold flex justify-between items-center text-[12px] shrink-0">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-2"><CheckCircle2 size={16} /> DANH SÁCH KÊNH QUÉT ĐƯỢC (TỰ ĐỘNG LỌC THEO ĐIỀU KIỆN)</span>
                      <span className="px-2 py-0.5 bg-blue-500 rounded text-[11px] font-black shadow-sm">TỔNG: {results.length}</span>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => downloadTXT('hunter')}
                        className="bg-[#2ecc71] text-white px-3 py-1 rounded hover:bg-[#27ae60] flex items-center gap-2 active:scale-95 transition-all text-[11px] font-bold"
                      >
                        <Download size={14} /> Tải TXT
                      </button>
                      <button 
                        onClick={() => addAllToTracking()}
                        className="bg-[#3498db] text-white px-3 py-1 rounded hover:bg-[#2980b9] flex items-center gap-2 active:scale-95 transition-all text-[11px] font-bold shadow-sm"
                        title="Thêm tất cả các kênh này vào danh sách theo dõi đối thủ"
                      >
                        <UserRoundSearch size={14} /> THEO DÕI TẤT CẢ
                      </button>
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerConfirm('Dọn dẹp kết quả', 'Xóa sạch TOÀN BỘ kết quả săn kênh hiện tại?', () => {
                            setResults([]);
                            resultsRef.current = [];
                            localStorage.removeItem('youtube_hunter_results');
                            localStorage.setItem('youtube_hunter_results', '[]'); 
                            setStatus('Đã xóa sạch kết quả.');
                          });
                        }}
                        className="bg-[#e74c3c] text-white px-3 py-1 rounded hover:bg-[#c0392b] flex items-center gap-2 active:scale-95 transition-all text-[11px] font-bold shadow-sm"
                        title="Xóa sạch toàn bộ kết quả săn kênh"
                      >
                        <Trash2 size={14} /> XÓA TẤT CẢ
                      </button>
                    </div>
                  </div>
                  <div className="vtw-results-table-wrap flex-1 overflow-auto bg-white">
                    <table className="vtw-results-table w-full text-left border-collapse min-w-[1300px]">
                      <thead className="bg-[#ecf0f1] border-b border-[#bdc3c7] sticky top-0 z-20 shadow-sm text-black">
                        <tr>
                          <th className="px-2 py-2 font-bold text-[11px] border-r border-[#ddd] w-10 text-center">STT</th>
                          <th className="px-2 py-2 font-bold text-[11px] border-r border-[#ddd] w-12 text-center">ICON</th>
                          <th className="px-2 py-2 font-bold text-[11px] border-r border-[#ddd] min-w-[180px]">TÊN KÊNH</th>
                          <th className="px-2 py-2 font-bold text-[11px] border-r border-[#ddd] min-w-[120px]">MÃ KÊNH</th>
                          <th className="px-2 py-2 font-bold text-[11px] border-r border-[#ddd] min-w-[150px]">URL</th>
                          <th className="px-2 py-2 font-bold text-[11px] border-r border-[#ddd] text-center w-16">QG</th>
                          <th className="px-2 py-2 font-bold text-[11px] border-r border-[#ddd] text-center w-28">NGÀY TẠO</th>
                          <th className="px-2 py-2 font-bold text-[11px] border-r border-[#ddd] text-right w-24">TUỔI KÊNH (NGÀY)</th>
                          <th className="px-2 py-2 font-bold text-[11px] border-r border-[#ddd] text-right w-24">SUB</th>
                          <th className="px-2 py-2 font-bold text-[11px] border-r border-[#ddd] text-right w-28">VIEWS</th>
                          <th className="px-2 py-2 font-bold text-[11px] border-r border-[#ddd] text-right w-20">VIDEOS</th>
                          <th className="px-2 py-2 font-bold text-[11px] text-center w-24 text-orange-600">★ ĐIỂM NGÁCH</th>
                          <th className="px-2 py-2 font-bold text-[11px] text-center w-16">XÓA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.length === 0 && (
                          <tr><td colSpan={13} className="text-center py-20 text-gray-400 italic">Chưa có kết quả nào được tìm thấy. Bấm "Bắt đầu săn kênh" để bắt đầu...</td></tr>
                        )}
                        {results.map((r, i) => (
                          <tr 
                            key={i} 
                            onContextMenu={(e) => handleContextMenu(e, r)}
                            onClick={() => setSelectedResultId(r.id)}
                            className={`border-b border-[#eee] py-1 cursor-default text-[11px] h-9 transition-colors ${selectedResultId === r.id ? 'bg-[#9fc8ff]' : i % 2 === 0 ? 'bg-[#effff0]' : 'bg-[#ffffff]'}`}
                          >
                            <td className="px-2 py-1 text-center font-mono text-gray-400 border-r border-[#ddd] w-10">{i + 1}</td>
                            <td className="px-2 py-1 text-center"><img src={r.icon} className="w-7 h-7 rounded-full border border-[#ccc] mx-auto shadow-sm" /></td>
                            <td className="px-2 py-1 font-bold whitespace-nowrap overflow-hidden text-ellipsis text-black">{r.name}</td>
                            <td className="px-2 py-1 text-[10px] font-mono text-[#7f8c8d]">{r.id}</td>
                            <td className="px-2 py-1 text-[10px] text-blue-600 underline truncate hover:text-blue-800"><a href={r.url} target="_blank" rel="noreferrer">{r.url}</a></td>
                            <td className="px-2 py-1 text-center font-bold text-gray-600">{r.country}</td>
                            <td className="px-2 py-1 text-center text-gray-500 whitespace-nowrap">{r.publishedAt}</td>
                            <td className="px-2 py-1 text-right text-green-700 font-medium">{r.age.toLocaleString()}</td>
                            <td className="px-2 py-1 text-right text-black font-bold">{r.subs.toLocaleString()}</td>
                            <td className="px-2 py-1 text-right text-blue-800 font-bold">{r.views.toLocaleString()}</td>
                            <td className="px-2 py-1 text-right text-gray-800">{r.videos.toLocaleString()}</td>
                            <td className="px-2 py-1 text-center font-black text-[#e67e22] text-[13px] bg-orange-50">{r.score}</td>
                            <td className="px-2 py-1 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => openChannelActionMenu(e, r)}
                                  className="vtw-mobile-action-btn bg-slate-700 hover:bg-slate-800 text-white px-2 py-1 rounded text-[9px] font-black shadow-sm transition-all active:scale-95 uppercase"
                                  title="Mở bảng thao tác kênh"
                                >
                                  THAO TÁC
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); goToSpy(r.id); }}
                                  className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-[9px] font-black shadow-sm transition-all active:scale-95 uppercase"
                                  title="Phân tích chiến lược kênh (Spy)"
                                >
                                  SPY
                                </button>
                                {r.lastVideoId && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); analyzeVideo(r.lastVideoId); }}
                                    className="bg-orange-600 hover:bg-orange-700 text-white px-2 py-1 rounded text-[9px] font-black shadow-sm transition-all active:scale-95 uppercase"
                                    title="Phân tích video vừa tìm thấy (Check Video)"
                                  >
                                    CHECK
                                  </button>
                                )}
                                <button 
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    triggerConfirm('Xác nhận xóa', `Xóa kết quả kênh "${r.name}"?`, () => {
                                      setResults(prev => {
                                        const next = prev.filter(item => item.id !== r.id);
                                        resultsRef.current = next;
                                        localStorage.removeItem('youtube_hunter_results');
                                        localStorage.setItem('youtube_hunter_results', JSON.stringify(next));
                                        return next;
                                      });
                                      setStatus(`Đã xóa kênh ${r.name}`);
                                    });
                                  }}
                                  className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-all active:scale-125"
                                  title="Xóa"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}


          {activeTab === 2 ? (
            <div className="vtw-spy-panel space-y-4">
              <div className="vtw-spy-toolbar flex gap-4 items-center bg-[#eee] p-4 border border-[#ccc] rounded shadow-sm">
                <label className="font-bold text-[14px]">Channel ID:</label>
                <input 
                  type="text" 
                  className="border border-[#999] bg-white h-8 px-2 w-[350px]" 
                  placeholder="UC... hoặc URL kênh"
                  value={spyInput}
                  onChange={(e) => setSpyInput(e.target.value)}
                />
                <button 
                  id="btn-analyze-spy"
                  onClick={analyzeSpy}
                  className="bg-[#2ecc71] text-white px-6 py-2 rounded font-bold text-[13px] flex items-center gap-2 hover:brightness-110 active:scale-95 shadow"
                >
                  <BarChart2 size={16} /> 📊 PHÂN TÍCH SPY
                </button>
                <button 
                  onClick={() => setShowSpyProjects(!showSpyProjects)}
                  className={`px-4 py-2 rounded font-bold text-[13px] flex items-center gap-2 transition-all shadow ${showSpyProjects ? 'bg-orange-500 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                >
                  <Clock size={16} /> LỊCH SỬ DỰ ÁN ({spyProjects.length})
                </button>
              </div>

              {showSpyProjects && (
                <div className="bg-white border border-gray-300 rounded shadow-md p-4 animate-in fade-in slide-in-from-top-2">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                      <FolderHeart size={18} className="text-orange-500" /> CÁC DỰ ÁN ĐÃ CHECK GẦN ĐÂY
                    </h3>
                    <button 
                      onClick={() => {
                        if(confirm('Bạn có muốn xóa toàn bộ lịch sử dự án?')) {
                          setSpyProjects([]);
                          localStorage.removeItem('youtube_spy_projects');
                        }
                      }}
                      className="text-red-500 hover:text-red-700 text-xs flex items-center gap-1"
                    >
                      <Trash2 size={12} /> Xóa tất cả
                    </button>
                  </div>
                  
                  {spyProjects.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 italic">Chưa có dự án nào được lưu.</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {spyProjects.map((proj, idx) => (
                        <div 
                          key={idx}
                          onClick={() => {
                            setSpyResult(proj);
                            setSpyInput(proj.channelInfo.id);
                            setShowSpyProjects(false);
                          }}
                          className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:border-orange-400 hover:bg-orange-50 cursor-pointer transition-all group shadow-sm bg-gray-50"
                        >
                          <img 
                            src={proj.channelInfo.logo} 
                            alt="" 
                            className="w-10 h-10 rounded-full border border-gray-300"
                            referrerPolicy="no-referrer"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm text-gray-800 truncate group-hover:text-orange-600">
                              {proj.channelInfo.snippet.title}
                            </div>
                            <div className="text-[10px] text-gray-500 flex items-center gap-1">
                              <Star size={10} className="text-yellow-500 fill-yellow-500" /> 
                              {parseInt(proj.channelInfo.statistics.subscriberCount).toLocaleString()} subs
                            </div>
                          </div>
                          <div className="text-orange-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Eye size={16} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {spyResult ? (
                <React.Fragment>
                  <div className="vtw-spy-result space-y-4">
                  <div className="vtw-spy-result-grid flex gap-4">
                    <div 
                      className="vtw-spy-profile bg-white border border-[#999] p-4 shadow-sm flex flex-col items-center justify-center min-w-[150px] shrink-0 cursor-context-menu"
                      onContextMenu={(e) => handleContextMenu(e, {
                        id: spyResult.channelInfo.id,
                        name: spyResult.channelInfo.snippet.title,
                        url: `https://youtube.com/channel/${spyResult.channelInfo.id}`,
                        icon: spyResult.channelInfo.logo,
                        country: spyResult.channelInfo.snippet.country || '',
                        publishedAt: spyResult.channelInfo.snippet.publishedAt,
                        age: calculateChannelAge(spyResult.channelInfo.snippet.publishedAt),
                        subs: parseInt(spyResult.channelInfo.statistics.subscriberCount),
                        views: parseInt(spyResult.channelInfo.statistics.viewCount),
                        videos: parseInt(spyResult.channelInfo.statistics.videoCount),
                        score: calculateNicheScore(spyResult.channelInfo),
                        keywordTitle: ''
                      })}
                    >
                      <img src={spyResult.channelInfo.logo} className="w-24 h-24 rounded-full border border-[#ccc] shadow-sm mb-2" alt="Channel Logo" />
                      <span className="font-bold text-[#2c3e50] text-center">{spyResult.channelInfo.snippet.title}</span>
                      <a href={`https://youtube.com/channel/${spyResult.channelInfo.id}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-[10px] mt-1 flex items-center gap-1">
                        Xem kênh <ExternalLink size={10} />
                      </a>
                      <button
                        type="button"
                        onClick={(e) => openChannelActionMenu(e, {
                          id: spyResult.channelInfo.id,
                          name: spyResult.channelInfo.snippet.title,
                          url: `https://youtube.com/channel/${spyResult.channelInfo.id}`,
                          icon: spyResult.channelInfo.logo,
                          country: spyResult.channelInfo.snippet.country || '',
                          publishedAt: spyResult.channelInfo.snippet.publishedAt,
                          age: calculateChannelAge(spyResult.channelInfo.snippet.publishedAt),
                          subs: parseInt(spyResult.channelInfo.statistics.subscriberCount || '0'),
                          views: parseInt(spyResult.channelInfo.statistics.viewCount || '0'),
                          videos: parseInt(spyResult.channelInfo.statistics.videoCount || '0'),
                          score: calculateNicheScore(spyResult.channelInfo),
                          keywordTitle: ''
                        })}
                        className="vtw-mobile-action-btn mt-3 w-full bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded-lg text-[10px] font-black shadow-sm transition-all active:scale-95 uppercase"
                      >
                        THAO TÁC
                      </button>
                    </div>
                    <div className="vtw-spy-report flex-1 bg-white border border-[#999] p-4 font-mono text-[13px] text-blue-800 leading-relaxed shadow-inner overflow-x-auto">
                      <div className="mb-2 border-b border-gray-100 pb-1 flex justify-between items-center">
                        <div className="flex flex-wrap gap-x-2">
                          <span className="font-bold">Kênh:</span>
                          <span className="text-black">
                            <a href={`https://youtube.com/channel/${spyResult.channelInfo.id}`} target="_blank" rel="noreferrer" className="hover:text-blue-600">
                              {spyResult.channelInfo.snippet.title}
                            </a>
                          </span>
                          <a href={`https://youtube.com/channel/${spyResult.channelInfo.id}`} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
                            ({spyResult.channelInfo.id})
                          </a>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => downloadAsTxt(spyResult.report, spyResult.channelInfo.snippet.title)}
                            className="p-1 hover:bg-gray-100 rounded text-green-600 transition-colors"
                            title="Tải báo cáo TXT"
                          >
                            <Download size={14} />
                          </button>
                          <button 
                            onClick={() => copyToClipboard(spyResult.report)}
                            className="p-1 hover:bg-gray-100 rounded text-blue-600 transition-colors"
                            title="Copy báo cáo"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex flex-wrap gap-x-2">
                          <span className="font-bold">Quốc gia:</span>
                          <span className="text-black">{spyResult.channelInfo.snippet.country || 'N/A'}</span>
                          <span className="text-gray-400">|</span>
                          <span className="font-bold">Tuổi kênh:</span>
                          <span className="text-black">{calculateChannelAge(spyResult.channelInfo.snippet.publishedAt)} ngày</span>
                        </div>
                        
                        <div className="flex gap-2">
                          <span className="font-bold">Đường dẫn:</span>
                          <a href={`https://youtube.com/${spyResult.channelInfo.snippet.customUrl || spyResult.channelInfo.id}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                            @{spyResult.channelInfo.snippet.customUrl || spyResult.channelInfo.id}
                          </a>
                        </div>

                        <div className="flex flex-wrap gap-x-2">
                          <span className="font-bold">Đăng ký:</span>
                          <span className="text-black">{parseInt(spyResult.channelInfo.statistics.subscriberCount).toLocaleString()}</span>
                          <span className="text-gray-400">|</span>
                          <span className="font-bold">Tổng lượt xem:</span>
                          <span className="text-black">{parseInt(spyResult.channelInfo.statistics.viewCount).toLocaleString()}</span>
                          <span className="text-gray-400">|</span>
                          <span className="font-bold">Video:</span>
                          <span className="text-black">{spyResult.channelInfo.statistics.videoCount}</span>
                        </div>

                        <div className="flex flex-wrap gap-x-2">
                          <span className="font-bold text-orange-600">Phân tích gần đây:</span>
                          <span className="text-black">{spyResult.recentAnalyzed}</span>
                          <span className="text-gray-400">|</span>
                          <span className="font-bold text-orange-600">View/ngày:</span>
                          <span className="text-black">tb {(spyResult.avgViewsPerDay ?? 0).toLocaleString()} • cao nhất {(spyResult.maxViewsPerDay ?? 0).toLocaleString()}</span>
                        </div>

                        <div className="flex flex-wrap gap-x-2">
                          <span className="font-bold text-red-600">Video hàng đầu:</span>
                          {spyResult.videos[0] ? (
                            <a href={`https://youtube.com/watch?v=${spyResult.videos[0].id}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate max-w-md">
                              https://youtube.com/watch?v=${spyResult.videos[0].id}
                            </a>
                          ) : <span className="text-gray-400">N/A</span>}
                          <span className="text-gray-500 italic">
                            (lượt xem={spyResult.videos[0]?.views.toLocaleString() || 0})
                          </span>
                        </div>

                        <div className="mt-4 border-t border-gray-200 pt-2">
                          <div className="font-bold text-gray-700 mb-1">Thẻ hàng đầu (Top tags):</div>
                          <div className="text-[11px] text-gray-700 bg-gray-50 p-2 border border-gray-100 rounded leading-normal max-h-32 overflow-y-auto flex flex-wrap gap-1">
                            {(spyResult.topTags || []).map((tagObj: any, idx: number) => (
                              <span key={idx} className="inline-flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-gray-200 hover:border-blue-300 group/tag">
                                <span className="hover:text-blue-600 cursor-default">{tagObj.text} ({tagObj.count})</span>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyToClipboard(tagObj.text);
                                  }}
                                  className="text-gray-400 hover:text-blue-500 opacity-0 group-hover/tag:opacity-100 transition-opacity"
                                  title="Copy từ này"
                                >
                                  <Copy size={10} />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="mt-2">
                          <div className="font-bold text-gray-700 mb-1">Từ khóa hàng đầu (Top keywords):</div>
                          <div className="text-[11px] text-gray-600 bg-gray-50 p-2 border border-gray-100 rounded leading-normal max-h-48 overflow-y-auto flex flex-wrap gap-1">
                            {spyResult.topKeywords && spyResult.topKeywords.length > 0 ? (
                              spyResult.topKeywords.map((kwObj: any, idx: number) => (
                                <span key={idx} className="inline-flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-gray-200 hover:border-blue-300 group/kw">
                                  <span className="hover:text-blue-600 cursor-default">{kwObj.text} ({kwObj.count})</span>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyToClipboard(kwObj.text);
                                    }}
                                    className="text-gray-400 hover:text-blue-500 opacity-0 group-hover/kw:opacity-100 transition-opacity"
                                    title="Copy từ khóa này"
                                  >
                                    <Copy size={10} />
                                  </button>
                                </span>
                              ))
                            ) : (
                              <div className="text-gray-400 italic py-2 w-full text-center">Không có dữ liệu từ khóa.</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="vtw-spy-videos-box bg-white border border-[#999] flex flex-col h-[40vh] min-h-0 overflow-hidden shadow-sm">
                    <div className="bg-[#2c3e50] text-white px-2 py-1 font-bold flex justify-between shrink-0">
                      <span className="flex items-center gap-2 mt-0.5"><MonitorPlay size={14}/> Video mới nhất từ kênh</span>
                      <button onClick={() => downloadTXT('spy')} className="bg-green-600 hover:bg-green-700 px-3 py-0.5 rounded text-[11px]">Tải TXT</button>
                    </div>
                    <div className="flex-1 overflow-auto">
                      <table className="vtw-tracking-table w-full text-left border-collapse">
                        <thead className="bg-[#ecf0f1] border-b border-[#bdc3c7] sticky top-0 z-10 shadow-sm text-black">
                          <tr>
                            <th className="px-2 py-1.5 font-bold text-[10px] border-r border-[#ccc] text-center w-24">THUMB</th>
                            <th className="px-2 py-1.5 font-bold text-[10px] border-r border-[#ccc]">VIDEO ID</th>
                            <th className="px-2 py-1.5 font-bold text-[10px] border-r border-[#ccc] text-center w-20">PHÂN TÍCH</th>
                            <th className="px-2 py-1.5 font-bold text-[10px] border-r border-[#ccc]">TIÊU ĐỀ</th>
                            <th className="px-2 py-1.5 font-bold text-[10px] border-r border-[#ccc] text-center w-48">NGÀY ĐĂNG</th>
                            <th className="px-2 py-1.5 font-bold text-[10px] border-r border-[#ccc] text-right">VIEWS</th>
                            <th className="px-2 py-1.5 font-bold text-[10px] border-r border-[#ccc] text-right">VIEWS/NGÀY</th>
                            <th className="px-2 py-1.5 font-bold text-[10px]">URL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {spyResult.videos.map((v, i) => (
                            <tr key={i} className="border-b border-[#eee] hover:bg-[#f9f9f9] text-[11px]">
                              <td className="px-2 py-1 text-center">
                                <img src={v.thumbnail} className="w-20 h-14 object-cover rounded shadow-sm border border-[#ccc]" />
                              </td>
                              <td className="px-2 py-1 font-mono text-[10px] text-gray-500">
                                <a href={`https://youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                                  {v.id}
                                </a>
                              </td>
                              <td className="px-2 py-1 text-center">
                                <button 
                                  onClick={() => analyzeVideo(v.id)}
                                  className="bg-[#e67e22] hover:bg-[#d35400] text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-sm transition-colors"
                                >
                                  PHÂN TÍCH
                                </button>
                              </td>
                              <td className="px-2 py-1 font-bold text-black">
                                <a href={`https://youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline transition-colors uppercase">
                                  {v.title}
                                </a>
                              </td>
                              <td className="px-2 py-1 text-center text-gray-600 text-[8.8px]">{v.date}</td>
                              <td className="px-2 py-1 text-right font-medium">{v.views.toLocaleString()}</td>
                              <td className="px-2 py-1 text-right text-blue-600 font-bold">{v.viewsPerDay.toLocaleString()}</td>
                              <td className="px-2 py-1 text-blue-600 underline truncate max-w-[200px]">
                                <a href={v.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600">
                                  Link <ExternalLink size={10} />
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </React.Fragment>
              ) : null}
            </div>
          ) : null}

          {activeTab === 3 ? (
            <div className="vtw-tracking-panel space-y-4">
              <div className="vtw-tracking-toolbar flex justify-between items-center bg-[#eee] p-4 border border-[#ccc] rounded shadow-sm">
                <div className="flex gap-2 items-center">
                  <button 
                    onClick={updateTracking}
                    className="bg-[#3498db] text-white h-10 px-5 rounded font-bold text-[13px] flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 shadow whitespace-nowrap shrink-0 transition-all"
                  >
                    <RotateCcw size={16} /> CẬP NHẬT SỐ LIỆU HÔM NAY
                  </button>
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerConfirm('Xóa theo dõi', 'Xóa sạch TOÀN BỘ danh sách kênh đang theo dõi của bạn?', () => {
                        setTrackingChannels([]);
                        localStorage.removeItem('youtube_tracking_channels');
                        localStorage.setItem('youtube_tracking_channels', '[]');
                        setStatus('Đã xóa sạch danh sách theo dõi.');
                      });
                    }}
                    className="bg-red-600 text-white h-10 px-5 rounded font-bold text-[13px] flex items-center justify-center gap-2 hover:bg-red-800 active:scale-95 shadow transition-colors whitespace-nowrap"
                  >
                    <Trash2 size={16} /> XÓA TẤT CẢ
                  </button>
                  <button 
                    onClick={() => downloadTXT('tracking')}
                    className="bg-[#2ecc71] text-white h-10 px-5 rounded font-bold text-[13px] flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 shadow whitespace-nowrap transition-all"
                  >
                    <Download size={16} /> Tải TXT
                  </button>
                  <div className="ml-2 h-10 px-4 bg-white border border-blue-200 rounded shadow-inner flex items-center gap-3 shrink-0">
                    <BarChart2 size={16} className="text-blue-600" />
                    <span className="text-[12px] font-black text-gray-700 whitespace-nowrap uppercase">
                      Kênh: <span className="text-blue-600 text-[15px]">
                        {trackingChannels.filter(c => 
                          c.name.toLowerCase().includes(trackingSearchTerm.toLowerCase()) ||
                          c.id.toLowerCase().includes(trackingSearchTerm.toLowerCase())
                        ).length}
                      </span>
                      {trackingSearchTerm && (
                        <span className="text-gray-400 font-normal ml-1">/ {trackingChannels.length}</span>
                      )}
                    </span>
                  </div>
                  
                  {/* Search box for tracking list */}
                  <div className="ml-2 flex items-center bg-white border border-blue-200 rounded h-10 px-3 min-w-[250px] shadow-sm">
                    <Search size={14} className="text-blue-400 mr-2" />
                    <input 
                      type="text"
                      placeholder="Tìm nhanh tên kênh..."
                      className="bg-transparent text-[12px] font-bold outline-none w-full text-gray-700"
                      value={trackingSearchTerm}
                      onChange={(e) => setTrackingSearchTerm(e.target.value)}
                    />
                    {trackingSearchTerm && (
                      <button 
                        onClick={() => setTrackingSearchTerm('')}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[#e67e22] text-[11px] italic leading-tight max-w-[300px] text-right">
                  💡 Ghi chú: Tool tự động tính toán mức độ tăng trưởng trung bình mỗi ngày dựa trên lịch sử đo lường.
                </p>
              </div>

              <div className="vtw-tracking-table-box bg-white border border-[#999] flex flex-col h-[60vh] min-h-0 overflow-hidden shadow-sm">
                <div className="flex-1 overflow-auto">
                  <table className="vtw-tracking-table w-full text-left border-collapse">
                    <thead className="bg-[#e6e6e6] border-b border-[#999] sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-2 py-1 font-normal text-[11px] border-r border-[#ccc] w-10 text-center">STT</th>
                      <th className="px-2 py-1 font-normal text-[11px] border-r border-[#ccc]">Tên Kênh</th>
                      <th className="px-2 py-1 font-normal text-[11px] border-r border-[#ccc]">Mã Kênh</th>
                      <th className="px-2 py-1 font-normal text-[11px] border-r border-[#ccc]">Lịch Sử Sub (Cũ → Mới)</th>
                      <th className="px-2 py-1 font-normal text-[11px] border-r border-[#ccc]">Tăng Sub/Ngày</th>
                      <th className="px-2 py-1 font-normal text-[11px] border-r border-[#ccc]">Lịch Sử View (Cũ → Mới)</th>
                      <th className="px-2 py-1 font-normal text-[11px] border-r border-[#ccc]">Tăng View/Ngày</th>
                      <th className="px-2 py-1 font-normal text-[11px] border-r border-[#ccc] bg-blue-50/50 !text-black">Đánh giá</th>
                      <th className="px-2 py-1 font-normal text-[11px] text-center w-12">XÓA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trackingChannels
                      .filter(c => 
                        c.name.toLowerCase().includes(trackingSearchTerm.toLowerCase()) ||
                        c.id.toLowerCase().includes(trackingSearchTerm.toLowerCase())
                      )
                      .map((c, i) => (
                      <tr 
                        key={i} 
                        className="border-b border-[#eee] hover:bg-[#f9f9f9]"
                        onContextMenu={(e) => handleContextMenu(e, {
                          id: c.id,
                          name: c.name,
                          url: `https://youtube.com/channel/${c.id}`,
                          icon: '', // Fallback
                          country: '',
                          publishedAt: '',
                          age: 0,
                          subs: c.history[c.history.length - 1]?.subs || 0,
                          views: c.history[c.history.length - 1]?.views || 0,
                          videos: c.history[c.history.length - 1]?.videos || 0,
                          score: '',
                          keywordTitle: ''
                        })}
                      >
                        <td className="px-2 py-1 text-center text-gray-500 font-mono border-r border-[#eee] w-10">{i + 1}</td>
                        <td className="px-2 py-1 font-bold">
                          <div className="flex items-center gap-2">
                            {c.icon ? (
                              <img src={c.icon} alt={c.name} className="w-8 h-8 rounded-full border border-gray-200 shadow-sm shrink-0" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200 shrink-0">
                                <span className="text-[10px] text-gray-400 font-normal">N/A</span>
                              </div>
                            )}
                            <a href={`https://youtube.com/channel/${c.id}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline leading-tight">
                              {c.name}
                            </a>
                          </div>
                        </td>
                        <td 
                          className="px-2 py-1 font-mono text-[10px] text-gray-500 hover:text-blue-600 hover:bg-blue-50 cursor-pointer transition-colors group relative"
                          title="Click để sao chép mã kênh"
                          onClick={() => {
                            navigator.clipboard.writeText(c.id);
                            setStatus(`Đã sao chép ID: ${c.id}`);
                          }}
                        >
                          <div className="flex items-center gap-1">
                            <span>{c.id}</span>
                            <Copy size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </td>
                        <td className="px-2 py-1 text-[10px] bg-gray-50/50">
                          <div className="flex flex-wrap gap-1 items-center justify-center">
                            {c.history.length > 1 ? (
                              <>
                                <span className="text-gray-400">
                                  {c.history[c.history.length - 2].subs.toLocaleString()}
                                </span>
                                <span className="text-gray-300 mx-1">→</span>
                                <span className="font-bold text-blue-600">
                                  {c.history[c.history.length - 1].subs.toLocaleString()}
                                </span>
                              </>
                            ) : (
                              <span className="font-bold text-blue-600">
                                {c.history[0]?.subs.toLocaleString() || '0'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1 text-center font-bold text-green-600 bg-green-50/30">{getGrowth(c.history, 'subs')}</td>
                        <td className="px-2 py-1 text-[10px] bg-gray-50/50">
                          <div className="flex flex-wrap gap-1 items-center justify-center">
                            {c.history.length > 1 ? (
                              <>
                                <span className="text-gray-400">
                                  {c.history[c.history.length - 2].views.toLocaleString()}
                                </span>
                                <span className="text-gray-300 mx-1">→</span>
                                <span className="font-bold text-blue-600">
                                  {c.history[c.history.length - 1].views.toLocaleString()}
                                </span>
                              </>
                            ) : (
                              <span className="font-bold text-blue-600">
                                {c.history[0]?.views.toLocaleString() || '0'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1 text-center font-bold text-green-600 bg-green-50/30">{getGrowth(c.history, 'views')}</td>
                        <td className="px-2 py-1 text-[10px] text-center">
                          {(() => {
                            const viewsGrowthStr = getGrowth(c.history, 'views').replace('+', '');
                            const viewsGrowthNum = parseInt(viewsGrowthStr.replace(/,/g, '')) || 0;
                            return (
                              <div className="flex flex-col items-center">
                                <span className={`px-2 py-0.5 rounded text-white font-bold whitespace-nowrap text-[9px] shadow-sm ${viewsGrowthNum > 10000 ? 'bg-red-600' : viewsGrowthNum > 1000 ? 'bg-orange-600' : 'bg-emerald-600'}`}>
                                  {viewsGrowthNum > 10000 ? '🔥 TĂNG TRƯỞNG MẠNH' : viewsGrowthNum > 1000 ? '⚡ TĂNG TRƯỞNG TỐT' : '📈 DỮ LIỆU ỔN ĐỊNH'}
                                </span>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-2 py-1 text-center">
                             <button 
                               type="button"
                               onClick={(e) => {
                                 e.stopPropagation();
                                 triggerConfirm('Dừng theo dõi', `Ngừng theo dõi kênh "${c.name}"?`, () => {
                                   setTrackingChannels(prev => {
                                     const next = prev.filter(item => item.id !== c.id);
                                     localStorage.removeItem('youtube_tracking_channels');
                                     localStorage.setItem('youtube_tracking_channels', JSON.stringify(next));
                                     return next;
                                   });
                                   setStatus(`Đã ngừng theo dõi ${c.name}`);
                                 });
                               }}
                               className="text-red-500 hover:text-red-700 p-1 active:scale-125 transition-all"
                               title="Xóa khỏi danh sách theo dõi"
                             >
                               <Trash2 size={14} />
                             </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          ) : null}

          {activeTab === 5 ? (
            <div className="vtw-niche-layout flex h-[calc(100vh-140px)] bg-white border border-[#ccc] rounded-b-xl overflow-hidden shadow-2xl relative">
              {/* Internal Sidebar */}
              <div className="vtw-niche-sidebar w-[300px] bg-[#2c3e50] text-white flex flex-col border-r border-[#1a252f] shrink-0">
                <div className="p-4 border-b border-[#34495e] flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-blue-400 font-black italic text-lg uppercase tracking-wider">
                    <Zap size={24} fill="currentColor" /> NICHE RESEARCH
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase font-bold text-[#95a5a6] block">TỪ KHÓA / NGÁCH RESEARCH</label>
                      <button 
                        onClick={() => setShowNicheModal(true)}
                        className="text-[9px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-400/20 hover:bg-blue-500 hover:text-white transition-all flex items-center gap-1 font-bold shadow-sm"
                      >
                        <LayoutGrid size={10} /> XEM GỢI Ý NGÁCH
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input 
                          type="text"
                          placeholder="Ví dụ: nấu ăn, chăm sóc thú cưng..."
                          className="w-full bg-[#34495e] border border-[#45627d] rounded px-3 py-2 text-[12px] text-white outline-none focus:border-blue-400 placeholder:text-gray-400"
                          value={nicheInput}
                          onChange={(e) => setNicheInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && runNicheResearch()}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-[#95a5a6]">Quốc gia</label>
                      <select 
                        value={nicheRegion}
                        onChange={(e) => setNicheRegion(e.target.value)}
                        className="w-full bg-[#34495e] border border-[#45627d] rounded px-2 py-1.5 text-[11px] outline-none"
                      >
                        {REGIONS.map(r => (
                          <option key={r.code} value={r.code}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-[#95a5a6]">Thời gian</label>
                      <select 
                        value={nicheTime}
                        onChange={(e) => setNicheTime(e.target.value)}
                        className="w-full bg-[#34495e] border border-[#45627d] rounded px-2 py-1.5 text-[11px] outline-none"
                      >
                         <option value="day">24 giờ qua</option>
                         <option value="week">7 ngày qua</option>
                         <option value="2weeks">14 ngày qua</option>
                         <option value="month">30 ngày qua</option>
                         <option value="3months">90 ngày qua</option>
                         <option value="year">1 năm qua</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-[#95a5a6] flex justify-between">
                      Số lượng phân tích <span>{nicheVideoCount} items</span>
                    </label>
                    <input 
                      type="range"
                      min="10"
                      max="100"
                      step="10"
                      value={nicheVideoCount}
                      onChange={(e) => setNicheVideoCount(parseInt(e.target.value))}
                      className="w-full accent-blue-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[8px] text-[#7f8c8d] px-1 font-bold">
                       <span>10</span>
                       <span>30</span>
                       <span>50</span>
                       <span>100</span>
                    </div>
                  </div>

                  <div className="space-y-2 mt-2">
                    <label className="text-[10px] uppercase font-black text-gray-400 flex justify-between items-center">
                      Hiển thị từ khóa <span>{displayKeywordLimit === 'all' ? 'Toàn bộ' : `${displayKeywordLimit} items`}</span>
                    </label>
                    <select 
                      value={displayKeywordLimit}
                      onChange={(e) => setDisplayKeywordLimit(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                      className="w-full bg-[#34495e] border border-[#45627d] rounded px-2 py-1.5 text-[11px] outline-none text-white font-bold"
                    >
                      <option value="10">10 từ khóa</option>
                      <option value="50">50 từ khóa</option>
                      <option value="100">100 từ khóa</option>
                      <option value="all">Toàn bộ (Tất cả)</option>
                    </select>
                  </div>

                  <button 
                    onClick={() => runNicheResearch()}
                    disabled={isNicheSearching}
                    className="w-full bg-blue-600 py-3 rounded-xl text-white font-black text-[12px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:bg-gray-600 flex items-center justify-center gap-2 mt-2"
                  >
                    {isNicheSearching ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> ĐANG PHÂN TÍCH...
                      </>
                    ) : (
                      <>
                        <Zap size={16} fill="currentColor" /> PHÂN TÍCH NGAY
                      </>
                    )}
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto py-2">
                  <div className="px-4 mb-2 text-[10px] uppercase font-bold text-[#95a5a6]">Công cụ Phân tích</div>
                  <nav className="space-y-0.5">
                    {[
                      { id: 'summary', label: 'Dashboard Tổng quan', icon: Home },
                      { id: 'keywords', label: 'Bản đồ Từ khóa', icon: LayoutGrid },
                      { id: 'videos', label: 'Top Videos Trending', icon: BarChart3 },
                      { id: 'shorts', label: 'Khám phá Shorts', icon: Smartphone },
                      { id: 'channels', label: 'Phân tích Đối thủ', icon: Users },
                      { id: 'thumbnails', label: 'Mẫu Thumbnail', icon: Image },
                      { id: 'history', label: 'Lịch sử Nghiên cứu', icon: FolderClock },
                    ].map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setNicheActiveSubTab(item.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-[12px] font-bold transition-all border-l-4 ${nicheActiveSubTab === item.id ? 'bg-[#34495e] border-blue-400 text-white' : 'border-transparent text-[#bdc3c7] hover:bg-[#34495e] hover:text-white'}`}
                      >
                        <item.icon size={18} /> {item.label}
                      </button>
                    ))}
                  </nav>
                </div>


              </div>

              {/* Main Content Area */}
              <div className="vtw-niche-content flex-1 bg-gray-50 overflow-y-auto p-6">
                {!nicheResults && nicheActiveSubTab !== 'history' && (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-70">
                    <div className="w-32 h-32 bg-gray-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
                      <LayoutGrid size={64} className="text-gray-300" />
                    </div>
                    <h3 className="text-2xl font-black text-gray-400 uppercase tracking-widest">Sẵn sàng phân tích ngách</h3>
                    <p className="text-gray-400 max-w-md mt-2 text-[14px]">
                      Nhập từ khóa hoặc ngách bạn đang quan tâm vào sidebar để bắt đầu khai thác dữ liệu từ YouTube API.
                    </p>
                  </div>
                )}

                {nicheActiveSubTab === 'summary' && nicheResults && (
                  <div className="space-y-6 animate-in fade-in duration-500">
                    <div className="flex justify-between items-end bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden group">
                       <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                          <BarChart3 size={120} />
                       </div>
                       <div className="relative">
                          <div className="text-[11px] uppercase font-black text-blue-500 tracking-tighter mb-1">KẾT QUẢ PHÂN TÍCH CHO</div>
                          <h2 className="text-4xl font-black text-gray-900 uppercase">{nicheResults.summary.keyword}</h2>
                          <div className="flex gap-4 mt-4 items-center">
                            <div className="flex flex-col">
                               <span className="text-[10px] text-gray-400 font-bold">NHU CẦU THỊ TRƯỜNG</span>
                               <span className="text-xl font-black text-gray-800">{nicheResults.summary.interest}</span>
                            </div>
                            <div className="w-px h-10 bg-gray-100"></div>
                            <div className="flex flex-col">
                               <span className="text-[10px] text-gray-400 font-bold">MỨC ĐỘ CẠNH TRANH</span>
                               <span className="text-xl font-black text-gray-800">{nicheResults.summary.competition}</span>
                            </div>
                            <button 
                              onClick={analyzeWithAI}
                              disabled={isAiAnalyzing}
                              className="ml-4 px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-xl text-[12px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg flex items-center gap-2 disabled:opacity-50"
                            >
                              {isAiAnalyzing ? <RotateCcw size={16} className="animate-spin" /> : <Bot size={18} />}
                              {isAiAnalyzing ? 'ĐANG TƯ DUY...' : 'AI PHÂN TÍCH CHIẾN LƯỢC'}
                            </button>
                          </div>
                       </div>
                       <div className="flex flex-col items-center gap-1 relative">
                          <div className={`w-28 h-28 rounded-full border-[8px] flex items-center justify-center flex-col transition-all duration-1000 ${nicheResults.summary.keywordScore > 70 ? 'border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.2)] text-emerald-600' : nicheResults.summary.keywordScore > 40 ? 'border-orange-400 text-orange-500' : 'border-red-400 text-red-500'}`}>
                             <span className="text-3xl font-black">{nicheResults.summary.keywordScore}</span>
                             <span className="text-[9px] font-bold">ĐIỂM TIỀM NĂNG</span>
                          </div>
                          <span className="text-[10px] font-bold text-gray-400 uppercase">YouTube Score API</span>
                       </div>
                    </div>

                    {aiAnalysisResult && (
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white border-2 border-blue-500/20 rounded-3xl p-8 shadow-2xl relative overflow-hidden"
                      >
                         <div className="absolute top-0 right-0 p-4 opacity-10">
                           <Bot size={120} />
                         </div>
                         <div className="flex items-center gap-3 mb-6 relative">
                           <div className="bg-blue-600 p-2 rounded-xl text-white shadow-lg">
                             <Bot size={24} />
                           </div>
                           <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tight">BÁO CÁO CHIẾN LƯỢC AI (GEMINI)</h3>
                           <div className="ml-auto flex gap-2">
                              <button 
                               onClick={() => copyToClipboard(aiAnalysisResult)}
                               className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-[10px] font-black uppercase transition-all"
                              >
                                Copy kết quả
                              </button>
                              <button 
                               onClick={() => setAiAnalysisResult(null)}
                               className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-[10px] font-black uppercase transition-all"
                              >
                                Đóng báo cáo
                              </button>
                           </div>
                         </div>
                         <div className="markdown-body prose max-w-none prose-blue prose-sm text-gray-700 font-medium leading-relaxed bg-blue-50/30 p-6 rounded-2xl border border-blue-100/50">
                            <Markdown
                              components={{
                                a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline" />
                              }}
                            >
                              {aiAnalysisResult}
                            </Markdown>
                         </div>
                      </motion.div>
                    )}

                    <div className="grid grid-cols-4 gap-4">
                       {[
                         { label: 'View Tăng Trưởng (VPH)', value: nicheResults.summary.avgVPH.toLocaleString(), icon: TrendingUp, color: '#3498db' },
                         { label: 'Video Đang Trending', value: nicheResults.summary.trendVideos, icon: Zap, color: '#f1c40f' },
                         { label: 'Đối Thủ Cùng Ngách', value: nicheResults.summary.uniqueChannels, icon: Users, color: '#9b59b6' },
                         { label: 'Tổng View Ngách (Item)', value: (nicheResults.summary.totalViews / 1000000).toFixed(1) + 'M', icon: Eye, color: '#e74c3c' },
                       ].map((stat, i) => (
                         <div key={i} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 hover:translate-y-[-4px] transition-all">
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-inner" style={{ backgroundColor: stat.color + '15', color: stat.color }}>
                               <stat.icon size={24} />
                            </div>
                            <div>
                               <div className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">{stat.label}</div>
                               <div className="text-2xl font-black text-gray-900">{stat.value}</div>
                            </div>
                         </div>
                       ))}
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                       <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                          <h3 className="text-[14px] font-black text-gray-800 uppercase mb-4 flex items-center gap-2 border-b pb-2">
                             <Tag size={18} className="text-blue-500" /> Bản đồ từ khóa liên quan
                          </h3>
                          <div className="space-y-3">
                             {nicheResults.keywords.slice(0, 8).map((kw: any, i: number) => (
                               <div key={i} className="flex items-center justify-between group">
                                  <div className="flex items-center gap-3">
                                     <span className="text-[10px] font-black text-gray-300">#0{i+1}</span>
                                     <span className="text-[13px] font-bold text-gray-700 group-hover:text-blue-600 transition-colors">{kw.text}</span>
                                  </div>
                                  <div className="flex items-center gap-4">
                                     <div className="flex flex-col items-end">
                                        <span className="text-[9px] text-gray-400 font-bold uppercase">Trending</span>
                                        <span className="text-[11px] font-black text-emerald-600">+{kw.vph.toFixed(1)} VPH</span>
                                     </div>
                                     <div className={`w-10 h-6 rounded flex items-center justify-center text-[10px] font-bold ${kw.score > 70 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                                        {kw.score}
                                     </div>
                                  </div>
                               </div>
                             ))}
                          </div>
                       </div>

                       <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                          <h3 className="text-[14px] font-black text-gray-800 uppercase mb-4 flex items-center gap-2 border-b pb-2">
                             <TrendingUp size={18} className="text-orange-500" /> Video Tiềm năng nhất
                          </h3>
                          <div className="space-y-4">
                             {nicheResults.videos.sort((a: any, b: any) => b.trendScore - a.trendScore).slice(0, 3).map((v: any, i: number) => (
                               <div key={i} className="flex gap-4 p-2 rounded-xl hover:bg-gray-50 transition-colors group relative overflow-hidden">
                                  <div className="w-24 h-14 rounded-lg overflow-hidden shrink-0 border border-gray-200">
                                     <img src={v.snippet.thumbnails.medium.url} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                                  </div>
                                  <div className="flex flex-col justify-between overflow-hidden flex-1">
                                     <h4 className="text-[10px] font-black text-gray-900 uppercase flex items-center justify-between gap-2">
                                        <a href={`https://youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate w-full" title={v.snippet.title}>{v.snippet.title}</a>
                                     </h4>
                                     <div className="flex items-center gap-3 mt-1">
                                        <div className="flex flex-col">
                                           <span className="text-[8px] text-gray-400 font-bold uppercase">Lượt xem</span>
                                           <span className="text-[10px] font-black text-gray-700">{v.statistics.viewCount.toLocaleString()}</span>
                                        </div>
                                        <div className="flex flex-col">
                                           <span className="text-[8px] text-gray-400 font-bold uppercase">VPH (Tốc độ)</span>
                                           <span className="text-[10px] font-black text-blue-600">+{v.vph.toFixed(0)}</span>
                                        </div>
                                        <div className="flex items-center gap-2 ml-auto mt-1 z-20">
                                          <button 
                                            onClick={() => analyzeVideo(v.id)}
                                            className="bg-orange-600 font-bold text-white px-2 py-0.5 rounded text-[8px] whitespace-nowrap hover:bg-orange-700 transition-colors"
                                          >
                                            PHÂN TÍCH
                                          </button>
                                          <div className="bg-orange-600 text-white text-[9px] font-black px-2 py-0.5 rounded shadow-sm whitespace-nowrap">
                                             TREND SCORE: {v.trendScore}
                                          </div>
                                        </div>
                                     </div>
                                  </div>
                               </div>
                             ))}
                          </div>
                          <button onClick={() => setNicheActiveSubTab('videos')} className="w-full mt-4 py-2 border-2 border-dashed border-gray-200 rounded-xl text-[11px] font-bold text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-all uppercase">Xem tất cả video trending</button>
                       </div>
                    </div>
                  </div>
                )}

                {nicheActiveSubTab === 'keywords' && nicheResults && (
                   <div className="animate-in fade-in duration-500">
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden">
                         <div className="bg-[#2c3e50] p-6 text-white flex justify-between items-center relative overflow-hidden">
                             <div className="absolute top-0 right-0 opacity-10 -mr-10 -mt-10">
                                <Search size={200} />
                             </div>
                             <div className="relative">
                                <h3 className="text-2xl font-black uppercase flex items-center gap-3">
                                   <AlignLeft /> BẢN ĐỒ TỪ KHÓA LIÊN QUAN
                                </h3>
                                <p className="text-[12px] text-gray-400 font-medium">Hệ thống phân tích tag & tiêu đề từ các video trending nhất.</p>
                             </div>
                         </div>
                         <div className="overflow-x-auto">
                            <table className="w-full text-left">
                               <thead className="bg-gray-50 border-b border-gray-200">
                                  <tr>
                                     <th className="px-6 py-4 text-[11px] font-black text-gray-500 uppercase">Từ khóa / Thẻ Tag</th>
                                     <th className="px-6 py-4 text-[11px] font-black text-gray-500 uppercase text-center font-mono">Xếp hạng</th>
                                     <th className="px-6 py-4 text-[11px] font-black text-gray-500 uppercase text-right">Xuất hiện</th>
                                     <th className="px-6 py-4 text-[11px] font-black text-gray-500 uppercase text-right">Trung bình VPH</th>
                                     <th className="px-6 py-4 text-[11px] font-black text-gray-500 uppercase text-center">Video Trending</th>
                                     <th className="px-6 py-4 text-[11px] font-black text-gray-500 uppercase text-center">Tiềm năng</th>
                                  </tr>
                               </thead>
                               <tbody className="divide-y divide-gray-100">
                                  {nicheResults.keywords.slice(0, displayKeywordLimit === 'all' ? undefined : (displayKeywordLimit as number)).map((kw: any, i: number) => (
                                     <tr key={i} className="hover:bg-gray-50 transition-colors group">
                                        <td className="px-6 py-4">
                                           <div className="flex items-center gap-2">
                                              <span className="text-blue-500 font-bold">#</span>
                                              <span className="text-[14px] font-bold text-gray-800 group-hover:text-blue-700">{kw.text}</span>
                                           </div>
                                        </td>
                                        <td className="px-6 py-4 text-center font-mono text-[14px] font-black text-gray-300">0{i+1}</td>
                                        <td className="px-6 py-4 text-right font-bold text-gray-500">{kw.count} videos</td>
                                        <td className="px-6 py-4 text-right">
                                           <div className="text-[13px] font-black text-blue-600">+{kw.vph.toLocaleString()} VPH</div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                           <button 
                                              onClick={() => setModalTrendingVideos({ title: kw.text, subtitle: 'Danh sách các video có Trend Score > 60 chứa từ khóa này', videos: kw.trendVideos })}
                                              className="bg-orange-100 text-orange-600 px-3 py-1 rounded-full text-[11px] font-black hover:bg-orange-200 transition-colors shadow-sm cursor-pointer"
                                           >
                                              {kw.trendVideosCount} clips
                                           </button>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                           <div className="flex flex-col items-center">
                                              <div className="w-12 bg-gray-200 h-1.5 rounded-full overflow-hidden mb-1">
                                                 <div className="h-full bg-emerald-500" style={{ width: `${kw.score}%` }}></div>
                                              </div>
                                              <span className="text-[10px] font-black text-emerald-600">{kw.score}%</span>
                                           </div>
                                        </td>
                                     </tr>
                                  ))}
                               </tbody>
                            </table>
                         </div>
                      </div>
                   </div>
                )}

                {nicheActiveSubTab === 'videos' && nicheResults && (
                   <div className="animate-in slide-in-from-right duration-500">
                    <div className="mb-6">
                      <div className="bg-[#1a202c] p-6 rounded-2xl shadow-xl">
                        <div className="flex justify-between items-center mb-6 pt-2">
                           <div className="text-white font-black text-sm uppercase flex items-center gap-2"><Filter size={18} className="text-blue-500" /> BỘ LỌC DỮ LIỆU TÌM KIẾM CHI TIẾT</div>
                           <button onClick={() => setVideoFilters({ trendScore: 0, views: 0, vph: 0 })} className="bg-[#2d3748] hover:bg-[#4a5568] text-gray-300 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase transition-all shadow-sm">Làm mới bộ lọc (Reset All)</button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                           <div className="bg-[#2d3748] p-4 rounded-xl border border-[#4a5568]/50 shadow-inner">
                              <div className="flex justify-between text-gray-200 font-bold text-[13px] mb-2">
                                 <span>Outlier Score <span className="text-[10px] text-gray-400 font-normal block">Range (0-100+)</span></span>
                                 <span className="text-blue-400 text-lg tabular-nums">{videoFilters.trendScore}</span>
                              </div>
                              <input type="range" min="0" max="100" value={videoFilters.trendScore} onChange={(e) => setVideoFilters({...videoFilters, trendScore: parseInt(e.target.value)})} className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                           </div>
                           <div className="bg-[#2d3748] p-4 rounded-xl border border-[#4a5568]/50 shadow-inner">
                              <div className="flex justify-between text-gray-200 font-bold text-[13px] mb-2">
                                 <span>Views <span className="text-[10px] text-gray-400 font-normal block">Range (0-10M+)</span></span>
                                 <span className="text-blue-400 text-lg tabular-nums">{videoFilters.views >= 1000000 ? (videoFilters.views/1000000).toFixed(1) + 'M+' : videoFilters.views >= 1000 ? (videoFilters.views/1000).toFixed(0) + 'K+' : videoFilters.views}</span>
                              </div>
                              <input type="range" min="0" max="10000000" step="50000" value={videoFilters.views} onChange={(e) => setVideoFilters({...videoFilters, views: parseInt(e.target.value)})} className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                           </div>
                           <div className="bg-[#2d3748] p-4 rounded-xl border border-[#4a5568]/50 shadow-inner">
                              <div className="flex justify-between text-gray-200 font-bold text-[13px] mb-2">
                                 <span>Views Per Hour (VPH) <span className="text-[10px] text-gray-400 font-normal block">Range (0-1000+)</span></span>
                                 <span className="text-blue-400 text-lg tabular-nums">{videoFilters.vph >= 1000 ? (videoFilters.vph/1000).toFixed(1) + 'K+' : videoFilters.vph}</span>
                              </div>
                              <input type="range" min="0" max="10000" step="50" value={videoFilters.vph} onChange={(e) => setVideoFilters({...videoFilters, vph: parseInt(e.target.value)})} className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                           </div>
                        </div>
                      </div>
                    </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {nicheResults.videos.filter((v: any) => {
                         if (v.trendScore < videoFilters.trendScore) return false;
                         if (parseInt(v.statistics.viewCount) < videoFilters.views) return false;
                         if (v.vph < videoFilters.vph) return false;
                         return true;
                      }).map((v: any, i: number) => (
                         <div key={i} className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl transition-all group">
                            <div className="relative aspect-video">
                               <img src={v.snippet.thumbnails.high.url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                               <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                                  {v.contentDetails?.duration ? v.contentDetails.duration.replace('PT', '').toLowerCase() : ''}
                               </div>
                               <div className="absolute top-2 left-2 flex gap-1">
                                  <div className="bg-orange-600 text-white text-[10px] font-black px-2 py-1 rounded shadow-lg border border-orange-400">
                                     SCORE {v.trendScore}
                                  </div>
                               </div>
                               <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex flex-col items-center justify-center p-4 opacity-0 group-hover:opacity-100 transition-opacity gap-2">
                                  <a href={`https://youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer" className="w-full bg-white text-black py-2 rounded-xl text-[11px] font-black flex items-center justify-center gap-2 uppercase tracking-tight hover:bg-gray-100">
                                     <ExternalLink size={14} /> Xem ngay video này
                                  </a>
                                  <button 
                                     onClick={() => analyzeVideo(v.id)}
                                     className="w-full bg-orange-600 text-white py-2 rounded-xl text-[11px] font-black flex items-center justify-center gap-2 uppercase tracking-tight hover:bg-orange-700"
                                  >
                                     <Video size={14} /> Phân tích Video (Check)
                                  </button>
                               </div>
                            </div>
                            <div className="p-4">
                               <div className="flex items-center gap-2 mb-2">
                                  <a href={`https://youtube.com/channel/${v.snippet.channelId}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-blue-600 hover:opacity-80 transition-opacity">
                                    <img src={`https://ui-avatars.com/api/?name=${v.snippet.channelTitle}&background=random`} className="w-5 h-5 rounded-full" />
                                    <span className="text-[10px] font-bold text-blue-600 truncate uppercase tracking-tighter">{v.snippet.channelTitle}</span>
                                  </a>
                               </div>
                               <h4 className="text-[12px] font-black text-gray-900 uppercase mb-4 leading-tight">
                                  <a href={`https://youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer" className="hover:text-blue-600">{v.snippet.title}</a>
                               </h4>
                               <div className="grid grid-cols-2 gap-2 border-t pt-3">
                                  <div className="flex flex-col">
                                     <span className="text-[9px] text-gray-400 font-bold uppercase">Lượt xem</span>
                                     <span className="text-[13px] font-black text-gray-800">{v.statistics.viewCount.toLocaleString()}</span>
                                  </div>
                                  <div className="flex flex-col items-end">
                                     <span className="text-[9px] text-gray-400 font-bold uppercase">Tăng trưởng/h</span>
                                     <span className="text-[13px] font-black text-blue-600">+{v.vph.toFixed(0)} VPH</span>
                                  </div>
                               </div>
                            </div>
                         </div>
                      ))}
                   </div>
                  </div>
                )}

                {nicheActiveSubTab === 'shorts' && nicheResults && (
                   <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 animate-in zoom-in duration-500">
                      {nicheResults.shorts.length === 0 ? (
                        <div className="col-span-full py-20 text-center text-gray-400 italic">Không tìm thấy video Shorts nào trong danh sách được tải. Thử phân tích lại với số lượng items lớn hơn.</div>
                      ) : nicheResults.shorts.map((v: any, i: number) => (
                         <div key={i} className="aspect-[9/16] bg-black rounded-2xl overflow-hidden relative group border border-gray-800 shadow-2xl">
                            <img src={v.snippet.thumbnails.high.url} className="w-full h-full object-cover opacity-80" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent"></div>
                            <div className="absolute top-3 left-3 bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded animate-pulse">SHORTS</div>
                            <div className="absolute bottom-0 left-0 right-0 p-4">
                               <div className="flex items-center gap-4 text-white mb-2">
                                  <div className="flex flex-col">
                                     <span className="text-[16px] font-black">{v.statistics.viewCount.toLocaleString()}</span>
                                     <span className="text-[9px] text-gray-400 font-bold uppercase leading-none">Views</span>
                                  </div>
                                  <div className="flex flex-col">
                                     <span className="text-[16px] font-black text-blue-400">+{v.vph.toFixed(0)}</span>
                                     <span className="text-[9px] text-gray-400 font-bold uppercase leading-none">VPH</span>
                                  </div>
                               </div>
                               <h4 className="text-[10px] text-white font-bold leading-tight uppercase mb-2 line-clamp-2">{v.snippet.title}</h4>
                               <div className="flex gap-2">
                                 <a href={`https://youtube.com/shorts/${v.id}`} target="_blank" rel="noreferrer" className="flex-1 bg-white/20 hover:bg-white text-white hover:text-black py-2 rounded-lg text-center text-[10px] font-black uppercase transition-all backdrop-blur-md">Phát Shorts</a>
                                 <button 
                                    onClick={() => analyzeVideo(v.id)}
                                    className="bg-orange-600 hover:bg-orange-700 text-white px-2 rounded-lg text-[10px] font-black uppercase transition-all"
                                    title="Phân tích chi tiết"
                                 >
                                    <Video size={14} />
                                 </button>
                               </div>
                            </div>
                         </div>
                      ))}
                   </div>
                )}

                {nicheActiveSubTab === 'channels' && nicheResults && (
                   <div className="animate-in slide-in-from-left duration-500">
                    <div className="mb-6">
                      <div className="bg-[#1a202c] p-6 rounded-2xl shadow-xl">
                        <div className="flex justify-between items-center mb-6 pt-2">
                           <div className="text-white font-black text-sm uppercase flex items-center gap-2"><Filter size={18} className="text-blue-500" /> BỘ LỌC ĐỐI THỦ</div>
                           <button onClick={() => setChannelFilters({ views: 0, subscribers: 0, videosCount: 0 })} className="bg-[#2d3748] hover:bg-[#4a5568] text-gray-300 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase transition-all shadow-sm">Làm mới bộ lọc (Reset All)</button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                           <div className="bg-[#2d3748] p-4 rounded-xl border border-[#4a5568]/50 shadow-inner">
                              <div className="flex justify-between text-gray-200 font-bold text-[13px] mb-2">
                                 <span>Subscribers <span className="text-[10px] text-gray-400 font-normal block">Range (0-10M+)</span></span>
                                 <span className="text-blue-400 text-lg tabular-nums">{channelFilters.subscribers >= 1000000 ? (channelFilters.subscribers/1000000).toFixed(1) + 'M+' : channelFilters.subscribers >= 1000 ? (channelFilters.subscribers/1000).toFixed(0) + 'K+' : channelFilters.subscribers}</span>
                              </div>
                              <input type="range" min="0" max="10000000" step="50000" value={channelFilters.subscribers} onChange={(e) => setChannelFilters({...channelFilters, subscribers: parseInt(e.target.value)})} className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                           </div>
                           <div className="bg-[#2d3748] p-4 rounded-xl border border-[#4a5568]/50 shadow-inner">
                              <div className="flex justify-between text-gray-200 font-bold text-[13px] mb-2">
                                 <span>Views <span className="text-[10px] text-gray-400 font-normal block">Range (0-10M+)</span></span>
                                 <span className="text-blue-400 text-lg tabular-nums">{channelFilters.views >= 1000000 ? (channelFilters.views/1000000).toFixed(1) + 'M+' : channelFilters.views >= 1000 ? (channelFilters.views/1000).toFixed(0) + 'K+' : channelFilters.views}</span>
                              </div>
                              <input type="range" min="0" max="10000000" step="50000" value={channelFilters.views} onChange={(e) => setChannelFilters({...channelFilters, views: parseInt(e.target.value)})} className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                           </div>
                           <div className="bg-[#2d3748] p-4 rounded-xl border border-[#4a5568]/50 shadow-inner">
                              <div className="flex justify-between text-gray-200 font-bold text-[13px] mb-2">
                                 <span>Video Count <span className="text-[10px] text-gray-400 font-normal block">Range (0-10,000+)</span></span>
                                 <span className="text-blue-400 text-lg tabular-nums">{channelFilters.videosCount >= 1000 ? (channelFilters.videosCount/1000).toFixed(1) + 'K+' : channelFilters.videosCount}</span>
                              </div>
                              <input type="range" min="0" max="10000" step="100" value={channelFilters.videosCount} onChange={(e) => setChannelFilters({...channelFilters, videosCount: parseInt(e.target.value)})} className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                           </div>
                        </div>
                      </div>
                    </div>
                   <div className="space-y-4">
                      {nicheResults.channels.filter((c: any) => {
                         if ((parseInt(c.statistics.subscriberCount) || 0) < channelFilters.subscribers) return false;
                         if ((parseInt(c.statistics.viewCount) || 0) < channelFilters.views) return false;
                         if ((parseInt(c.statistics.videoCount) || 0) < channelFilters.videosCount) return false;
                         return true;
                      }).map((c: any, i: number) => (
                         <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between group hover:shadow-lg transition-all">
                            <div className="flex items-center gap-6">
                               <div className="relative">
                                  <img src={c.snippet.thumbnails.default.url} className="w-16 h-16 rounded-full border-2 border-white shadow-xl" />
                                  <div className="absolute -bottom-1 -right-1 bg-blue-500 text-white rounded-full p-1 border-2 border-white">
                                     <CheckCircle2 size={12} />
                                  </div>
                               </div>
                               <div className="flex flex-col">
                                  <div className="flex items-center gap-2">
                                     <a href={`https://youtube.com/channel/${c.id}`} target="_blank" rel="noreferrer" className="hover:text-blue-600 transition-colors"><h5 className="text-[18px] font-black text-gray-900 uppercase">{c.snippet.title}</h5></a>
                                     <span className="text-[11px] font-bold text-gray-400 bg-gray-100 px-2 rounded-full uppercase tracking-tighter">ID: {c.id}</span>
                                  </div>
                                  <div className="flex gap-4 mt-1 items-center">
                                     <div className="flex gap-2 items-center">
                                        <Users size={14} className="text-gray-400" />
                                        <span className="text-[12px] font-bold text-gray-600">{(parseInt(c.statistics.subscriberCount) || 0).toLocaleString()} <span className="font-medium text-gray-400 lowercase">subs</span></span>
                                     </div>
                                     <div className="w-1 h-1 bg-gray-300 rounded-full"></div>
                                     <div className="flex gap-2 items-center">
                                        <Video size={14} className="text-gray-400" />
                                        <span className="text-[12px] font-bold text-gray-600">{(parseInt(c.statistics.videoCount) || 0).toLocaleString()} <span className="font-medium text-gray-400 lowercase">videos</span></span>
                                     </div>
                                     <div className="w-1 h-1 bg-gray-300 rounded-full"></div>
                                     <div className="flex gap-2 items-center">
                                        <Eye size={14} className="text-gray-400" />
                                        <span className="text-[12px] font-bold text-gray-600">{(parseInt(c.statistics.viewCount) || 0).toLocaleString()} <span className="font-medium text-gray-400 lowercase">views</span></span>
                                     </div>
                                  </div>
                               </div>
                            </div>
                            <div className="flex items-center gap-10">
                               <button 
                                 onClick={() => setModalTrendingVideos({ title: c.snippet.title, subtitle: 'Danh sách các video của kênh này lọt top trending', videos: c.chanVideos })}
                                 className="flex flex-col items-center bg-blue-50/50 px-4 py-2 rounded-xl border border-blue-100 hover:bg-blue-100 cursor-pointer transition-colors"
                               >
                                  <span className="text-[10px] text-blue-500 font-bold uppercase mb-1">Video Lọt Top Trending</span>
                                  <div className="flex items-center gap-2">
                                    <div className="flex -space-x-2">
                                       {[...Array(Math.min(3, c.chanVideosCount))].map((_, idx) => (
                                         <div key={idx} className="w-8 h-8 rounded-full border-2 border-white bg-blue-100 flex items-center justify-center shadow-sm relative z-10">
                                            <Flame size={14} className="text-orange-500" />
                                         </div>
                                       ))}
                                    </div>
                                    <span className="text-[18px] font-black text-blue-600 leading-none flex items-center"><span className="text-[12px] font-bold text-gray-500 mr-1 mt-1">x</span>{c.chanVideosCount}</span>
                                  </div>
                               </button>
                               <button 
                                 onClick={() => { setSpyInput(c.id); setActiveTab(2); }}
                                 className="px-6 py-3 bg-[#e67e22] text-white rounded-2xl text-[12px] font-black uppercase tracking-tight shadow-md hover:bg-[#d35400] active:scale-95 transition-all flex items-center gap-2"
                               >
                                  <BarChart2 size={16} /> Bóc tách kênh này
                               </button>
                            </div>
                         </div>
                      ))}
                   </div>
                  </div>
                )}

                {nicheActiveSubTab === 'thumbnails' && nicheResults && (
                   <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 animate-in zoom-in duration-500">
                      {nicheResults.thumbnails.map((v: any, i: number) => (
                         <div key={i} className="bg-white p-2 rounded-2xl shadow-sm border border-gray-100 group transition-all">
                            <div className="relative aspect-video rounded-xl overflow-hidden mb-3">
                               <img src={v.snippet.thumbnails.high.url} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                               <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                  <button onClick={() => window.open(v.snippet.thumbnails.high.url, '_blank')} className="bg-white p-2 rounded-full text-black hover:bg-blue-500 hover:text-white transition-colors" title="Xem ảnh gốc"><Eye size={18} /></button>
                                  <a href={`https://youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer" className="bg-white p-2 rounded-full text-black hover:bg-blue-500 hover:text-white transition-colors" title="Mở video"><ExternalLink size={18} /></a>
                               </div>
                            </div>
                            <h5 className="text-[11px] font-bold text-gray-900 line-clamp-2 uppercase h-8 leading-tight">{v.snippet.title}</h5>
                            <div className="mt-3 flex justify-between items-center bg-gray-50 p-2 rounded-lg">
                               <div className="flex flex-col">
                                  <span className="text-[8px] text-gray-400 font-bold uppercase">View/VPH</span>
                                  <span className="text-[11px] font-black text-gray-700">{v.statistics.viewCount.toLocaleString()} / <span className="text-blue-500">+{v.vph.toFixed(0)}</span></span>
                               </div>
                            </div>
                         </div>
                      ))}
                   </div>
                )}

                {nicheActiveSubTab === 'history' && (
                   <div className="animate-in slide-in-from-bottom duration-500">
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden min-h-[500px]">
                         <div className="bg-orange-600 p-6 text-white flex justify-between items-center relative overflow-hidden">
                             <div className="absolute top-0 right-0 opacity-10 -mr-10 -mt-10">
                                <HistoryIcon size={200} />
                             </div>
                             <div className="relative">
                                <h3 className="text-2xl font-black uppercase flex items-center gap-3">
                                   <HistoryIcon /> LỊCH SỬ NGHIÊN CỨU GẦN ĐÂY
                                </h3>
                                <p className="text-[12px] text-orange-200 font-medium">Hệ thống ghi lại các ngách đã được research thành công.</p>
                             </div>
                             <button
                               onClick={() => {
                                 setNicheHistory([]);
                                 localStorage.setItem('youtube_niche_history', '[]');
                               }}
                               className="relative z-10 bg-white/20 hover:bg-white/40 px-4 py-2 rounded-xl text-[11px] font-black uppercase border border-white/30 transition-all flex items-center gap-2"
                             >
                               <Trash2 size={16} /> Dọn sạch lịch sử
                             </button>
                         </div>
                         <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {nicheHistory.length === 0 ? (
                               <div className="col-span-full py-20 text-center text-gray-300 italic flex flex-col items-center">
                                  <FolderClock size={64} className="mb-4 opacity-20" />
                                  Chưa có lịch sử nghiên cứu nào được lưu lại.
                               </div>
                            ) : nicheHistory.map((h, i) => (
                               <div key={i} className="bg-gray-50 p-5 rounded-2xl border border-gray-200 flex flex-col justify-between group hover:border-[#e67e22] transition-colors relative overflow-hidden">
                                  <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-125 transition-transform">
                                     <BarChart3 size={80} />
                                  </div>
                                  <div>
                                     <div className="flex justify-between items-start mb-4">
                                        <h4 className="text-xl font-black text-gray-800 uppercase line-clamp-1">{h.keyword}</h4>
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-black text-white ${h.keywordScore > 70 ? 'bg-emerald-500' : h.keywordScore > 40 ? 'bg-orange-500' : 'bg-red-500'}`}>
                                           {h.keywordScore}
                                        </div>
                                     </div>
                                     <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div className="flex flex-col">
                                           <span className="text-[9px] text-gray-400 font-bold uppercase">Nhu cầu</span>
                                           <span className="text-[12px] font-black text-gray-700">{h.interest}</span>
                                        </div>
                                        <div className="flex flex-col">
                                           <span className="text-[9px] text-gray-400 font-bold uppercase">Cạnh tranh</span>
                                           <span className="text-[12px] font-black text-gray-700">{h.competition}</span>
                                        </div>
                                     </div>
                                  </div>
                                  <button 
                                    onClick={() => { setNicheInput(h.keyword); runNicheResearch(h.keyword); setNicheActiveSubTab('summary'); }}
                                    className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-orange-600 transition-colors shadow-lg shadow-gray-200"
                                  >
                                     Xem lại báo cáo này
                                  </button>
                               </div>
                            ))}
                         </div>
                      </div>
                   </div>
                )}
              </div>
            </div>
          ) : null}

          {activeTab === 4 ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-1 w-full text-gray-900 text-left">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-400">
                    <Search size={20} />
                  </div>
                  <input 
                    type="text" 
                    className="w-full pl-12 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl text-[14px] focus:ring-2 focus:ring-[#e67e22] transition-all outline-none"
                    placeholder="Nhập ID hoặc Link Video YouTube..."
                    value={videoInput}
                    onChange={(e) => setVideoInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && analyzeVideo()}
                  />
                  {videoInput && (
                    <button 
                      onClick={() => setVideoInput('')}
                      className="absolute inset-y-0 right-4 flex items-center text-gray-400 hover:text-red-500"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                  <button 
                    onClick={() => analyzeVideo()}
                    disabled={isAnalyzingVideo}
                    className="bg-[#e67e22] text-white px-8 py-3 rounded-xl font-bold flex items-center gap-3 hover:brightness-110 active:scale-95 shadow-md disabled:opacity-50 flex-1 md:flex-none justify-center transition-all shadow-sm active:shadow-inner"
                  >
                    {isAnalyzingVideo ? <Loader2 className="animate-spin" size={20} /> : <Video size={20} />}
                    KIỂM TRA VIDEO
                  </button>
                  <button 
                    onClick={() => setShowVideoProjects(!showVideoProjects)}
                    className={`px-4 py-3 rounded-xl font-bold flex items-center gap-2 border transition-all active:scale-95 shadow-sm ${showVideoProjects ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50'}`}
                  >
                    <FolderClock size={20} />
                    {showVideoProjects ? 'ĐÓNG LỊCH SỬ' : 'LỊCH SỬ DỰ ÁN'}
                  </button>
                </div>
              </div>

              {/* Video Project History List */}
              {showVideoProjects && (
                <div className="bg-white border border-blue-100 rounded-2xl p-4 shadow-xl animate-in fade-in slide-in-from-top-4">
                   <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100">
                      <h3 className="text-[14px] font-black text-gray-800 flex items-center gap-2">
                        <FolderClock size={16} className="text-blue-600" /> DANH SÁCH VIDEO ĐÃ KIỂM TRA GẦN ĐÂY ({videoProjects.length})
                      </h3>
                      <button 
                        onClick={() => {
                          triggerConfirm('Xóa lịch sử video', 'Bạn có chắc muốn xóa sạch lịch sử kiểm tra video không?', () => {
                            setVideoProjects([]);
                            localStorage.removeItem('youtube_video_projects');
                            setStatus('Đã xóa sạch lịch sử video.');
                          });
                        }}
                        className="text-[10px] text-red-500 font-bold hover:underline"
                      >
                        XÓA TẤT CẢ
                      </button>
                   </div>
                   {videoProjects.length === 0 ? (
                     <div className="py-10 text-center text-gray-400 italic">Chưa có lịch sử kiểm tra video nào.</div>
                   ) : (
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {videoProjects.map((p, idx) => (
                          <div 
                            key={idx} 
                            onClick={() => {
                              setVideoResult(p);
                              setVideoInput(p.id);
                              setShowVideoProjects(false);
                              setStatus(`Đã mở lại video: ${p.snippet.title}`);
                            }}
                            className="bg-gray-50 p-2 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50/30 cursor-pointer group transition-all"
                          >
                            <div className="relative aspect-video rounded-lg overflow-hidden mb-2">
                              <img 
                                src={p.snippet.thumbnails.medium?.url || p.snippet.thumbnails.default?.url} 
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                <Play size={24} className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md" />
                              </div>
                            </div>
                            <div className="text-[11px] font-bold text-gray-800 line-clamp-2 leading-tight">
                              {p.snippet.title}
                            </div>
                            <div className="text-[9px] text-gray-500 mt-1 flex justify-between items-center">
                              <span><a href={`https://youtube.com/channel/${p.snippet.channelId}`} target="_blank" rel="noreferrer" className="hover:text-blue-600 transition-colors">{p.snippet.channelTitle}</a></span>
                              <span className="font-mono">{parseInt(p.statistics.viewCount).toLocaleString()} views</span>
                            </div>
                          </div>
                        ))}
                     </div>
                   )}
                </div>
              )}

              {videoResult && (
                <div className="space-y-6 text-gray-900 pb-20">
                  {/* Video Title Header */}
                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex-1">
                      <div className="text-[12px] text-blue-600 font-bold uppercase tracking-widest mb-1 flex items-center gap-2">
                        <Video size={14} /> TIÊU ĐỀ VIDEO
                      </div>
                      <h1 className="text-2xl md:text-3xl font-black text-gray-900 leading-tight">
                        {videoResult.snippet.title}
                      </h1>
                    </div>
                    <button 
                      onClick={() => window.open(`https://www.youtube.com/watch?v=${videoResult.id}`, '_blank')}
                      className="bg-red-600 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-red-700 active:scale-95 transition-all shadow-lg shadow-red-100 shrink-0"
                    >
                      <Play fill="currentColor" size={18} /> XEM TRÊN YOUTUBE
                    </button>
                  </div>

                  {/* Image 1: Overview Summary */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left Column: Thumbnail and RPM */}
                    <div className="lg:col-span-4 space-y-4">
                      <div className="relative aspect-video rounded-2xl overflow-hidden shadow-xl border border-gray-100 group">
                        <img 
                          src={videoResult.snippet.thumbnails.maxres?.url || videoResult.snippet.thumbnails.high?.url} 
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          alt="Thumbnail"
                        />
                        <div 
                          onClick={() => window.open(`https://www.youtube.com/watch?v=${videoResult.id}`, '_blank')}
                          className="absolute inset-0 transition-colors cursor-pointer"
                        />

                      </div>

                      <div className="bg-yellow-50 p-6 rounded-2xl border border-yellow-100 relative overflow-hidden">
                        <div className="absolute top-4 right-4 text-yellow-200">
                          <RotateCcw size={48} className="rotate-45" />
                        </div>
                        <div className="flex items-center gap-2 text-orange-700 font-black text-[12px] uppercase tracking-wider mb-2">
                           <TrendingUp size={16} /> RPM ƯỚC TÍNH (CHỦ ĐỀ)
                        </div>
                        <div className="text-3xl font-black text-orange-900">
                          $0.50 - $2.50 <span className="text-[14px] text-orange-600 font-bold">/ 1K VIEWS</span>
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Metrics and Channels */}
                    <div className="lg:col-span-8 flex flex-col gap-4">
                      {/* Metrics Card Row */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                          { label: 'LƯỢT XEM', value: videoResult.statistics?.viewCount ? parseInt(videoResult.statistics.viewCount).toLocaleString('vi-VN') : '0', icon: Eye, color: 'text-blue-600', iconBg: 'bg-blue-50' },
                          { label: 'LƯỢT THÍCH', value: videoResult.statistics?.likeCount ? parseInt(videoResult.statistics.likeCount).toLocaleString('vi-VN') : '0', icon: ThumbsUp, color: 'text-red-500', iconBg: 'bg-red-50' },
                          { label: 'BÌNH LUẬN', value: videoResult.statistics?.commentCount ? parseInt(videoResult.statistics.commentCount).toLocaleString('vi-VN') : '0', icon: MessageCircle, color: 'text-green-600', iconBg: 'bg-green-50' },
                          { label: 'THỜI LƯỢNG', value: formatDuration(videoResult.contentDetails?.duration), icon: Clock, color: 'text-indigo-600', iconBg: 'bg-indigo-50' }
                        ].map((stat, i) => (
                          <div key={i} className="bg-white p-5 rounded-2xl border border-gray-100 flex flex-col items-start gap-2 shadow-sm">
                            <div className={`p-2 rounded-lg ${stat.iconBg} ${stat.color}`}>
                              <stat.icon size={20} />
                            </div>
                            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{stat.label}</div>
                            <div className="text-xl font-black text-gray-900">{stat.value}</div>
                          </div>
                        ))}
                      </div>

                      {/* Time Info Row */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                          <div className="text-[11px] text-gray-400 font-bold uppercase tracking-widest mb-4">GIỜ ĐĂNG (VIỆT NAM)</div>
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-xl flex items-center justify-center font-black text-[14px]">VN</div>
                            <div className="text-left">
                              <div className="text-[15px] font-black text-gray-800">
                                {new Date(videoResult.snippet.publishedAt).toLocaleDateString('vi-VN', { weekday: 'long', timeZone: 'Asia/Ho_Chi_Minh' })}, lúc {new Date(videoResult.snippet.publishedAt).toLocaleTimeString('vi-VN', { hour12: false, timeZone: 'Asia/Ho_Chi_Minh' })} ngày {new Date(videoResult.snippet.publishedAt).toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })} (GMT+7)
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                          <div className="text-[11px] text-gray-400 font-bold uppercase tracking-widest mb-4">GIỜ ĐĂNG (QUỐC TẾ)</div>
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-black text-[14px]">UTC</div>
                            <div className="text-left">
                              <div className="text-[15px] font-black text-gray-800">
                                {new Date(videoResult.snippet.publishedAt).toLocaleDateString('vi-VN', { weekday: 'long', timeZone: 'UTC' })}, lúc {new Date(videoResult.snippet.publishedAt).toLocaleTimeString('vi-VN', { hour12: false, timeZone: 'UTC' })} ngày {new Date(videoResult.snippet.publishedAt).toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' })} (UTC)
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Channel Info Row */}
                      <div className="mt-auto bg-gray-50/50 p-4 rounded-2xl border border-gray-100 flex items-center justify-between">
                         <div className="flex items-center gap-4 bg-white/50 px-6 py-4 rounded-xl border border-gray-100 shadow-sm">
                           <div className="text-[12px] font-bold text-gray-500 uppercase">KÊNH YOUTUBE:</div>
                           <a href={`https://youtube.com/channel/${videoResult.snippet.channelId}`} target="_blank" rel="noreferrer" className="text-[16px] font-black text-blue-600 hover:underline cursor-pointer">{videoResult.snippet.channelTitle}</a>
                         </div>
                         <button 
                           onClick={() => goToSpy(videoResult.snippet.channelId)}
                           className="bg-red-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 hover:bg-red-700 active:scale-95 shadow-lg shadow-red-100 transition-all"
                         >
                           <Search size={22} /> PHÂN TÍCH KÊNH NÀY
                         </button>
                      </div>
                    </div>
                  </div>

                  {/* Image 2: Technical Details Section */}
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
                    <div className="bg-gray-50/50 px-8 py-6 border-b border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-600 rounded-xl text-white">
                          <Settings size={20} />
                        </div>
                        <h3 className="text-xl font-black text-gray-900 tracking-tight">CHI TIẾT NỘI DUNG KỸ THUẬT</h3>
                      </div>
                      <button 
                        onClick={() => {
                          const data = [
                            ['TIÊU ĐỀ VIDEO', videoResult.snippet.title],
                            ['LINK VIDEO', `https://www.youtube.com/watch?v=${videoResult.id}`],
                            ['TÊN KÊNH', videoResult.snippet.channelTitle],
                            ['CHANNEL ID', videoResult.snippet?.channelId],
                            ['QUỐC GIA KÊNH', videoResult._channelInfo?.snippet?.country || 'N/A'],
                            ['VIDEO ID', videoResult.id],
                            ['CATEGORY ID', videoResult.snippet?.categoryId],
                            ['CATEGORY NAME', getCategoryName(videoResult.snippet?.categoryId)],
                            ['GIỜ UTC (GỐC)', new Date(videoResult.snippet?.publishedAt).toISOString()],
                            ['THỜI LƯỢNG', formatDuration(videoResult.contentDetails?.duration)],
                            ['GIỜ VN (GMT+7)', new Date(videoResult.snippet?.publishedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })],
                            ['LƯỢT XEM VIDEO', videoResult.statistics?.viewCount],
                            ['SỐ LƯỢT THÍCH', videoResult.statistics?.likeCount || '0'],
                            ['SỐ LƯỢT BÌNH LUẬN', videoResult.statistics?.commentCount || '0'],
                            ['THỜI GIAN CHECK', new Date().toLocaleString('vi-VN')]
                          ];
                          const text = data.map(([k, v]) => `${k}: ${v}`).join('\n');
                          downloadAsTxt(text, `Technical_Details_${videoResult.id}`);
                        }}
                        className="bg-gray-900 text-white px-6 py-2.5 rounded-xl text-[12px] font-black flex items-center gap-2 hover:bg-black transition-all shadow-lg shadow-gray-200"
                      >
                        <Download size={16} /> TẢI TXT
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-x divide-y divide-gray-100">
                      {[
                        { label: 'TIÊU ĐỀ VIDEO', value: videoResult.snippet.title },
                        { label: 'LINK VIDEO', value: `https://www.youtube.com/watch?v=${videoResult.id}`, isLink: true },
                        { label: 'TÊN KÊNH', value: videoResult.snippet.channelTitle },
                        { label: 'CHANNEL ID', value: videoResult.snippet.channelId },
                        { label: 'QUỐC GIA KÊNH', value: videoResult._channelInfo?.snippet?.country || 'N/A' },
                        { label: 'VIDEO ID', value: videoResult.id },
                        { label: 'CATEGORY ID', value: videoResult.snippet.categoryId },
                        { label: 'CATEGORY NAME', value: getCategoryName(videoResult.snippet.categoryId) },
                        { label: 'CATEGORY TIẾNG VIỆT', value: getCategoryName(videoResult.snippet.categoryId) }, 
                        { label: 'GIỜ UTC (GỐC)', value: videoResult.snippet?.publishedAt ? new Date(videoResult.snippet.publishedAt).toISOString().replace('T', ' ').split('.')[0] : 'N/A' },
                        { label: 'THỜI LƯỢNG', value: formatDuration(videoResult.contentDetails?.duration) },
                        { label: 'GIỜ VN (GMT+7)', value: videoResult.snippet?.publishedAt ? new Date(videoResult.snippet.publishedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'N/A' },
                        { label: 'LƯỢT XEM VIDEO', value: videoResult.statistics?.viewCount ? parseInt(videoResult.statistics.viewCount).toLocaleString('vi-VN') : '0' },
                        { label: 'SỐ LƯỢT THÍCH', value: videoResult.statistics?.likeCount ? parseInt(videoResult.statistics.likeCount).toLocaleString('vi-VN') : '0' },
                        { label: 'SỐ LƯỢT BÌNH LUẬN', value: videoResult.statistics?.commentCount ? parseInt(videoResult.statistics.commentCount).toLocaleString('vi-VN') : '0' },
                        { label: 'THỜI GIAN CHECK', value: new Date().toLocaleString('vi-VN') }
                      ].map((item, i) => (
                        <div key={i} className="p-6 bg-white hover:bg-gray-50/50 transition-colors group text-left">
                          <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2 group-hover:text-blue-500 transition-colors">{item.label}</div>
                          {item.isLink ? (
                            <div className="flex items-center gap-2">
                              <a href={item.value} target="_blank" rel="noreferrer" className="text-[14px] font-black text-blue-600 break-all flex-1 leading-tight hover:underline">{item.value}</a>
                              <button onClick={() => copyToClipboard(item.value)} className="p-1.5 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100"><Copy size={12}/></button>
                            </div>
                          ) : (
                            <div className="text-[14px] font-black text-gray-900 break-words whitespace-normal">{item.value}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Image 3: Description and Tags Section */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Description Column */}
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-xl flex flex-col h-[500px]">
                      <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-purple-600 rounded-xl text-white">
                            <AlignLeft size={20} />
                          </div>
                          <h3 className="text-xl font-black text-gray-900">MÔ TẢ VIDEO (DESCRIPTION)</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => downloadAsTxt(videoResult.snippet.description, `Description_${videoResult.id}`)}
                            className="p-2 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors"
                            title="Tải mô tả về TXT"
                          >
                            <Download size={18} />
                          </button>
                          <button 
                            onClick={() => copyToClipboard(videoResult.snippet.description)}
                            className="p-2 bg-purple-50 text-purple-600 rounded-xl hover:bg-purple-100 transition-colors"
                          >
                            <Copy size={18} />
                          </button>
                        </div>
                      </div>
                      <div className="p-8 overflow-y-auto custom-scrollbar flex-1 text-left">
                        <pre className="text-[14px] font-medium text-gray-600 whitespace-pre-wrap font-sans leading-relaxed">
                          <LinkifyText text={videoResult.snippet.description} />
                        </pre>
                      </div>
                    </div>

                    {/* Tags Column */}
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-xl flex flex-col h-[500px]">
                      <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-green-600 rounded-xl text-white">
                            <Tag size={20} />
                          </div>
                          <h3 className="text-xl font-black text-gray-900">DÀN TAGS VIDEO</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => downloadAsTxt(videoResult.snippet.tags?.join(', ') || '', `Tags_${videoResult.id}`)}
                            className="p-2 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors"
                            title="Tải tags về TXT"
                          >
                            <Download size={18} />
                          </button>
                          <button 
                            onClick={() => copyToClipboard(videoResult.snippet.tags?.join(', ') || '')}
                            className="p-2 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition-colors"
                          >
                            <Copy size={18} />
                          </button>
                        </div>
                      </div>
                      <div className="p-8 overflow-y-auto custom-scrollbar flex-1 space-y-6 text-left">
                        <div className="flex flex-wrap gap-2">
                          {videoResult.snippet.tags ? videoResult.snippet.tags.map((tag: string, i: number) => (
                            <div key={i} className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-full text-[13px] font-bold text-gray-700 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 transition-all cursor-default">
                              {tag}
                            </div>
                          )) : (
                            <div className="text-gray-400 font-medium italic">Video này không có tags.</div>
                          )}
                        </div>
                        
                        {videoResult.snippet.tags && videoResult.snippet.tags.length > 0 && (
                          <div className="pt-6 border-t border-gray-100 text-left">
                             <div className="text-[11px] text-gray-400 font-bold uppercase tracking-widest mb-3">TỪ KHÓA CHÍNH SEO</div>
                             <div className="inline-flex items-center gap-3 bg-red-50 text-red-600 px-6 py-3 rounded-2xl border border-red-100">
                               <Zap size={18} />
                               <span className="text-[18px] font-black uppercase">{videoResult.snippet.tags[0]}</span>
                             </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Image 4: CTA & Pinned Comment Section */}
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
                    <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-pink-600 rounded-xl text-white">
                          <MessageSquare size={20} />
                        </div>
                        <h3 className="text-xl font-black text-gray-900 tracking-tight uppercase">Bình Luận Ghim & Bình luận khác</h3>
                      </div>
                      <div className="flex items-center gap-2 px-4 py-1.5 bg-blue-50 text-blue-600 rounded-full text-[12px] font-black">
                        <MessageSquare size={14} /> {videoResult._comments?.length || 0} Bình luận
                      </div>
                    </div>
                    <div className="p-8 bg-gray-50/30">
                      <div className="max-h-[600px] overflow-y-auto custom-scrollbar space-y-4 pr-2 pt-4">
                        {videoResult._comments && videoResult._comments.length > 0 ? (
                          videoResult._comments.map((comment: any, idx: number) => (
                            <div key={idx} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative text-left">
                              {idx === 0 && (
                                <div className="absolute top-0 right-4 -translate-y-1/2 bg-blue-600 text-white px-3 py-0.5 rounded-full text-[9px] font-black tracking-widest uppercase shadow-lg shadow-blue-100 flex items-center gap-1">
                                  <Pin size={8} className="rotate-45" /> TOP/PINNED
                                </div>
                              )}
                              <div className="flex gap-4">
                                <div className="w-10 h-10 bg-gradient-to-br from-gray-200 to-gray-300 rounded-xl flex items-center justify-center text-gray-600 text-sm font-black shrink-0 uppercase">
                                   {comment.authorDisplayName?.charAt(0) || '?'}
                                </div>
                                <div className="space-y-2 flex-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[13px] font-black text-gray-900">@{comment.authorDisplayName}</span>
                                    <div className="flex items-center gap-3">
                                      <div className="flex items-center gap-1 text-gray-400">
                                        <ThumbsUp size={12} /> <span className="text-[11px] font-bold">{comment.likeCount}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-[13px] font-medium text-gray-600 leading-snug whitespace-pre-wrap">
                                    <LinkifyText text={comment.textDisplay.replace(/<br>/g, '\n').replace(/<\/?[^>]+(>|$)/g, "")} />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 text-gray-400 font-medium italic">
                             Không tìm thấy bình luận nào hoặc video bị tắt tính năng bình luận.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
        </>
        )}
      </div>

      {/* Modal Lịch sử Key */}
      <AnimatePresence>
        {showKeyHistory && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden border border-orange-100"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-4 flex justify-between items-center text-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <Save size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Lịch sử API Keys</h2>
                    <p className="text-xs opacity-80">Quản lý và khôi phục các Key đã từng sử dụng</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowKeyHistory(false)}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Toolbar */}
              <div className="p-4 border-b border-gray-100 bg-orange-50 flex flex-wrap gap-3 justify-between items-center">
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={() => addKeysToActive(selectedHistoryKeys)}
                    disabled={selectedHistoryKeys.length === 0}
                    className="flex items-center gap-2 bg-[#e67e22] hover:bg-[#d35400] disabled:bg-gray-300 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-all active:scale-95"
                    title="Sử dụng các Key đang được tích chọn"
                  >
                    <CheckCircle2 size={18} />
                    Dùng {selectedHistoryKeys.length} Key chọn
                  </button>
                  <button 
                    onClick={() => {
                      triggerConfirm("Dùng Tất Cả", "Bạn muốn dùng toàn bộ key trong lịch sử (bao gồm cả key chưa chọn)?", () => {
                        addKeysToActive(apiKeysHistory);
                      }, "XÁC NHẬN DÙNG", false);
                    }}
                    className="flex items-center gap-2 bg-[#3498db] hover:bg-[#2980b9] text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-all active:scale-95"
                  >
                    <PlusCircle size={18} />
                    Dùng tất cả
                  </button>
                  <div className="w-[1px] h-8 bg-gray-300 mx-1 hidden sm:block"></div>
                  <button 
                    onClick={() => setSelectedHistoryKeys([...apiKeysHistory])}
                    className="flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-lg text-sm font-bold transition-all"
                  >
                    Tích chọn hết
                  </button>
                  <button 
                    onClick={() => setSelectedHistoryKeys([])}
                    className="flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-lg text-sm font-bold transition-all text-red-500"
                  >
                    Bỏ chọn hết
                  </button>
                </div>
                <button 
                  onClick={clearHistory}
                  className="flex items-center gap-2 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                >
                  <Trash2 size={18} />
                  Xóa lịch sử
                </button>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {apiKeysHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                    <RotateCcw size={48} className="mb-4 opacity-20" />
                    <p className="text-lg italic">Không có dữ liệu lịch sử</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {apiKeysHistory.map((key, idx) => (
                      <div 
                        key={idx}
                        className={`flex items-start gap-3 p-4 rounded-xl border transition-all cursor-pointer ${
                          selectedHistoryKeys.includes(key) 
                            ? 'border-orange-500 bg-orange-50 shadow-sm' 
                            : 'border-gray-200 bg-white hover:border-orange-200 hover:bg-gray-50'
                        }`}
                        onClick={() => {
                          if (selectedHistoryKeys.includes(key)) {
                            setSelectedHistoryKeys(prev => prev.filter(k => k !== key));
                          } else {
                            setSelectedHistoryKeys(prev => [...prev, key]);
                          }
                        }}
                      >
                        <div className="pt-1">
                          <input 
                            type="checkbox" 
                            checked={selectedHistoryKeys.includes(key)}
                            onChange={() => {}} // Handled by div onClick
                            className="w-5 h-5 accent-orange-500 rounded border-gray-300 cursor-pointer"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">KEY #{idx + 1}</span>
                            <div className="flex gap-2">
                              {exhaustedKeys.includes(key.trim()) && (
                                <span className="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                  LỖI / HẾT HẠN
                                </span>
                              )}
                              {config.apiKeys.includes(key.trim()) && (
                                <span className="bg-green-100 text-green-600 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                  ĐANG SỬ DỤNG
                                </span>
                              )}
                            </div>
                          </div>
                          <div className={`font-mono text-sm break-all p-2 rounded border select-all ${exhaustedKeys.includes(key.trim()) ? 'text-red-600 bg-red-50 border-red-200 font-bold' : 'text-gray-800 bg-gray-50 border-gray-100'}`}>
                            {key}
                          </div>
                        </div>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerConfirm(
                              "Xóa Key",
                              "Bạn có chắc chắn muốn xóa Key này khỏi lịch sử không?",
                              () => removeFromHistory(key),
                              "XÁC NHẬN XÓA"
                            );
                          }}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Xóa khỏi lịch sử"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                <button 
                  onClick={() => setShowKeyHistory(false)}
                  className="bg-white border border-gray-300 text-gray-700 px-6 py-2 rounded-lg font-bold hover:bg-gray-100 transition-colors"
                >
                  Đóng
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showKeyInputModal && (
          <div className="vtw-api-modal-overlay fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm shadow-2xl">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="vtw-api-modal bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-blue-100 flex flex-col"
            >
              {/* Header */}
              <div className="vtw-api-modal-header bg-gradient-to-r from-blue-600 to-indigo-700 p-6 flex justify-between items-center text-white shrink-0">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md shadow-inner">
                    <Settings size={28} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black uppercase tracking-tight">CÀI ĐẶT API HỆ THỐNG</h2>
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] font-bold opacity-80 uppercase tracking-tighter">Quản lý kết nối YouTube & Gemini AI</p>
                      <button 
                        onClick={() => setShowApiKeys(!showApiKeys)}
                        className="text-[9px] bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded-full font-black border border-white/20 transition-all flex items-center gap-1 uppercase"
                      >
                        {showApiKeys ? <EyeOff size={10} /> : <Eye size={10} />}
                        {showApiKeys ? 'ẨN' : 'HIỆN'} KEY
                      </button>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setShowKeyInputModal(false)}
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all group"
                >
                  <X size={20} className="group-hover:rotate-90 transition-transform" />
                </button>
              </div>

              {/* Content */}
              <div className="vtw-api-modal-content p-8 space-y-8 overflow-y-auto custom-scrollbar max-h-[65vh]">
                {/* Section Gemini */}
                <div className="bg-indigo-50/50 p-6 rounded-3xl border-2 border-indigo-100/50 shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                    <Bot size={100} />
                  </div>
                  <div className="flex items-center gap-3 mb-4 relative z-10">
                    <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-lg">
                      <Bot size={20} />
                    </div>
                    <div>
                      <label className="text-[13px] font-black text-indigo-900 uppercase tracking-widest leading-none block mb-1">1. Google Gemini API Key</label>
                      <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-[10px] text-indigo-500 hover:text-indigo-700 font-bold flex items-center gap-1 w-fit transition-colors">
                        Lấy API Key Gemini Miễn Phí <ExternalLink size={10} />
                      </a>
                    </div>
                  </div>
                  <div className="relative z-10">
                    <div className="relative">
                      <input 
                        type={showApiKeys ? "text" : "password"}
                        value={geminiApiKey}
                        onChange={(e) => setGeminiApiKey(e.target.value)}
                        className="w-full px-5 py-4 bg-white border-2 border-indigo-200 rounded-2xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-mono text-sm shadow-inner"
                        placeholder="AIzaSy... (Dùng cho AI Phân tích chiến lược)"
                      />
                      <button 
                        type="button"
                        onClick={() => setShowApiKeys(!showApiKeys)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-indigo-400 hover:text-indigo-600 transition-colors"
                      >
                        {showApiKeys ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-[10px] text-indigo-600 font-bold uppercase tracking-tight bg-white/50 w-fit px-3 py-1 rounded-full border border-indigo-100">
                      <Zap size={12} fill="currentColor" />
                      Kích hoạt Trí tuệ nhân tạo để phân tích ngách chuyên sâu
                    </div>

                    {/* Model Selection UI */}
                    <div className="mt-4">
                      <button 
                        type="button"
                        onClick={() => setShowModelOptions(!showModelOptions)}
                        className="flex items-center justify-between w-full text-left"
                      >
                        <span className="text-[11px] font-black text-gray-400 tracking-widest uppercase">Chọn model Gemini</span>
                        <div className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-[10px] font-bold">
                          Đang dùng: {geminiModel}
                        </div>
                      </button>

                      {showModelOptions && (
                        <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
                          <button
                            type="button"
                            onClick={() => setShowModelOptions(!showModelOptions)}
                            className="w-full text-left px-4 py-2 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors"
                          >
                            <span className="text-[12px] font-bold text-gray-800">{GEMINI_MODELS.find(m => m.id === geminiModel)?.name}</span>
                            <ChevronDown size={14} className="text-gray-400" />
                          </button>
                          
                          <div className="max-h-[150px] overflow-y-auto">
                            {GEMINI_MODELS.map(model => (
                              <button
                                key={model.id}
                                type="button"
                                onClick={() => {
                                  setGeminiModel(model.id);
                                  setShowModelOptions(false);
                                }}
                                className={`w-full text-left px-4 py-2 text-[12px] transition-colors border-b border-gray-50 last:border-0 ${
                                  model.id === geminiModel 
                                    ? 'bg-blue-600 text-white font-bold' 
                                    : 'text-gray-600 hover:bg-gray-50'
                                }`}
                              >
                                {model.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Section YouTube */}
                <div className="bg-red-50/30 p-6 rounded-3xl border-2 border-red-100/50 shadow-sm relative overflow-hidden group">
                   <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform text-red-600">
                    <Video size={100} />
                  </div>
                  <div className="flex items-center gap-3 mb-4 relative z-10">
                    <div className="p-2 bg-red-600 rounded-xl text-white shadow-lg">
                      <Video size={20} />
                    </div>
                    <div>
                      <label className="text-[13px] font-black text-red-900 uppercase tracking-widest leading-none block mb-1">2. YouTube API Keys v3</label>
                      <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener noreferrer" className="text-[10px] text-red-500 hover:text-red-700 font-bold flex items-center gap-1 w-fit transition-colors">
                        Lấy API Key YouTube V3 Miễn Phí <ExternalLink size={10} />
                      </a>
                    </div>
                  </div>
                  
                  <div className="bg-white border border-red-100 p-5 rounded-2xl text-[11px] text-gray-600 mb-5 shadow-sm relative z-10">
                    <p className="font-black text-red-600 mb-2 uppercase tracking-tighter flex items-center gap-1"><AlertCircle size={14}/> Hướng dẫn dán mã Quota:</p>
                    <ul className="space-y-1 font-medium opacity-90">
                      <li className="flex items-center gap-2">🔹 Dán danh sách mã API, <b>mỗi mã trên 1 dòng riêng biệt</b>.</li>
                      <li className="flex items-center gap-2">🔹 Hệ thống sẽ <b>tự động xoay vòng Key</b> để quét dữ liệu mượt mà hơn.</li>
                      <li className="flex items-center gap-2">🔹 Dữ liệu được bảo mật và lưu cục bộ trên trình duyệt của bạn.</li>
                    </ul>
                  </div>

                  <div className="relative">
                    <textarea 
                      value={manualKeysInput}
                      onChange={(e) => setManualKeysInput(e.target.value)}
                      className="w-full h-48 p-5 font-mono text-sm border-2 border-gray-100 rounded-2xl focus:border-red-500 focus:ring-4 focus:ring-red-500/10 outline-none transition-all custom-scrollbar bg-white shadow-inner relative z-10"
                      style={{ WebkitTextSecurity: showApiKeys ? 'none' : 'disc' } as any}
                      placeholder="Key 1&#10;Key 2&#10;Key 3..."
                    />
                    <button 
                      type="button"
                      onClick={() => setShowApiKeys(!showApiKeys)}
                      className="absolute right-4 bottom-4 z-20 p-2 bg-white/80 backdrop-blur rounded-full shadow-md text-red-500 hover:text-red-700 transition-colors"
                    >
                      {showApiKeys ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 shrink-0">
                <button 
                  onClick={() => setShowKeyInputModal(false)}
                  className="px-8 py-3 rounded-2xl font-black text-gray-500 hover:bg-gray-200 transition-all uppercase text-[12px] tracking-widest active:scale-95"
                >
                  ĐÓNG
                </button>
                <button 
                  onClick={() => {
                    const keys = manualKeysInput.split('\n').map(k => k.trim()).filter(Boolean);
                    setConfig(prev => ({ ...prev, apiKeys: keys }));
                    localStorage.setItem('youtube_api_keys', JSON.stringify(keys));
                    localStorage.setItem('youtube_gemini_api_key', geminiApiKey);
                    localStorage.setItem('youtube_gemini_model', geminiModel);
                    
                    const newHistory = [...new Set([...apiKeysHistory, ...keys])];
                    setApiKeysHistory(newHistory);
                    localStorage.setItem('youtube_api_keys_history', JSON.stringify(newHistory));
                    
                    setShowKeyInputModal(false);
                    setStatus(`Đã cập nhật hệ thống API thành công.`);
                  }}
                  className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white px-10 py-3 rounded-2xl font-black uppercase tracking-[0.2em] hover:scale-105 shadow-xl shadow-blue-200 active:scale-95 transition-all flex items-center gap-3 text-[12px]"
                >
                  <CheckCircle2 size={20} />
                  CẬP NHẬT CẤU HÌNH
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer Info */}
      <div className="vtw-footer-status fixed bottom-0 left-0 right-0 bg-white border-t border-[#ccc] px-4 py-1.5 flex justify-between items-center text-[11px] text-[#333] shadow-[0_-4px_10px_rgba(0,0,0,0.05)] z-[900]">
        <div className="flex gap-4 items-center">
          <span className="flex items-center gap-1.5 bg-blue-50 px-2 py-0.5 rounded border border-blue-100"><AlertCircle size={14} className="text-blue-500" /> <span className="font-medium text-blue-700">{status}</span></span>
          <div className="flex items-center gap-3">
            <span className="text-gray-400">|</span>
            <span className="text-gray-600">Quota phiên này: <b className="text-gray-900">{quotaUsed.toLocaleString()}</b> units</span>
            <span className="text-gray-400">|</span>
            <span className="text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100 font-bold">Tổng Quota hôm nay đã dùng: {totalQuotaToday.toLocaleString()} units</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-bold text-gray-500">{Math.round(progress)}%</span>
          <div className="w-[300px] bg-[#eee] border border-[#ccc] h-4 rounded-full overflow-hidden flex relative shadow-inner">
            <div 
              className="bg-gradient-to-r from-blue-500 to-blue-600 h-full transition-all duration-500 flex items-center justify-center" 
              style={{ width: `${progress}%` }}
            >
              <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:20px_20px] animate-[progress-bar-stripes_1s_linear_infinite]"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Context Menu */}
      {menuPos.visible && (
        <div 
          ref={menuRef}
          className="vtw-channel-context-menu fixed z-[1000] bg-white border border-[#ccc] shadow-[0_4px_12px_rgba(0,0,0,0.15)] w-[280px] text-[13px] rounded-md overflow-hidden select-none"
          style={{ 
            top: Math.min(menuPos.y, window.innerHeight - 250), 
            left: Math.min(menuPos.x, window.innerWidth - 300) 
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="vtw-channel-menu-head flex items-center justify-between gap-3 px-4 py-3 bg-slate-800 text-white border-b border-white/10">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-wide text-blue-200">Thao tác kênh</div>
              <div className="truncate text-[13px] font-black">{menuPos.channel?.name || 'Kênh đã chọn'}</div>
            </div>
            <button
              type="button"
              onClick={closeMenu}
              className="shrink-0 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 text-white text-xl leading-none flex items-center justify-center"
              aria-label="Đóng bảng thao tác"
            >
              ×
            </button>
          </div>

          {/* Header/Primary Action */}
          <button 
            onClick={() => addToTracking(menuPos.channel!)}
            className="w-full text-left px-4 py-3 bg-[#3498db] hover:bg-[#2980b9] text-white flex items-center gap-3 transition-colors group"
          >
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <PlusCircle size={16} className="text-white" />
            </div>
            <span className="font-bold text-[12px] leading-[25px] not-italic text-left">Thêm vào Bảng Theo Dõi Đối Thủ</span>
          </button>

          <div className="py-1">
            <button 
              onClick={() => goToSpy(menuPos.channel!.id)}
              className="w-full text-left px-4 py-2.5 hover:bg-gray-100 flex items-center gap-3 text-gray-700 transition-colors"
            >
              <BarChart2 size={18} className="text-green-600" />
              <span className="font-medium">Phân tích Spy Kênh Này</span>
            </button>
            
            <button 
              onClick={() => { window.open(menuPos.channel!.url, '_blank'); closeMenu(); }}
              className="w-full text-left px-4 py-2.5 hover:bg-gray-100 flex items-center gap-3 text-gray-700 transition-colors"
            >
              <ExternalLink size={18} className="text-blue-600" />
              <span className="font-medium">Mở kênh trên YouTube</span>
            </button>
          </div>

          <div className="border-t border-gray-100 my-1"></div>

          <div className="py-1">
            <button 
              onClick={() => { copyToClipboard(menuPos.channel!.id); closeMenu(); }}
              className="w-full text-left px-4 py-2.5 hover:bg-gray-100 flex items-center gap-3 text-gray-700 transition-colors"
            >
              <Copy size={18} className="text-gray-500" />
              <span className="font-medium">Copy Channel ID</span>
            </button>
            <button 
              onClick={() => { copyToClipboard(menuPos.channel!.url); closeMenu(); }}
              className="w-full text-left px-4 py-2.5 hover:bg-gray-100 flex items-center gap-3 text-gray-700 transition-colors"
            >
              <div className="rotate-45">
                <Copy size={18} className="text-gray-400" />
              </div>
              <span className="font-medium">Copy URL kênh</span>
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmModal.isOpen && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4">
            <motion.div 
              className="bg-white rounded-lg shadow-2xl max-w-sm w-full overflow-hidden border border-gray-200"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <div className="bg-[#2c3e50] p-4 text-white flex justify-between items-center">
                <h3 className="font-bold uppercase tracking-tight flex items-center gap-2">
                  <AlertCircle size={18} className="text-orange-400" /> {confirmModal.title}
                </h3>
                <button 
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                  className="text-white/60 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6">
                <p className="text-gray-600 text-[14px] leading-relaxed font-medium">
                  {confirmModal.message}
                </p>
              </div>
              <div className="bg-gray-50 p-4 flex gap-3 justify-end border-t border-gray-100">
                <button 
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-all"
                >
                  HỦY BỎ
                </button>
                <button 
                  onClick={confirmModal.onConfirm}
                  className={`px-6 py-2 text-[12px] font-bold text-white rounded shadow-sm active:scale-95 transition-all ${
                    confirmModal.isDestructive 
                      ? 'bg-red-600 hover:bg-red-700' 
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {confirmModal.confirmText || 'XÁC NHẬN'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNicheModal && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-transparent p-4" onClick={() => setShowNicheModal(false)}>
            <motion.div 
              onClick={(e) => e.stopPropagation()}
              className="bg-[#f8f9fa] rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-gray-200 flex flex-col"
              style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
            >
              <div className="bg-gradient-to-r from-[#2c3e50] to-[#34495e] p-6 text-white flex justify-between items-center shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-500 p-2 rounded-lg shadow-inner">
                    <LayoutGrid size={24} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-black text-xl uppercase tracking-wider">DANH SÁCH {suggestedNiches.length} CHỦ ĐỀ NGÁCH GỢI Ý</h3>
                    <p className="text-[11px] text-blue-200 font-bold opacity-80 uppercase tracking-tighter">Click vào từ khóa để tự động điền và phân tích nhanh</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowNicheModal(false)}
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-red-500 flex items-center justify-center transition-all group"
                >
                  <X size={20} className="group-hover:rotate-90 transition-transform" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 bg-[#f8f9fa] custom-scrollbar">
                
                <div className="mb-6 flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-orange-100">
                     <h3 className="text-[13px] font-black text-gray-800 uppercase flex flex-col">
                        <span className="flex items-center gap-1 text-orange-600"><Flame size={16} /> DỮ LIỆU TRENDING TỪ YOUTUBE API</span>
                        <span className="text-[10px] text-gray-500 font-medium mt-1">Cập nhật danh sách từ khóa ngách hot nhất hôm nay theo quốc gia</span>
                     </h3>
                     <div className="flex items-center gap-3">
                         <div className="relative">
                           <select
                              value={trendingRegion}
                              onChange={(e) => setTrendingRegion(e.target.value)}
                              className="appearance-none bg-gray-50 border border-gray-200 text-gray-700 font-bold text-[11px] px-3 py-2.5 pr-8 rounded-lg outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400 shadow-sm cursor-pointer"
                           >
                              {REGIONS.map(r => (
                                <option key={r.code || 'GL'} value={r.code}>{r.name}</option>
                              ))}
                           </select>
                           <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                         </div>
                         <button
                            onClick={fetchDailyTrendingFromYouTube}
                            disabled={isFetchingDailyTrending}
                            className="bg-orange-500 hover:bg-orange-600 active:scale-95 text-white px-5 py-2.5 rounded-lg text-[12px] font-black tracking-tight uppercase shadow border border-orange-600 disabled:opacity-50 disabled:scale-100 transition-all flex items-center gap-2"
                         >
                            {isFetchingDailyTrending ? <><RefreshCw size={16} className="animate-spin"/> Đang cập nhật API...</> : <><Search size={16}/> Cập nhật Trending</>}
                         </button>
                     </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {suggestedNiches.map((category, idx) => (
                    <div key={idx} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:border-blue-300 transition-colors flex flex-col">
                      <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <h4 className="font-black text-[12px] text-gray-700 uppercase tracking-tight">{category.category}</h4>
                        <span className="bg-blue-100 text-blue-600 text-[9px] font-black px-2 py-0.5 rounded-full">{Math.min(5, category.items.length)} KEY</span>
                      </div>
                      <div className="p-3 flex flex-wrap gap-2">
                        {category.items.slice(0, 5).map((item, itemIdx) => (
                          <button
                            key={itemIdx}
                            onClick={() => {
                              setNicheInput(item);
                              setShowNicheModal(false);
                              // Auto start research after a small delay
                              setTimeout(() => {
                                runNicheResearch(item);
                              }, 100);
                            }}
                            className="bg-gray-50 hover:bg-blue-600 hover:text-white px-3 py-1.5 rounded-lg text-[11px] font-medium text-gray-600 border border-gray-200 transition-all hover:scale-105 active:scale-95"
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-4 flex justify-center border-t border-gray-100 italic text-[11px] text-gray-400 font-medium">
                Mẹo: Bạn có thể nhập từ khóa bất kỳ vào ô tìm kiếm nếu không tìm thấy chủ đề ưng ý tại đây.
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {modalTrendingVideos && (
          <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div 
              className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-gray-200 flex flex-col"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
            >
              <div className="bg-gradient-to-r from-orange-500 to-red-500 p-6 text-white flex justify-between items-center shadow-lg relative overflow-hidden">
                <div className="absolute inset-0 opacity-10">
                   <div className="absolute rotate-45 transform bg-white w-full h-full -top-1/2 -left-1/2 animate-pulse"></div>
                </div>
                <div className="relative z-10 flex items-center gap-3">
                  <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                    <Flame size={24} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-black text-xl uppercase tracking-wider">VIDEO TRENDING: {modalTrendingVideos.title}</h3>
                    <p className="text-[11px] text-orange-100 font-bold uppercase tracking-tighter">{modalTrendingVideos.subtitle}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setModalTrendingVideos(null)}
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/30 flex items-center justify-center transition-all group z-10 relative"
                >
                  <X size={20} className="group-hover:rotate-90 transition-transform" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 bg-gray-50 custom-scrollbar">
                {modalTrendingVideos.videos.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 font-medium italic">Không tìm thấy video nào.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {modalTrendingVideos.videos.map((v: any, i: number) => (
                      <div key={i} className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl transition-all group">
                         <div className="relative aspect-video">
                            <img src={v.snippet.thumbnails.high.url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                            <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                               {v.contentDetails?.duration ? v.contentDetails.duration.replace('PT', '').toLowerCase() : ''}
                            </div>
                            <div className="absolute top-2 left-2 flex gap-1">
                               <div className="bg-orange-600 text-white text-[10px] font-black px-2 py-1 rounded shadow-lg border border-orange-400">
                                  SCORE {v.trendScore}
                               </div>
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex flex-col items-center justify-center p-4 opacity-0 group-hover:opacity-100 transition-opacity gap-2">
                               <a href={`https://youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer" className="w-full bg-white text-black py-2 rounded-xl text-[11px] font-black flex items-center justify-center gap-2 uppercase tracking-tight hover:bg-gray-100">
                                  <ExternalLink size={14} /> Xem trên YouTube
                               </a>
                            </div>
                         </div>
                         <div className="p-4">
                            <h4 className="text-[11px] font-black text-gray-900 leading-snug line-clamp-2 uppercase group-hover:text-blue-600 transition-colors" title={v.snippet.title}>{v.snippet.title}</h4>
                            <div className="flex items-center justify-between mt-3 bg-gray-50 p-2 rounded-lg">
                               <div className="flex flex-col">
                                  <span className="text-[8px] font-bold text-gray-400 uppercase tracking-tight">Người đăng</span>
                                  <span className="text-[10px] font-black text-blue-600 truncate max-w-[100px]">{v.snippet.channelTitle}</span>
                               </div>
                               <div className="flex flex-col items-end">
                                  <span className="text-[8px] font-bold text-gray-400 uppercase tracking-tight">Views / VPH</span>
                                  <span className="text-[11px] font-black text-gray-800">{v.statistics.viewCount.toLocaleString()} / <span className="text-orange-500">+{v.vph.toFixed(0)}</span></span>
                               </div>
                            </div>
                         </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAccountModal && user && (
          <div
            className="vtw-account-modal-overlay fixed inset-0 z-[5000] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4"
            onClick={() => setShowAccountModal(false)}
          >
            <motion.div
              className="vtw-account-modal bg-white rounded-[26px] shadow-2xl border border-blue-100 overflow-hidden w-full max-w-[440px]"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 18 }}
            >
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-5 py-4 relative">
                <button
                  type="button"
                  onClick={() => setShowAccountModal(false)}
                  className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white"
                  title="Đóng"
                >
                  <X size={20} />
                </button>
                <div className="text-[11px] font-black uppercase tracking-wide opacity-90 mb-2">Tài khoản & hạn sử dụng</div>
                <div className="text-[24px] leading-tight font-black">
                  {isPremiumAccount ? 'Tài khoản đã nâng cấp PRO' : subscriptionInfo?.active ? 'Tài khoản đang dùng thử' : 'Tài khoản đã hết hạn'}
                </div>
                <div className="text-[12px] font-bold opacity-95 mt-2 break-all">
                  {user.displayName || 'Tài khoản'} · {user.email}
                </div>
              </div>

              <div className="p-4 grid grid-cols-2 gap-3 bg-white">
                <div className="vtw-account-info-card">
                  <div className="vtw-account-info-label">Gói đã đăng ký</div>
                  <div className="vtw-account-info-value">{subscriptionInfo?.planName || (isPremiumAccount ? 'Gói PRO' : subscriptionInfo?.active ? 'Dùng thử' : 'Chưa có gói')}</div>
                </div>
                <div className="vtw-account-info-card vtw-account-info-card-green">
                  <div className="vtw-account-info-label text-green-700">Còn lại</div>
                  <div className="vtw-account-info-value text-green-700">{getRemainingText(subscriptionInfo?.expiresAt)}</div>
                </div>
                <div className="vtw-account-info-card">
                  <div className="vtw-account-info-label">Ngày đăng ký</div>
                  <div className="vtw-account-info-value">{formatSubscriptionDateCompact(subscriptionInfo?.startedAt)}</div>
                </div>
                <div className="vtw-account-info-card">
                  <div className="vtw-account-info-label">Hạn sử dụng</div>
                  <div className="vtw-account-info-value">{formatSubscriptionDateCompact(subscriptionInfo?.expiresAt)}</div>
                </div>
              </div>

              <div className="px-4 pb-4 grid grid-cols-3 gap-2 bg-white">
                <button
                  type="button"
                  onClick={() => { window.location.href = buildPaymentUrl(user); }}
                  className="vtw-account-action vtw-account-action-upgrade"
                >
                  Nâng cấp thêm
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAccountModal(false); setShowKeyInputModal(true); }}
                  className="vtw-account-action vtw-account-action-settings"
                >
                  Cài đặt
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setShowAccountModal(false);
                      await logoutUser();
                    } catch (e: any) {
                      console.error('Lỗi đăng xuất:', e);
                    }
                  }}
                  className="vtw-account-action vtw-account-action-logout"
                >
                  Đăng xuất
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
