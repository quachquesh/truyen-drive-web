# Truyện Drive

Web app đọc truyện tranh từ kho Google Drive **riêng tư** — chỉ frontend (Vue 3 + TypeScript), không cần backend.

## Tính năng

- **Đăng nhập Google** (Google Identity Services, implicit flow) — chỉ tài khoản được chia sẻ kho mới đọc được nội dung
- **Token không lưu trên máy**: token chỉ nằm trong memory. Refresh trang → app tự xin token lại (silent, không cần bấm nút nếu còn session Google)
- **Nhiều kho truyện**: **chọn trực tiếp folder từ Drive** (duyệt "Đã chia sẻ với tôi" / "My Drive" + ô tìm theo tên trên toàn bộ Drive) hoặc dán URL/ID folder, chuyển kho nhanh từ header
- **NGƯỜI DÙNG quyết định cấu trúc** (không auto-detect): mở kho chỉ list folder (không quét gì). Folder chưa phân loại bấm vào sẽ **xem nội dung** để quyết định; nút **📖 Đọc truyện** trên card (hoặc banner trên trang thư mục) xác nhận "đây là truyện" → khi đó mới quét chapter bên trong (batch + lấy mẫu nhóm — cả truyện chỉ ~vài request). Folder "list truyện" (kiểu `Drop/`) không cần đánh dấu — bấm vào là xem danh sách bên trong, tiếp tục quyết định từng truyện. Đánh dấu lưu vĩnh viễn trong IndexedDB; có nút bỏ đánh dấu trên trang chapter nếu phân loại nhầm.

  Chapter quét **tự động đúng 1 cấp**: danh sách chapter = các folder con trực tiếp của truyện (1 request batch, không suy diễn). Folder nào thực chất là nhóm (kiểu `0-80`) hiện thành 1 dòng — bấm **⤴ Nhóm** trên dòng đó (hoặc trong màn "Chapter trống") để đưa chapter bên trong lên cùng cấp; nhóm lồng nhau đánh dấu tiếp từng tầng. Đánh dấu nhóm lưu vĩnh viễn; bỏ được ở trang xem thư mục. Danh sách sort tự nhiên (`2 < 10 < 100`).
- **Lấy ảnh/PDF lazy**: quét cấu trúc không đụng tới file; chỉ khi mở chapter mới request danh sách file (cache lại), blob ảnh lazy-load theo cuộn khi đọc
- **Nút 📂 trên card** mở nội dung bất kỳ folder nào (lồng sâu tự do) — chính là UI để quyết định folder đó là truyện hay danh sách truyện; danh sách truyện sắp xếp theo tên hoặc mới cập nhật (nhớ lựa chọn)
- **Đọc ảnh hoặc PDF**: ảnh lazy-load + prefetch; PDF render bằng pdf.js theo cuộn. Chapter có cả ảnh lẫn PDF "trọn bộ" → nút chuyển **🖼 Ảnh / 📄 PDF** trên toolbar (nhớ lựa chọn)
- **Cache IndexedDB**: danh sách truyện/chapter, danh sách file chapter, blob ảnh/PDF, tiến trình đọc — đọc lại không tốn mạng. Có nút làm mới / xóa cache từng loại trong Cài đặt; tự backoff khi Drive trả 403/429 rate-limit
- Lưu **tiến trình đọc**, khôi phục vị trí cuộn, nút "Tiếp tục đọc"
- **Đồng bộ đa thiết bị qua Google Drive** (appDataFolder — thư mục ẩn riêng của app, không hiện trong My Drive): tiến độ đọc, danh sách kho + kho đang chọn, đánh dấu story/nhóm được tự động tải mỗi khi mở trang và tự đẩy lên Drive sau mỗi thay đổi (~15s debounce). Hợp nhất theo last-write-wins; xóa kho/bỏ đánh dấu có tombstone nên không "hồi sinh" từ máy khác. VD: đọc đến chapter 15 trên điện thoại → mở laptop thấy ngay nút "Tiếp tục đọc: chapter 15". Tắt/bật trong **Cài đặt → Đồng bộ đa thiết bị**. Dữ liệu gắn với tài khoản Google — mỗi tài khoản một bộ riêng.
- Giao diện Naive UI, dark/light mode, tiếng Việt, tìm kiếm không cần dấu

## Chạy dự án

```bash
bun install
cp .env.example .env.local   # điền VITE_GOOGLE_CLIENT_ID (xem dưới)
bun run dev
```

Các lệnh khác: `bun run test:unit`, `bun run build`, `bun run preview`, `bun run lint`.

## Cấu hình Google OAuth (làm 1 lần)

1. Mở [Google Cloud Console](https://console.cloud.google.com/) → tạo project mới (hoặc dùng project có sẵn)
2. **APIs & Services → Library** → tìm **Google Drive API** → **Enable**
3. **APIs & Services → OAuth consent screen**:
   - User type: **External** → Create
   - App name tuỳ ý, email hỗ trợ của bạn
   - **Scopes**: thêm `https://www.googleapis.com/auth/drive.readonly` và `https://www.googleapis.com/auth/drive.appdata` (scope thứ 2 để lưu dữ liệu đồng bộ đa thiết bị)
   - **Test users**: thêm Gmail của bạn và những người được đọc (chế độ Testing cho tối đa 100 user, đủ dùng cá nhân — không cần verify app)
   - Publish mode **Testing** là dùng được ngay
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins**: thêm `http://localhost:5173` (dev) và domain deploy (VD `https://truyen-cua-ban.vercel.app`)
   - Copy **Client ID** (dạng `xxxx.apps.googleusercontent.com`)
5. Dán vào `.env.local`:

   ```
   VITE_GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
   ```

6. Chia sẻ folder kho trên Drive cho các tài khoản đã add ở bước 3 (quyền Viewer là đủ)

## Cấu trúc folder Drive

- Mỗi **truyện** là 1 folder con của kho
- Mỗi **chapter** là 1 folder chứa ảnh (sort tự nhiên theo tên file) **hoặc** 1 file `.pdf`
- Chapter có thể nằm trực tiếp trong truyện hoặc nhóm trong folder trung gian (`0-30/`...) — lồng bao nhiêu tầng cũng được

## Khắc phục sự cố

### Sau khi cập nhật lên bản có đồng bộ, phải đăng nhập lại?
Bản đồng bộ thêm quyền mới `drive.appdata` (ghi dữ liệu của app vào Drive). Ai đã đăng nhập từ bản cũ sẽ bị đưa về trang đăng nhập **đúng 1 lần** — bấm nút rồi đồng ý quyền mới trong popup Google là xong.

### F5 lại ra trang đăng nhập?
Token không lưu trên máy nên mỗi lần mở trang app phải xin lại token từ Google (silent). Nếu trình duyệt chặn bước silent, app sẽ đưa bạn về trang đăng nhập — bấm nút **1 click là vào lại** (không phải cấp quyền lại, Google tự chọn đúng tài khoản). Để silent chạy được (vào thẳng không cần bấm):

- Không dùng chế độ ẩn danh / private window
- Cho phép third-party cookies, hoặc thêm ngoại lệ cho `https://accounts.google.com` (Chrome → Settings → Privacy and security → Third-party cookies)
- Tắt extension chặn popup/tracker
- Đăng nhập Google trong **cùng profile trình duyệt** đang mở app

Nếu bấm nút vẫn lỗi, gửi dòng lỗi hiển thị trên trang (có kèm mã lỗi như `popup_failed_to_open`) để chẩn đoán tiếp.

### Chap hiện "Google chặn tải file" / ảnh mờ hơn bình thường?
Kho bật cài đặt **"Viewers can't download"** → viewer không tải được file gốc (`403 fileNotDownloadable`). App **tự động chuyển sang bản preview** do Google render (~2048px, xem được với quyền viewer) — ảnh vẫn đọc bình thường nhưng không cache offline được và sharp hơn bản gốc một chút. Chapter **PDF** bị chặn thì phải bấm "Xem trên Drive ↗" (preview trong app chỉ có trang 1). Nếu file bị Google đánh dấu vi phạm bản quyền thì preview cũng không có — chỉ xem trên Drive để kiểm tra.

### 403 khi quét kho?
Drive giới hạn ~12 request/giây — app đã giảm còn vài request khi quét và tự backoff khi bị rate-limit. Nếu vẫn thấy lỗi "Vượt giới hạn tần suất", đợi ~1 phút rồi bấm Làm mới.

## Deploy

App là static site thuần (`dist/` sau khi build) — deploy được lên Vercel, Netlify, Cloudflare Pages, GitHub Pages...:

```bash
bun run build   # nhớ set VITE_GOOGLE_CLIENT_ID trong env của host
```

Thêm domain deploy vào **Authorized JavaScript origins** của OAuth client.

## Kiến trúc

```
src/
├── lib/
│   ├── googleAuth.ts   # GIS token client, silent refresh, supersede request cũ
│   ├── tokenBox.ts     # token trong memory (không đụng localStorage)
│   ├── driveApi.ts     # axios + interceptors (401 → refresh token, 403/429/5xx → backoff)
│   │                   # + listChildrenGrouped: batch nhiều cha 1 query (chống N+1)
│   ├── scanner.ts      # quét BFS theo tầng chỉ-list-folder + ensureChapterFiles lazy
│   ├── db.ts           # IndexedDB (idb): libraries / cache / blobs / progress / folderTypes / tombstones
│   ├── sync.ts         # đồng bộ đa thiết bị: snapshot → merge last-write-wins → apply
│   ├── blobCache.ts    # blob ảnh-PDF: IDB trước, miss thì tải Drive
│   ├── naturalSort.ts  # sort "tự nhiên" (2 < 10)
│   ├── concurrency.ts  # semaphore request song song
│   └── folderUrl.ts    # parse URL/ID folder Drive
├── stores/             # Pinia: auth / library / stories / sync
├── pages/              # Login / Library / Folder / Story / Reader / Settings
└── components/         # AppHeader, LibraryModal, StoryCard, ReaderImage, PdfPage, PdfReader
```

Giới hạn Drive API: ~12 request/giây/user. Scanner dùng semaphore 4 + retry backoff; kết quả quét được cache nên chỉ chậm lần đầu.
