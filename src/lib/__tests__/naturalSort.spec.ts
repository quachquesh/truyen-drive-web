import { describe, expect, it } from 'vitest'

import { naturalCompare, naturalSort } from '../naturalSort'

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
