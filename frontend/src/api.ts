import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from './types';
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
function toApiError(response: Response, data: unknown): ApiError {
  const detail = (data as { detail?: unknown } | null)?.detail;
  return new ApiError(
    typeof detail === 'string'
      ? detail
      : Array.isArray(detail)
        ? detail
            .map((e: { loc: string[]; msg: string }) => `${e.loc.slice(1).join('.')}: ${e.msg}`)
            .join('；')
        : '服务暂不可用，请重试',
    response.status,
  );
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch('/api' + path, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw toApiError(response, data);
  return data as T;
}
export const write = <T>(path: string, method = 'POST', data: unknown = {}) =>
  api<T>(path, { method, body: JSON.stringify(data) });
export async function uploadAvatar(file: File): Promise<User> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch('/api/auth/avatar', {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw toApiError(response, data);
  return data as User;
}
export async function removeAvatar(): Promise<User> {
  const response = await fetch('/api/auth/avatar', {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw toApiError(response, data);
  return data as User;
}
export function useData<T>(path: string | null, poll = 0) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const generation = useRef(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    const current = ++generation.current;
    setData(undefined);
    setError(undefined);
    setLoading(Boolean(path));
    if (!path) return;
    let inFlight = false;
    async function load() {
      if (inFlight) return;
      inFlight = true;
      try {
        const value = await api<T>(path!);
        if (current === generation.current) {
          setData(value);
          setError(undefined);
        }
      } catch (e) {
        if (current === generation.current) setError(e as Error);
      } finally {
        inFlight = false;
        if (current === generation.current) setLoading(false);
      }
    }
    void load();
    const timer = poll ? window.setInterval(load, poll) : undefined;
    return () => {
      generation.current++;
      clearInterval(timer);
    };
  }, [path, poll, version]);
  return { data, error, loading, refresh };
}

export const MESSAGE_POLL_MS = 10000;
export const refreshInbox = () => window.dispatchEvent(new Event('inbox-changed'));
