import type { Mesh, Vec3 } from './solid'

/**
 * 三维斜面受力：楔形斜面 + 斜面上的物块。
 *
 * 坐标约定与 solid.ts 一致：**z 轴向上**，y 是进深。
 * 斜面沿 +y 方向升高，倾角 θ；沿斜面向上 u、斜面法向 n 都由 θ 唯一确定。
 */
export const INCLINE3D = {
  /** 斜面半宽（x） */
  halfW: 3.6,
  /** 斜面半深（y） */
  halfD: 3,
  g: 10,
}

export interface ForceVec {
  id: string
  name: string
  /** 单位方向 */
  dir: Vec3
  /** 大小（N） */
  mag: number
  color: string
  /** 分解出的分量（不画主箭头时用） */
  ghost?: boolean
}

export interface Incline3DModel {
  theta: number
  /** 楔形网格 */
  mesh: Mesh
  /** 物块网格 */
  block: Mesh
  /** 物块中心（力都从这里出发） */
  center: Vec3
  /** 沿斜面向上 */
  u: Vec3
  /** 斜面法向（朝外） */
  n: Vec3
  /** 斜面上表面两点，用来画 θ 角弧 */
  thetaAt: { vertex: Vec3 }
  forces: ForceVec[]
  /** 重力分解：沿斜面向下 / 垂直斜面 */
  decompose: { along: number; perp: number }
  /** 斜面底边中点，用来放倾角标注 */
  foot: Vec3
  mass: number
}

const scale = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

export function buildIncline3D(angleDeg: number, mass: number, mu: number): Incline3DModel {
  const theta = (Math.max(1, Math.min(80, angleDeg)) * Math.PI) / 180
  const { halfW, halfD, g } = INCLINE3D
  const h = 2 * halfD * Math.tan(theta)

  // 楔形顶点（z 向上）。斜面从**靠近观察者**的 y=+halfD 处起坡，向 y=-halfD 升到 h，
  // 这样 θ 角画在前下方，不会被楔形自己挡住。
  const P1: Vec3 = [-halfW, -halfD, 0] // 后左下
  const P2: Vec3 = [halfW, -halfD, 0] // 后右下
  const P3: Vec3 = [halfW, halfD, 0] // 前右下
  const P4: Vec3 = [-halfW, halfD, 0] // 前左下
  const S1: Vec3 = [-halfW, -halfD, h] // 后左上
  const S2: Vec3 = [halfW, -halfD, h] // 后右上

  const mesh: Mesh = {
    vertices: [P1, P2, P3, P4, S1, S2],
    faces: [
      [3, 2, 1, 0], // 底面（法向朝下）
      [4, 5, 2, 3], // 斜面（前下 → 后上，法向朝外）
      [1, 5, 4, 0], // 竖直背面（y=-halfD，法向朝后）
      [0, 4, 3], // 左侧三角（法向朝 -x）
      [1, 2, 5], // 右侧三角（法向朝 +x）
    ],
  }

  // 沿斜面向上（-y 方向升高）、斜面法向（朝外上方）
  const u: Vec3 = [0, -Math.cos(theta), Math.sin(theta)]
  const n: Vec3 = [0, Math.sin(theta), Math.cos(theta)]

  // 物块底面中心落在斜面中段
  const onSlope = (t: number): Vec3 => [0, halfD - 2 * halfD * t, h * t]
  const baseCenter = onSlope(0.55)
  const blockH = 1.1
  const blockW = 1.3
  const blockD = 1.1
  const center = add(baseCenter, scale(n, blockH / 2))

  // 物块用斜面上的局部坐标构造：沿 u、沿 x、沿 n 三个方向
  const xAxis: Vec3 = [1, 0, 0]
  const corner = (du: number, dx: number, dn: number): Vec3 =>
    add(add(add(baseCenter, scale(u, du)), scale(xAxis, dx)), scale(n, dn))
  const block: Mesh = {
    vertices: [
      corner(-blockD / 2, -blockW / 2, 0),
      corner(blockD / 2, -blockW / 2, 0),
      corner(blockD / 2, blockW / 2, 0),
      corner(-blockD / 2, blockW / 2, 0),
      corner(-blockD / 2, -blockW / 2, blockH),
      corner(blockD / 2, -blockW / 2, blockH),
      corner(blockD / 2, blockW / 2, blockH),
      corner(-blockD / 2, blockW / 2, blockH),
    ],
    faces: [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [1, 2, 6, 5],
      [2, 3, 7, 6],
      [3, 0, 4, 7],
    ],
  }

  const weight = mass * g
  const normalMag = weight * Math.cos(theta)
  const alongMag = weight * Math.sin(theta)
  // 静摩擦够不够抓住：不够就按滑动摩擦画
  const holding = Math.tan(theta) <= mu
  const frictionMag = holding ? alongMag : mu * normalMag

  const forces: ForceVec[] = [
    { id: 'G', name: 'G', dir: [0, 0, -1], mag: weight, color: '#3a3a38' },
    { id: 'N', name: 'N', dir: n, mag: normalMag, color: '#4a6b8a' },
    { id: 'f', name: 'f', dir: u, mag: frictionMag, color: '#9a5b4a' },
    // 重力的两个分量：沿斜面向下、垂直斜面压向斜面
    { id: 'Ga', name: 'mg sinθ', dir: scale(u, -1), mag: alongMag, color: '#8a4a6a', ghost: true },
    { id: 'Gn', name: 'mg cosθ', dir: scale(n, -1), mag: normalMag, color: '#8a4a6a', ghost: true },
  ]

  return {
    theta,
    mesh,
    block,
    center,
    u,
    n,
    forces,
    decompose: { along: alongMag, perp: normalMag },
    foot: [0, -halfD, 0],
    thetaAt: { vertex: P4 },
    mass,
  }
}
