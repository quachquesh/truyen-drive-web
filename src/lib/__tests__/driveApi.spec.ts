import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DRIVE_CONCURRENCY,
  DriveFileBlockedError,
  listChildrenGrouped,
  listNewChildren,
  sizedThumbnail,
  toErrorMessage,
} from '../driveApi'

// Mock axios: driveApi tạo instance lúc import — chặn http.get để soi request thật
type HttpGetMock = (
  url: string,
  config: { params: { q: string; pageToken?: string } },
) => Promise<{ data: { files?: unknown[]; nextPageToken?: string } }>

const { httpGet } = vi.hoisted(() => ({ httpGet: vi.fn<HttpGetMock>() }))

vi.mock('axios', () => {
  class MockAxiosError extends Error {
    constructor(
      message: string,
      public config?: unknown,
      public response?: { status?: number; data?: unknown },
    ) {
      super(message)
    }
  }
  const instance = {
    get: httpGet,
    interceptors: {
      request: { use: vi.fn<() => void>() },
      response: { use: vi.fn<() => void>() },
    },
  }
  return {
    default: { create: () => instance, AxiosError: MockAxiosError },
    AxiosError: MockAxiosError,
  }
})

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

// File mẫu trả về từ /files — group theo field `parents` như Drive thật
interface ListedFile {
  id: string
  name: string
  mimeType: string
  parents: string[]
  modifiedTime: string
}

const listedFile = (parent: string, name: string): ListedFile => ({
  id: `f-${parent}-${name}`,
  name,
  mimeType: 'application/vnd.google-apps.folder',
  parents: [parent],
  modifiedTime: '2026-09-01T00:00:00.000Z',
})

describe('listChildrenGrouped (chunk song song)', () => {
  beforeEach(() => {
    httpGet.mockReset()
  })

  it('chunk 12 cha/request, group kết quả theo parents', async () => {
    const parents = Array.from({ length: 120 }, (_, i) => `p${i}`)
    httpGet.mockImplementation(async (_url, config) => {
      const included = parents.filter((p) => config.params.q.includes(`'${p}' in parents`))
      return { data: { files: included.map((p) => listedFile(p, 'x')) } }
    })

    const grouped = await listChildrenGrouped(parents)

    expect(httpGet).toHaveBeenCalledTimes(10) // 120 cha / 12
    expect(grouped.size).toBe(120)
    expect(grouped.get('p7')).toHaveLength(1)
    // Mỗi request chứa đúng 12 mệnh đề "in parents" của chunk nó
    const clauses = httpGet.mock.calls.map(
      (call) => (call[1]!.params.q.match(/ in parents/g) ?? []).length,
    )
    expect(clauses).toEqual(Array.from({ length: 10 }, () => 12))
  })

  it('các chunk chạy song song, tối đa DRIVE_CONCURRENCY request cùng lúc', async () => {
    let inFlight = 0
    let maxInFlight = 0
    httpGet.mockImplementation(async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 10))
      inFlight--
      return { data: { files: [] } }
    })

    // 110 cha → 10 chunk, nhiều hơn số luồng → thấy trần đồng thời thật
    const parents = Array.from({ length: 110 }, (_, i) => `p${i}`)
    const grouped = await listChildrenGrouped(parents)

    expect(grouped.size).toBe(0)
    expect(maxInFlight).toBe(DRIVE_CONCURRENCY)
  })

  it('foldersOnly thêm mime filter vào q', async () => {
    httpGet.mockResolvedValue({ data: { files: [] } })

    await listChildrenGrouped(['a'], { foldersOnly: true })

    expect(httpGet.mock.calls[0]![1]!.params.q).toBe(
      "(('a' in parents) and trashed = false) and mimeType = 'application/vnd.google-apps.folder'",
    )
  })

  it('phân trang: đi hết nextPageToken của từng chunk, giữ thứ tự', async () => {
    let page = 0
    httpGet.mockImplementation(async () => {
      page++
      if (page === 1) {
        return { data: { files: [listedFile('a', 'p1')], nextPageToken: 't1' } }
      }
      return { data: { files: [listedFile('a', 'p2')] } }
    })

    const grouped = await listChildrenGrouped(['a'])

    expect(httpGet).toHaveBeenCalledTimes(2)
    expect(grouped.get('a')?.map((item) => item.name)).toEqual(['p1', 'p2'])
    expect(httpGet.mock.calls[1]![1]!.params.pageToken).toBe('t1')
  })
})

describe('listNewChildren (lọc phần mới hơn mốc)', () => {
  beforeEach(() => {
    httpGet.mockReset()
  })

  it('dựng q modifiedTime > mốc, group kết quả theo parents', async () => {
    httpGet.mockResolvedValue({
      data: {
        files: [
          {
            id: 'n1',
            name: '10',
            mimeType: 'application/vnd.google-apps.folder',
            parents: ['s1'],
            modifiedTime: '2026-09-16T10:00:00.000Z',
          },
        ],
      },
    })

    const grouped = await listNewChildren(['s1', 's2'], '2026-09-10T00:00:00.000Z', {
      foldersOnly: true,
    })

    expect(httpGet.mock.calls[0]![1]!.params.q).toBe(
      "(('s1' in parents or 's2' in parents) and trashed = false and modifiedTime > '2026-09-10T00:00:00.000Z') and mimeType = 'application/vnd.google-apps.folder'",
    )
    expect(grouped.get('s1')?.[0]?.name).toBe('10')
    expect(grouped.has('s2')).toBe(false)
  })

  it('không foldersOnly → q chỉ có mệnh đề thời gian', async () => {
    httpGet.mockResolvedValue({ data: { files: [] } })

    await listNewChildren(['s1'], '2026-09-10T00:00:00.000Z')

    expect(httpGet.mock.calls[0]![1]!.params.q).toBe(
      "(('s1' in parents) and trashed = false and modifiedTime > '2026-09-10T00:00:00.000Z')",
    )
  })
})
