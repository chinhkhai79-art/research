BẢN FIX ADMIN SETTINGS - SEPAY + SMTP

Dán đè toàn bộ file/folder trong ZIP này lên repo hiện tại rồi Deploy lại Vercel.

Đã sửa:
1) Trang /admin-settings.html có nút LƯU riêng cho SePay.
2) Trang /admin-settings.html có nút LƯU riêng cho SMTP.
3) Có nút LƯU TẤT CẢ ở cuối trang.
4) Nút "Lưu & kiểm tra webhook" sẽ tự lưu cấu hình SePay hiện tại rồi mới gọi /api/test-webhook.
5) /api/test-webhook lấy Webhook Secret từ cấu hình đã lưu trong Firestore, không còn phụ thuộc cứng vào SEPAY_API_KEY.
6) Thông báo nổi tự tắt sau 3 giây, nút có hiệu ứng bấm.

Cần có biến môi trường trên Vercel:
- ADMIN_SETTINGS_PASSWORD: mật khẩu vào trang /admin-settings.html
- Firebase Admin env như app đang dùng sẵn

Ghi chú:
- Webhook URL copy vào SePay: https://research.vanthemmo.com/api/sepay-webhook
- Webhook Secret trong SePay phải giống ô "API Key / Webhook Secret SePay" trên trang admin.
