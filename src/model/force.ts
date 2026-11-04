import { compile } from 'mathjs'
import { normalizeExpr } from '../kernel/scene'
import type { ForceKind } from '../kernel/types'

/** 编译缓存：同一个表达式在拖动/重绘时只编译一次 */
const cache = new Map<string, { evaluate: (scope: Record<string, number>) => unknown } | null>()

function compileExpr(expr: string) {
  const key = expr.trim()
  if (cache.has(key)) return cache.get(key)!
  let node: { evaluate: (scope: Record<string, number>) => unknown } | null = null
  try {
    node = compile(normalizeExpr(key))
  } catch {
    try {
      node = compile(key)
    } catch {
      node = null
    }
  }
  cache.set(key, node)
  return node
}

/** 变力的自变量名 */
export function forceVar(kind: ForceKind): string {
  return kind === 'time' ? 't' : 'x'
}

export interface ForceValue {
  /** 求值结果（可能为 NaN） */
  value: number
  /** 求值失败时的教学语言说明 */
  error?: string
}

/** 按当前预览自变量求力的大小 */
export function evalForce(expr: string, kind: ForceKind, preview: number): ForceValue {
  const source = expr.trim()
  if (!source) return { value: 0, error: '还没有填力的表达式' }

  const node = compileExpr(source)
  if (!node) return { value: 0, error: '表达式无法解析，请检查括号与运算符' }

  let raw: unknown
  try {
    raw = node.evaluate(kind === 'constant' ? {} : { [forceVar(kind)]: preview })
  } catch {
    return { value: 0, error: '这个表达式算不出数值' }
  }
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(value)) {
    return { value: 0, error: `在 ${forceVar(kind)} = ${preview.toFixed(2)} 时算不出数值` }
  }
  return { value }
}

/** 右栏展示用：恒定 / 随时间变化 / 随位移变化 */
export const FORCE_KIND_LABEL: Record<ForceKind, string> = {
  constant: '恒力',
  time: '随时间变化 F(t)',
  position: '随位移变化 F(x)',
}
