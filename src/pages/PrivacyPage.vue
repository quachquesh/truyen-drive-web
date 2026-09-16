<script setup lang="ts">
import StaticShell from '@/components/StaticShell.vue'

// Ngày cập nhật chính sách — sửa mỗi lần đổi nội dung
const LAST_UPDATED = '16/09/2026'
</script>

<template>
  <StaticShell>
    <article class="legal">
      <h1>Chính sách bảo mật</h1>
      <p class="updated">Cập nhật lần cuối: {{ LAST_UPDATED }}</p>

      <p>
        <strong>Truyện Drive</strong> là ứng dụng web mã nguồn mở chạy hoàn toàn trong trình duyệt
        của bạn — không có server riêng, không có database riêng. Chính sách này giải thích rõ ứng
        dụng truy cập những gì, lưu những gì ở đâu, và cách bạn kiểm soát.
      </p>

      <h2>1. Ứng dụng truy cập gì trên Google Drive của bạn</h2>
      <p>Khi đăng nhập bằng Google, ứng dụng xin 2 quyền:</p>
      <ul>
        <li>
          <strong>Xem file trên Drive</strong> (<code>drive.readonly</code>) — chỉ đọc. Ứng dụng
          dùng quyền này để liệt kê thư mục và tải ảnh/PDF của những folder bạn chọn làm kho truyện,
          cùng kết quả tìm kiếm folder khi bạn chọn kho. Ứng dụng không tạo, sửa hay xóa file truyện
          của bạn.
        </li>
        <li>
          <strong>Lưu dữ liệu của ứng dụng</strong> (<code>drive.appdata</code>) — ghi vào
          <code>appDataFolder</code>, một thư mục ẩn riêng của ứng dụng trên Drive của bạn (không
          hiện trong My Drive, chỉ ứng dụng này đọc được). Nơi này lưu tiến độ đọc, danh sách kho và
          đánh dấu truyện/nhóm để đồng bộ giữa các thiết bị của bạn.
        </li>
      </ul>

      <h2>2. Dữ liệu lưu trên thiết bị của bạn</h2>
      <p>Ứng dụng lưu trong trình duyệt (IndexedDB và localStorage) các thứ sau:</p>
      <ul>
        <li>Cache danh sách truyện/chapter, blob ảnh/PDF đã đọc — để lần sau mở không tốn mạng</li>
        <li>Tiến độ đọc và đánh dấu truyện/nhóm</li>
        <li>Email đăng nhập gần nhất (login hint) — để Google tự chọn đúng tài khoản lần sau</li>
      </ul>
      <p>
        Dữ liệu này nằm ngay trên thiết bị, không gửi đi đâu trừ phần đồng bộ nói ở mục 1. Bạn xóa
        bất cứ lúc nào trong <strong>Cài đặt → Dữ liệu lưu trên thiết bị</strong> (xóa từng loại
        hoặc đặt lại toàn bộ ứng dụng).
      </p>

      <h2>3. Mà ứng dụng KHÔNG thu thập</h2>
      <ul>
        <li>Token đăng nhập <strong>không lưu trên thiết bị</strong> — chỉ nằm trong bộ nhớ của tab, đóng tab là hết</li>
        <li>Không analytics, không số liệu sử dụng, không quảng cáo, không theo dõi</li>
        <li>Không server trung gian — trình duyệt của bạn nói chuyện trực tiếp với Google Drive API</li>
      </ul>

      <h2>4. Bên thứ ba</h2>
      <p>
        Ứng dụng chỉ kết nối tới <strong>Google</strong> (đăng nhập Google Identity Services và
        Google Drive API). Không bên thứ ba nào khác nhận dữ liệu của bạn. Việc Google xử lý dữ liệu
        như thế nào được điều chỉnh bởi
        <a href="https://policies.google.com/privacy" target="_blank" rel="noopener"
          >Chính sách bảo mật của Google</a
        >.
      </p>

      <h2>5. Cách thu hồi quyền và xóa dữ liệu</h2>
      <ul>
        <li>
          Thu hồi quyền truy cập Drive: vào
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener"
            >Tài khoản Google → Quyền của bên thứ ba</a
          >, chọn ứng dụng và bấm "Xóa quyền truy cập".
        </li>
        <li>
          Xóa dữ liệu trên thiết bị: <strong>Cài đặt → Dữ liệu lưu trên thiết bị</strong> → các nút
          xóa hoặc "Đặt lại ứng dụng".
        </li>
        <li>
          Xóa tiến độ đọc trong Cài đặt cũng ghi mốc xóa để các thiết bị khác đang đồng bộ tự xóa
          theo.
        </li>
      </ul>

      <h2>6. Thay đổi chính sách</h2>
      <p>
        Nếu chính sách thay đổi, phiên bản mới được công bố tại trang này (kèm ngày cập nhật đầu
        trang) và thông báo trên
        <a
          href="https://github.com/quachquesh/truyen-drive-web"
          target="_blank"
          rel="noopener"
          >kho mã nguồn</a
        >.
      </p>

      <h2>7. Liên hệ</h2>
      <p>
        Câu hỏi về quyền riêng tư — mở issue tại
        <a
          href="https://github.com/quachquesh/truyen-drive-web/issues"
          target="_blank"
          rel="noopener"
          >github.com/quachquesh/truyen-drive-web/issues</a
        >.
      </p>
    </article>
  </StaticShell>
</template>

<style scoped>
.legal {
  line-height: 1.7;
}

.legal h1 {
  margin: 0 0 4px;
  font-size: 26px;
}

.legal .updated {
  color: var(--tdw-text-muted);
  font-size: 13px;
  margin: 0 0 20px;
}

.legal h2 {
  margin: 28px 0 8px;
  font-size: 17px;
}

.legal p {
  margin: 8px 0;
}

.legal ul {
  margin: 8px 0;
  padding-left: 22px;
}

.legal li {
  margin: 4px 0;
}

.legal code {
  font-family: ui-monospace, 'Cascadia Code', 'Segoe UI Mono', Menlo, Consolas, monospace;
  font-size: 0.9em;
  background: var(--tdw-bg-soft);
  padding: 1px 5px;
  border-radius: 4px;
}

.legal a {
  color: var(--tdw-primary);
}
</style>
