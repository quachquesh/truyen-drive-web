import type { ProgressRecord } from './db'
import type { ChapterRef } from './scanner'

/**
 * Số "n/total" hiển thị ở nút "Tiếp tục" (StoryPage) và dòng "Đang đọc"
 * (StoryCard). Ưu tiên vị trí SỐNG theo danh sách chapter hiện tại — danh sách
 * đổi sau khi đánh dấu nhóm / owner thêm chap — giá trị ghi trong record chỉ là
 * fallback vì đóng băng lúc đọc chapter.
 *
 * - `live.index`: vị trí 0-based của chapterId trong danh sách hiện tại
 *   (-1/undefined = không tìm thấy → dùng số của record)
 * - `live.total`: tổng số chapter hiện tại (undefined → dùng số của record)
 */
export function displayProgress(
  record: ProgressRecord,
  live?: { index?: number; total?: number },
): { no: number; total: number } | null {
  const no =
    live && live.index !== undefined && live.index >= 0 ? live.index + 1 : record.chapterNo
  const total = live?.total ?? record.chapterTotal
  if (!no || !total) return null
  return { no, total }
}

/**
 * Bản sao record với n/total tính lại theo vị trí chapterId trong danh sách
 * chapter HIỆN TẠI — record ghi lúc đọc, đánh dấu nhóm / chap mới sau đó có thể
 * chèn/bỏ chapter làm lệch số thứ tự. Thiếu danh sách hoặc chapter không còn
 * trong đó (VD nhóm vừa thay chính chapter đang đọc) → trả nguyên record.
 */
/**
 * Record đọc gần nhất (updatedAt lớn nhất) — cho banner "Tiếp tục đọc" ở trang
 * chủ. Bằng nhau giữ record đầu (thứ tự ổn định); mảng rỗng → undefined.
 */
export function latestProgress(records: ProgressRecord[]): ProgressRecord | undefined {
  let best: ProgressRecord | undefined
  for (const item of records) {
    if (!best || item.updatedAt > best.updatedAt) best = item
  }
  return best
}

export function applyLiveProgress(
  record: ProgressRecord,
  chapters: ChapterRef[] | undefined,
): ProgressRecord {
  if (!chapters) return record
  const index = chapters.findIndex((chapter) => chapter.id === record.chapterId)
  if (index < 0) return record
  return { ...record, chapterNo: index + 1, chapterTotal: chapters.length }
}
