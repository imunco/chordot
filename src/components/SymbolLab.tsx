import { useEffect, useMemo, useRef, useState } from 'react'
import { evaluate } from 'mathjs'

/**
 * 符号公式实验室（独立窗口）。
 *
 * 把物理符号拖到一起拼成表达式，表达式就是作用在小球上的合力：
 * 拼 `-k*x` 得到简谐运动，拼 `-k*x - c*v` 得到阻尼振动，拼 `m*g` 就是重力。
 * 灵感来自 physics-sandbox 的「符号拼公式」，但换成我们自己的场景与排版。
 */

type Tok =
  | { t: 'sym'; id: string }
  | { t: 'num'; v: string }
  | { t: 'op'; v: string }
  | { t: 'paren'; v: '(' | ')' }

interface SymDef {
  id: string
  label: string
  unit: string
  group: '状态' | '常量' | '导出量'
  hint: string
}

const SYMBOLS: SymDef[] = [
  { id: 'x', label: 'x', unit: 'm', group: '状态', hint: '小球位置' },
  { id: 'v', label: 'v', unit: 'm/s', group: '状态', hint: '小球速度' },
  { id: 'a', label: 'a', unit: 'm/s²', group: '状态', hint: '小球加速度（上一帧）' },
  { id: 't', label: 't', unit: 's', group: '状态', hint: '时间' },
  { id: 'm', label: 'm', unit: 'kg', group: '常量', hint: '小球质量' },
  { id: 'g', label: 'g', unit: 'm/s²', group: '常量', hint: '重力加速度' },
  { id: 'k', label: 'k', unit: 'N/m', group: '常量', hint: '劲度系数' },
  { id: 'c', label: 'c', unit: 'N·s/m', group: '常量', hint: '阻尼系数' },
  { id: 'F', label: 'F₀', unit: 'N', group: '常量', hint: '外力常量' },
  { id: 'mu', label: 'μ', unit: '', group: '常量', hint: '动摩擦因数' },
  { id: 'pi', label: 'π', unit: '', group: '常量', hint: '圆周率' },
  { id: 'G', label: 'G', unit: '', group: '常量', hint: '引力常量' },
  { id: 'M', label: 'M', unit: 'kg', group: '常量', hint: '地球质量' },
  { id: 'r', label: 'r', unit: 'm', group: '常量', hint: '地球半径' },
  { id: 'N', label: 'N', unit: 'N', group: '导出量', hint: '支持力 mg' },
  { id: 'E', label: 'E', unit: 'J', group: '导出量', hint: '动能 ½mv²' },
  { id: 'W', label: 'W', unit: 'J', group: '导出量', hint: '功 F₀x' },
  { id: 'P', label: 'P', unit: 'W', group: '导出量', hint: '功率 F₀v' },
  { id: 'omega', label: 'ω', unit: 'rad/s', group: '导出量', hint: '圆频率 √(k/m)' },
]

const PRESETS: { label: string; expr: string }[] = [
  { label: '重力 m·g', expr: 'm*g' },
  { label: '弹簧回复力 −k·x', expr: '-k*x' },
  { label: '阻尼振动 −k·x − c·v', expr: '-k*x-c*v' },
  { label: '匀加速 F₀', expr: 'F' },
  { label: '动能 ½mv²', expr: '0.5*m*v^2' },
  { label: '万有引力 GMm/r²', expr: 'G*M*m/r^2' },
]

const X_LIMIT = 4.2
const TRACK_PX = 88 // 每米像素
const HISTORY = 520

const fmt = (v: number, d = 2) => {
  if (!Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0)) return v.toExponential(2)
  return v.toFixed(d)
}

function tokensFromExpr(expr: string): Tok[] {
  const out: Tok[] = []
  const re = /([A-Za-z_]+|\d+(?:\.\d+)?|[+\-*/^()])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(expr))) {
    const raw = m[1]
    if (raw === '(' || raw === ')') out.push({ t: 'paren', v: raw })
    else if (/^\d/.test(raw)) out.push({ t: 'num', v: raw })
    else if (SYMBOLS.some((s) => s.id === raw)) out.push({ t: 'sym', id: raw })
    else {
      // 不认识的写法按运算符塞进去，交给求值器报错
      out.push({ t: 'op', v: raw })
    }
  }
  return out
}

const exprOf = (tokens: Tok[]) =>
  tokens.map((k) => (k.t === 'sym' ? k.id : k.v)).join('')

/** 公式里的 ^ 后面跟数字时渲染成上标，读起来像课本 */
function FormulaView({ tokens }: { tokens: Tok[] }) {
  return (
    <div className="symlab__tokens">
      {tokens.map((tok, i) => {
        if (tok.t === 'sym') {
          const def = SYMBOLS.find((s) => s.id === tok.id)
          return (
            <span key={i} className="symlab__tok symlab__tok--sym">
              {def?.label ?? tok.id}
            </span>
          )
        }
        if (tok.t === 'op' && tok.v === '*') {
          return (
            <span key={i} className="symlab__tok symlab__tok--op">
              ·
            </span>
          )
        }
        if (tok.t === 'op' && tok.v === '^') {
          return (
            <span key={i} className="symlab__tok symlab__tok--op">
              ^
            </span>
          )
        }
        return (
          <span key={i} className={`symlab__tok ${tok.t === 'op' ? 'symlab__tok--op' : ''}`}>
            {tok.v.replace('-', '−')}
          </span>
        )
      })}
    </div>
  )
}

export function SymbolLab() {
  const [tokens, setTokens] = useState<Tok[]>(() => tokensFromExpr('-k*x-c*v'))
  const [playing, setPlaying] = useState(true)
  const [mass, setMass] = useState(1)
  const [g, setG] = useState(9.8)
  const [k, setK] = useState(8)
  const [c, setC] = useState(0.35)
  const [f0, setF0] = useState(2)
  const [sim, setSim] = useState({ x: 1.8, v: 0, t: 0 })
  const [force, setForce] = useState(0)
  const [error, setError] = useState('')
  const [sent, setSent] = useState('')
  const histRef = useRef<{ t: number; x: number }[]>([])
  /** 积分用的真值：每帧只在最后 setSim 一次，避免 120Hz 步进把 React 刷爆 */
  const stateRef = useRef({ x: 1.8, v: 0, t: 0 })
  const forceRef = useRef(0)

  const expr = exprOf(tokens)
  const scope = useMemo(
    () => ({
      x: sim.x,
      v: sim.v,
      t: sim.t,
      a: force / Math.max(0.05, mass),
      m: mass,
      g,
      k,
      c,
      F: f0,
      mu: 0.3,
      pi: Math.PI,
      G: 6.67e-11,
      M: 5.97e24,
      r: 6.37e6,
      N: mass * g,
      E: 0.5 * mass * sim.v ** 2,
      W: f0 * sim.x,
      P: f0 * sim.v,
      omega: Math.sqrt(k / Math.max(0.05, mass)),
    }),
    [sim, force, mass, g, k, c, f0],
  )

  /**
   * 求值：x / v / t 必须取「当前帧」的值（stateRef），不能读渲染时闭包里的 scope，
   * 否则循环里用的是循环启动那一刻的旧值，拼 -k*x 会变成常力。
   */
  const evalForce = (): number => {
    if (!expr.trim()) return 0
    const s = stateRef.current
    const live = {
      ...scope,
      x: s.x,
      v: s.v,
      t: s.t,
      a: forceRef.current / Math.max(0.05, mass),
    }
    try {
      const out = evaluate(expr, live) as unknown
      const n = typeof out === 'number' ? out : Number(out)
      if (!Number.isFinite(n)) return 0
      setError('')
      return Math.max(-500, Math.min(500, n))
    } catch (err) {
      setError(err instanceof Error ? err.message.split('\n')[0] : '表达式无法求值')
      return 0
    }
  }

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    let acc = 0
    const step = 1 / 120
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      acc += dt
      let guard = 0
      let F = forceRef.current
      while (acc >= step && guard++ < 8) {
        F = evalForce()
        const a = F / Math.max(0.05, mass)
        const s = stateRef.current
        let v = s.v + a * step
        let x = s.x + v * step
        if (x > X_LIMIT || x < -X_LIMIT) {
          x = Math.max(-X_LIMIT, Math.min(X_LIMIT, x))
          v = 0
        }
        const t = s.t + step
        stateRef.current = { x, v, t }
        const h = histRef.current
        h.push({ t, x })
        if (h.length > HISTORY) h.shift()
        acc -= step
      }
      forceRef.current = F
      setForce(F)
      setSim({ ...stateRef.current })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, expr, mass, k, c, g, f0])

  const reset = () => {
    histRef.current = []
    stateRef.current = { x: 1.8, v: 0, t: 0 }
    forceRef.current = 0
    setSim({ x: 1.8, v: 0, t: 0 })
    setForce(0)
    setPlaying(true)
  }

  const append = (tok: Tok) => {
    setTokens((prev) => {
      const last = prev[prev.length - 1]
      const numish = (t: Tok | undefined) =>
        !!t && (t.t === 'sym' || t.t === 'num' || (t.t === 'paren' && t.v === ')'))
      const startsValue = tok.t === 'sym' || tok.t === 'num' || (tok.t === 'paren' && tok.v === '(')
      const needMul = startsValue && numish(last)
      return needMul ? [...prev, { t: 'op', v: '*' }, tok] : [...prev, tok]
    })
  }

  const back = () => setTokens((prev) => prev.slice(0, -1))
  const clear = () => setTokens([])

  const values = SYMBOLS.map((s) => ({ ...s, value: (scope as Record<string, number>)[s.id] }))
  const groups: SymDef['group'][] = ['状态', '常量', '导出量']

  // 轨道：屏幕 x = 中心 + x * TRACK_PX；小球会被限制在 ±X_LIMIT
  const W = 760
  const H = 230
  const cx = W / 2
  const railY = 150
  const ballX = cx + sim.x * TRACK_PX

  // x-t 曲线
  const hist = histRef.current
  const tMax = Math.max(4, hist.length ? hist[hist.length - 1].t : 4)
  const chartW = 700
  const chartH = 120
  const px = (t: number) => 40 + (t / tMax) * chartW
  const py = (x: number) => 60 - (x / X_LIMIT) * 48
  const path = hist.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.t).toFixed(1)} ${py(p.x).toFixed(1)}`).join(' ')

  return (
    <div className="symlab">
      <header className="symlab__head">
        <div>
          <div className="symlab__brand">符号公式实验室</div>
          <div className="symlab__sub">
            把符号拖进公式区（或点一下追加），拼出来的表达式就是作用在小球上的合力 F —— 拼 F(x, v, t) 就是在解运动方程
          </div>
        </div>
        <button className="symlab__close" onClick={() => window.close()}>
          关闭窗口
        </button>
      </header>

      <div className="symlab__body">
        <aside className="symlab__palette">
          {groups.map((grp) => (
            <div key={grp} className="symlab__group">
              <div className="symlab__grouptitle">{grp}</div>
              <div className="symlab__chips">
                {values
                  .filter((v) => v.group === grp)
                  .map((s) => (
                    <button
                      key={s.id}
                      className="symlab__chip"
                      draggable
                      title={`${s.hint}（${s.unit || '无量纲'}）`}
                      data-sym={s.id}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/chordot-sym', s.id)
                        e.dataTransfer.effectAllowed = 'copy'
                      }}
                      onClick={() => append({ t: 'sym', id: s.id })}
                    >
                      <b>{s.label}</b>
                      <i>{fmt(s.value)}</i>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </aside>

        <main className="symlab__main">
          <div
            className="symlab__formula"
            onDragOver={(e) => {
              if (Array.from(e.dataTransfer.types).includes('text/chordot-sym')) {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
              }
            }}
            onDrop={(e) => {
              const id = e.dataTransfer.getData('text/chordot-sym')
              if (!id) return
              e.preventDefault()
              append({ t: 'sym', id })
            }}
          >
            <div className="symlab__formulaline">
              <span className="symlab__f">F =</span>
              {tokens.length === 0 ? (
                <span className="symlab__empty">把符号拖进来，或用下面的键拼</span>
              ) : (
                <FormulaView tokens={tokens} />
              )}
            </div>
            <div className="symlab__keys">
              {['+', '-', '*', '/', '^', '(', ')'].map((op) => (
                <button key={op} onClick={() => append({ t: 'op', v: op })}>
                  {op.replace('*', '×').replace('/', '÷').replace('-', '−')}
                </button>
              ))}
              {['1', '2', '3', '4', '5', '0', '.'].map((d) => (
                <button key={d} onClick={() => append({ t: 'num', v: d })}>
                  {d}
                </button>
              ))}
              <button onClick={back} title="退一格">
                ⌫
              </button>
              <button onClick={clear} title="清空公式">
                清空
              </button>
            </div>
            {error && <div className="symlab__err">公式有问题：{error}</div>}
            <div className="symlab__presets">
              {PRESETS.map((p) => (
                <button key={p.expr} onClick={() => setTokens(tokensFromExpr(p.expr))}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="symlab__stage">
            <div className="symlab__stagetop">
              <button className="symlab__play" data-active={playing} onClick={() => setPlaying((v) => !v)}>
                {playing ? '暂停' : '播放'}
              </button>
              <button className="symlab__mini" onClick={reset}>
                重置
              </button>
              <button
                className="symlab__mini symlab__send"
                title="把公式作为 F(x,v,t) 发给主窗口里机构选中的部件"
                onClick={() => {
                  void window.chordot?.applySymbolForce?.(expr)
                  setSent(`已发送 F = ${expr}`)
                  window.setTimeout(() => setSent(''), 2400)
                }}
              >
                发送到机构
              </button>
              {sent && <span className="symlab__sent">{sent}</span>}
              <span className="symlab__now">
                F = <b>{fmt(force)}</b> N　a = <b>{fmt(force / Math.max(0.05, mass))}</b> m/s²　v ={' '}
                <b>{fmt(sim.v)}</b> m/s　x = <b>{fmt(sim.x)}</b> m　t = <b>{fmt(sim.t, 2)}</b> s
              </span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="symlab__svg" role="img" aria-label="小球">
              <line x1={20} y1={railY} x2={W - 20} y2={railY} stroke="#cfc9c0" strokeWidth={1.2} />
              {Array.from({ length: 9 }, (_, i) => {
                const x = cx + (i - 4) * TRACK_PX
                return (
                  <g key={i}>
                    <line x1={x} y1={railY} x2={x} y2={railY + 7} stroke="#d8d3cb" strokeWidth={1} />
                    <text x={x} y={railY + 20} textAnchor="middle" fontSize={9} fill="#9a958d">
                      {i - 4}
                    </text>
                  </g>
                )
              })}
              {/* 力箭头 */}
              {Math.abs(force) > 0.05 && (
                <g>
                  <line
                    x1={ballX}
                    y1={railY - 34}
                    x2={ballX + Math.max(-120, Math.min(120, force * 6))}
                    y2={railY - 34}
                    stroke="#3d5a66"
                    strokeWidth={2}
                    markerEnd="url(#symArrow)"
                  />
                  <text x={ballX} y={railY - 44} textAnchor="middle" fontSize={10} fill="#3d5a66">
                    F = {fmt(force)} N
                  </text>
                </g>
              )}
              <defs>
                <marker id="symArrow" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
                  <path d="M0 0 L6 3 L0 6 z" fill="#3d5a66" />
                </marker>
              </defs>
              <circle cx={ballX} cy={railY - 11} r={11} fill="#e7e3dc" stroke="#3d5a66" strokeWidth={1.3} />
              <circle cx={ballX - 3} cy={railY - 14} r={2.6} fill="#fbfaf7" opacity={0.85} />
              <line
                x1={ballX}
                y1={railY - 11}
                x2={ballX + Math.max(-70, Math.min(70, sim.v * 18))}
                y2={railY - 11}
                stroke="#8b8a84"
                strokeWidth={1.4}
                markerEnd="url(#symArrow)"
                opacity={0.7}
              />
            </svg>
            <svg viewBox={`0 0 ${W} ${chartH}`} className="symlab__chart" role="img" aria-label="x-t 图">
              <line x1={40} y1={py(0)} x2={40 + chartW} y2={py(0)} stroke="#ddd8d0" strokeWidth={0.9} />
              <text x={8} y={py(0) + 3} fontSize={9} fill="#9a958d">
                0
              </text>
              <text x={8} y={py(X_LIMIT) + 3} fontSize={9} fill="#9a958d">
                {X_LIMIT}
              </text>
              <text x={W - 12} y={chartH - 8} textAnchor="end" fontSize={9} fill="#9a958d">
                x-t
              </text>
              {path && <path d={path} fill="none" stroke="#3d5a66" strokeWidth={1.4} />}
            </svg>
          </div>

          <div className="symlab__knobs">
            {[
              { label: '质量 m', unit: 'kg', value: mass, set: setMass, min: 0.1, max: 10, step: 0.1 },
              { label: '劲度 k', unit: 'N/m', value: k, set: setK, min: 0, max: 40, step: 0.5 },
              { label: '阻尼 c', unit: 'N·s/m', value: c, set: setC, min: 0, max: 6, step: 0.05 },
              { label: '重力 g', unit: 'm/s²', value: g, set: setG, min: 0, max: 20, step: 0.1 },
              { label: '外力 F₀', unit: 'N', value: f0, set: setF0, min: -20, max: 20, step: 0.5 },
            ].map((kn) => (
              <label key={kn.label} className="symlab__knob">
                <span>{kn.label}</span>
                <input
                  type="range"
                  min={kn.min}
                  max={kn.max}
                  step={kn.step}
                  value={kn.value}
                  onChange={(e) => kn.set(Number(e.target.value))}
                />
                <b>
                  {kn.value.toFixed(kn.step < 1 ? 2 : 1)}
                  <i>{kn.unit}</i>
                </b>
              </label>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
