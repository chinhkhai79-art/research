const { writeTrendingCache, readCronState, writeCronState, normalizeRegion } = require('../lib/trending-store.js');

const REGIONS = ['VN', 'US', 'AU', 'GB', 'CA', 'IN', 'SG', 'JP', 'KR', 'TH', 'ID', 'PH', 'MY'];
const CATEGORIES = [
  { category: 'PHÁT TRIỂN BẢN THÂN', seeds: { VN: ['thói quen tốt', 'vượt qua trì hoãn', 'kỷ luật bản thân'], US: ['self improvement habits', 'productivity tips', 'discipline motivation'], AU: ['self improvement habits', 'productivity tips'] } },
  { category: 'SỨC KHỎE & LÀM ĐẸP', seeds: { VN: ['giảm cân tại nhà', 'skincare cho người mới', 'yoga tại nhà'], US: ['home workout', 'skincare routine', 'weight loss tips'], AU: ['home workout', 'skincare routine'] } },
  { category: 'CÔNG NGHỆ & AI', seeds: { VN: ['công cụ AI', 'hướng dẫn ChatGPT', 'tạo video bằng AI'], US: ['ai tools', 'chatgpt tutorial', 'ai video tools'], AU: ['ai tools', 'chatgpt tutorial'] } },
  { category: 'GIÁO DỤC & HỌC TẬP', seeds: { VN: ['học tiếng anh', 'mẹo học tập', 'tự học lập trình'], US: ['study tips', 'learn english', 'coding for beginners'], AU: ['study tips', 'learn english'] } },
  { category: 'ẨM THỰC & NẤU ĂN', seeds: { VN: ['món ngon dễ làm', 'nấu ăn gia đình', 'công thức món ăn'], US: ['easy recipes', 'meal prep', 'home cooking'], AU: ['easy recipes', 'meal prep'] } },
  { category: 'DU LỊCH & KHÁM PHÁ', seeds: { VN: ['du lịch việt nam', 'review homestay', 'phượt xe máy'], US: ['travel vlog', 'budget travel', 'hidden places'], AU: ['australia travel vlog', 'budget travel'] } },
  { category: 'GIẢI TRÍ & HÀI HƯỚC', seeds: { VN: ['phim hài ngắn', 'review phim', 'tình huống hài'], US: ['funny shorts', 'movie recap', 'comedy skit'], AU: ['funny shorts', 'comedy skit'] } },
  { category: 'THỂ THAO & THỂ HÌNH', seeds: { VN: ['bài tập tăng cơ', 'bóng đá việt nam', 'gym tại nhà'], US: ['fitness tips', 'football highlights', 'home gym'], AU: ['fitness tips', 'football highlights'] } },
  { category: 'PETS & ĐỘNG VẬT', seeds: { VN: ['chó mèo dễ thương', 'huấn luyện chó', 'thú cưng'], US: ['cute pets', 'dog training', 'cat care'], AU: ['cute pets', 'dog training'] } }
];

function getKeys() {
  return String(process.env.YOUTUBE_API_KEYS || process.env.YOUTUBE_API_KEY || '')
    .split(/[\n,;]+/)
    .map(x => x.trim())
    .filter(Boolean);
}
function publishedAfter30d() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString();
}
function formatKeyword(s) {
  return String(s || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[#|•·,_;:!?()[\]{}"“”'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .split(' ')
    .slice(0, 5)
    .join(' ');
}
function pickSeeds(category, region) {
  return category.seeds[region] || category.seeds.US || category.seeds.VN || [];
}
function scoreVideo(video, channel) {
  const stats = video.statistics || {};
  const views = Number(stats.viewCount || 0);
  const publishedAt = new Date(video.snippet?.publishedAt || Date.now()).getTime();
  const ageHours = Math.max(1, (Date.now() - publishedAt) / 36e5);
  const vph = views / ageHours;
  const subs = Number(channel?.statistics?.subscriberCount || 0);
  const viewSubRatio = subs > 0 ? views / subs : views;
  let score = vph * 3 + viewSubRatio * 12;
  if (subs <= 50000) score *= 1.6;
  if (subs <= 30000) score *= 1.25;
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
    if (r.status === 403 || msg.includes('quota') || msg.includes('daily')) {
      used.exhausted.add(key);
      continue;
    }
    throw new Error(lastError);
  }
  throw new Error(lastError || 'Tất cả YouTube API key đã hết quota');
}
async function scanCategory(category, region, keys, used) {
  const candidates = [];
  const seeds = pickSeeds(category, region).slice(0, 3);
  for (const seed of seeds) {
    const search = await youtubeFetch(`search?part=snippet&type=video&order=viewCount&maxResults=20&regionCode=${encodeURIComponent(region)}&publishedAfter=${encodeURIComponent(publishedAfter30d())}&q=${encodeURIComponent(seed)}`, keys, used);
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
      // Ưu tiên kênh nhỏ/trung bình: dưới 50K subs, nhưng nếu thiếu dữ liệu vẫn cho fallback dưới 1M.
      const keyword = formatKeyword((v.snippet?.tags || [])[0] || seed || v.snippet?.title || '');
      candidates.push({ keyword, title: v.snippet?.title, videoId: v.id, channelId: ch?.id, channelTitle: ch?.snippet?.title, views: metric.views, vph: Math.round(metric.vph), subs: metric.subs, score: metric.score });
    }
  }
  const seen = new Set();
  return candidates
    .sort((a, b) => (a.subs <= 50000 ? -1000000 : 0) + b.score - ((b.subs <= 50000 ? -1000000 : 0) + a.score))
    .filter(x => x.keyword && !seen.has(x.keyword) && seen.add(x.keyword))
    .slice(0, 5);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const expected = process.env.ADMIN_CRON_SECRET;
  const provided = req.headers['x-admin-secret'] || req.query.secret;
  const isVercelCron = req.headers['user-agent'] && String(req.headers['user-agent']).includes('vercel-cron');
  if (expected && provided !== expected && !isVercelCron) {
    return res.status(401).json({ error: 'Unauthorized admin cron' });
  }

  try {
    const keys = getKeys();
    if (!keys.length) return res.status(400).json({ error: 'Thiếu env YOUTUBE_API_KEYS hoặc YOUTUBE_API_KEY trên Vercel' });

    const state = await readCronState();
    let region = normalizeRegion(req.query.region || req.body?.region || '');
    if (!region || region === 'GLOBAL') {
      const idx = Number(state.nextRegionIndex || 0) % REGIONS.length;
      region = REGIONS[idx];
    }

    const used = { exhausted: new Set(Array.isArray(state.exhaustedKeysToday) ? state.exhaustedKeysToday : []) };
    const categories = [];
    for (const cat of CATEGORIES) {
      try {
        const items = await scanCategory(cat, region, keys, used);
        categories.push({ category: cat.category, items });
      } catch (e) {
        categories.push({ category: cat.category, items: [], error: e.message });
      }
    }

    const updatedAt = new Date().toISOString();
    const next = await writeTrendingCache(region, { source: 'youtube-api-admin-cron', updatedAt, categories });
    const currentIdx = REGIONS.indexOf(region);
    await writeCronState({
      nextRegionIndex: currentIdx >= 0 ? (currentIdx + 1) % REGIONS.length : 0,
      lastRegion: region,
      lastRunAt: updatedAt,
      exhaustedKeysToday: [...used.exhausted]
    });

    return res.status(200).json({ ok: true, region, updatedAt, categories: next.categories, exhaustedKeys: used.exhausted.size });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
};
