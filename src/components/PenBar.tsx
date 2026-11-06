import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon, CloseIcon, EraserIcon, PenIcon, RedoIcon, UndoIcon } from './icons'

/**
 * 纯色：课堂标注最常用的清晰颜色，比低饱和色更容易在投影上看清。
 * 仍然避开荧光色，保持纸面质感。
 */
const PURE_COLORS = [
  '#c0392b',
  '#d35400',
  '#d4a017',
  '#4f8a3d',
  '#2f8a7a',
  '#2f6fa8',
  '#3f51b5',
  '#7b3fa0',
  '#b03a6a',
  '#8a5a3c',
  '#6b7280',
  '#1f1f1d',
]

/**
 * 低饱和色：和纸面插画同一套调子，适合画辅助线、写小字。
 * 赭红 → 琥珀 → 灰棕 → 橄榄 → 苔绿 → 松绿 → 墨青 → 雾蓝 → 灰蓝 → 灰紫 → 梅紫 → 炭黑。
 */
const MUTED_COLORS = [
  '#9a5b4a',
  '#b0713f',
  '#7a6a5a',
  '#8a7a3e',
  '#5a7a52',
  '#3f6b5a',
  '#3d5a66',
  '#4a6b8a',
  '#6a7a86',
  '#5f5f82',
  '#8a4a6a',
  '#3a3a38',
]

/** 底栏常驻的 10 个快捷色：常用纯色 + 3 个低饱和色 */
const QUICK_COLORS = [
  '#9a5b4a',
  '#c0392b',
  '#d35400',
  '#d4a017',
  '#4f8a3d',
  '#2f6fa8',
  '#7b3fa0',
  '#3d5a66',
  '#8a4a6a',
  '#1f1f1d',
]

const WIDTHS = [1.6, 2.5, 4]

interface Props {
  /** 当前批注工具：画笔或橡皮 */
  tool: 'pen' | 'eraser'
  color: string
  width: number
  mode: 'pen' | 'marker'
  canUndo: boolean
  canRedo: boolean
  onChange: (patch: { color?: string; width?: number; mode?: 'pen' | 'marker' }) => void
  onTool: (tool: 'pen' | 'eraser') => void
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  onDone: () => void
}

/**
 * 批注条（占据底部工具坞的同一行）。
 *
 * 以前是画布顶部居中的小浮条：一体机上要抬手到屏幕上方，颜色圆点也只有 18px。
 * 现在整行放在屏幕底部，笔型/颜色/粗细全部按手指尺寸放大；退出批注用左上角的「完成」，
 * 不占用画布高度，所以进入批注时画面不会跳动。
 */
export function PenBar({
  tool,
  color,
  width,
  mode,
  canUndo,
  canRedo,
  onChange,
  onTool,
  onUndo,
  onRedo,
  onClear,
  onDone,
}: Props) {
  /** 清空要按两次：课堂上误触一次就把整块批注擦掉，代价太大 */
  const [armed, setArmed] = useState(false)
  const timer = useRef(0)
  /** 展开式色盘：底栏只放 10 个快捷色，更多纯色在浮层里 */
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    if (!armed) return
    timer.current = window.setTimeout(() => setArmed(false), 3200)
    return () => window.clearTimeout(timer.current)
  }, [armed])

  // 切到橡皮时收起色盘；Esc 只关色盘，不退出批注模式
  useEffect(() => {
    setPaletteOpen(false)
  }, [tool])

  useEffect(() => {
    if (!paletteOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      setPaletteOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [paletteOpen])

  const pick = (c: string) => {
    onChange({ color: c })
    setPaletteOpen(false)
  }

  const clear = () => {
    if (!armed) {
      setArmed(true)
      return
    }
    window.clearTimeout(timer.current)
    setArmed(false)
    onClear()
  }

  return (
    <div className="penbar" role="toolbar" aria-label="批注工具">
      {/* 主控件居中：教师站在屏幕中间时，笔型与颜色就在手边 */}
      <div className="penbar__main">
        <button className="penbar__done" onClick={onDone} title="完成批注，回到选择工具（Esc）">
          <CheckIcon size={20} />
          <span>完成</span>
        </button>

        <span className="penbar__sep" />

        <button className="penbar__icon" title="撤销 Ctrl+Z" disabled={!canUndo} onClick={onUndo}>
          <UndoIcon size={20} />
        </button>
        <button className="penbar__icon" title="重做 Ctrl+Y" disabled={!canRedo} onClick={onRedo}>
          <RedoIcon size={20} />
        </button>

        <span className="penbar__sep" />

        <div className="penbar__modes" role="group" aria-label="笔型">
          <button
            className="penbar__mode"
            data-active={tool === 'pen' && mode === 'pen'}
            title="普通笔：实线"
            onClick={() => {
              onTool('pen')
              onChange({ mode: 'pen' })
            }}
          >
            <PenIcon size={17} />
            笔
          </button>
          <button
            className="penbar__mode"
            data-active={tool === 'pen' && mode === 'marker'}
            title="荧光笔：粗、半透明，用来划重点"
            onClick={() => {
              onTool('pen')
              onChange({ mode: 'marker' })
            }}
          >
            <span className="penbar__marker-dot" />
            荧光
          </button>
          <button
            className="penbar__mode"
            data-active={tool === 'eraser'}
            title="橡皮：按住拖动连续擦除"
            onClick={() => onTool('eraser')}
          >
            <EraserIcon size={17} />
            橡皮
          </button>
        </div>

        {tool === 'pen' ? (
          <>
            <span className="penbar__sep" />
            <div className="penbar__colors" role="group" aria-label="颜色">
              {QUICK_COLORS.map((c) => (
                <button
                  key={c}
                  className="penbar__swatch"
                  style={{ background: c }}
                  data-color={c}
                  data-active={c === color}
                  title={c}
                  onClick={() => pick(c)}
                />
              ))}
              <button
                className="penbar__more"
                data-active={paletteOpen}
                title="更多颜色"
                aria-label="更多颜色"
                aria-expanded={paletteOpen}
                onClick={() => setPaletteOpen((v) => !v)}
              >
                <span className="penbar__more-dot" style={{ background: color }} />
              </button>
            </div>

            <span className="penbar__sep penbar__sep--widths" />
            <div className="penbar__widths" role="group" aria-label="线宽">
              {WIDTHS.map((w) => (
                <button
                  key={w}
                  className="penbar__width"
                  data-active={w === width}
                  title={`线宽 ${w}`}
                  onClick={() => onChange({ width: w })}
                >
                  <span
                    style={{
                      height: mode === 'marker' ? Math.min(9, w * 2.2) : w,
                      background: 'currentColor',
                      opacity: mode === 'marker' ? 0.45 : 1,
                    }}
                  />
                </button>
              ))}
            </div>
          </>
        ) : (
          <span className="penbar__hint">按住拖动，划过的地方会被擦掉</span>
        )}
      </div>

      {/* 清空是最低频、也最危险的操作：放最右，且需要点两次 */}
      <button
        className="penbar__clear"
        data-confirm={armed}
        onClick={clear}
        title={armed ? '再点一次确认清空（可撤销）' : '清空全部批注（需要点两次）'}
      >
        {armed ? '再点一次清空' : '清空批注'}
      </button>

      {paletteOpen &&
        createPortal(
          <div className="colorpal__scrim" onPointerDown={() => setPaletteOpen(false)}>
            <div
              className="colorpal"
              role="dialog"
              aria-label="更多颜色"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="colorpal__head">
                <span>更多颜色</span>
                <button className="iconbtn" title="关闭" onClick={() => setPaletteOpen(false)}>
                  <CloseIcon size={15} />
                </button>
              </div>

              <div className="colorpal__body">
                <div className="colorpal__label">纯色</div>
                <div className="colorpal__grid">
                  {PURE_COLORS.map((c) => (
                    <button
                      key={c}
                      className="colorpal__swatch"
                      style={{ background: c }}
                      data-color={c}
                      data-active={c === color}
                      title={c}
                      onClick={() => pick(c)}
                    />
                  ))}
                </div>

                <div className="colorpal__label">低饱和</div>
                <div className="colorpal__grid">
                  {MUTED_COLORS.map((c) => (
                    <button
                      key={c}
                      className="colorpal__swatch"
                      style={{ background: c }}
                      data-color={c}
                      data-active={c === color}
                      title={c}
                      onClick={() => pick(c)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
