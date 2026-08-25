# Bản cập nhật Link điểm danh để nhận tool

## Nền code

- Repository: `https://github.com/chinhkhai79-art/research`
- Nhánh: `main`
- Commit nền đã đối chiếu với GitHub: `4dc4123ecfcf5af8a2a4b75905d3f224e856ce65`
- Tham khảo luồng nghiệp vụ từ `vanthemmo_v867`, nhưng đã đổi toàn bộ ngữ cảnh từ nhận khóa học sang nhận tool TubeKey.

## Chức năng mới

- Tab **Link nhận tool** trong `/admin.html#intake`.
- Tạo, sửa, tạm dừng, mở lại và xóa link nhận tool.
- Ba cách giao tool: admin duyệt thủ công, hiện link ngay sau đăng ký, hoặc tự gửi link qua email.
- Form công khai responsive tại `/nhan-tool/{slug}`.
- Thu thập họ tên, email đăng nhập, số điện thoại, Zalo và mục đích sử dụng.
- Chống đăng ký trùng email trong cùng chiến dịch, honeypot và giới hạn tần suất theo IP.
- Danh sách đăng ký, tìm kiếm, sửa, xóa, từ chối và xuất CSV.
- Kích hoạt dùng thử bằng đúng API tài khoản hiện có của TubeKey.
- Gửi link tool qua SMTP, lưu trạng thái gửi và lỗi gửi.
- Mẫu email riêng cho từng chiến dịch, có phần xem trước.

## Cài đặt một lần trên Supabase

1. Mở Supabase Dashboard của dự án đang dùng cho TubeKey.
2. Vào **SQL Editor**.
3. Chạy toàn bộ file `scripts/supabase-tool-intake.sql`.
4. Deploy code lên Vercel như hiện tại.
5. Mở `/admin.html#intake` để tạo link đầu tiên.

Ba bảng mới chỉ cấp quyền cho `service_role`; `anon` và `authenticated` không được truy cập trực tiếp. Form công khai luôn đi qua API server, nên khóa Supabase bí mật không xuất hiện ở trình duyệt.

## Kiểm tra đã chạy

- `node scripts/test-tool-intake.mjs`: đạt.
- `node --check api/tool-intake.js`: đạt.
- `node --check lib/toolIntakeStore.js`: đạt.
- `pnpm run build`: đạt, 2.258 module được build.
- Kiểm tra trình duyệt desktop/mobile: trang có nội dung, không có Vite error overlay, không có console/page error.

Lưu ý: lệnh TypeScript tổng của repository vẫn báo các lỗi cũ trong `App.tsx` và `firebase.ts`; các file đó không thay đổi trong bản cập nhật này. Build production vẫn hoàn tất thành công.



## v98
- Số điện thoại chấp nhận Việt Nam và quốc tế.
- Cho phép định dạng +mã quốc gia, 00 mã quốc gia, khoảng trắng/gạch/ngoặc; chuẩn hóa trước khi lưu.
- Kiểm tra 7–15 chữ số theo giới hạn số quốc tế, không còn ép số Việt Nam 10 số.
- XLSX giữ số điện thoại dạng text để không mất dấu + hoặc số 0 đầu.
