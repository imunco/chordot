import type { Camera, SolidShape } from '../kernel/types'

export type Vec3 = [number, number, number]

export interface Mesh {
  vertices: Vec3[]
  faces: number[][]
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

function translate(mesh: Mesh, center: Vec3): Mesh {
  return {
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
  return { vertices: mesh.vertices.map(rot), faces: mesh.faces }
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
      const slices = 24
      const stacks = 12
      const vertices: Vec3[] = []
      for (let i = 0; i <= stacks; i++) {
        const phi = (i / stacks) * Math.PI
        const r = Math.sin(phi) * h
        const z = Math.cos(phi) * h
        for (let j = 0; j < slices; j++) {
          const a = (j / slices) * Math.PI * 2
          vertices.push([Math.cos(a) * r, Math.sin(a) * r, z])
        }
      }
      const faces: number[][] = []
      for (let i = 0; i < stacks; i++) {
        for (let j = 0; j < slices; j++) {
          const j2 = (j + 1) % slices
          const a = i * slices + j
          const b = i * slices + j2
          const c = (i + 1) * slices + j2
          const d = (i + 1) * slices + j
          faces.push([a, b, c, d])
        }
      }
      return translate({ vertices, faces }, shape.center)
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
  depth: number
}

export interface SolidView {
  faces: FaceView[]
  /** 看得见的棱（实线） */
  edges: { a: [number, number]; b: [number, number] }[]
  /** 被挡住的棱（虚线） */
  hiddenEdges: { a: [number, number]; b: [number, number] }[]
  vertices: { x: number; y: number }[]
}

const LIGHT = normalize([0.45, -0.7, 0.75])

/** 明暗：法向与光线夹角，映射到极浅的灰阶（保持纸面质感） */
function shadeColor(k: number): string {
  const t = Math.min(1, Math.max(0, k))
  const r = Math.round(255 - t * 30)
  const g = Math.round(253 - t * 33)
  const b = Math.round(249 - t * 34)
  return `rgb(${r},${g},${b})`
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

  const visible: { idx: number[]; depth: number; shade: string; normal: Vec3 }[] = []
  /** 正面边（实线）与背面边（虚线）分开收集 */
  const frontEdges = new Map<string, { a: number; b: number }>()
  const backEdges = new Map<string, { a: number; b: number }>()

  for (const face of mesh.faces) {
    const p0 = mesh.vertices[face[0]]
    const p1 = mesh.vertices[face[1]]
    const p2 = mesh.vertices[face[2]]
    const normal = normalize(cross(sub(p1, p0), sub(p2, p0)))
    const facing = dot(normal, dir)
    const bucket = facing > 0.001 ? frontEdges : backEdges
    for (let i = 0; i < face.length; i++) {
      const a = face[i]
      const b = face[(i + 1) % face.length]
      const key = a < b ? `${a}-${b}` : `${b}-${a}`
      if (!bucket.has(key)) bucket.set(key, { a, b })
    }
    if (facing <= 0.001) continue // 背面剔除（凸体成立）
    const depth = face.reduce((sum, i) => sum + flat[i].depth, 0) / face.length
    visible.push({ idx: face, depth, shade: shadeColor(dot(normal, LIGHT)), normal })
  }
  visible.sort((a, b) => a.depth - b.depth)

  const toLine = (e: { a: number; b: number }) => ({
    a: [flat[e.a].x, flat[e.a].y] as [number, number],
    b: [flat[e.b].x, flat[e.b].y] as [number, number],
  })

  // 看得见的棱：属于正面的边（实线）
  const edges = [...frontEdges.values()].map(toLine)
  // 被挡住的棱：只属于背面的边（虚线），跟随视角实时变化
  const hiddenEdges = [...backEdges.entries()]
    .filter(([key]) => !frontEdges.has(key))
    .map(([, e]) => toLine(e))

  return {
    faces: visible.map((f) => ({
      points: f.idx.map((i) => [flat[i].x, flat[i].y] as [number, number]),
      shade: f.shade,
      depth: f.depth,
    })),
    edges,
    hiddenEdges,
    vertices: flat.map((p) => ({ x: p.x, y: p.y })),
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
