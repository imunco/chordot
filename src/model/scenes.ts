import { INCLINE } from '../kernel/scene'
import { BLOCK_Y, PIVOT, WALL_X } from '../kernel/motion'
import { evalForce } from './force'
import { CURVE_COLORS } from './palette'
import type { SceneSpec, SimState, Solution } from '../kernel/types'
import type { ForceObj, GeoObj, PointObj } from './types'

export interface Overrides {
  hidden: Record<string, boolean>
  names: Record<string, string>
  /** 变力预览的自变量取值（恒力忽略） */
  preview?: number
}

const ACCENT = '#3d5a66'

function point(id: string, name: string, x: number, y: number, parentId?: string, draggable = false): PointObj {
  return { id, kind: 'point', name, color: ACCENT, visible: true, parentId, x, y, draggable }
}

function inclineObjects(scene: Extract<SceneSpec, { kind: 'incline' }>, solution: Solution): GeoObj[] {
  const p = solution.points
  const st = solution.statics
  // 力方向以解算结果为准，避免拖动中 scene 已更新、solution 尚未回包时出现一帧错位
  const angleDeg = st?.angleDeg ?? scene.params.angleDeg
  const center = p.P

  const gravity: ForceObj = {
    id: 'F_G',
    kind: 'force',
    name: 'G',
    color: '#3a3a38',
    visible: true,
    parentId: 'blk',
    forceType: 'gravity',
    magnitude: st?.gravity ?? scene.params.mass * INCLINE.g,
    angle: -90,
    at: [center.x, center.y],
    constrained: true,
    directionLabel: '竖直向下',
    origin: `由质量 ${scene.params.mass} kg 决定`,
  }

  const normal: ForceObj = {
    id: 'F_N',
    kind: 'force',
    name: 'N',
    color: '#4a6b8a',
    visible: true,
    parentId: 'blk',
    forceType: 'normal',
    magnitude: st?.normal ?? 0,
    angle: 90 + angleDeg,
    at: [center.x, center.y],
    constrained: true,
    directionLabel: `垂直斜面向上（倾角 ${angleDeg.toFixed(0)}°）`,
    origin: '垂直于接触面，由平衡条件确定',
  }

  const friction: ForceObj = {
    id: 'F_f',
    kind: 'force',
    name: 'f',
    color: '#9a5b4a',
    visible: true,
    parentId: 'blk',
    forceType: 'friction',
    magnitude: st?.friction ?? 0,
    angle: angleDeg,
    at: [center.x, center.y],
    constrained: true,
    directionLabel: st?.sliding ? '沿斜面向上（已达摩擦上限）' : '沿斜面向上',
    origin: st?.sliding
      ? `已达最大静摩擦 μN = ${(scene.params.mu * (st?.normal ?? 0)).toFixed(1)} N`
      : '沿接触面，由平衡条件确定',
  }

  // 接触面光滑（μ=0）时不存在摩擦力，别画一根 0 N 的箭头
  const hasFriction = (scene.params.mu ?? 0) > 1e-6 && (st?.friction ?? 0) > 1e-6

  return [
    {
      id: 'gnd',
      kind: 'line',
      name: '地面',
      color: '#9e9a94',
      visible: true,
      a: [-7, 0],
      b: [7, 0],
    },
    {
      id: 'inc',
      kind: 'line',
      name: '斜面 AB',
      color: ACCENT,
      visible: true,
      a: [p.A.x, p.A.y],
      b: [p.B.x, p.B.y],
    },
    point('A', 'A', p.A.x, p.A.y, 'inc'),
    point('B', 'B', p.B.x, p.B.y, 'inc', true),
    {
      id: 'blk',
      kind: 'polygon',
      name: '物块 m',
      color: ACCENT,
      visible: true,
      points: [
        [p.c1.x, p.c1.y],
        [p.c2.x, p.c2.y],
        [p.c3.x, p.c3.y],
        [p.c4.x, p.c4.y],
      ],
    },
    gravity,
    normal,
    ...(hasFriction ? [friction] : []),
  ]
}

function triangleObjects(scene: Extract<SceneSpec, { kind: 'triangle' }>, solution: Solution): GeoObj[] {
  const pts = scene.params.points.map((p) => {
    const s = solution.points[p.id]
    return s ? { id: p.id, x: s.x, y: s.y } : p
  })
  return [
    {
      id: 'tri',
      kind: 'polygon',
      name: '三角形 ABC',
      color: ACCENT,
      visible: true,
      points: pts.map((p) => [p.x, p.y] as [number, number]),
    },
    ...pts.map((p) => point(p.id, p.id, p.x, p.y, 'tri', true)),
  ]
}

export interface SketchBuilder {
  id: string
  /** 该对象依赖的点 id；点坐标不变时对象不需要重建 */
  deps: string[]
  make: () => GeoObj
}

/** 草图对象拆成「按 id 可单独重建」的构造器，供依赖图做增量重算 */
export function sketchBuilders(
  doc: Extract<SceneSpec, { kind: 'sketch' }>['doc'],
  solution: Solution,
  preview = 0,
): SketchBuilder[] {
  // 优先读解算结果（有约束时由 planegcs 给出），无解时回落到文档坐标
  const at = (id: string): [number, number] | null => {
    const solved = solution.points[id]
    if (solved) return [solved.x, solved.y]
    const p = doc.points.find((q) => q.id === id)
    return p ? [p.x, p.y] : null
  }
  const nameOf = (id: string) => doc.points.find((p) => p.id === id)?.name ?? id
  const out: SketchBuilder[] = []

  for (const p of doc.points) {
    const pos = at(p.id)
    if (!pos) continue
    out.push({
      id: p.id,
      deps: [p.id],
      make: () => point(p.id, p.name ?? p.id, pos[0], pos[1], undefined, !p.fixed),
    })
  }

  for (const s of doc.segments) {
    const a = at(s.a)
    const b = at(s.b)
    if (!a || !b) continue
    out.push({
      id: s.id,
      deps: [s.a, s.b],
      make: () => ({
        id: s.id,
        kind: 'line' as const,
        name: `${nameOf(s.a)}${nameOf(s.b)}`,
        color: ACCENT,
        visible: true,
        a,
        b,
        anchorIds: [s.a, s.b],
      }),
    })
  }

  for (const c of doc.circles) {
    const center = at(c.c)
    if (!center) continue
    out.push({
      id: c.id,
      deps: [c.c],
      make: () => ({
        id: c.id,
        kind: 'circle' as const,
        name: `⊙${nameOf(c.c)}`,
        color: ACCENT,
        visible: true,
        center,
        r: c.r,
        anchorIds: [c.c],
      }),
    })
  }

  for (const g of doc.polygons) {
    const pts = g.points.map(at).filter((p): p is [number, number] => p !== null)
    if (pts.length < 3) continue
    out.push({
      id: g.id,
      deps: [...g.points],
      make: () => ({
        id: g.id,
        kind: 'polygon' as const,
        name: `多边形 ${g.points.map(nameOf).join('')}`,
        color: ACCENT,
        visible: true,
        points: pts,
        anchorIds: [...g.points],
      }),
    })
  }

  doc.functions.forEach((f, index) => {
    out.push({
      id: f.id,
      // 函数曲线的采样结果随解算变化，不参与点依赖复用
      deps: [],
      make: () => ({
        id: f.id,
        kind: 'function' as const,
        name: f.name ?? f.id,
        color: f.color ?? CURVE_COLORS[index % CURVE_COLORS.length],
        visible: true,
        expr: f.expr,
        curves: (solution.curves?.[f.id] ?? []).map((line) =>
          line.map((p) => [p.x, p.y] as [number, number]),
        ),
        error: solution.errors?.[f.id],
      }),
    })
  })

  for (const f of doc.forces ?? []) {
    const { value, error } = evalForce(f.expr, f.kind, preview)
    out.push({
      id: f.id,
      deps: [],
      make: () => ({
        id: f.id,
        kind: 'force' as const,
        name: f.name,
        color: '#7a5c8a',
        visible: true,
        forceType: 'external' as const,
        magnitude: Math.max(0, value),
        angle: f.angle,
        at: [f.at[0], f.at[1]],
        constrained: false,
        directionLabel:
          f.kind === 'constant'
            ? `${f.angle.toFixed(0)}° 方向，大小恒定`
            : `${f.angle.toFixed(0)}° 方向，大小随${f.kind === 'time' ? '时间' : '位移'}变化`,
        origin: f.kind === 'constant' ? `F = ${f.expr}` : `F(${f.kind === 'time' ? 't' : 'x'}) = ${f.expr}`,
        expr: f.expr,
        forceKind: f.kind,
        error,
      }),
    })
  }

  return out
}

function sketchObjects(
  scene: Extract<SceneSpec, { kind: 'sketch' }>,
  solution: Solution,
  preview = 0,
): GeoObj[] {
  return sketchBuilders(scene.doc, solution, preview).map((b) => b.make())
}

function solidObjects(scene: Extract<SceneSpec, { kind: 'solid' }>): GeoObj[] {
  return scene.params.shapes.map((shape) => ({
    id: shape.id,
    kind: 'solid' as const,
    name: shape.name,
    color: ACCENT,
    visible: true,
    shape,
  }))
}

function zigzag(x0: number, x1: number, y: number): [number, number][] {
  const pts: [number, number][] = [[x0, y]]
  const n = 16
  const span = x1 - x0
  if (Math.abs(span) < 0.4) return [[x0, y], [x1, y]]
  for (let i = 1; i < n; i++) {
    const t = i / n
    pts.push([x0 + span * t, y + (i % 2 === 0 ? -0.16 : 0.16)])
  }
  pts.push([x1, y])
  return pts
}

function motionObjects(
  scene: Extract<SceneSpec, { kind: 'motion' }>,
  sim: SimState | null,
): GeoObj[] {
  const p = scene.params
  const out: GeoObj[] = []
  const trail = sim?.trail && sim.trail.length > 1
    ? [{ id: 'trail', kind: 'polyline' as const, name: '轨迹', color: '#9E9A94', visible: true, points: sim.trail, dashed: true }]
    : []

  if (p.model === 'pendulum') {
    const th = sim?.theta ?? (p.angle0 * Math.PI) / 180
    const bob = sim
      ? { x: sim.x, y: sim.y ?? 0 }
      : { x: PIVOT.x + p.length * Math.sin(th), y: PIVOT.y - p.length * Math.cos(th) }
    out.push(...trail)
    out.push({
      id: 'rod',
      kind: 'line',
      name: '摆线',
      color: ACCENT,
      visible: true,
      a: [PIVOT.x, PIVOT.y],
      b: [bob.x, bob.y],
    })
    out.push(point('pivot', '悬点', PIVOT.x, PIVOT.y))
    out.push(point('bob', '摆球', bob.x, bob.y))
    return out
  }

  if (p.model === 'spring') {
    const bx = sim ? sim.x : p.amplitude
    out.push(...trail)
    out.push({
      id: 'wall',
      kind: 'line',
      name: '墙',
      color: '#9E9A94',
      visible: true,
      a: [WALL_X, BLOCK_Y - 0.9],
      b: [WALL_X, BLOCK_Y + 1.1],
    })
    out.push({
      id: 'spring',
      kind: 'polyline',
      name: '弹簧',
      color: ACCENT,
      visible: true,
      points: zigzag(WALL_X, bx - 0.45, BLOCK_Y),
    })
    out.push({
      id: 'block',
      kind: 'polygon',
      name: '滑块',
      color: ACCENT,
      visible: true,
      points: [
        [bx - 0.45, BLOCK_Y - 0.45],
        [bx + 0.45, BLOCK_Y - 0.45],
        [bx + 0.45, BLOCK_Y + 0.45],
        [bx - 0.45, BLOCK_Y + 0.45],
      ],
    })
    return out
  }

  const pos = sim ? { x: sim.x, y: sim.y ?? 0 } : { x: -5, y: p.height }
  out.push({
    id: 'ground',
    kind: 'line',
    name: '地面',
    color: '#9E9A94',
    visible: true,
    a: [-6.5, 0],
    b: [7, 0],
  })
  out.push(...trail)
  out.push(point('ball', '小球', pos.x, pos.y))
  return out
}

export function buildObjects(
  scene: SceneSpec,
  solution: Solution,
  overrides: Overrides,
  sim: SimState | null = null,
): GeoObj[] {
  const base =
    scene.kind === 'incline'
      ? inclineObjects(scene, solution)
      : scene.kind === 'triangle'
        ? triangleObjects(scene, solution)
        : scene.kind === 'solid'
          ? solidObjects(scene)
          : scene.kind === 'solidIncline'
            ? []
            : scene.kind === 'motion'
            ? motionObjects(scene, sim)
            : sketchObjects(scene, solution, overrides.preview ?? 0)
  return base.map((o) => ({
    ...o,
    name: overrides.names[o.id] ?? o.name,
    // 父对象被隐藏时子对象（力、轨迹…）一起隐藏，否则会出现「物块没了、力还挂着」
    visible:
      overrides.hidden[o.id] || (o.parentId && overrides.hidden[o.parentId]) ? false : o.visible,
  }))
}
