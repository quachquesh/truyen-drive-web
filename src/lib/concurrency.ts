/** Giới hạn số promise chạy đồng thời (Drive API cho ~12 req/s mỗi user). */
export class Semaphore {
  private active = 0
  private readonly waiters: Array<() => void> = []

  constructor(private readonly limit: number) {}

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      this.waiters.push(() => {
        this.active++
        resolve()
      })
    })
  }

  private release(): void {
    this.active--
    this.waiters.shift()?.()
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }
}

/**
 * Chạy mapper trên toàn bộ items với số lượng đồng thời giới hạn.
 * Kết quả trả về đúng thứ tự của items.
 */
export async function pooledMap<T, R>(
  items: readonly T[],
  mapper: (item: T, index: number) => Promise<R>,
  concurrency = 4,
): Promise<R[]> {
  const results = Array.from({ length: items.length }) as R[]
  let next = 0

  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++
      results[index] = await mapper(items[index]!, index)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
