import { readTrendingCache, normalizeRegion } from '../lib/trending-store.js';

const CATEGORY_NAMES = [
  'PHÁT TRIỂN BẢN THÂN','SỨC KHỎE & LÀM ĐẸP','CÔNG NGHỆ & AI','GIÁO DỤC & HỌC TẬP','ẨM THỰC & NẤU ĂN','DU LỊCH & KHÁM PHÁ','GIẢI TRÍ & HÀI HƯỚC','THỂ THAO & THỂ HÌNH','PETS & ĐỘNG VẬT','GIA ĐÌNH & ĐỜI SỐNG',
  'NGHỆ THUẬT & SÁNG TẠO','CÔNG NGHỆ Ô TÔ & XE MÁY','TÂM LÝ HỌC & MỐI QUAN HỆ','ESPORTS & GAMING','HUYỀN BÍ & TÂM LINH','MẸO VẶT CUỘC SỐNG','VĂN HÓA & LỊCH SỬ','THỜI TRANG & PHONG CÁCH','NÔNG NGHIỆP CÔNG NGHỆ CAO','REVIEW SẢN PHẨM & UNBOXING',
  'NHẠC & COVER','BẤT ĐỘNG SẢN & NHÀ CỬA','CÂU CHUYỆN KHỞI NGHIỆP','CHUYỆN LẠ BỐN PHƯƠNG','ASMR & MUKBANG','XÂY DỰNG & KIẾN TRÚC','MARKETING & TRUYỀN THÔNG','TRỊ LIỆU ÂM THANH','ĐAN LEN & THÊU THÙA','TÀI CHÍNH & ĐẦU TƯ'
];

const FALLBACK_BY_REGION = {
  VN: [
    ['vượt qua sự trì hoãn','cách rèn luyện thói quen tốt','xây dựng sự tự tin','kỷ luật bản thân','vlog năng suất'],
    ['giảm cân tự nhiên','yoga tại nhà','skincare cho người mới','chăm sóc tóc hói','bài tập mông tại nhà'],
    ['review điện thoại giá rẻ','hướng dẫn dùng ChatGPT','cách tạo ảnh bằng Midjourney','mẹo dùng iPhone','build PC giá rẻ'],
    ['học tiếng Anh giao tiếp','phương pháp tự học hiệu quả','từ vựng IELTS theo chủ đề','mẹo ôn thi đại học','học lập trình python'],
    ['nấu ăn sinh viên','chế biến món chay','công thức làm bánh không lò','decor hộp cơm bento','các món ăn sáng nhanh'],
    ['du lịch phượt xe máy','review homestay Đà Lạt','cẩm nang du lịch Phú Quốc','kinh nghiệm xin visa du lịch','du lịch nước ngoài giá rẻ']
  ],
  JP: [
    ['自己啓発 習慣','生産性 向上','先延ばし 克服','朝活 ルーティン','メンタル 強化'],
    ['自宅 筋トレ','スキンケア 初心者','ダイエット 食事','ヨガ 自宅','薄毛 対策'],
    ['AI ツール','ChatGPT 使い方','iPhone 便利技','格安スマホ レビュー','自動化 ツール'],
    ['勉強法','英語 学習','プログラミング 初心者','資格 勉強','受験 対策'],
    ['簡単 レシピ','作り置き','一人暮らし 料理','節約 ごはん','弁当 レシピ'],
    ['日本 旅行 vlog','東京 穴場','格安 旅行','一人旅 コツ','キャンプ 初心者']
  ],
  KR: [
    ['자기계발 습관','생산성 높이는 법','미루기 극복','아침 루틴','멘탈 관리'],
    ['홈트레이닝','스킨케어 루틴','다이어트 식단','요가 홈트','탈모 관리'],
    ['AI 도구','ChatGPT 사용법','아이폰 꿀팁','가성비 스마트폰','업무 자동화'],
    ['공부법','영어 공부','코딩 입문','자격증 공부','시험 준비'],
    ['간단 요리','밀프렙','집밥 레시피','건강 간식','절약 요리'],
    ['한국 여행 브이로그','서울 숨은 명소','저가 여행','혼자 여행 팁','캠핑 가이드']
  ],
  TH: [
    ['พัฒนาตัวเอง','เพิ่มประสิทธิภาพ','เลิกผัดวันประกันพรุ่ง','กิจวัตรตอนเช้า','สร้างวินัย'],
    ['ออกกำลังกายที่บ้าน','สกินแคร์มือใหม่','ลดน้ำหนัก','โยคะที่บ้าน','ดูแลผม'],
    ['เครื่องมือ AI','วิธีใช้ ChatGPT','เทคนิค iPhone','รีวิวมือถือราคาประหยัด','ระบบอัตโนมัติ'],
    ['เทคนิคการเรียน','เรียนภาษาอังกฤษ','เริ่มเขียนโค้ด','เตรียมสอบ','อ่านหนังสือ'],
    ['เมนูง่ายๆ','ทำอาหารที่บ้าน','อาหารคลีน','เมนูประหยัด','ขนมง่ายๆ'],
    ['เที่ยวไทย','ที่เที่ยวลับ','เที่ยวประหยัด','เดินทางคนเดียว','แคมป์ปิ้ง']
  ],
  ID: [
    ['kebiasaan produktif','cara mengatasi malas','pengembangan diri','rutinitas pagi','motivasi disiplin'],
    ['olahraga di rumah','skincare pemula','tips diet','yoga di rumah','perawatan rambut'],
    ['tools AI','cara pakai ChatGPT','tips iPhone','review hp murah','otomatisasi kerja'],
    ['tips belajar','belajar bahasa inggris','coding pemula','persiapan ujian','cara fokus belajar'],
    ['resep mudah','meal prep','masakan rumahan','cemilan sehat','masak hemat'],
    ['travel vlog indonesia','tempat tersembunyi','travel murah','solo traveling','camping guide']
  ],
  US: null, GB: null, AU: null, CA: null, IN: null, SG: null, PH: null, MY: null, DE: null, FR: null, RU: null, BR: null, MX: null, ES: null, IT: null
};
const FALLBACK_EN = [
  ['self improvement habits','productivity tips','discipline motivation','confidence building','stop procrastination'],
  ['home workout','skincare routine','weight loss tips','yoga at home','healthy meal prep'],
  ['ai tools','chatgpt tutorial','iphone tips','budget phone review','automation tools'],
  ['study tips','learn english','coding for beginners','ielts vocabulary','exam preparation'],
  ['easy recipes','meal prep','home cooking','healthy snacks','budget meals'],
  ['travel vlog','budget travel','hidden places','solo travel tips','camping guide']
];
FALLBACK_BY_REGION.US = FALLBACK_EN;
FALLBACK_BY_REGION.GB = FALLBACK_EN;
FALLBACK_BY_REGION.AU = FALLBACK_EN;
FALLBACK_BY_REGION.CA = FALLBACK_EN;
FALLBACK_BY_REGION.IN = FALLBACK_EN;
FALLBACK_BY_REGION.SG = FALLBACK_EN;
FALLBACK_BY_REGION.PH = FALLBACK_EN;
FALLBACK_BY_REGION.MY = FALLBACK_EN;
FALLBACK_BY_REGION.DE = [
  ['selbstverbesserung gewohnheiten','produktivität tipps','disziplin motivation','morgenroutine','aufschieben überwinden'],
  ['home workout','hautpflege routine','abnehmen tipps','yoga zuhause','gesunde ernährung'],
  ['ki tools','chatgpt anleitung','iphone tipps','handy test günstig','automatisierung tools'],
  ['lerntipps','englisch lernen','programmieren anfänger','prüfungsvorbereitung','studium tipps'],
  ['einfache rezepte','meal prep','kochen zuhause','gesunde snacks','günstig kochen'],
  ['reise vlog deutschland','geheimtipps reisen','budget reisen','allein reisen','camping tipps']
];
FALLBACK_BY_REGION.FR = [
  ['développement personnel','astuces productivité','motivation discipline','routine matinale','arrêter procrastination'],
  ['sport à la maison','routine skincare','perte de poids','yoga maison','repas sain'],
  ['outils IA','tutoriel ChatGPT','astuces iPhone','smartphone pas cher','automatisation'],
  ['méthodes de révision','apprendre anglais','coder débutant','préparation examen','conseils étude'],
  ['recettes faciles','meal prep','cuisine maison','snacks sains','repas économiques'],
  ['vlog voyage france','lieux cachés','voyage pas cher','voyage solo','guide camping']
];
FALLBACK_BY_REGION.BR = [
  ['hábitos produtivos','desenvolvimento pessoal','como vencer procrastinação','rotina matinal','motivação disciplina'],
  ['treino em casa','rotina skincare','dicas emagrecimento','yoga em casa','alimentação saudável'],
  ['ferramentas IA','como usar ChatGPT','dicas iPhone','celular barato review','automação trabalho'],
  ['dicas de estudo','aprender inglês','programação iniciantes','preparação prova','foco nos estudos'],
  ['receitas fáceis','meal prep','comida caseira','lanches saudáveis','cozinhar barato'],
  ['viagem brasil vlog','lugares escondidos','viagem barata','viajar sozinho','guia camping']
];
function buildFallbackCategories(region) {
  const pool = FALLBACK_BY_REGION[region] || FALLBACK_EN;
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
