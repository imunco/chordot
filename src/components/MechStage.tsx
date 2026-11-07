import { useEffect, useMemo, useRef, useState } from 'react'
import Matter from 'matter-js'
import { compile, type EvalFunction } from 'mathjs'
import type { MechLink, MechLinkKind, MechParams, MechPart } from '../kernel/types'
import {
  attachPoint,
  linkVias,
  MECH_FORCE_SCALE,
  MECH_GROUND_Y,
  MECH_STATIC_KINDS,
  ROPE_K,
} from '../model/mech'

/**
 * 机构装配的画布层（SVG + Matter.js）。
 *
 * 部件：小球 / 方块 / 固定点 / 轨道 / 滑轮 / 轮（中心轴可固定，可加电机力矩）。
 * 连接：弹簧（胡克定律自己施力）、绳（只拉不推，可绕过滑轮）、杆（Matter 刚性约束）。
 *
 * 位置由引擎持有；只有「拖完一次」才写回文档（进撤销栈），
 * 播放过程中的每一帧不碰文档，不会把历史记录刷爆。
 */

const STEP = 1 / 120
const DEG = Math.PI / 180
/** body.velocity 是 Matter 归一化到 baseDelta(16.67ms) 后的每帧位移，换成 m/s 乘这个 */
const VEL_SCALE = 1000 / 16.667

interface Rig {
  engine: Matter.Engine
  bodies: Map<string, Matter.Body>
  ground: Matter.Body
}

interface Props {
  params: MechParams
  toScreen: (p: [number, number]) => [number, number]
  toWorld: (clientX: number, clientY: number) => { x: number; y: number }
  selectedId: string | null
  onSelect: (id: string | null, kind: 'part' | 'link' | null) => void
  pending: MechLinkKind | null
  anchor: string | null
  onAnchor: (id: string | null) => void
  onLink: (kind: MechLinkKind, a: string, b: string) => void
  playing: boolean
  /** 显示速度 / 受力箭头 */
  vectors: boolean
  /** 受力分解：重力 / 支持力 / 摩擦力分开画 */
  decompose: boolean
  resetToken: number
  onCommitParts: (parts: MechPart[]) => void
}

/** 弹簧：中点折线，圈数按自然长度定，拉伸时圈会变稀（视觉上就是「拉长了」） */
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

/** 绳：短了会自然下垂 */
function ropePath(a: [number, number], b: [number, number], sag: number) {
  const mx = (a[0] + b[0]) / 2
  const my = (a[1] + b[1]) / 2 + sag
  return `M${a[0].toFixed(1)} ${a[1].toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`
}

/** 一根带箭头的小矢量 */
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

/** 一条连接对两端的作用力（世界坐标，N）+ 两个连接点；杆 / 铰链由引擎约束负责，这里返回 null */
function linkForce(
  link: MechLink,
  A: Matter.Body,
  B: Matter.Body,
  vias: Matter.Body[],
): { fA: { x: number; y: number }; fB: { x: number; y: number }; pa: { x: number; y: number }; pb: { x: number; y: number } } | null {
  if (link.kind === 'rod' || link.kind === 'hinge') return null
  const pa = attachPoint({ x: A.position.x, y: A.position.y, angle: A.angle }, link.offsetA)
  const pb = attachPoint({ x: B.position.x, y: B.position.y, angle: B.angle }, link.offsetB)

  if (link.kind === 'rope' && vias.length > 0) {
    let total = 0
    let prev = pa
    for (const P of vias) {
      total += Math.hypot(P.position.x - prev.x, P.position.y - prev.y)
      prev = { x: P.position.x, y: P.position.y }
    }
    total += Math.hypot(pb.x - prev.x, pb.y - prev.y)
    const stretch = total - link.rest
    if (stretch <= 0) return null
    const f = ROPE_K * stretch
    const first = vias[0].position
    const last = vias[vias.length - 1].position
    const d1 = Math.hypot(first.x - pa.x, first.y - pa.y) || 1e-6
    const d2 = Math.hypot(last.x - pb.x, last.y - pb.y) || 1e-6
    return {
      fA: { x: ((first.x - pa.x) / d1) * f, y: ((first.y - pa.y) / d1) * f },
      fB: { x: ((last.x - pb.x) / d2) * f, y: ((last.y - pb.y) / d2) * f },
      pa,
      pb,
    }
  }

  if (A.isStatic && B.isStatic) return null
  const dx = pb.x - pa.x
  const dy = pb.y - pa.y
  const dist = Math.hypot(dx, dy) || 1e-6
  const nx = dx / dist
  const ny = dy / dist
  const stretch = dist - link.rest
  let f = 0
  if (link.kind === 'spring') {
    const k = link.k ?? 25
    const c = link.c ?? 0
    const va = A.isStatic ? { x: 0, y: 0 } : { x: A.velocity.x * VEL_SCALE, y: A.velocity.y * VEL_SCALE }
    const vb = B.isStatic ? { x: 0, y: 0 } : { x: B.velocity.x * VEL_SCALE, y: B.velocity.y * VEL_SCALE }
    const rel = (vb.x - va.x) * nx + (vb.y - va.y) * ny
    f = k * stretch + c * rel
  } else if (stretch > 0) {
    // 绳只拉不推
    f = ROPE_K * stretch
  }
  if (!f) return null
  return { fA: { x: nx * f, y: ny * f }, fB: { x: -nx * f, y: -ny * f }, pa, pb }
}

export function MechStage({
  params,
  toScreen,
  toWorld,
  selectedId,
  onSelect,
  pending,
  anchor,
  onAnchor,
  onLink,
  playing,
  vectors,
  decompose,
  resetToken,
  onCommitParts,
}: Props) {
  const rigRef = useRef<Rig | null>(null)
  const linksRef = useRef<MechLink[]>(params.links)
  linksRef.current = params.links
  const partsRef = useRef<MechPart[]>(params.parts)
  partsRef.current = params.parts
  const [tick, setTick] = useState(0)
  const dragRef = useRef<{
    id: string
    dx: number
    dy: number
    /** 同组部件相对被拖部件的偏移（一起搬） */
    members: { id: string; ox: number; oy: number }[]
  } | null>(null)
  /** 每步累加的各部件合力（N，世界坐标），只用来画箭头 */
  const forcesRef = useRef(new Map<string, { x: number; y: number }>())
  const timeRef = useRef(0)
  const compiled = useRef(new Map<string, EvalFunction>())

  /** 结构键：只有「改了会换引擎」的东西进来；k / c / 力表达式走 ref，拖滑杆不重建 */
  const structKey = useMemo(
    () =>
      JSON.stringify([
        params.parts.map((p) => [
          p.id,
          p.kind,
          p.x,
          p.y,
          p.size,
          p.mass,
          p.fixed ? 1 : 0,
          p.angle ?? 0,
          p.pinned ? 1 : 0,
          p.motor ?? 0,
          p.onTrack ?? '',
          p.group ?? '',
        ]),
        params.links.map((l) => [
          l.id,
          l.kind,
          l.a,
          l.b,
          l.kind === 'spring' || l.kind === 'rope' ? 0 : l.rest,
          linkVias(l).join('>'),
          l.offsetA ? `${l.offsetA.x},${l.offsetA.y}` : '',
          l.offsetB ? `${l.offsetB.x},${l.offsetB.y}` : '',
        ]),
        params.gravity,
      ]),
    [params],
  )

  useEffect(() => {
    const engine = Matter.Engine.create()
    // Matter 的 y 轴向下，我们的世界 y 轴向上：重力必须取负，否则球会被「重力」往上推
    engine.gravity.y = -params.gravity * 0.001
    engine.positionIterations = 10
    engine.velocityIterations = 8
    const bodies = new Map<string, Matter.Body>()
    const ground = Matter.Bodies.rectangle(0, MECH_GROUND_Y - 0.5, 90, 1, {
      isStatic: true,
      friction: 0.6,
      restitution: 0.02,
    })
    const world = [ground] as Matter.Body[]
    const constraints: Matter.Constraint[] = []
    for (const part of params.parts) {
      const isStatic = Boolean(part.fixed) || MECH_STATIC_KINDS.includes(part.kind)
      const common = {
        isStatic,
        frictionAir: isStatic ? 0 : 0.0015,
        friction: 0.5,
        restitution: 0.05,
        density: 0.001,
      }
      // 渲染时 y 轴翻转，Matter 里的角度要取反，视觉上才和面板里的角度一致
      const angle = -((part.angle ?? 0) * DEG)
      let body: Matter.Body
      if (part.kind === 'box') {
        body = Matter.Bodies.rectangle(part.x, part.y, part.size * 2, part.size * 2, {
          ...common,
          angle,
        })
      } else if (part.kind === 'track') {
        body = Matter.Bodies.rectangle(part.x, part.y, part.size * 2, 0.12, {
          ...common,
          angle,
          friction: 0.45,
        })
      } else {
        body = Matter.Bodies.circle(part.x, part.y, part.size, common)
      }
      if (!isStatic) Matter.Body.setMass(body, Math.max(0.05, part.mass))
      // 方块按课本里的「滑块 / 小车」处理：只滑不转（否则摩擦会把它掀翻，看着像翻车）
      if (part.kind === 'box' && !isStatic) Matter.Body.setInertia(body, Infinity)
      // 锚点做成实体：弹簧把球拉过来时球会撞在销子上停住，而不是穿过它
      // （弹簧的 d=|r| 在 0 处有尖点，穿过去会多算一点能量）
      if (part.kind === 'anchor') body.restitution = 0.2
      bodies.set(part.id, body)
      world.push(body)
      // 轮：中心轴固定 = 转动副，只转不跑
      if (part.kind === 'wheel' && part.pinned && !isStatic) {
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
    }
    for (const link of params.links) {
      if (link.kind !== 'rod' && link.kind !== 'hinge') continue
      const a = bodies.get(link.a)
      const b = bodies.get(link.b)
      if (!a || !b) continue
      // Matter 的 pointA / pointB 就是「部件局部坐标下的连接点」，正好用来做任意点铰接
      constraints.push(
        Matter.Constraint.create({
          bodyA: a,
          bodyB: b,
          pointA: link.offsetA ?? { x: 0, y: 0 },
          pointB: link.offsetB ?? { x: 0, y: 0 },
          length: link.kind === 'hinge' ? 0 : Math.max(0.05, link.rest),
          stiffness: 1,
          damping: 0.04,
        }),
      )
    }
    // 轨道约束的部件不跟这条轨道碰撞（不然摩擦会把它「粘」在斜面上），只沿轨道滑
    for (const part of params.parts) {
      if (!part.onTrack) continue
      const tb = bodies.get(part.onTrack)
      const b = bodies.get(part.id)
      if (!tb || !b) continue
      tb.collisionFilter.category = 0x0002
      b.collisionFilter.mask = 0xffff & ~0x0002
    }
    Matter.Composite.add(engine.world, [...world, ...constraints])
    rigRef.current = { engine, bodies, ground }
    forcesRef.current = new Map()
    timeRef.current = 0
    setTick((t) => t + 1)
    return () => {
      Matter.Composite.clear(engine.world, false, true)
      Matter.Engine.clear(engine)
      rigRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structKey, resetToken])

  const evalForceExpr = (expr: string, scope: Record<string, number>): number => {
    try {
      let fn = compiled.current.get(expr)
      if (!fn) {
        fn = compile(expr)
        compiled.current.set(expr, fn)
      }
      const out = fn.evaluate(scope) as unknown
      const n = typeof out === 'number' ? out : Number(out)
      return Number.isFinite(n) ? Math.max(-2000, Math.min(2000, n)) : 0
    } catch {
      return 0
    }
  }

  /** 一帧物理：弹簧 / 绳 / 公式力 / 电机力矩先加力，再让引擎推进 */
  const physicsStep = (dt: number) => {
    const rig = rigRef.current
    if (!rig) return
    const forces = new Map<string, { x: number; y: number }>()
    const add = (id: string, fx: number, fy: number) => {
      const cur = forces.get(id) ?? { x: 0, y: 0 }
      forces.set(id, { x: cur.x + fx, y: cur.y + fy })
    }
    const apply = (
      body: Matter.Body,
      id: string,
      fx: number,
      fy: number,
      at?: { x: number; y: number },
    ) => {
      if (body.isStatic) return
      // 力施加在连接点上：偏心连接才会产生力矩（铰链、端点偏移靠这个）
      Matter.Body.applyForce(body, at ?? body.position, {
        x: fx * MECH_FORCE_SCALE,
        y: fy * MECH_FORCE_SCALE,
      })
      add(id, fx, fy)
    }

    for (const link of linksRef.current) {
      if (link.kind === 'rod' || link.kind === 'hinge') continue
      const A = rig.bodies.get(link.a)
      const B = rig.bodies.get(link.b)
      if (!A || !B) continue
      const vias = linkVias(link)
        .map((id) => rig.bodies.get(id))
        .filter((b): b is Matter.Body => !!b)
      const r = linkForce(link, A, B, vias)
      if (!r) continue
      apply(A, link.a, r.fA.x, r.fA.y, r.pa)
      apply(B, link.b, r.fB.x, r.fB.y, r.pb)
    }

    timeRef.current += dt
    for (const part of partsRef.current) {
      const body = rig.bodies.get(part.id)
      if (!body || body.isStatic) continue
      // 电机：给中心轴固定的轮加力矩
      if (part.motor) body.torque += part.motor * 1e-6
      // 公式力 F(x,y,vx,vy,t,m,g)
      if (part.force?.enabled && part.force.expr.trim()) {
        const F = evalForceExpr(part.force.expr, {
          x: body.position.x,
          y: body.position.y,
          vx: body.velocity.x * VEL_SCALE,
          vy: body.velocity.y * VEL_SCALE,
          t: timeRef.current,
          m: part.mass,
          g: params.gravity,
        })
        const th = (part.force.angle ?? 0) * DEG
        apply(body, part.id, Math.cos(th) * F, Math.sin(th) * F)
      }
      // 重力只用来画合力箭头（引擎自己会施加重力）
      add(part.id, 0, -part.mass * params.gravity)
    }
    forcesRef.current = forces
    Matter.Engine.update(rig.engine, dt * 1000)

    // 轨道约束：只能沿轨道滑 —— 把位置投影回轨道面，并抹掉法向速度
    for (const part of partsRef.current) {
      if (!part.onTrack) continue
      const track = partsRef.current.find((p) => p.id === part.onTrack)
      const body = rig.bodies.get(part.id)
      if (!track || !body || body.isStatic) continue
      const th = (track.angle ?? 0) * DEG
      const ca = Math.cos(th)
      const sa = Math.sin(th)
      const dx = body.position.x - track.x
      const dy = body.position.y - track.y
      let lx = dx * ca + dy * sa
      const half = part.size
      const limit = Math.max(0, track.size - half)
      lx = Math.max(-limit, Math.min(limit, lx))
      const ly = 0.06 + half
      Matter.Body.setPosition(body, {
        x: track.x + lx * ca - ly * sa,
        y: track.y + lx * sa + ly * ca,
      })
      const nx = -sa
      const ny = ca
      // 只抹掉法向那部分位移（velocity = position − positionPrev），切向原样保留
      // positionPrev 没进 @types，但它就是 Verlet 的上一帧位置
      const prev = (body as unknown as { positionPrev: { x: number; y: number } }).positionPrev
      const vpx = body.position.x - prev.x
      const vpy = body.position.y - prev.y
      const vn = vpx * nx + vpy * ny
      if (Math.abs(vn) > 1e-9) {
        prev.x += vn * nx
        prev.y += vn * ny
      }
    }
  }

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    let acc = 0
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      acc += dt
      let guard = 0
      while (acc >= STEP && guard++ < 8) {
        physicsStep(STEP)
        acc -= STEP
      }
      setTick((t) => (t + 1) % 1000000)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, structKey])

  const posOf = (part: MechPart) => {
    const b = rigRef.current?.bodies.get(part.id)
    return b
      ? {
          x: b.position.x,
          y: b.position.y,
          angle: b.angle,
          vx: b.velocity.x * VEL_SCALE,
          vy: b.velocity.y * VEL_SCALE,
        }
      : { x: part.x, y: part.y, angle: 0, vx: 0, vy: 0 }
  }

  /** 1 米多少像素：绳子下垂量 / 部件尺寸都要按世界长度算 */
  const pxPerM = Math.abs(toScreen([1, 0])[0] - toScreen([0, 0])[0]) || 40

  const screenOf = (part: MechPart): [number, number] => {
    const p = posOf(part)
    return toScreen([p.x, p.y])
  }

  const partById = (id: string) => params.parts.find((p) => p.id === id)
  const isStaticPart = (p: MechPart) => Boolean(p.fixed) || MECH_STATIC_KINDS.includes(p.kind)

  /** 部件按下：连线模式先记起点，否则选中并拖动 */
  const downPart = (e: React.PointerEvent, part: MechPart) => {
    e.stopPropagation()
    e.preventDefault()
    onSelect(part.id, 'part')
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
    const w = toWorld(e.clientX, e.clientY)
    const p = posOf(part)
    // 同组（子机构）一起搬：记下每个成员相对它的偏移
    const members = part.group
      ? params.parts
          .filter((q) => q.group === part.group && q.id !== part.id)
          .map((q) => {
            const qp = posOf(q)
            return { id: q.id, ox: qp.x - p.x, oy: qp.y - p.y }
          })
      : []
    dragRef.current = { id: part.id, dx: p.x - w.x, dy: p.y - w.y, members }
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      /* 合成事件忽略 */
    }
  }

  const movePart = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    e.stopPropagation()
    const w = toWorld(e.clientX, e.clientY)
    const rig = rigRef.current
    const body = rig?.bodies.get(d.id)
    const nx = w.x + d.dx
    const ny = w.y + d.dy
    if (body) {
      Matter.Body.setPosition(body, { x: nx, y: ny })
      Matter.Body.setVelocity(body, { x: 0, y: 0 })
      Matter.Body.setAngularVelocity(body, 0)
    }
    for (const m of d.members) {
      const b = rig?.bodies.get(m.id)
      if (!b) continue
      Matter.Body.setPosition(b, { x: nx + m.ox, y: ny + m.oy })
      Matter.Body.setVelocity(b, { x: 0, y: 0 })
      Matter.Body.setAngularVelocity(b, 0)
    }
    setTick((t) => (t + 1) % 1000000)
  }

  const upPart = (e: React.PointerEvent) => {
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    e.stopPropagation()
    try {
      ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
    } catch {
      /* 忽略 */
    }
    const rig = rigRef.current
    const body = rig?.bodies.get(d.id)
    if (!body) return
    const moved = new Map<string, { x: number; y: number }>()
    moved.set(d.id, {
      x: Math.round(body.position.x * 100) / 100,
      y: Math.round(body.position.y * 100) / 100,
    })
    for (const m of d.members) {
      const b = rig?.bodies.get(m.id)
      if (b) {
        moved.set(m.id, {
          x: Math.round(b.position.x * 100) / 100,
          y: Math.round(b.position.y * 100) / 100,
        })
      }
    }
    const parts = params.parts.map((p) => {
      const m = moved.get(p.id)
      return m ? { ...p, x: m.x, y: m.y } : p
    })
    onCommitParts(parts)
  }

  /**
   * 受力分解：重力 / 弹力（弹簧+绳）/ 公式力 / 支持力 / 摩擦力。
   * 支持力和摩擦力没有从引擎里取冲量，而是按「其余力的法向、切向分量」反推（静力学近似），
   * 对课本里的滑块、斜面、悬挂这些场景够用，也不会有求解器噪声。
   */
  const decomposeOf = (part: MechPart) => {
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
      const vias = linkVias(link)
        .map((id) => rig.bodies.get(id))
        .filter((b): b is Matter.Body => !!b)
      const r = linkForce(link, A, B, vias)
      if (!r) continue
      if (link.a === part.id) {
        ex += r.fA.x
        ey += r.fA.y
      } else {
        ex += r.fB.x
        ey += r.fB.y
      }
    }
    let fx = 0
    let fy = 0
    if (part.force?.enabled && part.force.expr.trim()) {
      const F = evalForceExpr(part.force.expr, {
        x: body.position.x,
        y: body.position.y,
        vx: body.velocity.x * VEL_SCALE,
        vy: body.velocity.y * VEL_SCALE,
        t: timeRef.current,
        m: part.mass,
        g: params.gravity,
      })
      const th = (part.force.angle ?? 0) * DEG
      fx = Math.cos(th) * F
      fy = Math.sin(th) * F
    }
    const g = { x: 0, y: -part.mass * params.gravity }
    let normal: { x: number; y: number } | null = null
    if (part.onTrack) {
      const tr = params.parts.find((p) => p.id === part.onTrack)
      if (tr) {
        const th = (tr.angle ?? 0) * DEG
        normal = { x: -Math.sin(th), y: Math.cos(th) }
      }
    } else if (Math.abs(body.position.y - (MECH_GROUND_Y + part.size)) < 0.08) {
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
      friction = Math.max(-mu * n, Math.min(mu * n, -ft))
    }
    return { g, elastic: { x: ex, y: ey }, formula: { x: fx, y: fy }, normal, n, friction }
  }

  /** 单个部件：滑轮要画在绳下面（绳看起来才是绕过去的），所以抽成函数画两遍 */
  const renderPart = (part: MechPart) => {
        const [x, y] = screenOf(part)
        const st = posOf(part)
        // Matter 的 angle 已经是屏幕坐标（y 向下）下的角度，直接用；再取反会让轨道越转越斜
        const angle = (st.angle * 180) / Math.PI
        const r = Math.max(5, part.size * pxPerM)
        const sel = selectedId === part.id
        const linked = anchor === part.id
        return (
          <g
            key={part.id}
            data-part={part.id}
            data-kind={part.kind}
            style={{ cursor: pending ? 'crosshair' : 'grab' }}
            onPointerDown={(e) => downPart(e, part)}
            onPointerMove={movePart}
            onPointerUp={upPart}
            onPointerCancel={upPart}
          >
            {(sel || linked) &&
              (part.kind === 'track' ? (
                // 轨道是长条，用大圆框选会圈住半个屏幕，改成跟着轨道转的虚线框
                <g transform={`rotate(${angle.toFixed(2)} ${x} ${y})`} pointerEvents="none">
                  <rect
                    x={x - r - 6}
                    y={y - 14}
                    width={r * 2 + 12}
                    height={28}
                    rx={8}
                    fill="none"
                    stroke="#3d5a66"
                    strokeWidth={1.2}
                    strokeDasharray="5 4"
                    opacity={0.75}
                  />
                </g>
              ) : (
                <circle
                  cx={x}
                  cy={y}
                  r={r + 9}
                  fill="none"
                  stroke="#3d5a66"
                  strokeWidth={1.2}
                  strokeDasharray="5 4"
                  opacity={0.75}
                  pointerEvents="none"
                />
              ))}
            {part.kind === 'ball' && (
              <>
                <circle cx={x} cy={y} r={r + 10} fill="transparent" />
                <circle cx={x} cy={y} r={r} fill="#e7e3dc" stroke="#3d5a66" strokeWidth={1.3} />
                <circle cx={x - r * 0.3} cy={y - r * 0.32} r={r * 0.22} fill="#fbfaf7" opacity={0.8} />
              </>
            )}
            {part.kind === 'box' && (
              <>
                <rect
                  x={x - r - 10}
                  y={y - r - 10}
                  width={r * 2 + 20}
                  height={r * 2 + 20}
                  fill="transparent"
                />
                <g transform={`rotate(${angle.toFixed(2)} ${x} ${y})`}>
                  <rect
                    x={x - r}
                    y={y - r}
                    width={r * 2}
                    height={r * 2}
                    rx={3}
                    fill="#e9e5de"
                    stroke="#3d5a66"
                    strokeWidth={1.3}
                  />
                  <line
                    x1={x - r + 5}
                    y1={y - r + 5}
                    x2={x + r - 5}
                    y2={y + r - 5}
                    stroke="#cfc9c0"
                    strokeWidth={1}
                  />
                </g>
              </>
            )}
            {part.kind === 'anchor' && (
              <>
                <circle cx={x} cy={y} r={r + 10} fill="transparent" />
                <circle cx={x} cy={y} r={r} fill="#3d5a66" />
                <circle cx={x} cy={y} r={r * 0.38} fill="#fbfaf7" />
                {[-1, 0, 1].map((k) => (
                  <line
                    key={k}
                    x1={x}
                    y1={y + r}
                    x2={x + k * 9}
                    y2={y + r + 7}
                    stroke="#3d5a66"
                    strokeWidth={1.2}
                    strokeLinecap="round"
                  />
                ))}
              </>
            )}
            {part.kind === 'track' && (
              <>
                <g transform={`rotate(${angle.toFixed(2)} ${x} ${y})`}>
                  <rect
                    x={x - r}
                    y={y - 4}
                    width={r * 2}
                    height={8}
                    rx={3}
                    fill="#e6e2da"
                    stroke="#3d5a66"
                    strokeWidth={1.2}
                  />
                  {(() => {
                    const n = Math.max(3, Math.round(part.size * 4))
                    return Array.from({ length: n }, (_, i) => {
                      const hx = x - r + ((i + 0.5) / n) * r * 2
                      return (
                        <line
                          key={i}
                          x1={hx}
                          y1={y + 4}
                          x2={hx - 5}
                          y2={y + 10}
                          stroke="#cfc9c0"
                          strokeWidth={1}
                        />
                      )
                    })
                  })()}
                </g>
                <rect x={x - r - 6} y={y - 12} width={r * 2 + 12} height={24} fill="transparent" />
              </>
            )}
            {part.kind === 'pulley' && (
              <>
                <circle cx={x} cy={y} r={r + 10} fill="transparent" />
                <circle cx={x} cy={y} r={r} fill="#f4f1ea" stroke="#3d5a66" strokeWidth={1.4} />
                <circle cx={x} cy={y} r={r * 0.55} fill="#fbfaf7" stroke="#8b8a84" strokeWidth={1} />
                <circle cx={x} cy={y} r={2.4} fill="#3d5a66" />
                <line x1={x} y1={y - r} x2={x} y2={y - r - 10} stroke="#3d5a66" strokeWidth={1.4} />
              </>
            )}
            {part.kind === 'wheel' && (
              <>
                <circle cx={x} cy={y} r={r + 10} fill="transparent" />
                <g transform={`rotate(${angle.toFixed(2)} ${x} ${y})`}>
                  <circle cx={x} cy={y} r={r} fill="#eae6df" stroke="#3d5a66" strokeWidth={1.4} />
                  {[0, 45, 90, 135].map((a) => {
                    const rad = (a * Math.PI) / 180
                    const dx = Math.cos(rad) * (r - 3)
                    const dy = Math.sin(rad) * (r - 3)
                    return (
                      <line
                        key={a}
                        x1={x - dx}
                        y1={y - dy}
                        x2={x + dx}
                        y2={y + dy}
                        stroke="#b9b3a9"
                        strokeWidth={1.2}
                      />
                    )
                  })}
                  <circle cx={x} cy={y} r={4} fill="#3d5a66" />
                </g>
              </>
            )}
          </g>
        )

  }

  const groundY = toScreen([0, MECH_GROUND_Y])[1]
  const groundLeft = toScreen([-40, MECH_GROUND_Y])[0]
  const groundRight = toScreen([40, MECH_GROUND_Y])[0]
  const selPart = selectedId ? partById(selectedId) : undefined
  const selForce = selectedId ? forcesRef.current.get(selectedId) : undefined

  return (
    <g className={`mech ${pending ? 'mech--linking' : ''}`} data-mech="1" data-tick={tick}>
      {/* 地面 */}
      <line
        x1={groundLeft}
        y1={groundY}
        x2={groundRight}
        y2={groundY}
        stroke="#c9c4bc"
        strokeWidth={1.2}
      />
      {Array.from({ length: 120 }, (_, i) => {
        const x = groundLeft + ((groundRight - groundLeft) / 120) * i
        return (
          <line
            key={i}
            x1={x}
            y1={groundY}
            x2={x - 7}
            y2={groundY + 7}
            stroke="#ddd8d0"
            strokeWidth={0.8}
          />
        )
      })}

      {/* 连接件 */}
      {params.links.map((link) => {
        const a = partById(link.a)
        const b = partById(link.b)
        if (!a || !b) return null
        // 连接点：部件中心 + 随部件旋转的偏移（铰链在任意点铰接靠它）
        const paWorld = attachPoint(posOf(a), link.offsetA)
        const pbWorld = attachPoint(posOf(b), link.offsetB)
        const pa = toScreen([paWorld.x, paWorld.y])
        const pb = toScreen([pbWorld.x, pbWorld.y])
        const distM = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) / pxPerM
        const sel = selectedId === link.id
        const common = {
          fill: 'none',
          stroke: sel ? '#3d5a66' : '#8b8a84',
          strokeWidth: sel ? 2.4 : 1.6,
          strokeLinecap: 'round' as const,
          strokeLinejoin: 'round' as const,
        }
        const vias = linkVias(link)
          .map((id) => partById(id))
          .filter((p): p is MechPart => !!p)
        // 绳依次绕过的拐点：每个滑轮取「两段方向角平分线的反方向」上的外缘点
        const route: [number, number][] = [pa]
        vias.forEach((pulley, i) => {
          const pp = screenOf(pulley)
          const prev = i === 0 ? pa : screenOf(vias[i - 1])
          const next = i === vias.length - 1 ? pb : screenOf(vias[i + 1])
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
        return (
          <g
            key={link.id}
            style={{ cursor: 'pointer' }}
            onPointerDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
              onSelect(link.id, 'link')
            }}
          >
            {link.kind === 'spring' && (
              <path
                d={springPath(pa, pb, Math.max(4, Math.min(14, Math.round(link.rest / 0.22))), 7)}
                {...common}
                data-link={link.id}
                data-kind="spring"
              />
            )}
            {link.kind === 'rope' && vias.length === 0 && (
              <path
                d={ropePath(pa, pb, Math.max(0, (link.rest - distM) * pxPerM * 0.55))}
                {...common}
                data-link={link.id}
                data-kind="rope"
              />
            )}
            {link.kind === 'rope' && vias.length > 0 && (
              <polyline
                points={route.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}
                {...common}
                data-link={link.id}
                data-kind="rope"
              />
            )}
            {link.kind === 'rod' && (
              <g data-link={link.id} data-kind="rod">
                <line
                  x1={pa[0]}
                  y1={pa[1]}
                  x2={pb[0]}
                  y2={pb[1]}
                  stroke={sel ? '#3d5a66' : '#6f6d67'}
                  strokeWidth={sel ? 5 : 4}
                  strokeLinecap="round"
                />
                <line
                  x1={pa[0]}
                  y1={pa[1]}
                  x2={pb[0]}
                  y2={pb[1]}
                  stroke="#fbfaf7"
                  strokeWidth={1.2}
                  strokeLinecap="round"
                  opacity={0.7}
                />
              </g>
            )}
            {link.kind === 'hinge' && (
              <g data-link={link.id} data-kind="hinge">
                {(pa[0] !== pb[0] || pa[1] !== pb[1]) && (
                  <line
                    x1={pa[0]}
                    y1={pa[1]}
                    x2={pb[0]}
                    y2={pb[1]}
                    stroke={sel ? '#3d5a66' : '#8b8a84'}
                    strokeWidth={1.2}
                    strokeDasharray="4 3"
                  />
                )}
                <circle
                  cx={(pa[0] + pb[0]) / 2}
                  cy={(pa[1] + pb[1]) / 2}
                  r={5.5}
                  fill="#fbfaf7"
                  stroke={sel ? '#3d5a66' : '#5c5a56'}
                  strokeWidth={1.6}
                />
                <circle cx={(pa[0] + pb[0]) / 2} cy={(pa[1] + pb[1]) / 2} r={1.8} fill="#3d5a66" />
              </g>
            )}
            {/* 命中区：细线太难点，盖一条透明的粗线 */}
            <polyline
              points={route.map((p) => `${p[0]},${p[1]}`).join(' ')}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
            />
          </g>
        )
      })}

      {/* 滑轮先画：绳压在滑轮上，看起来才像「绕过去」 */}
      {params.parts.filter((p) => p.kind === 'pulley').map(renderPart)}

      {/* 部件 */}
      {params.parts.filter((p) => p.kind !== 'pulley').map(renderPart)}


      {/* 速度 / 受力箭头 */}
      {vectors && (
        <g data-vectors="1">
          {params.parts.map((part) => {
            if (isStaticPart(part)) return null
            const [x, y] = screenOf(part)
            const st = posOf(part)
            const speed = Math.hypot(st.vx, st.vy)
            if (speed < 0.15) return null
            const k = Math.min(48, speed * 12) / (speed || 1)
            return (
              <Arrow
                key={`v-${part.id}`}
                x={x}
                y={y}
                dx={st.vx * k}
                dy={-st.vy * k}
                color="#4f8a3d"
                label={`v ${speed.toFixed(1)}`}
              />
            )
          })}
          {selPart && !isStaticPart(selPart) && decompose && (() => {
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
              return (
                <Arrow key={label} x={x} y={y} dx={vx * k} dy={-vy * k} color={color} label={`${label} ${m.toFixed(1)}`} />
              )
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
          {selPart && !isStaticPart(selPart) && !decompose && selForce && (() => {
            const [x, y] = screenOf(selPart)
            const mag = Math.hypot(selForce.x, selForce.y)
            if (mag < 0.2) return null
            const k = Math.min(60, mag * 2.2) / mag
            return (
              <Arrow
                x={x}
                y={y}
                dx={selForce.x * k}
                dy={-selForce.y * k}
                color="#3d5a66"
                label={`F合力 ${mag.toFixed(1)} N`}
              />
            )
          })()}
        </g>
      )}
    </g>
  )
}
