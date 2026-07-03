import { getAppSettings, maskSettings } from '../lib/appSettings.js';
function cors(req,res){ res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Content-Type'); if(req.method==='OPTIONS'){res.status(200).end(); return true;} return false; }
export default async function handler(req,res){
  if(cors(req,res)) return;
  try{
    const s = await getAppSettings();
    const safe = maskSettings(s);
    return res.status(200).json({ success:true, ...safe, payment:safe.payment, plans:safe.payment.plans });
  }catch(e){
    console.error('payment-config error:', e);
    return res.status(200).json({ success:true, warning:e.message, payment:{ bankId:'970416', bankCode:'ACB', bankName:'ACB', accountNo:'13131447', accountNumber:'13131447', accountName:'LE VAN KHAI', transferPrefix:'RESEARCH', paymentPrefix:'RESEARCH', plans:{'1m':{id:'1m',name:'GÓI 1 THÁNG',amount:299000,days:30,enabled:true},'3m':{id:'3m',name:'GÓI 3 THÁNG',amount:699000,days:90,enabled:true},'6m':{id:'6m',name:'GÓI 6 THÁNG',amount:1199000,days:180,enabled:true},'12m':{id:'12m',name:'GÓI 1 NĂM',amount:1999000,days:365,enabled:true}} } });
  }
}
