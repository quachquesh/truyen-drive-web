# Changelog

Các thay đổi đáng chú ý của project được ghi ở file này theo format [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/) và versioning [Semantic Versioning](https://semver.org/lang/vi/).

## [Unreleased]

## [1.0.0] — 2026-09-16

Bản phát hành chính thức đầu tiên.

### Added

- Viết lại README + tài liệu chi tiết trong `docs/` (OAuth, cấu trúc Drive, kiến trúc, deploy Cloudflare Pages)
- Trang **Chính sách bảo mật** (`/privacy`), **Điều khoản sử dụng** (`/terms`), **Hướng dẫn sử dụng** (`/guide`) — public, không cần đăng nhập
- Issue templates (bug report, feature request)
- Logo + favicon riêng cho app
- Đánh dấu folder là **"danh sách nhiều truyện"** tách khỏi kiểu "nhóm chapter" — trang thư mục và card hiện đúng nhãn ("Danh sách truyện" / "Nhóm chapter") thay vì "Chưa phân loại" sau khi đã phân loại

### Fixed

- Layout mobile: toolbar reader (nút icon-only, ô nhảy chương co giãn), tiêu đề trang truyện, card trong kho
- Card truyện không căn cạnh đáy trong cùng hàng grid do selector CSS nhầm class content của naive-ui (`n-card-content` thay vì `n-card__content`)

## [0.1.0] — 2026-09-16

Bản đầu tiên đánh số phiên bản — tổng hợp toàn bộ tính năng từ lúc bắt đầu project.

### Added

- Đăng nhập Google (GIS, implicit flow) — token chỉ nằm trong memory, tự khôi phục phiên khi mở lại trang
- Quản lý nhiều kho truyện: chọn folder trực tiếp từ Drive (duyệt "Đã chia sẻ với tôi" / My Drive, tìm theo tên trên toàn bộ Drive) hoặc dán URL/ID
- Người dùng tự quyết định cấu trúc: đánh dấu folder là truyện / nhóm chapter, duyệt folder "danh sách truyện" lồng sâu — đánh dấu lưu vĩnh viễn trong IndexedDB
- Đọc ảnh (lazy-load + prefetch) và PDF (pdf.js) trong cùng reader; nút chuyển Ảnh/PDF cho chapter có cả hai, ghi nhớ lựa chọn
- Ô nhảy nhanh tới chương bất kỳ ngay trong reader
- Tiến độ đọc: khôi phục vị trí cuộn, nút "Tiếp tục đọc", card truyện hiện "Đang đọc x/y" (đồng bộ live giữa các tab)
- Đồng bộ đa thiết bị qua Drive `appDataFolder`: tiến độ, danh sách kho, đánh dấu — last-write-wins, tombstone khi xóa
- Cache IndexedDB toàn bộ (danh sách, file, blob ảnh/PDF, tiến độ) + nút xóa từng loại và đặt lại toàn bộ app trong Cài đặt
- Chống rate-limit Drive: batch query, semaphore 4 request, backoff 403/429 tự động
- Fallback preview ~2048px cho kho bật "Viewers can't download"
- Tìm kiếm truyện không cần dấu; sắp xếp theo tên / mới cập nhật
- Dark/light mode, UI tiếng Việt, responsive cho điện thoại

### Fixed

- Reader PDF không render do Vue reactive bao instance pdf.js (dùng `shallowRef`)
- Guard tạo store IndexedDB trong lúc upgrade database; thêm chế độ đặt lại DB từ đầu
