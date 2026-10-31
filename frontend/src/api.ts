import { useCallback, useEffect, useRef, useState } from 'react';
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch('/api' + path, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.detail;
    throw new ApiError(
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
  return data as T;
}
export const write = <T>(path: string, method = 'POST', data: unknown = {}) =>
  api<T>(path, { method, body: JSON.stringify(data) });
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
