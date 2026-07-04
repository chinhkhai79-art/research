# SMTP email khi SePay thanh toán thành công

Bản này thêm gửi email tự động giống mẫu sau khi webhook SePay xác nhận thanh toán.

## Dán đè / thêm file

Dán các file này vào project:

- lib/mailer.js
- api/sepay-webhook.js
- api/test-email.js
- package.json

Giữ nguyên các file cũ khác nếu đã chạy OK.

## Biến môi trường cần thêm trên Vercel

Vào Vercel > Project > Settings > Environment Variables, thêm:

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=email_gui_cua_anh@gmail.com
SMTP_PASS=mat_khau_ung_dung_gmail_16_ky_tu
SMTP_FROM_NAME=Văn Thế Web
TOOL_URL=https://www.tubekey.vn/

Nếu dùng Gmail, SMTP_PASS phải là App Password, không phải mật khẩu Gmail thường.

## Cách lấy Gmail App Password

1. Vào Google Account của email gửi.
2. Bật 2-Step Verification.
3. Vào App passwords.
4. Tạo app password cho Mail.
5. Copy mã 16 ký tự, dán vào SMTP_PASS.
6. Không cần khoảng trắng. Code đã tự xóa khoảng trắng nếu có.

## Sau khi thêm env

Commit GitHub rồi Redeploy Vercel.

## Test SMTP

Mở link:

https://www.tubekey.vn/api/test-email?to=email_nhan_test@gmail.com

Nếu thành công sẽ trả:

{
  "success": true,
  "messageId": "..."
}

## Hoạt động khi thanh toán thật

SePay gửi webhook thành công:
- cập nhật payments
- cập nhật paid_orders
- cập nhật users/{userId}
- cộng dồn hạn dùng nếu user còn hạn
- gửi email thông báo thành công tới userEmail
- ghi emailSent / emailMessageId / emailError vào paid_orders

Webhook có chống gửi email lặp: nếu paid_orders/{orderCode}.emailSent = true thì webhook không gửi lại email nữa.
