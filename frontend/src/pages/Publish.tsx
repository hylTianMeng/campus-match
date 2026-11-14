import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, useData, write } from '../api';
import { useSession } from '../context';
import type { Draft, Post, PostInput, RoleInput } from '../types';
import { Header, Field, ErrorNote, LoadState, tagsFrom } from '../components/ui';
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
    [revision, setRevision] = useState(0),
    [saveStatus, setSaveStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle'),
    [autoError, setAutoError] = useState(''),
    [postTagText, setPostTagText] = useState(''),
    [roleTagTexts, setRoleTagTexts] = useState<string[]>([]),
    [roleKeys, setRoleKeys] = useState<number[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState('');
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
          if (p.status === 'ended') throw new Error('招募已结束，不能编辑');
          if (active)
            loadForm({
              ...p,
              deadline: localDate(p.deadline),
              event_time: localDate(p.event_time),
              roles: p.roles.map(({ name, capacity, description, tags }) => ({
                name,
                capacity,
                description,
                tags,
              })),
            });
        } else if (sourceDraft) {
          const drafts = await api<Draft[]>('/drafts');
          const draft = drafts.find((d) => d.id === +sourceDraft);
          if (!draft) throw new Error('草稿不存在');
          if (active) loadForm({ ...blankPost(), ...draft.payload }, draft.id);
        } else if (active) loadForm(blankPost());
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
  function persistDraft(snapshot: PostInput, targetRevision: number) {
    const currentScope = scope.current;
    const operation = saveQueue.current.catch(() => {}).then(async () => {
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
    if (busy) return;
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
  if (loading) return <LoadState loading />;
  if (loadError) return <ErrorNote error={loadError} />;
  return (
    <>
      <Header
        title={edit ? '编辑已发布招募' : '让一个想法，找到伙伴'}
        sub={
          edit
            ? '仅保存一般信息；不会改变原发布时间或重新开放招募。'
            : '按岗位描述合作期待。填写时会自动保存为私有草稿。'
        }
      >
        {!edit && (
          <Link className="btn secondary" to="/drafts" onClick={(event) => {
            event.preventDefault();
            void leaveTo('/drafts');
          }}>
            草稿箱
          </Link>
        )}
      </Header>
      {edit && <div className="notice">已发布的分类、截止时间、活动时间及岗位信息已锁定。</div>}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          if (!edit && !form.roles.length) {
            setError('请至少添加一个岗位');
            return;
          }
          setBusy(true);
          publishing.current = true;
          try {
            if (!edit) await saveQueue.current;
            const { title, description, place, tags, extras } = form;
            const body = edit
              ? { title, description, place, tags, extras }
              : {
                  ...form,
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
            if (!edit && revision > savedRevision.current)
              void persistDraft(form, revision).catch(() => {});
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="columns">
          <section>
            <div className="panel">
              <h2>01 / 基本信息</h2>
              <Field label="招募标题 *">
                <input
                  required
                  maxLength={160}
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                />
              </Field>
              <Field label="一级分类 *">
                <select
                  required
                  disabled={edit}
                  value={form.category}
                  onChange={(e) => set('category', e.target.value)}
                >
                  <option value="">请选择分类</option>
                  {categories.data?.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <ErrorNote error={categories.error} />
              <Field label="招募者联系方式（选填）">
                <input
                  value={form.extras.contact ?? ''}
                  onChange={(e) => set('extras', { ...form.extras, contact: e.target.value })}
                />
              </Field>
              <p className="small muted">填写后会在公开招募详情中展示，访客也可查看。</p>
              <Field label="招募说明 *">
                <textarea
                  required
                  rows={6}
                  maxLength={20000}
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="介绍目标、协作方式与投入期待"
                />
              </Field>
            </div>
            <div className="panel">
              <h2>02 / 招募岗位</h2>
              {form.roles.map((r, i) => (
                <div className="roleform" key={roleKeys[i]}>
                  <div className="between">
                    <h3>岗位 {i + 1}</h3>
                    {!edit && (
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
                    <Field label="岗位名称 *">
                      <input
                        required
                        disabled={edit}
                        value={r.name}
                        onChange={(e) => setRole(i, { name: e.target.value })}
                      />
                    </Field>
                    <Field label="招募人数 *">
                      <input
                        required
                        disabled={edit}
                        type="number"
                        min={1}
                        max={100}
                        value={r.capacity}
                        onChange={(e) => setRole(i, { capacity: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="技能标签">
                      <input
                        disabled={edit}
                        value={roleTagTexts[i] ?? ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          setRoleTagTexts((texts) => texts.map((text, j) => j === i ? value : text));
                          setRole(i, { tags: tagsFrom(value) });
                        }}
                      />
                    </Field>
                    <Field label="岗位描述">
                      <textarea
                        disabled={edit}
                        value={r.description}
                        onChange={(e) => setRole(i, { description: e.target.value })}
                      />
                    </Field>
                  </div>
                </div>
              ))}
              {!edit && (
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
            <div className="panel">
              <h2>03 / 时间、地点与标签</h2>
              <div className="formgrid">
                <Field label="招募截止时间 *">
                  <input
                    required
                    disabled={edit}
                    type="datetime-local"
                    value={form.deadline}
                    onChange={(e) => set('deadline', e.target.value)}
                  />
                </Field>
                <Field label="活动时间（选填）">
                  <input
                    disabled={edit}
                    type="datetime-local"
                    value={form.event_time}
                    onChange={(e) => set('event_time', e.target.value)}
                  />
                </Field>
                <Field label="活动地点（选填）">
                  <input value={form.place} onChange={(e) => set('place', e.target.value)} />
                </Field>
                <Field label="招募标签（选填）">
                  <input
                    value={postTagText}
                    onChange={(e) => {
                      setPostTagText(e.target.value);
                      set('tags', tagsFrom(e.target.value));
                    }}
                  />
                </Field>
              </div>
              <p className="small muted">标签用逗号分隔。</p>
            </div>
            <div className="panel">
              <h2>04 / 补充信息（选填）</h2>
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
                发布后名额与截止不能修改。
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
                  saveStatus === 'saving' ? '自动保存中…'
                  : saveStatus === 'saved' ? '已自动保存'
                  : saveStatus === 'error' ? `自动保存失败：${autoError}`
                  : saveStatus === 'pending' ? '等待自动保存…'
                  : '修改后自动保存'
                }`}
          </span>
          <div className="actions">
            <Link className="btn ghost" to="/posts" onClick={(event) => {
              event.preventDefault();
              void leaveTo('/posts');
            }}>
              返回
            </Link>
            {!edit && (
              <button type="button" className="btn secondary" disabled={busy} onClick={saveDraft}>
                手动保存草稿
              </button>
            )}
            <button className="btn" disabled={busy}>
              {busy ? '保存中…' : edit ? '保存一般信息' : '正式发布招募'}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
