import { useEffect, useRef, useState } from 'react';
import { write } from '../api';
import type { ProfileResource } from '../types';
import { ErrorNote, Field } from './ui';

export function ProfileResources({
  value,
  onChange,
  busy,
  onUploading,
}: {
  value: ProfileResource[];
  onChange: (items: ProfileResource[]) => void;
  busy: boolean;
  onUploading: (uploading: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  function update(index: number, patch: Partial<ProfileResource>) {
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }
  async function upload(file: File, index: number) {
    if (!file.size || file.size > 5 * 1024 * 1024) {
      setError('附件不能为空，且大小不能超过 5 MB');
      return;
    }
    setUploading(true);
    onUploading(true);
    setError('');
    try {
      const encoded = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(new Error('读取文件失败'));
        reader.readAsDataURL(file);
      });
      if (!active.current) return;
      const uploaded = await write<{ id: number; filename: string }>(
        '/auth/me/attachments',
        'POST',
        {
          filename: file.name,
          content_base64: encoded,
        },
      );
      if (active.current)
        update(index, { attachment_id: uploaded.id, filename: uploaded.filename });
    } catch (e) {
      if (active.current) setError((e as Error).message);
    } finally {
      if (active.current) {
        setUploading(false);
        onUploading(false);
      }
    }
  }
  return (
    <>
      <h2>网页与附件（选填）</h2>
      <p className="small muted">
        可添加个人主页、作品集或介绍附件。保存后将在对外主页展示，供已完成校园认证的同学查看和下载。
      </p>
      <fieldset
        disabled={busy || uploading}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        {value.map((item, index) => (
          <div className="roleform" key={index}>
            <div className="between">
              <h3>资料 {index + 1}</h3>
              <button
                type="button"
                className="link"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                移除资料
              </button>
            </div>
            <Field label="资料标题 *" id={`profile-resource-${index}-title`}>
              <input
                required
                maxLength={100}
                placeholder="如：个人主页、作品集"
                value={item.title}
                onChange={(e) => update(index, { title: e.target.value })}
              />
            </Field>
            <Field label="资料类型" id={`profile-resource-${index}-type`}>
              <select
                value={item.type}
                onChange={(e) =>
                  update(index, {
                    type: e.target.value as ProfileResource['type'],
                    content: '',
                    attachment_id: null,
                    filename: undefined,
                  })
                }
              >
                <option value="link">网页链接</option>
                <option value="attachment">附件</option>
              </select>
            </Field>
            {item.type === 'link' ? (
              <Field label="网页地址 *" id={`profile-resource-${index}-url`}>
                <input
                  required
                  type="url"
                  pattern="https?://.+"
                  maxLength={5000}
                  placeholder="https://"
                  value={item.content}
                  onChange={(e) => update(index, { content: e.target.value })}
                />
              </Field>
            ) : (
              <Field label="附件 *" id={`profile-resource-${index}-file`}>
                <input
                  type="file"
                  required={!item.attachment_id}
                  accept=".pdf,.docx,.png,.jpg,.jpeg,.txt"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(file, index);
                    e.target.value = '';
                  }}
                />
                {item.attachment_id && <p className="small">已上传：{item.filename}</p>}
              </Field>
            )}
          </div>
        ))}
        <button
          type="button"
          className="btn secondary"
          disabled={value.length >= 20}
          onClick={() =>
            onChange([...value, { title: '', type: 'link', content: '', attachment_id: null }])
          }
        >
          ＋ 添加网页或附件
        </button>
      </fieldset>
      <p className="small muted">
        最多 20 项；附件支持 PDF、DOCX、PNG、JPG、TXT，每个最多 5 MB。移除后需保存生效。
      </p>
      {uploading && (
        <p className="small" role="status">
          附件上传中…
        </p>
      )}
      <ErrorNote error={error} />
    </>
  );
}
