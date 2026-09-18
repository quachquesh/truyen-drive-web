# Kiến trúc

Truyện Drive là **SPA thuần client**: không backend, không database riêng — mọi dữ liệu hoặc nằm trên thiết bị (IndexedDB) hoặc nằm sẵn trên Google Drive của người dùng. Trình duyệt gọi thẳng Drive API bằng token OAuth trong phiên.

```
┌────────────────────────── Trình duyệt ──────────────────────────┐
│                                                                  │
│  Vue app (Pinia stores)                                          │
│    │  đọc/ghi                                                    │
│    ▼                                                             │
│  IndexedDB (idb)          Google Identity Services (đăng nhập)   │
│    libraries, cache,             │ token (chỉ trong memory)      │
│    blobs, progress,              ▼                               │
│    folderTypes, tombstones   Google Drive API (axios)            │
│                                  │ files.list / files.get        │
│                                  ▼                               │
│                            appDataFolder (đồng bộ đa thiết bị)   │
└──────────────────────────────────────────────────────────────────┘
```

## Cây mã nguồn

```
src/
├── lib/
│   ├── googleAuth.ts     # GIS token client: silent refresh, supersede request cũ
│   ├── tokenBox.ts       # token trong memory (không đụng localStorage)
│   ├── driveApi.ts       # axios + interceptors (401 → refresh token, 403/429/5xx → backoff)
│   │                     # + listChildrenGrouped: batch nhiều folder cha trong 1 query (chống N+1,
│   │                     #   chunk chạy song song) + listNewChildren: lọc phần mới hơn mốc thời gian
│   ├── scanner.ts        # listStories (1 request) + walkLibrary (quét hợp nhất 1 lượt)
│   │                     # + fetchNewChapters (incremental) + ensureChapterFiles lazy
│   ├── db.ts             # IndexedDB (idb): libraries/cache/blobs/progress/folderTypes/tombstones
│   ├── sync.ts           # đồng bộ đa thiết bị: snapshot → merge last-write-wins → apply
│   ├── blobCache.ts      # blob ảnh/PDF: IDB trước, miss thì tải từ Drive
│   ├── pdfDoc.ts         # wrapper pdf.js: mở document + render trang theo cuộn
│   ├── naturalSort.ts    # sort "tự nhiên" (2 < 10)
│   ├── storySort.ts      # sort truyện theo tên / mới cập nhật
│   ├── concurrency.ts    # pooledMap giới hạn request song song (DRIVE_CONCURRENCY = 6)
│   ├── folderUrl.ts      # parse URL/ID folder Drive
│   └── gis.d.ts          # type cho Google Identity Services
├── stores/               # Pinia: auth / library / stories / sync
├── pages/                # Login / Library / Folder / Story / Reader / Settings
│                         # + Privacy / Terms / Guide (public, không cần đăng nhập)
├── components/           # AppHeader, AppIcon, DriveFolderPicker, LibraryModal,
│                         # StoryCard, ReaderImage, PdfPage, PdfReader, StaticShell
└── router/index.ts       # route + auth guard (meta.public bỏ qua guard)
```

## Luồng chính

### Đăng nhập & token

1. `main.ts` mount app; router guard (`router.beforeEach`) gọi `auth.boot()` với mọi route không public.
2. `googleAuth.ts` nạp script GIS, tạo token client với 2 scope `drive.readonly` + `drive.appdata`.
3. Token nhận được nằm trong `tokenBox.ts` (biến memory). **Không bao giờ ghi xuống localStorage** — refresh trang là mất, guard đưa về trang login để người dùng bấm nút xin lại (login-hint email lưu ở localStorage giúp Google chọn đúng tài khoản). Không tự xin token ngầm khi tải trang; trong phiên, token sắp hết hạn/401 thì axios interceptor mới silent re-mint.
4. Mọi request Drive qua `driveApi.ts`: interceptor 401 → thử refresh token 1 lần; 403/429/5xx → backoff lũy tiến rồi retry.

### Mở kho & quét (hợp nhất 1 lượt + incremental)

1. **Bước 1 — danh sách truyện**: mở kho/làm mới gọi đúng 1 `files.list` folder con của kho (`listStories`) → card hiện ngay, không chờ quét sâu. "Làm mới" giữ danh sách cũ trên màn hình trong lúc tải. FolderPage mở folder bên trong kho qua cùng một luồng (`openFolder` → `openListing`, cache key `folder:<folderId>`) — vào lại folder ≈ 0 request, Làm mới trong folder cũng incremental.
2. **Bước 2 — quét hợp nhất** (`walkLibrary`, chỉ chạy khi lạnh/force): một lượt BFS duy nhất vừa tính `lastModified` cho MỌI truyện (= max ngày folder + con trực tiếp), vừa lấy chapter của các folder được USER đánh dấu **truyện** (folder đánh dấu **nhóm** đưa con lên cùng cấp). Không folder nào bị list 2 lần; ngày/chapter đổ về UI tiến triển sau từng tầng.
3. **Warm path — incremental**: khi đã có cache, mở kho 0 request danh sách; truyện đánh dấu có cache cũ hơn `lastModified` thì `fetchNewChapters` gọi `listNewChildren` với điều kiện `modifiedTime > '<mốc mới nhất trong cache>'` — server chỉ trả phần mới, merge vào cache (1 request/truyện). Không phát hiện chapter bị xóa — bấm Làm mới để quét full.
4. **Làm mới (force) — incremental**: có cache ngày là chỉ lấy phần thay đổi kể từ mốc cũ (`refreshStoryDates`, sort theo mốc rồi chunk 24 cha/request) + 1 request lấy lại danh sách kho (phát hiện truyện mới/xóa ở cấp kho); truyện mới xuất hiện được quét full riêng. Quét lại toàn bộ tuyệt đối: "Xóa danh sách đã lưu" trong Cài đặt.
5. `listChildrenGrouped` gộp nhiều folder cha vào 1 query bằng `'<id1>' in parents or '<id2>' in parents …` (chunk 12 cha — mỗi chunk ~1000 con gói 1 trang, hết chuỗi phân trang tuần tự; chạy song song 6 luồng) — cả tầng chỉ ~vài request thay vì N request mỗi folder.
6. Kết quả đánh dấu lưu IndexedDB (`folderTypes`) kèm tombstone khi bỏ đánh dấu.
7. Danh sách **file** của chapter chỉ được tải khi mở chapter đọc lần đầu (`ensureChapterFiles`), rồi cache vào IndexedDB.

### Đọc

- Ảnh: `ReaderImage` lazy-load theo cuộn + prefetch vài ảnh kế tiếp; blob qua `blobCache.ts` (IndexedDB trước, miss mới tải).
- PDF: `pdfDoc.ts` + `PdfReader` render trang pdf.js theo cuộn.
- Tiến độ đọc (chapter + vị trí cuộn) lưu IndexedDB (`progress`), đẩy live vào store để card truyện hiện "Đang đọc x/y".

### Đồng bộ đa thiết bị

- Dữ liệu đồng bộ: tiến độ đọc, danh sách kho + kho đang chọn, đánh dấu truyện/nhóm.
- Nơi lưu: `appDataFolder` — thư mục ẩn gắn với tài khoản Google, chỉ app này đọc được, không hiện trong My Drive.
- Cơ chế: pull mỗi khi mở trang/tab hiện lại → push debounce ~15s sau mỗi thay đổi. Merge theo **last-write-wins** trên từng khóa; xóa dùng tombstone để không "hồi sinh" từ máy khác.

## Giới hạn Drive API & cách ứng phó

Drive giới hạn ~12 request/giây/user. Vì vậy:

- Listing chạy qua `pooledMap` giới hạn `DRIVE_CONCURRENCY = 6` request song song (đo thực tế ~4–5 req/s); số request còn được giảm bằng batch nhiều cha + incremental theo `modifiedTime`.
- Bị 403/429 thì backoff lũy tiến rồi retry tự động.
- Mọi kết quả list được cache IndexedDB — chỉ lần đầu quét là tốn request; các lần sau chỉ lấy phần mới hơn mốc cache.

## Testing

- `src/lib/__tests__/`: unit test cho các module lõi (scanner, driveApi, sync, sort, folderUrl, concurrency).
- `src/stores/__tests__/`: test store Pinia (stories).
- `src/__tests__/`: component test (hiện có test smoke cho các trang tĩnh).

```bash
bun run test:unit   # vitest
bun run lint        # oxlint + eslint
bun run build       # vue-tsc type-check + vite build (chạy song song)
```
