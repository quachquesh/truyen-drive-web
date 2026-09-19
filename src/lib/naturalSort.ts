const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/**
 * So sánh 2 chuỗi theo thứ tự "tự nhiên": số được so theo giá trị
 * ("Chương 2" < "Chương 10", "31" < "100").
 */
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b)
}

/** Trả về bản sao mảng đã sort theo tên (không đổi mảng gốc). */
export function naturalSort<T>(items: readonly T[], nameOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => collator.compare(nameOf(a), nameOf(b)))
}

/**
 * Số "chính" của tên chapter: SỐ ĐẦU TIÊN (kèm thập phân) — "CHAP 5" → 5,
 * "5.5" → 5.5, "61" → 61, "0-30" → 0. Chọn số ĐẦU (không phải số cuối)
 * để phần năm/phụ đề phía sau ("Chap 5 (2020)") không lấn số chapter.
 */
const mainNumberOf = (name: string): number | undefined => {
  const match = name.match(/\d+(?:[.,]\d+)?/)
  return match ? Number(match[0]) : undefined
}

/**
 * So sánh 2 tên CHAPTER: số chính là khóa đầu, natural compare làm tiebreak.
 * Collation thuần (numeric) xếp CHỮ SỐ trước CHỮ CÁI nên khi trộn 2 kiểu
 * đặt tên trong cùng truyện ("CHAP 1..5" trong nhóm lẫn "6..61" ở ngoài)
 * cả cụm "CHAP x" bị dồn xuống cuối danh sách — bấm "Mới nhất trước" hiện
 * "CHAP 5" là mới nhất dù có chap 61. So theo số trong tên thì chapter
 * vẫn ra đúng thứ tự đọc. Tên không số (Extra, Omake) xuống cuối.
 */
export function chapterCompare(a: string, b: string): number {
  const aNo = mainNumberOf(a)
  const bNo = mainNumberOf(b)
  if (aNo !== undefined || bNo !== undefined) {
    if (aNo === undefined) return 1
    if (bNo === undefined) return -1
    if (aNo !== bNo) return aNo - bNo
  }
  return collator.compare(a, b)
}

/** Trả về bản sao mảng CHAPTER đã sort theo tên (không đổi mảng gốc). */
export function chapterSort<T>(items: readonly T[], nameOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => chapterCompare(nameOf(a), nameOf(b)))
}
