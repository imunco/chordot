import { useMemo } from 'react'
import type { SolidShape } from '../kernel/types'
import { buildMesh, type Mesh, type Vec3 } from '../model/solid'
import {
  getSolidNetOpen,
  setSolidNetOpen,
  supportsSolidNet,
  toggleSolidNet,
  useSolidNetOpen,
} from '../model/solidNet'

export { getSolidNetOpen, setSolidNetOpen, supportsSolidNet, toggleSolidNet, useSolidNetOpen }

/**
 * 三维展开图（0.16.0）。
 *
 * 用 BFS 把网格的每个面沿公共棱镜像摊平：从第一个面出发，邻居面绕公共棱旋转到同一平面，
 * 得到一张「真实棱长」的展开网。球体没有可展曲面，不提供展开图；
 * 圆柱 / 圆锥在 0.16 只做多面体（教学上也是多面体展开用得最多）。
 * 开关状态用一个极轻的 store 共享给 RightPanel 和 CanvasStage，不用往 App 传 props。
 */

type P2 = { x: number; y: number }

/* ───────── 展开计算 ───────── */

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const norm = (v: Vec3): Vec3 => {
  const len = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}

const sub2 = (a: P2, b: P2): P2 => ({ x: a.x - b.x, y: a.y - b.y })
const dot2 = (a: P2, b: P2) => a.x * b.x + a.y * b.y
const norm2 = (v: P2): P2 => {
  const len = Math.hypot(v.x, v.y) || 1
  return { x: v.x / len, y: v.y / len }
}
const centroid2 = (pts: P2[]): P2 => {
  const n = pts.length || 1
  let x = 0
  let y = 0
  for (const p of pts) {
    x += p.x
    y += p.y
  }
  return { x: x / n, y: y / n }
}

/** 把一个三维面摊到自己的平面上（保留真实棱长） */
function facePolygon(mesh: Mesh, face: number[]): P2[] {
  const v0 = mesh.vertices[face[0]]
  const v1 = mesh.vertices[face[1]]
  const v2 = mesh.vertices[face[2]] ?? mesh.vertices[face[1]]
  const u = norm(sub(v1, v0))
  const n = norm(cross(sub(v1, v0), sub(v2, v0)))
  const w = cross(n, u)
  return face.map((idx) => {
    const d = sub(mesh.vertices[idx], v0)
    return { x: dot(d, u), y: dot(d, w) }
  })
}

interface NetResult {
  faces: { pts: P2[] }[]
  edgeLabels: { x: number; y: number; text: string }[]
  width: number
  height: number
}

function buildNet(shape: SolidShape): NetResult {
  const mesh = buildMesh(shape)
  const faces = mesh.faces
  const edgeMap = new Map<string, number[]>()
  for (let fi = 0; fi < faces.length; fi += 1) {
    const face = faces[fi]
    for (let i = 0; i < face.length; i += 1) {
      const a = face[i]
      const b = face[(i + 1) % face.length]
      const key = a < b ? a + ':' + b : b + ':' + a
      const list = edgeMap.get(key) ?? []
      list.push(fi)
      edgeMap.set(key, list)
    }
  }

  const placedPts = new Map<number, P2[]>()
  const globalV = new Map<number, P2>()
  const queue: number[] = faces.length > 0 ? [0] : []
  const rootPts = faces.length > 0 ? facePolygon(mesh, faces[0]) : []
  if (faces.length > 0) {
    placedPts.set(0, rootPts)
    faces[0].forEach((vi, i) => {
      globalV.set(vi, rootPts[i])
    })
  }

  while (queue.length > 0) {
    const fi = queue.shift() as number
    const face = faces[fi]
    const pts = placedPts.get(fi)
    if (!pts) continue
    const curCentroid = centroid2(pts)
    for (let i = 0; i < face.length; i += 1) {
      const a = face[i]
      const b = face[(i + 1) % face.length]
      const key = a < b ? a + ':' + b : b + ':' + a
      const neighbors = edgeMap.get(key) ?? []
      for (const ni of neighbors) {
        if (ni === fi || placedPts.has(ni)) continue
        const nface = faces[ni]
        const local = facePolygon(mesh, nface)
        const la = local[nface.indexOf(a)]
        const lb = local[nface.indexOf(b)]
        const A = globalV.get(a)
        const B = globalV.get(b)
        if (!A || !B || !la || !lb) continue
        const wu = norm2(sub2(B, A))
        const ww = { x: -wu.y, y: wu.x }
        let mapped = local.map((p) => {
          const d = sub2(p, la)
          return {
            x: A.x + d.x * wu.x + d.y * ww.x,
            y: A.y + d.x * wu.y + d.y * ww.y,
          }
        })
        // 展开要镜像到公共棱的另一侧；同侧就翻过去
        const sideCur = Math.sign(dot2(sub2(curCentroid, A), ww))
        const sideNew = Math.sign(dot2(sub2(centroid2(mapped), A), ww))
        if (sideCur !== 0 && sideNew === sideCur) {
          mapped = mapped.map((p) => {
            const d = sub2(p, A)
            const k = dot2(d, ww)
            return { x: p.x - 2 * k * ww.x, y: p.y - 2 * k * ww.y }
          })
        }
        placedPts.set(ni, mapped)
        nface.forEach((vi, k) => {
          if (!globalV.has(vi)) globalV.set(vi, mapped[k])
        })
        queue.push(ni)
      }
    }
  }

  const resultFaces = [...placedPts.entries()].map(([, pts]) => ({ pts }))

  // 摊平后只给「外轮廓」标棱长：共享的折痕被两个面各用一次，count 为 2；只出现一次的才是外边。
  const edgeUse = new Map<string, { a: P2; b: P2; count: number }>()
  for (const f of resultFaces) {
    for (let i = 0; i < f.pts.length; i += 1) {
      const a = f.pts[i]
      const b = f.pts[(i + 1) % f.pts.length]
      const ka = a.x.toFixed(3) + ',' + a.y.toFixed(3)
      const kb = b.x.toFixed(3) + ',' + b.y.toFixed(3)
      const key = ka < kb ? ka + '|' + kb : kb + '|' + ka
      const hit = edgeUse.get(key)
      if (hit) hit.count += 1
      else edgeUse.set(key, { a, b, count: 1 })
    }
  }
  const labelByEdge: { x: number; y: number; text: string }[] = []
  const seenLength = new Set<string>()
  for (const { a, b, count } of edgeUse.values()) {
    if (count !== 1) continue
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < 1e-4) continue
    const text = Number(len.toFixed(2)).toString()
    // 同一种棱长只标一次：正方体 12 条棱都写「4」会把小卡片糊满
    if (seenLength.has(text)) continue
    seenLength.add(text)
    labelByEdge.push({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      text,
    })
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const f of resultFaces) {
    for (const p of f.pts) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
  }
  const pad = 0.02
  const offX = Number.isFinite(minX) ? minX - pad : 0
  const offY = Number.isFinite(minY) ? minY - pad : 0
  const width = Number.isFinite(maxX - minX) ? maxX - minX + pad * 2 : 1
  const height = Number.isFinite(maxY - minY) ? maxY - minY + pad * 2 : 1
  return {
    faces: resultFaces.map((f) => ({
      pts: f.pts.map((p) => ({ x: p.x - offX, y: p.y - offY })),
    })),
    edgeLabels: labelByEdge.map((l) => ({ x: l.x - offX, y: l.y - offY, text: l.text })),
    width,
    height,
  }
}

interface Props {
  shape: SolidShape
  /** 画在右下角的小卡片尺寸，默认 260×190 */
  width?: number
  height?: number
}

export function SolidNet({ shape, width = 260, height = 190 }: Props) {
  const net = useMemo(() => buildNet(shape), [shape])

  const pad = 12
  const labelSpace = 18
  const innerW = width - pad * 2
  const innerH = height - pad - labelSpace - 26
  const scale = Math.min(innerW / Math.max(net.width, 1e-6), innerH / Math.max(net.height, 1e-6))
  const ox = pad + (innerW - net.width * scale) / 2
  const oy = 26 + (innerH - net.height * scale) / 2
  const project = (p: P2) => ({ x: ox + p.x * scale, y: oy + p.y * scale })

  const edgeLabels = net.edgeLabels
  const edgeLengths = [...new Set(edgeLabels.map((l) => l.text))]

  return (
    <div className="solidnet" data-solid-net="1" style={{ width, height }}>
      <div className="solidnet__head">
        <span>展开图 · {shape.name || '立体'}</span>
        <button className="solidnet__close" onClick={() => setSolidNetOpen(false)} title="收起展开图">
          ×
        </button>
      </div>
      <svg
        className="solidnet__svg"
        width={width}
        height={height - 26}
        viewBox={'0 0 ' + width + ' ' + (height - 26)}
        role="img"
        aria-label="展开图"
      >
        <g transform={'translate(0 ' + 4 + ')'}>
          {net.faces.map((f, fi) => (
            <polygon
              key={fi}
              points={f.pts.map((p) => {
                const q = project(p)
                return q.x.toFixed(2) + ',' + q.y.toFixed(2)
              }).join(' ')}
              fill={fi % 2 === 0 ? '#e9e4da' : '#f0ece4'}
              stroke="#3d5a66"
              strokeWidth={1.1}
              strokeLinejoin="round"
            />
          ))}
          {edgeLabels.map((l, i) => {
            const q = project(l)
            return (
              <text
                key={i}
                x={q.x}
                y={q.y - 2.5}
                className="solidnet__label"
                textAnchor="middle"
              >
                {l.text}
              </text>
            )
          })}
        </g>
      </svg>
      <div className="solidnet__hint">
        {edgeLengths.length > 0
          ? '棱长 ' + edgeLengths.join(' / ') + '（场景单位）'
          : '棱长为场景单位'}
        {' · '}球体不可展开
      </div>
    </div>
  )
}
