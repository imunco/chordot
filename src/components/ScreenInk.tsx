import { useEffect, useRef, useState } from 'react'

/**
 * 全屏批注层。
 *
 * 和画布里的笔不同，这一层盖在整个教材窗口上：动画、读数、说明都能直接圈画。
 *
 * 坐标一律存**归一化值**（0..1，相对窗口），窗口缩放 / 换分辨率后按比例重映射，
 * 笔迹不会和内容错位；笔迹粗细同样按窗口宽度归一化（REF_W 宽时的像素值）。
 *
 * 0.10.2 起：退出批注不再清空画面（笔迹留在屏幕上，可一键隐藏）；
 * 支持选择工具（点选 / 框选、拖动、角点缩放）、单笔淡出、按实验持久化。
 */

interface Point {
  x: number
  y: number
}

export interface InkStroke {
  id: string
  color: string
  /** 归一化粗细：REF_W 宽窗口下的像素值 */
  width: number
  /** 淡出程度：1 / 0.55 / 0.25 */
  alpha: number
  /** 归一化坐标 0..1 */
  pts: Point[]
}

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

type Tool = 'pen' | 'eraser' | 'select'
type Corner = 'nw' | 'ne' | 'sw' | 'se'

const COLORS = ['#c0392b', '#2f6fa8', '#1f1f1d', '#4f8a3d', '#b08a3e']
const WIDTHS = [4, 7, 10]
const ALPHAS = [1, 0.55, 0.25]
/** 粗细的参考窗口宽度：1000px 窗口下 4 / 7 / 10px */
const REF_W = 1000
const KEY_PREFIX = 'chordot.lab.ink.'
const ERASER_R = 18
const HIT_R = 10

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

/* ───────── 持久化 ───────── */

function isPoint(v: unknown): v is Point {
  const p = v as Point
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y)
}

/** 读回批注：坏数据直接丢掉，别让一条脏记录把整层批注清空 */
export function loadStrokes(key: string): InkStroke[] {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + key)
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.flatMap((item) => {
      const s = item as InkStroke
      if (!s || typeof s.id !== 'string' || !Array.isArray(s.pts)) return []
      const pts = s.pts.filter(isPoint).map((p) => ({
        x: Math.min(1, Math.max(0, p.x)),
        y: Math.min(1, Math.max(0, p.y)),
      }))
      if (pts.length === 0) return []
      return [
        {
          id: s.id,
          color: typeof s.color === 'string' ? s.color : COLORS[0],
          width: Number.isFinite(s.width) && s.width > 0 ? s.width : WIDTHS[1] / REF_W,
          alpha: ALPHAS.includes(s.alpha) ? s.alpha : 1,
          pts,
        },
      ]
    })
  } catch {
    return []
  }
}

/* ───────── 几何 ───────── */

function bboxOf(strokes: InkStroke[], ids: string[]): Box | null {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  let found = false
  for (const s of strokes) {
    if (!ids.includes(s.id)) continue
    for (const p of s.pts) {
      found = true
      if (p.x < x0) x0 = p.x
      if (p.y < y0) y0 = p.y
      if (p.x > x1) x1 = p.x
      if (p.y > y1) y1 = p.y
    }
  }
  return found ? { x0, y0, x1, y1 } : null
}

function distToSegment(p: Point, a: Point, b: Point, w: number, h: number): number {
  const ax = a.x * w
  const ay = a.y * h
  const bx = b.x * w
  const by = b.y * h
  const px = p.x * w
  const py = p.y * h
  const dx = bx - ax
  const dy = by - ay
  const len = dx * dx + dy * dy
  const t = len > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}

function distToStroke(s: InkStroke, p: Point, w: number, h: number): number {
  if (s.pts.length === 1) return Math.hypot((s.pts[0].x - p.x) * w, (s.pts[0].y - p.y) * h)
  let best = Infinity
  for (let i = 1; i < s.pts.length; i++) {
    best = Math.min(best, distToSegment(p, s.pts[i - 1], s.pts[i], w, h))
  }
  return best
}

const cornerPoint = (b: Box, c: Corner): Point => ({
  x: c === 'nw' || c === 'sw' ? b.x0 : b.x1,
  y: c === 'nw' || c === 'ne' ? b.y0 : b.y1,
})

const OPPOSITE: Record<Corner, Corner> = { nw: 'se', ne: 'sw', sw: 'ne', se: 'nw' }

function insideBox(b: Box, p: Point, pad = 0): boolean {
  return p.x >= b.x0 - pad && p.x <= b.x1 + pad && p.y >= b.y0 - pad && p.y <= b.y1 + pad
}

/* ───────── 组件 ───────── */

interface Gesture {
  mode: 'pen' | 'eraser' | 'move' | 'scale' | 'marquee'
  start: Point
  base: InkStroke[]
  ids: string[]
  box?: Box
  corner?: Corner
  anchor?: Point
}

interface Props {
  active: boolean
  /** 每个实验一份批注：chordot.lab.ink.<key> */
  storageKey: string
  /** 手动隐藏（笔迹仍留在内存里，随时可以显示回来） */
  hidden?: boolean
  onExit: () => void
  onHide?: () => void
  onCount?: (n: number) => void
}

export function ScreenInk({ active, storageKey, hidden = false, onExit, onHide, onCount }: Props) {
  const [strokes, setStrokes] = useState<InkStroke[]>(() => loadStrokes(storageKey))
  const [past, setPast] = useState<InkStroke[][]>([])
  const [draft, setDraft] = useState<InkStroke | null>(null)
  const [color, setColor] = useState(COLORS[0])
  const [width, setWidth] = useState(WIDTHS[1])
  const [tool, setTool] = useState<Tool>('pen')
  const [sel, setSel] = useState<string[]>([])
  const [marquee, setMarquee] = useState<Box | null>(null)
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))

  const rootRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef<InkStroke | null>(null)
  const gesture = useRef<Gesture | null>(null)
  /** 框选矩形也放一份 ref：pointerup 里读 state 可能拿到上一帧 */
  const marqueeRef = useRef<Box | null>(null)
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes
  const selRef = useRef(sel)
  selRef.current = sel
  const countRef = useRef(onCount)
  countRef.current = onCount

  /* 窗口尺寸：归一化坐标靠它还原成像素 */
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  /** 上一次改动来自另一个窗口：不要再写回去，否则两边会互相触发、无限对写 */
  const skipSave = useRef(false)

  /* 落盘：改完 350ms 再写，一次拖动不会写几十遍 */
  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false
      return
    }
    const t = setTimeout(() => {
      try {
        localStorage.setItem(KEY_PREFIX + storageKey, JSON.stringify(strokes))
      } catch {
        /* 隐私模式静默失败 */
      }
    }, 350)
    return () => clearTimeout(t)
  }, [strokes, storageKey])

  /* 关掉教材 / 换实验时立刻补写一次：防抖还没到点就卸载，最后一笔会丢 */
  useEffect(() => {
    return () => {
      try {
        localStorage.setItem(KEY_PREFIX + storageKey, JSON.stringify(strokesRef.current))
      } catch {
        /* 隐私模式静默失败 */
      }
    }
  }, [storageKey])

  /* 另一个窗口改了同一份批注：跟过去，双屏两边看到的是同一块黑板 */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY_PREFIX + storageKey) return
      skipSave.current = true
      setStrokes(loadStrokes(storageKey))
      setPast([])
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [storageKey])

  useEffect(() => {
    countRef.current?.(strokes.length)
  }, [strokes.length])

  const norm = (e: React.PointerEvent): Point => {
    const r = rootRef.current?.getBoundingClientRect()
    const w = r?.width || size.w
    const h = r?.height || size.h
    return { x: (e.clientX - (r?.left ?? 0)) / w, y: (e.clientY - (r?.top ?? 0)) / h }
  }

  const pushHistory = (snapshot: InkStroke[] = strokesRef.current) => {
    setPast((prev) => [...prev.slice(-40), snapshot])
  }

  const eraseAt = (p: Point) => {
    setStrokes((prev) =>
      prev.filter(
        (s) =>
          !s.pts.some((q) => Math.hypot((q.x - p.x) * size.w, (q.y - p.y) * size.h) <= ERASER_R),
      ),
    )
  }

  const hitStroke = (p: Point, list: InkStroke[]): InkStroke | null => {
    // 后画的在上层，命中时优先选它
    for (let i = list.length - 1; i >= 0; i--) {
      if (distToStroke(list[i], p, size.w, size.h) <= HIT_R) return list[i]
    }
    return null
  }

  const hitCorner = (b: Box, p: Point): Corner | null => {
    for (const c of ['nw', 'ne', 'sw', 'se'] as Corner[]) {
      const q = cornerPoint(b, c)
      if (Math.hypot((q.x - p.x) * size.w, (q.y - p.y) * size.h) <= 14) return c
    }
    return null
  }

  const down = (e: React.PointerEvent) => {
    if (!active) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.preventDefault()
    e.stopPropagation()
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* 合成事件没有活动指针，忽略 */
    }
    const p = norm(e)

    if (tool === 'select') {
      const list = strokesRef.current
      const box = bboxOf(list, selRef.current)
      if (box) {
        const corner = hitCorner(box, p)
        if (corner) {
          pushHistory(list)
          gesture.current = {
            mode: 'scale',
            start: p,
            base: list,
            ids: [...selRef.current],
            box,
            corner,
            anchor: cornerPoint(box, OPPOSITE[corner]),
          }
          return
        }
        if (insideBox(box, p, 6 / Math.max(1, size.w))) {
          pushHistory(list)
          gesture.current = { mode: 'move', start: p, base: list, ids: [...selRef.current] }
          return
        }
      }
      const hit = hitStroke(p, list)
      if (hit) {
        setSel([hit.id])
        pushHistory(list)
        gesture.current = { mode: 'move', start: p, base: list, ids: [hit.id] }
        return
      }
      setSel([])
      gesture.current = { mode: 'marquee', start: p, base: list, ids: [] }
      marqueeRef.current = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }
      setMarquee(marqueeRef.current)
      return
    }

    if (tool === 'eraser') {
      pushHistory()
      gesture.current = { mode: 'eraser', start: p, base: [], ids: [] }
      eraseAt(p)
      return
    }

    const next: InkStroke = {
      id: `ink-${Date.now().toString(36)}-${Math.round(p.x * 1e4)}`,
      color,
      width: width / REF_W,
      alpha: 1,
      pts: [p],
    }
    draftRef.current = next
    setDraft(next)
    gesture.current = { mode: 'pen', start: p, base: [], ids: [] }
  }

  const move = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!active || !g) return
    e.preventDefault()
    const p = norm(e)

    if (g.mode === 'pen') {
      const cur = draftRef.current
      if (!cur) return
      const last = cur.pts[cur.pts.length - 1]
      if (last && Math.hypot((p.x - last.x) * size.w, (p.y - last.y) * size.h) < 1.2) return
      const next = { ...cur, pts: [...cur.pts, p] }
      draftRef.current = next
      setDraft(next)
      return
    }

    if (g.mode === 'eraser') {
      eraseAt(p)
      return
    }

    if (g.mode === 'marquee') {
      marqueeRef.current = { x0: g.start.x, y0: g.start.y, x1: p.x, y1: p.y }
      setMarquee(marqueeRef.current)
      return
    }

    if (g.mode === 'move') {
      const dx = p.x - g.start.x
      const dy = p.y - g.start.y
      setStrokes(
        g.base.map((s) =>
          g.ids.includes(s.id)
            ? { ...s, pts: s.pts.map((q) => ({ x: q.x + dx, y: q.y + dy })) }
            : s,
        ),
      )
      return
    }

    if (g.mode === 'scale' && g.box && g.corner && g.anchor) {
      const c0 = cornerPoint(g.box, g.corner)
      const ax = g.anchor.x
      const ay = g.anchor.y
      const spanX = c0.x - ax
      const spanY = c0.y - ay
      const sx = Math.abs(spanX) < 1e-4 ? 1 : Math.max(0.15, Math.min(8, (p.x - ax) / spanX))
      const sy = Math.abs(spanY) < 1e-4 ? 1 : Math.max(0.15, Math.min(8, (p.y - ay) / spanY))
      setStrokes(
        g.base.map((s) =>
          g.ids.includes(s.id)
            ? {
                ...s,
                pts: s.pts.map((q) => ({ x: ax + (q.x - ax) * sx, y: ay + (q.y - ay) * sy })),
              }
            : s,
        ),
      )
    }
  }

  const up = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!g) return
    gesture.current = null
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* 指针已经离开窗口时 release 会抛，忽略 */
    }

    if (g.mode === 'pen') {
      const cur = draftRef.current
      if (cur && cur.pts.length > 0) {
        pushHistory()
        setStrokes((prev) => [...prev, cur])
      }
      draftRef.current = null
      setDraft(null)
      return
    }

    if (g.mode === 'marquee') {
      const rect = marqueeRef.current
      marqueeRef.current = null
      setMarquee(null)
      if (!rect) return
      const x0 = Math.min(rect.x0, rect.x1)
      const x1 = Math.max(rect.x0, rect.x1)
      const y0 = Math.min(rect.y0, rect.y1)
      const y1 = Math.max(rect.y0, rect.y1)
      const hits = g.base
        .filter((s) => s.pts.some((q) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1))
        .map((s) => s.id)
      setSel(hits)
    }
  }

  const undo = () => {
    if (past.length === 0) return
    setStrokes(past[past.length - 1])
    setPast(past.slice(0, -1))
    setSel([])
  }

  const clear = () => {
    if (strokes.length === 0) return
    pushHistory()
    setStrokes([])
    setSel([])
  }

  const fade = () => {
    const ids = sel.length > 0 ? sel : strokes.map((s) => s.id)
    if (ids.length === 0) return
    pushHistory()
    // 1 → 0.55 → 0.25 → 1：课堂上点一下就知道「这段先放淡」
    const cur = strokes.find((s) => ids.includes(s.id))?.alpha ?? 1
    const nextAlpha = ALPHAS[(ALPHAS.indexOf(cur) + 1) % ALPHAS.length]
    setStrokes((prev) =>
      prev.map((s) => (ids.includes(s.id) ? { ...s, alpha: nextAlpha } : s)),
    )
  }

  const removeSelected = () => {
    if (sel.length === 0) return
    pushHistory()
    setStrokes((prev) => prev.filter((s) => !sel.includes(s.id)))
    setSel([])
  }

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (selRef.current.length > 0) {
          setSel([])
          return
        }
        onExit()
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault()
        e.stopPropagation()
        onExit()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selRef.current.length === 0) return
        e.preventDefault()
        removeSelected()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  if (hidden || (!active && strokes.length === 0)) return null

  const W = size.w
  const H = size.h
  const toPx = (pts: Point[]) => pts.map((p) => ({ x: p.x * W, y: p.y * H }))
  const selBox = bboxOf(strokes, sel)
  const selPad = 6

  return (
    <div
      className={`screenink ${active ? 'screenink--active' : 'screenink--passive'} ${
        tool === 'eraser' ? 'screenink--eraser' : ''
      } ${tool === 'select' ? 'screenink--select' : ''}`}
      ref={rootRef}
      data-active={active}
      data-count={strokes.length}
      data-sel={sel.length}
      onPointerDown={active ? down : undefined}
      onPointerMove={active ? move : undefined}
      onPointerUp={active ? up : undefined}
      onPointerCancel={active ? up : undefined}
      role={active ? 'application' : undefined}
      aria-label={active ? '全屏批注' : undefined}
    >
      <svg className="screenink__canvas" aria-hidden="true">
        {strokes.map((s) => (
          <path
            key={s.id}
            d={inkPath(toPx(s.pts))}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width * W}
            strokeOpacity={s.alpha}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {draft && (
          <path
            d={inkPath(toPx(draft.pts))}
            fill="none"
            stroke={draft.color}
            strokeWidth={draft.width * W}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {active && tool === 'select' && selBox && (
          <g data-ink-selection="1">
            <rect
              x={selBox.x0 * W - selPad}
              y={selBox.y0 * H - selPad}
              width={Math.max(2, (selBox.x1 - selBox.x0) * W + selPad * 2)}
              height={Math.max(2, (selBox.y1 - selBox.y0) * H + selPad * 2)}
              fill="rgba(61,90,102,0.06)"
              stroke="#3d5a66"
              strokeWidth={1}
              strokeDasharray="5 4"
            />
            {(['nw', 'ne', 'sw', 'se'] as Corner[]).map((c) => {
              const q = cornerPoint(selBox, c)
              return (
                <rect
                  key={c}
                  x={q.x * W - 5}
                  y={q.y * H - 5}
                  width={10}
                  height={10}
                  rx={2}
                  fill="#fff"
                  stroke="#3d5a66"
                  strokeWidth={1.2}
                  data-ink-handle={c}
                />
              )
            })}
          </g>
        )}

        {active && tool === 'select' && marquee && (
          <rect
            x={Math.min(marquee.x0, marquee.x1) * W}
            y={Math.min(marquee.y0, marquee.y1) * H}
            width={Math.abs(marquee.x1 - marquee.x0) * W}
            height={Math.abs(marquee.y1 - marquee.y0) * H}
            fill="rgba(61,90,102,0.08)"
            stroke="#3d5a66"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        )}
      </svg>

      {active && (
        <div className="screenink__bar" onPointerDown={(e) => e.stopPropagation()}>
          <div className="screenink__colors" aria-label="批注颜色">
            {COLORS.map((c) => (
              <button
                key={c}
                className="screenink__color"
                data-active={tool !== 'eraser' && color === c}
                style={{ background: c }}
                title={`颜色 ${c}`}
                onClick={() => {
                  setColor(c)
                  setTool('pen')
                }}
              />
            ))}
          </div>
          <div className="screenink__widths" aria-label="笔画粗细">
            {WIDTHS.map((w) => (
              <button
                key={w}
                className="screenink__width"
                data-active={tool !== 'eraser' && width === w}
                title={`笔画 ${w}px`}
                onClick={() => {
                  setWidth(w)
                  setTool('pen')
                }}
              >
                <i style={{ width: w + 2, height: w + 2 }} />
              </button>
            ))}
          </div>
          <span className="screenink__sep" />
          <button
            className="screenink__tool"
            data-active={tool === 'pen'}
            onClick={() => setTool('pen')}
            title="画笔"
          >
            笔
          </button>
          <button
            className="screenink__tool"
            data-active={tool === 'eraser'}
            onClick={() => {
              setTool('eraser')
              setSel([])
            }}
            title="橡皮：拖动连擦"
          >
            橡皮
          </button>
          <button
            className="screenink__tool"
            data-active={tool === 'select'}
            onClick={() => setTool('select')}
            title="选择：框选 / 点选单笔，拖动移动，角点缩放"
          >
            选择
          </button>
          <button
            className="screenink__tool"
            onClick={fade}
            disabled={strokes.length === 0}
            title="淡出：选中（或不选=全部）在 100% / 55% / 25% 之间循环"
          >
            淡化
          </button>
          <button className="screenink__tool" onClick={undo} disabled={past.length === 0} title="撤销 Ctrl+Z">
            撤销
          </button>
          <button
            className="screenink__tool"
            onClick={clear}
            disabled={strokes.length === 0}
            title="清空本实验的批注"
          >
            清空
          </button>
          {onHide && (
            <button className="screenink__tool" onClick={onHide} title="隐藏批注，画面回到干净状态（随时可以再显示）">
              隐藏
            </button>
          )}
          <button className="screenink__exit" onClick={onExit} title="退出批注 Esc">
            退出批注
          </button>
        </div>
      )}
    </div>
  )
}
