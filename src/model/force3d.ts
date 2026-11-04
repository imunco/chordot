import type { PhysicsForce } from '../kernel/types'

/** 预设方向（教学里最常用的六个朝向） */
export const DIR_PRESETS: Record<string, [number, number, number]> = {
  'x+': [1, 0, 0],
  'x-': [-1, 0, 0],
  'y+': [0, 1, 0],
  'y-': [0, -1, 0],
  'z+': [0, 0, 1],
  'z-': [0, 0, -1],
}

/**
 * "1,-1,0" / "1 -1 0" / "(1, -1, 0)" → 单位向量。
 * 只认方向，长度由 F(t) 决定，所以这里归一化。不合法返回 null。
 */
export function parseVec(text: string | undefined): [number, number, number] | null {
  if (!text) return null
  const parts = text
    .replace(/[()（）[\]]/g, '')
    .split(/[,，\s]+/)
    .filter(Boolean)
  if (parts.length !== 3) return null
  const v = parts.map(Number)
  if (v.some((n) => !Number.isFinite(n))) return null
  const len = Math.hypot(v[0], v[1], v[2])
  if (len < 1e-9) return null
  return [v[0] / len, v[1] / len, v[2] / len]
}

/** 力的方向：自定义向量优先，其次预设，最后兜底 +x */
export function forceDir(f: PhysicsForce | undefined): [number, number, number] {
  if (!f) return DIR_PRESETS['x+']
  return parseVec(f.vec) ?? DIR_PRESETS[f.dir] ?? DIR_PRESETS['x+']
}
