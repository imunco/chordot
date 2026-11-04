import type { MotionParams, SimState } from './types'

const DEG = Math.PI / 180
/** 固定子步长：1/480 s */
const SUBSTEP = 1 / 480
const TRAIL_MAX = 160

/**
 * 通用动力学：单摆 / 弹簧振子 / 抛体
 *
 * 全部用 velocity-Verlet 积分，子步长固定，便于与解析解对照：
 * - 单摆  θ'' = −(g/L)·sinθ − b·θ'
 * - 弹簧  x'' = −(k/m)·x − b·x'
 * - 抛体  a = (0, −g)
 */
export class MotionSim {
  private params: MotionParams
  private time = 0
  private carry = 0
  private ended = false
  private trail: [number, number][] = []
  private trailClock = 0

  /** 单摆状态 */
  private theta = 0
  private omega = 0
  /** 弹簧状态 */
  private sx = 0
  private sv = 0
  /** 抛体状态 */
  private px = 0
  private py = 0
  private pvx = 0
  private pvy = 0

  constructor(params: MotionParams) {
    this.params = params
    this.reset()
  }

  reset(): SimState {
    this.time = 0
    this.carry = 0
    this.ended = false
    this.trail = []
    this.trailClock = 0
    const p = this.params

    if (p.model === 'pendulum') {
      this.theta = p.angle0 * DEG
      this.omega = 0
    } else if (p.model === 'spring') {
      this.sx = p.amplitude
      this.sv = 0
    } else {
      this.px = -5
      this.py = p.height
      this.pvx = p.speed * Math.cos(p.launch * DEG)
      this.pvy = p.speed * Math.sin(p.launch * DEG)
    }
    this.pushTrail()
    return this.state()
  }

  private pushTrail() {
    const pos = this.position()
    this.trail.push([pos.x, pos.y])
    if (this.trail.length > TRAIL_MAX) this.trail.shift()
  }

  /** 世界坐标位置 */
  private position(): { x: number; y: number } {
    const p = this.params
    if (p.model === 'pendulum') {
      return { x: PIVOT.x + p.length * Math.sin(this.theta), y: PIVOT.y - p.length * Math.cos(this.theta) }
    }
    if (p.model === 'spring') {
      return { x: this.sx, y: BLOCK_Y }
    }
    return { x: this.px, y: this.py }
  }

  private step(h: number) {
    const p = this.params
    const b = p.damping

    if (p.model === 'pendulum') {
      const acc = (th: number, om: number) => -(p.gravity / p.length) * Math.sin(th) - b * om
      const a0 = acc(this.theta, this.omega)
      const thNext = this.theta + this.omega * h + 0.5 * a0 * h * h
      const omHalf = this.omega + 0.5 * a0 * h
      const a1 = acc(thNext, omHalf)
      this.theta = thNext
      this.omega = omHalf + 0.5 * a1 * h
      return
    }

    if (p.model === 'spring') {
      const acc = (x: number, v: number) => -(p.stiffness / p.mass) * x - b * v
      const a0 = acc(this.sx, this.sv)
      const xNext = this.sx + this.sv * h + 0.5 * a0 * h * h
      const vHalf = this.sv + 0.5 * a0 * h
      const a1 = acc(xNext, vHalf)
      this.sx = xNext
      this.sv = vHalf + 0.5 * a1 * h
      return
    }

    // 抛体：恒定重力
    this.px += this.pvx * h
    this.py += this.pvy * h + 0.5 * -p.gravity * h * h
    this.pvy += -p.gravity * h
    if (this.py <= 0) {
      this.py = 0
      this.pvx = 0
      this.pvy = 0
      this.ended = true
    }
  }

  advance(dtMs: number): SimState {
    if (this.ended) return this.state()
    this.carry += Math.min(dtMs, 100) / 1000

    while (this.carry >= SUBSTEP && !this.ended) {
      this.carry -= SUBSTEP
      this.step(SUBSTEP)
      this.time += SUBSTEP
      this.trailClock += SUBSTEP
      if (this.trailClock >= 0.02) {
        this.trailClock = 0
        this.pushTrail()
      }
    }
    return this.state()
  }

  private energy(): { kinetic: number; potential: number; total: number } {
    const p = this.params
    if (p.model === 'pendulum') {
      const v = p.length * this.omega
      const kinetic = 0.5 * p.mass * v * v
      const potential = p.mass * p.gravity * p.length * (1 - Math.cos(this.theta))
      return { kinetic, potential, total: kinetic + potential }
    }
    if (p.model === 'spring') {
      const kinetic = 0.5 * p.mass * this.sv * this.sv
      const potential = 0.5 * p.stiffness * this.sx * this.sx
      return { kinetic, potential, total: kinetic + potential }
    }
    const kinetic = 0.5 * p.mass * (this.pvx * this.pvx + this.pvy * this.pvy)
    const potential = p.mass * p.gravity * this.py
    return { kinetic, potential, total: kinetic + potential }
  }

  state(): SimState {
    const p = this.params
    const pos = this.position()
    const e = this.energy()

    if (p.model === 'pendulum') {
      return {
        time: this.time,
        x: pos.x,
        y: pos.y,
        // 面板上的「速度 v」是摆球线速度 = |ω|·L，角速度另有 omega 字段
        v: Math.abs(this.omega) * p.length,
        vx: this.omega * p.length * Math.cos(this.theta),
        vy: this.omega * p.length * Math.sin(this.theta),
        a: -(p.gravity / p.length) * Math.sin(this.theta),
        theta: this.theta,
        omega: this.omega,
        energy: e,
        trail: this.trail,
        ended: this.ended,
      }
    }
    if (p.model === 'spring') {
      return {
        time: this.time,
        x: this.sx,
        y: BLOCK_Y,
        v: this.sv,
        vx: this.sv,
        vy: 0,
        a: -(p.stiffness / p.mass) * this.sx,
        energy: e,
        trail: this.trail,
        ended: this.ended,
      }
    }
    return {
      time: this.time,
      x: this.px,
      y: this.py,
      v: Math.hypot(this.pvx, this.pvy),
      vx: this.pvx,
      vy: this.pvy,
      a: -p.gravity,
      energy: e,
      trail: this.trail,
      ended: this.ended,
    }
  }
}

/* 场景布局常量（渲染层共用） */
export const PIVOT = { x: 0, y: 2.6 }
export const BLOCK_Y = 0.6
export const WALL_X = -4.8
