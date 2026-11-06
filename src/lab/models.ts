import type { LabExperiment, LabModel, LabParams, Reading } from './types'

/**
 * 每个演示台的「物理模型」。
 *
 * 全部是 (参数, 时间) → 读数 + 几何 的纯函数：
 * - 不做逐帧积分，暂停 / 拖动 / 换参数都能得到同一套数值
 * - 读数直接来自解析式，和教材公式一一对应，不会出现「动画对、数字错」
 */

const DEG = Math.PI / 180
const G = 9.8

const num = (p: LabParams, k: string, d: number): number => {
  const v = p[k]
  return typeof v === 'number' && Number.isFinite(v) ? v : d
}
const str = (p: LabParams, k: string, d: string): string => {
  const v = p[k]
  return typeof v === 'string' ? v : d
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const short = (v: number) => (Number.isInteger(v) ? String(v) : f(v, 1))
const sci = (v: number, d = 2): string => {
  if (!Number.isFinite(v) || v === 0) return '0'
  const e = Math.floor(Math.log10(Math.abs(v)))
  const m = v / 10 ** e
  const sup = String(e)
    .replace('-', '⁻')
    .replace(/\d/g, (ch) => SUP[Number(ch)])
  return `${m.toFixed(d)}×10${sup}`
}
const lin = (a: number, b: number, n: number): number[] =>
  Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n)
const R = (label: string, value: string, unit?: string, hint?: string, tone?: Reading['tone']): Reading => ({
  label,
  value,
  unit,
  hint,
  tone,
})

/** 材料电阻率（Ω·m） */
const RHO: Record<string, { rho: number; name: string }> = {
  cu: { rho: 1.7e-8, name: '铜' },
  al: { rho: 2.9e-8, name: '铝' },
  fe: { rho: 1.0e-7, name: '铁' },
  constantan: { rho: 5.0e-7, name: '康铜' },
  nicr: { rho: 1.1e-6, name: '镍铬合金' },
}

export function labModel(exp: LabExperiment, p: LabParams, t: number): LabModel {
  switch (exp.stage) {
    /* ───────── 纸带 / 小车速度 ───────── */
    case 'track': {
      const v0 = num(p, 'v0', 0.3)
      const a = num(p, 'a', 0.8)
      const T = 0.02
      const tMax = 3.2
      const tt = Math.min(t % 4.4, tMax)
      const pos = v0 * tt + 0.5 * a * tt * tt
      const v = v0 + a * tt
      const dots = Math.min(70, Math.floor(tt / T) + 1)
      return {
        readings: [
          R('时间 t', f(tt, 2), 's', undefined, 'accent'),
          R('位移 s', f(pos, 3), 'm'),
          R('速度 v', f(v, 3), 'm/s', 'v = v₀ + at'),
          R('加速度 a', f(a, 2), 'm/s²', 'v-t 图线的斜率'),
          R('打点周期 T', '0.02', 's', '50 Hz 交流电'),
          R('已打点数', String(dots), '个', '每 0.02 s 一个点'),
        ],
        chart: {
          title: exp.chartTitle ?? 'v-t 图像',
          xLabel: 't / s',
          yLabel: 'v / (m·s⁻¹)',
          xRange: [0, tMax],
          yRange: [0, Math.max(1, v0 + a * tMax) * 1.12],
          series: [{ pts: [[0, v0], [tMax, v0 + a * tMax]] }],
          cursor: [tt, v],
        },
        note: '纸带上每 0.02 s 留下一个点；用前后相邻两点算出的平均速度，就是中间时刻的瞬时速度。',
        formula: {
          expr: 'vₙ = (xₙ₊₁ − xₙ₋₁) / (2T)',
          // 分子是前后两点（相距 2T）的距离，不是整段位移
          sub: `= (${f(v * 2 * T * 100, 2)} cm ÷ 0.04 s) ≈ ${f(v, 2)} m/s`,
        },
        g: { pos, v, a, v0, tt, dots },
      }
    }

    /* ───────── 牛顿第二定律 ───────── */
    case 'cart': {
      const M = num(p, 'M', 0.5)
      const m = num(p, 'm', 0.05)
      const a = (m * G) / (M + m)
      const F = m * G
      const tension = M * a
      const tMax = 2.0
      const tt = Math.min(t % 2.8, tMax)
      const x = 0.5 * a * tt * tt
      const ratio = m / M
      return {
        readings: [
          R('小车质量 M', f(M, 2), 'kg'),
          R('槽码质量 m', f(m, 2), 'kg'),
          R('合力 F ≈ mg', f(F, 2), 'N', '需满足 m ≪ M', 'accent'),
          R('加速度 a', f(a, 3), 'm/s²', 'a = F/M'),
          R('绳张力 T', f(tension, 2), 'N', '略小于 mg'),
          R('m / M', f(ratio, 2), '', ratio > 0.2 ? '偏大，图线会弯曲' : '近似成立'),
        ],
        chart: {
          title: exp.chartTitle ?? 'a-F 图像',
          xLabel: 'F / N',
          yLabel: 'a / (m·s⁻²)',
          xRange: [0, 2],
          yRange: [0, 4.4],
          series: [
            { pts: [[0, 0], [2, 2 / M]], label: '理论直线' },
            { pts: [[F, a]], dots: true, color: '#9a5b4a', label: '本次数据' },
          ],
          cursor: [F, a],
        },
        note:
          ratio > 0.2
            ? '槽码质量已经不算「远小于」小车质量，绳张力明显小于 mg，a-F 图线会向下弯曲。'
            : '平衡摩擦力后，槽码重力近似等于小车所受合力；a-F 图线是过原点的直线。',
        formula: {
          expr: 'a = mg / (M + m)',
          sub: `= ${f(m, 2)}×9.8 ÷ (${f(M, 2)}+${f(m, 2)}) = ${f(a, 2)} m/s²`,
        },
        g: { x, a, F, M, m, ratio, tt },
      }
    }

    /* ───────── 胡克定律 ───────── */
    case 'spring': {
      const k = num(p, 'k', 20)
      const m = num(p, 'm', 0.1)
      const step = 1.1
      // 从 3 个钩码开始演示，画面一打开就接近实验中的中间状态
      const idx = clamp(Math.floor(((t + 2.2) % (step * 6)) / step) + 1, 1, 5)
      const F = idx * m * G
      const x = F / k
      const l0 = 0.12
      const pts: [number, number][] = [[0, 0]]
      for (let i = 1; i <= 5; i++) pts.push([(i * m * G) / k, i * m * G])
      return {
        readings: [
          R('钩码个数', String(idx), '个'),
          R('弹力 F', f(F, 2), 'N', 'F = 钩码总重', 'accent'),
          R('形变量 x', f(x * 100, 1), 'cm', 'x = l − l₀'),
          R('弹簧长度 l', f((l0 + x) * 100, 1), 'cm'),
          R('劲度系数 k', f(k, 1), 'N/m', 'F-x 图线斜率'),
          R('F / x', f(F / x, 1), 'N/m', '应为常数'),
        ],
        chart: {
          title: exp.chartTitle ?? 'F-x 图像',
          xLabel: 'x / cm',
          yLabel: 'F / N',
          xRange: [0, 25],
          yRange: [0, 10],
          series: [{ pts: pts.map(([xx, yy]) => [xx * 100, yy]) as [number, number][] }],
          cursor: [x * 100, F],
        },
        note: '在弹性限度内，F-x 图线是一条过原点的直线；斜率就是弹簧的劲度系数。',
        formula: { expr: 'F = kx', sub: `${f(F, 2)} N = ${f(k, 0)} N/m × ${f(x, 3)} m` },
        g: { k, m, idx, F, x, l0, l: l0 + x },
      }
    }

    /* ───────── 力的合成 ───────── */
    case 'vectors': {
      const f1 = num(p, 'f1', 3)
      const f2 = num(p, 'f2', 4)
      const ang = num(p, 'ang', 60)
      const rad = ang * DEG
      const F = Math.sqrt(f1 * f1 + f2 * f2 + 2 * f1 * f2 * Math.cos(rad))
      const phi = (Math.atan2(f2 * Math.sin(rad), f1 + f2 * Math.cos(rad)) * 180) / Math.PI
      const phase = (t % 6) / 6
      const curve: [number, number][] = lin(0, 180, 36).map((d) => [
        d,
        Math.sqrt(f1 * f1 + f2 * f2 + 2 * f1 * f2 * Math.cos(d * DEG)),
      ])
      return {
        readings: [
          R('分力 F₁', f(f1, 2), 'N'),
          R('分力 F₂', f(f2, 2), 'N'),
          R('夹角 θ', f(ang, 0), '°'),
          R('合力 F', f(F, 2), 'N', '平行四边形对角线', 'accent'),
          R('合力方向 φ', f(phi, 1), '°', '与 F₁ 的夹角'),
          R('合力范围', `${f(Math.abs(f1 - f2), 1)} ~ ${f(f1 + f2, 1)}`, 'N', '|F₁−F₂| ≤ F ≤ F₁+F₂'),
        ],
        chart: {
          title: exp.chartTitle ?? '合力随夹角的变化',
          xLabel: 'θ / °',
          yLabel: 'F / N',
          xRange: [0, 180],
          yRange: [0, f1 + f2 + 0.6],
          series: [{ pts: curve }],
          cursor: [ang, F],
          vline: 120,
        },
        note:
          ang > 120
            ? '夹角大于 120° 时，合力可能比任意一个分力都小。'
            : '以 F₁、F₂ 为邻边作平行四边形，对角线就是合力。',
        formula: {
          expr: 'F = √(F₁² + F₂² + 2F₁F₂cosθ)',
          sub: `= √(${short(f1)}² + ${short(f2)}² + 2×${short(f1)}×${short(f2)}×cos${f(ang, 0)}°) = ${f(F, 2)} N`,
        },
        g: { f1, f2, ang, F, phi, phase },
      }
    }

    /* ───────── 作用力与反作用力 ───────── */
    case 'reaction': {
      const F = num(p, 'f', 4)
      const tremor = Math.sin(t * 5.2) * 0.04
      const a = F + tremor
      return {
        readings: [
          R('A 对 B 的力', f(a, 2), 'N', '方向向右', 'accent'),
          R('B 对 A 的力', f(a, 2), 'N', '方向向左', 'accent'),
          R('两力夹角', '180', '°', '沿同一条直线'),
          R('作用对象', '两个物体', '', '不能求合力'),
          R('产生与消失', '同时', '', '性质相同'),
        ],
        chart: {
          title: exp.chartTitle ?? '两个测力计的示数',
          xLabel: 't / s',
          yLabel: 'F / N',
          xRange: [0, 6],
          yRange: [0, 9],
          series: [
            { pts: [[0, a], [6, a]], label: 'A 对 B' },
            { pts: [[0, a], [6, a]], dashed: true, color: '#9a5b4a', label: 'B 对 A' },
          ],
          cursor: [t % 6, a],
        },
        note: '两条图线完全重合：作用力与反作用力总是等大、反向、共线，但分别作用在两个物体上。',
        formula: { expr: 'F_AB = −F_BA', sub: `大小都是 ${f(a, 2)} N，方向相反` },
        g: { f: a, tremor },
      }
    }

    /* ───────── 平抛运动 ───────── */
    case 'projectile': {
      const v0 = num(p, 'v0', 4)
      const h = num(p, 'h', 1.25)
      const tEnd = Math.sqrt((2 * h) / G)
      const cycle = tEnd + 1.5
      const local = t % cycle
      const tt = Math.min(local, tEnd)
      const x = v0 * tt
      const y = Math.max(0, h - 0.5 * G * tt * tt)
      const vy = G * tt
      const v = Math.hypot(v0, vy)
      const traj: [number, number][] = lin(0, tEnd, 40).map((q) => [v0 * q, h - 0.5 * G * q * q])
      return {
        readings: [
          R('时间 t', f(tt, 3), 's', undefined, 'accent'),
          R('水平位移 x', f(x, 3), 'm', 'x = v₀t'),
          R('下落高度', f(h - y, 3), 'm', 'y = ½gt²'),
          R('水平速度 vₓ', f(v0, 2), 'm/s', '保持不变'),
          R('竖直速度 v_y', f(vy, 2), 'm/s', '向下'),
          R('合速度 v', f(v, 2), 'm/s'),
          R('飞行时间', f(tEnd, 3), 's', 't = √(2h/g)'),
          R('水平射程', f(v0 * tEnd, 3), 'm'),
        ],
        chart: {
          title: exp.chartTitle ?? '平抛轨迹',
          xLabel: 'x / m',
          yLabel: 'y / m',
          xRange: [0, Math.max(0.6, v0 * tEnd * 1.08)],
          yRange: [0, Math.max(0.4, h * 1.08)],
          series: [{ pts: traj }],
          cursor: [x, y],
        },
        note: '水平方向做匀速直线运动，竖直方向做自由落体运动；飞行时间只由高度决定。',
        formula: { expr: 'x = v₀t，y = ½gt²', sub: `t = √(2×${f(h, 2)}/9.8) = ${f(tEnd, 3)} s，射程 ${f(v0 * tEnd, 2)} m` },
        g: { x, y, vx: v0, vy, v, tt, tEnd, range: v0 * tEnd, h },
      }
    }

    /* ───────── 向心力 ───────── */
    case 'circular': {
      const m = num(p, 'm', 0.2)
      const r = num(p, 'r', 0.3)
      const w = num(p, 'w', 6)
      const th = (w * t) % (Math.PI * 2)
      const F = m * w * w * r
      const v = w * r
      const T = (2 * Math.PI) / w
      const an = w * w * r
      const curve: [number, number][] = lin(0, 144, 36).map((q) => [q, m * r * q])
      return {
        readings: [
          R('质量 m', f(m, 2), 'kg'),
          R('半径 r', f(r, 2), 'm'),
          R('角速度 ω', f(w, 1), 'rad/s'),
          R('线速度 v', f(v, 2), 'm/s', 'v = ωr'),
          R('周期 T', f(T, 3), 's', 'T = 2π/ω'),
          R('向心加速度 a', f(an, 2), 'm/s²', 'a = ω²r'),
          R('向心力 F', f(F, 2), 'N', 'F = mω²r', 'accent'),
        ],
        chart: {
          title: exp.chartTitle ?? 'F-ω² 图像',
          xLabel: 'ω² / (rad·s⁻¹)²',
          yLabel: 'F / N',
          xRange: [0, 144],
          yRange: [0, Math.max(2, m * r * 144 * 1.05)],
          series: [{ pts: curve }],
          cursor: [w * w, F],
        },
        note: '向心力指向圆心，只改变速度方向，不改变速度大小。',
        formula: { expr: 'F = mω²r', sub: `${f(m, 2)} × ${f(w, 1)}² × ${f(r, 2)} = ${f(F, 2)} N` },
        g: { th, F, v, T, an, m, r, w },
      }
    }

    /* ───────── 机械能守恒 ───────── */
    case 'fall': {
      const h = num(p, 'h', 0.8)
      const m = num(p, 'm', 0.2)
      const tEnd = Math.sqrt((2 * h) / G)
      const cycle = tEnd + 1.3
      const tt = Math.min(t % cycle, tEnd)
      const y = Math.max(0, h - 0.5 * G * tt * tt)
      const v = G * tt
      const ke = 0.5 * m * v * v
      const pe = m * G * y
      const tot = ke + pe
      const halfV = 0.5 * v * v
      const ts = lin(0, tEnd, 30)
      return {
        readings: [
          R('下落时间 t', f(tt, 3), 's', undefined, 'accent'),
          R('下落高度', f(h - y, 3), 'm'),
          R('速度 v', f(v, 2), 'm/s', 'v = gt'),
          R('½v²', f(halfV, 2), 'm²/s²'),
          R('gh', f(G * (h - y), 2), 'm²/s²', '应与 ½v² 相等'),
          R('动能 Ek', f(ke, 3), 'J'),
          R('重力势能 Ep', f(pe, 3), 'J'),
          R('机械能 E', f(tot, 3), 'J', '应保持不变'),
        ],
        chart: {
          title: exp.chartTitle ?? '动能、势能与机械能',
          xLabel: 't / s',
          yLabel: 'E / J',
          xRange: [0, tEnd],
          yRange: [0, Math.max(0.2, m * G * h * 1.15)],
          series: [
            { pts: ts.map((q) => [q, 0.5 * m * (G * q) ** 2]), label: 'Ek' },
            { pts: ts.map((q) => [q, m * G * (h - 0.5 * G * q * q)]), label: 'Ep' },
            { pts: ts.map((q) => [q, m * G * h]), dashed: true, label: 'E 总' },
          ],
          cursor: [tt, ke],
        },
        note: '重锤下落时势能减少、动能增加，两条曲线此消彼长，总和（虚线）保持不变。',
        formula: { expr: 'mgh = ½mv²', sub: `½v² = ${f(halfV, 2)}，gh = ${f(G * (h - y), 2)}（单位 m²/s²）` },
        g: { y, v, ke, pe, tot, tt, tEnd, h, m },
      }
    }

    /* ───────── 电容器充放电 ───────── */
    case 'rc': {
      const E = num(p, 'E', 6)
      const Rk = num(p, 'R', 10)
      const Cu = num(p, 'C', 100)
      const tau = Rk * Cu * 1e-3
      const tt = t % 6.6
      let u = 0
      let i = 0
      let phase = '充电'
      if (tt < 3) {
        u = E * (1 - Math.exp(-tt / tau))
        i = (E / Rk) * Math.exp(-tt / tau)
        phase = '充电'
      } else if (tt < 6) {
        const td = tt - 3
        u = E * Math.exp(-td / tau)
        i = -(E / Rk) * Math.exp(-td / tau)
        phase = '放电'
      } else {
        u = 0
        i = 0
        phase = '断开'
      }
      const q = Cu * u
      const ts = lin(0, 6, 48)
      const uCurve: [number, number][] = ts.map((q2) => {
        if (q2 <= 3) return [q2, E * (1 - Math.exp(-q2 / tau))]
        return [q2, E * Math.exp(-(q2 - 3) / tau)]
      })
      const iCurve: [number, number][] = ts.map((q2) => {
        if (q2 <= 3) return [q2, (E / Rk) * Math.exp(-q2 / tau) * Rk]
        return [q2, -(E / Rk) * Math.exp(-(q2 - 3) / tau) * Rk]
      })
      return {
        readings: [
          R('状态', phase, '', phase === '充电' ? '开关接充电端' : phase === '放电' ? '开关接放电端' : '等待下一次', 'accent'),
          R('电压 u', f(u, 2), 'V'),
          R('电流 i', f(i, 3), 'mA', i < 0 ? '方向与充电时相反' : ''),
          R('电荷量 q', f(q, 0), 'μC', 'q = Cu'),
          R('时间常数 τ', f(tau, 2), 's', 'τ = RC'),
          R('经过时间', f(tt % 3, 2), 's'),
        ],
        chart: {
          title: exp.chartTitle ?? 'u-t 与 i-t 曲线',
          xLabel: 't / s',
          yLabel: 'u / V，iR / V',
          xRange: [0, 6],
          yRange: [-E * 1.05, E * 1.1],
          series: [
            { pts: uCurve, label: 'u' },
            { pts: iCurve, dashed: true, color: '#9a5b4a', label: 'iR' },
          ],
          cursor: [tt, u],
          hline: 0,
        },
        note:
          phase === '充电'
            ? '充电：电流逐渐减小，电压逐渐升高，最终 u → E、i → 0。'
            : phase === '放电'
              ? '放电：电流反向，电压按指数规律降为零。'
              : '开关断开，电容器保持不带电，等待下一轮。',
        formula: { expr: 'τ = RC', sub: `${f(Rk, 0)} kΩ × ${f(Cu, 0)} μF = ${f(tau, 2)} s` },
        g: { u, i, q, tau, E, phase: phase === '充电' ? 0 : phase === '放电' ? 1 : 2 },
      }
    }

    /* ───────── 电阻率 ───────── */
    case 'resistivity': {
      const L = num(p, 'L', 0.8)
      const d = num(p, 'd', 0.5)
      const I = num(p, 'I', 0.4)
      const mat = str(p, 'material', 'nicr')
      const info = RHO[mat] ?? RHO.nicr
      const S = (Math.PI * (d * 1e-3) ** 2) / 4
      const Rr = (info.rho * L) / S
      const U = I * Rr
      const curve: [number, number][] = lin(0, 0.6, 24).map((q) => [q, q * Rr])
      return {
        readings: [
          R('材料', info.name, '', `ρ = ${sci(info.rho)} Ω·m`),
          R('接入长度 L', f(L, 2), 'm'),
          R('直径 d', f(d, 3), 'mm', '螺旋测微器估读到 0.001 mm'),
          R('横截面积 S', f(S * 1e6, 3), 'mm²', 'S = πd²/4'),
          R('电阻 R', f(Rr, 3), 'Ω', 'R = ρL/S'),
          R('电压 U', f(U, 2), 'V', 'U = IR'),
          R('电流 I', f(I, 2), 'A'),
          R('电阻率 ρ', sci(info.rho), 'Ω·m', '本次测量结果', 'accent'),
        ],
        chart: {
          title: exp.chartTitle ?? 'U-I 图像',
          xLabel: 'I / A',
          yLabel: 'U / V',
          xRange: [0, 0.6],
          yRange: [0, Math.max(0.5, 0.6 * Rr * 1.08)],
          series: [{ pts: curve }],
          cursor: [I, U],
        },
        note: 'U-I 图线是一条过原点的直线，斜率就是金属丝的电阻 R；再由 ρ = πd²R/(4L) 求电阻率。',
        formula: {
          expr: 'ρ = πd²R / (4L)',
          sub: `= π×(${f(d, 3)}×10⁻³)²×${f(Rr, 2)} ÷ (4×${f(L, 2)}) = ${sci(info.rho)} Ω·m`,
        },
        g: { L, d, I, R: Rr, U, S, rho: info.rho },
      }
    }

    /* ───────── 多用电表 ───────── */
    case 'multimeter': {
      const Rx = num(p, 'Rx', 120)
      const mult = Number(str(p, 'range', '10')) || 10
      // 欧姆挡刻度以「表盘读数」为单位，中值固定约 15；实际中值电阻 = 15 × 倍率
      const midScale = 15
      const midOhm = midScale * mult
      const reading = Rx / mult
      const deflect = 1 / (1 + reading / midScale)
      const tone = reading < 3 || reading > 30 ? 'warn' : 'accent'
      return {
        readings: [
          R('欧姆挡倍率', `×${mult}`, '', '换挡后要重新调零'),
          R('表盘读数', f(reading, 1), 'Ω', '指针所指刻度', tone),
          R('测量值', f(reading * mult, 0), 'Ω', '读数 × 倍率', 'accent'),
          R('中值电阻', f(midOhm, 0), 'Ω', '该挡的内阻'),
          R('指针位置', `${f(deflect * 100, 0)}%`, '', deflect > 0.8 ? '偏右，读数偏小' : deflect < 0.2 ? '偏左，读数偏大' : '接近中值，较准'),
        ],
        note:
          reading < 3
            ? '指针偏角过大（太靠右），说明倍率选大了，应换小一挡并重新调零。'
            : reading > 30
              ? '指针偏角过小（太靠左），说明倍率选小了，应换大一挡并重新调零。'
              : '指针落在中值附近，读数最准确。',
        formula: { expr: '测量值 = 表盘读数 × 倍率', sub: `${f(reading, 1)} × ${mult} = ${f(reading * mult, 0)} Ω` },
        g: { Rx, mult, mid: midOhm, midScale, deflect, reading },
      }
    }

    /* ───────── 电动势与内阻 ───────── */
    case 'emf': {
      const E = num(p, 'E', 1.5)
      const r = num(p, 'r', 0.5)
      const cycle = 7
      const tt = t % cycle
      const Rr = 10 - 9 * (tt / cycle)
      const I = E / (Rr + r)
      const U = E - I * r
      const pts: [number, number][] = lin(0, E / r, 24).map((q) => [q, E - q * r])
      return {
        readings: [
          R('外电阻 R', f(Rr, 2), 'Ω', '滑动变阻器'),
          R('电流 I', f(I, 3), 'A', '干路电流'),
          R('路端电压 U', f(U, 3), 'V', 'U = E − Ir'),
          R('电动势 E', f(E, 2), 'V', 'U-I 图纵截距', 'accent'),
          R('内阻 r', f(r, 2), 'Ω', 'U-I 图斜率绝对值'),
          R('输出功率 P', f(U * I, 3), 'W', 'P = UI'),
          R('效率 η', f((U / E) * 100, 1), '%', 'U/E'),
        ],
        chart: {
          title: exp.chartTitle ?? 'U-I 图像',
          xLabel: 'I / A',
          yLabel: 'U / V',
          xRange: [0, Math.max(1, E / r)],
          yRange: [0, E * 1.1],
          series: [{ pts }],
          cursor: [I, U],
          hline: E,
        },
        note: 'U-I 图线是一条向下倾斜的直线：纵轴截距是电动势 E，斜率的绝对值是内阻 r。',
        formula: { expr: 'U = E − Ir', sub: `${f(E, 2)} − ${f(I, 3)}×${f(r, 2)} = ${f(U, 3)} V` },
        g: { E, r, R: Rr, I, U },
      }
    }

    /* ───────── 动量守恒 ───────── */
    case 'collision': {
      const m1 = num(p, 'm1', 0.2)
      const m2 = num(p, 'm2', 0.3)
      const v1 = num(p, 'v1', 0.6)
      const elastic = str(p, 'type', 'elastic') === 'elastic'
      const v1p = elastic ? ((m1 - m2) / (m1 + m2)) * v1 : (m1 * v1) / (m1 + m2)
      const v2p = elastic ? ((2 * m1) / (m1 + m2)) * v1 : v1p
      const pBefore = m1 * v1
      const pAfter = m1 * v1p + m2 * v2p
      const keBefore = 0.5 * m1 * v1 * v1
      const keAfter = 0.5 * m1 * v1p * v1p + 0.5 * m2 * v2p * v2p
      const tc = 1.4
      const cycle = 3.6
      const tt = t % cycle
      const before = tt < tc
      const x1 = before ? -1.1 + v1 * tt : -1.1 + v1 * tc + v1p * (tt - tc)
      const x2 = before ? 0.9 : 0.9 + v2p * (tt - tc)
      const ts = lin(0, 3.4, 34)
      const p1 = ts.map((q): [number, number] => [q, q < tc ? m1 * v1 : m1 * v1p])
      const p2 = ts.map((q): [number, number] => [q, q < tc ? 0 : m2 * v2p])
      const pT = ts.map((q): [number, number] => [q, q < tc ? pBefore : pAfter])
      const yMin = Math.min(0, m1 * v1p) * 1.25
      return {
        readings: [
          R('碰前总动量', f(pBefore, 3), 'kg·m/s', 'p = m₁v₁', 'accent'),
          R('碰后总动量', f(pAfter, 3), 'kg·m/s', 'p′ = m₁v₁′ + m₂v₂′', 'accent'),
          R('v₁′', f(v1p, 3), 'm/s', v1p < 0 ? '方向与原来相反' : '方向不变'),
          R('v₂′', f(v2p, 3), 'm/s', '碰前静止'),
          R('碰前动能', f(keBefore, 3), 'J'),
          R('碰后动能', f(keAfter, 3), 'J', elastic ? '弹性碰撞：动能守恒' : '完全非弹性：动能减少'),
          R('相对误差', `${f(Math.abs((pAfter - pBefore) / pBefore) * 100, 2)}`, '%', '应接近 0'),
        ],
        chart: {
          title: exp.chartTitle ?? '碰撞前后的动量',
          xLabel: 't / s',
          yLabel: 'p / (kg·m·s⁻¹)',
          xRange: [0, 3.4],
          yRange: [yMin, Math.max(0.15, pBefore * 1.25)],
          series: [
            { pts: p1, label: 'p₁' },
            { pts: p2, label: 'p₂' },
            { pts: pT, dashed: true, color: '#9a5b4a', label: 'p 总' },
          ],
          cursor: [tt, before ? pBefore : pAfter],
        },
        note: elastic
          ? '弹性碰撞：动量守恒，动能也守恒；两滑块分开。'
          : '完全非弹性碰撞：动量守恒，但动能减少，两滑块粘在一起。',
        formula: {
          expr: 'm₁v₁ = m₁v₁′ + m₂v₂′',
          sub: `${f(m1, 2)}×${f(v1, 2)} = ${f(m1, 2)}×(${f(v1p, 2)}) + ${f(m2, 2)}×${f(v2p, 2)} = ${f(pAfter, 3)}`,
        },
        g: { x1, x2, v1: before ? v1 : v1p, v2: before ? 0 : v2p, pBefore, pAfter, tt, tc, elastic: elastic ? 1 : 0 },
      }
    }

    /* ───────── 简谐运动 / 弹簧振子 ───────── */
    case 'shm': {
      const A = num(p, 'A', 4) // cm
      const m = num(p, 'm', 0.2)
      const phi0 = num(p, 'phi', 0) * DEG
      // 2.1 用 k、m 算周期；2.2 直接给 T，再反推 k
      const hasT = typeof p.T === 'number'
      const k = typeof p.k === 'number' ? num(p, 'k', 20) : (4 * Math.PI * Math.PI * m) / Math.max(0.01, num(p, 'T', 1) ** 2)
      const T = hasT ? num(p, 'T', 1) : 2 * Math.PI * Math.sqrt(m / k)
      const omega = (2 * Math.PI) / T
      const phase = omega * t + phi0
      const x = A * Math.cos(phase) // cm
      const v = -A * omega * Math.sin(phase) // cm/s
      const a = -omega * omega * x // cm/s²
      const F = (-k * x) / 100 // N
      const xm = x / 100
      const vm = v / 100
      const Ek = 0.5 * m * vm * vm
      const Ep = 0.5 * k * xm * xm
      const E = Ek + Ep
      const theta = ((phase % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
      const ts = lin(0, 2 * T, 80)
      const pts: [number, number][] = ts.map((q) => [q, A * Math.cos(omega * q + phi0)])
      const cursorT = ((t % (2 * T)) + 2 * T) % (2 * T)
      return {
        readings: [
          R('位移 x', f(x, 2), 'cm', '相对平衡位置', 'accent'),
          R('速度 v', f(vm, 2), 'm/s', v >= 0 ? '向上' : '向下'),
          R('加速度 a', f(a / 100, 2), 'm/s²', 'a = −ω²x'),
          R('回复力 F', f(F, 2), 'N', 'F = −kx'),
          R('振幅 A', f(A, 1), 'cm'),
          R('周期 T', f(T, 3), 's', `k = ${f(k, 0)} N/m`),
          R('频率 f', f(1 / T, 3), 'Hz', 'f = 1/T'),
          R('相位 θ', f(theta / DEG, 0), '°', 'ωt + φ₀'),
          R('机械能 E', f(E, 4), 'J', '动能 + 势能'),
        ],
        chart: {
          title: exp.chartTitle ?? 'x-t 图像（振动图像）',
          xLabel: 't / s',
          yLabel: 'x / cm',
          xRange: [0, 2 * T],
          yRange: [-A * 1.18, A * 1.18],
          series: [{ pts }],
          cursor: [cursorT, x],
          vline: T,
          hline: 0,
        },
        note: '参考圆上的点以角速度 ω 匀速转动，它在竖直直径上的投影就是振子的位移；把投影随时间展开，就是右侧的 x-t 正弦曲线。',
        formula: {
          expr: 'x = A cos(ωt + φ)',
          sub: `= ${f(A, 1)} × cos(${f(theta / DEG, 0)}°) = ${f(x, 2)} cm`,
        },
        g: { A, m, k, T, omega, phi: phi0, theta, x, v: vm, a: a / 100, F, E },
      }
    }

    /* ───────── 单摆测 g ───────── */
    case 'pendulum': {
      const L = num(p, 'L', 1.0)
      const th0 = num(p, 'th0', 5)
      const w = Math.sqrt(G / L)
      const T = (2 * Math.PI) / w
      const phase = w * t
      const th = th0 * DEG * Math.cos(phase)
      const x = L * Math.sin(th)
      const y = -L * Math.cos(th)
      const gMeas = (4 * Math.PI * Math.PI * L) / (T * T)
      // 线速度 = L·|dθ/dt|；最低点（θ=0）速度最大，不是零
      const v = L * th0 * DEG * w * Math.abs(Math.sin(phase))
      const curve: [number, number][] = lin(0.5, 1.5, 20).map((q) => [q, (4 * Math.PI * Math.PI * q) / G])
      return {
        readings: [
          R('摆长 L', f(L, 2), 'm', '线长 + 球半径'),
          R('周期 T', f(T, 3), 's', 'T = 2π√(L/g)'),
          R('30T 总时间', f(30 * T, 2), 's', '实际测量的是这一段'),
          R('测得 g', f(gMeas, 2), 'm/s²', 'g = 4π²L/T²', 'accent'),
          R('当前摆角', f(Math.abs(th) / DEG, 2), '°', '摆角应小于 5°'),
          R('摆球速度', f(v, 2), 'm/s', '最低点最大'),
        ],
        chart: {
          title: exp.chartTitle ?? 'T²-L 图像',
          xLabel: 'L / m',
          yLabel: 'T² / s²',
          xRange: [0.5, 1.5],
          yRange: [0, 6.2],
          series: [{ pts: curve }],
          cursor: [L, T * T],
        },
        note: '摆长越长周期越大；T²-L 图线是过原点的直线，斜率等于 4π²/g。',
        formula: { expr: 'g = 4π²L / T²', sub: `= 4π²×${f(L, 2)} ÷ ${f(T, 3)}² = ${f(gMeas, 2)} m/s²` },
        g: { th, x, y, T, w, v, L },
      }
    }

    /* ───────── 折射率 ───────── */
    case 'refraction': {
      const i = num(p, 'i', 45)
      const nn = num(p, 'n', 1.5)
      const r = (Math.asin(Math.sin(i * DEG) / nn) * 180) / Math.PI
      const curve: [number, number][] = lin(0, 70, 28).map((q) => {
        const rr = (Math.asin(Math.sin(q * DEG) / nn) * 180) / Math.PI
        return [Math.sin(rr * DEG), Math.sin(q * DEG)]
      })
      return {
        readings: [
          R('入射角 θ₁', f(i, 1), '°', '与法线的夹角'),
          R('折射角 θ₂', f(r, 2), '°', '与法线的夹角'),
          R('sinθ₁', f(Math.sin(i * DEG), 4), ''),
          R('sinθ₂', f(Math.sin(r * DEG), 4), ''),
          R('折射率 n', f(Math.sin(i * DEG) / Math.sin(r * DEG), 3), '', 'n = sinθ₁/sinθ₂', 'accent'),
          R('光在玻璃中的速度', sci(3e8 / nn), 'm/s', 'v = c/n'),
        ],
        chart: {
          title: exp.chartTitle ?? 'sinθ₁-sinθ₂ 图像',
          xLabel: 'sinθ₂',
          yLabel: 'sinθ₁',
          xRange: [0, 0.8],
          yRange: [0, 0.95],
          series: [{ pts: curve }],
          cursor: [Math.sin(r * DEG), Math.sin(i * DEG)],
        },
        note: '入射角增大，折射角也增大，但 sinθ₁ 与 sinθ₂ 的比值保持不变。',
        formula: { expr: 'n = sinθ₁ / sinθ₂', sub: `= ${f(Math.sin(i * DEG), 4)} ÷ ${f(Math.sin(r * DEG), 4)} = ${f(nn, 2)}` },
        g: { i, r, n: nn },
      }
    }

    /* ───────── 双缝干涉 ───────── */
    case 'interference': {
      const lam = num(p, 'lam', 550)
      const d = num(p, 'd', 0.2)
      const L = num(p, 'L', 1.0)
      const dx = (L * lam * 1e-9) / (d * 1e-3)
      const ten = 10 * dx
      const curve: [number, number][] = lin(-12, 12, 120).map((q) => [
        q,
        Math.cos((Math.PI * (q * 1e-3)) / dx) ** 2,
      ])
      return {
        readings: [
          R('波长 λ', f(lam, 0), 'nm', '由滤光片决定'),
          R('双缝间距 d', f(d, 3), 'mm'),
          R('缝到屏距离 L', f(L, 2), 'm'),
          R('条纹间距 Δx', f(dx * 1000, 3), 'mm', 'Δx = Lλ/d', 'accent'),
          R('10 条亮纹间距', f(ten * 1000, 2), 'mm', '实际测量的量'),
          R('计算波长', f((d * 1e-3 * dx) / L * 1e9, 0), 'nm', 'λ = dΔx/L'),
        ],
        chart: {
          title: exp.chartTitle ?? '屏上的光强分布',
          xLabel: '位置 / mm',
          yLabel: '相对光强',
          xRange: [-12, 12],
          yRange: [0, 1.1],
          series: [{ pts: curve }],
          cursor: [0, 1],
        },
        note: '相邻亮纹间距相等；λ 越大、L 越大或 d 越小，条纹间距越大。',
        formula: { expr: 'λ = d·Δx / L', sub: `= ${f(d, 2)}×10⁻³ × ${f(dx * 1000, 3)}×10⁻³ ÷ ${f(L, 2)} = ${f(lam, 0)} nm` },
        g: { lam, d, L, dx, phase: t % 2 },
      }
    }

    /* ───────── 楞次定律 ───────── */
    case 'induction': {
      const pole = str(p, 'pole', 'N')
      const period = 4
      const tt = t % period
      const pos = -0.25 + 0.55 * Math.sin((2 * Math.PI * tt) / period)
      const fluxOf = (x: number) => 1 / (1 + (x / 0.28) ** 2)
      const flux = fluxOf(pos)
      const dt = 0.01
      const dFlux = (fluxOf(-0.25 + 0.55 * Math.sin((2 * Math.PI * (tt + dt)) / period)) - fluxOf(-0.25 + 0.55 * Math.sin((2 * Math.PI * (tt - dt)) / period))) / (2 * dt)
      const emf = -dFlux * (pole === 'N' ? 1 : -1)
      const moving = Math.cos((2 * Math.PI * tt) / period) > 0 ? '靠近线圈' : '远离线圈'
      const dir = emf === 0 ? '无' : emf > 0 ? '逆时针' : '顺时针'
      const ts = lin(0, period, 60)
      const fluxCurve: [number, number][] = ts.map((q) => [q, fluxOf(-0.25 + 0.55 * Math.sin((2 * Math.PI * q) / period))])
      const emfCurve: [number, number][] = ts.map((q) => {
        const a = fluxOf(-0.25 + 0.55 * Math.sin((2 * Math.PI * (q + dt)) / period))
        const b = fluxOf(-0.25 + 0.55 * Math.sin((2 * Math.PI * (q - dt)) / period))
        return [q, -((a - b) / (2 * dt)) * 0.6]
      })
      return {
        readings: [
          R('磁铁位置', f(pos, 2), 'm', pos > 0 ? '在线圈右侧' : '在线圈左侧'),
          R('运动方向', moving, '', Math.abs(pos) < 0.25 ? '磁通变化最快' : ''),
          R('磁通量 Φ', f(flux, 3), '相对值'),
          R('ΔΦ/Δt', f(dFlux, 3), '/s', '变化率决定电动势'),
          R('感应电动势', f(Math.abs(emf), 3), '相对值', 'E = −ΔΦ/Δt', 'accent'),
          R('感应电流方向', dir, '', '从线圈右端看'),
        ],
        chart: {
          title: exp.chartTitle ?? '磁通量与感应电动势',
          xLabel: 't / s',
          yLabel: '相对值',
          xRange: [0, period],
          yRange: [-1.2, 1.2],
          series: [
            { pts: fluxCurve, label: 'Φ' },
            { pts: emfCurve, dashed: true, color: '#9a5b4a', label: 'E' },
          ],
          cursor: [tt, flux],
          hline: 0,
        },
        note:
          moving === '靠近线圈'
            ? '磁铁靠近，磁通量增加，感应电流的磁场与原磁场反向（增反）。'
            : '磁铁远离，磁通量减少，感应电流的磁场与原磁场同向（减同）。',
        formula: { expr: 'E = −ΔΦ/Δt', sub: `|E| ∝ |ΔΦ/Δt| = ${f(Math.abs(dFlux), 3)}` },
        g: { pos, flux, emf, tt, pole: pole === 'N' ? 1 : -1 },
      }
    }

    /* ───────── 变压器 ───────── */
    case 'transformer': {
      const n1 = num(p, 'n1', 400)
      const n2 = num(p, 'n2', 200)
      const U1 = num(p, 'U1', 12)
      const U2 = (U1 * n2) / n1
      const Rl = 10
      const I2 = U2 / Rl
      const I1 = (I2 * n2) / n1
      const P = U2 * I2
      const ph = (2 * Math.PI * 50 * t) % (Math.PI * 4)
      const u1 = U1 * Math.SQRT2 * Math.sin(ph)
      const u2 = U2 * Math.SQRT2 * Math.sin(ph + Math.PI)
      const ts = lin(0, 0.04, 40)
      const c1: [number, number][] = ts.map((q) => [q, U1 * Math.SQRT2 * Math.sin(2 * Math.PI * 50 * q)])
      const c2: [number, number][] = ts.map((q) => [q, U2 * Math.SQRT2 * Math.sin(2 * Math.PI * 50 * q + Math.PI)])
      return {
        readings: [
          R('原线圈匝数 n₁', f(n1, 0), '匝'),
          R('副线圈匝数 n₂', f(n2, 0), '匝'),
          R('原线圈电压 U₁', f(U1, 1), 'V', '有效值'),
          R('副线圈电压 U₂', f(U2, 2), 'V', 'U₂ = U₁n₂/n₁', 'accent'),
          R('匝数比 n₁/n₂', f(n1 / n2, 2), '', `电压比 ${f(U1 / U2, 2)}`),
          R('副线圈电流 I₂', f(I2, 3), 'A', '负载 R = 10 Ω'),
          R('原线圈电流 I₁', f(I1, 3), 'A', 'I₁ = I₂n₂/n₁'),
          R('输出功率 P', f(P, 2), 'W', 'P = U₂I₂'),
        ],
        chart: {
          title: exp.chartTitle ?? '原、副线圈电压波形',
          xLabel: 't / s',
          yLabel: 'u / V',
          xRange: [0, 0.04],
          yRange: [-Math.max(U1, U2) * 1.6, Math.max(U1, U2) * 1.6],
          series: [
            { pts: c1, label: 'u₁' },
            { pts: c2, dashed: true, color: '#9a5b4a', label: 'u₂' },
          ],
          cursor: [(50 * t) % 0.04, u1],
          hline: 0,
        },
        note: '原、副线圈电压之比等于匝数之比；副线圈匝数少于原线圈时是降压变压器。',
        formula: { expr: 'U₁/U₂ = n₁/n₂', sub: `${f(U1, 1)} ÷ ${f(U2, 2)} = ${f(n1, 0)} ÷ ${f(n2, 0)}` },
        g: { n1, n2, U1, U2, I1, I2, P, ph, u1, u2 },
      }
    }

    /* ───────── 传感器 ───────── */
    case 'sensor': {
      const th = num(p, 'th', 50)
      const cycle = 12
      const tt = t % cycle
      const temp = 20 + 60 * (tt < 6 ? tt / 6 : 1 - (tt - 6) / 6)
      const Rth = 10000 * Math.exp(3500 * (1 / (temp + 273.15) - 1 / 298.15))
      const I = (6 / (Rth + 1000)) * 1000
      const on = temp >= th
      const curve: [number, number][] = lin(20, 80, 30).map((q) => [
        q,
        10 * Math.exp(3500 * (1 / (q + 273.15) - 1 / 298.15)),
      ])
      return {
        readings: [
          R('温度', f(temp, 1), '°C', '加热中', 'accent'),
          R('热敏电阻 R', f(Rth / 1000, 2), 'kΩ', 'NTC：温度升高阻值减小'),
          R('控制电流 I', f(I, 2), 'mA', 'I = E/(R+R₀)'),
          R('继电器', on ? '吸合' : '释放', '', on ? '控制电路接通工作电路' : '工作电路断开', on ? 'warn' : 'plain'),
          R('小灯泡', on ? '亮' : '灭', '', '由继电器触点控制'),
          R('设定温度', f(th, 0), '°C', '由电阻箱调定'),
        ],
        chart: {
          title: exp.chartTitle ?? '热敏电阻的阻值-温度曲线',
          xLabel: 'T / °C',
          yLabel: 'R / kΩ',
          xRange: [20, 80],
          yRange: [0, 12],
          series: [{ pts: curve }],
          cursor: [temp, Rth / 1000],
          vline: th,
        },
        note: '温度升高 → 热敏电阻阻值减小 → 控制电流增大 → 继电器吸合 → 灯泡点亮。',
        formula: { expr: 'R = R₂₅·exp[B(1/T − 1/298.15)]', sub: `T = ${f(temp + 273.15, 1)} K 时 R = ${f(Rth / 1000, 2)} kΩ` },
        g: { temp, R: Rth, I, on: on ? 1 : 0, th },
      }
    }

    /* ───────── 油膜法 ───────── */
    case 'oilfilm': {
      const conc = num(p, 'conc', 500)
      const Vdrop = num(p, 'Vdrop', 0.02)
      const Vpure = (Vdrop * 1e-6) / conc
      const S0 = 0.2
      const rMax = Math.sqrt(S0 / Math.PI)
      const grow = clamp(t / 1.6, 0, 1)
      const r = rMax * (1 - Math.exp(-3.2 * grow))
      const S = Math.PI * r * r
      const dd = S > 1e-4 ? Vpure / S : 0
      const cells = Math.round(S / 1e-4)
      const curve: [number, number][] = lin(0.02, 0.5, 30).map((q) => [q, Vpure / q])
      return {
        readings: [
          R('溶液浓度', `1 / ${f(conc, 0)}`, '', '油酸酒精溶液'),
          R('一滴溶液体积', f(Vdrop, 3), 'mL'),
          R('纯油酸体积 V', sci(Vpure), 'm³', '浓度 × 一滴体积', 'accent'),
          R('油膜面积 S', f(S, 3), 'm²', `约 ${cells} 个 1 cm² 小格`),
          R('分子直径 d', sci(dd), 'm', 'd = V/S', 'accent'),
          R('数量级', dd > 0 ? `10${String(Math.floor(Math.log10(dd))).replace('-', '⁻').replace(/\d/g, (ch) => SUP[Number(ch)])}` : '—', 'm', '约 10⁻¹⁰ m'),
        ],
        chart: {
          title: exp.chartTitle ?? '油膜面积与分子直径',
          xLabel: 'S / m²',
          yLabel: 'd / m',
          xRange: [0.02, 0.5],
          yRange: [0, Vpure / 0.02],
          series: [{ pts: curve }],
          cursor: [S, dd],
        },
        note: '把油酸分子看成球形并紧密排列，油膜厚度就是分子直径；数量级约 10⁻¹⁰ m。',
        formula: { expr: 'd = V / S', sub: `${sci(Vpure)} ÷ ${f(S, 3)} = ${sci(dd)} m` },
        g: { Vpure, S, d: dd, r, cells, conc },
      }
    }

    /* ───────── 玻意耳定律 ───────── */
    case 'gas': {
      const T = num(p, 'T', 300)
      const Vmax = num(p, 'Vmax', 40)
      const nMol = 1.6e-3
      const cycle = 8
      const tt = t % cycle
      const V = Vmax - (Vmax - 15) * (0.5 - 0.5 * Math.cos((2 * Math.PI * tt) / cycle))
      const P = (nMol * 8.31 * T) / (V * 1e-6) / 1000
      const pV = P * V
      const curve: [number, number][] = lin(15, Vmax, 40).map((q) => [q, (nMol * 8.31 * T) / (q * 1e-6) / 1000])
      return {
        readings: [
          R('体积 V', f(V, 1), 'mL'),
          R('压强 p', f(P, 1), 'kPa', 'p = nRT/V', 'accent'),
          R('pV', f(pV, 0), 'kPa·mL', '等温下应为常数', 'accent'),
          R('温度 T', f(T, 0), 'K', '保持恒定'),
          R('1/V', f(1000 / V, 3), 'mL⁻¹'),
          R('质量', '一定', '', '密封良好'),
        ],
        chart: {
          title: exp.chartTitle ?? 'p-V 图像',
          xLabel: 'V / mL',
          yLabel: 'p / kPa',
          xRange: [15, Vmax],
          yRange: [0, (nMol * 8.31 * T) / 15e-6 / 1000 * 1.1],
          series: [{ pts: curve }],
          cursor: [V, P],
        },
        note: '缓慢推拉活塞，气体温度保持不变；p-V 图线是双曲线的一支，pV 乘积基本不变。',
        formula: { expr: 'pV = C', sub: `${f(P, 1)} kPa × ${f(V, 1)} mL = ${f(pV, 0)} kPa·mL` },
        g: { V, P, pV, T, Vmax },
      }
    }

    default:
      return { readings: [], g: {} }
  }
}

export { f as fmtNum, sci as fmtSci }
