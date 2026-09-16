<script setup lang="ts">
import StaticShell from '@/components/StaticShell.vue'

// Ngày cập nhật điều khoản — sửa mỗi lần đổi nội dung
const LAST_UPDATED = '16/09/2026'
</script>

<template>
  <StaticShell>
    <article class="legal">
      <h1>Điều khoản sử dụng</h1>
      <p class="updated">Cập nhật lần cuối: {{ LAST_UPDATED }}</p>

      <p>
        Chào mừng bạn đến với <strong>Truyện Drive</strong>. Khi sử dụng ứng dụng, bạn đồng ý với
        các điều khoản dưới đây.
      </p>

      <h2>1. Dịch vụ là gì</h2>
      <p>
        Truyện Drive là ứng dụng web giúp bạn đọc truyện tranh từ các thư mục Google Drive
        <em>của chính bạn hoặc được chia sẻ cho bạn</em>. Ứng dụng chạy hoàn toàn trong trình duyệt,
        không có server riêng và không lưu trữ nội dung nào.
      </p>

      <h2>2. Tài khoản & nội dung</h2>
      <ul>
        <li>
          Bạn dùng tài khoản Google của mình và chịu trách nhiệm về việc tuân thủ điều khoản của
          Google.
        </li>
        <li>
          <strong
            >Ứng dụng không cung cấp, lưu trữ hay phân phối bất kỳ nội dung truyện nào.</strong
          >
          Mọi truyện bạn đọc đều do bạn (hoặc người chia sẻ cho bạn) tự tải lên Drive và nằm trong
          Drive của họ.
        </li>
        <li>
          Bạn cam kết có quyền hợp pháp đối với nội dung mình lưu trữ và truy cập (bao gồm quyền tác
          giả) và chịu trách nhiệm về nội dung đó — ứng dụng không kiểm duyệt được thư mục Drive của
          bạn.
        </li>
      </ul>

      <h2>3. Sử dụng hợp lý</h2>
      <p>
        Ứng dụng gọi Google Drive API trong giới hạn mà Google cho phép. Đừng cố tình lách giới hạn
        tần suất, dùng ứng dụng cho mục đích trái pháp luật, hoặc truy cập nội dung bạn không có
        quyền.
      </p>

      <h2>4. Không bảo đảm</h2>
      <p>
        Ứng dụng được cung cấp "nguyên trạng" theo khả năng tốt nhất của người phát triển, kèm giấy
        phép mã nguồn mở MIT. Không có bảo đảm về tính liên tục, không lỗi, hoặc tính phù hợp với
        mọi mục đích. Tính khả dụng còn phụ thuộc vào Google Drive — khi Drive gián đoạn hoặc đổi
        chính sách API, ứng dụng có thể tạm không dùng được.
      </p>

      <h2>5. Giới hạn trách nhiệm</h2>
      <p>
        Người phát triển không chịu trách nhiệm về bất kỳ thiệt hại nào phát sinh từ việc sử dụng
        hoặc không thể sử dụng ứng dụng — bao gồm mất dữ liệu, mất tiến độ đọc, hoặc gián đoạn truy
        cập Drive. Dữ liệu quan trọng (thư mục truyện trên Drive) do bạn tự quản lý và sao lưu.
      </p>

      <h2>6. Thay đổi điều khoản</h2>
      <p>
        Điều khoản có thể được cập nhật theo sự phát triển của ứng dụng. Phiên bản mới có hiệu lực
        ngay khi đăng tại trang này (xem ngày cập nhật đầu trang) và được thông báo trên
        <a href="https://github.com/quachquesh/truyen-drive-web" target="_blank" rel="noopener"
          >kho mã nguồn</a
        >.
      </p>

      <h2>7. Mã nguồn & liên hệ</h2>
      <p>
        Truyện Drive là phần mềm mã nguồn mở dưới giấy phép
        <a
          href="https://github.com/quachquesh/truyen-drive-web/blob/main/LICENSE"
          target="_blank"
          rel="noopener"
          >MIT</a
        >. Báo lỗi, đề xuất tính năng và câu hỏi — mở issue tại
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

.legal a {
  color: var(--tdw-primary);
}
</style>
