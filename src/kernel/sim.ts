import { INCLINE } from './scene'
import type { InclineParams, SimState } from './types'

const DEG = Math.PI / 180
/** 固定子步长：1/480 s，保证数值解可与解析解对照 */
const SUBSTEP = 1 / 480

/**
 * 斜面滑块动力学（velocity-Verlet）
 *
 * 沿斜面建一维坐标 x：原点在底端 A，+x 指向 B（上坡）。
 * 重力沿坡分量 -g·sinθ，摩擦力始终与速度反向。
 */
export class InclineSim {
  private params: InclineParams
  private x: number
  private v = 0
  private time = 0
  private acc: number
  private ended = false
  private carry = 0

  constructor(params: InclineParams) {
    this.params = params
    this.x = params.t * INCLINE.length
    this.acc = this.accel(this.x, this.v)
  }

  private get g() {
    return INCLINE.g
  }

  private get theta() {
    return this.params.angleDeg * DEG
  }

  /** 是否处于滑动状态：静止时需要判断静摩擦能否维持 */
  private isSliding(v: number): boolean {
    const staticMax = this.params.mu * this.g * Math.cos(this.theta)
    const drive = this.g * Math.sin(this.theta)
    if (Math.abs(v) > 1e-6) return true
    return drive > staticMax
  }

  private accel(_x: number, v: number): number {
    const sin = Math.sin(this.theta)
    const cos = Math.cos(this.theta)
    const sliding = this.isSliding(v)
    if (!sliding) return 0
    const dir = v > 1e-6 ? 1 : v < -1e-6 ? -1 : -1 // 静止起步时向下滑
    return -this.g * sin - dir * this.params.mu * this.g * cos
  }

  /** 推进一步（毫秒），内部按固定子步长积分 */
  advance(dtMs: number): SimState {
    if (this.ended) return this.state()
    this.carry += Math.min(dtMs, 100) / 1000

    while (this.carry >= SUBSTEP) {
      this.carry -= SUBSTEP
      const h = SUBSTEP
      const a0 = this.acc
      // velocity-Verlet
      const xNext = this.x + this.v * h + 0.5 * a0 * h * h
      const vHalf = this.v + 0.5 * a0 * h
      const a1 = this.accel(xNext, vHalf)
      const vNext = vHalf + 0.5 * a1 * h

      this.x = xNext
      this.v = vNext
      this.acc = a1
      this.time += h

      // 触底 / 越界：停住，不回弹
      if (this.x <= 0) {
        this.x = 0
        this.v = 0
        this.acc = 0
        this.ended = true
        break
      }
      if (this.x >= INCLINE.length) {
        this.x = INCLINE.length
        this.v = 0
        this.acc = 0
        this.ended = true
        break
      }
      // 静止且无法启动：停住
      if (Math.abs(this.v) < 1e-4 && !this.isSliding(0)) {
        this.v = 0
        this.acc = 0
      }
    }

    return this.state()
  }

  reset(): SimState {
    this.x = this.params.t * INCLINE.length
    this.v = 0
    this.time = 0
    this.ended = false
    this.carry = 0
    this.acc = this.accel(this.x, this.v)
    return this.state()
  }

  state(): SimState {
    const sliding = this.isSliding(this.v)
    const normal = this.params.mass * this.g * Math.cos(this.theta)
    const friction = sliding
      ? this.params.mu * normal
      : this.params.mass * this.g * Math.sin(this.theta)
    return {
      time: this.time,
      x: this.x,
      v: this.v,
      a: this.acc,
      gravity: this.params.mass * this.g,
      normal,
      friction,
      sliding,
      ended: this.ended,
    }
  }
}
