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
│   │                     # + listChildrenGrouped: batch nhiều folder cha trong 1 query (chống N+1)
│   ├── scanner.ts        # quét BFS theo tầng, chỉ list folder + ensureChapterFiles lazy
│   ├── db.ts             # IndexedDB (idb): libraries/cache/blobs/progress/folderTypes/tombstones
│   ├── sync.ts           # đồng bộ đa thiết bị: snapshot → merge last-write-wins → apply
│   ├── blobCache.ts      # blob ảnh/PDF: IDB trước, miss thì tải từ Drive
│   ├── pdfDoc.ts         # wrapper pdf.js: mở document + render trang theo cuộn
│   ├── naturalSort.ts    # sort "tự nhiên" (2 < 10)
│   ├── storySort.ts      # sort truyện theo tên / mới cập nhật
│   ├── concurrency.ts    # semaphore giới hạn request song song
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
3. Token nhận được nằm trong `tokenBox.ts` (biến memory). **Không bao giờ ghi xuống localStorage** — refresh trang là mất, app tự xin lại silent (dùng login-hint email lưu ở localStorage để Google chọn đúng tài khoản).
4. Mọi request Drive qua `driveApi.ts`: interceptor 401 → thử refresh token 1 lần; 403/429/5xx → backoff lũy tiến rồi retry.

### Quét kho (lazy từng tầng)

1. Mở kho chỉ gọi `files.list` các **folder** con (không đụng tới file).
2. `listChildrenGrouped` gộp nhiều folder cha vào 1 query bằng điều kiện `'<id1>' in parents or '<id2>' in parents …` — cả tầng chỉ ~vài request thay vì N request mỗi folder.
3. Người dùng đánh dấu folder là **truyện** → `scanner.ts` quét 1 cấp con (chapter); folder trung gian được đánh dấu **nhóm** để đưa chapter lên cùng cấp. Kết quả đánh dấu lưu IndexedDB (`folderTypes`) kèm tombstone khi bỏ đánh dấu.
4. Danh sách **file** của chapter chỉ được tải khi mở chapter đọc lần đầu (`ensureChapterFiles`), rồi cache vào IndexedDB.

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

- Scanner chạy qua `semaphore(4)` (tối đa 4 request song song).
- Bị 403/429 thì backoff lũy tiến rồi retry tự động.
- Mọi kết quả list được cache IndexedDB — chỉ lần đầu quét là tốn request.

## Testing

- `src/lib/__tests__/`: unit test cho các module lõi (scanner, driveApi, sync, sort, folderUrl, concurrency).
- `src/stores/__tests__/`: test store Pinia (stories).
- `src/__tests__/`: component test (hiện có test smoke cho các trang tĩnh).

```bash
bun run test:unit   # vitest
bun run lint        # oxlint + eslint
bun run build       # vue-tsc type-check + vite build (chạy song song)
```
