import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import Matter from 'matter-js'
import { compile, type EvalFunction } from 'mathjs'
import type { MechLink, MechLinkKind, MechLive, MechLivePart, MechParams, MechPart } from '../kernel/types'
import {
  attachPoint,
  gearRadius,
  inertiaKind,
  isStaticPart,
  linkRatio,
  linkVias,
  materialOf,
  MECH_FORCE_SCALE,
  MECH_GROUND_Y,
  MECH_MATERIALS,
  MECH_PART_SPEC,
  PISTON_DEFAULTS,
  ROPE_K,
  SPRING_DEFAULTS,
} from '../model/mech'

/**
 * 机构装配的画布层（SVG + Matter.js）。
 *
 * 23 种部件 / 10 种连接 / 网格 / 轨迹 / 标签 / 测距 / 实时读数都在这里：
 * - 部件的位置由引擎持有，只有「拖完一次」才写回文档（onCommitParts），
 *   播放过程绝不碰文档，撤销栈不会被刷爆；
 * - 弹簧 / 绳 / 活塞 / 磁铁 / 引力 / 传送带 / 推力这些课本里的力由 physicsStep 自己施加，
 *   k、c、μ、T 才是物理课上讲的量；重力也统一手动施加（引擎 gravity.y = 0），
 *   这样每个部件才能有自己的「自重比例」；
 * - 实时读数写进 props.live.current，不触发 React 重渲染。
 *
 * 坐标约定（旧实现的坑，别重新踩）：
 * - 世界坐标 y 向上，地面在 MECH_GROUND_Y；Matter 的 position 直接传世界坐标，
 *   所以数值上 Matter 也是 y 向上（重力取负）。角度同理：body.angle 就是世界角（弧度、逆时针为正），
 *   SVG 里再按屏幕坐标取负（rotate(-angle)）。旧版把 body.angle 取成 -angle，会让碰撞体和画面
 *   关于 x 轴对称（斜面的碰撞面跑到画面背面），§3.1 斜面 / §3.2 圆弧轨道的世界几何也要求这里用世界角。
 * - body.velocity 是 Matter 归一化到 16.67ms 的每帧位移，换 m/s 乘 60（VEL_SCALE）；
 *   力 / 力矩的 Matter 单位 = 牛顿 × 1e-6（MECH_FORCE_SCALE）。
 * - 轨道约束直接改 positionPrev 抹掉法向速度（Verlet 的上一帧位置，没进类型）。
 */

/* ───────── 常量 ───────── */

const STEP = 1 / 120
const DEG = Math.PI / 180
/** body.velocity（每帧位移，归一化到 16.67ms）→ m/s */
const VEL_SCALE = 1000 / 16.667
/** 真实模式「按住拖动」的等效弹簧：劲度与最大拉力（N） */
const PULL_K = 90
const PULL_MAX = 60
/** 碰撞类别：部件 / 场地（静态件）/ 地面 */
const CAT_PART = 0x0001
const CAT_FIELD = 0x0002
const CAT_GROUND = 0x0004
const FULL_MASK = 0xffffffff
/** 杆的刚性约束阻尼 */
const ROD_DAMPING = 0.04
/** 轨迹采样：每 4 步一个点，最多 160 点 */
const TRAIL_EVERY = 4
const MAX_TRAIL = 160
/** 实时读数每 6 步写一次（约 20Hz，够面板轮询） */
const LIVE_EVERY = 6
/** 拖动判定阈值（屏幕像素） */
const DRAG_PX = 3

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const radDeg = (rad: number) => (rad * 180) / Math.PI
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const round3 = (v: number) => Math.round(v * 1000) / 1000
const stopEvent = (e: ReactPointerEvent) => {
  e.stopPropagation()
}

/* ───────── 类型 ───────── */

interface Point2 {
  x: number
  y: number
}

interface ViaBody {
  id: string
  body: Matter.Body
}

interface LinkForceResult {
  /** A / B 端受到的力（世界坐标，N） */
  fA: Point2
  fB: Point2
  /** 连接点世界坐标（力偏心地施加，铰链 / 端点偏移靠它产生力矩） */
  pa: Point2
  pb: Point2
  /** 绳绕过动滑轮时对滑轮的作用力 */
  extras: { id: string; x: number; y: number; at: Point2 }[]
}

interface Rig {
  engine: Matter.Engine
  bodies: Map<string, Matter.Body>
  ground: Matter.Body
  /** 铰链初始相对角（弧度），角度限位以它为基准 */
  hingeInit: Map<string, number>
}

interface DragState {
  id: string
  startClientX: number
  startClientY: number
  /** 按下时指针的世界坐标 */
  originX: number
  originY: number
  /** 被拖主部件的起始坐标 */
  baseX: number
  baseY: number
  /** 一起搬的部件（含主部件，带起始坐标） */
  members: { id: string; startX: number; startY: number }[]
  moved: boolean
}

interface Props {
  params: MechParams
  toScreen: (p: [number, number]) => [number, number]
  toWorld: (clientX: number, clientY: number) => { x: number; y: number }
  selectedId: string | null
  selectedIds: string[]
  onSelect: (id: string | null, kind: 'part' | 'link' | null) => void
  onSelectMany: (ids: string[]) => void
  pending: MechLinkKind | null
  anchor: string | null
  onAnchor: (id: string | null) => void
  onLink: (kind: MechLinkKind, a: string, b: string) => void
  playing: boolean
  editing: boolean
  vectors: boolean
  decompose: boolean
  labels: boolean
  trails: boolean
  grid: number
  snapAngle: boolean
  measure: { a: string; b: string } | null
  measureMode: boolean
  onMeasurePart: (id: string) => void
  resetToken: number
  onCommitParts: (parts: MechPart[]) => void
  /** 引擎实时读数写进这个 ref，MechBar 轮询显示；不触发 React 重渲染 */
  live: { current: MechLive }
}

/* ───────── 部件惯量 ───────── */

/** 部件有效转动惯量（kg·m²）；Infinity = 只滑不转（方块 / 小车 / 砝码） */
function inertiaOf(part: MechPart): number {
  const m = Math.max(0.02, finite(part.mass) ? part.mass : 1)
  const kind = inertiaKind(part)
  if (kind === 'none') return Infinity
  const r = Math.max(0.02, part.size)
  // 飞轮：质量集中在轮缘，取 0.85mr²（比薄壁圆环略小）
  if (part.kind === 'flywheel') return 0.85 * m * r * r
  if (kind === 'hoop') return m * r * r
  if (kind === 'rod') {
    const L = 2 * r
    const t = 2 * Math.max(0.005, part.size2 ?? 0)
    return (m * (L * L + t * t)) / 12
  }
  return 0.5 * m * r * r
}

/* ───────── 几何 / 速度 ───────── */

/** 部件局部连接点 → 世界坐标（body.angle 是世界角） */
function bodyPoint(body: Matter.Body, off?: { x: number; y: number }): Point2 {
  if (!off) return { x: body.position.x, y: body.position.y }
  const c = Math.cos(body.angle)
  const s = Math.sin(body.angle)
  return {
    x: body.position.x + off.x * c - off.y * s,
    y: body.position.y + off.x * s + off.y * c,
  }
}

const bodyVel = (body: Matter.Body): Point2 => ({
  x: body.velocity.x * VEL_SCALE,
  y: body.velocity.y * VEL_SCALE,
})

function unit(from: Point2, to: Point2): Point2 {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy) || 1e-9
  return { x: dx / len, y: dy / len }
}

/* ───────── 连接力（物理步与受力分解共用） ───────── */

/**
 * 一条连接对两端的作用力（世界坐标，N）+ 两个连接点。
 * 杆 / 铰链 / 焊接由 Matter 约束负责；皮带 / 齿轮 / 齿条是速度耦合；这里都返回 null。
 */
function linkForce(link: MechLink, A: Matter.Body, B: Matter.Body, vias: ViaBody[]): LinkForceResult | null {
  const pa = bodyPoint(A, link.offsetA)
  const pb = bodyPoint(B, link.offsetB)

  if (link.kind === 'rope') {
    const route: Point2[] = [pa, ...vias.map((v) => ({ x: v.body.position.x, y: v.body.position.y })), pb]
    let total = 0
    for (let i = 1; i < route.length; i++) total += Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y)
    const stretch = total - link.rest
    // 绳只拉不推
    if (stretch <= 1e-6) return null
    const T = ROPE_K * stretch
    const extras: LinkForceResult['extras'] = []
    const first = route[1]
    const last = route[route.length - 2]
    const fA = { x: unit(pa, first).x * T, y: unit(pa, first).y * T }
    const fB = { x: unit(pb, last).x * T, y: unit(pb, last).y * T }
    // 动滑轮：绳在两侧各有一段张力，合成 T·(u_prev + u_next)（定滑轮钉死，不受力由 apply 跳过）
    for (let i = 0; i < vias.length; i++) {
      const P = route[i + 1]
      const u1 = unit(P, route[i])
      const u2 = unit(P, route[i + 2])
      const fx = T * (u1.x + u2.x)
      const fy = T * (u1.y + u2.y)
      if (Math.abs(fx) > 1e-9 || Math.abs(fy) > 1e-9) extras.push({ id: vias[i].id, x: fx, y: fy, at: P })
    }
    return { fA, fB, pa, pb, extras }
  }

  // 其余是弹簧 / 阻尼 / 活塞：两端都固定就没有可施加的力
  if (A.isStatic && B.isStatic) return null
  const dx = pb.x - pa.x
  const dy = pb.y - pa.y
  const dist = Math.hypot(dx, dy) || 1e-6
  const nx = dx / dist
  const ny = dy / dist
  const stretch = dist - link.rest

  if (link.kind === 'spring') {
    const k = finite(link.k) ? link.k : SPRING_DEFAULTS.k
    const c = finite(link.c) ? link.c : 0
    const va = A.isStatic ? { x: 0, y: 0 } : bodyVel(A)
    const vb = B.isStatic ? { x: 0, y: 0 } : bodyVel(B)
    const rel = (vb.x - va.x) * nx + (vb.y - va.y) * ny
    const f = k * stretch + c * rel
    if (Math.abs(f) < 1e-9) return null
    return { fA: { x: nx * f, y: ny * f }, fB: { x: -nx * f, y: -ny * f }, pa, pb, extras: [] }
  }

  if (link.kind === 'damper') {
    const c = finite(link.c) ? link.c : 2
    const va = A.isStatic ? { x: 0, y: 0 } : bodyVel(A)
    const vb = B.isStatic ? { x: 0, y: 0 } : bodyVel(B)
    const rel = (vb.x - va.x) * nx + (vb.y - va.y) * ny
    const f = c * rel
    if (Math.abs(f) < 1e-9) return null
    return { fA: { x: nx * f, y: ny * f }, fB: { x: -nx * f, y: -ny * f }, pa, pb, extras: [] }
  }

  if (link.kind === 'piston') {
    const k = finite(link.k) ? link.k : PISTON_DEFAULTS.k
    const maxF = Math.max(0, finite(link.maxForce) ? link.maxForce : PISTON_DEFAULTS.maxForce)
    const target = finite(link.target) ? link.target : link.rest
    const f = clamp(k * (target - dist), -maxF, maxF)
    if (Math.abs(f) < 1e-9) return null
    // 目标比现在长 → 两端推开；目标比现在短 → 两端拉近
    return { fA: { x: -nx * f, y: -ny * f }, fB: { x: nx * f, y: ny * f }, pa, pb, extras: [] }
  }

  return null
}

/* ───────── 连接件的画法：弹簧折线 / 绳下垂曲线 ───────── */

/** 弹簧：中点折线，圈数按自然长度定，拉伸时圈会变稀 */
function springPath(a: [number, number], b: [number, number], coils: number, amp: number) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const nx = -uy
  const ny = ux
  const lead = Math.min(14, len * 0.14)
  const sx = a[0] + ux * lead
  const sy = a[1] + uy * lead
  const ex = b[0] - ux * lead
  const ey = b[1] - uy * lead
  const n = Math.max(6, coils * 2)
  let d = `M${a[0].toFixed(1)} ${a[1].toFixed(1)} L${sx.toFixed(1)} ${sy.toFixed(1)}`
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n
    const side = i % 2 === 0 ? 1 : -1
    const px = sx + (ex - sx) * t + nx * amp * side
    const py = sy + (ey - sy) * t + ny * amp * side
    d += ` L${px.toFixed(1)} ${py.toFixed(1)}`
  }
  d += ` L${ex.toFixed(1)} ${ey.toFixed(1)} L${b[0].toFixed(1)} ${b[1].toFixed(1)}`
  return d
}

/** 绳：短了会自然下垂（二次贝塞尔，控制点在中点下方） */
function ropePath(a: [number, number], b: [number, number], sag: number) {
  const mx = (a[0] + b[0]) / 2
  const my = (a[1] + b[1]) / 2 + sag
  return `M${a[0].toFixed(1)} ${a[1].toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`
}

/** 带传动的两条外公切线（屏幕上两个圆的切点） */
function beltTangent(a: [number, number], b: [number, number], ra: number, rb: number) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const d = Math.hypot(dx, dy) || 1
  const ux = dx / d
  const uy = dy / d
  const diff = clamp((ra - rb) / d, -1, 1)
  const sq = Math.sqrt(Math.max(0, 1 - diff * diff))
  const nx = ux * diff - uy * sq
  const ny = uy * diff + ux * sq
  return {
    a1: [a[0] + nx * ra, a[1] + ny * ra] as [number, number],
    b1: [b[0] + nx * rb, b[1] + ny * rb] as [number, number],
    a2: [a[0] - nx * ra, a[1] - ny * ra] as [number, number],
    b2: [b[0] - nx * rb, b[1] - ny * rb] as [number, number],
  }
}

/* ───────── 小矢量箭头（沿用旧画法） ───────── */

function Arrow({
  x,
  y,
  dx,
  dy,
  color,
  label,
}: {
  x: number
  y: number
  dx: number
  dy: number
  color: string
  label: string
}) {
  const len = Math.hypot(dx, dy)
  if (len < 6) return null
  const ux = dx / len
  const uy = dy / len
  const ex = x + dx
  const ey = y + dy
  return (
    <g pointerEvents="none">
      <line x1={x} y1={y} x2={ex} y2={ey} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <polyline
        points={`${ex - ux * 8 - uy * 4},${ey - uy * 8 + ux * 4} ${ex},${ey} ${ex - ux * 8 + uy * 4},${ey - uy * 8 - ux * 4}`}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <text
        x={ex + ux * 12}
        y={ey + uy * 12}
        fontSize={10.5}
        fill={color}
        stroke="#fbfaf7"
        strokeWidth={3}
        style={{ paintOrder: 'stroke' }}
        fontFamily="'IBM Plex Sans SC','Microsoft YaHei',sans-serif"
      >
        {label}
      </text>
    </g>
  )
}

/** 部件显示名：用户标签优先，其次目录里的中文名 */
const partName = (part: MechPart) => part.label || MECH_PART_SPEC[part.kind]?.label || '部件'

/* ───────────────────────── 组件 ───────────────────────── */

export function MechStage({
  params,
  toScreen,
  toWorld,
  selectedId,
  selectedIds,
  onSelect,
  onSelectMany,
  pending,
  anchor,
  onAnchor,
  onLink,
  playing,
  editing,
  vectors,
  decompose,
  labels,
  trails,
  grid,
  snapAngle,
  measure,
  measureMode,
  onMeasurePart,
  resetToken,
  onCommitParts,
  live,
}: Props) {
  const rigRef = useRef<Rig | null>(null)
  /** 每帧 +1：播放 / 拖动时驱动重渲染（只重画 SVG，不碰文档） */
  const [tick, setTick] = useState(0)
  const bump = () => setTick((t) => (t + 1) % 1000000)

  /* 最新 props 存进 ref：物理步 / rAF 闭包不跟 React 渲染走，避免拖滑杆时重建引擎 */
  const paramsRef = useRef(params)
  paramsRef.current = params
  const partsRef = useRef(params.parts)
  partsRef.current = params.parts
  const linksRef = useRef(params.links)
  linksRef.current = params.links
  const playingRef = useRef(playing)
  playingRef.current = playing
  const editingRef = useRef(editing)
  editingRef.current = editing
  const liveTargetRef = useRef(live)
  liveTargetRef.current = live

  /** 每步累加的各部件合力（N，世界坐标），画箭头用 */
  const forcesRef = useRef<Map<string, Point2>>(new Map())
  /** 轨迹：id → 世界坐标采样 */
  const trailsRef = useRef<Map<string, [number, number][]>>(new Map())
  const trailsOnRef = useRef(trails)
  trailsOnRef.current = trails
  /** 仿真时间（秒，按 timeScale 走） */
  const timeRef = useRef(0)
  const stepCountRef = useRef(0)
  const compiledRef = useRef<Map<string, EvalFunction>>(new Map())
  /** 上一帧速度，用来算实时加速度 */
  const prevVelRef = useRef<Map<string, { vx: number; vy: number; t: number }>>(new Map())
  const dragRef = useRef<DragState | null>(null)
  const pullRef = useRef<{ id: string; x: number; y: number } | null>(null)
  const stepRef = useRef<(dt: number) => void>(() => {})

  /* ───────── 结构键：只有「改了要换引擎」的字段进来 ─────────
   * k / c / 公式力 / 时间倍率不在这里，拖滑杆只改最新 props，不重建引擎。 */
  const structKey = useMemo(
    () =>
      JSON.stringify([
        params.parts.map((p) => [
          p.id,
          p.kind,
          p.x,
          p.y,
          p.size,
          p.size2 ?? 0,
          p.mass,
          p.fixed ? 1 : 0,
          p.angle ?? 0,
          p.pinned ? 1 : 0,
          p.motor ?? 0,
          p.teeth ?? 0,
          p.material ?? '',
          p.friction ?? '',
          p.restitution ?? '',
          p.onTrack ?? '',
          p.gravityScale ?? 1,
          p.speed ?? 0,
          p.thrust ?? 0,
          p.strength ?? 0,
          p.pole ?? '',
          p.span ?? 0,
        ]),
        params.links.map((l) => [
          l.id,
          l.kind,
          l.a,
          l.b,
          l.rest,
          l.ratio ?? 0,
          l.lo ?? 0,
          l.hi ?? 0,
          l.target ?? 0,
          l.maxForce ?? 0,
          linkVias(l).join('>'),
          l.offsetA ? l.offsetA.x + ',' + l.offsetA.y : '',
          l.offsetB ? l.offsetB.x + ',' + l.offsetB.y : '',
        ]),
        params.gravity,
        params.airDrag ?? null,
        params.collisions !== false,
      ]),
    [params],
  )

  /* ───────── 小工具 ───────── */

  function partById(id: string): MechPart | undefined {
    return params.parts.find((p) => p.id === id)
  }

  /** 部件当前姿态：引擎里有 body 就用引擎的，没有（首帧 / 重建前）退回文档坐标 */
  function posOf(part: MechPart) {
    const body = rigRef.current?.bodies.get(part.id)
    if (!body) {
      return { x: part.x, y: part.y, angle: (part.angle ?? 0) * DEG, vx: 0, vy: 0, omega: 0 }
    }
    return {
      x: body.position.x,
      y: body.position.y,
      angle: body.angle,
      vx: body.velocity.x * VEL_SCALE,
      vy: body.velocity.y * VEL_SCALE,
      omega: body.angularVelocity * VEL_SCALE,
    }
  }

  const pxPerM = Math.abs(toScreen([1, 0])[0] - toScreen([0, 0])[0]) || 40
  const screenOf = (part: MechPart): [number, number] => {
    const p = posOf(part)
    return toScreen([p.x, p.y])
  }

  /* ───────── 建引擎 ───────── */

  useEffect(() => {
    const engine = Matter.Engine.create()
    // 重力由 physicsStep 逐体施加（支持自重比例），引擎自己的重力关掉
    engine.gravity.x = 0
    engine.gravity.y = 0
    engine.positionIterations = 10
    engine.velocityIterations = 8
    engine.constraintIterations = 3
    engine.enableSleeping = false
    const world = engine.world

    const P = paramsRef.current
    const airDrag = finite(P.airDrag) ? P.airDrag : 0.0015
    const collisionsOn = P.collisions !== false
    const bodies = new Map<string, Matter.Body>()
    const extras: Matter.Body[] = []
    const constraints: Matter.Constraint[] = []
    const hingeInit = new Map<string, number>()

    const ground = Matter.Bodies.rectangle(0, MECH_GROUND_Y - 0.5, 90, 1, {
      isStatic: true,
      friction: 0.6,
      restitution: 0.02,
      density: 0.001,
      label: 'ground',
      collisionFilter: { category: CAT_GROUND, mask: FULL_MASK, group: 0 },
    })

    for (const part of P.parts) {
      const isStatic = isStaticPart(part)
      const mat = materialOf(part)
      // 动态部件的碰撞掩码：collisions 关闭时不和部件相撞；挂在轨道上的部件不和场地相撞
      let mask = FULL_MASK
      if (!isStatic && !collisionsOn) mask &= ~CAT_PART
      if (part.onTrack) mask &= ~CAT_FIELD
      const common: Matter.IChamferableBodyDefinition = {
        isStatic,
        friction: mat.friction,
        restitution: part.kind === 'anchor' ? 0.2 : mat.restitution,
        frictionAir: isStatic ? 0 : airDrag,
        density: 0.001,
        slop: 0.05,
        label: part.id,
        collisionFilter: { category: isStatic ? CAT_FIELD : CAT_PART, mask, group: 0 },
      }
      // body.angle = 世界角（度 → 弧度，逆时针为正）
      const angle = (part.angle ?? 0) * DEG
      const size = Math.max(0.02, part.size)
      const size2 = Math.max(0.005, part.size2 ?? part.size)
      let body: Matter.Body | null = null

      switch (part.kind) {
        /* 刚体 */
        case 'ball':
        case 'disc':
        case 'hoop':
          body = Matter.Bodies.circle(part.x, part.y, size, common)
          break
        case 'box':
        case 'weight':
          body = Matter.Bodies.rectangle(part.x, part.y, size * 2, size * 2, { ...common, angle })
          break
        case 'cart':
        case 'plank':
        case 'bracket':
        case 'wall':
        case 'rack':
          body = Matter.Bodies.rectangle(part.x, part.y, size * 2, size2 * 2, { ...common, angle })
          break
        case 'wedge': {
          // 碰撞体：沿斜边 C→B 的薄矩形（三角形的重心位置就是部件位置）
          const slope = Math.atan2(-size2, 2 * size)
          const len = Math.hypot(2 * size, size2)
          body = Matter.Bodies.rectangle(part.x, part.y, len, 0.1, {
            ...common,
            isStatic: true,
            angle: angle + slope,
          })
          break
        }
        /* 支撑 / 场地 */
        case 'anchor':
        case 'planet':
          body = Matter.Bodies.circle(part.x, part.y, size, common)
          break
        case 'track':
        case 'conveyor':
          body = Matter.Bodies.rectangle(part.x, part.y, size * 2, 0.12, { ...common, angle })
          break
        case 'arcTrack': {
          // 占位体（选中 / 位置 / 链接偏移都读它，不参与碰撞）
          body = Matter.Bodies.circle(part.x, part.y, size, {
            ...common,
            isStatic: true,
            collisionFilter: { category: CAT_FIELD, mask: 0, group: 0 },
          })
          // 圆弧折成 N 段薄矩形
          const span = clamp(finite(part.span) ? part.span : 150, 10, 360)
          const n = Math.max(14, Math.round(span / 8))
          const a0 = angle - (span * DEG) / 2
          const sweep = span * DEG
          for (let i = 0; i < n; i++) {
            const t0 = a0 + (sweep * i) / n
            const t1 = a0 + (sweep * (i + 1)) / n
            const p0 = { x: part.x + size * Math.cos(t0), y: part.y + size * Math.sin(t0) }
            const p1 = { x: part.x + size * Math.cos(t1), y: part.y + size * Math.sin(t1) }
            const len = Math.hypot(p1.x - p0.x, p1.y - p0.y)
            if (len < 1e-4) continue
            extras.push(
              Matter.Bodies.rectangle((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, len, 0.1, {
                ...common,
                isStatic: true,
                angle: Math.atan2(p1.y - p0.y, p1.x - p0.x),
              }),
            )
          }
          break
        }
        /* 传动 / 装置 */
        case 'pulley':
        case 'movablePulley':
        case 'gear':
        case 'wheel':
        case 'flywheel':
        case 'thruster':
        case 'magnet':
          body = Matter.Bodies.circle(part.x, part.y, size, common)
          break
      }
      if (!body) body = Matter.Bodies.circle(part.x, part.y, size, common)
      body.label = part.id
      if (!isStatic) {
        Matter.Body.setMass(body, Math.max(0.02, part.mass))
        // 精确转动惯量：方块 / 小车 / 砝码 Infinity（只滑不转）
        Matter.Body.setInertia(body, inertiaOf(part))
      }
      if (part.kind === 'anchor') body.restitution = 0.2
      bodies.set(part.id, body)
    }

    // 中心轴固定 = 转动副（世界点 + 零长度约束，只锁位置、不锁角度）
    for (const part of P.parts) {
      if (!part.pinned) continue
      const body = bodies.get(part.id)
      if (!body || body.isStatic) continue
      constraints.push(
        Matter.Constraint.create({
          pointA: { x: part.x, y: part.y },
          bodyB: body,
          length: 0,
          stiffness: 1,
          damping: 0.08,
        }),
      )
    }

    // 杆 / 铰链 / 焊接：Matter 约束
    for (const link of P.links) {
      const A = bodies.get(link.a)
      const B = bodies.get(link.b)
      if (!A || !B) continue
      const oa = link.offsetA ?? { x: 0, y: 0 }
      const ob = link.offsetB ?? { x: 0, y: 0 }
      if (link.kind === 'rod') {
        constraints.push(
          Matter.Constraint.create({
            bodyA: A,
            bodyB: B,
            pointA: oa,
            pointB: ob,
            length: Math.max(0.05, link.rest),
            stiffness: 1,
            damping: ROD_DAMPING,
          }),
        )
      } else if (link.kind === 'hinge') {
        constraints.push(
          Matter.Constraint.create({
            bodyA: A,
            bodyB: B,
            pointA: oa,
            pointB: ob,
            length: 0,
            stiffness: 1,
            damping: ROD_DAMPING,
          }),
        )
        hingeInit.set(link.id, B.angle - A.angle)
      } else if (link.kind === 'weld') {
        // 双约束：两个不同的局部点各锁一条零长度约束 → 相对位置 + 相对角度都锁死
        const lock = 0.18
        constraints.push(
          Matter.Constraint.create({
            bodyA: A,
            bodyB: B,
            pointA: oa,
            pointB: ob,
            length: 0,
            stiffness: 1,
            damping: 0.08,
          }),
          Matter.Constraint.create({
            bodyA: A,
            bodyB: B,
            pointA: { x: oa.x + lock, y: oa.y },
            pointB: { x: ob.x + lock, y: ob.y },
            length: 0,
            stiffness: 1,
            damping: 0.08,
          }),
        )
      }
    }

    Matter.Composite.add(world, ground)
    Matter.Composite.add(world, [...bodies.values()])
    if (extras.length > 0) Matter.Composite.add(world, extras)
    if (constraints.length > 0) Matter.Composite.add(world, constraints)

    const rig: Rig = { engine, bodies, ground, hingeInit }
    rigRef.current = rig
    forcesRef.current = new Map()
    trailsRef.current = new Map()
    prevVelRef.current = new Map()
    timeRef.current = 0
    stepCountRef.current = 0
    writeLive()
    bump()

    return () => {
      Matter.Composite.clear(engine.world, false, true)
      Matter.Engine.clear(engine)
      if (rigRef.current === rig) rigRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structKey, resetToken])

  /* ───────── 实时读数（写 ref，不 setState） ───────── */

  function writeLive() {
    const rig = rigRef.current
    const parts = partsRef.current
    const links = linksRef.current
    const P = paramsRef.current
    const now = timeRef.current
    const running = playingRef.current && Boolean(rig)
    const prev = prevVelRef.current
    const nextPrev = new Map<string, { vx: number; vy: number; t: number }>()
    const liveParts: Record<string, MechLivePart> = {}
    let ke = 0
    let pe = 0
    let mx = 0
    let my = 0
    const g = P.gravity

    for (const part of parts) {
      const body = rig?.bodies.get(part.id)
      const staticPart = isStaticPart(part)
      const x = body ? body.position.x : part.x
      const y = body ? body.position.y : part.y
      const angle = body ? body.angle : (part.angle ?? 0) * DEG
      const vx = body && !body.isStatic ? body.velocity.x * VEL_SCALE : 0
      const vy = body && !body.isStatic ? body.velocity.y * VEL_SCALE : 0
      const omega = body && !body.isStatic ? body.angularVelocity * VEL_SCALE : 0
      const speed = Math.hypot(vx, vy)
      const inertia = inertiaOf(part)
      const partKe = staticPart
        ? 0
        : 0.5 * part.mass * (vx * vx + vy * vy) + (Number.isFinite(inertia) ? 0.5 * inertia * omega * omega : 0)
      const gs = finite(part.gravityScale) ? part.gravityScale : 1
      if (!staticPart) {
        ke += partKe
        pe += part.mass * g * gs * (y - MECH_GROUND_Y)
        mx += part.mass * vx
        my += part.mass * vy
      }
      const p0 = prev.get(part.id)
      let ax = 0
      let ay = 0
      if (running && p0) {
        const dtv = now - p0.t
        if (dtv > 1e-5) {
          ax = (vx - p0.vx) / dtv
          ay = (vy - p0.vy) / dtv
        }
      }
      nextPrev.set(part.id, { vx, vy, t: now })
      liveParts[part.id] = { x, y, vx, vy, speed, ax, ay, angle: radDeg(angle), omega, ke: partKe }
    }

    // 弹性势能：弹簧 ½kΔx²
    let elastic = 0
    for (const link of links) {
      if (link.kind !== 'spring') continue
      const A = rig?.bodies.get(link.a)
      const B = rig?.bodies.get(link.b)
      if (!A || !B) continue
      const pa = bodyPoint(A, link.offsetA)
      const pb = bodyPoint(B, link.offsetB)
      const dist = Math.hypot(pb.x - pa.x, pb.y - pa.y)
      const k = finite(link.k) ? link.k : SPRING_DEFAULTS.k
      const stretch = dist - link.rest
      elastic += 0.5 * k * stretch * stretch
    }

    prevVelRef.current = nextPrev
    liveTargetRef.current.current = {
      t: now,
      running,
      ke,
      pe,
      elastic,
      momentum: Math.hypot(mx, my),
      parts: liveParts,
    }
  }

  /* ───────── 公式力求值 ───────── */

  function evalForceExpr(expr: string, scope: Record<string, number>): number {
    try {
      let fn = compiledRef.current.get(expr)
      if (!fn) {
        fn = compile(expr)
        compiledRef.current.set(expr, fn)
      }
      const out = fn.evaluate(scope) as unknown
      const n = typeof out === 'number' ? out : Number(out)
      return Number.isFinite(n) ? clamp(n, -2000, 2000) : 0
    } catch {
      return 0
    }
  }

  /* ───────── 轨迹采样 ───────── */

  function sampleTrails() {
    const rig = rigRef.current
    if (!rig) return
    const map = trailsRef.current
    for (const part of partsRef.current) {
      if (isStaticPart(part)) continue
      const body = rig.bodies.get(part.id)
      if (!body) continue
      let arr = map.get(part.id)
      if (!arr) {
        arr = []
        map.set(part.id, arr)
      }
      const last = arr[arr.length - 1]
      if (last && Math.abs(last[0] - body.position.x) < 1e-4 && Math.abs(last[1] - body.position.y) < 1e-4) continue
      arr.push([body.position.x, body.position.y])
      if (arr.length > MAX_TRAIL) arr.shift()
    }
  }

  /* ───────── 一帧物理 ───────── */

  function physicsStep(dt: number) {
    const rig = rigRef.current
    if (!rig) return
    const parts = partsRef.current
    const links = linksRef.current
    const P = paramsRef.current
    // 时间倍率乘到步长上：0.1 慢动作 / 2 快放（只影响仿真时间，不改固定步数）
    const ts = clamp(finite(P.timeScale) ? P.timeScale : 1, 0.1, 2)
    timeRef.current += dt * ts
    const tNow = timeRef.current
    const g = P.gravity

    const forces = new Map<string, Point2>()
    const addForce = (id: string, fx: number, fy: number) => {
      const cur = forces.get(id)
      if (cur) {
        cur.x += fx
        cur.y += fy
      } else {
        forces.set(id, { x: fx, y: fy })
      }
    }
    const apply = (body: Matter.Body, id: string, fx: number, fy: number, at?: Point2) => {
      if (body.isStatic) return
      Matter.Body.applyForce(body, at ?? body.position, {
        x: fx * MECH_FORCE_SCALE,
        y: fy * MECH_FORCE_SCALE,
      })
      addForce(id, fx, fy)
    }
    const bodyOf = (id: string) => rig.bodies.get(id)

    /* 1. 重力：逐体施加（自重比例 0 = 失重，负值 = 反重力） */
    if (g !== 0) {
      for (const part of parts) {
        if (isStaticPart(part)) continue
        const body = bodyOf(part.id)
        if (!body || body.isStatic) continue
        const gs = finite(part.gravityScale) ? part.gravityScale : 1
        if (gs === 0) continue
        apply(body, part.id, 0, -body.mass * g * gs)
      }
    }

    /* 2. 连接力：弹簧 / 阻尼 / 绳（含动滑轮）/ 活塞 */
    for (const link of links) {
      if (
        link.kind === 'rod' ||
        link.kind === 'hinge' ||
        link.kind === 'weld' ||
        link.kind === 'belt' ||
        link.kind === 'gearPair' ||
        link.kind === 'rackPinion'
      ) {
        continue
      }
      const A = bodyOf(link.a)
      const B = bodyOf(link.b)
      if (!A || !B) continue
      const vias: ViaBody[] = linkVias(link)
        .map((id) => ({ id, body: bodyOf(id) }))
        .filter((v): v is ViaBody => Boolean(v.body))
      const r = linkForce(link, A, B, vias)
      if (!r) continue
      apply(A, link.a, r.fA.x, r.fA.y, r.pa)
      apply(B, link.b, r.fB.x, r.fB.y, r.pb)
      for (const ex of r.extras) {
        const body = bodyOf(ex.id)
        if (body) apply(body, ex.id, ex.x, ex.y, ex.at)
      }
    }

    /* 3. 电机 / 推力器 / 公式力（作用在自身） */
    for (const part of parts) {
      const body = bodyOf(part.id)
      if (!body || body.isStatic) continue
      if (part.motor) body.torque += part.motor * MECH_FORCE_SCALE
      if (part.kind === 'thruster' && finite(part.thrust) && part.thrust) {
        // 跟着体姿态喷：焊在火箭上推力方向也跟着火箭转
        apply(body, part.id, Math.cos(body.angle) * part.thrust, Math.sin(body.angle) * part.thrust)
      }
      const f = part.force
      if (!f?.enabled) continue
      const th = (f.angle ?? 0) * DEG
      let mag = 0
      if (f.mode === 'const') {
        mag = clamp(finite(f.n) ? f.n : 0, -2000, 2000)
      } else if (f.expr.trim()) {
        mag = evalForceExpr(f.expr, {
          x: body.position.x,
          y: body.position.y,
          vx: body.velocity.x * VEL_SCALE,
          vy: body.velocity.y * VEL_SCALE,
          t: tNow,
          m: part.mass,
          g,
        })
      }
      if (mag) apply(body, part.id, Math.cos(th) * mag, Math.sin(th) * mag)
    }

    /* 4. 传送带：底边贴着带面时沿 u 施加摩擦式驱动力 */
    for (const beltPart of parts) {
      if (beltPart.kind !== 'conveyor') continue
      const belt = bodyOf(beltPart.id)
      if (!belt) continue
      const ux = Math.cos(belt.angle)
      const uy = Math.sin(belt.angle)
      const nx = -uy
      const ny = ux
      const v0 = finite(beltPart.speed) ? beltPart.speed : 0
      const beltFriction = materialOf(beltPart).friction
      for (const part of parts) {
        if (part.id === beltPart.id || isStaticPart(part)) continue
        const body = bodyOf(part.id)
        if (!body || body.isStatic) continue
        const dx = body.position.x - belt.position.x
        const dy = body.position.y - belt.position.y
        const along = dx * ux + dy * uy
        if (Math.abs(along) > beltPart.size) continue
        const dn = dx * nx + dy * ny
        const gap = dn - part.size - 0.06
        if (Math.abs(gap) > 0.12) continue
        const mu = Math.max(beltFriction, materialOf(part).friction)
        const limit = mu * body.mass * Math.abs(g)
        const vAlong = (body.velocity.x * ux + body.velocity.y * uy) * VEL_SCALE
        const drive = clamp(200 * (v0 - vAlong), -limit, limit)
        if (Math.abs(drive) < 1e-6) continue
        apply(body, part.id, drive * ux, drive * uy)
      }
    }

    /* 5. 磁铁 / 引力源 */
    const magnets = parts.filter((p) => p.kind === 'magnet')
    for (let i = 0; i < magnets.length; i++) {
      for (let j = i + 1; j < magnets.length; j++) {
        const ma = magnets[i]
        const mb = magnets[j]
        const ba = bodyOf(ma.id)
        const bb = bodyOf(mb.id)
        if (!ba || !bb || (ba.isStatic && bb.isStatic)) continue
        const dx = bb.position.x - ba.position.x
        const dy = bb.position.y - ba.position.y
        const d = Math.max(0.18, Math.hypot(dx, dy))
        const ux = dx / d
        const uy = dy / d
        const poleA = ma.pole === 'S' ? -1 : 1
        const poleB = mb.pole === 'S' ? -1 : 1
        const sA = finite(ma.strength) ? ma.strength : 8
        const sB = finite(mb.strength) ? mb.strength : 8
        // 正 = 相吸，负 = 相斥；单对上限 400 N
        const F = clamp(-((poleA * poleB * sA * sB) / (d * d)), -400, 400)
        apply(ba, ma.id, ux * F, uy * F)
        apply(bb, mb.id, -ux * F, -uy * F)
      }
    }
    for (const planet of parts) {
      if (planet.kind !== 'planet') continue
      const planetBody = bodyOf(planet.id)
      if (!planetBody) continue
      const GM = finite(planet.strength) ? planet.strength : 40
      for (const part of parts) {
        if (part.kind === 'planet' || part.id === planet.id || isStaticPart(part)) continue
        const body = bodyOf(part.id)
        if (!body || body.isStatic) continue
        const dx = planetBody.position.x - body.position.x
        const dy = planetBody.position.y - body.position.y
        const d = Math.max(0.25, Math.hypot(dx, dy))
        const F = Math.min(400, (GM * body.mass) / (d * d))
        if (F <= 0) continue
        apply(body, part.id, (dx / d) * F, (dy / d) * F)
      }
    }

    /* 6. 真实模式：按住拖动 = 一根隐形弹簧拉向指针 */
    const pull = pullRef.current
    if (pull) {
      const body = bodyOf(pull.id)
      if (body && !body.isStatic) {
        const dx = pull.x - body.position.x
        const dy = pull.y - body.position.y
        const len = Math.hypot(dx, dy)
        if (len > 1e-4) {
          const f = Math.min(PULL_MAX, PULL_K * len)
          apply(body, pull.id, (dx / len) * f, (dy / len) * f)
        }
      } else {
        pullRef.current = null
      }
    }

    /* 7. 传动耦合 + 铰链角度限位（必须在 Engine.update 之前改速度） */
    for (const link of links) {
      const A = bodyOf(link.a)
      const B = bodyOf(link.b)
      if (!A || !B) continue
      if (link.kind === 'belt' || link.kind === 'gearPair') {
        // 速度耦合：ωB → ωA · ratio（皮带同向、齿轮反向，ratio 已带符号）
        if (B.isStatic) continue
        const ratio = linkRatio(link, parts)
        const target = A.angularVelocity * ratio
        Matter.Body.setAngularVelocity(B, B.angularVelocity + (target - B.angularVelocity) * 0.25)
      } else if (link.kind === 'rackPinion') {
        // 转动 ↔ 平动：齿条沿自身角方向的线速度 v = ω·r（符号按齿轮在齿条哪一侧）
        const aIsRack = partById(link.a)?.kind === 'rack'
        const rackPart = aIsRack ? partById(link.a) : partById(link.b)
        const pinionPart = aIsRack ? partById(link.b) : partById(link.a)
        const rackBody = aIsRack ? A : B
        const pinionBody = aIsRack ? B : A
        if (!rackPart || !pinionPart || !rackBody || !pinionBody || rackBody.isStatic) continue
        const ux = Math.cos(rackBody.angle)
        const uy = Math.sin(rackBody.angle)
        const nx = -uy
        const ny = ux
        const side =
          Math.sign((pinionBody.position.x - rackBody.position.x) * nx + (pinionBody.position.y - rackBody.position.y) * ny) || 1
        const radius = gearRadius(pinionPart)
        const target = side * pinionBody.angularVelocity * radius
        const cur = rackBody.velocity.x * ux + rackBody.velocity.y * uy
        const dv = (target - cur) * 0.8
        Matter.Body.setVelocity(rackBody, { x: rackBody.velocity.x + ux * dv, y: rackBody.velocity.y + uy * dv })
      } else if (link.kind === 'hinge') {
        const lo = link.lo
        const hi = link.hi
        if (!finite(lo) && !finite(hi)) continue
        const init = rig.hingeInit.get(link.id) ?? 0
        const rel = B.angle - A.angle - init
        const loR = finite(lo) ? lo * DEG : -Infinity
        const hiR = finite(hi) ? hi * DEG : Infinity
        let excess = 0
        if (rel > hiR) excess = rel - hiR
        else if (rel < loR) excess = rel - loR
        else continue
        const invA = A.isStatic ? 0 : 1 / Math.max(1e-9, A.inertia)
        const invB = B.isStatic ? 0 : 1 / Math.max(1e-9, B.inertia)
        if (invA + invB < 1e-12) continue
        const relV = B.angularVelocity - A.angularVelocity
        // 目标相对角速度：往回收 40 /s，并且不再继续往限位外推
        const desired = clamp((-excess * 40) / 60, -0.5, 0.5)
        const delta = clamp(desired - relV, -0.5, 0.5)
        if (Math.abs(delta) < 1e-9) continue
        const J = -delta / (invA + invB)
        if (!A.isStatic) Matter.Body.setAngularVelocity(A, A.angularVelocity + J * invA)
        if (!B.isStatic) Matter.Body.setAngularVelocity(B, B.angularVelocity - J * invB)
      }
    }

    Matter.Engine.update(rig.engine, dt * 1000 * ts)

    /* 8. 轨道约束：投影回轨道面 + 只抹法向速度（改 positionPrev） */
    for (const part of parts) {
      if (!part.onTrack) continue
      const track = partById(part.onTrack)
      const body = bodyOf(part.id)
      if (!track || !body || body.isStatic) continue
      const th = (track.angle ?? 0) * DEG
      const ca = Math.cos(th)
      const sa = Math.sin(th)
      const dx = body.position.x - track.x
      const dy = body.position.y - track.y
      let lx = dx * ca + dy * sa
      const half = part.size
      const limit = Math.max(0, track.size - half)
      lx = clamp(lx, -limit, limit)
      const ly = 0.06 + half
      const nx = -sa
      const ny = ca
      Matter.Body.setPosition(body, { x: track.x + lx * ca + ly * nx, y: track.y + lx * sa + ly * ny })
      const prev = (body as unknown as { positionPrev: Point2 }).positionPrev
      const vpx = body.position.x - prev.x
      const vpy = body.position.y - prev.y
      const vn = vpx * nx + vpy * ny
      if (Math.abs(vn) > 1e-9) {
        prev.x += vn * nx
        prev.y += vn * ny
      }
    }

    /* 9. 数值兜底：万一求解炸了（NaN / 飞出世界），把该部件放回文档位置 */
    for (const part of parts) {
      const body = bodyOf(part.id)
      if (!body || body.isStatic) continue
      if (!Number.isFinite(body.position.x) || !Number.isFinite(body.position.y) || Math.abs(body.position.x) > 400 || Math.abs(body.position.y) > 400) {
        Matter.Body.setPosition(body, { x: part.x, y: part.y })
        Matter.Body.setVelocity(body, { x: 0, y: 0 })
        Matter.Body.setAngularVelocity(body, 0)
      }
    }

    forcesRef.current = forces
    stepCountRef.current += 1
    if (trailsOnRef.current && stepCountRef.current % TRAIL_EVERY === 0) sampleTrails()
    if (stepCountRef.current % LIVE_EVERY === 0) writeLive()
  }

  // rAF 里永远用最新一版 physicsStep（它只读 ref，闭包旧了也没关系）
  stepRef.current = physicsStep

  /* 暂停时也刷新一次读数（running / 位置停在最后一帧） */
  useEffect(() => {
    writeLive()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  /* ───────── 播放循环：rAF + 固定步长累加器 ───────── */

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    let acc = 0
    const loop = (now: number) => {
      const real = Math.min(0.05, (now - last) / 1000)
      last = now
      acc += real
      let guard = 0
      while (acc >= STEP && guard++ < 8) {
        stepRef.current(STEP)
        acc -= STEP
      }
      bump()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, structKey])

  /* ───────── 交互：选中 / 拖动 / 施力 / 连线 / 测距 ───────── */

  /** 拖动时要一起搬的部件：已选集合 + group 同组；locked 不参与 */
  function dragMembers(primary: MechPart, ids: string[]) {
    const want = new Set<string>()
    const add = (id: string) => {
      if (want.has(id)) return
      const p = partById(id)
      if (!p) return
      want.add(id)
      if (p.group) {
        for (const q of params.parts) if (q.group === p.group) want.add(q.id)
      }
    }
    for (const id of ids) add(id)
    add(primary.id)
    const out: { id: string; startX: number; startY: number }[] = []
    for (const id of want) {
      const p = partById(id)
      if (!p || p.locked) continue
      const st = posOf(p)
      out.push({ id, startX: st.x, startY: st.y })
    }
    return out
  }

  function downPart(e: ReactPointerEvent, part: MechPart) {
    stopEvent(e)
    e.preventDefault()
    // 测距模式：只报点，不改选中
    if (measureMode) {
      onMeasurePart(part.id)
      return
    }
    const multi = e.shiftKey || e.ctrlKey || e.metaKey
    let moveIds: string[]
    if (multi) {
      const next = selectedIds.includes(part.id)
        ? selectedIds.filter((id) => id !== part.id)
        : [...selectedIds, part.id]
      const primaryId = next.includes(part.id) ? part.id : next[next.length - 1] ?? null
      onSelect(primaryId, primaryId ? 'part' : null)
      onSelectMany(next)
      moveIds = next
    } else {
      // 已多选时按其中一个：保留多选，方便整组拖
      const keepMulti = selectedIds.length > 1 && selectedIds.includes(part.id)
      onSelect(part.id, 'part')
      if (!keepMulti) onSelectMany([part.id])
      moveIds = keepMulti ? selectedIds : [part.id]
    }

    // 连线模式：第一次点记起点，第二次点连上
    if (pending) {
      if (!anchor) {
        onAnchor(part.id)
        return
      }
      if (anchor !== part.id) {
        onLink(pending, anchor, part.id)
        onAnchor(null)
      }
      return
    }

    if (!editingRef.current) {
      // 真实模式：不搬零件，按住就是施力
      if (isStaticPart(part)) return
      const w = toWorld(e.clientX, e.clientY)
      pullRef.current = { id: part.id, x: w.x, y: w.y }
      try {
        ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      } catch {
        /* 合成事件忽略 */
      }
      bump()
      return
    }

    if (part.locked) return
    const w = toWorld(e.clientX, e.clientY)
    const st = posOf(part)
    dragRef.current = {
      id: part.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: w.x,
      originY: w.y,
      baseX: st.x,
      baseY: st.y,
      members: dragMembers(part, moveIds),
      moved: false,
    }
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      /* 合成事件忽略 */
    }
    bump()
  }

  function movePart(e: ReactPointerEvent) {
    if (pullRef.current) {
      stopEvent(e)
      const w = toWorld(e.clientX, e.clientY)
      pullRef.current = { id: pullRef.current.id, x: w.x, y: w.y }
      bump()
      return
    }
    const d = dragRef.current
    if (!d) return
    stopEvent(e)
    // 鼠标位移超过 3px 才算拖动（避免点选时把部件碰跑）
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY) < DRAG_PX) return
      d.moved = true
    }
    const w = toWorld(e.clientX, e.clientY)
    const snap = (v: number) => (grid > 0 ? Math.round(v / grid) * grid : v)
    const tx = snap(d.baseX + (w.x - d.originX))
    const ty = snap(d.baseY + (w.y - d.originY))
    const ddx = tx - d.baseX
    const ddy = ty - d.baseY
    const rig = rigRef.current
    for (const m of d.members) {
      const body = rig?.bodies.get(m.id)
      if (!body) continue
      Matter.Body.setPosition(body, { x: m.startX + ddx, y: m.startY + ddy })
      Matter.Body.setVelocity(body, { x: 0, y: 0 })
      Matter.Body.setAngularVelocity(body, 0)
    }
    writeLive()
    bump()
  }

  function upPart(e: ReactPointerEvent) {
    if (pullRef.current) {
      pullRef.current = null
      stopEvent(e)
      try {
        ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
      } catch {
        /* 忽略 */
      }
      bump()
      return
    }
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    stopEvent(e)
    try {
      ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
    } catch {
      /* 忽略 */
    }
    if (!d.moved) return
    // 只有拖完一次才写文档（进撤销栈）
    const rig = rigRef.current
    const moved = new Map<string, { x: number; y: number }>()
    for (const m of d.members) {
      const body = rig?.bodies.get(m.id)
      if (!body) continue
      moved.set(m.id, { x: round3(body.position.x), y: round3(body.position.y) })
    }
    if (moved.size === 0) return
    const nextParts = params.parts.map((p) => {
      const at = moved.get(p.id)
      return at ? { ...p, x: at.x, y: at.y } : p
    })
    onCommitParts(nextParts)
    bump()
  }

  function downLink(e: ReactPointerEvent, link: MechLink) {
    stopEvent(e)
    e.preventDefault()
    if (measureMode) return
    onSelect(link.id, 'link')
  }

  /** 点空白：清主选 + 多选（连线模式下保留已选起点） */
  function downBackground(e: ReactPointerEvent) {
    if (e.button !== 0) return
    if (pending || measureMode) return
    onSelect(null, null)
    onSelectMany([])
  }

  /* ───────── 受力分解：重力 / 弹力 / 公式力 / 支持力 / 摩擦力 ───────── */

  function decomposeOf(part: MechPart) {
    const rig = rigRef.current
    if (!rig) return null
    const body = rig.bodies.get(part.id)
    if (!body || body.isStatic) return null
    let ex = 0
    let ey = 0
    for (const link of params.links) {
      if (link.a !== part.id && link.b !== part.id) continue
      const A = rig.bodies.get(link.a)
      const B = rig.bodies.get(link.b)
      if (!A || !B) continue
      const vias: ViaBody[] = linkVias(link)
        .map((id) => ({ id, body: rig.bodies.get(id) }))
        .filter((v): v is ViaBody => Boolean(v.body))
      const r = linkForce(link, A, B, vias)
      if (!r) continue
      if (link.a === part.id) {
        ex += r.fA.x
        ey += r.fA.y
      } else {
        ex += r.fB.x
        ey += r.fB.y
      }
      for (const extra of r.extras) {
        if (extra.id !== part.id) continue
        ex += extra.x
        ey += extra.y
      }
    }
    let fx = 0
    let fy = 0
    const f = part.force
    if (f?.enabled) {
      const th = (f.angle ?? 0) * DEG
      let mag = 0
      if (f.mode === 'const') mag = clamp(finite(f.n) ? f.n : 0, -2000, 2000)
      else if (f.expr.trim()) {
        mag = evalForceExpr(f.expr, {
          x: body.position.x,
          y: body.position.y,
          vx: body.velocity.x * VEL_SCALE,
          vy: body.velocity.y * VEL_SCALE,
          t: timeRef.current,
          m: part.mass,
          g: params.gravity,
        })
      }
      fx = Math.cos(th) * mag
      fy = Math.sin(th) * mag
    }
    const gs = finite(part.gravityScale) ? part.gravityScale : 1
    const g = { x: 0, y: -part.mass * params.gravity * gs }
    // 支持力：挂在轨道上按轨道法向，否则按是否贴地近似
    let normal: Point2 | null = null
    if (part.onTrack) {
      const tr = partById(part.onTrack)
      if (tr) {
        const th = (tr.angle ?? 0) * DEG
        normal = { x: -Math.sin(th), y: Math.cos(th) }
      }
    } else if (Math.abs(body.position.y - (MECH_GROUND_Y + part.size)) < 0.12) {
      normal = { x: 0, y: 1 }
    }
    let n = 0
    let friction = 0
    if (normal) {
      const total = { x: ex + fx + g.x, y: ey + fy + g.y }
      n = Math.max(0, -(total.x * normal.x + total.y * normal.y))
      const tx = -normal.y
      const ty = normal.x
      const ft = total.x * tx + total.y * ty
      const mu = 0.5
      friction = clamp(-ft, -mu * n, mu * n)
    }
    return { g, elastic: { x: ex, y: ey }, formula: { x: fx, y: fy }, normal, n, friction }
  }

  /* ───────── 画部件 ───────── */

  /** 选中框：虚线外框（多选都画），主选加实心角点 */
  function renderSelection(kind: MechPart['kind'], x: number, y: number, rot: number, R: number, H: number, primary: boolean) {
    const color = '#3d5a66'
    const circleKinds: MechPart['kind'][] = [
      'ball',
      'disc',
      'hoop',
      'anchor',
      'pulley',
      'movablePulley',
      'gear',
      'wheel',
      'flywheel',
      'planet',
      'magnet',
      'thruster',
    ]
    if (circleKinds.includes(kind) || kind === 'arcTrack') {
      const rr = kind === 'arcTrack' ? R + 6 : R + 9
      return (
        <g pointerEvents="none">
          <circle cx={x} cy={y} r={rr} fill="none" stroke={color} strokeWidth={1.2} strokeDasharray="5 4" opacity={0.75} />
          {primary &&
            [45, 135, 225, 315].map((deg) => {
              const a = deg * DEG
              const cx = x + Math.cos(a) * (rr + 4)
              const cy = y - Math.sin(a) * (rr + 4)
              return <rect key={deg} x={cx - 2.4} y={cy - 2.4} width={4.8} height={4.8} fill={color} />
            })}
        </g>
      )
    }
    const rx = R + 6
    const ry = kind === 'track' || kind === 'conveyor' ? 13 : H + 6
    const corners: [number, number][] = [
      [x - rx, y - ry],
      [x + rx, y - ry],
      [x - rx, y + ry],
      [x + rx, y + ry],
    ]
    return (
      <g transform={`rotate(${rot.toFixed(2)} ${x} ${y})`} pointerEvents="none">
        <rect x={x - rx} y={y - ry} width={rx * 2} height={ry * 2} rx={6} fill="none" stroke={color} strokeWidth={1.2} strokeDasharray="5 4" opacity={0.75} />
        {primary &&
          corners.map((c, i) => <rect key={i} x={c[0] - 2.8} y={c[1] - 2.8} width={5.6} height={5.6} fill={color} />)}
      </g>
    )
  }

  function renderPart(part: MechPart) {
    const [x, y] = screenOf(part)
    const st = posOf(part)
    const R = Math.max(5, part.size * pxPerM)
    const H = Math.max(3, (part.size2 ?? part.size) * pxPerM)
    const sel = selectedIds.includes(part.id)
    const primary = selectedId === part.id
    const linked = anchor === part.id
    const pal = MECH_MATERIALS[part.material ?? 'wood'] ?? MECH_MATERIALS.wood
    const stroke = part.color || '#3d5a66'
    const fill = pal.fill
    const soft = pal.soft
    // 世界角 → SVG 屏幕旋转（屏幕 y 向下，转成负角）；楔块的 body.angle 含斜边偏角，画三角形用文档角
    const rot = part.kind === 'wedge' ? -(part.angle ?? 0) : -radDeg(st.angle)
    const dataAngle = part.kind === 'wedge' || part.kind === 'arcTrack' ? part.angle ?? 0 : radDeg(st.angle)
    const halfHeight = part.kind === 'wedge' ? ((part.size2 ?? part.size) / 2) * pxPerM : H
    const polar = (ang: number, rad: number): [number, number] => [x + rad * Math.cos(ang), y - rad * Math.sin(ang)]
    let shape: React.ReactNode = null

    switch (part.kind) {
      case 'ball': {
        shape = (
          <>
            <circle cx={x} cy={y} r={R + 10} fill="transparent" />
            <circle cx={x} cy={y} r={R} fill={fill} stroke={stroke} strokeWidth={1.3} />
            <circle cx={x - R * 0.3} cy={y - R * 0.32} r={R * 0.22} fill="#fbfaf7" opacity={0.8} />
          </>
        )
        break
      }
      case 'box': {
        shape = (
          <>
            <rect x={x - R - 10} y={y - R - 10} width={R * 2 + 20} height={R * 2 + 20} fill="transparent" />
            <rect x={x - R} y={y - R} width={R * 2} height={R * 2} rx={3} fill={fill} stroke={stroke} strokeWidth={1.3} />
            <line x1={x - R + 5} y1={y - R + 5} x2={x + R - 5} y2={y + R - 5} stroke={soft} strokeWidth={1} />
          </>
        )
        break
      }
      case 'weight': {
        shape = (
          <>
            <rect x={x - R - 10} y={y - R - 18} width={R * 2 + 20} height={R * 2 + 28} fill="transparent" />
            <rect x={x - R} y={y - R} width={R * 2} height={R * 2} rx={2} fill={fill} stroke={stroke} strokeWidth={1.3} />
            <line x1={x} y1={y - R} x2={x} y2={y - R - 7} stroke={stroke} strokeWidth={1.4} />
            <path d={`M ${x - 5} ${y - R - 7} C ${x - 5} ${y - R - 15}, ${x + 5} ${y - R - 15}, ${x + 5} ${y - R - 7}`} fill="none" stroke={stroke} strokeWidth={1.4} />
          </>
        )
        break
      }
      case 'cart': {
        const wheelR = Math.max(4, Math.min(H * 0.62, R * 0.3))
        shape = (
          <>
            <rect x={x - R - 8} y={y - H - 10} width={R * 2 + 16} height={H * 2 + wheelR * 2 + 16} fill="transparent" />
            <circle cx={x - R * 0.55} cy={y + H} r={wheelR} fill="#fbfaf7" stroke={stroke} strokeWidth={1.3} />
            <circle cx={x + R * 0.55} cy={y + H} r={wheelR} fill="#fbfaf7" stroke={stroke} strokeWidth={1.3} />
            <circle cx={x - R * 0.55} cy={y + H} r={wheelR * 0.32} fill={stroke} />
            <circle cx={x + R * 0.55} cy={y + H} r={wheelR * 0.32} fill={stroke} />
            <line x1={x - R * 0.55} y1={y + H} x2={x + R * 0.55} y2={y + H} stroke={soft} strokeWidth={1.2} />
            <rect x={x - R} y={y - H} width={R * 2} height={H * 2} rx={4} fill={fill} stroke={stroke} strokeWidth={1.3} />
            <rect x={x - R * 0.4} y={y - H * 0.35} width={R * 0.8} height={H * 0.7} rx={2} fill="#fbfaf7" opacity={0.7} />
          </>
        )
        break
      }
      case 'plank': {
        shape = (
          <>
            <rect x={x - R - 8} y={y - H - 8} width={R * 2 + 16} height={H * 2 + 16} fill="transparent" />
            <rect x={x - R} y={y - H} width={R * 2} height={H * 2} rx={Math.max(3, H)} fill={fill} stroke={stroke} strokeWidth={1.3} />
            <line x1={x - R + 8} y1={y - H * 0.3} x2={x + R - 8} y2={y - H * 0.3} stroke={soft} strokeWidth={1} />
            <line x1={x - R + 8} y1={y + H * 0.3} x2={x + R - 8} y2={y + H * 0.3} stroke={soft} strokeWidth={1} />
          </>
        )
        break
      }
      case 'disc': {
        shape = (
          <>
            <circle cx={x} cy={y} r={R + 10} fill="transparent" />
            <circle cx={x} cy={y} r={R} fill={fill} stroke={stroke} strokeWidth={1.3} />
            <circle cx={x} cy={y} r={R * 0.62} fill="none" stroke={soft} strokeWidth={1.2} />
            <line x1={x} y1={y} x2={x + R * 0.92} y2={y} stroke={stroke} strokeWidth={1.2} />
            <circle cx={x} cy={y} r={2.5} fill={stroke} />
          </>
        )
        break
      }
      case 'hoop': {
        shape = (
          <>
            <circle cx={x} cy={y} r={R + 10} fill="transparent" />
            <circle cx={x} cy={y} r={R} fill={fill} stroke={stroke} strokeWidth={1.3} />
            <circle cx={x} cy={y} r={R * 0.7} fill="#fbfaf7" stroke={soft} strokeWidth={1.2} />
          </>
        )
        break
      }
      case 'wedge': {
        const h2 = Math.max(2, ((part.size2 ?? part.size) / 2) * pxPerM)
        const d = `M ${x - R} ${y + h2} L ${x + R} ${y + h2} L ${x - R} ${y - h2} Z`
        const hlen = Math.hypot(2 * R, 2 * h2) || 1
        const ox = (-2 * h2 / hlen) * 9
        const oy = (2 * R / hlen) * 9
        const hatches: React.ReactNode[] = []
        for (let i = 1; i <= 5; i++) {
          const t = i / 6
          const hx = x + R - 2 * R * t
          const hy = y + h2 - 2 * h2 * t
          hatches.push(<line key={i} x1={hx} y1={hy} x2={hx + ox} y2={hy + oy} stroke={soft} strokeWidth={1} />)
        }
        shape = (
          <>
            <path d={d} fill="transparent" stroke="transparent" strokeWidth={12} />
            <path d={d} fill={fill} stroke={stroke} strokeWidth={1.3} strokeLinejoin="round" />
            {hatches}
          </>
        )
        break
      }
      case 'anchor': {
        shape = (
          <>
            <circle cx={x} cy={y} r={R + 10} fill="transparent" />
            <circle cx={x} cy={y} r={R} fill="#3d5a66" />
            <circle cx={x} cy={y} r={R * 0.38} fill="#fbfaf7" />
            {[-1, 0, 1].map((k) => (
              <line key={k} x1={x} y1={y + R} x2={x + k * 9} y2={y + R + 7} stroke="#3d5a66" strokeWidth={1.2} strokeLinecap="round" />
            ))}
          </>
        )
        break
      }
      case 'bracket': {
        const spine = Math.max(4, R * 0.24)
        const armH = Math.max(4, H * 0.24)
        shape = (
          <>
            <rect x={x - R - 8} y={y - H - 8} width={R * 2 + 16} height={H * 2 + 16} fill="transparent" />
            <rect x={x - R} y={y - H} width={spine} height={H * 2} fill={fill} stroke={stroke} strokeWidth={1.2} />
            <rect x={x - R} y={y - H} width={R * 2} height={armH} fill={fill} stroke={stroke} strokeWidth={1.2} />
            <line x1={x - R + spine} y1={y + H * 0.45} x2={x + R * 0.9} y2={y - H + armH} stroke={stroke} strokeWidth={1.2} />
            {[-0.55, 0.55].map((t) => (
              <circle key={t} cx={x - R + spine * 0.5} cy={y + H * t} r={1.8} fill={stroke} />
            ))}
          </>
        )
        break
      }
      case 'wall': {
        const clipId = `mech-clip-${part.id}`
        const hatch: React.ReactNode[] = []
        for (let i = -2; i < 8; i++) {
          const hx = x - R + i * (R * 0.5)
          hatch.push(<line key={i} x1={hx} y1={y + H} x2={hx + H * 2} y2={y - H} stroke={soft} strokeWidth={1} />)
        }
        shape = (
          <>
            <defs>
              <clipPath id={clipId}>
                <rect x={x - R} y={y - H} width={R * 2} height={H * 2} rx={2} />
              </clipPath>
            </defs>
            <rect x={x - R - 8} y={y - H - 8} width={R * 2 + 16} height={H * 2 + 16} fill="transparent" />
            <rect x={x - R} y={y - H} width={R * 2} height={H * 2} rx={2} fill={fill} stroke={stroke} strokeWidth={1.2} />
            <g clipPath={`url(#${clipId})`}>{hatch}</g>
          </>
        )
        break
      }
      case 'track': {
        const n = clamp(Math.round(part.size * 4), 3, 24)
        const hatches: React.ReactNode[] = []
        for (let i = 0; i < n; i++) {
          const hx = x - R + ((i + 0.5) / n) * R * 2
          hatches.push(<line key={i} x1={hx} y1={y + 4} x2={hx - 5} y2={y + 10} stroke={soft} strokeWidth={1} />)
        }
        shape = (
          <>
            <rect x={x - R} y={y - 4} width={R * 2} height={8} rx={3} fill={fill} stroke={stroke} strokeWidth={1.2} />
            {hatches}
            <rect x={x - R - 6} y={y - 13} width={R * 2 + 12} height={26} fill="transparent" />
          </>
        )
        break
      }
      case 'conveyor': {
        const dir = (part.speed ?? 0) >= 0 ? 1 : -1
        const n = clamp(Math.round(part.size * 3), 3, 16)
        const chevrons: React.ReactNode[] = []
        for (let i = 0; i < n; i++) {
          const cx = x - R + ((i + 0.5) / n) * R * 2
          chevrons.push(
            <polyline
              key={i}
              points={`${cx - 4 * dir},${y - 4} ${cx + 2 * dir},${y} ${cx - 4 * dir},${y + 4}`}
              fill="none"
              stroke={stroke}
              strokeWidth={1.1}
              strokeLinecap="round"
              strokeLinejoin="round"
            />,
          )
        }
        shape = (
          <>
            <rect x={x - R} y={y - 5} width={R * 2} height={10} rx={5} fill={fill} stroke={stroke} strokeWidth={1.2} />
            <circle cx={x - R} cy={y} r={4.5} fill="#fbfaf7" stroke={stroke} strokeWidth={1.1} />
            <circle cx={x + R} cy={y} r={4.5} fill="#fbfaf7" stroke={stroke} strokeWidth={1.1} />
            {chevrons}
            <rect x={x - R - 6} y={y - 13} width={R * 2 + 12} height={26} fill="transparent" />
          </>
        )
        break
      }
      case 'rack': {
        const teeth = clamp(Math.round(part.teeth ?? 20), 4, 40)
        const toothW = (R * 2) / teeth
        const toothH = Math.min(H * 0.7, 8)
        const gearTeeth: React.ReactNode[] = []
        for (let i = 0; i < teeth; i++) {
          const tx = x - R + toothW * (i + 0.15)
          gearTeeth.push(
            <rect key={i} x={tx} y={y + H} width={toothW * 0.7} height={toothH} fill={fill} stroke={soft} strokeWidth={0.8} />,
          )
        }
        shape = (
          <>
            <rect x={x - R} y={y - H} width={R * 2} height={H * 2} rx={2} fill={fill} stroke={stroke} strokeWidth={1.2} />
            {gearTeeth}
            <rect x={x - R - 6} y={y - H - 12} width={R * 2 + 12} height={H * 2 + toothH + 24} fill="transparent" />
          </>
        )
        break
      }
      case 'pulley':
      case 'movablePulley': {
        const hang = part.kind === 'pulley' ? 20 : 8
        shape = (
          <>
            <circle cx={x} cy={y} r={R + 10} fill="transparent" />
            <line x1={x} y1={y - R} x2={x} y2={y - R - hang} stroke={stroke} strokeWidth={1.4} />
            <line x1={x - 5} y1={y - R - hang} x2={x + 5} y2={y - R - hang} stroke={stroke} strokeWidth={1.4} />
            <circle cx={x} cy={y} r={R} fill="#f4f1ea" stroke={stroke} strokeWidth={1.4} />
            <circle cx={x} cy={y} r={R * 0.55} fill="#fbfaf7" stroke="#8b8a84" strokeWidth={1} />
            <circle cx={x} cy={y} r={2.4} fill={stroke} />
          </>
        )
        break
      }
      case 'gear': {
        const teeth = clamp(Math.round(part.teeth ?? 16), 6, 64)
        const rRoot = R * 0.82
        const step = (Math.PI * 2) / teeth
        const half = step * 0.32
        let teethPath = ''
        for (let i = 0; i < teeth; i++) {
          const a = i * step
          const p1 = polar(a - half, rRoot)
          const p2 = polar(a - half * 0.45, R)
          const p3 = polar(a + half * 0.45, R)
          const p4 = polar(a + half, rRoot)
          teethPath += `M${p1[0].toFixed(1)} ${p1[1].toFixed(1)} L${p2[0].toFixed(1)} ${p2[1].toFixed(1)} L${p3[0].toFixed(1)} ${p3[1].toFixed(1)} L${p4[0].toFixed(1)} ${p4[1].toFixed(1)} Z `
        }
        shape = (
          <>
            <circle cx={x} cy={y} r={R + 10} fill="transparent" />
            <path d={teethPath} fill={fill} stroke={stroke} strokeWidth={1} strokeLinejoin="round" />
            <circle cx={x} cy={y} r={rRoot} fill={fill} stroke={stroke} strokeWidth={1.2} />
            <circle cx={x} cy={y} r={rRoot * 0.34} fill="#fbfaf7" stroke={soft} strokeWidth={1} />
            <circle cx={x} cy={y} r={2.4} fill={stroke} />
          </>
        )
        break
      }
      case 'wheel': {
        const spokes: React.ReactNode[] = []
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 4
          const p1 = polar(a, R - 3)
          const p2 = polar(a + Math.PI, R - 3)
          spokes.push(<line key={i} x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke={soft} strokeWidth={1.2} />)
        }
        shape = (
          <>
            <circle cx={x} cy={y} r={R + 10} fill="transparent" />
            <circle cx={x} cy={y} r={R} fill={fill} stroke={stroke} strokeWidth={1.4} />
            {spokes}
            <circle cx={x} cy={y} r={4} fill={stroke} />
          </>
        )
        break
      }
      case 'flywheel': {
        const ringW = Math.max(3, R * 0.2)
        const spokes: React.ReactNode[] = []
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3
          const p1 = polar(a, R - ringW)
          const p2 = polar(a + Math.PI, R - ringW)
          spokes.push(<line key={i} x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke={soft} strokeWidth={1.2} />)
        }
        shape = (
          <>
            <circle cx={x} cy={y} r={R + 10} fill="transparent" />
            <circle cx={x} cy={y} r={R - ringW / 2} fill="none" stroke={fill} strokeWidth={ringW} />
            <circle cx={x} cy={y} r={R} fill="none" stroke={stroke} strokeWidth={1} />
            <circle cx={x} cy={y} r={R - ringW} fill="none" stroke={stroke} strokeWidth={1} />
            {spokes}
            <circle cx={x} cy={y} r={Math.max(3, R * 0.16)} fill="#fbfaf7" stroke={stroke} strokeWidth={1.2} />
          </>
        )
        break
      }
      case 'thruster': {
        const flame: React.ReactNode[] = []
        if (playing) {
          for (let i = 0; i < 3; i++) {
            const flick = 0.6 + 0.4 * Math.sin(tick * 0.7 + i * 1.9)
            const len = R * (0.7 + 0.6 * flick)
            const yOff = (i - 1) * R * 0.34
            flame.push(
              <line
                key={i}
                x1={x - R * 0.9}
                y1={y + yOff}
                x2={x - R * 0.9 - len}
                y2={y + yOff * 1.5}
                stroke={i === 1 ? '#b08a3e' : '#cbb07a'}
                strokeWidth={2}
                strokeLinecap="round"
                opacity={0.85}
              />,
            )
          }
        }
        shape = (
          <>
            <rect x={x - R - 12} y={y - R - 8} width={R * 2 + 24} height={R * 2 + 16} fill="transparent" />
            <path
              d={`M ${x - R * 0.9} ${y - R * 0.5} L ${x + R * 0.35} ${y - R * 0.9} L ${x + R} ${y - R * 0.35} L ${x + R} ${y + R * 0.35} L ${x + R * 0.35} ${y + R * 0.9} L ${x - R * 0.9} ${y + R * 0.5} Z`}
              fill={fill}
              stroke={stroke}
              strokeWidth={1.2}
              strokeLinejoin="round"
            />
            <line x1={x + R * 0.92} y1={y - R * 0.2} x2={x + R * 0.92} y2={y + R * 0.2} stroke={soft} strokeWidth={2} />
            {flame}
          </>
        )
        break
      }
      case 'magnet': {
        shape = (
          <>
            <circle cx={x} cy={y} r={R + 10} fill="transparent" />
            <circle cx={x} cy={y} r={R} fill="#e7e3dc" stroke={stroke} strokeWidth={1.3} />
            <path d={`M ${x} ${y - R} A ${R} ${R} 0 0 0 ${x} ${y + R} Z`} fill="#a4514a" />
            <path d={`M ${x} ${y - R} A ${R} ${R} 0 0 1 ${x} ${y + R} Z`} fill="#3d5a66" />
            <line x1={x} y1={y - R} x2={x} y2={y + R} stroke="#fbfaf7" strokeWidth={1.4} />
            <text x={x - R * 0.42} y={y + R * 0.24} fontSize={Math.max(9, R * 0.72)} fill="#fbfaf7" textAnchor="middle" fontWeight={600}>
              {part.pole === 'S' ? 'S' : 'N'}
            </text>
            <text x={x + R * 0.42} y={y + R * 0.24} fontSize={Math.max(9, R * 0.72)} fill="#fbfaf7" textAnchor="middle" fontWeight={600}>
              {part.pole === 'S' ? 'N' : 'S'}
            </text>
          </>
        )
        break
      }
      case 'planet': {
        const dots: React.ReactNode[] = []
        for (let i = 0; i < 8; i++) {
          const p = polar((i * Math.PI) / 4, R * 0.86)
          dots.push(<circle key={i} cx={p[0]} cy={p[1]} r={1.8} fill={stroke} />)
        }
        shape = (
          <>
            <circle cx={x} cy={y} r={R + 10} fill="transparent" />
            <circle cx={x} cy={y} r={R} fill={fill} stroke={stroke} strokeWidth={1.2} />
            <circle cx={x} cy={y} r={R * 0.68} fill="none" stroke={soft} strokeWidth={1.2} />
            <circle cx={x} cy={y} r={R * 0.32} fill="#fbfaf7" opacity={0.8} />
            {dots}
          </>
        )
        break
      }
      case 'arcTrack': {
        shape = renderArc(part, x, y, R)
        break
      }
      default:
        shape = <circle cx={x} cy={y} r={R} fill={fill} stroke={stroke} strokeWidth={1.3} />
    }

    return (
      <g
        key={part.id}
        data-part={part.id}
        data-kind={part.kind}
        data-x={st.x.toFixed(3)}
        data-y={st.y.toFixed(3)}
        data-angle={dataAngle.toFixed(1)}
        style={{ cursor: pending ? 'crosshair' : editing ? (part.locked ? 'default' : 'grab') : 'pointer' }}
        onPointerDown={(e) => downPart(e, part)}
        onPointerMove={movePart}
        onPointerUp={upPart}
        onPointerCancel={upPart}
      >
        {(sel || linked) && renderSelection(part.kind, x, y, rot, R, halfHeight, primary)}
        {part.kind === 'arcTrack' ? (
          shape
        ) : (
          <g transform={`rotate(${rot.toFixed(2)} ${x} ${y})`}>{shape}</g>
        )}
      </g>
    )
  }

  /* ───────── 画连接 ───────── */

  /** 圆弧轨道：双线圆弧 + 沿线短刻度（世界几何按文档角度） */
  function renderArc(part: MechPart, x: number, y: number, R: number) {
    const span = clamp(finite(part.span) ? part.span : 150, 10, 360)
    const start = ((part.angle ?? 0) - span / 2) * DEG
    const pt = (ang: number, rad: number): [number, number] => [x + rad * Math.cos(ang), y - rad * Math.sin(ang)]
    const large = span > 180 ? 1 : 0
    const arcD = (rad: number) => {
      const p0 = pt(start, rad)
      const p1 = pt(start + span * DEG, rad)
      return `M ${p0[0].toFixed(2)} ${p0[1].toFixed(2)} A ${rad.toFixed(2)} ${rad.toFixed(2)} 0 ${large} 0 ${p1[0].toFixed(2)} ${p1[1].toFixed(2)}`
    }
    const ticks: React.ReactNode[] = []
    const tickCount = clamp(Math.round(span / 10), 4, 48)
    for (let i = 0; i <= tickCount; i++) {
      const ang = start + (span * DEG * i) / tickCount
      const p1 = pt(ang, R - 5)
      const p2 = pt(ang, R + 5)
      ticks.push(<line key={i} x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke="#cfc9c0" strokeWidth={1} />)
    }
    return (
      <g>
        {span >= 359 ? (
          <>
            <circle cx={x} cy={y} r={R} fill="none" stroke="#cfc9c0" strokeWidth={5} />
            <circle cx={x} cy={y} r={R - 5} fill="none" stroke="#3d5a66" strokeWidth={1} />
            <circle cx={x} cy={y} r={R + 5} fill="none" stroke="#3d5a66" strokeWidth={1} />
          </>
        ) : (
          <>
            <path d={arcD(R)} fill="none" stroke="#cfc9c0" strokeWidth={5} strokeLinecap="round" />
            <path d={arcD(R - 5)} fill="none" stroke="#3d5a66" strokeWidth={1} />
            <path d={arcD(R + 5)} fill="none" stroke="#3d5a66" strokeWidth={1} />
            {ticks}
            <path d={arcD(R)} fill="none" stroke="transparent" strokeWidth={14} />
          </>
        )}
      </g>
    )
  }

  function renderLink(link: MechLink) {
    const a = partById(link.a)
    const b = partById(link.b)
    if (!a || !b) return null
    const rig = rigRef.current
    const ba = rig?.bodies.get(link.a)
    const bb = rig?.bodies.get(link.b)
    const paW = ba ? bodyPoint(ba, link.offsetA) : attachPoint({ x: a.x, y: a.y, angle: (a.angle ?? 0) * DEG }, link.offsetA)
    const pbW = bb ? bodyPoint(bb, link.offsetB) : attachPoint({ x: b.x, y: b.y, angle: (b.angle ?? 0) * DEG }, link.offsetB)
    const pa = toScreen([paW.x, paW.y])
    const pb = toScreen([pbW.x, pbW.y])
    const distPx = Math.hypot(pb[0] - pa[0], pb[1] - pa[1])
    const distM = distPx / pxPerM
    const sel = selectedId === link.id
    const lineColor = sel ? '#3d5a66' : '#8b8a84'
    const common = {
      fill: 'none',
      stroke: lineColor,
      strokeWidth: sel ? 2.4 : 1.6,
      strokeLinecap: 'round' as const,
      strokeLinejoin: 'round' as const,
    }
    const ux = distPx > 1e-6 ? (pb[0] - pa[0]) / distPx : 1
    const uy = distPx > 1e-6 ? (pb[1] - pa[1]) / distPx : 0
    const ang = radDeg(Math.atan2(pb[1] - pa[1], pb[0] - pa[0]))
    const vias = linkVias(link)
      .map((id) => partById(id))
      .filter((p): p is MechPart => Boolean(p))
    const viaScreens = vias.map((p) => screenOf(p))
    // 绳依次绕过滑轮：每个滑轮取「两段方向角平分线的反方向」上的外缘点（旧算法，折线点数要保住）
    const route: [number, number][] = [pa]
    vias.forEach((pulley, i) => {
      const pp = viaScreens[i]
      const prev = i === 0 ? pa : viaScreens[i - 1]
      const next = i === vias.length - 1 ? pb : viaScreens[i + 1]
      const uax = prev[0] - pp[0]
      const uay = prev[1] - pp[1]
      const ubx = next[0] - pp[0]
      const uby = next[1] - pp[1]
      const la = Math.hypot(uax, uay) || 1
      const lb = Math.hypot(ubx, uby) || 1
      let bx = uax / la + ubx / lb
      let by = uay / la + uby / lb
      const bl = Math.hypot(bx, by)
      if (bl < 1e-3) {
        bx = 0
        by = -1
      } else {
        bx /= bl
        by /= bl
      }
      const rp = Math.max(6, pulley.size * pxPerM)
      route.push([pp[0] - bx * rp, pp[1] - by * rp])
    })
    route.push(pb)
    const routePoints = route.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
    const hit = <polyline points={routePoints} fill="none" stroke="transparent" strokeWidth={14} />

    let shape: React.ReactNode = null
    switch (link.kind) {
      case 'spring': {
        const coils = clamp(Math.round(link.rest / 0.22), 4, 14)
        shape = (
          <path
            d={springPath(pa, pb, coils, 7)}
            {...common}
            data-link={link.id}
            data-kind="spring"
          />
        )
        break
      }
      case 'rope': {
        if (vias.length === 0) {
          const sag = Math.max(0, (link.rest - distM) * pxPerM * 0.55)
          shape = <path d={ropePath(pa, pb, sag)} {...common} data-link={link.id} data-kind="rope" />
        } else {
          shape = <polyline points={routePoints} {...common} data-link={link.id} data-kind="rope" />
        }
        break
      }
      case 'damper': {
        const len = clamp(distPx * 0.55, 10, 46)
        const cx = pa[0] + ux * (len / 2 + 4)
        const cy = pa[1] + uy * (len / 2 + 4)
        shape = (
          <g data-link={link.id} data-kind="damper">
            <line x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} {...common} strokeDasharray="2 3" />
            <g transform={`rotate(${ang.toFixed(2)} ${cx} ${cy})`}>
              <rect x={cx - len / 2} y={cy - 6} width={len} height={12} rx={3} fill="#e7e3dc" stroke={lineColor} strokeWidth={1.3} />
              <line x1={cx - len / 2 + 3} y1={cy - 6} x2={cx - len / 2 + 3} y2={cy + 6} stroke={lineColor} strokeWidth={1.2} />
            </g>
            <circle cx={pa[0]} cy={pa[1]} r={3} fill="#fbfaf7" stroke={lineColor} strokeWidth={1.2} />
            <circle cx={pb[0]} cy={pb[1]} r={3} fill="#fbfaf7" stroke={lineColor} strokeWidth={1.2} />
          </g>
        )
        break
      }
      case 'rod': {
        shape = (
          <g data-link={link.id} data-kind="rod">
            <line x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} stroke={sel ? '#3d5a66' : '#6f6d67'} strokeWidth={sel ? 5 : 4} strokeLinecap="round" />
            <line x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} stroke="#fbfaf7" strokeWidth={1.2} strokeLinecap="round" opacity={0.7} />
            <circle cx={pa[0]} cy={pa[1]} r={2.6} fill="#3d5a66" />
            <circle cx={pb[0]} cy={pb[1]} r={2.6} fill="#3d5a66" />
          </g>
        )
        break
      }
      case 'hinge': {
        const mx = (pa[0] + pb[0]) / 2
        const my = (pa[1] + pb[1]) / 2
        shape = (
          <g data-link={link.id} data-kind="hinge">
            {(Math.abs(pa[0] - pb[0]) > 1 || Math.abs(pa[1] - pb[1]) > 1) && (
              <line x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} stroke={lineColor} strokeWidth={1.2} strokeDasharray="4 3" />
            )}
            <circle cx={mx} cy={my} r={5.5} fill="#fbfaf7" stroke={sel ? '#3d5a66' : '#5c5a56'} strokeWidth={1.6} />
            <circle cx={mx} cy={my} r={1.8} fill="#3d5a66" />
          </g>
        )
        break
      }
      case 'weld': {
        const a2W = ba ? bodyPoint(ba, { x: (link.offsetA?.x ?? 0) + 0.18, y: link.offsetA?.y ?? 0 }) : paW
        const b2W = bb ? bodyPoint(bb, { x: (link.offsetB?.x ?? 0) + 0.18, y: link.offsetB?.y ?? 0 }) : pbW
        const a2 = toScreen([a2W.x, a2W.y])
        const b2 = toScreen([b2W.x, b2W.y])
        shape = (
          <g data-link={link.id} data-kind="weld">
            <line x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} stroke={lineColor} strokeWidth={sel ? 3 : 2.2} strokeLinecap="round" />
            {[pa, a2].map((p, i) => (
              <rect key={`a${i}`} x={p[0] - 2.6} y={p[1] - 2.6} width={5.2} height={5.2} fill={lineColor} transform={`rotate(45 ${p[0]} ${p[1]})`} />
            ))}
            {[pb, b2].map((p, i) => (
              <rect key={`b${i}`} x={p[0] - 2.6} y={p[1] - 2.6} width={5.2} height={5.2} fill={lineColor} transform={`rotate(45 ${p[0]} ${p[1]})`} />
            ))}
          </g>
        )
        break
      }
      case 'belt': {
        const ra = Math.max(4, gearRadius(a) * pxPerM)
        const rb = Math.max(4, gearRadius(b) * pxPerM)
        const t = beltTangent(pa, pb, ra, rb)
        shape = (
          <g data-link={link.id} data-kind="belt">
            <line x1={t.a1[0]} y1={t.a1[1]} x2={t.b1[0]} y2={t.b1[1]} {...common} />
            <line x1={t.a2[0]} y1={t.a2[1]} x2={t.b2[0]} y2={t.b2[1]} {...common} />
            <line x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} stroke="transparent" strokeWidth={2} />
          </g>
        )
        break
      }
      case 'gearPair': {
        const ra = Math.max(4, gearRadius(a) * pxPerM)
        const rb = Math.max(4, gearRadius(b) * pxPerM)
        shape = (
          <g data-link={link.id} data-kind="gearPair">
            <line x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} stroke={lineColor} strokeWidth={1} strokeDasharray="4 4" />
            <circle cx={pa[0]} cy={pa[1]} r={ra} fill="none" stroke={lineColor} strokeWidth={1} strokeDasharray="3 4" opacity={0.8} />
            <circle cx={pb[0]} cy={pb[1]} r={rb} fill="none" stroke={lineColor} strokeWidth={1} strokeDasharray="3 4" opacity={0.8} />
            <circle cx={(pa[0] + pb[0]) / 2} cy={(pa[1] + pb[1]) / 2} r={2.6} fill={lineColor} />
          </g>
        )
        break
      }
      case 'rackPinion': {
        const gearPart = a.kind === 'rack' ? b : a
        const rackPart = a.kind === 'rack' ? a : b
        const gearScreen = a.kind === 'rack' ? pb : pa
        const rackScreen = a.kind === 'rack' ? pa : pb
        const th = (rackPart.angle ?? 0) * DEG
        const rux = Math.cos(th)
        const ruy = -Math.sin(th)
        let tt = (gearScreen[0] - rackScreen[0]) * rux + (gearScreen[1] - rackScreen[1]) * ruy
        tt = clamp(tt, -rackPart.size * pxPerM, rackPart.size * pxPerM)
        const contact: [number, number] = [rackScreen[0] + rux * tt, rackScreen[1] + ruy * tt]
        const rr = Math.max(4, gearRadius(gearPart) * pxPerM)
        shape = (
          <g data-link={link.id} data-kind="rackPinion">
            <line x1={gearScreen[0]} y1={gearScreen[1]} x2={contact[0]} y2={contact[1]} stroke={lineColor} strokeWidth={1} strokeDasharray="4 4" />
            <circle cx={gearScreen[0]} cy={gearScreen[1]} r={rr} fill="none" stroke={lineColor} strokeWidth={1} strokeDasharray="3 4" opacity={0.8} />
            <circle cx={contact[0]} cy={contact[1]} r={3.4} fill="#fbfaf7" stroke={lineColor} strokeWidth={1.4} />
          </g>
        )
        break
      }
      case 'piston': {
        const len = clamp(distPx * 0.55, 12, 60)
        const cx = pa[0] + ux * (len / 2 + 2)
        const cy = pa[1] + uy * (len / 2 + 2)
        shape = (
          <g data-link={link.id} data-kind="piston">
            <line x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} stroke={lineColor} strokeWidth={3} strokeLinecap="round" />
            <g transform={`rotate(${ang.toFixed(2)} ${cx} ${cy})`}>
              <rect x={cx - len / 2} y={cy - 7} width={len} height={14} rx={3} fill="#e7e3dc" stroke={lineColor} strokeWidth={1.3} />
              <line x1={cx + len / 2 - 3} y1={cy - 7} x2={cx + len / 2 - 3} y2={cy + 7} stroke={lineColor} strokeWidth={1.2} />
            </g>
            <circle cx={pa[0]} cy={pa[1]} r={3.4} fill="#fbfaf7" stroke={lineColor} strokeWidth={1.3} />
          </g>
        )
        break
      }
      default:
        shape = <line x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} {...common} />
    }

    return (
      <g key={link.id} onPointerDown={(e) => downLink(e, link)} style={{ cursor: pending ? 'crosshair' : 'pointer' }}>
        {shape}
        {hit}
      </g>
    )
  }

  /* ───────── 叠加层 ───────── */

  /** 真实模式：按住部件时画出「手」的拉力 */
  function renderPull() {
    const pull = pullRef.current
    if (!pull) return null
    const rig = rigRef.current
    const body = rig?.bodies.get(pull.id)
    const part = partById(pull.id)
    if (!body || !part) return null
    const [sx, sy] = toScreen([body.position.x, body.position.y])
    const [tx, ty] = toScreen([pull.x, pull.y])
    return (
      <g data-pull="1" pointerEvents="none">
        <line x1={sx} y1={sy} x2={tx} y2={ty} stroke="#b08a3e" strokeWidth={2} strokeDasharray="5 4" />
        <circle cx={tx} cy={ty} r={4} fill="#b08a3e" />
        <text x={tx + 8} y={ty - 8} className="mech__label" fill="#8a6a28">
          拉力
        </text>
      </g>
    )
  }

  function renderTrails() {
    return (
      <g pointerEvents="none">
        {params.parts.map((part) => {
          const arr = trailsRef.current.get(part.id)
          if (!arr || arr.length < 2) return null
          const pts = arr
            .map((p) => {
              const s = toScreen([p[0], p[1]])
              return `${s[0].toFixed(1)},${s[1].toFixed(1)}`
            })
            .join(' ')
          return (
            <polyline
              key={part.id}
              data-trail={part.id}
              points={pts}
              fill="none"
              stroke="#9aa6ad"
              strokeWidth={1.1}
              strokeDasharray="4 3"
              opacity={0.7}
            />
          )
        })}
      </g>
    )
  }

  /** 标尺网格：0.5m 细线 + 1m 粗线（zoom 太小时自动省略细线，避免几百条线） */
  function renderGrid() {
    if (!(grid > 0)) return null
    const px = pxPerM
    if (px < 6) return null
    const [ox, oy] = toScreen([0, 0])
    const step = px * 0.5 >= 7 ? 0.5 : 1
    const W = Math.max(2400, window.innerWidth * 1.5)
    const Hh = Math.max(1600, window.innerHeight * 1.5)
    const xmin = (0 - ox) / px
    const xmax = (W - ox) / px
    const ymin = (oy - Hh) / px
    const ymax = oy / px
    const limit = 420
    const lines: React.ReactNode[] = []
    if ((xmax - xmin) / step <= limit) {
      const start = Math.ceil(xmin / step)
      const count = Math.floor(xmax / step) - start
      for (let i = 0; i <= count; i++) {
        const v = (start + i) * step
        const sx = ox + v * px
        const major = Math.abs(v - Math.round(v)) < 1e-6
        lines.push(<line key={`v${i}`} x1={sx} y1={-40} x2={sx} y2={Hh} data-major={major ? '1' : '0'} />)
      }
    }
    if ((ymax - ymin) / step <= limit) {
      const start = Math.ceil(ymin / step)
      const count = Math.floor(ymax / step) - start
      for (let i = 0; i <= count; i++) {
        const v = (start + i) * step
        const sy = oy - v * px
        const major = Math.abs(v - Math.round(v)) < 1e-6
        lines.push(<line key={`h${i}`} x1={-40} y1={sy} x2={W} y2={sy} data-major={major ? '1' : '0'} />)
      }
    }
    return (
      <g className="mech__grid" data-grid={grid} pointerEvents="none">
        {lines}
      </g>
    )
  }

  function renderGround() {
    const groundY = toScreen([0, MECH_GROUND_Y])[1]
    const left = toScreen([-40, MECH_GROUND_Y])[0]
    const right = toScreen([40, MECH_GROUND_Y])[0]
    const hatches: React.ReactNode[] = []
    const n = 120
    for (let i = 0; i < n; i++) {
      const hx = left + ((right - left) / n) * i
      hatches.push(<line key={i} x1={hx} y1={groundY} x2={hx - 7} y2={groundY + 7} stroke="#ddd8d0" strokeWidth={0.8} />)
    }
    return (
      <g pointerEvents="none">
        <line x1={left} y1={groundY} x2={right} y2={groundY} stroke="#c9c4bc" strokeWidth={1.2} />
        {hatches}
      </g>
    )
  }

  /** 速度箭头 / 合力箭头 / 受力分解（沿用旧版配色与文字） */
  function renderVectors() {
    const selPart = selectedId ? partById(selectedId) : undefined
    const selForce = selectedId ? forcesRef.current.get(selectedId) : undefined
    return (
      <g data-vectors="1" pointerEvents="none">
        {params.parts.map((part) => {
          if (isStaticPart(part)) return null
          const st = posOf(part)
          const speed = Math.hypot(st.vx, st.vy)
          if (speed < 0.15) return null
          const [x, y] = screenOf(part)
          const k = Math.min(48, speed * 12) / speed
          return <Arrow key={`v-${part.id}`} x={x} y={y} dx={st.vx * k} dy={-st.vy * k} color="#4f8a3d" label={`v ${speed.toFixed(1)}`} />
        })}
        {selPart &&
          !isStaticPart(selPart) &&
          decompose &&
          (() => {
            const d = decomposeOf(selPart)
            if (!d) return null
            const [x, y] = screenOf(selPart)
            const mags = [
              Math.hypot(d.g.x, d.g.y),
              Math.hypot(d.elastic.x, d.elastic.y),
              Math.hypot(d.formula.x, d.formula.y),
              d.n,
              Math.abs(d.friction),
            ]
            const maxM = Math.max(...mags, 1)
            const k = Math.min(64, maxM * 2.2) / maxM
            const one = (vx: number, vy: number, color: string, label: string) => {
              const m = Math.hypot(vx, vy)
              if (m < 0.12) return null
              return <Arrow key={label} x={x} y={y} dx={vx * k} dy={-vy * k} color={color} label={`${label} ${m.toFixed(1)}`} />
            }
            const t = d.normal ? { x: -d.normal.y, y: d.normal.x } : null
            return (
              <g data-decompose="1">
                {one(d.g.x, d.g.y, '#3a3a38', 'G')}
                {one(d.elastic.x, d.elastic.y, '#4f8a3d', 'F弹')}
                {one(d.formula.x, d.formula.y, '#7a5c8a', 'F')}
                {d.normal && one(d.normal.x * d.n, d.normal.y * d.n, '#2f6fa8', 'N')}
                {t && one(t.x * d.friction, t.y * d.friction, '#b08a3e', 'f')}
              </g>
            )
          })()}
        {selPart &&
          !isStaticPart(selPart) &&
          !decompose &&
          selForce &&
          (() => {
            const mag = Math.hypot(selForce.x, selForce.y)
            if (mag < 0.2) return null
            const [x, y] = screenOf(selPart)
            const k = Math.min(60, mag * 2.2) / mag
            return (
              <Arrow x={x} y={y} dx={selForce.x * k} dy={-selForce.y * k} color="#3d5a66" label={`F合力 ${mag.toFixed(1)} N`} />
            )
          })()}
      </g>
    )
  }

  /** 测距：两点连线 + 长度 / 角度文字 */
  function renderMeasure() {
    if (!measure) return null
    const a = partById(measure.a)
    const b = measure.b ? partById(measure.b) : undefined
    if (!a || !b) return null
    const paW = posOf(a)
    const pbW = posOf(b)
    const pa = toScreen([paW.x, paW.y])
    const pb = toScreen([pbW.x, pbW.y])
    const dist = Math.hypot(pbW.x - paW.x, pbW.y - paW.y)
    const deg = radDeg(Math.atan2(pbW.y - paW.y, pbW.x - paW.x))
    const dx = pb[0] - pa[0]
    const dy = pb[1] - pa[1]
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    const nx = -uy
    const ny = ux
    const mx = (pa[0] + pb[0]) / 2
    const my = (pa[1] + pb[1]) / 2
    return (
      <g data-measure="1" pointerEvents="none">
        <line x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} stroke="#2f5560" strokeWidth={1.2} strokeDasharray="6 4" />
        {[pa, pb].map((p, i) => (
          <g key={i}>
            <line x1={p[0] + nx * 7} y1={p[1] + ny * 7} x2={p[0] - nx * 7} y2={p[1] - ny * 7} stroke="#2f5560" strokeWidth={1.2} />
            <circle cx={p[0]} cy={p[1]} r={2.4} fill="#2f5560" />
          </g>
        ))}
        <text x={mx + nx * 16} y={my + ny * 16} className="mech__label" textAnchor="middle" fill="#2f5560">
          {`L = ${dist.toFixed(2)} m · ${deg.toFixed(0)}°`}
        </text>
      </g>
    )
  }

  function renderLabels() {
    return (
      <g pointerEvents="none">
        {params.parts.map((part) => {
          const [x, y] = screenOf(part)
          const R = Math.max(5, part.size * pxPerM)
          const off = Math.min(R, 60) + 10
          const mass = isStaticPart(part) ? '' : ` ${part.mass.toFixed(1)}kg`
          return (
            <text key={part.id} className="mech__label" data-label={part.id} x={x + off} y={y - off * 0.55}>
              {`${partName(part)}${mass}`}
            </text>
          )
        })}
      </g>
    )
  }

  /* ───────── 渲染 ───────── */

  const pulleyParts = params.parts.filter((p) => p.kind === 'pulley' || p.kind === 'movablePulley')
  const otherParts = params.parts.filter((p) => p.kind !== 'pulley' && p.kind !== 'movablePulley')

  return (
    <g
      className={`mech ${pending ? 'mech--linking' : ''}`}
      data-mech="1"
      data-tick={tick}
      data-grid={grid}
      data-snap-angle={snapAngle ? '1' : '0'}
      onPointerDown={downBackground}
    >
      {renderGrid()}
      {renderGround()}
      {trails && renderTrails()}
      {/* 滑轮先画：绳再压上去，看起来才是「绕过去」 */}
      {pulleyParts.map(renderPart)}
      {params.links.map((link) => renderLink(link))}
      {otherParts.map(renderPart)}
      {renderPull()}
      {vectors && renderVectors()}
      {measure && renderMeasure()}
      {labels && renderLabels()}
    </g>
  )
}






