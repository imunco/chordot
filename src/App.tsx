import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { CanvasStage } from './components/CanvasStage'
import { CommandPalette, type PaletteItem } from './components/CommandPalette'
import { LeftPanel } from './components/LeftPanel'
import { RightPanel } from './components/RightPanel'
import { StatusBar } from './components/StatusBar'
import { SymbolPad } from './components/SymbolPad'
import { TemplateGallery } from './components/TemplateGallery'
import { ShapePanel } from './components/ShapePanel'
import { PenBar } from './components/PenBar'
import { Shortcuts } from './components/Shortcuts'
import { Timeline } from './components/Timeline'
import { Textbook } from './components/Textbook'
import { shapeById } from './data/shapes'
import { shape3dById } from './data/shapes3d'
import type { Template } from './data/templates'
import { TitleBar } from './components/TitleBar'
import { Toolbar } from './components/Toolbar'
import { KernelClient } from './kernel/client'
import {
  angleFromPoint,
  constraintMovers,
  INCLINE,
  sampleFunction,
  seedForConstraint,
  solveScene,
} from './kernel/scene'
import type {
  Camera,
  MechLink,
  MechLinkKind,
  MechLive,
  MechParams,
  MechPart,
  MechPartKind,
  DocMeta,
  PhysicsForce,
  SceneSpec,
  SketchConstraint,
  SketchConstraintType,
  SolidShape,
} from './kernel/types'
import { baseName as fileName, parseDoc, serializeDoc } from './io/file'
import { buildIncremental, emptyCache, exposeStats, type BuildCache } from './model/graph'
import { RigidWorld } from './kernel/rigid'
import { evalForce } from './model/force'
import { forceDir } from './model/force3d'
import type { BodySnapshot } from './kernel/rigid'
import { measure } from './model/measure'
import { schemaFor } from './model/props'
import { dueForCheck, loadSettings, saveSettings, type Settings } from './settings'
import { Preferences } from './components/Preferences'
import { Onboarding } from './components/Onboarding'
import { UpdateDialog } from './components/UpdateDialog'
import { useUpdater } from './updater'
import { PX_PER_UNIT } from './model/scale'
import { MechBar } from './components/MechBar'
import { PresentTools } from './components/PresentTools'
import {
  Lobby,
  type LobbyQuick,
  type RecentFileMeta,
  type LibraryFileMeta,
} from './components/Lobby'
import { NewDocDialog, type NewDocValues } from './components/NewDocDialog'
import { cleanFileName, fileNameOf, starterScene } from './model/starters'
import { cachedQuote, fetchDailyQuote, randomQuote, type DailyQuote } from './model/hitokoto'
import { makeLink, makePart, MECH_GROUND_Y, presetById, type MechPresetId } from './model/mech'
import {
  conflictScene,
  inclineScene,
  inclineSlideScene,
  initialState,
  pendulumScene,
  projectileScene,
  reducer,
  sketchScene,
  solidInclineScene,
  solidScene,
  springScene,
  triangleScene,
} from './state'
import type { ToolId } from './state'

interface Toast {
  id: number
  text: string
}

/**
 * 启动时是否先显示大厅。
 * - 主窗口没有查询参数：按设置（默认显示大厅）。
 * - ?lobby=1 强制显示（验证脚本 / 演示）。
 * - ?lobby=0 不显示；带其它 query 的窗口（教材独立窗口、符号实验室、?notour=1 的验证脚本）一律直接进编辑器。
 */
function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0')
}

function shouldShowLobby(): boolean {
  try {
    const query = new URLSearchParams(location.search)
    const force = query.get('lobby')
    if (force === '0') return false
    if (force === '1') return true
    if ([...query.keys()].length > 0) return false
    return loadSettings().startInLobby !== false
  } catch {
    return true
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [recent, setRecent] = useState<string[]>([])
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [prefsTab, setPrefsTab] = useState<'general' | 'look' | 'update' | 'about'>('general')
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  /** 启动页：第一次渲染前决定一次，之后由大厅 / 编辑器切换 */
  const bootLobbyRef = useRef<boolean | null>(null)
  if (bootLobbyRef.current === null) bootLobbyRef.current = shouldShowLobby()
  const [lobbyOpen, setLobbyOpen] = useState<boolean>(bootLobbyRef.current)
  const [newDocOpen, setNewDocOpen] = useState(false)
  /** 上次打开的课件（大厅「继续上次」） */
  const [lastFile, setLastFile] = useState<string | null>(null)
  /** 本次是否已经进过编辑器（大厅「回到编辑」） */
  const [hasDoc, setHasDoc] = useState(false)
  // 验证脚本用 ?notour=1 跳过引导，免得遮住要点的按钮；大厅里先不弹引导，进入编辑器再弹
  const [tourOpen, setTourOpen] = useState(
    () => !bootLobbyRef.current && !location.search.includes('notour') && !loadSettings().onboarded,
  )
  const [updateOpen, setUpdateOpen] = useState(false)
  /** 批注偏好恢复完成前不要回写，否则会用默认值盖掉上次的笔 */
  const [penReady, setPenReady] = useState(false)

  /* ── 0.16.0：大厅工程化 / 演示 / 版本历史 ── */
  const [recentFiles, setRecentFiles] = useState<RecentFileMeta[]>([])
  const [library, setLibrary] = useState<LibraryFileMeta[]>([])
  const [quote, setQuote] = useState<DailyQuote | null>(() =>
    loadSettings().dailyQuote ? cachedQuote() : null,
  )
  const [recovery, setRecovery] = useState<{ at: number; file: string; filePath: string | null } | null>(
    null,
  )
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyItems, setHistoryItems] = useState<
    { name: string; path: string; at: number; size: number }[]
  >([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [presenter, setPresenter] = useState<{ on: boolean; startedAt: number; boost: boolean }>({
    on: false,
    startedAt: 0,
    boost: false,
  })
  const [presenterTick, setPresenterTick] = useState(0)
  const [slideIndex, setSlideIndex] = useState(0)
  const [presentTool, setPresentTool] = useState<'spot' | 'lens' | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const [slowStart, setSlowStart] = useState(0)
  const slides = state.doc.meta?.slides ?? []

  const patchSettings = (patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }

  /* 设置落盘放在 effect 里：state updater 必须是纯函数，不能顺手写 localStorage */
  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  const updater = useUpdater(settings, patchSettings)

  /* 减弱动效：交给 CSS 变量，一处开关全局生效 */
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = settings.reduceMotion ? 'on' : 'off'
  }, [settings.reduceMotion])

  /* 主题：同时写到 html[data-theme]，其他窗口通过 storage 事件跟随 */
  const prevTheme = useRef(settings.theme)
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    if (prevTheme.current !== settings.theme) {
      prevTheme.current = settings.theme
      const root = document.documentElement
      root.classList.remove('theme-switch')
      // 强制回流，让同一个 class 连续切换时动画能重新开始
      void root.offsetWidth
      root.classList.add('theme-switch')
      const timer = window.setTimeout(() => root.classList.remove('theme-switch'), 460)
      return () => {
        window.clearTimeout(timer)
        root.classList.remove('theme-switch')
      }
    }
  }, [settings.theme])

  /* 启动时按提醒频率静默检查一次更新 */
  useEffect(() => {
    if (!dueForCheck(loadSettings())) return
    const timer = window.setTimeout(async () => {
      const res = await updater.check(true)
      if (!res?.ok || !res.hasUpdate) return
      const now = loadSettings()
      if (now.updateMuted || now.updateFreq === 'never') return
      if (res.latest && now.updateSkip === res.latest) return
      setUpdateOpen(true)
    }, 2600)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* 启动时恢复上次的批注颜色 / 粗细 / 笔型 */
  useEffect(() => {
    const s = loadSettings()
    dispatch({ type: 'pen', color: s.penColor, width: s.penWidth, mode: s.penMode })
    setPenReady(true)
  }, [])

  /* 批注偏好落盘：下次打开还是自己习惯的那支笔 */
  useEffect(() => {
    if (!penReady) return
    patchSettings({ penColor: state.penColor, penWidth: state.penWidth, penMode: state.penMode })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [penReady, state.penColor, state.penWidth, state.penMode])

  /* 启动时套用「网格默认」设置 */
  useEffect(() => {
    if (state.grid !== settings.grid) dispatch({ type: 'grid' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [touch, setTouch] = useState(
    () =>
      loadSettings().touchDefault ||
      (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true),
  )

  /* 只要出现过真实触摸，就切到触控模式（放大命中区） */
  useEffect(() => {
    const on = (e: PointerEvent) => {
      if (e.pointerType === 'touch') setTouch(true)
    }
    window.addEventListener('pointerdown', on, true)
    return () => window.removeEventListener('pointerdown', on, true)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.touch = touch ? '1' : '0'
  }, [touch])
  const [busy, setBusy] = useState(false)
  const [slow, setSlow] = useState(false)
  const seq = useRef(0)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  const kernel = useRef<KernelClient | null>(null)
  const queue = useRef<{
    scene: SceneSpec
    drag?: { id: string; x: number; y: number }
    movable?: string[]
    commit?: boolean
  } | null>(null)
  const inflight = useRef(false)
  /** 上一帧解算用的拖动坐标：松手时据此判断还要不要再解一次 */
  const solvedFor = useRef<{ id: string; x: number; y: number } | null>(null)
  const slowTimer = useRef(0)

  const toast = useCallback((text: string) => {
    const id = ++seq.current
    setToasts((list) => [...list.slice(-2), { id, text }])
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3000)
  }, [])

  /* 内核：Web Worker 内的几何约束 + 静力学求解 */
  useEffect(() => {
    kernel.current = new KernelClient()
    return () => {
      kernel.current?.dispose()
      kernel.current = null
    }
  }, [])

  const pump = useCallback(async () => {
    const next = queue.current
    const worker = kernel.current
    if (!next || !worker || inflight.current) return
    queue.current = null
    inflight.current = true
    setBusy(true)
    slowTimer.current = window.setTimeout(() => setSlow(true), 200)
    const t0 = performance.now()

    const res = await worker.solve(next.scene, next.drag, next.movable)
    solvedFor.current = next.drag ?? null

    window.clearTimeout(slowTimer.current)
    setSlow(false)
    setBusy(false)
    inflight.current = false

    dispatch({
      type: 'solution',
      solution: res.solution,
      source: res.solution.source,
      ms: performance.now() - t0,
      error: res.ok ? undefined : res.error,
      syncDoc: !!next.movable || !!next.commit,
    })
    if (queue.current) void pump()
  }, [])

  const requestSolve = useCallback(
    (
      scene: SceneSpec,
      drag?: { id: string; x: number; y: number },
      movable?: string[],
      commit?: boolean,
    ) => {
      queue.current = { scene, drag, movable, commit }
      void pump()
    },
    [pump],
  )

  /* 运动仿真：按帧向内核要步进，暂停即停 */
  useEffect(() => {
    if (!state.playing) return
    let raf = 0
    let last = performance.now()
    let inflight = false
    let carry = 0
    const loop = (now: number) => {
      carry += Math.min(now - last, 60)
      last = now
      if (!inflight && carry >= 8) {
        const dt = carry
        carry = 0
        inflight = true
        kernel.current?.simAdvance(dt).then((st) => {
          inflight = false
          if (st) dispatch({ type: 'sim', state: st })
        })
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [state.playing])

  /** 仿真进行中时，画面用仿真状态覆盖位置与力数值 */
  const view = useMemo(() => {
    const scene = state.doc.scene
    const sim = state.sim
    if (!sim || scene.kind !== 'incline') {
      return { scene, solution: state.solution }
    }
    const params = {
      ...scene.params,
      t: Math.min(1, Math.max(0, sim.x / INCLINE.length)),
    }
    const next: SceneSpec = { kind: 'incline', params }
    const base = solveScene(next)
    return {
      scene: next,
      solution: {
        ...base,
        statics: {
          angleDeg: params.angleDeg,
          gravity: sim.gravity ?? 0,
          normal: sim.normal ?? 0,
          friction: sim.friction ?? 0,
          net: Math.abs(sim.a) * params.mass,
          sliding: sim.sliding ?? false,
        },
      },
    }
  }, [state.doc.scene, state.solution, state.sim])

  const scene3d = state.doc.scene
  const camera =
    scene3d.kind === 'solid'
      ? scene3d.params.camera
      : scene3d.kind === 'solidIncline'
        ? scene3d.params.camera
        : null


  const sketchDoc = state.doc.scene.kind === 'sketch' ? state.doc.scene.doc : null
  const selectedLines = sketchDoc
    ? state.selected.filter((id) => sketchDoc.segments.some((s) => s.id === id)).length
    : 0
  const selectedPoints = sketchDoc
    ? state.selected.filter((id) => sketchDoc.points.some((p) => p.id === id)).length
    : 0
  const selectedCircles = sketchDoc
    ? state.selected.filter((id) => sketchDoc.circles.some((c) => c.id === id)).length
    : 0

  /** 约束标记画在线段中点 */
  const badges = useMemo(() => {
    if (!sketchDoc) return []
    const glyph: Record<string, string> = {
      horizontal: '═',
      vertical: '║',
      equal: '=',
      parallel: '∥',
      perpendicular: '⊥',
      'on-line': '∈',
      midpoint: '◦',
      tangent: '⌒',
    }
    const out: { x: number; y: number; label: string; stack: number }[] = []
    const used = new Map<string, number>()
    for (const c of sketchDoc.constraints ?? []) {
      if ((c.type === 'on-line' || c.type === 'midpoint') && c.points?.[0]) {
        const p = state.solution.points[c.points[0]] ?? sketchDoc.points.find((q) => q.id === c.points![0])
        if (!p) continue
        out.push({ x: p.x, y: p.y, label: c.type === 'midpoint' ? '◦' : '∈', stack: 0 })
        continue
      }
      if (c.type === 'tangent' && c.circles?.[0]) {
        const circle = sketchDoc.circles.find((q) => q.id === c.circles![0])
        const center = circle ? (state.solution.points[circle.c] ?? sketchDoc.points.find((q) => q.id === circle.c)) : null
        if (!center || !circle) continue
        out.push({ x: center.x, y: center.y - circle.r, label: '⌒', stack: 0 })
        continue
      }
      // 双线约束（等长/平行/垂直）在两条线上都标
      for (const lineId of c.lines) {
        const seg = sketchDoc.segments.find((s) => s.id === lineId)
        if (!seg) continue
        const a = state.solution.points[seg.a] ?? sketchDoc.points.find((p) => p.id === seg.a)
        const b = state.solution.points[seg.b] ?? sketchDoc.points.find((p) => p.id === seg.b)
        if (!a || !b) continue
        const stack = used.get(seg.id) ?? 0
        used.set(seg.id, stack + 1)
        out.push({
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          label: glyph[c.type] ?? '·',
          stack,
        })
      }
    }
    return out
  }, [sketchDoc, state.solution])

  const patchParams = (patch: Record<string, unknown>) => {
    const scene = state.doc.scene
    if (scene.kind === 'sketch' || scene.kind === 'triangle') return
    dispatch({
      type: 'scene-patch',
      scene: { ...scene, params: { ...scene.params, ...patch } } as SceneSpec,
    })
  }

  const setCamera = (next: Camera) => {
    const scene = state.doc.scene
    if (scene.kind === 'solid') {
      dispatch({ type: 'drag-scene', scene: { kind: 'solid', params: { ...scene.params, camera: next } } })
    } else if (scene.kind === 'solidIncline') {
      dispatch({
        type: 'drag-scene',
        scene: { kind: 'solidIncline', params: { ...scene.params, camera: next } },
      })
    }
  }

  // 调试钩子：验证脚本可直接读状态
  ;(window as unknown as { __state?: unknown }).__state = state

  const buildCache = useRef<BuildCache>(emptyCache())
  const objects = useMemo(() => {
    const res = buildIncremental(
      view.scene,
      view.solution,
      {
        hidden: state.doc.hidden,
        names: state.doc.names,
        preview: state.forcePreview,
      },
      state.sim,
      buildCache.current,
    )
    buildCache.current = res.cache
    exposeStats(res.stats)
    return state.doc.deleted.length > 0
      ? res.objects.filter((o) => !state.doc.deleted.includes(o.id))
      : res.objects
  }, [view, state.doc, state.sim, state.forcePreview])

  const selectedSolidId =
    objects.find((o) => o.kind === 'solid' && o.id === state.selected[state.selected.length - 1])?.id ??
    null
  const propSchema = schemaFor(state.doc.scene, selectedSolidId)

  /* 三维物理世界：开启时每帧步进并把位置/姿态写回场景 */
  const solidPhysics = state.doc.scene.kind === 'solid' ? state.doc.scene.params.physics : undefined
  const physicsKey = solidPhysics?.enabled
    ? `on|${solidPhysics.gravity}|${solidPhysics.restitution}|${solidPhysics.friction}|${JSON.stringify(
        solidPhysics.obstacles ?? [],
      )}`
    : 'off'
  const initialShapes = useRef<SolidShape[] | null>(null)
  const physRef = useRef<{ world: RigidWorld; history: BodySnapshot[][]; times: number[] } | null>(
    null,
  )
  const physForce = useRef<{ enabled: boolean; expr: string; dir: string } | null>(null)
  physForce.current = solidPhysics?.force
    ? { enabled: solidPhysics.force.enabled, expr: solidPhysics.force.expr, dir: solidPhysics.force.dir }
    : null
  /** 每个物体自己的变力 */
  const physPerShape = useRef<{ id: string; force?: PhysicsForce }[]>([])
  physPerShape.current =
    state.doc.scene.kind === 'solid'
      ? state.doc.scene.params.shapes.map((sh) => ({ id: sh.id, force: sh.force }))
      : []
  const [physTotal, setPhysTotal] = useState(0)
  const [physIndex, setPhysIndex] = useState(0)

  /* 机构装配：选中的部件 / 连接件、连接模式、播放状态都在这一层 */
  const mech = state.doc.scene.kind === 'mech' ? state.doc.scene.params : null
  const [mechSel, setMechSel] = useState<{ id: string; kind: 'part' | 'link' } | null>(null)
  /** 多选：部件 id 列表（含主选 mechSel） */
  const [mechSelIds, setMechSelIds] = useState<string[]>([])
  const [mechPending, setMechPending] = useState<MechLinkKind | null>(null)
  const [mechAnchor, setMechAnchor] = useState<string | null>(null)
  const [mechPlaying, setMechPlaying] = useState(false)
  /** 编辑 / 真实：编辑时物理暂停、可摆零件；真实时按物理运行、拖动即施力 */
  const [mechEditing, setMechEditing] = useState(true)
  const [mechVectors, setMechVectors] = useState(true)
  const [mechDecompose, setMechDecompose] = useState(false)
  /** 画面标注：名称 / 轨迹 / 网格吸附步长 / 角度吸附 / 测距 */
  const [mechLabels, setMechLabels] = useState(true)
  const [mechTrails, setMechTrails] = useState(false)
  const [mechGrid, setMechGrid] = useState(0.1)
  const [mechSnapAngle, setMechSnapAngle] = useState(true)
  const [mechMeasure, setMechMeasure] = useState<{ a: string; b: string } | null>(null)
  const [mechMeasureMode, setMechMeasureMode] = useState(false)
  const [mechReset, setMechReset] = useState(0)
  /** 引擎实时读数：MechStage 每帧写入，MechBar 轮询显示（避免每帧重渲染整个 App） */
  const mechLive = useRef<MechLive>({
    t: 0,
    running: false,
    ke: 0,
    pe: 0,
    elastic: 0,
    momentum: 0,
    parts: {},
  })

  // 换场景（或打开另一份课件）时，机构的选中 / 播放状态全部归零
  useEffect(() => {
    setMechSel(null)
    setMechSelIds([])
    setMechPending(null)
    setMechAnchor(null)
    setMechPlaying(false)
    setMechMeasure(null)
    setMechMeasureMode(false)
    setMechReset((t) => t + 1)
  }, [state.doc.scene.kind, state.file])

  useEffect(() => {
    const scene = state.doc.scene
    if (scene.kind !== 'solid' || !scene.params.physics?.enabled) {
      // 关掉物理：回到摆放位置
      if (initialShapes.current) {
        dispatch({ type: 'physics-reset', shapes: initialShapes.current })
        initialShapes.current = null
      }
      physRef.current = null
      setPhysTotal(0)
      setPhysIndex(0)
      return
    }
    const p = scene.params.physics
    initialShapes.current = scene.params.shapes.map((sh) => ({ ...sh, rotation: undefined }))
    const world = new RigidWorld({
      gravity: p.gravity,
      restitution: p.restitution,
      friction: p.friction,
    })
    for (const o of p.obstacles ?? []) world.addObstacle(o)
    for (const sh of scene.params.shapes) {
      // 埋进地面的物体一开物理就会被接触求解弹飞，先抬到基准面上
      const half = sh.size / 2
      world.add({ ...sh, center: [sh.center[0], sh.center[1], Math.max(sh.center[2], half)] })
    }
    physRef.current = { world, history: [], times: [] }
    setPhysTotal(0)
    setPhysIndex(0)
    dispatch({ type: 'physics-play', playing: true })
    return () => {
      world.dispose()
      physRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [physicsKey])

  useEffect(() => {
    if (!physRef.current || !state.physicsPlaying) return
    let raf = 0
    let last = performance.now()
    let tAcc = 0
    const loop = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const p = physRef.current
      if (p && dt > 0.001) {
        const ext = physForce.current
        if (ext?.enabled) {
          const { value } = evalForce(ext.expr, 'time', tAcc)
          const d = forceDir(ext)
          p.world.applyExternal([d[0] * value, d[1] * value, d[2] * value])
        }
        // 逐个物体的变力
        for (const item of physPerShape.current) {
          const fo = item.force
          if (!fo?.enabled) continue
          const { value } = evalForce(fo.expr, 'time', tAcc)
          const d = forceDir(fo)
          p.world.applyExternal([d[0] * value, d[1] * value, d[2] * value], item.id)
        }
        p.world.step(dt)
        const snap = p.world.snapshot()
        p.history.push(snap)
        // 记下这一帧真正用的时刻，力箭头按它求值，别再用「帧号 / 60」猜
        p.times.push(tAcc)
        tAcc += dt
        // 最多留 30 秒，够回溯就行
        if (p.history.length > 1800) {
          p.history.shift()
          p.times.shift()
        }
        dispatch({ type: 'physics-frame', bodies: snap })
        setPhysIndex(p.history.length - 1)
        setPhysTotal(p.history.length)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [state.physicsPlaying, physicsKey])

  /** 拖动时间轴：看历史帧，并自动暂停 */
  const scrubPhysics = (i: number) => {
    const p = physRef.current
    if (!p || p.history.length === 0) return
    const idx = Math.max(0, Math.min(i, p.history.length - 1))
    dispatch({ type: 'physics-frame', bodies: p.history[idx] })
    setPhysIndex(idx)
    if (state.physicsPlaying) dispatch({ type: 'physics-play', playing: false })
  }

  /** 回到最新一帧并继续跑 */
  const goLive = () => {
    const p = physRef.current
    if (!p || p.history.length === 0) return
    dispatch({ type: 'physics-frame', bodies: p.history[p.history.length - 1] })
    setPhysIndex(p.history.length - 1)
    dispatch({ type: 'physics-play', playing: true })
  }

  /* 窗口与界面状态恢复（design.md §4.1） */
  useEffect(() => {
    window.chordot
      ?.getUiState()
      .then(async (ui) => {
        if (typeof ui.leftWidth === 'number') dispatch({ type: 'left-width', width: ui.leftWidth })
        if (typeof ui.rightOpen === 'boolean') dispatch({ type: 'right', open: ui.rightOpen })
        if (Array.isArray(ui.recent)) setRecent(ui.recent)
        if (ui.lastFile) setLastFile(ui.lastFile)
        if (ui.autosave) setRecovery(ui.autosave)
        if (typeof ui.slowStart === 'number' && ui.slowStart > 0) setSlowStart(ui.slowStart)
        void refreshRecentMeta(ui.recent ?? [])
        void refreshLibrary()
        // 大厅启动时只把「上次打开的课件」做成卡片，不自动打开；
        // 关掉大厅（设置 / ?lobby=0）时保持原来的「恢复上次课件」行为。
        if (ui.lastFile && !bootLobbyRef.current) {
          const res = await window.chordot!.openFile(ui.lastFile)
          if (res.path && res.content) {
            const parsed = parseDoc(res.content)
            if ('doc' in parsed) {
              dispatch({ type: 'opened', doc: parsed.doc, file: fileName(res.path), path: res.path })
              setHasDoc(true)
            }
          }
        }
      })
      .catch(() => {})
  }, [])


  /** 读最近课件的元信息（标题 / 学段 / 章节），大厅卡片用 */
  const refreshRecentMeta = async (paths: string[]) => {
    const api = window.chordot
    const list = Array.from(new Set((paths ?? []).filter(Boolean))).slice(0, 8)
    if (!api?.peekFile) {
      setRecentFiles(list.map((p) => ({ path: p })))
      return
    }
    const rows = await Promise.all(
      list.map(async (p) => {
        try {
          const res = await api.peekFile!(p)
          if (!res?.exists) return { path: p }
          return {
            path: p,
            title: res.meta?.title,
            subject: res.meta?.subject,
            chapter: res.meta?.chapter,
            grade: res.meta?.grade,
          } as RecentFileMeta
        } catch {
          return { path: p } as RecentFileMeta
        }
      }),
    )
    setRecentFiles(rows)
  }

  /** 课件库（userData/library）列表，大厅展示 */
  const refreshLibrary = async () => {
    const api = window.chordot
    if (!api?.library?.list) return
    try {
      const res = await api.library.list()
      setLibrary(Array.isArray(res?.items) ? res.items : [])
    } catch {
      /* 忽略 */
    }
  }

  /** 保存 / 打开 / 新建之后，旧快照已经没意义 */
  const clearAutosave = () => {
    void window.chordot?.autosave?.clear?.().catch(() => {})
    setRecovery(null)
  }

  useEffect(() => {
    void refreshRecentMeta(recent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recent])

  /* 大厅每日一言：先缓存秒出，没缓存再请求（3s 超时 / 本地兜底） */
  useEffect(() => {
    if (!settings.dailyQuote) {
      setQuote(null)
      return
    }
    const hit = cachedQuote()
    if (hit) {
      setQuote(hit)
      return
    }
    let cancelled = false
    void fetchDailyQuote(settings.quoteCategory).then((q) => {
      if (!cancelled) setQuote(q)
    })
    return () => {
      cancelled = true
    }
  }, [settings.dailyQuote, settings.quoteCategory])

  /* 自动保存：只在编辑器里、有未保存修改时写快照（主进程原子写） */
  useEffect(() => {
    if (!settings.autosave || lobbyOpen) return
    const api = window.chordot
    if (!api?.autosave) return
    const interval = Math.max(10, Math.min(300, settings.autosaveInterval)) * 1000
    const timer = window.setInterval(() => {
      const current = stateRef.current
      if (!current.dirty) return
      try {
        void api
          .autosave!.write({
            data: serializeDoc(current.doc),
            file: current.file,
            filePath: current.filePath,
            at: Date.now(),
          })
          .catch(() => {})
      } catch {
        /* 忽略 */
      }
    }, interval)
    return () => window.clearInterval(timer)
  }, [settings.autosave, settings.autosaveInterval, lobbyOpen])

  /* 文件关联 / 第二次启动：.chordot 双击打开 */
  useEffect(() => {
    const off = window.chordot?.onOpenFile?.((path) => {
      if (path) void actionsRef.current.openDoc(path)
    })
    return () => off?.()
  }, [])

  /* 独立模板库窗口选完模板 → 主窗口套用并进编辑器 */
  useEffect(() => {
    const off = window.chordot?.onGalleryPick?.((payload) => {
      const p = payload as { scene?: SceneSpec; file?: string }
      if (!p?.scene) return
      setLobbyOpen(false)
      setHasDoc(true)
      dispatch({ type: 'scene', scene: p.scene, file: p.file || '模板.chordot' })
      toast('已套用模板「' + (p.file || '模板').replace(/\.chordot$/i, '') + '」')
    })
    return () => off?.()
  }, [])

  /* 本地错误日志：渲染层异常也写进 userData/logs，方便离线排查 */
  useEffect(() => {
    if (!settings.errorLog) return
    const report = (message: string, stack?: string, source?: string) => {
      try {
        window.chordot?.reportError?.({ message, stack, source })
      } catch {
        /* 忽略 */
      }
    }
    const onError = (e: ErrorEvent) => report(e.message, e.error?.stack, 'window.onerror')
    const onReject = (e: PromiseRejectionEvent) => {
      const reason = e.reason as { message?: string; stack?: string } | undefined
      report(String(reason?.message ?? e.reason ?? 'unhandledrejection'), reason?.stack, 'unhandledrejection')
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onReject)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onReject)
    }
  }, [settings.errorLog])

  /* 启动慢提示：主进程记录的 ready→可交互耗时 */
  useEffect(() => {
    if (!slowStart || slowStart < 2.5) return
    const timer = window.setTimeout(() => {
      toast('本次启动用了 ' + slowStart.toFixed(1) + ' 秒，可以试试清理旧课件或关闭其它大程序')
    }, 3000)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slowStart])

  /* 演示者模式计时器：1s 刷新一次 */
  useEffect(() => {
    if (!presenter.on) return
    const timer = window.setInterval(() => setPresenterTick((t) => t + 1), 1000)
    return () => window.clearInterval(timer)
  }, [presenter.on])

  /* 演示者模式键盘：PageUp/PageDown 切镜头书签，B 切换投影增强，Esc 退出 */
  useEffect(() => {
    if (!presenter.on) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        stopPresenter()
        return
      }
      if (e.key === 'PageDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        jumpSlide(1)
      } else if (e.key === 'PageUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        jumpSlide(-1)
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault()
        setPresenter((p) => ({ ...p, boost: !p.boost }))
      } else if (e.key === 'Home') {
        e.preventDefault()
        jumpSlide(0, 0)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenter.on])

  useEffect(() => {
    window.chordot?.setUiState({ leftWidth: state.leftWidth, rightOpen: state.rightOpen })
  }, [state.leftWidth, state.rightOpen])

  useEffect(() => {
    window.chordot?.setUiState({ dirty: state.dirty })
  }, [state.dirty])

  const measured = useMemo(
    () =>
      measure(
        objects,
        state.selected,
        settings.angleUnit,
        state.doc.scene.kind === 'incline' || state.doc.scene.kind === 'motion' ? 'm' : 'cm',
      ),
    [objects, state.selected, settings.angleUnit],
  )

  const scaleText = useMemo(() => {
    if (state.doc.scene.kind === 'solid') return '正交投影 · 拖动旋转 · 滚轮缩放'
    if (state.doc.scene.kind === 'solidIncline') return '三维斜面 · 拖动旋转 · 滚轮缩放'
    if (state.doc.scene.kind === 'motion') return '1 格 = 1 m'
    if (state.doc.scene.kind === 'mech')
      return `1 m = ${Math.round(PX_PER_UNIT * state.zoom)} px · 拖部件移动 · Shift 多选 · 空格播放`
    if (state.mode === 'physics') return `1 cm ≙ ${Math.round(PX_PER_UNIT / settings.forceScale)} N`
    const s = PX_PER_UNIT * state.zoom
    const halfW = state.canvas.w / 2 / s
    const halfH = (state.canvas.h / 2 - 40) / s
    return `x: ${(-halfW).toFixed(1)}…${halfW.toFixed(1)}　y: ${(-halfH).toFixed(1)}…${(halfH + 1).toFixed(1)}`
  }, [state.mode, state.zoom, state.canvas, state.doc.scene, settings.forceScale])

  const fit = useCallback(() => {
    const pts: [number, number][] = []
    for (const o of objects) {
      if (o.kind === 'point') pts.push([o.x, o.y])
      else if (o.kind === 'line') pts.push(o.a, o.b)
      else if (o.kind === 'polygon') pts.push(...o.points)
      else if (o.kind === 'circle') {
        pts.push([o.center[0] - o.r, o.center[1] - o.r], [o.center[0] + o.r, o.center[1] + o.r])
      }
      // 函数曲线不参与适配：默认采样区间很宽，算进来会把视图缩到 30%，
      // 反而不如保持 1:1 的常规坐标系
    }
    if (pts.length === 0) {
      // 机构没有 GeoObj：给一个能看清弹簧和小球的默认视角
      const isMech = state.doc.scene.kind === 'mech'
      dispatch({ type: 'zoom', zoom: isMech ? 1.35 : 1 })
      // 机构场景左上角常驻一块部件盘：画面往右挪一点，别把内容压在面板底下
      dispatch({ type: 'pan', pan: isMech ? { x: 110, y: -26 } : { x: 0, y: 0 } })
      return
    }
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const w = maxX - minX
    const h = maxY - minY
    const zoom = Math.min(
      4,
      Math.max(
        0.3,
        Math.min(
          (state.canvas.w - 140) / Math.max(w * PX_PER_UNIT, 1),
          (state.canvas.h - 160) / Math.max(h * PX_PER_UNIT, 1),
        ),
      ),
    )
    // 把内容包围盒的中心挪到画布中心，而不是把世界原点放中间
    const midX = (minX + maxX) / 2
    const midY = (minY + maxY) / 2
    dispatch({ type: 'zoom', zoom })
    dispatch({ type: 'pan', pan: { x: -midX * PX_PER_UNIT * zoom, y: midY * PX_PER_UNIT * zoom } })
  }, [objects, state.canvas, state.doc.scene.kind])

  /* 新建 / 打开 / 套模板后自动适配视图：样例不该歪在角落里 */
  const fitRef = useRef(fit)
  fitRef.current = fit
  useEffect(() => {
    if (state.fitToken === 0) return
    const timer = window.setTimeout(() => fitRef.current(), 80)
    return () => window.clearTimeout(timer)
  }, [state.fitToken])

  const baseName = state.file.replace(/\.chordot$/, '')

  const saveBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  const serialize = () => {
    const svg = svgRef.current
    if (!svg) return null
    const clone = svg.cloneNode(true) as SVGSVGElement
    // 选中光晕、构造预览、手绘草稿都是界面反馈，别导出到图里
    clone.querySelectorAll('[data-ui]').forEach((el) => el.remove())
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    return new XMLSerializer().serializeToString(clone)
  }

  /** 导出：桌面端走原生另存为，浏览器端退回下载 */
  const saveExport = async (
    data: string,
    encoding: 'utf8' | 'base64',
    filename: string,
    format: 'png' | 'svg',
  ) => {
    const api = window.chordot
    if (api?.exportFile) {
      const res = await api.exportFile({ data, encoding, name: filename, format })
      if (res.canceled) return
      if (res.error) {
        toast(`导出失败：${res.error}`)
        return
      }
      toast(`已导出 ${filename}`)
      return
    }
    const blob =
      encoding === 'base64'
        ? await (await fetch(`data:application/octet-stream;base64,${data}`)).blob()
        : new Blob([data], { type: format === 'svg' ? 'image/svg+xml' : 'text/plain' })
    saveBlob(blob, filename)
  }

  const exportDrawing = (format: 'svg' | 'png') => {
    const data = serialize()
    if (!data) return
    if (format === 'svg') {
      void saveExport(data, 'utf8', `${baseName}.svg`, 'svg')
      return
    }
    const url = URL.createObjectURL(new Blob([data], { type: 'image/svg+xml;charset=utf-8' }))
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = 2
      canvas.width = Math.round(state.canvas.w * scale)
      canvas.height = Math.round(state.canvas.h * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#FAFAF8'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        if (!blob) return
        const reader = new FileReader()
        reader.onload = () => {
          const raw = String(reader.result)
          const base64 = raw.slice(raw.indexOf(',') + 1)
          void saveExport(base64, 'base64', `${baseName}.png`, 'png')
        }
        reader.readAsDataURL(blob)
      }, 'image/png')
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      toast('PNG 导出失败')
    }
    img.src = url
  }

  const selectFromCanvas = (ids: string[], kind: 'replace' | 'add' | 'toggle') => {
    if (kind === 'replace') {
      dispatch({ type: 'select', ids })
      return
    }
    if (kind === 'add') {
      dispatch({ type: 'select', ids: Array.from(new Set([...state.selected, ...ids])) })
      return
    }
    const id = ids[0]
    dispatch({
      type: 'select',
      ids: state.selected.includes(id)
        ? state.selected.filter((s) => s !== id)
        : [...state.selected, id],
    })
  }

  /* 拖动：几何变化交给内核，松开时整段入栈一步 */
  const handleDragStart = (id: string, p: { x: number; y: number }) => {
    dispatch({ type: 'drag-start', id, x: p.x, y: p.y })
  }

  const handleDragMove = (p: { x: number; y: number }) => {
    const scene = state.doc.scene
    if (scene.kind === 'incline') {
      const next: SceneSpec = {
        kind: 'incline',
        params: { ...scene.params, angleDeg: angleFromPoint(p) },
      }
      dispatch({ type: 'drag-scene', scene: next })
      requestSolve(next)
      return
    }
    if (scene.kind === 'sketch') {
      if (!state.drag) return
      if ((scene.doc.constraints ?? []).length > 0) {
        dispatch({ type: 'drag-move', x: p.x, y: p.y })
        requestSolve(scene, { id: state.drag.id, x: p.x, y: p.y })
        return
      }
      dispatch({ type: 'drag-point', id: state.drag.id, x: p.x, y: p.y })
      return
    }
    if (!state.drag) return
    dispatch({ type: 'drag-move', x: p.x, y: p.y })
    requestSolve(scene, { id: state.drag.id, x: p.x, y: p.y })
  }

  const handleDragEnd = (p?: { x: number; y: number }) => {
    const scene = state.doc.scene
    const drag = state.drag
    if (
      drag &&
      scene.kind === 'sketch' &&
      (scene.doc.constraints ?? []).length > 0 &&
      // 整组拖动（线段/圆/多边形）已经直接写进文档，不需要再解一次
      scene.doc.points.some((q) => q.id === drag.id)
    ) {
      // 松手时按最后一帧的指针位置再解一次：拖动中的回包可能还停在上一帧，
      // 直接拿 solution 写回文档会让图形回退几像素
      const at = p ?? drag
      const last = solvedFor.current
      // 上一帧就是按这个位置解的，不用再解一次
      if (!last || last.id !== drag.id || Math.hypot(last.x - at.x, last.y - at.y) > 1e-4) {
        requestSolve(scene, { id: drag.id, x: at.x, y: at.y }, undefined, true)
      }
    }
    dispatch({ type: 'drag-end' })
  }

  /** 对当前选中的线段施加约束 */
  const applyConstraint = (type: SketchConstraintType) => {
    const scene = state.doc.scene
    if (scene.kind !== 'sketch') return
    const lines = state.selected.filter((id) => scene.doc.segments.some((s) => s.id === id))
    const points = state.selected.filter((id) => scene.doc.points.some((p) => p.id === id))

    const circles = state.selected.filter((id) => scene.doc.circles.some((c) => c.id === id))

    let constraint: SketchConstraint
    if (type === 'tangent') {
      if (lines.length !== 1 || circles.length !== 1) {
        toast('先选中一条线段和一个圆（按住 Shift 加选）')
        return
      }
      constraint = { id: `k${Date.now().toString(36)}`, type, lines, circles }
    } else if (type === 'midpoint') {
      if (points.length !== 1 || lines.length !== 1) {
        toast('先选中一个点和一条线段（按住 Shift 加选）')
        return
      }
      constraint = { id: `k${Date.now().toString(36)}`, type, lines, points }
    } else if (type === 'on-line') {
      if (points.length !== 1 || lines.length !== 1) {
        toast('先选中一个点和一条线段（按住 Shift 加选）')
        return
      }
      constraint = { id: `k${Date.now().toString(36)}`, type, lines, points }
    } else {
      const need = type === 'horizontal' || type === 'vertical' ? 1 : 2
      if (lines.length !== need) {
        toast(need === 1 ? '先选中一条线段' : '先选中两条线段（按住 Shift 加选）')
        return
      }
      constraint = { id: `k${Date.now().toString(36)}`, type, lines }
    }
    dispatch({ type: 'add-constraint', constraint })
    // 用当前画面坐标做初值，并把无关点交给内核临时固定：新约束只改它该改的图形
    const solved = state.solution.points
    const at = (id: string) => solved[id] ?? scene.doc.points.find((p) => p.id === id)
    const nudge = seedForConstraint(scene.doc, constraint, at)
    const doc = {
      ...scene.doc,
      points: scene.doc.points.map((p) => {
        const s = solved[p.id]
        return s ? { ...p, x: s.x, y: s.y } : p
      }),
      constraints: [...(scene.doc.constraints ?? []), constraint],
    }
    if (nudge) {
      doc.points = doc.points.map((p) => (nudge[p.id] ? { ...p, ...nudge[p.id] } : p))
    }
    requestSolve({ kind: 'sketch', doc }, undefined, constraintMovers(scene.doc, constraint))
  }

  const toggleMode = () =>
    dispatch({ type: 'mode', mode: state.mode === 'physics' ? 'math' : 'physics' })

  const loadIncline = () => {
    dispatch({ type: 'scene', scene: inclineScene(), file: '斜面受力.chordot' })
  }
  const loadTriangle = () => {
    dispatch({ type: 'scene', scene: triangleScene(), file: '约束三角形.chordot' })
  }
  const loadSlide = () => {
    dispatch({ type: 'scene', scene: inclineSlideScene(), file: '斜面下滑.chordot' })
  }
  const loadConflict = () => {
    dispatch({ type: 'scene', scene: conflictScene(), file: '约束冲突.chordot' })
  }
  const loadSolid = () => {
    dispatch({ type: 'scene', scene: solidScene(), file: '正方体.chordot' })
  }
  const loadIncline3d = () => {
    dispatch({ type: 'scene', scene: solidInclineScene(), file: '三维斜面受力.chordot' })
  }
  const loadPendulum = () => {
    dispatch({ type: 'scene', scene: pendulumScene(), file: '单摆.chordot' })
  }
  const newSketch = (file = '未命名.chordot') => {
    dispatch({ type: 'scene', scene: sketchScene(), file })
  }

  /* ───────── 文件：保存 / 打开 / 新建 ───────── */

  const save = async (saveAs = false): Promise<boolean> => {
    const api = window.chordot
    if (!api) {
      toast('保存需要桌面端环境')
      return false
    }
    // 保存时补全元信息：标题缺省用文件名，updatedAt 落盘
    const metaNow: DocMeta = {
      ...state.doc.meta,
      title: state.doc.meta?.title || fileName(state.file).replace(/\.chordot$/i, ''),
      subject: state.doc.meta?.subject ?? (state.mode === 'physics' ? 'physics' : 'math'),
      updatedAt: Date.now(),
    }
    const res = await api.saveFile({
      data: serializeDoc({ ...state.doc, meta: metaNow }),
      filePath: state.filePath,
      saveAs,
    })
    if (res.canceled) return false
    if (res.error) {
      toast(`保存失败：${res.error}`)
      return false
    }
    if (!res.path) return false
    dispatch({ type: 'saved', path: res.path, file: fileName(res.path) })
    clearAutosave()
    toast('已保存')
    refreshRecent()
    return true
  }

  const saveRef = useRef(save)
  saveRef.current = save

  /** 有未保存修改时先问：取消 / 放弃修改 / 保存 */
  const confirmDiscard = async (): Promise<boolean> => {
    if (!state.dirty) return true
    const api = window.chordot
    if (!api) return true
    const choice = await api.confirmUnsaved(state.file)
    if (choice === 0) return false
    if (choice === 1) return true
    return save()
  }

  const openDoc = async (target?: string) => {
    const api = window.chordot
    if (!api) {
      toast('打开需要桌面端环境')
      return
    }
    // 大厅里返回时已经问过未保存修改；编辑器内打开任何文件都先确认
    if (!lobbyOpen && !(await confirmDiscard())) return
    const res = await api.openFile(target ?? null)
    if (res.canceled) return
    if (res.error || !res.path) {
      toast(`无法打开：${res.error ?? '未知原因'}`)
      return
    }
    const parsed = parseDoc(res.content ?? '')
    if ('error' in parsed) {
      toast(parsed.error)
      return
    }
    dispatch({ type: 'opened', doc: parsed.doc, file: fileName(res.path), path: res.path })
    clearAutosave()
    toast(`已打开 ${fileName(res.path)}`)
    refreshRecent()
    enterEditor()
  }

  /** 重新读主进程里的最近列表 / 上次文件（保存、打开、返回大厅后调用） */
  const refreshRecent = () => {
    window.chordot
      ?.getUiState()
      .then((ui) => {
        if (Array.isArray(ui.recent)) setRecent(ui.recent)
        if (ui.lastFile) setLastFile(ui.lastFile)
      })
      .catch(() => {})
  }

  /** 进入编辑器（大厅的所有入口最后都走这里） */
  const enterEditor = () => {
    setLobbyOpen(false)
    setHasDoc(true)
    // 第一次使用：从大厅进入编辑器后再弹引导，引导里的按钮都真实存在
    if (!loadSettings().onboarded && !location.search.includes('notour')) setTourOpen(true)
  }

  const loadTemplate = async (t: Template) => {
    if (!(await confirmDiscard())) return
    dispatch({
      type: 'scene',
      scene: t.build(),
      file: t.file,
      meta: { title: t.name, subject: t.category === '物理' ? 'physics' : 'math' },
    })
    dispatch({ type: 'gallery', open: false })
    clearAutosave()
    toast(`已载入「${t.name}」`)
  }

  /** Ctrl+N / 菜单「新建」：先弹属性对话框（大厅和编辑器里都适用） */
  const newDoc = async () => {
    if (!lobbyOpen && !(await confirmDiscard())) return
    setNewDocOpen(true)
  }

  /**
   * 按新建对话框的属性创建课件：
   * 名称 → 文件名；画布 → 场景；学科 → 数学 / 物理模式；网格 / 刻度 / 角度 / 触控 → 全局默认。
   */
  const startNewDoc = (values: NewDocValues) => {
    const file = cleanFileName(values.name)
    const scene = starterScene(values.canvas)
    patchSettings({
      grid: values.grid,
      gridStep: values.gridStep,
      showTicks: values.showTicks,
      angleUnit: values.angleUnit,
      touchDefault: values.touch,
    })
    setTouch(values.touch)
    const meta: DocMeta = {
      title: file.replace(/\.chordot$/i, ''),
      subject: values.subject,
      ...(values.grade ? { grade: values.grade } : {}),
      ...(values.chapter ? { chapter: values.chapter } : {}),
      ...(values.note ? { note: values.note } : {}),
    }
    dispatch({ type: 'scene', scene, file, meta })
    clearAutosave()
    // 物理场景（斜面 / 运动 / 机构）scene 动作已经自动切物理模式；
    // 其它画布按用户选的学科补一刀，避免把运动仿真的子状态冲掉。
    const autoPhysics = scene.kind === 'incline' || scene.kind === 'motion' || scene.kind === 'mech'
    if (values.subject === 'physics' && !autoPhysics) dispatch({ type: 'mode', mode: 'physics' })
    if (values.subject === 'math' && autoPhysics) dispatch({ type: 'mode', mode: 'math' })
    if (state.grid !== values.grid) dispatch({ type: 'grid' })
    setNewDocOpen(false)
    enterEditor()
    toast(`已新建「${file.replace(/\.chordot$/, '')}」`)
  }

  /** 菜单「清空画布」：保持旧语义 —— 立刻换成空白草图，不弹新建对话框 */
  const clearCanvas = async () => {
    if (lobbyOpen) return
    if (!(await confirmDiscard())) return
    newSketch()
    clearAutosave()
    toast('画布已清空')
  }

  /** 大厅模式卡：每个模式直接开一张合身的空白课件 */
  const quickStart = (id: LobbyQuick) => {
    if (id === 'gallery') {
      openGalleryEntry()
      return
    }
    if (id === 'lab') {
      openLabEntry()
      return
    }
    if (id === 'symbols') {
      void window.chordot?.openSymbolWindow?.()
      toast('符号公式实验室已在独立窗口打开')
      return
    }
    const base = {
      grid: settings.grid,
      gridStep: settings.gridStep as 0.5 | 1 | 2,
      showTicks: settings.showTicks,
      angleUnit: settings.angleUnit,
      touch: settings.touchDefault,
    }
    const presets: Record<Exclude<LobbyQuick, 'gallery' | 'lab' | 'symbols'>, NewDocValues> = {
      math: { ...base, name: '未命名课件', subject: 'math', canvas: 'grid' },
      physics: { ...base, name: '斜面受力', subject: 'physics', canvas: 'incline' },
      motion: { ...base, name: '运动仿真', subject: 'physics', canvas: 'motion' },
      solid: { ...base, name: '立体几何', subject: 'math', canvas: 'solid' },
      mech: { ...base, name: '机构装配', subject: 'physics', canvas: 'mech' },
    }
    startNewDoc(presets[id])
  }

  /** 编辑器标题栏 / 菜单 / 命令面板：回大厅（有未保存修改先问） */
  const returnToLobby = async () => {
    if (!(await confirmDiscard())) return
    refreshRecent()
    void refreshLibrary()
    setPresentTool(null)
    setLobbyOpen(true)
  }


  /* ───────── 0.16.0：恢复 / 历史 / 课件库 / 演示 / PDF / 独立窗口 ───────── */

  /** 从自动保存快照恢复课件（恢复后是「未保存」状态，提醒另存） */
  const recoverAutosave = async () => {
    const api = window.chordot
    const snap = await api?.autosave?.read?.()
    if (!snap?.exists || !snap.data) {
      toast('快照已失效')
      setRecovery(null)
      return
    }
    const parsed = parseDoc(snap.data)
    if ('error' in parsed) {
      toast('快照损坏：' + parsed.error)
      return
    }
    dispatch({ type: 'restore', doc: parsed.doc, file: snap.file || '未命名课件.chordot' })
    setRecovery(null)
    setLobbyOpen(false)
    setHasDoc(true)
    toast('已恢复上次未保存的内容，记得另存')
  }

  const dismissRecovery = async () => {
    await window.chordot?.autosave?.clear?.()
    setRecovery(null)
  }

  const refreshQuote = async () => {
    const q = await randomQuote(settings.quoteCategory)
    setQuote(q)
  }

  /** 教材实验室：独立窗口优先；浏览器环境退回主窗口内嵌面板 */
  const openLabEntry = (id?: string) => {
    const api = window.chordot
    if (api?.openLabWindow) {
      void api.openLabWindow(id)
      return
    }
    enterEditor()
    dispatch({ type: 'textbook', open: true })
  }

  /** 模板库：独立窗口优先 */
  const openGalleryEntry = () => {
    const api = window.chordot
    if (api?.openGalleryWindow) {
      void api.openGalleryWindow()
      return
    }
    enterEditor()
    dispatch({ type: 'gallery', open: true })
  }

  /** 工具栏 / 菜单的默认入口：设置里开「辅助窗口独立」就开窗口，否则内嵌（验证环境保持内嵌） */
  const independentAux = () =>
    settings.independentWindows !== false && !location.search.includes('notour')

  const openGallerySmart = () => {
    if (independentAux()) {
      openGalleryEntry()
      return
    }
    enterEditor()
    dispatch({ type: 'gallery', open: true })
  }

  const openLabSmart = () => {
    if (independentAux()) {
      openLabEntry()
      return
    }
    enterEditor()
    dispatch({ type: 'textbook', open: true })
  }

  /** 版本历史：列出当前文件保存前的快照 */
  const openHistory = async () => {
    const api = window.chordot
    if (!api?.history?.list) {
      toast('版本历史需要桌面端环境')
      return
    }
    setHistoryOpen(true)
    setHistoryLoading(true)
    try {
      const res = await api.history.list(state.filePath ?? '')
      setHistoryItems(Array.isArray(res?.items) ? res.items : [])
    } catch {
      setHistoryItems([])
    }
    setHistoryLoading(false)
  }

  const restoreHistory = async (path: string) => {
    const api = window.chordot
    if (!api?.history?.read) return
    const res = await api.history.read(path)
    if ('error' in res) {
      toast('恢复失败：' + res.error)
      return
    }
    const parsed = parseDoc(res.content)
    if ('error' in parsed) {
      toast(parsed.error)
      return
    }
    const base = state.file.replace(/\.chordot$/i, '')
    dispatch({ type: 'restore', doc: parsed.doc, file: base + '（历史版本）.chordot' })
    setHistoryOpen(false)
    enterEditor()
    toast('已恢复历史版本（另存为新文件，不覆盖原文件）')
  }

  /** 保存当前课件到「课件库」文件夹（大厅「我的课件」可见） */
  const saveToLibrary = async () => {
    const api = window.chordot
    if (!api?.library?.add) {
      toast('课件库需要桌面端环境')
      return
    }
    const metaNow: DocMeta = {
      ...state.doc.meta,
      title: state.doc.meta?.title || state.file.replace(/\.chordot$/i, ''),
      updatedAt: Date.now(),
    }
    const saved = await api.library.add({
      path: state.filePath ?? '',
      content: serializeDoc({ ...state.doc, meta: metaNow }),
    })
    if (!saved) {
      toast('保存到课件库失败')
      return
    }
    await refreshLibrary()
    toast('已保存到课件库')
  }

  const openLibraryFile = async (path: string) => {
    const api = window.chordot
    if (!api?.library?.open) return
    const res = await api.library.open(path)
    if ('error' in res) {
      toast('打开失败：' + res.error)
      return
    }
    const parsed = parseDoc(res.content)
    if ('error' in parsed) {
      toast(parsed.error)
      return
    }
    dispatch({ type: 'restore', doc: parsed.doc, file: fileNameOf(path) })
    enterEditor()
    toast('已打开课件库中的「' + fileNameOf(path).replace(/\.chordot$/i, '') + '」')
  }

  /** 把当前画面转成 PNG base64（导出 PDF 讲义用） */
  const capturePNGData = (): Promise<string | null> =>
    new Promise((resolve) => {
      const data = serialize()
      if (!data) {
        resolve(null)
        return
      }
      const url = URL.createObjectURL(new Blob([data], { type: 'image/svg+xml;charset=utf-8' }))
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const scale = 2
        canvas.width = Math.max(1, Math.round(state.canvas.w * scale))
        canvas.height = Math.max(1, Math.round(state.canvas.h * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          URL.revokeObjectURL(url)
          resolve(null)
          return
        }
        ctx.fillStyle = '#FAFAF8'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => {
          if (!blob) {
            URL.revokeObjectURL(url)
            resolve(null)
            return
          }
          const reader = new FileReader()
          reader.onload = () => {
            const raw = String(reader.result)
            resolve(raw.slice(raw.indexOf(',') + 1))
          }
          reader.onerror = () => resolve(null)
          reader.readAsDataURL(blob)
        }, 'image/png')
        URL.revokeObjectURL(url)
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve(null)
      }
      img.src = url
    })

  /** 导出 A4 横向讲义 PDF（画面 + 标题 + 学段章节页脚） */
  const exportPDFSheet = async () => {
    const api = window.chordot
    if (!api?.exportPDF) {
      toast('PDF 导出需要桌面端环境')
      return
    }
    const png = await capturePNGData()
    if (!png) {
      toast('画面捕获失败，先退出批注/聚光灯再试')
      return
    }
    const meta = state.doc.meta
    const title = meta?.title || state.file.replace(/\.chordot$/i, '')
    const subtitle = [meta?.grade, meta?.chapter].filter(Boolean).join(' · ')
    const res = await api.exportPDF({
      png,
      title,
      subtitle,
      footer: '弦点 / Chordot · 数学与物理教学作图工具',
      defaultName: (title || '讲义') + '.pdf',
    })
    if ('canceled' in res) return
    if ('error' in res) {
      toast('导出失败：' + res.error)
      return
    }
    toast('已导出 PDF 讲义')
  }

  /* 演示者模式 */
  const startPresenter = () => {
    if (lobbyOpen) return
    setSlideIndex(0)
    setPresenter({ on: true, startedAt: Date.now(), boost: false })
    dispatch({ type: 'tool', tool: 'select' })
    void window.chordot?.setFullscreen?.(true)
  }

  const stopPresenter = () => {
    setPresenter((p) => ({ ...p, on: false }))
    void window.chordot?.setFullscreen?.(false)
  }

  const applySlide = (index: number) => {
    const slide = state.doc.meta?.slides?.[index]
    if (!slide) return
    dispatch({ type: 'zoom', zoom: slide.zoom })
    dispatch({ type: 'pan', pan: slide.pan })
  }

  const jumpSlide = (dir: number, absolute?: number) => {
    const list = state.doc.meta?.slides ?? []
    if (list.length === 0) {
      if (dir) toast('还没有镜头书签：先点「记视角」，再按 PageUp / PageDown 切换')
      return
    }
    let next = typeof absolute === 'number' ? absolute : slideIndex + dir
    next = ((next % list.length) + list.length) % list.length
    setSlideIndex(next)
    applySlide(next)
  }

  /** 记下当前缩放 + 平移，作为演示时的一页镜头 */
  const captureSlide = () => {
    const list = state.doc.meta?.slides ?? []
    const slide = {
      id: 's' + Date.now().toString(36),
      name: '视角 ' + (list.length + 1),
      zoom: state.zoom,
      pan: state.pan,
    }
    dispatch({ type: 'meta', meta: { ...state.doc.meta, slides: [...list, slide] } })
    toast('已记下当前视角，演示模式里用 PageUp / PageDown 切换')
  }

  /* ───────── 运动仿真控制 ───────── */

  const playSim = async () => {
    const scene = state.doc.scene
    if (scene.kind !== 'incline' && scene.kind !== 'motion') {
      toast('当前课件不支持运动仿真')
      return
    }
    // 物块被隐藏了就别再跑仿真：看不见的运动没有意义，也容易误判
    const hiddenBlock =
      state.doc.hidden['blk'] || (scene.kind === 'motion' && state.doc.hidden['ball'])
    if (hiddenBlock) {
      toast('物块已隐藏，先点左栏的眼睛图标显示它')
      return
    }
    if (!state.sim || state.stopped || state.sim.ended) {
      const st = await kernel.current?.simStart(scene)
      if (!st) {
        toast('仿真内核未就绪')
        return
      }
      dispatch({ type: 'sim', state: st })
      if (!st.sliding && st.a === 0) toast('当前倾角与摩擦系数下物体保持静止')
      return
    }
    dispatch({ type: 'sim-play' })
  }

  const pauseSim = () => dispatch({ type: 'sim-pause' })
  const stopSim = () => dispatch({ type: 'sim-stop' })
  const resetSim = () => dispatch({ type: 'sim-clear' })

  const actionsRef = useRef({ openDoc, newDoc, playSim })
  actionsRef.current = { openDoc, newDoc, playSim }

  /* 关闭窗口前确认未保存修改 */
  useEffect(() => {
    const off = window.chordot?.onRequestClose(async () => {
      const current = stateRef.current
      if (current.dirty) {
        const choice = await window.chordot!.confirmUnsaved(current.file)
        if (choice === 0) return
        if (choice === 2 && !(await saveRef.current())) return
      }
      window.chordot?.closeWindow()
    })
    return () => off?.()
  }, [])

  /** 表达式 → 函数曲线；解析失败时以教学语言提示并保留输入 */
  const submitExpression = (expr: string): boolean => {
    if (state.doc.scene.kind !== 'sketch') {
      newSketch()
      toast('已新建空白课件')
    }
    const probe = sampleFunction(expr)
    if (probe.error) {
      toast(probe.error)
      return false
    }
    dispatch({ type: 'add-function', expr })
    return true
  }

  /** 图形库：把图形放到指定世界坐标 */
  /** 图形库：把平面图形放到指定世界坐标 */
  const insertShape = (shapeId: string, at: { x: number; y: number }) => {
    const def = shapeById(shapeId)
    if (!def) return
    if (state.doc.scene.kind !== 'sketch') {
      dispatch({ type: 'scene', scene: sketchScene(), file: '未命名.chordot' })
    }
    dispatch({ type: 'insert-shape', shapeId, at: [at.x, at.y] })
    toast(`已放入「${def.name}」`)
  }

  /** 图形库：把立体放进三维场景（当前不是三维就新建一个） */
  const insertSolid = (def3dId: string, at: { x: number; y: number }) => {
    const def = shape3dById(def3dId)
    if (!def) return
    // 和已有立体重叠时自动往右让位，连放几个不会叠成一坨
    const existing = state.doc.scene.kind === 'solid' ? state.doc.scene.params.shapes : []
    let cx = at.x
    let cy = at.y
    for (let guard = 0; guard < 12; guard++) {
      const hit = existing.some(
        (s) => Math.hypot(s.center[0] - cx, s.center[1] - cy) < (s.size + def.size) * 0.45,
      )
      if (!hit) break
      cx += def.size * 0.9
    }
    const shape = {
      id: `s${Date.now().toString(36)}`,
      name: def.name,
      type: def.type,
      center: [cx, cy, def.size / 2] as [number, number, number],
      size: def.size,
      sides: def.sides,
    }
    if (state.doc.scene.kind === 'solid') {
      dispatch({ type: 'add-solid-shape', shape })
    } else {
      dispatch({
        type: 'scene',
        scene: {
          kind: 'solid',
          params: {
            shapes: [shape],
            camera: { azimuth: 42, elevation: 26, zoom: 1, view: 'free', perspective: true, dist: 14 },
          },
        },
        file: '三维场景.chordot',
      })
      toast('已切到三维场景（原来的二维内容不保留）')
      return
    }
    toast(`已放入「${def.name}」`)
  }

  /** 统一入口：2d:xxx / 3d:xxx */
  const insertAny = (key: string, at: { x: number; y: number }) => {
    if (key.startsWith('3d:')) insertSolid(key.slice(3), at)
    else insertShape(key.startsWith('2d:') ? key.slice(3) : key, at)
  }

  /** 点卡片而不是拖拽时，放到画面中央；连续放多个时错开一点，免得叠在一起 */
  const insertAtCenter = (key: string) => {
    const s = 40 * state.zoom
    const sc = state.doc.scene
    // 三维场景里没有「画布中心的世界坐标」，直接落在原点（相机看的就是原点）
    if (key.startsWith('3d:')) {
      insertAny(key, { x: 0, y: 0 })
      return
    }
    const seq =
      sc.kind === 'sketch'
        ? sc.doc.points.length + sc.doc.circles.length + sc.doc.polygons.length
        : 0
    const k = seq % 5
    insertAny(key, {
      x: -state.pan.x / s + k * 0.6,
      y: (40 + state.pan.y) / s - k * 0.6,
    })
  }

  /* ───────── 机构装配：部件 / 连接件的编辑 ───────── */

  /** 所有修改都走 scene-patch，撤销栈、保存、导出自动生效 */
  const patchMech = (patch: Partial<MechParams>) => {
    if (!mech) return
    dispatch({ type: 'scene-patch', scene: { kind: 'mech', params: { ...mech, ...patch } } })
  }

  const addMechPart = (kind: MechPartKind, at?: { x: number; y: number }) => {
    if (!mech) return
    const s = PX_PER_UNIT * state.zoom
    // 点卡片插入时按 4 个方位错开，别都叠在画面中心（拖放不受影响）
    const k = mech.parts.length % 4
    const p =
      at ??
      {
        x: -state.pan.x / s + ((k % 3) - 1) * 1.2,
        y: (40 + state.pan.y) / s + (k === 0 ? 0 : k === 3 ? -1.1 : 0.4),
      }
    const part = makePart(kind, p.x, Math.max(MECH_GROUND_Y + 0.35, p.y))
    patchMech({ parts: [...mech.parts, part] })
    setMechSel({ id: part.id, kind: 'part' })
    setMechSelIds([part.id])
    setMechPending(null)
    setMechAnchor(null)
    setMechPlaying(false)
  }

  const addMechLink = (kind: MechLinkKind, aId: string, bId: string) => {
    if (!mech || aId === bId) return
    const a = mech.parts.find((p) => p.id === aId)
    const b = mech.parts.find((p) => p.id === bId)
    if (!a || !b) return
    if (mech.links.some((l) => (l.a === aId && l.b === bId) || (l.a === bId && l.b === aId))) {
      toast('这两个部件之间已经有连接了')
      return
    }
    const link = makeLink(kind, a, b)
    patchMech({ links: [...mech.links, link] })
    setMechSel({ id: link.id, kind: 'link' })
    setMechSelIds([])
    // 连好一条就退出连接模式：不然接下来点部件全是「选起点」，没法拖动
    setMechPending(null)
    setMechAnchor(null)
    setMechPlaying(false)
  }

  const patchMechPart = (id: string, patch: Partial<MechPart>) => {
    if (!mech) return
    patchMech({ parts: mech.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  }

  const patchMechLink = (id: string, patch: Partial<MechLink>) => {
    if (!mech) return
    patchMech({ links: mech.links.map((l) => (l.id === id ? { ...l, ...patch } : l)) })
  }

  /** 删部件会把连着的连接一起删；删连接只是「拆开」，部件都还在 */
  const deleteMechSel = () => {
    if (!mech || !mechSel) return
    if (mechSel.kind === 'part') {
      const ids = new Set<string>([mechSel.id, ...mechSelIds])
      patchMech({
        parts: mech.parts.filter((p) => !ids.has(p.id)),
        links: mech.links.filter((l) => !ids.has(l.a) && !ids.has(l.b)),
      })
    } else {
      patchMech({ links: mech.links.filter((l) => l.id !== mechSel.id) })
    }
    setMechSel(null)
    setMechSelIds([])
    setMechPlaying(false)
  }

  const loadMech = (preset: MechPresetId) => {
    const p = presetById(preset)
    dispatch({ type: 'scene', scene: p.make(), file: p.file })
    setMechSel(null)
    setMechSelIds([])
    setMechPending(null)
    setMechAnchor(null)
    setMechPlaying(false)
    setMechEditing(true)
    setMechMeasure(null)
    setMechMeasureMode(false)
    setMechReset((t) => t + 1)
  }

  const mechUid = (id: string) => `${id}c${Math.random().toString(36).slice(2, 6)}`

  /** 复制一组部件 + 它们之间的连接（滑轮路线里的 id 也要跟着换） */
  const copyAssembly = (srcParts: MechPart[], srcLinks: MechLink[], dx: number, dy: number) => {
    const map = new Map<string, string>()
    const parts = srcParts.map((p) => {
      const id = mechUid(p.id)
      map.set(p.id, id)
      return { ...p, id, x: p.x + dx, y: p.y + dy, group: undefined }
    })
    const keep = new Set(srcParts.map((p) => p.id))
    const links = srcLinks
      .filter((l) => keep.has(l.a) && keep.has(l.b))
      .map((l) => {
        const vias = (l.vias ?? (l.via ? [l.via] : []))
          .map((v) => map.get(v))
          .filter((v): v is string => !!v)
        return {
          ...l,
          id: mechUid(l.id),
          a: map.get(l.a) ?? l.a,
          b: map.get(l.b) ?? l.b,
          ...(vias.length ? { vias, via: undefined } : {}),
        }
      })
    return { parts, links }
  }

  /** 选中件所在的连通子机构（沿连接 BFS） */
  const componentIds = (startId: string): Set<string> => {
    const out = new Set<string>([startId])
    if (!mech) return out
    const queue = [startId]
    while (queue.length) {
      const cur = queue.shift()!
      for (const l of mech.links) {
        const other = l.a === cur ? l.b : l.b === cur ? l.a : null
        if (other && !out.has(other)) {
          out.add(other)
          queue.push(other)
        }
      }
    }
    return out
  }

  /** 复制整台机构（部件 + 连接整体挪一格），用来做对照实验 */
  const duplicateMech = () => {
    if (!mech || mech.parts.length === 0) return
    const { parts, links } = copyAssembly(mech.parts, mech.links, 1.2, -0.6)
    patchMech({ parts: [...mech.parts, ...parts], links: [...mech.links, ...links] })
    setMechSel(null)
    setMechSelIds([])
    setMechPlaying(false)
  }

  /** 复制选中的部件（多选就一起复制，不带连接） */
  const duplicatePart = () => {
    if (!mech || !mechSel || mechSel.kind !== 'part') return
    const ids = new Set<string>([mechSel.id, ...mechSelIds])
    const src = mech.parts.filter((x) => ids.has(x.id))
    if (src.length === 0) return
    const { parts } = copyAssembly(src, [], 0.6, -0.4)
    patchMech({ parts: [...mech.parts, ...parts] })
    setMechSel({ id: parts[0].id, kind: 'part' })
    setMechSelIds(parts.map((p) => p.id))
  }

  /** 复制选中件所在的子机构（多选时复制它们所在的连通件） */
  const duplicateSub = () => {
    if (!mech || !mechSel || mechSel.kind !== 'part') return
    const ids = new Set<string>()
    const roots = mechSelIds.length > 1 ? mechSelIds : [mechSel.id]
    for (const r of roots) for (const id of componentIds(r)) ids.add(id)
    const srcParts = mech.parts.filter((p) => ids.has(p.id))
    const { parts, links } = copyAssembly(srcParts, mech.links, 1.2, -0.6)
    patchMech({ parts: [...mech.parts, ...parts], links: [...mech.links, ...links] })
    setMechSel(null)
    setMechSelIds([])
    setMechPlaying(false)
  }

  /** 成组 / 解组：多选时按选中的部件成组，单选时按连通件成组 */
  const setMechGroup = (on: boolean) => {
    if (!mech) return
    const ids = new Set<string>()
    if (mechSelIds.length > 1) for (const id of mechSelIds) ids.add(id)
    else if (mechSel?.kind === 'part') for (const id of componentIds(mechSel.id)) ids.add(id)
    if (ids.size === 0) return
    const group = on ? `g${Math.random().toString(36).slice(2, 6)}` : undefined
    patchMech({
      parts: mech.parts.map((p) => (ids.has(p.id) ? { ...p, group } : p)),
    })
  }

  /** 多选 / 单选（MechStage 点部件时调用） */
  const selectMech = (id: string | null, kind: 'part' | 'link' | null) => {
    setMechSel(id && kind ? { id, kind } : null)
    if (kind !== 'part') setMechSelIds([])
    if (!mechPending) setMechAnchor(null)
  }

  /** Shift 点选：直接给一组部件 id */
  const selectMechMany = (ids: string[]) => {
    setMechSelIds(ids)
    setMechSel(ids.length ? { id: ids[ids.length - 1], kind: 'part' } : null)
  }

  const mechSelectedParts = () => (mech ? mech.parts.filter((p) => mechSelIds.includes(p.id)) : [])

  /** 对齐：把多选部件的主坐标对齐到主选件 */
  const alignMech = (axis: 'x' | 'y') => {
    if (!mech || mechSelIds.length < 2) return
    const primary =
      mech.parts.find((p) => p.id === mechSel?.id) ?? mech.parts.find((p) => p.id === mechSelIds[0])
    if (!primary) return
    const target = axis === 'x' ? primary.x : primary.y
    patchMech({
      parts: mech.parts.map((p) =>
        mechSelIds.includes(p.id) ? (axis === 'x' ? { ...p, x: target } : { ...p, y: target }) : p,
      ),
    })
  }

  /** 分布：把多选部件在两端之间等距排开（至少 3 个） */
  const distributeMech = (axis: 'x' | 'y') => {
    if (!mech) return
    const sel = mechSelectedParts()
      .slice()
      .sort((a, b) => (axis === 'x' ? a.x - b.x : a.y - b.y))
    if (sel.length < 3) return
    const first = axis === 'x' ? sel[0].x : sel[0].y
    const last = axis === 'x' ? sel[sel.length - 1].x : sel[sel.length - 1].y
    const step = (last - first) / (sel.length - 1)
    const at = new Map(sel.map((p, i) => [p.id, first + step * i]))
    patchMech({
      parts: mech.parts.map((p) => {
        const v = at.get(p.id)
        if (v === undefined) return p
        return axis === 'x' ? { ...p, x: Math.round(v * 1000) / 1000 } : { ...p, y: Math.round(v * 1000) / 1000 }
      }),
    })
  }

  /** 旋转选中的部件：按 15° 吸附（可在世界面板关掉） */
  const rotateMech = (delta: number) => {
    if (!mech) return
    const ids = mechSelIds.length ? mechSelIds : mechSel?.kind === 'part' ? [mechSel.id] : []
    if (ids.length === 0) return
    const step = mechSnapAngle ? 15 : 1
    patchMech({
      parts: mech.parts.map((p) => {
        if (!ids.includes(p.id)) return p
        const next = Math.round(((p.angle ?? 0) + delta) / step) * step
        return { ...p, angle: ((next + 180) % 360) - 180 }
      }),
    })
  }

  /** 测距：点第一个部件 → 点第二个部件 → 出尺寸线；再点一个重新开始 */
  const measureMechPart = (id: string) => {
    setMechMeasure((m) => {
      if (!m || (m.a && m.b)) return { a: id, b: '' }
      if (m.a === id) return null
      return { a: m.a, b: id }
    })
  }

  /** 符号实验室发来的公式：可以当公式力，也可以把结果绑到弹簧 k / c 或部件质量上 */
  useEffect(() => {
    const off = window.chordot?.onSymbolForce?.((payload) => {
      const p =
        typeof payload === 'string'
          ? { expr: payload, target: 'force' as const, value: null }
          : payload
      const expr = String(p?.expr ?? '')
      const target = p?.target ?? 'force'
      const value = typeof p?.value === 'number' && Number.isFinite(p.value) ? p.value : null
      if (!expr.trim()) return
      if (!mech) {
        toast('先在机构装配里选中目标，再把公式发过来')
        return
      }
      if (target === 'force') {
        if (!mechSel || mechSel.kind !== 'part' || !mech.parts.some((x) => x.id === mechSel.id)) {
          toast('先在机构里选中一个部件，再把公式发过来')
          return
        }
        patchMechPart(mechSel.id, {
          // 收到公式就切到「公式」模式，否则恒力模式下看不到这条表达式
          force: { enabled: true, mode: 'expr', expr, angle: 0 },
        })
        setMechPlaying(false)
        toast(`已把 F = ${expr} 加到选中的部件上`)
        return
      }
      if (target === 'mass') {
        if (!mechSel || mechSel.kind !== 'part') {
          toast('先在机构里选中一个部件，再发「质量」')
          return
        }
        if (value === null) {
          toast('公式的当前值不是有效数字，无法设为质量')
          return
        }
        patchMechPart(mechSel.id, { mass: Math.max(0.02, Math.min(500, value)) })
        toast('已把质量设为 ' + Number(value.toFixed(2)) + ' kg')
        return
      }
      // springK / springC：优先选中的弹簧连接；否则找选中部件上连着的第一条弹簧
      const link =
        mechSel?.kind === 'link'
          ? mech.links.find((l) => l.id === mechSel.id && l.kind === 'spring')
          : mech.links.find(
              (l) => l.kind === 'spring' && (l.a === mechSel?.id || l.b === mechSel?.id),
            )
      if (!link) {
        toast('先在机构里选中一根弹簧（或连着弹簧的部件）')
        return
      }
      if (value === null) {
        toast('公式的当前值不是有效数字，无法绑定到弹簧')
        return
      }
      if (target === 'springK') {
        patchMechLink(link.id, { k: Math.max(0.1, Math.min(4000, value)) })
        toast('已把弹簧劲度 k 设为 ' + Number(value.toFixed(2)) + ' N/m')
      } else {
        patchMechLink(link.id, { c: Math.max(0, Math.min(200, value)) })
        toast('已把弹簧阻尼 c 设为 ' + Number(value.toFixed(2)) + ' N·s/m')
      }
    })
    return () => off?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mech, mechSel])

  /** 改线段长度 / 角度：起点不动，只挪终点 */
  const editLine = (id: string, patch: { length?: number; angleDeg?: number }) => {
    const scene = state.doc.scene
    if (scene.kind !== 'sketch') return
    const seg = scene.doc.segments.find((s) => s.id === id)
    if (!seg) return
    const pa = scene.doc.points.find((p) => p.id === seg.a)
    const pb = scene.doc.points.find((p) => p.id === seg.b)
    if (!pa || !pb) return
    const dx = pb.x - pa.x
    const dy = pb.y - pa.y
    const len = patch.length ?? Math.hypot(dx, dy)
    const ang =
      patch.angleDeg !== undefined ? (patch.angleDeg * Math.PI) / 180 : Math.atan2(dy, dx)
    const nx = pa.x + len * Math.cos(ang)
    const ny = pa.y + len * Math.sin(ang)
    const doc = {
      ...scene.doc,
      points: scene.doc.points.map((p) => (p.id === pb.id ? { ...p, x: nx, y: ny } : p)),
    }
    dispatch({ type: 'drag-points', moves: [{ id: pb.id, x: nx, y: ny }] })
    requestSolve({ kind: 'sketch', doc }, undefined, [pb.id])
  }

  const handleCanvasClick = (p: { x: number; y: number }, snapId?: string, keepTool?: boolean) => {
    if (state.tool === 'force') {
      const scene = state.doc.scene
      if (scene.kind !== 'sketch') return
      // 落在已有点上就把力的作用点吸到那个点
      const snap = snapId ? objects.find((o) => o.id === snapId) : null
      const at: [number, number] =
        snap && snap.kind === 'point' ? [snap.x, snap.y] : [p.x, p.y]
      const seq = (scene.doc.forces ?? []).length + 1
      const id = `F${Date.now().toString(36)}`
      dispatch({
        type: 'add-force',
        force: { id, name: `F${seq}`, expr: '10', angle: 0, at, kind: 'constant' },
      })
      toast('已添加力，右栏可改大小、方向与变化方式')
      return
    }
    dispatch({ type: 'construct-click', p, snapId, keepTool })
  }

  const chooseTool = (tool: ToolId) => {
    // 「添加几何约束」「显示正交分解」不是作图工具，而是打开对应面板
    if (tool === 'constraint') {
      if (state.doc.scene.kind !== 'sketch') {
        toast('几何约束只能用在草图里')
        return
      }
      dispatch({ type: 'right', open: true })
      dispatch({ type: 'tool', tool: 'select' })
      toast('在画布上选中线段后，右栏「约束」里点要加的约束')
      return
    }
    if (tool === 'decompose') {
      const force = objects.find((o) => o.id === state.selected[0] && o.kind === 'force')
      if (!force) {
        toast('先在画布上选中一个力，再点正交分解')
        return
      }
      dispatch({ type: 'decompose', id: force.id })
      return
    }

    if ((tool === 'pen' || tool === 'eraser') && state.inkHidden) {
      dispatch({ type: 'ink-visible', visible: true })
    }
    const construction =
      tool === 'point' || tool === 'line' || tool === 'circle' || tool === 'polygon' || tool === 'force'
    if (construction && state.doc.scene.kind !== 'sketch') {
      // 以前这里会直接换一张空白草图，等于把当前课件清空了。
      // 现在只提示，不动文档：要作图请显式「文件 → 新建」。
      toast('当前是受力/三维场景，手工作图请先「文件 → 新建」')
      return
    }
    dispatch({ type: 'tool', tool })
  }

  /* 快捷键分层（design.md §6.2） */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      // 数学编辑器也算「正在输入」：否则在里面敲 p / m / 退格会触发工具快捷键
      const typing =
        el?.tagName === 'INPUT' ||
        el?.tagName === 'TEXTAREA' ||
        el?.tagName === 'MATH-FIELD' ||
        !!el?.closest?.('math-field')

      // 弹窗打开时画布快捷键一律不响应（Esc 由弹窗自己处理）
      if (prefsOpen || shortcutsOpen || tourOpen || updateOpen || state.galleryOpen || state.textbookOpen) return

      if (e.key === 'F1') {
        e.preventDefault()
        setShortcutsOpen(true)
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        dispatch({ type: 'pad', open: !state.padOpen })
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && !typing) {
        if (state.selected.length === 0) return
        e.preventDefault()
        dispatch({ type: 'duplicate', ids: state.selected })
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        dispatch({ type: 'palette', open: !state.paletteOpen })
        return
      }
      if ((e.key === 'b' || e.key === 'B') && !typing) {
        dispatch({ type: 'tool', tool: state.tool === 'pen' ? 'select' : 'pen' })
        return
      }
      if ((e.key === 'e' || e.key === 'E') && !typing) {
        dispatch({ type: 'tool', tool: state.tool === 'eraser' ? 'select' : 'eraser' })
        return
      }
      if (e.key === 'Escape') {
        // 色盘开着时 Esc 只收色盘：PenBar 自己处理，别顺手退出批注模式
        if (document.querySelector('.colorpal')) return
        if (state.paletteOpen) dispatch({ type: 'palette', open: false })
        else if (typing) (el as HTMLInputElement).blur()
        else if (state.picks.length > 0) dispatch({ type: 'construct-cancel' })
        else {
          dispatch({ type: 'select', ids: [] })
          dispatch({ type: 'tool', tool: 'select' })
        }
        return
      }
      const mod = e.ctrlKey || e.metaKey

      // 文件与视图类快捷键在输入框里也要生效：写到一半按 Ctrl+S 不该没反应
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveRef.current(e.shiftKey)
        return
      }
      if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        void actionsRef.current.openDoc()
        return
      }
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        void actionsRef.current.newDoc()
        return
      }
      if (mod && e.key === '0') {
        e.preventDefault()
        fit()
        return
      }

      // 其余快捷键在输入框里让位给文字编辑（Ctrl+Z 撤销的是输入，不是图形）
      if (typing || state.paletteOpen) return

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' })
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        dispatch({ type: 'redo' })
        return
      }
      if (mod) return

      if (e.key === ' ') {
        // 机构优先：空格播放 / 暂停（播放即切到真实模式）
        if (mech) {
          e.preventDefault()
          const next = !mechPlaying
          setMechPlaying(next)
          if (next) setMechEditing(false)
          return
        }
        // 物理世界优先：空格暂停/继续
        if (state.doc.scene.kind === 'solid' && state.doc.scene.params.physics?.enabled) {
          e.preventDefault()
          dispatch({ type: 'physics-play', playing: !state.physicsPlaying })
          return
        }
        if (state.subState === 'kinematics') {
          e.preventDefault()
          if (state.playing) dispatch({ type: 'sim-pause' })
          else void actionsRef.current.playSim()
        }
        return
      }

      // 机构专用快捷键：R 旋转 / V 矢量 / D 受力分解 / E 编辑真实切换 / L 标签 / T 轨迹
      if (mech) {
        const k = e.key.toLowerCase()
        if (k === 'r') {
          e.preventDefault()
          rotateMech(e.shiftKey ? -15 : 15)
          return
        }
        if (k === 'v') {
          e.preventDefault()
          setMechVectors((v) => !v)
          return
        }
        if (k === 'd') {
          e.preventDefault()
          setMechDecompose((v) => !v)
          return
        }
        if (k === 'e') {
          e.preventDefault()
          const next = !mechEditing
          setMechEditing(next)
          setMechPlaying(!next)
          if (next) {
            setMechPending(null)
            setMechAnchor(null)
          }
          return
        }
        if (k === 'l') {
          e.preventDefault()
          setMechLabels((v) => !v)
          return
        }
        if (k === 't') {
          e.preventDefault()
          setMechTrails((v) => !v)
          return
        }
      }

      if (e.key === 'p' || e.key === 'P') {
        dispatch({ type: 'right', open: !state.rightOpen })
      } else if (e.key === 'g' || e.key === 'G') {
        dispatch({ type: 'grid' })
      } else if (e.key === 'm' || e.key === 'M') {
        toggleMode()
      } else if (e.key === 'd' || e.key === 'D') {
        const id = state.selected[state.selected.length - 1]
        const picked = objects.find((o) => o.id === id)
        if (picked?.kind === 'force') dispatch({ type: 'decompose', id: picked.id })
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        if (mech && mechSel) deleteMechSel()
        else dispatch({ type: 'delete' })
      } else if (e.key === 'Escape') {
        if (mechMeasureMode || mechMeasure) {
          setMechMeasure(null)
          setMechMeasureMode(false)
          return
        }
        if (mechPending) {
          setMechPending(null)
          setMechAnchor(null)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.paletteOpen,
    state.padOpen,
    state.rightOpen,
    state.mode,
    state.picks,
    state.selected,
    state.subState,
    state.playing,
    state.galleryOpen,
    state.textbookOpen,
    prefsOpen,
    shortcutsOpen,
    tourOpen,
    updateOpen,
    fit,
    objects,
    mech,
    mechSel,
    mechSelIds,
    mechPending,
    mechPlaying,
    mechEditing,
    mechSnapAngle,
    mechMeasure,
    mechMeasureMode,
  ])

  const paletteItems: PaletteItem[] = useMemo(
    () => [
      { id: 'new', label: '新建课件（可设属性）', hint: 'Ctrl+N', run: () => void newDoc() },
      { id: 'home', label: '返回大厅（新建 / 打开 / 换模式）…', run: () => void returnToLobby() },
      { id: 'gallery', label: '模板库（独立窗口）…', run: () => openGalleryEntry() },
      { id: 'textbook', label: '教材实验室（独立窗口）…', run: () => openLabEntry() },
      { id: 'presenter', label: '演示者模式（全屏 / 计时 / 镜头翻页）', run: () => startPresenter() },
      {
        id: 'theme',
        label: settings.theme === 'glass' ? '切换主题：纸面' : '切换主题：液态玻璃',
        run: () => patchSettings({ theme: settings.theme === 'glass' ? 'paper' : 'glass' }),
      },
      {
        id: 'spotlight',
        label: '聚光灯（全局：压暗四周看局部）',
        run: () => setPresentTool((v) => (v === 'spot' ? null : 'spot')),
      },
      {
        id: 'magnifier',
        label: '放大镜（全局：跟随指针放大画布）',
        run: () => setPresentTool((v) => (v === 'lens' ? null : 'lens')),
      },
      { id: 'export-pdf', label: '导出 PDF 讲义…', run: () => void exportPDFSheet() },
      { id: 'history', label: '版本历史…', run: () => void openHistory() },
      { id: 'library-add', label: '保存到课件库', run: () => void saveToLibrary() },
      { id: 'textbook-window', label: '教材实验室：独立窗口（投影 / 双屏）…', run: () => void window.chordot?.openLabWindow() },
      { id: 'open', label: '打开课件…', hint: 'Ctrl+O', run: () => void openDoc() },
      { id: 'save', label: '保存', hint: 'Ctrl+S', run: () => void save() },
      { id: 'save-as', label: '另存为…', hint: 'Ctrl+Shift+S', run: () => void save(true) },
      { id: 'export-svg', label: '导出 SVG', run: () => exportDrawing('svg') },
      { id: 'export-png', label: '导出 PNG', run: () => exportDrawing('png') },
      { id: 'grid', label: state.grid ? '关闭网格' : '打开网格', hint: 'G', run: () => dispatch({ type: 'grid' }) },
      {
        id: 'mode',
        label: state.mode === 'physics' ? '切换到数学模式' : '切换到物理模式',
        hint: 'M',
        run: toggleMode,
      },
      {
        id: 'panel',
        label: state.rightOpen ? '收起属性面板' : '打开属性面板',
        hint: 'P',
        run: () => dispatch({ type: 'right', open: !state.rightOpen }),
      },
      { id: 'fit', label: '缩放适配', hint: 'Ctrl+0', run: fit },
      ...recent.map((p) => ({
        id: `recent:${p}`,
        label: `最近：${fileName(p)}`,
        run: () => void openDoc(p),
      })),
      { id: 'sample-incline', label: '示例：斜面受力（可拖倾角）', run: loadIncline },
      { id: 'sample-slide', label: '示例：斜面下滑（可跑运动仿真）', run: loadSlide },
      { id: 'sample-triangle', label: '示例：约束三角形（可拖顶点）', run: loadTriangle },
      { id: 'sample-conflict', label: '示例：约束冲突', run: loadConflict },
      { id: 'sample-solid', label: '示例：正方体（三维，可旋转）', run: loadSolid },
      { id: 'sample-incline3d', label: '示例：三维斜面受力', run: loadIncline3d },
      { id: 'sample-mech', label: '机构装配：弹簧振子（可拼可拆）', run: () => loadMech('spring') },
      { id: 'sample-mech-empty', label: '机构装配：空白装配台', run: () => loadMech('empty') },
      { id: 'sample-mech-gear', label: '机构装配：齿轮传动（电机 + 惰轮）', run: () => loadMech('gearTrain') },
      { id: 'sample-mech-crank', label: '机构装配：曲柄滑块', run: () => loadMech('crankSlider') },
      { id: 'sample-mech-piston', label: '机构装配：液压缸', run: () => loadMech('piston') },
      { id: 'sample-mech-rocket', label: '机构装配：火箭推力', run: () => loadMech('rocket') },
      { id: 'sample-mech-magnet', label: '机构装配：磁铁（失重）', run: () => loadMech('magnet') },
      { id: 'symbols', label: '符号公式实验室（独立窗口）…', run: () => void window.chordot?.openSymbolWindow?.() },
      { id: 'sample-pendulum', label: '示例：单摆（动力学）', run: loadPendulum },
      {
        id: 'sample-spring',
        label: '示例：弹簧振子',
        run: () => dispatch({ type: 'scene', scene: springScene(), file: '弹簧振子.chordot' }),
      },
      {
        id: 'sample-projectile',
        label: '示例：平抛运动',
        run: () => dispatch({ type: 'scene', scene: projectileScene(), file: '平抛运动.chordot' }),
      },
      { id: 'prefs', label: '首选项', run: () => setPrefsOpen(true) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      state.grid,
      state.mode,
      state.rightOpen,
      fit,
      toast,
      recent,
      returnToLobby,
      openGalleryEntry,
      openLabEntry,
      startPresenter,
      exportPDFSheet,
      openHistory,
      saveToLibrary,
    ],
  )

  /* 应用菜单（Alt 唤出菜单栏）：用 ref 拿最新的处理函数，effect 只挂一次 */
  const menuHandler = useRef<(action: string, arg?: string) => void>(() => {})
  menuHandler.current = (action, arg) => {
    switch (action) {
      case 'new':
        void newDoc()
        break
      case 'open':
        void openDoc()
        break
      case 'open-recent':
        if (arg) void openDoc(arg)
        break
      case 'home':
        void returnToLobby()
        break
      case 'clear-recent':
        setRecent([])
        window.chordot?.setUiState({ recent: [] })
        toast('已清除最近打开列表')
        break
      case 'save':
        void save()
        break
      case 'save-as':
        void save(true)
        break
      case 'export-png':
        exportDrawing('png')
        break
      case 'export-svg':
        exportDrawing('svg')
        break
      case 'undo':
        dispatch({ type: 'undo' })
        break
      case 'redo':
        dispatch({ type: 'redo' })
        break
      case 'prefs':
        setPrefsTab('general')
        setPrefsOpen(true)
        break
      case 'about':
        setPrefsTab('about')
        setPrefsOpen(true)
        break
      case 'shortcuts':
        setShortcutsOpen(true)
        break
      case 'textbook':
        openLabSmart()
        break
      case 'textbook-window':
        openLabEntry()
        break
      case 'gallery-window':
        openGalleryEntry()
        break
      case 'history':
        void openHistory()
        break
      case 'library-add':
        void saveToLibrary()
        break
      case 'export-pdf':
        void exportPDFSheet()
        break
      case 'presenter':
        startPresenter()
        break
      case 'spotlight':
        setPresentTool((v) => (v === 'spot' ? null : 'spot'))
        break
      case 'magnifier':
        setPresentTool((v) => (v === 'lens' ? null : 'lens'))
        break
      case 'tour':
        setTourOpen(true)
        break
      case 'data-dir':
        void window.chordot?.store?.open()
        break
      case 'check-update':
        void (async () => {
          const res = await updater.check(false)
          if (!res) return
          if (!res.ok) {
            toast(res.error ?? '检查更新失败，稍后再试')
            return
          }
          if (!res.hasUpdate) {
            toast(`已是最新版本 ${res.current}`)
            return
          }
          setUpdateOpen(true)
        })()
        break
      default:
        break
    }
  }

  useEffect(() => window.chordot?.onMenu((action, arg) => menuHandler.current(action, arg)), [])

  // 触控模式下右栏会变宽，左栏上限跟着让位
  const maxLeftWidth = Math.max(
    200,
    window.innerWidth - 480 - (state.rightOpen ? (touch ? 320 : 280) : 0) - 2,
  )

  /** 批注是一个独立模式：画笔/橡皮激活时，底部整行换成批注条 */
  const inkMode = state.tool === 'pen' || state.tool === 'eraser'

  const presenterSeconds = presenter.on ? (Date.now() - presenter.startedAt) / 1000 : 0

  return (
    <div
      className={
        'app' + (presenter.on ? ' app--present' : '') + (presenter.boost ? ' app--boost' : '')
      }
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) {
          e.preventDefault()
          setDropActive(true)
        }
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(e) => {
        const file = e.dataTransfer?.files?.[0]
        if (!file) return
        e.preventDefault()
        setDropActive(false)
        const path = window.chordot?.getPathForFile?.(file)
        if (path && /\.chordot$/i.test(path)) {
          void openDoc(path)
        } else {
          toast('把 .chordot 课件拖进窗口即可打开')
        }
      }}
    >
      {lobbyOpen ? (
        <Lobby
          version={__APP_VERSION__}
          theme={settings.theme}
          onToggleTheme={() =>
            patchSettings({ theme: settings.theme === 'glass' ? 'paper' : 'glass' })
          }
          recentFiles={recentFiles}
          recovery={recovery}
          quote={quote}
          library={library}
          onRecover={() => void recoverAutosave()}
          onDismissRecovery={() => void dismissRecovery()}
          onQuoteRefresh={() => void refreshQuote()}
          onOpenLibrary={(path) => void openLibraryFile(path)}
          lastFile={lastFile}
          currentFile={hasDoc ? state.file : null}
          onNew={() => setNewDocOpen(true)}
          onOpen={() => void openDoc()}
          onOpenRecent={(path) => void openDoc(path)}
          onResumeLast={() => {
            if (lastFile) void openDoc(lastFile)
          }}
          onResumeCurrent={() => setLobbyOpen(false)}
          onQuick={quickStart}
          onPrefs={() => {
            setPrefsTab('general')
            setPrefsOpen(true)
          }}
          onShortcuts={() => setShortcutsOpen(true)}
          onTour={() => setTourOpen(true)}
          onUpdate={() => {
            void (async () => {
              const res = await updater.check(false)
              if (!res) return
              if (!res.ok) {
                toast(res.error ?? '检查更新失败，稍后再试')
                return
              }
              if (!res.hasUpdate) {
                toast('已是最新版本 ' + res.current)
                return
              }
              setUpdateOpen(true)
            })()
          }}
          onDataDir={() => void window.chordot?.store?.open()}
        />
      ) : (
        <>
      <TitleBar
        file={state.file}
        dirty={state.dirty}
        title={state.doc.meta?.title}
        onHome={() => void returnToLobby()}
      />

      <div className="workspace">
        {state.doc.scene.kind !== 'mech' && (
        <LeftPanel
          objects={objects}
          selected={state.selected}
          width={Math.min(state.leftWidth, maxLeftWidth)}
          onSelect={(ids) => dispatch({ type: 'select', ids })}
          onToggleVisible={(id) => dispatch({ type: 'toggle-visible', id })}
          onOpenProps={(id) => {
            dispatch({ type: 'select', ids: [id] })
            dispatch({ type: 'right', open: true })
          }}
          onResize={(width) => dispatch({ type: 'left-width', width: Math.min(width, maxLeftWidth) })}
          onDelete={() => dispatch({ type: 'delete' })}
          onHide={() => {
            for (const id of state.selected) dispatch({ type: 'toggle-visible', id })
          }}
          onGroup={() => toast('分组在第二阶段接入')}
          onDuplicate={(ids) => dispatch({ type: 'duplicate', ids })}
          onDeleteIds={(ids) => {
            dispatch({ type: 'select', ids })
            dispatch({ type: 'delete' })
          }}
          onColor={(id, color) => dispatch({ type: 'set-color', id, color })}
          // 空草图已经有画布中央的引导卡，左栏不再重复；三维场景才需要一句说明
          emptyHint={
            state.doc.scene.kind === 'solid' || state.doc.scene.kind === 'solidIncline'
              ? '三维场景：拖动旋转视角，滚轮缩放'
              : undefined
          }
          onSubmitExpr={submitExpression}
        />
        )}

        <div className="canvas-col">
          <CanvasStage
          objects={objects}
          selected={state.selected}
          grid={state.grid}
          zoom={state.zoom}
          mode={state.mode}
          tool={state.tool}
          scaleText={scaleText}
          draggingId={state.drag?.id ?? null}
          picks={state.picks}
          decomposed={state.decomposed}
          annotation={measured?.annotation ?? null}
          conflictIds={state.solution.conflict?.ids ?? []}
          badges={badges}
          pan={state.pan}
          onPan={(pan) => dispatch({ type: 'pan', pan })}
          touch={touch}
          pxPerN={settings.forceScale}
          showTicks={settings.showTicks}
          gridStep={settings.gridStep}
          curveWidth={settings.curveWidth}
          camera={camera}
          solidIncline={
            state.doc.scene.kind === 'solidIncline' ? state.doc.scene.params : null
          }
          solidPhysics={solidPhysics?.enabled ?? false}
          solidObstacles={solidPhysics?.enabled ? (solidPhysics.obstacles ?? []) : []}
          solidPhysicsInfo={
            solidPhysics?.enabled
              ? {
                  gravity: solidPhysics.gravity,
                  global: solidPhysics.force,
                  time: physRef.current?.times[physIndex] ?? 0,
                }
              : null
          }
          strokes={state.doc.strokes ?? []}
          penColor={state.penColor}
          penWidth={state.penWidth}
          penMode={state.penMode}
          penVelocity={settings.penVelocity}
          hideInk={state.inkHidden}
          onStrokeCommit={(stroke) => dispatch({ type: 'stroke-add', stroke })}
          onStrokesCut={(cuts) => dispatch({ type: 'strokes-cut', cuts })}
          onDragPoints={(moves) => dispatch({ type: 'drag-points', moves })}
          onCamera={setCamera}
          onCameraStart={() => dispatch({ type: 'drag-start', id: '__camera', x: 0, y: 0 })}
          onCameraEnd={() => dispatch({ type: 'drag-end' })}
          // 播放/暂停用同一套标尺：同一根力箭头长度必须一致，否则会误读成力变了
          forceScale={1}
          svgRef={svgRef}
          onSelect={selectFromCanvas}
          onClearSelection={() => {
            dispatch({ type: 'select', ids: [] })
            setMechSel(null)
            if (!mechPending) setMechAnchor(null)
          }}
          onCanvasSize={(w, h) => dispatch({ type: 'canvas', w, h })}
          onZoom={(zoom) => dispatch({ type: 'zoom', zoom })}
          onCanvasClick={handleCanvasClick}
          onEmptyAction={(action) => {
            if (action === 'expr') {
              document.querySelector<HTMLInputElement>('.left__input')?.focus()
            } else if (action === 'point') {
              chooseTool('point')
            } else {
              loadIncline()
              dispatch({ type: 'right', open: true })
            }
          }}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
          onDropShape={(id, at) => insertAny(id, at)}
          mech={mech}
          mechSelected={mechSel?.id ?? null}
          mechSelectedIds={mechSelIds}
          mechPending={mechPending}
          mechAnchor={mechAnchor}
          mechPlaying={mechPlaying}
          mechEditing={mechEditing}
          mechVectors={mechVectors}
          mechDecompose={mechDecompose}
          mechLabels={mechLabels}
          mechTrails={mechTrails}
          mechGrid={mechGrid}
          mechSnapAngle={mechSnapAngle}
          mechMeasure={mechMeasure}
          mechMeasureMode={mechMeasureMode}
          mechResetToken={mechReset}
          mechLive={mechLive}
          onMechSelect={selectMech}
          onMechSelectMany={selectMechMany}
          onMechAnchor={setMechAnchor}
          onMechLink={addMechLink}
          onMechCommitParts={(parts) => patchMech({ parts })}
          onMechDrop={(kind, at) => addMechPart(kind, at)}
          onMechMeasurePart={measureMechPart}
          />
          {state.mode === 'physics' && !mech && state.doc.scene.kind === 'sketch' && (
            <div className="physprompt">
              <b>物理模式</b>
              <p>画布里的图形还只是几何。要让它受重力、弹簧、摩擦的作用动起来，先开一张装配台：</p>
              <div className="physprompt__row">
                <button onClick={() => loadMech('empty')}>空白装配台</button>
                <button onClick={() => loadMech('spring')}>弹簧振子</button>
                <button onClick={() => loadMech('pulleyGroup')}>滑轮组</button>
              </div>
            </div>
          )}
          {mech && (
            <MechBar
              params={mech}
              selected={mechSel}
              selectedIds={mechSelIds}
              live={mechLive}
              pending={mechPending}
              anchor={mechAnchor}
              playing={mechPlaying}
              editing={mechEditing}
              vectors={mechVectors}
              decompose={mechDecompose}
              labels={mechLabels}
              trails={mechTrails}
              grid={mechGrid}
              snapAngle={mechSnapAngle}
              measure={mechMeasure}
              measureMode={mechMeasureMode}
              onEditing={(v) => {
                setMechEditing(v)
                // 切到真实就立刻跑起来；切回编辑就停下，方便摆零件
                setMechPlaying(!v)
                if (v) setMechPending(null)
                if (v) setMechAnchor(null)
              }}
              onPending={(k) => {
                setMechPending(k)
                setMechAnchor(null)
                setMechPlaying(false)
              }}
              onAddPart={(kind) => addMechPart(kind)}
              onPatchPart={patchMechPart}
              onPatchLink={patchMechLink}
              onPatchParams={patchMech}
              onDelete={deleteMechSel}
              onDisconnect={() => {
                patchMech({ links: [] })
                setMechSel(null)
                setMechSelIds([])
                setMechPlaying(false)
              }}
              onClear={() => {
                patchMech({ parts: [], links: [] })
                setMechSel(null)
                setMechSelIds([])
                setMechPending(null)
                setMechAnchor(null)
                setMechMeasure(null)
                setMechMeasureMode(false)
                setMechPlaying(false)
              }}
              onPlay={(v) => {
                setMechPlaying(v)
                // 在编辑模式下按播放，等同于切到真实
                if (v) setMechEditing(false)
              }}
              onReset={() => {
                setMechPlaying(false)
                setMechReset((t) => t + 1)
              }}
              onPreset={loadMech}
              onVectors={setMechVectors}
              onDecompose={setMechDecompose}
              onLabels={setMechLabels}
              onTrails={setMechTrails}
              onGrid={setMechGrid}
              onSnapAngle={setMechSnapAngle}
              onMeasureMode={(v) => {
                setMechMeasureMode(v)
                if (!v) setMechMeasure(null)
              }}
              onMeasureClear={() => setMechMeasure(null)}
              onDuplicate={duplicateMech}
              onDuplicatePart={duplicatePart}
              onDuplicateSub={duplicateSub}
              onGroup={() => setMechGroup(true)}
              onUngroup={() => setMechGroup(false)}
              onSelectMany={selectMechMany}
              onAlign={alignMech}
              onDistribute={distributeMech}
              onRotate={rotateMech}
            />
          )}
          {solidPhysics?.enabled && (
            <Timeline
              playing={state.physicsPlaying}
              index={physIndex}
              total={physTotal}
              time={physRef.current?.times[physIndex] ?? 0}
              onToggle={() => dispatch({ type: 'physics-play', playing: !state.physicsPlaying })}
              onScrub={scrubPhysics}
              onLive={goLive}
            />
          )}
          {state.shapesOpen && (
            <ShapePanel
              onInsert={insertAtCenter}
              onClose={() => dispatch({ type: 'shapes', open: false })}
            />
          )}
          {state.padOpen && <SymbolPad onClose={() => dispatch({ type: 'pad', open: false })} />}
        </div>

        {state.rightOpen && (
          <RightPanel
            objects={objects}
            selected={state.selected}
            mode={state.mode}
            subState={state.subState}
            onSubState={(sub) => dispatch({ type: 'substate', sub })}
            onClose={() => dispatch({ type: 'right', open: false })}
            onRename={(id, name) => dispatch({ type: 'rename', id, name })}
            decomposed={state.decomposed}
            measure={measured}
            propSchema={propSchema}
            onPatchParams={patchParams}
            forcePreview={state.forcePreview}
            onPreviewForce={(value) => dispatch({ type: 'force-preview', value })}
            onPatchForce={(id, patch) => dispatch({ type: 'patch-force', id, patch })}
            constraints={sketchDoc ? (sketchDoc.constraints ?? []) : null}
            polygons={sketchDoc ? (sketchDoc.polygons ?? []) : null}
            onPatchPolygon={(id, patch) => dispatch({ type: 'patch-polygon', id, patch })}
            onRotate={(deg) =>
              dispatch({ type: 'rotate-objects', ids: state.selected, angleDeg: deg })
            }
            selectedLines={selectedLines}
            selectedPoints={selectedPoints}
            selectedCircles={selectedCircles}
            onAddConstraint={applyConstraint}
            onRemoveConstraint={(id) => dispatch({ type: 'remove-constraint', id })}
            simModel={
              state.doc.scene.kind === 'motion'
                ? state.doc.scene.params.model
                : state.doc.scene.kind === 'incline'
                  ? 'incline'
                  : null
            }
            conflict={state.solution.conflict ?? null}
            onSelectConflict={(ids: string[]) => dispatch({ type: 'select', ids })}
            onEditLine={editLine}
            onEditFunction={(id: string, expr: string) => {
              const probe = sampleFunction(expr)
              if (probe.error) {
                toast(probe.error)
                return false
              }
              dispatch({ type: 'edit-function', id, expr })
              return true
            }}
            sim={state.sim}
            playing={state.playing}
            onToggleDecompose={(id) => dispatch({ type: 'decompose', id })}
            onPlay={() => void playSim()}
            onPause={pauseSim}
            onStop={stopSim}
            onReset={resetSim}
          />
        )}
      </div>

      {/* 底部工具坞：学校一体机的可及区在下半屏，主工具与批注都放这里 */}
      <div className="dock" data-ink={inkMode ? '1' : '0'}>
        {inkMode ? (
          <PenBar
            tool={state.tool === 'eraser' ? 'eraser' : 'pen'}
            color={state.penColor}
            width={state.penWidth}
            mode={state.penMode}
            velocity={settings.penVelocity}
            count={(state.doc.strokes ?? []).length}
            hidden={state.inkHidden}
            canUndo={state.past.length > 0}
            canRedo={state.future.length > 0}
            onChange={(patch) => dispatch({ type: 'pen', ...patch })}
            onTool={(tool) => dispatch({ type: 'tool', tool })}
            onVelocity={(on) => patchSettings({ penVelocity: on })}
            onToggleInk={() => dispatch({ type: 'ink-visible', visible: state.inkHidden })}
            onUndo={() => dispatch({ type: 'undo' })}
            onRedo={() => dispatch({ type: 'redo' })}
            onClear={() => {
              if ((state.doc.strokes ?? []).length === 0) {
                toast('还没有批注可清空')
                return
              }
              dispatch({ type: 'strokes-clear' })
              toast('已清空批注，按撤销可以恢复')
            }}
            onDone={() => dispatch({ type: 'tool', tool: 'select' })}
          />
        ) : (
          <Toolbar
            mode={state.mode}
            tool={state.tool}
            grid={state.grid}
            pad={state.padOpen}
            onTogglePad={() => dispatch({ type: 'pad', open: !state.padOpen })}
            shapes={state.shapesOpen}
            onToggleShapes={() => dispatch({ type: 'shapes', open: !state.shapesOpen })}
            canUndo={state.past.length > 0}
            canRedo={state.future.length > 0}
            onUndo={() => dispatch({ type: 'undo' })}
            onRedo={() => dispatch({ type: 'redo' })}
            onTool={chooseTool}
            onToggleGrid={() => dispatch({ type: 'grid' })}
            onFit={fit}
            onExport={exportDrawing}
            onCommand={(cmd) => {
              if (cmd === 'open') void openDoc()
              else if (cmd === 'save') void save()
              else if (cmd === 'saveAs') void save(true)
              else if (cmd === 'clear') void clearCanvas()
              else if (cmd === 'samples') loadIncline()
              else if (cmd === 'triangle') loadTriangle()
              else if (cmd === 'slide') loadSlide()
              else if (cmd === 'conflict') loadConflict()
              else if (cmd === 'solid') loadSolid()
              else if (cmd === 'pendulum') loadPendulum()
              else if (cmd === 'incline3d') loadIncline3d()
              else if (cmd === 'mech') loadMech('spring')
              else if (cmd === 'mech-empty') loadMech('empty')
              else if (cmd === 'mech-gear') loadMech('gearTrain')
              else if (cmd === 'mech-crank') loadMech('crankSlider')
              else if (cmd === 'mech-piston') loadMech('piston')
              else if (cmd === 'mech-rocket') loadMech('rocket')
              else if (cmd === 'mech-magnet') loadMech('magnet')
              else if (cmd === 'symbols') void window.chordot?.openSymbolWindow?.()
              else if (cmd === 'gallery') openGallerySmart()
              else if (cmd === 'gallery-window') openGalleryEntry()
              else if (cmd === 'textbook') openLabSmart()
              else if (cmd === 'textbook-window') openLabEntry()
              else if (cmd === 'presenter') startPresenter()
              else if (cmd === 'export-pdf') void exportPDFSheet()
              else if (cmd === 'history') void openHistory()
              else if (cmd === 'library-add') void saveToLibrary()
              else if (cmd === 'spotlight')
                setPresentTool((v) => (v === 'spot' ? null : 'spot'))
              else if (cmd === 'magnifier')
                setPresentTool((v) => (v === 'lens' ? null : 'lens'))
              else if (cmd === 'palette') dispatch({ type: 'palette', open: true })
              else if (cmd === 'shortcuts') setShortcutsOpen(true)
              else setPrefsOpen(true)
            }}
          />
        )}
      </div>

      <StatusBar
        mode={state.mode}
        selectedCount={state.selected.length}
        picks={state.picks.length}
        zoom={state.zoom}
        scaleText={scaleText}
        busy={busy}
        slow={slow}
        solveMs={state.lastMs}
        source={state.lastSource}
        measureText={
          measured && state.selected.length === 2
            ? `距离 ${measured.rows[0]?.value ?? ''}`
            : undefined
        }
        rightOpen={state.rightOpen}
        onToggleMode={toggleMode}
      />
        </>
      )}

      {newDocOpen && (
        <NewDocDialog
          initial={{
            name: '',
            subject: state.mode === 'physics' ? 'physics' : 'math',
            canvas: 'blank',
            grid: settings.grid,
            gridStep: settings.gridStep as 0.5 | 1 | 2,
            showTicks: settings.showTicks,
            angleUnit: settings.angleUnit,
            touch: settings.touchDefault,
          }}
          onCancel={() => setNewDocOpen(false)}
          onCreate={startNewDoc}
        />
      )}

      {prefsOpen && (
        <Preferences
          initialTab={prefsTab}
          settings={settings}
          onChange={patchSettings}
          onClose={() => setPrefsOpen(false)}
          onReplayTour={() => {
            setPrefsOpen(false)
            setTourOpen(true)
          }}
          updater={updater.state}
          onCheckUpdate={() => updater.check(false)}
          onProbe={() => updater.probe()}
          onDownload={() => void updater.download()}
          onInstall={() => void updater.install()}
          onToast={toast}
        />
      )}

      {tourOpen && (
        <Onboarding
          onDone={() => {
            patchSettings({ onboarded: true })
            setTourOpen(false)
          }}
        />
      )}

      {updateOpen && updater.state.result?.hasUpdate && (
        <UpdateDialog
          result={updater.state.result}
          downloading={updater.state.downloading}
          received={updater.state.received}
          total={updater.state.total}
          mirror={updater.state.mirror}
          filePath={updater.state.filePath}
          error={updater.state.error}
          onDownload={() => void updater.download()}
          onInstall={() => void updater.install()}
          onLater={() => setUpdateOpen(false)}
          onSkipVersion={() => {
            patchSettings({ updateSkip: updater.state.result?.latest ?? '' })
            setUpdateOpen(false)
            toast('这个版本不再提醒')
          }}
          onMute={() => {
            patchSettings({ updateMuted: true, updateAuto: false })
            setUpdateOpen(false)
            toast('已关闭更新提醒，可在设置里重新打开')
          }}
          onClose={() => setUpdateOpen(false)}
        />
      )}

      {shortcutsOpen && <Shortcuts onClose={() => setShortcutsOpen(false)} />}

      {state.galleryOpen && (
        <TemplateGallery
          scene={state.doc.scene}
          file={state.file}
          onPick={(t) => void loadTemplate(t)}
          onClose={() => dispatch({ type: 'gallery', open: false })}
        />
      )}

      {state.paletteOpen && (
        <CommandPalette items={paletteItems} onClose={() => dispatch({ type: 'palette', open: false })} />
      )}

      {state.textbookOpen && (
        <Textbook onClose={() => dispatch({ type: 'textbook', open: false })} />
      )}


      {/* 演示者模式：全屏画布上的悬浮条（计时 / 镜头翻页 / 投影增强） */}
      {presenter.on && (
        <div className="presenter" data-tick={presenterTick}>
          <span className="presenter__timer">{formatClock(presenterSeconds)}</span>
          <span className="presenter__sep" />
          <button className="presenter__btn" onClick={() => jumpSlide(-1)}>
            ← 上一镜头
          </button>
          <button className="presenter__btn" onClick={() => jumpSlide(1)}>
            下一镜头 →
            {slides.length > 0 ? ' ' + (slideIndex + 1) + '/' + slides.length : ''}
          </button>
          <button className="presenter__btn" onClick={captureSlide}>
            记视角
          </button>
          <button
            className="presenter__btn"
            data-active={presenter.boost}
            onClick={() => setPresenter((p) => ({ ...p, boost: !p.boost }))}
          >
            投影增强
          </button>
          <span className="presenter__hint">PageUp / PageDown 翻镜头 · B 增强 · Esc 退出</span>
          <button className="presenter__btn" onClick={stopPresenter}>
            退出演示
          </button>
        </div>
      )}

      {/* 全局演示工具：聚光灯 / 放大镜（任何模式都能用） */}
      {!lobbyOpen && <PresentTools tool={presentTool} onClose={() => setPresentTool(null)} />}

      {/* 版本历史 */}
      {historyOpen && (
        <div className="histdlg" role="dialog" aria-modal="true" aria-label="版本历史">
          <div className="histdlg__panel">
            <div className="histdlg__head">
              <div>
                <h2>版本历史</h2>
                <p>
                  {state.filePath
                    ? '当前文件保存前的快照（每个文件最多保留 20 份）'
                    : '当前是还没保存到磁盘的新课件，暂无历史'}
                </p>
              </div>
              <button
                className="histdlg__close"
                onClick={() => setHistoryOpen(false)}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            <div className="histdlg__list">
              {historyLoading ? (
                <div className="histdlg__empty">正在读取…</div>
              ) : historyItems.length === 0 ? (
                <div className="histdlg__empty">
                  还没有历史版本。第一次覆盖保存后，旧版本会出现在这里，可以随时恢复。
                </div>
              ) : (
                historyItems.map((item) => (
                  <div className="histdlg__item" key={item.path}>
                    <span className="histdlg__main">
                      <b>{item.name}</b>
                      <span>
                        {new Date(item.at).toLocaleString()} ·{' '}
                        {Math.max(1, Math.round(item.size / 1024))} KB
                      </span>
                    </span>
                    <button onClick={() => void restoreHistory(item.path)}>恢复</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 拖拽 .chordot 到窗口 */}
      {dropActive && <div className="dropcue">松开鼠标打开 .chordot 课件</div>}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  )
}
