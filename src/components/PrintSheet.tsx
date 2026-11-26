import { useEffect, useState } from 'react'

export interface PrintPayload {
  png: string
  title: string
  subtitle?: string
  footer?: string
}

/**
 * 讲义打印页（?print=1 独立隐藏窗口）。
 *
 * 主进程「导出 PDF」时把当前画面截成的 PNG 连标题一起发过来，
 * 这里按 A4 横向排一张讲义：页眉标题 / 副标题、正文大图、页脚（学校 + 日期）。
 * 图片解码完成、字体就绪后再通知主进程 printToPDF，避免截到空白页。
 */
export function PrintSheet() {
  const [payload, setPayload] = useState<PrintPayload | null>(null)
  const [ready, setReady] = useState(false)

  // print.css 只在打印窗口里放开页面高度，别影响主编辑器
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('print-mode')
    return () => root.classList.remove('print-mode')
  }, [])

  useEffect(() => {
    const off = window.chordot?.onPrintPayload?.((p) => setPayload(p as PrintPayload))
    return () => off?.()
  }, [])

  useEffect(() => {
    if (!payload?.png) return
    let cancelled = false
    const img = new Image()
    img.onload = async () => {
      try {
        await document.fonts.ready
      } catch {
        /* 字体 API 不可用时直接继续 */
      }
      if (cancelled) return
      setReady(true)
      // 两帧后再通知主进程打印，确保排版已经稳下来
      requestAnimationFrame(() => requestAnimationFrame(() => window.chordot?.printReady?.()))
    }
    img.onerror = () => {
      if (!cancelled) {
        setReady(true)
        window.chordot?.printReady?.()
      }
    }
    img.src = 'data:image/png;base64,' + payload.png
    return () => {
      cancelled = true
    }
  }, [payload])

  const today = new Date()
  const dateText =
    today.getFullYear() + ' 年 ' + (today.getMonth() + 1) + ' 月 ' + today.getDate() + ' 日'

  return (
    <div className="printsheet" data-print-ready={ready ? '1' : '0'}>
      <header className="printsheet__head">
        <div className="printsheet__titles">
          <h1>{payload?.title || '未命名课件'}</h1>
          {payload?.subtitle ? <p>{payload.subtitle}</p> : null}
        </div>
        <div className="printsheet__brand">
          <b>弦点</b>
          <i>Chordot</i>
        </div>
      </header>
      <div className="printsheet__stage">
        {payload?.png ? <img alt="画面" src={'data:image/png;base64,' + payload.png} /> : null}
      </div>
      <footer className="printsheet__foot">
        <span>{payload?.footer || '弦点 / Chordot · 数学与物理教学作图工具'}</span>
        <span>{dateText}</span>
      </footer>
    </div>
  )
}
