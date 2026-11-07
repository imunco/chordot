import { useEffect, useRef, useState } from 'react'

/**
 * 全屏批注层。
 *
 * 和画布里的笔不同，这一层盖在整个教材窗口上：动画、读数、说明都能直接圈画。
 * 坐标用窗口 CSS 像素，不随实验切换保留（LabDetail 重新挂载即清空）。
 */

interface Point {
  x: number
  y: number
}

interface InkStroke {
  id: string
  color: string
  width: number
  pts: Point[]
}

const COLORS = ['#c0392b', '#2f6fa8', '#1f1f1d', '#4f8a3d', '#b08a3e']
const WIDTHS = [4, 7, 10]

/** 中点二次曲线：比逐点折线顺滑，又不需要引入额外依赖 */
function inkPath(pts: Point[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) {
    const p = pts[0]
    return `M ${p.x} ${p.y} l 0.1 0`
  }
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]
    const q = pts[i + 1]
    const mx = (p.x + q.x) / 2
    const my = (p.y + q.y) / 2
    d += ` Q ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`
  }
  const last = pts[pts.length - 1]
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`
  return d
}

export function ScreenInk({ active, onExit }: { active: boolean; onExit: () => void }) {
  const [strokes, setStrokes] = useState<InkStroke[]>([])
  const [past, setPast] = useState<InkStroke[][]>([])
  const [draft, setDraft] = useState<InkStroke | null>(null)
  const [color, setColor] = useState(COLORS[0])
  const [width, setWidth] = useState(WIDTHS[1])
  const [eraser, setEraser] = useState(false)
  const drawing = useRef(false)
  const draftRef = useRef<InkStroke | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const point = (e: React.PointerEvent): Point => {
    const r = rootRef.current?.getBoundingClientRect()
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) }
  }

  const pushHistory = (snapshot = strokes) => {
    setPast((prev) => [...prev.slice(-40), snapshot])
  }

  const eraseAt = (p: Point) => {
    const radius = 18
    setStrokes((prev) =>
      prev.filter((s) => !s.pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= radius)),
    )
  }

  const down = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.preventDefault()
    e.stopPropagation()
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* 合成事件没有活动指针，忽略 */
    }
    drawing.current = true
    const p = point(e)
    if (eraser) {
      pushHistory()
      eraseAt(p)
      return
    }
    const next: InkStroke = {
      id: `ink-${Date.now().toString(36)}`,
      color,
      width,
      pts: [p],
    }
    draftRef.current = next
    setDraft(next)
  }

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return
    e.preventDefault()
    const p = point(e)
    if (eraser) {
      eraseAt(p)
      return
    }
    const cur = draftRef.current
    if (!cur) return
    const last = cur.pts[cur.pts.length - 1]
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 1.2) return
    const next = { ...cur, pts: [...cur.pts, p] }
    draftRef.current = next
    setDraft(next)
  }

  const up = (e: React.PointerEvent) => {
    if (!drawing.current) return
    drawing.current = false
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* 指针已经离开窗口时 release 会抛，忽略 */
    }
    if (eraser) return
    const cur = draftRef.current
    if (cur && cur.pts.length > 0) {
      setPast((prev) => [...prev.slice(-40), strokes])
      setStrokes((prev) => [...prev, cur])
    }
    draftRef.current = null
    setDraft(null)
  }

  const undo = () => {
    if (past.length === 0) return
    setStrokes(past[past.length - 1])
    setPast(past.slice(0, -1))
  }

  const clear = () => {
    if (strokes.length === 0) return
    pushHistory()
    setStrokes([])
  }

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onExit()
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault()
        e.stopPropagation()
        onExit()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  if (!active) return null

  return (
    <div
      className={`screenink ${eraser ? 'screenink--eraser' : ''}`}
      ref={rootRef}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      role="application"
      aria-label="全屏批注"
    >
      <svg className="screenink__canvas" aria-hidden="true">
        {strokes.map((s) => (
          <path
            key={s.id}
            d={inkPath(s.pts)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {draft && (
          <path
            d={inkPath(draft.pts)}
            fill="none"
            stroke={draft.color}
            strokeWidth={draft.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>

      <div className="screenink__bar" onPointerDown={(e) => e.stopPropagation()}>
        <div className="screenink__colors" aria-label="批注颜色">
          {COLORS.map((c) => (
            <button
              key={c}
              className="screenink__color"
              data-active={!eraser && color === c}
              style={{ background: c }}
              title={`颜色 ${c}`}
              onClick={() => {
                setColor(c)
                setEraser(false)
              }}
            />
          ))}
        </div>
        <div className="screenink__widths" aria-label="笔画粗细">
          {WIDTHS.map((w) => (
            <button
              key={w}
              className="screenink__width"
              data-active={!eraser && width === w}
              title={`笔画 ${w}px`}
              onClick={() => {
                setWidth(w)
                setEraser(false)
              }}
            >
              <i style={{ width: w + 2, height: w + 2 }} />
            </button>
          ))}
        </div>
        <button
          className="screenink__tool"
          data-active={eraser}
          onClick={() => setEraser((v) => !v)}
          title="橡皮"
        >
          橡皮
        </button>
        <button className="screenink__tool" onClick={undo} disabled={past.length === 0} title="撤销 Ctrl+Z">
          撤销
        </button>
        <button className="screenink__tool" onClick={clear} disabled={strokes.length === 0} title="清空批注">
          清空
        </button>
        <button className="screenink__exit" onClick={onExit} title="退出批注 Esc">
          退出批注
        </button>
      </div>
    </div>
  )
}
