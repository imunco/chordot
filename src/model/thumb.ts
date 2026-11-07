import { sampleFunction } from '../kernel/scene'
import type { SceneSpec } from '../kernel/types'
import { projectSolid } from './solid'

export type Pt2 = [number, number]

export type ThumbPrim =
  | { t: 'line'; a: Pt2; b: Pt2; faint?: boolean }
  | { t: 'poly'; pts: Pt2[]; fill?: boolean }
  | { t: 'circle'; c: Pt2; r: number }
  | { t: 'path'; pts: Pt2[]; dashed?: boolean }
  | { t: 'dot'; p: Pt2 }

export const THUMB_W = 84
export const THUMB_H = 58
const PAD = 6

/** 缩略图里忽略的极端值：函数的渐近支会把整体缩放压扁 */
const Y_LIMIT = 9

type Raw = ThumbPrim

function pushLine(out: Raw[], a: Pt2, b: Pt2, faint = false) {
  out.push({ t: 'line', a, b, faint })
}

function inclineRaw(scene: Extract<SceneSpec, { kind: 'incline' }>): Raw[] {
  const p = scene.params
  const rad = (p.angleDeg * Math.PI) / 180
  const len = 6
  const out: Raw[] = []
  pushLine(out, [-7, 0], [7, 0], true)
  const ax = -3.4
  const bx = ax + Math.cos(rad) * len
  const by = Math.sin(rad) * len
  pushLine(out, [ax, 0], [bx, by])
  // 物块贴在斜面中段
  const t = 0.55
  const cx = ax + (bx - ax) * t
  const cy = by * t
  const w = 0.62
  const h = 0.42
  const ux = Math.cos(rad)
  const uy = Math.sin(rad)
  const nx = -uy
  const ny = ux
  const pts: Pt2[] = [
    [cx - ux * w + nx * h, cy - uy * w + ny * h],
    [cx + ux * w + nx * h, cy + uy * w + ny * h],
    [cx + ux * w, cy + uy * w],
    [cx - ux * w, cy - uy * w],
  ]
  out.push({ t: 'poly', pts, fill: true })
  return out
}

function triangleRaw(scene: Extract<SceneSpec, { kind: 'triangle' }>): Raw[] {
  const pts = scene.params.points.map((p) => [p.x, p.y] as Pt2)
  return [{ t: 'poly', pts, fill: true }]
}

function sketchRaw(scene: Extract<SceneSpec, { kind: 'sketch' }>): Raw[] {
  const doc = scene.doc
  const out: Raw[] = []
  const at = (id: string): Pt2 | null => {
    const p = doc.points.find((q) => q.id === id)
    return p ? [p.x, p.y] : null
  }

  for (const s of doc.segments) {
    const a = at(s.a)
    const b = at(s.b)
    if (a && b) pushLine(out, a, b)
  }
  for (const g of doc.polygons) {
    const pts = g.points.map(at).filter((p): p is Pt2 => p !== null)
    if (pts.length >= 3) out.push({ t: 'poly', pts, fill: true })
  }
  for (const c of doc.circles) {
    const center = at(c.c)
    if (center) out.push({ t: 'circle', c: center, r: c.r })
  }
  for (const f of doc.functions) {
    const { curves } = sampleFunction(f.expr)
    for (const line of curves) {
      let run: Pt2[] = []
      for (const p of line) {
        if (!Number.isFinite(p.y) || Math.abs(p.y) > Y_LIMIT) {
          if (run.length > 1) out.push({ t: 'path', pts: run })
          run = []
          continue
        }
        run.push([p.x, p.y])
      }
      if (run.length > 1) out.push({ t: 'path', pts: run })
    }
  }
  return out
}

function solidRaw(scene: Extract<SceneSpec, { kind: 'solid' }>): Raw[] {
  const out: Raw[] = []
  const cam = scene.params.camera
  for (const shape of scene.params.shapes) {
    const view = projectSolid(shape, cam, (p) => [p[0], -p[1]])
    for (const f of view.faces) {
      out.push({ t: 'poly', pts: f.points, fill: true })
    }
    for (const e of view.edges) {
      pushLine(out, e.a, e.b)
    }
  }
  return out
}

function motionRaw(scene: Extract<SceneSpec, { kind: 'motion' }>): Raw[] {
  const p = scene.params
  const out: Raw[] = []
  if (p.model === 'pendulum') {
    const th = (p.angle0 * Math.PI) / 180
    const px = 0
    const py = p.length
    const bx = px + p.length * Math.sin(th)
    const by = py - p.length * Math.cos(th)
    out.push({ t: 'path', pts: [[px, py], [bx, by]] })
    out.push({ t: 'dot', p: [px, py] })
    out.push({ t: 'dot', p: [bx, by] })
    // 摆动弧线
    const arc: Pt2[] = []
    for (let i = 0; i <= 24; i++) {
      const a = -th + (2 * th * i) / 24
      arc.push([px + p.length * Math.sin(a), py - p.length * Math.cos(a)])
    }
    out.push({ t: 'path', pts: arc, dashed: true })
    return out
  }

  if (p.model === 'spring') {
    const wallX = -3.2
    const bx = p.amplitude
    out.push({ t: 'path', pts: [[wallX, -1], [wallX, 1]] })
    const coil: Pt2[] = [[wallX, 0]]
    const n = 12
    for (let i = 1; i < n; i++) {
      const t = i / n
      coil.push([wallX + (bx - 0.5 - wallX) * t, i % 2 === 0 ? -0.3 : 0.3])
    }
    coil.push([bx - 0.5, 0])
    out.push({ t: 'path', pts: coil })
    out.push({
      t: 'poly',
      pts: [
        [bx - 0.5, -0.45],
        [bx + 0.5, -0.45],
        [bx + 0.5, 0.45],
        [bx - 0.5, 0.45],
      ],
      fill: true,
    })
    return out
  }

  // 抛体：抛物线
  const g = p.gravity
  const rad = (p.launch * Math.PI) / 180
  const vx = p.speed * Math.cos(rad)
  const vy = p.speed * Math.sin(rad)
  const tEnd = (vy + Math.sqrt(vy * vy + 2 * g * p.height)) / g
  const arc: Pt2[] = []
  const x0 = -5
  for (let i = 0; i <= 32; i++) {
    const t = (tEnd * i) / 32
    arc.push([x0 + vx * t, p.height + vy * t - 0.5 * g * t * t])
  }
  pushLine(out, [-6.5, 0], [7, 0], true)
  out.push({ t: 'path', pts: arc, dashed: true })
  out.push({ t: 'dot', p: [x0, p.height] })
  return out
}

/** 三维斜面缩略图：画一个楔形 + 斜面上的小方块 */
function incline3dRaw(scene: Extract<SceneSpec, { kind: 'solidIncline' }>): Raw[] {
  const { angleDeg } = scene.params
  const theta = (Math.max(1, Math.min(80, angleDeg)) * Math.PI) / 180
  const w = 5
  const d = 5
  const h = d * Math.tan(theta)
  return [
    { t: 'poly', pts: [[-w / 2, 0], [w / 2, 0], [w / 2, h]], fill: true },
    {
      t: 'poly',
      pts: [
        [-w / 2 + 0.9, h * 0.35],
        [-w / 2 + 1.6, h * 0.35 + 0.9],
        [-w / 2 + 2.2, h * 0.35 + 0.45],
        [-w / 2 + 1.5, h * 0.35 - 0.45],
      ],
      fill: true,
    },
  ]
}

function rawFor(scene: SceneSpec): Raw[] {
  switch (scene.kind) {
    case 'incline':
      return inclineRaw(scene)
    case 'triangle':
      return triangleRaw(scene)
    case 'solid':
      return solidRaw(scene)
    case 'solidIncline':
      return incline3dRaw(scene)
    case 'motion':
      return motionRaw(scene)
    case 'mech':
      // 机构没有「作者数据」可压成缩略图，用空图占位，模板卡显示名称即可
      return []
    default:
      return sketchRaw(scene)
  }
}

/** 把场景压成一组缩略图图元；不跑求解器，只读作者数据 */
export function thumbnail(scene: SceneSpec): ThumbPrim[] {
  const raw = rawFor(scene)
  if (raw.length === 0) return []

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  const grow = (x: number, y: number) => {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  for (const r of raw) {
    if (r.t === 'line') {
      grow(r.a[0], r.a[1])
      grow(r.b[0], r.b[1])
    } else if (r.t === 'circle') {
      grow(r.c[0] - r.r, r.c[1] - r.r)
      grow(r.c[0] + r.r, r.c[1] + r.r)
    } else if (r.t === 'dot') {
      grow(r.p[0], r.p[1])
    } else {
      for (const p of r.pts) grow(p[0], p[1])
    }
  }
  if (!Number.isFinite(minX)) return []

  const w = Math.max(maxX - minX, 1e-3)
  const h = Math.max(maxY - minY, 1e-3)
  const k = Math.min((THUMB_W - PAD * 2) / w, (THUMB_H - PAD * 2) / h)
  const ox = (THUMB_W - w * k) / 2 - minX * k
  const oy = (THUMB_H - h * k) / 2 - minY * k
  const map = (p: Pt2): Pt2 => [p[0] * k + ox, THUMB_H - (p[1] * k + oy)]

  return raw.map((r): ThumbPrim => {
    if (r.t === 'line') return { ...r, a: map(r.a), b: map(r.b) }
    if (r.t === 'circle') return { t: 'circle', c: map(r.c), r: r.r * k }
    if (r.t === 'dot') return { t: 'dot', p: map(r.p) }
    return { ...r, pts: r.pts.map(map) }
  })
}
