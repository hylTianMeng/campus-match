import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { recruitmentApi } from '../../api/recruitment'
import TagInput from '../../components/domain/TagInput'
import { useRecruitment } from '../../hooks/useRecruitment'
import { BizError } from '../../types/api'
import type {
  PositionIn,
  RecruitmentCreateRequest,
  RecruitmentUpdateRequest,
} from '../../types/recruitment'

interface PositionDraft {
  id?: number
  name: string
  capacity: number
  description: string
}

export default function RecruitmentNewPage() {
  const { id } = useParams()
  const rid = id ? Number(id) : undefined
  const isEdit = rid != null
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: existing } = useRecruitment(rid)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [activityTime, setActivityTime] = useState('')
  const [deadline, setDeadline] = useState(
    dayjs().add(7, 'day').format('YYYY-MM-DDTHH:mm'),
  )
  const [tags, setTags] = useState<string[]>([])
  const [positions, setPositions] = useState<PositionDraft[]>([])
  const [newPos, setNewPos] = useState<PositionDraft>({
    name: '',
    capacity: 1,
    description: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (isEdit && existing && !loaded) {
      setTitle(existing.title)
      setDescription(existing.description)
      setLocation(existing.location ?? '')
      setActivityTime(existing.activity_time ?? '')
      setDeadline(dayjs(existing.deadline_at).format('YYYY-MM-DDTHH:mm'))
      setTags(existing.tags)
      setPositions(
        existing.positions.map((p) => ({
          id: p.id,
          name: p.name,
          capacity: p.capacity,
          description: p.description ?? '',
        })),
      )
      setLoaded(true)
    }
  }, [isEdit, existing, loaded])

  const isDraft = isEdit && existing != null && existing.status === 'draft'

  const updatePosition = (idx: number, patch: Partial<PositionDraft>) => {
    setPositions((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    )
  }

  const addLocalPosition = () => {
    setPositions((prev) => [
      ...prev,
      { name: '', capacity: 1, description: '' },
    ])
  }

  const removeLocalPosition = (idx: number) => {
    setPositions((prev) => prev.filter((_, i) => i !== idx))
  }

  const buildGeneral = (): RecruitmentUpdateRequest => ({
    title,
    description,
    location: location || undefined,
    activity_time: activityTime || undefined,
    deadline_at: isEdit ? deadline : undefined,
    tags,
  })

  const submit = async (asOpen: boolean) => {
    setError('')
    setLoading(true)
    try {
      if (isEdit) {
        await recruitmentApi.update(rid as number, buildGeneral())
        if (asOpen) {
          await recruitmentApi.publish(rid as number)
        }
        qc.invalidateQueries({ queryKey: ['recruitment', rid] })
        qc.invalidateQueries({ queryKey: ['recruitments'] })
        navigate('/app/recruitments/mine')
      } else {
        const positionList: PositionIn[] = positions.map((p) => ({
          name: p.name,
          capacity: Number(p.capacity),
          description: p.description || undefined,
        }))
        const payload: RecruitmentCreateRequest = {
          title,
          description,
          location: location || undefined,
          activity_time: activityTime || undefined,
          deadline_at: deadline,
          status: asOpen ? 'open' : 'draft',
          tags,
          positions: positionList,
        }
        const created = await recruitmentApi.create(payload)
        navigate(`/recruitments/${created.id}`)
      }
    } catch (err) {
      setError(err instanceof BizError ? err.message : '操作失败')
    } finally {
      setLoading(false)
    }
  }

  const addPositionToExisting = async () => {
    setError('')
    try {
      await recruitmentApi.addPosition(rid as number, {
        name: newPos.name,
        capacity: Number(newPos.capacity),
        description: newPos.description || undefined,
      })
      setNewPos({ name: '', capacity: 1, description: '' })
      qc.invalidateQueries({ queryKey: ['recruitment', rid] })
    } catch (err) {
      setError(err instanceof BizError ? err.message : '新增岗位失败')
    }
  }

  const removeExistingPosition = async (positionId: number) => {
    setError('')
    try {
      await recruitmentApi.removePosition(rid as number, positionId)
      qc.invalidateQueries({ queryKey: ['recruitment', rid] })
    } catch (err) {
      setError(err instanceof BizError ? err.message : '删除岗位失败')
    }
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    submit(false)
  }

  return (
    <div className="page-container narrow-page">
      <h1 className="page-title">{isEdit ? '编辑招募' : '新建招募'}</h1>

      {isEdit && !isDraft && (
        <div className="notice-box">仅草稿可编辑；已发布/已结束的招募不可在此编辑</div>
      )}

      <form className="form-stack" onSubmit={handleSubmit}>
        <label className="field">
          <span>标题</span>
          <input
            className="text-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="招募标题"
            required
            disabled={isEdit && !isDraft}
          />
        </label>

        <label className="field">
          <span>描述</span>
          <textarea
            className="text-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="介绍一下项目/活动"
            rows={4}
            required
            disabled={isEdit && !isDraft}
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span>地点</span>
            <input
              className="text-input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="可选"
              disabled={isEdit && !isDraft}
            />
          </label>
          <label className="field">
            <span>活动时间</span>
            <input
              className="text-input"
              value={activityTime}
              onChange={(e) => setActivityTime(e.target.value)}
              placeholder="可选"
              disabled={isEdit && !isDraft}
            />
          </label>
        </div>

        <label className="field">
          <span>截止时间</span>
          <input
            className="text-input"
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            required
            disabled={isEdit && !isDraft}
          />
        </label>

        <label className="field">
          <span>标签</span>
          <TagInput value={tags} onChange={setTags} />
        </label>

        <div className="field">
          <span>岗位</span>
          {!isEdit && (
            <div className="position-editor">
              {positions.map((p, idx) => (
                <div key={idx} className="position-editor-row">
                  <input
                    className="text-input"
                    value={p.name}
                    onChange={(e) => updatePosition(idx, { name: e.target.value })}
                    placeholder="岗位名称"
                  />
                  <input
                    className="text-input text-input-sm"
                    type="number"
                    min={1}
                    value={p.capacity}
                    onChange={(e) =>
                      updatePosition(idx, { capacity: Number(e.target.value) })
                    }
                    placeholder="名额"
                  />
                  <input
                    className="text-input"
                    value={p.description}
                    onChange={(e) =>
                      updatePosition(idx, { description: e.target.value })
                    }
                    placeholder="岗位说明（可选）"
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => removeLocalPosition(idx)}
                  >
                    删除
                  </button>
                </div>
              ))}
              <button type="button" className="btn" onClick={addLocalPosition}>
                + 添加岗位
              </button>
            </div>
          )}

          {isEdit && (
            <div className="position-editor">
              {positions.map((p) => (
                <div key={p.id} className="position-editor-row position-editor-readonly">
                  <span>{p.name}</span>
                  <span>名额 {p.capacity}</span>
                  <span>{p.description || '无说明'}</span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={!isDraft}
                    onClick={() => removeExistingPosition(p.id as number)}
                  >
                    删除
                  </button>
                </div>
              ))}
              <div className="position-editor-row">
                <input
                  className="text-input"
                  value={newPos.name}
                  onChange={(e) => setNewPos({ ...newPos, name: e.target.value })}
                  placeholder="新岗位名称"
                />
                <input
                  className="text-input text-input-sm"
                  type="number"
                  min={1}
                  value={newPos.capacity}
                  onChange={(e) =>
                    setNewPos({ ...newPos, capacity: Number(e.target.value) })
                  }
                />
                <input
                  className="text-input"
                  value={newPos.description}
                  onChange={(e) =>
                    setNewPos({ ...newPos, description: e.target.value })
                  }
                  placeholder="岗位说明（可选）"
                />
                <button
                  type="button"
                  className="btn"
                  disabled={!isDraft || !newPos.name}
                  onClick={addPositionToExisting}
                >
                  新增
                </button>
              </div>
            </div>
          )}
        </div>

        {error && <div className="error-text">{error}</div>}

        <div className="btn-row">
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? '保存中…' : isEdit ? '保存草稿' : '存草稿'}
          </button>
          {!isEdit && (
            <button
              className="btn btn-primary"
              type="button"
              disabled={loading}
              onClick={() => submit(true)}
            >
              直接发布
            </button>
          )}
          {isEdit && isDraft && (
            <button
              className="btn btn-primary"
              type="button"
              disabled={loading}
              onClick={() => submit(true)}
            >
              保存并发布
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
