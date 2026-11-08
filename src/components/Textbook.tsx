import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
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
  ExportIcon,
  EyeIcon,
  EyeOffIcon,
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

/** 导出 SVG 时的 XML 转义 */
function escapeXml(text: string) {
  const map: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }
  return text.replace(/[<>&"]/g, (c) => map[c] ?? c)
}

/** 文件名里不能出现的字符 */
function safeName(text: string) {
  return text.replace(/[\\/:*?"<>|]/g, '·').trim() || '教材实验'
}

/** 等两帧：让「导出中」的 class 先落到 DOM，截出来的图才没有工具条 */
const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

interface Props {
  onClose: () => void
  initialId?: string
  /** 独立窗口：去掉左侧列表与底部说明，默认专注 + 大屏 */
  standalone?: boolean
}

export function Textbook({ onClose, initialId, standalone = false }: Props) {
  const [full, setFull] = useState(false)

  /** 真·全屏：优先走主进程 setFullScreen，才能盖住 Windows 任务栏 */
  const applyFull = (on: boolean) => {
    setFull(on)
    if (window.chordot?.setFullscreen) {
      void window.chordot.setFullscreen(on).catch(() => {})
      return
    }
    if (on) void document.documentElement.requestFullscreen?.().catch(() => {})
    else if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  }

  useEscape(true, () => {
    // 批注层开着时 Esc 先退出批注，不要顺手把整个实验关掉
    if (document.querySelector('.screenink[data-active="true"]')) return
    // 全屏演示时 Esc 先退全屏，第二次才关实验
    if (full) {
      applyFull(false)
      return
    }
    if (!standalone) onClose()
  })

  // 原生全屏状态可能被 F11 / 系统手势改掉，跟着同步 class
  useEffect(() => {
    const onFs = () => setFull(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFs)
    const off = window.chordot?.onFullscreenChange?.((on) => setFull(on))
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      off?.()
    }
  }, [])

  // 关掉教材时一定要退出全屏，否则主窗口会一直留在全屏
  useEffect(() => {
    if (!full) return
    return () => {
      if (window.chordot?.setFullscreen) void window.chordot.setFullscreen(false).catch(() => {})
      else if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    }
  }, [full])

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
    // 主窗口和独立窗口共用同一个「当前实验」：切了就广播给另一边
    window.chordot?.syncLab?.(next)
  }

  /** 另一个窗口切了实验：跟着切，但不要再广播回去（否则两边互相打断） */
  useEffect(() => {
    const off = window.chordot?.onLabSync?.((next) => {
      if (!next || next === id || !EXPERIMENTS.some((e) => e.id === next)) return
      setId(next)
      const list = [next, ...readList(RECENT_KEY).filter((x) => x !== next)].slice(0, 6)
      setRecent(list)
      writeList(RECENT_KEY, list)
    })
    return () => off?.()
  }, [id])

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
      if (document.querySelector('.screenink[data-active="true"]')) return
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
      className={`lab ${standalone ? 'lab--solo' : ''} ${full ? 'lab--full' : ''} ${large ? 'lab--large' : ''} ${focus ? 'lab--focus' : ''}`}
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
                  data-id={e.id}
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
            full={full}
            large={large}
            onToggleFull={() => applyFull(!full)}
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
  full = false,
  large = false,
  onToggleFull,
  onOpenWindow,
}: {
  exp: LabExperiment
  fav: boolean
  onFav: () => void
  onClose: () => void
  standalone?: boolean
  full?: boolean
  large?: boolean
  onToggleFull: () => void
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
  const [lensZoom, setLensZoom] = useState(() => {
    try {
      const v = Number(localStorage.getItem('chordot.lab.lensZoom'))
      return Number.isFinite(v) && v >= 1.5 && v <= 5 ? v : 2.4
    } catch {
      return 2.4
    }
  })
  const [spot, setSpot] = useState(false)
  const [spotR, setSpotR] = useState(240)
  const [ink, setInk] = useState(false)
  const [inkHidden, setInkHidden] = useState(false)
  const [inkCount, setInkCount] = useState(0)
  /** 导出菜单挂在 body 上：右栏会盖住标题栏里的下拉 */
  const [exportAt, setExportAt] = useState<{ x: number; y: number } | null>(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [stage, setStage] = useState({ w: 760, h: 430 })
  const stageRef = useRef<HTMLDivElement>(null)
  const dataRef = useRef<HTMLElement>(null)
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  /** 双指捏合：按 pointerId 记位置，第二根手指落下才开始 */
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{
    dist: number
    zoom: number
    pan: { x: number; y: number }
    /** 起点两指中心压住的画面坐标 */
    u: { x: number; y: number }
  } | null>(null)
  const msgTimer = useRef(0)
  const fullRef = useRef(onToggleFull)
  fullRef.current = onToggleFull

  const flash = (text: string) => {
    setMsg(text)
    window.clearTimeout(msgTimer.current)
    msgTimer.current = window.setTimeout(() => setMsg(''), 2600)
  }

  const changeLensZoom = (v: number) => {
    setLensZoom(v)
    try {
      localStorage.setItem('chordot.lab.lensZoom', String(v))
    } catch {
      /* 隐私模式静默失败 */
    }
  }

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
    // 主指针落下先清空：手指滑出窗口时收不到 pointerup，残留的僵尸指针会把单指当成双指
    if (e.isPrimary) pointers.current.clear()
    pointers.current.set(e.pointerId, p)

    if (pointers.current.size >= 2) {
      // 双指：捏合缩放，单指拖动立刻让位
      dragRef.current = null
      const [a, b] = [...pointers.current.values()]
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        zoom,
        pan: { ...pan },
        // 反解出两指中心压住的画面坐标：缩放时它始终跟着手指走
        u: {
          x: stage.w / 2 + (mid.x - stage.w / 2 - pan.x) / zoom,
          y: stage.h / 2 + (mid.y - stage.h / 2 - pan.y) / zoom,
        },
      }
      e.preventDefault()
      return
    }

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
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, p)

    const pin = pinch.current
    if (pin && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const z = Math.max(1, Math.min(3.5, (pin.zoom * dist) / pin.dist))
      // 起点中心 u 保持在当前两指中心：捏合的同时也能双指拖动画面
      const v = clampView(
        z,
        mid.x - stage.w / 2 - z * (pin.u.x - stage.w / 2),
        mid.y - stage.h / 2 - z * (pin.u.y - stage.h / 2),
      )
      setZoom(v.zoom)
      setPan({ x: v.x, y: v.y })
      return
    }

    const d = dragRef.current
    if (!d) return
    const v = clampView(zoom, d.px + e.clientX - d.x, d.py + e.clientY - d.y)
    setPan({ x: v.x, y: v.y })
  }

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (!dragRef.current) return
    dragRef.current = null
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* 指针已离开窗口 */
    }
  }

  const onStageLeave = () => {
    if (!dragRef.current && !pinch.current) setCursor((c) => ({ ...c, inside: false }))
  }

  const rectUnion = (els: (HTMLElement | null | undefined)[]) => {
    const rects = els.filter((el): el is HTMLElement => !!el).map((el) => el.getBoundingClientRect())
    if (rects.length === 0) return null
    const left = Math.min(...rects.map((r) => r.left))
    const top = Math.min(...rects.map((r) => r.top))
    const right = Math.max(...rects.map((r) => r.right))
    const bottom = Math.max(...rects.map((r) => r.bottom))
    return { x: left, y: top, width: right - left, height: bottom - top }
  }

  /** 截当前画面：走主进程 capturePage，所见即所得（缩放、放大镜、批注都在里面） */
  const exportPng = async (
    els: (HTMLElement | null | undefined)[],
    withInk: boolean,
    name: string,
    sheet = false,
  ) => {
    const api = window.chordot
    if (!api?.labCapture) {
      flash('当前环境不支持画面导出，请在桌面版 / 独立窗口里用')
      return
    }
    const html = document.documentElement
    html.dataset.capturing = '1'
    if (!withInk) html.dataset.hideInk = '1'
    // 讲稿图：把底部说明让出来，读数栏一次看全（否则图表会被截一半）
    if (sheet) html.dataset.sheet = '1'
    setBusy('png')
    try {
      await nextFrame()
      const rect = rectUnion(els)
      if (!rect) return
      const shot = await api.labCapture(rect)
      if (!shot?.data) {
        flash('截图失败，请重试')
        return
      }
      const res = await api.exportFile({
        data: shot.data,
        encoding: 'base64',
        name: `${name}.png`,
        format: 'png',
      })
      if (res.canceled) return
      if (res.error) {
        flash(`导出失败：${res.error}`)
        return
      }
      flash(`已导出 ${name}.png`)
    } finally {
      delete html.dataset.capturing
      delete html.dataset.hideInk
      delete html.dataset.sheet
      setBusy('')
    }
  }

  /** 矢量导出：把演示台 SVG 原样搬出来，批注按窗口坐标反算回 760×430 视口 */
  const exportSvg = async (withInk: boolean) => {
    const api = window.chordot
    const svg = stageRef.current?.querySelector('svg.lab__svg') as SVGSVGElement | null
    if (!api || !svg) return
    const r = svg.getBoundingClientRect()
    const vbW = 760
    const vbH = 430
    const foot = 40
    const scale = Math.min(r.width / vbW, r.height / vbH) || 1
    const offX = (r.width - vbW * scale) / 2
    const offY = (r.height - vbH * scale) / 2
    const ink = withInk
      ? [...document.querySelectorAll<SVGPathElement>('.screenink__canvas path')]
          .map((p) => p.outerHTML)
          .join('')
      : ''
    const inkGroup = ink
      ? `<g transform="translate(${(-(r.left + offX) / scale).toFixed(3)} ${(-(
          r.top + offY
        ) / scale).toFixed(3)}) scale(${(1 / scale).toFixed(4)})">${ink}</g>`
      : ''
    const formula = model.formula
      ? `${model.formula.expr} ${model.formula.sub ?? ''}`.trim().slice(0, 64)
      : ''
    const font = "'Noto Sans SC','Source Han Sans SC',system-ui,sans-serif"
    const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${vbW * 2}" height="${(vbH + foot) * 2}" viewBox="0 0 ${vbW} ${vbH + foot}">
<rect x="0" y="0" width="${vbW}" height="${vbH + foot}" fill="#FAFAF8"/>
<g>${svg.innerHTML}</g>
${inkGroup}
<line x1="0" y1="${vbH + 1}" x2="${vbW}" y2="${vbH + 1}" stroke="#e2ded7" stroke-width="1"/>
<text x="18" y="${vbH + 25}" font-family="${font}" font-size="13" fill="#3d5a66">${escapeXml(exp.name)}</text>
<text x="${vbW - 18}" y="${vbH + 25}" text-anchor="end" font-family="${font}" font-size="12" fill="#8e8a84">${escapeXml(formula)}</text>
</svg>`
    setBusy('svg')
    try {
      const res = await api.exportFile({
        data: out,
        name: `${safeName(exp.name)}-画面.svg`,
        format: 'svg',
      })
      if (res.canceled) return
      if (res.error) {
        flash(`导出失败：${res.error}`)
        return
      }
      flash(`已导出 ${safeName(exp.name)}-画面.svg`)
    } finally {
      setBusy('')
    }
  }

  const doExport = (kind: 'stage-ink' | 'stage-plain' | 'sheet' | 'svg') => {
    setExportAt(null)
    const name = safeName(exp.name)
    if (kind === 'svg') {
      void exportSvg(true)
      return
    }
    const stageCol = stageRef.current?.closest('.lab__stagecol') as HTMLElement | null
    if (kind === 'stage-ink') void exportPng([stageRef.current], true, `${name}-画面`)
    else if (kind === 'stage-plain') void exportPng([stageRef.current], false, `${name}-画面-无批注`)
    else void exportPng([stageCol, dataRef.current], true, `${name}-讲稿`, true)
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
        // 隐藏状态下按批注：先把笔迹显示回来，否则像在对空气画
        setInkHidden(false)
      }
      return next
    })
  }

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
      if (document.querySelector('.screenink[data-active="true"]')) return
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault()
        toggleInk()
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        fullRef.current()
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
          <div className="lab__export">
            <button
              className="iconbtn lab__exportbtn"
              data-active={!!exportAt}
              title="导出当前实验画面（含批注 / 讲稿图）"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                setExportAt((v) => (v ? null : { x: r.right, y: r.bottom + 6 }))
              }}
            >
              <ExportIcon size={16} />
            </button>
            {exportAt &&
              createPortal(
                <>
                  <div className="lab__exportmask" onClick={() => setExportAt(null)} />
                  <div
                    className="lab__exportmenu"
                    role="menu"
                    aria-label="导出"
                    style={{ left: Math.max(8, exportAt.x - 250), top: exportAt.y }}
                  >
                    <button onClick={() => doExport('stage-ink')}>当前画面 PNG（含批注）</button>
                    <button onClick={() => doExport('stage-plain')}>当前画面 PNG（不含批注）</button>
                    <button onClick={() => doExport('sheet')}>讲稿图 PNG（画面 + 读数 + 图表）</button>
                    <button onClick={() => doExport('svg')}>当前画面 SVG（矢量，含批注）</button>
                  </div>
                </>,
                document.body,
              )}
          </div>
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
            <div
              className="lab__stageformula"
              title={`${model.formula.expr}${model.formula.sub ? ` ${model.formula.sub}` : ''}`}
            >
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
            <button
              className="lab__zoomval"
              title="适应窗口：点击恢复 100%（双击画面也可）"
              onClick={resetView}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button className="lab__viewbtn" title="放大（滚轮）" onClick={() => zoomAt(zoom * 1.2)}>
              <ZoomInIcon size={17} />
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
            {inkCount > 0 && (
              <button
                className="lab__viewbtn"
                data-active={!inkHidden}
                title={inkHidden ? '显示批注' : '隐藏批注'}
                onClick={() => setInkHidden((v) => !v)}
              >
                {inkHidden ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
              </button>
            )}
            <button
              className="lab__viewbtn"
              data-active={full}
              title="全屏演示（F）：铺满整块屏幕，盖住任务栏"
              onClick={onToggleFull}
            >
              <FullscreenIcon size={17} exit={full} />
            </button>
          </div>
        </div>

        <div
          className={`lab__stagebox ${zoom > 1 ? 'is-zoomed' : ''}`}
          ref={stageRef}
          data-zoom={zoom.toFixed(3)}
          onPointerDown={onStageDown}
          onPointerMove={onStageMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onLostPointerCapture={endPointer}
          onPointerLeave={onStageLeave}
          onDoubleClick={resetView}
        >
          <div
            className="lab__stagezoom"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            <LabStage exp={exp} m={model} t={t} textScale={large ? 1.22 : 1} />
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

          {lens && (
            <div className="lab__spotctl lab__lensctl" onPointerDown={(e) => e.stopPropagation()}>
              <span>倍率 {lensZoom.toFixed(1)}×</span>
              <input
                type="range"
                min={1.5}
                max={5}
                step={0.1}
                value={lensZoom}
                onChange={(e) => changeLensZoom(Number(e.target.value))}
                aria-label="放大镜倍率"
                data-lens-zoom={lensZoom.toFixed(1)}
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
                  <LabStage exp={exp} m={model} t={t} textScale={large ? 1.22 : 1} />
                </div>
              </div>
            </div>
          )}

          {zoom > 1 && <div className="lab__zoombadge">拖动画面 · 双指缩放 · 双击复位</div>}
        </div>
      </div>

      <aside className="lab__data" ref={dataRef}>
        <div className="lab__datahead">
          实时数据
          <span>播放 / 改参数都会同步</span>
        </div>
        <div className="lab__params">
          {exp.controls
            .filter((c) => !c.showWhen || String(params[c.showWhen.id] ?? '') === c.showWhen.is)
            .map((c) => {
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

      <ScreenInk
        active={ink}
        storageKey={exp.id}
        hidden={inkHidden}
        onExit={() => setInk(false)}
        onHide={() => {
          setInkHidden(true)
          setInk(false)
        }}
        onCount={setInkCount}
      />

      {msg && <div className="lab__exportmsg">{msg}</div>}
      {busy && <div className="lab__exportbusy">{busy === 'svg' ? '正在生成 SVG…' : '正在截图…'}</div>}
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
