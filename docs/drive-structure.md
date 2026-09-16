# Cấu trúc thư mục Drive

Truyện Drive **không tự suy đoán** cấu trúc kho — bạn (người dùng) quyết định folder nào là truyện, folder nào là nhóm chapter ngay trong app. Tuy nhiên app có vài quy ước để việc đọc được mượt:

## Quy ước cơ bản

- Mỗi **kho truyện** là 1 folder gốc (do bạn chọn khi thêm kho).
- Mỗi **truyện** là 1 folder con của kho.
- Mỗi **chapter** là:
  - 1 folder chứa **ảnh** — sắp xếp theo tên file bằng sort tự nhiên (`2 < 10 < 100`), hoặc
  - 1 file **PDF** duy nhất.
- Chapter có thể nằm trực tiếp trong folder truyện, hoặc nhóm trong các **folder trung gian** (`0-30/`, `Season 2/`...) — lồng bao nhiêu tầng cũng được, chỉ cần đánh dấu "Nhóm" cho từng tầng trong app.

## Ví dụ một kho

```
Kho truyện/
├── One Piece/                  ← truyện (đánh dấu "Đọc truyện")
│   ├── 1010/
│   │   ├── 001.jpg
│   │   ├── 002.jpg
│   │   └── …
│   ├── 1011.pdf                ← chapter dạng PDF
│   └── 0-100/                  ← nhóm chapter (đánh dấu "Nhóm")
│       ├── 1/
│       ├── 2/
│       └── …
├── Drop truyện/                ← folder "danh sách truyện" (không cần đánh dấu,
│   ├── Truyện A/                  bấm vào là xem bên trong)
│   └── Truyện B/
└── Truyện lẻ/                  ← truyện nằm ngay trong kho cũng được
    ├── 1/
    └── 2/
```

## Quy tắc app áp dụng khi đọc

| Quy tắc | Ý nghĩa |
| --- | --- |
| Sort tự nhiên | Ảnh trong chapter và tên chapter đều sort kiểu "tự nhiên": `2 < 10 < 100`, không phải alphabet (`10 < 2`). Đặt tên file `001.jpg, 002.jpg…` hay `1.jpg, 2.jpg…` đều đúng thứ tự. |
| Quét chapter 1 cấp | Danh sách chapter = các folder con trực tiếp của truyện. Folder trung gian hiện thành 1 dòng, bấm "Nhóm" để đưa chapter bên trong lên cùng cấp. |
| Ảnh + PDF trộn lẫn | Chapter có cả ảnh lẫn PDF: dùng nút chuyển **Ảnh / PDF** trên toolbar reader (lựa chọn được ghi nhớ cho chapter đó). |
| Không auto-detect | Mở kho lần đầu chỉ liệt kê folder. Đánh dấu "Đọc truyện" cho folder nào là truyện — đánh dấu lưu vĩnh viễn trong IndexedDB và đồng bộ qua Drive nếu bật đồng bộ. |

## Chia sẻ kho cho người khác đọc

1. Thêm Gmail người đọc vào **Test users** của OAuth consent screen (xem [setup-google-oauth.md](setup-google-oauth.md)) — mỗi người tự tạo client ID riêng thì không cần, chỉ cần cùng dùng một client ID thì mới cần.
2. Chia sẻ folder kho trên Drive với quyền **Viewer**.
3. Người đọc đăng nhập app bằng Google → thêm kho bằng cách dán URL folder (hoặc duyệt "Đã chia sẻ với tôi" trong ô chọn folder).

Nếu kho bật cài đặt **"Viewers can't download"**, người đọc vẫn xem được bình thường — app tự chuyển sang bản preview do Google render (~2048px). Chi tiết ở phần Khắc phục sự cố của [README](../README.md).
