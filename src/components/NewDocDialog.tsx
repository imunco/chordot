import { useMemo, useState } from 'react'
import type { StarterCanvas } from '../model/starters'
import { STARTERS, starterOf, starterScene } from '../model/starters'
import { Thumb } from './Thumb'
import { useEscape } from './useEscape'

/**
 * 新建课件的属性对话框。
 *
 * 属性只做「真的会影响课堂」的几项：叫什么、数学还是物理、从什么画布开始、
 * 网格 / 刻度 / 角度单位 / 触控大按钮。创建后这些偏好同时写回全局设置，下次沿用。
 */
export interface NewDocValues {
  name: string
  subject: 'math' | 'physics'
  canvas: StarterCanvas
  grid: boolean
  gridStep: 0.5 | 1 | 2
  showTicks: boolean
  angleUnit: 'deg' | 'rad'
  touch: boolean
}

interface Props {
  initial: NewDocValues
  onCancel: () => void
  onCreate: (values: NewDocValues) => void
}

function CanvasPreview({ canvas }: { canvas: StarterCanvas }) {
  const scene = useMemo(() => starterScene(canvas), [canvas])
  if (canvas === 'blank') {
    return (
      <div className="newdoc__previewcard newdoc__previewcard--paper">
        <svg viewBox="0 0 260 150" width="100%" height="100%" aria-hidden="true">
          <rect x="20" y="14" width="220" height="122" rx="8" fill="#fff" stroke="#dedad3" />
          <path d="M46 100c18-26 30-36 40-38 12-2 14 16 24 16 8 0 12-6 18-14" fill="none" stroke="#3d5a66" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="174" cy="64" r="3" fill="#3d5a66" />
          <path d="M46 118h60" stroke="#e5e1da" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span>一张干净的白纸</span>
      </div>
    )
  }
  if (canvas === 'grid') {
    return (
      <div className="newdoc__previewcard newdoc__previewcard--paper">
        <svg viewBox="0 0 260 150" width="100%" height="100%" aria-hidden="true">
          <rect x="20" y="14" width="220" height="122" rx="8" fill="#fff" stroke="#dedad3" />
          <g stroke="#ece9e3" strokeWidth="0.8">
            {Array.from({ length: 11 }, (_, i) => (
              <line key={'v' + i} x1={20 + i * 22} y1="14" x2={20 + i * 22} y2="136" />
            ))}
            {Array.from({ length: 6 }, (_, i) => (
              <line key={'h' + i} x1="20" y1={14 + i * 24} x2="240" y2={14 + i * 24} />
            ))}
          </g>
          <line x1="24" y1="75" x2="236" y2="75" stroke="#9e9a94" strokeWidth="1.2" />
          <line x1="130" y1="18" x2="130" y2="132" stroke="#9e9a94" strokeWidth="1.2" />
          <path d="M64 75c12-22 26-34 40-34 16 0 22 22 38 22 14 0 22-10 30-22" fill="none" stroke="#3d5a66" strokeWidth="1.8" strokeLinecap="round" transform="translate(0 34)" />
        </svg>
        <span>坐标网格与刻度</span>
      </div>
    )
  }
  if (canvas === 'mech') {
    return (
      <div className="newdoc__previewcard newdoc__previewcard--paper">
        <svg viewBox="0 0 260 150" width="100%" height="100%" aria-hidden="true">
          <rect x="20" y="14" width="220" height="122" rx="8" fill="#fff" stroke="#dedad3" />
          <line x1="30" y1="122" x2="230" y2="122" stroke="#d8d4ce" strokeWidth="1.2" />
          <circle cx="96" cy="46" r="12" fill="none" stroke="#3d5a66" strokeWidth="1.6" />
          <circle cx="96" cy="46" r="2" fill="#3d5a66" />
          <path d="M96 58v18" stroke="#8b8a84" strokeWidth="1.3" />
          <circle cx="96" cy="86" r="11" fill="#f0ece5" stroke="#3d5a66" strokeWidth="1.5" />
          <path d="M172 122V96" stroke="#8b8a84" strokeWidth="1.3" />
          <circle cx="172" cy="88" r="9" fill="#f0ece5" stroke="#3d5a66" strokeWidth="1.4" />
          <path d="M108 46c16 0 26 14 30 30 4 14 14 12 24 12" fill="none" stroke="#b08a3e" strokeWidth="1.4" strokeDasharray="3 3" />
          <circle cx="158" cy="88" r="4" fill="#3d5a66" />
        </svg>
        <span>空白机构装配台</span>
      </div>
    )
  }
  return (
    <div className="newdoc__previewcard newdoc__previewcard--paper">
      <Thumb scene={scene} cacheKey={'newdoc-' + canvas} />
      <span>{starterOf(canvas).label}</span>
    </div>
  )
}

export function NewDocDialog({ initial, onCancel, onCreate }: Props) {
  const [name, setName] = useState(initial.name)
  const [subject, setSubject] = useState<'math' | 'physics'>(initial.subject)
  const [canvas, setCanvas] = useState<StarterCanvas>(initial.canvas)
  const [grid, setGrid] = useState(initial.grid)
  const [gridStep, setGridStep] = useState<0.5 | 1 | 2>(initial.gridStep)
  const [showTicks, setShowTicks] = useState(initial.showTicks)
  const [angleUnit, setAngleUnit] = useState<'deg' | 'rad'>(initial.angleUnit)
  const [touch, setTouch] = useState(initial.touch)

  useEscape(true, onCancel)

  const pickCanvas = (id: StarterCanvas) => {
    setCanvas(id)
    const def = starterOf(id)
    if (def.subject !== 'any') setSubject(def.subject)
  }

  const submit = () => {
    onCreate({
      name: name.trim(),
      subject,
      canvas,
      grid,
      gridStep,
      showTicks,
      angleUnit,
      touch,
    })
  }

  return (
    <div className="newdoc" data-newdoc="1" role="dialog" aria-modal="true" aria-label="新建课件">
      <div className="newdoc__mask" onClick={onCancel} />
      <form
        className="newdoc__panel"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <header className="newdoc__head">
          <div>
            <h2>新建课件</h2>
            <p>先定好这节课的起点，进入后随时可以换画布或补内容。</p>
          </div>
          <button type="button" className="newdoc__close" onClick={onCancel} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="newdoc__body">
          <div className="newdoc__form">
            <div className="newdoc__group">
              <label className="newdoc__label" htmlFor="newdoc-name">
                课件名称
              </label>
              <div className="newdoc__namebox">
                <input
                  id="newdoc-name"
                  className="newdoc__name"
                  value={name}
                  autoFocus
                  spellCheck={false}
                  placeholder="例如：3.2 摩擦力"
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                />
                <span className="newdoc__suffix">.chordot</span>
              </div>
            </div>

            <div className="newdoc__group">
              <span className="newdoc__label">学科</span>
              <div className="newdoc__seg" role="group" aria-label="学科">
                <button
                  type="button"
                  className="newdoc__segbtn"
                  data-active={subject === 'math'}
                  onClick={() => setSubject('math')}
                >
                  数学
                </button>
                <button
                  type="button"
                  className="newdoc__segbtn"
                  data-active={subject === 'physics'}
                  onClick={() => setSubject('physics')}
                >
                  物理
                </button>
              </div>
            </div>

            <div className="newdoc__group">
              <span className="newdoc__label">初始画布</span>
              <div className="newdoc__canvases">
                {STARTERS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="newdoc__canvas"
                    data-canvas={s.id}
                    data-active={canvas === s.id}
                    onClick={() => pickCanvas(s.id)}
                    title={s.hint}
                  >
                    <b>{s.label}</b>
                    <i>{s.hint}</i>
                  </button>
                ))}
              </div>
            </div>

            <div className="newdoc__group">
              <span className="newdoc__label">网格与坐标</span>
              <div className="newdoc__row">
                <label className="newdoc__check">
                  <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} />
                  显示网格
                </label>
                <label className="newdoc__check">
                  <input
                    type="checkbox"
                    checked={showTicks}
                    onChange={(e) => setShowTicks(e.target.checked)}
                  />
                  坐标刻度
                </label>
                <span className="newdoc__density">
                  网格密度
                  <span className="newdoc__seg newdoc__seg--small">
                    {[0.5, 1, 2].map((v) => (
                      <button
                        key={v}
                        type="button"
                        className="newdoc__segbtn"
                        data-active={gridStep === v}
                        onClick={() => setGridStep(v as 0.5 | 1 | 2)}
                      >
                        {v}
                      </button>
                    ))}
                  </span>
                </span>
              </div>
            </div>

            <div className="newdoc__group">
              <span className="newdoc__label">角度单位</span>
              <div className="newdoc__seg" role="group" aria-label="角度单位">
                <button
                  type="button"
                  className="newdoc__segbtn"
                  data-active={angleUnit === 'deg'}
                  onClick={() => setAngleUnit('deg')}
                >
                  度 °
                </button>
                <button
                  type="button"
                  className="newdoc__segbtn"
                  data-active={angleUnit === 'rad'}
                  onClick={() => setAngleUnit('rad')}
                >
                  弧度 rad
                </button>
              </div>
            </div>

            <div className="newdoc__group">
              <span className="newdoc__label">触控</span>
              <label className="newdoc__check">
                <input type="checkbox" checked={touch} onChange={(e) => setTouch(e.target.checked)} />
                一体机 / 平板大按钮
              </label>
            </div>
          </div>

          <aside className="newdoc__side">
            <span className="newdoc__sidelabel">预览</span>
            <CanvasPreview canvas={canvas} />
            <p className="newdoc__sidehint">
              {starterOf(canvas).hint}
              {subject === 'physics' ? ' · 进入后直接是物理模式' : ''}
            </p>
          </aside>
        </div>

        <footer className="newdoc__foot">
          <span className="newdoc__tip">创建后按 Ctrl+S 保存到本地</span>
          <div className="newdoc__actions">
            <button type="button" className="newdoc__cancel" onClick={onCancel}>
              取消
            </button>
            <button type="submit" className="newdoc__create">
              创建并进入
            </button>
          </div>
        </footer>
      </form>
    </div>
  )
}
