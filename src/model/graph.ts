import { buildObjects, sketchBuilders, type Overrides } from './scenes'
import type { GeoObj } from './types'
import type { SceneSpec, SimState, Solution } from '../kernel/types'

/**
 * 依赖图 + 增量重算。
 *
 * 草图里的每个对象都声明自己依赖哪些点（线段依赖两端点、圆依赖圆心、多边形依赖全部顶点）。
 * 拖动一个点时只有依赖它的对象需要重建，其余对象直接复用上一帧的引用——
 * 引用稳定后 React 的 diff 会跳过整棵子树，这是比"重建快"更值钱的部分。
 */

export interface BuildStats {
  mode: 'full' | 'incremental'
  total: number
  rebuilt: number
  reused: number
  changedPoints: number
  reason?: string
}

export interface BuildCache {
  sceneKind: string
  structureKey: string
  overrideKey: string
  objects: GeoObj[]
  deps: Map<string, string[]>
  rev: Map<string, string[]>
  points: Record<string, { x: number; y: number }>
  circles: Record<string, number>
}

export function emptyCache(): BuildCache {
  return {
    sceneKind: '',
    structureKey: '',
    overrideKey: '',
    objects: [],
    deps: new Map(),
    rev: new Map(),
    points: {},
    circles: {},
  }
}

function overrideKeyOf(overrides: Overrides): string {
  return JSON.stringify([overrides.hidden, overrides.names, overrides.preview ?? 0])
}

/** 文档结构签名：增删对象或改变引用关系时必须全量重建 */
function structureKeyOf(scene: SceneSpec): string {
  if (scene.kind !== 'sketch') return scene.kind
  const d = scene.doc
  return JSON.stringify([
    d.points.map((p) => [p.id, p.name ?? '', p.fixed ? 1 : 0]),
    d.segments.map((s) => [s.id, s.a, s.b]),
    d.circles.map((c) => [c.id, c.c, c.r]),
    d.polygons.map((g) => [g.id, g.points]),
    d.functions.map((f) => [f.id, f.expr, f.name ?? '']),
    // 力不是「由点推出来」的对象，改动直接算结构变化
    (d.forces ?? []).map((f) => [f.id, f.name, f.expr, f.kind, f.angle, f.at[0], f.at[1]]),
  ])
}

function applyOverrides(list: GeoObj[], overrides: Overrides): GeoObj[] {
  return list.map((o) => ({
    ...o,
    name: overrides.names[o.id] ?? o.name,
    visible: overrides.hidden[o.id] ? false : o.visible,
  }))
}

const EPS = 1e-7

export function buildIncremental(
  scene: SceneSpec,
  solution: Solution,
  overrides: Overrides,
  sim: SimState | null,
  cache: BuildCache,
): { objects: GeoObj[]; stats: BuildStats; cache: BuildCache } {
  const overrideKey = overrideKeyOf(overrides)
  const structureKey = structureKeyOf(scene)

  const full = (reason: string): { objects: GeoObj[]; stats: BuildStats; cache: BuildCache } => {
    const objects = buildObjects(scene, solution, overrides, sim)
    const next: BuildCache = {
      sceneKind: scene.kind,
      structureKey,
      overrideKey,
      objects,
      deps: new Map(),
      rev: new Map(),
      points: { ...solution.points },
      circles: { ...(solution.circles ?? {}) },
    }
    if (scene.kind === 'sketch') {
      for (const b of sketchBuilders(scene.doc, solution, overrides.preview ?? 0)) {
        next.deps.set(b.id, b.deps)
        for (const p of b.deps) {
          const list = next.rev.get(p) ?? []
          list.push(b.id)
          next.rev.set(p, list)
        }
      }
    }
    return {
      objects,
      stats: {
        mode: 'full',
        total: objects.length,
        rebuilt: objects.length,
        reused: 0,
        changedPoints: 0,
        reason,
      },
      cache: next,
    }
  }

  // 非草图场景对象很少（<10），且没有点依赖，全量即可
  if (scene.kind !== 'sketch' || sim) return full('not-sketch')

  const structuralChange =
    cache.sceneKind !== scene.kind ||
    cache.structureKey !== structureKey ||
    cache.overrideKey !== overrideKey

  if (structuralChange || cache.objects.length === 0) {
    return full(
      cache.sceneKind !== scene.kind
        ? 'kind'
        : cache.structureKey !== structureKey
          ? 'structure'
          : cache.overrideKey !== overrideKey
            ? 'overrides'
            : 'empty-cache',
    )
  }

  // 找出坐标变化的点
  const changed = new Set<string>()
  for (const [id, p] of Object.entries(solution.points)) {
    const prev = cache.points[id]
    if (!prev || Math.abs(prev.x - p.x) > EPS || Math.abs(prev.y - p.y) > EPS) changed.add(id)
  }
  for (const id of Object.keys(cache.points)) {
    if (!solution.points[id]) changed.add(id)
  }
  // 圆半径变化（相切约束会改半径）也要重建该圆
  const changedCircles = new Set<string>()
  for (const [id, r] of Object.entries(solution.circles ?? {})) {
    const prev = cache.circles[id]
    if (prev === undefined || Math.abs(prev - r) > EPS) changedCircles.add(id)
  }

  if (changed.size === 0 && changedCircles.size === 0) {
    return {
      objects: cache.objects,
      stats: {
        mode: 'incremental',
        total: cache.objects.length,
        rebuilt: 0,
        reused: cache.objects.length,
        changedPoints: 0,
      },
      cache,
    }
  }

  const dirty = new Set<string>()
  for (const p of changed) {
    for (const oid of cache.rev.get(p) ?? []) dirty.add(oid)
  }
  // 函数曲线不依赖点，但采样结果可能随解算更新：始终重建
  const builders = sketchBuilders(scene.doc, solution, overrides.preview ?? 0)
  const prevById = new Map(cache.objects.map((o) => [o.id, o]))

  let rebuilt = 0
  let reused = 0
  const raw: GeoObj[] = []
  const nextDeps = new Map<string, string[]>()
  const nextRev = new Map<string, string[]>()

  for (const b of builders) {
    nextDeps.set(b.id, b.deps)
    for (const p of b.deps) {
      const list = nextRev.get(p) ?? []
      list.push(b.id)
      nextRev.set(p, list)
    }

    const cached = prevById.get(b.id)
    const isDirty = dirty.has(b.id) || changedCircles.has(b.id) || b.deps.length === 0
    if (!isDirty && cached) {
      // 复用的对象上一帧已经套过 overrides（overrideKey 相等是走增量路径的前提）
      raw.push(cached)
      reused += 1
    } else {
      raw.push(applyOverrides([b.make()], overrides)[0])
      rebuilt += 1
    }
  }

  const objects = raw
  const next: BuildCache = {
    sceneKind: scene.kind,
    structureKey,
    overrideKey,
    objects,
    deps: nextDeps,
    rev: nextRev,
    points: { ...solution.points },
    circles: { ...(solution.circles ?? {}) },
  }

  return {
    objects,
    stats: { mode: 'incremental', total: objects.length, rebuilt, reused, changedPoints: changed.size },
    cache: next,
  }
}

/** 供验证脚本读取最近一次重算统计 */
export function exposeStats(stats: BuildStats) {
  ;(window as unknown as { __buildStats?: BuildStats }).__buildStats = stats
}
