import { compile, lusolve, matrix } from 'mathjs'
import type {
  InclineParams,
  Pt,
  SceneSpec,
  SketchConstraint,
  SketchDoc,
  Solution,
  StaticsResult,
  TriangleParams,
} from './types'

/** 几何常量：斜面底端固定，长度固定，倾角由顶端位置决定 */
export const INCLINE = {
  ax: -4,
  ay: 0,
  length: 9.24,
  /** 物块半边长 */
  half: 0.62,
  /** 重力加速度（教学取 10） */
  g: 10,
}

const DEG = Math.PI / 180

export function inclineFrame(angleDeg: number) {
  const th = angleDeg * DEG
  const u = { x: Math.cos(th), y: Math.sin(th) }
  const n = { x: -Math.sin(th), y: Math.cos(th) }
  const a = { x: INCLINE.ax, y: INCLINE.ay }
  const b = { x: a.x + INCLINE.length * u.x, y: a.y + INCLINE.length * u.y }
  return { u, n, a, b }
}

/** 倾角 → 顶端 B 的坐标（拖动 B 时反向使用） */
export function angleFromPoint(p: Pt): number {
  const dx = p.x - INCLINE.ax
  const dy = p.y - INCLINE.ay
  const raw = (Math.atan2(dy, dx) * 180) / Math.PI
  return Math.min(75, Math.max(5, raw))
}

export function inclinePoints(params: InclineParams): Record<string, Pt> {
  const { u, n, a, b } = inclineFrame(params.angleDeg)
  const p = {
    x: a.x + (b.x - a.x) * params.t,
    y: a.y + (b.y - a.y) * params.t,
  }
  const h = INCLINE.half
  const c = { x: p.x + n.x * h, y: p.y + n.y * h }
  const corners = [
    { x: c.x - u.x * h - n.x * h, y: c.y - u.y * h - n.y * h },
    { x: c.x + u.x * h - n.x * h, y: c.y + u.y * h - n.y * h },
    { x: c.x + u.x * h + n.x * h, y: c.y + u.y * h + n.y * h },
    { x: c.x - u.x * h + n.x * h, y: c.y - u.y * h + n.y * h },
  ]
  return {
    A: a,
    B: b,
    P: c,
    c1: corners[0],
    c2: corners[1],
    c3: corners[2],
    c4: corners[3],
  }
}

/**
 * 共点力平衡：以斜面法向 n 与切向 u 为基底解 2×2 线性方程组
 *   N·n + f·u + G = 0
 * 再叠加摩擦上限 |f| ≤ μN，超限则记录滑动时的剩余合力。
 */
export function solveInclineStatics(angleDeg: number, mass: number, mu: number): StaticsResult {
  const { u, n } = inclineFrame(angleDeg)
  const G = { x: 0, y: -mass * INCLINE.g }

  const A = matrix([
    [n.x, u.x],
    [n.y, u.y],
  ])
  const rhs = matrix([-G.x, -G.y])
  const sol = lusolve(A, rhs) as unknown as { get: (i: number[]) => number }

  const normal = sol.get([0, 0])
  const friction = sol.get([1, 0])
  const limit = mu * Math.abs(normal)
  const sliding = Math.abs(friction) > limit + 1e-9
  const applied = sliding ? Math.sign(friction) * limit : friction

  const netX = G.x + normal * n.x + applied * u.x
  const netY = G.y + normal * n.y + applied * u.y

  return {
    angleDeg,
    gravity: Math.hypot(G.x, G.y),
    normal: Math.abs(normal),
    friction: Math.abs(applied),
    net: Math.hypot(netX, netY),
    sliding,
  }
}

/** 三角形三边能否闭合；不能时给出教学语言原因 */
export function triangleConflict(
  params: TriangleParams,
): { ids: string[]; reason: string } | null {
  const sides = params.lengths.map((l) => l.d).sort((x, y) => x - y)
  if (sides.length < 3) return null
  const [x, y, z] = sides
  if (x + y <= z + 1e-9) {
    return {
      ids: params.points.map((p) => p.id),
      reason: `最长边 ${z.toFixed(1)} 大于另外两边之和 ${(x + y).toFixed(1)}，这三条边围不成三角形`,
    }
  }
  return null
}

/** 纯 JS 求解：主线程首帧同步使用，Worker 内也复用同一份几何逻辑 */
export function solveScene(scene: SceneSpec): Solution {
  const t0 = performance.now()

  if (scene.kind === 'incline') {
    const params = scene.params
    return {
      points: inclinePoints(params),
      statics: solveInclineStatics(params.angleDeg, params.mass, params.mu),
      status: 'ok',
      ms: performance.now() - t0,
      source: 'analytic',
    }
  }

  if (scene.kind === 'sketch') {
    const points: Record<string, Pt> = {}
    for (const p of scene.doc.points) points[p.id] = { x: p.x, y: p.y }
    const curves: Record<string, Pt[][]> = {}
    const errors: Record<string, string> = {}
    for (const f of scene.doc.functions) {
      const sampled = sampleFunction(f.expr)
      curves[f.id] = sampled.curves
      if (sampled.error) errors[f.id] = sampled.error
    }
    return {
      points,
      curves,
      errors: Object.keys(errors).length ? errors : undefined,
      status: 'ok',
      ms: performance.now() - t0,
      source: 'analytic',
    }
  }

  if (scene.kind === 'motion') {
    // 动力学场景的位置由仿真给出，首帧用初始构型
    return { points: {}, status: 'ok', ms: performance.now() - t0, source: 'analytic' }
  }

  if (scene.kind === 'solid' || scene.kind === 'solidIncline') {
    // 三维几何在渲染层按相机投影，内核无需产出坐标
    return { points: {}, status: 'ok', ms: performance.now() - t0, source: 'analytic' }
  }

  const params: TriangleParams = scene.params
  const points: Record<string, Pt> = {}
  for (const p of params.points) points[p.id] = { x: p.x, y: p.y }
  const conflict = triangleConflict(params)
  return {
    points,
    status: conflict ? 'conflict' : 'ok',
    conflict: conflict ?? undefined,
    ms: performance.now() - t0,
    source: 'analytic',
  }
}

/* ───────── 约束的作用范围 ───────── */

/**
 * 施加一条约束时，允许移动的点。
 * 其余点求解期间临时固定，求解完随求解器一起释放 —— 新约束只改它该改的图形。
 *
 * 语义按「谁是主体、谁是参照物」划分：
 * - 点在线上 / 中点：点去就位，线不动
 * - 相切：半径已锁，圆平移去贴线，线不动
 * - 水平 / 竖直：这条线的两个端点一起转
 * - 等长 / 平行 / 垂直：两条线都参与调整
 */
export function constraintMovers(doc: SketchDoc, c: SketchConstraint): string[] {
  const ends = (lineId: string): string[] => {
    const seg = doc.segments.find((s) => s.id === lineId)
    return seg ? [seg.a, seg.b] : []
  }
  const uniq = (ids: string[]) => [...new Set(ids)]

  switch (c.type) {
    case 'on-line':
    case 'midpoint':
      return uniq(c.points ?? [])
    case 'tangent':
      return uniq(
        (c.circles ?? []).flatMap((id) => {
          const circle = doc.circles.find((q) => q.id === id)
          return circle ? [circle.c] : []
        }),
      )
    case 'horizontal':
    case 'vertical':
      return uniq(ends(c.lines[0]))
    default:
      return uniq(c.lines.flatMap(ends))
  }
}

/* ───────── 约束的初值 ───────── */

/**
 * 平行 / 垂直的初值修正。
 *
 * planegcs 用数值迭代求解，而「两条线都缩成一个点」也能满足平行与垂直
 * （零向量与任何向量都正交）。初值里两条线越接近目标夹角、越远离这种退化解，
 * 迭代就走得越稳。初值本来就不满足目标关系时，先把第二条线绕起点转 90° 起手。
 *
 * 返回需要覆盖的点坐标；无需修正时返回 null。
 */
export function seedForConstraint(
  doc: SketchDoc,
  c: SketchConstraint,
  at: (id: string) => Pt | undefined,
): Record<string, Pt> | null {
  if (c.type !== 'perpendicular' && c.type !== 'parallel') return null
  const [l1, l2] = c.lines
  const s1 = doc.segments.find((s) => s.id === l1)
  const s2 = doc.segments.find((s) => s.id === l2)
  if (!s1 || !s2) return null
  const a = at(s1.a)
  const b = at(s1.b)
  const p = at(s2.a)
  const q = at(s2.b)
  if (!a || !b || !p || !q) return null

  const lu = Math.hypot(b.x - a.x, b.y - a.y)
  const lv = Math.hypot(q.x - p.x, q.y - p.y)
  if (lu < 1e-6 || lv < 1e-6) return null
  const cos = ((b.x - a.x) * (q.x - p.x) + (b.y - a.y) * (q.y - p.y)) / (lu * lv)
  const satisfied = c.type === 'perpendicular' ? Math.abs(cos) < 0.15 : Math.abs(cos) > 0.985
  if (satisfied) return null

  // 绕第二条线的起点转 90°：方向任取一支，用户随后可以拖
  return { [s2.b]: { x: p.x - (q.y - p.y), y: p.y + (q.x - p.x) } }
}

/* ───────── 函数采样 ───────── */

const SAMPLE_X0 = -12
const SAMPLE_X1 = 12
const SAMPLE_N = 720

/** 允许 2x、3(x+1) 这类中学写法 */
/**
 * 把教师习惯的写法归一到 mathjs 能算的形式：
 * - 2x → 2*x
 * - ln(x) → log(x)（mathjs 没有 ln）
 * - lg(x) → log10(x)、arcsin → asin（数学课本常用，mathjs 不认）
 */
export function normalizeExpr(expr: string): string {
  return expr
    .replace(/\bln\s*\(/g, 'log(')
    .replace(/\blg\s*\(/g, 'log10(')
    .replace(/\barc(sin|cos|tan)\s*\(/g, 'a$1(')
    // 2x → 2*x；科学计数法 1e5 和函数名里的数字（log10、log2）不能被拆开
    .replace(/(?<![a-zA-Z0-9])(\d)\s*(?![eE]\d)([a-zA-Z(])/g, '$1*$2')
}

export function sampleFunction(expr: string): { curves: Pt[][]; error?: string } {
  const source = expr.trim()
  if (!source) return { curves: [], error: '表达式为空' }

  // 先按课本写法归一（ln / lg / arcsin / 2x），失败再试原文。
  // mathjs 对未知函数不一定在 compile 阶段报错，所以要主动归一，不能等它抛。
  let node: { evaluate: (scope: Record<string, number>) => unknown }
  try {
    node = compile(normalizeExpr(source))
  } catch {
    try {
      node = compile(source)
    } catch {
      return { curves: [], error: '表达式无法解析，请检查括号与运算符' }
    }
  }

  const curves: Pt[][] = []
  let run: Pt[] = []
  for (let i = 0; i <= SAMPLE_N; i++) {
    const x = SAMPLE_X0 + ((SAMPLE_X1 - SAMPLE_X0) * i) / SAMPLE_N
    let value: unknown
    try {
      value = node.evaluate({ x })
    } catch {
      value = Number.NaN
    }
    const y = typeof value === 'number' ? value : Number.NaN
    if (!Number.isFinite(y) || Math.abs(y) > 1e4) {
      if (run.length > 1) curves.push(run)
      run = []
      continue
    }
    run.push({ x, y })
  }
  if (run.length > 1) curves.push(run)

  if (curves.length === 0) return { curves: [], error: '在当前范围内没有可绘制的点' }
  return { curves }
}
