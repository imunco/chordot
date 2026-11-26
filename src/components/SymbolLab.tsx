import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { evaluate } from 'mathjs'
import {
  BUILTIN_FORMULAS,
  CONSTANT_DEFS,
  DEFAULT_CONSTANTS,
  FORCE_TARGETS,
  MAX_CUSTOM_FORMULAS,
  SYMBOLS,
  loadConstants,
  loadCustomFormulas,
  makeScope,
  newFormulaId,
  saveConstants,
  saveCustomFormulas,
  type ConstDef,
  type CustomFormula,
  type ForceTarget,
  type SymGroup,
  type SymbolForcePayload,
} from '../data/symbolLibrary'

/**
 * 符号公式实验室（独立窗口）。
 *
 * 把物理符号拖到一起拼成表达式，表达式就是作用在小球上的合力：
 * 拼 `-k*x` 得到简谐运动，拼 `-k*x - c*v` 得到阻尼振动，拼 `m*g` 就是重力。
 *
 * 0.16 起多了三件事：
 * - 常量（g/k/c/m…）能改并记住，求值用的就是改过的常量；
 * - 内置公式库一键载入，当前公式也能存进自定义库（localStorage）；
 * - 发送到机构可以选目标：force（旧行为）/ springK / springC / mass。
 *
 * 符号表、公式库、常量的默认值与读写都在 data/symbolLibrary.ts。
 */

type Tok =
  | { t: 'sym'; id: string }
  | { t: 'num'; v: string }
  | { t: 'op'; v: string }
  | { t: 'paren'; v: '(' | ')' }

const X_LIMIT = 4.2
const TRACK_PX = 88 // 每米像素
const HISTORY = 520
const DEFAULT_EXPR = '-k*x-c*v'

/** 新加的少量布局样式：app.css 归 Lead，这里内联，颜色仍取纸面 token */
const S = {
  stageTop: { flexWrap: 'wrap' },
  target: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--text-secondary)' },
  select: {
    height: 24,
    padding: '0 4px',
    fontSize: 11.5,
    color: 'var(--text-primary)',
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 6,
  },
  knobsHead: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  knobRow: { justifyContent: 'space-between' },
  textTitle: { marginTop: 10 },
  noMargin: { margin: 0 },
  presetsRow: { alignItems: 'center' },
  nameInput: { width: 136, height: 24, fontSize: 11.5, textAlign: 'left' },
  custom: { display: 'inline-flex', alignItems: 'center', gap: 2 },
  del: { padding: '2px 6px', fontSize: 11, color: 'var(--text-secondary)', background: 'transparent', borderColor: 'transparent' },
} satisfies Record<string, CSSProperties>

const fmt = (v: number, d = 2) => {
  if (!Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0)) return v.toExponential(2)
  return v.toFixed(d)
}

/** 常量输入框里的显示格式：小到 1e-11、大到 1e24 都别被 toFixed 抹成 0 */
const fmtField = (v: number) => {
  if (!Number.isFinite(v)) return '0'
  const abs = Math.abs(v)
  if (v !== 0 && (abs < 1e-4 || abs >= 1e6)) return v.toExponential(2)
  return String(Number(v.toFixed(4)))
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

const exprOf = (tokens: Tok[]) => tokens.map((k) => (k.t === 'sym' ? k.id : k.v)).join('')

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

/** 常量输入：失焦或回车才提交，边输边改会把 "1" 当成 1（右栏数字输入同款做法） */
function ConstField({ def, value, onCommit }: { def: ConstDef; value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(() => fmtField(value))
  useEffect(() => setText(fmtField(value)), [value])
  const commit = () => {
    const n = Number(text)
    if (!Number.isFinite(n)) {
      setText(fmtField(value))
      return
    }
    const clamped = Math.min(def.max, Math.max(def.min, n))
    onCommit(clamped)
    setText(fmtField(clamped))
  }
  return (
    <span className="numfield">
      <input
        className="numfield__input"
        type="number"
        value={text}
        step={def.step}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
      {def.unit && <span className="numfield__unit">{def.unit}</span>}
    </span>
  )
}

export function SymbolLab() {
  const [tokens, setTokens] = useState<Tok[]>(() => tokensFromExpr(DEFAULT_EXPR))
  const [playing, setPlaying] = useState(true)
  /** 可编辑常量：先从 localStorage 读，改一次就写回去 */
  const [constants, setConstants] = useState<Record<string, number>>(() => loadConstants())
  const [target, setTarget] = useState<ForceTarget>('force')
  const [customs, setCustoms] = useState<CustomFormula[]>(() => loadCustomFormulas())
  const [draftName, setDraftName] = useState('')
  const [sim, setSim] = useState({ x: 1.8, v: 0, t: 0 })
  const [force, setForce] = useState(0)
  const [error, setError] = useState('')
  const [sent, setSent] = useState('')
  const histRef = useRef<{ t: number; x: number }[]>([])
  /** 积分用的真值：每帧只在最后 setSim 一次，避免 120Hz 步进把 React 刷爆 */
  const stateRef = useRef({ x: 1.8, v: 0, t: 0 })
  const forceRef = useRef(0)

  const expr = exprOf(tokens)
  /** 质量既进求值作用域，也进 a = F/m 的积分，统一从常量里取；最小 0.05 kg 防除零 */
  const mass = Math.max(0.05, constants.m)
  const targetDef = FORCE_TARGETS.find((t) => t.id === target) ?? FORCE_TARGETS[0]
  const scope = useMemo(
    () => makeScope({ x: sim.x, v: sim.v, t: sim.t, a: force / mass }, constants),
    // 每帧都会重算一次，量级很小（几次乘除 + 一次开方）
    [sim, force, mass, constants],
  )

  const reportError = (msg: string) => setError((prev) => (prev === msg ? prev : msg))

  /**
   * 求值：x / v / t 必须取「当前帧」的值（stateRef），不能读渲染时闭包里的 scope，
   * 否则循环里用的是循环启动那一刻的旧值，拼 -k*x 会变成常力。
   * 发到机构时也要用这里的原值（不裁剪），所以返回对象而不是直接设错误。
   */
  const evalLive = (): { value: number; bad: string } => {
    if (!expr.trim()) return { value: 0, bad: '' }
    const s = stateRef.current
    const live = makeScope({ x: s.x, v: s.v, t: s.t, a: forceRef.current / mass }, constants)
    try {
      const out = evaluate(expr, live) as unknown
      const n = typeof out === 'number' ? out : Number(out)
      if (!Number.isFinite(n)) return { value: 0, bad: '公式的结果不是实数' }
      return { value: n, bad: '' }
    } catch (err) {
      return { value: 0, bad: err instanceof Error ? err.message.split('\n')[0] : '表达式无法求值' }
    }
  }

  /** 每步积分用的合力：算不出来就当 0，顺手把错误写到界面上 */
  const evalForce = (): number => {
    const { value, bad } = evalLive()
    reportError(bad)
    return bad ? 0 : Math.max(-500, Math.min(500, value))
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
        const a = F / mass
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
  }, [playing, expr, mass, constants])

  /** 暂停时改公式或常量，也要让「现在」那行跟着动 */
  useEffect(() => {
    if (playing) return
    const { value, bad } = evalLive()
    reportError(bad)
    forceRef.current = value
    setForce(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, expr, constants])

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
  const loadFormula = (src: string) => setTokens(tokensFromExpr(src))

  /* ── 常量：改了就落 localStorage，求值作用域和积分都跟着变 ── */

  const setConstant = (id: string, v: number) => {
    const next = { ...constants, [id]: v }
    setConstants(next)
    saveConstants(next)
  }

  const resetConstants = () => {
    const next = { ...DEFAULT_CONSTANTS }
    setConstants(next)
    saveConstants(next)
  }

  /* ── 自定义公式库 ── */

  const saveCurrent = () => {
    const body = expr.trim()
    if (!body) return
    const label = (draftName.trim() || body).slice(0, 24)
    // 同一条公式存过就改名，不重复堆
    const same = customs.find((f) => f.expr === body)
    const next = same
      ? customs.map((f) => (f.id === same.id ? { ...f, label, at: Date.now() } : f))
      : [{ id: newFormulaId(), label, expr: body, at: Date.now() }, ...customs].slice(0, MAX_CUSTOM_FORMULAS)
    setCustoms(next)
    saveCustomFormulas(next)
    setDraftName('')
  }

  const removeCustom = (id: string) => {
    const next = customs.filter((f) => f.id !== id)
    setCustoms(next)
    saveCustomFormulas(next)
  }

  /* ── 发送到机构：target 决定主窗口怎么用这个值 ── */

  const sendToMech = () => {
    // Lead 把签名换成了 { expr, target, value }；global.d.ts 由 Lead 同步，这里收窄一下保持两侧都能编译
    type SymbolForceApi = (payload: SymbolForcePayload) => Promise<boolean>
    const api = window.chordot?.applySymbolForce as unknown as SymbolForceApi | undefined
    if (!api) {
      reportError('这个窗口没连上主进程（缺少 preload 通道），发不出去')
      return
    }
    if (!expr.trim()) {
      reportError('先拼一条公式再发送')
      return
    }
    const { value, bad } = evalLive()
    if (bad) {
      reportError(bad)
      return
    }
    const rounded = Number(value.toPrecision(12))
    void api({ expr, target, value: rounded })
    setSent(`已发送 ${targetDef.label} = ${fmt(rounded)}${targetDef.unit ? ' ' + targetDef.unit : ''}`)
    window.setTimeout(() => setSent(''), 2600)
  }

  const values = SYMBOLS.map((s) => ({ ...s, value: scope[s.id] }))
  const groups: SymGroup[] = ['状态', '常量', '导出量']

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
            把符号拖进公式区（或点一下追加），拼出来的表达式就是作用在小球上的合力 F —— 常量可以改、公式可以存，
            发送时还能把结果写给弹簧、阻尼或质量
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

            <div className="symlab__grouptitle" style={S.textTitle}>
              公式库 · 点一下载入
            </div>
            <div className="symlab__presets">
              {BUILTIN_FORMULAS.map((f) => (
                <button key={f.id} title={f.hint} onClick={() => loadFormula(f.expr)}>
                  {f.label}
                </button>
              ))}
            </div>

            <div className="symlab__grouptitle" style={S.textTitle}>
              我的公式 · 存进本机，关掉窗口也还在
            </div>
            <div className="symlab__presets" style={S.presetsRow}>
              <input
                className="numfield__input"
                style={S.nameInput}
                value={draftName}
                placeholder="公式名（可留空）"
                title="保存时起的名字，留空就用公式本身"
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveCurrent()
                }}
              />
              <button
                className="symlab__save"
                disabled={!expr.trim()}
                title="把当前公式存进自定义库"
                onClick={saveCurrent}
              >
                保存当前公式
              </button>
              {customs.length === 0 && <span className="symlab__empty">还没有：拼好一条，点「保存当前公式」</span>}
              {customs.map((f) => (
                <span key={f.id} style={S.custom}>
                  <button title={f.expr} onClick={() => loadFormula(f.expr)}>
                    {f.label}
                  </button>
                  <button
                    className="symlab__mini"
                    style={S.del}
                    title="从自定义库删掉"
                    onClick={() => removeCustom(f.id)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="symlab__stage">
            <div className="symlab__stagetop" style={S.stageTop}>
              <button className="symlab__play" data-active={playing} onClick={() => setPlaying((v) => !v)}>
                {playing ? '暂停' : '播放'}
              </button>
              <button className="symlab__mini" onClick={reset}>
                重置
              </button>
              <label className="symlab__target" style={S.target} title={targetDef.hint}>
                <span>发送到</span>
                <select
                  style={S.select}
                  value={target}
                  onChange={(e) => setTarget(e.target.value as ForceTarget)}
                >
                  {FORCE_TARGETS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="symlab__mini symlab__send"
                title="把公式发到主窗口里机构选中的部件（按左边选的目标）"
                onClick={sendToMech}
              >
                发送到机构
              </button>
              {sent && <span className="symlab__sent">{sent}</span>}
              <span className="symlab__now">
                F = <b>{fmt(force)}</b> N　a = <b>{fmt(force / mass)}</b> m/s²　v ={' '}
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
            <div style={S.knobsHead}>
              <span className="symlab__grouptitle" style={S.noMargin}>
                常量 · 改完自动记住（π 与状态量由程序提供）
              </span>
              <button className="symlab__mini" title="把这 12 个常量恢复成出厂值" onClick={resetConstants}>
                恢复默认
              </button>
            </div>
            {CONSTANT_DEFS.map((def) => (
              <label key={def.id} className="symlab__knob" style={S.knobRow} title={def.hint}>
                <span>{def.label}</span>
                <ConstField def={def} value={constants[def.id]} onCommit={(v) => setConstant(def.id, v)} />
              </label>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
