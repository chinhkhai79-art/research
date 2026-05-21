import { setCors } from '../lib/cors.js';
import { sendPaymentSuccessEmail } from '../lib/mailer.js';
import { getAppSettings, requireAdmin } from '../lib/appSettings.js';
export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (!requireAdmin(req, res)) return;
  try {
    const s = await getAppSettings();
    const to = String(req.query.to || req.body?.to || s.smtp.testTo || s.smtp.user || '').trim();
    const result = await sendPaymentSuccessEmail({ to, name:'Khải', planName:'GÓI 3 THÁNG', amount:180000, orderCode:'RESEARCH_TEST_EMAIL', expiresAt:new Date(Date.now()+90*86400000), toolUrl:s.payment.appDomain+'/' }, s.smtp);
    return res.status(result.success ? 200 : 500).json({ success:result.success, to, messageId:result.messageId, error:result.error, skipped:result.skipped, smtp:{ enabled:s.smtp.enabled, hasUser:Boolean(s.smtp.user), hasPass:Boolean(s.smtp.pass), host:s.smtp.host, port:s.smtp.port, secure:s.smtp.secure } });
  } catch(e){ return res.status(500).json({ success:false, error:e.message }); }
}
