import { useState } from 'react'

interface Props {
  value: string[]
  onChange: (tags: string[]) => void
}

export default function TagInput({ value, onChange }: Props) {
  const [input, setInput] = useState('')

  const addTags = () => {
    const tags = input
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean)
    if (tags.length === 0) return
    onChange(Array.from(new Set([...value, ...tags])))
    setInput('')
  }

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag))
  }

  return (
    <div className="tag-input">
      {value.length > 0 && (
        <div className="tag-input-list">
          {value.map((t) => (
            <span
              key={t}
              className="tag tag-removable"
              onClick={() => removeTag(t)}
            >
              {t} ×
            </span>
          ))}
        </div>
      )}
      <input
        className="text-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            addTags()
          }
        }}
        onBlur={addTags}
        placeholder="回车/逗号分隔添加标签"
      />
    </div>
  )
}
