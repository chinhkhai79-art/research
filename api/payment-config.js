import { getAppSettings, maskSettings } from '../lib/appSettings.js';
import { checkTrialIpAccess } from '../lib/trialIpLimiter.js';
function cors(req,res){ res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Content-Type'); if(req.method==='OPTIONS'){res.status(200).end(); return true;} return false; }
export default async function handler(req,res){
  if(cors(req,res)) return;
  const action = String(req.query?.action || req.body?.action || '').trim();
  try{
    if (action === 'trial-ip-guard') {
      const result = await checkTrialIpAccess(req);
      const status = result.allowed ? 200 : 429;
      return res.status(status).json({ success: result.allowed, ...result });
    }
    if (req.method !== 'GET') return res.status(405).json({ success:false, error:'Method not allowed' });
    const s = await getAppSettings();
    const safe = maskSettings(s);
    return res.status(200).json({ success:true, ...safe, payment:safe.payment, plans:safe.payment.plans });
  }catch(e){
    console.error('payment-config error:', e);
    if (action === 'trial-ip-guard') {
      return res.status(500).json({ success:false, allowed:false, error:e?.message || 'Server error' });
    }
    // Fail closed: tuyệt đối không trả cấu hình ACB cũ khi database/config lỗi,
    // vì có thể tạo QR chuyển tiền sai ngân hàng.
    return res.status(500).json({ success:false, error:e.message || 'Không tải được cấu hình thanh toán hiện tại.' });
  }
}
