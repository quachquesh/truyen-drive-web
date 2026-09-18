import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { formatDate, formatRelative } from '../dates'

describe('formatDate', () => {
  it('format dd/MM/yyyy (vi-VN)', () => {
    expect(formatDate('2026-09-16T10:00:00.000Z')).toBe('16/09/2026')
  })

  it('rỗng hoặc lỗi parse → chuỗi rỗng', () => {
    expect(formatDate(undefined)).toBe('')
    expect(formatDate('')).toBe('')
    expect(formatDate('not-a-date')).toBe('')
  })
})

describe('formatRelative', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-18T10:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('dưới 1 phút → "vừa xong"', () => {
    expect(formatRelative(Date.now() - 30_000)).toBe('vừa xong')
  })

  it('mốc tương lai (đồng hồ 2 máy lệch) → vẫn "vừa xong"', () => {
    expect(formatRelative(Date.now() + 2 * 60_000)).toBe('vừa xong')
  })

  it('trong 1 giờ → "X phút trước"', () => {
    expect(formatRelative(Date.now() - 5 * 60_000)).toBe('5 phút trước')
    expect(formatRelative(Date.now() - 59 * 60_000)).toBe('59 phút trước')
  })

  it('trong 24 giờ → "X giờ trước" (làm tròn xuống)', () => {
    expect(formatRelative(Date.now() - 3 * 3_600_000)).toBe('3 giờ trước')
    expect(formatRelative(Date.now() - 90 * 60_000)).toBe('1 giờ trước')
  })

  it('quá 24 giờ → về dd/MM/yyyy (khớp formatDate cùng thời điểm)', () => {
    const epoch = Date.now() - 25 * 3_600_000
    expect(formatRelative(epoch)).toBe(formatDate(new Date(epoch).toISOString()))
  })

  it('epoch rác → chuỗi rỗng', () => {
    expect(formatRelative(Number.NaN)).toBe('')
  })
})
