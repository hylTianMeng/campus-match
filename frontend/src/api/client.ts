import axios from 'axios'
import type { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '../stores/auth'
import type { ApiResponse, TokenPair } from '../types/api'
import { BizError } from '../types/api'

const client = axios.create({
  baseURL: '/api/v1',
  timeout: 15000,
})

client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let refreshPromise: Promise<string | null> | null = null

async function doRefresh(): Promise<string | null> {
  const { refreshToken, setTokens, clear } = useAuthStore.getState()
  if (!refreshToken) return null
  try {
    const resp = await axios.post<ApiResponse<TokenPair>>('/api/v1/auth/refresh', {
      refresh_token: refreshToken,
    })
    const body = resp.data
    if (body.code !== 0) return null
    setTokens(body.data)
    return body.data.access_token
  } catch {
    clear()
    return null
  }
}

client.interceptors.response.use(
  (response): any => {
    const body = response.data as ApiResponse
    // 业务码非 0 → 抛 BizError（与 HTTP 401 严格区分，绝不误判为未登录）
    if (body && typeof body.code === 'number' && body.code !== 0) {
      throw new BizError(body.code, body.message)
    }
    return body.data
  },
  async (error: AxiosError): Promise<any> => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined

    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true
      if (!refreshPromise) {
        refreshPromise = doRefresh().finally(() => {
          refreshPromise = null
        })
      }
      const newToken = await refreshPromise
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`
        return client(original)
      }
      useAuthStore.getState().clear()
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
      throw new BizError(40100, '未登录')
    }

    if (error.response?.status === 401) {
      useAuthStore.getState().clear()
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
      throw new BizError(40100, '未登录')
    }

    const data = error.response?.data as ApiResponse | undefined
    const code = data?.code ?? 50000
    const message = data?.message ?? '网络错误，请稍后重试'
    throw new BizError(code, message)
  },
)

export const request = {
  get: <T>(url: string, config?: object) =>
    client.get(url, config) as unknown as Promise<T>,
  post: <T>(url: string, data?: unknown, config?: object) =>
    client.post(url, data, config) as unknown as Promise<T>,
  put: <T>(url: string, data?: unknown) =>
    client.put(url, data) as unknown as Promise<T>,
  delete: <T>(url: string, config?: object) =>
    client.delete(url, config) as unknown as Promise<T>,
}

export default client
