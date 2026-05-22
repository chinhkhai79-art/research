import { readTrendingCache, normalizeRegion } from '../lib/trending-store.js';

const CATEGORY_NAMES = [
  'PHÁT TRIỂN BẢN THÂN','SỨC KHỎE & LÀM ĐẸP','CÔNG NGHỆ & AI','GIÁO DỤC & HỌC TẬP','ẨM THỰC & NẤU ĂN','DU LỊCH & KHÁM PHÁ','GIẢI TRÍ & HÀI HƯỚC','THỂ THAO & THỂ HÌNH','PETS & ĐỘNG VẬT','GIA ĐÌNH & ĐỜI SỐNG',
  'NGHỆ THUẬT & SÁNG TẠO','CÔNG NGHỆ Ô TÔ & XE MÁY','TÂM LÝ HỌC & MỐI QUAN HỆ','ESPORTS & GAMING','HUYỀN BÍ & TÂM LINH','MẸO VẶT CUỘC SỐNG','VĂN HÓA & LỊCH SỬ','THỜI TRANG & PHONG CÁCH','NÔNG NGHIỆP CÔNG NGHỆ CAO','REVIEW SẢN PHẨM & UNBOXING',
  'NHẠC & COVER','BẤT ĐỘNG SẢN & NHÀ CỬA','CÂU CHUYỆN KHỞI NGHIỆP','CHUYỆN LẠ BỐN PHƯƠNG','ASMR & MUKBANG','XÂY DỰNG & KIẾN TRÚC','MARKETING & TRUYỀN THÔNG','TRỊ LIỆU ÂM THANH','ĐAN LEN & THÊU THÙA','TÀI CHÍNH & ĐẦU TƯ'
];

const FALLBACK_VN = [
  ['vượt qua sự trì hoãn','cách rèn luyện thói quen tốt','xây dựng sự tự tin','kỷ luật bản thân','vlog năng suất'],
  ['giảm cân tự nhiên','yoga tại nhà','skincare cho người mới','chăm sóc tóc hói','bài tập mông tại nhà'],
  ['review điện thoại giá rẻ','hướng dẫn dùng ChatGPT','cách tạo ảnh bằng Midjourney','mẹo dùng iPhone','build PC giá rẻ'],
  ['học tiếng Anh giao tiếp','phương pháp tự học hiệu quả','từ vựng IELTS theo chủ đề','mẹo ôn thi đại học','học lập trình python'],
  ['nấu ăn sinh viên','chế biến món chay','công thức làm bánh không lò','decor hộp cơm bento','các món ăn sáng nhanh'],
  ['du lịch phượt xe máy','review homestay Đà Lạt','cẩm nang du lịch Phú Quốc','kinh nghiệm xin visa du lịch','du lịch nước ngoài giá rẻ']
];
const FALLBACK_EN = [
  ['self improvement habits','productivity tips','discipline motivation','confidence building','stop procrastination'],
  ['home workout','skincare routine','weight loss tips','yoga at home','healthy meal prep'],
  ['ai tools','chatgpt tutorial','iphone tips','budget phone review','automation tools'],
  ['study tips','learn english','coding for beginners','ielts vocabulary','exam preparation'],
  ['easy recipes','meal prep','home cooking','healthy snacks','budget meals'],
  ['travel vlog','budget travel','hidden places','solo travel tips','camping guide']
];
function buildFallbackCategories(region) {
  const useVn = region === 'VN';
  const pool = useVn ? FALLBACK_VN : FALLBACK_EN;
  return CATEGORY_NAMES.map((category, idx) => ({
    category,
    items: pool[idx % pool.length].map((x, i) => idx < pool.length ? x : `${x} ${i + 1}`)
  }));
}


function setCors(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const region = normalizeRegion(req.query?.region || 'VN');
    const doc = await readTrendingCache(region);
    if (!doc || !Array.isArray(doc.categories) || doc.categories.length === 0) {
      return res.status(200).json({
        ok: true,
        source: 'fallback-local-no-cache-yet',
        message: 'Chưa có cache Firebase cho khu vực này. Admin cần chạy /api/admin-trending-cron để cập nhật dữ liệu thật YouTube API V3.',
        region,
        updatedAt: null,
        categories: buildFallbackCategories(region)
      });
    }
    return res.status(200).json({
      ok: true,
      source: doc.source || 'admin-youtube-cache',
      region,
      updatedAt: doc.updatedAt || null,
      nextScanAt: doc.nextScanAt || null,
      categories: doc.categories
    });
  } catch (error) {
    console.error('[trending-cache]', error);
    return res.status(500).json({ ok: false, error: error?.message || 'Server error' });
  }
}
