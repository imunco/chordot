import type { CircleObj, GeoObj, LineObj, PointObj, PolygonObj } from './types'

export interface Pt2 {
  x: number
  y: number
}

export type Annotation =
  | { kind: 'distance'; a: Pt2; b: Pt2; text: string }
  | { kind: 'angle'; a: Pt2; v: Pt2; c: Pt2; text: string }
  | { kind: 'area'; points: Pt2[]; text: string; center: Pt2 }
  | { kind: 'circle'; center: Pt2; r: number; text: string }

export interface MeasureRow {
  label: string
  value: string
}

export interface MeasureResult {
  rows: MeasureRow[]
  annotation: Annotation | null
}

/** 1 个世界单位 = 1 cm（与画布标尺一致） */
let UNIT = 'cm'

const fmt = (v: number) => v.toFixed(2)

function centroid(points: Pt2[]): Pt2 {
  const x = points.reduce((s, p) => s + p.x, 0) / points.length
  const y = points.reduce((s, p) => s + p.y, 0) / points.length
  return { x, y }
}

function polygonArea(points: Pt2[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

function perimeter(points: Pt2[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    sum += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return sum
}

function angleAt(v: Pt2, a: Pt2, c: Pt2): number {
  const u = { x: a.x - v.x, y: a.y - v.y }
  const w = { x: c.x - v.x, y: c.y - v.y }
  const cos = (u.x * w.x + u.y * w.y) / (Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y) || 1)
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI
}

/** 依据当前选择计算测量值；不满足条件时返回 null */
export function measure(
  objects: GeoObj[],
  selected: string[],
  angleUnit: 'deg' | 'rad' = 'deg',
  unit: 'cm' | 'm' = 'cm',
): MeasureResult | null {
  // 物理场景按米算，数学场景按厘米算
  UNIT = unit
  const picked = selected
    .map((id) => objects.find((o) => o.id === id))
    .filter((o): o is GeoObj => !!o)

  // 两点 → 距离
  if (picked.length === 2 && picked.every((o) => o.kind === 'point')) {
    const [p, q] = picked as PointObj[]
    const d = Math.hypot(q.x - p.x, q.y - p.y)
    return {
      rows: [
        { label: '距离', value: `${fmt(d)} ${UNIT}` },
        { label: 'Δx', value: `${fmt(Math.abs(q.x - p.x))} ${UNIT}` },
        { label: 'Δy', value: `${fmt(Math.abs(q.y - p.y))} ${UNIT}` },
      ],
      annotation: { kind: 'distance', a: { x: p.x, y: p.y }, b: { x: q.x, y: q.y }, text: `${fmt(d)} ${UNIT}` },
    }
  }

  // 三点 → 以第二个点为顶点的夹角
  if (picked.length === 3 && picked.every((o) => o.kind === 'point')) {
    const [a, v, c] = picked as PointObj[]
    const deg = angleAt(v, a, c)
    const shown =
      angleUnit === 'rad' ? `${((deg * Math.PI) / 180).toFixed(3)} rad` : `${deg.toFixed(1)}°`
    return {
      rows: [
        { label: '角度', value: shown },
        { label: '顶点', value: v.name },
      ],
      annotation: {
        kind: 'angle',
        a: { x: a.x, y: a.y },
        v: { x: v.x, y: v.y },
        c: { x: c.x, y: c.y },
        text: angleUnit === 'rad' ? `${((deg * Math.PI) / 180).toFixed(2)}` : `${deg.toFixed(1)}°`,
      },
    }
  }

  if (picked.length !== 1) return null
  const one = picked[0]

  if (one.kind === 'line') {
    const l = one as LineObj
    const d = Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1])
    return {
      rows: [{ label: '长度', value: `${fmt(d)} ${UNIT}` }],
      annotation: {
        kind: 'distance',
        a: { x: l.a[0], y: l.a[1] },
        b: { x: l.b[0], y: l.b[1] },
        text: `${fmt(d)} ${UNIT}`,
      },
    }
  }

  if (one.kind === 'circle') {
    const c = one as CircleObj
    const area = Math.PI * c.r * c.r
    return {
      rows: [
        { label: '半径', value: `${fmt(c.r)} ${UNIT}` },
        { label: '周长', value: `${fmt(2 * Math.PI * c.r)} ${UNIT}` },
        { label: '面积', value: `${fmt(area)} ${UNIT}²` },
      ],
      annotation: {
        kind: 'circle',
        center: { x: c.center[0], y: c.center[1] },
        r: c.r,
        text: `r = ${fmt(c.r)}`,
      },
    }
  }

  if (one.kind === 'polygon') {
    const g = one as PolygonObj
    const pts = g.points.map((p) => ({ x: p[0], y: p[1] }))
    const area = polygonArea(pts)
    const per = perimeter(pts)
    return {
      rows: [
        { label: '面积', value: `${fmt(area)} ${UNIT}²` },
        { label: '周长', value: `${fmt(per)} ${UNIT}` },
        { label: '顶点数', value: `${pts.length}` },
      ],
      annotation: { kind: 'area', points: pts, text: `${fmt(area)} ${UNIT}²`, center: centroid(pts) },
    }
  }

  return null
}
