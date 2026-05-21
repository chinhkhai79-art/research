import nodemailer from 'nodemailer';

function money(v){ return new Intl.NumberFormat('vi-VN').format(Number(v || 0)) + ' đ'; }
function esc(v){ return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function dateVN(v){ const d = v instanceof Date ? v : new Date(v); return Number.isNaN(d.getTime()) ? 'Đang cập nhật' : d.toLocaleString('vi-VN',{ timeZone:'Asia/Ho_Chi_Minh', hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric' }); }

export async function sendPaymentSuccessEmail(params, smtp = {}) {
  try {
    const cfg = {
      enabled: smtp.enabled !== false,
      host: smtp.host || process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(smtp.port || process.env.SMTP_PORT || 465),
      secure: smtp.secure === false ? false : String(process.env.SMTP_SECURE || 'true') !== 'false',
      user: String(smtp.user || process.env.SMTP_USER || '').trim(),
      pass: String(smtp.pass || process.env.SMTP_PASS || '').replace(/\s+/g,'').trim(),
      fromName: smtp.fromName || process.env.SMTP_FROM_NAME || 'Văn Thế Web'
    };
    if (!cfg.enabled) return { success:false, skipped:true, error:'SMTP disabled' };
    if (!cfg.user || !cfg.pass) return { success:false, error:'Missing SMTP user/pass' };
    if (!params?.to) return { success:false, error:'Missing recipient email' };
    const subject = `Thanh toán thành công ${params.planName} - Văn Thế Web`;
    const name = params.name || params.to;
    const html = `<div style="font-family:Arial,sans-serif;background:#f4f7fb;padding:24px;color:#0f172a"><div style="max-width:620px;margin:0 auto;background:#fff;border-radius:18px;padding:28px;border:1px solid #e5e7eb"><h2 style="margin:0 0 12px;color:#0284c7">Thanh toán thành công</h2><p>Xin chào <b>${esc(name)}</b>,</p><p>Bạn đã thanh toán thành công và tài khoản đã được nâng cấp PRO.</p><div style="background:#f8fafc;border-radius:14px;padding:16px;margin:18px 0"><p><b>Gói:</b> ${esc(params.planName)}</p><p><b>Số tiền:</b> ${esc(money(params.amount))}</p><p><b>Mã đơn:</b> ${esc(params.orderCode)}</p><p><b>Hạn sử dụng:</b> ${esc(dateVN(params.expiresAt))}</p></div><p><a href="${esc(params.toolUrl || 'https://research.vanthemmo.com/')}" style="display:inline-block;background:#0284c7;color:white;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:bold">Mở tool ngay</a></p></div></div>`;
    const text = `Xin chào ${name},\n\nBạn đã thanh toán thành công và tài khoản đã được nâng cấp PRO.\nGói: ${params.planName}\nSố tiền: ${money(params.amount)}\nMã đơn: ${params.orderCode}\nHạn sử dụng: ${dateVN(params.expiresAt)}\n\n${params.toolUrl || 'https://research.vanthemmo.com/'}`;
    const transporter = nodemailer.createTransport({ host:cfg.host, port:cfg.port, secure:cfg.secure, auth:{ user:cfg.user, pass:cfg.pass } });
    const info = await transporter.sendMail({ from:`"${cfg.fromName}" <${cfg.user}>`, to:params.to, subject, text, html });
    return { success:true, messageId:info.messageId || null, error:null };
  } catch(e){ return { success:false, error:e.message || String(e) }; }
}
