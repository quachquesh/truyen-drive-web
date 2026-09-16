/**
 * Interface tối tiểu cho PDF document — pdfjs v6 ship types có lỗi danh tính
 * (class PDFDocumentProxy không khớp với type trả về của getDocument),
 * nên app tự định nghĩa đúng phần mình dùng và cast 1 chỗ duy nhất
 * (trong PdfReader.vue).
 */
export interface PdfViewportLike {
  width: number
  height: number
}

export interface PdfPageLike {
  getViewport(params: { scale: number }): PdfViewportLike
  render(params: { canvas: HTMLCanvasElement; viewport: unknown }): { promise: Promise<void> }
  cleanup(): void
}

export interface PdfDocument {
  readonly numPages: number
  getPage(pageNumber: number): Promise<PdfPageLike>
}
