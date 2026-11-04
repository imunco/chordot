import { useEffect } from 'react'

/**
 * 弹窗统一的 Esc 关闭：捕获阶段监听并阻止冒泡，
 * 免得画布那边的全局快捷键顺手把选区也清了。
 */
export function useEscape(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onEscape()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active, onEscape])
}
