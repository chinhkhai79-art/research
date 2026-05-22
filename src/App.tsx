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
  deepDrillSmallTrend: boolean;
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
  keywordTitle?: string;
  topic?: string;
  income?: string;
  country?: string;
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
  deepDrillSmallTrend: false,
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
  const [trendingCacheMeta, setTrendingCacheMeta] = useState<{ updatedAt?: string; region?: string; source?: string } | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState('AIzaSyD1MMwzM-PBDZtueN_6vXXNSiT7_IitXXU');
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash');
  const [showModelOptions, setShowModelOptions] = useState(false);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<string | null>(null);
  const [selectedHistoryKeys, setSelectedHistoryKeys] = useState<string[]>([]);
  const [geminiKeysHistory, setGeminiKeysHistory] = useState<string[]>([]);
  const [selectedGeminiHistoryKeys, setSelectedGeminiHistoryKeys] = useState<string[]>([]);
  const [showGeminiKeyHistory, setShowGeminiKeyHistory] = useState(false);
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
    setManualKeysInput(newKeys.join('\n'));
    localStorage.setItem('youtube_api_keys', JSON.stringify(newKeys));
    localStorage.setItem('youtube_api_keys_text_draft', newKeys.join('\n'));
    setSelectedHistoryKeys([]);
    setShowKeyHistory(false);
    setStatus(`Đã thêm ${keysToAdd.length} Key vào ô nhập YouTube API.`);
  };

  const useGeminiHistoryKey = (keysToUse: string[]) => {
    const key = keysToUse.map(k => k.trim()).filter(Boolean)[0];
    if (!key) return;
    setGeminiApiKey(key);
    localStorage.setItem('youtube_gemini_api_key', key);
    const nextHistory = [...new Set([key, ...geminiKeysHistory.map(k => k.trim()).filter(Boolean)])];
    setGeminiKeysHistory(nextHistory);
    localStorage.setItem('youtube_gemini_api_keys_history', JSON.stringify(nextHistory));
    setSelectedGeminiHistoryKeys([]);
    setShowGeminiKeyHistory(false);
    setStatus('Đã khôi phục Gemini API Key vào ô nhập.');
  };

  const clearGeminiHistory = () => {
    triggerConfirm(
      "Xóa lịch sử Gemini",
      "Bạn có chắc chắn muốn xóa toàn bộ lịch sử Gemini API Key không?",
      () => {
        setGeminiKeysHistory([]);
        setSelectedGeminiHistoryKeys([]);
        localStorage.removeItem('youtube_gemini_api_keys_history');
      },
      "XÁC NHẬN XÓA"
    );
  };

  const removeFromGeminiHistory = (keyToRemove: string) => {
    const next = geminiKeysHistory.filter(k => k !== keyToRemove);
    setGeminiKeysHistory(next);
    localStorage.setItem('youtube_gemini_api_keys_history', JSON.stringify(next));
    setSelectedGeminiHistoryKeys(prev => prev.filter(k => k !== keyToRemove));
    setStatus("Đã xóa Gemini Key khỏi lịch sử.");
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
      if (showGeminiKeyHistory && keyHistoryRef.current && !keyHistoryRef.current.contains(event.target as Node)) {
        setShowGeminiKeyHistory(false);
      }
      if (menuPos.visible && menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuPos(prev => ({ ...prev, visible: false }));
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showRegionList, showKeyInputModal, showKeyHistory, showGeminiKeyHistory, menuPos.visible]);

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

  // Chỉ bản mobile: hiện nút lên đầu trang khi đã lướt xuống.
  useEffect(() => {
    const handleScrollTopVisibility = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      setShowScrollTop(window.innerWidth <= 900 && y > 420);
    };
    handleScrollTopVisibility();
    window.addEventListener('scroll', handleScrollTopVisibility, { passive: true });
    window.addEventListener('resize', handleScrollTopVisibility);
    window.addEventListener('orientationchange', handleScrollTopVisibility);
    return () => {
      window.removeEventListener('scroll', handleScrollTopVisibility);
      window.removeEventListener('resize', handleScrollTopVisibility);
      window.removeEventListener('orientationchange', handleScrollTopVisibility);
    };
  }, []);

  const [status, setStatus] = useState('Sẵn sàng.');
  const [progress, setProgress] = useState(0);
  const [isHunting, setIsHunting] = useState(false);
  const [quotaUsed, setQuotaUsed] = useState(0);
  const quotaUsedRef = useRef(0);
  const [totalQuotaToday, setTotalQuotaToday] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);
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
  const [nicheTime, setNicheTime] = useState('month');
  const [nicheVideoCount, setNicheVideoCount] = useState(20);
  const [nicheMaxSub, setNicheMaxSub] = useState(250000);
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
  const [nicheActiveSubTab, setNicheActiveSubTab] = useState('videos');
  const [nicheHistory, setNicheHistory] = useState<any[]>([]);
  const [videoFilters, setVideoFilters] = useState({ trendScoreMin: 0, trendScoreMax: 100, viewsMin: 0, viewsMax: 10000000, vphMin: 0, vphMax: 10000, subsMax: 10000000 });
  const [modalTrendingVideos, setModalTrendingVideos] = useState<{title: string, subtitle: string, videos: any[]} | null>(null);
  const [channelFilters, setChannelFilters] = useState({ subscribersMin: 0, subscribersMax: 10000000, viewsMin: 0, viewsMax: 10000000, videosMin: 0, videosMax: 10000, vphMax: 10000 });
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
    const savedGeminiKeyHistory = localStorage.getItem('youtube_gemini_api_keys_history');
    const savedKeysDraft = localStorage.getItem('youtube_api_keys_text_draft');
    const savedConfig = localStorage.getItem('youtube_hunter_config');
    const savedResults = localStorage.getItem('youtube_hunter_results');
    const savedTracking = localStorage.getItem('youtube_tracking_channels');

    if (savedKeys) {
      const keys = JSON.parse(savedKeys);
      setConfig(prev => ({ ...prev, apiKeys: keys }));
      setManualKeysInput(savedKeysDraft || (Array.isArray(keys) ? keys.join('\n') : ''));
    } else if (savedKeysDraft) {
      setManualKeysInput(savedKeysDraft);
    }
    if (savedKeyHistory) {
      setApiKeysHistory(JSON.parse(savedKeyHistory));
    }
    if (savedGeminiKeyHistory) {
      try { setGeminiKeysHistory(JSON.parse(savedGeminiKeyHistory)); } catch {}
    }
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      // Migration for old config (single region to regions array)
      if (parsed.region && (!parsed.regions || parsed.regions.length === 0)) {
        parsed.regions = [parsed.region];
      }
      setConfig(prev => {
        const next = { ...prev, ...parsed };
        if (typeof next.deepDrillSmallTrend !== 'boolean') next.deepDrillSmallTrend = false;
        // Ensure API keys are not overwritten by empty array in config if we have keys from savedKeys
        if (prev.apiKeys.length > 0 && (!parsed.apiKeys || parsed.apiKeys.length === 0)) {
          next.apiKeys = prev.apiKeys;
        }
        return next;
      });
    }
    if (savedResults) {
      const cleaned = dedupeChannelResults(JSON.parse(savedResults));
      setResults(cleaned);
      resultsRef.current = cleaned;
      localStorage.setItem('youtube_hunter_results', JSON.stringify(cleaned));
    }
    if (savedTracking) setTrackingChannels(JSON.parse(savedTracking));
    
    const savedSpyProjects = localStorage.getItem('youtube_spy_projects');
    if (savedSpyProjects) {
      try {
        const parsedSpyProjects = JSON.parse(savedSpyProjects);
        setSpyProjects(parsedSpyProjects);
        if (Array.isArray(parsedSpyProjects) && parsedSpyProjects[0]) {
          setSpyResult(parsedSpyProjects[0]);
          if (parsedSpyProjects[0]?.channelInfo?.id) setSpyInput(parsedSpyProjects[0].channelInfo.id);
        }
      } catch (error) {
        console.warn('Không đọc được lịch sử Spy đã lưu:', error);
      }
    }

    const savedVideoProjects = localStorage.getItem('youtube_video_projects');
    if (savedVideoProjects) {
      try {
        const parsedVideoProjects = JSON.parse(savedVideoProjects);
        setVideoProjects(parsedVideoProjects);
        if (Array.isArray(parsedVideoProjects) && parsedVideoProjects[0]) {
          setVideoResult(parsedVideoProjects[0]);
          if (parsedVideoProjects[0]?.id) setVideoInput(parsedVideoProjects[0].id);
        }
      } catch (error) {
        console.warn('Không đọc được lịch sử Video đã lưu:', error);
      }
    }

    const savedNicheHistory = localStorage.getItem('youtube_niche_history');
    if (savedNicheHistory) setNicheHistory(JSON.parse(savedNicheHistory));

    // Bước 54: ô Từ khóa/Key luôn lấy lại từ khóa cuối người dùng đã tìm kiếm.
    const savedLastNicheKeyword = localStorage.getItem('youtube_last_niche_keyword');
    if (savedLastNicheKeyword) setNicheInput(savedLastNicheKeyword);

    const savedSuggestedNiches = localStorage.getItem(`youtube_suggested_niches_trending_v4_${trendingRegion || 'GLOBAL'}`)
      || localStorage.getItem(`youtube_suggested_niches_trending_v3_${trendingRegion || 'GLOBAL'}`);
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
    if (savedGeminiKey) {
      setGeminiApiKey(savedGeminiKey);
      const currentGeminiHistory = savedGeminiKeyHistory ? JSON.parse(savedGeminiKeyHistory) : [];
      const nextGeminiHistory = [...new Set([savedGeminiKey, ...(Array.isArray(currentGeminiHistory) ? currentGeminiHistory : [])])];
      setGeminiKeysHistory(nextGeminiHistory);
      localStorage.setItem('youtube_gemini_api_keys_history', JSON.stringify(nextGeminiHistory));
    }
    
    const savedGeminiModel = localStorage.getItem('youtube_gemini_model');
    if (savedGeminiModel) setGeminiModel(savedGeminiModel);

    // Handle payment success return
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('paid') === 'success') {
      setStatus(`Thanh toán thành công! Mã đơn: ${urlParams.get('orderCode') || ''}`);
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

    // Load session quota so every API call keeps adding during the current browser tab/session.
    try {
      const savedSessionQuota = JSON.parse(sessionStorage.getItem('youtube_quota_session') || '{}');
      const sessionId = sessionStorage.getItem('youtube_quota_session_id') || (() => {
        const id = String(Date.now());
        sessionStorage.setItem('youtube_quota_session_id', id);
        return id;
      })();
      if (savedSessionQuota?.sessionId === sessionId) {
        const restored = Number(savedSessionQuota.value || 0);
        quotaUsedRef.current = Number.isFinite(restored) ? restored : 0;
        setQuotaUsed(quotaUsedRef.current);
      }
    } catch (error) {
      console.warn('Không đọc được quota phiên đã lưu:', error);
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
    localStorage.setItem('youtube_api_keys_text_draft', manualKeysInput);
  }, [manualKeysInput]);

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

  const formatVNNumber = (value: any) => {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return '0';
    return new Intl.NumberFormat('vi-VN').format(n);
  };


  const REGION_NAME_MAP: Record<string, string> = REGIONS.reduce((acc, item) => {
    if (item.code) acc[item.code] = item.name.replace(/\s*\([^)]*\)/g, '').trim();
    return acc;
  }, {} as Record<string, string>);

  const getCountryFullName = (code?: string) => {
    const normalized = String(code || '').trim().toUpperCase();
    if (!normalized || normalized === 'N/A') return 'Không rõ';
    return REGION_NAME_MAP[normalized] || normalized;
  };

  const cleanTrendKeyword = (value?: string) => {
    const raw = String(value || '').trim();
    if (!raw) return 'Tự động theo khu vực';
    const autoMatch = raw.match(/Auto\s+[^·]+·\s*([^·]+)(?:·|$)/i);
    const keyword = (autoMatch ? autoMatch[1] : raw)
      .replace(/^tự động:\s*/i, '')
      .replace(/\s*·\s*VPH.*$/i, '')
      .trim();
    return keyword || 'Tự động theo khu vực';
  };

  const getChannelTrendKeyword = (channel: ChannelResult) => cleanTrendKeyword(channel.keywordTitle);

  const getTopicFromKeyword = (keyword: string) => {
    const normalized = normalizeHunterKeyword(keyword);
    const found = SUGGESTED_NICHES.find(group =>
      group.items.some(item => normalized.includes(normalizeHunterKeyword(item)) || normalizeHunterKeyword(item).includes(normalized))
    );
    if (found) return found.category.replace(/&/g, 'và');
    if (/ai|chatgpt|gemini|tool|cong cu|công cụ|automation|seo|app|điện thoại|dien thoai|công nghệ|cong nghe|tech/i.test(normalized)) return 'Công nghệ và AI';
    if (/tin tức|tin tuc|news|24h|thời sự|thoi su/i.test(normalized)) return 'Tin tức và thời sự';
    if (/du lịch|du lich|travel|vlog/i.test(normalized)) return 'Du lịch và khám phá';
    if (/ẩm thực|am thuc|nấu ăn|nau an|food|ăn uống|an uong/i.test(normalized)) return 'Ẩm thực và nấu ăn';
    if (/game|gaming|lol|lien minh|liên minh|mobile game|highlight|short/i.test(normalized)) return 'Gaming và giải trí';
    if (/bóng đá|bong da|football|thể thao|the thao/i.test(normalized)) return 'Thể thao';
    if (/sức khỏe|suc khoe|health|yoga|gym|tập luyện|tap luyen/i.test(normalized)) return 'Sức khỏe và làm đẹp';
    if (/thú cưng|thu cung|pet|chó|cho|mèo|meo/i.test(normalized)) return 'Pets và động vật';
    if (/học|hoc|tiếng anh|tieng anh|ielts|giáo dục|giao duc/i.test(normalized)) return 'Giáo dục và học tập';
    if (/nhạc|nhac|lofi|music|cover/i.test(normalized)) return 'Nhạc và âm thanh';
    if (/xe|ô tô|oto|car|review xe/i.test(normalized)) return 'Ô tô và xe máy';
    if (/gia đình|gia dinh|mẹo gia đình|meo gia dinh|mẹo|meo/i.test(normalized)) return 'Mẹo vặt cuộc sống';
    if (/bất động sản|bat dong san|real estate/i.test(normalized)) return 'Bất động sản';
    if (/tien|tiền|dau tu|đầu tư|crypto|chung khoan|chứng khoán|tai chinh|tài chính|kiếm tiền|kiem tien/i.test(normalized)) return 'Tài chính và đầu tư';
    return 'Chủ đề hot khác';
  };

  const estimateIncomeFromApiViews = (channel: ChannelResult) => {
    // YouTube Data API v3 không trả thu nhập thật. Mục này ước tính dựa trên view thật từ API × RPM tham khảo theo quốc gia.
    const views = Number(channel.views || 0);
    const country = String(channel.country || '').toUpperCase();
    const rpmByCountry: Record<string, [number, number]> = {
      US: [1.5, 5], GB: [1.2, 4], CA: [1.2, 4], AU: [1.2, 4], DE: [0.9, 3], FR: [0.7, 2.5],
      JP: [0.6, 2], KR: [0.5, 1.8], VN: [0.08, 0.45], TH: [0.08, 0.45], ID: [0.05, 0.35], PH: [0.05, 0.35], IN: [0.04, 0.3]
    };
    const [low, high] = rpmByCountry[country] || [0.08, 0.8];
    const lowUsd = Math.round((views / 1000) * low);
    const highUsd = Math.round((views / 1000) * high);
    if (views <= 0) return 'Đang cập nhật';
    return `$${formatVNNumber(lowUsd)} - $${formatVNNumber(highUsd)}`;
  };


  const estimateIncomeFromTracking = (views: number, country?: string) => {
    const fakeChannel = {
      views: Number(views || 0),
      country: country || 'VN'
    } as ChannelResult;
    return estimateIncomeFromApiViews(fakeChannel);
  };

  const getTrackingKeywordFromApiItem = (item: any, fallbackName?: string) => {
    const title = String(item?.snippet?.title || fallbackName || '').trim();
    const desc = normalizeHunterKeyword(item?.snippet?.description || '');
    const topicUrls = Array.isArray(item?.topicDetails?.topicCategories) ? item.topicDetails.topicCategories.join(' ') : '';
    const text = normalizeHunterKeyword(`${title} ${desc} ${topicUrls}`);
    const candidates = [
      'ai tools','chatgpt','youtube automation','tech news','travel vlog','gaming highlights','review điện thoại','make money online',
      'tin tức','ẩm thực','nấu ăn','du lịch','sức khỏe','làm đẹp','bóng đá','thể thao','giáo dục','tiếng anh','nhạc','lofi','thú cưng','mẹo vặt',
      'công nghệ','review xe','đầu tư','tài chính','vlog','shorts'
    ];
    const found = candidates.find(k => text.includes(normalizeHunterKeyword(k)));
    if (found) return found;
    const words = normalizeHunterKeyword(title).split(' ').filter(w => w.length > 2).slice(0, 4).join(' ');
    return words || 'tự động tracking';
  };

  const formatChannelUrlShort = (url?: string, id?: string) => {
    const channelId = String(id || '').trim();
    if (channelId) return `.../${channelId.slice(-10)}`;
    const raw = String(url || '').replace(/^https?:\/\//, '').replace(/^www\./, '');
    return raw.length > 28 ? raw.slice(0, 25) + '...' : raw;
  };


  const parseRangeNumber = (value: string, fallback = 0) => {
    const n = Number(String(value || '').replace(/[^0-9]/g, ''));
    return Number.isFinite(n) ? n : fallback;
  };

  const clampRangePair = (min: number, max: number, absoluteMin: number, absoluteMax: number): [number, number] => {
    const safeMin = Math.max(absoluteMin, Math.min(min, absoluteMax));
    const safeMax = Math.max(absoluteMin, Math.min(max, absoluteMax));
    return safeMin <= safeMax ? [safeMin, safeMax] : [safeMax, safeMin];
  };

  const RangeFilterBox = ({
    title,
    subtitle,
    min,
    max,
    absoluteMin,
    absoluteMax,
    step,
    onChange,
  }: {
    title: string;
    subtitle: string;
    min: number;
    max: number;
    absoluteMin: number;
    absoluteMax: number;
    step: number;
    onChange: (min: number, max: number) => void;
  }) => {
    const safeMax = Math.max(absoluteMin, Math.min(Number(max || 0), absoluteMax));
    const updateMaxOnly = (value: number) => {
      const nextMax = Math.max(absoluteMin, Math.min(value, absoluteMax));
      onChange(absoluteMin, nextMax);
    };
    return (
      <div className="vtw-range-box vtw-single-range-box vtw-compact-filter-box">
        <div className="vtw-compact-filter-head">
          <span className="vtw-compact-filter-title">{title}</span>
          <span className="vtw-compact-filter-value">0 → {formatVNNumber(safeMax)}</span>
        </div>
        <input
          type="range"
          min={absoluteMin}
          max={absoluteMax}
          step={step}
          value={safeMax}
          onChange={(e) => updateMaxOnly(parseRangeNumber(e.target.value, absoluteMax))}
          className="vtw-single-range-input vtw-compact-range-input"
        />
        <div className="vtw-single-range-scale vtw-compact-range-scale">
          <span>0</span>
          <span>{formatVNNumber(Math.round(absoluteMax / 2))}</span>
          <span>{formatVNNumber(absoluteMax)}</span>
        </div>
      </div>
    );
  };


  const InlineFilterSlider = ({
    title,
    value,
    max,
    step,
    onChange,
  }: {
    title: string;
    value: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
  }) => {
    const safeValue = Math.max(0, Math.min(Number(value || 0), max));
    return (
      <div className="vtw-inline-filter-item">
        <div className="vtw-inline-filter-head">
          <span>{title}</span>
          <strong>0 → {formatVNNumber(safeValue)}</strong>
        </div>
        <input
          type="range"
          min={0}
          max={max}
          step={step}
          value={safeValue}
          onChange={(e) => onChange(parseRangeNumber(e.target.value, max))}
          onInput={(e) => onChange(parseRangeNumber((e.target as HTMLInputElement).value, max))}
          className="vtw-inline-filter-range"
        />
        <div className="vtw-inline-filter-scale">
          <span>0</span>
          <span>{formatVNNumber(Math.round(max / 2))}</span>
          <span>{formatVNNumber(max)}</span>
        </div>
      </div>
    );
  };

  const LightRangeFilterBox = ({
    title,
    min,
    max,
    absoluteMin,
    absoluteMax,
    step,
    onChange,
  }: {
    title: string;
    min: number;
    max: number;
    absoluteMin: number;
    absoluteMax: number;
    step: number;
    onChange: (min: number, max: number) => void;
  }) => {
    const updateMin = (value: number) => {
      const [nextMin, nextMax] = clampRangePair(value, max, absoluteMin, absoluteMax);
      onChange(nextMin, nextMax);
    };
    const updateMax = (value: number) => {
      const [nextMin, nextMax] = clampRangePair(min, value, absoluteMin, absoluteMax);
      onChange(nextMin, nextMax);
    };
    return (
      <div className="vtw-sub-range col-span-12 rounded-xl border border-blue-100 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="text-[11px] font-black uppercase text-[#2c3e50]">{title}</div>
          <div className="text-[11px] font-black text-blue-700 tabular-nums">{formatVNNumber(min)} → {formatVNNumber(max)}</div>
        </div>
        <div className="vtw-range-manual-note vtw-range-manual-note-light mb-2">Nhập số Min / Max thủ công</div>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" inputMode="numeric" min={absoluteMin} max={absoluteMax} step={step} value={min} onChange={(e) => updateMin(parseRangeNumber(e.target.value, absoluteMin))} className="vtw-range-number vtw-range-number-light" />
          <input type="number" inputMode="numeric" min={absoluteMin} max={absoluteMax} step={step} value={max} onChange={(e) => updateMax(parseRangeNumber(e.target.value, absoluteMax))} className="vtw-range-number vtw-range-number-light" />
        </div>
      </div>
    );
  };

  const dedupeChannelResults = (items: ChannelResult[]) => {
    const seen = new Set<string>();
    const next: ChannelResult[] = [];
    for (const item of items || []) {
      const key = String(item?.id || item?.url || item?.name || '').trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      next.push(item);
    }
    return next.slice(0, STOP_LIMIT);
  };

  const updateQuotaUsage = (amount: number) => {
    const safeAmount = Number(amount || 0);
    if (!Number.isFinite(safeAmount) || safeAmount <= 0) return;

    // Không dùng riêng setState cộng dồn vì khi nhiều request chạy liên tục React có thể render trễ.
    // Dùng ref làm nguồn sự thật để quota phiên luôn cộng dồn từng API call ngay lập tức.
    const nextSessionQuota = quotaUsedRef.current + safeAmount;
    quotaUsedRef.current = nextSessionQuota;
    setQuotaUsed(nextSessionQuota);

    try {
      const sessionId = sessionStorage.getItem('youtube_quota_session_id') || String(Date.now());
      sessionStorage.setItem('youtube_quota_session_id', sessionId);
      sessionStorage.setItem('youtube_quota_session', JSON.stringify({
        value: nextSessionQuota,
        sessionId,
        updatedAt: new Date().toISOString(),
      }));
    } catch (error) {
      console.warn('Không lưu được quota phiên:', error);
    }

    setTotalQuotaToday(() => {
      const today = new Date().toISOString().split('T')[0];
      let current = 0;
      try {
        const saved = JSON.parse(localStorage.getItem('youtube_quota_today') || '{}');
        if (saved?.date === today) current = Number(saved.value || 0);
      } catch (_) {}
      const next = current + safeAmount;
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
      setStatus('Vui lòng nhập API Key YouTube V3 để cập nhật Trending.');
      return;
    }

    setIsFetchingDailyTrending(true);
    setStatus('Đang lấy dữ liệu thật từ YouTube API V3...');

    const selectedRegion = trendingRegion || config.region || 'VN';
    const regionLabel = REGIONS.find(r => r.code === selectedRegion)?.name || 'Toàn cầu';
    const storageKey = `youtube_suggested_niches_trending_v4_${selectedRegion || 'GLOBAL'}`;
    const publishedAfter = getPublishedAfterDate('month');

    const removeVietnameseTone = (value: string) =>
      String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .trim();

    const cleanTrendPhrase = (value: string) =>
      String(value || '')
        .replace(/#[\w\p{L}\p{N}_-]+/gu, ' $& ')
        .replace(/https?:\/\/\S+/gi, ' ')
        .replace(/[|•·,_;:!?()[\]{}"“”'’]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const compactKeyword = (value: string) => {
      const cleaned = cleanTrendPhrase(value)
        .replace(/^#/, '')
        .replace(/\s+/g, ' ')
        .trim();
      const words = cleaned.split(/\s+/).filter(Boolean);
      return words.slice(0, 6).join(' ').toLowerCase();
    };

    const isVietnameseLike = (value: string) => {
      const raw = String(value || '').toLowerCase();
      const noTone = removeVietnameseTone(raw);
      return /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(raw)
        || /\b(cua|của|cho|voi|với|khong|không|cach|cách|huong dan|hướng dẫn|viet nam|việt nam|ngay|ngày|nguoi|người|lam|làm|mon|món)\b/.test(noTone);
    };

    const languageOk = (value: string) => {
      const normalized = removeVietnameseTone(value);
      if (['US', 'GB', 'CA', 'AU', 'SG'].includes(selectedRegion)) return !isVietnameseLike(value) && /[a-z]/i.test(value);
      if (selectedRegion === 'VN') return /[a-zăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(value);
      if (selectedRegion === 'JP') return /[ぁ-んァ-ン一-龯]/.test(value) || (!isVietnameseLike(value) && /[a-z]/i.test(value));
      if (selectedRegion === 'KR') return /[가-힣]/.test(value) || (!isVietnameseLike(value) && /[a-z]/i.test(value));
      if (selectedRegion === 'RU') return /[а-яё]/i.test(value) || (!isVietnameseLike(value) && /[a-z]/i.test(value));
      return !isVietnameseLike(value) || selectedRegion === 'VN';
    };

    const categorySeeds: Record<string, { vn: string; en: string; must: RegExp; ban?: RegExp }> = {
      'PHÁT TRIỂN BẢN THÂN': {
        vn: 'phát triển bản thân thói quen năng suất thành công',
        en: 'self improvement habits productivity motivation',
        must: /(self|motivation|habit|productivity|mindset|success|confidence|discipline|thói quen|năng suất|thành công|tự tin|trì hoãn|phát triển)/i
      },
      'SỨC KHỎE & LÀM ĐẸP': {
        vn: 'sức khỏe làm đẹp skincare giảm cân yoga tại nhà',
        en: 'health beauty skincare weight loss yoga workout',
        must: /(health|beauty|skincare|weight loss|yoga|workout|fitness|diet|makeup|sức khỏe|làm đẹp|giảm cân|tập|mụn|da|tóc)/i
      },
      'CÔNG NGHỆ & AI': {
        vn: 'công nghệ AI ChatGPT công cụ AI ứng dụng AI',
        en: 'ai tools chatgpt technology apps automation',
        must: /(ai|chatgpt|gemini|technology|tech|app|software|iphone|android|automation|công nghệ|trí tuệ|điện thoại|ứng dụng|phần mềm)/i
      },
      'GIÁO DỤC & HỌC TẬP': {
        vn: 'học tập tiếng anh ielts tự học kỹ năng',
        en: 'study tips english learning ielts education',
        must: /(study|learn|learning|english|ielts|education|school|exam|học|tiếng anh|ôn thi|lập trình|kiến thức|kỹ năng)/i
      },
      'ẨM THỰC & NẤU ĂN': {
        vn: 'ẩm thực nấu ăn món ngon công thức món ăn gia đình',
        en: 'food cooking recipe meal restaurant review',
        must: /(food|cook|cooking|recipe|meal|restaurant|kitchen|mukbang|ẩm thực|nấu|món|ăn|công thức|bếp|quán)/i,
        ban: /(game|lck|league|bolero|reaction|chatgpt|ai tool)/i
      },
      'DU LỊCH & KHÁM PHÁ': {
        vn: 'du lịch khám phá địa điểm travel vlog',
        en: 'travel vlog destination trip guide adventure',
        must: /(travel|trip|vlog|tour|destination|adventure|camping|du lịch|khám phá|phượt|địa điểm|homestay)/i
      },
      'GIẢI TRÍ & HÀI HƯỚC': {
        vn: 'giải trí hài hước phim ngắn reaction meme',
        en: 'funny entertainment meme reaction short film',
        must: /(funny|meme|reaction|entertainment|comedy|movie|film|drama|giải trí|hài|phim|thử thách|meme)/i
      },
      'THỂ THAO & THỂ HÌNH': {
        vn: 'thể thao gym bóng đá workout fitness',
        en: 'sports fitness gym football workout',
        must: /(sport|fitness|gym|football|workout|tennis|basketball|soccer|thể thao|bóng đá|tập|gym|cầu lông)/i
      },
      'PETS & ĐỘNG VẬT': {
        vn: 'thú cưng chó mèo động vật chăm sóc pet',
        en: 'pets dogs cats animals pet care',
        must: /(pet|dog|cat|animal|puppy|kitten|grooming|thú cưng|chó|mèo|động vật|huấn luyện)/i
      },
      'GIA ĐÌNH & ĐỜI SỐNG': {
        vn: 'gia đình đời sống mẹo nhà cửa nuôi con',
        en: 'family life home tips parenting cleaning',
        must: /(family|home|parenting|cleaning|life tips|mom|dad|gia đình|đời sống|dọn nhà|nuôi con|mẹo)/i
      },
      'NGHỆ THUẬT & SÁNG TẠO': {
        vn: 'sáng tạo nghệ thuật vẽ canva edit video',
        en: 'creative art drawing canva video editing',
        must: /(art|creative|drawing|design|canva|edit|photography|guitar|vẽ|sáng tạo|thiết kế|chụp ảnh|video)/i
      },
      'CÔNG NGHỆ Ô TÔ & XE MÁY': {
        vn: 'ô tô xe máy review xe phụ kiện xe',
        en: 'car motorcycle auto review vehicle accessories',
        must: /(car|auto|vehicle|motorcycle|bike|tesla|ô tô|xe máy|phụ kiện xe|review xe)/i
      },
      'TÂM LÝ HỌC & MỐI QUAN HỆ': {
        vn: 'tâm lý học mối quan hệ tình yêu chữa lành',
        en: 'psychology relationship dating healing love',
        must: /(psychology|relationship|dating|love|healing|mental|tâm lý|tình yêu|mối quan hệ|chữa lành)/i
      },
      'ESPORTS & GAMING': {
        vn: 'game esports liên quân free fire highlight',
        en: 'gaming esports gameplay highlights mobile game',
        must: /(game|gaming|esport|gameplay|highlight|free fire|roblox|minecraft|liên quân|liên minh|pubg)/i
      },
      'HUYỀN BÍ & TÂM LINH': {
        vn: 'huyền bí tâm linh bí ẩn tarot phong thủy',
        en: 'mystery spiritual tarot paranormal astrology',
        must: /(mystery|spiritual|tarot|paranormal|astrology|dream|huyền bí|tâm linh|bí ẩn|phong thủy|giấc mơ)/i
      },
      'MẸO VẶT CUỘC SỐNG': {
        vn: 'mẹo vặt cuộc sống mẹo nhà bếp thủ thuật',
        en: 'life hacks tips tricks home hacks',
        must: /(life hack|tips|tricks|how to|cleaning|mẹo|thủ thuật|cách làm|tái chế)/i
      },
      'VĂN HÓA & LỊCH SỬ': {
        vn: 'lịch sử văn hóa khám phá triều đại sự kiện',
        en: 'history culture ancient facts documentary',
        must: /(history|culture|ancient|documentary|war|facts|lịch sử|văn hóa|triều đại|di tích)/i
      },
      'THỜI TRANG & PHONG CÁCH': {
        vn: 'thời trang phối đồ phong cách outfit',
        en: 'fashion style outfit clothing trends',
        must: /(fashion|style|outfit|clothing|sneaker|makeup|thời trang|phối đồ|phong cách|quần áo)/i
      },
      'NÔNG NGHIỆP CÔNG NGHỆ CAO': {
        vn: 'nông nghiệp trồng cây chăn nuôi thủy canh',
        en: 'farming agriculture gardening hydroponics',
        must: /(farm|farming|agriculture|garden|hydroponic|trồng|nông nghiệp|chăn nuôi|cây cảnh|nuôi)/i
      },
      'REVIEW SẢN PHẨM & UNBOXING': {
        vn: 'review sản phẩm unboxing đồ công nghệ mỹ phẩm',
        en: 'product review unboxing gadgets shopping',
        must: /(review|unboxing|product|shopping|gadget|đánh giá|sản phẩm|mở hộp|mua)/i,
        ban: /(bolero|karaoke|lck|gameplay)/i
      },
      'NHẠC & COVER': {
        vn: 'nhạc cover lofi remix karaoke acoustic',
        en: 'music cover lofi remix karaoke acoustic',
        must: /(music|song|cover|lofi|remix|karaoke|acoustic|nhạc|bài hát|beat)/i
      },
      'BẤT ĐỘNG SẢN & NHÀ CỬA': {
        vn: 'bất động sản nhà cửa căn hộ nội thất',
        en: 'real estate home interior apartment house',
        must: /(real estate|house|home|apartment|interior|property|bất động sản|nhà|căn hộ|nội thất)/i
      },
      'CÂU CHUYỆN KHỞI NGHIỆP': {
        vn: 'khởi nghiệp kinh doanh bán hàng marketing',
        en: 'startup business marketing entrepreneurship sales',
        must: /(startup|business|marketing|sales|entrepreneur|khởi nghiệp|kinh doanh|bán hàng|startup)/i
      },
      'CHUYỆN LẠ BỐN PHƯƠNG': {
        vn: 'chuyện lạ khám phá kỳ lạ sự thật thú vị',
        en: 'strange facts weird discoveries amazing',
        must: /(strange|weird|amazing|facts|discovery|kỳ lạ|chuyện lạ|khám phá|sự thật)/i
      },
      'ASMR & MUKBANG': {
        vn: 'asmr mukbang ăn uống âm thanh thư giãn',
        en: 'asmr mukbang eating sounds relaxing',
        must: /(asmr|mukbang|eating sounds|relaxing sound|âm thanh|ăn uống)/i
      },
      'XÂY DỰNG & KIẾN TRÚC': {
        vn: 'xây dựng kiến trúc nhà đẹp thi công',
        en: 'construction architecture building house design',
        must: /(construction|architecture|building|house design|xây dựng|kiến trúc|thi công|nhà đẹp)/i
      },
      'MARKETING & TRUYỀN THÔNG': {
        vn: 'marketing truyền thông affiliate seo tiktok ads',
        en: 'marketing social media seo affiliate ads',
        must: /(marketing|seo|affiliate|ads|social media|content|truyền thông|quảng cáo|tiktok|facebook)/i
      },
      'TRỊ LIỆU ÂM THANH': {
        vn: 'âm thanh chữa lành tiếng mưa thiền ngủ ngon',
        en: 'healing sound sleep music rain meditation',
        must: /(healing sound|sleep music|rain sound|meditation|white noise|âm thanh|chữa lành|tiếng mưa|thiền)/i
      },
      'ĐAN LEN & THÊU THÙA': {
        vn: 'móc len đan len thêu thủ công crochet',
        en: 'crochet knitting embroidery handmade',
        must: /(crochet|knitting|embroidery|handmade|móc len|đan len|thêu|len)/i
      },
      'TÀI CHÍNH & ĐẦU TƯ': {
        vn: 'tài chính đầu tư chứng khoán crypto kiếm tiền',
        en: 'finance investing stocks crypto money',
        must: /(finance|invest|stock|crypto|money|trading|tài chính|đầu tư|chứng khoán|kiếm tiền|tiền)/i,
        ban: /(game|bolero|mukbang)/i
      }
    };

    const getSeedQuery = (category: string) => {
      const seed = categorySeeds[category];
      if (!seed) return selectedRegion === 'VN' ? category.toLowerCase() : category.toLowerCase().replace(/&/g, '');
      if (selectedRegion === 'VN') return seed.vn;
      if (selectedRegion === '') return `${seed.en} global trend`;
      return `${seed.en} ${regionLabel}`;
    };

    const tokenBanned = /\b(official|video|shorts|viral|full|new|update|2024|2025|2026|part|episode|channel|youtube|subscribe|like|comment|follow)\b/i;

    const addPhraseFromText = (text: string, output: string[]) => {
      const cleaned = cleanTrendPhrase(text);
      if (!cleaned) return;
      const chunks = cleaned.split(/[\-–—/\\]+/g).map(compactKeyword).filter(Boolean);
      chunks.forEach((chunk) => {
        const words = chunk.split(/\s+/).filter(Boolean);
        if (words.length >= 2 && words.length <= 6 && !tokenBanned.test(chunk)) output.push(chunk);
        for (let n = 2; n <= Math.min(4, words.length); n++) {
          for (let i = 0; i <= words.length - n; i++) {
            const phrase = words.slice(i, i + n).join(' ');
            if (phrase.length >= 4 && !tokenBanned.test(phrase)) output.push(phrase);
          }
        }
      });
    };

    const extractCandidates = (video: any) => {
      const output: string[] = [];
      const title = video?.snippet?.title || '';
      const description = video?.snippet?.description || '';
      addPhraseFromText(title, output);
      if (Array.isArray(video?.snippet?.tags)) {
        video.snippet.tags.forEach((tag: string) => output.push(compactKeyword(tag)));
      }
      description.split('\n').slice(0, 6).forEach((line: string) => addPhraseFromText(line, output));
      return output.filter(Boolean);
    };

    const scoreVideo = (video: any, channel: any) => {
      const views = Number(video?.statistics?.viewCount || 0);
      const subs = Number(channel?.statistics?.subscriberCount || 0);
      const vph = calculateVPH(views, video?.snippet?.publishedAt);
      const ratio = views / Math.max(subs, 1);
      return Math.round((Math.log10(views + 10) * 18) + Math.min(vph, 5000) / 35 + Math.min(ratio, 500) * 2 + (subs <= 50000 ? 120 : 0));
    };

    const getRegionLanguageName = (code: string) => {
      const mapping: Record<string, string> = {
        VN: 'Vietnamese', US: 'English', GB: 'English', CA: 'English', AU: 'English', NZ: 'English',
        SG: 'English', PH: 'English', IN: 'English', JP: 'Japanese', KR: 'Korean', RU: 'Russian',
        BR: 'Portuguese', PT: 'Portuguese', ES: 'Spanish', MX: 'Spanish', AR: 'Spanish', CO: 'Spanish',
        FR: 'French', DE: 'German', TH: 'Thai', ID: 'Indonesian', MY: 'Malay', IT: 'Italian',
        TR: 'Turkish', SA: 'Arabic', EG: 'Arabic'
      };
      return mapping[code] || 'English';
    };

    const normalizeGeminiKeywordList = (raw: string) => {
      let arr: string[] = [];
      try {
        const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
        if (Array.isArray(parsed)) arr = parsed.map(String);
        else if (Array.isArray(parsed?.keywords)) arr = parsed.keywords.map(String);
      } catch (_) {
        arr = raw
          .replace(/```json|```/g, '')
          .split(/[\n,;]+/g)
          .map(line => line.replace(/^[-*\d.")\s]+/g, '').trim());
      }

      const seen = new Set<string>();
      return arr
        .map(item => item.replace(/^#/, '').replace(/["“”']/g, '').replace(/\s+/g, ' ').trim())
        .filter(item => item.length >= 3 && item.length <= 42)
        .filter(item => languageOk(item))
        .filter(item => {
          const key = removeVietnameseTone(item);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 5);
    };

    const generateGeminiNicheKeywords = async (category: string, count = 5) => {
      if (!geminiApiKey) return [] as string[];
      try {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const lang = getRegionLanguageName(selectedRegion);
        const prompt = `Return exactly ${count} YouTube niche keyword phrases for this region and category.
Region code: ${selectedRegion || 'GLOBAL'}
Region name: ${regionLabel}
Language required: ${lang}
Category: ${category}
Rules:
- Output must be ONLY a JSON array of strings.
- Each string must be 2 to 6 words.
- Do not repeat ideas.
- Use the natural search language of the selected region only.
- Do not use Vietnamese unless the selected region is Vietnam.
- Avoid channels above 1 million subscribers; focus on small/medium hot-trend opportunities from the last 30 days.
- Keywords must logically match the category.`;
        const response = await ai.models.generateContent({
          model: geminiModel,
          contents: [{ role: 'user', parts: [{ text: prompt }] }]
        });
        return normalizeGeminiKeywordList(response.text || '');
      } catch (e) {
        console.warn('Gemini fallback keyword generation failed:', e);
        return [] as string[];
      }
    };

    try {
      const updated = [] as { category: string; items: string[] }[];

      for (let idx = 0; idx < SUGGESTED_NICHES.length; idx++) {
        const category = SUGGESTED_NICHES[idx].category;
        const seed = categorySeeds[category];
        const query = getSeedQuery(category);
        setStatus(`Đang lấy trend thật: ${category} (${idx + 1}/${SUGGESTED_NICHES.length})...`);

        const searchRes = await youtubeFetch('search', {
          part: 'snippet',
          q: query,
          type: 'video',
          regionCode: selectedRegion || undefined,
          publishedAfter,
          order: 'viewCount',
          maxResults: 12,
          relevanceLanguage: selectedRegion === 'VN' ? 'vi' : ['US','GB','CA','AU','SG'].includes(selectedRegion) ? 'en' : undefined
        });

        const videoIds = (searchRes?.items || []).map((item: any) => item?.id?.videoId).filter(Boolean);
        if (videoIds.length === 0) {
          const aiItems = await generateGeminiNicheKeywords(category, 5);
          updated.push({ category, items: aiItems.length ? aiItems : SUGGESTED_NICHES[idx].items.slice(0, 5).filter(languageOk) });
          continue;
        }

        const videoDetail = await youtubeFetch('videos', {
          part: 'snippet,statistics',
          id: videoIds.join(',')
        });

        const videos = Array.isArray(videoDetail?.items) ? videoDetail.items : [];
        const channelIds = [...new Set(videos.map((v: any) => v?.snippet?.channelId).filter(Boolean))];
        const channelDetail = channelIds.length > 0 ? await youtubeFetch('channels', {
          part: 'snippet,statistics',
          id: channelIds.join(',')
        }) : { items: [] };

        const channelMap = new Map((channelDetail?.items || []).map((ch: any) => [ch.id, ch]));
        const phraseScores = new Map<string, number>();
        const loosePhraseScores = new Map<string, number>();
        const filteredVideos = videos
          .map((video: any) => ({ video, channel: channelMap.get(video?.snippet?.channelId) }))
          .filter(({ channel }: any) => {
            const subs = Number(channel?.statistics?.subscriberCount || 0);
            return subs > 0 && subs <= 1000000;
          });

        const preferredVideos = filteredVideos.some(({ channel }: any) => Number(channel?.statistics?.subscriberCount || 0) <= 50000)
          ? filteredVideos.filter(({ channel }: any) => Number(channel?.statistics?.subscriberCount || 0) <= 50000)
          : filteredVideos;

        preferredVideos.forEach(({ video, channel }: any) => {
          const baseScore = scoreVideo(video, channel);
          extractCandidates(video).forEach((phrase) => {
            const normalizedPhrase = removeVietnameseTone(phrase);
            if (!languageOk(phrase)) return;
            if (seed?.ban && seed.ban.test(normalizedPhrase)) return;
            if (phrase.length < 3 || phrase.length > 42) return;

            const loosePrev = loosePhraseScores.get(phrase) || 0;
            loosePhraseScores.set(phrase, loosePrev + baseScore);

            if (seed?.must && !seed.must.test(`${phrase} ${normalizedPhrase} ${query}`)) return;
            const prev = phraseScores.get(phrase) || 0;
            phraseScores.set(phrase, prev + baseScore + 20);
          });
        });

        const ranked = [...phraseScores.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([phrase]) => phrase)
          .filter((phrase, index, arr) => {
            const key = removeVietnameseTone(phrase);
            return arr.findIndex(item => removeVietnameseTone(item) === key) === index;
          })
          .slice(0, 5);

        const looseRanked = [...loosePhraseScores.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([phrase]) => phrase)
          .filter((phrase) => !ranked.some(item => removeVietnameseTone(item) === removeVietnameseTone(phrase)));

        let items = [
          ...ranked,
          ...looseRanked
        ].filter((item, i, arr) => arr.findIndex(x => removeVietnameseTone(x) === removeVietnameseTone(item)) === i).slice(0, 5);

        // Nếu YouTube API không đủ dữ liệu đúng chủ đề/khu vực thì dùng Gemini để bù từ khóa,
        // nhưng vẫn khóa ngôn ngữ theo khu vực đã chọn để tránh sai vùng.
        if (items.length < 5) {
          const aiItems = await generateGeminiNicheKeywords(category, 5 - items.length);
          items = [...items, ...aiItems]
            .filter((item, i, arr) => arr.findIndex(x => removeVietnameseTone(x) === removeVietnameseTone(item)) === i)
            .slice(0, 5);
        }

        updated.push({
          category,
          items: items.length ? items : SUGGESTED_NICHES[idx].items.slice(0, 5).filter(languageOk)
        });
      }

      setSuggestedNiches(updated);
      localStorage.setItem(storageKey, JSON.stringify(updated));
      setStatus(`Đã cập nhật trending theo dữ liệu YouTube API V3 cho ${regionLabel}.`);
    } catch (error: any) {
      console.error(error);
      setStatus(`Lỗi cập nhật Trending: ${error?.message || 'Không xác định'}`);
    } finally {
      setIsFetchingDailyTrending(false);
    }
  };


  // Bước 62: Người dùng chỉ đọc dữ liệu ngách đã được admin quét sẵn.
  // Không cho người dùng tự quét YouTube API ở popup gợi ý ngách để tiết kiệm quota.
  const loadTrendingNicheCache = async (regionCode?: string) => {
    const selectedRegion = regionCode || trendingRegion || config.region || 'VN';
    const localKey = `youtube_suggested_niches_trending_cache_${selectedRegion || 'GLOBAL'}`;
    setIsFetchingDailyTrending(true);
    setStatus('Đang tải danh sách ngách đã được hệ thống cập nhật...');

    try {
      const res = await fetch(`/api/trending-cache?region=${encodeURIComponent(selectedRegion)}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        cache: 'no-store'
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(data?.error || 'Không lấy được dữ liệu cache');

      const categories = Array.isArray(data?.categories) ? data.categories : [];
      if (categories.length > 0) {
        const normalized = categories.map((niche: any) => ({
          category: String(niche.category || '').toUpperCase(),
          items: Array.isArray(niche.items) ? niche.items.slice(0, 5).map((x: any) => String(x?.keyword || x || '').trim()).filter(Boolean) : []
        })).filter((niche: any) => niche.category && niche.items.length > 0);

        if (normalized.length > 0) {
          setSuggestedNiches(normalized);
          setTrendingCacheMeta({ updatedAt: data.updatedAt, region: selectedRegion, source: data.source || 'system-cache' });
          localStorage.setItem(localKey, JSON.stringify(normalized));
          localStorage.setItem(`youtube_suggested_niches_trending_v4_${selectedRegion || 'GLOBAL'}`, JSON.stringify(normalized));
          setStatus(`Đã tải ${normalized.length} chủ đề ngách đã cập nhật từ hệ thống.`);
          return;
        }
      }

      throw new Error('Cache chưa có dữ liệu cho khu vực này');
    } catch (err: any) {
      const saved = localStorage.getItem(localKey)
        || localStorage.getItem(`youtube_suggested_niches_trending_v4_${selectedRegion || 'GLOBAL'}`)
        || localStorage.getItem(`youtube_suggested_niches_trending_v3_${selectedRegion || 'GLOBAL'}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSuggestedNiches(parsed.map((niche: any) => ({
              ...niche,
              items: Array.isArray(niche.items) ? niche.items.slice(0, 5) : []
            })));
            setStatus('Đang hiển thị dữ liệu ngách đã lưu gần nhất trên trình duyệt.');
            return;
          }
        } catch {}
      }
      setSuggestedNiches(SUGGESTED_NICHES);
      setStatus(err?.message || 'Chưa có dữ liệu ngách hệ thống cho khu vực này.');
    } finally {
      setIsFetchingDailyTrending(false);
    }
  };

  // Chỉ admin chạy quét ngầm/định kỳ. Người dùng thường không gọi API YouTube tại popup này.
  const runAdminTrendingCron = async () => {
    if (user?.email !== 'chinhkhai79@gmail.com') return;
    setIsFetchingDailyTrending(true);
    setStatus('Admin: đang kích hoạt quét ngách hệ thống...');
    try {
      const secret = window.prompt('Nhập ADMIN_CRON_SECRET để chạy quét ngách:') || '';
      if (!secret.trim()) return;
      const res = await fetch(`/api/admin-trending-cron?region=${encodeURIComponent(trendingRegion || config.region || 'VN')}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': secret.trim()
        },
        body: JSON.stringify({ region: trendingRegion || config.region || 'VN' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Admin cron lỗi');
      setStatus(`Admin: đã cập nhật cache ${data.region || ''}.`);
      await loadTrendingNicheCache(data.region || trendingRegion || config.region || 'VN');
    } catch (err: any) {
      setStatus(err?.message || 'Không chạy được admin cron.');
    } finally {
      setIsFetchingDailyTrending(false);
    }
  };

    const runNicheResearch = async (customKeyword?: string) => {
    let kw = (customKeyword || nicheInput || '').trim();
    if (!kw) {
      kw = getNextAutoNicheSeed(nicheRegion || config.region || 'VN');
      setNicheInput(kw);
    }

    if (kw) {
      localStorage.setItem('youtube_last_niche_keyword', kw);
    }

    if (config.apiKeys.length === 0) {
      setStatus('Vui lòng thêm ít nhất một API Key trong phần cài đặt.');
      return;
    }

    setIsNicheSearching(true);
    setStatus(`${(customKeyword || nicheInput || '').trim() ? 'Đang nghiên cứu ngách' : 'Tự động chọn ngách theo khu vực/thời gian'}: ${kw}...`);
    
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
        setStatus('Không tìm thấy dữ liệu thật từ YouTube API cho từ khóa này.');
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
        setStatus('Không lấy được thông tin chi tiết video.');
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
      const subLimitedChannelIds = new Set(
        allChannels
          .filter((c: any) => (parseInt(c.statistics?.subscriberCount) || 0) <= nicheMaxSub)
          .map((c: any) => c.id)
      );
      const videosForProcessing = allDetailedVideos.filter((v: any) => subLimitedChannelIds.has(v.snippet.channelId));
      const sourceVideosForProcessing = videosForProcessing.length > 0 ? videosForProcessing : allDetailedVideos;
      const processedVideos = sourceVideosForProcessing.map((v: any) => {
        const chan = channelsMap.get(v.snippet.channelId);
        const stats = v.statistics || {};
        const views = parseInt(stats.viewCount) || 0;
        const vph = calculateVPH(views, v.snippet.publishedAt);
        const trendScore = calculateTrendScore(v, chan);
        
        const channelSubscriberCount = parseInt(chan?.statistics?.subscriberCount) || 0;
        return {
          ...v,
          vph,
          trendScore,
          channelStats: chan?.statistics || {},
          channelSubscriberCount,
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
        channels: allChannels
          .filter((c: any) => (parseInt(c.statistics?.subscriberCount) || 0) <= nicheMaxSub || videosForProcessing.length === 0)
          .map((c: any) => {
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
      setStatus('Có lỗi xảy ra khi gọi YouTube API. Vui lòng kiểm tra API Key hoặc Quota.');
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
    const keys = config.apiKeys.map(k => String(k || '').trim()).filter(Boolean);
    if (keys.length === 0) {
      throw new Error('Chưa có YouTube API Key. Vui lòng nhập Key trong phần cài đặt.');
    }

    const quotaCost = endpoint === 'search' ? 100 : 1;
    const currentExhausted = new Set(exhaustedKeys.map(k => String(k || '').trim()).filter(Boolean));
    const today = new Date().toISOString().split('T')[0];

    const saveExhaustedKeyNow = (key: string, reason: string) => {
      currentExhausted.add(key);
      const nextKeys = Array.from(currentExhausted);
      setExhaustedKeys(nextKeys);
      localStorage.setItem('youtube_exhausted_keys', JSON.stringify({ keys: nextKeys, date: today }));
      const keyNo = keys.findIndex(k => k === key) + 1;
      setStatus(`Key #${keyNo} đã hết/lỗi (${reason}). Tự động bỏ qua và dùng key tiếp theo...`);
      setLastError(`Key #${keyNo} lỗi: ${reason}`);
    };

    const shouldSkipKey = (key: string) => currentExhausted.has(key);
    const isQuotaOrKeyError = (data: any, httpStatus?: number) => {
      const reason = String(
        data?.error?.errors?.[0]?.reason ||
        data?.error?.status ||
        data?.error?.message ||
        data?.error ||
        ''
      ).toLowerCase();

      return (
        httpStatus === 401 ||
        httpStatus === 403 ||
        reason.includes('quota') ||
        reason.includes('daily') ||
        reason.includes('limit') ||
        reason.includes('keyinvalid') ||
        reason.includes('api key not valid') ||
        reason.includes('invalid key') ||
        reason.includes('forbidden') ||
        reason.includes('unauthorized') ||
        reason.includes('accessnotconfigured')
      );
    };

    const getReasonText = (data: any, httpStatus?: number) => {
      return String(
        data?.error?.errors?.[0]?.reason ||
        data?.error?.status ||
        data?.error?.message ||
        data?.error ||
        `HTTP_${httpStatus || 'UNKNOWN'}`
      );
    };

    let lastError: any = null;
    const startIndex = Math.max(0, Math.min(apiKeyIndex, keys.length - 1));
    const orderedKeys = [
      ...keys.slice(startIndex),
      ...keys.slice(0, startIndex)
    ];

    for (const activeKey of orderedKeys) {
      if (!activeKey || shouldSkipKey(activeKey)) continue;

      const keyIndex = keys.findIndex(k => k === activeKey);
      const keyNo = keyIndex + 1;
      setApiKeyIndex(keyIndex);
      setStatus(`Đang dùng YouTube API Key #${keyNo}/${keys.length}: ${activeKey.slice(0, 8)}... để gọi ${endpoint}`);

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

        const data = await response.json().catch(() => ({}));

        if (response.ok && !data?.error) {
          setApiKeyIndex(keyIndex);
          setStatus(`Key #${keyNo} hoạt động tốt. Đã lấy dữ liệu YouTube thành công.`);
          setLastError(null);
          updateQuotaUsage(quotaCost);
          return data;
        }

        if (isQuotaOrKeyError(data, response.status)) {
          const reason = getReasonText(data, response.status);
          saveExhaustedKeyNow(activeKey, reason);
          lastError = data;
          continue;
        }

        const errorMessage = getReasonText(data, response.status);
        throw new Error(`Lỗi YouTube API (${response.status}): ${errorMessage}`);
      } catch (err: any) {
        if (err?.name === 'AbortError') throw err;
        lastError = err;
        setStatus(`Key #${keyNo} gọi lỗi tạm thời. Tự thử key tiếp theo...`);
        continue;
      }
    }

    const remain = keys.filter(k => !currentExhausted.has(k)).length;
    if (remain <= 0) {
      setStatus('Tất cả YouTube API Key hôm nay đã hết quota hoặc lỗi. Hãy thêm key mới hoặc đợi reset quota.');
      throw new Error('Tất cả YouTube API Key hôm nay đã hết quota hoặc lỗi.');
    }

    throw lastError || new Error('Không gọi được YouTube API bằng các key hiện có.');
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
    setManualKeysInput(config.apiKeys.map(k => k.trim()).filter(Boolean).join('\n'));
    localStorage.setItem('youtube_api_keys_text_draft', config.apiKeys.map(k => k.trim()).filter(Boolean).join('\n'));
    localStorage.setItem('youtube_hunter_config', JSON.stringify({
      ...config,
      apiKeys: [] // Don't double save keys
    }));
    setStatus('Đã lưu cấu hình.');
  };


  const shuffleList = <T,>(items: T[]) => {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const diversifySeedsByTopic = (seeds: string[]) => {
    const usedTopics = new Set<string>();
    const firstPass: string[] = [];
    const secondPass: string[] = [];
    for (const seed of seeds) {
      const topic = getTopicFromKeyword(seed).toLowerCase();
      if (!usedTopics.has(topic)) {
        usedTopics.add(topic);
        firstPass.push(seed);
      } else {
        secondPass.push(seed);
      }
    }
    return [...firstPass, ...shuffleList(secondPass)];
  };

  const getNextAutoNicheSeed = (regionCode?: string) => {
    const region = regionCode || config.region || 'VN';
    const seeds = diversifySeedsByTopic(getAutoHuntSeeds(region));
    if (!seeds.length) return 'ai tools';

    const storeKey = `youtube_auto_niche_used_${region}`;
    let used: string[] = [];
    try {
      used = JSON.parse(localStorage.getItem(storeKey) || '[]');
      if (!Array.isArray(used)) used = [];
    } catch (_) {
      used = [];
    }

    let next = seeds.find(seed => !used.includes(seed));
    if (!next) {
      used = [];
      next = shuffleList(seeds)[0] || seeds[0];
    }

    localStorage.setItem(storeKey, JSON.stringify([...used, next].slice(-seeds.length)));
    return next;
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
        'ai công cụ mới', 'mẹo điện thoại', 'du lịch việt nam', 'ẩm thực hot', 'game mobile',
        'bóng đá việt nam', 'tin tức 24h', 'kiếm tiền online', 'sức khỏe tại nhà', 'review xe',
        'chăm sóc thú cưng', 'học tiếng anh', 'nhạc lofi', 'mẹo gia đình', 'bất động sản'
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


  const normalizeDeepDrillText = (value: string) =>
    (value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd');

  const isBroadHighSubExcludedTopic = (video: any, channel: any, seed: string) => {
    const text = normalizeDeepDrillText([
      seed,
      video?.snippet?.title,
      video?.snippet?.description,
      channel?.snippet?.title,
      channel?.snippet?.description
    ].join(' '));

    return /(giai tri|entertainment|am thuc|food|cooking|nau an|mukbang|suc khoe|health|fitness|lam dep|beauty)/i.test(text);
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
    setStatus(config.deepDrillSmallTrend ? 'Đang bật Deep Drill: săn kênh nhỏ/mới trend trong 30 ngày...' : (isAutoHunt ? 'Đang tự động lọc kênh hot theo khu vực/thời gian...' : 'Đang khởi tạo...'));
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
      const effectivePublishedAfter = config.deepDrillSmallTrend ? 'month' : config.publishedAfter;
      const publishedAfter = getPublishedAfterDate(effectivePublishedAfter);

      let scanKeywords: string[] = [];
      if (isAutoHunt) {
        scanKeywords = diversifySeedsByTopic(shuffleList(getAutoHuntSeeds(currentRegion))).slice(0, 16);
      } else {
        let searchKeyword = rawKeyword;
        if (currentRegion && currentRegion !== 'VN') {
          const targetLang = getLanguageForRegion(currentRegion);
          searchKeyword = translateKeywordSimple(rawKeyword, targetLang);
        }
        scanKeywords = [searchKeyword];
      }

      const addedChannelIds = new Set<string>(resultsRef.current.map(r => r.id));
      const usedAutoSeedTopics = new Set<string>();

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
          maxResults: config.deepDrillSmallTrend ? 50 : Math.min(Math.max(config.maxVideos, 20), 50),
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
          .filter((id: any) => !addedChannelIds.has(String(id)) && !resultsRef.current.some(r => r.id === id));

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

            const deepDrillActive = !!config.deepDrillSmallTrend;
            const deepDrillMaxSub = 50000;
            const hardExcludedByTopic = deepDrillActive && subs > 500000 && isBroadHighSubExcludedTopic(video, channel, searchKeyword);
            const effectiveMinSub = deepDrillActive ? 0 : config.minSub;
            const effectiveMaxSub = deepDrillActive ? Math.min(config.maxSub || deepDrillMaxSub, deepDrillMaxSub) : config.maxSub;
            const effectiveMinViews = deepDrillActive ? Math.max(500, Math.floor(config.minViews / 4)) : config.minViews;

            const passed =
              !hardExcludedByTopic &&
              subs >= effectiveMinSub &&
              subs <= effectiveMaxSub &&
              videoCount >= config.minVideo &&
              (config.maxVideo ? videoCount <= config.maxVideo : true) &&
              views >= effectiveMinViews;

            // Khi ô từ khóa trống hoặc Deep Drill, ưu tiên video mới có hiệu suất vượt trội hơn tổng view toàn kênh.
            const trendPassed = metrics.vph >= 1 || metrics.viewSubRatio >= 1 || metrics.outlierScore >= 1.5 || bestVideoViews >= Math.max(1000, effectiveMinViews / 2);
            const autoPassed = (isAutoHunt || deepDrillActive) ? passed && trendPassed : passed;

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
          .slice(0, isAutoHunt ? 4 : STOP_LIMIT);

        for (const candidate of candidates as any[]) {
          if (!isHuntingRef.current || resultsRef.current.length >= STOP_LIMIT) break;
          const candidateChannelId = String(candidate.channel.id);
          if (addedChannelIds.has(candidateChannelId) || resultsRef.current.some(r => r.id === candidate.channel.id)) continue;
          addedChannelIds.add(candidateChannelId);

          const channel = candidate.channel;
          const autoSeedKey = normalizeHunterKeyword(searchKeyword).slice(0, 48);
          if (isAutoHunt && usedAutoSeedTopics.has(autoSeedKey)) continue;
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

          if (isAutoHunt) usedAutoSeedTopics.add(autoSeedKey);
          const nextResults = dedupeChannelResults([...resultsRef.current.filter(item => item.id !== newResult.id), newResult]);
          resultsRef.current = nextResults;
          localStorage.setItem('youtube_hunter_results', JSON.stringify(nextResults));
          setResults(nextResults);

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
          part: 'snippet,statistics,topicDetails',
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

          // Update metadata from real YouTube Data API v3 response
          const updatedIcon = item.snippet?.thumbnails?.default?.url || c.icon;
          const updatedCountry = item.snippet?.country || c.country || 'VN';
          const updatedKeyword = getTrackingKeywordFromApiItem(item, c.name || item.snippet?.title);
          const updatedTopic = getTopicFromKeyword(updatedKeyword);
          const updatedIncome = estimateIncomeFromTracking(newSnapshot.views, updatedCountry);

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

          return {
            ...c,
            name: item.snippet?.title || c.name,
            history,
            icon: updatedIcon,
            country: updatedCountry,
            keywordTitle: updatedKeyword,
            topic: updatedTopic,
            income: updatedIncome
          };
        });
        localStorage.setItem('youtube_tracking_channels', JSON.stringify(next));
        return next;
      });
      setStatus('Cập nhật tracking hoàn tất.');
      setStatus(`Đã cập nhật số liệu mới nhất cho ${trackingChannels.length} kênh.`);
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
        content += `   Chỉ số: ${formatVNNumber(r.subs)} Subs | ${formatVNNumber(r.views)} Views | ${formatVNNumber(r.videos)} Videos\n`;
        content += `   Từ khóa/ngách: ${getChannelTrendKeyword(r)}\n`;
        content += `   Chủ đề: ${getTopicFromKeyword(getChannelTrendKeyword(r))}\n`;
        content += `   Thu nhập ước tính: ${estimateIncomeFromApiViews(r)}\n`;
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
        country: channel.country,
        keywordTitle: getChannelTrendKeyword(channel),
        topic: getTopicFromKeyword(getChannelTrendKeyword(channel)),
        income: estimateIncomeFromApiViews(channel),
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
        country: channel.country,
        keywordTitle: getChannelTrendKeyword(channel),
        topic: getTopicFromKeyword(getChannelTrendKeyword(channel)),
        income: estimateIncomeFromApiViews(channel),
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
    setStatus(`Đã thêm ${newChannels.length} kênh mới vào danh sách theo dõi.`);
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



  const stripCodeFence = (text: string) => String(text || '').replace(/```json|```/g, '').trim();

  const parseGeminiJsonObject = (text: string) => {
    const cleaned = stripCodeFence(text);
    try {
      return JSON.parse(cleaned);
    } catch (_) {
      const first = cleaned.indexOf('{');
      const last = cleaned.lastIndexOf('}');
      if (first >= 0 && last > first) {
        try { return JSON.parse(cleaned.slice(first, last + 1)); } catch (__) {}
      }
    }
    return null;
  };

  const asArrayText = (value: any, fallback: string[] = []) => {
    if (Array.isArray(value)) {
      return value.map(v => String(v || '').trim()).filter(Boolean).slice(0, 8);
    }
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return fallback;
  };

  const calculateVideoVph = (viewCount: number, publishedAt?: string) => {
    if (!publishedAt) return 0;
    const published = new Date(publishedAt).getTime();
    if (!Number.isFinite(published)) return 0;
    const hours = Math.max(1, (Date.now() - published) / 36e5);
    return Math.round(Number(viewCount || 0) / hours);
  };

  const getVideoRpmRange = (categoryId?: string, country?: string) => {
    const highValueCategories = ['27', '28', '26', '25'];
    const midValueCategories = ['22', '24', '19', '2', '17'];
    const normalizedCountry = String(country || '').toUpperCase();
    let base: [number, number] = highValueCategories.includes(String(categoryId || '')) ? [0.8, 4.5] : midValueCategories.includes(String(categoryId || '')) ? [0.5, 2.5] : [0.25, 1.5];
    if (['US', 'GB', 'CA', 'AU'].includes(normalizedCountry)) base = [base[0] * 2.5, base[1] * 2.8];
    if (['VN', 'TH', 'ID', 'PH', 'IN'].includes(normalizedCountry)) base = [base[0] * 0.45, base[1] * 0.55];
    return `$${base[0].toFixed(2)} - $${base[1].toFixed(2)}`;
  };

  const buildFallbackVideoAudit = (video: any) => {
    const title = String(video?.snippet?.title || '');
    const description = String(video?.snippet?.description || '');
    const tags = Array.isArray(video?.snippet?.tags) ? video.snippet.tags : [];
    const views = parseInt(video?.statistics?.viewCount || '0') || 0;
    const likes = parseInt(video?.statistics?.likeCount || '0') || 0;
    const comments = parseInt(video?.statistics?.commentCount || '0') || 0;
    const vph = calculateVideoVph(views, video?.snippet?.publishedAt);
    const hasLink = /https?:\/\//i.test(description);
    const hasHashtag = /#/i.test(`${title} ${description}`) || tags.length > 0;
    const titleTooLong = title.length > 72;
    const engagementRate = views ? ((likes + comments) / views) * 100 : 0;

    return {
      source: 'fallback',
      overview: [
        {
          key: 'title',
          title: 'TIÊU ĐỀ (TITLE)',
          icon: 'T',
          current: titleTooLong ? 'Tiêu đề có nhiều từ khóa nhưng hơi dài, dễ bị cắt trên mobile.' : 'Tiêu đề rõ chủ đề chính và có khả năng thu hút đúng tệp người xem.',
          strengths: [hasHashtag ? 'Có nhắc tới từ khóa/hashtag liên quan.' : 'Tiêu đề thể hiện được nội dung chính của video.'],
          improvements: [titleTooLong ? 'Rút gọn phần sau, đưa từ khóa mạnh nhất lên đầu.' : 'Có thể thêm lợi ích cụ thể hoặc yếu tố tò mò để tăng CTR.'],
          suggestions: [
            `"${title.slice(0, 52)}${title.length > 52 ? '...' : ''} | Điểm Khác Biệt Cần Biết"`,
            `"Sự Thật Đằng Sau: ${title.slice(0, 45)}${title.length > 45 ? '...' : ''}"`
          ]
        },
        {
          key: 'description',
          title: 'MÔ TẢ (DESCRIPTION)',
          icon: '▤',
          current: description.length > 120 ? 'Mô tả đã có dữ liệu để YouTube hiểu nội dung video.' : 'Mô tả còn mỏng, chưa tận dụng tốt để bổ sung ngữ cảnh SEO.',
          strengths: [hasLink ? 'Có link trong mô tả giúp điều hướng người xem.' : 'Mô tả có thể mở rộng thêm CTA/link liên quan.'],
          improvements: ['Đưa 2 dòng đầu thật rõ lợi ích, thêm từ khóa phụ và lời kêu gọi hành động.'],
          suggestions: ['Thêm tóm tắt 2 dòng đầu, link liên quan, hashtag chính và CTA rõ ràng.']
        },
        {
          key: 'thumbnail',
          title: 'THUMBNAIL',
          icon: '▧',
          current: 'Thumbnail lấy từ YouTube API. AI đánh giá dựa trên tiêu đề, chủ đề và hiệu suất hiện tại.',
          strengths: ['Có thumbnail để người xem nhận diện nội dung.'],
          improvements: ['Đảm bảo chữ lớn, tương phản mạnh, ít chi tiết và có điểm nhấn thị giác.'],
          suggestions: ['Dùng 3–5 từ khóa lớn trên ảnh, tránh nhồi quá nhiều chữ.']
        },
        {
          key: 'tags',
          title: 'TAGS & HASHTAGS',
          icon: '#',
          current: tags.length ? `Video có ${tags.length} tags từ dữ liệu YouTube API.` : 'Video chưa có tags công khai trong dữ liệu YouTube API.',
          strengths: [tags.length ? 'Có bộ tag hỗ trợ YouTube hiểu chủ đề.' : 'Có thể bổ sung tags sát ngách hơn.'],
          improvements: ['Ưu tiên tag dài 2–5 từ, đúng ngách, tránh tag quá rộng.'],
          suggestions: tags.slice(0, 5).length ? tags.slice(0, 5) : ['thêm từ khóa chính', 'từ khóa phụ', 'chủ đề video']
        },
        {
          key: 'trend',
          title: 'CHỦ ĐỀ & XU HƯỚNG',
          icon: '↗',
          current: `Video hiện có ${formatVNNumber(views)} lượt xem, khoảng ${formatVNNumber(vph)} VPH.`,
          strengths: [vph > 100 ? 'Tốc độ xem/giờ đang tốt.' : 'Có dữ liệu thật để đánh giá hiệu suất ban đầu.'],
          improvements: ['So sánh thêm với video cùng chủ đề để quyết định nhân bản format hay đổi hướng.'],
          suggestions: ['Làm tiếp video cùng cụm từ khóa nếu VPH cao hơn trung bình kênh.']
        },
        {
          key: 'pinned',
          title: 'BÌNH LUẬN GHIM',
          icon: '◆',
          current: video?._comments?.length ? 'Đã lấy được bình luận nổi bật từ YouTube API để tham khảo phản hồi.' : 'Chưa có dữ liệu bình luận hoặc video tắt bình luận.',
          strengths: ['Có thể dùng bình luận ghim để tăng chuyển đổi.'],
          improvements: ['Ghim bình luận chứa CTA/link/tóm tắt lợi ích rõ ràng.'],
          suggestions: ['“Anh chị muốn nhận tài liệu/checklist thì xem link trong mô tả hoặc bình luận này.”']
        }
      ],
      contentStyle: {
        contentBullets: [
          'Nội dung cần bám sát lời hứa trong tiêu đề để giữ chân người xem.',
          `Hiệu suất hiện tại: ${formatVNNumber(views)} views, ${formatVNNumber(likes)} likes, ${formatVNNumber(comments)} comments.`,
          engagementRate > 1 ? 'Tỷ lệ tương tác đang có tín hiệu tốt.' : 'Tỷ lệ tương tác còn thấp, nên tăng câu hỏi/CTA trong video.',
          'Nên đưa lợi ích chính trong 5–10 giây đầu.'
        ],
        styleBullets: [
          'Phong cách nên rõ ràng, vào thẳng vấn đề và có nhịp dựng nhanh hơn ở đoạn mở đầu.',
          'Cần thêm pattern interrupt, chữ nhấn mạnh hoặc B-roll nếu phần trình bày dài.',
          'Âm thanh, ánh sáng và bố cục thumbnail nên đồng bộ với tệp người xem mục tiêu.'
        ],
        strengths: ['Có dữ liệu thật từ YouTube API để đối chiếu hiệu suất.', hasHashtag ? 'Có dùng từ khóa/hashtag.' : 'Có thể tối ưu thêm từ khóa.'],
        warnings: [titleTooLong ? 'Tiêu đề dài dễ bị cắt.' : 'Cần kiểm tra CTR thực tế trong YouTube Studio.', vph < 20 ? 'VPH chưa cao, cần cải thiện hook và thumbnail.' : 'Nên nhân bản chủ đề nếu retention tốt.']
      },
      conclusion: {
        headline: vph > 100 ? 'Video có tín hiệu tốt, nên nhân bản chủ đề và tối ưu thêm để tăng chuyển đổi.' : 'Video có nền tảng dữ liệu nhưng cần tối ưu lại hook, thumbnail và CTA để tăng hiệu suất.',
        badges: [
          vph > 100 ? 'VPH tốt' : 'Cần tăng VPH',
          hasLink ? 'Có CTA/link' : 'Thiếu CTA/link',
          tags.length ? 'Có tags' : 'Thiếu tags'
        ]
      }
    };
  };

  const analyzeVideoWithGemini = async (video: any) => {
    const fallback = buildFallbackVideoAudit(video);
    if (!geminiApiKey) return fallback;

    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const stats = video?.statistics || {};
      const channelStats = video?._channelInfo?.statistics || {};
      const dataForAi = {
        videoId: video?.id,
        title: video?.snippet?.title,
        description: video?.snippet?.description,
        tags: video?.snippet?.tags || [],
        categoryId: video?.snippet?.categoryId,
        categoryName: getCategoryName(video?.snippet?.categoryId),
        publishedAt: video?.snippet?.publishedAt,
        duration: formatDuration(video?.contentDetails?.duration),
        viewCount: parseInt(stats.viewCount || '0') || 0,
        likeCount: parseInt(stats.likeCount || '0') || 0,
        commentCount: parseInt(stats.commentCount || '0') || 0,
        vph: calculateVideoVph(parseInt(stats.viewCount || '0') || 0, video?.snippet?.publishedAt),
        channelTitle: video?.snippet?.channelTitle,
        channelCountry: video?._channelInfo?.snippet?.country || 'N/A',
        channelSubscribers: parseInt(channelStats.subscriberCount || '0') || 0,
        channelViews: parseInt(channelStats.viewCount || '0') || 0,
        comments: (video?._comments || []).slice(0, 6).map((c: any) => ({ author: c.authorDisplayName, text: String(c.textDisplay || '').replace(/<br>/g, '\n').replace(/<\/?[^>]+(>|$)/g, '') }))
      };

      const prompt = `Bạn là chuyên gia tối ưu YouTube. Hãy phân tích video bằng tiếng Việt, nhưng PHẢI dựa trên dữ liệu thật từ YouTube API V3 dưới đây, không bịa số liệu mới.

DỮ LIỆU YOUTUBE API V3:
${JSON.stringify(dataForAi, null, 2)}

Yêu cầu trả về DUY NHẤT một JSON object hợp lệ, không markdown, đúng schema:
{
  "overview": [
    {"key":"title","title":"TIÊU ĐỀ (TITLE)","current":"...","strengths":["..."],"improvements":["..."],"suggestions":["..."]},
    {"key":"description","title":"MÔ TẢ (DESCRIPTION)","current":"...","strengths":["..."],"improvements":["..."],"suggestions":["..."]},
    {"key":"thumbnail","title":"THUMBNAIL","current":"...","strengths":["..."],"improvements":["..."],"suggestions":["..."]},
    {"key":"tags","title":"TAGS & HASHTAGS","current":"...","strengths":["..."],"improvements":["..."],"suggestions":["..."]},
    {"key":"trend","title":"CHỦ ĐỀ & XU HƯỚNG","current":"...","strengths":["..."],"improvements":["..."],"suggestions":["..."]},
    {"key":"pinned","title":"BÌNH LUẬN GHIM","current":"...","strengths":["..."],"improvements":["..."],"suggestions":["..."]}
  ],
  "contentStyle": {
    "contentBullets":["ít nhất 8 ý chi tiết, cụ thể, dựa vào title/description/comment/tags/thống kê"],
    "styleBullets":["ít nhất 8 ý chi tiết, cụ thể, nêu rõ nhịp dựng, hook, CTA, âm thanh, hình ảnh, cách trình bày"],
    "strengths":["..."],
    "warnings":["..."]
  },
  "conclusion": {"headline":"...", "badges":["...", "..."]}
}

Quy tắc:
- Không bịa view/sub/like/comment; nếu nhắc số phải lấy đúng từ JSON dữ liệu.
- Phân tích thumbnail dựa theo tiêu đề, chủ đề và thumbnail URL, không khẳng định chi tiết hình ảnh nếu không chắc.
- Gợi ý phải cụ thể, có thể hành động, hợp với ngách và dữ liệu hiện có.
- Phần PHÂN TÍCH NỘI DUNG và PHÂN TÍCH PHONG CÁCH phải chi tiết, không viết chung chung; mỗi phần tối thiểu 8 ý.
- Với tags và bình luận, phải ưu tiên hiển thị/nhận xét từ dữ liệu YouTube API đã cung cấp.`;

      const response = await ai.models.generateContent({
        model: geminiModel,
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });
      const parsed = parseGeminiJsonObject(response.text || '');
      if (!parsed) return fallback;
      return {
        source: 'gemini_youtube_v3',
        overview: Array.isArray(parsed.overview) ? parsed.overview : fallback.overview,
        contentStyle: parsed.contentStyle || fallback.contentStyle,
        conclusion: parsed.conclusion || fallback.conclusion,
      };
    } catch (err) {
      console.warn('Gemini video audit failed, using fallback:', err);
      return fallback;
    }
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

        // BƯỚC 61: Ưu tiên hiển thị dữ liệu thật từ YouTube API V3 trước.
        // Gemini chỉ chạy phân tích bổ sung ở nền sau đó, không chặn kết quả YouTube.
        v._estimatedRpmRange = getVideoRpmRange(v.snippet?.categoryId, v._channelInfo?.snippet?.country);
        v._vph = calculateVideoVph(parseInt(v.statistics?.viewCount || '0') || 0, v.snippet?.publishedAt);
        v._aiVideoAudit = buildFallbackVideoAudit(v); // report nhanh dựa 100% dữ liệu YouTube API

        const youtubeFirstResult = { ...v };
        setVideoResult(youtubeFirstResult);
        setStatus('Đã hiển thị dữ liệu YouTube API V3 trước. Gemini AI đang phân tích bổ sung...');
        setIsAnalyzingVideo(false);

        // Lưu bản YouTube trước để người dùng thấy ngay và lịch sử có dữ liệu ngay.
        setVideoProjects(prev => {
          const next = [youtubeFirstResult, ...prev.filter(p => p.id !== youtubeFirstResult.id)].slice(0, 20);
          localStorage.setItem('youtube_video_projects', JSON.stringify(next));
          return next;
        });

        // Chạy Gemini sau khi dữ liệu YouTube đã lên giao diện.
        analyzeVideoWithGemini(youtubeFirstResult)
          .then((aiVideoAudit) => {
            const geminiEnhancedResult = { ...youtubeFirstResult, _aiVideoAudit: aiVideoAudit };
            setVideoResult((current: any) => current?.id === geminiEnhancedResult.id ? geminiEnhancedResult : current);
            setVideoProjects(prev => {
              const next = [geminiEnhancedResult, ...prev.filter(p => p.id !== geminiEnhancedResult.id)].slice(0, 20);
              localStorage.setItem('youtube_video_projects', JSON.stringify(next));
              return next;
            });
            setStatus('YouTube API đã hiển thị trước; Gemini AI đã phân tích bổ sung xong.');
          })
          .catch((err) => {
            console.warn('Gemini background video audit failed:', err);
            setStatus('Đã hiển thị dữ liệu YouTube API V3. Gemini AI chưa phân tích được, vẫn giữ kết quả YouTube.');
          });
      } else {
        setStatus('Không tìm thấy video. Vui lòng kiểm tra lại ID/URL.');
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



  const renderVideoAiAuditSection = () => {
    const audit = videoResult?._aiVideoAudit;
    if (!audit) return null;

    const overview = Array.isArray(audit.overview) ? audit.overview : [];
    const contentStyle = audit.contentStyle || {};
    const conclusion = audit.conclusion || {};
    const realTags = Array.isArray(videoResult?.snippet?.tags) ? videoResult.snippet.tags : [];
    const realComments = Array.isArray(videoResult?._comments) ? videoResult._comments : [];
    const cleanHtmlText = (txt: any) => String(txt || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
    const iconMap: Record<string, any> = {
      title: FileText,
      description: AlignLeft,
      thumbnail: Image,
      tags: Tag,
      trend: TrendingUp,
      pinned: Pin,
    };

    const buildAuditText = () => {
      const lines: string[] = [];
      lines.push('ĐÁNH GIÁ TỔNG QUAN - CẢI TIẾN VIDEO');
      lines.push(`Video: ${videoResult?.snippet?.title || ''}`);
      lines.push(`Link: https://www.youtube.com/watch?v=${videoResult?.id || ''}`);
      lines.push(`Nguồn: YouTube API V3 + Gemini AI`);
      lines.push('');
      overview.forEach((item: any) => {
        lines.push(`## ${item.title || item.key}`);
        lines.push(`Hiện tại: ${item.current || ''}`);
        if (item.key === 'tags' && realTags.length) lines.push(`Tags API: ${realTags.join(', ')}`);
        if (item.key === 'pinned' && realComments.length) {
          realComments.slice(0, 5).forEach((c: any, i: number) => lines.push(`Bình luận ${i + 1}: @${c.authorDisplayName || ''} - ${cleanHtmlText(c.textDisplay)}`));
        }
        lines.push(`Điểm mạnh: ${asArrayText(item.strengths).join(' | ')}`);
        lines.push(`Cần cải thiện: ${asArrayText(item.improvements).join(' | ')}`);
        lines.push(`Gợi ý: ${asArrayText(item.suggestions).join(' | ')}`);
        lines.push('');
      });
      lines.push('PHÂN TÍCH NỘI DUNG');
      asArrayText(contentStyle.contentBullets).forEach(x => lines.push(`- ${x}`));
      lines.push('');
      lines.push('PHÂN TÍCH PHONG CÁCH');
      asArrayText(contentStyle.styleBullets).forEach(x => lines.push(`- ${x}`));
      lines.push('');
      lines.push('ĐIỂM MẠNH NỔI BẬT');
      asArrayText(contentStyle.strengths).forEach(x => lines.push(`- ${x}`));
      lines.push('');
      lines.push('VẤN ĐỀ CẦN LƯU Ý');
      asArrayText(contentStyle.warnings).forEach(x => lines.push(`- ${x}`));
      lines.push('');
      lines.push('KẾT LUẬN');
      lines.push(conclusion.headline || '');
      return lines.join('\n');
    };

    const exportAuditText = () => downloadAsTxt(buildAuditText(), `Gemini_YouTube_Audit_${videoResult?.id || 'video'}`);
    const copyOverviewCard = (item: any) => {
      const lines = [
        item.title || 'PHÂN TÍCH',
        `Hiện tại: ${item.current || ''}`,
        item.key === 'tags' && realTags.length ? `Tags API: ${realTags.join(', ')}` : '',
        item.key === 'pinned' && realComments.length ? `Bình luận API: ${realComments.slice(0, 3).map((c: any) => '@' + (c.authorDisplayName || '') + ': ' + cleanHtmlText(c.textDisplay)).join(' | ')}` : '',
        `Điểm mạnh: ${asArrayText(item.strengths).join(' | ')}`,
        `Cần cải thiện: ${asArrayText(item.improvements).join(' | ')}`,
        `Gợi ý: ${asArrayText(item.suggestions).join(' | ')}`
      ].filter(Boolean).join('\n');
      copyToClipboard(lines);
    };
    const exportOverviewCard = (item: any) => {
      const title = String(item.title || item.key || 'phan_tich').replace(/[^a-zA-Z0-9À-ỹ_-]+/g, '_');
      const lines = [
        item.title || 'PHÂN TÍCH',
        `Hiện tại: ${item.current || ''}`,
        item.key === 'tags' && realTags.length ? `Tags API: ${realTags.join(', ')}` : '',
        item.key === 'pinned' && realComments.length ? `Bình luận API:\n${realComments.slice(0, 10).map((c: any, i: number) => `${i + 1}. @${c.authorDisplayName || ''}: ${cleanHtmlText(c.textDisplay)}`).join('\n')}` : '',
        `Điểm mạnh: ${asArrayText(item.strengths).join(' | ')}`,
        `Cần cải thiện: ${asArrayText(item.improvements).join(' | ')}`,
        `Gợi ý: ${asArrayText(item.suggestions).join(' | ')}`
      ].filter(Boolean).join('\n');
      downloadAsTxt(lines, `${title}_${videoResult?.id || 'video'}`);
    };
    const contentText = asArrayText(contentStyle.contentBullets, ['Chưa có dữ liệu phân tích nội dung.']).map(x => `- ${x}`).join('\n');
    const styleText = asArrayText(contentStyle.styleBullets, ['Chưa có dữ liệu phân tích phong cách.']).map(x => `- ${x}`).join('\n');

    return (
      <div className="space-y-8 text-left video-ai-audit-section">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl shrink-0">
              <Star size={18} />
            </div>
            <h2 className="text-xl md:text-2xl font-black text-gray-900 uppercase leading-tight">ĐÁNH GIÁ TỔNG QUAN - CẢI TIẾN VIDEO</h2>
          </div>
          <button onClick={exportAuditText} className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-[12px] font-black text-gray-700 hover:bg-gray-50 flex items-center gap-2 shadow-sm shrink-0">
            <Download size={14} /> TẢI TXT
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {overview.map((item: any, idx: number) => {
            const IconComp = iconMap[item.key] || FileText;
            const isTags = item.key === 'tags';
            const isPinned = item.key === 'pinned';
            return (
              <div key={`${item.key || idx}`} className="bg-white rounded-2xl border border-blue-100 shadow-sm p-6 text-left relative overflow-hidden border-l-4 border-l-sky-500">
                <div className="absolute right-4 top-4 text-gray-100"><IconComp size={72} /></div>
                <div className="relative z-10 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <IconComp size={16} />
                      </div>
                      <h3 className="text-[13px] font-black uppercase tracking-widest text-gray-900 leading-tight">{item.title || 'PHÂN TÍCH'}</h3>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => copyOverviewCard(item)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50" title="Copy mục này"><Copy size={14} /></button>
                      <button onClick={() => exportOverviewCard(item)} className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50" title="Tải mục này"><Download size={14} /></button>
                    </div>
                  </div>

                  <p className="text-[13px] italic text-gray-700 leading-relaxed min-h-[48px] border-l border-blue-100 pl-3">{item.current}</p>

                  {isTags && (
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                      <div className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-2">DỮ LIỆU THỰC TỪ API ({realTags.length} TAGS):</div>
                      {realTags.length > 0 ? (
                        <div className="max-h-[118px] overflow-y-auto custom-scrollbar flex flex-wrap gap-2 pr-1">
                          {realTags.slice(0, 24).map((tag: string, i: number) => (
                            <span key={i} className="px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-[11px] font-bold text-gray-600">{tag}</span>
                          ))}
                        </div>
                      ) : <div className="text-[12px] text-gray-400 italic">YouTube API chưa trả về tags công khai.</div>}
                    </div>
                  )}

                  {isPinned && (
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                      <div className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-2">DỮ LIỆU BÌNH LUẬN TỪ API:</div>
                      {realComments.length > 0 ? (
                        <div className="space-y-2 max-h-[150px] overflow-y-auto custom-scrollbar pr-1">
                          {realComments.slice(0, 3).map((c: any, i: number) => (
                            <div key={i} className="bg-white border border-gray-100 rounded-lg p-2 text-[11px] leading-snug">
                              <div className="font-black text-gray-900 mb-1">@{c.authorDisplayName || 'viewer'} <span className="text-gray-400 font-bold">• {formatVNNumber(c.likeCount || 0)} like</span></div>
                              <div className="text-gray-600 whitespace-pre-wrap line-clamp-3">{cleanHtmlText(c.textDisplay)}</div>
                            </div>
                          ))}
                        </div>
                      ) : <div className="text-[12px] text-gray-400 italic">Chưa có bình luận công khai hoặc video tắt bình luận.</div>}
                    </div>
                  )}

                  <div>
                    <div className="text-[10px] font-black uppercase text-green-600 tracking-widest mb-2">ĐIỂM MẠNH:</div>
                    <ul className="space-y-1.5">
                      {asArrayText(item.strengths).slice(0, 4).map((x, i) => <li key={i} className="text-[12px] text-gray-700 leading-snug">✓ {x}</li>)}
                    </ul>
                  </div>

                  <div>
                    <div className="text-[10px] font-black uppercase text-red-500 tracking-widest mb-2">CẦN CẢI THIỆN:</div>
                    <ul className="space-y-1.5">
                      {asArrayText(item.improvements).slice(0, 4).map((x, i) => <li key={i} className="text-[12px] text-gray-700 leading-snug">• {x}</li>)}
                    </ul>
                  </div>

                  <div>
                    <div className="text-[10px] font-black uppercase text-blue-600 tracking-widest mb-2">GỢI Ý:</div>
                    <div className="space-y-2">
                      {asArrayText(item.suggestions).slice(0, 3).map((x, i) => (
                        <div key={i} className="bg-gray-50 border border-gray-100 rounded-lg p-2 text-[12px] font-bold italic text-gray-800 leading-snug">“{x}”</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 mt-8">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl shrink-0"><AlignLeft size={18} /></div>
            <h2 className="text-xl md:text-2xl font-black text-gray-900 uppercase leading-tight">PHÂN TÍCH NỘI DUNG & PHONG CÁCH VIDEO</h2>
          </div>
          <button onClick={exportAuditText} className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-[12px] font-black text-gray-700 hover:bg-gray-50 flex items-center gap-2 shadow-sm shrink-0">
            <Download size={14} /> TẢI TXT
          </button>
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden text-left">
          <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between gap-3 mb-5">
                <h3 className="text-[13px] font-black uppercase tracking-widest text-gray-900 flex items-center gap-2"><Bot size={16} className="text-indigo-500" /> PHÂN TÍCH NỘI DUNG</h3>
                <div className="flex items-center gap-1">
                  <button onClick={() => copyToClipboard(contentText)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Copy phân tích nội dung"><Copy size={16} /></button>
                  <button onClick={() => downloadAsTxt(contentText, `Phan_tich_noi_dung_${videoResult?.id || 'video'}`)} className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Tải phân tích nội dung"><Download size={16} /></button>
                </div>
              </div>
              <ul className="space-y-4">
                {asArrayText(contentStyle.contentBullets, ['Chưa có dữ liệu phân tích nội dung.']).map((x, i) => <li key={i} className="flex gap-3 text-[14px] text-gray-700 leading-relaxed"><span className="text-blue-500 font-black mt-0.5">•</span><span>{x}</span></li>)}
              </ul>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between gap-3 mb-5">
                <h3 className="text-[13px] font-black uppercase tracking-widest text-gray-900 flex items-center gap-2"><Star size={16} className="text-purple-500" /> PHÂN TÍCH PHONG CÁCH</h3>
                <div className="flex items-center gap-1">
                  <button onClick={() => copyToClipboard(styleText)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Copy phân tích phong cách"><Copy size={16} /></button>
                  <button onClick={() => downloadAsTxt(styleText, `Phan_tich_phong_cach_${videoResult?.id || 'video'}`)} className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Tải phân tích phong cách"><Download size={16} /></button>
                </div>
              </div>
              <ul className="space-y-4">
                {asArrayText(contentStyle.styleBullets, ['Chưa có dữ liệu phân tích phong cách.']).map((x, i) => <li key={i} className="flex gap-3 text-[14px] text-gray-700 leading-relaxed"><span className="text-purple-500 font-black mt-0.5">•</span><span>{x}</span></li>)}
              </ul>
            </div>
          </div>
          <div className="px-6 pb-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <div className="text-[11px] font-black uppercase text-green-600 tracking-widest mb-3">ĐIỂM MẠNH NỔI BẬT</div>
              <div className="space-y-2">{asArrayText(contentStyle.strengths).map((x, i) => <div key={i} className="bg-green-50 border border-green-100 text-green-800 px-4 py-2 rounded-xl text-[12px] font-bold">✓ {x}</div>)}</div>
            </div>
            <div>
              <div className="text-[11px] font-black uppercase text-orange-500 tracking-widest mb-3">VẤN ĐỀ CẦN LƯU Ý</div>
              <div className="space-y-2">{asArrayText(contentStyle.warnings).map((x, i) => <div key={i} className="bg-orange-50 border border-orange-100 text-orange-800 px-4 py-2 rounded-xl text-[12px] font-bold">⚠ {x}</div>)}</div>
            </div>
          </div>
        </div>

        <div className="bg-[#0f172a] text-white rounded-3xl p-7 shadow-xl relative overflow-hidden text-left">
          <div className="absolute right-6 top-6 opacity-10"><Star size={90} /></div>
          <div className="relative z-10">
            <div className="text-[11px] font-black uppercase tracking-[0.25em] text-blue-200 mb-3">KẾT LUẬN CUỐI CÙNG</div>
            <h2 className="text-2xl font-black leading-tight max-w-5xl">{conclusion.headline || 'Gemini đã phân tích dựa trên dữ liệu YouTube API V3.'}</h2>
            <div className="flex flex-wrap gap-2 mt-5">
              {asArrayText(conclusion.badges).map((badge, i) => <span key={i} className="px-3 py-1 bg-orange-500/20 text-orange-200 border border-orange-400/20 rounded-full text-[11px] font-black">{badge}</span>)}
            </div>
          </div>
        </div>
      </div>
    );
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
              <div className="vtw-user-header-row flex items-center gap-2 min-w-0 shrink-0">
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
                  <div className="leading-tight text-left">
                    <div className="vtw-user-email text-[10px] font-black text-gray-800 whitespace-nowrap">{user.email || user.displayName || 'Tài khoản'}</div>
                    <div className={`text-[8px] font-black uppercase ${isPremiumAccount ? 'text-blue-600' : subscriptionInfo?.active ? 'text-amber-600' : 'text-red-600'}`}>
                      {subscriptionLoading ? 'Kiểm tra...' : isPremiumAccount ? 'PRO' : subscriptionInfo?.active ? 'Trial' : 'Hết hạn'}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await logoutUser();
                    } catch (err) {
                      console.error('Lỗi đăng xuất:', err);
                    }
                  }}
                  className="vtw-header-logout px-3 py-2 rounded-xl bg-white text-red-600 border border-red-200 hover:bg-red-50 shadow-sm font-black text-[10px] uppercase whitespace-nowrap transition-all active:scale-95"
                >
                  Đăng xuất
                </button>
              </div>
            ) : (
              <button
                onClick={async () => {
                  try {
                    await loginWithGoogle();
                  } catch (e: any) {
                    setStatus('Lỗi đăng nhập: ' + e.message);
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
                onClick={() => setStatus('Vui lòng đăng nhập Google trước khi nâng cấp gói!')}
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
                  <Search size={16} /> <span className="vtw-tab-full">TÌM KÊNH & ĐÁNH GIÁ TỪ KHÓA</span><span className="vtw-tab-short">Tìm kênh</span>
                </div>
                <div className="px-8 py-2.5 rounded-t-xl bg-[#bdc3c7] text-[#555] border-t border-x border-[#95a5a6] font-bold flex items-center gap-2">
                  <BarChart2 size={16} /> <span className="vtw-tab-full">PHÂN TÍCH ĐỐI THỦ (SPY)</span><span className="vtw-tab-short">Spy</span>
                </div>
                <div className="px-8 py-2.5 rounded-t-xl bg-[#bdc3c7] text-[#555] border-t border-x border-[#95a5a6] font-bold flex items-center gap-2">
                  <Video size={16} /> <span className="vtw-tab-full">KIỂM TRA LINK VIDEO</span><span className="vtw-tab-short">Video</span>
                </div>
                <div className="px-8 py-2.5 rounded-t-xl bg-[#bdc3c7] text-[#555] border-t border-x border-[#95a5a6] font-bold flex items-center gap-2">
                  <UserRoundSearch size={16} /> <span className="vtw-tab-full">THEO DÕI ĐỐI THỦ (TRACKING)</span><span className="vtw-tab-short">Tracking</span>
                </div>
                <div className="px-8 py-2.5 rounded-t-xl bg-[#bdc3c7] text-[#555] border-t border-x border-[#95a5a6] font-bold flex items-center gap-2">
                  <LayoutGrid size={16} /> <span className="vtw-tab-full">🚀 TÌM NGÁCH YOUTUBE</span><span className="vtw-tab-short">Ngách</span>
                </div>
              </div>

              <div className="vtw-main-panel bg-[#d9d9d9] border border-[#999] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.1)] rounded-sm relative -mt-[1px]">
                <div className="vtw-filter-grid vtw-main-search-card grid grid-cols-12 gap-4 bg-[#f1f1f1] p-4 border border-[#bbb] rounded shadow-sm">
                  <div className="vtw-filter-fields col-span-12 lg:col-span-9 grid grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2"><div className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Từ khóa:</div><div className="w-2/3 border border-[#999] bg-white h-7 px-2 text-gray-400 flex items-center">Ví dụ: công cụ AI, ChatGPT, tạo video bằng AI</div></div>
                      <div className="flex items-center gap-2"><div className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Khu vực:</div><div className="w-2/3 border border-[#999] bg-white h-7 px-2 flex items-center justify-between">Việt Nam <span>▼</span></div></div>
                      <div className="flex items-center gap-2"><div className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Đăng trong:</div><div className="w-2/3 border border-[#999] bg-white h-7 px-2 flex items-center justify-between">Tuần này <span>▼</span></div></div>
                    </div>
                    <div className="space-y-2 border-l border-[#ccc] pl-4">
                      <div className="flex items-center gap-2"><div className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Số lượng quét:</div><div className="w-2/3 border border-[#999] bg-white h-7 px-2 flex items-center">30</div></div>
                      <div className="flex items-center gap-2"><div className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Đăng ký tối thiểu:</div><div className="w-2/3 border border-[#999] bg-white h-7 px-2 flex items-center">0</div></div>
                      <div className="flex items-center gap-2"><div className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Đăng ký tối đa:</div><div className="w-2/3 border border-[#999] bg-white h-7 px-2 flex items-center">100000</div></div>
                    </div>
                    <div className="space-y-2 border-l border-[#ccc] pl-4">
                      <div className="flex items-center gap-2"><div className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Video tối thiểu:</div><div className="w-2/3 border border-[#999] bg-white h-7 px-2 flex items-center">1</div></div>
                      <div className="flex items-center gap-2"><div className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Video tối đa:</div><div className="w-2/3 border border-[#999] bg-white h-7 px-2 flex items-center">0</div></div>
                      <div className="flex items-center gap-2"><div className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Lượt xem tối thiểu:</div><div className="w-2/3 border border-[#999] bg-white h-7 px-2 flex items-center">10000</div></div>
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
                      setStatus('Lỗi đăng nhập: ' + e.message);
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
            <Search size={16} /> <span className="vtw-tab-full">TÌM KÊNH & ĐÁNH GIÁ TỪ KHÓA</span><span className="vtw-tab-short">Tìm kênh</span>
          </button>
          <button 
            onClick={() => setActiveTab(2)}
            className={`vtw-tab-btn px-8 py-2.5 rounded-t-xl flex items-center gap-2 transition-all font-bold border-t border-x ${activeTab === 2 ? 'bg-[#3498db] text-white border-[#2980b9] shadow-[0_-2px_5px_rgba(0,0,0,0.1)]' : 'bg-[#bdc3c7] text-[#555] border-[#95a5a6] hover:bg-[#b0b7bb]'}`}
          >
            <BarChart2 size={16} /> <span className="vtw-tab-full">PHÂN TÍCH ĐỐI THỦ (SPY)</span><span className="vtw-tab-short">Spy</span>
          </button>
          <button 
            onClick={() => setActiveTab(4)}
            className={`vtw-tab-btn px-8 py-2.5 rounded-t-xl flex items-center gap-2 transition-all font-bold border-t border-x ${activeTab === 4 ? 'bg-[#3498db] text-white border-[#2980b9] shadow-[0_-2px_5px_rgba(0,0,0,0.1)]' : 'bg-[#bdc3c7] text-[#555] border-[#95a5a6] hover:bg-[#b0b7bb]'}`}
          >
            <Video size={16} /> <span className="vtw-tab-full">KIỂM TRA LINK VIDEO</span><span className="vtw-tab-short">Video</span>
          </button>
          <button 
            onClick={() => setActiveTab(3)}
            className={`vtw-tab-btn px-8 py-2.5 rounded-t-xl flex items-center gap-2 transition-all font-bold border-t border-x ${activeTab === 3 ? 'bg-[#3498db] text-white border-[#2980b9] shadow-[0_-2px_5px_rgba(0,0,0,0.1)]' : 'bg-[#bdc3c7] text-[#555] border-[#95a5a6] hover:bg-[#b0b7bb]'}`}
          >
            <UserRoundSearch size={16} /> <span className="vtw-tab-full">THEO DÕI ĐỐI THỦ (TRACKING)</span><span className="vtw-tab-short">Tracking</span>
          </button>
          <button 
            onClick={() => { setActiveTab(5); setNicheActiveSubTab('videos'); }}
            className={`vtw-tab-btn px-8 py-2.5 rounded-t-xl flex items-center gap-2 transition-all font-bold border-t border-x ${activeTab === 5 ? 'bg-[#3498db] text-white border-[#2980b9] shadow-[0_-2px_5px_rgba(0,0,0,0.1)]' : 'bg-[#bdc3c7] text-[#555] border-[#95a5a6] hover:bg-[#b0b7bb]'}`}
          >
            <LayoutGrid size={16} /> <span className="vtw-tab-full">🚀 TÌM NGÁCH YOUTUBE</span><span className="vtw-tab-short">Ngách</span>
          </button>
        </div>

        <div className="vtw-main-panel bg-[#d9d9d9] border border-[#999] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.1)] rounded-sm relative -mt-[1px]">
          {activeTab === 1 ? (
            <div className="space-y-4">
              <div className="vtw-filter-grid vtw-main-search-card grid grid-cols-12 gap-4 bg-[#f1f1f1] p-4 border border-[#bbb] rounded shadow-sm">
                <div className="vtw-filter-fields col-span-12 lg:col-span-9 grid grid-cols-3 gap-6">
                  {/* Group 1 */}
                  <div className="space-y-2">
                    <div className="vtw-field-row vtw-row-keyword flex items-center gap-2">
                      <label className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Từ khóa:</label>
                      <input 
                        type="text" 
                        className="vtw-main-input w-2/3 border border-[#999] bg-white h-7 px-2 outline-none focus:border-blue-500 shadow-sm"
                        value={config.keyword}
                        onChange={(e) => setConfig({ ...config, keyword: e.target.value })}
                        placeholder="Ví dụ: công cụ AI, ChatGPT, tạo video bằng AI"
                      />
                    </div>
                    <div className="vtw-field-row vtw-row-region flex items-center gap-2 relative">
                      <label className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Khu vực:</label>
                      <div className="vtw-region-wrap w-2/3 relative" ref={regionRef}>
                        <button 
                          onClick={() => setShowRegionList(!showRegionList)}
                          className="vtw-main-input vtw-region-button w-full border border-[#999] bg-white h-7 px-2 text-left truncate flex justify-between items-center text-[10px]"
                        >
                          {config.regions.includes('ALL') 
                            ? 'Tất cả khu vực' 
                            : config.regions.map(r => REGIONS.find(reg => reg.code === r)?.name || r).join(', ') || 'Chọn khu vực'}
                          <span className="text-[8px]">▼</span>
                        </button>
                        {showRegionList && (
                          <div className="vtw-region-dropdown absolute top-8 left-0 right-0 z-[100] bg-white border border-[#999] shadow-xl max-h-48 overflow-y-auto">
                            <div 
                              onClick={() => { toggleRegion('ALL'); setShowRegionList(false); }}
                              className={`vtw-region-option px-2 py-1 cursor-pointer hover:bg-blue-50 text-[10px] flex items-center gap-2 ${config.regions.includes('ALL') ? 'bg-blue-100 font-bold' : ''}`}
                            >
                              <input type="checkbox" className="vtw-region-check" checked={config.regions.includes('ALL')} readOnly /> Tất cả khu vực (Toàn cầu)
                            </div>
                            <div className="border-t border-[#eee]"></div>
                            {REGIONS.filter(r => r.code !== '').map(r => (
                              <div 
                                key={r.code}
                                onClick={() => toggleRegion(r.code)}
                                className={`vtw-region-option px-2 py-1 cursor-pointer hover:bg-blue-50 text-[10px] flex items-center gap-2 ${config.regions.includes(r.code) ? 'bg-blue-100 font-bold' : ''}`}
                              >
                                <input type="checkbox" className="vtw-region-check" checked={config.regions.includes(r.code)} readOnly /> {r.name} ({r.code})
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="vtw-field-row vtw-row-published flex items-center gap-2">
                      <label className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Đăng trong:</label>
                      <select 
                        className="vtw-main-input w-2/3 border border-[#999] bg-white h-7 px-1 outline-none font-medium"
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
                    <div className="vtw-field-row vtw-row-maxvideos flex items-center gap-2">
                      <label className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Số lượng quét:</label>
                      <input 
                        type="number" 
                        className="vtw-main-input w-2/3 border border-[#999] bg-white h-7 px-2"
                        value={config.maxVideos}
                        onChange={(e) => setConfig({ ...config, maxVideos: parseInt(e.target.value) })}
                      />
                    </div>
                    <div className="vtw-field-row vtw-row-minsub flex items-center gap-2">
                      <label className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Đăng ký tối thiểu:</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        className="vtw-main-input w-2/3 border border-[#999] bg-white h-7 px-2"
                        value={config.minSub}
                        onChange={(e) => setConfig({ ...config, minSub: parseRangeNumber(e.target.value, 0) })}
                      />
                    </div>
                    <div className="vtw-field-row vtw-row-maxsub flex items-center gap-2">
                      <label className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Đăng ký tối đa:</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        className="vtw-main-input w-2/3 border border-[#999] bg-white h-7 px-2"
                        value={config.maxSub}
                        onChange={(e) => setConfig({ ...config, maxSub: parseRangeNumber(e.target.value, 10000000) })}
                      />
                    </div>
                  </div>

                  {/* Group 3 */}
                  <div className="space-y-2 border-l border-[#ccc] pl-4">
                    <div className="vtw-field-row vtw-row-minvideo flex items-center gap-2">
                      <label className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Video tối thiểu:</label>
                      <input 
                        type="number" 
                        className="vtw-main-input w-2/3 border border-[#999] bg-white h-7 px-2"
                        value={config.minVideo}
                        onChange={(e) => setConfig({ ...config, minVideo: parseInt(e.target.value) })}
                      />
                    </div>
                    <div className="vtw-field-row vtw-row-maxvideo flex items-center gap-2">
                      <label className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Video tối đa:</label>
                      <input 
                        type="number" 
                        className="vtw-main-input w-2/3 border border-[#999] bg-white h-7 px-2"
                        value={config.maxVideo}
                        onChange={(e) => setConfig({ ...config, maxVideo: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="vtw-field-row vtw-row-minviews flex items-center gap-2">
                      <label className="w-1/3 text-right text-[11px] font-bold text-[#2c3e50]">Lượt xem tối thiểu:</label>
                      <input 
                        type="number" 
                        className="vtw-main-input w-2/3 border border-[#999] bg-white h-7 px-2"
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
              <div className="vtw-bottom-actions vtw-auto-hunt-box flex justify-between items-center bg-[#f9f9f9] p-3 border border-[#ccc] rounded shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="vtw-auto-hunt-wrap flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="autoHunt" 
                      className="w-5 h-5 cursor-pointer accent-[#e67e22]" 
                      checked={config.autoNiche}
                      onChange={(e) => setConfig({ ...config, autoNiche: e.target.checked })}
                    />
                    <label htmlFor="autoHunt" className="vtw-auto-hunt-text font-bold text-[12px] text-[#d35400] cursor-pointer flex flex-col">
                      <span>Tự động chuyển từ khóa cho đến khi đủ 10 Kênh</span>
                    </label>
                  </div>
                  <div className="vtw-deep-drill-toggle flex items-center gap-2 bg-white border border-orange-200 rounded-lg px-3 py-2 shadow-sm">
                    <input
                      type="checkbox"
                      id="deepDrillSmallTrend"
                      className="w-5 h-5 cursor-pointer accent-[#0ea5e9]"
                      checked={!!config.deepDrillSmallTrend}
                      onChange={(e) => setConfig({ ...config, deepDrillSmallTrend: e.target.checked })}
                    />
                    <label htmlFor="deepDrillSmallTrend" className="cursor-pointer flex flex-col leading-tight">
                      <span className="font-black text-[12px] text-[#0f766e]">Săn kênh nhỏ / Mới Trend</span>
                      <span className="text-[10px] text-slate-500">Deep Drill: dưới 50.000 sub, 30 ngày</span>
                    </label>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {!isHunting ? (
                    <button 
                      onClick={startHunter}
                      className="vtw-start-button min-w-[200px] bg-[#e67e22] text-white py-2.5 px-6 rounded font-bold text-[15px] flex items-center justify-center gap-2 hover:bg-[#d35400] active:scale-95 shadow-[0_4px_0_#a04a00] transition-all"
                    >
                      <Play size={20} fill="white" /> BẮT ĐẦU SĂN KÊNH
                    </button>
                  ) : (
                    <button 
                      onClick={stopHunter}
                      className="vtw-start-button min-w-[200px] bg-red-600 text-white py-2.5 px-6 rounded font-bold text-[15px] flex items-center justify-center gap-2 hover:bg-red-700 active:scale-95 shadow-[0_4px_0_#900] transition-all animate-pulse"
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
                    <table className="vtw-results-table w-full text-left border-collapse min-w-[1580px]">
                      <thead className="bg-[#ecf0f1] border-b border-[#bdc3c7] sticky top-0 z-20 shadow-sm text-black">
                        <tr>
                          <th className="px-2 py-2 font-bold text-[11px] border-r border-[#ddd] w-10 text-center">STT</th>
                          <th className="px-2 py-2 font-bold text-[11px] border-r border-[#ddd] w-12 text-center">ICON</th>
                          <th className="px-2 py-2 font-bold text-[11px] border-r border-[#ddd] min-w-[180px]">TÊN KÊNH</th>
                          <th className="px-2 py-2 font-bold text-[11px] border-r border-[#ddd] min-w-[120px]">MÃ KÊNH</th>
                          <th className="px-2 py-2 font-bold text-[11px] border-r border-[#ddd] min-w-[150px] text-gray-900">TỪ KHÓA/NGÁCH</th>
                          <th className="px-2 py-2 font-bold text-[11px] border-r border-[#ddd] min-w-[135px] text-gray-900">CHỦ ĐỀ</th>
                          <th className="px-2 py-2 font-bold text-[11px] border-r border-[#ddd] min-w-[120px] text-gray-900">THU NHẬP ($)</th>
                          <th className="px-2 py-2 font-bold text-[11px] border-r border-[#ddd] min-w-[110px]">URL</th>
                          <th className="px-2 py-2 font-bold text-[11px] border-r border-[#ddd] text-center min-w-[88px]">QUỐC GIA</th>
                          <th className="px-2 py-2 font-bold text-[11px] border-r border-[#ddd] text-center w-28">NGÀY TẠO</th>
                          <th className="px-2 py-2 font-bold text-[11px] border-r border-[#ddd] text-right w-24">TUỔI KÊNH (NGÀY)</th>
                          <th className="px-2 py-2 font-bold text-[11px] border-r border-[#ddd] text-right w-24">SUB</th>
                          <th className="px-2 py-2 font-bold text-[11px] border-r border-[#ddd] text-right w-28">VIEWS</th>
                          <th className="px-2 py-2 font-bold text-[11px] border-r border-[#ddd] text-right w-20">VIDEOS</th>
                          <th className="px-2 py-2 font-bold text-[11px] text-center w-24 text-orange-600">★ ĐIỂM NGÁCH</th>
                          <th className="px-2 py-2 font-bold text-[11px] text-center min-w-[150px]">THAO TÁC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.length === 0 && (
                          <tr><td colSpan={16} className="text-center py-20 text-gray-400 italic">Chưa có kết quả nào được tìm thấy. Bấm "Bắt đầu săn kênh" để bắt đầu...</td></tr>
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
                            <td className="px-2 py-1 font-bold whitespace-nowrap overflow-hidden text-ellipsis text-black">
                              <a href={r.url} target="_blank" rel="noreferrer" className="hover:underline text-black" title={`Mở kênh ${r.name}`}>
                                {r.name}
                              </a>
                            </td>
                            <td className="px-2 py-1 text-[10px] font-mono text-[#7f8c8d] break-all">{r.id}</td>
                            <td className="px-2 py-1 text-[10px] font-bold text-gray-800 max-w-[160px] whitespace-normal">{getChannelTrendKeyword(r)}</td>
                            <td className="px-2 py-1 text-[10px] font-bold text-gray-800 max-w-[145px] whitespace-normal">{getTopicFromKeyword(getChannelTrendKeyword(r))}</td>
                            <td className="px-2 py-1 text-[10px] font-black text-gray-800 whitespace-nowrap" title="Ước tính từ views thật của YouTube Data API v3 × RPM tham khảo, không phải doanh thu thật YouTube trả.">{estimateIncomeFromApiViews(r)}</td>
                            <td className="px-2 py-1 text-[9px] text-blue-600 underline hover:text-blue-800 max-w-[110px]"><a href={r.url} target="_blank" rel="noreferrer" title={r.url}>{formatChannelUrlShort(r.url, r.id)}</a></td>
                            <td className="px-2 py-1 text-center font-bold text-gray-700 whitespace-normal">{getCountryFullName(r.country)}</td>
                            <td className="px-2 py-1 text-center text-gray-500 whitespace-nowrap">{r.publishedAt}</td>
                            <td className="px-2 py-1 text-right text-green-700 font-medium">{formatVNNumber(r.age)}</td>
                            <td className="px-2 py-1 text-right text-black font-bold">{formatVNNumber(r.subs)}</td>
                            <td className="px-2 py-1 text-right text-blue-800 font-bold">{formatVNNumber(r.views)}</td>
                            <td className="px-2 py-1 text-right text-gray-800">{formatVNNumber(r.videos)}</td>
                            <td className="px-2 py-1 text-center font-black text-[#e67e22] text-[13px] bg-orange-50">{r.score}</td>
                            <td className="px-2 py-1 text-center">
                              <div className="vtw-channel-actions flex items-center justify-center gap-1">
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
                                  className="vtw-delete-action text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-all active:scale-95 font-black uppercase"
                                  title="Xóa"
                                >
                                  <Trash2 size={12} /> <span>XÓA</span>
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
                        className="vtw-spy-mobile-action-btn vtw-mobile-action-btn mt-3 w-full bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded-lg text-[10px] font-black shadow-sm transition-all active:scale-95 uppercase"
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
                            className="vtw-spy-report-action-btn vtw-mobile-action-btn bg-slate-700 hover:bg-slate-800 text-white px-2 py-1 rounded text-[9px] font-black uppercase"
                            title="Mở thao tác kênh"
                          >
                            THAO TÁC
                          </button>
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
                  <div className="vtw-tracking-search-box ml-2 flex items-center bg-white border-2 border-blue-200 rounded-xl h-10 px-3 min-w-[250px] shadow-sm">
                    <input 
                      type="text"
                      placeholder="Tìm nhanh tên kênh..."
                      className="bg-transparent text-[12px] font-bold outline-none w-full text-gray-700 placeholder:text-slate-400"
                      value={trackingSearchTerm}
                      onChange={(e) => setTrackingSearchTerm(e.target.value)}
                    />
                    {trackingSearchTerm && (
                      <button 
                        onClick={() => setTrackingSearchTerm('')}
                        className="text-gray-400 hover:text-gray-600 shrink-0"
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
                      <th className="px-2 py-1 font-normal text-[11px] border-r border-[#ccc]">Ngách/Kênh</th>
                      <th className="px-2 py-1 font-normal text-[11px] border-r border-[#ccc]">Chủ đề</th>
                      <th className="px-2 py-1 font-normal text-[11px] border-r border-[#ccc]">Thu nhập ($)</th>
                      <th className="px-2 py-1 font-normal text-[11px] border-r border-[#ccc]">Lịch Sử Sub (Cũ → Mới)</th>
                      <th className="px-2 py-1 font-normal text-[11px] border-r border-[#ccc]">Tăng Sub/Ngày</th>
                      <th className="px-2 py-1 font-normal text-[11px] border-r border-[#ccc]">Lịch Sử View (Cũ → Mới)</th>
                      <th className="px-2 py-1 font-normal text-[11px] border-r border-[#ccc]">Tăng View/Ngày</th>
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
                        <td className="px-2 py-1 text-left text-blue-700 font-bold bg-blue-50/40">
                          {c.keywordTitle || getTrackingKeywordFromApiItem({ snippet: { title: c.name } }, c.name)}
                        </td>
                        <td className="px-2 py-1 text-left font-bold text-purple-700 bg-purple-50/30">
                          {c.topic || getTopicFromKeyword(c.keywordTitle || c.name)}
                        </td>
                        <td className="px-2 py-1 text-left font-bold text-emerald-700 bg-emerald-50/40 whitespace-nowrap">
                          {c.income || estimateIncomeFromTracking(c.history[c.history.length - 1]?.views || 0, c.country)}
                        </td>
                        <td className="px-2 py-1 text-[10px] bg-gray-50/50 text-left">
                          <div className="flex flex-wrap gap-1 items-center justify-start">
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
                        <td className="px-2 py-1 text-left font-bold text-green-600 bg-green-50/30">{getGrowth(c.history, 'subs')}</td>
                        <td className="px-2 py-1 text-[10px] bg-gray-50/50 text-left">
                          <div className="flex flex-wrap gap-1 items-center justify-start">
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
                        <td className="px-2 py-1 text-left font-bold text-green-600 bg-green-50/30">{getGrowth(c.history, 'views')}</td>
                        <td className="px-2 py-1 text-left">
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
                        onClick={() => { setShowNicheModal(true); loadTrendingNicheCache(trendingRegion || config.region || 'VN'); }}
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

                  <div className="space-y-2">
                    <label className="text-[9px] uppercase font-bold text-[#95a5a6] flex justify-between">
                      Số lượng phân tích <span>{nicheVideoCount} items</span>
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      step={10}
                      value={nicheVideoCount}
                      onChange={(e) => setNicheVideoCount(parseInt(e.target.value, 10))}
                      className="vtw-niche-slider w-full accent-blue-500"
                    />
                    <div className="vtw-niche-range-scale vtw-count-scale text-[8px] text-[#95a5a6] font-bold">
                      <span style={{ left: '0%' }}>10</span>
                      <span style={{ left: '22.22%' }}>30</span>
                      <span style={{ left: '44.44%' }}>50</span>
                      <span style={{ left: '100%' }}>100</span>
                    </div>
                  </div>

                  <div className="space-y-2 mt-2">
                    <label className="text-[10px] uppercase font-black text-gray-400 flex justify-between items-center">
                      Phạm vi Sub <span>0 → {formatVNNumber(nicheMaxSub)}</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={10000000}
                      step={1000}
                      value={nicheMaxSub}
                      onChange={(e) => setNicheMaxSub(parseInt(e.target.value, 10) || 0)}
                      className="vtw-niche-slider w-full accent-blue-500"
                    />
                    <div className="vtw-niche-range-scale vtw-sub-scale text-[8px] text-[#95a5a6] font-bold">
                      <span style={{ left: '0%' }}>0</span>
                      <span style={{ left: '10%' }}>1M</span>
                      <span style={{ left: '50%' }}>5M</span>
                      <span style={{ left: '100%' }}>10M</span>
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
                      { id: 'videos', label: 'Top Videos Trending', icon: BarChart3 },
                      { id: 'channels', label: 'Kênh/Ngách Trending', icon: Users },
                      { id: 'summary', label: 'Dashboard Tổng quan', icon: Home },
                      { id: 'shorts', label: 'Khám phá Shorts', icon: Smartphone },
                      { id: 'keywords', label: 'Bản đồ Từ khóa', icon: LayoutGrid },
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
                                        <span className="text-[11px] font-black text-emerald-600">+{formatVNNumber(Math.round(kw.vph))} VPH</span>
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
                               <div key={i} className="vtw-niche-top-video flex gap-4 p-2 rounded-xl hover:bg-gray-50 transition-colors group relative overflow-hidden">
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
                                           <span className="text-[10px] font-black text-gray-700">{formatVNNumber(Number(v.statistics.viewCount || 0))}</span>
                                        </div>
                                        <div className="flex flex-col">
                                           <span className="text-[8px] text-gray-400 font-bold uppercase">VPH (Tốc độ)</span>
                                           <span className="text-[10px] font-black text-blue-600">+{formatVNNumber(Math.round(v.vph || 0))}</span>
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
                                           <div className="text-[13px] font-black text-blue-600">+{formatVNNumber(Math.round(kw.vph))} VPH</div>
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
                                           <div className="flex flex-col items-start">
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
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                      {nicheResults.videos.map((v: any, i: number) => (
                         <div key={i} className="vtw-niche-video-card bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl transition-all group">
                            <div className="relative aspect-video bg-black rounded-t-2xl overflow-hidden">
                               <img src={v.snippet.thumbnails.high.url} className="w-full h-full object-contain" />
                               <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                                  {v.contentDetails?.duration ? v.contentDetails.duration.replace('PT', '').toLowerCase() : ''}
                               </div>
                               <div className="absolute top-2 left-2 flex gap-1">
                                  <div className="bg-orange-600 text-white text-[10px] font-black px-2 py-1 rounded shadow-lg border border-orange-400">
                                     SCORE {v.trendScore}
                                  </div>
                               </div>
                            </div>
                            <div className="p-3 border-b border-gray-100 grid grid-cols-1 gap-2">
                               <a href={`https://youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer" className="w-full bg-white text-black border border-gray-200 py-2 rounded-xl text-[10px] font-black flex items-center justify-center gap-2 uppercase tracking-tight hover:bg-gray-50">
                                  <ExternalLink size={13} /> Xem video
                               </a>
                               <button 
                                  onClick={() => analyzeVideo(v.id)}
                                  className="w-full bg-orange-600 text-white py-2 rounded-xl text-[10px] font-black flex items-center justify-center gap-2 uppercase tracking-tight hover:bg-orange-700"
                               >
                                  <Video size={13} /> Phân tích video
                               </button>
                               <button 
                                  onClick={() => { setSpyInput(v.snippet.channelId); setActiveTab(2); analyzeSpy(v.snippet.channelId); }}
                                  className="w-full bg-[#2c3e50] text-white py-2 rounded-xl text-[10px] font-black flex items-center justify-center gap-2 uppercase tracking-tight hover:bg-[#1f2d3a]"
                               >
                                  <BarChart2 size={13} /> Bóc tách kênh này
                               </button>
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
                                     <span className="text-[13px] font-black text-gray-800">{formatVNNumber(Number(v.statistics.viewCount || 0))}</span>
                                  </div>
                                  <div className="flex flex-col items-end">
                                     <span className="text-[9px] text-gray-400 font-bold uppercase">Tăng trưởng/h</span>
                                     <span className="text-[13px] font-black text-blue-600">+{formatVNNumber(Math.round(v.vph || 0))} VPH</span>
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
                                     <span className="text-[16px] font-black">{formatVNNumber(Number(v.statistics.viewCount || 0))}</span>
                                     <span className="text-[9px] text-gray-400 font-bold uppercase leading-none">Views</span>
                                  </div>
                                  <div className="flex flex-col">
                                     <span className="text-[16px] font-black text-blue-400">+{formatVNNumber(Math.round(v.vph || 0))}</span>
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
                   <div className="space-y-4">
                      {nicheResults.channels.map((c: any, i: number) => (
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
                                        <span className="text-[12px] font-bold text-gray-600">{formatVNNumber(parseInt(c.statistics.viewCount) || 0)} <span className="font-medium text-gray-400 lowercase">views</span></span>
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
                                 onClick={() => { setSpyInput(c.id); setActiveTab(2); analyzeSpy(c.id); }}
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
                                  <span className="text-[11px] font-black text-gray-700">{formatVNNumber(Number(v.statistics.viewCount || 0))} / <span className="text-blue-500">+{formatVNNumber(Math.round(v.vph || 0))}</span></span>
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
                              <span className="font-mono">{formatVNNumber(parseInt(p.statistics.viewCount) || 0)} views</span>
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

                  {/* Gemini + YouTube API V3 audit sections */}
                  {renderVideoAiAuditSection()}
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
          <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
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


        {showGeminiKeyHistory && (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden border border-indigo-100"
            >
              <div className="bg-gradient-to-r from-indigo-600 to-blue-600 p-4 flex justify-between items-center text-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg"><Bot size={24} /></div>
                  <div>
                    <h2 className="text-xl font-bold">Lịch sử Gemini API Key</h2>
                    <p className="text-xs opacity-80">Chọn lại key Gemini đã từng nhập</p>
                  </div>
                </div>
                <button onClick={() => setShowGeminiKeyHistory(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors"><X size={24} /></button>
              </div>

              <div className="p-4 border-b border-gray-100 bg-indigo-50 flex flex-wrap gap-3 justify-between items-center">
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={() => useGeminiHistoryKey(selectedGeminiHistoryKeys)}
                    disabled={selectedGeminiHistoryKeys.length === 0}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-all active:scale-95"
                  >
                    <CheckCircle2 size={18} /> Dùng Key chọn
                  </button>
                  <button 
                    onClick={() => setSelectedGeminiHistoryKeys([...geminiKeysHistory])}
                    className="flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-lg text-sm font-bold transition-all"
                  >
                    Tích chọn hết
                  </button>
                  <button 
                    onClick={() => setSelectedGeminiHistoryKeys([])}
                    className="flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-lg text-sm font-bold transition-all text-red-500"
                  >
                    Bỏ chọn hết
                  </button>
                </div>
                <button onClick={clearGeminiHistory} className="flex items-center gap-2 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-bold transition-colors">
                  <Trash2 size={18} /> Xóa lịch sử
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {geminiKeysHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                    <RotateCcw size={48} className="mb-4 opacity-20" />
                    <p className="text-lg italic">Không có lịch sử Gemini Key</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {geminiKeysHistory.map((key, idx) => (
                      <div
                        key={idx}
                        className={`flex items-start gap-3 p-4 rounded-xl border transition-all cursor-pointer ${
                          selectedGeminiHistoryKeys.includes(key)
                            ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                            : 'border-gray-200 bg-white hover:border-indigo-200 hover:bg-gray-50'
                        }`}
                        onClick={() => {
                          if (selectedGeminiHistoryKeys.includes(key)) {
                            setSelectedGeminiHistoryKeys(prev => prev.filter(k => k !== key));
                          } else {
                            setSelectedGeminiHistoryKeys([key]);
                          }
                        }}
                      >
                        <div className="pt-1">
                          <input type="checkbox" checked={selectedGeminiHistoryKeys.includes(key)} onChange={() => {}} className="w-5 h-5 accent-indigo-600 rounded border-gray-300 cursor-pointer" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">GEMINI KEY #{idx + 1}</span>
                            {geminiApiKey.trim() === key.trim() && (
                              <span className="bg-green-100 text-green-600 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> ĐANG SỬ DỤNG
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-sm break-all p-2 rounded border select-all text-gray-800 bg-gray-50 border-gray-100">{key}</div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerConfirm('Xóa Gemini Key', 'Bạn có chắc chắn muốn xóa Gemini Key này khỏi lịch sử không?', () => removeFromGeminiHistory(key), 'XÁC NHẬN XÓA');
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

              <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                <button onClick={() => setShowGeminiKeyHistory(false)} className="bg-white border border-gray-300 text-gray-700 px-6 py-2 rounded-lg font-bold hover:bg-gray-100 transition-colors">Đóng</button>
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
                      <button
                        type="button"
                        onClick={() => setShowKeyHistory(true)}
                        className="text-[9px] bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded-full font-black border border-white/20 transition-all flex items-center gap-1 uppercase"
                        title="Lịch sử API Key YouTube"
                      >
                        <HistoryIcon size={10} /> YOUTUBE
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowGeminiKeyHistory(true)}
                        className="text-[9px] bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded-full font-black border border-white/20 transition-all flex items-center gap-1 uppercase"
                        title="Lịch sử API Key Gemini"
                      >
                        <HistoryIcon size={10} /> GEMINI
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
                  <div className="bg-white border border-red-100 p-5 rounded-2xl text-[11px] text-gray-600 mt-5 shadow-sm relative z-10">
                    <p className="font-black text-red-600 mb-2 uppercase tracking-tighter flex items-center gap-1"><AlertCircle size={14}/> Hướng dẫn dán mã Quota:</p>
                    <ul className="space-y-1 font-medium opacity-90">
                      <li className="flex items-center gap-2">🔹 Dán danh sách mã API, <b>mỗi mã trên 1 dòng riêng biệt</b>.</li>
                      <li className="flex items-center gap-2">🔹 Hệ thống sẽ <b>tự động xoay vòng Key</b> để quét dữ liệu mượt mà hơn.</li>
                      <li className="flex items-center gap-2">🔹 Dữ liệu được bảo mật và lưu cục bộ trên trình duyệt của bạn.</li>
                    </ul>
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
                    localStorage.setItem('youtube_api_keys_text_draft', keys.join('\n'));
                    
                    const newHistory = [...new Set([...apiKeysHistory, ...keys])];
                    setApiKeysHistory(newHistory);
                    localStorage.setItem('youtube_api_keys_history', JSON.stringify(newHistory));

                    const cleanGeminiKey = geminiApiKey.trim();
                    if (cleanGeminiKey) {
                      const newGeminiHistory = [...new Set([cleanGeminiKey, ...geminiKeysHistory.map(k => k.trim()).filter(Boolean)])];
                      setGeminiKeysHistory(newGeminiHistory);
                      localStorage.setItem('youtube_gemini_api_keys_history', JSON.stringify(newGeminiHistory));
                    }
                    
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
            <span className="text-gray-600">Quota phiên này: <b className="text-gray-900">{formatVNNumber(quotaUsed)}</b> units</span>
            <span className="text-gray-400">|</span>
            <span className="text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100 font-bold">Tổng Quota hôm nay đã dùng: {formatVNNumber(totalQuotaToday)} units</span>
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
                        <span className="flex items-center gap-1 text-orange-600"><Flame size={16} /> DỮ LIỆU NGÁCH TRENDING</span>
                        <span className="text-[10px] text-gray-500 font-medium mt-1">Dữ liệu do hệ thống tự quét định kỳ bằng YouTube API V3; người dùng chỉ xem/copy/tải key để tiết kiệm quota.</span>
                        {trendingCacheMeta?.updatedAt && (
                          <span className="text-[10px] text-blue-600 font-bold mt-1">Cập nhật: {new Date(trendingCacheMeta.updatedAt).toLocaleString('vi-VN')}</span>
                        )}
                     </h3>
                     <div className="flex items-center gap-3">
                         <div className="relative">
                           <select
                              value={trendingRegion}
                              onChange={(e) => { setTrendingRegion(e.target.value); loadTrendingNicheCache(e.target.value); }}
                              className="appearance-none bg-gray-50 border border-gray-200 text-gray-700 font-bold text-[11px] px-3 py-2.5 pr-8 rounded-lg outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400 shadow-sm cursor-pointer"
                           >
                              {REGIONS.map(r => (
                                <option key={r.code || 'GL'} value={r.code}>{r.name}</option>
                              ))}
                           </select>
                           <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                         </div>
                         <button
                            onClick={() => loadTrendingNicheCache(trendingRegion || config.region || 'VN')}
                            disabled={isFetchingDailyTrending}
                            className="bg-orange-500 hover:bg-orange-600 active:scale-95 text-white px-5 py-2.5 rounded-lg text-[12px] font-black tracking-tight uppercase shadow border border-orange-600 disabled:opacity-50 disabled:scale-100 transition-all flex items-center gap-2"
                         >
                            {isFetchingDailyTrending ? <><RefreshCw size={16} className="animate-spin"/> Đang tải...</> : <><Search size={16}/> Tải dữ liệu mới nhất</>}
                         </button>
                         {user?.email === 'chinhkhai79@gmail.com' && (
                           <button
                              onClick={runAdminTrendingCron}
                              disabled={isFetchingDailyTrending}
                              className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white px-4 py-2.5 rounded-lg text-[11px] font-black uppercase shadow border border-blue-700 disabled:opacity-50 transition-all flex items-center gap-2"
                           >
                              <RefreshCw size={14}/> Admin quét
                           </button>
                         )}
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
                              localStorage.setItem('youtube_last_niche_keyword', item);
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
                      <div key={i} className="vtw-niche-video-card bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl transition-all group">
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
                                  <span className="text-[11px] font-black text-gray-800">{formatVNNumber(Number(v.statistics.viewCount || 0))} / <span className="text-orange-500">+{formatVNNumber(Math.round(v.vph || 0))}</span></span>
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


      {showScrollTop && (
        <button
          type="button"
          className="vtw-scroll-top-mobile"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Lên đầu trang"
          title="Lên đầu trang"
        >
          ↑
        </button>
      )}

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
