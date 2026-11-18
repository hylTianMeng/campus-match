import { useEffect, useRef, useState } from 'react';
import { ReportButton } from './SafetyActions';

/**
 * 消息气泡的"⋯"操作菜单：点击三点弹出小浮窗，提供删除 / 举报操作（对齐微信交互）。
 * 删除点击后交给父级弹出确认（防呆）；举报复用 ReportButton 的弹窗流程。
 */
export function MessageDotMenu({
  targetId,
  reportType,
  canDelete = true,
  deleteLabel = '删除',
  onDelete,
}: {
  targetId: number;
  reportType?: 'message' | 'chat_message';
  canDelete?: boolean;
  deleteLabel?: string;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onEsc(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);
  return (
    <div className="msg-dot-root" ref={rootRef}>
      <button
        type="button"
        className={'msg-dot-btn' + (open ? ' active' : '')}
        aria-label="消息操作"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && (
        <div className="msg-dot-menu" role="menu">
          {canDelete && (
            <button
              type="button"
              role="menuitem"
              className="msg-dot-item"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              {deleteLabel}
            </button>
          )}
          {reportType && (
            <ReportButton type={reportType} targetId={targetId} triggerClassName="msg-dot-item" />
          )}
        </div>
      )}
    </div>
  );
}
