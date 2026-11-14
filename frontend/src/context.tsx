import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, write } from './api';
import type { User } from './types';

/** localStorage 键：登录/退出/切换账号时写入版本号，用于跨标签页同步登录态。 */
const SESSION_VERSION_KEY = 'campus_session_version';

interface Session {
  user: User | null;
  loading: boolean;
  sessionError: string;
  setUser: (user: User | null) => void;
  toast: (text: string) => void;
  logout: () => Promise<void>;
}
const Context = createContext<Session>(null!);
export const useSession = () => useContext(Context);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, updateUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [message, toast] = useState('');
  // 用 ref 记录最近一次登录身份，用于判断是否真的发生了登录/退出/切换账号，
  // 从而只在身份变化时写版本标记，避免两个标签页互相触发 storage 造成请求循环。
  const userIdRef = useRef<number | null>(null);
  function setUser(value: User | null) {
    updateUser(value);
    setSessionError('');
    const nextId = value?.id ?? null;
    if (userIdRef.current !== nextId) {
      try {
        // storage 事件只在“其他标签页”触发，当前标签页不会收到，正好实现跨标签页同步。
        localStorage.setItem(SESSION_VERSION_KEY, String(Date.now()));
      } catch {
        // localStorage 不可用（如极端隐私模式）时静默降级，不影响登录态本身。
      }
      userIdRef.current = nextId;
    }
  }
  useEffect(() => {
    api<User>('/auth/me')
      .then(setUser)
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === 401)) setSessionError(e.message);
      })
      .finally(() => setLoading(false));
  }, []);
  // 跨标签页登录态同步：同源 Cookie（campus_session）在所有标签页共享，其他标签页
  // 登录/退出后本标签页的 user 状态不会自动变化，因此监听 storage 事件并重新拉取
  // /auth/me，保证各标签页展示一致，不出现“串号/过期昵称”。
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== SESSION_VERSION_KEY) return;
      api<User>('/auth/me')
        .then(setUser)
        .catch((err) => {
          if (err instanceof ApiError && err.status === 401) setUser(null);
          else setSessionError(err.message);
        });
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => toast(''), 4000);
    return () => clearTimeout(timer);
  }, [message]);
  async function logout() {
    await write('/auth/logout');
    setUser(null);
  }
  return (
    <Context.Provider value={{ user, loading, sessionError, setUser, toast, logout }}>
      {children}
      {message && (
        <div id="toast" style={{ display: 'block' }} role="status">
          {message}
        </div>
      )}
    </Context.Provider>
  );
}
