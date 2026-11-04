/// <reference lib="webworker" />
import { GcsWrapper, init_planegcs_module, SolveStatus } from '@salusoft89/planegcs'
import type { SketchPrimitive } from '@salusoft89/planegcs'
import wasmUrl from '@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url'
import { solveScene, triangleConflict } from './scene'
import { InclineSim } from './sim'
import { MotionSim } from './motion'
import type {
  KernelRequest,
  KernelResponse,
  Pt,
  SceneSpec,
  SimState,
  SketchDoc,
  Solution,
} from './types'

const ctx = self as unknown as {
  postMessage: (msg: KernelResponse) => void
  onmessage: ((e: MessageEvent<KernelRequest>) => void) | null
}

interface Simulator {
  advance(dtMs: number): SimState
  reset(): SimState
  state(): SimState
}

let sim: Simulator | null = null

let gcs: GcsWrapper | null = null
let booting: Promise<GcsWrapper | null> | null = null

async function getSolver(): Promise<GcsWrapper | null> {
  if (gcs) return gcs
  if (!booting) {
    booting = (async () => {
      const mod = await init_planegcs_module({ locateFile: () => wasmUrl })
      gcs = new GcsWrapper(new mod.GcsSystem(), mod)
      return gcs
    })().catch((err) => {
      console.error('[kernel] planegcs 初始化失败', err)
      return null
    })
  }
  return booting
}

function solveTriangle(
  solver: GcsWrapper,
  scene: Extract<SceneSpec, { kind: 'triangle' }>,
  drag?: { id: string; x: number; y: number },
): Solution {
  const t0 = performance.now()
  const conflict = triangleConflict(scene.params)
  if (conflict) {
    const points: Record<string, Pt> = {}
    for (const p of scene.params.points) points[p.id] = { x: p.x, y: p.y }
    return { points, status: 'conflict', conflict, ms: 0, source: 'wasm' }
  }

  const seed = scene.params.points.map((p) =>
    drag && p.id === drag.id ? { ...p, x: drag.x, y: drag.y } : p,
  )
  // 锚点：取第一个未被拖动的点，消除整体平移自由度
  const anchor = seed.find((p) => !drag || p.id !== drag.id) ?? seed[0]

  solver.clear_data()
  const primitives: SketchPrimitive[] = seed.map((p) => ({
    id: p.id,
    type: 'point',
    x: p.x,
    y: p.y,
    fixed: p.id === anchor.id,
  }))
  solver.push_primitives_and_params(primitives)

  for (const l of scene.params.lengths) {
    solver.push_primitive({
      id: `d:${l.a}:${l.b}`,
      type: 'p2p_distance',
      p1_id: l.a,
      p2_id: l.b,
      distance: l.d,
    })
  }

  const status = solver.solve()
  solver.apply_solution()

  const points: Record<string, Pt> = {}
  for (const p of seed) {
    const prim = solver.sketch_index.get_primitive(p.id)
    if (prim && prim.type === 'point') {
      points[p.id] = { x: prim.x, y: prim.y }
    } else {
      points[p.id] = { x: p.x, y: p.y }
    }
  }

  // 同上：把锚点拉回原位，消除整体漂移
  const anchorAfter = points[anchor.id]
  if (anchorAfter) {
    const dx = anchor.x - anchorAfter.x
    const dy = anchor.y - anchorAfter.y
    if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) {
      for (const k of Object.keys(points)) {
        points[k] = { x: points[k].x + dx, y: points[k].y + dy }
      }
    }
  }

  return {
    points,
    status:
      status === SolveStatus.Success || status === SolveStatus.Converged
        ? 'ok'
        : status === SolveStatus.SuccessfulSolutionInvalid
          ? 'conflict'
          : 'failed',
    ms: performance.now() - t0,
    source: 'wasm',
  }
}

const CONSTRAINT_MAP: Record<string, string> = {
  horizontal: 'horizontal_l',
  vertical: 'vertical_l',
  equal: 'equal_length',
  parallel: 'parallel',
  perpendicular: 'perpendicular_ll',
  'on-line': 'point_on_line_pl',
  midpoint: 'midpoint',
  tangent: 'tangent_lc',
}

/** 带约束的草图：线段 + 约束交给 planegcs */
function solveSketch(
  solver: GcsWrapper,
  doc: SketchDoc,
  drag?: { id: string; x: number; y: number },
  movable?: string[],
): Solution {
  const t0 = performance.now()
  const seed = doc.points.map((p) =>
    drag && p.id === drag.id ? { ...p, x: drag.x, y: drag.y } : p,
  )
  // 加约束时只放开参与本次约束的点，其余点钉死在当前位置，避免无关图形漂移
  const loose = movable && movable.length > 0 ? new Set(movable) : null
  // 锚点仍然要留一个：全部点都参与时若完全自由，整张图会带着平移一起漂
  const anchor = loose
    ? (seed.find((p) => !loose.has(p.id)) ?? seed[0])
    : (seed.find((p) => !drag || p.id !== drag.id) ?? seed[0])

  solver.clear_data()
  const ids = new Set(seed.map((p) => p.id))

  const circleIds = new Set<string>()
  for (const c of doc.constraints ?? []) {
    for (const cid of c.circles ?? []) circleIds.add(cid)
  }

  solver.push_primitives_and_params([
    ...seed.map((p) => ({
      id: p.id,
      type: 'point' as const,
      x: p.x,
      y: p.y,
      fixed: p.id === anchor.id || (loose ? !loose.has(p.id) : false),
    })),
    ...doc.circles
      .filter((c) => circleIds.has(c.id) && ids.has(c.c))
      .map((c) => ({ id: c.id, type: 'circle' as const, c_id: c.c, radius: c.r })),
  ])
  for (const seg of doc.segments) {
    if (!ids.has(seg.a) || !ids.has(seg.b)) continue
    solver.push_primitive({ id: seg.id, type: 'line', p1_id: seg.a, p2_id: seg.b })
  }

  for (const c of doc.constraints ?? []) {
    const type = CONSTRAINT_MAP[c.type]
    if (!type) continue
    if (c.type === 'midpoint') {
      // 中点 = 到两端等距 + 落在该线段上（planegcs 没有「点即中点」原语）
      const pid = c.points?.[0]
      const lid = c.lines[0]
      const seg = doc.segments.find((s) => s.id === lid)
      if (!pid || !seg || !ids.has(pid)) continue
      solver.push_primitive({ id: `m1:${c.id}`, type: 'line', p1_id: pid, p2_id: seg.a })
      solver.push_primitive({ id: `m2:${c.id}`, type: 'line', p1_id: pid, p2_id: seg.b })
      solver.push_primitive({ id: `me:${c.id}`, type: 'equal_length', l1_id: `m1:${c.id}`, l2_id: `m2:${c.id}` })
      solver.push_primitive({ id: `mo:${c.id}`, type: 'point_on_line_pl', p_id: pid, l_id: lid })
      continue
    }
    if (c.type === 'tangent') {
      const lid = c.lines[0]
      const cid = c.circles?.[0]
      if (!lid || !cid) continue
      // 半径锁成当前值，让圆「移动」去相切，而不是「变大」去相切
      const circle = doc.circles.find((q) => q.id === cid)
      if (circle) {
        solver.push_primitive({
          id: `r:${c.id}`,
          type: 'circle_radius',
          c_id: cid,
          radius: circle.r,
          driving: true,
        })
      }
      solver.push_primitive({ id: c.id, type: 'tangent_lc', l_id: lid, c_id: cid, driving: true })
      continue
    }
    if (c.type === 'on-line') {
      const pid = c.points?.[0]
      const lid = c.lines[0]
      if (!pid || !lid || !ids.has(pid)) continue
      solver.push_primitive({ id: c.id, type: 'point_on_line_pl', p_id: pid, l_id: lid })
      continue
    }
    if (c.lines.length === 1 && (c.type === 'horizontal' || c.type === 'vertical')) {
      solver.push_primitive({ id: c.id, type: type as 'horizontal_l', l_id: c.lines[0] })
    } else if (c.lines.length === 2) {
      solver.push_primitive({
        id: c.id,
        type: type as 'equal_length',
        l1_id: c.lines[0],
        l2_id: c.lines[1],
      })
    }
  }

  // 相切这类非线性约束迭代一次常留残差，连解两次更稳
  let status = solver.solve()
  solver.apply_solution()
  if (status === SolveStatus.Success || status === SolveStatus.Converged) {
    status = solver.solve()
    solver.apply_solution()
  }

  const points: Record<string, Pt> = {}
  for (const p of seed) {
    const prim = solver.sketch_index.get_primitive(p.id)
    points[p.id] = prim && prim.type === 'point' ? { x: prim.x, y: prim.y } : { x: p.x, y: p.y }
  }

  const circles: Record<string, number> = {}
  for (const id of circleIds) {
    const prim = solver.sketch_index.get_primitive(id)
    if (prim && prim.type === 'circle') circles[id] = prim.radius
  }

  // planegcs 的 fixed 不总是锁住整体平移：显式把锚点拉回原位，其余点跟着平移
  const anchorAfter = points[anchor.id]
  if (anchorAfter) {
    const dx = anchor.x - anchorAfter.x
    const dy = anchor.y - anchorAfter.y
    if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) {
      for (const k of Object.keys(points)) {
        points[k] = { x: points[k].x + dx, y: points[k].y + dy }
      }
    }
  }

  return {
    points,
    circles: Object.keys(circles).length > 0 ? circles : undefined,
    anchor: anchor.id,
    status:
      status === SolveStatus.Success || status === SolveStatus.Converged
        ? 'ok'
        : status === SolveStatus.SuccessfulSolutionInvalid
          ? 'conflict'
          : 'failed',
    conflict:
      status === SolveStatus.Success || status === SolveStatus.Converged
        ? undefined
        : { ids: seed.map((p) => p.id), reason: '这些约束互相矛盾，无法同时满足' },
    ms: performance.now() - t0,
    source: 'wasm',
  }
}

ctx.onmessage = async (e: MessageEvent<KernelRequest>) => {
  const req = e.data

  /* ───────── 运动仿真 ───────── */
  if (req.op === 'sim-start') {
    if (req.scene.kind === 'incline') {
      sim = new InclineSim(req.scene.params)
    } else if (req.scene.kind === 'motion') {
      sim = new MotionSim(req.scene.params)
    } else {
      ctx.postMessage({ id: req.id, ok: false, error: '当前课件不支持运动仿真' })
      return
    }
    ctx.postMessage({ id: req.id, ok: true, sim: sim.state() })
    return
  }
  if (req.op === 'sim-advance') {
    if (!sim) {
      ctx.postMessage({ id: req.id, ok: false, error: '仿真尚未开始' })
      return
    }
    ctx.postMessage({ id: req.id, ok: true, sim: sim.advance(req.dt) })
    return
  }
  if (req.op === 'sim-reset') {
    if (!sim) {
      ctx.postMessage({ id: req.id, ok: false, error: '仿真尚未开始' })
      return
    }
    ctx.postMessage({ id: req.id, ok: true, sim: sim.reset() })
    return
  }

  try {
    if (req.scene.kind === 'sketch' && (req.scene.doc.constraints?.length ?? 0) > 0) {
      const solver = await getSolver()
      if (!solver) {
        ctx.postMessage({ id: req.id, ok: false, error: 'planegcs 不可用', fallback: solveScene(req.scene) })
        return
      }
      ctx.postMessage({
        id: req.id,
        ok: true,
        solution: solveSketch(solver, req.scene.doc, req.drag, req.movable),
      })
      return
    }
    if (req.scene.kind === 'triangle') {
      const solver = await getSolver()
      if (!solver) {
        ctx.postMessage({ id: req.id, ok: false, error: 'planegcs 不可用', fallback: solveScene(req.scene) })
        return
      }
      const solution = solveTriangle(solver, req.scene, req.drag)
      ctx.postMessage({ id: req.id, ok: true, solution })
      return
    }
    ctx.postMessage({ id: req.id, ok: true, solution: solveScene(req.scene) })
  } catch (err) {
    ctx.postMessage({
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      fallback: solveScene(req.scene),
    })
  }
}
