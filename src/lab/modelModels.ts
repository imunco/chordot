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


    case 'collision': {
      const m1 = num(p, 'm1', 0.2)
      const m2 = num(p, 'm2', 0.3)
      const v1 = num(p, 'v1', 1.2)
      const kind = str(p, 'type', 'inelastic')
      const isExplosion = exp.id.includes('explosion')
      const isBullet = exp.id.includes('bullet')
      const vf = (m1 * v1) / (m1 + m2)
      const v1e = ((m1 - m2) * v1) / (m1 + m2)
      const v2e = (2 * m1 * v1) / (m1 + m2)
      const v2x = isExplosion ? -(m1 * v1) / m2 : 0
      const common = vf
      const elastic = !isExplosion && kind === 'elastic'
      const v1f = isExplosion ? v1 : elastic ? v1e : common
      const v2f = isExplosion ? v2x : elastic ? v2e : common
      const e0 = 0.5 * m1 * v1 * v1
      const e1 = 0.5 * m1 * v1f * v1f + 0.5 * m2 * v2f * v2f
      const loss = Math.max(0, e0 - e1)
      const gain = isExplosion ? e1 : 0
      const phase = t % 3.4
      const hit = 1.1
      const before = phase < hit
      const x1 = before ? 120 + phase * 180 : 120 + hit * 180 + (phase - hit) * 70
      const x2 = before ? 560 : 560 + (phase - hit) * (v2f / Math.max(0.2, Math.abs(v1))) * 120
      return {
        readings: [
          R('碰前总动量', f(m1 * v1, 2), 'kg·m/s', '水平方向守恒', 'accent'),
          R('物体 1 碰后速度', f(v1f, 2), 'm/s', elastic ? '弹性正碰' : '与物体 2 共速'),
          R('物体 2 碰后速度', f(v2f, 2), 'm/s', isExplosion ? '反冲碎片' : ''),
          R(isExplosion ? '释放的动能' : '损失的动能', f(isExplosion ? gain : loss, 2), 'J', isExplosion ? '化学能转为动能' : '转为内能', isExplosion ? 'accent' : 'warn'),
          R('质量比 m₁/m₂', f(m1 / m2, 2), '', '动量分配与质量有关'),
          R('恢复系数', isExplosion ? '—' : elastic ? '1.00' : '0.00', '', elastic ? '动能守恒' : '完全非弹性'),
        ],
        chart: {
          title: isExplosion ? '爆炸前后的动量' : '碰撞前后速度',
          xLabel: 't / s',
          yLabel: 'v / (m/s)',
          xRange: [0, 3.4],
          yRange: [Math.min(-Math.abs(v2f), 0) * 1.2, Math.max(Math.abs(v1), Math.abs(v1f), 1) * 1.2],
          series: [
            { pts: [[0, v1], [hit, v1], [hit, v1f], [3.4, v1f]], label: '物体 1' },
            { pts: [[0, 0], [hit, 0], [hit, v2f], [3.4, v2f]], color: '#9a5b4a', dashed: true, label: '物体 2' },
          ],
          cursor: [phase, before ? v1 : v1f],
          hline: 0,
        },
        note: isExplosion
          ? '爆炸时间极短，内力远大于外力，系统动量守恒；化学能转化为碎片动能，所以总动能增加。'
          : elastic
            ? '弹性碰撞同时满足动量守恒和动能守恒；等质量时两物体交换速度。'
            : '完全非弹性碰撞碰后共速，动量守恒，动能损失最大。',
        formula: {
          expr: isExplosion ? '0 = m₁v₁ + m₂v₂' : elastic ? 'm₁v₁ = m₁v₁′ + m₂v₂′，动能守恒' : 'm₁v₁ = (m₁+m₂)v',
          sub: isExplosion ? 'v₂ = ' + f(v2f, 2) + ' m/s' : 'v共 = ' + f(common, 2) + ' m/s，ΔEk = ' + f(loss, 2) + ' J',
        },
        g: { mode: isExplosion ? 2 : isBullet ? 1 : 0, kind: elastic ? 1 : 0, x1, x2, v1, v2: v2f, vf: v1f, loss, phase, m1, m2, hit, elastic: elastic ? 1 : 0 },
      }
    }

    case 'pendulum': {
      const L = num(p, 'L', 1)
      const th0 = num(p, 'th0', 5)
      const T = 2 * Math.PI * Math.sqrt(L / G)
      const omega = (2 * Math.PI) / T
      const th = th0 * Math.cos(omega * t)
      const v = L * omega * (th0 * DEG) * Math.sin(omega * t)
      const tension = 0.2 * G + (0.2 * v * v) / L
      const ts = lin(0, T * 2, 80)
      return {
        readings: [
          R('摆长 L', f(L, 2), 'm', '悬点到球心', 'accent'),
          R('周期 T', f(T, 2), 's', 'T = 2π√(L/g)', 'accent'),
          R('摆角 θ', f(th, 1), '°', '小角度简谐运动'),
          R('摆球速度 v', f(Math.abs(v), 2), 'm/s', '最低点最大'),
          R('摆球质量 m', '0.20', 'kg', '周期与质量无关'),
          R('重力加速度 g', f(G, 1), 'm/s²', '可反求 g = 4π²L/T²'),
        ],
        chart: {
          title: '单摆摆角随时间变化',
          xLabel: 't / s',
          yLabel: 'θ / (°)',
          xRange: [0, T * 2],
          yRange: [-th0 * 1.2, th0 * 1.2],
          series: [{ pts: ts.map((q): [number, number] => [q, th0 * Math.cos(omega * q)]), label: 'θ(t)' }],
          cursor: [t % (T * 2), th],
          hline: 0,
        },
        note: '摆角小于 5° 时，单摆的回复力与位移成正比，做简谐运动；周期只与摆长和重力加速度有关。',
        formula: { expr: 'T = 2π√(L/g)，θ = θ₀cos(ωt)', sub: 'T = ' + f(T, 2) + ' s，ω = ' + f(omega, 2) + ' rad/s' },
        g: { L, th0, T, omega, th, v, tension, phase: t },
      }
    }

    case 'springOsc': {
      const A = num(p, 'A', 6) / 100
      const k = num(p, 'k', 20)
      const m = num(p, 'm', 0.2)
      const phi = num(p, 'phi', 0) * DEG
      const omega = Math.sqrt(k / m)
      const T = (2 * Math.PI) / omega
      const x = A * Math.cos(omega * t + phi)
      const v = -A * omega * Math.sin(omega * t + phi)
      const a = -omega * omega * x
      const E = 0.5 * k * A * A
      const ts = lin(0, T * 2, 80)
      return {
        readings: [
          R('振幅 A', f(A * 100, 1), 'cm', '', 'accent'),
          R('劲度系数 k', f(k, 0), 'N/m'),
          R('振子质量 m', f(m, 2), 'kg'),
          R('周期 T', f(T, 2), 's', 'T = 2π√(m/k)', 'accent'),
          R('当前位移 x', f(x * 100, 1), 'cm', '相对平衡位置'),
          R('机械能 E', f(E, 2), 'J', '动能与弹性势能之和'),
        ],
        chart: {
          title: '弹簧振子的位移与速度',
          xLabel: 't / s',
          yLabel: 'x / cm',
          xRange: [0, T * 2],
          yRange: [-A * 120, A * 120],
          series: [
            { pts: ts.map((q): [number, number] => [q, A * 100 * Math.cos(omega * q + phi)]), label: 'x(t)' },
            { pts: ts.map((q): [number, number] => [q, (-A * omega * Math.sin(omega * q + phi)) * 18]), color: '#9a5b4a', dashed: true, label: 'v(t)（缩放）' },
          ],
          cursor: [t % (T * 2), x * 100],
          hline: 0,
        },
        note: '弹簧振子受回复力 F = −kx，加速度与位移成正比且反向，所以做简谐运动；周期只由 m 和 k 决定，与振幅无关。',
        formula: { expr: 'F = −kx，T = 2π√(m/k)', sub: 'T = ' + f(T, 2) + ' s，ω = ' + f(omega, 2) + ' rad/s' },
        g: { A, k, m, omega, T, x, v, a, E, phase: t, phi },
      }
    }

    case 'projectile': {
      const v0 = num(p, 'v0', 4)
      const h = num(p, 'h', 1.25)
      const tFall = Math.sqrt((2 * h) / G)
      const cycle = t % (tFall + 1.2)
      const tt = Math.min(cycle, tFall)
      const x = v0 * tt
      const drop = 0.5 * G * tt * tt
      const vy = G * tt
      const vt = Math.hypot(v0, vy)
      const ang = (Math.atan2(vy, v0) * 180) / Math.PI
      const ts = lin(0, tFall, 60)
      return {
        readings: [
          R('初速度 v₀', f(v0, 1), 'm/s', '水平方向', 'accent'),
          R('抛出高度 h', f(h, 2), 'm'),
          R('飞行时间 t', f(tFall, 2), 's', '只由高度决定', 'accent'),
          R('水平射程 x', f(v0 * tFall, 2), 'm', 'x = v₀t'),
          R('落地速度 v', f(Math.hypot(v0, G * tFall), 2), 'm/s'),
          R('速度偏角 θ', f((Math.atan2(G * tFall, v0) * 180) / Math.PI, 0), '°', 'tanθ = gt/v₀'),
        ],
        chart: {
          title: '平抛轨迹',
          xLabel: 'x / m',
          yLabel: 'y / m',
          xRange: [0, Math.max(1, v0 * tFall) * 1.05],
          yRange: [-h * 0.2, h * 1.1],
          series: [{ pts: ts.map((q): [number, number] => [v0 * q, h - 0.5 * G * q * q]), label: '轨迹' }],
          cursor: [x, h - drop],
        },
        note: '平抛运动水平方向匀速、竖直方向自由落体；飞行时间由高度决定，与初速度无关。',
        formula: { expr: 'x = v₀t，y = ½gt²，t = √(2h/g)', sub: 't = ' + f(tFall, 2) + ' s，x = ' + f(v0 * tFall, 2) + ' m' },
        g: { v0, h, tFall, tt, x, drop, vy, vt, ang, phase: cycle },
      }
    }

    case 'vCircle': {
      const m = num(p, 'm', 0.2)
      const r = num(p, 'r', 0.5)
      const w = num(p, 'w', 6)
      const v = w * r
      const ac = w * w * r
      const centripetal = m * v * v / r
      const top = Math.max(0, centripetal - m * G)
      const bottom = centripetal + m * G
      const vmin = Math.sqrt(G * r)
      const complete = v >= vmin
      const ang = w * t - Math.PI / 2
      const ts = lin(0, (2 * Math.PI) / w, 80)
      return {
        readings: [
          R('圆周半径 r', f(r, 2), 'm', '', 'accent'),
          R('线速度 v', f(v, 2), 'm/s', 'v = ωr'),
          R('向心加速度', f(ac, 2), 'm/s²', 'a = v²/r'),
          R('最高点所需向心力', f(centripetal, 2), 'N'),
          R('最高点绳张力', f(top, 2), 'N', complete ? '绳绷紧' : '绳会松弛', complete ? 'accent' : 'warn'),
          R('最低点绳张力', f(bottom, 2), 'N', 'T − mg = mv²/r'),
          R('临界速度 √(gR)', f(vmin, 2), 'm/s', '绳模型最高点', 'accent'),
        ],
        chart: {
          title: '绳张力随位置变化',
          xLabel: '位置角 / rad',
          yLabel: 'T / N',
          xRange: [0, Math.PI * 2],
          yRange: [0, Math.max(bottom, 1) * 1.15],
          series: [{ pts: ts.map((q): [number, number] => [w * q % (Math.PI * 2), Math.max(0, centripetal + m * G * Math.cos(w * q - Math.PI / 2))]), label: '张力' }],
          cursor: [ang % (Math.PI * 2), Math.max(0, centripetal + m * G * Math.cos(ang))],
        },
        note: complete
          ? '线速度大于临界速度，绳在最高点仍能提供向心力，小球可以完成完整圆周运动。'
          : '线速度小于 √(gR)，最高点重力已大于所需向心力，绳会松弛，小球不能完成完整圆周运动。',
        formula: { expr: 'mg = mv²/R（临界），T = mv²/R ± mg', sub: 'v = ' + f(v, 2) + ' m/s，vmin = ' + f(vmin, 2) + ' m/s' },
        g: { m, r, w, v, ac, top, bottom, vmin, complete: complete ? 1 : 0, ang, phase: t },
      }
    }

    case 'singleRod': {
      const B = num(p, 'B', 0.8)
      const L = num(p, 'L', 0.5)
      const Rl = num(p, 'R', 0.5)
      const v = num(p, 'v', 2)
      const E = B * L * v
      const I = E / Rl
      const F = B * I * L
      const P = I * I * Rl
      const pole = str(p, 'pole', 'N')
      return {
        readings: [
          R('感应电动势 E', f(E, 2), 'V', 'E = BLv', 'accent'),
          R('感应电流 I', f(I, 2), 'A', 'I = E/R'),
          R('安培力 F', f(F, 2), 'N', '阻碍杆的运动', 'warn'),
          R('电功率 P', f(P, 2), 'W', 'I²R'),
          R('磁场方向', pole === 'N' ? 'N 极朝向线圈' : 'S 极朝向线圈', '', '楞次定律判断方向'),
          R('速度 v', f(v, 1), 'm/s', '可拖动参数'),
        ],
        chart: {
          title: '感应电流随速度变化',
          xLabel: 'v / (m/s)',
          yLabel: 'I / A',
          xRange: [0, 6],
          yRange: [0, Math.max(1, (B * L * 6) / Rl)],
          series: [{ pts: lin(0, 6, 50).map((q): [number, number] => [q, (B * L * q) / Rl]), label: 'I(v)' }],
          cursor: [v, I],
        },
        note: '杆切割磁感线产生动生电动势，闭合回路中的感应电流受安培力；安培力总是阻碍杆的相对运动。',
        formula: { expr: 'E = BLv，I = BLv/R，F = B²L²v/R', sub: 'E = ' + f(E, 2) + ' V，F = ' + f(F, 2) + ' N' },
        g: { B, L, R: Rl, v, E, I, F, P, pole: pole === 'N' ? 1 : 0 },
      }
    }

    case 'transformer': {
      const n1 = num(p, 'n1', 400)
      const n2 = num(p, 'n2', 200)
      const U1 = num(p, 'U1', 12)
      const P = num(p, 'P', 400)
      const Rline = num(p, 'Rline', 8)
      const U2 = (U1 * n2) / Math.max(1, n1)
      const I2 = P / Math.max(U2, 1e-6)
      const I1 = P / Math.max(U1, 1e-6)
      const loss = I2 * I2 * Rline
      const eff = P / (P + loss)
      return {
        readings: [
          R('副线圈电压 U₂', f(U2, 2), 'V', 'U₁/U₂ = n₁/n₂', 'accent'),
          R('原线圈电流 I₁', f(I1, 2), 'A', 'P = U₁I₁'),
          R('副线圈电流 I₂', f(I2, 2), 'A', 'P = U₂I₂'),
          R('线路损耗 P损', f(loss, 2), 'W', 'P损 = I₂²R线', loss > P * 0.15 ? 'warn' : undefined),
          R('输电效率', f(eff * 100, 1), '%', 'P/(P+P损)'),
          R('匝数比 n₁:n₂', f(n1, 0) + ':' + f(n2, 0), '', '升压 / 降压'),
        ],
        chart: {
          title: '输电电压与线路损耗',
          xLabel: 'U₂ / V',
          yLabel: 'P损 / W',
          xRange: [0, 120],
          yRange: [0, Math.max(10, (P * P * Rline) / 144)],
          series: [{ pts: lin(1, 120, 60).map((q): [number, number] => [q, (P * P * Rline) / (q * q)]), label: 'P损(U)' }],
          cursor: [U2, loss],
        },
        note: '理想变压器电压比等于匝数比、功率守恒；输送功率一定时，提高输电电压可以减小电流，从而显著减小线路损耗。',
        formula: { expr: 'U₁/U₂ = n₁/n₂，P损 = (P/U₂)²R线', sub: 'U₂ = ' + f(U2, 2) + ' V，P损 = ' + f(loss, 2) + ' W' },
        g: { n1, n2, U1, U2, P, Rline, I1, I2, loss, eff },
      }
    }

    case 'circuit': {
      const E = num(p, 'E', 3)
      const r = num(p, 'r', 0.5)
      const Rl = num(p, 'R', 5)
      const I = E / (Rl + r)
      const U = I * Rl
      const Pr = I * I * r
      const P = I * I * Rl
      const eff = U / E
      return {
        readings: [
          R('总电流 I', f(I, 3), 'A', 'I = E/(R+r)', 'accent'),
          R('路端电压 U', f(U, 2), 'V', 'U = E − Ir'),
          R('外电阻 R', f(Rl, 0), 'Ω', '滑动变阻器'),
          R('内阻损耗 Pr', f(Pr, 2), 'W', 'I²r'),
          R('外电路功率 P', f(P, 2), 'W', 'I²R'),
          R('电源效率 η', f(eff * 100, 1), '%', 'U/E'),
        ],
        chart: {
          title: '路端电压随外电阻变化',
          xLabel: 'R / Ω',
          yLabel: 'U / V',
          xRange: [0, 20],
          yRange: [0, E * 1.1],
          series: [{ pts: lin(0, 20, 60).map((q): [number, number] => [q, (E * q) / (q + r)]), label: 'U(R)' }],
          cursor: [Rl, U],
        },
        note: '闭合电路中，外电阻增大时总电流减小，内阻分压 Ir 减小，所以路端电压 U = E − Ir 增大；动态分析按局部—整体—局部。',
        formula: { expr: 'I = E/(R+r)，U = E − Ir', sub: 'I = ' + f(I, 3) + ' A，U = ' + f(U, 2) + ' V' },
        g: { E, r, R: Rl, I, U, Pr, P, eff },
      }
    }

    case 'energy': {
      const h = num(p, 'h', 0.8)
      const m = num(p, 'm', 2)
      const v = Math.sqrt(2 * G * h)
      const KE = 0.5 * m * v * v
      const PE = m * G * h
      const E = KE + PE
      const phase = t % 2.4
      const drop = Math.min(h, 0.5 * G * phase * phase)
      return {
        readings: [
          R('下落高度 h', f(h, 2), 'm', '', 'accent'),
          R('落地速度 v', f(v, 2), 'm/s', 'v = √(2gh)', 'accent'),
          R('动能 Ek', f(KE, 2), 'J', '½mv²'),
          R('重力势能 Ep', f(PE, 2), 'J', 'mgh（以地面为零势能面）'),
          R('机械能 E', f(E, 2), 'J', 'Ek + Ep，守恒'),
          R('当前下落高度', f(drop, 2), 'm', '动画时刻'),
        ],
        chart: {
          title: '动能与势能随高度变化',
          xLabel: 'h / m',
          yLabel: 'E / J',
          xRange: [0, Math.max(1, h) * 1.05],
          yRange: [0, E * 1.15],
          series: [
            { pts: lin(0, h, 50).map((q): [number, number] => [q, m * G * q]), label: 'Ep(h)' },
            { pts: lin(0, h, 50).map((q): [number, number] => [q, E - m * G * q]), color: '#9a5b4a', dashed: true, label: 'Ek(h)' },
          ],
          cursor: [h - drop, PE - m * G * drop],
        },
        note: '只有重力做功时，动能和重力势能相互转化，机械能总量保持不变；有摩擦等外力做功时，机械能的变化等于其他力做的功。',
        formula: { expr: '½mv² + mgh = 常量，v = √(2gh)', sub: 'v = ' + f(v, 2) + ' m/s，E = ' + f(E, 2) + ' J' },
        g: { h, m, v, KE, PE, E, drop, phase },
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