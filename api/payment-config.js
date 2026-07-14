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
    return res.status(200).json({ success:true, warning:e.message, payment:{ bankId:'970416', bankCode:'ACB', bankName:'ACB', accountNo:'LOCSPAY000339358', accountNumber:'LOCSPAY000339358', accountName:'NGUYEN VAN THE', transferPrefix:'TUBEKEY', paymentPrefix:'TUBEKEY', plans:{'1m':{id:'1m',name:'GÓI 1 THÁNG',amount:299000,days:30,enabled:true},'3m':{id:'3m',name:'GÓI 3 THÁNG',amount:699000,days:90,enabled:true},'6m':{id:'6m',name:'GÓI 6 THÁNG',amount:1199000,days:180,enabled:true},'12m':{id:'12m',name:'GÓI 1 NĂM',amount:1999000,days:365,enabled:true}} } });
  }
}
