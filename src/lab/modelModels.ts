import type { LabExperiment, LabModel, LabParams, Reading } from './types'

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
const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')
const R = (label: string, value: string, unit?: string, hint?: string, tone?: Reading['tone']): Reading => ({
  label,
  value,
  unit,
  hint,
  tone,
})
const lin = (a: number, b: number, n: number): number[] =>
  Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n)

export function modelModel(exp: LabExperiment, p: LabParams, t: number): LabModel {
  const type = exp.modelType ?? 'boat'
  switch (type) {
    case 'boat': {
      const mp = num(p, 'mp', 60)
      const mb = num(p, 'mb', 120)
      const L = num(p, 'L', 3)
      const phase = (t * 0.9) % (Math.PI * 2)
      const walk = L * 0.5 * (1 - Math.cos(phase))
      const sb = (-mp / (mp + mb)) * walk
      const sp = walk + sb
      const ts = lin(0, 4, 40)
      const walkCurve = ts.map((q): [number, number] => [q, L * 0.5 * (1 - Math.cos((q * 0.9) % (Math.PI * 2)))])
      const boatCurve = ts.map((q): [number, number] => [q, (-mp / (mp + mb)) * L * 0.5 * (1 - Math.cos((q * 0.9) % (Math.PI * 2)))])
      return {
        readings: [
          R('人相对船位移', f(walk, 2), 'm', '从船头走到船尾', 'accent'),
          R('船对地位移', f(sb, 2), 'm', '方向与人相反'),
          R('人对地位移', f(sp, 2), 'm', '= 相对位移 + 船位移'),
          R('质量比 m人/m船', f(mp / mb, 2), '', '位移比等于质量反比'),
          R('系统总动量', '0', 'kg·m/s', '水平方向不受外力', 'accent'),
        ],
        chart: {
          title: '人、船位移随时间变化',
          xLabel: 't / s',
          yLabel: 's / m',
          xRange: [0, 4],
          yRange: [-0.2, Math.max(1, L) * 1.1],
          series: [
            { pts: walkCurve, label: '人对船' },
            { pts: boatCurve, color: '#9a5b4a', dashed: true, label: '船对地' },
          ],
          cursor: [t % 4, walk],
        },
        note: '人船模型的关键是水平方向总动量守恒：人向右走，船向左退，二者对地位移之比等于质量的反比；系统质心保持不动。',
        formula: {
          expr: 'm人·s人 = m船·s船（大小），s人 + s船 = L相对',
          sub: f(mp, 0) + ' × ' + f(sp, 2) + ' ≈ ' + f(mb, 0) + ' × ' + f(Math.abs(sb), 2) + '，相对位移 ' + f(walk, 2) + ' m',
        },
        g: { walk, sb, sp, L, mp, mb, phase },
      }
    }

    case 'board': {
      const m = num(p, 'm', 1)
      const M = num(p, 'M', 3)
      const mu = num(p, 'mu', 0.3)
      const v0 = num(p, 'v0', 4)
      const L = num(p, 'L', 2)
      const aRel = mu * G * (1 + m / M)
      const tStop = v0 / aRel
      const sRel = (v0 * v0) / (2 * aRel)
      const off = sRel > L
      const tOff = off ? (v0 - Math.sqrt(Math.max(0, v0 * v0 - 2 * aRel * L))) / aRel : tStop
      const phase = t % (tOff + 1.6)
      const tt = Math.min(phase, tOff)
      const aB = (mu * m * G) / M
      const aA = -mu * G
      const xB = 0.5 * aB * tt * tt
      const xA = v0 * tt + 0.5 * aA * tt * tt
      const vA = v0 + aA * tt
      const vB = aB * tt
      const heat = mu * m * G * Math.min(sRel, L)
      return {
        readings: [
          R('滑块速度 v', f(vA, 2), 'm/s', '受滑动摩擦力减速', 'accent'),
          R('木板速度 V', f(vB, 2), 'm/s', '摩擦力带动加速'),
          R('相对位移 Δs', f(Math.min(sRel, L), 2), 'm', off ? '已滑出木板' : '最终相对静止'),
          R('共同速度 v共', f((m * v0) / (m + M), 2), 'm/s', off ? '未达到（滑出）' : '动量守恒'),
          R('摩擦生热 Q', f(heat, 2), 'J', 'Q = μmg·Δs', 'accent'),
          R('滑到共速时间', f(tStop, 2), 's', off ? '实际在 ' + f(tOff, 2) + ' s 滑出' : '之后一起匀速'),
        ],
        note: off
          ? '木板太短，滑块还没和木板共速就滑出去了；此后滑块与木板各自运动。'
          : '滑块与木板之间的滑动摩擦力使滑块减速、木板加速，直到二者速度相同；之后若无外力就一起匀速。',
        formula: {
          expr: 'm v₀ = (m + M) v共，Q = μmg·Δs',
          sub: 'v共 = ' + f((m * v0) / (m + M), 2) + ' m/s，Δs = ' + f(Math.min(sRel, L), 2) + ' m',
        },
        g: { xA, xB, vA, vB, sRel, L, off: off ? 1 : 0, tOff, heat },
      }
    }

    case 'belt': {
      const v0 = num(p, 'v0', 0)
      const vb = num(p, 'vb', 2)
      const mu = num(p, 'mu', 0.3)
      const L = num(p, 'L', 4)
      const a = mu * G
      const tAcc = Math.abs(vb - v0) / a
      const dir = Math.sign(vb - v0) || 1
      const sAcc = v0 * tAcc + 0.5 * dir * a * tAcc * tAcc
      const cycle = tAcc + Math.max(0.1, (L - sAcc) / Math.max(0.1, vb)) + 1.2
      const phase = t % cycle
      let s = 0
      let v = v0
      let state = '与带同速'
      if (phase < tAcc) {
        s = v0 * phase + 0.5 * dir * a * phase * phase
        v = v0 + dir * a * phase
        state = dir > 0 ? '加速' : '减速'
      } else {
        s = sAcc + vb * (phase - tAcc)
        v = vb
      }
      const over = s > L
      return {
        readings: [
          R('物块速度 v', f(over ? vb : v, 2), 'm/s', state, 'accent'),
          R('传送带速度 v带', f(vb, 2), 'm/s', '带面匀速'),
          R('加速度 a', f(a, 2), 'm/s²', 'a = μg'),
          R('达到同速时间', f(tAcc, 2), 's', sAcc > L ? '未达到就离开了' : ''),
          R('相对滑动距离', f(Math.abs(sAcc - vb * tAcc), 2), 'm', '用于算摩擦生热'),
          R('物块位移 s', f(Math.min(s, L), 2), 'm', over ? '已离开传送带' : ''),
        ],
        note: sAcc > L
          ? '传送带太短，物块还没加速到带速就离开了。'
          : '物块先受滑动摩擦力加速（或减速），达到带速后摩擦力消失，随带一起匀速。',
        formula: {
          expr: 'a = μg，v = v₀ + at，Q = μmg·Δs相对',
          sub: 'a = ' + f(a, 2) + ' m/s²，t = ' + f(tAcc, 2) + ' s',
        },
        g: { s, v, vb, L, tAcc, sAcc, a },
      }
    }

    case 'pursuit': {
      const vA = num(p, 'vA', 10)
      const aB = num(p, 'aB', 2)
      const gap = num(p, 'gap', 20)
      const disc = vA * vA + 2 * aB * gap
      const tCatch = aB > 0 ? (vA + Math.sqrt(Math.max(0, disc))) / aB : Infinity
      const phase = t % (Math.min(tCatch, 12) + 2)
      const xA = vA * phase
      const xB = -gap + 0.5 * aB * phase * phase
      const vB = aB * phase
      const sep = xA - xB
      return {
        readings: [
          R('前车速度 vA', f(vA, 2), 'm/s', '匀速', 'accent'),
          R('后车速度 vB', f(vB, 2), 'm/s', '从静止加速'),
          R('两车间距', f(sep, 2), 'm', sep <= 0.2 ? '已追上' : ''),
          R('追上所需时间', Number.isFinite(tCatch) ? f(tCatch, 2) : '—', 's', aB <= 0 ? '后车不加速，追不上' : ''),
          R('追上时前车位移', Number.isFinite(tCatch) ? f(vA * tCatch, 2) : '—', 'm'),
          R('追上时后车速度', Number.isFinite(tCatch) ? f(aB * tCatch, 2) : '—', 'm/s'),
        ],
        note: aB <= 0
          ? '后车不加速，两车速度差恒定，间距只会越来越大。'
          : '追及问题的临界是后车速度等于前车速度：在此之前间距在缩小，之后若还没追上就再也追不上。',
        formula: {
          expr: 'gap + ½a t² = vA t',
          sub: Number.isFinite(tCatch)
            ? 't = (vA + √(vA² + 2a·gap)) / a = ' + f(tCatch, 2) + ' s'
            : 'a = 0 时无解',
        },
        g: { xA, xB, vA, vB, gap, sep, tCatch: Number.isFinite(tCatch) ? tCatch : 0 },
      }
    }

    case 'connected': {
      const m1 = num(p, 'm1', 2)
      const m2 = num(p, 'm2', 1)
      const mu = num(p, 'mu', 0.2)
      const a = (m2 * G - mu * m1 * G) / (m1 + m2)
      const T = m1 * (a + mu * G)
      const phase = t % 4
      const s = Math.max(0, 0.5 * a * phase * phase)
      return {
        readings: [
          R('加速度 a', f(a, 2), 'm/s²', '整体法求加速度', 'accent'),
          R('绳张力 T', f(T, 2), 'N', '隔离 m₁'),
          R('m₁ 位移', f(s, 2), 'm', '与 m₂ 相同'),
          R('m₂ 速度', f(a * phase, 2), 'm/s'),
          R('总质量', f(m1 + m2, 2), 'kg'),
          R('摩擦阻力', f(mu * m1 * G, 2), 'N', 'm₁ 受桌面的滑动摩擦'),
        ],
        note: '连接体先用整体法求加速度，再隔离其中一个物体求绳张力；注意绳不可伸长，两物体加速度大小相同。',
        formula: {
          expr: 'a = (m₂g − μm₁g)/(m₁ + m₂)，T = m₁(a + μg)',
          sub: 'a = ' + f(a, 2) + ' m/s²，T = ' + f(T, 2) + ' N',
        },
        g: { a, T, s, m1, m2, mu },
      }
    }

    case 'orbit': {
      const mode = str(p, 'mode', 'double')
      if (mode === 'satellite') {
        const M = num(p, 'M', 5.97e24)
        const r = num(p, 'r', 6.8e6)
        const v = Math.sqrt((6.67e-11 * M) / r)
        const T = (2 * Math.PI * r) / v
        const th = (t * 0.7) % (Math.PI * 2)
        return {
          readings: [
            R('轨道半径 r', f(r / 1000, 0), 'km', '地球半径约 6.4×10³ km', 'accent'),
            R('线速度 v', f(v / 1000, 2), 'km/s', 'v = √(GM/r)'),
            R('周期 T', f(T / 60, 1), 'min', 'T = 2π√(r³/GM)'),
            R('向心加速度', f((v * v) / r, 2), 'm/s²', '= GM/r²'),
            R('地球质量 M', '5.97×10²⁴', 'kg'),
          ],
          note: '卫星的轨道半径越大，线速度越小、周期越长；近地卫星的线速度约 7.9 km/s（第一宇宙速度）。',
          formula: { expr: 'v = √(GM/r)，T = 2π√(r³/GM)', sub: 'v = ' + f(v / 1000, 2) + ' km/s，T = ' + f(T / 60, 1) + ' min' },
          g: { mode: 1, r, th, ratio: 0 },
        }
      }
      const M1 = num(p, 'M1', 2)
      const M2 = num(p, 'M2', 1)
      const d = num(p, 'd', 10)
      const omega = Math.sqrt((G * (M1 + M2)) / (d * d * d))
      const r1 = (M2 / (M1 + M2)) * d
      const r2 = (M1 / (M1 + M2)) * d
      const T = (2 * Math.PI) / omega
      const th = (omega * t) % (Math.PI * 2)
      return {
        readings: [
          R('双星间距 d', f(d, 2), 'm', '两星连线', 'accent'),
          R('星 1 轨道半径', f(r1, 2), 'm', 'r₁ = M₂d/(M₁+M₂)'),
          R('星 2 轨道半径', f(r2, 2), 'm', 'r₂ = M₁d/(M₁+M₂)'),
          R('共同周期 T', f(T, 2), 's', 'T = 2π√(d³/G(M₁+M₂))'),
          R('角速度 ω', f(omega, 3), 'rad/s', '两星相同'),
          R('质量比 M₁/M₂', f(M1 / M2, 2), '', '半径比等于质量反比'),
        ],
        note: '双星靠彼此万有引力提供向心力，绕共同质心转动：轨道半径与质量成反比，周期和角速度相同。',
        formula: {
          expr: 'G M₁M₂/d² = M₁ω²r₁ = M₂ω²r₂',
          sub: 'r₁:r₂ = M₂:M₁ = ' + f(r1, 2) + ':' + f(r2, 2),
        },
        g: { mode: 0, r1, r2, d, th, omega, T, ratio: r1 / Math.max(r2, 1e-6) },
      }
    }

    case 'charge': {
      const v = num(p, 'v', 1e7)
      const B = num(p, 'B', 0.5)
      const qm = num(p, 'qm', 1e8)
      const r = v / (qm * B)
      const omega = qm * B
      const T = (2 * Math.PI) / omega
      const th = (omega * t * 1e-8) % (Math.PI * 2)
      return {
        readings: [
          R('速度 v', f(v / 1e7, 2), '×10⁷ m/s', '垂直进入磁场', 'accent'),
          R('磁感应强度 B', f(B, 2), 'T'),
          R('比荷 q/m', f(qm / 1e8, 2), '×10⁸ C/kg'),
          R('轨道半径 r', f(r * 100, 2), 'cm', 'r = mv/(qB)'),
          R('回旋周期 T', f(T * 1e9, 2), 'ns', '与速度无关'),
          R('洛伦兹力 F', 'qvB', '', '始终指向圆心'),
        ],
        note: '带电粒子垂直进入匀强磁场，洛伦兹力提供向心力，做匀速圆周运动；半径与速度成正比，周期与速度无关。',
        formula: { expr: 'qvB = mv²/r，r = mv/(qB)，T = 2πm/(qB)', sub: 'r = ' + f(r * 100, 2) + ' cm' },
        g: { r, th, v, B, qm, T },
      }
    }

    case 'twinRod': {
      const m1 = num(p, 'm1', 0.2)
      const m2 = num(p, 'm2', 0.1)
      const v0 = num(p, 'v0', 2)
      const B = num(p, 'B', 0.5)
      const L = num(p, 'L', 0.4)
      const Rl = num(p, 'R', 0.2)
      const vf = (m1 * v0) / (m1 + m2)
      const I0 = (B * L * v0) / Rl
      const heat = 0.5 * m1 * v0 * v0 - 0.5 * (m1 + m2) * vf * vf
      const phase = t % 4
      const tau = 1.2
      const v1 = vf + (v0 - vf) * Math.exp(-phase / tau)
      const v2 = vf * (1 - Math.exp(-phase / tau))
      const x1 = 0.18 + 0.1 * Math.sin(phase * 0.4)
      const x2 = 0.55 + 0.1 * Math.sin(phase * 0.4 + 0.6)
      return {
        readings: [
          R('杆 1 初速度', f(v0, 2), 'm/s', '受安培力减速', 'accent'),
          R('最终共同速度', f(vf, 2), 'm/s', '动量守恒'),
          R('初始感应电流', f(I0, 2), 'A', 'I = BLv/R'),
          R('总焦耳热', f(heat, 2), 'J', '机械能减少量'),
          R('杆 1 速度', f(v1, 2), 'm/s', '', 'accent'),
          R('杆 2 速度', f(v2, 2), 'm/s', '从静止被安培力带动'),
        ],
        note: '两根杆在导轨上运动时，回路面积变化产生感应电流；安培力使两杆速度趋于相同，最终一起匀速，动量守恒、机械能转化为焦耳热。',
        formula: {
          expr: 'm₁v₀ = (m₁+m₂)v共，Q = ½m₁v₀² − ½(m₁+m₂)v共²',
          sub: 'v共 = ' + f(vf, 2) + ' m/s，Q = ' + f(heat, 2) + ' J',
        },
        g: { x1, x2, v1, v2, vf, B, L, I0, heat },
      }
    }

    case 'slope': {
      const th = num(p, 'theta', 30)
      const mu = num(p, 'mu', 0.2)
      const m = num(p, 'm', 1)
      const a = G * (Math.sin(th * DEG) - mu * Math.cos(th * DEG))
      const N = m * G * Math.cos(th * DEG)
      const fr = mu * N
      const phase = t % 3
      const s = Math.max(0, 0.5 * a * phase * phase)
      return {
        readings: [
          R('倾角 θ', f(th, 0), '°', '', 'accent'),
          R('沿斜面加速度 a', f(a, 2), 'm/s²', 'a = g(sinθ − μcosθ)'),
          R('支持力 N', f(N, 2), 'N', 'N = mgcosθ'),
          R('摩擦力 f', f(fr, 2), 'N', 'f = μN'),
          R('下滑距离 s', f(s, 2), 'm', a <= 0 ? '静止（μ ≥ tanθ）' : ''),
          R('速度 v', f(Math.max(0, a * phase), 2), 'm/s'),
        ],
        note: a <= 0
          ? '摩擦力足够大（μ ≥ tanθ），物块在斜面上保持静止；此时摩擦力是静摩擦，大小等于 mg sinθ。'
          : '物块沿斜面下滑，重力沿斜面的分力大于最大静摩擦，加速度由重力分量与滑动摩擦共同决定。',
        formula: {
          expr: 'a = g(sinθ − μcosθ)，N = mgcosθ，f = μN',
          sub: 'a = ' + f(a, 2) + ' m/s²，N = ' + f(N, 2) + ' N',
        },
        g: { th, mu, m, a, N, fr, s },
      }
    }

    case 'wave': {
      const Um = num(p, 'Um', 311)
      const freq = num(p, 'f', 50)
      const U = Um / Math.SQRT2
      const T = 1 / freq
      const th = (2 * Math.PI * freq * t) % (Math.PI * 2)
      const u = Um * Math.sin(th)
      const ts = lin(0, 0.06, 60)
      const curve = ts.map((q): [number, number] => [q, Um * Math.sin(2 * Math.PI * freq * q)])
      const rms = ts.map((q): [number, number] => [q, U])
      return {
        readings: [
          R('峰值 Um', f(Um, 1), 'V', '最大值', 'accent'),
          R('有效值 U', f(U, 1), 'V', 'U = Um/√2'),
          R('频率 f', f(freq, 0), 'Hz', '我国市电 50 Hz'),
          R('周期 T', f(T * 1000, 1), 'ms'),
          R('瞬时值 u', f(u, 1), 'V', '', 'accent'),
          R('角频率 ω', f(2 * Math.PI * freq, 1), 'rad/s'),
        ],
        chart: {
          title: '正弦交流电的波形与有效值',
          xLabel: 't / s',
          yLabel: 'u / V',
          xRange: [0, 0.06],
          yRange: [-Um * 1.15, Um * 1.15],
          series: [
            { pts: curve, label: 'u(t)' },
            { pts: rms, dashed: true, color: '#9a5b4a', label: 'U有效' },
          ],
          cursor: [t % 0.06, u],
          hline: 0,
        },
        note: '有效值是从发热效果定义的：让交流电和直流电分别通过同一电阻，在相同时间内产生相同热量，这个直流电的值就是交流电的有效值。正弦交流电 U = Um/√2。',
        formula: { expr: 'U = Um/√2，T = 1/f，u = Um sin(ωt)', sub: 'U = ' + f(Um, 1) + '/√2 = ' + f(U, 1) + ' V' },
        g: { Um, U, freq, T, u, th },
      }
    }

    case 'levels': {
      const mode = str(p, 'mode', 'transition')
      if (mode === 'photoelectric') {
        const W = num(p, 'W', 2.2)
        const Eph = num(p, 'Eph', 3.0)
        const Kmax = Math.max(0, Eph - W)
        const hc = 1240
        const lambda = Eph > 0 ? hc / Eph : 0
        return {
          readings: [
            R('入射光子能量', f(Eph, 2), 'eV', 'E = hν', 'accent'),
            R('逸出功 W', f(W, 2), 'eV', '金属的固有属性'),
            R('最大初动能', f(Kmax, 2), 'eV', 'Ek = hν − W', Kmax > 0 ? 'accent' : 'warn'),
            R('截止电压', f(Kmax, 2), 'V', 'eUc = Ek'),
            R('入射光波长', f(lambda, 0), 'nm', 'λ = hc/E'),
            R('能否发生光电效应', Eph >= W ? '能' : '不能', '', Eph >= W ? '' : '低于截止频率'),
          ],
          note: '光电效应的条件是入射光频率大于截止频率（光子能量大于逸出功）；最大初动能随频率增大而增大，与光强无关。',
          formula: { expr: 'Ek = hν − W，eUc = Ek', sub: 'Ek = ' + f(Eph, 2) + ' − ' + f(W, 2) + ' = ' + f(Kmax, 2) + ' eV' },
          g: { mode: 1, Kmax, W, Eph },
        }
      }
      const n1 = Math.max(1, Math.round(num(p, 'n1', 1)))
      const n2 = Math.max(1, Math.round(num(p, 'n2', 3)))
      const E1 = -13.6 / (n1 * n1)
      const E2 = -13.6 / (n2 * n2)
      const dE = Math.abs(E2 - E1)
      const lambda = 1240 / Math.max(dE, 1e-9)
      const up = E2 > E1
      return {
        readings: [
          R('初态能级 n₁', String(n1), '', 'E = −13.6/n² eV'),
          R('末态能级 n₂', String(n2), ''),
          R('能级差 ΔE', f(dE, 2), 'eV', 'hν = ΔE', 'accent'),
          R('光子波长 λ', f(lambda, 0), 'nm', 'λ = hc/ΔE'),
          R('跃迁方向', up ? '吸收光子' : '放出光子', '', up ? '向高能级跃迁' : '向低能级跃迁'),
          R('基态能量', '-13.6', 'eV', '氢原子'),
        ],
        note: '氢原子能级 Eₙ = −13.6/n² eV；电子在两能级间跃迁时吸收或放出能量等于能级差的光子，hν = ΔE。',
        formula: { expr: 'hν = |E₂ − E₁|，Eₙ = −13.6/n² eV', sub: 'ΔE = ' + f(dE, 2) + ' eV，λ = ' + f(lambda, 0) + ' nm' },
        g: { mode: 0, n1, n2, dE, lambda, E1, E2 },
      }
    }

    case 'cyclotron': {
      const B = num(p, 'B', 1)
      const Rr = num(p, 'R', 0.5)
      const qm = num(p, 'qm', 1e8)
      const freq = (qm * B) / (2 * Math.PI)
      const Kmax = (0.5 * qm * (B * Rr) * (B * Rr)) / 1e6
      const vmax = qm * B * Rr
      const phase = (t * 1.4) % (Math.PI * 2)
      return {
        readings: [
          R('磁感应强度 B', f(B, 2), 'T', '', 'accent'),
          R('D 形盒半径 R', f(Rr * 100, 0), 'cm'),
          R('比荷 q/m', f(qm / 1e8, 2), '×10⁸ C/kg'),
          R('回旋频率 f', f(freq / 1e6, 2), 'MHz', 'f = qB/(2πm)，与速度无关'),
          R('最大速度', f(vmax / 1e7, 2), '×10⁷ m/s', 'v = qBR/m'),
          R('最大动能', f(Kmax, 1), 'MeV', 'Ek = q²B²R²/(2m)', 'accent'),
        ],
        note: '回旋加速器用电场加速、磁场偏转；回旋周期与速度无关，所以交流电频率固定。粒子最终能量只由磁场和 D 形盒半径决定。',
        formula: { expr: 'f = qB/(2πm)，Ek = q²B²R²/(2m)', sub: 'f = ' + f(freq / 1e6, 2) + ' MHz，Ek = ' + f(Kmax, 1) + ' MeV' },
        g: { B, R: Rr, freq, Kmax, phase, qm },
      }
    }

    default:
      return {
        readings: [R('模型', '待补充')],
        note: '这个模型还没有演示。',
        g: {},
      }
  }
}
