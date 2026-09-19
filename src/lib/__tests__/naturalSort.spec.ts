import { describe, expect, it } from 'vitest'

import { chapterCompare, chapterSort, naturalCompare, naturalSort } from '../naturalSort'

describe('naturalSort', () => {
  it('sort số theo giá trị thay vì alphabet', () => {
    const names = ['Chương 10', 'Chương 2', 'Chương 1', 'Chương 100', 'Chương 21']
    expect(names.sort(naturalCompare)).toEqual([
      'Chương 1',
      'Chương 2',
      'Chương 10',
      'Chương 21',
      'Chương 100',
    ])
  })

  it('sort folder nhóm kiểu "0-30" lẫn chapter đơn', () => {
    const names = ['32', '0-30', '31', '0-5', '100']
    expect(names.sort(naturalCompare)).toEqual(['0-5', '0-30', '31', '32', '100'])
  })

  it('sort số thuần dạng string', () => {
    const names = ['10', '9', '2', '1', '30']
    expect(names.sort(naturalCompare)).toEqual(['1', '2', '9', '10', '30'])
  })

  it('naturalSort không đổi mảng gốc và map đúng theo nameOf', () => {
    const items = [
      { id: '1', name: 'b10' },
      { id: '2', name: 'b2' },
    ]
    const sorted = naturalSort(items, (item) => item.name)
    expect(sorted.map((item) => item.id)).toEqual(['2', '1'])
    expect(items.map((item) => item.id)).toEqual(['1', '2'])
  })
})

describe('chapterSort (số trong tên là khóa chính)', () => {
  it('trộn "CHAP x" lẫn số thuần vẫn ra đúng thứ tự đọc — collation thường dồn CHAP xuống cuối', () => {
    // Thứ tự input = legacy cache ghi theo collation cũ (số trước chữ)
    const names = ['6', '60', '61', 'CHAP 1', 'CHAP 2', 'CHAP 5']
    expect(names.sort(chapterCompare)).toEqual(['CHAP 1', 'CHAP 2', 'CHAP 5', '6', '60', '61'])
  })

  it('so số theo giá trị kể cả có tiền tố', () => {
    const names = ['CHAP 10', 'CHAP 9', 'CHAP 100']
    expect(names.sort(chapterCompare)).toEqual(['CHAP 9', 'CHAP 10', 'CHAP 100'])
  })

  it('tên không có số (Extra, Omake) xuống cuối', () => {
    const names = ['Extra', '10', '2', 'Omake']
    expect(names.sort(chapterCompare)).toEqual(['2', '10', 'Extra', 'Omake'])
  })

  it('số thập phân nằm đúng giữa', () => {
    const names = ['6', '5.5', '5']
    expect(names.sort(chapterCompare)).toEqual(['5', '5.5', '6'])
  })

  it('cùng số → natural compare làm tiebreak (xác định, ổn định)', () => {
    const names = ['CHAP 5', '5']
    expect(names.sort(chapterCompare)).toEqual(['5', 'CHAP 5'])
  })

  it('chapterSort không đổi mảng gốc và map đúng theo nameOf', () => {
    const items = [
      { id: 'a', name: 'CHAP 10' },
      { id: 'b', name: 'CHAP 9' },
    ]
    const sorted = chapterSort(items, (item) => item.name)
    expect(sorted.map((item) => item.id)).toEqual(['b', 'a'])
    expect(items.map((item) => item.id)).toEqual(['a', 'b'])
  })
})
