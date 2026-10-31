import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSession } from '../context';
export const date = (value: string) =>
  value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '未填写';
export const tagsFrom = (value: string) => [
  ...new Set(
    value
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean),
  ),
];
export const statusLabel: Record<string, string> = {
  pending: '待审核',
  accepted: '已通过',
  rejected: '未通过',
  withdrawn: '已撤回',
  expired: '已过期',
};
export function Header({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: ReactNode;
}) {
  return (
    <div className="pagehead">
      <div>
        <div className="eyebrow">CAMPUSCREW / TSINGHUA CAMPUS</div>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      <div className="actions">{children}</div>
    </div>
  );
}
export function Tags({ values = [] }: { values?: string[] }) {
  return (
    <div className="tags">
      {values.map((t) => (
        <span className="tag" key={t}>
          {t}
        </span>
      ))}
    </div>
  );
}
export function Badge({ children, color = '' }: { children: ReactNode; color?: string }) {
  return <span className={'badge ' + color}>{children}</span>;
}
export function Empty({
  title = '这里还没有记录',
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty plain">
      <div className="symbol">○</div>
      <h2>{title}</h2>
      <div className="actions">{children}</div>
    </div>
  );
}
export function ErrorNote({ error }: { error?: Error | string }) {
  return error ? (
    <div className="notice error" role="alert">
      {typeof error === 'string' ? error : error.message}
    </div>
  ) : null;
}
export function LoadState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error?: Error;
  retry?: () => void;
}) {
  return error ? (
    <>
      <ErrorNote error={error} />
      {retry && (
        <button className="btn secondary" onClick={retry}>
          重新加载
        </button>
      )}
    </>
  ) : loading ? (
    <div className="empty plain" role="status">
      正在加载…
    </div>
  ) : null;
}
export function Guard({ children }: { children: ReactNode }) {
  const { user, loading, sessionError } = useSession();
  const location = useLocation();
  if (loading) return <LoadState loading />;
  if (sessionError) return <ErrorNote error={sessionError} />;
  return user ? (
    <>{children}</>
  ) : (
    <Empty title="请先登录">
      <Link
        className="btn"
        to={'/auth?return=' + encodeURIComponent(location.pathname + location.search)}
      >
        登录后继续
      </Link>
    </Empty>
  );
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field react-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog ref={ref} aria-labelledby={id} onCancel={onClose}>
      <div className="modalhead">
        <h2 id={id}>{title}</h2>
        <button className="close" onClick={onClose} aria-label="关闭弹窗">
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function SafeLink({ url, children }: { url?: string; children: ReactNode }) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return (
    <a className="link" href={url} target="_blank" rel="noopener noreferrer">
      {children} ↗
    </a>
  );
}
