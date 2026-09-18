/** Format ngày dd/MM/yyyy (vi-VN); rỗng nếu không có hoặc lỗi parse. */
export function formatDate(iso: string | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

/**
 * Thời gian tương đối từ epoch ms: "vừa xong" / "X phút trước" / "X giờ trước",
 * quá 24h về dd/MM/yyyy. Đồng hồ máy lệch (mốc tương lai) coi như "vừa xong".
 */
export function formatRelative(epochMs: number): string {
  const date = new Date(epochMs)
  if (Number.isNaN(date.getTime())) return ''
  const diffMs = Date.now() - epochMs
  if (diffMs < 60_000) return 'vừa xong'
  if (diffMs < 60 * 60_000) return `${Math.floor(diffMs / 60_000)} phút trước`
  if (diffMs < 24 * 60 * 60_000) return `${Math.floor(diffMs / 3_600_000)} giờ trước`
  return formatDate(date.toISOString())
}
