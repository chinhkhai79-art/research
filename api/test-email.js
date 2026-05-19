import { setCors } from "../lib/cors.js";
import { sendPaymentSuccessEmail } from "../lib/mailer.js";

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  try {
    const to = String(req.query.to || process.env.SMTP_TEST_TO || process.env.SMTP_USER || "").trim();

    const result = await sendPaymentSuccessEmail({
      to,
      name: "Khải",
      planName: "Gói 1 tháng",
      amount: 10000,
      orderCode: "RESEARCH_TEST_EMAIL",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      toolUrl: "https://research.vanthemmo.com/"
    });

    return res.status(result.success ? 200 : 500).json({
      success: result.success,
      to,
      messageId: result.messageId,
      error: result.error,
      env: {
        hasSmtpUser: Boolean(process.env.SMTP_USER),
        hasSmtpPass: Boolean(process.env.SMTP_PASS),
        smtpHost: process.env.SMTP_HOST || "smtp.gmail.com",
        smtpPort: process.env.SMTP_PORT || "465",
        smtpSecure: process.env.SMTP_SECURE || "true"
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Test email error"
    });
  }
}
