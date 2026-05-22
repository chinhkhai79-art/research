const { readTrendingCache, normalizeRegion } = require('../lib/trending-store.js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const region = normalizeRegion(req.query.region || 'VN');
    const doc = await readTrendingCache(region);
    if (!doc || !Array.isArray(doc.categories) || doc.categories.length === 0) {
      return res.status(404).json({
        error: 'Chưa có dữ liệu ngách đã cache cho khu vực này. Admin cần chạy /api/admin-trending-cron trước.',
        region
      });
    }
    return res.status(200).json({
      ok: true,
      source: 'admin-youtube-cache',
      region,
      updatedAt: doc.updatedAt,
      nextScanAt: doc.nextScanAt || null,
      categories: doc.categories
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
};
