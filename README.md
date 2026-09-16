<div align="center">

<img src="docs/logo.svg" width="72" alt="Logo Truyện Drive" />

# Truyện Drive

**Đọc truyện tranh từ kho Google Drive riêng tư của bạn — ngay trong trình duyệt.**

Web app thuần client (Vue 3 + TypeScript), không cần backend: không server, không database, không analytics.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![Vue 3](https://img.shields.io/badge/Vue-3-42b883.svg)
![Vite](https://img.shields.io/badge/Vite-8-646cff.svg)
![Platform](https://img.shields.io/badge/platform-Web-3d8bff.svg)

</div>

---

Truyện Drive biến một folder Google Drive thành thư viện truyện tranh: đăng nhập bằng Google, trỏ tới folder, đánh dấu truyện rồi đọc — ảnh lẫn PDF, trên điện thoại hay máy tính, với tiến độ đọc tự đồng bộ qua các thiết bị.

Triết lý của project: **mọi dữ liệu thuộc về bạn**. Ứng dụng chạy 100% trong trình duyệt, token đăng nhập chỉ nằm trong bộ nhớ, ảnh cache trong IndexedDB của chính thiết bị đó, tiến độ đọc lưu vào thư mục ẩn trên Drive của chính bạn. Không có bất kỳ server trung gian nào.

## Mục lục

- [Tính năng](#tính-năng)
- [Ảnh chụp màn hình](#ảnh-chụp-màn-hình)
- [Bắt đầu nhanh](#bắt-đầu-nhanh)
- [Cấu hình Google OAuth](#cấu-hình-google-oauth)
- [Cấu trúc thư mục Drive](#cấu-trúc-thư-mục-drive)
- [Deploy](#deploy)
- [Quyền riêng tư](#quyền-riêng-tư)
- [Kiến trúc](#kiến-trúc)
- [Khắc phục sự cố](#khắc-phục-sự-cố)
- [Đóng góp & báo lỗi](#đóng-góp--báo-lỗi)
- [Giấy phép](#giấy-phép)

## Tính năng

### Đọc truyện

- Đọc **ảnh** (lazy-load + prefetch theo cuộn) và **PDF** (render bằng pdf.js) trong cùng một reader
- Chapter có cả ảnh lẫn PDF → nút chuyển **🖼 Ảnh / 📄 PDF** trên toolbar, lựa chọn được ghi nhớ cho từng chapter
- **Chuyển chapter** ngay trong reader + ô tìm/nhảy nhanh tới chương bất kỳ
- Nút **Tiếp tục đọc** đưa thẳng tới chương đang dở, khôi phục cả vị trí cuộn

### Kho & tổ chức

- **Nhiều kho truyện**: chọn trực tiếp folder từ Drive (duyệt "Đã chia sẻ với tôi" / "My Drive" + tìm theo tên trên toàn bộ Drive) hoặc dán URL/ID folder; chuyển kho nhanh từ header
- **Người dùng quyết định cấu trúc** — app không auto-detect: mở kho chỉ liệt kê folder, bạn duyệt và đánh dấu folder nào là truyện (nút **📖 Đọc truyện**), folder nào là **nhóm chapter** (kiểu `0-80/`) để đưa chương lên cùng cấp. Đánh dấu lưu vĩnh viễn và đồng bộ qua thiết bị
- Danh sách truyện sắp theo **tên** hoặc **mới cập nhật** (nhớ lựa chọn); tên chapter và file ảnh sort tự nhiên (`2 < 10 < 100`)
- **Tìm kiếm không cần dấu** ("one piece" tìm ra "One Piece", "doremon" ra "Doraemon")

### Tiến độ & đồng bộ đa thiết bị

- Lưu **tiến độ đọc** từng truyện; card truyện hiện sẵn "Đang đọc 45/100"
- **Đồng bộ qua Google Drive** (`appDataFolder` — thư mục ẩn riêng của app trong Drive của bạn): tiến độ, danh sách kho, đánh dấu truyện/nhóm được tự tải khi mở trang và tự đẩy sau mỗi thay đổi (~15s debounce), hợp nhất last-write-wins. Đọc đến chương 15 trên điện thoại → mở laptop thấy ngay. Tắt/bật trong **Cài đặt**

### Cache & hiệu năng

- **Cache IndexedDB**: danh sách truyện/chapter, danh sách file, blob ảnh/PDF, tiến độ — đọc lại không tốn mạng; xóa từng loại trong Cài đặt
- Quét kho tiết kiệm request (batch nhiều folder 1 query, semaphore 4 request, tự **backoff khi 403/429** rate-limit)
- Kho bật _"Viewers can't download"_ vẫn đọc được: tự fallback sang bản preview do Google render (~2048px)

### Giao diện

- Dark / light mode (theo hệ thống hoặc chọn tay)
- Tiếng Việt, responsive cho điện thoại — dùng tốt như app native
- Trang **Hướng dẫn sử dụng** ngay trong app (`/guide`) cho người không rành kỹ thuật

## Ảnh chụp màn hình

> Chưa có ảnh — đặt ảnh vào `docs/screenshots/` rồi nhúng vào đây.

| Thư viện                         | Đang đọc                        |
| -------------------------------- | ------------------------------- |
| _(docs/screenshots/library.png)_ | _(docs/screenshots/reader.png)_ |

## Bắt đầu nhanh

Yêu cầu: [Bun](https://bun.sh) (khuyên dùng) hoặc Node.js `^22.18.0 || >=24.12.0`.

```bash
git clone https://github.com/quachquesh/truyen-drive-web.git
cd truyen-drive-web
bun install
cp .env.example .env.local   # điền VITE_GOOGLE_CLIENT_ID (xem mục dưới)
bun run dev                  # http://localhost:5173
```

Các lệnh khác:

```bash
bun run test:unit   # vitest
bun run lint        # oxlint + eslint
bun run build       # type-check (vue-tsc) + build production
bun run preview     # xem thử bản build
```

## Cấu hình Google OAuth

App đăng nhập bằng Google Identity Services và gọi thẳng Drive API, nên bạn cần tự tạo OAuth client (1 lần, ~10 phút). Tóm tắt:

1. [Google Cloud Console](https://console.cloud.google.com/) → tạo project → enable **Google Drive API**
2. **OAuth consent screen** (External) → thêm scope `drive.readonly` và `drive.appdata` → thêm Gmail của bạn vào Test users
3. **Credentials → OAuth client ID** (Web application) → origin `http://localhost:5173` → copy Client ID vào `.env.local`
4. Chia sẻ folder kho trên Drive (quyền Viewer)

👉 Hướng dẫn đầy đủ từng bước (kèm phần chuyển sang Production / OAuth verification khi publish công khai): **[docs/setup-google-oauth.md](docs/setup-google-oauth.md)**.

## Cấu trúc thư mục Drive

```
Kho truyện/
├── One Piece/          ← truyện (đánh dấu "Đọc truyện")
│   ├── 1010/           ← chapter = folder ảnh
│   │   ├── 001.jpg
│   │   └── …
│   ├── 1011.pdf        ← hoặc 1 file PDF
│   └── 0-100/          ← nhóm chapter (đánh dấu "Nhóm")
└── Kho truyện con/        ← folder "danh sách truyện" (bấm vào để duyệt)
```

Chi tiết quy ước + ví dụ đầy đủ: **[docs/drive-structure.md](docs/drive-structure.md)**. Trong app cũng có trang **Hướng dẫn sử dụng** (`/guide`) viết cho người không rành kỹ thuật.

## Deploy

Build ra static site thuần — chạy được trên mọi static host. Project chọn **Cloudflare Pages** làm host chính:

```bash
bun run build   # nhớ set VITE_GOOGLE_CLIENT_ID trong env của host
```

Hướng dẫn đầy đủ cho Cloudflare Pages (kèm SPA fallback, env, custom domain, thêm origin vào OAuth client) và tham khảo cho Vercel/Netlify/GitHub Pages: **[docs/deploy.md](docs/deploy.md)**.

## Quyền riêng tư

- **Token đăng nhập chỉ nằm trong bộ nhớ** của tab trình duyệt — không lưu vào cookie/localStorage, không gửi về server nào (vì không có server)
- App chỉ đọc Drive của bạn (`drive.readonly`); dữ liệu đồng bộ ghi vào thư mục ẩn `appDataFolder` trên Drive của chính bạn
- Không analytics, không quảng cáo, không theo dõi, không bên thứ ba nào khác ngoài Google Drive API

Đầy đủ tại trang **Chính sách bảo mật** (`/privacy` trên bản deploy) — trang này không cần đăng nhập để xem, dùng làm Privacy Policy URL khi submit Google OAuth verification (xem [docs/setup-google-oauth.md](docs/setup-google-oauth.md)).

## Kiến trúc

```
src/
├── lib/                 # lõi không phụ thuộc UI
│   ├── googleAuth.ts    # GIS token client, silent refresh
│   ├── tokenBox.ts      # token trong memory
│   ├── driveApi.ts      # axios + 401 refresh + backoff + batch list
│   ├── scanner.ts       # quét BFS theo tầng, chapter file lazy
│   ├── db.ts            # IndexedDB (idb): 6 store
│   ├── sync.ts          # đồng bộ appDataFolder, last-write-wins
│   ├── blobCache.ts     # blob ảnh/PDF qua IDB
│   ├── pdfDoc.ts        # wrapper pdf.js
│   └── …                # naturalSort, storySort, concurrency, folderUrl
├── stores/              # Pinia: auth / library / stories / sync
├── pages/               # Login/Library/Folder/Story/Reader/Settings
│                        # + Privacy/Terms/Guide (public)
├── components/          # AppHeader, StoryCard, PdfReader, DriveFolderPicker…
└── router/index.ts      # route + auth guard
```

Drive giới hạn ~12 request/giây/user — scanner dùng semaphore 4 + retry backoff, mọi kết quả quét được cache nên chỉ chậm lần đầu.

Chi tiết luồng dữ liệu (token, quét, cache, đồng bộ): **[docs/architecture.md](docs/architecture.md)**.

## Khắc phục sự cố

<details>
<summary><strong>F5 lại ra trang đăng nhập?</strong></summary>

Token không lưu trên máy nên mỗi lần mở trang, app phải xin lại token từ Google (silent). Nếu trình duyệt chặn bước silent, app đưa bạn về trang đăng nhập — bấm nút **1 click là vào lại** (không phải cấp quyền lại). Để vào thẳng không cần bấm:

- Không dùng chế độ ẩn danh / private window
- Cho phép third-party cookies, hoặc thêm ngoại lệ cho `https://accounts.google.com`
- Tắt extension chặn popup/tracker
- Đăng nhập Google trong cùng profile trình duyệt đang mở app

</details>

<details>
<summary><strong>Sau khi cập nhật lên bản có đồng bộ, phải đăng nhập lại?</strong></summary>

Bản đồng bộ thêm quyền mới `drive.appdata`. Ai đã đăng nhập từ bản cũ bị đưa về trang đăng nhập **đúng 1 lần** — bấm nút rồi đồng ý quyền mới trong popup Google là xong.
</details>

<details>
<summary><strong>Chương hiện "Google chặn tải file" / ảnh mờ hơn bình thường?</strong></summary>

Kho bật cài đặt _"Viewers can't download"_ → viewer không tải được file gốc (403). App **tự động chuyển sang bản preview** do Google render (~2048px) — đọc bình thường nhưng không cache offline được. Chương **PDF** bị chặn thì bấm "Xem trên Drive ↗". File bị Google đánh dấu vi phạm bản quyền thì preview cũng không có.
</details>

<details>
<summary><strong>403 khi quét kho?</strong></summary>

Drive giới hạn ~12 request/giây — app đã giảm tải request và tự backoff khi bị rate-limit. Nếu vẫn thấy lỗi "Vượt giới hạn tần suất", đợi ~1 phút rồi bấm Làm mới.
</details>

## Đóng góp & báo lỗi

Mọi báo lỗi, đề xuất tính năng và câu hỏi — mở issue tại [github.com/quachquesh/truyen-drive-web/issues](https://github.com/quachquesh/truyen-drive-web/issues) (dùng template có sẵn). PR cũng chào đón: fork → branch → `bun run lint && bun run test:unit` pass → gửi PR.

## Giấy phép

[MIT](LICENSE) © 2026 quachquesh
