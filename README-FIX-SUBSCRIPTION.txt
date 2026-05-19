FIX HIỂN THỊ HẠN DÙNG + TỰ ĐỘNG THANH TOÁN + CỘNG DỒN

Dán đè các file chính:

App.tsx
public/pay.html
api/sepay-webhook.js
api/payment-status.js
api/create-payment.js
api/me/subscription.js
lib/firebaseAdmin.js
lib/cors.js

Nếu cần, dán thêm:
src/lib/firebase.ts
package.json
tsconfig.json
vercel.json
vite.config.ts

Đã sửa:
1. App hiển thị 4 ô dễ kiểm soát:
   - Gói
   - Bắt đầu
   - Hết hạn
   - Còn lại

2. Nút Nâng cấp gói vẫn hiển thị sau khi user đã PRO.
   Nếu đã PRO, nút đổi thành: NÂNG CẤP THÊM.

3. Pay page không còn nút “Tôi đã thanh toán - kiểm tra lại”.
   Trang tự kiểm tra /api/payment-status mỗi 2 giây.
   Khi SePay xác nhận paid=true, tự chuyển về app.

4. Đăng nhập Google lần đầu:
   api/me/subscription tự tạo trial 1 giờ.

5. Thanh toán SePay cộng dồn:
   Nếu user còn hạn hiện tại, gói mới được cộng vào ngày hết hạn hiện tại.
   Nếu hết hạn, gói mới tính từ thời điểm thanh toán.

Test sau deploy:
https://research.vanthemmo.com/api/debug
https://research.vanthemmo.com/pay.html
https://research.vanthemmo.com/api/test-webhook?orderCode=RESEARCH1779163274685&amount=300000
https://research.vanthemmo.com/api/payment-status?orderCode=RESEARCH1779163274685
