/**
 * 点标签避让。
 *
 * 一堆点挤在一起时，固定偏移的标签会叠成一团糊。这里按「候选位置优先级 + 贪心」
 * 给每个标签找第一个不与已占区域相交的位置：默认右上，不行就右下、左上、左下、正上、正下、右侧、左侧。
 * 视觉上标签始终贴着对应的点，不会被甩到画面另一头。
 */

export type LabelAnchor = 'start' | 'middle' | 'end'

export interface LabelPlacement {
  dx: number
  dy: number
  anchor: LabelAnchor
  /** 八个候选位置都被占：先不画，免得糊成一团（选中的点仍会画） */
  hide?: boolean
}

export interface LabelPoint {
  id: string
  x: number
  y: number
  name: string
}

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

const CHAR_W = 7
const BOX_H = 13

const CANDIDATES: LabelPlacement[] = [
  { dx: 8, dy: -8, anchor: 'start' },
  { dx: 8, dy: 15, anchor: 'start' },
  { dx: -8, dy: -8, anchor: 'end' },
  { dx: -8, dy: 15, anchor: 'end' },
  { dx: 0, dy: -14, anchor: 'middle' },
  { dx: 0, dy: 20, anchor: 'middle' },
  { dx: 17, dy: 4, anchor: 'start' },
  { dx: -17, dy: 4, anchor: 'end' },
]

function boxOf(px: number, py: number, w: number, p: LabelPlacement): Box {
  const left =
    p.anchor === 'start' ? px + p.dx : p.anchor === 'end' ? px + p.dx - w : px + p.dx - w / 2
  const top = py + p.dy - BOX_H + 3
  return { left, right: left + w, top, bottom: top + BOX_H }
}

function hits(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

export function placeLabels(points: LabelPoint[]): Map<string, LabelPlacement> {
  const out = new Map<string, LabelPlacement>()
  const taken: Box[] = points.map((p) => ({
    left: p.x - 5,
    right: p.x + 5,
    top: p.y - 5,
    bottom: p.y + 5,
  }))

  for (const p of points) {
    const w = Math.max(8, p.name.length * CHAR_W)
    let chosen: LabelPlacement | null = null
    for (const c of CANDIDATES) {
      const box = boxOf(p.x, p.y, w, c)
      if (!taken.some((t) => hits(box, t))) {
        chosen = c
        break
      }
    }
    if (!chosen) {
      // 挤到没地方放：跳过不画，别把整片区域涂成一团
      out.set(p.id, { ...CANDIDATES[0], hide: true })
      continue
    }
    const finalBox = boxOf(p.x, p.y, w, chosen)
    taken.push(finalBox)
    out.set(p.id, chosen)
  }

  return out
}
