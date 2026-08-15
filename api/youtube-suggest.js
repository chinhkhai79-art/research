function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const q = String(req.query?.q || '').trim();
  const hl = String(req.query?.hl || 'vi').trim().slice(0, 12) || 'vi';
  if (!q) return res.status(400).json({ success: false, suggestions: [], error: 'Missing q' });
  if (q.length > 120) return res.status(400).json({ success: false, suggestions: [], error: 'Query too long' });

  try {
    const url = new URL('https://suggestqueries.google.com/complete/search');
    url.searchParams.set('client', 'firefox');
    url.searchParams.set('ds', 'yt');
    url.searchParams.set('q', q);
    url.searchParams.set('hl', hl);

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json,text/plain,*/*',
        'User-Agent': 'Mozilla/5.0 (compatible; TubeKeyKeywordResearch/1.0)'
      }
    });

    if (!response.ok) {
      return res.status(200).json({ success: false, suggestions: [], upstreamStatus: response.status });
    }

    const data = await response.json().catch(() => []);
    const suggestions = Array.isArray(data?.[1])
      ? Array.from(new Set(data[1].map(item => String(item || '').replace(/\s+/g, ' ').trim()).filter(Boolean))).slice(0, 20)
      : [];

    return res.status(200).json({ success: true, query: q, suggestions });
  } catch (error) {
    console.error('youtube-suggest error:', error);
    return res.status(200).json({ success: false, suggestions: [], error: error?.message || 'Suggest error' });
  }
}
