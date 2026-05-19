import nodemailer from "nodemailer";

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

function formatMoney(amount) {
  return new Intl.NumberFormat("vi-VN").format(Number(amount || 0)) + " đ";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateVN(value) {
  if (!value) return "Đang cập nhật";

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Đang cập nhật";
  }

  return date.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

export async function sendPaymentSuccessEmail(params) {
  try {
    const smtpUser = env("SMTP_USER").trim();
    const smtpPass = env("SMTP_PASS").replace(/\s+/g, "").trim();

    if (!smtpUser || !smtpPass) {
      return {
        success: false,
        messageId: null,
        error: "Missing SMTP_USER or SMTP_PASS"
      };
    }

    if (!params?.to) {
      return {
        success: false,
        messageId: null,
        error: "Missing recipient email"
      };
    }

    const smtpHost = env("SMTP_HOST", "smtp.gmail.com");
    const smtpPort = Number(env("SMTP_PORT", "465"));
    const smtpSecure = env("SMTP_SECURE", "true") !== "false";
    const fromName = env("SMTP_FROM_NAME", "Văn Thế Web");
    const toolUrl = params.toolUrl || env("TOOL_URL", "https://research.vanthemmo.com/");
    const expiresText = formatDateVN(params.expiresAt);
    const subject = `Thanh toán thành công ${params.planName} - Văn Thế Web`;

    const safeName = params.name || params.to;

    const text = [
      `Xin chào ${safeName},`,
      "",
      "Bạn đã thanh toán thành công và tài khoản đã được nâng cấp PRO.",
      `Gói: ${params.planName}`,
      `Số tiền: ${formatMoney(params.amount)}`,
      `Mã đơn: ${params.orderCode}`,
      `Hạn sử dụng: ${expiresText}`,
      "",
      "Vui lòng truy cập trang dưới đây để sử dụng tool:",
      toolUrl,
      "",
      "Email này được gửi tự động sau khi hệ thống xác nhận thanh toán qua SePay."
    ].join("\n");

    const html = `
    <div style="font-family:Arial,sans-serif;background:#f4f7fb;padding:24px;color:#0f172a;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:18px;padding:28px;border:1px solid #e5e7eb;">
        <h2 style="margin:0 0 12px;font-size:24px;color:#0284c7;">Thanh toán thành công</h2>
        <p>Xin chào <b>${escapeHtml(safeName)}</b>,</p>
        <p>Bạn đã thanh toán thành công và tài khoản đã được nâng cấp PRO.</p>

        <div style="background:#f8fafc;border-radius:14px;padding:16px;margin:18px 0;">
          <p style="margin:6px 0;"><b>Gói:</b> ${escapeHtml(params.planName)}</p>
          <p style="margin:6px 0;"><b>Số tiền:</b> ${escapeHtml(formatMoney(params.amount))}</p>
          <p style="margin:6px 0;"><b>Mã đơn:</b> ${escapeHtml(params.orderCode)}</p>
          <p style="margin:6px 0;"><b>Hạn sử dụng:</b> ${escapeHtml(expiresText)}</p>
        </div>

        <p>Vui lòng truy cập trang dưới đây để sử dụng tool:</p>
        <p>
          <a href="${escapeHtml(toolUrl)}"
             style="display:inline-block;background:#0284c7;color:white;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:bold;">
            Mở tool ngay
          </a>
        </p>

        <p style="margin-top:24px;color:#64748b;font-size:13px;">
          Email này được gửi tự động sau khi hệ thống xác nhận thanh toán qua SePay.
        </p>
      </div>
    </div>`;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    const info = await transporter.sendMail({
      from: `"${fromName}" <${smtpUser}>`,
      to: params.to,
      subject,
      text,
      html
    });

    return {
      success: true,
      messageId: info.messageId || null,
      error: null
    };
  } catch (error) {
    return {
      success: false,
      messageId: null,
      error: error?.message || String(error)
    };
  }
}
