import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, useData, write } from '../api';
import { useSession } from '../context';
import type { Draft, Post, PostInput, RoleInput, InformationItem } from '../types';
import { Header, Field, ErrorNote, LoadState, Modal, tagsFrom } from '../components/ui';
const blankRole = (): RoleInput => ({ name: '', capacity: 1, description: '', tags: [] });
const blankPost = (): PostInput => ({
  title: '',
  category: '',
  description: '',
  place: '',
  deadline: '',
  event_time: '',
  tags: [],
  extras: {},
  attachment_id: null,
  roles: [],
});
function localDate(iso: string) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function Publish() {
  const { id } = useParams(),
    [params] = useSearchParams(),
    navigate = useNavigate(),
    { toast } = useSession();
  const [form, setForm] = useState<PostInput>(blankPost),
    [ended, setEnded] = useState(false),
    [endReason, setEndReason] = useState(''),
    [attachmentNames, setAttachmentNames] = useState<Record<number, string>>({}),
    [revision, setRevision] = useState(0),
    [saveStatus, setSaveStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>(
      'idle',
    ),
    [autoError, setAutoError] = useState(''),
    [postTagText, setPostTagText] = useState(''),
    [roleTagTexts, setRoleTagTexts] = useState<string[]>([]),
    [roleKeys, setRoleKeys] = useState<number[]>([]),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(''),
    [confirmNoRoles, setConfirmNoRoles] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null),
    allowNoRoles = useRef(false);
  const categories = useData<string[]>('/categories');
  const edit = Boolean(id);
  const sourceDraft = params.get('draft');
  const nextRoleKey = useRef(0);
  const draftIdRef = useRef<number | undefined>(undefined);
  const latestRevision = useRef(0);
  const savedRevision = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const scope = useRef(0);
  const publishing = useRef(false);
  const originalDeadline = useRef('');
  const originalEventTime = useRef('');
  function loadForm(value: PostInput, loadedDraftId?: number) {
    setForm(value);
    setPostTagText(value.tags.join(', '));
    setRoleTagTexts(value.roles.map((role) => role.tags.join(', ')));
    setRoleKeys(value.roles.map(() => nextRoleKey.current++));
    draftIdRef.current = loadedDraftId;
    latestRevision.current = 0;
    savedRevision.current = loadedDraftId ? 0 : -1;
    setRevision(0);
    setSaveStatus('idle');
    setAutoError('');
  }
  useEffect(() => {
    let active = true;
    scope.current++;
    setLoading(true);
    setLoadError('');
    draftIdRef.current = undefined;
    publishing.current = false;
    const load = async () => {
      try {
        if (id) {
          const p = await api<Post>('/posts/' + id);
          if (active) setAttachmentNames(Object.fromEntries(
            (p.attachments ?? (p.attachment ? [p.attachment] : [])).map((a) => [a.id, a.filename]),
          ));
          if (active) setEnded(p.status === 'ended');
          if (active) setEndReason(p.end_reason ?? '');
          originalDeadline.current = p.deadline;
          originalEventTime.current = p.event_time;
          if (active)
            loadForm({
              ...p,
              attachment_id: p.attachment?.id ?? null,
              attachment_name: p.attachment?.filename ?? '',
              deadline: localDate(p.deadline),
              event_time: localDate(p.event_time),
              roles: p.roles.map(({ id, name, capacity, description, tags, accepting, accepted, application_count }) => ({
                id, accepting: accepting ?? true, accepted, application_count,
                name,
                capacity,
                description,
                tags,
              })),
            });
        } else if (sourceDraft) {
          if (active) setEnded(false);
          const drafts = await api<Draft[]>('/drafts');
          const draft = drafts.find((d) => d.id === +sourceDraft);
          if (!draft) throw new Error('草稿不存在');
          if (active) loadForm({ ...blankPost(), ...draft.payload }, draft.id);
        } else if (active) { setEnded(false); loadForm(blankPost()); }
      } catch (e) {
        if (active) setLoadError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [id, sourceDraft]);
  const set = <K extends keyof PostInput>(key: K, value: PostInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    latestRevision.current++;
    setRevision(latestRevision.current);
    if (!edit) setSaveStatus('pending');
  };
  const setRole = (index: number, values: Partial<RoleInput>) =>
    set(
      'roles',
      form.roles.map((r, i) => (i === index ? { ...r, ...values } : r)),
    );
  function setItem(index: number, patch: Partial<InformationItem>) {
    set('extras', { ...form.extras, items: (form.extras.items ?? []).map((item, i) => i === index ? { ...item, ...patch } : item) });
  }
  async function uploadFile(file: File, itemIndex?: number) {
    if (file.size > 5 * 1024 * 1024) {
      setError('附件大小不能超过 5 MB');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const encoded = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(new Error('读取文件失败'));
        reader.readAsDataURL(file);
      });
      const uploaded = await write<{ id: number; filename: string }>('/attachments', 'POST', {
        filename: file.name,
        content_base64: encoded,
      });
      setAttachmentNames((names) => ({ ...names, [uploaded.id]: uploaded.filename }));
      setForm((current) => itemIndex === undefined ? ({
        ...current, attachment_id: uploaded.id, attachment_name: uploaded.filename,
      }) : ({ ...current, extras: { ...current.extras, items: (current.extras.items ?? []).map(
        (item, i) => i === itemIndex ? { ...item, attachment_id: uploaded.id } : item,
      ) } }));
      latestRevision.current++;
      setRevision(latestRevision.current);
      if (!edit) setSaveStatus('pending');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  function persistDraft(snapshot: PostInput, targetRevision: number) {
    const currentScope = scope.current;
    const operation = saveQueue.current
      .catch(() => {})
      .then(async () => {
        if (currentScope !== scope.current || targetRevision <= savedRevision.current) return;
        setSaveStatus('saving');
        const currentId = draftIdRef.current;
        const saved = await write<{ id: number }>(
          currentId ? '/drafts/' + currentId : '/drafts',
          currentId ? 'PUT' : 'POST',
          { payload: snapshot },
        );
        if (currentScope !== scope.current) return;
        draftIdRef.current = saved.id;
        savedRevision.current = targetRevision;
        setAutoError('');
        setSaveStatus(targetRevision >= latestRevision.current ? 'saved' : 'pending');
      });
    saveQueue.current = operation.catch(() => {});
    return operation.catch((error: Error) => {
      if (currentScope === scope.current) {
        setSaveStatus('error');
        setAutoError(error.message);
      }
      throw error;
    });
  }
  useEffect(() => {
    if (edit || loading || revision === 0) return;
    const timer = window.setTimeout(() => {
      if (!publishing.current) void persistDraft(form, revision).catch(() => {});
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [edit, form, loading, revision]);
  useEffect(() => {
    if (edit) return;
    const warnIfUnsaved = (event: BeforeUnloadEvent) => {
      if (latestRevision.current <= savedRevision.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnIfUnsaved);
    return () => window.removeEventListener('beforeunload', warnIfUnsaved);
  }, [edit]);
  async function saveDraft() {
    setBusy(true);
    setError('');
    try {
      await persistDraft(form, revision);
      toast('草稿已保存');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function leaveTo(path: string) {
    if (busy || uploading) return;
    if (!edit && revision > savedRevision.current) {
      setBusy(true);
      try {
        await persistDraft(form, revision);
      } catch (e) {
        setError((e as Error).message);
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    navigate(path);
  }
  function validateAll(): Record<string, string> {
    const errs: Record<string, string> = {};
    const titleEditable = !edit || !ended;
    const baseEditable = !edit || !ended;
    const rolesEditable = !edit || !ended;
    const deadlineEditable = !edit || !ended || endReason === 'expired';
    if (titleEditable && !form.title.trim()) errs.title = '请填写招募标题';
    if (baseEditable && !form.category) errs.category = '请选择一级分类';
    if (!form.description.trim()) errs.description = '请填写招募说明';
    if (rolesEditable)
      form.roles.forEach((r, i) => {
        if (!r.name.trim()) errs[`role-${i}-name`] = '请填写岗位名称';
        if (!r.capacity || r.capacity < 1)
          errs[`role-${i}-capacity`] = '招募人数需为不小于 1 的整数';
      });
    if (deadlineEditable && !form.deadline) errs.deadline = '请填写招募截止时间';
    (form.extras.items ?? []).forEach((item, i) => {
      if (!item.title.trim()) errs[`item-${i}-title`] = '请填写信息标题';
      if (item.type === 'text' && !item.content.trim())
        errs[`item-${i}-content`] = '请填写文字内容';
      if (item.type === 'link' && !item.content.trim())
        errs[`item-${i}-content`] = '请填写网址';
      if (item.type === 'attachment' && !item.attachment_id)
        errs[`item-${i}-content`] = '请上传附件内容';
    });
    return errs;
  }
  // 时间合理性是提醒而非拦截：活动开始时间早于截止时间时给出警示，仍允许提交。
  const scheduleEditable = !edit || !ended || endReason === 'expired';
  const timeConflict =
    scheduleEditable &&
    Boolean(form.event_time && form.deadline) &&
    new Date(form.event_time).getTime() < new Date(form.deadline).getTime();
  function scrollToFirstError(errs: Record<string, string>) {
    const order = ['title', 'category', 'description'];
    form.roles.forEach((_, i) => order.push(`role-${i}-name`, `role-${i}-capacity`));
    order.push('deadline', 'event_time');
    (form.extras.items ?? []).forEach((_, i) =>
      order.push(`item-${i}-title`, `item-${i}-content`),
    );
    const first = order.find((key) => errs[key]);
    if (!first) return;
    // 滚动精确到出错字段本身：定位其标签（“招募说明”等）恰好露出；
    // 若错误区域没有具体字段（如尚未添加任何岗位），定位到所在小节标题。
    const fieldId = `pf-${first}`;
    const target = document.getElementById(fieldId)
      ? fieldId
      : first.startsWith('role-')
        ? 'role-section'
        : first.startsWith('item-')
          ? 'pf-sec-extras'
          : first === 'deadline' || first === 'event_time'
            ? 'pf-sec-time'
            : 'pf-sec-basic';
    document
      .getElementById(target)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  useEffect(() => {
    setErrors((prev) => {
      if (!Object.keys(prev).length) return prev;
      const fresh = validateAll();
      const kept: Record<string, string> = {};
      for (const key of Object.keys(prev)) if (fresh[key]) kept[key] = fresh[key];
      return kept;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);
  const markErr = (key: string) =>
    errors[key] ? { borderColor: 'var(--red)' } : undefined;
  // 错误提示直接内嵌在 Field 内部（.field small 自带 6px 上边距），避免外层包装产生多余换行。
  const fieldErr = (key: string) =>
    errors[key] ? (
      <small style={{ color: 'var(--red)', display: 'block' }}>{errors[key]}</small>
    ) : null;
  if (loading) return <LoadState loading />;
  if (loadError) return <ErrorNote error={loadError} />;
  return (
    <>
      <Header
        title={edit ? '编辑已发布招募' : '让一个想法，找到伙伴'}
        sub={
          edit
            ? '保存信息调整；时间、地点和岗位变更会通知相关申请者。'
            : '按岗位描述合作期待。填写时会自动保存为私有草稿。'
        }
      >
        {!edit && (
          <Link
            className="btn secondary"
            to="/drafts"
            onClick={(event) => {
              event.preventDefault();
              void leaveTo('/drafts');
            }}
          >
            草稿箱
          </Link>
        )}
      </Header>
      {edit && (
        <div className="notice">
          {ended
            ? endReason === 'expired'
              ? '招募已因截止到期结束：延长截止时间并保存，即可重新开放招募；其他信息仍处于锁定状态。'
              : '招募已结束，可修正说明、联系方式和补充资料；岗位、名额和录取结果已锁定。'
            : '时间、地点和岗位变更会通知相关申请者。截止时间只允许延长；有申请记录的岗位可停止接收申请。'}
        </div>
      )}
      <form
        ref={formRef}
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          const errs = validateAll();
          if (Object.keys(errs).length) {
            setErrors(errs);
            scrollToFirstError(errs);
            return;
          }
          if (!ended && !form.roles.length && !allowNoRoles.current) {
            setConfirmNoRoles(true);
            return;
          }
          setBusy(true);
          publishing.current = true;
          try {
            if (!edit) await saveQueue.current;
            const {
              title,
              description,
              place,
              tags,
              extras,
              attachment_id,
              attachment_name: _attachmentName,
              ...rest
            } = form;
            const body = edit
              ? {
                  title,
                  description,
                  place,
                  tags,
                  extras,
                  attachment_id,
                  ...(!ended
                    ? {
                        category: form.category,
                        event_time: form.event_time === localDate(originalEventTime.current) ? originalEventTime.current : (form.event_time ? new Date(form.event_time).toISOString() : ''),
                        deadline: form.deadline === localDate(originalDeadline.current) ? originalDeadline.current : new Date(form.deadline).toISOString(),
                        roles: form.roles.map(({ id, name, capacity, description, tags, accepting }) => ({ id, name, capacity, description, tags, accepting: accepting ?? true })),
                      }
                    : endReason === 'expired' && form.deadline !== localDate(originalDeadline.current)
                      ? { deadline: new Date(form.deadline).toISOString() }
                      : {}),
                }
              : {
                  ...rest,
                  title,
                  description,
                  place,
                  tags,
                  extras,
                  attachment_id,
                  deadline: new Date(form.deadline).toISOString(),
                  event_time: form.event_time ? new Date(form.event_time).toISOString() : '',
                  draft_id: draftIdRef.current,
                };
            const p = await write<Post>(
              edit ? '/posts/' + id : '/posts',
              edit ? 'PATCH' : 'POST',
              body,
            );
            toast(edit ? '招募已保存' : '招募已发布');
            navigate('/detail/' + p.id);
          } catch (e) {
            setError((e as Error).message);
            publishing.current = false;
            allowNoRoles.current = false;
            if (!edit && revision > savedRevision.current)
              void persistDraft(form, revision).catch(() => {});
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="columns">
          <section>
            <div className="panel" id="pf-sec-basic">
              <h2>01 / 基本信息</h2>
              <Field label="招募标题 *" id="pf-title">
                <input
                  required
                  disabled={ended}
                  maxLength={160}
                  style={markErr('title')}
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                />
                {fieldErr('title')}
              </Field>
              <Field label="一级分类 *" id="pf-category">
                <select
                  required
                  disabled={ended}
                  style={markErr('category')}
                  value={form.category}
                  onChange={(e) => set('category', e.target.value)}
                >
                  <option value="">请选择分类</option>
                  {categories.data?.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                {fieldErr('category')}
              </Field>
              <ErrorNote error={categories.error} />
              <Field label="招募者联系方式（选填）">
                <input
                  value={form.extras.contact ?? ''}
                  onChange={(e) => set('extras', { ...form.extras, contact: e.target.value })}
                />
              </Field>
              <p className="small muted">填写后会在公开招募详情中展示，访客也可查看。</p>
              <Field label="招募说明 *" id="pf-description">
                <textarea
                  required
                  rows={6}
                  maxLength={20000}
                  style={markErr('description')}
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="介绍目标、协作方式与投入期待"
                />
                {fieldErr('description')}
              </Field>
            </div>
            <div className="panel" id="role-section">
              <h2>02 / 招募岗位</h2>
              {form.roles.map((r, i) => (
                <div className="roleform" key={roleKeys[i]}>
                  <div className="between">
                    <h3>岗位 {i + 1}</h3>
                    {!ended && !r.application_count && (
                      <button
                        className="link"
                        type="button"
                        onClick={() => {
                          setRoleKeys((keys) => keys.filter((_, j) => i !== j));
                          setRoleTagTexts((texts) => texts.filter((_, j) => i !== j));
                          set(
                            'roles',
                            form.roles.filter((_, j) => i !== j),
                          );
                        }}
                      >
                        删除岗位
                      </button>
                    )}
                  </div>
                  <div className="formgrid" style={{ marginTop: 15 }}>
                    <Field label="岗位名称 *" id={`pf-role-${i}-name`}>
                      <input
                        required
                        disabled={ended}
                        style={markErr(`role-${i}-name`)}
                        value={r.name}
                        onChange={(e) => setRole(i, { name: e.target.value })}
                      />
                      {fieldErr(`role-${i}-name`)}
                    </Field>
                    <Field label="招募人数 *" id={`pf-role-${i}-capacity`}>
                      <input
                        required
                        disabled={ended}
                        type="number"
                        min={Math.max(1, r.accepted ?? 0)}
                        max={100}
                        style={markErr(`role-${i}-capacity`)}
                        value={r.capacity}
                        onChange={(e) => setRole(i, { capacity: Number(e.target.value) })}
                      />
                      {fieldErr(`role-${i}-capacity`)}
                    </Field>
                    <Field label="技能标签">
                      <input
                        disabled={ended}
                        value={roleTagTexts[i] ?? ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          setRoleTagTexts((texts) =>
                            texts.map((text, j) => (j === i ? value : text)),
                          );
                          setRole(i, { tags: tagsFrom(value) });
                        }}
                      />
                    </Field>
                    <Field label="岗位描述">
                      <textarea
                        disabled={ended}
                        value={r.description}
                        onChange={(e) => setRole(i, { description: e.target.value })}
                      />
                    </Field>
                  </div>
                  <label className="small">
                    <input type="checkbox" disabled={ended} checked={r.accepting ?? true} onChange={(e) => setRole(i, { accepting: e.target.checked })} /> 接收新申请
                  </label>
                  {!!r.application_count && <p className="small muted">已有 {r.application_count} 条申请记录，已录取 {r.accepted} 人；可停止接收新申请，保留已有记录。</p>}
                </div>
              ))}
              {!ended && (
                <div className="roleform add-role">
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      setRoleKeys((keys) => [...keys, nextRoleKey.current++]);
                      setRoleTagTexts((texts) => [...texts, '']);
                      set('roles', [...form.roles, blankRole()]);
                    }}
                  >
                    ＋ 新增岗位
                  </button>
                </div>
              )}
            </div>
            <div className="panel" id="pf-sec-time">
              <h2>03 / 时间、地点与标签</h2>
              <div className="formgrid">
                <Field label="招募截止时间 *" id="pf-deadline">
                  <input
                    required
                    disabled={ended && endReason !== 'expired'}
                    type="datetime-local"
                    style={markErr('deadline')}
                    value={form.deadline}
                    onChange={(e) => set('deadline', e.target.value)}
                  />
                  {fieldErr('deadline')}
                </Field>
                <Field label="活动时间（选填）" id="pf-event_time">
                  <input
                    disabled={ended}
                    type="datetime-local"
                    style={markErr('event_time')}
                    value={form.event_time}
                    onChange={(e) => set('event_time', e.target.value)}
                  />
                  {fieldErr('event_time')}
                </Field>
                <Field label="活动地点（选填）">
                  <input disabled={ended} value={form.place} onChange={(e) => set('place', e.target.value)} />
                </Field>
                <Field label="招募小标签（选填）">
                  <input
                    value={postTagText}
                    disabled={ended}
                    placeholder="例如：零基础友好，周末活动，设计协作"
                    onChange={(e) => {
                      setPostTagText(e.target.value);
                      set('tags', tagsFrom(e.target.value));
                    }}
                  />
                </Field>
              </div>
              {timeConflict && (
                <div className="notice warn" role="alert">
                  出现活动开始时间早于招募截止时间的不合理情况，请再次确认。
                </div>
              )}
              <p className="small muted">小标签用逗号分隔，可自由添加；它们会显示在招募卡片上，也可用于搜索。</p>
              {!!form.tags.length && (
                <div className="tags" aria-label="已添加的招募小标签">
                  {form.tags.map((tag) => (
                    <button
                      className="tag tag-button"
                      type="button"
                      disabled={ended}
                      key={tag}
                      aria-label={`移除标签 ${tag}`}
                      onClick={() => {
                        const next = form.tags.filter((value) => value !== tag);
                        setPostTagText(next.join(', '));
                        set('tags', next);
                      }}
                    >
                      {tag} ×
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="panel" id="pf-sec-extras">
              <h2>04 / 补充信息（选填）</h2>
              <p className="small muted">自行填写信息标题，并选择文字信息、网址链接或附件内容。填写后将在招募详情中公开展示。</p>
              {(form.extras.items ?? []).map((item, index) => (
                <div className="roleform" key={index}>
                  <div className="between">
                    <h3>信息 {index + 1}</h3>
                    <button type="button" className="link" disabled={uploading || busy} onClick={() => set('extras', {
                      ...form.extras, items: form.extras.items!.filter((_, i) => i !== index),
                    })}>移除信息</button>
                  </div>
                  <Field label="信息标题 *" id={`pf-item-${index}-title`}>
                    <input
                      required
                      maxLength={100}
                      style={markErr(`item-${index}-title`)}
                      value={item.title}
                      onChange={(e) => setItem(index, { title: e.target.value })}
                    />
                    {fieldErr(`item-${index}-title`)}
                  </Field>
                  <Field label="信息属性 *">
                    <select value={item.type} disabled={uploading || busy} onChange={(e) => setItem(index, {
                      type: e.target.value as InformationItem['type'], content: '', attachment_id: null,
                    })}>
                      <option value="text">文字信息</option>
                      <option value="link">网址链接</option>
                      <option value="attachment">附件内容</option>
                    </select>
                  </Field>
                  {item.type === 'text' ? (
                    <Field label="文字内容 *" id={`pf-item-${index}-content`}><textarea required maxLength={5000} style={markErr(`item-${index}-content`)} value={item.content} onChange={(e) => setItem(index, { content: e.target.value })} />{fieldErr(`item-${index}-content`)}</Field>
                  ) : item.type === 'link' ? (
                    <Field label="网址 *" id={`pf-item-${index}-content`}><input required type="url" placeholder="https://" maxLength={5000} style={markErr(`item-${index}-content`)} value={item.content} onChange={(e) => setItem(index, { content: e.target.value })} />{fieldErr(`item-${index}-content`)}</Field>
                  ) : (
                    <Field label="附件内容 *" id={`pf-item-${index}-content`}>
                      <input type="file" required={!item.attachment_id} accept=".pdf,.docx,.png,.jpg,.jpeg,.txt" style={markErr(`item-${index}-content`)} disabled={uploading || busy} onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadFile(file, index);
                        e.target.value = '';
                      }} />
                      {item.attachment_id && <p className="small">已上传：{attachmentNames[item.attachment_id] || `附件 #${item.attachment_id}`}</p>}
                      {fieldErr(`item-${index}-content`)}
                    </Field>
                  )}
                </div>
              ))}
              <button type="button" className="btn secondary" disabled={uploading || busy || (form.extras.items?.length ?? 0) >= 20} onClick={() => set('extras', {
                ...form.extras, items: [...(form.extras.items ?? []), { title: '', type: 'text', content: '', attachment_id: null }],
              })}>＋ 添加自定义信息</button>
              <p className="small muted">附件支持 PDF、DOCX、PNG、JPG、TXT，每个最多 5 MB。</p>
              {uploading && <p className="small" role="status">附件上传中…</p>}
              {(Object.entries(form.extras).some(([key, value]) => key !== 'items' && key !== 'contact' && Boolean(value)) || form.attachment_id) && <div>
              {(
                [
                  ['eventIntro', '赛事 / 活动介绍'],
                  ['mentor', '导师介绍'],
                  ['outcome', '预期成果'],
                  ['attachmentInfo', '参考资料 / 附件说明'],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  <textarea
                    value={form.extras[key] ?? ''}
                    onChange={(e) => set('extras', { ...form.extras, [key]: e.target.value })}
                  />
                </Field>
              ))}
              {(
                [
                  ['activityLink', '活动链接'],
                  ['attachmentLink', '参考附件链接'],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    type="url"
                    value={form.extras[key] ?? ''}
                    onChange={(e) => set('extras', { ...form.extras, [key]: e.target.value })}
                    placeholder="https://"
                  />
                </Field>
              ))}
              <Field label="上传附件（选填）">
                <input
                  type="file"
                  accept=".pdf,.docx,.png,.jpg,.jpeg,.txt"
                  disabled={uploading || busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadFile(file);
                    e.target.value = '';
                  }}
                />
              </Field>
              <p className="small muted">
                支持 PDF、Word（DOCX）、PNG、JPG、TXT，最多 5 MB；附件会在招募详情中公开下载。
              </p>
              {uploading && (
                <p className="small" role="status">
                  附件上传中…
                </p>
              )}
              {form.attachment_id && (
                <div className="actions">
                  <span className="small">已选：{form.attachment_name || '附件'}</span>
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      set('attachment_id', null);
                      setForm((current) => ({ ...current, attachment_name: '' }));
                    }}
                  >
                    移除附件
                  </button>
                </div>
              )}
              </div>}
            </div>
          </section>
          <aside>
            <div className="panel">
              <div className="eyebrow">A GOOD START</div>
              <h3>明确期待，让合作更轻松</h3>
              <p style={{ marginTop: 15, lineHeight: 2 }}>
                描述一个具体目标。
                <br />
                让每个岗位都有清楚职责。
                <br />
                区分招募截止和活动时间。
                <br />
                减少名额不能低于已录取人数，截止时间只可延长。
              </p>
            </div>
          </aside>
        </div>
        <ErrorNote error={error} />
        <div className="footbar">
          <span className="small muted">
            {edit
              ? '保留原发布时间'
              : `草稿仅自己可见 · ${
                  saveStatus === 'saving'
                    ? '自动保存中…'
                    : saveStatus === 'saved'
                      ? '已自动保存'
                      : saveStatus === 'error'
                        ? `自动保存失败：${autoError}`
                        : saveStatus === 'pending'
                          ? '等待自动保存…'
                          : '修改后自动保存'
                }`}
          </span>
          <div className="actions">
            <Link
              className="btn ghost"
              to="/posts"
              onClick={(event) => {
                event.preventDefault();
                void leaveTo('/posts');
              }}
            >
              返回
            </Link>
            {!edit && (
              <button
                type="button"
                className="btn secondary"
                disabled={busy || uploading}
                onClick={saveDraft}
              >
                手动保存草稿
              </button>
            )}
            <button className="btn" disabled={busy || uploading}>
              {busy ? '保存中…' : edit ? '保存修改' : '正式发布招募'}
            </button>
          </div>
        </div>
      </form>
      {confirmNoRoles && (
        <Modal title={edit ? '确认保存' : '确认发布'} onClose={() => setConfirmNoRoles(false)}>
          <p style={{ margin: '12px 0' }}>
            {edit ? '本次保存后招募将不包含任何岗位，确认保存吗？' : '当前招募未设置岗位，确认发布吗？'}
          </p>
          <p className="small muted">
            未设置岗位的招募无法接收申请（适合通知、问卷类内容），之后可在编辑中补充岗位。
            {edit && ' 已有的申请记录会保留，不受影响。'}
          </p>
          <div className="actions" style={{ marginTop: 20 }}>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setConfirmNoRoles(false);
                document
                  .getElementById('role-section')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              前往设置岗位
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || uploading}
              onClick={() => {
                allowNoRoles.current = true;
                setConfirmNoRoles(false);
                formRef.current?.requestSubmit();
              }}
            >
              {edit ? '确定保存' : '确定发布'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
