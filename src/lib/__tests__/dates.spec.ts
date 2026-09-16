import { describe, expect, it } from 'vitest'

import { formatDate } from '../dates'

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
