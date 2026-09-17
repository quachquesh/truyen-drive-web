# Changelog

Các thay đổi đáng chú ý của project được ghi ở file này theo format [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/) và versioning [Semantic Versioning](https://semver.org/lang/vi/).

## [Unreleased]

## [1.0.3] — 2026-09-18

### Changed

- Card truyện hiện cả tên chương đang đọc kèm số thứ tự — "Đang đọc: Chương 11 (11/12)" thay vì chỉ "45/100"
- Số "đang đọc x/y" ở nút "Tiếp tục" và card truyện luôn tính theo danh sách chapter hiện tại thay vì số ghi lại lúc đọc — đánh dấu nhóm chapter (vd 3 → 12 chương) hay chương mới được thêm không còn làm sai lệch vị trí
- Card truyện có hiệu ứng nâng nhẹ khi rê chuột (chỉ desktop, không kẹt trạng thái hover khi chạm trên điện thoại)

### Fixed

- Nút "Làm mới" trang truyện không quét lại được chapter do lỗi truyền tham số; phân loại lại truyện giờ luôn quét tươi ghi đè snapshot cũ
- Chủ kho thêm chương mới nhưng số chương / chương mới nhất trên card không cập nhật — cache cũ hơn ngày cập nhật của truyện được tự quét lại, kể cả khi vào truyện từ trang thư mục
- Đánh dấu nhóm chapter trong lúc app đang quét không còn để kết quả quét cũ ghi đè số chương về danh sách trước khi đánh dấu

## [1.0.2] — 2026-09-17

### Changed

- Ngày trên card truyện giờ là "ngày cập nhật gần nhất" tính cả chap mới bên trong (Drive không đổi ngày folder cha khi thêm con nên trước đó ngày đứng yên dù đã up chap); sắp xếp "Mới cập nhật" theo ngày này, kể cả chapter nằm trong folder nhóm đã đánh dấu
- Danh sách chapter hiện ngày (dd/MM/yyyy) ngay dưới tên từng chapter
- Trang thư mục (vd folder "danh sách truyện") cũng tính ngày cập nhật từ nội dung bên trong
- Lần mở đầu tiên sau khi cập nhật, app tự quét lại danh sách 1 lần để lấy ngày mới (cache cũ thiếu dữ liệu)

## [1.0.1] — 2026-09-17

### Changed

- Bỏ tự động đăng nhập ngầm khi mở trang — mỗi phiên bắt đầu ở trang đăng nhập, bấm nút 1 cái là vào lại (Google không hỏi cấp quyền lại); trong phiên vẫn tự gia hạn token như cũ
- Cảnh báo "Minh bạch về quyền riêng tư" trên trang đăng nhập, chỉ hiện với người dùng lần đầu: app chạy hoàn toàn trên trình duyệt, không thu thập dữ liệu, mã nguồn công khai trên GitHub
- Cập nhật Hướng dẫn, Cài đặt, README và `docs/architecture.md` theo luồng đăng nhập mới

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
