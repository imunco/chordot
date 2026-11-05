export interface Pt {
  x: number
  y: number
}

export interface InclineParams {
  /** 斜面倾角，度 */
  angleDeg: number
  /** 物块沿斜面的位置参数 0–1 */
  t: number
  /** 质量 kg */
  mass: number
  /** 摩擦因数 */
  mu: number
}

export interface TriangleParams {
  points: { id: string; x: number; y: number }[]
  lengths: { a: string; b: string; d: number }[]
}

/* ───────── 通用草图文档：构造工具直接编辑这一层 ───────── */

export interface SketchPoint {
  id: string
  x: number
  y: number
  /** 固定点不可拖动 */
  fixed?: boolean
  /** 创建时分配的显示名（A、B、C…），保持稳定 */
  name?: string
}

export interface SketchSegment {
  id: string
  a: string
  b: string
}

export interface SketchCircle {
  id: string
  /** 圆心点 id */
  c: string
  r: number
}

export interface SketchPolygon {
  id: string
  points: string[]
  /**
   * 四边形锁定纵横比：拖动任一顶点时，把图形保持成矩形（宽/高 = ratio）。
   * undefined = 不锁定。只对 4 个点的多边形生效。
   */
  ratio?: number
}

export interface SketchFunction {
  id: string
  /** mathjs 表达式，自变量 x */
  expr: string
  name?: string
  /** 曲线颜色，缺省按顺序自动分配 */
  color?: string
}

export type SketchConstraintType =
  | 'horizontal'
  | 'vertical'
  | 'equal'
  | 'parallel'
  | 'perpendicular'
  | 'on-line'
  | 'midpoint'
  | 'tangent'

export interface SketchConstraint {
  id: string
  type: SketchConstraintType
  /** 引用一个（水平/垂直）或两个（等长/平行/垂直）线段 id */
  lines: string[]
  /** 「点在线上」「中点」引用的点 id */
  points?: string[]
  /** 「相切」引用的圆 id */
  circles?: string[]
}

/** 力的取值方式：恒定 / 随时间变化 / 随位移变化 */
export type ForceKind = 'constant' | 'time' | 'position'

/** 手工添加的力矢量（草图场景） */
export interface SketchForce {
  id: string
  name: string
  /** 大小表达式，变量为 t（秒）或 x（米）；恒力直接写数字 */
  expr: string
  /** 世界坐标角度，度；0° 指向 +x，逆时针为正 */
  angle: number
  /** 作用点世界坐标 */
  at: [number, number]
  kind: ForceKind
}

export interface SketchDoc {
  points: SketchPoint[]
  segments: SketchSegment[]
  circles: SketchCircle[]
  polygons: SketchPolygon[]
  functions: SketchFunction[]
  constraints: SketchConstraint[]
  forces: SketchForce[]
}

export function emptySketch(): SketchDoc {
  return {
    points: [],
    segments: [],
    circles: [],
    polygons: [],
    functions: [],
    constraints: [],
    forces: [],
  }
}

/* ───────── 三维场景 ───────── */

export interface Camera {
  /** 方位角，度 */
  azimuth: number
  /** 仰角，度（-89…89） */
  elevation: number
  zoom: number
  view: 'free' | 'front' | 'side' | 'top' | 'iso'
  /** 透视投影；关闭则正交（教学制图常用） */
  perspective?: boolean
  /** 相机到目标的距离，只在透视下影响强弱 */
  dist?: number
}

export type SolidType = 'cube' | 'pyramid' | 'prism' | 'tetra' | 'octahedron' | 'sphere'

export interface SolidShape {
  id: string
  name: string
  type: SolidType
  center: [number, number, number]
  size: number
  /** 棱柱 / 棱锥的底面边数 */
  sides?: number
  /** 姿态四元数 [x,y,z,w]，物理世界里的翻滚/滚动会写回这里 */
  rotation?: [number, number, number, number]
  /** 只作用在这个物体上的变力 */
  force?: PhysicsForce
}

/** 变力：F(t) 沿某个方向 */
export interface PhysicsForce {
  enabled: boolean
  expr: string
  /** 预设方向；配了 vec 时以 vec 为准 */
  dir: string
  /** 自定义方向向量，如 "1,-1,0"，只取方向不取长度 */
  vec?: string
}

/** 物理世界参数（三维场景可选） */
export interface PhysicsParams {
  enabled: boolean
  /** 重力加速度 m/s² */
  gravity: number
  /** 弹性系数 0–1 */
  restitution: number
  /** 摩擦系数 0–1 */
  friction: number
  /** 场景里的静态障碍：斜面 / 墙 */
  obstacles?: PhysicsObstacle[]
  /** 全局外力（变力）：F(t) 推动所有物体 */
  force?: PhysicsForce
}

export interface PhysicsObstacle {
  id: string
  kind: 'ramp' | 'wall'
  /** 斜面倾角（kind = ramp） */
  angleDeg?: number
  /** 世界坐标位置（斜面是中心，墙是底面中心） */
  x: number
  y: number
  /** 墙的尺寸 */
  w?: number
  h?: number
  d?: number
}

export interface SolidParams {
  shapes: SolidShape[]
  camera: Camera
  physics?: PhysicsParams
}

/* ───────── 通用动力学场景 ───────── */

export type MotionModel = 'pendulum' | 'spring' | 'projectile'

export interface MotionParams {
  model: MotionModel
  /** 重力加速度 */
  gravity: number
  /** 阻尼系数（0 表示无阻尼） */
  damping: number
  /** 单摆：摆长 m、初始摆角（度） */
  length: number
  angle0: number
  /** 弹簧振子：劲度系数 N/m、质量 kg、初始位移 m */
  stiffness: number
  mass: number
  amplitude: number
  /** 抛体：初速度 m/s、抛射角（度）、初始高度 m */
  speed: number
  launch: number
  height: number
}

/** 手绘批注：world 坐标随画布平移缩放，screen 坐标固定在屏幕上（三维用） */
export interface Stroke {
  id: string
  space: 'world' | 'screen'
  color: string
  width: number
  points: [number, number][]
  /** pen = 普通笔；marker = 荧光笔（粗、半透明、正片叠底）。老文件没有这个字段，按 pen 处理 */
  mode?: 'pen' | 'marker'
}

export interface SolidInclineParams {
  angleDeg: number
  mass: number
  mu: number
  camera: Camera
  /** 是否显示重力分解 */
  decompose: boolean
}

export type SceneSpec =
  | { kind: 'incline'; params: InclineParams }
  | { kind: 'triangle'; params: TriangleParams }
  | { kind: 'sketch'; doc: SketchDoc }
  | { kind: 'solid'; params: SolidParams }
  | { kind: 'solidIncline'; params: SolidInclineParams }
  | { kind: 'motion'; params: MotionParams }

export interface StaticsResult {
  angleDeg: number
  gravity: number
  normal: number
  friction: number
  /** 沿斜面方向的剩余合力，0 表示平衡 */
  net: number
  sliding: boolean
}

export interface Solution {
  points: Record<string, Pt>
  /** 函数曲线的采样折线（按不连续处断开） */
  curves?: Record<string, Pt[][]>
  statics?: StaticsResult
  /** 表达式解析失败的对象 id → 教学语言原因 */
  errors?: Record<string, string>
  status: 'ok' | 'conflict' | 'failed'
  /** 解算后的圆半径（相切等约束会改变半径） */
  circles?: Record<string, number>
  /** 解算锚点：渲染前把整体平移校正掉，避免整张图跳走 */
  anchor?: string
  /** 约束冲突：相关对象与教学语言原因（design.md §7.2） */
  conflict?: { ids: string[]; reason: string }
  ms: number
  source: 'wasm' | 'analytic'
}

export interface SolveRequest {
  id: number
  scene: SceneSpec
  /** 拖动中的点（仅三角形场景使用） */
  drag?: { id: string; x: number; y: number }
}

export interface SolveResponse {
  id: number
  ok: boolean
  solution?: Solution
  fallback?: Solution
  error?: string
}

/* ───────── 运动仿真 ───────── */

export interface SimState {
  /** 仿真时间，秒 */
  time: number
  /** 沿斜面：距底端的距离；通用场景：世界 x */
  x: number
  /** 沿斜面速度（正为向上）或世界 vx */
  v: number
  /** 沿斜面加速度 */
  a: number
  /* 斜面专用读数 */
  gravity?: number
  normal?: number
  friction?: number
  sliding?: boolean
  /* 通用动力学读数 */
  y?: number
  vx?: number
  vy?: number
  /** 单摆角位移（弧度）与角速度 */
  theta?: number
  omega?: number
  energy?: { kinetic: number; potential: number; total: number }
  /** 轨迹采样（最近若干点） */
  trail?: [number, number][]
  ended: boolean
}

export type KernelRequest =
  | {
      id: number
      op: 'solve'
      scene: SceneSpec
      drag?: { id: string; x: number; y: number }
      /** 本次只允许这些点移动，其余点临时固定（加约束时不牵动无关图形） */
      movable?: string[]
    }
  | { id: number; op: 'sim-start'; scene: SceneSpec }
  | { id: number; op: 'sim-advance'; dt: number }
  | { id: number; op: 'sim-reset' }

export interface KernelResponse {
  id: number
  ok: boolean
  solution?: Solution
  sim?: SimState
  fallback?: Solution
  error?: string
}
