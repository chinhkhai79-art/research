BẢN ZIP DÁN ĐÈ - ADMIN QUẢN LÝ TÀI KHOẢN RESEARCH

Copy/dán đè đúng thư mục trong GitHub:

api/admin-users.js
api/admin-activate-user.js
api/admin-disable-user.js
api/admin-logs.js
api/me/subscription.js
public/admin.html

Sau khi deploy Vercel, mở:
https://research.vanthemmo.com/admin.html

Biến môi trường cần có trên Vercel:
- FIREBASE_SERVICE_ACCOUNT
- FIRESTORE_DATABASE_ID nếu đang dùng database khác (không bắt buộc nếu dùng default)
- ADMIN_SECRET hoặc ADMIN_SETTINGS_PASSWORD hoặc ADMIN_PASSWORD hoặc ADMIN_SETTINGS_KEY

Chức năng:
- Xem danh sách tài khoản đã đăng ký
- Tìm theo email / UID / tên
- Xem trạng thái Trial / PRO / Hết hạn
- Xem gói hiện tại, ngày hết hạn, thời gian còn lại
- Kích hoạt thủ công / cộng thêm 30 / 90 / 180 / 365 ngày
- Khóa / hủy PRO tài khoản
- Ghi log vào collection admin_logs

Ghi chú quan trọng:
- Nếu chỉ kích hoạt bằng email mà người dùng chưa từng đăng nhập, hệ thống tạo bản ghi manual_email.
- Khi người dùng đăng nhập Google bằng đúng email đó, api/me/subscription.js sẽ tự gộp quyền PRO từ bản ghi manual sang UID Google thật.
- File sepay-webhook.js hiện tại của anh đã có logic nâng PRO + cộng dồn + gửi email sau khi SePay báo thành công, nên ZIP này không thay webhook để tránh làm hỏng luồng thanh toán đang chạy.
