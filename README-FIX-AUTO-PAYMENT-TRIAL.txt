FIX TỰ ĐỘNG THANH TOÁN + DÙNG THỬ 1 GIỜ + CỘNG DỒN HẠN

Các file cần dán đè:
- App.tsx
- public/pay.html
- api/sepay-webhook.js
- api/payment-status.js
- api/create-payment.js
- api/me/subscription.js
- lib/firebaseAdmin.js
- lib/cors.js

Có thể dán kèm các file cấu hình trong zip nếu cần:
- package.json
- tsconfig.json
- vercel.json
- vite.config.ts
- src/lib/firebase.ts

ĐÃ SỬA:
1. Không còn nút "Tôi đã thanh toán - kiểm tra lại".
2. pay.html tự kiểm tra /api/payment-status mỗi 2 giây.
3. SePay webhook nhận tiền xong, pay.html sẽ thấy paid=true và tự vào app ngay.
4. Login Google lần đầu tự tạo trial 1 giờ trong users/{uid}.
5. Hết 1 giờ trial thì khóa app và hiện nút nâng cấp.
6. Mua thêm gói sẽ cộng dồn ngày vào hạn hiện tại nếu còn hạn.
   Ví dụ: còn hạn tới 11/06/2028, mua thêm 30 ngày => hạn mới cộng tiếp từ 11/06/2028.
7. Các gói:
   1m = 30 ngày
   3m = 90 ngày
   6m = 180 ngày
   12m = 365 ngày

Sau khi dán:
1. Commit GitHub
2. Vercel Redeploy
3. Test login Google tài khoản mới: phải có dùng thử 1 giờ.
4. Test thanh toán: mở pay.html, chuyển khoản đúng mã, không bấm nút gì, hệ thống tự vào app.
