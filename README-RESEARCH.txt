# Research Vercel Payment Files

Bộ file này được tạo dựa theo mẫu Vercel + Firebase + SePay đã chạy thành công, nhưng đã đổi sang tool mới:

- Domain: https://research.vanthemmo.com
- Pay page: https://research.vanthemmo.com/pay.html
- Webhook: https://research.vanthemmo.com/api/sepay-webhook
- Prefix nội dung chuyển khoản: RESEARCH
- Ngân hàng: ACB 13131447 LE VAN KHAI

## Cách dán nhanh

Copy các thư mục/file này vào project:

vercel.json
api/
  ping.js
  debug.js
  debug-firebase.js
  create-payment.js
  payment-status.js
  sepay-webhook.js
  me/subscription.js
lib/
  firebaseAdmin.js
  cors.js
public/
  pay.html

Nếu app của anh đang dùng React Auth mẫu thành công thì có thể copy thêm:

src/components/AccountModals.tsx
src/hooks/useAuth.ts
src/lib/firebase.ts

## Biến môi trường cần có trên Vercel

Vào Vercel → Settings → Environment Variables, thêm:

SEPAY_API_KEY = mysecret123
FIREBASE_SERVICE_ACCOUNT = JSON service account Firebase Admin
FIRESTORE_DATABASE_ID = database id Firestore của app

Nếu Firestore dùng default database thì vẫn có thể để FIRESTORE_DATABASE_ID theo database đang dùng trong project mẫu.

## Test sau khi deploy

Mở trực tiếp:

https://research.vanthemmo.com/api/ping
https://research.vanthemmo.com/api/debug
https://research.vanthemmo.com/api/debug-firebase
https://research.vanthemmo.com/pay.html
https://research.vanthemmo.com/api/payment-status?orderCode=RESEARCH123
https://research.vanthemmo.com/api/sepay-webhook

Lưu ý: /api/sepay-webhook opens in browser to show it's running. SePay sends POST JSON.

## Cấu hình SePay

- URL nhận webhook: https://research.vanthemmo.com/api/sepay-webhook
- Loại giao dịch: Tiền vào
- Định dạng dữ liệu: JSON
- Bảo mật: API Key
- API Key: mysecret123

## Lưu ý

Không dùng lại domain hoặc prefix của tool cũ. File đã đổi từ KHAI sang RESEARCH và từ khaikeyword.vanthemmo.com sang research.vanthemmo.com.
