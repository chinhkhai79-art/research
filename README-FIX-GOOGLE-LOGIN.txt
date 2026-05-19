FIX GOOGLE LOGIN unauthorized-domain

Dán đè 2 file:

1. firebase-applet-config.json
   Đặt ở GỐC PROJECT, ngang hàng package.json.

2. src/lib/firebase.ts

Sau đó commit GitHub và Redeploy Vercel.

Firebase project dùng:
gen-lang-client-0680572356

Web app ID:
1:143403316600:web:b386dbb542db3d5dfe848d

Authorized domain cần có trong Firebase Authentication:
research.vanthemmo.com

Google Cloud OAuth:
Authorized JavaScript origins:
https://research.vanthemmo.com

Authorized redirect URI:
https://gen-lang-client-0680572356.firebaseapp.com/__/auth/handler
https://research.vanthemmo.com/__/auth/handler

Lưu ý:
Nếu còn auth/unauthorized-domain sau khi đã thêm domain, hãy mở tab ẩn danh hoặc Ctrl+F5 vì bản JS cũ có thể còn cache.
