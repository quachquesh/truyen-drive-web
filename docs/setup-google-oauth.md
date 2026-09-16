# Cấu hình Google OAuth cho Truyện Drive

Ứng dụng chạy thuần trong trình duyệt, đăng nhập bằng [Google Identity Services](https://developers.google.com/identity/oauth2/web/guides/overview) (implicit flow) và gọi thẳng Google Drive API. Bạn cần tự tạo một OAuth client của riêng mình — làm 1 lần, mất khoảng 10 phút.

## Tạo OAuth client (dùng cá nhân / nội bộ)

1. Mở [Google Cloud Console](https://console.cloud.google.com/) → tạo project mới (hoặc dùng project có sẵn).

2. **APIs & Services → Library** → tìm **Google Drive API** → **Enable**.

3. **APIs & Services → OAuth consent screen**:
   - User type: **External** → Create
   - App name: tuỳ ý (VD `Truyện Drive`), điền email hỗ trợ của bạn
   - **Scopes**: thêm 2 scope:
     - `https://www.googleapis.com/auth/drive.readonly` — đọc thư mục và file truyện
     - `https://www.googleapis.com/auth/drive.appdata` — lưu dữ liệu đồng bộ đa thiết bị (tiến độ đọc, danh sách kho, đánh dấu) vào thư mục ẩn `appDataFolder` trên Drive của chính người dùng
   - **Test users**: thêm Gmail của bạn và những người được đọc
   - Publishing mode **Testing** là dùng được ngay — chế độ này cho tối đa 100 test user, đủ cho nhu cầu cá nhân/nhóm thân hữu.

4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins**: thêm mỗi origin một dòng (không có dấu `/` cuối):
     - `http://localhost:5173` (dev)
     - Domain deploy, VD `https://truyen-drive.pages.dev` (xem [deploy.md](deploy.md))
   - Copy **Client ID** (dạng `xxxx.apps.googleusercontent.com`)

5. Điền Client ID vào `.env.local` ở thư mục gốc:

   ```
   VITE_GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
   ```

   Khi deploy phải set biến này trong bảng điều khiển của host (xem [deploy.md](deploy.md)).

6. Chia sẻ folder kho trên Drive cho các tài khoản đã thêm ở bước 3 — quyền **Viewer** là đủ.

## Đăng nhập lại sau khi thêm scope mới

Bản có đồng bộ đa thiết bị thêm scope `drive.appdata`. Ai đã đăng nhập từ bản cũ sẽ bị đưa về trang đăng nhập **đúng 1 lần** — bấm nút rồi đồng ý quyền mới trong popup Google là xong, không cần làm gì khác.

## Chuyển sang Production (OAuth verification)

Chế độ **Testing** hiện cảnh báo "app chưa được xác minh" khi đăng nhập lần đầu và giới hạn 100 test user. Nếu muốn publish công khai cho số lượng người dùng lớn hơn, cần đưa consent screen sang **In production** và submit Google xác minh:

1. **OAuth consent screen → App information**:
   - App name, logo, email hỗ trợ
   - **Homepage URL**: URL app đã deploy (VD `https://truyen-drive.pages.dev`)
   - **Privacy Policy URL**: `https://<domain-cua-ban>/privacy` — đây chính là trang "Chính sách bảo mật" có sẵn trong app
   - (Tuỳ chọn) Terms of Service URL: `https://<domain-cua-ban>/terms`
2. **OAuth consent screen → Audience** → chuyển sang **External / In production**.
3. Nộp **verification** cho scope `drive.readonly` (Google xếp vào nhóm sensitive scope):
   - Mô tả rõ ràng mục đích: "đọc truyện tranh do chính người dùng lưu trên Google Drive của họ"
   - Có thể phải làm một bản demo video ngắn giải thích luồng đăng nhập + đọc
   - Thời gian xét duyệt thường vài ngày đến vài tuần

> Lưu ý thực tế: nếu chỉ dùng trong gia đình/bạn bè (< 100 người) và mọi người thông cảm cảnh báo "unverified app" lần đầu (bấm *Advanced → Go to app*), giữ chế độ **Testing** là đơn giản nhất — không cần verify. Chế độ Testing chỉ có hạn chế: token hết hạn sau 7 ngày phải đồng ý lại (bấm 1 nút, không cấp quyền lại).

## Vấn đề thường gặp

- **`origin_mismatch` khi đăng nhập**: origin đang chạy chưa có trong Authorized JavaScript origins. Chú ý scheme (`http`/`https`), port và không có `/` cuối.
- **Đổi Client ID không ăn**: Client ID được nhúng vào bundle lúc build — deploy lại sau khi đổi env, và xóa cache trình duyệt (F5).
- **Sai tài khoản Google**: app chỉ lưu email gợi nhớ gần nhất trong localStorage (`tdw-login-hint`). Muốn đổi tài khoản hẳn: đăng xuất trong app, rồi quản lý phiên tại [myaccount.google.com](https://myaccount.google.com/permissions).
