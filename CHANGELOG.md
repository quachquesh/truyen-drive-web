# Changelog

Các thay đổi đáng chú ý của project được ghi ở file này theo format [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/) và versioning [Semantic Versioning](https://semver.org/lang/vi/).

## [Unreleased]

## [1.2.2] — 2026-09-19

### Fixed

- Ngày cập nhật trên card sai sau khi đánh dấu nhóm chapter
- Làm mới không phát hiện chap mới thêm vào bên trong nhóm chapter
- Folder nhóm bị đổi tên gây quét incremental lặp mãi mỗi lần vào trang
- Trộn tên "CHAP x" lẫn số thuần làm hiện sai "mới nhất" (collation dồn CHAP xuống cuối) — giờ sort theo số trong tên; cache cũ tự sort lại khi đọc, không cần migration

### Changed

- Ngày cập nhật tính theo ngày các chapter hiện có, bỏ ngày folder truyện (nhiễu khi đổi tên/đổi quyền)

## [1.2.1] — 2026-09-19

### Fixed

- Ngày cập nhật trên card không vẽ lại sau khi bấm Làm mới
- Làm mới tính cả ngày folder truyện bị sửa trực tiếp (đổi tên...)

## [1.2.0] — 2026-09-18

### Added

- Banner "Tiếp tục đọc" đầu trang kho — 1 chạm vào đúng vị trí đang đọc, tự nhảy số khi sync từ máy khác
- Vệt vị trí cuộn + nút phát nhấp nháy nhẹ dưới banner

## [1.1.0] — 2026-09-18

### Added

- Nút "Hủy nhóm (N)" — hủy tất cả nhóm chapter của truyện trong 1 lần
- Tab trình duyệt hiện tên truyện đang đọc

### Changed

- (Bỏ) đánh dấu nhóm chỉ xóa cache đúng truyện chứa nó (~7 → ~5 request Drive mỗi lần)

### Fixed

- Dòng "Đang đọc" trên card biến mất sau khi cập nhật (cache chapter đổi định dạng)

## [1.0.3] — 2026-09-18

### Changed

- Card hiện tên chương đang đọc kèm số thứ tự ("Chương 11 (11/12)")
- Số "đang đọc x/y" tính theo danh sách chapter hiện tại, không lệch khi đánh dấu nhóm/chap mới
- Hover card truyện (desktop)

### Fixed

- Nút Làm mới trang truyện không quét lại được (lỗi tham số)
- Số chương / chương mới nhất không cập nhật khi chủ kho thêm chương
- Đánh dấu nhóm giữa chừng quét không còn bị kết quả cũ ghi đè

## [1.0.2] — 2026-09-17

### Changed

- Ngày trên card là "ngày cập nhật gần nhất" tính cả chap mới; sort "Mới cập nhật" theo ngày này
- Danh sách chapter hiện ngày dưới tên từng chương
- Trang thư mục cũng tính ngày cập nhật từ nội dung bên trong
- Tự quét lại 1 lần sau cập nhật (cache cũ thiếu ngày)

## [1.0.1] — 2026-09-17

### Changed

- Bỏ tự động đăng nhập ngầm — mỗi phiên bắt đầu ở trang đăng nhập
- Cảnh báo minh bạch riêng tư cho người dùng lần đầu
- Cập nhật Hướng dẫn, Cài đặt, README, `docs/architecture.md`

## [1.0.0] — 2026-09-16

Bản phát hành chính thức đầu tiên.

### Added

- Docs đầy đủ (README, OAuth, kiến trúc, deploy Cloudflare Pages)
- Trang Chính sách bảo mật / Điều khoản / Hướng dẫn (public)
- Issue templates, logo + favicon
- Đánh dấu folder "danh sách nhiều truyện" tách khỏi "nhóm chapter"

### Fixed

- Layout mobile (toolbar reader, tiêu đề trang truyện, card)
- Card không căn cạnh đáy trong grid (sai selector naive-ui)

## [0.1.0] — 2026-09-16

Bản đầu tiên đánh số phiên bản — tổng hợp toàn bộ tính năng từ lúc bắt đầu project.

### Added

- Đăng nhập Google (GIS) — token chỉ nằm trong memory
- Quản lý nhiều kho: chọn folder trên Drive hoặc dán URL/ID
- Tự phân loại cấu trúc: đánh dấu truyện / nhóm / danh sách, lưu vĩnh viễn
- Reader ảnh (lazy-load) + PDF (pdf.js) trong cùng giao diện, ghi nhớ lựa chọn
- Ô nhảy nhanh tới chương bất kỳ
- Tiến độ đọc + nút "Tiếp tục đọc", đồng bộ live giữa các tab
- Đồng bộ đa thiết bị qua Drive `appDataFolder` (last-write-wins, tombstone)
- Cache IndexedDB toàn bộ + nút xóa trong Cài đặt
- Chống rate-limit Drive (batch, semaphore 4, backoff 403/429)
- Fallback preview ~2048px cho kho bật "Viewers can't download"
- Tìm kiếm không dấu; sắp xếp theo tên / mới cập nhật
- Dark/light mode, UI tiếng Việt, responsive

### Fixed

- PDF không render do Vue reactive bao instance pdf.js (dùng `shallowRef`)
- Guard tạo store IndexedDB trong lúc upgrade database