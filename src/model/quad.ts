import type { SketchDoc, SketchPolygon } from '../kernel/types'

/**
 * 四边形「锁定纵横比」的几何规则。
 *
 * 拖动任一顶点时，把对角顶点当锚点（不动），另外两个顶点重算成矩形：
 * 已知角点 D、对角 A，矩形必然满足「D→A 分解成两条互相垂直的边」，
 * 两边的比例定死，就只剩镜像两个解，取离原来顶点更近的那个。
 */

export interface QuadMove {
  id: string
  x: number
  y: number
}

const EPS = 1e-6
const MIN_RATIO = 0.05
const MAX_RATIO = 20

interface P {
  x: number
  y: number
}

/**
 * 由「被拖动的角点 D + 固定的对角 A」反算另外两个顶点。
 * ratio = |D→N1| / |N1→A|（宽 / 高）。
 */
export function quadCorners(
  D: P,
  A: P,
  ratio: number,
  curN1: P,
): { n1: P; n2: P } | null {
  const tx = A.x - D.x
  const ty = A.y - D.y
  const len = Math.hypot(tx, ty)
  if (len < EPS) return null
  const r = Math.max(MIN_RATIO, Math.min(MAX_RATIO, ratio || 1))
  // 对角线与「宽」边的夹角
  const gamma = Math.atan(1 / r)
  const cg = Math.cos(gamma)

  const build = (sign: number) => {
    const c = Math.cos(sign * gamma)
    const s = Math.sin(sign * gamma)
    // a：沿宽边的分量（长度 = |t|·cosγ）；b：沿高边的分量（t - a，必然垂直）
    const ax = (tx * c - ty * s) * cg
    const ay = (tx * s + ty * c) * cg
    return {
      n1: { x: D.x + ax, y: D.y + ay },
      n2: { x: D.x + (tx - ax), y: D.y + (ty - ay) },
    }
  }
  const p = build(1)
  const m = build(-1)
  const d1 = Math.hypot(p.n1.x - curN1.x, p.n1.y - curN1.y)
  const d2 = Math.hypot(m.n1.x - curN1.x, m.n1.y - curN1.y)
  return d1 <= d2 ? p : m
}

/** 这个点是不是某个「锁了纵横比的四边形」的顶点 */
export function lockedQuadOf(
  doc: SketchDoc,
  pointId: string,
): { poly: SketchPolygon; index: number } | null {
  for (const poly of doc.polygons) {
    if (!poly.ratio || poly.points.length !== 4) continue
    const index = poly.points.indexOf(pointId)
    if (index >= 0) return { poly, index }
  }
  return null
}

const findPoint = (doc: SketchDoc, id: string): P | null =>
  doc.points.find((p) => p.id === id) ?? null

/** 拖动第 index 个顶点到 drag：返回另外两个顶点的新坐标 */
export function quadDragMoves(
  doc: SketchDoc,
  poly: SketchPolygon,
  index: number,
  drag: P,
): QuadMove[] | null {
  const ratio = poly.ratio
  if (!ratio || poly.points.length !== 4) return null
  const A = findPoint(doc, poly.points[(index + 2) % 4])
  const curN1 = findPoint(doc, poly.points[(index + 1) % 4])
  if (!A || !curN1) return null
  // ratio 固定按 |P0P1| / |P1P2| 定义；拖奇数号顶点时，D→N1 正好是「高」那条边，取倒数
  const eff = index % 2 === 0 ? ratio : 1 / ratio
  const res = quadCorners(drag, A, eff, curN1)
  if (!res) return null
  return [
    { id: poly.points[(index + 1) % 4], x: res.n1.x, y: res.n1.y },
    { id: poly.points[(index + 3) % 4], x: res.n2.x, y: res.n2.y },
  ]
}

/** 改宽高比：对角 P0–P2 不动，重算 P1 / P3 */
export function quadFitMoves(doc: SketchDoc, poly: SketchPolygon, ratio: number): QuadMove[] | null {
  if (poly.points.length !== 4) return null
  const D = findPoint(doc, poly.points[0])
  const A = findPoint(doc, poly.points[2])
  const curN1 = findPoint(doc, poly.points[1])
  if (!D || !A || !curN1) return null
  const res = quadCorners(D, A, ratio, curN1)
  if (!res) return null
  return [
    { id: poly.points[1], x: res.n1.x, y: res.n1.y },
    { id: poly.points[3], x: res.n2.x, y: res.n2.y },
  ]
}

/** 当前宽高比（按 P0→P1 为宽） */
export function quadAspect(doc: SketchDoc, poly: SketchPolygon): number | null {
  if (poly.points.length !== 4) return null
  const p0 = findPoint(doc, poly.points[0])
  const p1 = findPoint(doc, poly.points[1])
  const p2 = findPoint(doc, poly.points[2])
  if (!p0 || !p1 || !p2) return null
  const w = Math.hypot(p1.x - p0.x, p1.y - p0.y)
  const h = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  if (h < EPS) return null
  return w / h
}
