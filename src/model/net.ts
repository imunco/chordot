import type { ForceObj, GeoObj, NetResult } from './types'

/** 共点力系合力与合力矩（右栏校验条用） */
export function computeNet(objects: GeoObj[]): NetResult {
  const forces = objects.filter((o): o is ForceObj => o.kind === 'force' && o.visible)
  let fx = 0
  let fy = 0
  for (const f of forces) {
    const rad = (f.angle * Math.PI) / 180
    fx += f.magnitude * Math.cos(rad)
    fy += f.magnitude * Math.sin(rad)
  }
  const mag = Math.hypot(fx, fy)
  return {
    sumF: { x: fx, y: fy },
    // 所有力作用于同一点，合力矩恒为 0
    sumM: 0,
    balanced: mag < 0.05,
  }
}
