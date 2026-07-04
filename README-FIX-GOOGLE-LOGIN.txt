FIX GOOGLE LOGIN unauthorized-domain

Dán đè 2 file:

1. firebase-applet-config.json
   Đặt ở GỐC PROJECT, ngang hàng package.json.

2. src/lib/firebase.ts

Sau đó commit GitHub và Redeploy Vercel.

Firebase project mới dùng:
tubekey-eccdb

Lấy Web app config mới trong Firebase Console > Project settings > Your apps > Web app.
Không dùng Gemini API key hoặc YouTube API key cho Firebase login.

Authorized domain cần có trong Firebase Authentication:
tubekey.vn
www.tubekey.vn

Google Cloud OAuth:
Authorized JavaScript origins:
https://www.tubekey.vn
https://tubekey.vn

Authorized redirect URI:
https://tubekey-eccdb.firebaseapp.com/__/auth/handler
https://www.tubekey.vn/__/auth/handler
https://tubekey.vn/__/auth/handler

Lưu ý:
Nếu còn auth/unauthorized-domain sau khi đã thêm domain, hãy mở tab ẩn danh hoặc Ctrl+F5 vì bản JS cũ có thể còn cache.
