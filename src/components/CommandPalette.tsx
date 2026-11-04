import { useEffect, useMemo, useRef, useState } from 'react'

export interface PaletteItem {
  id: string
  label: string
  hint?: string
  run: () => void
}

interface Props {
  items: PaletteItem[]
  onClose: () => void
}

export function CommandPalette({ items, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const list = useMemo(() => {
    const key = query.trim().toLowerCase()
    const matched = key ? items.filter((i) => i.label.toLowerCase().includes(key)) : items
    return matched.slice(0, 8)
  }, [query, items])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setIndex(0)
  }, [query])

  const run = (i: number) => {
    const item = list[i]
    if (!item) return
    onClose()
    item.run()
  }

  return (
    <>
      <div className="palette__scrim" onPointerDown={onClose} />
      <div className="palette" role="dialog" aria-label="命令面板">
        <input
          ref={inputRef}
          className="palette__input"
          value={query}
          placeholder="输入命令或搜索课件…"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIndex((v) => (v + 1) % Math.max(1, list.length))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIndex((v) => (v - 1 + list.length) % Math.max(1, list.length))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              run(index)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
        />
        <div className="palette__list">
          {list.length === 0 && <div className="palette__empty">没有匹配的命令</div>}
          {list.map((item, i) => (
            <div
              key={item.id}
              className="palette__item"
              data-active={i === index}
              onPointerDown={(e) => {
                e.preventDefault()
                run(i)
              }}
              onMouseEnter={() => setIndex(i)}
            >
              {item.label}
              {item.hint && <span className="kbd">{item.hint}</span>}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
