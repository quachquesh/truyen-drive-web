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
