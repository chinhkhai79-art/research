import { getAppSettings, publicPaymentSettings } from '../lib/appSettings.js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-password');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).json({ success: true });

  try {
    const settings = await getAppSettings();
    return res.status(200).json({
      success: true,
      payment: publicPaymentSettings(settings)
    });
  } catch (error) {
    console.error('[payment-config] error:', error);
    return res.status(200).json({
      success: true,
      warning: error?.message || String(error),
      payment: publicPaymentSettings({})
    });
  }
}
