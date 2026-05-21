HƯỚNG DẪN CÀI /admin-settings.html

1) Upload các file đúng vị trí:
- public/admin-settings.html
- api/admin-settings.js
- api/payment-config.js
- api/test-email.js
- lib/appSettings.js
- lib/mailer.js

2) Cài nodemailer:
npm i nodemailer

3) Vercel → Settings → Environment Variables:
ADMIN_SETTINGS_PASSWORD = mật khẩu quản trị anh tự đặt

4) Mở:
https://research.vanthemmo.com/admin-settings.html

5) Dán cấu hình:
- SePay Webhook Secret
- Bank owner / bank account / bank name / prefix
- SMTP Gmail + App Password Gmail

6) Webhook URL copy vào SePay:
https://research.vanthemmo.com/api/sepay-webhook

7) Muốn pay.html dùng cấu hình mới:
Trong pay.html gọi GET /api/payment-config để lấy bankOwner, bankAccount, bankName, plans, paymentPrefix.

8) Muốn sepay-webhook.js gửi email:
import { sendMail, buildPaymentSuccessEmail } from '../lib/mailer.js';
rồi gọi sendMail(...) sau khi update Pro thành công.
