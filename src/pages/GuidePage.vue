<script setup lang="ts">
import { NCard } from 'naive-ui'

import StaticShell from '@/components/StaticShell.vue'

const sections = [
  { id: 'bat-dau', title: 'Đăng nhập lần đầu' },
  { id: 'them-kho', title: 'Thêm kho truyện' },
  { id: 'to-chuc', title: 'Tổ chức thư mục trên Drive' },
  { id: 'danh-dau', title: 'Đánh dấu truyện & duyệt thư mục' },
  { id: 'doc', title: 'Đọc truyện' },
  { id: 'dong-bo', title: 'Đọc trên nhiều thiết bị' },
  { id: 'tim-kiem', title: 'Tìm kiếm & sắp xếp' },
  { id: 'cache', title: 'Ảnh đã lưu & dung lượng' },
  { id: 'su-co', title: 'Sự cố thường gặp' },
] as const
</script>

<template>
  <StaticShell>
    <div class="guide-page">
      <h1>Hướng dẫn sử dụng</h1>
      <p class="intro">
        Truyện Drive đọc truyện từ thư mục Google Drive của bạn. Bài viết này đi từng bước — từ đăng
        nhập đến đọc trên nhiều thiết bị.
      </p>

      <nav class="toc" aria-label="Mục lục">
        <ol>
          <li v-for="s in sections" :key="s.id">
            <a :href="'#' + s.id">{{ s.title }}</a>
          </li>
        </ol>
      </nav>

      <NCard id="bat-dau" title="1. Đăng nhập lần đầu" size="small" class="section">
        <p>
          Bấm <strong>“Đăng nhập bằng Google”</strong>, chọn tài khoản Google chứa (hoặc được chia
          sẻ) kho truyện, rồi đồng ý 2 quyền: <em>xem file trên Drive</em> và
          <em>lưu dữ liệu của ứng dụng</em> (để đồng bộ tiến độ đọc).
        </p>
        <p>
          Thấy bảng cảnh báo <strong>“Google chưa xác minh ứng dụng này”</strong>? — bình thường.
          Đây là ứng dụng cá nhân tự tạo trong Google Cloud Console, không qua quy trình xác minh
          của Google (quy trình đó chỉ dành cho ứng dụng công khai có nhiều người dùng); email nhà
          phát triển hiển thị trong cảnh báo chính là chủ ứng dụng. Ứng dụng chỉ xin
          <em>xem file trên Drive</em> (chỉ đọc) và <em>lưu dữ liệu đồng bộ</em> — không đụng tới
          thứ khác trong tài khoản của bạn. Cách tiếp tục:
        </p>
        <ul>
          <li>Trong bảng cảnh báo, bấm <strong>Nâng cao</strong>.</li>
          <li>
            Chọn dòng <strong>“Đi đến … (không an toàn)”</strong> rồi cấp quyền như bình thường.
          </li>
        </ul>
        <p>
          Các lần sau mở trang, ứng dụng tự kết nối lại với Google — bạn vào thẳng thư viện mà không
          cần bấm gì. Token đăng nhập không lưu trên máy, nên đôi khi trình duyệt yêu cầu xác nhận
          lại — khi đó chỉ cần bấm nút đăng nhập <strong>một cái là vào lại</strong> (Google không
          hỏi cấp quyền lại). Xem thêm phần <a href="#su-co">Sự cố thường gặp</a> nếu phải bấm quá
          thường xuyên.
        </p>
      </NCard>

      <NCard id="them-kho" title="2. Thêm kho truyện" size="small" class="section">
        <p>
          <strong>Kho truyện</strong> = một thư mục trên Drive chứa các folder truyện. Thêm kho bằng
          2 cách:
        </p>
        <ul>
          <li>
            <strong>Chọn trực tiếp từ Drive</strong>: duyệt “My Drive” hoặc “Đã chia sẻ với tôi”,
            hoặc gõ tên folder vào ô tìm kiếm (tìm trên toàn bộ Drive của bạn).
          </li>
          <li><strong>Dán liên kết</strong> (hoặc ID) của folder Drive vào ô nhập.</li>
        </ul>
        <p>
          Muốn cho người thân đọc cùng: chia sẻ folder kho cho họ với quyền
          <strong>Viewer</strong> trên Google Drive — họ thêm kho y như cách trên.
        </p>
      </NCard>

      <NCard id="to-chuc" title="3. Tổ chức thư mục trên Drive" size="small" class="section">
        <p>Ứng dụng hiểu cấu trúc sau (lồng sâu bao nhiêu cũng được):</p>
        <pre>Kho truyện/
├── One Piece/          ← truyện: 1 folder
│   ├── 1010/           ← chương: folder ảnh (001.jpg, 002.jpg, …)
│   ├── 1011.pdf        ← hoặc 1 file PDF
│   └── 0-100/          ← nhóm chương (đánh dấu “Nhóm” để gộp chung)
└── Truyện nháp/        ← folder chứa nhiều truyện: bấm vào để duyệt</pre>
        <ul>
          <li>Ảnh trong chương xếp theo thứ tự “tự nhiên”: 2 &lt; 10 &lt; 100 — đặt tên 1, 2, 3… hay 001, 002… đều đúng.</li>
          <li>Một chương chỉ nên là <em>hoặc</em> folder ảnh, <em>hoặc</em> 1 file PDF.</li>
        </ul>
      </NCard>

      <NCard id="danh-dau" title="4. Đánh dấu truyện & duyệt thư mục" size="small" class="section">
        <p>
          Ứng dụng <strong>không tự đoán</strong> folder nào là truyện — bạn quyết định, và nó nhớ
          mãi:
        </p>
        <ul>
          <li>
            Bấm nút thư mục <strong>📂</strong> trên card để xem bên trong một folder bất kỳ (lồng
            sâu tự do) rồi quyết định nó là gì.
          </li>
          <li>
            Folder là một bộ truyện → bấm <strong>📖 Đọc truyện</strong> (trên card hoặc banner đầu
            trang thư mục). Từ lúc đó ứng dụng mới quét danh sách chương bên trong.
          </li>
          <li>
            Folder chỉ để chứa truyện (kiểu <code>Drop truyện/</code>) → bấm vào là xem danh sách
            truyện bên trong; muốn app nhớ và gắn nhãn "Danh sách truyện" trên card thì bấm
            <strong>Đây là danh sách nhiều truyện</strong> ở đầu trang thư mục.
          </li>
          <li>
            Chương nằm trong folder trung gian (kiểu <code>0-100/</code>) → dòng đó hiện thành 1
            dòng riêng, bấm <strong>Nhóm</strong> để đưa các chương bên trong lên cùng cấp. Nhóm lồng
            nhau thì đánh dấu tiếp từng tầng.
          </li>
          <li>Đánh dấu nhầm → vào trang truyện/folder đó để bỏ đánh dấu.</li>
        </ul>
      </NCard>

      <NCard id="doc" title="5. Đọc truyện" size="small" class="section">
        <ul>
          <li>
            <strong>Ảnh</strong> tải dần theo cuộn (kèm prefetch trước vài trang) — cuộn xuống đâu
            tải đến đó, đỡ tốn mạng.
          </li>
          <li>
            <strong>PDF</strong> hiển thị từng trang render sẵn, cuộn như đọc ảnh.
          </li>
          <li>
            Chương có cả ảnh lẫn PDF → bấm nút chuyển <strong>Ảnh / PDF</strong> trên thanh công cụ;
            lựa chọn được nhớ cho từng chương.
          </li>
          <li>
            Chuyển chương: nút chương trước/sau, hoặc gõ số chương vào ô tìm kiếm nhanh trên thanh
            công cụ để nhảy thẳng.
          </li>
          <li>
            <strong>Tiến độ đọc tự lưu</strong>: đang đọc chương nào, cuộn tới đâu. Thoát ra rồi vào
            lại — nút <strong>Tiếp tục đọc</strong> trên card đưa bạn về đúng chỗ cũ. Card cũng hiện
            sẵn “Đang đọc 45/120”.
          </li>
          <li>Nút ☀/☾ trên thanh đầu trang đổi giao diện sáng/tối.</li>
        </ul>
      </NCard>

      <NCard id="dong-bo" title="6. Đọc trên nhiều thiết bị" size="small" class="section">
        <p>
          Bật <strong>Cài đặt → Đồng bộ qua Google Drive</strong> (mặc định bật). Tiến độ đọc, danh
          sách kho và đánh dấu truyện/nhóm được lưu vào một thư mục ẩn trên Drive của chính bạn và
          tự đồng bộ mỗi khi mở trang — không cần tài khoản dịch vụ nào khác.
        </p>
        <p>
          Ví dụ: đọc đến chương 15 trên điện thoại → mở laptop thấy ngay nút “Tiếp tục đọc: chương
          15”. Bấm <strong>Đồng bộ ngay</strong> trong Cài đặt nếu muốn pull ngay lập tức.
        </p>
      </NCard>

      <NCard id="tim-kiem" title="7. Tìm kiếm & sắp xếp" size="small" class="section">
        <ul>
          <li>
            Ô tìm kiếm trên trang thư viện tìm <strong>không cần dấu</strong>: gõ “one piece” ra
            “One Piece”, “doraemon” ra “Đôrêmon”.
          </li>
          <li>
            Danh sách truyện sắp theo <strong>tên</strong> hoặc <strong>mới cập nhật</strong> — chọn
            trên đầu trang thư viện, ứng dụng nhớ lựa chọn của bạn.
          </li>
        </ul>
      </NCard>

      <NCard id="cache" title="8. Ảnh đã lưu & dung lượng" size="small" class="section">
        <p>
          Ảnh/PDF từng đọc được lưu sẵn trên thiết bị để lần sau mở không tốn mạng. Xem đã dùng bao
          nhiêu và dọn dẹp trong <strong>Cài đặt → Dữ liệu lưu trên thiết bị</strong>:
        </p>
        <ul>
          <li><strong>Xóa ảnh/PDF đã lưu</strong> — giải phóng dung lượng, không mất gì</li>
          <li><strong>Xóa danh sách đã lưu</strong> — buộc tải lại danh sách mới từ Drive</li>
          <li><strong>Xóa tiến trình đọc</strong> — xóa tiến độ (đồng bộ xóa cả trên thiết bị khác)</li>
          <li><strong>Đặt lại ứng dụng</strong> — xóa sạch mọi thứ và bắt đầu như mới cài</li>
        </ul>
      </NCard>

      <NCard id="su-co" title="9. Sự cố thường gặp" size="small" class="section">
        <ul>
          <li>
            <strong>Refesh trang lại ra trang đăng nhập?</strong> — bình thường do token không lưu
            trên máy. Bấm nút đăng nhập 1 cái là vào lại. Để vào thẳng: không dùng chế độ ẩn danh,
            cho phép third-party cookies, và đăng nhập Google trong cùng profile trình duyệt.
          </li>
          <li>
            <strong>Chương hiện “Google chặn tải file” / ảnh mờ hơn?</strong> — kho bật
            “Viewers can't download”. Ứng dụng tự chuyển sang bản preview do Google render (~2048px)
            nên vẫn đọc được, chỉ không lưu offline. PDF bị chặn thì bấm “Xem trên Drive”.
          </li>
          <li>
            <strong>Lỗi “Vượt giới hạn tần suất” khi quét kho?</strong> — Google giới hạn ~12
            request/giây. Đợi ~1 phút rồi bấm Làm mới.
          </li>
          <li>
            <strong>Không thấy truyện/chapter mới thêm trên Drive?</strong> — bấm Làm mới trên trang
            đó trước; chưa được thì Cài đặt → “Xóa danh sách đã lưu”.
          </li>
        </ul>
      </NCard>
    </div>
  </StaticShell>
</template>

<style scoped>
.guide-page {
  line-height: 1.7;
}

.guide-page h1 {
  margin: 0 0 4px;
  font-size: 26px;
}

.guide-page .intro {
  color: var(--tdw-text-muted);
  margin: 0 0 16px;
}

.toc {
  background: var(--tdw-bg-soft);
  border: 1px solid var(--tdw-border);
  border-radius: 8px;
  padding: 12px 16px 12px 12px;
  margin-bottom: 20px;
}

.toc ol {
  margin: 0;
  padding-left: 20px;
  columns: 2;
  column-gap: 24px;
}

.toc a {
  color: var(--tdw-primary);
  text-decoration: none;
}

.toc a:hover {
  text-decoration: underline;
}

.section {
  margin-bottom: 16px;
  scroll-margin-top: 12px;
}

.section p {
  margin: 8px 0;
}

.section ul {
  margin: 8px 0;
  padding-left: 22px;
}

.section li {
  margin: 4px 0;
}

.section pre {
  background: var(--tdw-bg-soft);
  border: 1px solid var(--tdw-border);
  border-radius: 8px;
  padding: 12px;
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.5;
  font-family: ui-monospace, 'Cascadia Code', 'Segoe UI Mono', Menlo, Consolas, monospace;
}

.section code {
  font-family: ui-monospace, 'Cascadia Code', 'Segoe UI Mono', Menlo, Consolas, monospace;
  font-size: 0.9em;
  background: var(--tdw-bg-soft);
  padding: 1px 5px;
  border-radius: 4px;
}

.section a {
  color: var(--tdw-primary);
}

@media (max-width: 640px) {
  .toc ol {
    columns: 1;
  }
}
</style>
