import type { KernelRequest, KernelResponse, SceneSpec, SimState, Solution } from './types'

export interface KernelResult {
  ok: boolean
  solution: Solution
  error?: string
}

type ReqBody =
  | {
      op: 'solve'
      scene: SceneSpec
      drag?: { id: string; x: number; y: number }
      movable?: string[]
    }
  | { op: 'sim-start'; scene: SceneSpec }
  | { op: 'sim-advance'; dt: number }
  | { op: 'sim-reset' }

/** 内核客户端：一次只保持一个在途请求，拖动时用最新一帧覆盖待发帧 */
export class KernelClient {
  private worker: Worker
  private seq = 0
  private pending = new Map<number, (res: KernelResponse) => void>()

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (e: MessageEvent<KernelResponse>) => {
      const cb = this.pending.get(e.data.id)
      if (!cb) return
      this.pending.delete(e.data.id)
      cb(e.data)
    }
  }

  private send(body: ReqBody): Promise<KernelResponse> {
    const id = ++this.seq
    return new Promise((resolve) => {
      this.pending.set(id, resolve)
      this.worker.postMessage({ id, ...body } as KernelRequest)
    })
  }

  async solve(
    scene: SceneSpec,
    drag?: { id: string; x: number; y: number },
    movable?: string[],
  ): Promise<KernelResult> {
    const res = await this.send({ op: 'solve', scene, drag, movable })
    return {
      ok: res.ok,
      solution: (res.solution ?? res.fallback)!,
      error: res.error,
    }
  }

  async simStart(scene: SceneSpec): Promise<SimState | null> {
    const res = await this.send({ op: 'sim-start', scene })
    return res.sim ?? null
  }

  async simAdvance(dt: number): Promise<SimState | null> {
    const res = await this.send({ op: 'sim-advance', dt })
    return res.sim ?? null
  }

  async simReset(): Promise<SimState | null> {
    const res = await this.send({ op: 'sim-reset' })
    return res.sim ?? null
  }

  dispose() {
    this.worker.terminate()
    this.pending.clear()
  }
}
