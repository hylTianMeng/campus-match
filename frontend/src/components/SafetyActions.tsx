import { useState } from 'react';
import { useData, write } from '../api';
import { useSession } from '../context';
import { ErrorNote, Field, Modal } from './ui';

export function ReportButton({
  type,
  targetId,
  triggerClassName,
}: {
  type: 'post' | 'user' | 'message' | 'chat_message';
  targetId: number;
  triggerClassName?: string;
}) {
  const { user, toast } = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!user?.verified || user.banned) return null;
  return (
    <>
      <button
        className={'link' + (triggerClassName ? ' ' + triggerClassName : '')}
        onClick={() => {
          setOpen(true);
          setError('');
        }}
      >
        举报
      </button>
      {open && (
        <Modal title="提交举报" onClose={() => !busy && setOpen(false)}>
          <p style={{ margin: '16px 0' }}>举报将交由管理员人工核实。请说明具体问题。</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                await write('/reports', 'POST', { target_type: type, target_id: targetId, reason });
                setOpen(false);
                setReason('');
                toast('举报已提交，可在我的举报查看进展');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="举报理由">
              <textarea
                required
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <ErrorNote error={error} />
            <button className="btn" disabled={busy}>
              提交举报
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function BlockButton({ personId, onChange }: { personId: number; onChange?: () => void }) {
  const { user, toast } = useSession();
  const info = useData<{ blocked_by_me: boolean; can_block: boolean }>(
    user && !user.is_admin && personId !== user.id ? '/conversations/' + personId : null,
  );
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!user?.verified || user.banned || user.is_admin || personId === user.id) return null;
  if (!info.data?.can_block) return <ErrorNote error={info.error} />;
  const blocked = !!info.data?.blocked_by_me;
  return (
    <>
      <button
        className="link"
        disabled={!info.data}
        onClick={() => {
          setError('');
          setOpen(true);
        }}
      >
        {blocked ? '解除拉黑' : '拉黑'}
      </button>
      <ErrorNote error={info.error} />
      {open && (
        <Modal title={blocked ? '解除拉黑' : '拉黑用户'} onClose={() => !busy && setOpen(false)}>
          <p style={{ margin: '18px 0' }}>
            {blocked
              ? '解除后可恢复符合条件的新申请和私信，旧申请保持原结果。'
              : '拉黑后双方将无法互发私信，对方也无法申请你的招募。现有待审申请将被拒绝，已录取结果保留。'}
          </p>
          <ErrorNote error={error} />
          <button
            className="btn danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await write('/blocks/' + personId, blocked ? 'DELETE' : 'PUT');
                setOpen(false);
                info.refresh();
                onChange?.();
                toast(blocked ? '已解除拉黑' : '已拉黑');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            确认{blocked ? '解除拉黑' : '拉黑'}
          </button>
        </Modal>
      )}
    </>
  );
}
