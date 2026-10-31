import { useEffect, useState } from 'react';
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
    [draftId, setDraftId] = useState<number | undefined>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState('');
  const categories = useData<string[]>('/categories');
  const edit = Boolean(id);
  const sourceDraft = params.get('draft');
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    setDraftId(undefined);
    const load = async () => {
      try {
        if (id) {
          const p = await api<Post>('/posts/' + id);
          if (active)
            setForm({
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
          if (active) {
            setForm({ ...blankPost(), ...draft.payload });
            setDraftId(draft.id);
          }
        } else if (active) setForm(blankPost());
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
  const set = <K extends keyof PostInput>(key: K, value: PostInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const setRole = (index: number, values: Partial<RoleInput>) =>
    set(
      'roles',
      form.roles.map((r, i) => (i === index ? { ...r, ...values } : r)),
    );
  async function saveDraft() {
    setBusy(true);
    setError('');
    try {
      const saved = await write<{ id: number }>(
        draftId ? '/drafts/' + draftId : '/drafts',
        draftId ? 'PUT' : 'POST',
        { payload: form },
      );
      setDraftId(saved.id);
      toast('草稿已保存');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
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
            : '按岗位描述合作期待。草稿由你手动保存。'
        }
      >
        {!edit && (
          <Link className="btn secondary" to="/drafts">
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
          try {
            const { title, description, place, tags, extras } = form;
            const body = edit
              ? { title, description, place, tags, extras }
              : {
                  ...form,
                  deadline: new Date(form.deadline).toISOString(),
                  event_time: form.event_time ? new Date(form.event_time).toISOString() : '',
                  draft_id: draftId,
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
                <div className="roleform" key={i}>
                  <div className="between">
                    <h3>岗位 {i + 1}</h3>
                    {!edit && (
                      <button
                        className="link"
                        type="button"
                        onClick={() =>
                          set(
                            'roles',
                            form.roles.filter((_, j) => i !== j),
                          )
                        }
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
                        defaultValue={r.tags.join(', ')}
                        onBlur={(e) => setRole(i, { tags: tagsFrom(e.target.value) })}
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
                    onClick={() => set('roles', [...form.roles, blankRole()])}
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
                    defaultValue={form.tags.join(', ')}
                    onBlur={(e) => set('tags', tagsFrom(e.target.value))}
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
            {edit ? '保留原发布时间' : '草稿仅自己可见 · 正式发布后直接公开'}
          </span>
          <div className="actions">
            <Link className="btn ghost" to="/posts">
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
