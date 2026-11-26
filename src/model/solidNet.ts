import { useEffect, useState } from 'react'
import type { SolidShape } from '../kernel/types'

/** 三维展开图的开关：极轻 store，RightPanel/CanvasStage/模型字段共用 */
let netOpen = false
const listeners = new Set<(open: boolean) => void>()

export function setSolidNetOpen(value: boolean) {
  netOpen = value
  listeners.forEach((fn) => fn(netOpen))
}

export function toggleSolidNet() {
  setSolidNetOpen(!netOpen)
}

export function getSolidNetOpen() {
  return netOpen
}

export function useSolidNetOpen(): boolean {
  const [open, setOpen] = useState(netOpen)
  useEffect(() => {
    const fn = (v: boolean) => setOpen(v)
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])
  return open
}

/** 球体不可展开；其余多面体都可以画 */
export function supportsSolidNet(shape: SolidShape | null | undefined): boolean {
  if (!shape) return false
  return shape.type !== 'sphere'
}
