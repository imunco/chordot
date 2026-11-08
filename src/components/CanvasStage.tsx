import { useEffect, useMemo, useRef, useState } from 'react'
import { PX_PER_UNIT } from '../model/scale'
import type { ForceObj, GeoObj, Mode, PointObj } from '../model/types'
import type { Annotation } from '../model/measure'
import { placeLabels } from '../model/labels'
import {
  groundShadow,
  projectMesh,
  projectPoint3,
  projectSolid,
  projectVector,
  VIEWS,
} from '../model/solid'
import { buildIncline3D } from '../model/incline3d'
import { evalForce } from '../model/force'
import { forceDir } from '../model/force3d'
import { SolidIncline } from './SolidIncline'
import { MaterialPattern } from './solidTexture'
import { MechStage } from './MechStage'
import type {
  Camera,
  MechLinkKind,
  MechLive,
  MechParams,
  MechPart,
  MechPartKind,
  PhysicsForce,
  PhysicsObstacle,
  SolidInclineParams,
  Stroke,
} from '../kernel/types'
import type { ToolId } from '../state'
import { GripIcon } from './icons'
/** 曲面平滑着色：每个面带一段 linearGradient，fill 指向它 */
function faceDefs(prefix: string, faces: { grad?: { from: string; to: string; x1: number; y1: number; x2: number; y2: number } }[]) {
  const items = faces
    .map((f, i) =>
      f.grad ? (
        <linearGradient
          key={i}
          id={`${prefix}-${i}`}
          gradientUnits="userSpaceOnUse"
          x1={f.grad.x1}
          y1={f.grad.y1}
          x2={f.grad.x2}
          y2={f.grad.y2}
        >
          <stop offset="0%" stopColor={f.grad.from} />
          <stop offset="100%" stopColor={f.grad.to} />
        </linearGradient>
      ) : null,
    )
    .filter(Boolean)
  return items.length > 0 ? <defs>{items}</defs> : null
}

const faceFill = (
  prefix: string,
  f: { shade: string; grad?: unknown },
  i: number,
) => (f.grad ? `url(#${prefix}-${i})` : f.shade)

const FONT = "'IBM Plex Sans SC','Microsoft YaHei',sans-serif"
const MATH_FONT = "'Cambria Math','IBM Plex Math',Georgia,serif"

/**
 * 手绘折线 → 平滑路径。
 * 每段用「当前点 → 相邻中点」的二次贝塞尔，笔迹不会一段一段折；
 * 控制点数不变（每段一个 Q），比重新采样密点便宜得多。
 */
function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return ''
  const f = (n: number) => Math.round(n * 10) / 10
  if (pts.length === 1) return `M${f(pts[0][0])} ${f(pts[0][1])}`
  if (pts.length === 2) return `M${f(pts[0][0])} ${f(pts[0][1])} L${f(pts[1][0])} ${f(pts[1][1])}`
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2
    const my = (pts[i][1] + pts[i + 1][1]) / 2
    d += ` Q${f(pts[i][0])} ${f(pts[i][1])} ${f(mx)} ${f(my)}`
  }
  const last = pts[pts.length - 1]
  return `${d} L${f(last[0])} ${f(last[1])}`
}

/**
 * 变宽笔迹：沿中心线两侧按逐点权重偏移，得到一条闭合的「带子」。
 * 权重来自落笔速度（快 → 细），所以写出来的线条有轻重变化。
 */
function ribbonPath(pts: [number, number][], weights: number[], base: number): string {
  if (pts.length < 2) return ''
  const left: [number, number][] = []
  const right: [number, number][] = []
  const f = (n: number) => Math.round(n * 10) / 10
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(pts.length - 1, i + 1)]
    const dx = next[0] - prev[0]
    const dy = next[1] - prev[1]
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const r = Math.max(0.35, (base * (weights[i] ?? 1)) / 2)
    left.push([pts[i][0] + nx * r, pts[i][1] + ny * r])
    right.push([pts[i][0] - nx * r, pts[i][1] - ny * r])
  }
  const a = left.map((p, i) => `${i === 0 ? 'M' : 'L'}${f(p[0])} ${f(p[1])}`).join(' ')
  const b = right
    .slice()
    .reverse()
    .map((p) => `L${f(p[0])} ${f(p[1])}`)
    .join(' ')
  return `${a} ${b} Z`
}

/** 1 / 2 / 5 × 10ⁿ 里挑一个不小于 raw 的「整」数，坐标刻度用 */
function niceStep(raw: number): number {
  const exp = Math.floor(Math.log10(raw))
  const base = Math.pow(10, exp)
  const n = raw / base
  const mult = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return mult * base
}

/** 刻度数字：按步长定小数位，顺手抹掉 -0 和浮点尾巴 */
function formatTick(v: number, step: number): string {
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9))
  const s = v.toFixed(decimals)
  return Number(s) === 0 ? '0' : s
}

interface Props {
  objects: GeoObj[]
  selected: string[]
  grid: boolean
  zoom: number
  mode: Mode
  tool: ToolId
  scaleText: string
  draggingId: string | null
  picks: string[]
  decomposed: string[]
  annotation: Annotation | null
  /** 约束标记（线段中点 + 符号） */
  badges: { x: number; y: number; label: string; stack: number }[]
  /** 约束冲突涉及的对象 id */
  conflictIds: string[]
  /** 图形库拖放：shapeId + 世界坐标落点 */
  onDropShape: (id: string, at: { x: number; y: number }) => void
  /** 画布平移（屏幕像素） */
  pan: { x: number; y: number }
  onPan: (pan: { x: number; y: number }) => void
  /** 触控模式：放大命中区 */
  touch: boolean
  /** 坐标轴刻度数字 */
  showTicks: boolean
  /** 网格密度：多少世界单位一格 */
  gridStep: number
  /** 函数曲线线宽 */
  curveWidth: number
  /** 力箭头标尺：每牛顿像素 */
  pxPerN: number
  /** 三维相机；为 null 时是二维场景 */
  camera: Camera | null
  /** 三维斜面受力场景 */
  solidIncline: SolidInclineParams | null
  /** 机构装配场景 */
  mech: MechParams | null
  mechSelected: string | null
  mechSelectedIds: string[]
  mechPending: MechLinkKind | null
  mechAnchor: string | null
  mechPlaying: boolean
  mechEditing: boolean
  mechVectors: boolean
  mechDecompose: boolean
  mechLabels: boolean
  mechTrails: boolean
  mechGrid: number
  mechSnapAngle: boolean
  mechMeasure: { a: string; b: string } | null
  mechMeasureMode: boolean
  mechResetToken: number
  /** 引擎实时读数（MechStage 写入，MechBar 轮询） */
  mechLive: { current: MechLive }
  onMechSelect: (id: string | null, kind: 'part' | 'link' | null) => void
  onMechSelectMany: (ids: string[]) => void
  onMechAnchor: (id: string | null) => void
  onMechLink: (kind: MechLinkKind, a: string, b: string) => void
  onMechCommitParts: (parts: MechPart[]) => void
  onMechDrop: (kind: MechPartKind, at: { x: number; y: number }) => void
  onMechMeasurePart: (id: string) => void
  /** 三维物理世界开启中（画地面网格） */
  solidPhysics: boolean
  /** 物理世界里的静态障碍 */
  solidObstacles: PhysicsObstacle[]
  /** 物理世界参数（画力箭头要用） */
  solidPhysicsInfo: { gravity: number; global?: PhysicsForce; time: number } | null
  /** 手绘批注 */
  strokes: Stroke[]
  penColor: string
  penWidth: number
  /** 普通笔 / 荧光笔 / 铅笔 */
  penMode: 'pen' | 'marker' | 'pencil'
  /** 速度感应：落笔快的地方细、慢的地方粗 */
  penVelocity: boolean
  /** 临时隐藏全部批注 */
  hideInk?: boolean
  onStrokeCommit: (stroke: Stroke) => void
  /** 橡皮局部擦除：一条笔画被切成几段 */
  onStrokesCut: (cuts: { id: string; parts: Stroke[] }[]) => void
  /** 整组平移：一次挪动一组点 */
  onDragPoints: (moves: { id: string; x: number; y: number }[]) => void
  onCamera: (camera: Camera) => void
  onCameraStart: () => void
  onCameraEnd: () => void
  /** 播放时力箭头收缩为方向指示器 */
  forceScale: number
  svgRef: React.RefObject<SVGSVGElement | null>
  onSelect: (ids: string[], kind: 'replace' | 'add' | 'toggle') => void
  onClearSelection: () => void
  onCanvasSize: (w: number, h: number) => void
  onZoom: (zoom: number) => void
  onEmptyAction: (action: 'expr' | 'point' | 'force') => void
  onDragStart: (id: string, p: { x: number; y: number }) => void
  onDragMove: (p: { x: number; y: number }) => void
  onDragEnd: (p?: { x: number; y: number }) => void
  onCanvasClick: (p: { x: number; y: number }, snapId?: string, keepTool?: boolean) => void
}

const CONSTRUCTION: ToolId[] = ['point', 'line', 'circle', 'polygon', 'force']

export function CanvasStage(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const gripDrag = useRef<{ y: number; zoom: number } | null>(null)
  const pointDrag = useRef<string | null>(null)
  const orbit = useRef<{ x: number; y: number; azimuth: number; elevation: number } | null>(null)
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinch = useRef<{
    dist: number
    mid: { x: number; y: number }
    zoom: number
    pan: { x: number; y: number }
  } | null>(null)
  const panDrag = useRef<{ x: number; y: number; pan: { x: number; y: number } } | null>(null)
  /** 左键在空白处按下：超过阈值才算平移，否则算「点空白取消选择」 */
  const shapeDrag = useRef<{
    start: { x: number; y: number }
    base: { id: string; x: number; y: number }[]
  } | null>(null)
  const [draft, setDraft] = useState<Stroke | null>(null)
  const draftRef = useRef<Stroke | null>(null)
  /** 橡皮按住不放：拖动经过的笔画都擦掉 */
  const erasing = useRef(false)
  /** 橡皮光标圈（屏幕坐标） */
  const [eraseAt, setEraseAt] = useState<[number, number] | null>(null)
  /** 旋转手柄拖动中 */
  const rotating = useRef<{
    center: [number, number]
    start: number
    base: { id: string; x: number; y: number }[]
    handle: [number, number]
  } | null>(null)
  /** 拖动中的旋转角度（度），给手柄旁的数字用 */
  const [rotAngle, setRotAngle] = useState<number | null>(null)
  const pendingPan = useRef<{
    x: number
    y: number
    pan: { x: number; y: number }
    moved: boolean
  } | null>(null)
  const live = useRef({ zoom: props.zoom, pan: props.pan, w: 0, h: 0, camera: props.camera })
  live.current = { zoom: props.zoom, pan: props.pan, w: size.w, h: size.h, camera: props.camera }
  /** 手势回调里要用最新的 props（effect 只挂一次） */
  const propsRef = useRef(props)
  propsRef.current = props

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect
      setSize({ w: rect.width, h: rect.height })
      props.onCanvasSize(rect.width, rect.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* 换工具时收起橡皮 / 旋转状态：否则光标圈和「按住」标记会留到下一次 */
  useEffect(() => {
    if (props.tool !== 'eraser') {
      erasing.current = false
      setEraseAt(null)
    }
    if (props.tool !== 'select') {
      rotating.current = null
      setRotAngle(null)
    }
  }, [props.tool])

  /* 手势：双指缩放（围绕捏合中点）、双指平移、中键/Alt 拖拽平移 */
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const center = () => ({ x: live.current.w / 2, y: live.current.h / 2 + 40 })
    /** 这一次手势是不是从画布里按下的：面板上的拖动不该带动画布 */
    let fromCanvas = false

    /** 捏合一旦开始就停掉正在进行的拖动，否则第二根手指会继续拖对象 */
    const stopObjectDrag = () => {
      const wasDragging =
        Boolean(pointDrag.current) || Boolean(shapeDrag.current) || Boolean(draftRef.current)
      pointDrag.current = null
      shapeDrag.current = null
      draftRef.current = null
      pendingPan.current = null
      orbit.current = null
      panDrag.current = null
      if (draftRef.current === null) setDraft(null)
      if (wasDragging) propsRef.current.onDragEnd()
    }

    const resetAll = () => {
      pointers.current.clear()
      pinch.current = null
      panDrag.current = null
      // 手指滑出窗口收不到 pointerup 时，别让橡皮一直挂在「按住」状态
      erasing.current = false
      rotating.current = null
      fromCanvas = false
    }

    const onDown = (e: PointerEvent) => {
      // 主指针落下 = 新手势。触摸时 pointerup 偶尔会丢（手指滑出窗口、系统抢走手势），
      // 残留的指针会让之后每次单指触摸都被当成「第二根手指」，拖动和缩放就全乱了
      if (e.isPrimary) resetAll()
      // 只有「手势的第一根手指」决定这次是不是画布手势
      if (pointers.current.size === 0) fromCanvas = host.contains(e.target as Node)
      if (!fromCanvas) return
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()]
        pinch.current = {
          dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
          mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          zoom: live.current.zoom,
          pan: live.current.pan,
        }
        stopObjectDrag()
        return
      }

      if (e.button === 1 || e.altKey) {
        panDrag.current = { x: e.clientX, y: e.clientY, pan: live.current.pan }
      }
    }

    const onMove = (e: PointerEvent) => {
      if (!fromCanvas) return
      if (pointers.current.has(e.pointerId)) {
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      }

      const p = pinch.current
      if (p && pointers.current.size >= 2) {
        e.preventDefault()
        const [a, b] = [...pointers.current.values()]
        const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const cam = live.current.camera
        if (cam) {
          propsRef.current.onCamera({
            ...cam,
            zoom: Math.min(4, Math.max(0.3, cam.zoom * (dist / p.dist))),
          })
          return
        }
        const zoom = Math.min(4, Math.max(0.3, p.zoom * (dist / p.dist)))
        const k = zoom / p.zoom
        const c = center()
        propsRef.current.onZoom(zoom)
        propsRef.current.onPan({
          x: mid.x - c.x - (p.mid.x - c.x - p.pan.x) * k,
          y: mid.y - c.y - (p.mid.y - c.y - p.pan.y) * k,
        })
        return
      }

      if (panDrag.current) {
        e.preventDefault()
        propsRef.current.onPan({
          x: panDrag.current.pan.x + (e.clientX - panDrag.current.x),
          y: panDrag.current.pan.y + (e.clientY - panDrag.current.y),
        })
      }
    }

    const onUp = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId)
      if (pointers.current.size < 2) pinch.current = null
      if (pointers.current.size === 0) {
        panDrag.current = null
        fromCanvas = false
      }
    }

    const onCancel = (e: PointerEvent) => {
      onUp(e)
      stopObjectDrag()
    }

    const onBlur = () => {
      resetAll()
      stopObjectDrag()
    }

    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove, { capture: true, passive: false })
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onCancel, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onCancel, true)
      window.removeEventListener('blur', onBlur)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const s = PX_PER_UNIT * props.zoom * (props.camera?.zoom ?? 1)
  const cx = size.w / 2 + props.pan.x
  const cy = size.h / 2 + 40 + props.pan.y
  const toScreen = (p: [number, number]): [number, number] => [cx + p[0] * s, cy - p[1] * s]

  const isSelected = (id: string) => props.selected.includes(id)

  // 点标签避让：挤在一起时自动换到不重叠的一侧
  const labelPlace = useMemo(() => {
    const pts = props.objects.filter((o): o is PointObj => o.kind === 'point' && o.visible)
    return placeLabels(
      pts.map((p) => {
        const [x, y] = toScreen([p.x, p.y])
        return { id: p.id, x, y, name: p.name }
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.objects, props.zoom, props.pan, size.w, size.h, props.camera])

  // 触控时命中区放大到 ~44px，视觉尺寸不变
  const hit = props.touch ? 22 : 11
  const hitStroke = props.touch ? 26 : 12

  const pick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const kind = e.shiftKey ? 'add' : e.ctrlKey || e.metaKey ? 'toggle' : 'replace'
    props.onSelect([id], kind)
  }

  /** 屏幕坐标 → 世界坐标 */
  const worldAt = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = props.svgRef.current?.getBoundingClientRect()
    return {
      x: (clientX - (rect?.left ?? 0) - cx) / s,
      y: (cy - (clientY - (rect?.top ?? 0))) / s,
    }
  }
  const toWorld = (e: React.PointerEvent | React.MouseEvent) => worldAt(e.clientX, e.clientY)

  /** 光标在画布内的像素坐标 */
  const screenOf = (e: React.PointerEvent | React.MouseEvent): [number, number] => {
    const rect = props.svgRef.current?.getBoundingClientRect()
    return [e.clientX - (rect?.left ?? 0), e.clientY - (rect?.top ?? 0)]
  }

  /** 批注落点：二维存世界坐标，三维存画布坐标 */
  const strokePoint = (e: React.PointerEvent | React.MouseEvent): [number, number] => {
    if (props.camera) return screenOf(e)
    const w = toWorld(e)
    return [w.x, w.y]
  }

  /** 点到线段的距离 */
  const segDistance = (p: [number, number], a: [number, number], b: [number, number]): number => {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = dx * dx + dy * dy
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len))
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
  }

  /**
   * 橡皮局部擦除：把落点附近的点挖掉，剩下的连续段各自成为一条新笔画。
   * 只擦到中间就断成两条，不再整笔消失。
   */
  const cutStroke = (st: Stroke, p: [number, number], tol: number): Stroke[] | null => {
    const pts = st.points
    if (pts.length === 0) return null
    if (pts.length === 1) {
      return Math.hypot(pts[0][0] - p[0], pts[0][1] - p[1]) <= tol ? [] : null
    }
    const hit = pts.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) <= tol)
    // 笔画点很稀：线段从橡皮上穿过也算擦到，两端一起断
    for (let i = 1; i < pts.length; i++) {
      if (hit[i] || hit[i - 1]) continue
      if (segDistance(p, pts[i - 1], pts[i]) <= tol) {
        hit[i] = true
        hit[i - 1] = true
      }
    }
    if (!hit.some(Boolean)) return null
    const runs: [number, number][][] = []
    let cur: [number, number][] = []
    for (let i = 0; i < pts.length; i++) {
      if (hit[i]) {
        if (cur.length >= 2) runs.push(cur)
        cur = []
      } else {
        cur.push(pts[i])
      }
    }
    if (cur.length >= 2) runs.push(cur)
    return runs.map((points, i) => ({ ...st, id: `${st.id}~${i}`, points }))
  }

  /** 擦掉光标下的一段批注（只擦一层，按住拖动会连续擦） */
  const eraseAtPoint = (p: [number, number]) => {
    const space = props.camera ? 'screen' : 'world'
    // 三维批注是屏幕像素，二维是世界长度：统一按 9px 手感换算
    const tol = props.camera ? 9 : 9 / s
    const cuts: { id: string; parts: Stroke[] }[] = []
    for (const st of props.strokes) {
      if (st.space !== space) continue
      const parts = cutStroke(st, p, tol)
      if (parts) cuts.push({ id: st.id, parts })
    }
    if (cuts.length > 0) props.onStrokesCut(cuts)
  }

  /** 拖多边形/线段/圆的本体：整组平移构成它的点 */
  const startShapeDrag = (e: React.PointerEvent, o: GeoObj) => {
    if (props.tool !== 'select' || !o.anchorIds || o.anchorIds.length === 0) return
    const pts = o.anchorIds
      .map((id) => props.objects.find((q) => q.id === id && q.kind === 'point'))
      .filter((q): q is PointObj => !!q)
    if (pts.length === 0) return
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      /* 合成事件忽略 */
    }
    const w = toWorld(e)
    shapeDrag.current = {
      start: w,
      base: pts.map((p) => ({ id: p.id, x: p.x, y: p.y })),
    }
    props.onDragStart(o.id, w)
  }

  const startPointDrag = (e: React.PointerEvent, o: PointObj) => {
    if (!o.draggable || props.tool !== 'select') return
    e.stopPropagation()
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      /* 合成事件无活动指针时忽略 */
    }
    pointDrag.current = o.id
    props.onDragStart(o.id, toWorld(e))
  }

  const movePoint = (e: React.PointerEvent) => {
    if (rotating.current) {
      const r = rotating.current
      const w = toWorld(e)
      let ang = Math.atan2(w.y - r.center[1], w.x - r.center[0]) - r.start
      if (e.shiftKey) {
        const step = Math.PI / 12 // 15°
        ang = Math.round(ang / step) * step
      }
      const cos = Math.cos(ang)
      const sin = Math.sin(ang)
      props.onDragPoints(
        r.base.map((b) => ({
          id: b.id,
          x: r.center[0] + (b.x - r.center[0]) * cos - (b.y - r.center[1]) * sin,
          y: r.center[1] + (b.x - r.center[0]) * sin + (b.y - r.center[1]) * cos,
        })),
      )
      setRotAngle((ang * 180) / Math.PI)
      return
    }
    if (erasing.current) {
      const p = strokePoint(e)
      setEraseAt(screenOf(e))
      eraseAtPoint(p)
      return
    }
    if (shapeDrag.current) {
      const w = toWorld(e)
      const dx = w.x - shapeDrag.current.start.x
      const dy = w.y - shapeDrag.current.start.y
      props.onDragPoints(
        shapeDrag.current.base.map((b) => ({ id: b.id, x: b.x + dx, y: b.y + dy })),
      )
      return
    }
    if (draftRef.current) {
      const cur = draftRef.current
      const p = strokePoint(e)
      const last = cur.points[cur.points.length - 1]
      const dx = p[0] - last[0]
      const dy = p[1] - last[1]
      // 太密的点没有意义，反而拖慢渲染
      if (dx * dx + dy * dy < (props.camera ? 9 : 0.02)) return
      // 速度感应：两次采样的间距越大，说明落笔越快，线就越细
      const stepPx = Math.hypot(dx, dy) * (props.camera ? 1 : s)
      const prevW = cur.weights?.[cur.weights.length - 1] ?? 1
      const want = Math.max(0.5, Math.min(1.12, 1.24 - stepPx * 0.04))
      const weights = cur.weights ? [...cur.weights, prevW * 0.55 + want * 0.45] : undefined
      const next: Stroke = { ...cur, points: [...cur.points, p], weights }
      draftRef.current = next
      setDraft(next)
      return
    }
    if (pendingPan.current) {
      const dx = e.clientX - pendingPan.current.x
      const dy = e.clientY - pendingPan.current.y
      if (!pendingPan.current.moved && Math.hypot(dx, dy) < 3) return
      pendingPan.current.moved = true
      props.onPan({ x: pendingPan.current.pan.x + dx, y: pendingPan.current.pan.y + dy })
      return
    }
    if (orbit.current && props.camera) {
      const dx = e.clientX - orbit.current.x
      const dy = e.clientY - orbit.current.y
      const azimuth = orbit.current.azimuth - dx * 0.4
      const elevation = Math.min(89, Math.max(-89, orbit.current.elevation + dy * 0.35))
      props.onCamera({ ...props.camera, azimuth, elevation, view: 'free' })
      return
    }
    if (!pointDrag.current) return
    props.onDragMove(toWorld(e))
  }

  const endPointDrag = (e: React.PointerEvent) => {
    if (rotating.current) {
      rotating.current = null
      setRotAngle(null)
      props.onDragEnd(toWorld(e))
      return
    }
    if (shapeDrag.current) {
      shapeDrag.current = null
      props.onDragEnd(toWorld(e))
      return
    }
    if (draftRef.current) {
      const cur = draftRef.current
      draftRef.current = null
      setDraft(null)
      // 单点也算一笔（点一下就是一个小圆点）
      if (cur.points.length >= 1) props.onStrokeCommit(cur)
      return
    }
    if (erasing.current) {
      erasing.current = false
      return
    }
    if (pendingPan.current) {
      const moved = pendingPan.current.moved
      pendingPan.current = null
      if (!moved) props.onClearSelection()
      return
    }
    if (orbit.current) {
      orbit.current = null
      props.onCameraEnd()
      return
    }
    if (!pointDrag.current) return
    pointDrag.current = null
    const el = e.currentTarget as Element
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId)
    props.onDragEnd(toWorld(e))
  }

  const constructing = CONSTRUCTION.includes(props.tool)

  /** 吸附：距已有点 10px 内视为拾取该点 */
  const snapAt = (p: { x: number; y: number }): string | undefined => {
    const tol = 10 / s
    let best: string | undefined
    let bestD = tol
    for (const o of props.objects) {
      if (o.kind !== 'point' || !o.visible) continue
      const d = Math.hypot(o.x - p.x, o.y - p.y)
      if (d <= bestD) {
        bestD = d
        best = o.id
      }
    }
    return best
  }

  const handleBackgroundDown = (e: React.PointerEvent) => {
    if (props.tool === 'pen') {
      e.preventDefault()
      const marker = props.penMode === 'marker'
      const pencil = props.penMode === 'pencil'
      const stroke: Stroke = {
        id: `k${Date.now().toString(36)}`,
        // 三维场景里批注固定在画布空间，不随相机旋转
        space: props.camera ? 'screen' : 'world',
        color: props.penColor,
        // 荧光笔按倍数加粗，划重点用；铅笔更细
        width: marker ? props.penWidth * 5 : pencil ? props.penWidth * 1.45 : props.penWidth,
        mode: props.penMode,
        points: [strokePoint(e)],
        // 速度感应只给铅笔：普通笔保持等宽平滑线，避免和已有的平滑断言打架
        weights: pencil && props.penVelocity ? [1] : undefined,
      }
      draftRef.current = stroke
      setDraft(stroke)
      try {
        ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      } catch {
        /* 合成事件忽略 */
      }
      return
    }
    if (props.tool === 'eraser') {
      e.preventDefault()
      erasing.current = true
      setEraseAt(screenOf(e))
      eraseAtPoint(strokePoint(e))
      try {
        ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      } catch {
        /* 合成事件忽略 */
      }
      return
    }
    if (props.camera && props.tool === 'select') {
      orbit.current = {
        x: e.clientX,
        y: e.clientY,
        azimuth: props.camera.azimuth,
        elevation: props.camera.elevation,
      }
      try {
        ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      } catch {
        /* 合成事件忽略 */
      }
      props.onCameraStart()
      return
    }
    if (!constructing && !props.camera && e.button === 0) {
      // 左键按住空白 = 平移画面；松手时没移动才算「点空白取消选择」
      pendingPan.current = { x: e.clientX, y: e.clientY, pan: props.pan, moved: false }
      try {
        ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      } catch {
        /* 合成事件忽略 */
      }
      e.preventDefault()
      return
    }
    if (!constructing) {
      props.onClearSelection()
      return
    }
    const w = toWorld(e)
    props.onCanvasClick(w, snapAt(w), e.shiftKey)
  }

  /** 构造模式下点中已有几何体不选中，而是继续在光标处构造 */
  const handleObjectDown = (e: React.PointerEvent, id: string) => {
    // 批注模式下点住图形也要能画/擦：不拦事件，交给根节点的背景处理器
    if (props.tool === 'pen' || props.tool === 'eraser') return
    if (props.tool === 'force') {
      const obj = props.objects.find((o) => o.id === id)
      // 点已有的力就正常选中，别在它身上再叠一个
      if (obj && obj.kind !== 'force') {
        e.stopPropagation()
        const w = toWorld(e)
        props.onCanvasClick(w, snapAt(w), false)
        return
      }
    }
    if (constructing) {
      e.stopPropagation()
      const w = toWorld(e)
      props.onCanvasClick(w, snapAt(w), e.shiftKey)
      return
    }
    pick(e, id)
    // 选中之后如果这个对象是「由点拼成的」，直接按住就能整组搬走
    const obj = props.objects.find((o) => o.id === id)
    if (obj) startShapeDrag(e, obj)
  }

  const handleHover = (e: React.PointerEvent) => {
    // 橡皮：光标圈跟着走，松手/移出画布就收起
    if (props.tool === 'eraser') setEraseAt(screenOf(e))
    else if (eraseAt) setEraseAt(null)
    if (!constructing) return
    const w = toWorld(e)
    const snap = snapAt(w)
    const target = snap ? props.objects.find((o) => o.id === snap) : null
    setHover(target && target.kind === 'point' ? { x: target.x, y: target.y } : w)
  }

  const gridLines: React.ReactNode[] = []
  const gs = s * (props.gridStep > 0 ? props.gridStep : 1)
  if (props.grid && gs >= 12 && !props.camera) {
    for (let x = ((cx % gs) + gs) % gs; x < size.w; x += gs) {
      gridLines.push(<line key={`vx${x}`} x1={x} y1={0} x2={x} y2={size.h} stroke="#E8E5E0" strokeWidth={1} />)
    }
    for (let y = ((cy % gs) + gs) % gs; y < size.h; y += gs) {
      gridLines.push(<line key={`hy${y}`} x1={0} y1={y} x2={size.w} y2={y} stroke="#E8E5E0" strokeWidth={1} />)
    }
  }

  // 坐标轴刻度：按当前缩放选 1/2/5×10ⁿ 步长，目标间距 64px
  const ticks = (() => {
    if (!props.showTicks || props.mode !== 'math' || props.camera) return null
    const step = niceStep(64 / s)
    const x0 = -cx / s
    const x1 = (size.w - cx) / s
    const y0 = (cy - size.h) / s
    const y1 = cy / s
    const xs: { v: number; px: number }[] = []
    const ys: { v: number; px: number }[] = []
    if (step > 0 && Number.isFinite(step)) {
      for (let i = Math.ceil(x0 / step); i <= Math.floor(x1 / step) && xs.length < 60; i++) {
        const v = i * step
        if (Math.abs(v) < step / 2) continue
        xs.push({ v, px: cx + v * s })
      }
      for (let i = Math.ceil(y0 / step); i <= Math.floor(y1 / step) && ys.length < 60; i++) {
        const v = i * step
        if (Math.abs(v) < step / 2) continue
        ys.push({ v, px: cy - v * s })
      }
    }
    return { step, xs, ys, showX: cy >= -1 && cy <= size.h + 1, showY: cx >= -1 && cx <= size.w + 1 }
  })()

  // 曲线标签：贴在可见段末端，竖向挤在一起时错开，白描边压住曲线
  const curveLabels = (() => {
    const out: { id: string; name: string; color: string; x: number; y: number }[] = []
    for (const o of props.objects) {
      if (o.kind !== 'function' || !o.visible) continue
      const run = o.curves[o.curves.length - 1]
      if (!run || run.length === 0) continue
      let at: [number, number] | null = null
      for (let i = run.length - 1; i >= 0; i--) {
        const [px, py] = toScreen(run[i])
        if (px >= 2 && px <= size.w - 56 && py >= 18 && py <= size.h - 6) {
          at = [px, py]
          break
        }
      }
      if (!at) continue
      out.push({ id: o.id, name: o.name, color: o.color, x: at[0] + 5, y: at[1] - 5 })
    }
    // 撞在一起时向左让位：纵向保持贴着各自的曲线，不会跑到别的曲线上
    out.sort((a, b) => a.y - b.y)
    for (let i = 1; i < out.length; i++) {
      for (let j = 0; j < i; j++) {
        if (Math.abs(out[i].y - out[j].y) < 13 && Math.abs(out[i].x - out[j].x) < 34) {
          out[i].x = out[j].x - 32
        }
      }
    }
    return out
  })()

  // 立体之间按相机深度排序（远的先画），否则物理世界里会互相盖住
  const solidDepth = (o: GeoObj): number => {
    if (o.kind !== 'solid' || !props.camera) return 0
    const az = (props.camera.azimuth * Math.PI) / 180
    const el = (props.camera.elevation * Math.PI) / 180
    const dir = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)]
    const c = o.shape.center
    return c[0] * dir[0] + c[1] * dir[1] + c[2] * dir[2]
  }

  // 点必须画在线段/圆之上，否则构造吸附会被线段 12px 命中带挡住
  const geometry = [
    ...props.objects.filter(
      (o) => o.kind !== 'force' && o.kind !== 'function' && o.kind !== 'point' && o.kind !== 'solid',
    ),
    ...props.objects
      .filter((o) => o.kind === 'solid')
      .slice()
      .sort((a, b) => solidDepth(a) - solidDepth(b)),
    ...props.objects.filter((o) => o.kind === 'point'),
  ]
  const forces = props.objects.filter((o): o is ForceObj => o.kind === 'force')

  /**
   * 选中对象能否旋转：取它们背后的点，≥2 个点才画手柄。
   * 只对二维草图生效（三维有自己的相机轨道）。
   */
  const rotTarget = (() => {
    if (props.tool !== 'select' || props.camera || props.selected.length === 0) return null
    const picked = new Set(props.selected)
    const map = new Map<string, { id: string; x: number; y: number }>()
    for (const o of props.objects) {
      if (!picked.has(o.id) || !o.visible) continue
      if (o.kind === 'force' || o.kind === 'function' || o.kind === 'solid') continue
      if (o.kind === 'point') {
        map.set(o.id, { id: o.id, x: o.x, y: o.y })
        continue
      }
      for (const id of o.anchorIds ?? []) {
        const q = props.objects.find((z) => z.id === id)
        if (q && q.kind === 'point') map.set(q.id, { id: q.id, x: q.x, y: q.y })
      }
    }
    const pts = [...map.values()]
    if (pts.length < 2) return null
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const center: [number, number] = [
      (Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...ys) + Math.max(...ys)) / 2,
    ]
    return { pts, center, top: Math.max(...ys) }
  })()

  const startRotate = (e: React.PointerEvent) => {
    const t = rotTarget
    if (!t) return
    e.stopPropagation()
    e.preventDefault()
    const w = toWorld(e)
    const [hx, hy] = toScreen([t.center[0], t.top])
    rotating.current = {
      center: t.center,
      start: Math.atan2(w.y - t.center[1], w.x - t.center[0]),
      base: t.pts,
      handle: [hx, Math.max(24, hy - 26)],
    }
    setRotAngle(0)
    props.onDragStart('__rotate', { x: t.center[0], y: t.center[1] })
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      /* 合成事件忽略 */
    }
  }

  // 地面阴影：所有立体先落影，再画物体，影子永远在物体下方
  const shadows: { id: string; points: [number, number][]; alpha: number }[] = []
  if (props.camera) {
    for (const o of props.objects) {
      if (o.kind !== 'solid' || !o.visible) continue
      const sh = groundShadow(o.shape, props.camera, toScreen)
      if (sh) shadows.push({ id: o.id, points: sh.points, alpha: sh.alpha })
    }
  }

  const startGrip = (e: React.PointerEvent<HTMLDivElement>) => {
    gripDrag.current = { y: e.clientY, zoom: props.zoom }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const moveGrip = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!gripDrag.current) return
    const dy = gripDrag.current.y - e.clientY
    props.onZoom(gripDrag.current.zoom * (1 + dy / 240))
  }
  const endGrip = (e: React.PointerEvent<HTMLDivElement>) => {
    gripDrag.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return (
    <div className="canvas" data-tool={props.tool} ref={hostRef}>
      <svg
        className="canvas__svg"
        ref={props.svgRef}
        width={size.w}
        height={size.h}
        xmlns="http://www.w3.org/2000/svg"
        onPointerDown={handleBackgroundDown}
        onPointerMove={(e) => {
          movePoint(e)
          handleHover(e)
        }}
        onPointerUp={endPointDrag}
        onPointerCancel={endPointDrag}
        onDragOver={(e) => {
          const types = Array.from(e.dataTransfer.types)
          if (types.includes('text/chordot-shape') || types.includes('text/chordot-mech')) {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }
        }}
        onDrop={(e) => {
          const mechKind = e.dataTransfer.getData('text/chordot-mech')
          if (mechKind) {
            e.preventDefault()
            props.onMechDrop(mechKind as MechPartKind, worldAt(e.clientX, e.clientY))
            return
          }
          const id = e.dataTransfer.getData('text/chordot-shape')
          if (!id) return
          e.preventDefault()
          props.onDropShape(id, toWorld(e))
        }}
        onPointerLeave={() => {
          setHover(null)
          setEraseAt(null)
        }}
        onWheel={(e) => {
          if (props.camera) {
            const next = props.camera.zoom * (e.deltaY > 0 ? 0.92 : 1.08)
            props.onCamera({ ...props.camera, zoom: Math.min(4, Math.max(0.3, next)) })
            return
          }
          // 二维：围绕光标缩放，光标下的那一点保持不动
          const rect = props.svgRef.current?.getBoundingClientRect()
          if (!rect) return
          const factor = e.deltaY > 0 ? 0.9 : 1.1
          const next = Math.min(4, Math.max(0.3, props.zoom * factor))
          if (Math.abs(next - props.zoom) < 1e-6) return
          const px = e.clientX - rect.left
          const py = e.clientY - rect.top
          const wx = (px - cx) / s
          const wy = (cy - py) / s
          const s2 = PX_PER_UNIT * next
          props.onZoom(next)
          props.onPan({ x: px - wx * s2 - size.w / 2, y: py + wy * s2 - (size.h / 2 + 40) })
        }}
      >
        <defs>
          {/* 铅笔质感：用噪声轻微扰动笔迹边缘，像纸上的石墨粉 */}
          <filter id="inkPencil" x="-12%" y="-12%" width="124%" height="124%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.2" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
        <rect x={0} y={0} width={size.w} height={size.h} fill="#FAFAF8" />

        {gridLines}

        {/* 物理世界的地面 */}
        {props.solidPhysics &&
          props.camera &&
          (() => {
            const lines = []
            const N = 6
            for (let i = -N; i <= N; i++) {
              const [x1, y1] = projectPoint3([i, -N, 0], props.camera!, toScreen)
              const [x2, y2] = projectPoint3([i, N, 0], props.camera!, toScreen)
              const [x3, y3] = projectPoint3([-N, i, 0], props.camera!, toScreen)
              const [x4, y4] = projectPoint3([N, i, 0], props.camera!, toScreen)
              const faint = i % 2 === 0
              lines.push(
                <line key={`gx${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#E2DED8" strokeWidth={faint ? 1 : 0.6} />,
                <line key={`gy${i}`} x1={x3} y1={y3} x2={x4} y2={y4} stroke="#E2DED8" strokeWidth={faint ? 1 : 0.6} />,
              )
            }
            return (
              <g pointerEvents="none" data-ground>
                {lines}
              </g>
            )
          })()}

        {/* 物理世界的静态障碍：斜面 / 墙 */}
        {props.solidObstacles.length > 0 &&
          props.camera &&
          (() => {
            const cam = props.camera!
            return (
              <g pointerEvents="none" data-obstacles>
                {props.solidObstacles.map((o) => {
                  if (o.kind === 'ramp') {
                    const view = projectMesh(buildIncline3D(o.angleDeg ?? 30, 1, 0).mesh, cam, (p) => {
                      const [sx, sy] = toScreen([p[0] + o.x, p[1] + o.y])
                      return [sx, sy]
                    })
                    return (
                      <g key={o.id}>
                        {view.faces.map((f, i) => (
                          <polygon
                            key={`rf${i}`}
                            points={f.points.map((p) => p.join(',')).join(' ')}
                            fill={f.shade}
                            stroke="none"
                          />
                        ))}
                        {view.edges.map((e, i) => (
                          <line
                            key={`re${i}`}
                            x1={e.a[0]}
                            y1={e.a[1]}
                            x2={e.b[0]}
                            y2={e.b[1]}
                            stroke="#3d5a66"
                            strokeWidth={1}
                            strokeOpacity={0.5}
                          />
                        ))}
                      </g>
                    )
                  }
                  // 墙：一个长方体
                  const w = (o.w ?? 4) / 2
                  const d = (o.d ?? 0.6) / 2
                  const h = o.h ?? 3
                  const v: [number, number, number][] = [
                    [o.x - w, o.y - d, 0],
                    [o.x + w, o.y - d, 0],
                    [o.x + w, o.y + d, 0],
                    [o.x - w, o.y + d, 0],
                    [o.x - w, o.y - d, h],
                    [o.x + w, o.y - d, h],
                    [o.x + w, o.y + d, h],
                    [o.x - w, o.y + d, h],
                  ]
                  const faces = [
                    [0, 1, 2, 3],
                    [4, 5, 6, 7],
                    [0, 1, 5, 4],
                    [1, 2, 6, 5],
                    [2, 3, 7, 6],
                    [3, 0, 4, 7],
                  ]
                  const view = projectMesh({ vertices: v, faces }, cam, toScreen)
                  return (
                    <g key={o.id}>
                      {view.faces.map((f, i) => (
                        <polygon
                          key={`wf${i}`}
                          points={f.points.map((p) => p.join(',')).join(' ')}
                          fill={f.shade}
                          stroke="none"
                        />
                      ))}
                      {view.edges.map((e, i) => (
                        <line
                          key={`we${i}`}
                          x1={e.a[0]}
                          y1={e.a[1]}
                          x2={e.b[0]}
                          y2={e.b[1]}
                          stroke="#3d5a66"
                          strokeWidth={1}
                          strokeOpacity={0.5}
                        />
                      ))}
                    </g>
                  )
                })}
              </g>
            )
          })()}


        {props.mech && (
          <MechStage
            params={props.mech}
            toScreen={toScreen}
            toWorld={worldAt}
            selectedId={props.mechSelected}
            selectedIds={props.mechSelectedIds}
            onSelect={props.onMechSelect}
            onSelectMany={props.onMechSelectMany}
            pending={props.mechPending}
            anchor={props.mechAnchor}
            onAnchor={props.onMechAnchor}
            onLink={props.onMechLink}
            playing={props.mechPlaying}
            editing={props.mechEditing}
            vectors={props.mechVectors}
            decompose={props.mechDecompose}
            labels={props.mechLabels}
            trails={props.mechTrails}
            grid={props.mechGrid}
            snapAngle={props.mechSnapAngle}
            measure={props.mechMeasure}
            measureMode={props.mechMeasureMode}
            onMeasurePart={props.onMechMeasurePart}
            resetToken={props.mechResetToken}
            onCommitParts={props.onMechCommitParts}
            live={props.mechLive}
          />
        )}

        {props.solidIncline && (
          <SolidIncline
            angleDeg={props.solidIncline.angleDeg}
            mass={props.solidIncline.mass}
            mu={props.solidIncline.mu}
            camera={props.solidIncline.camera}
            toScreen={toScreen}
            pxPerN={props.pxPerN}
            decompose={props.solidIncline.decompose}
          />
        )}

        {/* 坐标轴：数学模式显示，物理模式只保留网格避免干扰受力图 */}
        {props.mode === 'math' && !props.camera && (
          <>
            <line x1={0} y1={cy} x2={size.w} y2={cy} stroke="#5C5A56" strokeWidth={1} opacity={0.55} />
            <line x1={cx} y1={0} x2={cx} y2={size.h} stroke="#5C5A56" strokeWidth={1} opacity={0.55} />
            {ticks && (
              <g className="canvas__ticks">
                {ticks.showX &&
                  ticks.xs.map((t) => (
                    <g key={`tx${t.v}`}>
                      <line
                        x1={t.px}
                        y1={cy - 3}
                        x2={t.px}
                        y2={cy + 3}
                        stroke="#5C5A56"
                        strokeWidth={1}
                        opacity={0.45}
                      />
                      <text
                        x={t.px}
                        y={cy + 14}
                        fontSize={10}
                        fill="#8A857D"
                        textAnchor="middle"
                        fontFamily={FONT}
                      >
                        {formatTick(t.v, ticks.step)}
                      </text>
                    </g>
                  ))}
                {ticks.showY &&
                  ticks.ys.map((t) => (
                    <g key={`ty${t.v}`}>
                      <line
                        x1={cx - 3}
                        y1={t.px}
                        x2={cx + 3}
                        y2={t.px}
                        stroke="#5C5A56"
                        strokeWidth={1}
                        opacity={0.45}
                      />
                      <text
                        x={cx - 7}
                        y={t.px + 3.5}
                        fontSize={10}
                        fill="#8A857D"
                        textAnchor="end"
                        fontFamily={FONT}
                      >
                        {formatTick(t.v, ticks.step)}
                      </text>
                    </g>
                  ))}
                <text
                  x={cx - 7}
                  y={cy + 14}
                  fontSize={10}
                  fill="#8A857D"
                  textAnchor="end"
                  fontFamily={FONT}
                >
                  O
                </text>
              </g>
            )}
          </>
        )}

        {/* 函数曲线画在最底层 */}
        {props.objects.map((o) => {
          if (o.kind !== 'function' || !o.visible) return null
          const sel = isSelected(o.id)
          return (
            <g key={o.id} data-id={o.id} onPointerDown={(e) => handleObjectDown(e, o.id)}>
              {o.curves.map((line, i) => {
                const d = line.map(toScreen).map((p) => p.join(',')).join(' ')
                return (
                  <g key={i}>
                    {/* 选中时在曲线下方垫一层淡光，曲线本身保持原色，不会被冲淡 */}
                    {sel && (
                      <polyline
                        points={d}
                        fill="none"
                        stroke="#3D5A66"
                        strokeOpacity={0.2}
                        strokeWidth={props.curveWidth + 4.5}
                        strokeLinejoin="round"
                      />
                    )}
                    <polyline
                      points={d}
                      fill="none"
                      stroke={o.color}
                      strokeWidth={props.curveWidth}
                      strokeLinejoin="round"
                    />
                  </g>
                )
              })}
              {sel && o.error && (
                <text
                  x={12}
                  y={size.h - 40}
                  fontSize={12}
                  fill="#9E9A94"
                  fontFamily={FONT}
                >
                  {o.name}：{o.error}
                </text>
              )}
            </g>
          )
        })}

        {/* 地面阴影：压在网格之上、立体之下，边缘用模糊柔化 */}
        {shadows.length > 0 && (
          <g data-shadows pointerEvents="none">
            <defs>
              <filter id="solid-shadow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2.6" />
              </filter>
            </defs>
            {shadows.map((sh) => (
              <polygon
                key={sh.id}
                points={sh.points.map((p) => p.join(',')).join(' ')}
                fill="#5c5a56"
                opacity={sh.alpha}
                filter="url(#solid-shadow)"
              />
            ))}
          </g>
        )}

        {/* 几何对象 */}
        {geometry.map((o) => {
          if (!o.visible) return null
          const sel = isSelected(o.id)
          if (o.kind === 'line') {
            const [x1, y1] = toScreen(o.a)
            const [x2, y2] = toScreen(o.b)
            return (
              <g key={o.id} data-id={o.id} onPointerDown={(e) => handleObjectDown(e, o.id)} style={{ cursor: 'default' }}>
                {sel && (
                  <line data-ui="1" x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3D5A66" strokeOpacity={0.22} strokeWidth={6} />
                )}
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={o.color} strokeWidth={1.5} />
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={hitStroke} />
              </g>
            )
          }
          if (o.kind === 'polygon') {
            const pts = o.points.map(toScreen)
            const d = pts.map((p) => p.join(',')).join(' ')
            return (
              <g key={o.id} data-id={o.id} onPointerDown={(e) => handleObjectDown(e, o.id)}>
                {sel && (
                  <polygon data-ui="1" points={d} fill="none" stroke="#3D5A66" strokeOpacity={0.22} strokeWidth={6} />
                )}
                <polygon points={d} fill={o.color} fillOpacity={0.1} stroke={o.color} strokeWidth={1.5} />
              </g>
            )
          }
          if (o.kind === 'circle') {
            const [px, py] = toScreen(o.center)
            const r = o.r * s
            return (
              <g key={o.id} data-id={o.id} onPointerDown={(e) => handleObjectDown(e, o.id)}>
                {sel && (
                  <circle data-ui="1" cx={px} cy={py} r={r} fill="none" stroke="#3D5A66" strokeOpacity={0.22} strokeWidth={6} />
                )}
                <circle cx={px} cy={py} r={r} fill={o.color} fillOpacity={0.05} stroke={o.color} strokeWidth={1.5} />
              </g>
            )
          }
          if (o.kind === 'polyline') {
            const d = o.points.map(toScreen).map((p) => p.join(',')).join(' ')
            return (
              <g key={o.id} data-id={o.id} onPointerDown={(e) => handleObjectDown(e, o.id)}>
                {sel && (
                  <polyline data-ui="1" points={d} fill="none" stroke="#3D5A66" strokeOpacity={0.22} strokeWidth={5} strokeLinejoin="round" />
                )}
                <polyline
                  points={d}
                  fill="none"
                  stroke={o.color}
                  strokeWidth={1.4}
                  strokeLinejoin="round"
                  strokeDasharray={o.dashed ? '4 4' : undefined}
                  strokeOpacity={o.dashed ? 0.55 : 1}
                />
              </g>
            )
          }
          if (o.kind === 'solid' && o.shape.type === 'sphere') {
            // 球单独画：一个圆 + 径向渐变，永远光滑，也不会有细分网格的接缝
            const c = o.shape.center
            const r = o.shape.size / 2
            const [cx, cy] = projectPoint3(c, props.camera!, toScreen)
            const [ex, ey] = projectPoint3([c[0] + r, c[1], c[2]], props.camera!, toScreen)
            const rad = Math.hypot(ex - cx, ey - cy) || 1
            const gid = `sphere-${o.id}`
            const mat =
              o.shape.material && o.shape.material !== 'none' ? o.shape.material : null
            return (
              <g key={o.id} data-id={o.id} onPointerDown={(e) => handleObjectDown(e, o.id)}>
                <defs>
                  <radialGradient id={gid} cx="35%" cy="30%" r="78%">
                    <stop offset="0%" stopColor="#fbfaf7" />
                    <stop offset="55%" stopColor="#e9e6e1" />
                    <stop offset="100%" stopColor="#c9c4bc" />
                  </radialGradient>
                  {/* 球细分太密，逐面贴纹理要上千个 pattern；改用屏幕空间图案 + 渐变压暗 */}
                  {mat && <MaterialPattern id={`sptex-${o.id}`} kind={mat} unit={44} />}
                </defs>
                <circle
                  cx={cx}
                  cy={cy}
                  r={rad}
                  fill={mat ? `url(#sptex-${o.id})` : `url(#${gid})`}
                  stroke="#3d5a66"
                  strokeOpacity={0.4}
                  strokeWidth={0.9}
                />
                {mat && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={rad}
                    fill={`url(#${gid})`}
                    opacity={0.9}
                    style={{ mixBlendMode: 'multiply' }}
                  />
                )}
                {sel && (
                  <circle
                    data-ui="1"
                    cx={cx}
                    cy={cy}
                    r={rad + 3}
                    fill="none"
                    stroke="#3D5A66"
                    strokeOpacity={0.22}
                    strokeWidth={5}
                  />
                )}
              </g>
            )
          }
          if (o.kind === 'solid') {
            const view = projectSolid(o.shape, props.camera!, toScreen)
            const mat =
              o.shape.material && o.shape.material !== 'none' ? o.shape.material : null
            return (
              <g key={o.id} data-id={o.id} onPointerDown={(e) => handleObjectDown(e, o.id)}>
                {/* 先用浅灰把轮廓填满：面与面之间的抗锯齿缝隙不会露出纸面白 */}
                <polygon
                  points={view.outline.map((p) => p.join(',')).join(' ')}
                  fill="#e6e4e0"
                  stroke="none"
                />
                {faceDefs(`sf-${o.id}`, view.faces)}
                {mat && (
                  <defs>
                    {view.faces.map((f, i) =>
                      f.tex ? (
                        <MaterialPattern
                          key={`tx${i}`}
                          id={`tx-${o.id}-${i}`}
                          kind={mat}
                          transform={`matrix(${f.tex.map((n) => n.toFixed(3)).join(' ')})`}
                        />
                      ) : null,
                    )}
                  </defs>
                )}
                {view.faces.map((f, i) => {
                  const fill = faceFill(`sf-${o.id}`, f, i)
                  const texId = mat && f.tex ? `tx-${o.id}-${i}` : null
                  return (
                    <g key={`f${i}`}>
                      <polygon
                        points={f.points.map((p) => p.join(',')).join(' ')}
                        fill={texId ? `url(#${texId})` : fill}
                        // 同色描边 0.6px：填掉相邻面之间的抗锯齿白缝，曲面才连续
                        stroke={texId ? 'none' : fill}
                        strokeWidth={0.6}
                        strokeLinejoin="round"
                      />
                      {/* 纹理只负责「是什么材料」，明暗仍按光照算，立体感不能丢 */}
                      {texId && (
                        <polygon
                          points={f.points.map((p) => p.join(',')).join(' ')}
                          fill={fill}
                          opacity={0.9}
                          style={{ mixBlendMode: 'multiply' }}
                          pointerEvents="none"
                        />
                      )}
                    </g>
                  )
                })}
                {sel &&
                  view.edges.map((e, i) => (
                    <line
                      key={`sh${i}`}
                      data-ui="1"
                      x1={e.a[0]}
                      y1={e.a[1]}
                      x2={e.b[0]}
                      y2={e.b[1]}
                      stroke="#3D5A66"
                      strokeOpacity={0.22}
                      strokeWidth={5}
                      strokeLinecap="round"
                    />
                  ))}
                {/* 轮廓：凸包描边，曲面边缘不会毛毛的 */}
                <polygon
                  points={view.outline.map((p) => p.join(',')).join(' ')}
                  fill="none"
                  stroke="#3d5a66"
                  strokeOpacity={0.35}
                  strokeWidth={0.8}
                  strokeLinejoin="round"
                />
                {view.hiddenEdges.map((e, i) => (
                  <line
                    key={`h${i}`}
                    x1={e.a[0]}
                    y1={e.a[1]}
                    x2={e.b[0]}
                    y2={e.b[1]}
                    stroke="#3d5a66"
                    strokeWidth={0.9}
                    strokeOpacity={0.32}
                    strokeDasharray="3 3"
                  />
                ))}
                {view.edges.map((e, i) => (
                  <line
                    key={`e${i}`}
                    x1={e.a[0]}
                    y1={e.a[1]}
                    x2={e.b[0]}
                    y2={e.b[1]}
                    stroke={o.color}
                    strokeWidth={1.2}
                    strokeLinejoin="round"
                  />
                ))}
                {/* 选中时画出作用在它身上的力 */}
                {sel && props.solidPhysicsInfo && (() => {
                  const cam = props.camera!
                  const c = o.shape.center
                  const mass = Math.pow(o.shape.size, 3) / 32
                  const g = props.solidPhysicsInfo.gravity
                  const list: { dir: [number, number, number]; mag: number; label: string; color: string }[] = [
                    { dir: [0, 0, -1], mag: mass * g, label: `G = ${(mass * g).toFixed(1)} N`, color: '#3a3a38' },
                  ]
                  const push = (f: PhysicsForce | undefined, name: string, color: string) => {
                    if (!f?.enabled) return
                    const { value } = evalForce(f.expr, 'time', props.solidPhysicsInfo!.time)
                    list.push({
                      dir: forceDir(f),
                      mag: Math.abs(value),
                      label: `${name} = ${Math.abs(value).toFixed(1)} N`,
                      color,
                    })
                  }
                  push(o.shape.force, 'F', '#7a5c8a')
                  push(props.solidPhysicsInfo!.global, 'F总', '#4a6b8a')
                  const [cx0, cy0] = projectPoint3(c, cam, toScreen)
                  // 按最长的那根归一化到 ~90px，保证箭头始终看得清
                  const maxMag = Math.max(...list.map((a) => a.mag), 1)
                  const scale = 90 / maxMag
                  return list
                    .filter((a) => a.mag > 0.05)
                    .map((a, i) => {
                    const [dx, dy] = projectVector(a.dir, cam, 1)
                    const l = Math.hypot(dx, dy) || 1
                    const k = (a.mag * scale) / l
                    const ex = cx0 + dx * k
                    const ey = cy0 + dy * k
                    const ux = dx / l
                    const uy = dy / l
                    return (
                      <g key={`fa${i}`} pointerEvents="none">
                        <line x1={cx0} y1={cy0} x2={ex} y2={ey} stroke={a.color} strokeWidth={1.8} />
                        <polyline
                          points={`${ex - ux * 9 - uy * 4},${ey - uy * 9 + ux * 4} ${ex},${ey} ${ex - ux * 9 + uy * 4},${ey - uy * 9 - ux * 4}`}
                          fill="none"
                          stroke={a.color}
                          strokeWidth={1.8}
                          strokeLinecap="round"
                        />
                        <text
                          x={ex + ux * 14 - uy * i * 16}
                          y={ey + uy * 14 + ux * i * 16}
                          fontSize={11.5}
                          fill={a.color}
                          stroke="#FAFAF8"
                          strokeWidth={3}
                          style={{ paintOrder: 'stroke' }}
                          fontFamily={FONT}
                          dominantBaseline="middle"
                        >
                          {a.label}
                        </text>
                      </g>
                    )
                  })
                })()}

                {/* 顶点小圆点只在多面体上画；球/圆柱细分出的顶点会变成一片麻点 */}
                {view.vertices.length <= 16 &&
                  view.vertices.map((v, i) => (
                    <circle key={`v${i}`} cx={v.x} cy={v.y} r={2.4} fill="#FFFFFF" stroke={o.color} strokeWidth={1.2} />
                  ))}
              </g>
            )
          }
          // point
          const [px, py] = toScreen([o.x, o.y])
          const grabbing = props.draggingId === o.id
          return (
            <g
              key={o.id}
              data-id={o.id}
              onPointerDown={(e) => {
                if (props.tool === 'pen' || props.tool === 'eraser') return
                if (constructing) {
                  e.stopPropagation()
                  props.onCanvasClick({ x: o.x, y: o.y }, o.id, e.shiftKey)
                  return
                }
                pick(e, o.id)
                startPointDrag(e, o)
              }}
            >
              {sel && (
                <circle data-ui="1" cx={px} cy={py} r={9} fill="none" stroke="#3D5A66" strokeOpacity={0.22} strokeWidth={6} />
              )}
              <circle
                cx={px}
                cy={py}
                r={sel ? 6 : 3.5}
                fill="#FFFFFF"
                stroke={sel ? '#3D5A66' : o.color}
                strokeWidth={1.5}
              />
              {(!labelPlace.get(o.id)?.hide || sel) && (
              <text
                x={px + (labelPlace.get(o.id)?.dx ?? 8)}
                y={py + (labelPlace.get(o.id)?.dy ?? -8)}
                fontSize={12}
                fill="#5C5A56"
                stroke="#FAFAF8"
                strokeWidth={3}
                style={{ paintOrder: 'stroke' }}
                fontFamily={FONT}
                textAnchor={labelPlace.get(o.id)?.anchor ?? 'start'}
                data-plabel={o.id}
              >
                {o.name}
              </text>
              )}
              <circle
                cx={px}
                cy={py}
                r={hit}
                fill="transparent"
                style={{ cursor: o.draggable ? (grabbing ? 'grabbing' : 'grab') : 'default' }}
              />
            </g>
          )
        })}

        {/* 构造预览：已拾取点到光标 */}
        {constructing &&
          hover &&
          props.picks.length > 0 &&
          (() => {
            const picked = props.picks
              .map((id) => props.objects.find((o) => o.id === id))
              .filter((o): o is PointObj => !!o && o.kind === 'point')
            if (picked.length === 0) return null
            const [ax, ay] = toScreen([picked[0].x, picked[0].y])
            const [hx, hy] = toScreen([hover.x, hover.y])
            if (props.tool === 'circle') {
              return (
                <circle
                  data-ui="1"
                  cx={ax}
                  cy={ay}
                  r={Math.hypot(hx - ax, hy - ay)}
                  fill="none"
                  stroke="#3D5A66"
                  strokeOpacity={0.45}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
              )
            }
            const path = [...picked.map((p) => toScreen([p.x, p.y])), [hx, hy] as [number, number]]
            return (
              <polyline
                data-ui="1"
                points={path.map((p) => p.join(',')).join(' ')}
                fill="none"
                stroke="#3D5A66"
                strokeOpacity={0.45}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            )
          })()}

        {/* 曲线标签：画在几何之上，免得被线段盖住 */}
        {curveLabels.map((l) => (
          <text
            key={`cl${l.id}`}
            x={l.x}
            y={l.y}
            fontSize={11}
            fontStyle="italic"
            fill={l.color}
            fontFamily={MATH_FONT}
            stroke="#FFFFFF"
            strokeWidth={3}
            strokeLinejoin="round"
            paintOrder="stroke"
            style={{ pointerEvents: 'none' }}
          >
            {l.name}
          </text>
        ))}

        {/* 测量标注：不参与选择 */}
        {props.annotation && (() => {
          const an = props.annotation as Annotation
          const label = (x: number, y: number, text: string, anchor: 'start' | 'middle' | 'end' = 'middle') => (
            <text
              x={x}
              y={y}
              fontSize={12}
              fill="#3D5A66"
              stroke="#FAFAF8"
              strokeWidth={3}
              style={{ paintOrder: 'stroke' }}
              fontFamily={MATH_FONT}
              textAnchor={anchor}
              dominantBaseline="middle"
            >
              {text}
            </text>
          )

          if (an.kind === 'distance') {
            const [ax, ay] = toScreen([an.a.x, an.a.y])
            const [bx, by] = toScreen([an.b.x, an.b.y])
            const dx = bx - ax
            const dy = by - ay
            const len = Math.hypot(dx, dy) || 1
            const nx = -dy / len
            const ny = dx / len
            const off = 22
            const p1: [number, number] = [ax + nx * off, ay + ny * off]
            const p2: [number, number] = [bx + nx * off, by + ny * off]
            const tick = 5
            return (
              <g pointerEvents="none">
                <line x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke="#3D5A66" strokeOpacity={0.6} strokeWidth={1} />
                <line x1={p1[0] - nx * tick} y1={p1[1] - ny * tick} x2={p1[0] + nx * tick} y2={p1[1] + ny * tick} stroke="#3D5A66" strokeOpacity={0.6} strokeWidth={1} />
                <line x1={p2[0] - nx * tick} y1={p2[1] - ny * tick} x2={p2[0] + nx * tick} y2={p2[1] + ny * tick} stroke="#3D5A66" strokeOpacity={0.6} strokeWidth={1} />
                {label((p1[0] + p2[0]) / 2 + nx * 12, (p1[1] + p2[1]) / 2 + ny * 12, an.text)}
              </g>
            )
          }

          if (an.kind === 'angle') {
            const [vx, vy] = toScreen([an.v.x, an.v.y])
            const [ax, ay] = toScreen([an.a.x, an.a.y])
            const [cx2, cy2] = toScreen([an.c.x, an.c.y])
            const a1 = Math.atan2(ay - vy, ax - vx)
            const a2 = Math.atan2(cy2 - vy, cx2 - vx)
            let delta = a2 - a1
            while (delta > Math.PI) delta -= Math.PI * 2
            while (delta < -Math.PI) delta += Math.PI * 2
            const r = 34
            const s: [number, number] = [vx + r * Math.cos(a1), vy + r * Math.sin(a1)]
            const e: [number, number] = [vx + r * Math.cos(a2), vy + r * Math.sin(a2)]
            const mid = a1 + delta / 2
            return (
              <g pointerEvents="none">
                <path
                  d={`M ${s[0]} ${s[1]} A ${r} ${r} 0 0 ${delta > 0 ? 1 : 0} ${e[0]} ${e[1]}`}
                  fill="none"
                  stroke="#3D5A66"
                  strokeOpacity={0.6}
                  strokeWidth={1}
                />
                {label(vx + (r + 16) * Math.cos(mid), vy + (r + 16) * Math.sin(mid), an.text)}
              </g>
            )
          }

          if (an.kind === 'area') {
            const [px, py] = toScreen([an.center.x, an.center.y])
            return <g pointerEvents="none">{label(px, py, an.text)}</g>
          }

          const [cx3, cy3] = toScreen([an.center.x, an.center.y])
          return <g pointerEvents="none">{label(cx3, cy3 - an.r * s - 10, an.text)}</g>
        })()}

        {/* 约束冲突标记：12px 中性灰感叹号，不参与选择 */}
        {props.conflictIds.length > 0 &&
          (() => {
            const pts = props.conflictIds
              .map((id) => props.objects.find((o) => o.id === id))
              .filter((o): o is PointObj => !!o && o.kind === 'point')
            if (pts.length === 0) return null
            const wx = pts.reduce((sum, p) => sum + p.x, 0) / pts.length
            const wy = pts.reduce((sum, p) => sum + p.y, 0) / pts.length
            const [mx, my] = toScreen([wx, wy])
            return (
              <g pointerEvents="none" data-conflict>
                <circle cx={mx} cy={my - 28} r={6} fill="#F2F0EC" stroke="#9E9A94" strokeWidth={1} />
                <text
                  x={mx}
                  y={my - 28}
                  fontSize={10}
                  fill="#5C5A56"
                  fontFamily={FONT}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  !
                </text>
              </g>
            )
          })()}

        {/* 约束标记 */}
        {props.badges.map((b, i) => {
          const [bx, by] = toScreen([b.x, b.y])
          return (
            <g key={`badge${i}`} pointerEvents="none">
              <text
                x={bx}
                y={by - 10 - b.stack * 13}
                fontSize={11}
                fill="#3D5A66"
                stroke="#FAFAF8"
                strokeWidth={3}
                style={{ paintOrder: 'stroke' }}
                fontFamily={FONT}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {b.label}
              </text>
            </g>
          )
        })}

        {/* 力矢量 */}
        {forces.map((f) => {
          if (!f.visible) return null
          const sel = isSelected(f.id)
          const [sx, sy] = toScreen(f.at)
          const rad = (f.angle * Math.PI) / 180
          const dx = Math.cos(rad)
          const dy = -Math.sin(rad)
          const len = f.magnitude * props.pxPerN * props.forceScale
          const tx = sx + dx * len
          const ty = sy + dy * len
          const head = 7
          const spread = 0.44
          const h1: [number, number] = [tx - head * Math.cos(rad - spread), ty + head * Math.sin(rad - spread)]
          const h2: [number, number] = [tx - head * Math.cos(rad + spread), ty + head * Math.sin(rad + spread)]
          const labelX = tx + dx * 12
          const labelY = ty + dy * 12
          const anchor = dx > 0.25 ? 'start' : dx < -0.25 ? 'end' : 'middle'

          return (
            <g key={f.id} data-id={f.id} onPointerDown={(e) => pick(e, f.id)}>
              {sel && (
                <line data-ui="1" x1={sx} y1={sy} x2={tx} y2={ty} stroke="#3D5A66" strokeOpacity={0.2} strokeWidth={7} strokeLinecap="round" />
              )}
              <line x1={sx} y1={sy} x2={tx} y2={ty} stroke={f.color} strokeWidth={1.5} strokeLinecap="round" />
              <polygon points={`${tx},${ty} ${h1[0]},${h1[1]} ${h2[0]},${h2[1]}`} fill={f.color} />
              <line x1={sx} y1={sy} x2={tx} y2={ty} stroke="transparent" strokeWidth={hitStroke} strokeLinecap="round" />
              <text
                x={labelX}
                y={labelY}
                fontSize={12}
                fill={f.color}
                stroke="#FAFAF8"
                strokeWidth={3}
                style={{ paintOrder: 'stroke' }}
                fontFamily={MATH_FONT}
                textAnchor={anchor}
                dominantBaseline="middle"
              >
                {props.forceScale < 1 ? f.name : `${f.name} = ${f.magnitude.toFixed(1)} N`}
              </text>
              {sel && (
                <>
                  <circle data-ui="1" cx={sx} cy={sy} r={4} fill="#FFFFFF" stroke="#3D5A66" strokeWidth={1.5} />
                  <circle data-ui="1" cx={tx} cy={ty} r={4} fill="#FFFFFF" stroke="#3D5A66" strokeWidth={1.5} />
                </>
              )}
            </g>
          )
        })}

        {/* 正交分解分量：降饱和虚线箭头，不参与选择、不进左栏 */}
        {forces.map((f) => {
          if (!f.visible || !props.decomposed.includes(f.id)) return null
          const [sx, sy] = toScreen(f.at)
          const rad = (f.angle * Math.PI) / 180
          const fx = f.magnitude * Math.cos(rad)
          const fy = f.magnitude * Math.sin(rad)
          const parts: {
            key: string
            ex: number
            ey: number
            label: string
            tx: number
            ty: number
            anchor: 'start' | 'middle' | 'end'
          }[] = []

          if (Math.abs(fx) > 0.05) {
            const ex = sx + fx * props.pxPerN * props.forceScale
            parts.push({
              key: 'x',
              ex,
              ey: sy,
              label: `${f.name}x = ${Math.abs(fx).toFixed(1)} N`,
              tx: ex + (fx > 0 ? 8 : -8),
              ty: sy - 10,
              anchor: fx > 0 ? 'start' : 'end',
            })
          }
          if (Math.abs(fy) > 0.05) {
            const ey = sy - fy * props.pxPerN * props.forceScale
            // 与合力同向的分量（如竖直重力的 Gy）会把标签压在主标签上，错开一点
            const coincide = Math.abs(Math.abs(fy) - f.magnitude) < 0.5
            parts.push({
              key: 'y',
              ex: sx,
              ey,
              label: `${f.name}y = ${Math.abs(fy).toFixed(1)} N`,
              tx: sx + 8,
              ty: ey + (fy > 0 ? -8 : coincide ? 32 : 14),
              anchor: 'start',
            })
          }

          return (
            <g key={`cmp-${f.id}`} pointerEvents="none" data-decomp={f.id}>
              {/* 补上矩形的另外两条边：从两个分量末端连虚线到合力末端，
                  和三维斜面分解的观感一致，学生一眼能看出「投影」关系 */}
              {parts.length === 2 && (
                <g
                  data-decomp-box
                  stroke={f.color}
                  strokeOpacity={0.42}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  fill="none"
                >
                  <line
                    x1={sx + fx * props.pxPerN * props.forceScale}
                    y1={sy - fy * props.pxPerN * props.forceScale}
                    x2={sx + fx * props.pxPerN * props.forceScale}
                    y2={sy}
                  />
                  <line
                    x1={sx + fx * props.pxPerN * props.forceScale}
                    y1={sy - fy * props.pxPerN * props.forceScale}
                    x2={sx}
                    y2={sy - fy * props.pxPerN * props.forceScale}
                  />
                </g>
              )}
              {parts.map((p) => {
                const vx = p.ex - sx
                const vy = p.ey - sy
                const l = Math.hypot(vx, vy) || 1
                const ux = vx / l
                const uy = vy / l
                const h = 5
                const px = -uy * 2.6
                const py = ux * 2.6
                const h1x = p.ex - ux * h + px
                const h1y = p.ey - uy * h + py
                const h2x = p.ex - ux * h - px
                const h2y = p.ey - uy * h - py
                return (
                  <g key={p.key}>
                    <line
                      x1={sx}
                      y1={sy}
                      x2={p.ex}
                      y2={p.ey}
                      stroke={f.color}
                      strokeOpacity={0.55}
                      strokeWidth={1}
                      strokeDasharray="5 4"
                    />
                    <polygon
                      points={`${p.ex},${p.ey} ${h1x},${h1y} ${h2x},${h2y}`}
                      fill={f.color}
                      fillOpacity={0.55}
                    />
                    <text
                      x={p.tx}
                      y={p.ty}
                      fontSize={12}
                      fill={f.color}
                      fillOpacity={0.7}
                      stroke="#FAFAF8"
                      strokeWidth={3}
                      style={{ paintOrder: 'stroke' }}
                      fontFamily={MATH_FONT}
                      textAnchor={p.anchor}
                      dominantBaseline="middle"
                    >
                      {p.label}
                    </text>
                  </g>
                )
              })}
            </g>
          )
        })}

        {/* 拖动时实时显示相邻线段的长度 */}
        {props.draggingId &&
          (() => {
            const lines = props.objects.filter(
              (o): o is Extract<GeoObj, { kind: 'line' }> =>
                o.kind === 'line' && !!o.anchorIds?.includes(props.draggingId!),
            )
            return lines.map((l) => {
              const a = toScreen(l.a)
              const b = toScreen(l.b)
              const len = Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1])
              const mx = (a[0] + b[0]) / 2
              const my = (a[1] + b[1]) / 2
              return (
                <g key={`len-${l.id}`} pointerEvents="none" data-len>
                  <rect
                    x={mx - 26}
                    y={my - 17}
                    width={52}
                    height={16}
                    rx={3}
                    fill="#FAFAF8"
                    fillOpacity={0.92}
                    stroke="#D8D4CE"
                    strokeWidth={0.8}
                  />
                  <text
                    x={mx}
                    y={my - 5}
                    fontSize={11}
                    fill="#3D5A66"
                    fontFamily={FONT}
                    textAnchor="middle"
                  >
                    {len.toFixed(2)} cm
                  </text>
                </g>
              )
            })
          })()}

        {/* 手绘批注：画在所有对象之上 */}
        <g data-strokes>
          {[...(props.hideInk ? [] : props.strokes), ...(draft ? [draft] : [])].map((st) => {
            const pts =
              st.space === 'world' ? st.points.map((p) => toScreen(p)) : st.points
            if (pts.length === 0) return null
            // 世界坐标里的笔迹是「画在纸上」的，线宽跟着缩放走；三维批注是屏幕像素，固定
            const w = st.space === 'world' ? st.width * (s / PX_PER_UNIT) : st.width
            const marker = st.mode === 'marker'
            const pencil = st.mode === 'pencil'
            const variable = !!st.weights && st.weights.length === pts.length && pts.length > 1
            const common = {
              key: st.id,
              'data-ui': st === draft ? '1' : undefined,
              pointerEvents: 'none' as const,
              stroke: st.color,
              fill: st.color,
            }
            // 点一下 = 一个圆点（以前会被当成空笔画丢掉）
            if (pts.length === 1) {
              return (
                <circle
                  key={st.id}
                  data-ui={st === draft ? '1' : undefined}
                  cx={pts[0][0]}
                  cy={pts[0][1]}
                  r={Math.max(0.8, w / 2)}
                  fill={st.color}
                  fillOpacity={marker ? 0.3 : pencil ? 0.85 : 1}
                  pointerEvents="none"
                />
              )
            }
            if (variable) {
              // 变宽笔迹：一条闭合带子 + 两端圆头，接近真实手写的轻重变化
              const d = ribbonPath(pts, st.weights!, w)
              return (
                <g key={st.id} data-ui={st === draft ? '1' : undefined} pointerEvents="none">
                  <path
                    d={d}
                    fill={st.color}
                    fillOpacity={pencil ? 0.82 : 1}
                    stroke="none"
                    filter={pencil ? 'url(#inkPencil)' : undefined}
                  />
                  <circle cx={pts[0][0]} cy={pts[0][1]} r={Math.max(0.35, (w * st.weights![0]) / 2)} fill={st.color} />
                  <circle
                    cx={pts[pts.length - 1][0]}
                    cy={pts[pts.length - 1][1]}
                    r={Math.max(0.35, (w * st.weights![st.weights!.length - 1]) / 2)}
                    fill={st.color}
                  />
                </g>
              )
            }
            return (
              <path
                {...common}
                d={smoothPath(pts)}
                fill="none"
                strokeWidth={w}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity={marker ? 0.32 : pencil ? 0.85 : 1}
                filter={pencil ? 'url(#inkPencil)' : undefined}
                style={marker ? { mixBlendMode: 'multiply' } : undefined}
              />
            )
          })}
        </g>

        {/* 橡皮光标圈：比命中半径略大，让老师知道会擦掉多宽 */}
        {eraseAt && props.tool === 'eraser' && (
          <g pointerEvents="none" data-ui="1">
            <circle
              cx={eraseAt[0]}
              cy={eraseAt[1]}
              r={9}
              fill="rgba(61,90,102,0.06)"
              stroke="#3d5a66"
              strokeOpacity={0.45}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          </g>
        )}
        {/* 旋转手柄：选中对象后出现在包围盒上方 */}
        {rotTarget &&
          (() => {
            const [hx, hy] =
              rotating.current?.handle ??
              (() => {
                const [x, y] = toScreen([rotTarget.center[0], rotTarget.top])
                return [x, Math.max(24, y - 26)] as [number, number]
              })()
            const [cx0, cy0] = toScreen(rotTarget.center)
            return (
              <g data-ui="1" data-rotate>
                <line
                  x1={cx0}
                  y1={cy0}
                  x2={hx}
                  y2={hy}
                  stroke="#3d5a66"
                  strokeOpacity={0.22}
                  strokeDasharray="3 3"
                  pointerEvents="none"
                />
                <circle
                  cx={hx}
                  cy={hy}
                  r={11}
                  fill="rgba(250,250,248,0.94)"
                  stroke="#3d5a66"
                  strokeOpacity={0.55}
                  strokeWidth={1}
                  style={{ cursor: 'grab' }}
                  onPointerDown={startRotate}
                />
                <path
                  d={`M${hx - 3.5} ${hy + 2.9} A4.6 4.6 0 1 1 ${hx + 4} ${hy + 2.3}`}
                  fill="none"
                  stroke="#3d5a66"
                  strokeOpacity={0.85}
                  strokeWidth={1.3}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
                {rotAngle !== null && (
                  <text
                    x={hx + 16}
                    y={hy + 1}
                    fontSize={11.5}
                    fill="#3d5a66"
                    stroke="#FAFAF8"
                    strokeWidth={3}
                    style={{ paintOrder: 'stroke' }}
                    fontFamily={FONT}
                    dominantBaseline="middle"
                  >
                    {rotAngle.toFixed(0)}°
                  </text>
                )}
              </g>
            )
          })()}
      </svg>

      <div className="canvas__scale">{props.scaleText}</div>

      {props.camera && (
        <div className="canvas__views">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className="canvas__view"
              data-active={props.camera!.view === v.id}
              title={`切换到${v.label}视图`}
              onClick={() =>
                props.onCamera({
                  ...props.camera!,
                  azimuth: v.azimuth,
                  elevation: v.elevation,
                  view: v.id,
                })
              }
            >
              {v.label}
            </button>
          ))}
          <span className="canvas__viewsep" />
          <button
            className="canvas__view"
            data-active={props.camera!.perspective !== false}
            title="切换透视 / 正交投影"
            onClick={() =>
              props.onCamera({
                ...props.camera!,
                perspective: props.camera!.perspective === false,
              })
            }
          >
            透视
          </button>
        </div>
      )}

      {/* 空状态卡片：有批注或在画批注时都收起来，别挡着笔迹 */}
      {props.objects.length === 0 &&
        !props.camera &&
        !props.mech &&
        !props.solidIncline &&
        props.strokes.length === 0 &&
        props.tool !== 'pen' &&
        props.tool !== 'eraser' && (
        <div className="empty">
          <div className="empty__card">
          <p className="empty__text">在左下角输入表达式画函数，或从屏幕底部的工具栏选一个工具开始作图。</p>
          <p className="empty__hint">
            也可以按 <kbd>Ctrl</kbd>+<kbd>K</kbd> 打开命令面板、<kbd>Ctrl</kbd>+<kbd>/</kbd> 打开符号键盘，
            或从「模板库」里挑一个现成的课件。
          </p>
          <div className="empty__actions">
            <button className="btn" onClick={() => props.onEmptyAction('expr')}>
              输入表达式…
            </button>
            <button className="btn" onClick={() => props.onEmptyAction('point')}>
              添加点
            </button>
            <button className="btn" onClick={() => props.onEmptyAction('force')}>
              放置力
            </button>
          </div>
          </div>
        </div>
      )}

      <div
        className="canvas__grip"
        title="拖拽缩放"
        onPointerDown={startGrip}
        onPointerMove={moveGrip}
        onPointerUp={endGrip}
        onPointerCancel={endGrip}
      >
        <GripIcon size={14} />
      </div>
    </div>
  )
}
