import { useEffect, useState } from 'react'
import { computeNet } from '../model/net'
import { parseVec } from '../model/force3d'
import { FORCE_LABEL } from '../model/types'
import type { ForceObj, ForceType, GeoObj, Mode, SubState } from '../model/types'
import type { SimState } from '../kernel/types'
import type { MeasureResult } from '../model/measure'
import type { PropGroup } from '../model/props'
import type { SketchConstraint, SketchConstraintType, SketchPolygon } from '../kernel/types'
import { MathInput } from './MathInput'
import { CloseIcon } from './icons'

interface Props {
  objects: GeoObj[]
  selected: string[]
  mode: Mode
  subState: SubState
  decomposed: string[]
  sim: SimState | null
  playing: boolean
  measure: MeasureResult | null
  propSchema: PropGroup[] | null
  onPatchParams: (patch: Record<string, unknown>) => void
  /** 变力预览的自变量取值 */
  forcePreview: number
  onPreviewForce: (value: number) => void
  onPatchForce: (id: string, patch: Record<string, unknown>) => void
  constraints: SketchConstraint[] | null
  /** 草图多边形（四边形纵横比锁定状态存在这里） */
  polygons: SketchPolygon[] | null
  onPatchPolygon: (id: string, patch: Partial<SketchPolygon>) => void
  /** 绕选区中心旋转（度，正数为逆时针） */
  onRotate: (deg: number) => void
  selectedLines: number
  selectedPoints: number
  selectedCircles: number
  onAddConstraint: (type: SketchConstraintType) => void
  onRemoveConstraint: (id: string) => void
  simModel: 'incline' | 'pendulum' | 'spring' | 'projectile' | null
  conflict: { ids: string[]; reason: string } | null
  onSelectConflict: (ids: string[]) => void
  onEditFunction: (id: string, expr: string) => boolean
  /** 改线段长度 / 角度（保持起点不动） */
  onEditLine: (id: string, patch: { length?: number; angleDeg?: number }) => void
  onSubState: (s: SubState) => void
  onClose: () => void
  onRename: (id: string, name: string) => void
  onToggleDecompose: (id: string) => void
  onPlay: () => void
  onPause: () => void
  onStop: () => void
  onReset: () => void
}

const CONSTRAINT_LABEL: Record<SketchConstraintType, string> = {
  horizontal: '水平',
  vertical: '竖直',
  equal: '等长',
  parallel: '平行',
  perpendicular: '垂直',
  'on-line': '点在线上',
  midpoint: '中点',
  tangent: '相切',
}

/** 失焦或回车才提交的数字输入：边输边改会把 "1" 当成 1 米 */
function NumField({
  value,
  unit,
  onCommit,
  min,
  max,
  step = 0.1,
}: {
  value: number
  unit?: string
  onCommit: (v: number) => void
  min?: number
  max?: number
  step?: number
}) {
  const [text, setText] = useState(String(Number(value.toFixed(3))))
  useEffect(() => setText(String(Number(value.toFixed(3)))), [value])
  const commit = () => {
    const n = Number(text)
    if (!Number.isFinite(n)) {
      setText(String(Number(value.toFixed(3))))
      return
    }
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
    onCommit(clamped)
    setText(String(Number(clamped.toFixed(3))))
  }
  return (
    <span className="numfield">
      <input
        className="numfield__input"
        type="number"
        value={text}
        step={step}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
      {unit && <span className="numfield__unit">{unit}</span>}
    </span>
  )
}

/**
 * 三维方向预览：等轴投影画 x/y/z 三根轴 + 单位向量箭头。
 * 填错时（parseVec 返回 null）画一个空心圆，配合输入框描红。
 */
function VecPreview({ vec }: { vec: string }) {
  const v = parseVec(vec)
  const ox = 28
  const oy = 15
  const k = 13
  const iso = (p: [number, number, number]): [number, number] => [
    ox + (p[0] - p[1]) * 0.866 * k,
    oy + ((p[0] + p[1]) * 0.5 - p[2]) * k,
  ]
  const tip = v ? iso(v) : null
  return (
    <svg className="vecprev" width={56} height={30} viewBox="0 0 56 30" aria-hidden="true">
      {([0, 1, 2] as const).map((axis) => {
        const a: [number, number, number] = [0, 0, 0]
        a[axis] = 0.9
        const b: [number, number, number] = [0, 0, 0]
        b[axis] = -0.9
        const [x1, y1] = iso(b)
        const [x2, y2] = iso(a)
        return (
          <line key={axis} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#bdb7ad" strokeWidth={0.8} />
        )
      })}
      {tip ? (
        <>
          <line
            x1={ox}
            y1={oy}
            x2={tip[0]}
            y2={tip[1]}
            stroke="#3d5a66"
            strokeWidth={1.7}
            strokeLinecap="round"
          />
          <circle cx={tip[0]} cy={tip[1]} r={2.1} fill="#3d5a66" />
        </>
      ) : (
        <circle
          cx={ox}
          cy={oy}
          r={2.6}
          fill="none"
          stroke="#9e9a94"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      )}
      <circle cx={ox} cy={oy} r={1.1} fill="#9e9a94" />
    </svg>
  )
}

/** 三维方向输入：边输边预览，非法向量立刻描红 + 说明（不再静默退回预设） */
function VecField({
  label,
  value,
  onCommit,
}: {
  label: string
  value: string
  onCommit: (v: string) => void
}) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const trimmed = text.trim()
  const empty = trimmed.length === 0
  const invalid = !empty && !parseVec(trimmed)
  const unit = parseVec(trimmed)
  const commit = () => {
    if (trimmed === value) return
    if (invalid) return // 非法值不落库，保留原设置
    onCommit(trimmed)
  }
  return (
    <>
      <div className="props__row props__row--vec">
        <span>{label}</span>
        <span className="vecfield">
          <input
            className="forceedit__input vecfield__input"
            data-invalid={invalid}
            value={text}
            spellCheck={false}
            placeholder="x,y,z"
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                setText(value)
                e.currentTarget.blur()
              }
            }}
          />
          <VecPreview vec={trimmed} />
        </span>
      </div>
      {invalid && (
        <p className="props__hint">
          格式 x,y,z（如 1,-1,0），当前值无效，力仍按预设方向
        </p>
      )}
      {!invalid && !empty && unit && (
        <p className="props__hint props__hint--ok">
          方向 ({unit.map((n) => n.toFixed(2)).join(', ')})，覆盖预设
        </p>
      )}
    </>
  )
}

const TYPE_LABEL: Record<string, string> = {
  point: '点',
  line: '线段',
  polygon: '多边形',
  circle: '圆',
  solid: '立体图形',
  force: '力矢量',
}

const GROUPS: { title: string; types: ForceType[] }[] = [
  { title: '重力', types: ['gravity'] },
  { title: '支持力 / 弹力', types: ['normal', 'tension'] },
  { title: '摩擦力', types: ['friction'] },
  { title: '自定义外力', types: ['external'] },
]

function NameInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  return (
    <input
      className="fname"
      value={draft}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() && draft !== value && onCommit(draft.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(value)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

export function RightPanel(props: Props) {
  const targetId = props.selected[props.selected.length - 1]
  const target = props.objects.find((o) => o.id === targetId)
  const owner = target?.kind === 'force' ? props.objects.find((o) => o.id === target.parentId) : target
  const forces = props.objects.filter(
    (o): o is ForceObj => o.kind === 'force' && o.parentId === (owner?.id ?? '__none__'),
  )
  const net = computeNet(forces)
  const [detail, setDetail] = useState(false)
  const selectedForceId = target?.kind === 'force' ? target.id : null

  /** 能不能旋转：草图层里选中了带点的对象（力/曲线/立体不参与） */
  const canRotate =
    !props.propSchema &&
    props.selected.some((id) => {
      const o = props.objects.find((q) => q.id === id)
      return !!o && o.kind !== 'force' && o.kind !== 'function' && o.kind !== 'solid'
    })

  return (
    <aside className="right">
      <header className="right__header">
        <div className="right__titles">
          <span className="right__title">{target ? target.name : '属性'}</span>
          {target && <span className="right__type">{TYPE_LABEL[target.kind]}</span>}
        </div>
        <button className="iconbtn" title="关闭 P" onClick={props.onClose}>
          <CloseIcon size={15} />
        </button>
      </header>

      {props.mode === 'physics' && (
        <div className="segmented" role="tablist">
          <button
            className="segmented__btn"
            role="tab"
            data-active={props.subState === 'statics'}
            onClick={() => props.onSubState('statics')}
          >
            受力分析
          </button>
          <button
            className="segmented__btn"
            role="tab"
            data-active={props.subState === 'kinematics'}
            onClick={() => props.onSubState('kinematics')}
          >
            运动仿真
          </button>
        </div>
      )}

      <div className="right__body">
        {props.conflict && (
          <div className="conflict">
            <div className="conflict__head">
              <span className="conflict__mark">!</span>
              <span>{props.conflict.reason}</span>
            </div>
            <button className="btn conflict__btn" onClick={() => props.onSelectConflict(props.conflict!.ids)}>
              查看冲突对象
            </button>
          </div>
        )}

        {target && target.kind === 'function' && (
          <div className="fexpr">
            <h4 className="fgroup__title">表达式</h4>
            <div className="fexpr__row">
              <span className="fexpr__prefix">{target.name}(x) =</span>
              <MathInput
                key={target.id}
                className="fexpr__field"
                fieldClass="fexpr__input"
                initial={target.expr}
                commitOnBlur
                onSubmit={(next) => props.onEditFunction(target.id, next)}
              />
            </div>
            {target.error && <p className="hint">{target.error}</p>}
          </div>
        )}

        {target && target.kind === 'line' &&
          (() => {
            const dx = target.b[0] - target.a[0]
            const dy = target.b[1] - target.a[1]
            const len = Math.hypot(dx, dy)
            const ang = (Math.atan2(dy, dx) * 180) / Math.PI
            return (
              <div className="lineedit">
                <h4 className="fgroup__title">线段</h4>
                <div className="props__row">
                  <span>长度</span>
                  <NumField
                    value={len}
                    unit="cm"
                    min={0.05}
                    max={200}
                    onCommit={(v) => props.onEditLine(target.id, { length: v })}
                  />
                </div>
                <div className="props__row">
                  <span>角度</span>
                  <NumField
                    value={ang}
                    unit="°"
                    step={1}
                    min={-360}
                    max={360}
                    onCommit={(v) => props.onEditLine(target.id, { angleDeg: v })}
                  />
                </div>
                <p className="hint">改长度或角度时，起点不动，终点跟着走。</p>
              </div>
            )
          })()}

        {target && target.kind === 'polygon' &&
          (() => {
            const poly = props.polygons?.find((g) => g.id === target.id)
            if (!poly || poly.points.length !== 4) return null
            const [p0, p1, p2] = target.points
            const w = Math.hypot(p1[0] - p0[0], p1[1] - p0[1])
            const h = Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
            const aspect = h > 1e-6 ? w / h : 1
            const locked = typeof poly.ratio === 'number'
            return (
              <div className="quadedit">
                <h4 className="fgroup__title">四边形</h4>
                <div className="props__row">
                  <span>锁定纵横比</span>
                  <button
                    className="props__toggle"
                    data-on={locked}
                    onClick={() =>
                      props.onPatchPolygon(poly.id, {
                        ratio: locked ? undefined : Number(aspect.toFixed(3)),
                      })
                    }
                  >
                    {locked ? '是' : '否'}
                  </button>
                </div>
                <div className="props__row">
                  <span>宽高比</span>
                  <NumField
                    value={locked ? poly.ratio! : aspect}
                    min={0.05}
                    max={20}
                    step={0.1}
                    onCommit={(v) => props.onPatchPolygon(poly.id, { ratio: v })}
                  />
                </div>
                <p className="hint">
                  开启后拖任一顶点都保持矩形（对角顶点不动）；宽高比填 1 就是正方形。
                </p>
              </div>
            )
          })()}

        {canRotate && (
          <div className="rotedit">
            <h4 className="fgroup__title">旋转</h4>
            <div className="props__row">
              <span>绕选区中心</span>
              <span className="rotedit__btns">
                {[-90, -15, 15, 90].map((d) => (
                  <button key={d} className="rotedit__btn" onClick={() => props.onRotate(d)}>
                    {d > 0 ? `+${d}°` : `${d}°`}
                  </button>
                ))}
              </span>
            </div>
            <p className="hint">拖选区上方的手柄可自由旋转，按住 Shift 吸附 15°。</p>
          </div>
        )}

        {target && target.kind === 'force' && target.expr !== undefined && (
          <div className="forceedit">
            <h4 className="fgroup__title">力</h4>
            <div className="props__row">
              <span>大小变化</span>
              <select
                className="forceedit__select"
                value={target.forceKind ?? 'constant'}
                onChange={(e) => props.onPatchForce(target.id, { kind: e.target.value })}
              >
                <option value="constant">恒力</option>
                <option value="time">随时间 F(t)</option>
                <option value="position">随位移 F(x)</option>
              </select>
            </div>
            <div className="props__row">
              <span>{target.forceKind === 'constant' ? '大小 F' : `大小 F(${target.forceKind === 'time' ? 't' : 'x'})`}</span>
              <input
                key={`expr:${target.id}:${target.expr}`}
                className="forceedit__input"
                defaultValue={target.expr}
                spellCheck={false}
                placeholder="如 10、2t、0.5x^2"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
                onBlur={(e) => {
                  const next = e.currentTarget.value.trim()
                  if (next && next !== target.expr) props.onPatchForce(target.id, { expr: next })
                }}
              />
            </div>
            <div className="props__row">
              <span>方向角</span>
              <span className="props__field">
                <input
                  key={`angle:${target.id}:${target.angle}`}
                  className="props__input"
                  type="number"
                  step={15}
                  defaultValue={String(Math.round(target.angle))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                  }}
                  onBlur={(e) => {
                    const v = Number(e.currentTarget.value)
                    if (Number.isFinite(v) && v !== target.angle) props.onPatchForce(target.id, { angle: v })
                  }}
                />
                <span className="props__unit">°</span>
              </span>
            </div>

            {target.forceKind !== 'constant' && (
              <>
                <div className="props__row">
                  <span>{target.forceKind === 'time' ? '预览 t' : '预览 x'}</span>
                  <span className="props__field">
                    <input
                      className="forceedit__range"
                      type="range"
                      min={-5}
                      max={5}
                      step={0.1}
                      value={props.forcePreview}
                      onChange={(e) => props.onPreviewForce(Number(e.target.value))}
                    />
                    <span className="forceedit__value">
                      {props.forcePreview.toFixed(1)}
                    </span>
                  </span>
                </div>
                <p className="hint forceedit__now">
                  此刻 F = {target.magnitude.toFixed(1)} N
                  {target.error ? `（${target.error}）` : ''}
                </p>
              </>
            )}
            {target.error && target.forceKind === 'constant' && (
              <p className="hint">{target.error}</p>
            )}
            <p className="hint">
              {target.forceKind === 'constant'
                ? '恒力：大小和方向都不变。方向角 0° 指向右，逆时针为正。'
                : '拖动滑块看力的大小怎么随' +
                  (target.forceKind === 'time' ? '时间' : '位移') +
                  '变化，画布上的箭头会同步变长变短。'}
            </p>
          </div>
        )}

        {props.constraints && (
          <div className="cons">
            <h4 className="fgroup__title">约束</h4>
            <div className="cons__actions">
              <button className="cons__btn" disabled={props.selectedLines !== 1} onClick={() => props.onAddConstraint('horizontal')}>
                水平
              </button>
              <button className="cons__btn" disabled={props.selectedLines !== 1} onClick={() => props.onAddConstraint('vertical')}>
                竖直
              </button>
              <button className="cons__btn" disabled={props.selectedLines !== 2} onClick={() => props.onAddConstraint('equal')}>
                等长
              </button>
              <button className="cons__btn" disabled={props.selectedLines !== 2} onClick={() => props.onAddConstraint('parallel')}>
                平行
              </button>
              <button className="cons__btn" disabled={props.selectedLines !== 2} onClick={() => props.onAddConstraint('perpendicular')}>
                垂直
              </button>
              <button
                className="cons__btn"
                disabled={props.selectedPoints !== 1 || props.selectedLines !== 1}
                onClick={() => props.onAddConstraint('on-line')}
              >
                点在线上
              </button>
              <button
                className="cons__btn"
                disabled={props.selectedPoints !== 1 || props.selectedLines !== 1}
                onClick={() => props.onAddConstraint('midpoint')}
              >
                中点
              </button>
              <button
                className="cons__btn"
                disabled={props.selectedLines !== 1 || props.selectedCircles !== 1}
                onClick={() => props.onAddConstraint('tangent')}
              >
                相切
              </button>
            </div>
            {props.constraints.length === 0 ? (
              <p className="hint">选中线段（或一个点 + 一条线段）后可加约束，拖动顶点会自动满足。</p>
            ) : (
              props.constraints.map((c) => (
                <div className="cons__row" key={c.id}>
                  <span>{CONSTRAINT_LABEL[c.type]}</span>
                  <button className="gallery__mini-link" onClick={() => props.onRemoveConstraint(c.id)}>
                    删除
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {props.propSchema && (
          <div className="props">
            {props.propSchema.map((group) => (
              <section className="props__group" key={group.title}>
                <h4 className="fgroup__title">{group.title}</h4>
                {group.fields.map((f) => {
                  const value = f.get()
                  if (f.kind === 'action') {
                    return (
                      <div className="props__row" key={f.key}>
                        <button
                          className="props__action"
                          onClick={() => props.onPatchParams(f.set(true))}
                        >
                          {f.label}
                        </button>
                      </div>
                    )
                  }
                  if (f.kind === 'vec') {
                    return (
                      <VecField
                        key={f.key}
                        label={f.label}
                        value={String(value)}
                        onCommit={(v) => props.onPatchParams(f.set(v))}
                      />
                    )
                  }
                  if (f.kind === 'text') {
                    return (
                      <div className="props__row" key={f.key}>
                        <span>{f.label}</span>
                        <input
                          key={`${f.key}:${String(value)}`}
                          className="forceedit__input"
                          defaultValue={String(value)}
                          spellCheck={false}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                          }}
                          onBlur={(e) => {
                            const next = e.currentTarget.value.trim()
                            if (next && next !== String(value)) props.onPatchParams(f.set(next))
                          }}
                        />
                      </div>
                    )
                  }
                  if (f.kind === 'select') {
                    return (
                      <div className="props__row" key={f.key}>
                        <span>{f.label}</span>
                        <select
                          className="forceedit__select"
                          value={String(value)}
                          onChange={(e) => props.onPatchParams(f.set(e.target.value))}
                        >
                          {(f.options ?? []).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )
                  }
                  if (f.kind === 'toggle') {
                    return (
                      <div className="props__row" key={f.key}>
                        <span>{f.label}</span>
                        <button
                          className="props__toggle"
                          data-on={value === true}
                          onClick={() => props.onPatchParams(f.set(value !== true))}
                        >
                          {value === true ? '是' : '否'}
                        </button>
                      </div>
                    )
                  }
                  return (
                    <div className="props__row" key={f.key}>
                      <span>{f.label}</span>
                      <span className="props__field">
                        <input
                          key={`${f.key}:${value}`}
                          className="props__input"
                          type="number"
                          defaultValue={String(value)}
                          min={f.min}
                          max={f.max}
                          step={f.step}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                          }}
                          onBlur={(e) => {
                            const v = Number(e.currentTarget.value)
                            if (Number.isFinite(v) && v !== Number(value)) props.onPatchParams(f.set(v))
                          }}
                        />
                        {f.unit && <span className="props__unit">{f.unit}</span>}
                      </span>
                    </div>
                  )
                })}
              </section>
            ))}
          </div>
        )}

        {props.measure && (
          <div className="measure">
            <h4 className="fgroup__title">测量</h4>
            {props.measure.rows.map((row) => (
              <div className="measure__row" key={row.label}>
                <span>{row.label}</span>
                <span>{row.value}</span>
              </div>
            ))}
          </div>
        )}

        {!target && (
          <p className="hint">
            在画布或左栏选择一个对象查看属性。
            <br />
            按 <kbd>P</kbd> 收起此面板。
          </p>
        )}

        {target && props.mode === 'physics' && props.subState === 'kinematics' && (
          <div className="sim">
            <div className="sim__controls">
              <button
                className="btn btn--primary sim__btn"
                onClick={props.playing ? props.onPause : props.onPlay}
              >
                {props.playing ? '暂停' : '播放'}
              </button>
              <button className="btn sim__btn" onClick={props.onStop} disabled={!props.sim}>
                停止
              </button>
              <button className="btn sim__btn" onClick={props.onReset} disabled={!props.sim}>
                重置
              </button>
            </div>

            {props.sim ? (
              <div className="sim__readout">
                {(() => {
                  const st = props.sim!
                  const e = st.energy
                  const deg = ((st.theta ?? 0) * 180) / Math.PI
                  if (props.simModel === 'pendulum') {
                    return [
                      ['时间 t', `${st.time.toFixed(2)} s`],
                      ['摆角 θ', `${deg.toFixed(1)}°`],
                      ['角速度 ω', `${(st.omega ?? 0).toFixed(2)} rad/s`],
                      ['速度 v', `${Math.abs(st.v).toFixed(2)} m/s`],
                      ['总能量 E', `${(e?.total ?? 0).toFixed(2)} J`],
                    ]
                  }
                  if (props.simModel === 'spring') {
                    return [
                      ['时间 t', `${st.time.toFixed(2)} s`],
                      ['位移 x', `${st.x.toFixed(2)} m`],
                      ['速度 v', `${st.v.toFixed(2)} m/s`],
                      ['加速度 a', `${st.a.toFixed(2)} m/s²`],
                      ['总能量 E', `${(e?.total ?? 0).toFixed(2)} J`],
                    ]
                  }
                  if (props.simModel === 'projectile') {
                    return [
                      ['时间 t', `${st.time.toFixed(2)} s`],
                      ['位置 x', `${st.x.toFixed(2)} m`],
                      ['高度 y', `${(st.y ?? 0).toFixed(2)} m`],
                      ['速度 v', `${Math.abs(st.v).toFixed(2)} m/s`],
                      ['总能量 E', `${(e?.total ?? 0).toFixed(2)} J`],
                    ]
                  }
                  return [
                    ['时间 t', `${st.time.toFixed(2)} s`],
                    ['位置 s', `${st.x.toFixed(2)} m`],
                    ['速度 v', `${st.v.toFixed(2)} m/s`],
                    ['加速度 a', `${st.a.toFixed(2)} m/s²`],
                    ['支持力 N', `${(st.normal ?? 0).toFixed(1)} N`],
                    ['摩擦力 f', `${(st.friction ?? 0).toFixed(1)} N`],
                  ]
                })().map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <span>{value}</span>
                  </div>
                ))}
                <p className="sim__note">
                  {props.sim.ended
                    ? '已到达终点，物体停住。'
                    : props.simModel === 'incline'
                      ? props.sim.sliding
                        ? '物体正在滑动，摩擦力取滑动摩擦 μN。'
                        : '物体静止，摩擦力与下滑分力平衡。'
                      : props.simModel === 'pendulum'
                        ? '无阻尼时总能量守恒，可用来验证积分精度。'
                        : props.simModel === 'spring'
                          ? '简谐振动，周期 T = 2π√(m/k)。'
                          : '平抛/斜抛：水平匀速，竖直匀加速。'}
                </p>
              </div>
            ) : (
              <p className="hint">
                按「播放」开始仿真。播放时力箭头收缩为方向指示器，数值在此处实时读数；按{' '}
                <kbd>空格</kbd> 暂停，画面恢复全尺寸受力图。
              </p>
            )}
          </div>
        )}

        {target && props.mode === 'physics' && props.subState === 'statics' && (
          <>
            {forces.length === 0 && (
              <p className="hint">
                {owner?.name ?? '该对象'} 尚未添加力。
                <br />
                按「一重、二弹、三摩擦、四其它」的顺序添加。
              </p>
            )}
            {GROUPS.map((group) => {
              const items = forces.filter((f) => group.types.includes(f.forceType))
              if (items.length === 0 && group.types[0] !== 'gravity') return null
              return (
                <section className="fgroup" key={group.title}>
                  <h4 className="fgroup__title">{group.title}</h4>
                  {items.length === 0 && <div className="fitem__meta" style={{ padding: '0 12px 6px' }}>未添加</div>}
                  {items.map((f) => (
                    <div className="fitem" key={f.id} data-constrained={f.constrained}>
                      <div className="fitem__head">
                        <span className="ftag">{FORCE_LABEL[f.forceType]}</span>
                        <NameInput value={f.name} onCommit={(v) => props.onRename(f.id, v)} />
                        <span className="fvalue">{f.magnitude.toFixed(1)} N</span>
                      </div>
                      <div className="fitem__meta">
                        <span>{f.directionLabel}</span>
                        {selectedForceId === f.id && (
                          <button
                            className="fitem__switch"
                            data-on={props.decomposed.includes(f.id)}
                            title="正交分解 D"
                            onClick={() => props.onToggleDecompose(f.id)}
                          >
                            分解
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </section>
              )
            })}
          </>
        )}
      </div>

      {props.mode === 'physics' &&
        target &&
        props.simModel !== 'pendulum' &&
        props.simModel !== 'spring' &&
        props.simModel !== 'projectile' && (
        <>
          {detail && (
            <div className="netdetail">
              <div>
                <span>ΣFx</span>
                <span>{net.sumF.x.toFixed(1)} N</span>
              </div>
              <div>
                <span>ΣFy</span>
                <span>{net.sumF.y.toFixed(1)} N</span>
              </div>
              <div>
                <span>ΣM</span>
                <span>{net.sumM.toFixed(1)} N·m</span>
              </div>
            </div>
          )}
          <div className="netcheck" data-balanced={net.balanced}>
            {net.balanced ? (
              <span>ΣF = 0，ΣM = 0</span>
            ) : (
              <span className="netcheck__values">
                <span>
                  ΣF = {Math.hypot(net.sumF.x, net.sumF.y).toFixed(1)} N（方向{' '}
                  {(Math.atan2(net.sumF.y, net.sumF.x) * 180) / Math.PI > 0 ? '+' : ''}
                  {((Math.atan2(net.sumF.y, net.sumF.x) * 180) / Math.PI).toFixed(0)}°）
                </span>
                <span>ΣM = {net.sumM.toFixed(1)} N·m</span>
              </span>
            )}
            <button className="netcheck__expand" onClick={() => setDetail((v) => !v)}>
              {detail ? '收起' : '分量明细'}
            </button>
          </div>
        </>
      )}
    </aside>
  )
}
