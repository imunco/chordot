import type { Camera, SolidShape } from '../kernel/types'

export type Vec3 = [number, number, number]

export interface Mesh {
  vertices: Vec3[]
  faces: number[][]
  /** 逐顶点法线：曲面（球/圆柱/圆锥）用它做平滑着色 */
  normals?: Vec3[]
  /** 曲面标记：true 时按顶点法线做渐变，false 时整面纯色 */
  smooth?: boolean
}

const DEG = Math.PI / 180

/** 绕 z 轴等分圆环顶点 */
function ring(n: number, radius: number, z: number): Vec3[] {
  const out: Vec3[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    out.push([Math.cos(a) * radius, Math.sin(a) * radius, z])
  }
  return out
}

/** 圆柱：侧面 / 顶盖 / 底盖各用一套顶点，法线分开，着色才平滑 */
function cylinderMesh(n: number, h: number): Mesh {
  const vertices: Vec3[] = []
  const normals: Vec3[] = []
  const push = (r: number, z: number, nz: number) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const c = Math.cos(a)
      const s = Math.sin(a)
      vertices.push([c * r, s * r, z])
      normals.push(nz === 0 ? [c, s, 0] : [0, 0, nz])
    }
  }
  push(h, -h, 0) // 侧面下沿
  push(h, h, 0) // 侧面上沿
  push(h, h, 1) // 顶盖
  push(h, -h, -1) // 底盖

  const faces: number[][] = []
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    faces.push([i, j, j + n, i + n])
  }
  faces.push([...Array(n).keys()].map((i) => 2 * n + i))
  faces.push([...Array(n).keys()].map((i) => 3 * n + i).reverse())
  return { vertices, faces, normals, smooth: true }
}

/** 圆锥：底面半径 h、高 2h；侧面法线按斜率给，顶盖/底面单独拆 */
function coneMesh(n: number, h: number): Mesh {
  const vertices: Vec3[] = []
  const normals: Vec3[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    vertices.push([c * h, s * h, -h])
    normals.push(normalize([c * 2, s * 2, 1]))
  }
  const apex = vertices.length
  vertices.push([0, 0, h])
  normals.push([0, 0, 1])

  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    vertices.push([Math.cos(a) * h, Math.sin(a) * h, -h])
    normals.push([0, 0, -1])
  }

  const faces: number[][] = []
  for (let i = 0; i < n; i++) faces.push([i, (i + 1) % n, apex])
  faces.push([...Array(n).keys()].map((i) => apex + 1 + i).reverse())
  return { vertices, faces, normals, smooth: true }
}

function translate(mesh: Mesh, center: Vec3): Mesh {
  return {
    ...mesh,
    vertices: mesh.vertices.map((v) => [v[0] + center[0], v[1] + center[1], v[2] + center[2]] as Vec3),
    faces: mesh.faces,
  }
}

/** 按四元数绕 center 旋转网格（物理世界里的姿态） */
export function rotateMesh(mesh: Mesh, q: [number, number, number, number], center: Vec3): Mesh {
  const [x, y, z, w] = q
  // 单位四元数直接跳过
  if (Math.abs(x) + Math.abs(y) + Math.abs(z) < 1e-9) return mesh
  const rot = (v: Vec3): Vec3 => {
    const px = v[0] - center[0]
    const py = v[1] - center[1]
    const pz = v[2] - center[2]
    // t = 2 * (q_vec × p)
    const tx = 2 * (y * pz - z * py)
    const ty = 2 * (z * px - x * pz)
    const tz = 2 * (x * py - y * px)
    return [
      px + w * tx + (y * tz - z * ty) + center[0],
      py + w * ty + (z * tx - x * tz) + center[1],
      pz + w * tz + (x * ty - y * tx) + center[2],
    ]
  }
  return {
    ...mesh,
    vertices: mesh.vertices.map(rot),
    faces: mesh.faces,
    normals: mesh.normals
      ? mesh.normals.map((n) => {
          const px = n[0]
          const py = n[1]
          const pz = n[2]
          const tx = 2 * (y * pz - z * py)
          const ty = 2 * (z * px - x * pz)
          const tz = 2 * (x * py - y * px)
          return [
            px + w * tx + (y * tz - z * ty),
            py + w * ty + (z * tx - x * tz),
            pz + w * tz + (x * ty - y * tx),
          ] as Vec3
        })
      : undefined,
  }
}

export function buildMesh(shape: SolidShape): Mesh {
  const s = shape.size
  const h = s / 2

  switch (shape.type) {
    case 'cube': {
      const vertices: Vec3[] = [
        [-h, -h, -h],
        [h, -h, -h],
        [h, h, -h],
        [-h, h, -h],
        [-h, -h, h],
        [h, -h, h],
        [h, h, h],
        [-h, h, h],
      ]
      const faces = [
        [0, 3, 2, 1],
        [4, 5, 6, 7],
        [0, 1, 5, 4],
        [1, 2, 6, 5],
        [2, 3, 7, 6],
        [3, 0, 4, 7],
      ]
      return translate({ vertices, faces }, shape.center)
    }

    case 'pyramid': {
      const n = Math.max(3, shape.sides ?? 4)
      if (n >= 12) return translate(coneMesh(Math.max(32, n), h), shape.center)
      const base = ring(n, h, -h)
      const vertices: Vec3[] = [...base, [0, 0, h]]
      const faces: number[][] = [base.map((_, i) => i).reverse()]
      for (let i = 0; i < n; i++) {
        faces.push([i, (i + 1) % n, n])
      }
      return translate({ vertices, faces }, shape.center)
    }

    case 'prism': {
      const n = Math.max(3, shape.sides ?? 6)
      // 圆柱：侧面、顶盖、底盖各用一套顶点，法线分开，着色才平滑
      if (n >= 12) return translate(cylinderMesh(Math.max(32, n), h), shape.center)
      const bottom = ring(n, h, -h)
      const top = ring(n, h, h)
      const vertices: Vec3[] = [...bottom, ...top]
      const faces: number[][] = [bottom.map((_, i) => i).reverse(), top.map((_, i) => i + n)]
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        faces.push([i, j, j + n, i + n])
      }
      return translate({ vertices, faces }, shape.center)
    }

    case 'tetra': {
      const vertices: Vec3[] = [
        [h, h, h],
        [h, -h, -h],
        [-h, h, -h],
        [-h, -h, h],
      ]
      const faces = [
        [0, 1, 2],
        [0, 3, 1],
        [0, 2, 3],
        [1, 3, 2],
      ]
      return translate({ vertices, faces }, shape.center)
    }

    case 'octahedron': {
      const vertices: Vec3[] = [
        [h, 0, 0],
        [-h, 0, 0],
        [0, h, 0],
        [0, -h, 0],
        [0, 0, h],
        [0, 0, -h],
      ]
      const faces = [
        [0, 2, 4],
        [2, 1, 4],
        [1, 3, 4],
        [3, 0, 4],
        [2, 0, 5],
        [1, 2, 5],
        [3, 1, 5],
        [0, 3, 5],
      ]
      return translate({ vertices, faces }, shape.center)
    }

    case 'sphere': {
      const slices = 40
      const stacks = 20
      const vertices: Vec3[] = []
      // 极点单独给顶点，否则第一/最后一圈会缩成一个点，退化四边形算不出法线
      vertices.push([0, 0, h])
      for (let i = 1; i < stacks; i++) {
        const phi = (i / stacks) * Math.PI
        const r = Math.sin(phi) * h
        const z = Math.cos(phi) * h
        for (let j = 0; j < slices; j++) {
          const a = (j / slices) * Math.PI * 2
          vertices.push([Math.cos(a) * r, Math.sin(a) * r, z])
        }
      }
      vertices.push([0, 0, -h])

      const ringStart = (i: number) => 1 + (i - 1) * slices
      const south = vertices.length - 1
      const faces: number[][] = []
      // 顶盖三角扇
      for (let j = 0; j < slices; j++) {
        const j2 = (j + 1) % slices
        faces.push([0, ringStart(1) + j, ringStart(1) + j2])
      }
      // 中间四边形
      for (let i = 1; i < stacks - 1; i++) {
        for (let j = 0; j < slices; j++) {
          const j2 = (j + 1) % slices
          const a = ringStart(i) + j
          const b = ringStart(i) + j2
          const c = ringStart(i + 1) + j2
          const d = ringStart(i + 1) + j
          faces.push([a, b, c, d])
        }
      }
      // 底盖三角扇
      for (let j = 0; j < slices; j++) {
        const j2 = (j + 1) % slices
        faces.push([south, ringStart(stacks - 1) + j2, ringStart(stacks - 1) + j])
      }

      const normals = vertices.map((v) => normalize(v))
      return translate({ vertices, faces, normals, smooth: true }, shape.center)
    }

    default:
      return { vertices: [], faces: [] }
  }
}

/* ───────── 相机与投影 ───────── */

export interface Basis {
  right: Vec3
  up: Vec3
  dir: Vec3
}

export function cameraBasis(camera: Camera): Basis {
  const az = camera.azimuth * DEG
  const el = camera.elevation * DEG
  const dir: Vec3 = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)]
  const right: Vec3 = [-Math.sin(az), Math.cos(az), 0]
  const up: Vec3 = [-Math.sin(el) * Math.cos(az), -Math.sin(el) * Math.sin(az), Math.cos(el)]
  return { right, up, dir }
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

export interface FaceView {
  points: [number, number][]
  shade: string
  /** 平滑着色：面内从 from 到 to 的线性渐变（屏幕坐标） */
  grad?: { from: string; to: string; x1: number; y1: number; x2: number; y2: number }
  depth: number
}

export interface SolidView {
  faces: FaceView[]
  /** 看得见的棱（实线） */
  edges: { a: [number, number]; b: [number, number] }[]
  /** 被挡住的棱（虚线） */
  hiddenEdges: { a: [number, number]; b: [number, number] }[]
  vertices: { x: number; y: number }[]
  /** 屏幕轮廓（凸包）：画一圈细线，边缘更干净 */
  outline: [number, number][]
}

const LIGHT = normalize([0.45, -0.7, 0.75])

/** 光源方向（指向光源），阴影沿它的反方向落到地面 */
export const LIGHT_DIR: Vec3 = LIGHT

/** 顶点位置 → 边的 key（量化后排序，两个方向视为同一条边） */
function edgeKey(p: Vec3, q: Vec3): string {
  const f = (v: Vec3) => v.map((x) => x.toFixed(4)).join(',')
  const a = f(p)
  const b = f(q)
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** 明暗：法向与光线夹角，映射到浅灰阶（纸面质感，但要有足够对比才像立体） */
function shadeColor(k: number): string {
  // t=0（背光/边缘）→ 中灰；t=1（正对光）→ 近白。
  // 边缘不能是白的，否则球体会和纸面背景糊在一起。
  const t = Math.min(1, Math.max(0, k))
  const v = Math.round(198 + t * 48)
  return `rgb(${v},${v - 2},${v - 5})`
}

/** 屏幕顶点凸包：给立体补一圈细轮廓，边缘不会毛毛躁躁 */
function convexHull(points: { x: number; y: number }[]): [number, number][] {
  const pts = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))
  if (pts.length < 3) return pts.map((p) => [p.x, p.y] as [number, number])
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: { x: number; y: number }[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: { x: number; y: number }[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)].map((p) => [p.x, p.y] as [number, number])
}

/** 正交/透视投影 + 背面剔除 + 画家算法排序（任意网格） */
export function projectMesh(
  mesh: Mesh,
  camera: Camera,
  toScreen: (p: [number, number]) => [number, number],
): SolidView {
  const { right, up, dir } = cameraBasis(camera)

  const persp = camera.perspective ?? true
  const dist = camera.dist ?? 14
  const flat = mesh.vertices.map((v) => {
    const z = dot(v, dir)
    // 透视：距离相机越远越小；除以 dist 归一化，让物体中心大小保持不变
    const k = persp ? dist / Math.max(dist - z, 0.8) : 1
    const [x, y] = toScreen([dot(v, right) * k, dot(v, up) * k])
    return { x, y, depth: z }
  })

  const visible: {
    idx: number[]
    depth: number
    shade: string
    grad?: FaceView['grad']
    normal: Vec3
  }[] = []
  /** 边 → 相邻面法线（按几何位置合并，曲面拆开的顶点也能对上） */
  const edgeMap = new Map<
    string,
    { a: number; b: number; normals: Vec3[]; front: number; back: number }
  >()

  for (const face of mesh.faces) {
    const p0 = mesh.vertices[face[0]]
    const p1 = mesh.vertices[face[1]]
    const p2 = mesh.vertices[face[2]]
    const normal = normalize(cross(sub(p1, p0), sub(p2, p0)))
    const facing = dot(normal, dir)

    // 按「几何位置」记边：曲面拆顶点后索引不同，位置相同要合并成一条
    for (let i = 0; i < face.length; i++) {
      const a = face[i]
      const b = face[(i + 1) % face.length]
      const key = edgeKey(mesh.vertices[a], mesh.vertices[b])
      const rec = edgeMap.get(key) ?? { a, b, normals: [], front: 0, back: 0 }
      rec.normals.push(normal)
      if (facing > 0.001) rec.front += 1
      else rec.back += 1
      edgeMap.set(key, rec)
    }

    if (facing <= 0.001) continue // 背面剔除（凸体成立）
    const depth = face.reduce((sum, i) => sum + flat[i].depth, 0) / face.length

    // 曲面：用逐顶点法线取面内最亮/最暗两端，做成线性渐变，曲面才连续。
    // 颜色基准也用顶点平均，别用面法线——极点处三角扇很窄，用面法线会出现亮环。
    let grad: FaceView['grad'] | undefined
    let shadeK = dot(normal, LIGHT)
    if (mesh.smooth && mesh.normals) {
      let hi = 0
      let lo = 0
      let hiK = -2
      let loK = 2
      let sum = 0
      face.forEach((vi, n) => {
        const k = dot(mesh.normals![vi] ?? normal, LIGHT)
        sum += k
        if (k > hiK) {
          hiK = k
          hi = n
        }
        if (k < loK) {
          loK = k
          lo = n
        }
      })
      shadeK = sum / face.length
      // 只在面够大、明暗差够明显时才拉渐变；小球面/极点扇用平均色，避免出现亮环
      if (hiK - loK > 0.08) {
        const a = flat[face[hi]]
        const b = flat[face[lo]]
        if (Math.hypot(a.x - b.x, a.y - b.y) > 14) {
          grad = { from: shadeColor(hiK), to: shadeColor(loK), x1: a.x, y1: a.y, x2: b.x, y2: b.y }
        }
      }
    }

    visible.push({
      idx: face,
      depth,
      shade: shadeColor(shadeK),
      grad,
      normal,
    })
  }
  visible.sort((a, b) => a.depth - b.depth)

  const toLine = (e: { a: number; b: number }) => ({
    a: [flat[e.a].x, flat[e.a].y] as [number, number],
    b: [flat[e.b].x, flat[e.b].y] as [number, number],
  })

  // 只画「硬边」：相邻面法线夹角够大，或只有一张面用到它。
  // 球/圆柱细分出来的边夹角很小，全画出来就是线框，曲面也就不光滑了。
  const SMOOTH_DEG = 60
  const cosLimit = Math.cos((SMOOTH_DEG * Math.PI) / 180)
  const edges: { a: [number, number]; b: [number, number] }[] = []
  const hiddenEdges: { a: [number, number]; b: [number, number] }[] = []
  for (const rec of edgeMap.values()) {
    // 曲面（球）不画任何内部边：轮廓由凸包描边负责，内部再多一条线都像裂痕
    if (mesh.smooth && rec.normals.length < 2) continue
    let hard = !mesh.smooth && rec.normals.length < 2
    for (let i = 0; i < rec.normals.length && !hard; i++) {
      for (let j = i + 1; j < rec.normals.length; j++) {
        if (dot(rec.normals[i], rec.normals[j]) < cosLimit) {
          hard = true
          break
        }
      }
    }
    if (!hard) continue
    const line = toLine(rec)
    if (rec.front > 0) edges.push(line)
    else hiddenEdges.push(line)
  }

  return {
    faces: visible.map((f) => ({
      points: f.idx.map((i) => [flat[i].x, flat[i].y] as [number, number]),
      shade: f.shade,
      grad: f.grad,
      depth: f.depth,
    })),
    edges,
    hiddenEdges,
    vertices: flat.map((p) => ({ x: p.x, y: p.y })),
    outline: convexHull(flat),
  }
}

/** 单个形体的投影 */
export function projectSolid(
  shape: SolidShape,
  camera: Camera,
  toScreen: (p: [number, number]) => [number, number],
): SolidView {
  const base = buildMesh(shape)
  const mesh = shape.rotation ? rotateMesh(base, shape.rotation, shape.center) : base
  return projectMesh(mesh, camera, toScreen)
}

/** 三维点 → 屏幕坐标（与 projectMesh 内部一致，正交近似） */
export function projectPoint3(
  p: Vec3,
  camera: Camera,
  toScreen: (p: [number, number]) => [number, number],
): [number, number] {
  const { right, up } = cameraBasis(camera)
  return toScreen([dot(p, right), dot(p, up)])
}

/** 三维点 → 屏幕坐标（含透视，和 projectMesh 的顶点投影完全一致） */
export function projectPoint3p(
  p: Vec3,
  camera: Camera,
  toScreen: (p: [number, number]) => [number, number],
): [number, number] {
  const { right, up, dir } = cameraBasis(camera)
  const z = dot(p, dir)
  const dist = camera.dist ?? 14
  const k = (camera.perspective ?? true) ? dist / Math.max(dist - z, 0.8) : 1
  return toScreen([dot(p, right) * k, dot(p, up) * k])
}

export interface ShadowView {
  /** 地面上的投影轮廓（屏幕坐标，凸包） */
  points: [number, number][]
  /** 越高越淡 */
  alpha: number
}

/**
 * 阴影专用光线：比着色用的 LIGHT 更「高」。
 * 着色光很斜（低角度侧光），照它投影会甩出物体一倍身位，看着像飘着的卡片；
 * 这里单独给一个接近顶光的方向，影子贴着物体底部，读起来才像「立在地上」。
 */
const SHADOW_LIGHT = normalize([0.3, -0.45, 1.5])

/**
 * 立体在地面（z = 0）上的投影：每个顶点沿光线方向落到 z=0，再取屏幕凸包。
 * 完全埋在地下（或没有顶点在地面之上）时返回 null。
 */
export function groundShadow(
  shape: SolidShape,
  camera: Camera,
  toScreen: (p: [number, number]) => [number, number],
): ShadowView | null {
  const base = buildMesh(shape)
  const mesh = shape.rotation ? rotateMesh(base, shape.rotation, shape.center) : base
  if (mesh.vertices.length === 0) return null

  const lz = SHADOW_LIGHT[2]
  let minZ = Infinity
  let above = 0
  const pts: { x: number; y: number }[] = []
  for (const v of mesh.vertices) {
    minZ = Math.min(minZ, v[2])
    if (v[2] < 0) continue // 埋在地下的部分不投影
    above += 1
    // 光线方向 -SHADOW_LIGHT：v - t·L 落到 z = 0
    const t = v[2] / lz
    const g: Vec3 = [v[0] - t * SHADOW_LIGHT[0], v[1] - t * SHADOW_LIGHT[1], 0]
    const [x, y] = projectPoint3p(g, camera, toScreen)
    pts.push({ x, y })
  }
  if (above < 3) return null

  const hull = convexHull(pts)
  if (hull.length < 3) return null
  // 贴地（minZ≈0）时最深，抬高后迅速变淡
  const alpha = Math.min(0.12, Math.max(0.035, 0.12 - Math.max(0, minZ) * 0.012))
  return { points: hull, alpha }
}

/** 三维方向向量 → 屏幕方向（单位：世界长度 × pxPerUnit） */
export function projectVector(
  v: Vec3,
  camera: Camera,
  pxPerUnit: number,
): [number, number] {
  const { right, up } = cameraBasis(camera)
  return [dot(v, right) * pxPerUnit, -dot(v, up) * pxPerUnit]
}

export const VIEWS: { id: Camera['view']; label: string; azimuth: number; elevation: number }[] = [
  { id: 'front', label: '正', azimuth: -90, elevation: 0 },
  { id: 'side', label: '侧', azimuth: 0, elevation: 0 },
  { id: 'top', label: '俯', azimuth: -90, elevation: 89.5 },
  { id: 'iso', label: '等轴', azimuth: 45, elevation: 35.26 },
]
