import { describe, expect, it } from 'vitest'

import type { ProgressRecord } from '../db'
import { applyLiveProgress, displayProgress, latestProgress } from '../progress'
import type { ChapterRef } from '../scanner'

const record = (overrides: Partial<ProgressRecord> = {}): ProgressRecord => ({
  key: 'lib:story-1',
  chapterId: 'c-11',
  chapterName: '11',
  scrollPct: 0.5,
  chapterNo: 2,
  chapterTotal: 3,
  updatedAt: 1,
  ...overrides,
})

describe('displayProgress (n/total ưu tiên vị trí sống, fallback record)', () => {
  it('có live index + total → dùng vị trí hiện tại, bỏ số cũ của record', () => {
    expect(displayProgress(record(), { index: 10, total: 12 })).toEqual({ no: 11, total: 12 })
  })

  it('live index = -1 (chapter không còn trong danh sách) → fallback số của record', () => {
    expect(displayProgress(record(), { index: -1, total: 12 })).toEqual({ no: 2, total: 12 })
  })

  it('chỉ có live total (StoryCard) → giữ số thứ tự của record', () => {
    expect(displayProgress(record(), { total: 12 })).toEqual({ no: 2, total: 12 })
  })

  it('chỉ có live index → giữ total của record', () => {
    expect(displayProgress(record(), { index: 4 })).toEqual({ no: 5, total: 3 })
  })

  it('không live → dùng nguyên số của record', () => {
    expect(displayProgress(record())).toEqual({ no: 2, total: 3 })
  })

  it('record thiếu số và không có live đủ → null (chỉ hiển thị tên chương)', () => {
    expect(displayProgress(record({ chapterNo: undefined }))).toBeNull()
    expect(displayProgress(record({ chapterTotal: undefined }))).toBeNull()
    // index hợp lệ cứu được total thiếu
    expect(displayProgress(record({ chapterTotal: undefined }), { index: 1, total: 12 })).toEqual({
      no: 2,
      total: 12,
    })
  })
})

describe('applyLiveProgress (re-anchor n/total theo danh sách hiện tại)', () => {
  const chapters: ChapterRef[] = [
    ...Array.from({ length: 10 }, (_, i) => ({ id: `c-${i + 1}`, name: String(i + 1) })),
    { id: 'c-11', name: '11' },
    { id: 'c-12', name: '12' },
  ]

  it('chapterId vẫn còn trong danh sách mới → tính lại đúng vị trí mới', () => {
    // Đọc "11" khi nó là chương thứ 2 của 3; nhóm 1-10 bung ra → "11" thành 11/12
    const anchored = applyLiveProgress(record({ chapterNo: 2, chapterTotal: 3 }), chapters)
    expect(anchored.chapterNo).toBe(11)
    expect(anchored.chapterTotal).toBe(12)
    expect(anchored.chapterName).toBe('11') // trường khác giữ nguyên
  })

  it('không có danh sách chapter → trả nguyên record', () => {
    const stale = record()
    expect(applyLiveProgress(stale, undefined)).toBe(stale)
  })

  it('chapterId không còn trong danh sách (nhóm vừa thay chính nó) → giữ số cũ', () => {
    const stale = record({ chapterId: 'c-1-10' })
    expect(applyLiveProgress(stale, chapters)).toBe(stale)
  })

  it('không mutate record gốc', () => {
    const stale = record({ chapterNo: 2, chapterTotal: 3 })
    applyLiveProgress(stale, chapters)
    expect(stale.chapterNo).toBe(2)
    expect(stale.chapterTotal).toBe(3)
  })
})

describe('latestProgress (record đọc gần nhất cho banner trang chủ)', () => {
  it('mảng rỗng → undefined', () => {
    expect(latestProgress([])).toBeUndefined()
  })

  it('nhiều record → lấy updatedAt lớn nhất bất kể thứ tự', () => {
    const a = record({ updatedAt: 10 })
    const b = record({ updatedAt: 30 })
    const c = record({ updatedAt: 20 })
    expect(latestProgress([a, c, b])).toBe(b)
  })

  it('một record → trả đúng record đó', () => {
    const only = record({ updatedAt: 5 })
    expect(latestProgress([only])).toBe(only)
  })

  it('updatedAt bằng nhau → giữ record đầu (thứ tự ổn định)', () => {
    const a = record({ updatedAt: 10 })
    const b = record({ updatedAt: 10, chapterName: 'khác' })
    expect(latestProgress([a, b])).toBe(a)
  })
})
