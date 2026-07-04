# Cập nhật v25

Không cần chạy SQL mới nếu đã chạy `supabase_schema_v19_fixed.sql`.

Cấu hình dùng thử được lưu trong bảng `app_settings`, key `research_config`, trường JSON `account`:

```json
{
  "trialDurationValue": 1,
  "trialDurationUnit": "hours"
}
```

Có thể chỉnh trong admin: tab “Kích hoạt / khóa PRO” → “Cài đặt dùng thử tài khoản mới”.
