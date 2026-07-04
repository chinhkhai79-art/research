LỖI /admin.html HIỆN RA APP CHÍNH

Nguyên nhân: file vercel.json cũ đang rewrite toàn bộ đường dẫn không phải /api về /index.html:
/((?!api/).*) -> /index.html
Vì vậy /admin.html bị Vercel đẩy về app React chính.

Cách dùng:
1. Giải nén ZIP này.
2. Dán đè đúng thư mục gốc project.
3. Commit lên GitHub.
4. Redeploy Vercel.
5. Mở lại: https://www.tubekey.vn/admin.html

ZIP này có thêm vercel.json đã sửa để không chặn:
- /admin.html
- /admin-settings.html
- /pay.html
- /assets/*

Nếu trình duyệt vẫn hiện app cũ: nhấn Ctrl + F5 hoặc mở tab ẩn danh.
