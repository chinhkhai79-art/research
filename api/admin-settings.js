import { setCors } from '../lib/cors.js';
import { getAppSettings, saveAppSettings, maskSettings, requireAdmin } from '../lib/appSettings.js';

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (!requireAdmin(req, res)) return;
  try {
    if (req.method === 'GET') return res.status(200).json({ success: true, settings: maskSettings(await getAppSettings()) });
    if (req.method === 'POST') return res.status(200).json({ success: true, settings: maskSettings(await saveAppSettings(req.body?.settings || req.body || {})) });
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (e) { return res.status(500).json({ success: false, error: e.message }); }
}
