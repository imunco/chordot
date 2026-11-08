import type {
  MechCategory,
  MechLink,
  MechLinkKind,
  MechMaterial,
  MechParams,
  MechPart,
  MechPartKind,
  SceneSpec,
} from '../kernel/types'

/**
 * 机构装配（二维）的「词汇表」。
 *
 * 画布上的「部件」是质点 / 刚体 / 支撑 / 传动件 / 装置，「连接」是弹性、刚性、传动或驱动约束：
 * 把部件拖到一起、用连接件串起来，就是一台能动的机构（弹簧振子、单摆、齿轮组、曲柄滑块…）。
 *
 * 坐标系与画布一致：1 世界单位 = 1 米（画布 40px/m），y 轴向上，地面在 MECH_GROUND_Y。
 * 物理用 Matter.js，但弹簧 / 绳 / 磁力 / 推力的力都由我们自己按课本公式施加，
 * k、c、μ、T 才是物理课上讲的量。
 */

/** 地面高度：画布中心略下方，机构都摆在地面以上 */
export const MECH_GROUND_Y = -2.4
/** Matter 的力单位 → 牛顿：实测 F=1e-6 时 1kg 得到 1 m/s² */
export const MECH_FORCE_SCALE = 1e-6
/** 绳的等效劲度：够硬，看起来像不可伸长 */
export const ROPE_K = 4000
/** 杆的刚性约束 */
export const ROD_STIFFNESS = 1
/** 弹簧默认参数 */
export const SPRING_DEFAULTS = { k: 25, c: 0.35 }
/** 活塞默认参数 */
export const PISTON_DEFAULTS = { k: 400, maxForce: 150 }
/** 世界默认参数（老文件没有这些字段时用） */
export const MECH_WORLD_DEFAULTS = { gravity: 9.8, timeScale: 1, airDrag: 0.0015, collisions: true }

/** 材质预设：纸面插画风格的低饱和色 + 一组摩擦 / 恢复系数 */
export const MECH_MATERIALS: Record<
  MechMaterial,
  { label: string; friction: number; restitution: number; fill: string; stroke: string; soft: string }
> = {
  steel: { label: '钢', friction: 0.32, restitution: 0.12, fill: '#e4e3df', stroke: '#4a5560', soft: '#c9c8c3' },
  wood: { label: '木', friction: 0.55, restitution: 0.12, fill: '#ecdfc9', stroke: '#7a5f43', soft: '#d8c4a4' },
  rubber: { label: '橡胶', friction: 0.9, restitution: 0.62, fill: '#cfcac3', stroke: '#5b5a55', soft: '#b6b1a9' },
  plastic: { label: '塑料', friction: 0.34, restitution: 0.45, fill: '#e8e3dd', stroke: '#5d6673', soft: '#cfcac6' },
  ice: { label: '冰面', friction: 0.03, restitution: 0.04, fill: '#e6eef2', stroke: '#6b8794', soft: '#cfe0e8' },
}

/** 渲染形状（画布层按这个画 SVG，物理层按同一套几何建碰撞体） */
export type MechShape =
  | 'ball'
  | 'box'
  | 'cart'
  | 'plank'
  | 'disc'
  | 'hoop'
  | 'wedge'
  | 'weight'
  | 'anchor'
  | 'bracket'
  | 'wall'
  | 'track'
  | 'arc'
  | 'pulley'
  | 'gear'
  | 'rack'
  | 'wheel'
  | 'flywheel'
  | 'conveyor'
  | 'thruster'
  | 'magnet'
  | 'planet'

/** 转动惯量类型：none = 不转（滑块 / 小车），solid = 实心，hoop = 圆环，rod = 细长杆 */
export type MechInertia = 'none' | 'solid' | 'hoop' | 'rod'

export interface MechPartSpec {
  kind: MechPartKind
  label: string
  category: MechCategory
  hint: string
  shape: MechShape
  /** 主尺寸默认值（米） */
  size: number
  /** 次尺寸默认值（米） */
  size2?: number
  mass: number
  /** 固定件：建出来就是静态的，且不能解锁 */
  fixed?: boolean
  /** 转动件默认把中心轴钉住 */
  pinned?: boolean
  inertia: MechInertia
  material: MechMaterial
  /** 额外默认字段 */
  extra?: Partial<MechPart>
}

/** 23 种部件。分类只在部件盘里用，物理层看 kind 本身。 */
export const MECH_PART_CATALOG: MechPartSpec[] = [
  /* ── 刚体 ── */
  {
    kind: 'ball',
    label: '小球',
    category: 'body',
    hint: '质量为 m 的圆球刚体，会滚、会弹',
    shape: 'ball',
    size: 0.28,
    mass: 1,
    inertia: 'solid',
    material: 'steel',
  },
  {
    kind: 'box',
    label: '方块',
    category: 'body',
    hint: '只滑不转的滑块（不会翻倒），最常用的受力物体',
    shape: 'box',
    size: 0.42,
    mass: 2,
    inertia: 'none',
    material: 'wood',
  },
  {
    kind: 'cart',
    label: '小车',
    category: 'body',
    hint: '带轮小车：滚动摩擦很小，适合做运动学 / 碰撞实验',
    shape: 'cart',
    size: 0.5,
    size2: 0.24,
    mass: 3,
    inertia: 'none',
    material: 'wood',
    extra: { friction: 0.06 },
  },
  {
    kind: 'plank',
    label: '木板',
    category: 'body',
    hint: '可自由转动的长条刚体，做杠杆 / 跷跷板 / 斜面',
    shape: 'plank',
    size: 1.2,
    size2: 0.07,
    mass: 2,
    inertia: 'rod',
    material: 'wood',
  },
  {
    kind: 'disc',
    label: '圆盘',
    category: 'body',
    hint: '实心圆盘，转动惯量 ½mr²，可以钉住当转台',
    shape: 'disc',
    size: 0.45,
    mass: 2,
    inertia: 'solid',
    material: 'steel',
  },
  {
    kind: 'hoop',
    label: '圆环',
    category: 'body',
    hint: '薄壁圆环，转动惯量 mr²（比同半径圆盘难转）',
    shape: 'hoop',
    size: 0.4,
    mass: 1,
    inertia: 'hoop',
    material: 'steel',
  },
  {
    kind: 'wedge',
    label: '斜面',
    category: 'body',
    hint: '固定的直角三角形斜面，斜面倾角由底宽与高决定',
    shape: 'wedge',
    size: 1.8,
    size2: 1.4,
    mass: 0,
    fixed: true,
    inertia: 'none',
    material: 'wood',
  },
  {
    kind: 'weight',
    label: '砝码',
    category: 'body',
    hint: '带挂钩的小重物，做杠杆配重 / 悬挂重物',
    shape: 'weight',
    size: 0.18,
    mass: 1,
    inertia: 'none',
    material: 'steel',
  },
  /* ── 支撑 / 场地 ── */
  {
    kind: 'anchor',
    label: '固定点',
    category: 'support',
    hint: '钉死的悬挂点 / 转轴，弹簧、绳、杆都挂在它上面',
    shape: 'anchor',
    size: 0.16,
    mass: 0,
    fixed: true,
    inertia: 'none',
    material: 'steel',
  },
  {
    kind: 'bracket',
    label: '固定座',
    category: 'support',
    hint: '固定在墙面 / 桌面上的底座，做铰链支座、液压缸支点',
    shape: 'bracket',
    size: 0.5,
    size2: 0.3,
    mass: 0,
    fixed: true,
    inertia: 'none',
    material: 'steel',
  },
  {
    kind: 'wall',
    label: '挡板',
    category: 'support',
    hint: '钉死的墙 / 挡板，可以挡球、做碰撞实验',
    shape: 'wall',
    size: 1.2,
    size2: 0.3,
    mass: 0,
    fixed: true,
    inertia: 'none',
    material: 'wood',
  },
  {
    kind: 'track',
    label: '轨道',
    category: 'support',
    hint: '钉死的直轨道，可以设倾角当斜面；滑块可勾「轨道约束」沿它滑',
    shape: 'track',
    size: 2.2,
    mass: 0,
    fixed: true,
    inertia: 'none',
    material: 'wood',
    extra: { angle: 0 },
  },
  {
    kind: 'arcTrack',
    label: '圆弧轨道',
    category: 'support',
    hint: '钉死的圆弧槽，做单摆 / 碗内滚动 / 过山车',
    shape: 'arc',
    size: 2.4,
    mass: 0,
    fixed: true,
    inertia: 'none',
    material: 'steel',
    extra: { angle: -90, span: 150 },
  },
  /* ── 传动 ── */
  {
    kind: 'pulley',
    label: '定滑轮',
    category: 'drive',
    hint: '钉死的滑轮：绳可以绕过它改变方向（在绳的检查器里选）',
    shape: 'pulley',
    size: 0.26,
    mass: 0,
    fixed: true,
    inertia: 'none',
    material: 'plastic',
  },
  {
    kind: 'movablePulley',
    label: '动滑轮',
    category: 'drive',
    hint: '会跟着绳走的滑轮：绳两段各一半张力，能省一半力',
    shape: 'pulley',
    size: 0.26,
    mass: 0.5,
    inertia: 'solid',
    material: 'plastic',
  },
  {
    kind: 'gear',
    label: '齿轮',
    category: 'drive',
    hint: '带齿的圆盘；和另一个齿轮连「齿轮啮合」按半径比传动',
    shape: 'gear',
    size: 0.5,
    mass: 2,
    pinned: true,
    inertia: 'solid',
    material: 'steel',
    extra: { teeth: 16, motor: 0 },
  },
  {
    kind: 'rack',
    label: '齿条',
    category: 'drive',
    hint: '带齿的直条；齿轮咬合后把转动变成平动',
    shape: 'rack',
    size: 1.4,
    size2: 0.12,
    mass: 2,
    fixed: true,
    inertia: 'rod',
    material: 'steel',
    extra: { teeth: 20 },
  },
  {
    kind: 'wheel',
    label: '轮',
    category: 'drive',
    hint: '轮子：中心轴固定就是转动副，可以加电机力矩',
    shape: 'wheel',
    size: 0.42,
    mass: 2,
    inertia: 'solid',
    material: 'wood',
  },
  {
    kind: 'flywheel',
    label: '飞轮',
    category: 'drive',
    hint: '质量集中在边缘的大转动惯量轮，储存转动动能',
    shape: 'flywheel',
    size: 0.55,
    mass: 6,
    pinned: true,
    inertia: 'hoop',
    material: 'steel',
  },
  {
    kind: 'conveyor',
    label: '传送带',
    category: 'drive',
    hint: '钉死的传送带：表面速度可设，放上的物体会被带着走',
    shape: 'conveyor',
    size: 2.2,
    mass: 0,
    fixed: true,
    inertia: 'none',
    material: 'rubber',
    extra: { angle: 0, speed: 1.2 },
  },
  /* ── 装置 / 场 ── */
  {
    kind: 'thruster',
    label: '推力器',
    category: 'field',
    hint: '沿朝向喷出推力 N，可焊接在火箭 / 小车上',
    shape: 'thruster',
    size: 0.3,
    mass: 0.6,
    inertia: 'none',
    material: 'steel',
    extra: { angle: 0, thrust: 15 },
  },
  {
    kind: 'magnet',
    label: '磁铁',
    category: 'field',
    hint: 'N / S 磁极：同性相斥、异性相吸，F ∝ 强度积 / r²',
    shape: 'magnet',
    size: 0.3,
    mass: 1,
    inertia: 'none',
    material: 'steel',
    extra: { pole: 'N', strength: 8 },
  },
  {
    kind: 'planet',
    label: '引力源',
    category: 'field',
    hint: '固定在一点的引力源，向所有物体施加万有引力，可做卫星轨道',
    shape: 'planet',
    size: 0.5,
    mass: 0,
    fixed: true,
    inertia: 'none',
    material: 'plastic',
    extra: { strength: 40 },
  },
]

/** kind → 部件说明，装配 / 渲染 / 检查器共用 */
export const MECH_PART_SPEC = Object.fromEntries(
  MECH_PART_CATALOG.map((s) => [s.kind, s]),
) as Record<MechPartKind, MechPartSpec>

export const MECH_CATEGORIES: { id: MechCategory; label: string }[] = [
  { id: 'body', label: '刚体' },
  { id: 'support', label: '支撑' },
  { id: 'drive', label: '传动' },
  { id: 'field', label: '装置' },
]

export interface MechLinkSpec {
  kind: MechLinkKind
  label: string
  category: 'elastic' | 'rigid' | 'drive' | 'actuator'
  hint: string
}

export const MECH_LINK_CATALOG: MechLinkSpec[] = [
  { kind: 'spring', label: '弹簧', category: 'elastic', hint: '胡克定律 F = k·Δx，可调 k 与阻尼' },
  { kind: 'damper', label: '阻尼', category: 'elastic', hint: '阻尼器 F = c·v，只耗能、不回弹' },
  { kind: 'rope', label: '绳', category: 'rigid', hint: '只拉不推，可绕过多个滑轮 / 动滑轮' },
  { kind: 'rod', label: '杆', category: 'rigid', hint: '刚性连杆，长度锁死（单摆 / 连杆机构）' },
  { kind: 'hinge', label: '铰链', category: 'rigid', hint: '在连接点铰接，能相对转动；可设角度限位' },
  { kind: 'weld', label: '焊接', category: 'rigid', hint: '刚性焊接：相对位置和角度都锁死' },
  { kind: 'belt', label: '皮带', category: 'drive', hint: '带传动：两轮边缘线速度相同，同向转动' },
  { kind: 'gearPair', label: '齿轮啮合', category: 'drive', hint: '齿轮啮合：按半径比反向外传动' },
  { kind: 'rackPinion', label: '齿轮齿条', category: 'drive', hint: '齿轮齿条：转动 ↔ 平动互相转化' },
  { kind: 'piston', label: '活塞', category: 'actuator', hint: '液压 / 气动缸：把两端推到目标长度，有最大推力' },
]

export const MECH_LINK_SPEC = Object.fromEntries(
  MECH_LINK_CATALOG.map((s) => [s.kind, s]),
) as Record<MechLinkKind, MechLinkSpec>

/** 建出来就是静态、且不可解锁的部件 */
export const MECH_STATIC_KINDS: MechPartKind[] = [
  'anchor',
  'bracket',
  'wall',
  'track',
  'arcTrack',
  'pulley',
  'wedge',
  'conveyor',
  'planet',
]

/** 可以加电机力矩的转动件 */
export const MECH_MOTOR_KINDS: MechPartKind[] = ['wheel', 'gear', 'flywheel', 'disc', 'hoop']

let seq = 0
function mechId(prefix: string) {
  seq += 1
  return prefix + Date.now().toString(36).slice(-4) + seq.toString(36)
}

const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d

export function makePart(
  kind: MechPartKind,
  x: number,
  y: number,
  patch: Partial<MechPart> = {},
): MechPart {
  const spec = MECH_PART_SPEC[kind] ?? MECH_PART_SPEC.ball
  const staticKind = MECH_STATIC_KINDS.includes(kind)
  return {
    id: mechId(staticKind ? 'a' : 'b'),
    kind,
    x: round(x),
    y: round(y),
    size: spec.size,
    mass: spec.mass,
    material: spec.material,
    ...(spec.size2 !== undefined ? { size2: spec.size2 } : {}),
    ...(staticKind ? { fixed: true } : {}),
    ...(spec.pinned ? { pinned: true } : {}),
    ...(spec.extra ?? {}),
    ...patch,
  }
}

/** 两点的距离，带部件朝向的偏移也一起算（造的连接自然长度要对得上） */
function restBetween(
  a: MechPart,
  b: MechPart,
  offA?: { x: number; y: number },
  offB?: { x: number; y: number },
) {
  const pa = attachPoint({ x: a.x, y: a.y, angle: ((a.angle ?? 0) * Math.PI) / 180 }, offA)
  const pb = attachPoint({ x: b.x, y: b.y, angle: ((b.angle ?? 0) * Math.PI) / 180 }, offB)
  return Math.hypot(pa.x - pb.x, pa.y - pb.y)
}

export function makeLink(
  kind: MechLinkKind,
  a: MechPart,
  b: MechPart,
  patch: Partial<MechLink> = {},
): MechLink {
  const zero =
    kind === 'hinge' || kind === 'weld' || kind === 'belt' || kind === 'gearPair' || kind === 'rackPinion'
  const rest = zero ? 0 : Math.max(0.05, restBetween(a, b, patch.offsetA, patch.offsetB))
  const base: MechLink = {
    id: mechId('l'),
    kind,
    a: a.id,
    b: b.id,
    rest: round(rest, 2),
    ...(kind === 'spring' ? { ...SPRING_DEFAULTS } : {}),
    ...(kind === 'damper' ? { c: 2 } : {}),
    ...(kind === 'piston' ? { ...PISTON_DEFAULTS, target: round(rest, 2) } : {}),
    ...patch,
  }
  return base
}

export const partOf = (parts: MechPart[], id: string) => parts.find((p) => p.id === id)

/** 绳的滑轮路线：新字段 vias，旧文件只有 via */
export function linkVias(link: MechLink): string[] {
  if (link.vias && link.vias.length > 0) return link.vias
  return link.via ? [link.via] : []
}

/** 局部连接点 → 世界坐标（跟着部件转） */
export function attachPoint(
  body: { x: number; y: number; angle: number },
  off?: { x: number; y: number },
): { x: number; y: number } {
  if (!off) return { x: body.x, y: body.y }
  const c = Math.cos(body.angle)
  const s = Math.sin(body.angle)
  return { x: body.x + off.x * c - off.y * s, y: body.y + off.x * s + off.y * c }
}

/** 连接件当前长度（部件缺失时返回 0） */
export function linkLength(link: MechLink, parts: MechPart[]): number {
  const a = partOf(parts, link.a)
  const b = partOf(parts, link.b)
  if (!a || !b) return 0
  const pa = attachPoint({ x: a.x, y: a.y, angle: ((a.angle ?? 0) * Math.PI) / 180 }, link.offsetA)
  const pb = attachPoint({ x: b.x, y: b.y, angle: ((b.angle ?? 0) * Math.PI) / 180 }, link.offsetB)
  return Math.hypot(pa.x - pb.x, pa.y - pb.y)
}

/**
 * 弹簧振子的理论周期：2π√(μ/k)，μ 是两个可动端的约化质量（一端固定就用另一端）。
 * 两端都固定时没有周期可言，返回 null。
 */
export function springPeriod(link: MechLink, parts: MechPart[]): number | null {
  if (link.kind !== 'spring' || !link.k) return null
  const a = partOf(parts, link.a)
  const b = partOf(parts, link.b)
  if (!a || !b) return null
  const ma = isStaticPart(a) ? Infinity : a.mass
  const mb = isStaticPart(b) ? Infinity : b.mass
  let mu = 0
  if (!Number.isFinite(ma) && !Number.isFinite(mb)) return null
  if (!Number.isFinite(ma)) mu = mb
  else if (!Number.isFinite(mb)) mu = ma
  else mu = (ma * mb) / (ma + mb)
  if (!Number.isFinite(mu) || mu <= 0) return null
  return 2 * Math.PI * Math.sqrt(mu / link.k)
}

export function isStaticPart(p: MechPart): boolean {
  return Boolean(p.fixed) || MECH_STATIC_KINDS.includes(p.kind)
}

/** 转动惯量类型：方块 / 小车 / 砝码不转；木板按细杆；圆环按 mr² */
export function inertiaKind(p: MechPart): MechInertia {
  return MECH_PART_SPEC[p.kind]?.inertia ?? 'solid'
}

export function materialOf(p: MechPart): { friction: number; restitution: number } {
  const m = MECH_MATERIALS[p.material ?? 'wood'] ?? MECH_MATERIALS.wood
  return {
    friction: typeof p.friction === 'number' ? p.friction : m.friction,
    restitution: typeof p.restitution === 'number' ? p.restitution : m.restitution,
  }
}

/** 齿轮 / 带轮的节圆半径 */
export function gearRadius(p: MechPart): number {
  return Math.max(0.06, p.size)
}

/**
 * 传动比（从动 / 主动）。缺省按两个部件的半径反算：
 * gearPair 与 belt 的 ratio 都是「从动角速度 / 主动角速度」，齿轮取负、皮带取正。
 */
export function linkRatio(link: MechLink, parts: MechPart[]): number {
  const a = partOf(parts, link.a)
  const b = partOf(parts, link.b)
  if (!a || !b) return 1
  if (typeof link.ratio === 'number' && Number.isFinite(link.ratio) && link.ratio !== 0) return link.ratio
  const ra = gearRadius(a)
  const rb = gearRadius(b)
  const mag = ra / rb
  return link.kind === 'gearPair' ? -mag : mag
}

/** 机构里的「可动部件」数量，用来判断是不是空场 */
export const movableCount = (params: MechParams) => params.parts.filter((p) => !isStaticPart(p)).length

export function emptyMechScene(): SceneSpec {
  return { kind: 'mech', params: { parts: [], links: [], ...MECH_WORLD_DEFAULTS } }
}

/* ───────── 预设 ───────── */

export type MechPresetId =
  | 'empty'
  | 'spring'
  | 'springTrack'
  | 'pendulum'
  | 'cart'
  | 'pulley'
  | 'pulleyGroup'
  | 'movablePulley'
  | 'wheel'
  | 'gearTrain'
  | 'beltDrive'
  | 'lever'
  | 'crankSlider'
  | 'arcTrack'
  | 'piston'
  | 'rocket'
  | 'magnet'
  | 'wedgeSlide'

export interface MechPreset {
  id: MechPresetId
  label: string
  group: '基础' | '传动' | '装置'
  file: string
  make: () => SceneSpec
}

const scene = (parts: MechPart[], links: MechLink[], extra: Partial<MechParams> = {}): SceneSpec => ({
  kind: 'mech',
  params: { parts, links, ...MECH_WORLD_DEFAULTS, ...extra },
})

/** 竖直弹簧振子：锚点 + 小球 + 弹簧，一开始就偏离平衡位置 */
function springOscillatorScene(): SceneSpec {
  const anchor = makePart('anchor', 0, 3.4)
  const ball = makePart('ball', 0, 0.5, { mass: 1 })
  const spring = makeLink('spring', anchor, ball, { rest: 1.3, k: 25, c: 0.35 })
  return scene([anchor, ball], [spring])
}

/** 水平弹簧振子：轨道上滑块 + 固定点 + 弹簧 */
function mechSpringTrackScene(): SceneSpec {
  const y = MECH_GROUND_Y + 0.36
  const wall = makePart('anchor', -2.2, y)
  const track = makePart('track', 0.2, MECH_GROUND_Y, { size: 2.4 })
  const box = makePart('box', 0.5, y, { mass: 1.5, size: 0.3, onTrack: track.id })
  const spring = makeLink('spring', wall, box, { rest: 1.4, k: 22, c: 0.25 })
  return scene([wall, track, box], [spring])
}

/** 单摆：锚点 + 小球 + 刚性杆 */
function mechPendulumScene(): SceneSpec {
  const anchor = makePart('anchor', 0, 3.4)
  const ball = makePart('ball', 1.7, 1.9, { mass: 1 })
  const rod = makeLink('rod', anchor, ball)
  return scene([anchor, ball], [rod])
}

/** 小车 + 弹簧：小车被弹簧拉着在地面上往复 */
function mechCartScene(): SceneSpec {
  const y = MECH_GROUND_Y + 0.42
  const wall = makePart('anchor', -3.6, y)
  const cart = makePart('box', 0.6, y, { mass: 2, size: 0.42 })
  const spring = makeLink('spring', wall, cart, { rest: 2.6, k: 18, c: 0.6 })
  return scene([wall, cart], [spring])
}

/** 定滑轮：小车在桌面上，绳绕过滑轮吊着重物 */
function mechPulleyScene(): SceneSpec {
  const cart = makePart('ball', -2.4, MECH_GROUND_Y + 0.28, { mass: 2, size: 0.28 })
  const pulley = makePart('pulley', 1.9, 1.3, { size: 0.3 })
  const weight = makePart('ball', 1.9, -0.6, { mass: 2.4 })
  const total =
    Math.hypot(cart.x - pulley.x, cart.y - pulley.y) + Math.hypot(weight.x - pulley.x, weight.y - pulley.y)
  const rope = makeLink('rope', cart, weight, { rest: Math.round(total * 100) / 100 })
  rope.vias = [pulley.id]
  return scene([cart, pulley, weight], [rope])
}

/** 滑轮组：双滑轮阿特伍德机，两边绳子竖直 */
function mechPulleyGroupScene(): SceneSpec {
  const p1 = makePart('pulley', -1.2, 3.2, { size: 0.26 })
  const p2 = makePart('pulley', 1.2, 3.2, { size: 0.26 })
  const a = makePart('ball', -1.2, 1.0, { mass: 1.4 })
  const b = makePart('ball', 1.2, 1.0, { mass: 1 })
  const total =
    Math.hypot(a.x - p1.x, a.y - p1.y) +
    Math.hypot(p2.x - p1.x, p2.y - p1.y) +
    Math.hypot(b.x - p2.x, b.y - p2.y)
  const rope = makeLink('rope', a, b, { rest: Math.round(total * 100) / 100 })
  rope.vias = [p1.id, p2.id]
  return scene([p1, p2, a, b], [rope])
}

/**
 * 动滑轮：绳一端固定在顶上，向下绕过动滑轮，再向上绕过定滑轮，最后垂到手边。
 * 手向下拉（这里是重手自然下落），动滑轮带着重物上升 —— 两段绳分担，省一半力。
 * （若绳直接连到手，手在滑轮上方时绳段会先松弛，前 1 秒看不出提升；定滑轮把方向翻过来最稳）
 */
function mechMovablePulleyScene(): SceneSpec {
  const anchor = makePart('anchor', -0.6, 3.2)
  const pulley = makePart('movablePulley', 0.8, 1.4, { size: 0.3, mass: 0.5 })
  const load = makePart('ball', 0.8, 0.2, { mass: 2.5 })
  const rod = makeLink('rod', pulley, load, { rest: 1.2 })
  const fixed = makePart('pulley', 2.3, 3.2, { size: 0.3 })
  const hand = makePart('ball', 2.3, 1.0, { mass: 3.2 })
  const rest =
    Math.hypot(pulley.x - anchor.x, pulley.y - anchor.y) +
    Math.hypot(fixed.x - pulley.x, fixed.y - pulley.y) +
    Math.hypot(hand.x - fixed.x, hand.y - fixed.y)
  const rope = makeLink('rope', anchor, hand, { rest: Math.round(rest * 100) / 100 })
  rope.vias = [pulley.id, fixed.id]
  return scene([anchor, pulley, load, fixed, hand], [rod, rope])
}

/** 电机带动的轮 */
function mechWheelScene(): SceneSpec {
  const wheel = makePart('wheel', -1.2, -1.6, { size: 0.7, mass: 3, pinned: true, motor: 1.6 })
  const ground = makePart('track', 0.9, MECH_GROUND_Y, { size: 2.6, angle: 0 })
  return scene([wheel, ground], [])
}

/** 齿轮传动：电机齿轮 → 惰轮 → 从动齿轮，相邻齿轮节圆相切 */
function mechGearTrainScene(): SceneSpec {
  const g1 = makePart('gear', -1.09, 1.2, { size: 0.62, teeth: 20, mass: 2.4, pinned: true, motor: 2.4 })
  const g2 = makePart('gear', -0.05, 1.2, { size: 0.42, teeth: 14, mass: 1.4, pinned: true })
  const g3 = makePart('gear', 0.99, 1.2, { size: 0.62, teeth: 20, mass: 2.4, pinned: true })
  const l1 = makeLink('gearPair', g1, g2)
  const l2 = makeLink('gearPair', g2, g3)
  return scene([g1, g2, g3], [l1, l2])
}

/** 带传动：两个带轮 + 皮带 */
function mechBeltDriveScene(): SceneSpec {
  const w1 = makePart('wheel', -1.4, 1.2, { size: 0.6, mass: 3, pinned: true, motor: 1.8 })
  const w2 = makePart('wheel', 1.2, 1.2, { size: 0.36, mass: 2, pinned: true })
  const belt = makeLink('belt', w1, w2)
  return scene([w1, w2], [belt])
}

/** 杠杆：支点 + 木板 + 两端砝码 */
function mechLeverScene(): SceneSpec {
  const bracket = makePart('bracket', 0, 1.9, { size: 0.5, size2: 0.3 })
  const plank = makePart('plank', 0, 1.9, { size: 1.6, size2: 0.07, mass: 1.2 })
  const hinge = makeLink('hinge', bracket, plank)
  const left = makePart('weight', -1.35, 1.9, { mass: 3, size: 0.22 })
  const right = makePart('weight', 1.35, 1.9, { mass: 1, size: 0.22 })
  const wl = makeLink('weld', left, plank, { offsetA: { x: 0, y: 0 }, offsetB: { x: -1.35, y: 0 } })
  const wr = makeLink('weld', right, plank, { offsetA: { x: 0, y: 0 }, offsetB: { x: 1.35, y: 0 } })
  return scene([bracket, plank, left, right], [hinge, wl, wr])
}

/** 曲柄滑块：电机轮 → 连杆 → 轨道上的滑块 */
function mechCrankSliderScene(): SceneSpec {
  const wheel = makePart('wheel', -1.5, -1.2, { size: 0.55, mass: 2, pinned: true, motor: 3 })
  const track = makePart('track', 0.9, MECH_GROUND_Y, { size: 2.4 })
  const slider = makePart('box', 1.3, MECH_GROUND_Y + 0.36, { mass: 1, size: 0.3, onTrack: track.id })
  const rim = { x: wheel.x + 0.55, y: wheel.y }
  const rest = Math.hypot(slider.x - rim.x, slider.y - rim.y)
  const rod = makeLink('rod', wheel, slider, {
    offsetA: { x: 0.55, y: 0 },
    offsetB: { x: 0, y: 0 },
    rest: Math.round(rest * 100) / 100,
  })
  return scene([wheel, track, slider], [rod])
}

/** 圆弧轨道：小球从碗边滚下 */
function mechArcTrackScene(): SceneSpec {
  const arc = makePart('arcTrack', 0, 2.2, { size: 2.4, span: 150, angle: -90 })
  const r = 2.4 - 0.25
  const th = (-60 * Math.PI) / 180
  const ball = makePart('ball', Math.cos(th) * r, 2.2 + Math.sin(th) * r, { size: 0.25, mass: 1 })
  return scene([arc, ball], [])
}

/** 液压缸：固定座 + 活塞把小车推出去 */
function mechPistonScene(): SceneSpec {
  const bracket = makePart('bracket', -2.6, MECH_GROUND_Y + 0.36, { size: 0.4, size2: 0.4 })
  const cart = makePart('cart', 0.4, MECH_GROUND_Y + 0.26, { mass: 2 })
  const piston = makeLink('piston', bracket, cart, {
    rest: 3.0,
    target: 3.8,
    maxForce: 100,
    k: 400,
  })
  return scene([bracket, cart], [piston])
}

/**
 * 火箭推力：推力器焊接在滑块尾部。
 * 放在失重环境里（空格演示「反冲 / 持续推进」最干净）：地面上 Matter 的静摩擦
 * 会把这种小推力「粘」住，喷口对着地面也看不出反冲。
 */
function mechRocketScene(): SceneSpec {
  const body = makePart('box', 0.1, 0, { size: 0.4, mass: 1.6 })
  const jet = makePart('thruster', -0.85, 0, {
    size: 0.28,
    mass: 0.6,
    thrust: 30,
    angle: 0,
  })
  const weld = makeLink('weld', jet, body, { offsetA: { x: 0, y: 0 }, offsetB: { x: -0.85, y: 0 } })
  return scene([body, jet], [weld], { gravity: 0, airDrag: 0.0006 })
}

/** 磁铁：N 极固定，S 极被吸过去（失重环境） */
function mechMagnetScene(): SceneSpec {
  const n = makePart('magnet', -1.2, 0.4, { size: 0.32, mass: 1, pole: 'N', strength: 14 })
  const s = makePart('magnet', 1.2, 0.4, { size: 0.32, mass: 1, pole: 'S', strength: 10 })
  return scene([n, s], [], { gravity: 0, airDrag: 0.22 })
}

/** 斜面滑块：静摩擦实验 */
function mechWedgeScene(): SceneSpec {
  const wedge = makePart('wedge', 0, MECH_GROUND_Y + 0.7, { size: 1.8, size2: 1.4 })
  const slope = Math.atan2(1.4, 3.6)
  const x = 0.5
  const topY = wedge.y + 0.7 - ((x - wedge.x + 1.8) / 3.6) * 1.4
  const box = makePart('box', x + Math.sin(slope) * 0.32, topY + Math.cos(slope) * 0.32, {
    size: 0.26,
    mass: 1,
    angle: (slope * 180) / Math.PI,
  })
  return scene([wedge, box], [])
}

export const MECH_PRESETS: MechPreset[] = [
  { id: 'empty', label: '空白装配台', group: '基础', file: '机构装配.chordot', make: emptyMechScene },
  {
    id: 'spring',
    label: '弹簧振子',
    group: '基础',
    file: '机构装配·弹簧振子.chordot',
    make: springOscillatorScene,
  },
  {
    id: 'springTrack',
    label: '水平弹簧振子',
    group: '基础',
    file: '机构装配·水平弹簧振子.chordot',
    make: mechSpringTrackScene,
  },
  { id: 'pendulum', label: '单摆', group: '基础', file: '机构装配·单摆.chordot', make: mechPendulumScene },
  { id: 'cart', label: '小车+弹簧', group: '基础', file: '机构装配·小车弹簧.chordot', make: mechCartScene },
  { id: 'lever', label: '杠杆', group: '基础', file: '机构装配·杠杆.chordot', make: mechLeverScene },
  {
    id: 'wedgeSlide',
    label: '斜面滑块',
    group: '基础',
    file: '机构装配·斜面滑块.chordot',
    make: mechWedgeScene,
  },
  {
    id: 'arcTrack',
    label: '圆弧轨道',
    group: '基础',
    file: '机构装配·圆弧轨道.chordot',
    make: mechArcTrackScene,
  },
  { id: 'pulley', label: '定滑轮', group: '传动', file: '机构装配·定滑轮.chordot', make: mechPulleyScene },
  {
    id: 'pulleyGroup',
    label: '滑轮组',
    group: '传动',
    file: '机构装配·滑轮组.chordot',
    make: mechPulleyGroupScene,
  },
  {
    id: 'movablePulley',
    label: '动滑轮',
    group: '传动',
    file: '机构装配·动滑轮.chordot',
    make: mechMovablePulleyScene,
  },
  { id: 'wheel', label: '电机轮', group: '传动', file: '机构装配·电机轮.chordot', make: mechWheelScene },
  {
    id: 'gearTrain',
    label: '齿轮传动',
    group: '传动',
    file: '机构装配·齿轮传动.chordot',
    make: mechGearTrainScene,
  },
  {
    id: 'beltDrive',
    label: '带传动',
    group: '传动',
    file: '机构装配·带传动.chordot',
    make: mechBeltDriveScene,
  },
  {
    id: 'crankSlider',
    label: '曲柄滑块',
    group: '传动',
    file: '机构装配·曲柄滑块.chordot',
    make: mechCrankSliderScene,
  },
  { id: 'piston', label: '液压缸', group: '传动', file: '机构装配·液压缸.chordot', make: mechPistonScene },
  { id: 'rocket', label: '火箭推力', group: '装置', file: '机构装配·火箭推力.chordot', make: mechRocketScene },
  { id: 'magnet', label: '磁铁', group: '装置', file: '机构装配·磁铁.chordot', make: mechMagnetScene },
]

export const presetById = (id: MechPresetId) => MECH_PRESETS.find((p) => p.id === id) ?? MECH_PRESETS[0]

/* ───────── 老文件迁移 / 参数归一化 ───────── */

/**
 * 打开旧课件时把机构参数补全：
 * - 旧版只有 6 种部件、4 种连接，字段缺失时按目录补默认值；
 * - via 单滑轮迁移到 vias；
 * - 世界参数（timeScale / airDrag / collisions）缺失时补默认。
 */
export function normalizeMechParams(input: MechParams): MechParams {
  const parts = (Array.isArray(input.parts) ? input.parts : []).map((p) => {
    const spec = MECH_PART_SPEC[p.kind] ?? MECH_PART_SPEC.ball
    const base: MechPart = {
      ...p,
      size: typeof p.size === 'number' && p.size > 0 ? p.size : spec.size,
      mass: typeof p.mass === 'number' ? p.mass : spec.mass,
      material: p.material ?? spec.material,
    }
    if (typeof p.size2 === 'number') base.size2 = p.size2
    else if (spec.size2 !== undefined) base.size2 = spec.size2
    if (p.kind === 'arcTrack' && typeof p.span !== 'number') base.span = 150
    if (p.kind === 'conveyor' && typeof p.speed !== 'number') base.speed = 1.2
    if (p.kind === 'thruster' && typeof p.thrust !== 'number') base.thrust = 15
    if (p.kind === 'magnet') {
      if (typeof p.pole !== 'string') base.pole = 'N'
      if (typeof p.strength !== 'number') base.strength = 8
    }
    if (p.kind === 'planet' && typeof p.strength !== 'number') base.strength = 40
    if (p.kind === 'gear' && typeof p.teeth !== 'number') base.teeth = 16
    if (MECH_STATIC_KINDS.includes(p.kind)) base.fixed = true
    return base
  })
  const links = (Array.isArray(input.links) ? input.links : []).map((l) => ({
    ...l,
    vias: linkVias(l),
    via: undefined,
  }))
  return {
    parts,
    links,
    gravity: typeof input.gravity === 'number' ? input.gravity : MECH_WORLD_DEFAULTS.gravity,
    timeScale: typeof input.timeScale === 'number' ? input.timeScale : MECH_WORLD_DEFAULTS.timeScale,
    airDrag: typeof input.airDrag === 'number' ? input.airDrag : MECH_WORLD_DEFAULTS.airDrag,
    collisions: typeof input.collisions === 'boolean' ? input.collisions : true,
  }
}
