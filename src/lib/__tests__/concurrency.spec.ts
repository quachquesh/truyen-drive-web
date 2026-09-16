import { describe, expect, it } from 'vitest'

import { Semaphore, pooledMap } from '../concurrency'

describe('pooledMap', () => {
  it('giữ đúng thứ tự kết quả', async () => {
    const input = [5, 3, 1, 4, 2]
    const result = await pooledMap(input, async (n) => {
      await new Promise((r) => setTimeout(r, n * 10))
      return n * 100
    })
    expect(result).toEqual([500, 300, 100, 400, 200])
  })

  it('giới hạn số promise chạy đồng thời', async () => {
    let running = 0
    let maxRunning = 0

    const items = Array.from({ length: 12 }, (_, i) => i)
    await pooledMap(
      items,
      async (n) => {
        running++
        maxRunning = Math.max(maxRunning, running)
        await new Promise((r) => setTimeout(r, 5 + (n % 3) * 5))
        running--
        return n
      },
      4,
    )

    expect(maxRunning).toBeLessThanOrEqual(4)
    expect(maxRunning).toBeGreaterThan(1)
  })

  it('xử lý mảng rỗng', async () => {
    expect(await pooledMap([], async () => 1)).toEqual([])
  })
})

describe('Semaphore', () => {
  it('chờ tới khi có slot trống', async () => {
    const sem = new Semaphore(1)
    const order: number[] = []

    const task = (n: number, ms: number) =>
      sem.run(async () => {
        await new Promise((r) => setTimeout(r, ms))
        order.push(n)
      })

    await Promise.all([task(1, 30), task(2, 10), task(3, 5)])
    // task 2,3 chỉ chạy sau khi task 1 xong dù "nhanh hơn"
    expect(order).toEqual([1, 2, 3])
  })
})
