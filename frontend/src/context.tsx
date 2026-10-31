import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, write } from './api';
import type { User } from './types';
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
  function setUser(value: User | null) {
    updateUser(value);
    setSessionError('');
  }
  useEffect(() => {
    api<User>('/auth/me')
      .then(setUser)
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === 401)) setSessionError(e.message);
      })
      .finally(() => setLoading(false));
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
