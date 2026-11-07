import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { EXPERIMENTS } from '../data/textbook'
import { labModel } from '../lab/models'
import {
  BOOK_ORDER,
  FIELD_COLOR,
  FIELD_ORDER,
  type LabBook,
  type LabChart,
  type LabExperiment,
  type LabField,
} from '../lab/types'
import { LabStage } from './LabStage'
import {
  CloseIcon,
  ExpandIcon,
  FitIcon,
  FullscreenIcon,
  LensIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  SpotlightIcon,
  TextSizeIcon,
  WindowIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from './icons'
import { ScreenInk } from './ScreenInk'
import { useEscape } from './useEscape'

const FAV_KEY = 'chordot.lab.fav'
const RECENT_KEY = 'chordot.lab.recent'

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
function writeList(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    /* 隐私模式静默失败 */
  }
}

/** 抛体、落体、碰撞真实时间太短，默认慢放一半，课堂上才看得清 */
function defaultSpeed(exp: LabExperiment) {
  return exp.stage === 'projectile' || exp.stage === 'fall' || exp.stage === 'collision' ? 0.5 : 1
}

interface Props {
  onClose: () => void
  initialId?: string
  /** 独立窗口：去掉左侧列表与底部说明，默认专注 + 大屏 */
  standalone?: boolean
}

export function Textbook({ onClose, initialId, standalone = false }: Props) {
  useEscape(!standalone, () => {
    // 批注层开着时 Esc 先退出批注，不要顺手把整个实验关掉
    if (document.querySelector('.screenink')) return
    onClose()
  })
  const [book, setBook] = useState<'全部' | '最近' | LabBook>('全部')
  const [field, setField] = useState<'全部' | LabField>('全部')
  const [favOnly, setFavOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [fav, setFav] = useState<string[]>(() => readList(FAV_KEY))
  const [recent, setRecent] = useState<string[]>(() => readList(RECENT_KEY))
  const [large, setLarge] = useState<boolean>(() => {
    try {
      return localStorage.getItem('chordot.lab.large') !== '0'
    } catch {
      return true
    }
  })
  const [focus, setFocus] = useState(
    () => standalone || window.innerWidth >= 1500,
  )
  const [id, setId] = useState<string>(() => {
    const first = initialId && EXPERIMENTS.some((e) => e.id === initialId) ? initialId : null
    const last = readList(RECENT_KEY)[0]
    const validLast = last && EXPERIMENTS.some((e) => e.id === last) ? last : null
    return first ?? validLast ?? EXPERIMENTS[0].id
  })

  const exp = EXPERIMENTS.find((e) => e.id === id) ?? EXPERIMENTS[0]

  const toggleFav = (target: string) => {
    const next = fav.includes(target) ? fav.filter((x) => x !== target) : [...fav, target]
    setFav(next)
    writeList(FAV_KEY, next)
  }

  const pick = (next: string) => {
    setId(next)
    const list = [next, ...recent.filter((x) => x !== next)].slice(0, 6)
    setRecent(list)
    writeList(RECENT_KEY, list)
  }

  const toggleLarge = () => {
    setLarge((v) => {
      const next = !v
      try {
        localStorage.setItem('chordot.lab.large', next ? '1' : '0')
      } catch {
        /* 隐私模式静默失败 */
      }
      return next
    })
  }

  const step = (dir: 1 | -1) => {
    const i = EXPERIMENTS.findIndex((q) => q.id === id)
    pick(EXPERIMENTS[(i + dir + EXPERIMENTS.length) % EXPERIMENTS.length].id)
  }

  const openWindow = () => {
    if (window.chordot?.openLabWindow) {
      window.chordot.openLabWindow(id)
      onClose()
      return
    }
    window.open(
      `${location.pathname}?lab=1&id=${encodeURIComponent(id)}`,
      '_blank',
      'width=1600,height=1000',
    )
  }

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return EXPERIMENTS.filter((e) => {
      if (favOnly && !fav.includes(e.id)) return false
      if (book === '最近' && !recent.includes(e.id)) return false
      if (book !== '全部' && book !== '最近' && e.book !== book) return false
      if (field !== '全部' && e.field !== field) return false
      if (!q) return true
      return (
        e.name.toLowerCase().includes(q) ||
        e.short.toLowerCase().includes(q) ||
        e.tagline.toLowerCase().includes(q) ||
        e.chapter.toLowerCase().includes(q) ||
        e.field.toLowerCase().includes(q)
      )
    })
  }, [book, field, query, favOnly, fav, recent])

  // 空格播放 / 暂停，左右键切换实验（搜索框里让位给输入）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.tagName === 'SELECT') return
      if (document.querySelector('.screenink')) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        const i = EXPERIMENTS.findIndex((q) => q.id === id)
        pick(EXPERIMENTS[(i + 1) % EXPERIMENTS.length].id)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        const i = EXPERIMENTS.findIndex((q) => q.id === id)
        pick(EXPERIMENTS[(i - 1 + EXPERIMENTS.length) % EXPERIMENTS.length].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, recent])

  return (
    <div
      className={`lab ${standalone ? 'lab--solo' : ''} ${large ? 'lab--large' : ''} ${focus ? 'lab--focus' : ''}`}
      role="dialog"
      aria-label="教材实验室"
      onClick={standalone ? undefined : onClose}
    >
      <div className={`lab__panel ${standalone ? 'lab__panel--solo' : ''}`} onClick={(e) => e.stopPropagation()}>
        <header className="lab__head">
          <div className="lab__brand">
            <span className="lab__mark">教材</span>
            <div>
              <div className="lab__brandline">高中物理教材实验</div>
              <div className="lab__sub">人教版（2019）· 课标 2017 年版 2020 年修订</div>
            </div>
          </div>

          {standalone ? (
            <div className="lab__solo-nav">
              <button className="iconbtn" title="上一个实验（←）" onClick={() => step(-1)}>
                ‹
              </button>
              <select
                className="lab__solo-select"
                value={id}
                onChange={(e) => pick(e.target.value)}
                aria-label="选择实验"
              >
                {EXPERIMENTS.map((e, i) => (
                  <option key={e.id} value={e.id}>
                    {String(i + 1).padStart(2, '0')} · {e.name}
                  </option>
                ))}
              </select>
              <button className="iconbtn" title="下一个实验（→）" onClick={() => step(1)}>
                ›
              </button>
            </div>
          ) : null}

          <div className="lab__tools">
            {!standalone && (
              <>
                {focus ? (
                  <select
                    className="lab__search lab__search--select"
                    value={id}
                    onChange={(e) => pick(e.target.value)}
                    aria-label="选择实验"
                  >
                    {EXPERIMENTS.map((e, i) => (
                      <option key={e.id} value={e.id}>
                        {String(i + 1).padStart(2, '0')} · {e.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="lab__search"
                    placeholder="搜索实验、章节或关键词…"
                    value={query}
                    spellCheck={false}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                )}
                <span className="lab__total">
                  {focus ? EXPERIMENTS.length : list.length} / {EXPERIMENTS.length} 个实验
                </span>
              </>
            )}
            {standalone && <span className="lab__total">{EXPERIMENTS.length} 个实验</span>}
            {!standalone && (
              <button
                className="lab__mode"
                data-active={large}
                title={large ? '大屏字号：已放大' : '大屏字号：标准'}
                onClick={toggleLarge}
              >
                <TextSizeIcon size={17} />
                <span>大屏</span>
              </button>
            )}
            <button
              className="lab__mode"
              data-active={focus}
              title={focus ? '退出专注模式，显示列表与说明' : '专注模式：收起列表与说明，放大动画'}
              onClick={() => setFocus((v) => !v)}
            >
              <ExpandIcon size={17} />
              <span>{focus ? '退出专注' : '专注'}</span>
            </button>
            <button className="iconbtn" title={standalone ? '关闭窗口' : '关闭（Esc）'} onClick={onClose}>
              <CloseIcon size={16} />
            </button>
          </div>
        </header>

        <div className="lab__body">
          <aside className="lab__side">
            <div className="lab__books">
              {(['全部', '最近', ...BOOK_ORDER] as const).map((b) => (
                <button
                  key={b}
                  className="lab__book"
                  data-active={book === b}
                  onClick={() => setBook(b)}
                >
                  {b}
                  <span className="lab__bookn">
                    {b === '全部'
                      ? EXPERIMENTS.length
                      : b === '最近'
                        ? recent.length
                        : EXPERIMENTS.filter((e) => e.book === b).length}
                  </span>
                </button>
              ))}
            </div>

            <div className="lab__fieldrow">
              {(['全部', ...FIELD_ORDER] as const).map((f) => (
                <button
                  key={f}
                  className="lab__field"
                  data-active={field === f}
                  style={f === '全部' ? undefined : ({ '--field': FIELD_COLOR[f] } as CSSProperties)}
                  onClick={() => setField(f)}
                >
                  <i />
                  {f}
                </button>
              ))}
              <button
                className="lab__field lab__field--fav"
                data-active={favOnly}
                onClick={() => setFavOnly((v) => !v)}
              >
                ★ 收藏
              </button>
            </div>

            <div className="lab__list">
              {list.length === 0 && <div className="lab__empty">没有匹配的实验</div>}
              {list.map((e) => (
                <div
                  key={e.id}
                  className="lab__item"
                  data-active={e.id === id}
                  role="button"
                  tabIndex={0}
                  onClick={() => pick(e.id)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') pick(e.id)
                  }}
                >
                  <span className="lab__itemno">{String(EXPERIMENTS.indexOf(e) + 1).padStart(2, '0')}</span>
                  <span className="lab__itemmain">
                    <span className="lab__itemname">{e.short}</span>
                    <span className="lab__itemmeta">
                      {e.book} · {e.field} · {e.kind}
                    </span>
                  </span>
                  <button
                    className="lab__itemfav"
                    data-on={fav.includes(e.id)}
                    title={fav.includes(e.id) ? '取消收藏' : '收藏'}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      toggleFav(e.id)
                    }}
                  >
                    ★
                  </button>
                </div>
              ))}
            </div>
          </aside>

          <LabDetail
            key={exp.id}
            exp={exp}
            fav={fav.includes(exp.id)}
            onFav={() => toggleFav(exp.id)}
            onClose={onClose}
            standalone={standalone}
            onOpenWindow={standalone ? undefined : openWindow}
          />
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────── 详情 ───────────────────────── */

const TABS = [
  { id: 'principle', label: '实验原理' },
  { id: 'steps', label: '器材与步骤' },
  { id: 'data', label: '数据处理' },
  { id: 'errors', label: '误差与注意' },
] as const

type TabId = (typeof TABS)[number]['id']

function LabDetail({
  exp,
  fav,
  onFav,
  onClose,
  standalone = false,
  onOpenWindow,
}: {
  exp: LabExperiment
  fav: boolean
  onFav: () => void
  onClose: () => void
  standalone?: boolean
  onOpenWindow?: () => void
}) {
  const [params, setParams] = useState<Record<string, number | string>>({ ...exp.params })
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(defaultSpeed(exp))
  const [t, setT] = useState(0)
  const [tab, setTab] = useState<TabId>('principle')
  const clock = useRef(0)

  /* 大屏演示：缩放 / 拖动 / 放大镜 / 聚光灯 / 批注 / 全屏 */
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [cursor, setCursor] = useState({ x: 0, y: 0, inside: false })
  const [lens, setLens] = useState(false)
  const [spot, setSpot] = useState(false)
  const [spotR, setSpotR] = useState(240)
  const [ink, setInk] = useState(false)
  const [full, setFull] = useState(false)
  const [stage, setStage] = useState({ w: 760, h: 430 })
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setStage({ w: r.width, h: r.height })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const clampView = (z: number, x: number, y: number) => {
    const mx = Math.max(0, ((z - 1) * stage.w) / 2)
    const my = Math.max(0, ((z - 1) * stage.h) / 2)
    return {
      zoom: z,
      x: Math.max(-mx, Math.min(mx, x)),
      y: Math.max(-my, Math.min(my, y)),
    }
  }

  const zoomAt = (next: number, cx = stage.w / 2, cy = stage.h / 2) => {
    const z = Math.max(1, Math.min(3.5, next))
    if (Math.abs(z - zoom) < 0.001) return
    const mx = cx - stage.w / 2
    const my = cy - stage.h / 2
    const v = clampView(z, pan.x + mx * (zoom - z), pan.y + my * (zoom - z))
    setZoom(v.zoom)
    setPan({ x: v.x, y: v.y })
  }

  const resetView = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  const stagePoint = (e: React.PointerEvent) => {
    const r = stageRef.current?.getBoundingClientRect()
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) }
  }

  const onStageDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const p = stagePoint(e)
    setCursor({ ...p, inside: true })
    if (zoom <= 1) return
    e.preventDefault()
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* 合成事件没有活动指针，忽略 */
    }
    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
  }

  const onStageMove = (e: React.PointerEvent) => {
    const p = stagePoint(e)
    setCursor({ ...p, inside: true })
    const d = dragRef.current
    if (!d) return
    const v = clampView(zoom, d.px + e.clientX - d.x, d.py + e.clientY - d.y)
    setPan({ x: v.x, y: v.y })
  }

  const onStageUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    dragRef.current = null
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* 指针已离开窗口 */
    }
  }

  const onStageLeave = () => {
    if (!dragRef.current) setCursor((c) => ({ ...c, inside: false }))
  }

  const toggleLens = () => {
    setLens((v) => {
      const next = !v
      if (next) {
        setSpot(false)
        setInk(false)
        setCursor((c) => (c.inside ? c : { x: stage.w / 2, y: stage.h / 2, inside: true }))
      }
      return next
    })
  }

  const toggleSpot = () => {
    setSpot((v) => {
      const next = !v
      if (next) {
        setLens(false)
        setInk(false)
        setSpotR(Math.round(Math.max(100, Math.min(240, stage.h * 0.45))))
        setCursor((c) => (c.inside ? c : { x: stage.w / 2, y: stage.h / 2, inside: true }))
      }
      return next
    })
  }

  const toggleInk = () => {
    setInk((v) => {
      const next = !v
      if (next) {
        setLens(false)
        setSpot(false)
      }
      return next
    })
  }

  const toggleFull = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void document.documentElement.requestFullscreen().catch(() => {})
    }
  }

  useEffect(() => {
    const on = () => setFull(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])

  // 滚轮缩放：必须用原生监听才能 preventDefault
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const cx = e.clientX - r.left
      const cy = e.clientY - r.top
      setCursor({ x: cx, y: cy, inside: true })
      zoomAt(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), cx, cy)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoom, pan, stage])

  // I 批注 / F 全屏；输入框与批注层里让位
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.tagName === 'SELECT') return
      if (document.querySelector('.screenink')) return
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault()
        toggleInk()
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        toggleFull()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    // rAF 的时间戳可能早于 performance.now()，第一帧会算出负的 dt
    let last = -1
    const loop = (now: number) => {
      if (last < 0) last = now
      const dt = Math.max(0, Math.min(64, now - last)) / 1000
      last = now
      clock.current += dt * speed
      setT(clock.current)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed])

  const reset = () => {
    clock.current = 0
    setT(0)
    setPlaying(true)
  }

  // 空格播放 / 暂停；搜索框里让位给输入
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.tagName === 'SELECT') return
      if (e.code !== 'Space') return
      e.preventDefault()
      setPlaying((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const model = useMemo(() => labModel(exp, params, t), [exp, params, t])

  /* 端到端验证用的调试钩子：把时间拨到指定时刻，避免依赖 rAF 的实际帧率 */
  useEffect(() => {
    const w = window as unknown as {
      __lab?: { id: string; setT: (v: number) => void; getT: () => number; model: () => ReturnType<typeof labModel> }
    }
    w.__lab = {
      id: exp.id,
      setT: (v: number) => {
        clock.current = v
        setT(v)
      },
      getT: () => clock.current,
      model: () => labModel(exp, params, clock.current),
    }
    return () => {
      delete w.__lab
    }
  }, [exp, params])
  const accent = FIELD_COLOR[exp.field]

  const lensZoom = 2.4
  const lensR = Math.max(84, Math.min(126, stage.h * 0.3))
  const lensTx = stage.w / 2 + pan.x + (cursor.x - stage.w / 2) * zoom
  const lensTy = stage.h / 2 + pan.y + (cursor.y - stage.h / 2) * zoom
  const lensLeft = Math.max(4, Math.min(stage.w - lensR * 2 - 4, cursor.x - lensR))
  const lensTop = Math.max(4, Math.min(stage.h - lensR * 2 - 4, cursor.y - lensR))

  return (
    <section className="lab__detail">
      <div className="lab__titlebar">
        <div className="lab__titlemain">
          <div className="lab__kicker">
            <span className="lab__dot" style={{ background: accent }} />
            {exp.book} · {exp.chapter} · {exp.section}
            <span className="lab__kind">{exp.kind}</span>
          </div>
          <h2 className="lab__title">{exp.name}</h2>
          <p className="lab__tagline">{exp.tagline}</p>
        </div>
        <div className="lab__titleacts">
          <button className="lab__star" data-on={fav} onClick={onFav} title={fav ? '取消收藏' : '收藏这个实验'}>
            ★
          </button>
          <button className="btn lab__reset" onClick={reset} title="回到起点重新播放">
            重置
          </button>
          {onOpenWindow && (
            <button className="iconbtn lab__windowbtn" title="在独立窗口打开（适合投影 / 双屏）" onClick={onOpenWindow}>
              <WindowIcon size={16} />
            </button>
          )}
          <button className="iconbtn" title={standalone ? '关闭窗口' : '关闭（Esc）'} onClick={onClose}>
            <CloseIcon size={15} />
          </button>
        </div>
      </div>

      <div className="lab__stagecol">
        <div className="lab__stagebar">
          <button className="lab__play" onClick={() => setPlaying((v) => !v)} title="空格播放 / 暂停">
            {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
            {playing ? '暂停' : '播放'}
          </button>
          <div className="segmented lab__speeds">
            {[0.5, 1, 1.5].map((v) => (
              <button key={v} className="segmented__btn" data-active={speed === v} onClick={() => setSpeed(v)}>
                {v}×
              </button>
            ))}
          </div>
          {model.formula ? (
            <div className="lab__stageformula">
              <code>{model.formula.expr}</code>
              {model.formula.sub && <span>{model.formula.sub}</span>}
            </div>
          ) : (
            <span className="lab__hintline">右侧滑杆即时生效，画面与读数同步</span>
          )}

          <div className="lab__viewtools">
            <button className="lab__viewbtn" title="缩小（滚轮）" onClick={() => zoomAt(zoom / 1.2)}>
              <ZoomOutIcon size={17} />
            </button>
            <button className="lab__zoomval" title="点击恢复 100%" onClick={resetView}>
              {Math.round(zoom * 100)}%
            </button>
            <button className="lab__viewbtn" title="放大（滚轮）" onClick={() => zoomAt(zoom * 1.2)}>
              <ZoomInIcon size={17} />
            </button>
            <button className="lab__viewbtn" title="适应窗口（双击画面也可）" onClick={resetView}>
              <FitIcon size={17} />
            </button>
            <span className="lab__viewsep" />
            <button
              className="lab__viewbtn"
              data-active={lens}
              title="放大镜：跟随指针，放大局部"
              onClick={toggleLens}
            >
              <LensIcon size={17} />
            </button>
            <button
              className="lab__viewbtn"
              data-active={spot}
              title="聚光灯：压暗四周，只留光圈"
              onClick={toggleSpot}
            >
              <SpotlightIcon size={17} />
            </button>
            <button
              className="lab__viewbtn"
              data-active={ink}
              title="全屏批注：可直接在动画和读数上圈画（I）"
              onClick={toggleInk}
            >
              <PencilIcon size={17} />
            </button>
            <button
              className="lab__viewbtn"
              data-active={full}
              title="全屏（F / F11）"
              onClick={toggleFull}
            >
              <FullscreenIcon size={17} exit={full} />
            </button>
          </div>
        </div>

        <div
          className={`lab__stagebox ${zoom > 1 ? 'is-zoomed' : ''}`}
          ref={stageRef}
          onPointerDown={onStageDown}
          onPointerMove={onStageMove}
          onPointerUp={onStageUp}
          onPointerCancel={onStageUp}
          onPointerLeave={onStageLeave}
          onDoubleClick={resetView}
        >
          <div
            className="lab__stagezoom"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            <LabStage exp={exp} m={model} t={t} />
          </div>

          {spot && (
            <div
              className="lab__spot"
              style={
                {
                  '--sx': `${cursor.x}px`,
                  '--sy': `${cursor.y}px`,
                  '--sr': `${spotR}px`,
                } as CSSProperties
              }
            />
          )}
          {spot && (
            <div className="lab__spotctl" onPointerDown={(e) => e.stopPropagation()}>
              <span>光圈</span>
              <input
                type="range"
                min={100}
                max={340}
                step={10}
                value={spotR}
                onChange={(e) => setSpotR(Number(e.target.value))}
                aria-label="聚光灯大小"
              />
            </div>
          )}

          {lens && cursor.inside && stage.w > lensR * 2 + 8 && stage.h > lensR * 2 + 8 && (
            <div
              className="lab__lens"
              style={{ left: lensLeft, top: lensTop, width: lensR * 2, height: lensR * 2 }}
            >
              <div
                className="lab__lensinner"
                style={{
                  width: stage.w,
                  height: stage.h,
                  transform: `translate(${lensR - lensTx * lensZoom}px, ${lensR - lensTy * lensZoom}px) scale(${lensZoom})`,
                }}
              >
                <div
                  className="lab__lensview"
                  style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
                >
                  <LabStage exp={exp} m={model} t={t} />
                </div>
              </div>
            </div>
          )}

          {zoom > 1 && <div className="lab__zoombadge">拖动画面移动视角 · 双击复位</div>}
        </div>
      </div>

      <aside className="lab__data">
        <div className="lab__datahead">
          实时数据
          <span>播放 / 改参数都会同步</span>
        </div>
        <div className="lab__params">
          {exp.controls.map((c) => {
            const value = Number(params[c.id] ?? c.min)
            const digits = c.digits ?? (c.step >= 1 ? 0 : c.step >= 0.1 ? 1 : 2)
            return (
              <label className="lab__ctl" key={c.id}>
                <span className="lab__ctlname">{c.label}</span>
                <input
                  type="range"
                  min={c.min}
                  max={c.max}
                  step={c.step}
                  value={value}
                  onChange={(e) => setParams((prev) => ({ ...prev, [c.id]: Number(e.target.value) }))}
                />
                <b className="lab__ctlval">
                  {value.toFixed(digits)}
                  {c.unit && <i>{c.unit}</i>}
                </b>
              </label>
            )
          })}

          {exp.selects?.map((sel) => {
            const value = String(params[sel.id] ?? sel.options[0]?.value ?? '')
            return (
              <label className="lab__ctl lab__ctl--select" key={sel.id}>
                <span className="lab__ctlname">{sel.label}</span>
                <select
                  className="lab__select"
                  value={value}
                  onChange={(e) => setParams((prev) => ({ ...prev, [sel.id]: e.target.value }))}
                >
                  {sel.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            )
          })}
        </div>

        <div className="lab__reads">
          {model.readings.map((r) => (
            <div className="lab__read" key={r.label} data-tone={r.tone ?? 'plain'}>
              <span className="lab__readlabel">{r.label}</span>
              <span className="lab__readvalue">
                {r.value}
                {r.unit && <i>{r.unit}</i>}
              </span>
              {r.hint && <span className="lab__readhint">{r.hint}</span>}
            </div>
          ))}
        </div>

        {/* 简谐运动的 x-t 图已经画在演示台里，右栏不再重复，给读数和参数让位 */}
        {model.chart && exp.stage !== 'shm' && <MiniChart chart={model.chart} />}

        {model.note && <p className="lab__note">{model.note}</p>}
        <p className="lab__disclaimer">读数为按公式实时计算的教学演示值，用于理解规律；真实实验会存在误差。</p>
      </aside>

      <div className="lab__notes">
        <div className="lab__tabs">
          {TABS.map((x) => (
            <button key={x.id} className="lab__tab" data-active={tab === x.id} onClick={() => setTab(x.id)}>
              {x.label}
            </button>
          ))}
          <span className="lab__concl">结论：{exp.conclusion}</span>
        </div>

        <div className="lab__tabbody">
          {tab === 'principle' && (
            <div className="lab__prose">
              <p>{exp.principle}</p>
              <div className="lab__formulas">
                {exp.formulas.map((f) => (
                  <div key={f.expr} className="lab__fcard">
                    <code>{f.expr}</code>
                    <span>{f.note}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'steps' && (
            <div className="lab__cols">
              <div>
                <h4>实验器材</h4>
                <div className="lab__chips">
                  {exp.apparatus.map((a) => (
                    <span key={a}>{a}</span>
                  ))}
                </div>
              </div>
              <div>
                <h4>实验步骤</h4>
                <ol className="lab__steps">
                  {exp.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          {tab === 'data' && (
            <div className="lab__cols">
              <div>
                <h4>数据处理</h4>
                <ul className="lab__bullets">
                  {exp.data.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="lab__chartTips">
                <h4>怎么读图</h4>
                <p>{model.chart ? `「${model.chart.title}」中，圆点是当前时刻。改变参数看曲线怎么动，比背结论更容易记住。` : '这个实验的结论直接来自读数比较，把滑杆推到底看极端情况最直观。'}</p>
                <p className="lab__muted">图像与读数都由公式实时算出，和教材例题的数据口径一致。</p>
                <div className="lab__conclusion">
                  <b>结论</b>
                  {exp.conclusion}
                </div>
              </div>
            </div>
          )}

          {tab === 'errors' && (
            <div className="lab__cols">
              <div>
                <h4>误差来源</h4>
                <ul className="lab__bullets">
                  {exp.errors.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>注意事项</h4>
                <ul className="lab__bullets lab__bullets--warn">
                  {exp.cautions.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      <ScreenInk active={ink} onExit={() => setInk(false)} />
    </section>
  )
}

/* ───────────────────────── 迷你图表 ───────────────────────── */

function tickText(v: number, span: number) {
  if (Math.abs(v) >= 1000) return v.toExponential(0)
  if (span !== 0 && Math.abs(span) < 1e-3) return v === 0 ? '0' : v.toExponential(1)
  if (span < 0.1) return v.toFixed(3)
  if (span < 2) return v.toFixed(2)
  if (span < 20) return v.toFixed(1)
  return v.toFixed(0)
}

const MiniChart = memo(function MiniChart({ chart }: { chart: LabChart }) {
  const W = 300
  const H = 132
  const L = 40
  const B = 22
  const T = 12
  const R = 10
  const [x0, x1] = chart.xRange
  const [y0, y1] = chart.yRange
  const xr = x1 - x0 || 1
  const yr = y1 - y0 || 1
  const sx = (v: number) => L + ((v - x0) / xr) * (W - L - R)
  const sy = (v: number) => T + (1 - (v - y0) / yr) * (H - T - B)
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="lab__chart">
      <div className="lab__charthead">
        {chart.title}
        <span>
          {chart.xLabel} / {chart.yLabel}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="lab__chartsvg" role="img" aria-label={chart.title}>
        {ticks.map((k) => (
          <line key={k} x1={L} y1={sy(y0 + yr * k)} x2={W - R} y2={sy(y0 + yr * k)} stroke="#efede8" strokeWidth={0.7} />
        ))}
        {ticks.map((k) => (
          <g key={`y${k}`}>
            <text x={L - 6} y={sy(y0 + yr * k) + 3} textAnchor="end" fontSize={7.5} fill="#8e8a84" fontFamily="inherit">
              {tickText(y0 + yr * k, yr)}
            </text>
          </g>
        ))}
        {ticks.map((k) => (
          <g key={`x${k}`}>
            <text x={sx(x0 + xr * k)} y={H - 10} textAnchor="middle" fontSize={7.5} fill="#8e8a84" fontFamily="inherit">
              {tickText(x0 + xr * k, xr)}
            </text>
          </g>
        ))}
        <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="#d8d4ce" strokeWidth={0.9} />
        <line x1={L} y1={T} x2={L} y2={H - B} stroke="#d8d4ce" strokeWidth={0.9} />

        {chart.vline !== undefined && chart.vline >= x0 && chart.vline <= x1 && (
          <line x1={sx(chart.vline)} y1={T} x2={sx(chart.vline)} y2={H - B} stroke="#b08a3e" strokeWidth={0.9} strokeDasharray="3 3" opacity={0.7} />
        )}
        {chart.hline !== undefined && chart.hline >= y0 && chart.hline <= y1 && (
          <line x1={L} y1={sy(chart.hline)} x2={W - R} y2={sy(chart.hline)} stroke="#b08a3e" strokeWidth={0.9} strokeDasharray="3 3" opacity={0.7} />
        )}

        {chart.series.map((s, i) => {
          const color = s.color ?? '#3d5a66'
          if (s.dots) {
            return (
              <g key={i}>
                {s.pts.map(([px, py], k) => (
                  <circle key={k} cx={sx(px)} cy={sy(py)} r={3} fill={color} />
                ))}
              </g>
            )
          }
          const d = s.pts.map(([px, py], k) => `${k === 0 ? 'M' : 'L'}${sx(px).toFixed(1)} ${sy(py).toFixed(1)}`).join(' ')
          return (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              strokeDasharray={s.dashed ? '4 3' : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.9}
            />
          )
        })}

        {chart.cursor && (
          <g>
            <line x1={sx(chart.cursor[0])} y1={T} x2={sx(chart.cursor[0])} y2={H - B} stroke="#3d5a66" strokeWidth={0.7} strokeDasharray="2 3" opacity={0.45} />
            <circle cx={sx(chart.cursor[0])} cy={sy(chart.cursor[1])} r={4.2} fill="#b08a3e" stroke="#ffffff" strokeWidth={1.4} />
          </g>
        )}
      </svg>
      {chart.series.filter((s) => s.label).length > 1 && (
        <div className="lab__legend">
          {chart.series
            .filter((s) => s.label)
            .map((s, i) => (
              <span key={i}>
                <i style={{ background: s.color ?? '#3d5a66', opacity: s.dashed ? 0.55 : 1 }} />
                {s.label}
              </span>
            ))}
        </div>
      )}
    </div>
  )
})
