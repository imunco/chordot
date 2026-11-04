import { solveScene } from './kernel/scene'
import { nextCurveColor } from './model/palette'
import { shapeById } from './data/shapes'
import { emptySketch } from './kernel/types'
import type {
  MotionModel,
  SolidShape,
  MotionParams,
  Pt,
  SceneSpec,
  SimState,
  SketchConstraint,
  SketchDoc,
  SketchForce,
  Solution,
  Stroke,
} from './kernel/types'
import type { Mode, SubState } from './model/types'

export type ToolId =
  | 'select'
  | 'point'
  | 'line'
  | 'circle'
  | 'polygon'
  | 'curve'
  | 'force'
  | 'pen'
  | 'eraser'
  | 'constraint'
  | 'decompose'
  | 'force'

export type SceneKind = SceneSpec['kind']

/** 课件文档：几何参数是唯一真相，画面由内核解算结果派生 */
export interface Doc {
  scene: SceneSpec
  hidden: Record<string, boolean>
  names: Record<string, string>
  deleted: string[]
  /** 手绘批注 */
  strokes?: Stroke[]
}

export interface State {
  file: string
  filePath: string | null
  doc: Doc
  solution: Solution
  past: Doc[]
  future: Doc[]
  selected: string[]
  dirty: boolean
  mode: Mode
  subState: SubState
  tool: ToolId
  grid: boolean
  rightOpen: boolean
  leftWidth: number
  zoom: number
  /** 画布平移（屏幕像素） */
  pan: { x: number; y: number }
  paletteOpen: boolean
  padOpen: boolean
  galleryOpen: boolean
  shapesOpen: boolean
  /** 每次整份文档被换掉（新建 / 打开 / 套模板）时 +1，用于自动适配视图 */
  fitToken: number
  canvas: { w: number; h: number }
  /** 拖动中的点，用于内核请求 */
  drag: { id: string; x: number; y: number } | null
  dragBase: Doc | null
  /** 构造工具已拾取的点 id */
  picks: string[]
  /** 已打开正交分解的力矢量 id */
  decomposed: string[]
  /** 运动仿真当前帧 */
  sim: SimState | null
  playing: boolean
  stopped: boolean
  /** 变力预览的自变量取值 */
  forcePreview: number
  /** 画笔颜色与粗细 */
  penColor: string
  penWidth: number
  /** 物理世界是否在跑 */
  physicsPlaying: boolean
  /** 物理世界已经跑过的秒数 */
  physicsTime: number
  /** 上一次求解来源与耗时 */
  lastSource: Solution['source'] | null
  lastMs: number
  solveError: string | null
}

export type Action =
  | {
      type: 'solution'
      solution: Solution
      source: Solution['source']
      ms: number
      error?: string
      /** 加约束后的解算：把解算坐标写回文档，作为下一次拖动的初值 */
      syncDoc?: boolean
    }
  | { type: 'drag-start'; id: string; x: number; y: number }
  | { type: 'drag-move'; x: number; y: number }
  | { type: 'drag-scene'; scene: SceneSpec }
  | { type: 'drag-point'; id: string; x: number; y: number }
  | { type: 'drag-end' }
  | { type: 'construct-click'; p: Pt; snapId?: string; keepTool?: boolean }
  | { type: 'construct-cancel' }
  | { type: 'decompose'; id: string }
  | { type: 'sim'; state: SimState }
  | { type: 'sim-clear' }
  | { type: 'sim-play' }
  | { type: 'sim-pause' }
  | { type: 'sim-stop' }
  | { type: 'add-function'; expr: string }
  | { type: 'edit-function'; id: string; expr: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'select'; ids: string[] }
  | { type: 'toggle-visible'; id: string }
  | { type: 'rename'; id: string; name: string }
  | { type: 'mode'; mode: Mode }
  | { type: 'substate'; sub: SubState }
  | { type: 'tool'; tool: ToolId }
  | { type: 'grid' }
  | { type: 'right'; open: boolean }
  | { type: 'left-width'; width: number }
  | { type: 'zoom'; zoom: number }
  | { type: 'pan'; pan: { x: number; y: number } }
  | { type: 'palette'; open: boolean }
  | { type: 'pad'; open: boolean }
  | { type: 'gallery'; open: boolean }
  | { type: 'shapes'; open: boolean }
  | { type: 'canvas'; w: number; h: number }
  | { type: 'scene'; scene: SceneSpec; file: string }
  | { type: 'saved'; path: string; file: string }
  | { type: 'scene-patch'; scene: SceneSpec }
  | { type: 'insert-shape'; shapeId: string; at: [number, number] }
  | { type: 'add-solid-shape'; shape: SolidShape }
  | { type: 'physics-frame'; bodies: { id: string; position: [number, number, number]; quaternion: [number, number, number, number] }[] }
  | { type: 'physics-reset'; shapes: SolidShape[] }
  | { type: 'drag-points'; moves: { id: string; x: number; y: number }[] }
  | { type: 'stroke-add'; stroke: Stroke }
  | { type: 'stroke-erase'; id: string }
  | { type: 'strokes-clear' }
  | { type: 'pen'; color?: string; width?: number }
  | { type: 'physics-play'; playing: boolean }
  | { type: 'physics-time'; time: number }
  | { type: 'duplicate'; ids: string[] }
  | { type: 'set-color'; id: string; color: string }
  | { type: 'add-force'; force: SketchForce }
  | { type: 'patch-force'; id: string; patch: Partial<SketchForce> }
  | { type: 'force-preview'; value: number }
  | { type: 'add-constraint'; constraint: SketchConstraint }
  | { type: 'remove-constraint'; id: string }
  | { type: 'opened'; doc: Doc; file: string; path: string }
  | { type: 'delete' }

const HISTORY_LIMIT = 50

export function inclineScene(angleDeg = 30, t = 0.52, mass = 3, mu = 0.8): SceneSpec {
  return { kind: 'incline', params: { angleDeg, t, mass, mu } }
}

export function sketchScene(): SceneSpec {
  return { kind: 'sketch', doc: emptySketch() }
}

/** 下滑演示：40°、μ=0.15，物块从靠近顶端处自由下滑 */
export function inclineSlideScene(): SceneSpec {
  return { kind: 'incline', params: { angleDeg: 40, t: 0.92, mass: 3, mu: 0.15 } }
}

export function triangleScene(): SceneSpec {
  return {
    kind: 'triangle',
    params: {
      points: [
        { id: 'A', x: -3, y: -1.5 },
        { id: 'B', x: 3, y: -1.5 },
        { id: 'C', x: -0.75, y: 1.807 },
      ],
      lengths: [
        { a: 'A', b: 'B', d: 6 },
        { a: 'B', b: 'C', d: 5 },
        { a: 'C', b: 'A', d: 4 },
      ],
    },
  }
}

/** 约束冲突演示：6 / 1 / 1 围不成三角形 */
export function conflictScene(): SceneSpec {
  return {
    kind: 'triangle',
    params: {
      points: [
        { id: 'A', x: -3, y: -1 },
        { id: 'B', x: 3, y: -1 },
        { id: 'C', x: 0, y: 2 },
      ],
      lengths: [
        { a: 'A', b: 'B', d: 6 },
        { a: 'B', b: 'C', d: 1 },
        { a: 'C', b: 'A', d: 1 },
      ],
    },
  }
}

function motion(params: Partial<MotionParams> & { model: MotionModel }): SceneSpec {
  return {
    kind: 'motion',
    params: {
      gravity: 10,
      damping: 0,
      length: 2.4,
      angle0: 40,
      stiffness: 20,
      mass: 1,
      amplitude: 2,
      speed: 8,
      launch: 45,
      height: 0,
      ...params,
    },
  }
}

export function pendulumScene(): SceneSpec {
  return motion({ model: 'pendulum' })
}

export function springScene(): SceneSpec {
  return motion({ model: 'spring' })
}

export function projectileScene(): SceneSpec {
  return motion({ model: 'projectile' })
}

/** 三维斜面受力示例 */
export function solidInclineScene(angleDeg = 30, mass = 3, mu = 0.5): SceneSpec {
  return {
    kind: 'solidIncline',
    params: {
      angleDeg,
      mass,
      mu,
      decompose: true,
      camera: {
        azimuth: 42,
        elevation: 30,
        zoom: 1,
        view: 'free',
        perspective: true,
        dist: 18,
      },
    },
  }
}

/** 三维示例：单个正方体，等轴测起手 */
export function solidScene(): SceneSpec {
  return {
    kind: 'solid',
    params: {
      // 立方体坐在基准面上（z = 半边长），不然一半埋进地面
      shapes: [{ id: 's1', name: '正方体', type: 'cube', center: [0, 0, 2], size: 4 }],
      camera: { azimuth: 45, elevation: 25, zoom: 1, view: 'free', perspective: true, dist: 14 },
    },
  }
}

const initialScene: SceneSpec = { kind: 'sketch', doc: emptySketch() }

export const initialState: State = {
  file: '未命名.chordot',
  filePath: null,
  doc: { scene: initialScene, hidden: {}, names: {}, deleted: [] },
  solution: solveScene(initialScene),
  past: [],
  future: [],
  selected: [],
  dirty: false,
  mode: 'math',
  subState: 'statics',
  tool: 'select',
  grid: true,
  rightOpen: false,
  leftWidth: 240,
  zoom: 1,
  pan: { x: 0, y: 0 },
  paletteOpen: false,
  padOpen: false,
  galleryOpen: false,
  fitToken: 0,
  shapesOpen: false,
  canvas: { w: 800, h: 600 },
  drag: null,
  dragBase: null,
  picks: [],
  decomposed: [],
  sim: null,
  playing: false,
  stopped: false,
  forcePreview: 0,
  penColor: '#9a5b4a',
  penWidth: 2.5,
  physicsPlaying: true,
  physicsTime: 0,
  lastSource: null,
  lastMs: 0,
  solveError: null,
}

function pushHistory(state: State, doc: Doc): Doc[] {
  return [...state.past, doc].slice(-HISTORY_LIMIT)
}

function withDoc(state: State, doc: Doc, extra: Partial<State> = {}): State {
  return {
    ...state,
    doc,
    past: pushHistory(state, state.doc),
    future: [],
    dirty: true,
    ...extra,
  }
}

/** 提交一次几何改动：入栈并同步重算画面 */
function commitScene(state: State, scene: SceneSpec, extra: Partial<State> = {}): State {
  return withDoc(state, { ...state.doc, scene }, { solution: solveScene(scene), ...extra })
}

/** 草图内唯一 id */
function uid(doc: SketchDoc, prefix: string): string {
  const taken = new Set<string>([
    ...doc.points.map((o) => o.id),
    ...doc.segments.map((o) => o.id),
    ...doc.circles.map((o) => o.id),
    ...doc.polygons.map((o) => o.id),
    ...doc.functions.map((o) => o.id),
  ])
  let n = 1
  while (taken.has(`${prefix}${n}`)) n++
  return `${prefix}${n}`
}

/** 点的显示名：A…Z，之后 A2…Z2 */
function nextPointName(doc: SketchDoc): string {
  const used = new Set(doc.points.map((p) => p.name ?? ''))
  for (let round = 1; round < 10; round++) {
    for (let i = 0; i < 26; i++) {
      const name = String.fromCharCode(65 + i) + (round === 1 ? '' : round)
      if (!used.has(name)) return name
    }
  }
  return `P${doc.points.length + 1}`
}

function nextFunctionName(doc: SketchDoc): string {
  const used = new Set(doc.functions.map((f) => f.name ?? ''))
  let n = 1
  while (used.has(`f${n}`)) n++
  return `f${n}`
}

/** 三角形解算后把坐标写回 scene，作为下一次拖动的初值 */
function reseedScene(scene: SceneSpec, solution: Solution): SceneSpec {
  if (scene.kind !== 'triangle') return scene
  return {
    kind: 'triangle',
    params: {
      ...scene.params,
      points: scene.params.points.map((p) => ({
        ...p,
        x: solution.points[p.id]?.x ?? p.x,
        y: solution.points[p.id]?.y ?? p.y,
      })),
    },
  }
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'solution': {
      let solution = action.solution
      // planegcs 会带着整体平移一起解：把锚点拉回文档位置，画面才不会整张跳走
      const scene = state.doc.scene
      if (solution.anchor && scene.kind === 'sketch') {
        const base = scene.doc.points.find((p) => p.id === solution.anchor)
        const solved = solution.points[solution.anchor]
        if (base && solved) {
          const dx = base.x - solved.x
          const dy = base.y - solved.y
          if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) {
            const points: Record<string, { x: number; y: number }> = {}
            for (const k of Object.keys(solution.points)) {
              points[k] = { x: solution.points[k].x + dx, y: solution.points[k].y + dy }
            }
            solution = { ...solution, points }
          }
        }
      }
      let doc = { ...state.doc, scene: reseedScene(state.doc.scene, solution) }
      // 加约束后把解算坐标写回文档：下一次拖动的初值必须是画面上的位置，否则会跳回去
      if (action.syncDoc && solution.status === 'ok' && doc.scene.kind === 'sketch') {
        const solved = solution.points
        doc = {
          ...doc,
          scene: {
            kind: 'sketch',
            doc: {
              ...doc.scene.doc,
              points: doc.scene.doc.points.map((p) =>
                solved[p.id] ? { ...p, x: solved[p.id].x, y: solved[p.id].y } : p,
              ),
            },
          },
        }
      }
      // 相切等约束会改变圆半径，写回文档
      if (solution.circles && doc.scene.kind === 'sketch') {
        const radii = solution.circles
        doc = {
          ...doc,
          scene: {
            kind: 'sketch',
            doc: {
              ...doc.scene.doc,
              circles: doc.scene.doc.circles.map((c) =>
                radii[c.id] !== undefined ? { ...c, r: radii[c.id] } : c,
              ),
            },
          },
        }
      }
      return {
        ...state,
        doc,
        solution,
        lastSource: action.source,
        lastMs: action.ms,
        solveError: action.error ?? null,
      }
    }

    case 'drag-start':
      return { ...state, drag: { id: action.id, x: action.x, y: action.y }, dragBase: state.doc }

    case 'drag-move':
      return state.drag ? { ...state, drag: { ...state.drag, x: action.x, y: action.y } } : state

    /** 拖动中只改几何参数，画面等内核回包再切换（不本地预演，避免双份数值） */
    case 'drag-scene':
      return { ...state, doc: { ...state.doc, scene: action.scene } }

    /** 草图点拖动：坐标是作者数据，直接改文档，无需内核回包 */
    case 'drag-point': {
      const scene = state.doc.scene
      if (scene.kind !== 'sketch') return state
      const doc: SketchDoc = {
        ...scene.doc,
        points: scene.doc.points.map((p) =>
          p.id === action.id ? { ...p, x: action.x, y: action.y } : p,
        ),
      }
      const next: SceneSpec = { kind: 'sketch', doc }
      return { ...state, doc: { ...state.doc, scene: next }, solution: solveScene(next) }
    }

    /** 整组平移：一次挪动一组点（拖动多边形/线段/圆的本体） */
    case 'drag-points': {
      const scene = state.doc.scene
      if (scene.kind !== 'sketch') return state
      const byId = new Map(action.moves.map((m) => [m.id, m]))
      const doc: SketchDoc = {
        ...scene.doc,
        points: scene.doc.points.map((p) => {
          const m = byId.get(p.id)
          return m ? { ...p, x: m.x, y: m.y } : p
        }),
      }
      const next: SceneSpec = { kind: 'sketch', doc }
      return { ...state, doc: { ...state.doc, scene: next }, solution: solveScene(next) }
    }

    /* ───────── 构造工具 ───────── */
    case 'construct-click': {
      const scene = state.doc.scene
      if (scene.kind !== 'sketch') return state
      const doc = scene.doc
      const p = action.p
      const tool = state.tool
      const snap = action.snapId
      const first = state.picks[0]

      const addPoint = (d: SketchDoc, id?: string): SketchDoc =>
        id
          ? d
          : {
              ...d,
              points: [
                ...d.points,
                { id: uid(d, 'p'), x: p.x, y: p.y, name: nextPointName(d) },
              ],
            }
      const pointId = (d: SketchDoc, id?: string) =>
        id ?? d.points[d.points.length - 1].id

      if (tool === 'point') {
        if (snap) return { ...state, selected: [snap] }
        const next = addPoint(doc)
        const created = next.points[next.points.length - 1].id
        return commitScene(state, { kind: 'sketch', doc: next }, {
          selected: [created],
          tool: action.keepTool ? state.tool : 'select',
        })
      }

      if (!first) {
        const next = addPoint(doc, snap)
        const id = pointId(next, snap)
        return commitScene(state, { kind: 'sketch', doc: next }, { picks: [id], selected: [id] })
      }

      if (tool === 'line') {
        if (snap && snap === first) return state
        const next = addPoint(doc, snap)
        const id = pointId(next, snap)
        const withSeg: SketchDoc = {
          ...next,
          segments: [...next.segments, { id: uid(next, 's'), a: first, b: id }],
        }
        return commitScene(state, { kind: 'sketch', doc: withSeg }, {
          picks: [],
          selected: [],
          tool: action.keepTool ? state.tool : 'select',
        })
      }

      if (tool === 'circle') {
        const center = doc.points.find((q) => q.id === first)
        if (!center) return { ...state, picks: [] }
        const r = Math.hypot(p.x - center.x, p.y - center.y)
        if (r < 0.2) return state
        const next: SketchDoc = { ...doc, circles: [...doc.circles, { id: uid(doc, 'c'), c: first, r }] }
        return commitScene(state, { kind: 'sketch', doc: next }, {
          picks: [],
          selected: [],
          tool: action.keepTool ? state.tool : 'select',
        })
      }

      if (tool === 'polygon') {
        if (snap && snap === first && state.picks.length >= 3) {
          const next: SketchDoc = {
            ...doc,
            polygons: [...doc.polygons, { id: uid(doc, 'g'), points: state.picks }],
          }
          return commitScene(state, { kind: 'sketch', doc: next }, {
            picks: [],
            selected: [],
            tool: 'select',
          })
        }
        if (snap && state.picks.includes(snap)) return state
        const next = addPoint(doc, snap)
        const id = pointId(next, snap)
        return commitScene(state, { kind: 'sketch', doc: next }, {
          picks: [...state.picks, id],
          selected: [id],
        })
      }

      return state
    }

    case 'edit-function': {
      const scene = state.doc.scene
      if (scene.kind !== 'sketch') return state
      const doc: SketchDoc = {
        ...scene.doc,
        functions: scene.doc.functions.map((f) =>
          f.id === action.id ? { ...f, expr: action.expr } : f,
        ),
      }
      return commitScene(state, { kind: 'sketch', doc })
    }

    case 'stroke-add': {
      const strokes = [...(state.doc.strokes ?? []), action.stroke]
      return {
        ...state,
        doc: { ...state.doc, strokes },
        past: pushHistory(state, state.doc),
        future: [],
        dirty: true,
      }
    }

    case 'stroke-erase': {
      const strokes = (state.doc.strokes ?? []).filter((s) => s.id !== action.id)
      return {
        ...state,
        doc: { ...state.doc, strokes },
        past: pushHistory(state, state.doc),
        future: [],
        dirty: true,
      }
    }

    case 'strokes-clear': {
      if ((state.doc.strokes ?? []).length === 0) return state
      return {
        ...state,
        doc: { ...state.doc, strokes: [] },
        past: pushHistory(state, state.doc),
        future: [],
        dirty: true,
      }
    }

    case 'pen':
      return {
        ...state,
        penColor: action.color ?? state.penColor,
        penWidth: action.width ?? state.penWidth,
      }

    case 'physics-play':
      return { ...state, physicsPlaying: action.playing }

    case 'physics-time':
      return { ...state, physicsTime: action.time }

    /** 物理世界每帧写回位置与姿态：不进撤销栈，只更新画面 */
    case 'physics-frame': {
      const scene = state.doc.scene
      if (scene.kind !== 'solid') return state
      const byId = new Map(action.bodies.map((b) => [b.id, b]))
      const shapes = scene.params.shapes.map((sh) => {
        const b = byId.get(sh.id)
        return b ? { ...sh, center: b.position, rotation: b.quaternion } : sh
      })
      return {
        ...state,
        doc: { ...state.doc, scene: { kind: 'solid', params: { ...scene.params, shapes } } },
      }
    }

    /** 关掉物理世界时还原到摆放位置 */
    case 'physics-reset': {
      const scene = state.doc.scene
      if (scene.kind !== 'solid') return state
      return {
        ...state,
        doc: {
          ...state.doc,
          scene: {
            kind: 'solid',
            params: { ...scene.params, shapes: action.shapes.map((sh) => ({ ...sh })) },
          },
        },
      }
    }

    /** 往三维场景里追加一个立体 */
    case 'add-solid-shape': {
      const scene = state.doc.scene
      if (scene.kind !== 'solid') return state
      const next: SceneSpec = {
        kind: 'solid',
        params: { ...scene.params, shapes: [...scene.params.shapes, action.shape] },
      }
      return commitScene(state, next, { selected: [action.shape.id] })
    }

    /** 从图形库拖进来的教具 */
    case 'insert-shape': {
      const scene = state.doc.scene
      if (scene.kind !== 'sketch') return state
      const def = shapeById(action.shapeId)
      if (!def) return state
      const doc = scene.doc
      const taken = new Set<string>([
        ...doc.points.map((o) => o.id),
        ...doc.segments.map((o) => o.id),
        ...doc.circles.map((o) => o.id),
        ...doc.polygons.map((o) => o.id),
        ...doc.functions.map((o) => o.id),
        ...(doc.forces ?? []).map((o) => o.id),
      ])
      const mk = (prefix: string) => {
        let i = 1
        while (taken.has(`${prefix}${i}`)) i += 1
        const id = `${prefix}${i}`
        taken.add(id)
        return id
      }
      const usedNames = new Set(doc.points.map((p) => p.name ?? ''))
      const name = () => {
        for (let round = 1; round < 10; round++) {
          for (let i = 0; i < 26; i++) {
            const n = String.fromCharCode(65 + i) + (round === 1 ? '' : round)
            if (!usedNames.has(n)) {
              usedNames.add(n)
              return n
            }
          }
        }
        return `P${usedNames.size + 1}`
      }

      const part = def.build()
      const map = new Map<string, string>()
      const newIds: string[] = []
      const [dx, dy] = action.at

      const points = part.points.map((p) => {
        const id = mk('p')
        map.set(p.id, id)
        newIds.push(id)
        return { id, x: p.x + dx, y: p.y + dy, name: p.name ? name() : name() }
      })
      const segments = part.segments.map((sg) => {
        const id = mk('s')
        newIds.push(id)
        return { id, a: map.get(sg.a) ?? sg.a, b: map.get(sg.b) ?? sg.b }
      })
      const circles = part.circles.map((c) => {
        const id = mk('c')
        newIds.push(id)
        return { id, c: map.get(c.c) ?? c.c, r: c.r }
      })
      const polygons = part.polygons.map((g) => {
        const id = mk('g')
        newIds.push(id)
        return { id, points: g.points.map((pid) => map.get(pid) ?? pid) }
      })

      const next: SketchDoc = {
        ...doc,
        points: [...doc.points, ...points],
        segments: [...doc.segments, ...segments],
        circles: [...doc.circles, ...circles],
        polygons: [...doc.polygons, ...polygons],
      }
      return commitScene(state, { kind: 'sketch', doc: next }, { selected: newIds })
    }

    /** 复制选中的对象，整体往右下挪一点，名称加撇 */
    case 'duplicate': {
      const scene = state.doc.scene
      if (scene.kind !== 'sketch' || action.ids.length === 0) return state
      const doc = scene.doc
      const sel = new Set(action.ids)
      const taken = new Set<string>([
        ...doc.points.map((o) => o.id),
        ...doc.segments.map((o) => o.id),
        ...doc.circles.map((o) => o.id),
        ...doc.polygons.map((o) => o.id),
        ...doc.functions.map((o) => o.id),
        ...(doc.forces ?? []).map((o) => o.id),
      ])
      const mk = (prefix: string) => {
        let i = 1
        while (taken.has(`${prefix}${i}`)) i += 1
        const id = `${prefix}${i}`
        taken.add(id)
        return id
      }
      const prime = (name?: string) => (name ? `${name}′` : name)
      const DX = 0.7
      const DY = -0.7

      const map = new Map<string, string>()
      const newIds: string[] = []

      const points = doc.points
        .filter((p) => sel.has(p.id))
        .map((p) => {
          const id = mk('p')
          map.set(p.id, id)
          newIds.push(id)
          return { ...p, id, x: p.x + DX, y: p.y + DY, name: prime(p.name) }
        })

      const segments = doc.segments
        .filter((seg) => sel.has(seg.id))
        .map((seg) => {
          const id = mk('s')
          newIds.push(id)
          return { ...seg, id, a: map.get(seg.a) ?? seg.a, b: map.get(seg.b) ?? seg.b }
        })

      const circles = doc.circles
        .filter((c) => sel.has(c.id))
        .map((c) => {
          const id = mk('c')
          newIds.push(id)
          return { ...c, id, c: map.get(c.c) ?? c.c }
        })

      const polygons = doc.polygons
        .filter((g) => sel.has(g.id))
        .map((g) => {
          const id = mk('g')
          newIds.push(id)
          return { ...g, id, points: g.points.map((pid) => map.get(pid) ?? pid) }
        })

      const functions = doc.functions
        .filter((f) => sel.has(f.id))
        .map((f) => {
          const id = mk('fn')
          newIds.push(id)
          return {
            ...f,
            id,
            name: f.name ? `${f.name}′` : f.name,
            color: nextCurveColor(doc.functions.map((q) => q.color ?? '')),
          }
        })

      const forces = (doc.forces ?? [])
        .filter((f) => sel.has(f.id))
        .map((f) => {
          const id = mk('F')
          newIds.push(id)
          return { ...f, id, name: `${f.name}′`, at: [f.at[0] + DX, f.at[1] + DY] as [number, number] }
        })

      if (newIds.length === 0) return state
      const next: SketchDoc = {
        ...doc,
        points: [...doc.points, ...points],
        segments: [...doc.segments, ...segments],
        circles: [...doc.circles, ...circles],
        polygons: [...doc.polygons, ...polygons],
        functions: [...doc.functions, ...functions],
        forces: [...(doc.forces ?? []), ...forces],
      }
      return commitScene(state, { kind: 'sketch', doc: next }, { selected: newIds })
    }

    /** 改单个对象颜色（曲线/力用来区分） */
    case 'set-color': {
      const scene = state.doc.scene
      if (scene.kind !== 'sketch') return state
      const doc: SketchDoc = {
        ...scene.doc,
        functions: scene.doc.functions.map((f) =>
          f.id === action.id ? { ...f, color: action.color } : f,
        ),
      }
      return commitScene(state, { kind: 'sketch', doc })
    }

    /** 新增一个手工力矢量 */
    case 'add-force': {
      const scene = state.doc.scene
      if (scene.kind !== 'sketch') return state
      const doc: SketchDoc = { ...scene.doc, forces: [...(scene.doc.forces ?? []), action.force] }
      return commitScene(state, { kind: 'sketch', doc }, { selected: [action.force.id], tool: 'select' })
    }

    /** 改力的表达式 / 方向 / 类型：入撤销栈 */
    case 'patch-force': {
      const scene = state.doc.scene
      if (scene.kind !== 'sketch') return state
      const doc: SketchDoc = {
        ...scene.doc,
        forces: (scene.doc.forces ?? []).map((f) =>
          f.id === action.id ? { ...f, ...action.patch } : f,
        ),
      }
      return commitScene(state, { kind: 'sketch', doc })
    }

    /** 变力预览：只改显示，不进撤销栈 */
    case 'force-preview':
      return { ...state, forcePreview: action.value }

    case 'add-constraint': {
      const scene = state.doc.scene
      if (scene.kind !== 'sketch') return state
      const doc: SketchDoc = {
        ...scene.doc,
        constraints: [...(scene.doc.constraints ?? []), action.constraint],
      }
      return commitScene(state, { kind: 'sketch', doc }, { selected: [] })
    }

    case 'remove-constraint': {
      const scene = state.doc.scene
      if (scene.kind !== 'sketch') return state
      const doc: SketchDoc = {
        ...scene.doc,
        constraints: (scene.doc.constraints ?? []).filter((c) => c.id !== action.id),
      }
      return commitScene(state, { kind: 'sketch', doc })
    }

    case 'construct-cancel':
      return { ...state, picks: [], tool: 'select' }

    case 'sim':
      return { ...state, sim: action.state, playing: !action.state.ended, stopped: false }

    case 'sim-clear':
      return { ...state, sim: null, playing: false, stopped: false }

    case 'sim-play':
      return { ...state, playing: true, stopped: false }

    case 'sim-pause':
      return { ...state, playing: false }

    case 'sim-stop':
      return { ...state, playing: false, stopped: true }

    case 'decompose':
      return {
        ...state,
        decomposed: state.decomposed.includes(action.id)
          ? state.decomposed.filter((id) => id !== action.id)
          : [...state.decomposed, action.id],
      }

    case 'add-function': {
      const scene = state.doc.scene
      if (scene.kind !== 'sketch') return state
      const expr = action.expr.trim()
      if (!expr) return state
      const id = uid(scene.doc, 'fn')
      const doc: SketchDoc = {
        ...scene.doc,
        functions: [
          ...scene.doc.functions,
          {
            id,
            expr,
            name: nextFunctionName(scene.doc),
            // 多条曲线同屏时靠颜色区分
            color: nextCurveColor(scene.doc.functions.map((f) => f.color ?? '')),
          },
        ],
      }
      return commitScene(state, { kind: 'sketch', doc }, { selected: [id] })
    }

    case 'drag-end': {
      if (!state.dragBase) return { ...state, drag: null }
      const changed = JSON.stringify(state.dragBase) !== JSON.stringify(state.doc)
      return {
        ...state,
        drag: null,
        dragBase: null,
        past: changed ? pushHistory(state, state.dragBase) : state.past,
        future: changed ? [] : state.future,
        dirty: changed ? true : state.dirty,
      }
    }

    case 'undo': {
      const prev = state.past[state.past.length - 1]
      if (!prev) return state
      return {
        ...state,
        doc: prev,
        solution: solveScene(prev.scene),
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future].slice(0, HISTORY_LIMIT),
        dirty: true,
      }
    }

    case 'redo': {
      const next = state.future[0]
      if (!next) return state
      return {
        ...state,
        doc: next,
        solution: solveScene(next.scene),
        past: pushHistory(state, state.doc),
        future: state.future.slice(1),
        dirty: true,
      }
    }

    case 'select':
      return { ...state, selected: action.ids }

    case 'toggle-visible':
      return withDoc(state, {
        ...state.doc,
        hidden: { ...state.doc.hidden, [action.id]: !state.doc.hidden[action.id] },
      })

    case 'rename':
      return withDoc(state, { ...state.doc, names: { ...state.doc.names, [action.id]: action.name } })

    case 'mode':
      return {
        ...state,
        mode: action.mode,
        subState: action.mode === 'physics' ? 'statics' : state.subState,
        tool: 'select',
        selected: [],
        picks: [],
      }

    case 'substate':
      return { ...state, subState: action.sub, sim: null, playing: false, stopped: false }

    case 'tool':
      return { ...state, tool: action.tool, picks: [] }

    case 'grid':
      return { ...state, grid: !state.grid }

    case 'right':
      return { ...state, rightOpen: action.open }

    case 'left-width':
      return { ...state, leftWidth: Math.min(320, Math.max(200, action.width)) }

    case 'zoom':
      return { ...state, zoom: Math.min(4, Math.max(0.3, action.zoom)) }

    case 'pan':
      return { ...state, pan: action.pan }

    case 'palette':
      return { ...state, paletteOpen: action.open }

    case 'pad':
      return { ...state, padOpen: action.open }

    case 'gallery':
      return { ...state, galleryOpen: action.open }

    case 'shapes':
      return { ...state, shapesOpen: action.open }

    case 'canvas':
      return { ...state, canvas: { w: action.w, h: action.h } }

    case 'scene': {
      const doc: Doc = { scene: action.scene, hidden: {}, names: {}, deleted: [] }
      return {
        ...state,
        doc,
        file: action.file,
        // 新建/示例没有落盘路径，保存时必须重新选择位置
        filePath: null,
        solution: solveScene(action.scene),
        past: pushHistory(state, state.doc),
        future: [],
        selected: [],
        // 新建/加载示例是已知来源，未编辑前不算未保存修改
        dirty: false,
        mode:
          action.scene.kind === 'incline' || action.scene.kind === 'motion' ? 'physics' : 'math',
        // 动力学样例直接进运动学面板，否则用户找不到「播放」
        subState: action.scene.kind === 'motion' ? 'kinematics' : 'statics',
        fitToken: state.fitToken + 1,
        tool: 'select',
        picks: [],
        decomposed: [],
        sim: null,
        playing: false,
        stopped: false,
        zoom: 1,
        solveError: null,
        lastSource: null,
      }
    }

    /** 改场景参数：入栈、重算，并停掉正在跑的仿真 */
    case 'scene-patch':
      return commitScene(state, action.scene, { sim: null, playing: false, stopped: false })

    case 'saved':
      return { ...state, filePath: action.path, file: action.file, dirty: false }

    case 'opened': {
      return {
        ...state,
        doc: action.doc,
        file: action.file,
        filePath: action.path,
        solution: solveScene(action.doc.scene),
        past: [],
        future: [],
        selected: [],
        picks: [],
        decomposed: [],
        sim: null,
        playing: false,
        stopped: false,
        dirty: false,
        mode:
          action.doc.scene.kind === 'incline' || action.doc.scene.kind === 'motion'
            ? 'physics'
            : 'math',
        subState: action.doc.scene.kind === 'motion' ? 'kinematics' : 'statics',
        fitToken: state.fitToken + 1,
        tool: 'select',
        zoom: 1,
        solveError: null,
        lastSource: null,
      }
    }

    case 'delete': {
      if (state.selected.length === 0) return state
      const scene = state.doc.scene

      // 草图里删除要真正移除几何，否则解算时又会长回来
      if (scene.kind === 'sketch') {
        const gone = new Set(state.selected)
        // 删点会连带删掉引用它的线段 / 圆 / 多边形
        const doc: SketchDoc = {
          points: scene.doc.points.filter((p) => !gone.has(p.id)),
          segments: scene.doc.segments.filter((s) => !gone.has(s.id) && !gone.has(s.a) && !gone.has(s.b)),
          circles: scene.doc.circles.filter((c) => !gone.has(c.id) && !gone.has(c.c)),
          polygons: scene.doc.polygons.filter(
            (g) => !gone.has(g.id) && !g.points.some((id) => gone.has(id)),
          ),
          functions: scene.doc.functions.filter((f) => !gone.has(f.id)),
          // 引用已删线段的约束一并清掉
          constraints: (scene.doc.constraints ?? []).filter((c) => !c.lines.some((id) => gone.has(id))),
          forces: (scene.doc.forces ?? []).filter((f) => !gone.has(f.id)),
        }
        return commitScene(state, { kind: 'sketch', doc }, { selected: [] })
      }

      return withDoc(
        state,
        { ...state.doc, deleted: [...state.doc.deleted, ...state.selected] },
        { selected: [] },
      )
    }

    default:
      return state
  }
}
