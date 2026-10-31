export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

export interface PageResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface TokenPair {
  access_token: string
  refresh_token: string
}

export class BizError extends Error {
  code: number

  constructor(code: number, message: string) {
    super(message)
    this.name = 'BizError'
    this.code = code
  }
}
