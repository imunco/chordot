import { useEffect, useState } from 'react'
import { Textbook } from './Textbook'

/**
 * 教材实验室独立窗口。
 *
 * 主窗口留着画布，这个窗口可以拖到投影 / 另一块屏；
 * 默认专注模式，只留动画、实时数据和演示工具。
 */
export function LabWindow({ initialId }: { initialId?: string }) {
  const [id, setId] = useState<string | undefined>(initialId)

  useEffect(() => {
    document.title = '教材实验室 · 弦点'
    document.documentElement.dataset.lab = '1'
    const off = window.chordot?.onLabSwitch?.((next) => {
      if (next) setId(next)
    })
    return () => {
      off?.()
      delete document.documentElement.dataset.lab
    }
  }, [])

  return (
    <Textbook
      key={id ?? 'default'}
      initialId={id}
      standalone
      onClose={() => window.close()}
    />
  )
}
