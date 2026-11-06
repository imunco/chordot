import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { EXPERIMENTS } from '../data/textbook'
import { labModel } from '../lab/models'
import {
  BOOK_ORDER,
  FIELD_COLOR,
  FIELD_ORDER,
  type LabBook,
  type LabChart,
  type LabExperiment,
  type LabField,
} from '../lab/types'
import { LabStage } from './LabStage'
import { CloseIcon, PauseIcon, PlayIcon } from './icons'
import { useEscape } from './useEscape'

const FAV_KEY = 'chordot.lab.fav'
const RECENT_KEY = 'chordot.lab.recent'

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
function writeList(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    /* 隐私模式静默失败 */
  }
}

/** 抛体、落体、碰撞真实时间太短，默认慢放一半，课堂上才看得清 */
function defaultSpeed(exp: LabExperiment) {
  return exp.stage === 'projectile' || exp.stage === 'fall' || exp.stage === 'collision' ? 0.5 : 1
}

interface Props {
  onClose: () => void
  initialId?: string
}

export function Textbook({ onClose, initialId }: Props) {
  useEscape(true, onClose)
  const [book, setBook] = useState<'全部' | '最近' | LabBook>('全部')
  const [field, setField] = useState<'全部' | LabField>('全部')
  const [favOnly, setFavOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [fav, setFav] = useState<string[]>(() => readList(FAV_KEY))
  const [recent, setRecent] = useState<string[]>(() => readList(RECENT_KEY))
  const [id, setId] = useState<string>(() => {
    const first = initialId && EXPERIMENTS.some((e) => e.id === initialId) ? initialId : null
    const last = readList(RECENT_KEY)[0]
    const validLast = last && EXPERIMENTS.some((e) => e.id === last) ? last : null
    return first ?? validLast ?? EXPERIMENTS[0].id
  })

  const exp = EXPERIMENTS.find((e) => e.id === id) ?? EXPERIMENTS[0]

  const toggleFav = (target: string) => {
    const next = fav.includes(target) ? fav.filter((x) => x !== target) : [...fav, target]
    setFav(next)
    writeList(FAV_KEY, next)
  }

  const pick = (next: string) => {
    setId(next)
    const list = [next, ...recent.filter((x) => x !== next)].slice(0, 6)
    setRecent(list)
    writeList(RECENT_KEY, list)
  }

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return EXPERIMENTS.filter((e) => {
      if (favOnly && !fav.includes(e.id)) return false
      if (book === '最近' && !recent.includes(e.id)) return false
      if (book !== '全部' && book !== '最近' && e.book !== book) return false
      if (field !== '全部' && e.field !== field) return false
      if (!q) return true
      return (
        e.name.toLowerCase().includes(q) ||
        e.short.toLowerCase().includes(q) ||
        e.tagline.toLowerCase().includes(q) ||
        e.chapter.toLowerCase().includes(q) ||
        e.field.toLowerCase().includes(q)
      )
    })
  }, [book, field, query, favOnly, fav, recent])

  // 空格播放 / 暂停，左右键切换实验（搜索框里让位给输入）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        const i = EXPERIMENTS.findIndex((q) => q.id === id)
        pick(EXPERIMENTS[(i + 1) % EXPERIMENTS.length].id)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        const i = EXPERIMENTS.findIndex((q) => q.id === id)
        pick(EXPERIMENTS[(i - 1 + EXPERIMENTS.length) % EXPERIMENTS.length].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, recent])

  return (
    <div className="lab" role="dialog" aria-label="教材实验室" onClick={onClose}>
      <div className="lab__panel" onClick={(e) => e.stopPropagation()}>
        <header className="lab__head">
          <div className="lab__brand">
            <span className="lab__mark">教材</span>
            <div>
              <div className="lab__brandline">高中物理教材实验</div>
              <div className="lab__sub">人教版（2019）· 课标 2017 年版 2020 年修订</div>
            </div>
          </div>
          <div className="lab__tools">
            <input
              className="lab__search"
              placeholder="搜索实验、章节或关键词…"
              value={query}
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="lab__total">{list.length} / {EXPERIMENTS.length} 个实验</span>
            <button className="iconbtn" title="关闭（Esc）" onClick={onClose}>
              <CloseIcon size={16} />
            </button>
          </div>
        </header>

        <div className="lab__body">
          <aside className="lab__side">
            <div className="lab__books">
              {(['全部', '最近', ...BOOK_ORDER] as const).map((b) => (
                <button
                  key={b}
                  className="lab__book"
                  data-active={book === b}
                  onClick={() => setBook(b)}
                >
                  {b}
                  <span className="lab__bookn">
                    {b === '全部'
                      ? EXPERIMENTS.length
                      : b === '最近'
                        ? recent.length
                        : EXPERIMENTS.filter((e) => e.book === b).length}
                  </span>
                </button>
              ))}
            </div>

            <div className="lab__fieldrow">
              {(['全部', ...FIELD_ORDER] as const).map((f) => (
                <button
                  key={f}
                  className="lab__field"
                  data-active={field === f}
                  style={f === '全部' ? undefined : ({ '--field': FIELD_COLOR[f] } as CSSProperties)}
                  onClick={() => setField(f)}
                >
                  <i />
                  {f}
                </button>
              ))}
              <button
                className="lab__field lab__field--fav"
                data-active={favOnly}
                onClick={() => setFavOnly((v) => !v)}
              >
                ★ 收藏
              </button>
            </div>

            <div className="lab__list">
              {list.length === 0 && <div className="lab__empty">没有匹配的实验</div>}
              {list.map((e) => (
                <div
                  key={e.id}
                  className="lab__item"
                  data-active={e.id === id}
                  role="button"
                  tabIndex={0}
                  onClick={() => pick(e.id)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') pick(e.id)
                  }}
                >
                  <span className="lab__itemno">{String(EXPERIMENTS.indexOf(e) + 1).padStart(2, '0')}</span>
                  <span className="lab__itemmain">
                    <span className="lab__itemname">{e.short}</span>
                    <span className="lab__itemmeta">
                      {e.book} · {e.field} · {e.kind}
                    </span>
                  </span>
                  <button
                    className="lab__itemfav"
                    data-on={fav.includes(e.id)}
                    title={fav.includes(e.id) ? '取消收藏' : '收藏'}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      toggleFav(e.id)
                    }}
                  >
                    ★
                  </button>
                </div>
              ))}
            </div>
          </aside>

          <LabDetail
            key={exp.id}
            exp={exp}
            fav={fav.includes(exp.id)}
            onFav={() => toggleFav(exp.id)}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────── 详情 ───────────────────────── */

const TABS = [
  { id: 'principle', label: '实验原理' },
  { id: 'steps', label: '器材与步骤' },
  { id: 'data', label: '数据处理' },
  { id: 'errors', label: '误差与注意' },
] as const

type TabId = (typeof TABS)[number]['id']

function LabDetail({
  exp,
  fav,
  onFav,
  onClose,
}: {
  exp: LabExperiment
  fav: boolean
  onFav: () => void
  onClose: () => void
}) {
  const [params, setParams] = useState<Record<string, number | string>>({ ...exp.params })
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(defaultSpeed(exp))
  const [t, setT] = useState(0)
  const [tab, setTab] = useState<TabId>('principle')
  const clock = useRef(0)

  useEffect(() => {
    if (!playing) return
    let raf = 0
    // rAF 的时间戳可能早于 performance.now()，第一帧会算出负的 dt
    let last = -1
    const loop = (now: number) => {
      if (last < 0) last = now
      const dt = Math.max(0, Math.min(64, now - last)) / 1000
      last = now
      clock.current += dt * speed
      setT(clock.current)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed])

  const reset = () => {
    clock.current = 0
    setT(0)
    setPlaying(true)
  }

  // 空格播放 / 暂停；搜索框里让位给输入
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA') return
      if (e.code !== 'Space') return
      e.preventDefault()
      setPlaying((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const model = useMemo(() => labModel(exp, params, t), [exp, params, t])
  const accent = FIELD_COLOR[exp.field]

  return (
    <section className="lab__detail">
      <div className="lab__titlebar">
        <div className="lab__titlemain">
          <div className="lab__kicker">
            <span className="lab__dot" style={{ background: accent }} />
            {exp.book} · {exp.chapter} · {exp.section}
            <span className="lab__kind">{exp.kind}</span>
          </div>
          <h2 className="lab__title">{exp.name}</h2>
          <p className="lab__tagline">{exp.tagline}</p>
        </div>
        <div className="lab__titleacts">
          <button className="lab__star" data-on={fav} onClick={onFav} title={fav ? '取消收藏' : '收藏这个实验'}>
            ★
          </button>
          <button className="btn lab__reset" onClick={reset} title="回到起点重新播放">
            重置
          </button>
          <button className="iconbtn" title="关闭（Esc）" onClick={onClose}>
            <CloseIcon size={15} />
          </button>
        </div>
      </div>

      <div className="lab__stagecol">
        <div className="lab__stagebar">
          <button className="lab__play" onClick={() => setPlaying((v) => !v)} title="空格播放 / 暂停">
            {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
            {playing ? '暂停' : '播放'}
          </button>
          <div className="segmented lab__speeds">
            {[0.5, 1, 1.5].map((v) => (
              <button key={v} className="segmented__btn" data-active={speed === v} onClick={() => setSpeed(v)}>
                {v}×
              </button>
            ))}
          </div>
          {model.formula ? (
            <div className="lab__stageformula">
              <code>{model.formula.expr}</code>
              {model.formula.sub && <span>{model.formula.sub}</span>}
            </div>
          ) : (
            <span className="lab__hintline">右侧滑杆即时生效，画面与读数同步</span>
          )}
        </div>

        <div className="lab__stagebox">
          <LabStage exp={exp} m={model} t={t} />
        </div>
      </div>

      <aside className="lab__data">
        <div className="lab__datahead">
          实时数据
          <span>播放 / 改参数都会同步</span>
        </div>
        <div className="lab__params">
          {exp.controls.map((c) => {
            const value = Number(params[c.id] ?? c.min)
            const digits = c.digits ?? (c.step >= 1 ? 0 : c.step >= 0.1 ? 1 : 2)
            return (
              <label className="lab__ctl" key={c.id}>
                <span className="lab__ctlname">{c.label}</span>
                <input
                  type="range"
                  min={c.min}
                  max={c.max}
                  step={c.step}
                  value={value}
                  onChange={(e) => setParams((prev) => ({ ...prev, [c.id]: Number(e.target.value) }))}
                />
                <b className="lab__ctlval">
                  {value.toFixed(digits)}
                  {c.unit && <i>{c.unit}</i>}
                </b>
              </label>
            )
          })}

          {exp.selects?.map((sel) => {
            const value = String(params[sel.id] ?? sel.options[0]?.value ?? '')
            return (
              <label className="lab__ctl lab__ctl--select" key={sel.id}>
                <span className="lab__ctlname">{sel.label}</span>
                <select
                  className="lab__select"
                  value={value}
                  onChange={(e) => setParams((prev) => ({ ...prev, [sel.id]: e.target.value }))}
                >
                  {sel.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            )
          })}
        </div>

        <div className="lab__reads">
          {model.readings.map((r) => (
            <div className="lab__read" key={r.label} data-tone={r.tone ?? 'plain'}>
              <span className="lab__readlabel">{r.label}</span>
              <span className="lab__readvalue">
                {r.value}
                {r.unit && <i>{r.unit}</i>}
              </span>
              {r.hint && <span className="lab__readhint">{r.hint}</span>}
            </div>
          ))}
        </div>

        {/* 简谐运动的 x-t 图已经画在演示台里，右栏不再重复，给读数和参数让位 */}
        {model.chart && exp.stage !== 'shm' && <MiniChart chart={model.chart} />}

        {model.note && <p className="lab__note">{model.note}</p>}
        <p className="lab__disclaimer">读数为按公式实时计算的教学演示值，用于理解规律；真实实验会存在误差。</p>
      </aside>

      <div className="lab__notes">
        <div className="lab__tabs">
          {TABS.map((x) => (
            <button key={x.id} className="lab__tab" data-active={tab === x.id} onClick={() => setTab(x.id)}>
              {x.label}
            </button>
          ))}
          <span className="lab__concl">结论：{exp.conclusion}</span>
        </div>

        <div className="lab__tabbody">
          {tab === 'principle' && (
            <div className="lab__prose">
              <p>{exp.principle}</p>
              <div className="lab__formulas">
                {exp.formulas.map((f) => (
                  <div key={f.expr} className="lab__fcard">
                    <code>{f.expr}</code>
                    <span>{f.note}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'steps' && (
            <div className="lab__cols">
              <div>
                <h4>实验器材</h4>
                <div className="lab__chips">
                  {exp.apparatus.map((a) => (
                    <span key={a}>{a}</span>
                  ))}
                </div>
              </div>
              <div>
                <h4>实验步骤</h4>
                <ol className="lab__steps">
                  {exp.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          {tab === 'data' && (
            <div className="lab__cols">
              <div>
                <h4>数据处理</h4>
                <ul className="lab__bullets">
                  {exp.data.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="lab__chartTips">
                <h4>怎么读图</h4>
                <p>{model.chart ? `「${model.chart.title}」中，圆点是当前时刻。改变参数看曲线怎么动，比背结论更容易记住。` : '这个实验的结论直接来自读数比较，把滑杆推到底看极端情况最直观。'}</p>
                <p className="lab__muted">图像与读数都由公式实时算出，和教材例题的数据口径一致。</p>
                <div className="lab__conclusion">
                  <b>结论</b>
                  {exp.conclusion}
                </div>
              </div>
            </div>
          )}

          {tab === 'errors' && (
            <div className="lab__cols">
              <div>
                <h4>误差来源</h4>
                <ul className="lab__bullets">
                  {exp.errors.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>注意事项</h4>
                <ul className="lab__bullets lab__bullets--warn">
                  {exp.cautions.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/* ───────────────────────── 迷你图表 ───────────────────────── */

function tickText(v: number, span: number) {
  if (Math.abs(v) >= 1000) return v.toExponential(0)
  if (span !== 0 && Math.abs(span) < 1e-3) return v === 0 ? '0' : v.toExponential(1)
  if (span < 0.1) return v.toFixed(3)
  if (span < 2) return v.toFixed(2)
  if (span < 20) return v.toFixed(1)
  return v.toFixed(0)
}

const MiniChart = memo(function MiniChart({ chart }: { chart: LabChart }) {
  const W = 300
  const H = 132
  const L = 40
  const B = 22
  const T = 12
  const R = 10
  const [x0, x1] = chart.xRange
  const [y0, y1] = chart.yRange
  const xr = x1 - x0 || 1
  const yr = y1 - y0 || 1
  const sx = (v: number) => L + ((v - x0) / xr) * (W - L - R)
  const sy = (v: number) => T + (1 - (v - y0) / yr) * (H - T - B)
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="lab__chart">
      <div className="lab__charthead">
        {chart.title}
        <span>
          {chart.xLabel} / {chart.yLabel}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="lab__chartsvg" role="img" aria-label={chart.title}>
        {ticks.map((k) => (
          <line key={k} x1={L} y1={sy(y0 + yr * k)} x2={W - R} y2={sy(y0 + yr * k)} stroke="#efede8" strokeWidth={0.7} />
        ))}
        {ticks.map((k) => (
          <g key={`y${k}`}>
            <text x={L - 6} y={sy(y0 + yr * k) + 3} textAnchor="end" fontSize={7.5} fill="#8e8a84" fontFamily="inherit">
              {tickText(y0 + yr * k, yr)}
            </text>
          </g>
        ))}
        {ticks.map((k) => (
          <g key={`x${k}`}>
            <text x={sx(x0 + xr * k)} y={H - 10} textAnchor="middle" fontSize={7.5} fill="#8e8a84" fontFamily="inherit">
              {tickText(x0 + xr * k, xr)}
            </text>
          </g>
        ))}
        <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="#d8d4ce" strokeWidth={0.9} />
        <line x1={L} y1={T} x2={L} y2={H - B} stroke="#d8d4ce" strokeWidth={0.9} />

        {chart.vline !== undefined && chart.vline >= x0 && chart.vline <= x1 && (
          <line x1={sx(chart.vline)} y1={T} x2={sx(chart.vline)} y2={H - B} stroke="#b08a3e" strokeWidth={0.9} strokeDasharray="3 3" opacity={0.7} />
        )}
        {chart.hline !== undefined && chart.hline >= y0 && chart.hline <= y1 && (
          <line x1={L} y1={sy(chart.hline)} x2={W - R} y2={sy(chart.hline)} stroke="#b08a3e" strokeWidth={0.9} strokeDasharray="3 3" opacity={0.7} />
        )}

        {chart.series.map((s, i) => {
          const color = s.color ?? '#3d5a66'
          if (s.dots) {
            return (
              <g key={i}>
                {s.pts.map(([px, py], k) => (
                  <circle key={k} cx={sx(px)} cy={sy(py)} r={3} fill={color} />
                ))}
              </g>
            )
          }
          const d = s.pts.map(([px, py], k) => `${k === 0 ? 'M' : 'L'}${sx(px).toFixed(1)} ${sy(py).toFixed(1)}`).join(' ')
          return (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              strokeDasharray={s.dashed ? '4 3' : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.9}
            />
          )
        })}

        {chart.cursor && (
          <g>
            <line x1={sx(chart.cursor[0])} y1={T} x2={sx(chart.cursor[0])} y2={H - B} stroke="#3d5a66" strokeWidth={0.7} strokeDasharray="2 3" opacity={0.45} />
            <circle cx={sx(chart.cursor[0])} cy={sy(chart.cursor[1])} r={4.2} fill="#b08a3e" stroke="#ffffff" strokeWidth={1.4} />
          </g>
        )}
      </svg>
      {chart.series.filter((s) => s.label).length > 1 && (
        <div className="lab__legend">
          {chart.series
            .filter((s) => s.label)
            .map((s, i) => (
              <span key={i}>
                <i style={{ background: s.color ?? '#3d5a66', opacity: s.dashed ? 0.55 : 1 }} />
                {s.label}
              </span>
            ))}
        </div>
      )}
    </div>
  )
})
