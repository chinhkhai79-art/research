import { writeTrendingCache, readCronState, writeCronState, normalizeRegion } from '../lib/trending-store.js';

const REGIONS = ['VN', 'US', 'AU', 'GB', 'CA', 'IN', 'SG', 'JP', 'KR', 'TH', 'ID', 'PH', 'MY', 'DE', 'FR', 'BR'];
const CATEGORY_DEFS = [
  ['PHÁT TRIỂN BẢN THÂN', { VN: ['thói quen tốt','vượt qua trì hoãn','kỷ luật bản thân'], US: ['self improvement habits','productivity tips','discipline motivation'], AU: ['self improvement habits','productivity tips'] }],
  ['SỨC KHỎE & LÀM ĐẸP', { VN: ['giảm cân tại nhà','skincare cho người mới','yoga tại nhà'], US: ['home workout','skincare routine','weight loss tips'], AU: ['home workout','skincare routine'] }],
  ['CÔNG NGHỆ & AI', { VN: ['công cụ AI','hướng dẫn ChatGPT','tạo video bằng AI'], US: ['ai tools','chatgpt tutorial','ai video tools'], AU: ['ai tools','chatgpt tutorial'] }],
  ['GIÁO DỤC & HỌC TẬP', { VN: ['học tiếng anh','mẹo học tập','tự học lập trình'], US: ['study tips','learn english','coding for beginners'], AU: ['study tips','learn english'] }],
  ['ẨM THỰC & NẤU ĂN', { VN: ['món ngon dễ làm','nấu ăn gia đình','công thức món ăn'], US: ['easy recipes','meal prep','home cooking'], AU: ['easy recipes','meal prep'] }],
  ['DU LỊCH & KHÁM PHÁ', { VN: ['du lịch việt nam','review homestay','phượt xe máy'], US: ['travel vlog','budget travel','hidden places'], AU: ['australia travel vlog','budget travel'] }],
  ['GIẢI TRÍ & HÀI HƯỚC', { VN: ['phim hài ngắn','review phim','tình huống hài'], US: ['funny shorts','movie recap','comedy skit'], AU: ['funny shorts','comedy skit'] }],
  ['THỂ THAO & THỂ HÌNH', { VN: ['bài tập tăng cơ','bóng đá việt nam','gym tại nhà'], US: ['fitness tips','football highlights','home gym'], AU: ['fitness tips','football highlights'] }],
  ['PETS & ĐỘNG VẬT', { VN: ['chó mèo dễ thương','huấn luyện chó','thú cưng'], US: ['cute pets','dog training','cat care'], AU: ['cute pets','dog training'] }],
  ['GIA ĐÌNH & ĐỜI SỐNG', { VN: ['mẹo dọn nhà','nuôi dạy con','trồng rau ban công'], US: ['family life tips','home organization','parenting tips'], AU: ['home organization','parenting tips'] }],
  ['NGHỆ THUẬT & SÁNG TẠO', { VN: ['vẽ tranh phong cảnh','thiết kế canva','edit video capcut'], US: ['digital art tutorial','canva design','video editing tips'], AU: ['digital art tutorial','video editing tips'] }],
  ['CÔNG NGHỆ Ô TÔ & XE MÁY', { VN: ['review xe máy','đánh giá ô tô','phụ kiện ô tô'], US: ['car review','ev cars','motorcycle review'], AU: ['car review','ev cars'] }],
  ['TÂM LÝ HỌC & MỐI QUAN HỆ', { VN: ['tâm lý học','chữa lành tổn thương','mối quan hệ'], US: ['psychology facts','relationship advice','healing trauma'], AU: ['psychology facts','relationship advice'] }],
  ['ESPORTS & GAMING', { VN: ['liên quân mobile','free fire highlight','game mobile hay'], US: ['gaming highlights','mobile games','roblox gameplay'], AU: ['gaming highlights','mobile games'] }],
  ['HUYỀN BÍ & TÂM LINH', { VN: ['bí ẩn tâm linh','tarot tình yêu','giải mã giấc mơ'], US: ['mystery stories','tarot reading','paranormal facts'], AU: ['mystery stories','tarot reading'] }],
  ['MẸO VẶT CUỘC SỐNG', { VN: ['mẹo vặt nhà bếp','mẹo dọn nhà','thủ thuật cuộc sống'], US: ['life hacks','cleaning hacks','kitchen hacks'], AU: ['life hacks','cleaning hacks'] }],
  ['VĂN HÓA & LỊCH SỬ', { VN: ['lịch sử việt nam','văn hóa việt nam','sự kiện lịch sử'], US: ['history documentary','ancient history','culture facts'], AU: ['history documentary','culture facts'] }],
  ['THỜI TRANG & PHONG CÁCH', { VN: ['phối đồ nam','thời trang nữ','outfit đi học'], US: ['fashion trends','outfit ideas','style tips'], AU: ['fashion trends','outfit ideas'] }],
  ['NÔNG NGHIỆP CÔNG NGHỆ CAO', { VN: ['trồng rau thủy canh','chăm sóc cây cảnh','nông nghiệp hữu cơ'], US: ['hydroponic farming','gardening tips','organic farming'], AU: ['gardening tips','hydroponic farming'] }],
  ['REVIEW SẢN PHẨM & UNBOXING', { VN: ['unboxing đồ công nghệ','review sản phẩm','đồ decor phòng'], US: ['product review','unboxing gadgets','amazon finds'], AU: ['product review','unboxing gadgets'] }],
  ['NHẠC & COVER', { VN: ['nhạc lofi chill','cover nhạc trẻ','beat rap free'], US: ['lofi music','acoustic cover','music remix'], AU: ['lofi music','acoustic cover'] }],
  ['BẤT ĐỘNG SẢN & NHÀ CỬA', { VN: ['mẫu nhà đẹp','nội thất chung cư','kinh nghiệm mua nhà'], US: ['real estate tips','home design','interior design'], AU: ['real estate tips','home design'] }],
  ['CÂU CHUYỆN KHỞI NGHIỆP', { VN: ['khởi nghiệp ít vốn','kinh nghiệm kinh doanh','marketing 0 đồng'], US: ['startup ideas','small business tips','entrepreneurship'], AU: ['small business tips','startup ideas'] }],
  ['CHUYỆN LẠ BỐN PHƯƠNG', { VN: ['chuyện lạ thế giới','sinh vật kỳ lạ','kỷ lục guinness'], US: ['weird facts','amazing facts','strange world'], AU: ['weird facts','amazing facts'] }],
  ['ASMR & MUKBANG', { VN: ['asmr ăn uống','mukbang hải sản','asmr nấu ăn'], US: ['asmr eating','mukbang seafood','relaxing asmr'], AU: ['asmr eating','relaxing asmr'] }],
  ['XÂY DỰNG & KIẾN TRÚC', { VN: ['xây nhà tiết kiệm','thi công nhà','thiết kế nhà đẹp'], US: ['construction process','architecture design','home renovation'], AU: ['home renovation','architecture design'] }],
  ['MARKETING & TRUYỀN THÔNG', { VN: ['affiliate marketing','seo website','chạy quảng cáo facebook'], US: ['affiliate marketing','seo tips','social media marketing'], AU: ['affiliate marketing','seo tips'] }],
  ['TRỊ LIỆU ÂM THANH', { VN: ['tiếng mưa dễ ngủ','nhạc thiền','âm thanh rừng'], US: ['rain sounds sleep','meditation music','white noise'], AU: ['rain sounds sleep','meditation music'] }],
  ['ĐAN LEN & THÊU THÙA', { VN: ['móc len cơ bản','thêu hoa nổi','đan áo len'], US: ['crochet tutorial','knitting pattern','embroidery design'], AU: ['crochet tutorial','knitting pattern'] }],
  ['TÀI CHÍNH & ĐẦU TƯ', { VN: ['đầu tư chứng khoán','quản lý tài chính cá nhân','kiếm tiền online'], US: ['personal finance','stock investing','make money online'], AU: ['personal finance','stock investing'] }]
];

function setCors(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-secret,x-admin-email');
  if (req.method === 'OPTIONS') { res.status(200).end(); return true; }
  return false;
}

function parseKeyList(value) {
  if (Array.isArray(value)) return value.map(x => String(x || '').trim()).filter(Boolean);
  return String(value || '').split(/[\n,;]+/).map(x => x.trim()).filter(Boolean);
}

function getKeys(req) {
  const envKeys = parseKeyList(process.env.YOUTUBE_API_KEYS || process.env.YOUTUBE_API_KEY || '');
  const bodyKeys = parseKeyList(req.body?.apiKeys || req.body?.youtubeApiKeys || req.body?.keys || '');
  const headerKeys = parseKeyList(req.headers['x-youtube-api-keys'] || '');
  return [...new Set([...envKeys, ...bodyKeys, ...headerKeys])];
}
function publishedAfter30d() { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString(); }
function compactKeyword(value) {
  return String(value || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[#|•·,_;:!?()[\]{}"“”'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().toLowerCase().split(' ').filter(Boolean).slice(0, 5).join(' ');
}
const REGIONAL_SEED_BANK = {
  JP: {
    'PHÁT TRIỂN BẢN THÂN': ['自己啓発 習慣','生産性 向上','先延ばし 克服'],
    'SỨC KHỎE & LÀM ĐẸP': ['自宅 筋トレ','スキンケア 初心者','ダイエット 食事'],
    'CÔNG NGHỆ & AI': ['AI ツール','ChatGPT 使い方','iPhone 便利技'],
    'GIÁO DỤC & HỌC TẬP': ['勉強法','英語 学習','プログラミング 初心者'],
    'ẨM THỰC & NẤU ĂN': ['簡単 レシピ','作り置き','一人暮らし 料理'],
    'DU LỊCH & KHÁM PHÁ': ['日本 旅行 vlog','東京 穴場','格安 旅行']
  },
  KR: {
    'PHÁT TRIỂN BẢN THÂN': ['자기계발 습관','생산성 높이는 법','미루기 극복'],
    'SỨC KHỎE & LÀM ĐẸP': ['홈트레이닝','스킨케어 루틴','다이어트 식단'],
    'CÔNG NGHỆ & AI': ['AI 도구','ChatGPT 사용법','아이폰 꿀팁'],
    'GIÁO DỤC & HỌC TẬP': ['공부법','영어 공부','코딩 입문'],
    'ẨM THỰC & NẤU ĂN': ['간단 요리','밀프렙','집밥 레시피'],
    'DU LỊCH & KHÁM PHÁ': ['한국 여행 브이로그','서울 숨은 명소','저가 여행']
  },
  TH: {
    'PHÁT TRIỂN BẢN THÂN': ['พัฒนาตัวเอง','เพิ่มประสิทธิภาพ','เลิกผัดวันประกันพรุ่ง'],
    'SỨC KHỎE & LÀM ĐẸP': ['ออกกำลังกายที่บ้าน','สกินแคร์มือใหม่','ลดน้ำหนัก'],
    'CÔNG NGHỆ & AI': ['เครื่องมือ AI','วิธีใช้ ChatGPT','เทคนิค iPhone']
  },
  ID: {
    'PHÁT TRIỂN BẢN THÂN': ['kebiasaan produktif','cara mengatasi malas','pengembangan diri'],
    'SỨC KHỎE & LÀM ĐẸP': ['olahraga di rumah','skincare pemula','tips diet'],
    'CÔNG NGHỆ & AI': ['tools AI','cara pakai ChatGPT','tips iPhone']
  }
};
function pickSeeds(def, region, categoryName) {
  const regional = REGIONAL_SEED_BANK[region]?.[categoryName];
  return def[region] || regional || def.US || def.VN || [];
}
function scoreVideo(video, channel) {
  const views = Number(video?.statistics?.viewCount || 0);
  const publishedAt = new Date(video?.snippet?.publishedAt || Date.now()).getTime();
  const ageHours = Math.max(1, (Date.now() - publishedAt) / 36e5);
  const vph = views / ageHours;
  const subs = Number(channel?.statistics?.subscriberCount || 0);
  const viewSubRatio = subs > 0 ? views / subs : views;
  let score = vph * 3 + viewSubRatio * 12 + views / 1000;
  if (subs > 0 && subs <= 50000) score *= 2.2;
  if (subs > 0 && subs <= 30000) score *= 1.35;
  return { views, vph, subs, viewSubRatio, score };
}
async function youtubeFetch(path, keys, used) {
  let lastError = null;
  for (const key of keys) {
    if (used.exhausted.has(key)) continue;
    const url = `https://www.googleapis.com/youtube/v3/${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`;
    const r = await fetch(url);
    const data = await r.json().catch(() => ({}));
    if (r.ok) return data;
    const msg = JSON.stringify(data).toLowerCase();
    lastError = data?.error?.message || `YouTube API lỗi ${r.status}`;
    if (r.status === 403 || msg.includes('quota') || msg.includes('daily')) { used.exhausted.add(key); continue; }
    throw new Error(lastError);
  }
  throw new Error(lastError || 'Tất cả YouTube API key đã hết quota');
}
async function scanCategory(categoryName, seedsDef, region, keys, used) {
  const candidates = [];
  const seeds = pickSeeds(seedsDef, region, categoryName).slice(0, 3);
  for (const seed of seeds) {
    const regionParam = region ? `&regionCode=${encodeURIComponent(region)}` : '';
    const search = await youtubeFetch(`search?part=snippet&type=video&order=viewCount&maxResults=15${regionParam}&publishedAfter=${encodeURIComponent(publishedAfter30d())}&q=${encodeURIComponent(seed)}`, keys, used);
    const videos = (search.items || []).filter(x => x.id?.videoId);
    if (!videos.length) continue;
    const videoIds = videos.map(x => x.id.videoId).join(',');
    const detail = await youtubeFetch(`videos?part=snippet,statistics,contentDetails&id=${encodeURIComponent(videoIds)}`, keys, used);
    const channelIds = [...new Set((detail.items || []).map(v => v.snippet?.channelId).filter(Boolean))].join(',');
    if (!channelIds) continue;
    const channelData = await youtubeFetch(`channels?part=snippet,statistics&id=${encodeURIComponent(channelIds)}`, keys, used);
    const channelMap = new Map((channelData.items || []).map(c => [c.id, c]));
    for (const v of detail.items || []) {
      const ch = channelMap.get(v.snippet?.channelId);
      const metric = scoreVideo(v, ch);
      if (metric.subs > 1000000) continue;
      const tagKeyword = Array.isArray(v.snippet?.tags) ? v.snippet.tags.map(compactKeyword).find(Boolean) : '';
      const keyword = compactKeyword(tagKeyword || seed || v.snippet?.title || categoryName);
      if (!keyword) continue;
      candidates.push({ keyword, videoId: v.id, channelId: ch?.id || '', channelTitle: ch?.snippet?.title || '', views: metric.views, vph: Math.round(metric.vph), subs: metric.subs, score: Math.round(metric.score) });
    }
  }
  const seen = new Set();
  const sorted = candidates.sort((a, b) => {
    const smallA = a.subs > 0 && a.subs <= 50000 ? 100000000 : 0;
    const smallB = b.subs > 0 && b.subs <= 50000 ? 100000000 : 0;
    return (smallB + b.score) - (smallA + a.score);
  });
  return sorted.filter(x => !seen.has(x.keyword) && seen.add(x.keyword)).slice(0, 5);
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const expected = process.env.ADMIN_CRON_SECRET || '';
  const provided = req.headers['x-admin-secret'] || req.query?.secret || '';
  const adminEmail = String(req.headers['x-admin-email'] || req.query?.adminEmail || req.body?.adminEmail || '').trim().toLowerCase();
  const ua = String(req.headers['user-agent'] || '');
  const isVercelCron = ua.includes('vercel-cron');
  if (expected && provided !== expected && adminEmail !== 'chinhkhai79@gmail.com' && !isVercelCron) {
    return res.status(401).json({ ok: false, error: 'Unauthorized admin cron' });
  }

  try {
    const keys = getKeys(req);
    if (!keys.length) {
      return res.status(200).json({
        ok: false,
        needKeys: true,
        region: normalizeRegion(req.query?.region || req.body?.region || 'VN'),
        error: 'Chưa có YouTube API Key. Hãy nhập key trong Cài đặt API hoặc thêm env YOUTUBE_API_KEYS trên Vercel.'
      });
    }
    const state = await readCronState();
    let region = normalizeRegion(req.query?.region || req.body?.region || '');
    if (!region || region === 'GLOBAL') region = REGIONS[Number(state.nextRegionIndex || 0) % REGIONS.length];
    const used = { exhausted: new Set(Array.isArray(state.exhaustedKeysToday) ? state.exhaustedKeysToday : []) };

    const categories = [];
    for (const [categoryName, seedsDef] of CATEGORY_DEFS) {
      try {
        const items = await scanCategory(categoryName, seedsDef, region, keys, used);
        categories.push({ category: categoryName, items });
      } catch (e) {
        categories.push({ category: categoryName, items: [], error: e?.message || String(e) });
        if (String(e?.message || e).toLowerCase().includes('quota')) break;
      }
    }
    const updatedAt = new Date().toISOString();
    const nextScanAt = req.body?.nextScanAt || req.query?.nextScanAt || null;
    const saved = await writeTrendingCache(region, { source: 'youtube-api-admin-cron', updatedAt, nextScanAt, categories });
    const currentIdx = REGIONS.indexOf(region);
    await writeCronState({
      nextRegionIndex: currentIdx >= 0 ? (currentIdx + 1) % REGIONS.length : 0,
      lastRegion: region,
      lastRunAt: updatedAt,
      exhaustedKeysToday: [...used.exhausted]
    });
    return res.status(200).json({ ok: true, region, updatedAt, categories: saved.categories, exhaustedKeys: used.exhausted.size });
  } catch (error) {
    console.error('[admin-trending-cron]', error);
    return res.status(500).json({ ok: false, error: error?.message || 'Server error' });
  }
}
