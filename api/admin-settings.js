import { getAppSettings, saveAppSettings, publicSafeSettings, requireAdminPassword } from '../lib/appSettings.js';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const inputPassword = req.method === 'GET' ? req.query.password : req.body?.password;
    requireAdminPassword(inputPassword);

    if (req.method === 'GET') {
      const settings = await getAppSettings();
      return res.status(200).json({ success: true, settings: publicSafeSettings(settings) });
    }

    if (req.method === 'POST') {
      const { sepay = {}, smtp = {} } = req.body || {};
      if (sepay.plans && !Array.isArray(sepay.plans)) {
        return res.status(400).json({ success: false, message: 'plans phải là mảng JSON.' });
      }
      const saved = await saveAppSettings({ sepay, smtp });
      return res.status(200).json({ success: true, settings: publicSafeSettings(saved) });
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ success: false, message: e.message || 'Server error' });
  }
}
