BẢN SỬA NHANH - CẤU HÌNH THANH TOÁN & SMTP

Cách dùng:
1. Giải nén ZIP.
2. Dán đè toàn bộ file/thư mục vào repo GitHub hiện tại.
3. Commit lên GitHub để Vercel tự deploy.
4. Vào: https://research.vanthemmo.com/admin-settings.html
5. Nhập mật khẩu quản trị ADMIN_SETTINGS_PASSWORD.
6. Cấu hình SePay + SMTP rồi bấm Lưu cấu hình.

Đã sửa trong bản này:
- /api/sepay-webhook mở trên trình duyệt sẽ trả JSON 200, không còn crash 500 chỉ vì mở GET.
- Webhook Secret lấy ưu tiên từ trang /admin-settings.html, sau đó mới fallback SEPAY_API_KEY trong Vercel.
- Giao diện admin-settings chia 2 cột: SePay bên trái, SMTP bên phải.
- Các nút có hiệu ứng đã bấm, loading và thông báo toast tự tắt sau 3 giây.
- Nút kiểm tra webhook gọi trực tiếp /api/sepay-webhook để dễ biết server có chạy không.

Lưu ý biến môi trường cần có trên Vercel:
- FIREBASE_SERVICE_ACCOUNT
- FIRESTORE_DATABASE_ID nếu Firestore của anh không dùng database mặc định
- ADMIN_SETTINGS_PASSWORD

Nodemailer đã nằm trong package.json.
