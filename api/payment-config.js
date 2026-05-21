import { getAppSettings, publicPaymentConfig } from '../lib/appSettings.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const settings = await getAppSettings();
    return res.status(200).json(publicPaymentConfig(settings));
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message || 'Không lấy được cấu hình thanh toán' });
  }
}
