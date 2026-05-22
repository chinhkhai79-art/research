import { readTrendingCache, writeTrendingCache, readCronState, writeCronState, normalizeRegion } from '../lib/trending-store.js';

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
const REGION_GENERIC_SEEDS = {
  JP: ['トレンド','人気 動画','最新 話題','ランキング','おすすめ'],
  KR: ['트렌드','인기 영상','최신 화제','랭킹','추천'],
  TH: ['กำลังมาแรง','วิดีโอยอดนิยม','เทรนด์ล่าสุด','แนะนำ','ยอดวิวสูง'],
  ID: ['trending','video populer','viral terbaru','rekomendasi','views tinggi'],
  BR: ['tendências','vídeos populares','viral hoje','dicas','alta visualização'],
  FR: ['tendance','vidéos populaires','viral aujourd hui','astuces','fortes vues'],
  DE: ['trends','beliebte videos','viral heute','tipps','hohe aufrufe']
};
function pickSeeds(def, region, categoryName) {
  const regional = REGIONAL_SEED_BANK[region]?.[categoryName];
  if (Array.isArray(regional) && regional.length) return regional;
  if (Array.isArray(def[region]) && def[region].length) return def[region];
  const generic = REGION_GENERIC_SEEDS[region];
  if (Array.isArray(generic) && generic.length) {
    const base = String(categoryName || '').toLowerCase();
    const suffix = generic.slice(0, 3);
    if (region === 'JP') {
      if (base.includes('công nghệ') || base.includes('ai')) return ['AI ツール トレンド','ChatGPT 最新','テクノロジー 人気'];
      if (base.includes('ẩm thực')) return ['簡単 レシピ 人気','料理 トレンド','グルメ 人気'];
      if (base.includes('du lịch')) return ['旅行 vlog 人気','観光 トレンド','穴場スポット'];
      if (base.includes('giải trí')) return ['面白い動画 人気','コメディ トレンド','映画レビュー'];
      if (base.includes('thể thao')) return ['スポーツ 人気','筋トレ トレンド','サッカー ハイライト'];
      if (base.includes('tài chính')) return ['投資 初心者','副業 人気','お金の勉強'];
    }
    if (region === 'KR') {
      if (base.includes('công nghệ') || base.includes('ai')) return ['AI 도구 트렌드','ChatGPT 최신','테크 뉴스'];
      if (base.includes('ẩm thực')) return ['간단 요리 인기','요리 트렌드','맛집 추천'];
      if (base.includes('du lịch')) return ['여행 브이로그 인기','국내 여행','숨은 명소'];
      if (base.includes('giải trí')) return ['웃긴 영상 인기','영화 리뷰','예능 클립'];
    }
    return suffix;
  }
  return def.US || def.VN || [];
}
function scoreVideo(video, channel) {
  const views = Number(video?.statistics?.viewCount || 0);
  const publishedAt = new Date(video?.snippet?.publishedAt || Date.now()).getTime();
  const ageHours = Math.max(1, (Date.now() - publishedAt) / 36e5);
  const vph = views / ageHours;
  const subs = Number(channel?.statistics?.subscriberCount || 0);
  const viewSubRatio = subs > 0 ? views / subs : views;
  // Bước 68: không giới hạn kênh nhỏ/lớn. Chấm theo video trend 30 ngày:
  // VPH cao + Views cao + View/Sub ratio tốt, nhưng không loại kênh lớn.
  let score = vph * 4 + viewSubRatio * 6 + views / 800;
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
    const search = await youtubeFetch(`search?part=snippet&type=video&order=viewCount&maxResults=25${regionParam}&publishedAfter=${encodeURIComponent(publishedAfter30d())}&q=${encodeURIComponent(seed)}`, keys, used);
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
      const tagKeyword = Array.isArray(v.snippet?.tags) ? v.snippet.tags.map(compactKeyword).find(Boolean) : '';
      const keyword = compactKeyword(tagKeyword || seed || v.snippet?.title || categoryName);
      if (!keyword) continue;
      candidates.push({ keyword, videoId: v.id, channelId: ch?.id || '', channelTitle: ch?.snippet?.title || '', views: metric.views, vph: Math.round(metric.vph), subs: metric.subs, score: Math.round(metric.score) });
    }
  }
  const seen = new Set();
  const sorted = candidates.sort((a, b) => b.score - a.score);
  return sorted.filter(x => !seen.has(x.keyword) && seen.add(x.keyword)).slice(0, 5);
}

function normalizeItem(item, scannedAt) {
  const keyword = compactKeyword(item?.keyword || item || '');
  if (!keyword) return null;
  return {
    ...item,
    keyword,
    scannedAt: item?.scannedAt || scannedAt,
    source: item?.source || 'youtube-api-v3'
  };
}

function mergeCategoryItems(oldItems = [], newItems = [], scannedAt) {
  const byKey = new Map();
  // Dữ liệu cũ chưa có scannedAt được xem là cũ nhất, để key mới tự đè lên trước.
  for (const raw of oldItems || []) {
    const item = normalizeItem(raw, '1970-01-01T00:00:00.000Z');
    if (item && !byKey.has(item.keyword)) byKey.set(item.keyword, item);
  }
  for (const raw of newItems || []) {
    const item = normalizeItem(raw, scannedAt);
    if (item) byKey.set(item.keyword, { ...byKey.get(item.keyword), ...item, scannedAt });
  }
  return [...byKey.values()]
    .sort((a, b) => new Date(b.scannedAt || 0).getTime() - new Date(a.scannedAt || 0).getTime())
    .slice(0, 5);
}

function ensureCategoryList(existing = []) {
  const map = new Map((existing || []).map(c => [String(c.category || '').toUpperCase(), c]));
  return CATEGORY_DEFS.map(([category]) => {
    const old = map.get(String(category).toUpperCase());
    return old || { category, items: [] };
  });
}

function getRegionProgress(state, region) {
  const progress = state?.regionProgress || {};
  const idx = Number(progress?.[region]?.nextCategoryIndex || 0);
  return Number.isFinite(idx) && idx >= 0 ? idx % CATEGORY_DEFS.length : 0;
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
    const todayKey = new Date().toISOString().slice(0, 10);
    const exhaustedState = state.exhaustedKeysDate === todayKey ? state.exhaustedKeysToday : [];
    const used = { exhausted: new Set(Array.isArray(exhaustedState) ? exhaustedState : []) };

    // Cuốn chiếu: lấy cache cũ, quét từng chủ đề, có chủ đề nào xong là ghi ngay chủ đề đó vào Firebase.
    // UI có thể gọi /api/trending-cache liên tục để thấy kết quả mới trước, không phải đợi toàn bộ 30 chủ đề.
    const existingDoc = await readTrendingCache(region);
    let categories = ensureCategoryList(existingDoc?.categories || []);
    const startIndex = getRegionProgress(state, region);
    const startedAt = Date.now();
    const timeBudgetMs = Math.max(3500, Math.min(Number(req.body?.timeBudgetMs || req.query?.timeBudgetMs || 8500), 25000));
    const nextScanAt = req.body?.nextScanAt || req.query?.nextScanAt || existingDoc?.nextScanAt || null;
    const scannedCategories = [];
    let nextCategoryIndex = startIndex;
    let quotaStopped = false;

    for (let offset = 0; offset < CATEGORY_DEFS.length; offset++) {
      const idx = (startIndex + offset) % CATEGORY_DEFS.length;
      const [categoryName, seedsDef] = CATEGORY_DEFS[idx];
      const scannedAt = new Date().toISOString();
      try {
        const items = await scanCategory(categoryName, seedsDef, region, keys, used);
        const old = categories[idx] || { category: categoryName, items: [] };
        categories[idx] = {
          ...old,
          category: categoryName,
          items: mergeCategoryItems(old.items || [], items || [], scannedAt),
          updatedAt: scannedAt,
          status: 'done'
        };
        scannedCategories.push(categoryName);
        nextCategoryIndex = (idx + 1) % CATEGORY_DEFS.length;

        // Ghi ngay sau mỗi chủ đề để frontend hiển thị dần kiểu cuốn chiếu.
        await writeTrendingCache(region, {
          source: 'youtube-api-admin-cron-rolling',
          updatedAt: scannedAt,
          nextScanAt,
          scanStatus: nextCategoryIndex === 0 ? 'completed-cycle' : 'running-partial',
          nextCategoryIndex,
          categories
        });
      } catch (e) {
        const msg = e?.message || String(e);
        const old = categories[idx] || { category: categoryName, items: [] };
        categories[idx] = { ...old, category: categoryName, error: msg, status: 'pending-or-quota' };
        nextCategoryIndex = idx;
        if (msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('api key')) {
          quotaStopped = true;
          break;
        }
      }

      if (Date.now() - startedAt > timeBudgetMs) break;
    }

    const updatedAt = new Date().toISOString();
    const currentIdx = REGIONS.indexOf(region);
    const regionProgress = { ...(state.regionProgress || {}) };
    regionProgress[region] = { nextCategoryIndex, updatedAt };
    await writeTrendingCache(region, {
      source: 'youtube-api-admin-cron-rolling',
      updatedAt,
      nextScanAt,
      scanStatus: quotaStopped ? 'quota-paused' : (nextCategoryIndex === 0 ? 'completed-cycle' : 'running-partial'),
      nextCategoryIndex,
      categories
    });
    await writeCronState({
      nextRegionIndex: quotaStopped ? (currentIdx >= 0 ? (currentIdx + 1) % REGIONS.length : 0) : (currentIdx >= 0 ? currentIdx : 0),
      regionProgress,
      lastRegion: region,
      lastRunAt: updatedAt,
      exhaustedKeysDate: todayKey,
      exhaustedKeysToday: [...used.exhausted]
    });
    return res.status(200).json({
      ok: true,
      rolling: true,
      region,
      updatedAt,
      nextCategoryIndex,
      scannedCategories,
      scanStatus: quotaStopped ? 'quota-paused' : 'partial-saved',
      categories,
      exhaustedKeys: used.exhausted.size
    });
  } catch (error) {
    console.error('[admin-trending-cron]', error);
    return res.status(500).json({ ok: false, error: error?.message || 'Server error' });
  }
}
