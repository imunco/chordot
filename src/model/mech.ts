import type {
  MechLink,
  MechLinkKind,
  MechParams,
  MechPart,
  MechPartKind,
  SceneSpec,
} from '../kernel/types'

/**
 * 机构装配（二维）。
 *
 * 画布上的「部件」是质点 / 刚体，「连接」是弹簧、绳、杆：
 * 把部件拖到一起、用连接件串起来，就是一台能动的机构（弹簧振子、单摆、小车+弹簧…）。
 *
 * 坐标系与画布一致：1 世界单位 = 1 米（画布 40px/m）。
 * 物理用 Matter.js（和 physics-sandbox 同一个引擎、同一版本），
 * 但弹簧 / 绳的力由我们自己按胡克定律施加，k、c 才是物理课上讲的量。
 */

/** 地面高度：画布中心略下方，机构都摆在地面以上 */
export const MECH_GROUND_Y = -2.4
/** Matter 的力单位 → 牛顿：实测 F=1e-6 时 1kg 得到 1 m/s² */
export const MECH_FORCE_SCALE = 1e-6
/** 绳的等效劲度：够硬，看起来像不可伸长 */
export const ROPE_K = 4000
/** 杆的刚性约束 */
export const ROD_STIFFNESS = 1
/** 部件默认尺寸与质量 */
export const MECH_DEFAULTS: Record<MechPartKind, { size: number; mass: number }> = {
  ball: { size: 0.28, mass: 1 },
  box: { size: 0.42, mass: 2 },
  anchor: { size: 0.16, mass: 0 },
  // 轨道：size 是半长；滑轮：半径；轮：半径
  track: { size: 2.2, mass: 0 },
  pulley: { size: 0.26, mass: 0 },
  wheel: { size: 0.42, mass: 2 },
}
/** 这些部件是钉死的（不参与自由运动） */
export const MECH_STATIC_KINDS: MechPartKind[] = ['anchor', 'track', 'pulley']
/** 弹簧默认参数 */
export const SPRING_DEFAULTS = { k: 25, c: 0.35 }

let seq = 0
function mechId(prefix: string) {
  seq += 1
  return `${prefix}${Date.now().toString(36).slice(-4)}${seq.toString(36)}`
}

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d

export function makePart(
  kind: MechPartKind,
  x: number,
  y: number,
  patch: Partial<MechPart> = {},
): MechPart {
  const d = MECH_DEFAULTS[kind]
  const isStatic = MECH_STATIC_KINDS.includes(kind)
  return {
    id: mechId(isStatic ? 'a' : 'b'),
    kind,
    x: round(x),
    y: round(y),
    size: d.size,
    mass: d.mass,
    ...(isStatic ? { fixed: true } : {}),
    ...(kind === 'track' ? { angle: 0 } : {}),
    ...patch,
  }
}

export function makeLink(
  kind: MechLinkKind,
  a: MechPart,
  b: MechPart,
  patch: Partial<MechLink> = {},
): MechLink {
  const rest = kind === 'hinge' ? 0 : Math.max(0.2, Math.hypot(a.x - b.x, a.y - b.y))
  return {
    id: mechId('l'),
    kind,
    a: a.id,
    b: b.id,
    rest: round(rest),
    ...(kind === 'spring' ? { ...SPRING_DEFAULTS } : {}),
    ...patch,
  }
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
  return Math.hypot(a.x - b.x, a.y - b.y)
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
  const ma = a.fixed || a.kind === 'anchor' ? Infinity : a.mass
  const mb = b.fixed || b.kind === 'anchor' ? Infinity : b.mass
  let mu = 0
  if (!Number.isFinite(ma) && !Number.isFinite(mb)) return null
  if (!Number.isFinite(ma)) mu = mb
  else if (!Number.isFinite(mb)) mu = ma
  else mu = (ma * mb) / (ma + mb)
  if (!Number.isFinite(mu) || mu <= 0) return null
  return 2 * Math.PI * Math.sqrt(mu / link.k)
}

/** 机构里的「可动部件」数量，用来判断是不是空场 */
export const movableCount = (params: MechParams) =>
  params.parts.filter((p) => !p.fixed && p.kind !== 'anchor').length

export function emptyMechScene(): SceneSpec {
  return { kind: 'mech', params: { parts: [], links: [], gravity: 9.8 } }
}

/** 预设：竖直弹簧振子（锚点 + 小球 + 弹簧），一开始就偏离平衡位置 */
export function springOscillatorScene(): SceneSpec {
  const anchor = makePart('anchor', 0, 3.4)
  const ball = makePart('ball', 0, 0.5, { mass: 1 })
  const spring = makeLink('spring', anchor, ball, { rest: 1.3, k: 25, c: 0.35 })
  return { kind: 'mech', params: { parts: [anchor, ball], links: [spring], gravity: 9.8 } }
}

/** 预设：单摆（锚点 + 小球 + 刚性杆） */
export function mechPendulumScene(): SceneSpec {
  const anchor = makePart('anchor', 0, 3.4)
  const ball = makePart('ball', 1.7, 1.9, { mass: 1 })
  const rod = makeLink('rod', anchor, ball)
  return { kind: 'mech', params: { parts: [anchor, ball], links: [rod], gravity: 9.8 } }
}

/**
 * 预设：定滑轮改变方向 —— 小车在桌面上，绳绕过滑轮吊着重物，重物下落把小车拉过去。
 * （单滑轮的「阿特伍德机」两边绳子是斜的，会变成摆动，不如这个干净）
 */
export function mechPulleyScene(): SceneSpec {
  // 小车用球（滚动阻力小，被绳一拉就走；方块和地面的静摩擦太大，会「僵」住）
  const cart = makePart('ball', -2.4, MECH_GROUND_Y + 0.28, { mass: 2, size: 0.28 })
  const pulley = makePart('pulley', 1.9, 1.3, { size: 0.3 })
  const weight = makePart('ball', 1.9, -0.6, { mass: 2.4 })
  // 绳长 = 两段之和，一开始就绷直
  const total =
    Math.hypot(cart.x - pulley.x, cart.y - pulley.y) +
    Math.hypot(weight.x - pulley.x, weight.y - pulley.y)
  const rope = makeLink('rope', cart, weight, { rest: Math.round(total * 100) / 100 })
  rope.vias = [pulley.id]
  return { kind: 'mech', params: { parts: [cart, pulley, weight], links: [rope], gravity: 9.8 } }
}

/**
 * 预设：滑轮组（双滑轮阿特伍德机）。
 * 两边的绳子都是竖直的，重的一边下沉、轻的一边上升，不会像单滑轮那样摆起来。
 */
export function mechPulleyGroupScene(): SceneSpec {
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
  return { kind: 'mech', params: { parts: [p1, p2, a, b], links: [rope], gravity: 9.8 } }
}

/** 预设：电机带动的轮（中心轴固定，给学生看转动） */
export function mechWheelScene(): SceneSpec {
  const wheel = makePart('wheel', -1.2, -1.6, { size: 0.7, mass: 3, pinned: true, motor: 1.6 })
  const ground = makePart('track', 0.9, MECH_GROUND_Y, { size: 2.6, angle: 0 })
  return { kind: 'mech', params: { parts: [wheel, ground], links: [], gravity: 9.8 } }
}

/** 预设：小车 + 两根弹簧（一端固定，另一端手推） */
export function mechCartScene(): SceneSpec {
  // 地面在 -2.4，方块的半边 0.42 → 中心 -1.98 正好贴地
  const y = MECH_GROUND_Y + 0.42
  const wall = makePart('anchor', -3.6, y)
  const cart = makePart('box', 0.6, y, { mass: 2, size: 0.42 })
  const spring = makeLink('spring', wall, cart, { rest: 2.6, k: 18, c: 0.6 })
  return { kind: 'mech', params: { parts: [wall, cart], links: [spring], gravity: 9.8 } }
}
