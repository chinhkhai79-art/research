import { setCors } from '../lib/cors.js';
import { getAppSettings } from '../lib/appSettings.js';
export default async function handler(req, res) {
  if (setCors(req, res)) return;
  try { const s = await getAppSettings(); return res.status(200).json({ success: true, payment: s.payment }); }
  catch(e){ return res.status(500).json({ success:false, error:e.message }); }
}
