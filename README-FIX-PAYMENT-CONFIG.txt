Dán đè 3 file đúng đường dẫn:

1) lib/appSettings.js
2) api/payment-config.js
3) api/create-payment.js

Mục tiêu sửa:
- /api/payment-config luôn trả JSON, không còn lỗi Unexpected token A.
- /api/create-payment luôn trả JSON, tạo được QR VietQR.
- Đọc cấu hình thanh toán từ admin-settings nếu Firestore có dữ liệu.
- Nếu Firestore/Firebase lỗi, API vẫn trả JSON fallback để giao diện không vỡ.

Sau khi dán đè:
- Commit lên GitHub.
- Deploy lại Vercel.
- Mở: https://research.vanthemmo.com/api/payment-config
  Nếu thấy JSON { success: true, payment: ... } là đúng.
- Mở lại pay.html để kiểm tra QR.
