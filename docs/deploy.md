# Deploy lên Cloudflare Pages

App build ra static site thuần (`dist/`) — chạy được trên mọi static host. Tài liệu này viết chi tiết cho **Cloudflare Pages** (đã chọn làm host chính của project).

## Chuẩn bị

- Đã cấu hình Google OAuth theo [setup-google-oauth.md](setup-google-oauth.md), biết Client ID của mình.
- Repo đã đẩy lên GitHub.

## Cách 1: Kết nối Git (tự động deploy mỗi push) — khuyên dùng

1. Vào [Cloudflare dashboard](https://dash.cloudflare.com/) → **Workers & Pages → Create → Pages → Connect to Git**.
2. Chọn repo `truyen-drive-web` và nhánh `main`.
3. Cấu hình build:

   | Mục | Giá trị |
   | --- | --- |
   | Framework preset | **Vue** (hoặc None) |
   | Build command | `bun run build` |
   | Build output directory | `dist` |

   Build image của Cloudflare nhận diện `bun.lock` và tự cài dependency bằng Bun. Nếu bị lỗi nhận diện, đổi build command thành:

   ```
   bun install && bun run build
   ```

4. Mục **Environment variables** → thêm cho cả **Production** và **Preview**:

   | Name | Value |
   | --- | --- |
   | `VITE_GOOGLE_CLIENT_ID` | Client ID của bạn (dạng `xxxx.apps.googleusercontent.com`) |

5. **Save and Deploy**. Lần đầu deploy xong, app chạy tại `https://<ten-repo>.pages.dev`.

## Cách 2: Deploy bằng Wrangler CLI (đẩy tay từ máy)

```bash
bun install
bunx wrangler login          # 1 lần
VITE_GOOGLE_CLIENT_ID=xxx bun run build
bunx wrangler pages deploy dist --project-name=truyen-drive-web
```

## SPA fallback

App dùng history routing (`createWebHistory`) nên cần mọi path chưa khớp file đều trả về `index.html`. **Cloudflare Pages tự làm điều này** cho SPA: khi không tìm thấy asset và bạn **không** khai báo `404.html` hay `_redirects`, Pages serve `index.html` với status 200. Vì vậy:

- Đừng tạo file `404.html` trong `public/` — nó sẽ override fallback SPA.
- Không cần file `_redirects` trừ khi muốn thêm rule riêng.

## Thêm domain vào Google OAuth

Sau khi có domain (mặc định `*.pages.dev` hoặc custom domain):

1. [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials** → OAuth client đang dùng.
2. Thêm vào **Authorized JavaScript origins** (không có `/` cuối):
   - `https://<ten-repo>.pages.dev` (production)
   - `https://<hash-preview>.<ten-repo>.pages.dev` (preview deployment, nếu muốn test đăng nhập trên preview)
3. Save — không cần deploy lại.

> Thay origin xong mà vẫn báo `origin_mismatch`: xóa cache trình duyệt hoặc hard-refresh (Ctrl+Shift+R), script GIS cache giá trị cũ.

## Custom domain (tuỳ chọn)

**Pages project → Custom domains → Set up a domain**. Cloudflare tự cấp SSL. Sau khi domain hoạt động, nhớ thêm domain mới vào Authorized JavaScript origins (bước trên) — mỗi origin là 1 dòng riêng.

## Checklist sau deploy

- [ ] Mở `https://<domain>` → hiện trang đăng nhập, bấm đăng nhập không báo lỗi origin
- [ ] Đăng nhập, thêm kho, đọc thử 1 chapter
- [ ] Mở `https://<domain>/privacy` và `/terms` — hai trang này **không cần đăng nhập** và là URL điền vào OAuth consent screen khi verify app (xem [setup-google-oauth.md](setup-google-oauth.md))
- [ ] F5 lại trang khi đang đọc → tự vào lại (silent token)

## Host khác (tham khảo)

| Host | SPA fallback |
| --- | --- |
| Vercel | Tự động cho framework Vue; hoặc thêm `vercel.json` rewrite mọi path → `/index.html` |
| Netlify | Thêm file `public/_redirects` với nội dung `/* /index.html 200` |
| GitHub Pages | Thêm file `public/404.html` copy của `index.html` + load script redirect (không hỗ trợ rewrite thật) |

Lưu ý chung: **set `VITE_GOOGLE_CLIENT_ID` trong env của host trước khi build** — biến env được nhúng vào bundle lúc build, đổi sau phải build lại.
