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
