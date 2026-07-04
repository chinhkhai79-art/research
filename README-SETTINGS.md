# Update cấu hình thanh toán + SMTP

## Dán các file này vào project

- `lib/appSettings.js` → thêm mới trong thư mục `lib`
- `lib/mailer.js` → thay file cũ
- `api/admin-settings.js` → thêm mới trong thư mục `api`
- `api/payment-config.js` → thêm mới trong thư mục `api`
- `api/create-payment.js` → thay file cũ
- `api/sepay-webhook.js` → thay file cũ
- `api/payment-status.js` → thay file cũ
- `api/test-email.js` → thay file cũ
- `public/pay.html` → thay file cũ
- `public/admin.html#settings` → thêm mới trong thư mục `public`

## Thêm biến trong Vercel

Bắt buộc:

```txt
ADMIN_SETTINGS_KEY=mat-khau-quan-tri-tu-dat
SEPAY_API_KEY=key-webhook-sepay-cua-ban
FIREBASE_SERVICE_ACCOUNT=...
FIRESTORE_DATABASE_ID=...
```

## Mở trang cấu hình

```txt
https://www.tubekey.vn/admin.html#settings
```

Nhập `ADMIN_SETTINGS_KEY`, bấm `Tải cấu hình`, chỉnh thanh toán + SMTP, rồi bấm `Lưu cấu hình`.

## Luồng sau khi SePay báo thành công

1. Webhook `/api/sepay-webhook` nhận giao dịch.
2. Kiểm tra `SEPAY_API_KEY`.
3. Tìm mã chuyển khoản theo tiền tố đang cấu hình.
4. Nâng cấp tài khoản Pro.
5. Cộng dồn hạn dùng nếu tài khoản còn hạn.
6. Gửi email thông báo thanh toán thành công bằng SMTP đã cấu hình.
