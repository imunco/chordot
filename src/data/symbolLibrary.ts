/**
 * 符号公式实验室的数据层。
 *
 * 界面在 components/SymbolLab.tsx，这里只放「有什么」和「怎么记住」：
 * - 符号表：小球状态、可编辑常量、导出量
 * - 内置公式库（点一下载入）+ 自定义公式库
 * - 常量的默认值、范围与 localStorage 读写
 * - 发送到机构的目标（force / springK / springC / mass）
 *
 * 存储键：chordot.sym.constants、chordot.sym.formulas（都走 localStorage）。
 */

/** 符号分组：状态量随小球动，常量可以由人改，导出量由别的量算出来 */
export type SymGroup = '状态' | '常量' | '导出量'

export interface SymDef {
  id: string
  label: string
  unit: string
  group: SymGroup
  hint: string
}

export const SYMBOLS: SymDef[] = [
  // 状态量：每帧从积分器里读
  { id: 'x', label: 'x', unit: 'm', group: '状态', hint: '小球位置' },
  { id: 'v', label: 'v', unit: 'm/s', group: '状态', hint: '小球速度' },
  { id: 'a', label: 'a', unit: 'm/s²', group: '状态', hint: '小球加速度（上一帧）' },
  { id: 't', label: 't', unit: 's', group: '状态', hint: '时间' },
  // 常量：下面 CONSTANT_DEFS 里可以逐个改，改完记住
  { id: 'm', label: 'm', unit: 'kg', group: '常量', hint: '小球质量' },
  { id: 'g', label: 'g', unit: 'm/s²', group: '常量', hint: '重力加速度' },
  { id: 'k', label: 'k', unit: 'N/m', group: '常量', hint: '劲度系数' },
  { id: 'c', label: 'c', unit: 'N·s/m', group: '常量', hint: '阻尼系数' },
  { id: 'F', label: 'F₀', unit: 'N', group: '常量', hint: '恒定外力' },
  { id: 'mu', label: 'μ', unit: '', group: '常量', hint: '动摩擦因数' },
  { id: 'q', label: 'q', unit: 'C', group: '常量', hint: '电荷量' },
  { id: 'E', label: 'E', unit: 'N/C', group: '常量', hint: '电场强度' },
  { id: 'B', label: 'B', unit: 'T', group: '常量', hint: '磁感应强度' },
  { id: 'G', label: 'G', unit: '', group: '常量', hint: '万有引力常量' },
  { id: 'M', label: 'M', unit: 'kg', group: '常量', hint: '地球质量' },
  { id: 'r', label: 'r', unit: 'm', group: '常量', hint: '地球半径 / 圆周半径' },
  { id: 'pi', label: 'π', unit: '', group: '常量', hint: '圆周率（内置，不可改）' },
  // 导出量：由状态与常量算出来，只读
  { id: 'N', label: 'N', unit: 'N', group: '导出量', hint: '支持力 m·g' },
  { id: 'Ek', label: 'Eₖ', unit: 'J', group: '导出量', hint: '动能 ½mv²' },
  { id: 'W', label: 'W', unit: 'J', group: '导出量', hint: '功 F₀·x' },
  { id: 'P', label: 'P', unit: 'W', group: '导出量', hint: '功率 F₀·v' },
  { id: 'omega', label: 'ω', unit: 'rad/s', group: '导出量', hint: '圆频率 √(k/m)' },
]

/* ───────── 可编辑常量 ───────── */

/** 一条常量的定义：界面按这张表生成输入框，读写 localStorage 也按它裁剪 */
export interface ConstDef {
  id: string
  label: string
  unit: string
  def: number
  min: number
  max: number
  step: number
  hint: string
}

export const CONSTANT_DEFS: ConstDef[] = [
  { id: 'm', label: '质量 m', unit: 'kg', def: 1, min: 0.05, max: 20, step: 0.05, hint: '小球质量，也进 a = F/m' },
  { id: 'k', label: '劲度 k', unit: 'N/m', def: 8, min: 0, max: 400, step: 0.5, hint: '弹簧劲度系数' },
  { id: 'c', label: '阻尼 c', unit: 'N·s/m', def: 0.35, min: 0, max: 60, step: 0.05, hint: '阻尼系数' },
  { id: 'g', label: '重力 g', unit: 'm/s²', def: 9.8, min: 0, max: 40, step: 0.1, hint: '重力加速度' },
  { id: 'F', label: '外力 F₀', unit: 'N', def: 2, min: -200, max: 200, step: 0.5, hint: '恒定外力' },
  { id: 'mu', label: '摩擦 μ', unit: '', def: 0.3, min: 0, max: 1.5, step: 0.01, hint: '动摩擦因数' },
  { id: 'q', label: '电荷 q', unit: 'C', def: 0.000001, min: -1, max: 1, step: 0.000001, hint: '带电粒子的电荷量' },
  { id: 'E', label: '电场 E', unit: 'N/C', def: 20000, min: -1e8, max: 1e8, step: 1000, hint: '电场强度' },
  { id: 'B', label: '磁感 B', unit: 'T', def: 0.5, min: -20, max: 20, step: 0.1, hint: '磁感应强度' },
  { id: 'G', label: '引力 G', unit: '', def: 6.67e-11, min: 1e-12, max: 1e-8, step: 1e-12, hint: '万有引力常量' },
  { id: 'M', label: '地球 M', unit: 'kg', def: 5.97e24, min: 1e18, max: 1e30, step: 1e22, hint: '地球质量' },
  { id: 'r', label: '半径 r', unit: 'm', def: 6370000, min: 1000, max: 1e9, step: 1000, hint: '地球半径 / 圆周半径' },
]

const clampConst = (def: ConstDef, v: number) => Math.min(def.max, Math.max(def.min, v))

/** 出厂常量（π 也在这里，但它不进存储表） */
export const DEFAULT_CONSTANTS: Record<string, number> = {
  ...Object.fromEntries(CONSTANT_DEFS.map((c) => [c.id, c.def])),
  pi: Math.PI,
}

export const CONSTANTS_KEY = 'chordot.sym.constants'

/** 读常量：坏数据、越界值都退回默认/范围，绝不让窗口打不开 */
export function loadConstants(): Record<string, number> {
  const out = { ...DEFAULT_CONSTANTS }
  try {
    const raw = localStorage.getItem(CONSTANTS_KEY)
    if (!raw) return out
    const saved = JSON.parse(raw) as Record<string, unknown> | null
    if (!saved || typeof saved !== 'object') return out
    for (const def of CONSTANT_DEFS) {
      const v = saved[def.id]
      if (typeof v === 'number' && Number.isFinite(v)) out[def.id] = clampConst(def, v)
    }
  } catch {
    /* 存储坏了就用默认值 */
  }
  return out
}

export function saveConstants(values: Record<string, number>): void {
  const slim: Record<string, number> = {}
  for (const def of CONSTANT_DEFS) {
    const v = values[def.id]
    if (typeof v === 'number' && Number.isFinite(v)) slim[def.id] = v
  }
  try {
    localStorage.setItem(CONSTANTS_KEY, JSON.stringify(slim))
  } catch {
    /* 隐私模式 / 配额满：静默失败，界面照常能用 */
  }
}

/* ───────── 公式库 ───────── */

export interface FormulaEntry {
  id: string
  label: string
  expr: string
  hint: string
}

/**
 * 内置公式：都是可以直接当合力求值的表达式。
 * 注意「简谐 / 弹簧回复力」这条的文案要保住，electron/verify-mech.cjs 靠它找按钮。
 */
export const BUILTIN_FORMULAS: FormulaEntry[] = [
  { id: 'shm', label: '简谐 / 弹簧回复力 −k·x', expr: '-k*x', hint: '胡克回复力 F = −kx，小球做简谐振动' },
  { id: 'damped', label: '阻尼振动 −k·x−c·v', expr: '-k*x-c*v', hint: '弹簧 + 阻尼，振幅慢慢变小' },
  { id: 'driven', label: '受迫振动 −k·x−c·v+F₀', expr: '-k*x-c*v+F', hint: '阻尼 + 恒定外力' },
  { id: 'gravity', label: '重力 m·g', expr: 'm*g', hint: '近地面的重力' },
  { id: 'newton2', label: '牛顿第二定律 m·a', expr: 'm*a', hint: '合力 = 质量 × 加速度' },
  { id: 'gravitation', label: '万有引力 G·M·m/r²', expr: 'G*M*m/r^2', hint: '牛顿万有引力，G / M / r 都能在常量里改' },
  { id: 'kinetic', label: '动能 ½m·v²', expr: '0.5*m*v^2', hint: '动能定理里的动能' },
  { id: 'circular', label: '圆周向心 m·v²/r', expr: 'm*v^2/r', hint: '匀速圆周的向心力，r 是圆周半径（常量里可改）' },
  { id: 'hooke', label: '胡克 k·x', expr: 'k*x', hint: '弹簧伸长 x 时的弹力' },
  { id: 'efield', label: '电场力 q·E', expr: 'q*E', hint: '匀强电场里的电场力' },
  { id: 'lorentz', label: '磁场力 q·v·B', expr: 'q*v*B', hint: '洛伦兹力大小（速度与磁场垂直）' },
  { id: 'friction', label: '摩擦力 μ·N', expr: 'mu*N', hint: 'N 是支持力 m·g' },
  { id: 'constant', label: '恒定外力 F₀', expr: 'F', hint: '一直朝正方向的恒力' },
  { id: 'normal', label: '支持力 m·g', expr: 'N', hint: '水平面上的支持力' },
]

/* ───────── 自定义公式（localStorage 记住） ───────── */

export interface CustomFormula {
  id: string
  label: string
  expr: string
  at: number
}

export const FORMULAS_KEY = 'chordot.sym.formulas'

/** 自定义库最多存这么多条，超了丢最旧的，免得把侧栏挤爆 */
export const MAX_CUSTOM_FORMULAS = 30

export function loadCustomFormulas(): CustomFormula[] {
  try {
    const raw = localStorage.getItem(FORMULAS_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as CustomFormula[] | null
    if (!Array.isArray(list)) return []
    return list
      .filter(
        (f): f is CustomFormula =>
          !!f && typeof f.id === 'string' && typeof f.label === 'string' && typeof f.expr === 'string',
      )
      .slice(0, MAX_CUSTOM_FORMULAS)
  } catch {
    /* 存储坏了就当没存过 */
    return []
  }
}

export function saveCustomFormulas(list: CustomFormula[]): void {
  try {
    localStorage.setItem(FORMULAS_KEY, JSON.stringify(list.slice(0, MAX_CUSTOM_FORMULAS)))
  } catch {
    /* 配额满时静默失败 */
  }
}

export function newFormulaId(): string {
  return `symf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/* ───────── 发送到机构 ───────── */

export type ForceTarget = 'force' | 'springK' | 'springC' | 'mass'

export interface ForceTargetDef {
  id: ForceTarget
  label: string
  unit: string
  hint: string
}

export const FORCE_TARGETS: ForceTargetDef[] = [
  { id: 'force', label: '力 F(x,v,t)', unit: 'N', hint: '旧行为：把表达式当成合力挂到选中的部件上' },
  { id: 'springK', label: '弹簧 k', unit: 'N/m', hint: '把求值结果写成选中弹簧的劲度系数' },
  { id: 'springC', label: '阻尼 c', unit: 'N·s/m', hint: '把求值结果写成选中阻尼的参数' },
  { id: 'mass', label: '质量 m', unit: 'kg', hint: '把求值结果写成选中部件的质量' },
]

/** 发给主窗口的载荷：expr 保留公式原文，value 是当前求值出来的数字 */
export interface SymbolForcePayload {
  expr: string
  target: ForceTarget
  value: number
}

/* ───────── 求值作用域 ───────── */

export interface SymState {
  x: number
  v: number
  t: number
  a: number
}

/**
 * 拼出 mathjs 的作用域：常量 + 当前状态 + 导出量。
 * 每帧要调好几次，这里不放重活（就是几次乘除和开方）。
 */
export function makeScope(state: SymState, constants: Record<string, number>): Record<string, number> {
  const m = Math.max(0.05, constants.m ?? 1)
  const g = constants.g ?? 9.8
  const k = constants.k ?? 8
  const f0 = constants.F ?? 0
  return {
    ...constants,
    x: state.x,
    v: state.v,
    t: state.t,
    a: state.a,
    N: m * g,
    Ek: 0.5 * m * state.v * state.v,
    W: f0 * state.x,
    P: f0 * state.v,
    omega: Math.sqrt(k / m),
    pi: constants.pi ?? Math.PI,
  }
}
