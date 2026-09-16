import { describe, expect, it } from 'vitest'

import { parseFolderId } from '../folderUrl'

describe('parseFolderId', () => {
  it('trích ID từ URL folder chuẩn', () => {
    expect(
      parseFolderId('https://drive.google.com/drive/folders/1AbC_dEfGhIjKlMnOpQrStUvWxYz'),
    ).toBe('1AbC_dEfGhIjKlMnOpQrStUvWxYz')
  })

  it('trích ID từ URL kèm query params', () => {
    expect(
      parseFolderId(
        'https://drive.google.com/drive/folders/ABC123defGHI456?usp=sharing&resourcekey=xyz',
      ),
    ).toBe('ABC123defGHI456')
  })

  it('nhận ID thuần', () => {
    expect(parseFolderId('1AbC_dEfGhIjKlMnOpQrStUvWxYz')).toBe('1AbC_dEfGhIjKlMnOpQrStUvWxYz')
  })

  it('trim khoảng trắng', () => {
    expect(parseFolderId('  1AbC_dEfGhIjKlMnOpQrStUvWxYz  ')).toBe('1AbC_dEfGhIjKlMnOpQrStUvWxYz')
  })

  it('trả null với input rỗng / sai format', () => {
    expect(parseFolderId('')).toBeNull()
    expect(parseFolderId('   ')).toBeNull()
    expect(parseFolderId('https://example.com/folder/123')).toBeNull()
    expect(parseFolderId('short')).toBeNull()
    expect(parseFolderId('có khoảng trắng ở giữa 1AbC_dEfGhIjKlMnOpQrStUvWxYz')).toBeNull()
  })
})
