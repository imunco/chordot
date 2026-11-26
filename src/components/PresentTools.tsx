import { useEffect, useRef, useState } from 'react'

export type PresentTool = 'spot' | 'lens' | null

/**
 * 全局演示工具：聚光灯 / 放大镜。
 *
 * 从教材实验室的大屏工具里提出来，主编辑器、数学 / 物理 / 三维 / 机构任何模式都能用。
 * - 聚光灯：整页压暗，只留跟随指针的光圈（不改画布、不拦截鼠标）
 * - 放大镜：把画布 SVG 实时序列化成图片，在圆形镜片里按倍率查看细节
 */
export function PresentTools({ tool, onClose }: { tool: PresentTool; onClose: () => void }) {
  const [pos, setPos] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
  const [radius, setRadius] = useState(220)
  const [zoom, setZoom] = useState(2.2)
  const [inside, setInside] = useState(true)
  const lensRef = useRef<HTMLDivElement | null>(null)
  const rectRef = useRef<DOMRect | null>(null)
  const size = 232

  useEffect(() => {
    if (!tool) return
    const onMove = (e: PointerEvent) => setPos({ x: e.clientX, y: e.clientY })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [tool, onClose])

  // 放大镜：定期把当前画布 SVG 序列化成图片；镜片本身在画布外，不会被拍进去
  useEffect(() => {
    if (tool !== 'lens') return
    let stopped = false
    let timer = 0
    let currentUrl = ''
    const build = () => {
      const host = document.querySelector<HTMLElement>('.canvas')
      const svg = document.querySelector<SVGSVGElement>('.canvas__svg')
      if (!host || !svg) return
      rectRef.current = host.getBoundingClientRect()
      const r = rectRef.current
      setInside(pos.x >= r.left && pos.x <= r.right && pos.y >= r.top && pos.y <= r.bottom)
      const clone = svg.cloneNode(true) as SVGSVGElement
      clone.querySelectorAll('[data-ui]').forEach((el) => el.remove())
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
        type: 'image/svg+xml;charset=utf-8',
      })
      const url = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () => {
        if (stopped || !lensRef.current) {
          URL.revokeObjectURL(url)
          return
        }
        const r2 = rectRef.current
        if (!r2) return
        const left = size / 2 - (pos.x - r2.left) * zoom
        const top = size / 2 - (pos.y - r2.top) * zoom
        img.style.position = 'absolute'
        img.style.left = '0'
        img.style.top = '0'
        img.style.width = r2.width + 'px'
        img.style.height = r2.height + 'px'
        img.style.transformOrigin = '0 0'
        img.style.transform = 'translate(' + left + 'px,' + top + 'px) scale(' + zoom + ')'
        img.style.imageRendering = 'auto'
        lensRef.current.replaceChildren(img)
        if (currentUrl) URL.revokeObjectURL(currentUrl)
        currentUrl = url
      }
      img.onerror = () => URL.revokeObjectURL(url)
      img.src = url
    }
    build()
    timer = window.setInterval(build, 180)
    return () => {
      stopped = true
      window.clearInterval(timer)
      if (currentUrl) URL.revokeObjectURL(currentUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, zoom])

  if (!tool) return null

  const lensLeft = Math.min(window.innerWidth - size - 12, Math.max(12, pos.x + 26))
  const lensTop = Math.min(window.innerHeight - size - 12, Math.max(12, pos.y + 26))

  return (
    <>
      {tool === 'spot' && (
        <div
          className="presenttools-spot"
          style={
            {
              '--px': pos.x + 'px',
              '--py': pos.y + 'px',
              '--pr': radius + 'px',
            } as React.CSSProperties
          }
        />
      )}

      {tool === 'lens' && inside && (
        <div
          className="presenttools-lens"
          style={{ left: lensLeft, top: lensTop, width: size, height: size }}
          aria-label="放大镜"
        >
          <div className="presenttools-lens__inner" ref={lensRef} />
          <span className="presenttools-lens__badge">{zoom.toFixed(1)}×</span>
        </div>
      )}

      <div className="presenttools-bar" onPointerDown={(e) => e.stopPropagation()}>
        <span className="presenttools-bar__name">{tool === 'spot' ? '聚光灯' : '放大镜'}</span>
        {tool === 'spot' ? (
          <label className="presenttools-bar__range">
            光圈
            <input
              type="range"
              min={100}
              max={360}
              step={10}
              value={radius}
              onChange={(e) => setRadius(Number(e.currentTarget.value))}
              aria-label="聚光灯大小"
            />
          </label>
        ) : (
          <label className="presenttools-bar__range">
            倍率
            <input
              type="range"
              min={1.5}
              max={5}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.currentTarget.value))}
              aria-label="放大镜倍率"
            />
          </label>
        )}
        <button className="presenttools-bar__close" onClick={onClose} title="关闭（Esc）">
          关闭
        </button>
      </div>
    </>
  )
}
