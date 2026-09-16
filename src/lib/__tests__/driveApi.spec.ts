import { describe, expect, it } from 'vitest'

import { DriveFileBlockedError, sizedThumbnail, toErrorMessage } from '../driveApi'

describe('sizedThumbnail', () => {
  it('đổi suffix kích thước của thumbnailLink', () => {
    expect(sizedThumbnail('https://lh3.googleusercontent.com/a/abc123=s220')).toBe(
      'https://lh3.googleusercontent.com/a/abc123=s2048',
    )
    expect(sizedThumbnail('https://lh3.googleusercontent.com/a/abc123=w530-h300-p')).toBe(
      'https://lh3.googleusercontent.com/a/abc123=s2048',
    )
  })

  it('size tuỳ chỉnh', () => {
    expect(sizedThumbnail('https://lh3.googleusercontent.com/xyz=s220', 1024)).toBe(
      'https://lh3.googleusercontent.com/xyz=s1024',
    )
  })

  it('link chưa có suffix → nối thêm', () => {
    expect(sizedThumbnail('https://lh3.googleusercontent.com/xyz')).toBe(
      'https://lh3.googleusercontent.com/xyz=s2048',
    )
  })
})

describe('toErrorMessage với DriveFileBlockedError', () => {
  it('message view-only riêng biệt, không nhầm với 403 thiếu quyền', () => {
    const message = toErrorMessage(new DriveFileBlockedError('file-1'))
    expect(message).toContain('Google chặn tải file')
    expect(message).not.toContain('kiểm tra lại tài khoản')
  })

  it('giữ fileId để UI mở link Drive', () => {
    const error = new DriveFileBlockedError('file-xyz')
    expect(error.fileId).toBe('file-xyz')
    expect(error.name).toBe('DriveFileBlockedError')
  })
})
