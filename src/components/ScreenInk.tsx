import { memo, useEffect, useRef, useState } from 'react'

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
/** 橡皮半径（像素）：圆形覆盖区域内一律擦掉，边缘外留一点余量 */
const ERASER_R = 16
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

/* ───────── 橡皮：按覆盖区域裁剪折线 ───────── */

/** 线段 a→b 落在圆内的参数区间 [t0,t1]；不相交时 t1 <= t0 */
function insideSpan(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  r: number,
): [number, number] {
  const dx = bx - ax
  const dy = by - ay
  const fx = ax - cx
  const fy = ay - cy
  const a = dx * dx + dy * dy
  const c0 = fx * fx + fy * fy - r * r
  if (a < 1e-12) return c0 <= 0 ? [0, 1] : [1, 0]
  const b = 2 * (fx * dx + fy * dy)
  const disc = b * b - 4 * a * c0
  if (disc <= 0) return c0 <= 0 ? [0, 1] : [1, 0]
  const sq = Math.sqrt(disc)
  let t0 = (-b - sq) / (2 * a)
  let t1 = (-b + sq) / (2 * a)
  if (c0 > 0) {
    // 两端都在圆外：只有真正穿过圆才有一段在里面
    if (t1 <= 0 || t0 >= 1) return [1, 0]
  }
  t0 = Math.max(0, t0)
  t1 = Math.min(1, t1)
  return t1 > t0 ? [t0, t1] : [1, 0]
}

/**
 * 把圆覆盖的那一段从折线上挖掉，返回剩下的若干段。
 *
 * 逐段解析求交（不是采样），擦一条几百个点的长笔迹也只是一次线性扫描；
 * 断口正好落在圆周上，所以擦出来的边界就是橡皮拖过的区域。
 */
function carvePolyline(pts: Point[], cx: number, cy: number, r: number): Point[][] {
  const out: Point[][] = []
  if (pts.length === 0) return out
  let run: Point[] | null = null
  const flush = () => {
    if (run && run.length > 1) out.push(run)
    run = null
  }
  const at = (a: Point, b: Point, t: number): Point => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  })

  if (Math.hypot(pts[0].x - cx, pts[0].y - cy) > r) run = [pts[0]]

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const [t0, t1] = insideSpan(a.x, a.y, b.x, b.y, cx, cy, r)
    if (t1 <= t0) {
      // 整段都在圆外
      if (!run) run = [a]
      run.push(b)
      continue
    }
    if (t0 > 0) {
      if (!run) run = [a]
      run.push(at(a, b, t0))
    }
    flush()
    if (t1 < 1) run = [at(a, b, t1)]
  }
  flush()
  return out
}

const OPPOSITE: Record<Corner, Corner> = { nw: 'se', ne: 'sw', sw: 'ne', se: 'nw' }

/**
 * 笔迹渲染缓存：笔迹对象是不可变的，只有被改过才会换新对象。
 * 有了它，擦一笔时其余几十条笔迹不用重新生成 <path> 的 d（这是原来卡顿的主因）。
 */
const pathCache = new WeakMap<InkStroke, { w: number; h: number; d: string }>()
const boxCache = new WeakMap<InkStroke, Box>()

function cachedPath(s: InkStroke, w: number, h: number): string {
  const hit = pathCache.get(s)
  // 窗口尺寸变了，像素坐标就变了：缓存必须带上宽高，否则缩放后笔迹不跟着缩
  if (hit && hit.w === w && hit.h === h) return hit.d
  const d = inkPath(s.pts.map((p) => ({ x: p.x * w, y: p.y * h })))
  pathCache.set(s, { w, h, d })
  return d
}

function cachedBox(s: InkStroke): Box {
  const hit = boxCache.get(s)
  if (hit) return hit
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of s.pts) {
    if (p.x < x0) x0 = p.x
    if (p.y < y0) y0 = p.y
    if (p.x > x1) x1 = p.x
    if (p.y > y1) y1 = p.y
  }
  const box = { x0, y0, x1, y1 }
  boxCache.set(s, box)
  return box
}

/** 单条笔迹：d 走缓存，笔迹没变时 React 也不会重算 */
const InkPath = memo(function InkPath({ stroke, w, h }: { stroke: InkStroke; w: number; h: number }) {
  return (
    <path
      d={cachedPath(stroke, w, h)}
      fill="none"
      stroke={stroke.color}
      strokeWidth={stroke.width * w}
      strokeOpacity={stroke.alpha}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
})

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
  /** 橡皮：上一个擦除点，用来插值补擦 */
  last?: Point
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

  /** 橡皮光标：直接改 transform，不走 state，避免每个 pointermove 都重渲染整层笔迹 */
  const cursorRef = useRef<HTMLDivElement>(null)
  const paintCursor = (clientX: number, clientY: number) => {
    const el = cursorRef.current
    const r = rootRef.current?.getBoundingClientRect()
    if (!el || !r) return
    el.style.opacity = '1'
    el.style.transform = `translate(${clientX - r.left - ERASER_R}px, ${clientY - r.top - ERASER_R}px)`
  }

  const pushHistory = (snapshot: InkStroke[] = strokesRef.current) => {
    setPast((prev) => [...prev.slice(-40), snapshot])
  }

  /**
   * 擦掉橡皮圆覆盖的那一段。
   *
   * 不是「命中哪条就删整条」，而是把被盖住的部分从折线里剪掉，
   * 一条长笔迹被擦中间会断成两条。只处理与圆相交的笔迹（先按包围盒筛）。
   */
  const eraseAt = (p: Point, from?: Point) => {
    const r = ERASER_R
    const cx = p.x * size.w
    const cy = p.y * size.h
    // 快速拖动时从左一点插值到右一点，避免中间漏擦
    const steps = from
      ? Math.min(8, Math.max(1, Math.ceil(Math.hypot((p.x - from.x) * size.w, (p.y - from.y) * size.h) / r) * 2))
      : 1
    const discs: { x: number; y: number }[] = []
    for (let i = 1; i <= steps; i++) {
      const t = steps === 1 ? 1 : i / steps
      discs.push(
        from
          ? { x: (from.x + (p.x - from.x) * t) * size.w, y: (from.y + (p.y - from.y) * t) * size.h }
          : { x: cx, y: cy },
      )
    }

    setStrokes((prev) => {
      let changed = false
      const next = prev.flatMap((s) => {
        const b = cachedBox(s)
        const hit = discs.some(
          (d) =>
            d.x + r >= b.x0 * size.w &&
            d.x - r <= b.x1 * size.w &&
            d.y + r >= b.y0 * size.h &&
            d.y - r <= b.y1 * size.h,
        )
        if (!hit) return [s]
        // 逐圆挖，一个圆可能把一条笔迹切成多段
        let pieces: Point[][] = [s.pts]
        for (const d of discs) {
          pieces = pieces.flatMap((pts) =>
            carvePolyline(
              pts.map((q) => ({ x: q.x * size.w, y: q.y * size.h })),
              d.x,
              d.y,
              r,
            ).map((part) => part.map((q) => ({ x: q.x / size.w, y: q.y / size.h }))),
          )
          if (pieces.length === 0) break
        }
        const before = pieces.length
        const kept = pieces.filter((part) => part.length > 1)
        if (kept.length === 1 && kept[0].length === s.pts.length) return [s]
        changed = changed || before !== 1 || kept.length !== 1 || kept[0].length !== s.pts.length
        return kept.map((pts, i) => (i === 0 ? { ...s, pts } : { ...s, id: `${s.id}~${i}`, pts }))
      })
      return changed ? next : prev
    })
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
    if (tool === 'eraser') paintCursor(e.clientX, e.clientY)

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
      gesture.current = { mode: 'eraser', start: p, base: [], ids: [], last: p }
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
    if (active && tool === 'eraser') paintCursor(e.clientX, e.clientY)
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
      // 指针事件可能很密：位移不到 1px 就跳过，省掉无意义的裁剪
      const last = g.last ?? g.start
      if (Math.hypot((p.x - last.x) * size.w, (p.y - last.y) * size.h) < 1) return
      eraseAt(p, last)
      g.last = p
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
      onPointerLeave={() => {
        if (cursorRef.current) cursorRef.current.style.opacity = '0'
      }}
    >
      {active && tool === 'eraser' && (
        <div
          className="screenink__eraser"
          ref={cursorRef}
          style={{ width: ERASER_R * 2, height: ERASER_R * 2, opacity: 0 }}
        />
      )}
      <svg className="screenink__canvas" aria-hidden="true">
        {strokes.map((s) => (
          <InkPath key={s.id} stroke={s} w={W} h={H} />
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
