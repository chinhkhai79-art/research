/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Youtube, 
  Search, 
  Trash2, 
  Key, 
  Eye, 
  EyeOff, 
  Copy, 
  Download, 
  ExternalLink, 
  Clock, 
  Calendar, 
  TrendingUp, 
  Layers, 
  Target, 
  Zap, 
  Library, 
  Info, 
  CheckCircle2, 
  Hash, 
  AlertCircle,
  AlertTriangle,
  FileText,
  History,
  X,
  Pin,
  Video,
  ChevronDown,
  MessageSquare,
  Globe,
  Star,
  ChevronUp,
  Check,
  Link,
  ChevronRight,
  ArrowRight,
  RotateCcw,
  ImagePlay,
  Play,
  Cpu,
  Heart,
  MessageCircle,
  FileDown,
  LayoutGrid,
  Database,
  Tag,
  Sparkles,
  ListChecks,
  Palette,
  Type,
  FolderOpen,
  ThumbsUp,
  Activity,
  Wrench,
  Loader2,
  Mail,
  LogOut,
  Timer,
  LogIn,
  User,
  ShieldCheck,
  Settings,
} from 'lucide-react';

import { motion, AnimatePresence } from 'motion/react';
import toast, { Toaster } from 'react-hot-toast';
import { useAuth } from './hooks/useAuth';
import { AuthPortal } from './components/AccountModals';
import { signOut, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth, db } from './lib/firebase';
import { collection, getDocs, writeBatch, doc, serverTimestamp } from 'firebase/firestore';

// --- Constants & Types ---
// KEY MẶC ĐỊNH NHÚNG SẴN
// Cách dùng chuẩn:
// 1) Tài khoản đăng nhập tool chỉ dùng để quản lý người dùng / PRO.
// 2) YouTube API Key và Gemini API Key là chìa khóa gọi API độc lập, không bắt buộc trùng Gmail đăng nhập tool.
// 3) Người dùng có thể lấy key từ Gmail/dự án Google AI Studio hoặc Google Cloud khác rồi dán vào tool.
// 4) Nếu người dùng nhập key trong popup Cài đặt API, tool ưu tiên key đó và lưu trên trình duyệt.
// 5) Nếu người dùng chưa nhập key, tool dùng key mặc định nhúng bên dưới.
// 6) Mỗi key một dòng. Không thêm dấu phẩy nếu dán trong template string.
// Lưu ý: chỉ nhúng key thật khi repo/private deployment đủ an toàn.
const DEFAULT_YT_API_KEY = "AIzaSyD1rczjsH5uMBNlWamMfKO8R8Mr9QEQNgQ";

const SYSTEM_FALLBACK_GEMINI_KEY = "AIzaSyD1MMwzM-PBDZtueN_6vXXNSiT7_IitXXU";
const GEMINI_MODEL_OPTIONS = [
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    desc: "Khuyên dùng: ổn định, mạnh, phù hợp phân tích video/kênh."
  },
  {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash-Lite",
    desc: "Nhẹ hơn 2.5 Flash, tiết kiệm quota hơn."
  },
  {
    id: "gemini-3.1-flash-lite-preview",
    name: "Gemini 3.1 Flash-Lite Preview",
    desc: "Model mới, nhanh, dùng khi key/project có hỗ trợ."
  },
  {
    id: "gemini-3-flash-preview",
    name: "Gemini 3 Flash Preview",
    desc: "Model mới, mạnh hơn, phù hợp phân tích sâu khi được hỗ trợ."
  },
  {
    id: "gemini-flash-latest",
    name: "Gemini Flash Latest",
    desc: "Alias tự động của Google, dùng khi project hỗ trợ alias latest."
  },
  {
    id: "gemini-2.0-flash-lite",
    name: "Gemini 2.0 Flash Lite",
    desc: "Dự phòng nếu key/project còn hỗ trợ."
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    desc: "Dự phòng nếu key/project còn hỗ trợ."
  }
] as const;

type GeminiModelId = typeof GEMINI_MODEL_OPTIONS[number]["id"];
const DEFAULT_GEMINI_MODEL: GeminiModelId = "gemini-3.1-flash-lite-preview";

function normalizeGeminiModel(model: string | null | undefined): GeminiModelId {
  const found = GEMINI_MODEL_OPTIONS.find((m) => m.id === model);
  return found ? found.id : DEFAULT_GEMINI_MODEL;
}

function buildGeminiAnalyzeUrl(model: string) {
  return `/api/gemini/analyze?model=${encodeURIComponent(model)}`;
}


function buildGeminiFallbackQueue(selectedModel: string): string[] {
  // Key Gemini hoạt động độc lập với Gmail đăng nhập tool.
  // Vì mỗi Gmail/project có quyền model khác nhau, tool thử model đang chọn trước,
  // sau đó tự fallback sang các model ổn định hơn nếu project chưa được cấp quyền model mới/preview.
  return Array.from(new Set([
    selectedModel || DEFAULT_GEMINI_MODEL,
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
  ].filter(Boolean)));
}

function splitGeminiApiKeys(raw: string): string[] {
  const keys = String(raw || "")
    .split(/[\n,;]+/)
    .map((key) => key.trim())
    .filter((key) => key.length > 10);

  const uniqueKeys = Array.from(new Set(keys));
  const activeKey = typeof window !== "undefined" ? localStorage.getItem("gemini_active_key") : "";

  if (activeKey && uniqueKeys.includes(activeKey)) {
    return [activeKey, ...uniqueKeys.filter((key) => key !== activeKey)];
  }

  return uniqueKeys;
}

function maskApiKeyForLog(key: string) {
  if (!key || key.length < 10) return "Không có key";
  return key.substring(0, 5) + "..." + key.substring(key.length - 4);
}

async function callGeminiAnalyze(params: {
  apiKey: string;
  prompt: string;
  inlineData?: any;
  selectedModel: string;
}) {
  const errors: string[] = [];
  const apiKeys = splitGeminiApiKeys(params.apiKey || SYSTEM_FALLBACK_GEMINI_KEY);

  if (!apiKeys.length) {
    throw new Error("Chưa cấu hình Gemini API Key hoặc Key không hợp lệ. Vui lòng vào Cài đặt để kiểm tra.");
  }

  for (const apiKey of apiKeys) {
    for (const model of buildGeminiFallbackQueue(params.selectedModel)) {
      try {
        console.log(
          "Cố gắng gọi Gemini API với Key:",
          maskApiKeyForLog(apiKey),
          "| Model:",
          model
        );

        const response = await fetch(buildGeminiAnalyzeUrl(model), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Gemini-Model": model
          },
          body: JSON.stringify({
            apiKey,
            prompt: params.prompt,
            inlineData: params.inlineData,
            model
          })
        });

        const resultText = await response.text();
        let result: any;
        try {
          result = JSON.parse(resultText);
        } catch {
          throw new Error("API không trả JSON hợp lệ: " + resultText.slice(0, 300));
        }

        if (!response.ok || !result.success) {
          throw new Error(result.error || result?.detail?.error?.message || "Gemini API lỗi");
        }

        if (!result.text || !String(result.text).trim()) {
          throw new Error("Gemini không trả nội dung text.");
        }

        if (typeof window !== "undefined") {
          localStorage.setItem("gemini_active_key", apiKey);
        }

        return { ...result, modelUsed: result.modelUsed || model, keyUsed: maskApiKeyForLog(apiKey) };
      } catch (err: any) {
        const rawMessage = err?.message || String(err);
        let message = rawMessage;
        if (/denied access|PERMISSION_DENIED|permission/i.test(rawMessage)) {
          message = "Key/project chưa được quyền dùng model này. Tool sẽ thử key/model khác nếu còn.";
        } else if (/quota|429|rate/i.test(rawMessage)) {
          message = "Key/model đã hết quota hoặc bị giới hạn tốc độ. Tool sẽ thử key/model khác nếu còn.";
        } else if (/API key not valid|invalid api key|key/i.test(rawMessage)) {
          message = "Key không hợp lệ hoặc chưa bật dịch vụ cần thiết.";
        }
        errors.push(`${maskApiKeyForLog(apiKey)} / ${model}: ${message}`);
        console.warn("Gemini key/model failed:", maskApiKeyForLog(apiKey), model, rawMessage);
      }
    }
  }

  throw new Error("Tất cả Gemini API Key/model đều không chạy được. Chi tiết: " + errors.join(" | "));
}

const COUNTRY_MAP: Record<string, { name: string; flag: string }> = {
  "VN": { name: "Việt Nam", flag: "🇻🇳" },
  "US": { name: "Hoa Kỳ", flag: "🇺🇸" },
  "GB": { name: "Vương quốc Anh", flag: "🇬🇧" },
  "JP": { name: "Nhật Bản", flag: "🇯🇵" },
  "KR": { name: "Hàn Quốc", flag: "🇰🇷" },
  "CH": { name: "Thụy Sĩ", flag: "🇨🇭" },
  "DE": { name: "Đức", flag: "🇩🇪" },
  "FR": { name: "Pháp", flag: "🇫🇷" },
  "CN": { name: "Trung Quốc", flag: "🇨🇳" },
  "IN": { name: "Ấn Độ", flag: "🇮🇳" },
  "RU": { name: "Nga", flag: "🇷🇺" },
  "CA": { name: "Canada", flag: "🇨🇦" },
  "AU": { name: "Úc", flag: "🇦🇺" },
  "BR": { name: "Brazil", flag: "🇧🇷" },
  "ID": { name: "Indonesia", flag: "🇮🇩" },
  "TH": { name: "Thái Lan", flag: "🇹🇭" },
  "PH": { name: "Philippines", flag: "🇵🇭" },
  "SG": { name: "Singapore", flag: "🇸🇬" },
  "MY": { name: "Malaysia", flag: "🇲🇾" },
  "IT": { name: "Ý", flag: "🇮🇹" },
  "ES": { name: "Tây Ban Nha", flag: "🇪🇸" },
  "NL": { name: "Hà Lan", flag: "🇳🇱" },
  "SE": { name: "Thụy Điển", flag: "🇸🇪" },
  "NO": { name: "Na Uy", flag: "🇳🇴" },
  "DK": { name: "Đan Mạch", flag: "🇩🇰" },
  "FI": { name: "Phần Lan", flag: "🇫🇮" },
  "TR": { name: "Thổ Nhĩ Kỳ", flag: "🇹🇷" },
  "SA": { name: "Ả Rập Xê Út", flag: "🇸🇦" },
  "AE": { name: "UAE", flag: "🇦🇪" },
  "MX": { name: "Mexico", flag: "🇲🇽" },
};

const CATEGORY_MAP: Record<string, { en: string; vi: string; desc: string }> = {
  "1": { en: "Film & Animation", vi: "Phim & Hoạt hình", desc: "Nội dung liên quan đến điện ảnh, hoạt hình và các kỹ xảo hình ảnh." },
  "2": { en: "Autos & Vehicles", vi: "Xe cộ", desc: "Đánh giá, sửa chữa, trải nghiệm các loại phương tiện giao thông." },
  "10": { en: "Music", vi: "Âm nhạc", desc: "Video ca nhạc, nghệ sĩ, nhạc cụ và các màn trình diễn." },
  "15": { en: "Pets & Animals", vi: "Thú cưng & Động vật", desc: "Khoảnh khắc đáng yêu, cách chăm sóc thú cưng và thế giới hoang dã." },
  "17": { en: "Sports", vi: "Thể thao", desc: "Tin tức, highlight, hướng dẫn tập luyện và thi đấu thể thao." },
  "18": { en: "Short Movies", vi: "Phim ngắn", desc: "Các dự án phim có thời lượng ngắn, phim nghệ thuật." },
  "19": { en: "Travel & Events", vi: "Du lịch & Sự kiện", desc: "Khám phá địa danh, lễ hội và các sự kiện thực tế." },
  "20": { en: "Gaming", vi: "Trò chơi", desc: "Stream game, hướng dẫn chơi, đánh giá game và esports." },
  "21": { en: "Videoblogging", vi: "Vlog cá nhân", desc: "Chia sẻ cuộc sống, quan điểm và trải nghiệm cá nhân." },
  "22": { en: "People & Blogs", vi: "Con người & Blog", desc: "Nội dung về phong cách sống, nhân vật và tương tác cộng đồng." },
  "23": { en: "Comedy", vi: "Hài kịch", desc: "Tiểu phẩm hài, parody, meme và nội dung giải trí gây cười." },
  "24": { en: "Entertainment", vi: "Giải trí", desc: "Chương trình truyền hình, show thực tế, nội dung giải trí đa dạng." },
  "25": { en: "News & Politics", vi: "Tin tức & Chính trị", desc: "Cập nhật tin thời sự, phân tích xã hội và chính trị toàn cầu." },
  "26": { en: "Howto & Style", vi: "Hướng dẫn & Phong cách", desc: "Dạy làm đẹp, nấu ăn, DIY và định hình phong cách sống." },
  "27": { en: "Education", vi: "Giáo dục", desc: "Kiến thức chuyên môn, bài giảng, mẹo học tập và kỹ năng sống." },
  "28": { en: "Science & Technology", vi: "Khoa học & Công nghệ", desc: "Đánh giá sản phẩm công nghệ, phát minh và kiến thức khoa học." },
  "29": { en: "Nonprofits & Activism", vi: "Tổ chức phi lợi nhuận & Hoạt động xã hội", desc: "Chiến dịch vì cộng đồng, từ thiện và các vấn đề xã hội." },
};

const getRPMByCategoryId = (categoryId: string): { min: number, max: number } => {
  const rpmMap: Record<string, { min: number, max: number }> = {
    "1": { min: 0.5, max: 2.5 },   // Film & Animation
    "2": { min: 1.0, max: 4.0 },   // Autos & Vehicles
    "10": { min: 0.2, max: 1.5 },  // Music
    "15": { min: 0.5, max: 2.0 },  // Pets & Animals
    "17": { min: 0.8, max: 3.5 },  // Sports
    "19": { min: 1.0, max: 4.5 },  // Travel & Events
    "20": { min: 0.3, max: 2.0 },  // Gaming
    "22": { min: 0.5, max: 2.5 },  // People & Blogs
    "23": { min: 0.5, max: 2.5 },  // Comedy
    "24": { min: 0.3, max: 2.0 },  // Entertainment
    "25": { min: 0.8, max: 3.0 },  // News & Politics
    "26": { min: 1.2, max: 5.0 },  // Howto & Style
    "27": { min: 1.5, max: 6.0 },  // Education
    "28": { min: 2.0, max: 10.0 }, // Science & Technology
    "29": { min: 0.5, max: 2.0 },  // Nonprofits & Activism
  };
  return rpmMap[categoryId] || { min: 0.5, max: 3.0 };
};

const removeVietnameseTones = (str: string): string => {
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
  str = str.replace(/đ/g, "d");
  str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
  str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
  str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
  str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
  str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
  str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
  str = str.replace(/Đ/g, "D");
  // Some system can't load combined unicode
  str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, ""); // Â, Ê, Ă, Ơ, Ư
  str = str.replace(/\u02C6|\u0306|\u031B/g, ""); // Â, Ê, Ă, Ơ, Ư
  // Remove special characters
  str = str.replace(/[^0-9a-z\s\[\]]/gi, '');
  // Remove extra spaces
  str = str.replace(/\s+/g, ' ');
  str = str.trim();
  return str;
};

const renderTextWithLinks = (text: any) => {
  const safeText = typeof text === "string" ? text : String(text ?? "");
  if (!safeText) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = safeText.split(urlRegex);
  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a 
          key={index} 
          href={part} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-blue-600 hover:underline break-all transition-colors"
        >
          {part}
        </a>
      );
    }
    return part;
  });
};

interface VideoData {
  id: string;
  title: string;
  channelTitle: string;
  channelId: string;
  channelCustomUrl?: string;
  publishedAt: string;
  description: string;
  tags: string[];
  categoryId: string;
  categoryName: string;
  categoryVi: string;
  thumbnails: {
    maxres?: { url: string };
    high?: { url: string };
    medium?: { url: string };
    default?: { url: string };
  };
  statistics: {
    viewCount: string;
    likeCount: string;
    commentCount: string;
  };
  duration: string;
  normalizedUrl: string;
  checkedAt: string;
  channelCountry?: string;
  comments?: {
    textDisplay: string;
    authorDisplayName: string;
    authorChannelId: string;
    likeCount: number;
    publishedAt: string;
  }[];
  aiAnalysis?: AIAnalysis;
  seoSuggestions?: SEOSuggestions;
}

interface ChannelData {
  id: string;
  title: string;
  description: string;
  customUrl?: string;
  publishedAt: string;
  thumbnails: {
    high?: { url: string };
    default?: { url: string };
  };
  statistics: {
    viewCount: string;
    subscriberCount: string;
    videoCount: string;
    hiddenSubscriberCount: boolean;
  };
  brandingSettings?: {
    channel?: {
      country?: string;
      keywords?: string;
      unsubscribedTrailer?: string;
      trackingAnalyticsAccountId?: string;
    };
    image?: {
      bannerExternalUrl?: string;
    };
  };
  status?: {
    isLinked: boolean;
    privacyStatus: string;
    longUploadsStatus: string;
  };
  topicDetails?: {
    topicCategories: string[];
  };
  latestVideo?: {
    id: string;
    title?: string;
    licensedContent: boolean;
    viewCount: string;
    categoryId?: string;
    publishedAt?: string;
  };
  popularVideos?: {
    id: string;
    title: string;
    thumbnail: string;
    viewCount: string;
    likeCount?: string;
    commentCount?: string;
    publishedAt: string;
    tags?: string[];
  }[];
  nicheSuggestions?: ChannelNicheSuggestion[];
  nicheScanMeta?: {
    currentTopic: string;
    regionCode: string;
    regionName: string;
    language: string;
    scanWindow: string;
    sourceNote: string;
  };
  checkedAt: string;
  aiAnalysis?: ChannelAIAnalysis;
}

interface ChannelNicheVideo {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  publishedAt: string;
  viewCount: string;
  likeCount?: string;
  commentCount?: string;
  vph: number;
  score: number;
}

interface ChannelNicheSuggestion {
  keyword: string;
  score: number;
  avgVph: number;
  totalViews: number;
  trendVideoCount: number;
  potential: string;
  competition: string;
  relatedVideos: ChannelNicheVideo[];
}

interface ChannelAIAnalysis {
  overview: {
    niche: string;
    mainContent: string;
    targetAudience: string;
    strengths: string;
    weaknesses: string;
    channelFormat: string;
  };
  branding: {
    logoFeedback: string;
    bannerFeedback: string;
  };
  descriptionFeedback: {
    strengths: string;
    weaknesses: string;
    rewritten: string;
  };
  thumbnailFeedback: {
    analysis: string;
    advice: string;
  };
  titleFeedback: {
    analysis: string;
    formulas: string[];
    samples: string[];
  };
  nicheAnalysis: {
    currentNiche: string;
    subNiche: string;
    competition: string;
    growthPotential: string;
    advice: string;
  };
  performance: {
    analysis: string;
  };
  monetization: {
    probability: string;
    estimatedRPM: string;
    analysis: string;
    isPotentiallyMonetized: boolean;
  };
  aiContentPolicy?: {
    isDetected: boolean;
    analysis: string;
    solutions: string[];
  };
  monetizationConfidence?: string;
  seo?: {
    descriptionAnalysis: string;
    tagFocusAdvice: string;
    keywordOptimization: string;
  };
  improvement: {
    urgent: string;
    optimizeLater: string;
    strategy30Days: string[];
    nextIdeas: string[];
  };
  conclusion: {
    potential: string;
    focusPoint: string;
    verdict: string;
  };
  topTags?: { name: string, count: number }[];
  topKeywords?: { name: string, count: number }[];
  isConfirmedMonetized?: boolean;
}

interface AIAnalysis {
  isAiGenerated?: {
    isAi: boolean;
    confidence: number;
    reasoning: string;
    warning?: string;
    advice?: string[];
  };
  contentOverview?: {
    focus: string;
    value: string;
    type: string;
    clarity: string;
    alignment: string;
    detailedAnalysis: string;
  };
  topicAnalysis?: {
    summary: string;
    strengths: string;
    weaknesses: string;
    suggestions: string;
  };
  contentAnalysisList?: string[];
  styleAnalysisList?: string[];
  strengthsWeaknesses?: {
    strengths: { point: string; impact: string }[];
    weaknesses: { point: string; fix: string }[];
  };
  conclusionSummary?: {
    currentStatus: string;
    biggestWeakness: string;
    top3Fixes: string[];
    finalVerdict: string;
  };
  thumbnailAnalysis: {
    comment: string;
    strengths: string;
    weaknesses: string;
    suggestions: string;
  };
  titleAnalysis: {
    comment: string;
    strengths: string;
    weaknesses: string;
    suggestions: string[];
  };
  descriptionAnalysis: {
    comment: string;
    strengths: string;
    weaknesses: string;
    suggestions: string;
  };
  tagsHashtagsAnalysis: {
    comment: string;
    strengths: string;
    weaknesses: string;
    suggestions: string;
    currentTagsGood?: string[];
    tagsToRemove?: string[];
    tagsToAdd?: string[];
  };
  pinnedCommentAnalysis?: {
    hasPinnedComment: boolean;
    feedback: string;
    suggestion?: string;
  };
}

interface SEOSuggestions {
  titles: string[];
  tags: string[];
  hashtags: string[];
  description: string;
  primaryKeyword: string;
  titleLengthRating?: string;
  titleFeedback?: string;
  descFeedback?: string;
}


const makeFallbackAnalysisFromRawText = (rawText: string): any => {
  const cleanRaw = String(rawText || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const preview = cleanRaw.length > 1200 ? cleanRaw.slice(0, 1200) + "..." : cleanRaw;
  const commonNote = preview || "Hệ thống đã nhận phản hồi nhưng nội dung chưa đúng định dạng JSON chuẩn.";

  return {
    topicAnalysis: {
      summary: commonNote,
      strengths: "Có dữ liệu thực tế từ YouTube API và hệ thống đã bắt đầu phân tích nội dung.",
      weaknesses: "Phản hồi phân tích chưa khớp 100% cấu trúc JSON mà giao diện cần đọc.",
      suggestions: "Nên chạy lại hoặc đổi model; hệ thống vẫn hiển thị bản dự phòng để không bị trống."
    },
    contentOverview: {
      focus: "Tổng quan video",
      value: "Có thể đánh giá dựa trên tiêu đề, mô tả, tag, bình luận và thumbnail.",
      type: "Phân tích metadata YouTube",
      clarity: "Cần tối ưu lại cấu trúc phản hồi AI để hiển thị đẹp hơn.",
      alignment: "Dữ liệu đang bám theo thông tin YouTube API.",
      detailedAnalysis: commonNote
    },
    thumbnailAnalysis: {
      comment: "Thumbnail cần có điểm nhấn rõ, tương phản tốt và thể hiện đúng nội dung chính của video.",
      strengths: "Có thể dùng thumbnail để kéo CTR nếu bố cục, chủ thể và cảm xúc đủ mạnh.",
      weaknesses: "Chưa đọc được đầy đủ phân tích thumbnail từ JSON của AI trong lần này.",
      suggestions: "Tăng độ rõ chủ thể, giảm chi tiết thừa, thêm cảm xúc/kết quả nổi bật và giữ đúng ngách."
    },
    titleAnalysis: {
      comment: "Tiêu đề cần chứa từ khóa chính, lợi ích rõ ràng và một điểm tò mò đủ mạnh.",
      strengths: "Tiêu đề đã có dữ liệu để phân tích từ YouTube API.",
      weaknesses: "Phản hồi chưa đúng field titleAnalysis nên hệ thống dùng đánh giá dự phòng.",
      suggestions: [
        "Đưa từ khóa chính lên đầu tiêu đề.",
        "Thêm lợi ích hoặc kết quả cụ thể cho người xem.",
        "Giữ tiêu đề ngắn, rõ, dễ hiểu và có yếu tố tò mò."
      ]
    },
    descriptionAnalysis: {
      comment: "Mô tả nên có 2 dòng đầu thật mạnh, sau đó bổ sung từ khóa, tóm tắt nội dung và CTA.",
      strengths: "Mô tả có thể hỗ trợ SEO nếu chứa đúng từ khóa và ngữ cảnh video.",
      weaknesses: "Chưa đọc được phân tích mô tả chi tiết từ JSON của AI trong lần này.",
      suggestions: "Viết lại 2 dòng mở đầu rõ lợi ích, thêm từ khóa chính/phụ, link liên quan và lời kêu gọi hành động."
    },
    tagsHashtagsAnalysis: {
      comment: "Tag và hashtag nên bám sát chủ đề, tránh nhồi quá nhiều từ khóa không liên quan.",
      strengths: "YouTube API đã trả dữ liệu tag thực tế để tham khảo.",
      weaknesses: "Phản hồi chưa đúng cấu trúc tagsHashtagsAnalysis nên dùng nhận xét dự phòng.",
      suggestions: "Giữ tag chính xác theo ngách, thêm biến thể từ khóa dài và bỏ tag quá rộng hoặc không liên quan.",
      currentTagsGood: [],
      tagsToRemove: [],
      tagsToAdd: []
    },
    pinnedCommentAnalysis: {
      hasPinnedComment: false,
      feedback: "Nếu chưa có bình luận ghim, nên thêm một câu hỏi hoặc CTA để kéo tương tác.",
      suggestion: "Hãy ghim một lời kêu gọi hành động ngắn, ví dụ hỏi người xem muốn xem chủ đề nào tiếp theo."
    },
    contentAnalysisList: [
      "Video có dữ liệu đủ để phân tích tổng quan từ YouTube API: tiêu đề, mô tả, tag, bình luận và thumbnail.",
      "Cần tối ưu tiêu đề theo hướng rõ lợi ích và chứa từ khóa chính.",
      "Cần tối ưu mô tả để hỗ trợ SEO và tăng tỷ lệ người xem hiểu nội dung ngay từ đầu.",
      "Thumbnail nên thể hiện rõ chủ thể/chủ đề và có điểm nhấn thị giác.",
      "Tag nên tập trung vào từ khóa đúng ngách, không dùng quá nhiều tag rộng.",
      "Bình luận ghim nên được dùng để kéo tương tác hoặc điều hướng người xem.",
      "Nội dung nên có hook mở đầu mạnh hơn để giữ chân người xem.",
      "Nên kiểm tra lại bằng model khác nếu muốn phần phân tích sâu và chuẩn field hơn."
    ],
    styleAnalysisList: [
      "Phong cách nội dung cần rõ ràng ngay từ 3-5 giây đầu.",
      "Cần thống nhất giữa tiêu đề, thumbnail và nội dung thật của video.",
      "Nên dùng câu chữ tự nhiên, dễ hiểu, đúng đối tượng người xem.",
      "Tránh mô tả quá chung chung khiến YouTube khó hiểu chủ đề.",
      "Nên tăng yếu tố cảm xúc, kết quả hoặc câu chuyện để video dễ giữ chân người xem.",
      "Cần có CTA nhẹ nhàng để tăng bình luận, đăng ký hoặc xem video tiếp theo.",
      "Nếu là video ngách, hãy lặp lại các từ khóa chính theo cách tự nhiên.",
      "Hệ thống đã chống lỗi hiển thị khi JSON sai định dạng, nên không còn bị trắng/trống toàn bộ."
    ],
    strengthsWeaknesses: {
      strengths: [
        { point: "Có dữ liệu thật từ YouTube API", impact: "Giúp phân tích bám sát video thực tế hơn." },
        { point: "Đã có phản hồi phân tích nội dung", impact: "Có thể dùng làm cơ sở đánh giá dự phòng." }
      ],
      weaknesses: [
        { point: "JSON chưa đúng định dạng", fix: "Dùng model 2.5 Flash, chạy lại hoặc để hệ thống normalize tự động." },
        { point: "Một số ô có thể chưa chi tiết", fix: "Cần ép prompt trả đủ field hoặc dùng fallback đã tích hợp." }
      ]
    },
    conclusionSummary: {
      currentStatus: "Có dữ liệu phân tích nhưng JSON chưa chuẩn",
      biggestWeakness: "Cấu trúc JSON chưa khớp giao diện",
      top3Fixes: ["Chọn Gemini 2.5 Flash", "Chạy lại phân tích", "Tối ưu tiêu đề, mô tả và thumbnail"],
      finalVerdict: "Tool vẫn hoạt động; bản này dùng dữ liệu dự phòng khi phản hồi JSON sai để không bị trống kết quả."
    },
    seo: {
      titles: ["Thêm từ khóa chính + lợi ích rõ ràng", "Dùng hook tò mò nhưng không giật tít sai", "Giữ tiêu đề ngắn và dễ hiểu"],
      tags: [],
      hashtags: [],
      description: "Bổ sung mô tả chuẩn SEO: mở đầu bằng lợi ích, thêm từ khóa chính/phụ, tóm tắt nội dung và CTA.",
      primaryKeyword: ""
    },
    __rawGeminiText: preview
  };
};

const extractJsonObject = (raw: string): any => {
  const text = String(raw || "").trim();
  if (!text) return makeFallbackAnalysisFromRawText("Nội dung phân tích trả về rỗng.");

  const withoutFence = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const tryParse = (candidate: string) => {
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  };

  const direct = tryParse(withoutFence);
  if (direct) return direct;

  const first = withoutFence.indexOf("{");
  const last = withoutFence.lastIndexOf("}");
  if (first >= 0 && last > first) {
    const candidate = withoutFence.slice(first, last + 1);
    const parsedCandidate = tryParse(candidate);
    if (parsedCandidate) return parsedCandidate;

    const repaired = candidate
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'");
    const parsedRepaired = tryParse(repaired);
    if (parsedRepaired) return parsedRepaired;
  }

  console.warn("Phản hồi phân tích sai định dạng JSON, dùng fallback an toàn:", withoutFence.slice(0, 500));
  return makeFallbackAnalysisFromRawText(withoutFence);
};

const toPlainText = (value: any, fallback = ""): string => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "-") return fallback;
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        return toPlainText(JSON.parse(trimmed), fallback);
      } catch {
        // Giữ nguyên text nếu không phải JSON hợp lệ.
      }
    }
    return trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const joined = value.map((item) => toPlainText(item, "")).filter(Boolean).join("\n");
    return joined || fallback;
  }
  if (typeof value === "object") {
    const preferredKeys = [
      "comment", "summary", "analysis", "feedback", "review", "content", "text",
      "point", "impact", "fix", "advice", "suggestion", "suggestions",
      "strengths", "weaknesses", "description", "value"
    ];
    for (const key of preferredKeys) {
      const text = toPlainText(value[key], "");
      if (text) return text;
    }
    const joined = Object.values(value).map((item) => toPlainText(item, "")).filter(Boolean).join("\n");
    return joined || fallback;
  }
  return fallback;
};

const firstText = (...values: any[]): string => {
  for (const value of values) {
    const text = toPlainText(value, "");
    if (text) return text;
  }
  return "";
};

const ensureArray = <T,>(value: unknown, fallback: T[] = []): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\n|;|\d+\.\s+/)
      .map((x) => x.trim())
      .filter(Boolean) as T[];
  }
  return fallback;
};

const ensureObject = <T extends Record<string, any>>(value: unknown, fallback: T): T => {
  return value && typeof value === "object" && !Array.isArray(value)
    ? ({ ...fallback, ...(value as Record<string, any>) } as T)
    : fallback;
};

const pickObject = (...values: any[]): Record<string, any> => {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  }
  return {};
};

const makeAnalysisBlock = (
  raw: any,
  fallback: { comment: string; strengths: string; weaknesses: string; suggestions: string | string[] }
) => {
  const obj = pickObject(raw);
  return {
    comment: firstText(obj.comment, obj.summary, obj.analysis, obj.feedback, obj.review, obj.content, obj.text, raw, fallback.comment),
    strengths: firstText(obj.strengths, obj.strongPoints, obj.goodPoints, obj.advantages, obj.positive, fallback.strengths),
    weaknesses: firstText(obj.weaknesses, obj.weakPoints, obj.limitations, obj.needImprove, obj.improvements, obj.negative, fallback.weaknesses),
    suggestions: Array.isArray(obj.suggestions)
      ? obj.suggestions.map((x: any) => toPlainText(x, "")).filter(Boolean)
      : firstText(obj.suggestions, obj.suggestion, obj.advice, obj.recommendation, fallback.suggestions)
  };
};

const normalizeVideoAnalysisPayload = (payload: any): { ai: AIAnalysis; seo: SEOSuggestions } => {
  const source = payload && typeof payload === "object" ? payload : {};
  const rawAi = source.ai && typeof source.ai === "object" ? source.ai : source;
  const rawSeo = source.seo && typeof source.seo === "object" ? source.seo : {};

  const titleRaw = pickObject(
    rawAi.titleAnalysis,
    rawAi.title,
    rawAi.titleReview,
    rawAi.titleFeedback,
    rawAi.title_analysis,
    rawAi.tieuDe,
    rawAi["tiêu_đề"]
  );

  const descriptionRaw = pickObject(
    rawAi.descriptionAnalysis,
    rawAi.description,
    rawAi.descriptionReview,
    rawAi.descriptionFeedback,
    rawAi.description_analysis,
    rawAi.moTa,
    rawAi["mô_tả"]
  );

  const thumbnailRaw = pickObject(
    rawAi.thumbnailAnalysis,
    rawAi.thumbnail,
    rawAi.thumbnailReview,
    rawAi.thumbnailFeedback,
    rawAi.thumbnail_analysis,
    rawAi.anhDaiDien,
    rawAi["ảnh_thumbnail"]
  );

  const tagsRaw = pickObject(
    rawAi.tagsHashtagsAnalysis,
    rawAi.tagsAnalysis,
    rawAi.hashtagsAnalysis,
    rawAi.tags,
    rawAi.hashtags,
    rawAi.tagFeedback,
    rawAi.tag_analysis
  );

  const topicRaw = pickObject(
    rawAi.topicAnalysis,
    rawAi.topic,
    rawAi.trend,
    rawAi.trendAnalysis,
    rawAi.topicTrend,
    rawAi.topic_analysis,
    rawAi.chuDe
  );

  const pinnedRaw = pickObject(
    rawAi.pinnedCommentAnalysis,
    rawAi.pinnedComment,
    rawAi.commentAnalysis,
    rawAi.ctaAnalysis,
    rawAi.comment_feedback
  );

  const conclusionRaw = pickObject(rawAi.conclusionSummary, rawAi.conclusion, rawAi.summary, rawAi.final);
  const strengthsWeaknessesRaw = pickObject(rawAi.strengthsWeaknesses, rawAi.swot, rawAi.overall);

  const contentOverview = ensureObject(rawAi.contentOverview || rawAi.overview || rawAi.content || rawAi.generalOverview, {
    focus: firstText(rawAi.focus, rawAi.mainTopic, topicRaw.summary, "Chưa xác định rõ trọng tâm video."),
    value: firstText(rawAi.value, rawAi.viewerValue, "Video có dữ liệu để phân tích, cần tối ưu cách trình bày để tăng giữ chân người xem."),
    type: firstText(rawAi.type, rawAi.videoType, "Video YouTube"),
    clarity: firstText(rawAi.clarity, "Cần làm rõ thông điệp chính ngay từ tiêu đề, mô tả và thumbnail."),
    alignment: firstText(rawAi.alignment, "Các yếu tố SEO cần đồng bộ hơn giữa tiêu đề, mô tả, tag và nội dung."),
    detailedAnalysis: firstText(rawAi.detailedAnalysis, rawAi.overview, "Phân tích tổng quan cho thấy video cần được tối ưu thêm về tiêu đề, mô tả, thumbnail và bộ từ khóa để tăng khả năng đề xuất.")
  });

  const ai: AIAnalysis = {
    isAiGenerated: rawAi.isAiGenerated,
    contentOverview,
    topicAnalysis: {
      summary: firstText(topicRaw.summary, topicRaw.comment, topicRaw.analysis, topicRaw.content, "Chủ đề có dữ liệu nhưng cần định vị rõ ngách chính để tăng khả năng đề xuất."),
      strengths: firstText(topicRaw.strengths, topicRaw.goodPoints, "Có chủ đề cụ thể, có thể khai thác theo hướng nhu cầu người xem."),
      weaknesses: firstText(topicRaw.weaknesses, topicRaw.limitations, "Cần làm rõ góc tiếp cận khác biệt so với các video cùng chủ đề."),
      suggestions: firstText(topicRaw.suggestions, topicRaw.advice, "Nên thêm từ khóa ngách vào tiêu đề, mô tả và tag để YouTube hiểu chủ đề tốt hơn.")
    },
    contentAnalysisList: ensureArray<string>(
      rawAi.contentAnalysisList || rawAi.contentAnalysis || rawAi.content_points || rawAi.contentPoints,
      [
        "Nội dung cần có mở đầu rõ ràng để người xem hiểu giá trị trong vài giây đầu.",
        "Nên sắp xếp các ý chính theo trình tự dễ theo dõi.",
        "Cần bổ sung điểm nhấn hoặc lời hứa giá trị để tăng giữ chân người xem."
      ]
    ).map((x: any) => toPlainText(x, "")).filter(Boolean),
    styleAnalysisList: ensureArray<string>(
      rawAi.styleAnalysisList || rawAi.styleAnalysis || rawAi.style_points || rawAi.stylePoints,
      [
        "Phong cách trình bày nên thống nhất giữa tiêu đề, thumbnail và nội dung.",
        "Nên dùng ngôn ngữ trực tiếp, dễ hiểu, có lợi ích rõ cho người xem.",
        "Cần tối ưu nhịp trình bày để tăng tỷ lệ xem tiếp."
      ]
    ).map((x: any) => toPlainText(x, "")).filter(Boolean),
    strengthsWeaknesses: {
      strengths: ensureArray(strengthsWeaknessesRaw.strengths || rawAi.strengths, [
        { point: "Có dữ liệu video thật để tối ưu", impact: "Giúp xác định hướng cải thiện rõ hơn." }
      ]),
      weaknesses: ensureArray(strengthsWeaknessesRaw.weaknesses || rawAi.weaknesses, [
        { point: "Một số yếu tố SEO chưa nổi bật", fix: "Tối ưu lại tiêu đề, mô tả, thumbnail và tag." }
      ])
    },
    conclusionSummary: {
      currentStatus: firstText(conclusionRaw.currentStatus, conclusionRaw.status, rawAi.currentStatus, "Cần tối ưu thêm"),
      biggestWeakness: firstText(conclusionRaw.biggestWeakness, conclusionRaw.weakness, rawAi.biggestWeakness, "Thông điệp và SEO chưa đủ rõ ở các điểm chạm chính."),
      top3Fixes: ensureArray<string>(conclusionRaw.top3Fixes || rawAi.top3Fixes, ["Tối ưu tiêu đề", "Tối ưu thumbnail", "Bổ sung mô tả và tag"]).map((x: any) => toPlainText(x, "")).filter(Boolean),
      finalVerdict: firstText(conclusionRaw.finalVerdict, conclusionRaw.verdict, conclusionRaw.summary, rawAi.finalVerdict, "Video có tiềm năng, cần tối ưu lại các yếu tố hiển thị để tăng hiệu quả.")
    },
    thumbnailAnalysis: makeAnalysisBlock(thumbnailRaw, {
      comment: "Thumbnail cần thể hiện rõ điểm hấp dẫn chính của video.",
      strengths: "Có thể dùng hình ảnh đại diện để tạo nhận diện trực quan.",
      weaknesses: "Cần tăng độ rõ thông điệp, độ tương phản và điểm nhấn thị giác.",
      suggestions: "Nên dùng chủ thể lớn, ít chữ, màu tương phản và cảm xúc rõ."
    }),
    titleAnalysis: {
      ...makeAnalysisBlock(titleRaw, {
        comment: "Tiêu đề cần nêu rõ lợi ích hoặc tò mò chính để tăng CTR.",
        strengths: "Tiêu đề đã có chủ đề để YouTube nhận diện nội dung.",
        weaknesses: "Cần làm mạnh hơn yếu tố lợi ích, con số hoặc cảm xúc.",
        suggestions: ["Thêm từ khóa chính ở đầu tiêu đề", "Tăng yếu tố tò mò nhưng không giật tít", "Rút gọn tiêu đề để dễ đọc trên mobile"]
      }),
      suggestions: ensureArray<string>(titleRaw.suggestions || titleRaw.samples || titleRaw.ideas, ["Thêm từ khóa chính ở đầu tiêu đề", "Rút gọn tiêu đề", "Tăng lợi ích rõ ràng"]).map((x: any) => toPlainText(x, "")).filter(Boolean)
    },
    descriptionAnalysis: makeAnalysisBlock(descriptionRaw, {
      comment: "Mô tả cần hỗ trợ SEO và giải thích rõ nội dung video.",
      strengths: "Mô tả có thể chứa dữ liệu giúp YouTube hiểu nội dung.",
      weaknesses: "Cần bổ sung từ khóa chính, tóm tắt nội dung và CTA.",
      suggestions: "Nên viết 2 dòng đầu thật rõ, thêm từ khóa chính, hashtag phù hợp và lời kêu gọi hành động."
    }),
    tagsHashtagsAnalysis: {
      ...makeAnalysisBlock(tagsRaw, {
        comment: "Tags và hashtag nên xoay quanh từ khóa chính, từ khóa phụ và biến thể tìm kiếm.",
        strengths: "Có thể tận dụng tag để bổ trợ ngữ cảnh nội dung.",
        weaknesses: "Không nên dùng tag quá rộng hoặc không liên quan.",
        suggestions: "Giữ tag sát chủ đề, thêm tag ngách, tag thương hiệu và hashtag có khả năng tìm kiếm."
      }),
      currentTagsGood: ensureArray<string>(tagsRaw.currentTagsGood || tagsRaw.goodTags || rawSeo.tags).map((x: any) => toPlainText(x, "")).filter(Boolean),
      tagsToRemove: ensureArray<string>(tagsRaw.tagsToRemove || tagsRaw.removeTags).map((x: any) => toPlainText(x, "")).filter(Boolean),
      tagsToAdd: ensureArray<string>(tagsRaw.tagsToAdd || tagsRaw.addTags || rawSeo.hashtags).map((x: any) => toPlainText(x, "")).filter(Boolean)
    },
    pinnedCommentAnalysis: {
      hasPinnedComment: Boolean(pinnedRaw.hasPinnedComment || pinnedRaw.hasPinned || false),
      feedback: firstText(pinnedRaw.feedback, pinnedRaw.comment, pinnedRaw.analysis, "Nên ghim bình luận có CTA rõ ràng để kéo tương tác và điều hướng người xem."),
      suggestion: firstText(pinnedRaw.suggestion, pinnedRaw.suggestions, pinnedRaw.advice, "Ghim bình luận kêu gọi người xem chia sẻ ý kiến, xem video liên quan hoặc đăng ký kênh.")
    }
  };

  const seo: SEOSuggestions = {
    titles: ensureArray<string>(rawSeo.titles || rawAi.suggestedTitles || titleRaw.suggestions, []).map((x: any) => toPlainText(x, "")).filter(Boolean),
    tags: ensureArray<string>(rawSeo.tags || tagsRaw.tagsToAdd || tagsRaw.currentTagsGood, []).map((x: any) => toPlainText(x, "")).filter(Boolean),
    hashtags: ensureArray<string>(rawSeo.hashtags || tagsRaw.hashtags, []).map((x: any) => toPlainText(x, "")).filter(Boolean),
    description: firstText(rawSeo.description, rawSeo.rewrittenDescription, descriptionRaw.rewritten, descriptionRaw.suggestions),
    primaryKeyword: firstText(rawSeo.primaryKeyword, rawSeo.keyword, rawAi.primaryKeyword),
    titleLengthRating: firstText(rawSeo.titleLengthRating),
    titleFeedback: firstText(rawSeo.titleFeedback, titleRaw.comment),
    descFeedback: firstText(rawSeo.descFeedback, descriptionRaw.comment)
  };

  return { ai, seo };
};

const normalizeChannelAnalysisPayload = (payload: any): Partial<ChannelAIAnalysis> => {
  const source = payload && typeof payload === "object" ? payload : {};
  const titleFeedbackRaw = source.titleFeedback || {};
  const improvementRaw = source.improvement || {};
  return {
    overview: ensureObject(source.overview || source.channelOverview, {
      niche: source.niche || "Chưa xác định",
      mainContent: source.mainContent || source.contentStyle || "-",
      targetAudience: source.targetAudience || source.audience || "-",
      strengths: Array.isArray(source.strengths) ? source.strengths.join(", ") : (source.strengths || "-"),
      weaknesses: Array.isArray(source.weaknesses) ? source.weaknesses.join(", ") : (source.weaknesses || "-"),
      channelFormat: source.channelFormat || "-"
    }),
    branding: ensureObject(source.branding, {
      logoFeedback: "-",
      bannerFeedback: "-"
    }),
    descriptionFeedback: ensureObject(source.descriptionFeedback, {
      strengths: "-",
      weaknesses: "-",
      rewritten: "-"
    }),
    thumbnailFeedback: ensureObject(source.thumbnailFeedback, {
      analysis: "-",
      advice: "-"
    }),
    titleFeedback: {
      ...ensureObject(titleFeedbackRaw, {
        analysis: "-",
        formulas: [],
        samples: []
      }),
      formulas: ensureArray<string>(titleFeedbackRaw.formulas),
      samples: ensureArray<string>(titleFeedbackRaw.samples)
    },
    nicheAnalysis: ensureObject(source.nicheAnalysis, {
      currentNiche: source.niche || "-",
      subNiche: "-",
      competition: "-",
      growthPotential: "-",
      advice: "-"
    }),
    performance: ensureObject(source.performance, {
      analysis: "-"
    }),
    monetization: ensureObject(source.monetization, {
      probability: "-",
      estimatedRPM: "-",
      analysis: "-",
      isPotentiallyMonetized: false
    }),
    aiContentPolicy: source.aiContentPolicy,
    monetizationConfidence: source.monetizationConfidence,
    seo: source.seo,
    improvement: {
      ...ensureObject(improvementRaw, {
        urgent: "-",
        optimizeLater: "-",
        strategy30Days: [],
        nextIdeas: []
      }),
      strategy30Days: ensureArray<string>(improvementRaw.strategy30Days),
      nextIdeas: ensureArray<string>(improvementRaw.nextIdeas)
    },
    conclusion: ensureObject(source.conclusion, {
      potential: source.potential || "-",
      focusPoint: source.focusPoint || "-",
      verdict: source.verdict || source.conclusionSummary || source.summary || "-"
    })
  };
};

// --- Utils ---

const extractVideoId = (url: string | unknown): string | null => {
  if (typeof url !== 'string') return null;
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  if (match && match[7].length === 11) return match[7];
  
  const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];
  
  return null;
};

const extractChannelInfo = (url: string | unknown): { type: 'id' | 'handle' | 'username', value: string } | null => {
  if (typeof url !== 'string') return null;
  // Handle @handle
  const handleMatch = url.match(/youtube\.com\/@([a-zA-Z0-9._-]+)/);
  if (handleMatch) return { type: 'handle', value: handleMatch[1] };

  // Handle channel ID
  const idMatch = url.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})/);
  if (idMatch) return { type: 'id', value: idMatch[1] };

  // Handle /c/ username or /user/ username
  const cUserMatch = url.match(/youtube\.com\/c\/([a-zA-Z0-9_-]+)/);
  if (cUserMatch) return { type: 'username', value: cUserMatch[1] };
  
  const userMatch = url.match(/youtube\.com\/user\/([a-zA-Z0-9_-]+)/);
  if (userMatch) return { type: 'username', value: userMatch[1] };

  // Handle direct vanity URLs (e.g., youtube.com/vantheweb)
  const vanityMatch = url.match(/youtube\.com\/([a-zA-Z0-9_-]+)/);
  if (vanityMatch && !['channel', 'c', 'user', 'watch', 'shorts', 'playlist'].includes(vanityMatch[1])) {
    return { type: 'handle', value: vanityMatch[1] };
  }

  // If it's just the handle or ID part
  if (url.startsWith('@')) return { type: 'handle', value: url.substring(1) };
  if (url.startsWith('UC') && url.length === 24) return { type: 'id', value: url };

  // Generic fallback: check if it's potentially a handle or username if it doesn't match above
  if (url && !url.includes('/') && url.length > 0) {
    return { type: 'handle', value: url.startsWith('@') ? url.substring(1) : url };
  }

  return null;
};

const formatDuration = (pt: string): string => {
  if (!pt) return "Không có dữ liệu";
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const matches = pt.match(regex);
  if (!matches) return pt;
  const h = matches[1] ? `${matches[1]}h` : "";
  const m = matches[2] ? `${matches[2]}m` : "";
  const s = matches[3] ? `${matches[3]}s` : "";
  return (h + m + s) || "0s";
};

const getTimeZoneByCountry = (countryCode?: string): string => {
  if (!countryCode || countryCode.toUpperCase() === 'VN' || countryCode === 'Vietnam') {
    return 'Asia/Ho_Chi_Minh';
  }
  return 'UTC';
};

const formatDate = (dateStr: string, timeZone: string = 'Asia/Ho_Chi_Minh'): string => {
  if (!dateStr) return "N/A";
  try {
    const d = new Date(dateStr);
    const tz = timeZone === 'UTC' ? 'UTC' : 'Asia/Ho_Chi_Minh';
    const time = d.toLocaleTimeString('vi-VN', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit', 
      hour12: false, 
      timeZone: tz 
    });
    const weekday = d.toLocaleDateString('vi-VN', { weekday: 'long', timeZone: tz });
    const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    const date = d.toLocaleDateString('vi-VN', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric', 
      timeZone: tz 
    });
    const tzLabel = tz === 'UTC' ? ' (UTC)' : ' (GMT+7)';
    return `${capitalizedWeekday}, lúc ${time} ngày ${date}${tzLabel}`;
  } catch (e) {
    return dateStr;
  }
};

const downloadImage = async (url: string, filename: string) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error("Download error:", error);
    // Fallback: open in new tab if blob fetch fails
    window.open(url, '_blank');
  }
};

const formatNumber = (num: string | number): string => {
  if (num === undefined || num === null || num === '') return "0";
  return Math.round(Number(num) || 0).toLocaleString('vi-VN');
};

const getVideoAgeHours = (publishedAt: string): number => {
  const publishedTime = new Date(publishedAt).getTime();
  if (!publishedAt || Number.isNaN(publishedTime)) return 1;
  return Math.max(1, Math.round((Date.now() - publishedTime) / (1000 * 60 * 60)));
};

const getVideoVph = (viewCount: string | number, publishedAt: string): number => {
  return Math.round((Number(viewCount) || 0) / getVideoAgeHours(publishedAt));
};

const getVideoTrendScore = (video: { viewCount: string | number; likeCount?: string | number; commentCount?: string | number; publishedAt: string }): number => {
  const views = Number(video.viewCount) || 0;
  const likes = Number(video.likeCount) || 0;
  const comments = Number(video.commentCount) || 0;
  const vph = getVideoVph(views, video.publishedAt);
  const likeRate = views > 0 ? likes / views : 0;
  const commentRate = views > 0 ? comments / views : 0;
  const score = Math.round(
    Math.min(45, Math.log10(views + 10) * 6) +
    Math.min(35, Math.log10(vph + 10) * 8) +
    Math.min(12, likeRate * 700) +
    Math.min(8, commentRate * 1500)
  );
  return Math.max(1, Math.min(100, score));
};

const COUNTRY_NAME_VI: Record<string, string> = {
  VN: 'Việt Nam', US: 'Hoa Kỳ', GB: 'Anh', CA: 'Canada', AU: 'Úc', IN: 'Ấn Độ', ID: 'Indonesia', TH: 'Thái Lan', PH: 'Philippines', JP: 'Nhật Bản', KR: 'Hàn Quốc', FR: 'Pháp', DE: 'Đức', BR: 'Brazil', MX: 'Mexico', ES: 'Tây Ban Nha'
};

const getCountryNameVi = (code?: string) => {
  const cleanCode = String(code || '').trim().toUpperCase();
  return COUNTRY_NAME_VI[cleanCode] || cleanCode || 'Việt Nam';
};

const detectLanguageFromText = (text: string, country?: string) => {
  const lower = (text || '').toLowerCase();
  const viMarks = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  if (viMarks.test(text) || String(country || '').toUpperCase() === 'VN') return 'vi';
  if (/[ぁ-んァ-ン一-龥]/.test(text)) return 'ja';
  if (/[가-힣]/.test(text)) return 'ko';
  if (/[ก-๙]/.test(text)) return 'th';
  if (lower.includes('brasil') || lower.includes('portugu')) return 'pt';
  return 'en';
};

const extractTrendSeedKeywords = (channel: ChannelData, max = 12) => {
  const chunks = [
    channel.title,
    channel.description,
    channel.brandingSettings?.channel?.keywords,
    channel.aiAnalysis?.overview?.niche,
    channel.aiAnalysis?.nicheAnalysis?.subNiche,
    ...(channel.popularVideos || []).flatMap(v => [v.title, ...(v.tags || [])])
  ].filter(Boolean).join(' ');

  const stop = new Set('a an and are as at be by cho của các cái con có để đi được for from hay how i in is it là làm me my new not of on or the this to trong video với về you your youtube shorts official full tập phim một những người khi nếu thì và vì'.split(' '));
  const phraseMatches = chunks.match(/[A-Za-zÀ-ỹ0-9][A-Za-zÀ-ỹ0-9'&+\- ]{3,50}/g) || [];
  const candidates: Record<string, number> = {};

  for (const raw of phraseMatches) {
    const cleaned = raw
      .replace(/[#|:\[\](){}!?.,"“”]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned || cleaned.length < 3) continue;
    const words = cleaned.split(' ').filter(w => w.length > 2 && !stop.has(w.toLowerCase()));
    if (!words.length) continue;
    const phrase = words.slice(0, 4).join(' ');
    if (phrase.length >= 3) candidates[phrase] = (candidates[phrase] || 0) + 2;
    for (let i = 0; i < words.length; i++) {
      const one = words[i];
      candidates[one] = (candidates[one] || 0) + 1;
      if (words[i + 1]) {
        const two = `${words[i]} ${words[i + 1]}`;
        candidates[two] = (candidates[two] || 0) + 2;
      }
    }
  }

  const sorted = Object.entries(candidates)
    .filter(([k]) => k.length >= 3 && k.length <= 42 && !/^\d+$/.test(k))
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  const fallback = [channel.title, channel.aiAnalysis?.overview?.niche, channel.aiAnalysis?.nicheAnalysis?.subNiche, ...(channel.popularVideos || []).map(v => v.title)]
    .filter(Boolean)
    .map(v => String(v).slice(0, 48));

  return Array.from(new Set([...sorted, ...fallback])).slice(0, max);
};

const getCompetitionLabel = (count: number) => count >= 8 ? 'Cao' : count >= 4 ? 'Trung bình' : 'Thấp';
const getPotentialLabel = (score: number, avgVph: number) => score >= 82 || avgVph >= 1000 ? 'Rất cao' : score >= 68 ? 'Cao' : score >= 52 ? 'Trung bình' : 'Thấp';


interface LibraryItemVideo extends VideoData {
  type: 'video';
}

interface LibraryItemChannel extends ChannelData {
  type: 'channel';
}

type LibraryItem = LibraryItemVideo | LibraryItemChannel;


const LOCAL_LIBRARY_KEY = 'yt_library_v2';

function getLibraryDocId(item: LibraryItem): string {
  return `${item.type}_${item.id}_${item.checkedAt || ''}`
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 180);
}

function readLocalLibrary(): LibraryItem[] {
  try {
    const saved = localStorage.getItem(LOCAL_LIBRARY_KEY);
    if (saved) return JSON.parse(saved);

    const oldSaved = localStorage.getItem('yt_library');
    if (oldSaved) {
      const oldData = JSON.parse(oldSaved);
      return oldData.map((item: any) => ({
        ...item,
        type: 'video',
        checkedAt: item.checkedAt || new Date().toISOString(),
        tags: item.tags || []
      }));
    }
  } catch (error) {
    console.warn('READ_LOCAL_LIBRARY_ERROR', error);
  }
  return [];
}

async function loadCloudLibrary(uid: string): Promise<LibraryItem[]> {
  const libraryRef = collection(db, 'users', uid, 'library');
  const snap = await getDocs(libraryRef);
  const items = snap.docs
    .map((d) => {
      const data = d.data() as any;
      return (data.item || data) as LibraryItem;
    })
    .filter((item: any) => item?.id && item?.type && item?.checkedAt);

  return items.sort((a, b) => {
    const at = new Date(a.checkedAt || 0).getTime();
    const bt = new Date(b.checkedAt || 0).getTime();
    return bt - at;
  });
}

async function saveCloudLibrary(uid: string, items: LibraryItem[]) {
  const libraryRef = collection(db, 'users', uid, 'library');
  const existing = await getDocs(libraryRef);
  const keepIds = new Set(items.map(getLibraryDocId));
  const batch = writeBatch(db);

  existing.docs.forEach((existingDoc) => {
    if (!keepIds.has(existingDoc.id)) {
      batch.delete(existingDoc.ref);
    }
  });

  items.forEach((item) => {
    const ref = doc(db, 'users', uid, 'library', getLibraryDocId(item));
    batch.set(ref, {
      item,
      type: item.type,
      itemId: item.id,
      title: item.title || '',
      checkedAt: item.checkedAt || new Date().toISOString(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });

  await batch.commit();
}

const Card = ({ children, className = "", id }: { children: React.ReactNode, className?: string, id?: string }) => (
  <div id={id} className={`bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden ${className}`}>
    {children}
  </div>
);

const SectionTitle = ({ children, icon: Icon, action }: { children: React.ReactNode, icon: any, action?: React.ReactNode }) => (
  <div className="flex items-center gap-3 mb-6">
    <div className="p-2 bg-sky-50 text-sky-600 rounded-lg">
      <Icon size={24} />
    </div>
    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex-1">{children}</h3>
    {action && <div>{action}</div>}
  </div>
);

const DataItem = ({ label, value, icon: Icon, fullWidth = false }: { label: string, value: string | React.ReactNode, icon?: any, fullWidth?: boolean }) => (
  <div className={`flex flex-col gap-2 p-4 bg-white border border-slate-200 rounded-xl hover:shadow-md transition-all ${fullWidth ? 'col-span-full' : ''}`}>
    <div className="flex items-center gap-2">
      {Icon && <Icon size={14} className="text-slate-400" />}
      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">{label}</span>
    </div>
    <div className="text-sm font-semibold text-slate-800 break-words leading-snug pl-0 mt-0.5">
      {typeof value === 'string' ? renderTextWithLinks(value) : (value || "Không có dữ liệu")}
    </div>
  </div>
);

const AssessmentCard = ({ title, icon: Icon, data, children }: { title: string, icon?: React.ElementType, data?: { comment?: string, summary?: string, strengths?: string, weaknesses?: string, suggestions?: string | string[] }, children?: React.ReactNode }) => {
  const commentText = data?.comment || data?.summary || "Đang phân tích...";
  const suggestions = data?.suggestions;
  
  return (
    <Card className="p-6 border-l-4 border-l-sky-500 bg-white shadow-sm relative group overflow-hidden h-full flex flex-col">
      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
         {Icon ? <Icon size={80} /> : <Sparkles size={80} />}
      </div>
      <div className="relative z-10 space-y-4 flex-1 flex flex-col">
        <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
          {Icon && <Icon size={16} className="text-sky-600" />} {title}
        </h4>
        {children}
        <p className="text-[13px] text-slate-800 font-medium leading-relaxed italic border-l-2 border-sky-100 pl-3 py-1 whitespace-pre-line">
           {commentText}
        </p>
        
        <div className="space-y-4 pt-2 flex-1">
          {data?.strengths && (
            <div className="space-y-1">
              <p className="text-[10px] font-black text-green-600 uppercase tracking-[0.2em] mb-1">Điểm mạnh:</p>
              <p className="text-[13px] font-semibold text-slate-900 leading-relaxed whitespace-pre-line">{data.strengths}</p>
            </div>
          )}
          
          {data?.weaknesses && (
            <div className="space-y-1">
              <p className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em] mb-1">Cần cải thiện:</p>
              <p className="text-[13px] font-semibold text-slate-900 leading-relaxed whitespace-pre-line">{data.weaknesses}</p>
            </div>
          )}

          {suggestions && (
            <div className="space-y-1 mt-auto">
              <p className="text-[10px] font-black text-sky-600 uppercase tracking-[0.2em] mb-1">GỢI Ý:</p>
              {Array.isArray(suggestions) ? (
                <ul className="space-y-1">
                  {suggestions.map((s, i) => (
                    <li key={i} className="text-xs font-black text-slate-900 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100 italic whitespace-pre-line">
                      "{s}"
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs font-black text-slate-900 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100 italic whitespace-pre-line">
                  "{suggestions}"
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

const GrowthCard = ({ title, content, icon: Icon, color }: { title: string, content: string | undefined, icon: any, color: 'indigo' | 'blue' | 'green' | 'amber' }) => {
  const colors = {
    indigo: 'bg-sky-50 text-sky-600 border-sky-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    green: 'bg-green-50 text-green-600 border-green-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100'
  };

  return (
    <div className={`p-6 rounded-3xl border ${colors[color]} shadow-sm hover:shadow-md transition-shadow h-full flex flex-col`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded-xl ${colors[color]} border shadow-xs`}>
          <Icon size={18} />
        </div>
        <h5 className="text-sm font-black uppercase tracking-tight">{title}</h5>
      </div>
      <p className="text-[14px] text-slate-700 font-medium leading-relaxed italic">
        {renderTextWithLinks(content || "") || "Đang tổng hợp dữ liệu..."}
      </p>
    </div>
  );
};

// --- Main App Component ---

const CopyButton = ({ text, className = "", iconSize = 14, children, showText = false }: { text: string, className?: string, iconSize?: number, children?: React.ReactNode, showText?: boolean }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (copied) return;
    if (text) navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button onClick={handleCopy} className={className} title="Sao chép">
      {copied ? <CheckCircle2 size={iconSize} className="text-green-500" /> : <Copy size={iconSize} />}
      {showText && <span>{copied ? " ĐÃ COPY" : " COPY"}</span>}
      {children && <span className="ml-1">{children}</span>}
    </button>
  );
};

const renderFormattedText = (text: any) => {
  const safeText = String(text ?? "");
  if (!safeText) return safeText;
  if (!safeText.includes('**')) return safeText;
  const parts = safeText.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="text-slate-900">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
};

const renderAnalysisItem = (item: any, i: number, colorClass: string) => {
  let safeItem = "";

  if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
    safeItem = String(item);
  } else if (Array.isArray(item)) {
    safeItem = item.map((x) => String(x ?? "")).join(" - ");
  } else if (item && typeof item === "object") {
    safeItem =
      item.text ||
      item.content ||
      item.title ||
      item.summary ||
      item.description ||
      Object.values(item).map((x) => String(x ?? "")).join(" - ");
  }

  safeItem = String(safeItem || "-").trim();
  const isNested = safeItem.startsWith('-');
  const text = safeItem.replace(/^-\s*/, '').trim() || "-";

  return (
    <li key={i} className={`flex gap-3 group ${isNested ? 'ml-6' : ''}`}>
      <div className={`shrink-0 w-1.5 h-1.5 rounded-full ${colorClass} mt-2 group-hover:scale-150 transition-transform ${isNested ? 'bg-opacity-50' : ''}`} />
      <p className="text-sm text-slate-700 font-medium leading-relaxed">
        {renderFormattedText(text)}
      </p>
    </li>
  );
};

const AnalysisProgressBox = ({ kind, percent }: { kind: 'video' | 'channel'; percent: number }) => {
  const label = kind === 'channel' ? 'Đang phân tích kênh' : 'Đang phân tích video';
  const safePercent = Math.max(1, Math.min(99, Math.round(percent || 1)));

  return (
    <div className="mb-5 rounded-2xl border border-sky-100 bg-sky-50/80 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 text-sky-700 font-black text-sm uppercase tracking-wide">
          <Loader2 size={18} className="animate-spin" />
          <span>{label} {safePercent}%</span>
        </div>
        <span className="text-[11px] font-bold text-slate-500">Dữ liệu YouTube đã hiển thị trước</span>
      </div>
      <div className="h-2.5 rounded-full bg-white border border-sky-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-500"
          style={{ width: `${safePercent}%` }}
        />
      </div>
    </div>
  );
};


export default function App() {
  const { user, profile, loading: authLoading, isValidUser, isPremium, isTrialActive, getRemainingAccessTime, getAccessStatus } = useAuth();
  const [showAuthPortal, setShowAuthPortal] = useState(false);
  const [showAccountPopup, setShowAccountPopup] = useState(false);
  const [authView, setAuthView] = useState<'login'>('login');

  const openPaymentPage = () => {
    const params = new URLSearchParams();
    if (user?.uid) params.set("uid", user.uid);
    if (user?.email || profile?.email) params.set("email", user?.email || profile?.email || "");
    params.set("returnUrl", window.location.origin + "/");
    window.location.href = "https://khaikeyword.vanthemmo.com/pay.html?" + params.toString();
  };

  const openAuthPortal = (view: 'login' = 'login') => {
    setAuthView(view);
    setShowAuthPortal(true);
  };

  const openApiSettings = () => {
    setShowApiKeySettings(true);
  };

  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState(() => {
    const saved = localStorage.getItem('yt_api_key');
    return saved && saved.trim() ? saved : DEFAULT_YT_API_KEY;
  });
  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    const saved = localStorage.getItem('gemini_api_key');
    return saved && saved.trim() ? saved : SYSTEM_FALLBACK_GEMINI_KEY;
  });
  const [selectedGeminiModel, setSelectedGeminiModel] = useState<GeminiModelId>(() => {
    const saved = localStorage.getItem('gemini_model') as GeminiModelId | null;
    return normalizeGeminiModel(saved);
  });
  
  useEffect(() => {
    localStorage.setItem('gemini_api_key', geminiApiKey);
  }, [geminiApiKey]);

  useEffect(() => {
    localStorage.setItem('gemini_model', selectedGeminiModel);
  }, [selectedGeminiModel]);

  useEffect(() => {
    localStorage.setItem('yt_api_key', apiKey);
  }, [apiKey]);
  const [showKey, setShowKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [checkingYoutubeKeys, setCheckingYoutubeKeys] = useState(false);
  const [checkingGeminiKeys, setCheckingGeminiKeys] = useState(false);
  const [youtubeKeyCheckResults, setYoutubeKeyCheckResults] = useState<Array<{ key: string; ok: boolean; reason: string }>>([]);
  const [geminiKeyCheckResults, setGeminiKeyCheckResults] = useState<Array<{ key: string; ok: boolean; reason: string }>>([]);
  const [showKeyCheckResults, setShowKeyCheckResults] = useState(true);

  const parseKeyLines = (raw: string) => Array.from(new Set(
    String(raw || '')
      .split(/[\n,;]+/)
      .map((key) => key.trim())
      .filter((key) => key.length > 10)
  ));

  const maskKeyForUi = (key: string) => {
    const safe = String(key || '').trim();
    if (safe.length <= 10) return safe || 'Không có key';
    return `${safe.slice(0, 7)}...${safe.slice(-5)}`;
  };

  const explainKeyError = (raw: string, type: 'youtube' | 'gemini') => {
    const message = String(raw || '').trim();
    if (!message) return 'Không xác định được lỗi.';

    if (/API key not valid|invalid api key|keyInvalid|bad request|400/i.test(message)) {
      return 'Key sai hoặc không hợp lệ.';
    }

    if (/has not been used|disabled|SERVICE_DISABLED|not enabled|API has not been used/i.test(message)) {
      return type === 'gemini'
        ? 'Chưa bật Generative Language API cho project của key này.'
        : 'Chưa bật YouTube Data API v3 cho project của key này.';
    }

    if (/denied access|PERMISSION_DENIED|permission|403/i.test(message)) {
      return type === 'gemini'
        ? 'Key/project chưa được quyền dùng model đang chọn. Hãy đổi model hoặc đổi key.'
        : 'Key/project bị chặn quyền truy cập YouTube Data API.';
    }

    if (/quota|rate|429|Too Many Requests|RESOURCE_EXHAUSTED/i.test(message)) {
      return 'Key đã hết quota hoặc bị giới hạn tốc độ. Hãy dùng key khác.';
    }

    if (/billing|payment/i.test(message)) {
      return 'Project cần bật thanh toán hoặc đang bị giới hạn dịch vụ.';
    }

    if (/network|failed to fetch|load failed/i.test(message)) {
      return 'Không kết nối được API. Kiểm tra mạng hoặc thử lại.';
    }

    return 'Key chưa dùng được. Hãy kiểm tra API, quyền model hoặc quota.';
  };

  const checkYoutubeKeys = async () => {
    const keys = parseKeyLines(apiKey);
    setYoutubeKeyCheckResults([]);
    setShowKeyCheckResults(true);
    if (!keys.length) {
      setYoutubeKeyCheckResults([{ key: '', ok: false, reason: 'Chưa có YouTube API Key để kiểm tra.' }]);
      return;
    }

    setCheckingYoutubeKeys(true);
    const results: Array<{ key: string; ok: boolean; reason: string }> = [];
    for (const key of keys) {
      try {
        const testUrl = `https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ&key=${encodeURIComponent(key)}`;
        const res = await fetch(testUrl);
        const text = await res.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch { data = null; }

        if (res.ok && Array.isArray(data?.items)) {
          results.push({ key, ok: true, reason: 'Hợp lệ: lấy được dữ liệu YouTube.' });
        } else {
          const raw = data?.error?.message || data?.error?.status || text || `HTTP ${res.status}`;
          results.push({ key, ok: false, reason: explainKeyError(raw, 'youtube') });
        }
      } catch (err: any) {
        results.push({ key, ok: false, reason: explainKeyError(err?.message || String(err), 'youtube') });
      }
      setYoutubeKeyCheckResults([...results]);
    }
    setCheckingYoutubeKeys(false);
  };

  const checkGeminiKeys = async () => {
    const keys = parseKeyLines(geminiApiKey);
    setGeminiKeyCheckResults([]);
    setShowKeyCheckResults(true);
    if (!keys.length) {
      setGeminiKeyCheckResults([{ key: '', ok: false, reason: 'Chưa có Gemini API Key để kiểm tra.' }]);
      return;
    }

    setCheckingGeminiKeys(true);
    const results: Array<{ key: string; ok: boolean; reason: string }> = [];
    for (const key of keys) {
      let passed = false;
      let lastReason = '';
      for (const model of buildGeminiFallbackQueue(selectedGeminiModel)) {
        try {
          const res = await fetch(buildGeminiAnalyzeUrl(model), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Gemini-Model': model
            },
            body: JSON.stringify({
              apiKey: key,
              model,
              prompt: 'Trả lời đúng 1 chữ: OK'
            })
          });
          const text = await res.text();
          let data: any = null;
          try { data = JSON.parse(text); } catch { data = null; }

          if (res.ok && data?.success && String(data?.text || '').trim()) {
            const modelNote = model === selectedGeminiModel
              ? `Hợp lệ: dùng được model ${model}.`
              : `Hợp lệ với model ${model}. Model đang chọn có thể chưa được project này hỗ trợ.`;
            results.push({ key, ok: true, reason: modelNote });
            passed = true;
            break;
          }

          const raw = data?.error || data?.detail?.error?.message || data?.message || text || `HTTP ${res.status}`;
          lastReason = explainKeyError(raw, 'gemini');
        } catch (err: any) {
          lastReason = explainKeyError(err?.message || String(err), 'gemini');
        }
      }

      if (!passed) results.push({ key, ok: false, reason: lastReason || 'Key không gọi được Gemini API.' });
      setGeminiKeyCheckResults([...results]);
    }
    setCheckingGeminiKeys(false);
  };

  const checkAllApiKeys = async () => {
    await Promise.all([checkYoutubeKeys(), checkGeminiKeys()]);
  };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [channelData, setChannelData] = useState<ChannelData | null>(null);
  const [channelUrl, setChannelUrl] = useState('');
  const [showScrollTop, setShowScrollTop] = useState(false);
  
  // API Keys State (formerly Admin)
  const [showApiKeySettings, setShowApiKeySettings] = useState(false);

  const handleReset = () => {
    setUrl('');
    setChannelUrl('');
    setVideoData(null);
    setChannelData(null);
    setError(null);
    setLoading(false);
    setActiveTab('checker');
    setSearchQuery('');
  };

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    localStorage.setItem('yt_api_key', apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem('gemini_api_key', geminiApiKey);
  }, [geminiApiKey]);

  const [library, setLibrary] = useState<LibraryItem[]>(() => readLocalLibrary());
  const [libraryCloudReady, setLibraryCloudReady] = useState(false);
  const libraryHydratingRef = useRef(false);
  useEffect(() => {
    let cancelled = false;

    async function hydrateLibraryFromCloud() {
      if (!user?.uid) {
        setLibraryCloudReady(false);
        setLibrary(readLocalLibrary());
        return;
      }

      libraryHydratingRef.current = true;
      setLibraryCloudReady(false);

      try {
        const cloudItems = await loadCloudLibrary(user.uid);
        if (cancelled) return;

        if (cloudItems.length > 0) {
          setLibrary(cloudItems);
          localStorage.setItem(LOCAL_LIBRARY_KEY, JSON.stringify(cloudItems));
        } else {
          const localItems = readLocalLibrary();
          setLibrary(localItems);
        }
      } catch (error) {
        // Firestore cloud library bị chặn quyền thì bỏ qua.
        // App vẫn dùng thư viện localStorage trên trình duyệt, không hiện popup lỗi.
        if (!cancelled) setLibrary(readLocalLibrary());
      } finally {
        if (!cancelled) {
          libraryHydratingRef.current = false;
          setLibraryCloudReady(true);
        }
      }
    }

    hydrateLibraryFromCloud();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_LIBRARY_KEY, JSON.stringify(library));
    } catch (error) {
      console.warn('SAVE_LOCAL_LIBRARY_ERROR', error);
    }

    if (!user?.uid || !libraryCloudReady || libraryHydratingRef.current) return;

    const timer = window.setTimeout(async () => {
      try {
        await saveCloudLibrary(user.uid, library);
      } catch (error) {
        // Không hiện thông báo lỗi Firestore để tránh làm phiền người dùng.
        // Dữ liệu vẫn được lưu localStorage trên trình duyệt.
      }
    }, 700);

    return () => window.clearTimeout(timer);
  }, [library, user?.uid, libraryCloudReady]);

  const [activeTab, setActiveTab] = useState<'checker' | 'monetization'>('checker');
  const [searchQuery, setSearchQuery] = useState('');
  const [showGuide, setShowGuide] = useState(true);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedChannelLink, setCopiedChannelLink] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [analysisProgress, setAnalysisProgress] = useState<{ kind: 'video' | 'channel'; percent: number } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSuccessRedirect, setIsSuccessRedirect] = useState(false);
  const [embeddedVideo, setEmbeddedVideo] = useState<{ id: string; title: string } | null>(null);

  // Tự đồng bộ PRO sau khi quay về từ trang thanh toán.
  // Dùng để xử lý cả đơn cũ đã thanh toán nhưng bị thiếu uid.
  useEffect(() => {
    if (!user?.uid) return;

    const params = new URLSearchParams(window.location.search);
    const paid = params.get("paid");
    const orderCode = params.get("orderCode") || params.get("content");

    if (paid !== "success" || !orderCode) return;

    let stopped = false;

    async function syncPaidOrderToCurrentUser() {
      try {
        setIsSuccessRedirect(true);
        toast.loading("Đang kích hoạt PRO cho tài khoản Google hiện tại...", { id: "sync-pro" });

        const statusUrl =
          `/api/payment-status?orderCode=${encodeURIComponent(orderCode)}` +
          `&uid=${encodeURIComponent(user.uid)}` +
          `&email=${encodeURIComponent(user.email || profile?.email || "")}` +
          `&plan=${encodeURIComponent(params.get("plan") || "")}`;

        const res = await fetch(statusUrl);
        const data = await res.json();

        if (stopped) return;

        const didUpgrade = Boolean(data.userUpdated || data.upgraded);

        if (data.success && data.paid && didUpgrade) {
          const proData = {
            isPro: true,
            planId: data.planId || "1m",
            planName: data.planName || "Gói Premium",
            orderCode,
            amount: data.amount || 0,
            activatedAt: new Date().toISOString(),
            expiresAt: data.expiresAt || null,
          };

          localStorage.setItem("YT_TOOL_PRO", JSON.stringify(proData));
          localStorage.setItem("YT_TOOL_IS_PRO", "true");

          toast.success("Thanh toán thành công. Tài khoản đã được nâng cấp PRO!", { id: "sync-pro" });
          setSuccessMessage("✅ Thanh toán thành công. Tài khoản đã được nâng cấp PRO.");

          setTimeout(() => {
            window.history.replaceState({}, document.title, window.location.pathname);
            window.location.reload();
          }, 1200);
        } else if (data.success && data.paid && !didUpgrade) {
          toast.error("Đã nhận tiền nhưng chưa cập nhật được UID tài khoản.", { id: "sync-pro" });
        } else {
          toast.error(data.message || "Chưa xác nhận được thanh toán.", { id: "sync-pro" });
        }
      } catch (err) {
        console.error("SYNC_PRO_ERROR:", err);
        toast.error("Lỗi đồng bộ PRO sau thanh toán.", { id: "sync-pro" });
      } finally {
        if (!stopped) setIsSuccessRedirect(false);
      }
    }

    syncPaidOrderToCurrentUser();

    return () => {
      stopped = true;
    };
  }, [user?.uid, user?.email]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (loading) {
      setLoadingProgress(0);
      interval = setInterval(() => {
        setLoadingProgress((prev) => {
          if (prev < 40) return prev + Math.floor(Math.random() * 5) + 3;
          if (prev < 75) return prev + Math.floor(Math.random() * 3) + 2;
          if (prev < 95) return prev + Math.floor(Math.random() * 2) + 1;
          if (prev < 98) return prev + 1;
          return prev;
        });
      }, 500);
    } else {
      setLoadingProgress(100);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const startBackgroundAnalysisProgress = (kind: 'video' | 'channel') => {
    setAnalysisProgress({ kind, percent: 8 });
    const timer = window.setInterval(() => {
      setAnalysisProgress((prev) => {
        if (!prev || prev.kind !== kind) return prev;
        if (prev.percent < 35) return { ...prev, percent: prev.percent + 7 };
        if (prev.percent < 70) return { ...prev, percent: prev.percent + 4 };
        if (prev.percent < 92) return { ...prev, percent: prev.percent + 2 };
        return prev;
      });
    }, 650);
    return () => window.clearInterval(timer);
  };

  const finishBackgroundAnalysisProgress = (kind: 'video' | 'channel') => {
    setAnalysisProgress((prev) => prev && prev.kind === kind ? { ...prev, percent: 100 } : prev);
    window.setTimeout(() => {
      setAnalysisProgress((prev) => prev && prev.kind === kind ? null : prev);
    }, 650);
  };

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Auto-save library & api key
  {/* Auth Gate Strategy: Block main actions if not valid user */}
  const checkAccess = () => {
    if (!user) {
      openAuthPortal('login');
      return false;
    }

    if (!isValidUser()) {
      toast.error("Tài khoản đã hết thời gian dùng thử. Vui lòng nâng cấp gói để tiếp tục sử dụng.", { duration: 5000 });
      openPaymentPage();
      return false;
    }

    return true;
  };

  useEffect(() => {
    localStorage.setItem('yt_api_key', apiKey);
  }, [apiKey]);

  const analyzeWithAI = async (data: any): Promise<{ ai: AIAnalysis, seo: SEOSuggestions }> => {
    try {
      // Tối ưu tốc độ: không gửi ảnh thumbnail lên bước phân tích nền.
      // Dữ liệu YouTube API vẫn đủ để phân tích nhanh; thumbnail URL/metadata đã nằm trong prompt.
      const inlineData = null;

      const activeKey = geminiApiKey || SYSTEM_FALLBACK_GEMINI_KEY;
      if (!activeKey || activeKey.length < 10) {
        throw new Error("Chưa cấu hình Gemini API Key hoặc Key không hợp lệ. Vui lòng vào Cài đặt để kiểm tra.");
      }

      console.log("Cố gắng gọi Gemini API với Key:", activeKey.substring(0, 5) + "..." + activeKey.substring(activeKey.length - 4), "| Model:", selectedGeminiModel);

      const prompt = `Bạn là một CHUYÊN GIA AUDIT YOUTUBE. Hãy phân tích video này thật sâu, chi tiết, thực tế và thẳng thắn. Trả về JSON tiếng Việt 100%. Dùng từ ngữ phản hồi, góp ý nhẹ nhàng mang tính xây dựng cao (Dùng các từ như "Hạn chế", "Còn thiếu sót", "Điểm cần cải thiện", "Điểm yếu" thay vì dùng các từ nặng nề như "Lỗi", "Tệ", 100% không được dùng từ "lỗi").
      HÃY ĐẢM BẢO TRẢ VỀ ĐẦY ĐỦ CÁC TRƯỜNG: topicAnalysis, contentAnalysisList (8 ý), styleAnalysisList (8 ý), thumbnailAnalysis, titleAnalysis, descriptionAnalysis, tagsHashtagsAnalysis, pinnedCommentAnalysis, strengthsWeaknesses (mảng strengths và weaknesses), conclusionSummary (finalVerdict, currentStatus, biggestWeakness, top3Fixes).

      YÊU CẦU ĐỘ CHI TIẾT BẮT BUỘC:
      - Với từng mục titleAnalysis, descriptionAnalysis, thumbnailAnalysis, tagsHashtagsAnalysis, topicAnalysis: comment phải 2-3 câu cụ thể, không viết chung chung.
      - strengths phải có đúng 2-3 ý, mỗi ý 1 dòng, bắt đầu bằng ký hiệu ✓ và nêu rõ tác động.
      - weaknesses phải có đúng 2-3 ý, mỗi ý 1 dòng, bắt đầu bằng ký hiệu • và nêu rõ cần sửa gì.
      - suggestions phải có 2-4 gợi ý thực thi cụ thể, ưu tiên câu có thể copy dùng ngay.
      - contentAnalysisList phải có 8 ý, mỗi ý dài 18-35 từ, phân tích rõ hook, cấu trúc, độ tin cậy, retention, CTA, tính thực tế, mức phù hợp người xem và rủi ro bỏ sót.
      - styleAnalysisList phải có 8 ý, mỗi ý dài 18-35 từ, phân tích rõ nhịp dựng, giọng điệu, hình ảnh, cách trình bày, mức chuyên nghiệp, sự rõ ràng và cảm giác người xem.
      - strengthsWeaknesses.strengths trả đúng 2 ý nổi bật nhất, mỗi point 8-16 từ, impact 12-25 từ.
      - strengthsWeaknesses.weaknesses trả đúng 2 vấn đề quan trọng nhất, mỗi point 8-16 từ, fix 12-25 từ.
      - Không trả câu quá ngắn kiểu 1 dòng chung chung như "Tiêu đề tốt" hoặc "Cần tối ưu".
      BẮT BUỘC TRẢ VỀ ĐÚNG SCHEMA JSON NÀY, không đổi tên field:
      {
        "topicAnalysis": {"summary": "string", "strengths": "string", "weaknesses": "string", "suggestions": "string"},
        "contentAnalysisList": ["string"],
        "styleAnalysisList": ["string"],
        "thumbnailAnalysis": {"comment": "string", "strengths": "string", "weaknesses": "string", "suggestions": "string"},
        "titleAnalysis": {"comment": "string", "strengths": "string", "weaknesses": "string", "suggestions": ["string"]},
        "descriptionAnalysis": {"comment": "string", "strengths": "string", "weaknesses": "string", "suggestions": "string"},
        "tagsHashtagsAnalysis": {"comment": "string", "strengths": "string", "weaknesses": "string", "suggestions": "string", "currentTagsGood": ["string"], "tagsToRemove": ["string"], "tagsToAdd": ["string"]},
        "pinnedCommentAnalysis": {"hasPinnedComment": false, "feedback": "string", "suggestion": "string"},
        "strengthsWeaknesses": {"strengths": [{"point":"string","impact":"string"}], "weaknesses": [{"point":"string","fix":"string"}]},
        "conclusionSummary": {"currentStatus":"string","biggestWeakness":"string","top3Fixes":["string"],"finalVerdict":"string"},
        "seo": {"titles":["string"],"tags":["string"],"hashtags":["string"],"description":"string","primaryKeyword":"string"}
      }
      
      DỮ LIỆU THỰC TẾ TỪ YOUTUBE API (Hãy bám sát 100% dữ liệu này):
      - Tiêu đề: ${data.title}
      - Kênh: ${data.channelTitle} (ID: ${data.channelId})
      - Lượt xem: ${data.statistics?.viewCount}, Lượt Like: ${data.statistics?.likeCount}, Lượt bình luận: ${data.statistics?.commentCount}
      - Mô tả (toàn bộ nội dung): ${data.description.substring(0, 3000)}
      - Dàn Tags (từ khoá) Video: ${JSON.stringify(data.tags)}
      - 5 Bình luận hàng đầu: ${JSON.stringify(data.comments?.slice(0, 5))}
      
      PHÂN TÍCH BÌNH LUẬN:
      - Nếu có 3-5 bình luận thật, hãy nhận xét xu hướng cảm xúc/tương tác từ các bình luận đó.
      - pinnedCommentAnalysis.feedback phải nói rõ hiện có/chưa có bình luận ghim và tình trạng tương tác.
      - pinnedCommentAnalysis.suggestion phải là 1-2 câu gợi ý bình luận ghim có thể dùng ngay.

      CHÚ Ý: Trả về JSON chuẩn, không có cú pháp Markdown bọc ngoài. Nếu Thumbnail đã được cung cấp dưới dạng inlineData, hãy phân tích nó.
      Nếu không đủ dữ liệu cho trường nào, vẫn phải ghi nhận xét cụ thể dựa trên metadata, không được để trống hoặc chỉ ghi dấu gạch ngang.`;

      const result = await callGeminiAnalyze({
        apiKey: activeKey,
        prompt,
        inlineData,
        selectedModel: selectedGeminiModel
      });

      const responseText = result.text || "";
      const parsed = extractJsonObject(responseText);
      const normalized = normalizeVideoAnalysisPayload(parsed);
      console.log("Gemini video modelUsed:", result.modelUsed);
      return normalized;
    } catch (e: any) {
      console.error("AI Analysis Error:", e);
      let errorMsg = e.message || "Lỗi không xác định";
      
      if (errorMsg.includes("429") || errorMsg.toLowerCase().includes("quota") || errorMsg.toLowerCase().includes("too many requests")) {
        errorMsg = "Hết hạn mức sử dụng (Quota Exceeded). Vui lòng cấu hình API Key của riêng bạn trong Cài đặt hoặc chờ vài phút rồi thử lại.";
        toast.error(errorMsg, { duration: 6000 });
      } else {
        toast.error(`Lỗi AI: ${errorMsg}`);
      }
      
      // Fallback
      return {
        ai: {
          contentOverview: { focus: "Thiếu sót phân tích", value: "-", type: "-", clarity: "-", alignment: "-", detailedAnalysis: "Không thể thực hiện phân tích ngay lúc này." },
          thumbnailAnalysis: { strengths: "-", weaknesses: "-", suggestions: "-", comment: "-" },
          titleAnalysis: { strengths: "-", weaknesses: "-", suggestions: [], comment: "-" },
          descriptionAnalysis: { strengths: "-", weaknesses: "-", suggestions: "-", comment: "-" },
          tagsHashtagsAnalysis: { strengths: "-", weaknesses: "-", suggestions: "-", comment: "-" },
          topicAnalysis: { summary: "-", strengths: "-", weaknesses: "-", suggestions: "-" },
          contentAnalysisList: [],
          styleAnalysisList: [],
          strengthsWeaknesses: { strengths: [], weaknesses: [] },
          conclusionSummary: { currentStatus: "-", biggestWeakness: "-", top3Fixes: [], finalVerdict: "-" }
        },
        seo: { titles: [], tags: [], hashtags: [], description: "", primaryKeyword: "" }
      };
    }
  };

  const analyzeChannelWithAI = async (data: ChannelData): Promise<ChannelAIAnalysis> => {
    try {
      // BƯỚC MỚI: Kiểm tra kiếm tiền thật từ server (Dữ liệu trang YouTube)
      let realMonetization = false;
      try {
        const handle = data.customUrl || "";
        const checkUrl = handle.startsWith("@") 
          ? `https://www.youtube.com/${handle}` 
          : `https://www.youtube.com/channel/${data.id}`;
        
        const res = await fetch(`/api/check-monetization?url=${encodeURIComponent(checkUrl)}`);
        const monetText = await res.text();
        let monetData: any = null;
        try {
          monetData = JSON.parse(monetText);
        } catch {
          console.warn("check-monetization không trả JSON, bỏ qua kiểm tra kiếm tiền thật:", monetText.slice(0, 200));
        }
        realMonetization = !!monetData?.isMonetized;
      } catch (e) {
        console.error("Real check failed:", e);
      }

      // Tối ưu tốc độ: không gửi ảnh thumbnail lên bước phân tích nền.
      // Dữ liệu YouTube API vẫn đủ để phân tích nhanh; thumbnail URL/metadata đã nằm trong prompt.
      const inlineData = null;

      const activeKey = geminiApiKey || SYSTEM_FALLBACK_GEMINI_KEY;
      if (!activeKey || activeKey.length < 10) {
        throw new Error("Chưa cấu hình Gemini API Key hoặc Key không hợp lệ.");
      }
      
      console.log("Cố gắng gọi Gemini API với Key:", activeKey.substring(0, 5) + "..." + activeKey.substring(activeKey.length - 4), "| Model:", selectedGeminiModel);

      // --- BƯỚC PHÂN TÍCH THẺ & TỪ KHÓA (Logic Thực Tế) ---
      const stopWords = new Set(['và', 'của', 'là', 'cho', 'với', 'the', 'with', 'build', 'video', 'channel', 'in', 'on', 'at', 'an', 'a', 'to', 'for', 'of', 'and', 'is', 'are', 'tại', 'về', 'một', 'những', 'các', 'này', 'đó', 'this', 'that', 'these', 'those']);
      
      const channelKeywords = data.brandingSettings?.channel?.keywords 
        ? data.brandingSettings.channel.keywords.split('"').filter(k => k.trim()).flatMap(k => k.split(' '))
        : [];
      
      const tagFreq: Record<string, number> = {};
      const kwFreq: Record<string, number> = {};
      
      // 1. Xử lý Tags (Tần suất thật từ 15 video)
      data.popularVideos?.forEach(v => {
        v.tags?.forEach(tag => {
          const t = tag.toLowerCase().trim();
          if (t) tagFreq[t] = (tagFreq[t] || 0) + 1;
        });
      });
      
      const finalTopTags = Object.entries(tagFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([name, count]) => ({ name, count }));
        
      // 2. Xử lý Từ khóa (Title + Tag + Channel Keywords với trọng số)
      const processWords = (text: string, weight: number = 1) => {
        const words = text.toLowerCase()
          .replace(/[^\w\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/g, ' ')
          .split(/\s+/)
          .filter(mw => mw.length > 2 && !stopWords.has(mw));
          
        words.forEach(w => {
          kwFreq[w] = (kwFreq[w] || 0) + weight;
        });
      };
      
      // Trọng số x5 cho keywords định hướng của kênh
      channelKeywords.forEach(kw => processWords(kw, 5));
      
      data.popularVideos?.forEach(v => {
        processWords(v.title, 1);
        v.tags?.forEach(tag => processWords(tag, 1));
      });
      
      const finalTopKeywords = Object.entries(kwFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));

      // --- KẾT THÚC PHÂN TÍCH ---

      const recentVideosList = data.popularVideos?.map((v, i) => 
        `${i+1}. Tiêu đề: ${v.title} | Lượt xem: ${v.viewCount}`
      ).join('\n') || 'Không có dữ liệu video gần đây';

      const prompt = `Bạn là CHUYÊN GIA KHÁM KÊNH YOUTUBE. Hãy phân tích kênh sau một cách nghiêm túc, chi tiết, dựa trên số liệu thực tế. TUYỆT ĐỐI KHÔNG ĐOÁN MÒ. Tất cả các ô nhận xét phải viết đủ ý, không trả câu quá ngắn hoặc chung chung.

      DỮ LIỆU KÊNH (Dữ liệu thật):
      - Tên kênh: ${data.title}
      - Link: https://youtube.com/${data.customUrl}
      - Số Sub: ${data.statistics.subscriberCount}
      - Tổng view: ${data.statistics.viewCount}
      - Quốc gia: ${data.brandingSettings?.channel?.country || 'Không rõ'}
      - Các Topic lấy từ API: ${data.topicDetails?.topicCategories?.join(', ') || 'N/A'}
      - Các thẻ (Tags) hàng đầu: ${finalTopTags.map(t => t.name).join(', ')}
      - Từ khóa chủ đạo: ${finalTopKeywords.map(k => k.name).join(', ')}
      - Mô tả kênh đầy đủ: "${data.description || 'Trống'}"
      
      DANH SÁCH VIDEO GẦN ĐÂY:
      ${recentVideosList}
      
      QUY TẮC PHÂN TÍCH NGUỒN GỐC NỘI DUNG:
      - CHỈ xác định là Tự động (isDetected: true) nếu dữ liệu (titles/tags/stats) cho thấy đây là kênh tổng hợp máy móc, video tĩnh, hoặc nội dung vô hồn hàng loạt.
      - Nếu kênh có nội dung về: Review, Đánh giá sản phẩm, Vlog, Trải nghiệm, Trên tay, Tin tức có biên tập -> Đây là nội dung GIÁ TRỊ THẬT, hãy đặt isDetected: false.
      - Đặc biệt: Các kênh Review công nghệ (như MC Studio) là tâm huyết của người làm, KHÔNG được liệt vào nội dung tự động máy móc.
      - Nêu giải pháp tránh "nội dung không trung thực" CHỈ KHI thực sự dùng công cụ hỗ trợ để tạo hình ảnh/giọng nói giả mạo.

      YÊU CẦU ĐỘ CHI TIẾT:
      - Mỗi trường analysis/feedback/advice phải có tối thiểu 3-5 câu cụ thể, bám vào số liệu Dữ liệu đã cung cấp.
      - Phần overview và nicheAnalysis phải kết hợp 2 nguồn: dữ liệu thật Dữ liệu (sub, view, video, topic, title, tag, mô tả) + phân tích chiến lược. Không viết chung chung.
      - Phần improvement phải đưa ra hành động thực thi rõ: sửa gì, vì sao sửa, ưu tiên theo dữ liệu nào, làm trong hôm nay/tháng này/30 ngày ra sao.
      - descriptionFeedback.strengths và weaknesses mỗi trường có 2-3 ý, có thể xuống dòng.
      - improvement.urgent, optimizeLater, strategy30Days, conclusion.verdict phải đủ chi tiết để chủ kênh làm theo ngay.
      - Không dùng tiếng Anh nếu dữ liệu gốc không bắt buộc.

      TRẢ VỀ CHÍNH XÁC JSON NÀY (Không có chú thích):
      {
        "overview": {
          "niche": "Ngách chính, nêu rõ kênh đang thuộc nhóm chủ đề nào và vì sao dựa trên title/tag/video",
          "mainContent": "Phân tích nội dung cốt lõi thật chi tiết dựa trên các video gần đây và video nhiều view",
          "targetAudience": "Người xem mục tiêu, độ tuổi/nhu cầu/hành vi xem phù hợp",
          "strengths": "2-3 điểm mạnh dựa trên số liệu thật và phong cách nội dung",
          "weaknesses": "2-3 điểm yếu/rủi ro dựa trên dữ liệu thật",
          "channelFormat": "Kênh tin tức/giáo dục/giải trí/vlog..."
        },
        "aiContentPolicy": {
          "isDetected": true_or_false,
          "analysis": "Nhận định kênh có dùng công cụ hỗ trợ tự động không? Dùng ở mức độ nào? Có rủi ro vi phạm chính sách 'Nội dung không trung thực' không?",
          "solutions": ["Giải pháp 1 để an toàn tuyệt đối", "Giải pháp 2 để tăng tính độc bản nội dung", "Cách dán nhãn nội dung theo chuẩn YouTube mới", "Chiến lược xây dựng lòng tin qua sự hiện diện thật", "Kiểm chứng thông tin đa nguồn tránh sai lệch", "Tối ưu hóa quy trình sản xuất nội dung chuyên nghiệp và an toàn"]
        },
        "seo": {
          "descriptionAnalysis": "Phân tích mô tả kênh: Đã chuẩn SEO chưa? Có đủ từ khóa chính chưa? Cần viết lại như thế nào cho hấp dẫn?",
          "tagFocusAdvice": "Góp ý về bộ thẻ hiện tại và bộ thẻ nên dùng để tăng đề xuất",
          "keywordOptimization": "Đề xuất những từ khóa quan trọng kênh nên thêm vào Title/Description"
        },
        "branding": {
          "logoFeedback": "Dựa trên ảnh Logo thực tế, hãy nhận xét về tính thẩm mỹ.",
          "bannerFeedback": "Dựa trên ảnh Banner thực tế."
        },
        "descriptionFeedback": {
          "strengths": "Tốt ở đâu",
          "weaknesses": "Yêu chỗ nào",
          "rewritten": "Viết lại mô tả"
        },
        "thumbnailFeedback": {
          "analysis": "Đánh giá thumbnail các video gần đây",
          "advice": "Lời khuyên chiến lược chi tiết, kết hợp dữ liệu Dữ liệu và phân tích định vị kênh"
        },
        "titleFeedback": {
          "analysis": "Review style title",
          "formulas": ["Công thức 1", "Công thức 2", "Công thức 3"],
          "samples": ["Mẫu 1", "Mẫu 2", "Mẫu 3"]
        },
        "nicheAnalysis": {
          "currentNiche": "Ngách đang làm",
          "subNiche": "Ngách phụ tiềm năng",
          "competition": "Thấp/Trung bình/Cao",
          "growthPotential": "Thấp/Trung bình/Cao",
          "advice": "Lời khuyên"
        },
        "performance": {
          "analysis": "Đánh giá tỷ lệ view/sub/video"
        },
        "monetization": {
          "probability": "Cao/Trung bình/Thấp",
          "estimatedRPM": "Dự đoán RPM",
          "analysis": "Phân tích khả năng kiếm tiền",
          "isPotentiallyMonetized": true
        },
        "improvement": {
          "urgent": "Sửa ngay, ghi rõ việc nào phải làm hôm nay và lý do dựa trên dữ liệu",
          "optimizeLater": "Làm dần, ghi rõ kế hoạch tối ưu trong tháng này và dữ liệu nào làm căn cứ",
          "strategy30Days": ["Ngày 1-5: việc cụ thể + lý do", "Ngày 6-15: việc cụ thể + mục tiêu", "Ngày 16-30: việc cụ thể + chỉ số cần theo dõi"],
          "nextIdeas": ["Video 1", "Video 2", "Video 3", "Video 4", "Video 5"]
        },
        "conclusion": {
          "potential": "Có tiềm năng không",
          "focusPoint": "Điểm tập trung cốt lõi",
          "verdict": "Kết luận"
        }
      }`;

      const contents = inlineData ? {
        parts: [
          { inlineData },
          { text: prompt }
        ]
      } : prompt;

      const result = await callGeminiAnalyze({
        apiKey: activeKey,
        prompt,
        inlineData,
        selectedModel: selectedGeminiModel
      });

      const responseText = result.text || "";
      const analysisData = extractJsonObject(responseText);
      console.log("Gemini channel modelUsed:", result.modelUsed);

      const analysis: ChannelAIAnalysis = {
        ...normalizeChannelAnalysisPayload(analysisData),
        topTags: finalTopTags,
        topKeywords: finalTopKeywords
      } as ChannelAIAnalysis;

      // Ghi đè trạng thái dựa trên dữ liệu thật nếu có
      // SANITY CHECK: Điều kiện YPP 2026 (1000 sub + 4000h xem hoặc 10M view Shorts)
      const subCount = parseInt(data.statistics.subscriberCount) || 0;
      const totalViews = parseInt(data.statistics.viewCount) || 0;
      
      // Ước tính khả năng đạt điều kiện YPP
      const hasSubCondition = subCount >= 1000;
      const hasFanFundingCondition = subCount >= 500; // Mốc hỗ trợ thấp hơn (hội viên, super chat)
      
      // Vì API không trả về giờ xem công khai 12 tháng, ta dùng tổng view làm chỉ số phụ (ước tính)
      // Thường 4000h xem tương đương khoảng 100k-200k view video dài tùy retention
      const estimatedWatchTimePass = totalViews > 150000; 

      // YouTube Data API không công khai trạng thái bật kiếm tiền thật của kênh khác.
      // Vì vậy tool chỉ hiển thị 2 trạng thái dễ hiểu:
      // - BẬT KIẾM TIỀN: kênh có tín hiệu xác thực hoặc đã đủ điều kiện YPP ước tính.
      // - CHƯA BẬT KIẾM TIỀN: chưa đủ điều kiện tối thiểu theo dữ liệu công khai.
      const isActuallyMonetized = Boolean(realMonetization && hasSubCondition);
      const isLikelyMonetized = Boolean(isActuallyMonetized || (hasSubCondition && estimatedWatchTimePass));

      const monetizationStatusMsg = isLikelyMonetized ? 'BẬT KIẾM TIỀN' : 'CHƯA BẬT KIẾM TIỀN';

      return {
        ...analysis,
        isConfirmedMonetized: isLikelyMonetized,
        monetizationConfidence: isActuallyMonetized
          ? 'Cao (Xác thực thực tế)'
          : isLikelyMonetized
            ? 'Cao (Đủ điều kiện theo dữ liệu công khai)'
            : (hasFanFundingCondition ? 'Trung bình (Chưa đủ điều kiện quảng cáo)' : 'Thấp'),
        // @ts-ignore - Thêm status message tùy chỉnh
        monetizationStatusLabel: monetizationStatusMsg
      };

    } catch (e: any) {
      console.error("AI Channel Analysis Error:", e);
      let errorMsg = e.message || "Lỗi không xác định";
      
      if (errorMsg.includes("429") || errorMsg.toLowerCase().includes("quota") || errorMsg.toLowerCase().includes("too many requests")) {
        errorMsg = "Hết hạn mức sử dụng (Quota Exceeded). Vui lòng cấu hình API Key của riêng bạn trong Cài đặt hoặc chờ vài phút rồi thử lại.";
        toast.error(errorMsg, { duration: 6000 });
      } else {
        toast.error(`Lỗi phân tích kênh: ${errorMsg}`);
      }

      return {
        overview: { niche: "Thiếu sót", mainContent: "-", targetAudience: "-", strengths: "-", weaknesses: "-", channelFormat: "-" },
        branding: { logoFeedback: "-", bannerFeedback: "-" },
        descriptionFeedback: { strengths: "-", weaknesses: "-", rewritten: "-" },
        thumbnailFeedback: { analysis: "-", advice: "-" },
        titleFeedback: { analysis: "-", formulas: [], samples: [] },
        nicheAnalysis: { currentNiche: "-", subNiche: "-", competition: "-", growthPotential: "-", advice: "-" },
        performance: { analysis: "-" },
        monetization: { probability: "-", estimatedRPM: "-", analysis: "-", isPotentiallyMonetized: false },
        seo: { descriptionAnalysis: "-", tagFocusAdvice: "-", keywordOptimization: "-" },
        improvement: { urgent: "-", optimizeLater: "-", strategy30Days: [], nextIdeas: [] },
        conclusion: { potential: "-", focusPoint: "-", verdict: "-" },
        isConfirmedMonetized: false
      };
    }
  };

  const handleCheckVideo = async (overrideUrl?: string) => {
    if (!checkAccess()) return;
    setError(null);
    setLoading(true);
    const targetVideoUrl = overrideUrl || url;
    const videoId = extractVideoId(targetVideoUrl);

    if (!videoId) {
      setError("Link YouTube không hợp lệ. Vui lòng kiểm tra lại.");
      setLoading(false);
      return;
    }

    try {
      const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${apiKey}`;
      const response = await fetch(apiUrl);
      const data = await response.json();

      if (data.items && data.items.length > 0) {
        const item = data.items[0];
        const cat = CATEGORY_MAP[item.snippet.categoryId] || { en: "Unknown", vi: "Không xác định", desc: "Không có dữ liệu loại video này." };
        
        // Fetch channel info for country and custom URL
        let channelCountry = "Không rõ";
        let channelCustomUrl = "";
        try {
          const chanRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=brandingSettings,snippet&id=${item.snippet.channelId}&key=${apiKey}`);
          const chanData = await chanRes.json();
          if (chanData.items?.[0]) {
            if (chanData.items[0].brandingSettings?.channel?.country) {
              channelCountry = chanData.items[0].brandingSettings.channel.country;
            }
            if (chanData.items[0].snippet?.customUrl) {
              channelCustomUrl = chanData.items[0].snippet.customUrl;
            }
          }
        } catch (e) {
          console.warn("Could not fetch channel details");
        }

        // Fetch top comments to check for pinned comments
        let commentsList = [];
        try {
          const commentApiUrl = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=10&order=relevance&key=${apiKey}`;
          const commentRes = await fetch(commentApiUrl);
          const commentData = await commentRes.json();
          if (commentData.items) {
            commentsList = commentData.items.map((c: any) => ({
              textDisplay: c.snippet.topLevelComment.snippet.textDisplay,
              authorDisplayName: c.snippet.topLevelComment.snippet.authorDisplayName,
              authorChannelId: c.snippet.topLevelComment.snippet.authorChannelId.value,
              likeCount: c.snippet.topLevelComment.snippet.likeCount,
              publishedAt: c.snippet.topLevelComment.snippet.publishedAt
            }));
          }
        } catch (e) {
          console.warn("Could not fetch comments");
        }
        
        const baseData: Partial<VideoData> = {
          id: videoId,
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle,
          channelId: item.snippet.channelId,
          channelCustomUrl: channelCustomUrl,
          publishedAt: item.snippet.publishedAt,
          description: item.snippet.description,
          tags: item.snippet.tags || [],
          categoryId: item.snippet.categoryId,
          categoryName: cat.en,
          categoryVi: cat.vi,
          thumbnails: item.snippet.thumbnails,
          statistics: item.statistics,
          duration: item.contentDetails.duration,
          normalizedUrl: `https://www.youtube.com/watch?v=${videoId}`,
          checkedAt: new Date().toISOString(),
          channelCountry: channelCountry,
          comments: commentsList,
        };

        // HIỂN THỊ NGAY dữ liệu thật từ YouTube API trước, không chờ Gemini.
        const youtubeOnlyData = baseData as VideoData;
        setVideoData(youtubeOnlyData);
        setSuccessMessage("Đã lấy dữ liệu YouTube API. Đang phân tích thêm...");
        setLoading(false);

        setLibrary(prev => {
          const newItem: LibraryItem = { ...youtubeOnlyData, type: 'video' };
          const filtered = prev.filter(v => v.id !== videoId);
          return [newItem, ...filtered];
        });

        // Phân tích chạy nền. Khi xong mới cập nhật thêm phần phân tích/SEO.
        void (async () => {
          const stopProgress = startBackgroundAnalysisProgress('video');
          try {
            const analysis = await analyzeWithAI(baseData);
            const finalData = { ...baseData, aiAnalysis: analysis.ai, seoSuggestions: analysis.seo } as VideoData;
            setVideoData(prev => {
              if (!prev || prev.id !== videoId) return finalData;
              return { ...prev, aiAnalysis: analysis.ai, seoSuggestions: analysis.seo } as VideoData;
            });
            setSuccessMessage("Phân tích Video thành công!");
            setLibrary(prev => {
              const newItem: LibraryItem = { ...finalData, type: 'video' };
              const filtered = prev.filter(v => v.id !== videoId);
              return [newItem, ...filtered];
            });
            finishBackgroundAnalysisProgress('video');
          } catch (aiErr) {
            console.warn("Phân tích video chạy nền bị lỗi, vẫn giữ dữ liệu YouTube API:", aiErr);
            setAnalysisProgress(null);
          } finally {
            stopProgress();
          }
        })();
      } else {
        // Limited data if API key fails or no results
        const fallback: VideoData = {
          id: videoId,
          title: "Video không lấy được tiêu đề (Kiểm tra Khóa truy cập)",
          channelTitle: "Không rõ",
          channelId: "",
          publishedAt: "",
          description: "Vui lòng thêm Khóa truy cập để lấy đầy đủ dữ liệu.",
          tags: [],
          categoryId: "0",
          categoryName: "Chưa có dữ liệu",
          categoryVi: "Chưa có dữ liệu",
          thumbnails: { 
            high: { url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` } 
          },
          statistics: { viewCount: "0", likeCount: "0", commentCount: "0" },
          duration: "",
          normalizedUrl: `https://www.youtube.com/watch?v=${videoId}`,
          checkedAt: new Date().toISOString(),
        };
        setVideoData(fallback);
        throw new Error("Không thể lấy dữ liệu video. Vui lòng kiểm tra link video hoặc API Key (Video có thể ở chế độ Riêng tư).");
      }
    } catch (err) {
      console.error(err);
      if (!apiKey) {
        setError("Chưa kích hoạt Khóa truy cập. App chỉ hiển thị thông tin cơ bản. Hãy thêm Khóa dữ liệu để lấy đầy đủ phân tích.");
      } else {
        setError("Không thể lấy dữ liệu video đầy đủ. Có thể video riêng tư, link sai hoặc Khóa chưa đúng.");
      }
    } finally {
      setLoading(false);
    }
  };


  const scanChannelNicheSuggestions = async (channel: ChannelData): Promise<Pick<ChannelData, 'nicheSuggestions' | 'nicheScanMeta'>> => {
    const regionCode = (channel.brandingSettings?.channel?.country || 'VN').toUpperCase();
    const regionName = getCountryNameVi(regionCode);
    const textForLang = `${channel.title} ${channel.description} ${(channel.popularVideos || []).map(v => v.title).join(' ')}`;
    const language = detectLanguageFromText(textForLang, regionCode);
    const seeds = extractTrendSeedKeywords(channel, 10);
    const publishedAfter = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const currentTopic = channel.aiAnalysis?.overview?.niche || seeds[0] || channel.title || 'Chủ đề kênh';
    const groups = new Map<string, ChannelNicheVideo[]>();

    const fetchVideosForQuery = async (query: string, useDateLimit: boolean) => {
      const params = new URLSearchParams({
        part: 'snippet',
        type: 'video',
        maxResults: '8',
        order: 'viewCount',
        q: query,
        regionCode,
        relevanceLanguage: language,
        key: apiKey
      });
      if (useDateLimit) params.set('publishedAfter', publishedAfter);
      const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
      const searchData = await searchRes.json();
      const ids = (searchData.items || []).map((x: any) => x.id?.videoId).filter(Boolean);
      if (!ids.length) return [];
      const detailRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids.join(',')}&key=${apiKey}`);
      const detailData = await detailRes.json();
      return (detailData.items || []).map((v: any) => {
        const views = Number(v.statistics?.viewCount || 0);
        const likeCount = v.statistics?.likeCount || '0';
        const commentCount = v.statistics?.commentCount || '0';
        const vph = getVideoVph(views, v.snippet?.publishedAt);
        return {
          id: v.id,
          title: v.snippet?.title || 'Video không có tiêu đề',
          thumbnail: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || '',
          channelTitle: v.snippet?.channelTitle || '',
          publishedAt: v.snippet?.publishedAt || '',
          viewCount: String(views),
          likeCount,
          commentCount,
          vph,
          score: getVideoTrendScore({ viewCount: views, likeCount, commentCount, publishedAt: v.snippet?.publishedAt || '' })
        } as ChannelNicheVideo;
      }).filter((v: ChannelNicheVideo) => v.id && v.viewCount !== '0');
    };

    for (const seed of seeds) {
      try {
        const query = `${seed} ${currentTopic}`.slice(0, 95);
        let videos = await fetchVideosForQuery(query, true);
        if (videos.length < 2) videos = await fetchVideosForQuery(query, false);
        if (videos.length) groups.set(seed, videos.sort((a, b) => b.vph - a.vph).slice(0, 5));
      } catch (e) {
        console.warn('Không quét được ngách:', seed, e);
      }
    }

    if (!groups.size && channel.popularVideos?.length) {
      const fallbackVideos = channel.popularVideos.map(v => ({
        id: v.id,
        title: v.title,
        thumbnail: v.thumbnail,
        channelTitle: channel.title,
        publishedAt: v.publishedAt,
        viewCount: v.viewCount,
        likeCount: v.likeCount || '0',
        commentCount: v.commentCount || '0',
        vph: getVideoVph(v.viewCount, v.publishedAt),
        score: getVideoTrendScore(v)
      }));
      groups.set(currentTopic, fallbackVideos);
    }

    const suggestions: ChannelNicheSuggestion[] = Array.from(groups.entries()).map(([keyword, videos]) => {
      const totalViews = videos.reduce((sum, v) => sum + (Number(v.viewCount) || 0), 0);
      const avgVph = Math.round(videos.reduce((sum, v) => sum + v.vph, 0) / Math.max(1, videos.length));
      const avgScore = Math.round(videos.reduce((sum, v) => sum + v.score, 0) / Math.max(1, videos.length));
      const score = Math.max(1, Math.min(100, Math.round(avgScore * 0.55 + Math.min(40, Math.log10(totalViews + 10) * 6) + Math.min(20, avgVph / 250))));
      return {
        keyword,
        score,
        avgVph,
        totalViews,
        trendVideoCount: videos.length,
        potential: getPotentialLabel(score, avgVph),
        competition: getCompetitionLabel(videos.length),
        relatedVideos: videos
      };
    }).sort((a, b) => b.score - a.score).slice(0, 20);

    return {
      nicheSuggestions: suggestions,
      nicheScanMeta: {
        currentTopic,
        regionCode,
        regionName,
        language: language === 'vi' ? 'Tiếng Việt' : language === 'en' ? 'Tiếng Anh' : language.toUpperCase(),
        scanWindow: suggestions.length ? '3 tháng gần nhất, nếu thiếu dữ liệu sẽ mở rộng toàn thời gian' : 'Dữ liệu còn ít, dùng video liên quan sẵn có',
        sourceNote: 'Dữ liệu lấy trực tiếp từ API công khai của YouTube'
      }
    };
  };

  const handleCheckChannel = async (overrideUrl?: string | React.MouseEvent | React.FormEvent) => {
    if (!checkAccess()) return;
    setError(null);
    setLoading(true);
    setChannelData(null);

    const targetUrl = typeof overrideUrl === 'string' ? overrideUrl : channelUrl;
    const info = extractChannelInfo(targetUrl);
    if (!info) {
      setError("Link kênh YouTube không hợp lệ. Ví dụ: youtube.com/@tenkenh hoặc youtube.com/channel/ID");
      setLoading(false);
      return;
    }

    try {
      let finalChannelId = '';
      let channelDataRes = null;

      if (info.type === 'id') {
        finalChannelId = info.value;
      } else if (info.type === 'handle') {
        // Try forHandle API (Best for @handles)
        const handleUrl = `https://www.googleapis.com/youtube/v3/channels?part=id,snippet,statistics,brandingSettings,status,contentDetails,topicDetails&forHandle=@${info.value}&key=${apiKey}`;
        const res = await fetch(handleUrl);
        channelDataRes = await res.json();
        if (channelDataRes.items && channelDataRes.items.length > 0) {
          finalChannelId = channelDataRes.items[0].id;
        }
      } else if (info.type === 'username') {
        // Try forUsername API (Legacy)
        const userUrl = `https://www.googleapis.com/youtube/v3/channels?part=id,snippet,statistics,brandingSettings,status,contentDetails,topicDetails&forUsername=${info.value}&key=${apiKey}`;
        const res = await fetch(userUrl);
        channelDataRes = await res.json();
        if (channelDataRes.items && channelDataRes.items.length > 0) {
          finalChannelId = channelDataRes.items[0].id;
        }
      }

      // Fallback search if still no ID
      if (!finalChannelId) {
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=1&q=${info.value}&key=${apiKey}`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();
        
        if (searchData.items && searchData.items.length > 0) {
          finalChannelId = searchData.items[0].id.channelId;
        } else {
          throw new Error("Không tìm thấy kênh bằng Handle/Username này. Vui lòng kiểm tra lại link.");
        }
      }

      // If we don't have the full channel data yet, fetch it
      if (!channelDataRes || !channelDataRes.items || channelDataRes.items.length === 0) {
        const chanUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings,status,contentDetails,topicDetails&id=${finalChannelId}&key=${apiKey}`;
        const res = await fetch(chanUrl);
        channelDataRes = await res.json();
      }

      if (channelDataRes.items && channelDataRes.items.length > 0) {
        const item = channelDataRes.items[0];
        
        // Fetch latest video info to check monetization signs
        let latestVideoInfo = undefined;
        try {
          const uploadsPlaylistId = item.contentDetails?.relatedPlaylists?.uploads;
          if (uploadsPlaylistId) {
            const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=1&key=${apiKey}`;
            const playlistRes = await fetch(playlistUrl);
            const playlistData = await playlistRes.json();
            
            if (playlistData.items?.[0]) {
              const videoId = playlistData.items[0].contentDetails.videoId;
              const videoUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${apiKey}`;
              const videoRes = await fetch(videoUrl);
              const videoData = await videoRes.json();
              
              if (videoData.items?.[0]) {
                latestVideoInfo = {
                  id: videoId,
                  title: videoData.items[0].snippet?.title || '',
                  licensedContent: videoData.items[0].contentDetails.licensedContent,
                  viewCount: videoData.items[0].statistics.viewCount,
                  categoryId: videoData.items[0].snippet?.categoryId,
                  publishedAt: videoData.items[0].snippet?.publishedAt || ''
                };
              }
            }
          }
        } catch (vErr) {
          console.warn("Could not fetch latest video details", vErr);
        }

        // Fetch recent popular videos (15 newest)
        let popularVideos: ChannelData['popularVideos'] = [];
        try {
          const popularUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${finalChannelId}&order=date&type=video&maxResults=15&key=${apiKey}`;
          const popularRes = await fetch(popularUrl);
          const popularData = await popularRes.json();
          
          if (popularData.items && popularData.items.length > 0) {
            const videoIds = popularData.items.map((v: any) => v.id.videoId).join(',');
            const vDetailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds}&key=${apiKey}`;
            const vDetailsRes = await fetch(vDetailsUrl);
            const vDetailsData = await vDetailsRes.json();
            
            popularVideos = popularData.items.map((v: any) => {
              const details = vDetailsData.items?.find((d: any) => d.id === v.id.videoId);
              return {
                id: v.id.videoId,
                title: v.snippet.title,
                thumbnail: v.snippet.thumbnails.high?.url || v.snippet.thumbnails.default?.url || "",
                viewCount: details?.statistics?.viewCount || '0',
                likeCount: details?.statistics?.likeCount || '0',
                commentCount: details?.statistics?.commentCount || '0',
                publishedAt: v.snippet.publishedAt,
                tags: details?.snippet?.tags || []
              };
            });
          }
        } catch (pErr) {
          console.warn("Could not fetch popular videos", pErr);
        }

        const baseChan: ChannelData = {
          id: item.id,
          title: item.snippet.title,
          description: item.snippet.description,
          customUrl: item.snippet.customUrl,
          publishedAt: item.snippet.publishedAt,
          thumbnails: item.snippet.thumbnails,
          statistics: item.statistics,
          brandingSettings: item.brandingSettings,
          status: item.status,
          topicDetails: item.topicDetails,
          latestVideo: latestVideoInfo,
          popularVideos: popularVideos,
          checkedAt: new Date().toISOString()
        };

        // HIỂN THỊ NGAY dữ liệu thật từ YouTube API trước, không chờ Gemini.
        const youtubeOnlyChannel = baseChan as ChannelData;
        setChannelData(youtubeOnlyChannel);
        setSuccessMessage("Đã lấy dữ liệu YouTube API. Đang phân tích thêm...");
        setLoading(false);

        setLibrary(prev => {
          const newItem: LibraryItem = { ...youtubeOnlyChannel, type: 'channel' };
          const filtered = prev.filter(v => v.id !== youtubeOnlyChannel.id);
          return [newItem, ...filtered];
        });

        // Quét ngách/chủ đề bằng dữ liệu công khai chạy song song, không chờ phần phân tích chiến lược.
        void (async () => {
          try {
            const nicheData = await scanChannelNicheSuggestions(baseChan);
            setChannelData(prev => prev && prev.id === baseChan.id ? { ...prev, ...nicheData } : prev);
            setLibrary(prev => prev.map(item => item.id === baseChan.id ? { ...item, ...nicheData } as LibraryItem : item));
          } catch (nicheErr) {
            console.warn('Quét ngách/chủ đề kênh bị lỗi:', nicheErr);
          }
        })();

        // Phân tích chạy nền. Khi xong mới cập nhật thêm phần phân tích.
        void (async () => {
          const stopProgress = startBackgroundAnalysisProgress('channel');
          try {
            const analysis = await analyzeChannelWithAI(baseChan);
            const finalChan = { ...baseChan, aiAnalysis: analysis };
            setChannelData(prev => {
              if (!prev || prev.id !== baseChan.id) return finalChan;
              return { ...prev, aiAnalysis: analysis } as ChannelData;
            });
            setSuccessMessage("Phân tích Kênh thành công!");
            setLibrary(prev => {
              const previous = prev.find(v => v.id === finalChan.id) as any;
              const newItem: LibraryItem = { ...previous, ...finalChan, type: 'channel' };
              const filtered = prev.filter(v => v.id !== finalChan.id);
              return [newItem, ...filtered];
            });
            finishBackgroundAnalysisProgress('channel');
          } catch (aiErr) {
            console.warn("Phân tích kênh chạy nền bị lỗi, vẫn giữ dữ liệu YouTube API:", aiErr);
            setAnalysisProgress(null);
          } finally {
            stopProgress();
          }
        })();
      } else {
        throw new Error("Không lấy được dữ liệu chi tiết kênh.");
      }
    } catch (err: any) {
      setError(err.message || "Đã xảy ra sự cố khi kiểm tra kênh.");
    } finally {
      setLoading(false);
    }
  };

  const handleActionWithAuth = (action: () => void) => {
    if (authLoading) return; // Wait for auth to finish loading
    
    if (!user) {
      setShowAuthPortal(true);
      return;
    }
    if (!isValidUser()) {
      setShowAuthPortal(true);
      return;
    }
    action();
  };

  const getVideoReport = (data: VideoData) => {
    return `BÁO CÁO PHÂN TÍCH VIDEO - YOUTUBE TOOLBOX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. VÙNG 1 – THÔNG SỐ VIDEO
- Lượt xem: ${formatNumber(data.statistics.viewCount)}
- Lượt thích: ${formatNumber(data.statistics.likeCount)}
- Lượt bình luận: ${formatNumber(data.statistics.commentCount)}
- Thời lượng: ${formatDuration(data.duration)}
- Giờ đăng (VN): ${formatDate(data.publishedAt, 'Asia/Ho_Chi_Minh')}
- Giờ gốc (UTC): ${formatDate(data.publishedAt, 'UTC')}
- RPM ước tính: $${getRPMByCategoryId(data.categoryId).min.toFixed(2)} – $${getRPMByCategoryId(data.categoryId).max.toFixed(2)} / 1.000 view
- Category: ${data.categoryVi} (${data.categoryName})

2. VÙNG 2 – THÔNG SỐ NỘI DUNG
- Tiêu đề video: ${data.title}
- Link video: ${data.normalizedUrl}
- Tên kênh: ${data.channelTitle}
- Channel ID: ${data.channelId}
- Video ID: ${data.id}
- Quốc gia kênh: ${data.channelCountry || 'Không rõ'}
- Category ID: ${data.categoryId}
- Thời gian check: ${formatDate(data.checkedAt, 'Asia/Ho_Chi_Minh')}

3. VÙNG 3 – MÔ TẢ & TAG
★ MÔ TẢ:
${data.description}

★ TAGS:
${data.tags.length > 0 ? data.tags.join(', ') : 'Không có dữ liệu tags'}

4. VÙNG 4 – ĐÁNH GIÁ TỔNG QUAN & CẢI TIẾN
- Đánh giá Tiêu đề:
  Nhận xét: ${data.aiAnalysis?.titleAnalysis?.comment || 'N/A'}
  Điểm mạnh: ${data.aiAnalysis?.titleAnalysis?.strengths || 'N/A'}
  Cần cải thiện: ${data.aiAnalysis?.titleAnalysis?.weaknesses || 'N/A'}
  Gợi ý: ${Array.isArray(data.aiAnalysis?.titleAnalysis?.suggestions) ? data.aiAnalysis.titleAnalysis.suggestions.join('; ') : data.aiAnalysis?.titleAnalysis?.suggestions || 'N/A'}
- Đánh giá Mô tả:
  Nhận xét: ${data.aiAnalysis?.descriptionAnalysis?.comment || 'N/A'}
  Điểm mạnh: ${data.aiAnalysis?.descriptionAnalysis?.strengths || 'N/A'}
  Cần cải thiện: ${data.aiAnalysis?.descriptionAnalysis?.weaknesses || 'N/A'}
  Gợi ý: ${data.aiAnalysis?.descriptionAnalysis?.suggestions || 'N/A'}
- Đánh giá Thumbnail:
  Nhận xét: ${data.aiAnalysis?.thumbnailAnalysis?.comment || 'N/A'}
  Điểm mạnh: ${data.aiAnalysis?.thumbnailAnalysis?.strengths || 'N/A'}
  Cần cải thiện: ${data.aiAnalysis?.thumbnailAnalysis?.weaknesses || 'N/A'}
  Gợi ý: ${data.aiAnalysis?.thumbnailAnalysis?.suggestions || 'N/A'}
- Đánh giá Tag:
  Nhận xét: ${data.aiAnalysis?.tagsHashtagsAnalysis?.comment || 'N/A'}
  Điểm mạnh: ${data.aiAnalysis?.tagsHashtagsAnalysis?.strengths || 'N/A'}
  Cần cải thiện: ${data.aiAnalysis?.tagsHashtagsAnalysis?.weaknesses || 'N/A'}
  Gợi ý: ${data.aiAnalysis?.tagsHashtagsAnalysis?.suggestions || 'N/A'}
- Đánh giá Chủ đề:
  Nhận xét: ${data.aiAnalysis?.topicAnalysis?.summary || 'N/A'}
  Điểm mạnh: ${data.aiAnalysis?.topicAnalysis?.strengths || 'N/A'}
  Cần cải thiện: ${data.aiAnalysis?.topicAnalysis?.weaknesses || 'N/A'}
  Gợi ý: ${data.aiAnalysis?.topicAnalysis?.suggestions || 'N/A'}
- Đánh giá CTA & Bình luận:
  Trạng thái: ${data.aiAnalysis?.pinnedCommentAnalysis?.hasPinnedComment ? 'Đã ghim' : 'Chưa ghim'}
  Nhận xét: ${data.aiAnalysis?.pinnedCommentAnalysis?.feedback || 'N/A'}
  Gợi ý: ${data.aiAnalysis?.pinnedCommentAnalysis?.suggestion || 'N/A'}

5. VÙNG 5 – PHÂN TÍCH NỘI DUNG
★ PHÂN TÍCH NỘI DUNG VIDEO:
${data.aiAnalysis?.contentAnalysisList?.map(item => `• ${item}`).join('\n') || 'Đang cập nhật...'}

★ PHÂN TÍCH PHONG CÁCH VIDEO:
${data.aiAnalysis?.styleAnalysisList?.map(item => `• ${item}`).join('\n') || 'Đang cập nhật...'}

★ KẾT LUẬN CUỐI CÙNG:
- Nhận định: ${data.aiAnalysis?.conclusionSummary?.finalVerdict || 'N/A'}
- Trạng thái: ${data.aiAnalysis?.conclusionSummary?.currentStatus || 'N/A'}
- Hạn chế lớn nhất: ${data.aiAnalysis?.conclusionSummary?.biggestWeakness || 'N/A'}
- 3 việc cần làm ngay:
${data.aiAnalysis?.conclusionSummary?.top3Fixes?.map((fix, i) => `  ${i+1}. ${fix}`).join('\n') || '  N/A'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  };

  const downloadTxt = (data: VideoData) => {
    const content = getVideoReport(data);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Naming format: Mo ta video [Channel Name] (accent-free)
    const safeChannelTitle = removeVietnameseTones(data.channelTitle);
    link.download = `Mo ta video [${safeChannelTitle}].txt`;
    
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadSectionTxt = (title: string, content: string, channelTitle: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeChannelTitle = removeVietnameseTones(channelTitle);
    link.download = `${title} [${safeChannelTitle}].txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getSEOReportText = (data: VideoData) => {
    return `PHÂN TÍCH SEO - ${data.title}
Kênh: ${data.channelTitle}
Link: ${data.normalizedUrl}

1. ĐỀ XUẤT TIÊU ĐỀ:
${data.seoSuggestions?.titles.map(t => "- " + t).join('\n')}

2. NHẬN XÉT TIÊU ĐỀ:
- Độ dài: ${data.title.length} ký tự (${data.seoSuggestions?.titleLengthRating})
- Nhận xét: ${data.seoSuggestions?.titleFeedback}

3. TỪ KHÓA (TAGS) ĐỀ XUẤT:
${data.seoSuggestions?.tags.join(', ')}

4. HASHTAGS:
${data.seoSuggestions?.hashtags.join(' ')}

5. TỪ KHÓA CHÍNH:
${data.seoSuggestions?.primaryKeyword}

6. MÔ TẢ ĐỀ XUẤT:
${data.seoSuggestions?.description}`.trim();
  };

  const downloadSEOTxt = (data: VideoData) => {
    const content = getSEOReportText(data);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeChannelTitle = removeVietnameseTones(data.channelTitle);
    link.download = `Phan Tich SEO [${safeChannelTitle}].txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const filteredLibrary = library.filter(item => {
    const searchLower = searchQuery.toLowerCase();
    const titleMatch = item.title.toLowerCase().includes(searchLower);
    const idMatch = item.id.includes(searchQuery);
    
    let otherMatches = false;
    if (item.type === 'video') {
      const channelMatch = item.channelTitle.toLowerCase().includes(searchLower);
      const categoryMatch = item.categoryVi.toLowerCase().includes(searchLower);
      const tagsMatch = item.tags.some(t => t.toLowerCase().includes(searchLower));
      otherMatches = channelMatch || categoryMatch || tagsMatch;
    }

    const matchesSearch = titleMatch || idMatch || otherMatches;
    const matchesCategory = filterCategory === 'all' || (item.type === 'video' && item.categoryId === filterCategory);
    
    return matchesSearch && matchesCategory;
  });

  const clearLibrary = () => {
    setLibrary([]);
  };

  const exportLibraryJson = () => {
    const blob = new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `youtube-toolbox-library-${new Date().getTime()}.json`;
    link.click();
  };

  // Close library on Esc
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsLibraryOpen(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // --- Render ---

  const accessStatus = getAccessStatus();

  const rawProfile = (profile || {}) as any;
  const rawAccessStatus = (accessStatus || {}) as any;

  const parseAccessDate = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value?.toDate === "function") {
      const d = value.toDate();
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === "object" && typeof value.seconds === "number") {
      const d = new Date(value.seconds * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const firstAccessDate = (...values: any[]): Date | null => {
    for (const value of values) {
      const d = parseAccessDate(value);
      if (d) return d;
    }
    return null;
  };

  const formatAccessDateText = (date: Date | null, fallback = "Chưa có") => {
    if (!date) return fallback;
    return date.toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const paidStartDate = firstAccessDate(
    rawProfile.premium_started_at,
    rawProfile.premiumStartedAt,
    rawProfile.activatedAt,
    rawProfile.last_paid_at,
    rawProfile.paidAt,
    rawProfile.created_at,
    rawProfile.createdAt
  );

  const paidExpireDate = firstAccessDate(
    rawProfile.expired_at,
    rawProfile.expiredAt,
    rawProfile.expiresAt,
    rawProfile.proUntil,
    rawProfile.premiumUntil,
    rawAccessStatus.expiredAt
  );

  const trialExpireDate = firstAccessDate(
    rawProfile.trial_expires_at,
    rawProfile.trialExpiresAt,
    rawProfile.trialUntil
  );

  const effectiveExpireDate = paidExpireDate || trialExpireDate;
  const isExpiredByDate = !!effectiveExpireDate && effectiveExpireDate.getTime() <= Date.now();
  const isExpiredByText = String(rawAccessStatus.remainingText || "").toLowerCase().includes("hết hạn");
  const isAccountExpired = isExpiredByDate || isExpiredByText;
  const isEffectivePremium = Boolean(rawAccessStatus.isPremium || isPremium) && !isAccountExpired;
  const isEffectiveTrial = Boolean(rawAccessStatus.isTrialActive || isTrialActive) && !isEffectivePremium && !isAccountExpired;
  const accountBadgeText = isEffectivePremium ? "PRO" : isEffectiveTrial ? "TRIAL" : "HẾT HẠN";
  const accountBadgeClass = isEffectivePremium
    ? "bg-sky-600 border-sky-700"
    : isEffectiveTrial
      ? "bg-emerald-500 border-emerald-600"
      : "bg-red-500 border-red-600";
  const accountStatusText = isEffectivePremium ? "PRO ĐÃ KÍCH HOẠT" : isEffectiveTrial ? "TRIAL ĐANG HOẠT ĐỘNG" : "TÀI KHOẢN ĐÃ HẾT HẠN";
  const accountStatusClass = isEffectivePremium
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : isEffectiveTrial
      ? "bg-sky-50 text-sky-700 border-sky-200"
      : "bg-red-50 text-red-700 border-red-200";
  const remainingTextForAccount = isAccountExpired
    ? "Đã hết hạn"
    : rawAccessStatus.remainingText || getRemainingAccessTime?.() || "Chưa có";
  const remainingBoxClass = isAccountExpired
    ? "bg-red-50 border-red-200 text-red-700"
    : isEffectivePremium
      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
      : "bg-orange-50 border-orange-200 text-orange-700";
  const planNameForAccount =
    rawProfile.planName ||
    rawProfile.plan_name ||
    rawProfile.lastPlanName ||
    rawAccessStatus.planName ||
    (isEffectivePremium ? "Gói PRO" : "Trial 1 tiếng");


  // Ẩn khối trạng thái tài khoản lớn ở giao diện chính.
  // Thông tin gói/PRO/hạn dùng chỉ hiển thị trong popup khi bấm nút tài khoản trên header.
  const accessStatusPanel = null;

  return (
    <div className="mobile-optimized-app min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      <Toaster position="top-right" reverseOrder={false} />

      <style>{`
        html, body, #root { width: 100%; max-width: 100%; overflow-x: hidden; }
        .mobile-optimized-app { width: 100%; max-width: 100vw; overflow-x: hidden; }
        .mobile-optimized-app img, .mobile-optimized-app video { max-width: 100%; height: auto; }
        .mobile-optimized-app textarea, .mobile-optimized-app input, .mobile-optimized-app select { max-width: 100%; }
        @media (max-width: 640px) {
          .mobile-optimized-app { padding-bottom: 48px; }
          .app-header { position: sticky; top: 0; z-index: 50; }
          .app-header-shell { padding: 14px 12px !important; max-width: 100% !important; }
          .app-header-row { gap: 12px !important; align-items: stretch !important; }
          .app-brand { width: 100%; justify-content: center; gap: 12px !important; }
          .app-brand-logo { width: 58px !important; height: 58px !important; }
          .app-brand-title { font-size: 27px !important; line-height: .95 !important; letter-spacing: -0.04em !important; white-space: normal !important; }
          .app-brand-subtitle { font-size: 10px !important; letter-spacing: .28em !important; }
          .app-controls { width: 100%; display: grid !important; grid-template-columns: minmax(0, 1fr) auto !important; gap: 8px !important; align-items: center !important; }
          .app-user-bar { min-width: 0 !important; width: 100% !important; gap: 6px !important; padding: 6px !important; border-radius: 20px !important; box-shadow: 0 10px 28px rgba(15, 23, 42, .08) !important; }
          .app-account-chip { min-width: 0 !important; flex: 1 1 auto !important; padding: 8px !important; gap: 8px !important; border-radius: 16px !important; }
          .app-account-chip .account-avatar { width: 36px !important; height: 36px !important; border-radius: 12px !important; }
          .app-upgrade-btn { width: 78px !important; min-width: 78px !important; height: 46px !important; padding: 0 8px !important; border-radius: 16px !important; font-size: 9px !important; line-height: 1.05 !important; letter-spacing: .08em !important; white-space: normal !important; text-align: center !important; }
          .app-upgrade-btn svg { width: 13px !important; height: 13px !important; }
          .app-signout-btn { display: none !important; }
          .app-actions { gap: 6px !important; justify-content: flex-end !important; }
          .app-action-btn { width: 42px !important; height: 42px !important; border-radius: 15px !important; }
          .app-main { width: 100% !important; max-width: 100% !important; padding: 14px 10px 56px !important; margin: 0 !important; gap: 18px !important; }
          .app-main > * { max-width: 100% !important; }
          .app-main .grid { grid-template-columns: minmax(0, 1fr) !important; }
          .app-main .flex { min-width: 0; }
          .app-main h1 { font-size: 28px !important; line-height: 1.05 !important; }
          .app-main h2 { font-size: 24px !important; line-height: 1.1 !important; }
          .app-main h3 { font-size: 20px !important; line-height: 1.15 !important; }
          .app-main p { overflow-wrap: anywhere; }
          .app-main [class*="rounded-[40px]"], .app-main [class*="rounded-[36px]"], .app-main [class*="rounded-[32px]"] { border-radius: 22px !important; }
          .app-main [class*="p-10"], .app-main [class*="p-8"], .app-main [class*="md:p-10"] { padding: 18px !important; }
          .app-main [class*="gap-8"] { gap: 14px !important; }
          .app-main input, .app-main textarea, .app-main select { font-size: 16px !important; }
          .app-main button { min-height: 44px; }
          .app-main .overflow-x-auto { -webkit-overflow-scrolling: touch; }
          .mobile-modal { align-items: stretch !important; padding: 10px !important; }
          .mobile-modal-panel { width: 100% !important; max-width: 100% !important; max-height: calc(100vh - 20px) !important; border-radius: 24px !important; }
          .mobile-modal-head { padding: 16px !important; gap: 12px !important; }
          .mobile-modal-body { padding: 16px !important; }
          .mobile-modal-title { font-size: 21px !important; line-height: 1.1 !important; }
          .mobile-modal-icon { width: 50px !important; height: 50px !important; border-radius: 18px !important; }
          .mobile-modal-close { width: 42px !important; height: 42px !important; border-radius: 15px !important; }
          .mobile-scroll-x { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
        }
      `}</style>


      <AuthPortal
        isOpen={showAuthPortal}
        onClose={() => setShowAuthPortal(false)}
        user={user}
        profile={profile}
        initialView={authView}
      />

      
      <AnimatePresence>
        {showAccountPopup && user && (
          <motion.div
            className="mobile-modal fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={() => setShowAccountPopup(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 18 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="mobile-modal-panel w-full max-w-3xl overflow-hidden rounded-[32px] bg-white shadow-2xl border border-white"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="mobile-modal-head flex items-start justify-between gap-4 p-7 border-b border-slate-100 bg-slate-50/70">
                <div className="flex items-center gap-3 min-w-0">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt="avatar"
                      className="mobile-modal-icon w-20 h-20 rounded-[22px] object-cover ring-4 ring-white shadow-sm"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="mobile-modal-icon w-20 h-20 rounded-[22px] bg-teal-600 flex items-center justify-center text-white ring-4 ring-white shadow-sm">
                      <span className="text-4xl font-black">{user.email?.[0]?.toUpperCase() || "U"}</span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.35em] text-slate-400">Thông tin tài khoản</p>
                    <h2 className="mobile-modal-title text-2xl font-black text-slate-950 truncate">{user.displayName || user.email?.split("@")[0] || "Tài khoản"}</h2>
                    <p className="text-sm font-bold text-slate-500 truncate">{user.email || profile?.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAccountPopup(false)}
                  className="mobile-modal-close h-11 w-11 shrink-0 rounded-2xl border border-slate-200 bg-white text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all flex items-center justify-center"
                  title="Đóng"
                >
                  <X size={22} />
                </button>
              </div>

              <div className="mobile-modal-body p-7 space-y-6">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`px-4 py-2 rounded-2xl text-sm font-black text-white uppercase tracking-widest border shadow-sm ${accountBadgeClass}`}>
                    {accountBadgeText}
                  </span>
                  <span className={`px-5 py-2 rounded-2xl text-sm font-black uppercase tracking-widest border ${accountStatusClass}`}>
                    {accountStatusText}
                  </span>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Gói đã thanh toán</p>
                    <p className="text-xl font-black text-slate-950">{planNameForAccount}</p>
                  </div>
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Ngày đăng ký / bắt đầu</p>
                    <p className="text-xl font-black text-slate-950">
                      {formatAccessDateText(paidStartDate || firstAccessDate(rawProfile.trial_started_at, rawProfile.trialStartedAt, rawProfile.createdAt), "Chưa có")}
                    </p>
                  </div>
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Hạn sử dụng</p>
                    <p className={`text-xl font-black ${isAccountExpired ? "text-red-700" : "text-slate-950"}`}>
                      {formatAccessDateText(effectiveExpireDate, rawAccessStatus.expiredAtText || "Chưa có")}
                    </p>
                  </div>
                  <div className={`p-5 rounded-2xl border ${remainingBoxClass}`}>
                    <p className="text-[11px] font-black uppercase tracking-widest opacity-80 mb-2">Còn lại</p>
                    <p className="text-xl font-black">{remainingTextForAccount}</p>
                  </div>
                  <div className="p-5 rounded-2xl bg-white border border-slate-200">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">UID Google</p>
                    <p className="text-sm font-black text-slate-700 break-all">{user.uid}</p>
                  </div>
                  <div className="p-5 rounded-2xl bg-white border border-slate-200">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Email</p>
                    <p className="text-sm font-black text-slate-700 break-all">{user.email || profile?.email}</p>
                  </div>
                </div>

                <div className="grid sm:grid-cols-[1fr_auto] gap-3">
                  <button
                    onClick={openPaymentPage}
                    className="h-14 rounded-2xl bg-gradient-to-r from-emerald-500 to-sky-600 text-white font-black uppercase tracking-widest shadow-xl shadow-emerald-500/20 hover:from-emerald-600 hover:to-sky-700 transition-all active:scale-[0.98]"
                  >
                    Nâng cấp / cộng thêm ngày
                  </button>
                  <button
                    onClick={() => signOut(auth)}
                    className="h-14 px-7 rounded-2xl bg-slate-100 text-slate-600 font-black uppercase tracking-widest hover:bg-red-50 hover:text-red-600 transition-all active:scale-[0.98]"
                  >
                    Đăng xuất
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showApiKeySettings && (
          <motion.div
            className="mobile-modal fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-2 sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={() => setShowApiKeySettings(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 18 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="mobile-modal-panel w-full max-w-5xl max-h-[88vh] overflow-hidden rounded-[24px] sm:rounded-[28px] bg-white shadow-2xl border border-white flex flex-col"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="mobile-modal-head flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-slate-100 bg-sky-50/60 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="mobile-modal-icon w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center ring-4 ring-white shadow-sm">
                    <Settings size={26} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.35em] text-slate-400">Cài đặt API</p>
                    <h2 className="text-xl sm:text-2xl font-black text-slate-950 leading-tight">Khóa truy cập dữ liệu</h2>
                    <p className="hidden sm:block text-sm font-bold text-slate-500">Cập nhật key API độc lập với tài khoản đăng nhập tool.</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowApiKeySettings(false)}
                  className="h-10 w-10 shrink-0 rounded-2xl border border-slate-200 bg-white text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all flex items-center justify-center"
                  title="Đóng"
                >
                  <X size={22} />
                </button>
              </div>

              <div className="p-4 sm:p-5 overflow-y-auto flex-1 min-h-0 space-y-4">
                <div className="rounded-2xl border border-red-100 bg-red-50/40 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-[12px] font-black uppercase tracking-widest text-red-600 flex items-center gap-2">
                        <Youtube size={18} /> YouTube API Keys V3
                      </p>
                      <p className="hidden sm:block text-xs font-bold text-slate-500 mt-1">Dán nhiều key, mỗi key một dòng riêng biệt.</p>
                    </div>
                    <a
                      href="https://console.cloud.google.com/apis/credentials"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-black text-red-600 hover:underline flex items-center gap-1"
                    >
                      Lấy API Key Dữ liệu miễn phí <ExternalLink size={12} />
                    </a>
                  </div>

                  <div className="relative">
                    <textarea
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      rows={3}
                      wrap="off"
                      spellCheck={false}
                      placeholder="AIza...\nAIza...\nAIza..."
                      style={{
                        WebkitTextSecurity: showKey ? "none" : "disc",
                        whiteSpace: "pre",
                        overflowX: "auto",
                        wordBreak: "normal"
                      } as React.CSSProperties}
                      className="w-full resize-y min-h-[92px] rounded-2xl border border-red-100 bg-white px-4 py-3 pr-14 text-sm font-mono leading-6 outline-none focus:border-red-400 focus:ring-4 focus:ring-red-50"
                    />
                    <button
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-4 bottom-4 h-10 w-10 rounded-2xl bg-white shadow-lg border border-slate-100 text-slate-400 hover:text-red-500 transition-all flex items-center justify-center"
                      title={showKey ? "Ẩn key" : "Hiện key"}
                    >
                      {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={checkYoutubeKeys}
                      disabled={checkingYoutubeKeys}
                      className="h-10 px-4 rounded-2xl bg-red-600 text-white text-xs font-black uppercase tracking-widest hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                    >
                      {checkingYoutubeKeys ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                      Check YouTube key
                    </button>
                    <p className="text-[11px] font-bold text-slate-500">Dán nhiều key xuống dòng, bấm check để biết key nào dùng được.</p>
                  </div>

                  {youtubeKeyCheckResults.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Thông báo check YouTube key</p>
                        <button
                          type="button"
                          onClick={() => setShowKeyCheckResults(!showKeyCheckResults)}
                          className="h-9 px-4 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-white border border-orange-300 shadow-md shadow-orange-100 text-[11px] font-black hover:from-amber-500 hover:to-orange-600 transition-all"
                        >
                          {showKeyCheckResults ? 'Ẩn thông báo' : 'Mở thông báo'}
                        </button>
                      </div>
                      {showKeyCheckResults && youtubeKeyCheckResults.map((item, idx) => (
                        <div
                          key={`yt-key-${idx}-${item.key}`}
                          className={`flex items-start gap-2 rounded-2xl border px-3 py-2 text-xs font-bold ${item.ok ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-red-100 bg-white text-red-700'}`}
                        >
                          {item.ok ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
                          <div className="min-w-0">
                            <p className="font-black break-all">{maskKeyForUi(item.key)}</p>
                            <p className="leading-relaxed">{item.reason}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-purple-100 bg-purple-50/40 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-[12px] font-black uppercase tracking-widest text-purple-600 flex items-center gap-2">
                        <Sparkles size={18} /> Gemini AI API
                      </p>
                      <p className="hidden sm:block text-xs font-bold text-slate-500 mt-1">Dán nhiều key, mỗi key một dòng riêng biệt. Key có thể lấy từ Gmail/dự án Google AI Studio khác.</p>
                    </div>
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-black text-purple-600 hover:underline flex items-center gap-1"
                    >
                      Lấy Key Gemini miễn phí <ExternalLink size={12} />
                    </a>
                  </div>

                  <div className="relative">
                    <textarea
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
                      rows={2}
                      wrap="off"
                      spellCheck={false}
                      placeholder={"AIza...\nAIza...\nAIza..."}
                      style={{
                        WebkitTextSecurity: showGeminiKey ? "none" : "disc",
                        whiteSpace: "pre",
                        overflowX: "auto",
                        wordBreak: "normal"
                      } as React.CSSProperties}
                      className="w-full resize-y min-h-[58px] max-h-[96px] rounded-2xl border border-purple-100 bg-white px-4 py-3 pr-14 text-sm font-mono leading-6 outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-50"
                    />
                    <button
                      onClick={() => setShowGeminiKey(!showGeminiKey)}
                      className="absolute right-4 bottom-4 h-10 w-10 rounded-2xl bg-white text-slate-400 hover:text-purple-600 transition-all flex items-center justify-center"
                      title={showGeminiKey ? "Ẩn key" : "Hiện key"}
                    >
                      {showGeminiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={checkGeminiKeys}
                      disabled={checkingGeminiKeys}
                      className="h-10 px-4 rounded-2xl bg-purple-600 text-white text-xs font-black uppercase tracking-widest hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                    >
                      {checkingGeminiKeys ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                      Check Gemini key
                    </button>
                    <p className="text-[11px] font-bold text-slate-500">Key xanh là gọi được. Key đỏ sẽ ghi rõ lỗi để đổi key/model.</p>
                  </div>

                  {geminiKeyCheckResults.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Thông báo check Gemini key</p>
                        <button
                          type="button"
                          onClick={() => setShowKeyCheckResults(!showKeyCheckResults)}
                          className="h-9 px-4 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-white border border-orange-300 shadow-md shadow-orange-100 text-[11px] font-black hover:from-amber-500 hover:to-orange-600 transition-all"
                        >
                          {showKeyCheckResults ? 'Ẩn thông báo' : 'Mở thông báo'}
                        </button>
                      </div>
                      {showKeyCheckResults && geminiKeyCheckResults.map((item, idx) => (
                        <div
                          key={`gemini-key-${idx}-${item.key}`}
                          className={`flex items-start gap-2 rounded-2xl border px-3 py-2 text-xs font-bold ${item.ok ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-red-100 bg-white text-red-700'}`}
                        >
                          {item.ok ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
                          <div className="min-w-0">
                            <p className="font-black break-all">{maskKeyForUi(item.key)}</p>
                            <p className="leading-relaxed">{item.reason}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="rounded-2xl border border-purple-100 bg-white/80 px-4 py-3 text-[12px] font-bold text-slate-600 leading-relaxed">
                    <b className="text-purple-700">Lưu ý:</b> API Key Gemini hoạt động độc lập với Gmail đăng nhập tool. Có thể dùng key từ Gmail/dự án khác, miễn là project đó đã bật Generative Language API, còn quota và được quyền dùng model đã chọn.
                  </div>
                </div>

                <div className="rounded-2xl border border-sky-100 bg-sky-50/40 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-[12px] font-black uppercase tracking-widest text-sky-600">Chọn model Gemini</p>
                    <span className="text-[11px] font-black text-sky-600 bg-white px-3 py-1.5 rounded-xl border border-sky-100">
                      Đang dùng: {selectedGeminiModel}
                    </span>
                  </div>
                  <div className="relative">
                    <select
                      value={selectedGeminiModel}
                      onChange={(e) => setSelectedGeminiModel(e.target.value as GeminiModelId)}
                      className="w-full appearance-none rounded-2xl border border-sky-100 bg-white px-4 py-3 pr-12 text-sm font-black text-slate-800 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-50 cursor-pointer"
                    >
                      {GEMINI_MODEL_OPTIONS.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={20} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 leading-relaxed">
                    Nếu báo lỗi quota/quyền model, hãy đổi model hoặc dùng key khác. PRO chỉ mở khóa tool; hạn mức phân tích phụ thuộc project tạo API Key.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3 pt-2 sticky bottom-0 bg-white/95 backdrop-blur pb-1">
                  <button
                    type="button"
                    onClick={checkAllApiKeys}
                    disabled={checkingYoutubeKeys || checkingGeminiKeys}
                    className="h-12 px-5 rounded-2xl bg-slate-100 text-slate-700 font-black uppercase tracking-widest hover:bg-slate-200 disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {(checkingYoutubeKeys || checkingGeminiKeys) ? <Loader2 size={18} className="animate-spin" /> : <ListChecks size={18} />}
                    Check tất cả key
                  </button>
                  <button
                    onClick={() => {
                      localStorage.setItem('yt_api_key', apiKey);
                      localStorage.setItem('gemini_api_key', geminiApiKey);
                      localStorage.setItem('gemini_model', selectedGeminiModel);
                      const geminiKeys = splitGeminiApiKeys(geminiApiKey);
                      const activeGeminiKey = localStorage.getItem('gemini_active_key');
                      if (activeGeminiKey && !geminiKeys.includes(activeGeminiKey)) {
                        localStorage.removeItem('gemini_active_key');
                      }
                      toast.success('Đã cập nhật cấu hình API. Key được lưu riêng trên trình duyệt này.');
                      setShowApiKeySettings(false);
                    }}
                    className="h-12 rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 text-white font-black uppercase tracking-widest shadow-xl shadow-sky-500/20 hover:from-sky-700 hover:to-indigo-700 transition-all active:scale-[0.98]"
                  >
                    Cập nhật cấu hình
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="app-header bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="app-header-shell max-w-7xl mx-auto px-4 sm:px-8 py-6">
          <div className="app-header-row flex flex-col lg:flex-row lg:items-center justify-between gap-8">
            {/* Logo/Title Section - Enlarged */}
            <div className="app-brand flex items-center gap-6 group shrink-0">
              <a 
                href="https://www.youtube.com/@vantheweb?sub_confirmation=1" 
                target="_blank" 
                rel="noopener noreferrer"
                className="relative group/logo cursor-pointer"
              >
                <div className="relative group/logo">
                  {/* Animated Gradient Border */}
                  <motion.div
                    className="absolute -inset-1.5 bg-linear-to-r from-cyan-400 via-fuchsia-500 via-indigo-500 to-emerald-400 rounded-full opacity-75 blur-sm group-hover/logo:opacity-100 transition duration-1000 group-hover/logo:duration-200"
                    animate={{
                      backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                    style={{ backgroundSize: "200% 200%" }}
                  />
                  <div className="app-brand-logo relative w-20 h-20 flex items-center justify-center overflow-hidden rounded-full shadow-2xl shadow-sky-100 border-2 border-white bg-white group-hover/logo:scale-105 transition-transform duration-500">
                    <img src="https://yt3.googleusercontent.com/Gug5UDLjPMRBto68HqZvJCSryebEkqiI2_9qV_8y16ZKIVLgxYBFx_PyUYZStcTzSc3v7TLq=s900-c-k-c0x00ffffff-no-rj" alt="logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                </div>
              </a>
              <div className="flex flex-col cursor-pointer" onClick={handleReset}>
                <h1 className="app-brand-title text-4xl font-black text-slate-900 tracking-[-0.04em] leading-[0.9] flex items-center gap-2 whitespace-nowrap">
                  YouTube <span className="text-sky-600">Toolbox</span>
                </h1>
                <div className="flex items-center gap-3 mt-2">
                  <span className="app-brand-subtitle text-sm font-black text-slate-400 uppercase tracking-[0.3em]">VĂN THẾ WEB</span>
                </div>
              </div>
            </div>
            
            {/* Controls & User Section */}
            <div className="app-controls flex items-center gap-4 shrink-0">
              {user && (
                <div className="app-user-bar flex items-center gap-3 bg-white pl-2 pr-2 py-2 rounded-[24px] border border-slate-200 shadow-xl shadow-slate-200/50">
                   <button
                      type="button"
                      onClick={() => setShowAccountPopup(true)}
                      className="app-account-chip flex items-center gap-3 px-3 py-2 bg-slate-50 hover:bg-sky-50 rounded-[20px] border border-slate-100 hover:border-sky-200 overflow-hidden group min-w-[240px] text-left transition-all active:scale-[0.98]"
                      title="Xem thông tin tài khoản"
                    >
                      <div className="relative shrink-0">
                        {user.photoURL ? (
                          <img 
                            src={user.photoURL || undefined} 
                            alt="avatar" 
                            className="account-avatar w-10 h-10 rounded-[14px] object-cover ring-2 ring-white shadow-sm group-hover:scale-105 transition-transform" 
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="account-avatar w-10 h-10 rounded-[14px] bg-sky-600 flex items-center justify-center text-white ring-2 ring-white shadow-sm">
                            <span className="text-lg font-black">{user.email?.[0].toUpperCase()}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col text-left overflow-hidden">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <p className="text-[12px] font-black text-slate-900 leading-none truncate" title={user.displayName || user.email || ""}>
                            {user.displayName || user.email?.split('@')[0]}
                          </p>
                          <span className={`text-[10px] font-black ${accountBadgeClass} text-white px-2 py-0.5 rounded-md uppercase tracking-wide border shadow-sm`}>
                            {accountBadgeText}
                          </span>
                        </div>
                        <p className="text-[9px] font-medium text-slate-400 leading-none truncate opacity-80" title={user.email || ""}>
                          {user.email}
                        </p>
                      </div>
                   </button>

                   <button
                     onClick={openPaymentPage}
                     className={`app-upgrade-btn h-12 px-4 flex items-center justify-center gap-2 rounded-[18px] text-[11px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 group ${
                       isEffectivePremium
                         ? 'bg-gradient-to-r from-emerald-500 to-sky-600 text-white shadow-emerald-500/20 hover:from-emerald-600 hover:to-sky-700'
                         : 'bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-sky-600/20 hover:from-sky-700 hover:to-indigo-700'
                     }`}
                     title={isEffectivePremium ? 'Mua thêm gói để cộng dồn ngày sử dụng' : 'Nâng cấp tài khoản'}
                   >
                     <Zap size={16} className="text-amber-400 animate-pulse" />
                     {isEffectivePremium ? 'Nâng cấp thêm' : 'Nâng cấp'}
                   </button>

                   <button 
                    onClick={() => signOut(auth)}
                    className="app-signout-btn h-12 w-12 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-[18px] transition-all shrink-0 active:scale-95 group"
                    title="Đăng xuất"
                   >
                    <LogOut size={22} className="group-hover:rotate-12 transition-transform" />
                   </button>
                </div>
              )}

               {/* Global Utility Actions */}
               <div className="app-actions flex items-center gap-2">
                  <button 
                    onClick={openApiSettings}
                    className="app-action-btn flex items-center justify-center h-12 w-12 bg-white text-slate-600 border border-slate-200 rounded-[18px] hover:bg-sky-50 hover:text-sky-600 hover:border-sky-200 transition-all shadow-sm group cursor-pointer active:scale-95"
                    title="Cài đặt API"
                  >
                    <Settings size={21} className="group-hover:rotate-45 transition-transform" />
                  </button>

                  <button 
                    onClick={handleReset}
                    className="app-action-btn flex items-center justify-center h-12 w-12 bg-white text-slate-600 border border-slate-200 rounded-[18px] hover:bg-slate-50 hover:text-red-500 transition-all shadow-sm group cursor-pointer active:scale-95"
                    title="Làm mới trình kiểm tra"
                    aria-label="Làm mới trình kiểm tra"
                  >
                    <RotateCcw size={22} className="group-hover:-rotate-180 transition-transform duration-500" />
                  </button>
                  <button 
                    onClick={() => setIsLibraryOpen(true)}
                    className="app-action-btn flex items-center justify-center h-12 w-12 bg-slate-900 text-white rounded-[18px] hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 group relative cursor-pointer active:scale-95"
                    title="Thư viện"
                    aria-label="Thư viện"
                  >
                    <Library size={19} className="group-hover:scale-110 transition-transform text-sky-400" />
                    {library.length > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[24px] h-6 px-1 bg-sky-500 border-2 border-white rounded-lg text-[10px] text-white flex items-center justify-center font-black animate-pulse">
                        {library.length}
                      </span>
                    )}
                  </button>
               </div>
            </div>
          </div>
        </div>
      </header>

      <main className={`app-main max-w-6xl mx-auto px-4 py-8 space-y-8 transition-all duration-700 ${(!isValidUser() && user) ? 'relative' : ''}`}>
        {authLoading ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <Loader2 size={48} className="text-sky-500 animate-spin" />
            <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Đang tải dữ liệu...</p>
          </div>
        ) : !user ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-12 md:py-20 text-center space-y-8 bg-white/50 border border-slate-200 rounded-[40px] shadow-sm backdrop-blur-sm"
          >
            <div className="space-y-4 max-w-2xl px-6">
              <div className="flex justify-center mb-6">
                <div className="p-5 bg-red-600 rounded-[30px] shadow-2xl shadow-red-600/30 text-white transform rotate-3 hover:rotate-0 transition-transform cursor-pointer">
                  <Youtube size={48} />
                </div>
              </div>
              <h1 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tight leading-[1.1] uppercase">
                YouTube <span className="text-sky-600">Toolbox</span>
              </h1>
              <p className="text-slate-500 font-bold text-lg md:text-xl leading-relaxed whitespace-pre-wrap">
                Công cụ phân tích Niche, SEO và kiểm tra kiếm tiền {"\n"}
                siêu tốc bằng AI của YouTube Creator.
              </p>
            </div>

            <div className="flex flex-col items-center gap-6 w-full max-w-lg px-6">
              <button 
                onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}
                className="w-full py-6 px-10 bg-slate-900 text-white font-black uppercase tracking-[0.2em] rounded-3xl hover:bg-slate-800 transition-all shadow-2xl shadow-slate-900/20 flex items-center justify-center gap-4 group text-base active:scale-95"
              >
                Đăng nhập với Google <ArrowRight size={20} className="group-hover:translate-x-1.5 transition-transform" />
              </button>
              
              <div className="flex items-center gap-4 text-slate-400 font-black text-[10px] uppercase tracking-widest">
                <span className="flex items-center gap-1.5"><ShieldCheck size={14} className="text-emerald-500" /> Bảo mật 100%</span>
                <div className="w-1 h-1 bg-slate-300 rounded-full" />
                <span className="flex items-center gap-1.5"><Zap size={14} className="text-amber-500" /> Xử lý tức thì</span>
              </div>
            </div>
          </motion.div>
        ) : !isValidUser() ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-orange-200 rounded-[32px] p-8 md:p-10 shadow-sm text-center space-y-6"
          >
            <div className="mx-auto w-16 h-16 rounded-3xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <Timer size={34} />
            </div>
            <div className="space-y-3">
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 uppercase tracking-tight">
                Tài khoản đã hết thời gian dùng thử
              </h2>
              <p className="text-slate-500 font-bold leading-relaxed max-w-2xl mx-auto">
                Mỗi tài khoản Google được dùng thử 1 tiếng kể từ lúc đăng nhập lần đầu. 
                Vui lòng nâng cấp gói để mở lại toàn bộ tính năng.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-4 max-w-3xl mx-auto text-left">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Gói đã thanh toán</p>
                <p className="font-black text-slate-900">{accessStatus.planName}</p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Hết hạn lúc</p>
                <p className="font-black text-slate-900">{accessStatus.expiredAtText}</p>
              </div>
              <div className="p-4 rounded-2xl bg-orange-50 border border-orange-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-500 mb-1">Còn lại</p>
                <p className="font-black text-orange-700">{accessStatus.remainingText}</p>
              </div>
            </div>
            <button
              onClick={openPaymentPage}
              className="px-10 py-5 rounded-3xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-black uppercase tracking-widest shadow-xl shadow-orange-500/20 hover:scale-[1.02] active:scale-95 transition-all"
            >
              Nâng cấp gói ngay
            </button>
          </motion.div>
        ) : activeTab === 'monetization' ? (
          <div className="space-y-8">
            <div className="flex justify-center mb-8">
              <div className="bg-white/80 backdrop-blur-sm p-1.5 rounded-[24px] border border-slate-200 shadow-xl flex items-center gap-1">
                <button 
                  onClick={() => setActiveTab('checker')}
                  className={`px-8 py-3 rounded-[18px] text-[13px] font-black uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap ${activeTab === 'checker' ? 'bg-sky-600 text-white shadow-lg ring-4 ring-sky-100 scale-[1.02]' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50'}`}
                >
                  Kiểm tra Video
                </button>
                <button 
                  onClick={() => setActiveTab('monetization')}
                  className={`px-8 py-3 rounded-[18px] text-[13px] font-black uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap ${activeTab === 'monetization' ? 'bg-sky-600 text-white shadow-lg ring-4 ring-sky-100 scale-[1.02]' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50'}`}
                >
                  Kiểm tra Kênh
                </button>
              </div>
            </div>

            <Card className="p-6 md:p-8 border-2 border-amber-50">
              <div className="space-y-6">
                <div>
                  <SectionTitle icon={Zap}>Kiểm tra thông tin kênh</SectionTitle>
                  <p className="text-sm text-slate-500 font-medium">Phân tích toàn diện stats kênh: Subscriber, Views, Region và khả năng Monetization.</p>
                </div>
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-3 flex items-center">
                      <img src="https://yt3.googleusercontent.com/Gug5UDLjPMRBto68HqZvJCSryebEkqiI2_9qV_8y16ZKIVLgxYBFx_PyUYZStcTzSc3v7TLq=s900-c-k-c0x00ffffff-no-rj" alt="youtube icon" className="w-6 h-6 rounded-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                    <input 
                      type="text" 
                      value={channelUrl}
                      onChange={(e) => setChannelUrl(e.target.value)}
                      placeholder="Dán link kênh (ví dụ: youtube.com/@TenKenh)"
                      className="w-full pl-12 pr-12 py-4 bg-slate-100 border-none rounded-2xl focus:ring-2 focus:ring-amber-500 font-medium outline-none transition-all"
                    />
                    {channelUrl && (
                      <button 
                        onClick={() => setChannelUrl('')}
                        className="absolute inset-y-0 right-4 flex items-center text-slate-400 hover:text-amber-500 cursor-pointer"
                      >
                        <Trash2 size={20} />
                      </button>
                    )}
                  </div>
                  <button 
                    onClick={() => handleActionWithAuth(() => handleCheckChannel())}
                    disabled={loading}
                    className="bg-amber-100 hover:bg-amber-200 border border-amber-200 disabled:bg-slate-300 text-amber-900 px-8 py-4 rounded-2xl font-bold shadow-md transition-all flex items-center justify-center gap-2 min-w-[180px] cursor-pointer active:scale-95"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                    ) : <Search size={20} />}
                    {loading ? `Đang xử lý ${loadingProgress}%...` : "Kiểm tra Kênh"}
                  </button>
                </div>

                {error && (
                  <div className="p-4 bg-amber-50 text-amber-600 rounded-xl flex items-start gap-3 border border-amber-100">
                    <AlertCircle className="shrink-0 mt-0.5" size={20} />
                    <p className="text-sm font-medium">{error}</p>
                  </div>
                )}
              </div>
            </Card>

            {channelData && (
              <div className="space-y-8 animate-in fade-in duration-700">
                {/* 1. Channel Header */}
                <Card className="relative overflow-visible">
                  {/* Banner */}
                  <div className="h-40 w-full bg-slate-200 relative overflow-hidden">
                    {channelData.brandingSettings?.image?.bannerExternalUrl ? (
                      <img src={channelData.brandingSettings.image.bannerExternalUrl || undefined} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-r from-amber-400 to-amber-600 opacity-20" />
                    )}
                  </div>
                  
                  <div className="p-6 md:p-8 pt-0 -mt-12 flex flex-col md:flex-row gap-8 relative">
                    <div className="shrink-0">
                      {(channelData.thumbnails?.high?.url || channelData.thumbnails?.default?.url) && (
                        <img 
                          src={channelData.thumbnails.high?.url || channelData.thumbnails.default?.url || undefined} 
                          className="w-32 h-32 rounded-3xl border-4 border-white shadow-2xl object-cover" 
                          referrerPolicy="no-referrer"
                        />
                      )}
                    </div>
                    <div className="flex-1 mt-14 md:mt-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                      <div className="space-y-1">
                        <h2 className="text-3xl font-black text-slate-900 group/title">
                          <a 
                            href={channelData.customUrl ? `https://www.youtube.com/${channelData.customUrl}` : `https://www.youtube.com/channel/${channelData.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 transition-colors"
                          >
                            {channelData.title}
                            <CheckCircle2 size={24} className="text-blue-500" />
                          </a>
                        </h2>
                        <a 
                          href={channelData.customUrl ? `https://www.youtube.com/${channelData.customUrl}` : `https://www.youtube.com/channel/${channelData.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-lg font-bold text-slate-500 hover:text-blue-500 transition-colors cursor-pointer"
                        >
                          {channelData.customUrl || `@${channelData.id}`}
                        </a>
                      </div>
                      <div className="grid grid-cols-2 gap-2 w-full">
                        <button 
                          onClick={() => {
                            const link = channelData.customUrl ? `https://www.youtube.com/${channelData.customUrl}` : `https://www.youtube.com/channel/${channelData.id}`;
                            navigator.clipboard.writeText(link);
                            setCopiedChannelLink(true);
                            setTimeout(() => setCopiedChannelLink(false), 3000);
                          }}
                          className={`px-3 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all border cursor-pointer active:scale-95 w-full ${copiedChannelLink ? 'bg-green-50 text-green-600 border-green-200' : 'bg-white text-black border-slate-200 hover:bg-slate-50 shadow-sm'}`}
                        >
                          {copiedChannelLink ? <Check size={14} /> : <Link size={14} />}
                          {copiedChannelLink ? "Đã copy link" : "Sao chép link"}
                        </button>
                        <div className="px-3 py-2.5 bg-amber-50 text-amber-600 rounded-xl text-xs font-black border border-amber-100 flex items-center justify-center gap-2 w-full">
                          {channelData.brandingSettings?.channel?.country ? (
                            <>
                              <span>{COUNTRY_MAP[channelData.brandingSettings.channel.country]?.flag || "🌐"}</span>
                              <span className="truncate">{COUNTRY_MAP[channelData.brandingSettings.channel.country]?.name || channelData.brandingSettings.channel.country}</span>
                            </>
                          ) : 'Quốc tế'}
                        </div>
                        <CopyButton 
                          text={channelData.id}
                          className="px-3 py-2.5 bg-blue-50 text-blue-600 rounded-xl text-[11px] font-black border border-blue-100 flex items-center justify-center gap-1.5 cursor-pointer hover:bg-blue-100 transition-all active:scale-95 shadow-sm w-full break-all"
                        >
                          {channelData.id}
                        </CopyButton>
                        <div className="px-3 py-2.5 bg-slate-100 text-slate-900 border border-slate-200 rounded-xl text-xs font-black flex items-center justify-center gap-2 w-full">
                          <Calendar size={14} /> {new Date(channelData.publishedAt).getFullYear()}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6 pt-0">
                    <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 text-center">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Người đăng ký</p>
                      <p className="text-3xl font-black text-slate-900">{formatNumber(channelData.statistics.subscriberCount)}</p>
                    </div>
                    <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 text-center">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tổng lượt xem</p>
                      <p className="text-3xl font-black text-slate-900">{formatNumber(channelData.statistics.viewCount)}</p>
                    </div>
                    <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 text-center">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tổng Video</p>
                      <p className="text-3xl font-black text-slate-900">{formatNumber(channelData.statistics.videoCount)}</p>
                    </div>
                  </div>
                </Card>

                {/* 2. Analysis & Monetization */}
                <div className="flex flex-col gap-8">
                  <Card className="p-8 bg-slate-50 text-slate-900 border-2 border-slate-200 shadow-xl relative overflow-hidden">
                    {channelData.aiAnalysis?.isConfirmedMonetized && (
                      <div className="absolute top-0 right-0 px-8 py-1 bg-green-600 text-white text-[10px] font-black uppercase rotate-45 translate-x-6 translate-y-4 shadow-sm">
                        Đã bật KT
                      </div>
                    )}
                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-xl font-black flex items-center gap-3">
                        <Zap size={24} className="text-amber-500 fill-amber-500" /> Trạng thái kiếm tiền
                      </h3>
                      <div className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest ${
                        channelData.aiAnalysis?.isConfirmedMonetized
                          ? 'bg-green-100 text-green-700 border border-green-200'
                          : 'bg-orange-100 text-orange-700 border border-orange-200'
                      }`}>
                        {/* @ts-ignore */}
                        {channelData.aiAnalysis?.monetizationStatusLabel || 'KHÔNG RÕ'}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                      {/* Cột trái: Tiến trình YPP */}
                      <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Tiến trình YPP (Dự đoán)</p>
                        <div className="space-y-3">
                          <div>
                            <div className="flex justify-between items-end mb-1">
                              <span className="text-xs font-bold text-slate-600">Đăng ký (Yêu cầu 1,000)</span>
                              <span className="text-xs font-black text-slate-900">{parseInt(channelData.statistics.subscriberCount).toLocaleString()} / 1,000</span>
                            </div>
                            <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-blue-500 transition-all duration-1000" 
                                style={{ width: `${Math.min(100, (parseInt(channelData.statistics.subscriberCount) / 1000) * 100)}%` }}
                              />
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between items-end mb-1">
                              <span className="text-xs font-bold text-slate-600">Tổng View (Mốc 150k ~ 4k giờ)</span>
                              <span className="text-xs font-black text-slate-900">{parseInt(channelData.statistics.viewCount).toLocaleString()} / 150,000</span>
                            </div>
                            <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-amber-500 transition-all duration-1000" 
                                style={{ width: `${Math.min(100, (parseInt(channelData.statistics.viewCount) / 150000) * 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 leading-tight italic mb-3">* Ước tính dựa trên view. Giờ xem thực tế có thể khác.</p>
                        
                        <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                          <p className="text-sm text-slate-700 leading-relaxed font-medium">
                            <span className="font-black text-slate-400 uppercase text-xs tracking-widest block mb-1">Đánh giá kênh:</span>
                            "{channelData.aiAnalysis?.monetization?.analysis}"
                          </p>
                        </div>
                      </div>

                      {/* Cột phải: 2 ô chỉ số & Phân tích kỹ thuật */}
                      <div className="flex flex-col gap-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm group hover:border-amber-200 transition-all flex flex-col justify-between">
                            <div>
                              <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1 group-hover:text-amber-600 transition-colors">Check</p>
                              <p className="text-[11px] font-bold text-slate-400 mb-1 leading-tight">Độ tin cậy: {channelData.aiAnalysis?.monetizationConfidence || 'Trung bình'}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <p className={`text-sm font-black leading-tight ${channelData.aiAnalysis?.isConfirmedMonetized ? 'text-green-600' : 'text-slate-400'}`}>
                                {channelData.aiAnalysis?.isConfirmedMonetized ? 'Xác thực mã nguồn' : ''}
                              </p>
                              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${channelData.aiAnalysis?.isConfirmedMonetized ? 'bg-green-100/20 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                {channelData.aiAnalysis?.isConfirmedMonetized ? '99%' : '85%'}
                              </span>
                            </div>
                          </div>
                          <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm group hover:border-green-200 transition-all flex flex-col justify-between">
                            <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1 group-hover:text-green-600 transition-colors">RPM Ước tính</p>
                            <p className="text-xl font-black text-green-600 leading-tight">{channelData.aiAnalysis?.monetization?.estimatedRPM}</p>
                          </div>
                        </div>

                        {/* Phân tích kỹ thuật */}
                        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
                          <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Phân tích kỹ thuật</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-1.5 gap-x-4">
                            <div className="flex items-center gap-2">
                              <div className={`p-1.5 rounded-lg ${channelData.latestVideo?.licensedContent ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}>
                                <CheckCircle2 size={12} />
                              </div>
                              <span className="text-xs font-bold text-slate-600">Bản quyền ổn</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className={`p-1.5 rounded-lg ${channelData.brandingSettings?.channel?.unsubscribedTrailer ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}>
                                <CheckCircle2 size={12} />
                              </div>
                              <span className="text-xs font-bold text-slate-600">Có Trailer</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className={`p-1.5 rounded-lg ${parseInt(channelData.statistics.subscriberCount) >= 1000 ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}>
                                <CheckCircle2 size={12} />
                              </div>
                              <span className="text-xs font-bold text-slate-600">Đủ 1k Sub</span>
                            </div>
                            {channelData.latestVideo?.categoryId && (
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-blue-100 text-blue-600">
                                  <Zap size={12} />
                                </div>
                                <span className="text-xs font-bold text-slate-600">
                                  Ngách: ${getRPMByCategoryId(channelData.latestVideo.categoryId).min.toFixed(1)}-${getRPMByCategoryId(channelData.latestVideo.categoryId).max.toFixed(1)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {/* Thẻ Tags & Từ khóa hàng đầu (Dữ liệu thực từ API) */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
                        {/* Thẻ Tags hàng đầu */}
                        <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm relative group">
                            <CopyButton 
                              text={channelData.aiAnalysis?.topTags?.map(t => t.name).join(', ') || ''}
                              className="absolute top-4 right-4 flex items-center gap-1 text-[10px] font-black text-black transition-colors cursor-pointer bg-white px-2 py-1 rounded-md border border-slate-200 shadow-sm"
                              iconSize={10}
                              showText
                            />
                          <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                             <Zap size={14} className="text-amber-500" /> Phân tích Thẻ (Tags analysis)
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {channelData.aiAnalysis?.topTags?.map((tag, i) => (
                              <motion.div 
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.03 }}
                                key={i} 
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100/80 border border-slate-200 rounded-xl group hover:border-slate-400 transition-all cursor-default"
                              >
                                <span className="text-[11px] font-bold text-slate-600">{tag.name}</span>
                                <span className="px-2 py-0.5 bg-slate-800 text-white rounded-lg text-[9px] font-black">{tag.count}</span>
                              </motion.div>
                            ))}
                            {(!channelData.aiAnalysis?.topTags || channelData.aiAnalysis.topTags.length === 0) && (
                              <p className="text-xs text-slate-400 italic">Không có dữ liệu thẻ...</p>
                            )}
                          </div>
                        </div>

                        {/* Từ khóa hàng đầu */}
                        <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm relative group">
                            <CopyButton 
                              text={channelData.aiAnalysis?.topKeywords?.map(k => k.name).join(', ') || ''}
                              className="absolute top-4 right-4 flex items-center gap-1 text-[10px] font-black text-black transition-colors cursor-pointer bg-white px-2 py-1 rounded-md border border-slate-200 shadow-sm"
                              iconSize={10}
                              showText
                            />
                          <h4 className="text-[11px] font-black text-blue-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                             <Star size={14} className="text-blue-500" /> Từ khóa tiêu đề (Top keywords)
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {channelData.aiAnalysis?.topKeywords?.map((kw, i) => (
                              <motion.div 
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.03 }}
                                key={i} 
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-xl group hover:border-blue-300 transition-all cursor-default"
                              >
                                <span className="text-[11px] font-bold text-blue-600">{kw.name}</span>
                                <span className="px-2 py-0.5 bg-blue-500 text-white rounded-lg text-[9px] font-black">{kw.count}</span>
                              </motion.div>
                            ))}
                            {(!channelData.aiAnalysis?.topKeywords || channelData.aiAnalysis.topKeywords.length === 0) && (
                              <p className="text-xs text-blue-300 italic">Đang tổng hợp...</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
                
                {/* Most Viewed Videos Section */}
                {channelData.popularVideos && channelData.popularVideos.length > 0 && (
                  <Card className="p-8 md:p-10 border-2 border-slate-100 bg-white">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="p-3 bg-red-100 text-red-600 rounded-2xl shadow-lg shadow-red-100/50">
                        <Star size={24} />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black text-slate-900 leading-none">Video Gần Đây & Phổ Biến</h3>
                            <p className="text-[10px] font-black text-slate-400 mt-2 uppercase tracking-widest">Dữ liệu video mới nhất được tổng hợp trực tiếp từ YouTube</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {channelData.popularVideos.slice(0, 9).map((video, index) => {
                        const vph = getVideoVph(video.viewCount, video.publishedAt);
                        const score = getVideoTrendScore(video);
                        const likeCount = Number(video.likeCount || 0);
                        const commentCount = Number(video.commentCount || 0);
                        
                        return (
                          <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.05 }}
                            key={video.id} 
                            className="group bg-slate-50/30 p-3 rounded-[2.5rem] border border-transparent hover:border-slate-200 hover:bg-white transition-all shadow-sm hover:shadow-xl"
                          >
                            <div className="relative rounded-[2rem] overflow-hidden aspect-video mb-4 border border-slate-200">
                              {video.thumbnail ? (
                                <img src={video.thumbnail} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={video.title} referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-300">
                                  <Video size={32} />
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEmbeddedVideo({ id: video.id, title: video.title });
                                }}
                                className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/35 text-white backdrop-blur-sm border border-white/50 shadow-lg opacity-70 hover:opacity-100 hover:bg-red-600/80 transition-all flex items-center justify-center"
                                title="Xem video trực tiếp"
                              >
                                <Play size={17} fill="currentColor" className="ml-0.5" />
                              </button>
                              <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/75 backdrop-blur-sm text-white text-[9px] font-black rounded-lg border border-white/10">
                                {formatNumber(video.viewCount)}
                              </div>
                            </div>

                            <div className="px-1">
                              <h4 className="text-[14px] font-black text-slate-900 line-clamp-2 leading-tight group-hover:text-indigo-600 transition-colors h-9">{video.title}</h4>

                              <div className="grid grid-cols-2 gap-2 mt-4">
                                {[
                                  { label: 'Score', value: `${score}/100`, icon: Star, color: 'text-amber-500 bg-amber-50 border-amber-100' },
                                  { label: 'VPH', value: formatNumber(vph), icon: TrendingUp, color: 'text-green-600 bg-green-50 border-green-100' },
                                  { label: 'Like', value: formatNumber(likeCount), icon: Heart, color: 'text-rose-500 bg-rose-50 border-rose-100' },
                                  { label: 'Bình luận', value: formatNumber(commentCount), icon: MessageCircle, color: 'text-blue-600 bg-blue-50 border-blue-100' }
                                ].map((metric, metricIndex) => (
                                  <div key={metricIndex} className={`flex items-center gap-2 p-2 rounded-xl border ${metric.color}`}>
                                    <metric.icon size={13} className="shrink-0" />
                                    <div className="min-w-0">
                                      <p className="text-[7px] font-black uppercase tracking-widest opacity-70 leading-none mb-1">{metric.label}</p>
                                      <p className="text-[11px] font-black leading-none truncate">{metric.value}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              
                              <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100">
                                <div className="space-y-0.5">
                                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Ngày đăng</p>
                                  <p className="text-[9px] font-bold text-slate-600 leading-tight">
                                    {formatDate(video.publishedAt, getTimeZoneByCountry(channelData.brandingSettings?.channel?.country))}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextVideoUrl = `https://youtube.com/watch?v=${video.id}`;
                                    setUrl(nextVideoUrl);
                                    setActiveTab('checker');
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                    handleActionWithAuth(() => handleCheckVideo(nextVideoUrl));
                                  }}
                                  className="self-center justify-self-end px-3 py-2 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100 text-[9px] font-black transition-all"
                                >
                                  Phân tích
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </Card>
                )}



                {analysisProgress?.kind === 'channel' && !channelData.aiAnalysis && (
                  <AnalysisProgressBox kind="channel" percent={analysisProgress.percent} />
                )}

                {/* 5. KHÁM KÊNH – PHÂN TÍCH CHUYÊN SÂU */}
                {channelData.aiAnalysis && (
                  <Card className="p-8 md:p-10 border-2 border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-sky-50 shadow-sm">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl shadow-lg shadow-indigo-100/50">
                        <Search size={24} />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black text-slate-900 leading-none uppercase">ĐÁNH GIÁ NHẬN DIỆN THƯƠNG HIỆU & THUMBNAIL</h3>
                        <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">KHÁM KÊNH – PHÂN TÍCH CHUYÊN SÂU</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="grid md:grid-cols-2 gap-6">
                        <GrowthCard 
                          title="Nhận diện thương hiệu (Branding)" 
                          content={`Logo/Avatar: ${channelData.aiAnalysis.branding?.logoFeedback}\n\nBanner: ${channelData.aiAnalysis.branding?.bannerFeedback}`} 
                          icon={Target} 
                          color="indigo" 
                        />
                        <GrowthCard 
                          title="Ảnh bìa Video (Thumbnail)" 
                          content={`${channelData.aiAnalysis.thumbnailFeedback?.analysis}\n\n💡 Lời khuyên: ${channelData.aiAnalysis.thumbnailFeedback?.advice}`} 
                          icon={ImagePlay} 
                          color="blue" 
                        />
                      </div>

                      {/* Đánh giá Mô tả & SEO */}
                      <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-100">
                        <h4 className="text-xs font-black text-emerald-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <FileText size={14} /> Phân tích mô tả & SEO kênh
                        </h4>
                        
                        <div className="space-y-4">
                          {/* Dữ liệu thô từ API để đối chiếu */}
                          <div className="grid md:grid-cols-2 gap-4 pb-4 border-b border-slate-100">
                            <div className="relative group">
                              <CopyButton 
                                text={channelData.aiAnalysis?.topTags?.map(t => t.name).join(', ') || ''}
                                className="absolute -top-1 right-0 flex items-center gap-1 text-[10px] font-black text-black hover:text-red-500 transition-colors cursor-pointer border border-slate-200 bg-white px-2 py-0.5 rounded-md shadow-sm"
                                iconSize={10}
                                showText
                              />
                              <p className="text-xs font-black text-slate-400 uppercase mb-3 tracking-widest flex items-center gap-2">Thẻ (Tags) hiện tại</p>
                              <div className="flex flex-wrap gap-1.5">
                                {channelData.aiAnalysis?.topTags?.map((tag, i) => (
                                  <div key={i} className="flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-200 rounded-lg">
                                    <span className="text-[10px] font-bold text-slate-500">#{tag.name}</span>
                                    <span className="text-[10px] font-black text-slate-400 opacity-60">({tag.count})</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="relative group">
                              <CopyButton 
                                text={channelData.aiAnalysis?.topKeywords?.map(k => k.name).join(', ') || ''}
                                className="absolute -top-1 right-0 flex items-center gap-1 text-[10px] font-black text-black hover:text-blue-500 transition-colors cursor-pointer border border-slate-200 bg-white px-2 py-0.5 rounded-md shadow-sm"
                                iconSize={10}
                                showText
                              />
                              <p className="text-xs font-black text-slate-400 uppercase mb-3 tracking-widest flex items-center gap-2">Từ khóa hiện tại</p>
                              <div className="flex flex-wrap gap-1.5">
                                {channelData.aiAnalysis?.topKeywords?.map((kw, i) => (
                                  <div key={i} className="flex items-center gap-1 px-2 py-0.5 bg-white border border-blue-100 rounded-lg">
                                    <span className="text-[10px] font-bold text-blue-500">{kw.name}</span>
                                    <span className="text-[10px] font-black text-blue-300">({kw.count})</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div>
                            <p className="text-xs font-bold text-slate-400 uppercase mb-1">Mô tả kênh</p>
                            <p className="text-sm text-slate-700 leading-relaxed italic font-medium">
                              "{channelData.aiAnalysis?.seo?.descriptionAnalysis}"
                            </p>
                          </div>
                          
                          <div className="grid md:grid-cols-2 gap-4 pt-4 border-t border-emerald-200/30">
                            <div className="p-4 bg-white rounded-xl shadow-sm border border-emerald-100/50">
                              <p className="text-xs font-black text-emerald-600 uppercase mb-2 tracking-widest">Góp ý bộ thẻ (Tags)</p>
                              <p className="text-sm text-slate-600 font-medium leading-relaxed">{channelData.aiAnalysis?.seo?.tagFocusAdvice}</p>
                            </div>
                            <div className="p-4 bg-white rounded-xl shadow-sm border border-emerald-100/50">
                              <p className="text-xs font-black text-emerald-600 uppercase mb-2 tracking-widest">Từ khóa tiềm năng</p>
                              <p className="text-sm text-slate-600 font-medium leading-relaxed">{channelData.aiAnalysis?.seo?.keywordOptimization}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100">
                        <h4 className="text-xs font-black text-amber-600 uppercase tracking-widest mb-4">Nhận xét Tiêu đề (Title)</h4>
                        <p className="text-sm font-medium text-slate-700 mb-4">{channelData.aiAnalysis.titleFeedback?.analysis}</p>
                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Công thức phổ biến</p>
                            <ul className="list-disc list-inside text-sm text-slate-600 space-y-1 font-medium">
                              {channelData.aiAnalysis.titleFeedback?.formulas?.map((f, i) => <li key={i}>{f}</li>)}
                            </ul>
                          </div>
                          <div className="p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Mẫu tiêu biểu</p>
                            <ul className="list-disc list-inside text-sm text-slate-600 space-y-1 font-medium">
                              {channelData.aiAnalysis.titleFeedback?.samples?.map((s, i) => <li key={i}>{s}</li>)}
                            </ul>
                          </div>
                        </div>
                      </div>

                      <div className="p-6 bg-indigo-50 rounded-2xl border border-indigo-100">
                        <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-4">Phân tích mô tả kênh</h4>
                        <div className="grid md:grid-cols-2 gap-4">
                           <div className="p-4 bg-white rounded-xl shadow-sm border border-emerald-100">
                             <p className="text-sm font-bold text-green-600 mb-2">Điểm mạnh:</p>
                             <p className="text-sm text-slate-700 font-medium">{channelData.aiAnalysis.descriptionFeedback?.strengths}</p>
                           </div>
                           <div className="p-4 bg-white rounded-xl shadow-sm border border-red-100">
                             <p className="text-sm font-bold text-red-500 mb-2">Điểm yếu:</p>
                             <p className="text-sm text-slate-700 font-medium">{channelData.aiAnalysis.descriptionFeedback?.weaknesses}</p>
                           </div>
                        </div>
                      </div>

                      {/* Cảnh báo / Giải pháp nội dung AI (Nếu có) */}
                      {channelData.aiAnalysis?.aiContentPolicy?.isDetected && (
                        <div className="p-5 bg-amber-50 rounded-2xl border-2 border-amber-100 shadow-sm mt-6">
                          <h4 className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                             <AlertTriangle size={14} /> Cảnh báo: Nguồn gốc nội dung & Tính chính danh
                          </h4>
                          <p className="text-sm text-slate-700 leading-relaxed mb-4">
                            {channelData.aiAnalysis.aiContentPolicy.analysis}
                          </p>
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Lộ trình giải pháp an toàn:</p>
                            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {channelData.aiAnalysis.aiContentPolicy.solutions.map((sol, i) => (
                                <li key={i} className="flex items-start gap-2 text-xs text-slate-600 bg-white p-2 rounded-lg border border-amber-50 font-medium">
                                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                                  {sol}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                )}

                {/* 3. ĐỊNH VỊ KÊNH & CHIẾN LƯỢC phát triển */}
                <Card className="p-8 flex flex-col bg-gradient-to-br from-sky-50 via-white to-indigo-50 border-2 border-sky-100 shadow-sm">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-black flex items-center gap-3 text-slate-800">
                      <Target size={24} className="text-blue-500" /> ĐỊNH VỊ KÊNH & CHIẾN LƯỢC
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                    {[
                      { label: 'Người đăng ký', value: formatNumber(channelData.statistics.subscriberCount) },
                      { label: 'Tổng view', value: formatNumber(channelData.statistics.viewCount) },
                      { label: 'Tổng video', value: formatNumber(channelData.statistics.videoCount) },
                      {
                        label: 'Video mới nhất',
                        value: formatNumber(channelData.latestVideo?.viewCount || 0),
                        title: channelData.latestVideo?.title?.slice(0, 42) || 'Chưa có video mới'
                      }
                    ].map((item, i) => (
                      <div key={i} className="rounded-2xl bg-white/85 border border-sky-100 p-4 shadow-sm">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.label}</p>
                        <p className="text-lg font-black text-slate-900 leading-tight">{item.value}</p>
                        {'title' in item && item.title ? (
                          <p className="text-[10px] font-bold text-sky-600 mt-1 line-clamp-1">{item.title}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex-1 space-y-4">
                    {/* Bố trí lại 4 mục định vị thành các block hàng ngang giống Chi tiết chiến lược */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-5 bg-white rounded-2xl border border-slate-200">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                          🎯 Ngách chính
                        </h4>
                        <p className="text-sm font-bold text-slate-700">{channelData.aiAnalysis?.overview?.niche || "Đang phân tích..."}</p>
                      </div>

                      <div className="p-5 bg-white rounded-2xl border border-slate-200">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                          📱 Loại nội dung
                        </h4>
                        <p className="text-sm font-bold text-slate-700">{channelData.aiAnalysis?.overview?.mainContent || "Đang phân tích..."}</p>
                      </div>

                      <div className="p-5 bg-white rounded-2xl border border-slate-200">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                          🔎 Ngách phụ tiềm năng
                        </h4>
                        <p className="text-sm font-bold text-slate-700">{channelData.aiAnalysis?.nicheAnalysis?.subNiche || "Đang phân tích..."}</p>
                      </div>

                      <div className="p-5 bg-white rounded-2xl border border-slate-200">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                          👥 Đối tượng người xem
                        </h4>
                        <p className="text-sm font-bold text-slate-700">{channelData.aiAnalysis?.overview?.targetAudience || "Đang phân tích..."}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm text-center flex flex-col justify-center min-h-[80px]">
                        <p className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">Độ cạnh tranh</p>
                        <p className={`text-lg font-black ${channelData.aiAnalysis?.nicheAnalysis?.competition === 'Cao' ? 'text-amber-500' : 'text-green-500'}`}>{channelData.aiAnalysis?.nicheAnalysis?.competition}</p>
                      </div>
                      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm text-center flex flex-col justify-center min-h-[80px]">
                        <p className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">Tiềm năng</p>
                        <p className={`text-lg font-black text-indigo-600`}>{channelData.aiAnalysis?.nicheAnalysis?.growthPotential}</p>
                      </div>
                    </div>

                    <div className="p-5 bg-white rounded-2xl border border-slate-200">
                      <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2">📝 Chi tiết chiến lược</h4>
                      <p className="text-sm font-medium text-slate-700 leading-relaxed whitespace-pre-line">
                        {channelData.aiAnalysis?.nicheAnalysis?.advice}
                        {`

Nhận xét dữ liệu kênh: kênh hiện có ${formatNumber(channelData.statistics.subscriberCount)} sub, ${formatNumber(channelData.statistics.viewCount)} tổng view và ${formatNumber(channelData.statistics.videoCount)} video. Khu vực kênh: ${COUNTRY_MAP[channelData.brandingSettings?.channel?.country || '']?.name || channelData.brandingSettings?.channel?.country || 'Không rõ'}. Trạng thái kiếm tiền hiện tại: ${channelData.aiAnalysis?.monetizationStatusLabel || 'Đang kiểm tra'}. Giờ xem công khai không được API trả trực tiếp, nên hệ thống chỉ dùng tổng view, tần suất đăng và hiệu suất video để ước tính tiềm năng.`}
                      </p>
                    </div>
                  </div>
                </Card>

                {/* 6. GÓP Ý CẢI THIỆN KÊNH */}
                {channelData.aiAnalysis && (
                  <Card className="p-8 md:p-10 border-2 border-amber-100 bg-gradient-to-br from-amber-50 via-white to-orange-50 shadow-sm">
                     <div className="flex items-center gap-4 mb-8">
                      <div className="p-3 bg-amber-100 text-amber-600 rounded-2xl shadow-lg shadow-amber-100/50">
                        <Zap size={24} />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black text-slate-900 leading-none">GÓP Ý CẢI THIỆN KÊNH</h3>
                        <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">KẾT HỢP DỮ LIỆU THẬT & PHÂN TÍCH CHIẾN LƯỢC</p>
                      </div>
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
                        <h4 className="text-xs font-black text-red-600 uppercase tracking-widest mb-2">🔥 Việc cần làm gấp (Hôm nay)</h4>
                        <p className="text-sm font-medium text-slate-700 leading-relaxed whitespace-pre-line">
                          {channelData.aiAnalysis.improvement?.urgent}
                          {`\n\nƯu tiên theo dữ liệu thật: rà soát 5-9 video có view cao nhất, giữ lại format/thumbnail/title đang có VPH tốt, sửa ngay mô tả kênh và bộ từ khóa nếu lệch với chủ đề video thực tế.`}
                        </p>
                      </div>

                      <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
                        <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-3">🚀 Roadmap 30 ngày tới</h4>
                        <ol className="list-decimal list-inside space-y-3 text-sm text-slate-700 font-medium">
                          {channelData.aiAnalysis.improvement?.strategy30Days?.map((s, i) => <li key={i} className="pl-1">{s}</li>)}
                        </ol>
                      </div>

                      <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
                        <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest mb-2">⏳ Tối ưu dần (Tháng này)</h4>
                        <p className="text-sm font-medium text-slate-700 leading-relaxed whitespace-pre-line">
                          {channelData.aiAnalysis.improvement?.optimizeLater}
                          {`\n\nTrong tháng này nên xây bộ series dựa trên nhóm từ khóa đang xuất hiện nhiều nhất: ${channelData.aiAnalysis?.topKeywords?.slice(0, 6).map(k => k.name).join(', ') || 'chủ đề chính của kênh'}. Mỗi series cần tiêu đề, thumbnail và mô tả đồng bộ để thuật toán nhận diện rõ ngách.`}
                        </p>
                      </div>

                      <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
                        <h4 className="text-xs font-black text-blue-600 uppercase tracking-widest mb-2">💡 Ý tưởng Video tiếp theo</h4>
                        <ul className="list-disc list-inside space-y-1.5 text-sm text-slate-700">
                          {channelData.aiAnalysis.improvement?.nextIdeas?.map((n, i) => <li key={i}>{n}</li>)}
                        </ul>
                      </div>
                    </div>

                    <div className="mt-8 p-6 bg-gradient-to-br from-sky-50 via-white to-indigo-50 rounded-3xl border border-sky-100 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-40 h-40 bg-sky-200/30 blur-3xl rounded-full" />
                      <div className="relative z-10 space-y-4">
                        <h4 className="text-[10px] font-black text-sky-600 uppercase tracking-widest mb-2 border-b border-sky-100 pb-3 flex items-center gap-2">
                           <Star size={16} /> Kết luận chuyên gia về kênh
                        </h4>
                        <div className="grid md:grid-cols-2 gap-4">
                           <div className="p-3 bg-white rounded-xl border border-sky-100 shadow-sm">
                             <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Tiềm năng kênh</p>
                             <p className="text-slate-900 font-black text-lg">{channelData.aiAnalysis.conclusion?.potential}</p>
                           </div>
                           <div className="p-3 bg-white rounded-xl border border-indigo-100 shadow-sm">
                             <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Trọng tâm cốt lõi</p>
                             <p className="text-slate-900 font-black text-lg">{channelData.aiAnalysis.conclusion?.focusPoint}</p>
                           </div>
                        </div>
                        <p className="text-slate-800 text-base leading-relaxed italic border-l-4 border-sky-500 pl-4 mt-4 font-semibold">
                          "{channelData.aiAnalysis.conclusion?.verdict}"
                        </p>
                      </div>
                    </div>
                  </Card>
                )}

                {/* GỢI Ý NGÁCH & CHỦ ĐỀ KÊNH */}
                <Card className="p-8 md:p-10 border-2 border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-sky-50 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl shadow-lg shadow-emerald-100/60">
                        <Hash size={24} />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black text-slate-900 leading-none uppercase">GỢI Ý NGÁCH & CHỦ ĐỀ KÊNH</h3>
                        <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">Từ khóa, VPH, lượt xem và video liên quan theo chủ đề hiện tại</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-bold">
                      <div className="bg-white rounded-xl border border-emerald-100 p-3">
                        <p className="text-slate-400 uppercase text-[9px] tracking-widest">Chủ đề</p>
                        <p className="text-slate-800 line-clamp-2">{channelData.nicheScanMeta?.currentTopic || channelData.aiAnalysis?.overview?.niche || channelData.title}</p>
                      </div>
                      <div className="bg-white rounded-xl border border-emerald-100 p-3">
                        <p className="text-slate-400 uppercase text-[9px] tracking-widest">Khu vực</p>
                        <p className="text-slate-800">{channelData.nicheScanMeta?.regionName || getCountryNameVi(channelData.brandingSettings?.channel?.country || 'VN')}</p>
                      </div>
                      <div className="bg-white rounded-xl border border-emerald-100 p-3">
                        <p className="text-slate-400 uppercase text-[9px] tracking-widest">Ngôn ngữ</p>
                        <p className="text-slate-800">{channelData.nicheScanMeta?.language || detectLanguageFromText(`${channelData.title} ${channelData.description}`, channelData.brandingSettings?.channel?.country)}</p>
                      </div>
                      <div className="bg-white rounded-xl border border-emerald-100 p-3">
                        <p className="text-slate-400 uppercase text-[9px] tracking-widest">Thời gian</p>
                        <p className="text-slate-800">3 tháng gần nhất</p>
                      </div>
                    </div>
                  </div>

                  {!channelData.nicheSuggestions?.length ? (
                    <div className="rounded-3xl bg-white border border-emerald-100 p-6 text-center text-slate-600 font-bold">
                      Đang quét dữ liệu ngách và video liên quan. Nếu dữ liệu 3 tháng gần nhất ít, hệ thống sẽ tự mở rộng phạm vi.
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                          { label: 'Số ngách', value: channelData.nicheSuggestions.length },
                          { label: 'VPH cao nhất', value: formatNumber(Math.max(...channelData.nicheSuggestions.map(n => n.avgVph || 0))) },
                          { label: 'Tổng view mẫu', value: formatNumber(channelData.nicheSuggestions.reduce((s, n) => s + n.totalViews, 0)) },
                          { label: 'Video liên quan', value: formatNumber(channelData.nicheSuggestions.reduce((s, n) => s + n.trendVideoCount, 0)) }
                        ].map((m, i) => (
                          <div key={i} className="bg-white rounded-2xl border border-emerald-100 p-4 shadow-sm">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{m.label}</p>
                            <p className="text-2xl font-black text-slate-900">{m.value}</p>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-4">
                        {channelData.nicheSuggestions.map((niche, idx) => (
                          <div key={idx} className="rounded-3xl border border-emerald-100 bg-white shadow-sm overflow-hidden">
                            <div className="p-4 md:p-5 border-b border-emerald-50 bg-white">
                              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                                <div className="flex items-start gap-3 min-w-0">
                                  <span className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-black text-xs shrink-0">#{idx + 1}</span>
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h4 className="text-lg md:text-xl font-black text-slate-900 leading-snug">{niche.keyword}</h4>
                                      <button
                                        onClick={() => navigator.clipboard.writeText(niche.keyword).then(() => toast.success('Đã copy từ khóa'))}
                                        className="w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 flex items-center justify-center text-blue-600 shrink-0"
                                        title="Copy từ khóa"
                                      >
                                        <Copy size={15} />
                                      </button>
                                    </div>
                                    <p className="text-[11px] text-slate-500 font-bold mt-1">Ngách lấy từ video/kênh liên quan cùng chủ đề.</p>
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2 shrink-0">
                                  <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Tiềm năng: {niche.potential}</span>
                                  <span className="inline-flex rounded-full bg-slate-50 px-3 py-1 text-xs font-black text-slate-700">Cạnh tranh: {niche.competition}</span>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Điểm</p>
                                  <p className="text-xl font-black text-emerald-600 mt-1">{niche.score}/100</p>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">VPH TB</p>
                                  <p className="text-xl font-black text-blue-600 mt-1">{formatNumber(niche.avgVph)}</p>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tổng view</p>
                                  <p className="text-xl font-black text-slate-900 mt-1">{formatNumber(niche.totalViews)}</p>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Video trend</p>
                                  <p className="text-xl font-black text-orange-500 mt-1">{niche.trendVideoCount}</p>
                                </div>
                              </div>
                            </div>

                            <div className="p-4 md:p-5 bg-emerald-50/20">
                              <div className="flex items-center justify-between gap-3 mb-3">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Video liên quan</p>
                                <p className="text-[10px] font-bold text-slate-400">Hiển thị tối đa 6 video</p>
                              </div>
                              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                                {niche.relatedVideos.slice(0, 6).map(video => (
                                  <div key={video.id} className="flex flex-col sm:flex-row gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                                    <button onClick={() => setEmbeddedVideo({ id: video.id, title: video.title })} className="relative w-full sm:w-36 h-24 sm:h-20 rounded-xl overflow-hidden shrink-0 bg-slate-200 group" title="Xem video trực tiếp">
                                      <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
                                      <span className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/25 transition-colors">
                                        <span className="w-8 h-8 rounded-full bg-white/70 flex items-center justify-center">
                                          <Play size={14} className="text-slate-900 fill-slate-900" />
                                        </span>
                                      </span>
                                    </button>
                                    <div className="min-w-0 flex-1">
                                      <p className="font-black text-sm text-slate-800 leading-snug line-clamp-2">{video.title}</p>
                                      <p className="text-[11px] text-slate-500 font-bold line-clamp-1 mt-1">{video.channelTitle}</p>
                                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-[10px] font-black">
                                        <span className="text-slate-600">Views: {formatNumber(video.viewCount)}</span>
                                        <span className="text-blue-600">VPH: {formatNumber(video.vph)}</span>
                                        <span className="text-emerald-600">Score: {video.score}</span>
                                        <span className="text-slate-500 line-clamp-1">{formatDate(video.publishedAt, getTimeZoneByCountry(channelData.brandingSettings?.channel?.country))}</span>
                                      </div>
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        <button
                                          onClick={() => setEmbeddedVideo({ id: video.id, title: video.title })}
                                          className="px-3 py-1.5 rounded-xl bg-slate-50 text-slate-700 text-[11px] font-black hover:bg-slate-100 inline-flex items-center gap-1"
                                        >
                                          <Play size={12} /> Xem
                                        </button>
                                        <button
                                          onClick={() => handleActionWithAuth(() => { setActiveTab('checker'); setUrl(`https://www.youtube.com/watch?v=${video.id}`); handleCheckVideo(`https://www.youtube.com/watch?v=${video.id}`); })}
                                          className="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 text-[11px] font-black hover:bg-blue-100"
                                        >
                                          Phân tích video này
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>

                {/* Technical Details Card */}
                <Card className="p-8 bg-slate-50 border-2 border-slate-200">
                  <SectionTitle icon={Info}>Chi tiết dữ liệu kỹ thuật</SectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="p-4 bg-white rounded-xl shadow-sm">
                      <p className="text-[10px] font-black text-slate-400 mb-1">CHANNEL ID</p>
                      <p className="text-xs font-mono font-bold text-slate-800">{channelData.id}</p>
                    </div>
                    <div className="p-4 bg-white rounded-xl shadow-sm">
                      <p className="text-[10px] font-black text-slate-400 mb-1">NGÀY THÀNH LẬP</p>
                      <p className="text-xs font-bold text-slate-800">
                        {formatDate(channelData.publishedAt, getTimeZoneByCountry(channelData.brandingSettings?.channel?.country))}
                      </p>
                    </div>
                    <div className="p-4 bg-white rounded-xl shadow-sm">
                      <p className="text-[10px] font-black text-slate-400 mb-1">TRẠNG THÁI RIÊNG TƯ</p>
                      <p className="text-xs font-bold text-slate-800 uppercase tracking-widest text-green-600">{channelData.status?.privacyStatus}</p>
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Navigation Tabs - Centered Below Welcome/Above Input */}
            <div className="flex justify-center mb-10">
              <div className="bg-white/80 backdrop-blur-sm p-1.5 rounded-[24px] border border-slate-200 shadow-xl flex items-center gap-1">
                <button 
                  onClick={() => setActiveTab('checker')}
                  className={`px-8 py-3 rounded-[18px] text-[13px] font-black uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap ${activeTab === 'checker' ? 'bg-sky-600 text-white shadow-lg ring-4 ring-sky-100 scale-[1.02]' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50'}`}
                >
                  Kiểm tra Video
                </button>
                <button 
                  onClick={() => setActiveTab('monetization')}
                  className={`px-8 py-3 rounded-[18px] text-[13px] font-black uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap ${activeTab === 'monetization' ? 'bg-sky-600 text-white shadow-lg ring-4 ring-sky-100 scale-[1.02]' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50'}`}
                >
                  Kiểm tra Kênh
                </button>
              </div>
            </div>

            {/* Input Section */}
            <Card className="p-6 md:p-8 border-2 border-sky-50">
              <div className="space-y-6">
                <div>
                  <SectionTitle icon={Youtube}>Kiểm tra thông tin video</SectionTitle>
                  <p className="text-sm text-slate-500 font-medium">Phân tích nhanh dữ liệu video: lượt xem, lượt thích, bình luận, thời lượng, giờ đăng, RPM ước tính và gợi ý tối ưu.</p>
                </div>
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-4 flex items-center text-slate-400">
                      <Search size={20} />
                    </div>
                    <input 
                      type="text" 
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="Dán link YouTube (Watch, Shorts, Embed...)"
                      className="w-full pl-12 pr-12 py-4 bg-slate-100 border-none rounded-2xl focus:ring-2 focus:ring-sky-500 font-medium outline-none transition-all"
                    />
                    {url && (
                      <button 
                        onClick={() => setUrl('')}
                        className="absolute inset-y-0 right-4 flex items-center text-slate-400 hover:text-sky-500 cursor-pointer"
                      >
                        <Trash2 size={20} />
                      </button>
                    )}
                  </div>
                  <button 
                    onClick={() => handleActionWithAuth(() => handleCheckVideo())}
                    disabled={loading}
                    className="bg-sky-100 hover:bg-sky-200 border border-sky-200 disabled:bg-slate-300 text-sky-700 px-8 py-4 rounded-2xl font-bold shadow-md transition-all flex items-center justify-center gap-2 min-w-[180px] cursor-pointer active:scale-95"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
                    ) : <History size={20} />}
                    {loading ? `Đang xử lý ${loadingProgress}%...` : "Kiểm tra Video"}
                  </button>
                </div>

                {error && (
                  <div className="p-4 bg-amber-50 text-amber-600 rounded-xl flex items-start gap-3 border border-amber-100 animate-in fade-in slide-in-from-top-2">
                    <AlertCircle className="shrink-0 mt-0.5" size={20} />
                    <p className="text-sm font-medium">{error}</p>
                  </div>
                )}

                {/* API settings moved to header popup. */}
              </div>
            </Card>

            {videoData && (
              <div className="space-y-8 animate-in fade-in duration-1000">
                
                {/* ZONE 1: Video Stats & RPM */}
                <Card className="p-6 md:p-8 bg-white border-2 border-slate-100 shadow-xl shadow-slate-200/50">
                  <div className="flex flex-col md:flex-row gap-8">
                    <div className="md:w-1/3 shrink-0 space-y-4">
                      <div className="relative group overflow-hidden rounded-2xl shadow-lg border border-slate-100 aspect-video">
                        <img 
                          src={(videoData.thumbnails.maxres?.url || videoData.thumbnails.high?.url) || undefined} 
                          alt={videoData.title}
                          className="w-full h-full object-cover transform transition-transform duration-700 group-hover:scale-110"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                           <button 
                             onClick={() => setEmbeddedVideo({ id: videoData.id, title: videoData.title })}
                             className="pointer-events-auto w-10 h-10 bg-black/35 hover:bg-red-600/80 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all backdrop-blur-md border border-white/50 opacity-75 hover:opacity-100"
                             title="Xem video trực tiếp"
                           >
                              <Play size={17} className="fill-white ml-0.5" />
                           </button>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4 gap-2">
                          <button 
                            onClick={() => window.open(videoData.thumbnails.maxres?.url || videoData.thumbnails.high?.url, '_blank')}
                            className="flex-1 py-2 bg-white/20 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-widest rounded-xl border border-white/30 hover:bg-white/40 transition-all flex items-center justify-center gap-2"
                          >
                            <ExternalLink size={14} /> Mở ảnh
                          </button>
                          <button 
                            onClick={() => {
                              const url = videoData.thumbnails.maxres?.url || videoData.thumbnails.high?.url;
                              if (url) downloadImage(url, `thumbnail-${videoData.id}.jpg`);
                            }}
                            className="flex-1 py-2 bg-white/20 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-widest rounded-xl border border-white/30 hover:bg-white/40 transition-all flex items-center justify-center gap-2"
                          >
                            <Download size={14} /> Tải về
                          </button>
                        </div>
                      </div>
                      
                      <div className="p-5 bg-amber-50 rounded-2xl border border-amber-100 shadow-sm relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 text-amber-100 group-hover:text-amber-200 transition-colors">
                          <Zap size={80} strokeWidth={1} />
                        </div>
                        <div className="relative z-10">
                          <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest mb-1 flex items-center gap-2">
                            <Zap size={14} className="fill-amber-600" /> RPM ước tính (Chủ đề)
                          </p>
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-amber-900 leading-none">
                              ${getRPMByCategoryId(videoData.categoryId).min.toFixed(2)} - ${getRPMByCategoryId(videoData.categoryId).max.toFixed(2)}
                            </span>
                            <span className="text-[10px] font-bold text-amber-600/70 uppercase">/ 1k views</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 space-y-6">
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                          { label: 'Lượt xem', value: formatNumber(videoData.statistics.viewCount), icon: Eye, color: 'blue' },
                          { label: 'Lượt thích', value: formatNumber(videoData.statistics.likeCount), icon: Heart, color: 'red' },
                          { label: 'Bình luận', value: formatNumber(videoData.statistics.commentCount), icon: MessageCircle, color: 'green' },
                          { label: 'Thời lượng', value: formatDuration(videoData.duration), icon: Clock, color: 'indigo' }
                        ].map((stat, i) => (
                          <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-white hover:shadow-md transition-all">
                            <stat.icon size={16} className={`text-${stat.color}-500 mb-2`} />
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{stat.label}</p>
                            <p className="text-lg font-black text-slate-900">{stat.value}</p>
                          </div>
                        ))}
                      </div>

                      <div className="p-5 bg-white rounded-2xl border border-slate-200">
                        <div className="flex flex-col sm:flex-row gap-6">
                          <div className="flex-1">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Giờ đăng (Việt Nam)</p>
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-600 font-bold text-xs border border-red-200">VN</div>
                              <p className="text-base font-black text-slate-800">{formatDate(videoData.publishedAt, 'Asia/Ho_Chi_Minh')}</p>
                            </div>
                          </div>
                          <div className="flex-1">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Giờ đăng (Quốc tế)</p>
                            <div className="flex items-center gap-3 text-slate-500">
                              <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs border border-slate-300 uppercase">UTC</div>
                              <p className="text-base font-bold">{formatDate(videoData.publishedAt, 'UTC')}</p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="mt-6 pt-6 border-t border-slate-200/60 flex flex-col sm:flex-row items-center justify-center gap-4">
                          <a 
                            href={`https://youtube.com/channel/${videoData.channelId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-50 hover:bg-slate-100 rounded-2xl text-slate-700 transition-all border border-slate-200"
                          >
                             <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">KÊNH YOUTUBE:</span>
                             <span className="text-sm font-black text-blue-600 hover:underline truncate max-w-[200px]">{videoData.channelTitle}</span>
                          </a>
                          <button 
                            onClick={(e) => {
                              e.preventDefault();
                              handleActionWithAuth(() => {
                                setActiveTab('monetization');
                                setChannelUrl(videoData.channelId);
                                handleCheckChannel(videoData.channelId);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              });
                            }}
                            className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-red-700 transition-all active:scale-95 shadow-lg shadow-red-100 border border-red-500"
                          >
                            <Search size={18} /> Phân tích kênh này
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* ZONE 2: Content Details */}
                <Card className="p-6 md:p-8 bg-slate-50 border-2 border-slate-200">
                  <div className="flex items-center justify-between mb-8 border-b border-slate-200 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-red-600 text-white rounded-xl shadow-lg shadow-red-200">
                        <LayoutGrid size={24} />
                      </div>
                      <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Chi tiết nội dung kỹ thuật</h3>
                    </div>
                    <div className="flex gap-2">
                       <button 
                        onClick={() => downloadTxt(videoData)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl border border-slate-200 hover:bg-slate-200 transition-all shadow-sm active:scale-95 text-sm font-bold"
                        title="Tải báo cáo .TXT"
                      >
                        <Download size={18} /> Tải TXT
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <DataItem icon={Type} label="Tiêu đề video" value={videoData.title} />
                    <DataItem
                      icon={Link}
                      label="Link Video"
                      value={
                        <div className="flex items-center gap-2 min-w-0">
                          <a href={videoData.normalizedUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all flex-1 min-w-0">
                            {videoData.normalizedUrl}
                          </a>
                          <CopyButton
                            text={videoData.normalizedUrl}
                            iconSize={15}
                            className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-sky-50 text-sky-600 border border-sky-100 hover:bg-sky-100 transition-colors"
                          />
                        </div>
                      }
                    />
                    
                    <DataItem 
                      icon={Youtube}
                      label="Tên kênh" 
                      value={
                        <a href={videoData.channelCustomUrl ? `https://www.youtube.com/${videoData.channelCustomUrl}` : `https://www.youtube.com/channel/${videoData.channelId}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-blue-600 hover:underline">
                          {videoData.channelTitle} <CheckCircle2 size={12} className="text-blue-500" />
                        </a>
                      } 
                    />
                    <DataItem icon={Hash} label="Channel ID" value={videoData.channelId} />
                    
                    <DataItem icon={Globe} label="Quốc gia kênh" value={videoData.channelCountry && COUNTRY_MAP[videoData.channelCountry] ? `${COUNTRY_MAP[videoData.channelCountry].flag} ${COUNTRY_MAP[videoData.channelCountry].name}` : (videoData.channelCountry || "Unknown")} />
                    <DataItem icon={Hash} label="Video ID" value={videoData.id} />
                    
                    <DataItem icon={FolderOpen} label="Category ID" value={videoData.categoryId} />
                    <DataItem icon={Tag} label="Category Name" value={videoData.categoryName} />
                    
                    <DataItem icon={FolderOpen} label="Category tiếng Việt" value={videoData.categoryVi} />

                    <DataItem icon={Clock} label="Giờ UTC (Gốc)" value={formatDate(videoData.publishedAt, 'UTC')} />
                    <DataItem icon={Clock} label="Thời lượng" value={formatDuration(videoData.duration)} />

                    <DataItem icon={Clock} label="Giờ VN (GMT+7)" value={formatDate(videoData.publishedAt, 'Asia/Ho_Chi_Minh')} />
                    <DataItem icon={Eye} label="Lượt xem video" value={formatNumber(videoData.statistics.viewCount)} />

                    <DataItem icon={ThumbsUp} label="Số lượt thích" value={formatNumber(videoData.statistics.likeCount)} />
                    <DataItem icon={MessageSquare} label="Số lượt bình luận" value={formatNumber(videoData.statistics.commentCount)} />

                    <DataItem icon={Calendar} label="Thời gian check" value={videoData.checkedAt ? formatDate(videoData.checkedAt, 'Asia/Ho_Chi_Minh') : "Đang kiểm tra..."} />
                  </div>
                </Card>

                {/* ZONE 3: Description & Tags */}
                <div className="grid md:grid-cols-2 gap-8">
                  <Card className="p-6 md:p-8 flex flex-col min-h-[400px]">
                    <div className="flex items-center justify-between mb-6">
                       <SectionTitle icon={FileText}>Mô tả Video (Description)</SectionTitle>
                       <CopyButton text={videoData.description} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:text-red-500 transition-all" />
                    </div>
                    <div className="flex-1 p-5 bg-slate-50/50 rounded-2xl border border-slate-100 whitespace-pre-wrap break-words text-slate-700 text-sm leading-relaxed overflow-y-auto max-h-[500px]">
                      {renderTextWithLinks(videoData.description) || "Không có mô tả cho video này."}
                    </div>
                  </Card>

                  <Card className="p-6 md:p-8 flex flex-col min-h-[400px]">
                    <div className="flex items-center justify-between mb-6">
                      <SectionTitle icon={Hash}>Dàn Tags Video</SectionTitle>
                      <CopyButton text={videoData.tags.join(', ')} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:text-red-500 transition-all" />
                    </div>
                    <div className="flex-1 p-5 bg-slate-50/50 rounded-2xl border border-slate-100 overflow-y-auto max-h-[500px]">
                      <div className="flex flex-wrap gap-2">
                        {videoData.tags.length > 0 ? videoData.tags.map((tag, idx) => (
                          <div key={idx} className="px-3 py-2 bg-white text-slate-700 text-xs font-bold rounded-xl border border-slate-200 shadow-sm flex items-center gap-2 group hover:border-red-200 transition-all">
                            <Tag size={12} className="text-slate-300 group-hover:text-red-400" />
                            {tag}
                          </div>
                        )) : <div className="text-slate-400 italic font-medium px-4 py-8 w-full text-center">Video này không sử dụng tags.</div>}
                      </div>
                    </div>
                    <div className="mt-6 pt-6 border-t border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Từ khóa chính SEO</p>
                      <p className="text-lg font-black text-slate-900 px-1">{videoData.seoSuggestions?.primaryKeyword || "Đang phân tích..."}</p>
                    </div>
                  </Card>
                </div>

                {/* ZONE 4: Overall Assessment & Improvements */}
                <div className="space-y-6">
                  <SectionTitle 
                    icon={Sparkles}
                    action={
                      <button
                        onClick={() => {
                          const formatSection = (title: string, data: any) => {
                            if (!data) return `Đánh giá ${title}:\nChưa có phân tích\n\n`;
                            let text = `Đánh giá ${title}:\n${data.comment || data.summary || 'Chưa có phân tích'}\n`;
                            if (data.strengths) text += `Điểm mạnh: ${data.strengths}\n`;
                            if (data.weaknesses) text += `Cần cải thiện: ${data.weaknesses}\n`;
                            if (data.suggestions) {
                              text += `Gợi ý:\n`;
                              if (Array.isArray(data.suggestions)) {
                                text += data.suggestions.map((s: string) => `- ${s}`).join('\n') + '\n';
                              } else {
                                text += `- ${data.suggestions}\n`;
                              }
                            }
                            return text + '\n';
                          };

                          let content = `========== ĐÁNH GIÁ TỔNG QUAN - CẢI TIẾN VIDEO ==========\n\n`;
                          content += formatSection('Tiêu đề (Title)', videoData.aiAnalysis?.titleAnalysis);
                          content += formatSection('Mô tả (Description)', videoData.aiAnalysis?.descriptionAnalysis);
                          content += formatSection('Thumbnail', videoData.aiAnalysis?.thumbnailAnalysis);
                          content += formatSection('Tags & Hashtags', videoData.aiAnalysis?.tagsHashtagsAnalysis);
                          content += formatSection('Chủ đề & Xu hướng', videoData.aiAnalysis?.topicAnalysis);

                          const pinnedComment = videoData.aiAnalysis?.pinnedCommentAnalysis;
                          content += `Đánh giá Bình luận ghim:\n`;
                          content += `Trạng thái: ${pinnedComment?.hasPinnedComment ? 'Đã ghim' : 'Chưa ghim'}\n`;
                          content += `Nhận xét: ${pinnedComment?.feedback || 'Chưa có phân tích'}\n`;
                          if (pinnedComment?.suggestion) {
                            content += `Gợi ý: ${pinnedComment.suggestion}\n`;
                          }
                          content += '\n';

                          downloadSectionTxt('Danh Gia Tong Quan Cai Tien', content, videoData.channelTitle);
                        }}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer active:scale-95"
                      >
                        <Download size={14} /> Tải TXT
                      </button>
                    }
                  >
                    Đánh giá tổng quan - Cải tiến video
                  </SectionTitle>
                  {analysisProgress?.kind === 'video' && !videoData.aiAnalysis && (
                    <AnalysisProgressBox kind="video" percent={analysisProgress.percent} />
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <AssessmentCard 
                      title="Tiêu đề (Title)" 
                      icon={Type}
                      data={videoData.aiAnalysis?.titleAnalysis} 
                    />
                    <AssessmentCard 
                      title="Mô tả (Description)" 
                      icon={FileText}
                      data={videoData.aiAnalysis?.descriptionAnalysis} 
                    />
                    <AssessmentCard 
                      title="Thumbnail" 
                      icon={ImagePlay}
                      data={videoData.aiAnalysis?.thumbnailAnalysis} 
                    />
                    <AssessmentCard 
                      title="Tags & Hashtags"
                      icon={Hash} 
                      data={videoData.aiAnalysis?.tagsHashtagsAnalysis} 
                    >
                      {videoData.tags && videoData.tags.length > 0 && (
                        <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
                          <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1 mb-2">
                            <Tag size={10} /> Dữ liệu thực từ API ({videoData.tags.length} tags):
                          </p>
                          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1 custom-scrollbar">
                            {videoData.tags.map((tag: string, index: number) => (
                              <span key={index} className="inline-flex py-0.5 px-2 bg-white border border-slate-200 rounded-md text-[10px] items-center gap-1 text-slate-600 truncate max-w-full">
                                <Tag size={8} className="text-slate-400 shrink-0" />
                                <span className="truncate">{tag}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </AssessmentCard>
                    <AssessmentCard 
                      title="Chủ đề & Xu hướng" 
                      icon={TrendingUp}
                      data={videoData.aiAnalysis?.topicAnalysis} 
                    />
                    
                    {/* CTA/Pinned Comment Analysis consolidated here */}
                    <Card className="p-6 border-l-4 border-l-sky-500 bg-sky-50/20 shadow-sm relative group overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                         <Pin size={100} className="rotate-45" />
                      </div>
                      <div className="relative z-10 space-y-4">
                        <div className="flex items-center justify-between">
                           <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                             <Pin size={16} className="text-sky-600 rotate-45" /> Bình luận ghim
                           </h4>
                           <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${videoData.aiAnalysis?.pinnedCommentAnalysis?.hasPinnedComment ? 'bg-sky-100 text-sky-700 border border-sky-200' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
                             {videoData.aiAnalysis?.pinnedCommentAnalysis?.hasPinnedComment ? 'Đã ghim' : 'Chưa ghim'}
                           </span>
                        </div>
                        {videoData.comments && videoData.comments.length > 0 && (
                          <div className="mt-2 p-3 bg-slate-50 border border-slate-100 rounded-lg">
                            <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1 mb-1">
                              <MessageSquare size={10} /> Dữ liệu thực từ API:
                            </p>
                            <div className="text-xs text-slate-800 max-h-36 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                              {videoData.comments.slice(0, 5).map((comment: any, idx: number) => (
                                <div key={idx} className="pb-2 border-b border-slate-100 last:border-b-0 last:pb-0">
                                  <span className="font-bold">{comment.authorDisplayName}: </span>
                                  <span dangerouslySetInnerHTML={{ __html: comment.textDisplay || '' }} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <p className="text-[13px] text-slate-800 font-medium leading-relaxed italic border-t border-slate-100 pt-3">
                           {videoData.aiAnalysis?.pinnedCommentAnalysis?.feedback || "Hệ thống chưa có phản hồi."}
                        </p>
                        <div className="p-4 bg-white rounded-xl border border-sky-100 shadow-sm relative group/copy">
                           <p className="text-[10px] font-bold text-sky-600 mb-2 uppercase tracking-widest">GỢI Ý:</p>
                           <p className="text-sm font-black text-slate-800 leading-relaxed italic">
                             "{videoData.aiAnalysis?.pinnedCommentAnalysis?.suggestion || "Hãy ghim một lời kêu gọi hành động ngay!"}"
                           </p>
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>

                {/* ZONE 5: Content & Style Analysis */}
                <div className="space-y-6">
                  <SectionTitle 
                    icon={ListChecks}
                    action={
                      <button
                        onClick={() => {
                          const content = `========== PHÂN TÍCH NỘI DUNG & PHONG CÁCH ==========\n\n` +
                            `★ PHÂN TÍCH NỘI DUNG VIDEO:\n` +
                            `${videoData.aiAnalysis?.contentAnalysisList?.map(i => `• ${i}`).join('\n') || 'Đang cập nhật...'}\n\n` +
                            `★ PHÂN TÍCH PHONG CÁCH VIDEO:\n` +
                            `${videoData.aiAnalysis?.styleAnalysisList?.map(i => `• ${i}`).join('\n') || 'Đang cập nhật...'}\n\n` +
                            `★ KẾT LUẬN CUỐI CÙNG:\n` +
                            `- Nhận định: ${videoData.aiAnalysis?.conclusionSummary?.finalVerdict || 'N/A'}\n` +
                            `- Trạng thái: ${videoData.aiAnalysis?.conclusionSummary?.currentStatus || 'N/A'}\n` +
                            `- Hạn chế lớn nhất: ${videoData.aiAnalysis?.conclusionSummary?.biggestWeakness || 'N/A'}\n\n` +
                            `- 3 việc cần làm ngay:\n` +
                            `${videoData.aiAnalysis?.conclusionSummary?.top3Fixes?.map((fix, idx) => `  ${idx + 1}. ${fix}`).join('\n') || '  N/A'}\n`;
                          downloadSectionTxt('Phan Tich Noi Dung Phong Cach', content, videoData.channelTitle);
                        }}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer active:scale-95"
                      >
                        <Download size={14} /> Tải TXT
                      </button>
                    }
                  >
                    PHÂN TÍCH NỘI DUNG & PHONG CÁCH VIDEO
                  </SectionTitle>
                  {analysisProgress?.kind === 'video' && !videoData.aiAnalysis && (
                    <AnalysisProgressBox kind="video" percent={analysisProgress.percent} />
                  )}
                  <Card className="p-6 md:p-8 bg-white border-2 border-slate-200 shadow-xl shadow-slate-100 overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 opacity-50" />
                    <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-10">
                      
                      {/* Content Analysis List */}
                      <div className="space-y-6">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                           <div className="flex items-center gap-3">
                              <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                 <Target size={18} />
                              </div>
                              <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Phân tích Nội dung</h4>
                           </div>
                           <CopyButton 
                             text={videoData.aiAnalysis?.contentAnalysisList?.join('\n') || ''}
                             className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors cursor-pointer active:scale-90"
                             iconSize={16}
                           />
                        </div>
                        <ul className="space-y-4">
                          {videoData.aiAnalysis?.contentAnalysisList?.map((item, i) => renderAnalysisItem(item, i, 'bg-indigo-400')) || <li className="text-slate-400 italic text-sm">Đang cập nhật phân tích nội dung...</li>}
                        </ul>
                      </div>

                      {/* Style Analysis List */}
                      <div className="space-y-6">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                           <div className="flex items-center gap-3">
                              <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                                 <Palette size={18} />
                              </div>
                              <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Phân tích Phong cách</h4>
                           </div>
                           <CopyButton 
                             text={videoData.aiAnalysis?.styleAnalysisList?.join('\n') || ''}
                             className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-md transition-colors cursor-pointer active:scale-90"
                             iconSize={16}
                           />
                        </div>
                        <ul className="space-y-4">
                          {videoData.aiAnalysis?.styleAnalysisList?.map((item, i) => renderAnalysisItem(item, i, 'bg-purple-400')) || <li className="text-slate-400 italic text-sm">Đang cập nhật phân tích phong cách...</li>}
                        </ul>
                      </div>
                    </div>

                    <div className="mt-10 pt-8 border-t border-slate-100 grid md:grid-cols-2 gap-8">
                       <div className="space-y-4">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                             <Check size={14} className="text-green-500" /> Điểm mạnh nổi bật
                          </p>
                          <div className="space-y-2">
                             {videoData.aiAnalysis?.strengthsWeaknesses?.strengths?.map((s, i) => (
                               <div key={i} className="text-xs font-bold text-green-700 bg-green-50 px-3 py-2 rounded-xl border border-green-100">
                                 {s.point}
                               </div>
                             ))}
                          </div>
                       </div>
                       <div className="space-y-4">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                             <AlertTriangle size={14} className="text-amber-500" /> Vấn đề cần lưu ý
                          </p>
                          <div className="space-y-2">
                            {videoData.aiAnalysis?.strengthsWeaknesses?.weaknesses?.map((w, i) => (
                               <div key={i} className="text-xs font-bold text-amber-700 bg-amber-50 px-3 py-2 rounded-xl border border-amber-100">
                                 {w.point}
                               </div>
                             ))}
                          </div>
                       </div>
                    </div>
                  </Card>
                </div>

                {/* AI Recognition & Final Verdict */}
                <div className="grid md:grid-cols-2 gap-8">
                   {/* AI Detection */}
                   {videoData.aiAnalysis?.isAiGenerated && (
                      <Card className={`p-6 border-l-4 ${videoData.aiAnalysis.isAiGenerated.isAi ? 'border-l-amber-500 bg-amber-50/20' : 'border-l-emerald-500 bg-emerald-50/20'} flex flex-col justify-center`}>
                        <div className="flex items-center gap-4 mb-4">
                           <div className={`p-3 rounded-2xl ${videoData.aiAnalysis.isAiGenerated.isAi ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                              <Cpu size={24} />
                           </div>
                           <div>
                              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-0.5">Xác thực nguồn gốc</p>
                              <h4 className="text-lg font-black text-slate-900">
                                {videoData.aiAnalysis.isAiGenerated.isAi ? 'Nội dung sản xuất công nghiệp / có sự can thiệp của AI' : 'Khả năng cao do Người thật tạo ra'}
                              </h4>
                           </div>
                        </div>
                        <p className="text-sm font-medium text-slate-600 leading-relaxed italic px-4 border-l-2 border-slate-200">
                          "{videoData.aiAnalysis.isAiGenerated.reasoning}"
                        </p>
                      </Card>
                   )}

                   {/* Quick Conclusion */}
                   <Card className="md:col-span-2 p-6 md:p-8 bg-gradient-to-br from-sky-50 via-white to-indigo-50 text-slate-900 border-2 border-sky-100 relative overflow-hidden flex flex-col justify-center">
                      <div className="absolute top-0 right-0 p-8 opacity-10 text-sky-500">
                         <Sparkles size={80} />
                      </div>
                      <div className="relative z-10">
                         <p className="text-[10px] font-black text-sky-600 uppercase tracking-[0.2em] mb-3">Kết luận cuối cùng</p>
                         <p className="text-xl md:text-2xl font-black leading-tight mb-5 max-w-5xl text-slate-900">{videoData.aiAnalysis?.conclusionSummary?.finalVerdict}</p>
                         <div className="flex flex-col md:flex-row gap-3">
                           <div className="px-3 py-1 bg-white rounded-lg text-[10px] font-bold border border-sky-100 text-slate-700">
                             {videoData.aiAnalysis?.conclusionSummary?.currentStatus}
                           </div>
                           <div className="px-3 py-1 bg-amber-50 rounded-lg text-[10px] font-bold border border-amber-200 text-amber-700">
                             Hạn chế: {videoData.aiAnalysis?.conclusionSummary?.biggestWeakness}
                           </div>
                         </div>
                      </div>
                   </Card>
                </div>

              </div>
            )}

            {/* Guide Section Toggle */}
            <div className="flex justify-center pt-20 mt-12 border-t border-slate-100">
              <button 
                onClick={() => setShowGuide(!showGuide)}
                className="flex items-center gap-3 px-6 py-3 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border border-slate-200 cursor-pointer active:scale-95 shadow-sm"
              >
                <Info size={18} />
                {showGuide ? "Ẩn cách dùng & Tính năng chính" : "Xem cách dùng & Tính năng chính"}
                <ChevronDown size={18} className={`transition-transform duration-300 ${showGuide ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {showGuide && (
              <div className="pt-12 grid md:grid-cols-2 gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-8">
                  <SectionTitle icon={Info}>QUY TRÌNH PHÂN TÍCH</SectionTitle>
                  <div className="space-y-6">
                    {[
                      "Nhập link Video hoặc link Kênh YouTube để hệ thống tự động quét dữ liệu.",
                      "Hệ thống bóc tách siêu dữ liệu (Tags, Tiêu đề, Mô tả) và thông số tương tác.",
                      "AI phân tích chuyên sâu Nội dung, Phong cách và các yếu tố tối ưu SEO.",
                      "Đánh giá ưu/nhược điểm, nhận định nguồn gốc và đưa ra hướng cải thiện.",
                      "Xuất báo cáo văn bản (.TXT) và lưu lịch sử phân tích vào thư viện dự án."
                    ].map((step, i) => (
                      <div key={i} className="flex gap-4 group">
                        <div className="shrink-0 w-8 h-8 bg-sky-50 text-sky-600 border border-sky-100 rounded-xl flex items-center justify-center font-black text-xs group-hover:bg-sky-600 group-hover:text-white transition-all shadow-sm">
                          {i + 1}
                        </div>
                        <p className="text-slate-600 font-bold text-base leading-relaxed pt-1">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-8">
                  <SectionTitle icon={Wrench}>CÔNG CỤ NÒNG CỐT</SectionTitle>
                  
                  <div className="space-y-5 relative">
                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-sky-500/5 blur-3xl rounded-full pointer-events-none" />
                    <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mb-2 border-b border-slate-100 pb-4">
                      Giải pháp phân tích đột phá cho nhà sáng tạo
                    </p>
                    
                    <div className="p-5 bg-sky-50/50 rounded-2xl border border-sky-100/50 transition-all">
                      <h5 className="text-sm font-black text-sky-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <Video size={18} /> Kiểm tra Video
                      </h5>
                      <p className="text-xs text-slate-600 font-medium leading-relaxed">
                        Phân tích sâu SEO, thẩm định nguồn gốc nội dung và tối ưu hóa các yếu tố quan trọng để tăng tỷ lệ giữ chân người xem thực tế.
                      </p>
                    </div>

                    <div className="p-5 bg-amber-50/50 rounded-2xl border border-amber-100/50 transition-all">
                      <h5 className="text-sm font-black text-amber-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <Search size={18} /> Phân tích Link Kênh
                      </h5>
                      <p className="text-xs text-slate-600 font-medium leading-relaxed">
                        Nghiên cứu ngách nội dung, đánh giá độ cạnh tranh và nhận diện thương hiệu để xây dựng bộ khung phát triển kênh.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>



      {/* Library Sidebar / Overlay */}
      <AnimatePresence>
        {isLibraryOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsLibraryOpen(false)}
            className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex justify-end"
          >
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-5xl bg-slate-50 h-full shadow-2xl flex flex-col"
            >
              <div className="h-20 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="bg-red-50 p-2 rounded-lg text-red-600 border border-red-100">
                    <Library size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-900">Thư viện dự án của bạn</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Đã lưu trữ {library.length} phân tích</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsLibraryOpen(false)}
                  className="p-3 bg-slate-100 text-slate-500 font-black rounded-xl hover:bg-red-50 hover:text-red-500 transition-all border border-slate-200 cursor-pointer active:scale-90"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {/* Search & Stats */}
                <div className="flex flex-col md:flex-row gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <div className="flex-1 relative">
                    <div className="absolute inset-y-0 left-4 flex items-center text-slate-400">
                      <Search size={18} />
                    </div>
                    <input 
                      type="text" 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Tìm theo Tiêu đề, Kênh, Tags..."
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-red-500 text-sm font-bold shadow-inner"
                    />
                  </div>
                  <div className="flex gap-2">
                    <select 
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="px-4 py-3 bg-slate-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-red-500 text-sm font-black text-slate-700 min-w-[180px] cursor-pointer shadow-inner"
                    >
                      <option value="all">Tất cả Category</option>
                      {Object.entries(CATEGORY_MAP).map(([id, info]) => (
                        <option key={id} value={id}>{info.en} / {info.vi}</option>
                      ))}
                    </select>
                    <button onClick={clearLibrary} className="p-3 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-100 border border-amber-100 transition-all cursor-pointer active:scale-90" title="Xóa toàn bộ"><Trash2 size={20} /></button>
                  </div>
                </div>

                {filteredLibrary.length > 0 ? (
                  <div className="grid gap-8">
                    {filteredLibrary.map((item) => (
                      <div key={item.id + item.checkedAt}>
                        <Card className={`border-2 border-transparent transition-all group shadow-md hover:shadow-xl bg-white p-1 ${item.type === 'video' ? 'hover:border-red-100' : 'hover:border-amber-100'}`}>
                        <div className="p-6 md:p-8">
                          {/* Top Row */}
                          <div className="flex flex-col md:flex-row gap-8 mb-8">
                            <div className="md:w-72 shrink-0 space-y-3">
                              <div className="relative group/thumb overflow-hidden rounded-2xl shadow-lg border border-slate-200 aspect-video">
                                <img 
                                  src={(item.thumbnails.high?.url || item.thumbnails.default?.url) || undefined} 
                                  className={`w-full h-full object-cover transition-transform group-hover/thumb:scale-105 ${item.type === 'channel' ? 'rounded-full scale-90' : ''}`} 
                                  referrerPolicy="no-referrer" 
                                />
                                <div className={`absolute top-3 left-3 px-3 py-1 text-[10px] font-black rounded-lg shadow-lg z-10 border ${item.type === 'video' ? 'bg-red-600 text-white border-red-500' : 'bg-amber-500 text-white border-amber-400'}`}>
                                  {item.type === 'video' ? 'VIDEO' : 'KÊNH'}
                                </div>
                                {item.type === 'video' && item.categoryId && (
                                  <div className="absolute top-3 right-3 px-3 py-1 bg-white/90 backdrop-blur-sm text-slate-700 border border-slate-200 text-[10px] font-black rounded-lg shadow-lg z-10">MÃ: {item.categoryId}</div>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <button 
                                  onClick={() => window.open(item.type === 'video' ? `https://youtube.com/watch?v=${item.id}` : `https://youtube.com/channel/${item.id}`, '_blank')}
                                  className="flex-1 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[9px] font-black uppercase tracking-wider rounded-lg border border-slate-200 flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
                                >
                                  <Eye size={12} /> Xem YouTube
                                </button>
                                {item.type === 'video' && (
                                  <button 
                                    onClick={() => {
                                      const url = item.thumbnails.maxres?.url || item.thumbnails.high?.url;
                                      if (url) downloadImage(url, `video-thumb-${item.id}.jpg`);
                                    }}
                                    className="flex-1 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-[9px] font-black uppercase tracking-wider rounded-lg border border-red-100 flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
                                  >
                                    <Download size={12} /> Thumbnail
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="flex-1">
                              <h4 className="text-xl font-black text-slate-900 leading-tight mb-2 line-clamp-2">
                                <a 
                                  href={item.type === 'video' ? `https://youtube.com/watch?v=${item.id}` : `https://youtube.com/channel/${item.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline"
                                >
                                  {item.title}
                                </a>
                              </h4>
                              {item.type === 'video' ? (
                                <p className="text-sm font-black text-red-600 bg-red-50 inline-block px-3 py-1 rounded-lg mb-4">{item.categoryName} / {item.categoryVi}</p>
                              ) : (
                                <p className="text-sm font-black text-amber-600 bg-amber-50 inline-block px-3 py-1 rounded-lg mb-4">Phân tích Kênh YouTube</p>
                              )}
                              
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-1">
                                <div className="space-y-1">
                                  <p className="text-[10px] font-black text-slate-400 uppercase">{item.type === 'video' ? 'Kênh' : 'ID Kênh'}</p>
                                  <a 
                                    href={item.type === 'video' ? (item.channelCustomUrl ? `https://www.youtube.com/${item.channelCustomUrl}` : `https://www.youtube.com/channel/${item.channelId}`) : `https://www.youtube.com/channel/${item.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs font-bold text-blue-600 hover:underline break-words block"
                                  >
                                    {item.type === 'video' ? item.channelTitle : item.id}
                                  </a>
                                </div>
                                <div className="space-y-1">
                                  <p className="text-[10px] font-black text-slate-400 uppercase">{item.type === 'video' ? 'Ngày đăng' : 'Ngày tạo'}</p>
                                  <p className="text-xs font-bold text-slate-800">
                                    {formatDate(
                                      item.publishedAt, 
                                      getTimeZoneByCountry(item.type === 'video' ? item.channelCountry : item.brandingSettings?.channel?.country)
                                    )}
                                  </p>
                                </div>
                                <div className="space-y-1">
                                  <p className="text-[10px] font-black text-slate-400 uppercase">{item.type === 'video' ? 'Lượt xem' : 'Người đăng ký'}</p>
                                  <p className="text-xs font-bold text-slate-800">{formatNumber(item.type === 'video' ? item.statistics.viewCount : item.statistics.subscriberCount)}</p>
                                </div>
                                <div className="space-y-1">
                                  <p className="text-[10px] font-black text-slate-400 uppercase">{item.type === 'video' ? 'Thời lượng' : 'Tổng lượt xem'}</p>
                                  <p className="text-xs font-bold text-slate-800">{item.type === 'video' ? formatDuration(item.duration) : formatNumber(item.statistics.viewCount)}</p>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Details Row */}
                          <div className="grid md:grid-cols-2 gap-8 border-t border-slate-100 pt-8 mt-4">
                            <div className="space-y-6">
                              <div>
                                <h5 className={`text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2 ${item.type === 'video' ? 'text-red-600' : 'text-amber-600'}`}>
                                  <Target size={12} /> {item.type === 'video' ? 'Phân tích Niche' : 'Phân tích Link Kênh'}
                                </h5>
                                <div className={`p-5 rounded-2xl border space-y-2 ${item.type === 'video' ? 'bg-red-50/50 border-red-100' : 'bg-amber-50/50 border-amber-100'}`}>
                                  {item.type === 'video' ? (
                                    <>
                                      <p className="text-sm"><span className="font-black text-slate-800">Nội dung:</span> {item.aiAnalysis?.contentOverview?.focus}</p>
                                      <p className="text-sm"><span className="font-black text-slate-800">Dạng:</span> {item.aiAnalysis?.contentOverview?.type}</p>
                                      <p className="text-xs text-slate-600 italic font-medium leading-relaxed">"{item.aiAnalysis?.conclusionSummary?.finalVerdict}"</p>
                                    </>
                                  ) : (
                                    <>
                                      <p className="text-sm"><span className="font-black text-slate-800">Chủ đề:</span> {item.aiAnalysis?.overview?.niche}</p>
                                      <p className="text-sm"><span className="font-black text-slate-800">Kiếm tiền:</span> {item.aiAnalysis?.monetization?.probability} ({item.aiAnalysis?.monetization?.estimatedRPM})</p>
                                      <div className="pt-2 grid grid-cols-1 gap-2">
                                        <div className="flex gap-2">
                                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                                          <p className="text-[11px] text-slate-600 font-medium leading-relaxed"><span className="font-black text-slate-800">Tối ưu dần:</span> {item.aiAnalysis?.improvement?.optimizeLater}</p>
                                        </div>
                                        <div className="flex gap-2">
                                          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                                          <p className="text-[11px] text-slate-600 font-medium leading-relaxed"><span className="font-black text-slate-800">Kỹ thuật:</span> {item.aiAnalysis?.titleFeedback?.analysis}</p>
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                              {item.type === 'video' && item.tags && item.tags.length > 0 && (
                                <div>
                                  <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <FileText size={12} /> Tags Đã dùng
                                  </h5>
                                  <div className="text-[11px] font-bold text-slate-500 whitespace-pre-wrap break-words leading-relaxed line-clamp-3">
                                    {item.tags.join(', ')}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="space-y-6">
                              <div>
                                <h5 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                                  <Zap size={12} /> {item.type === 'video' ? 'Đề xuất SEO' : 'Lý do & Nhận định'}
                                </h5>
                                <div className="p-5 bg-slate-50 text-slate-700 rounded-2xl space-y-3 shadow-md border border-slate-200">
                                  {item.type === 'video' ? (
                                    <>
                                      <div>
                                        <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Tiêu đề Gợi ý</p>
                                        <p className="text-sm font-black text-slate-900 leading-tight line-clamp-2">{item.seoSuggestions?.titles[0]}</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Hashtags</p>
                                        <p className="text-indigo-600 text-xs font-bold font-mono">{item.seoSuggestions?.hashtags.join(' ')}</p>
                                      </div>
                                    </>
                                  ) : (
                                    <div>
                                      <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Cơ sở đánh giá</p>
                                      <p className="text-xs font-bold text-slate-700 leading-relaxed line-clamp-4">{item.aiAnalysis?.monetization?.analysis}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-slate-100">
                                <div className="flex gap-2">
                                  <button 
                                    onClick={() => { 
                                      if (item.type === 'video') {
                                        setVideoData(item);
                                        setActiveTab('checker');
                                      } else {
                                        setChannelData(item);
                                        setActiveTab('monetization');
                                      }
                                      setIsLibraryOpen(false); 
                                      window.scrollTo({ top: 0, behavior: 'smooth' }); 
                                    }}
                                    className={`flex-1 py-3 border rounded-xl text-xs font-black shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 ${item.type === 'video' ? 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200' : 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200'}`}
                                  >
                                    <Eye size={14} /> Khôi phục dự án
                                  </button>
                                  {item.type === 'video' && (
                                    <button onClick={() => downloadTxt(item)} className="p-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 cursor-pointer active:scale-90" title="Tải TXT"><Download size={18} /></button>
                                  )}
                                  <button 
                                    onClick={() => setLibrary(prev => prev.filter(v => v.id !== item.id || v.checkedAt !== item.checkedAt))}
                                    className="p-3 bg-white text-indigo-500 rounded-xl hover:bg-indigo-50 border border-slate-200 shadow-sm cursor-pointer active:scale-90"
                                    title="Xóa dự án"
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                </div>
                                <div className="flex items-center justify-center gap-1.5 text-slate-400">
                                  <Clock size={12} />
                                  <span className="text-[10px] font-bold">Lưu lúc: {formatDate(item.checkedAt, 'Asia/Ho_Chi_Minh')}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        </Card>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-32 text-center bg-white rounded-3xl border-2 border-dashed border-slate-200">
                    <div className="w-20 h-20 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Library size={40} />
                    </div>
                    <h3 className="text-xl font-black text-slate-400">Thư viện đang trống</h3>
                    <p className="text-slate-400 mt-2 font-medium">Bạn chưa lưu dự án phân tích nào.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Embedded YouTube video player */}
      <AnimatePresence>
        {embeddedVideo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setEmbeddedVideo(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              className="w-full max-w-5xl bg-white rounded-[2rem] overflow-hidden shadow-2xl border border-white/20"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-100">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-red-500">Xem video trực tiếp</p>
                  <h3 className="text-base md:text-xl font-black text-slate-900 truncate">{embeddedVideo.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setEmbeddedVideo(null)}
                  className="w-11 h-11 rounded-2xl bg-slate-100 hover:bg-red-50 hover:text-red-600 flex items-center justify-center shrink-0 transition-all"
                  title="Đóng"
                >
                  <X size={22} />
                </button>
              </div>
              <div className="aspect-video bg-black">
                <iframe
                  className="w-full h-full"
                  src={`https://www.youtube.com/embed/${embeddedVideo.id}?autoplay=1&rel=0&modestbranding=1`}
                  title={embeddedVideo.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scroll to top button */}
      <AnimatePresence>
        {showScrollTop && (
            <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            onClick={scrollToTop}
            className="fixed bottom-8 right-8 p-4 bg-indigo-600 text-white rounded-full shadow-2xl hover:bg-indigo-700 transition-all cursor-pointer z-[60] group active:scale-90"
            title="Lên đầu trang"
          >
            <ChevronUp size={24} className="group-hover:-translate-y-1 transition-transform" />
          </motion.button>
        )}
      </AnimatePresence>
      

    </div>
  );
}
