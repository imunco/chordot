import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CheckIcon,
  CloseIcon,
  EraserIcon,
  EyeIcon,
  EyeOffIcon,
  PaletteIcon,
  PencilIcon,
  PenIcon,
  RedoIcon,
  UndoIcon,
} from './icons'

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
const FAV_KEY = 'chordot.ink.fav'
const RECENT_KEY = 'chordot.ink.recent'

function readColors(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
function writeColors(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    /* 静默 */
  }
}

interface Props {
  /** 当前批注工具：画笔或橡皮 */
  tool: 'pen' | 'eraser'
  color: string
  width: number
  mode: 'pen' | 'marker' | 'pencil'
  /** 速度感应线宽 */
  velocity: boolean
  /** 当前页已有多少笔批注 */
  count: number
  /** 批注是否被暂时隐藏 */
  hidden: boolean
  canUndo: boolean
  canRedo: boolean
  onChange: (patch: { color?: string; width?: number; mode?: 'pen' | 'marker' | 'pencil' }) => void
  onTool: (tool: 'pen' | 'eraser') => void
  onVelocity: (on: boolean) => void
  onToggleInk: () => void
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  onDone: () => void
}

/**
 * 批注条（占据底部工具坞的同一行）。
 *
 * 笔型、颜色、粗细全部按手指尺寸放大；颜色除了 24 色盘，还支持自定义取色、
 * 收藏常用色和最近使用，老师的「板书配色」可以一直沿用。
 */
export function PenBar({
  tool,
  color,
  width,
  mode,
  velocity,
  count,
  hidden,
  canUndo,
  canRedo,
  onChange,
  onTool,
  onVelocity,
  onToggleInk,
  onUndo,
  onRedo,
  onClear,
  onDone,
}: Props) {
  /** 清空要按两次：课堂上误触一次就把整块批注擦掉，代价太大 */
  const [armed, setArmed] = useState(false)
  const timer = useRef(0)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [fav, setFav] = useState<string[]>(() => readColors(FAV_KEY))
  const [recent, setRecent] = useState<string[]>(() => readColors(RECENT_KEY))

  useEffect(() => {
    if (!armed) return
    timer.current = window.setTimeout(() => setArmed(false), 3200)
    return () => window.clearTimeout(timer.current)
  }, [armed])

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

  const remember = (c: string) => {
    const next = [c, ...recent.filter((x) => x !== c)].slice(0, 8)
    setRecent(next)
    writeColors(RECENT_KEY, next)
  }

  const pick = (c: string) => {
    onChange({ color: c })
    remember(c)
    setPaletteOpen(false)
  }

  const addFav = (c: string) => {
    if (fav.includes(c)) return
    const next = [c, ...fav].slice(0, 10)
    setFav(next)
    writeColors(FAV_KEY, next)
  }

  const removeFav = (c: string) => {
    const next = fav.filter((x) => x !== c)
    setFav(next)
    writeColors(FAV_KEY, next)
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

  const activeMode = tool === 'eraser' ? 'eraser' : mode

  return (
    <div className="penbar" role="toolbar" aria-label="批注工具">
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
            data-active={activeMode === 'pen'}
            title="钢笔：实线，落笔有轻重"
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
            data-active={activeMode === 'marker'}
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
            data-active={activeMode === 'pencil'}
            title="铅笔：细、带纸面颗粒，适合写批注小字"
            onClick={() => {
              onTool('pen')
              onChange({ mode: 'pencil' })
            }}
          >
            <PencilIcon size={17} />
            铅笔
          </button>
          <button
            className="penbar__mode"
            data-active={activeMode === 'eraser'}
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
                title="更多颜色 / 自定义 / 我的色板"
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
                      height: mode === 'marker' ? Math.min(9, w * 2.2) : mode === 'pencil' ? Math.max(1, w * 0.7) : w,
                      background: 'currentColor',
                      opacity: mode === 'marker' ? 0.45 : 1,
                    }}
                  />
                </button>
              ))}
            </div>

            {mode === 'pencil' && (
              <button
                className="penbar__sense"
                data-active={velocity}
                title={velocity ? '铅笔速度感应已开：写快变细、写慢变粗' : '铅笔速度感应已关：全程等宽'}
                onClick={() => onVelocity(!velocity)}
              >
                感应
              </button>
            )}
          </>
        ) : (
          <span className="penbar__hint">按住拖动，划过的地方会被擦掉</span>
        )}
      </div>

      <div className="penbar__right">
        <span className="penbar__count" title="本页批注笔数">
          {count} 笔
        </span>
        <button
          className="penbar__icon"
          data-active={hidden}
          title={hidden ? '批注已隐藏，点一下显示' : '暂时隐藏全部批注（讲课时用）'}
          onClick={onToggleInk}
        >
          {hidden ? <EyeOffIcon size={19} /> : <EyeIcon size={19} />}
        </button>
        {/* 清空是最低频、也最危险的操作：放最右，且需要点两次 */}
        <button
          className="penbar__clear"
          data-confirm={armed}
          onClick={clear}
          title={armed ? '再点一次确认清空（可撤销）' : '清空全部批注（需要点两次）'}
        >
          {armed ? '再点一次清空' : '清空批注'}
        </button>
      </div>

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
                <span>
                  <PaletteIcon size={15} /> 颜色
                </span>
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

                <div className="colorpal__label colorpal__label--row">
                  我的色板
                  <button className="colorpal__mini" onClick={() => addFav(color)}>
                    + 收藏当前色
                  </button>
                </div>
                <div className="colorpal__grid colorpal__grid--fav">
                  {fav.length === 0 && <span className="colorpal__empty">把常用的板书颜色收藏到这里</span>}
                  {fav.map((c) => (
                    <button
                      key={c}
                      className="colorpal__swatch colorpal__swatch--fav"
                      style={{ background: c }}
                      data-color={c}
                      title={`${c}（右键移除）`}
                      onClick={() => pick(c)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        removeFav(c)
                      }}
                    >
                      <i />
                    </button>
                  ))}
                </div>

                <div className="colorpal__label">最近使用</div>
                <div className="colorpal__grid colorpal__grid--recent">
                  {recent.length === 0 && <span className="colorpal__empty">选过的颜色会留在这里</span>}
                  {recent.map((c) => (
                    <button
                      key={c}
                      className="colorpal__swatch"
                      style={{ background: c }}
                      data-color={c}
                      title={c}
                      onClick={() => pick(c)}
                    />
                  ))}
                </div>

                <div className="colorpal__custom">
                  <label>
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => onChange({ color: e.target.value })}
                      onBlur={(e) => remember(e.target.value)}
                    />
                    自定义颜色
                  </label>
                  <code>{color}</code>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
