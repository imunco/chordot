import { useEffect, useState } from 'react'
import type { MechLink, MechLinkKind, MechParams, MechPart, MechPartKind } from '../kernel/types'
import { linkLength, partOf, springPeriod } from '../model/mech'

/**
 * 机构装配的部件盘 + 检查器（浮在画布左上角）。
 *
 * 交互和图形库一致：卡片可以拖到画布，也可以点一下放到画面中央；
 * 连接件是「点一个、再点两个部件」——比拖出连线在一体机上稳。
 */

interface Props {
  params: MechParams
  selected: { id: string; kind: 'part' | 'link' } | null
  pending: MechLinkKind | null
  anchor: string | null
  playing: boolean
  onPending: (kind: MechLinkKind | null) => void
  onAddPart: (kind: MechPartKind) => void
  onPatchPart: (id: string, patch: Partial<MechPart>) => void
  onPatchLink: (id: string, patch: Partial<MechLink>) => void
  onDelete: () => void
  onDisconnect: () => void
  onClear: () => void
  onPlay: (v: boolean) => void
  onReset: () => void
  onPreset: (
    preset: 'spring' | 'pendulum' | 'cart' | 'pulley' | 'pulleyGroup' | 'wheel' | 'empty',
  ) => void
  vectors: boolean
  onVectors: (v: boolean) => void
  decompose: boolean
  onDecompose: (v: boolean) => void
  onDuplicate: () => void
  onDuplicatePart: () => void
  onDuplicateSub: () => void
  onGroup: () => void
  onUngroup: () => void
}

/** 失焦 / 回车才提交的数字框（和右栏同一套习惯） */
function Num({
  value,
  unit,
  min,
  max,
  step = 0.1,
  onCommit,
  width = 64,
}: {
  value: number
  unit?: string
  min?: number
  max?: number
  step?: number
  onCommit: (v: number) => void
  width?: number
}) {
  const [text, setText] = useState(String(Number(value.toFixed(3))))
  useEffect(() => setText(String(Number(value.toFixed(3)))), [value])
  const commit = () => {
    const n = Number(text)
    if (!Number.isFinite(n)) {
      setText(String(Number(value.toFixed(3))))
      return
    }
    const v = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
    onCommit(v)
    setText(String(Number(v.toFixed(3))))
  }
  return (
    <span className="mech__field">
      <input
        type="number"
        className="mech__num"
        style={{ width }}
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
      {unit && <i>{unit}</i>}
    </span>
  )
}

const PARTS: { kind: MechPartKind; label: string; hint: string }[] = [
  { kind: 'ball', label: '小球', hint: '质量为 m 的质点（圆球刚体）' },
  { kind: 'box', label: '方块', hint: '只滑不转的滑块 / 小车' },
  { kind: 'anchor', label: '固定点', hint: '钉死的悬挂点，弹簧和杆都挂在它上面' },
  { kind: 'track', label: '轨道', hint: '钉死的直轨道，可以设角度当斜面' },
  { kind: 'pulley', label: '滑轮', hint: '定滑轮：绳可以绕过它（在绳的检查器里选）' },
  { kind: 'wheel', label: '轮', hint: '中心轴固定就是转动副，可以加电机力矩' },
]

const LINKS: { kind: MechLinkKind; label: string; hint: string }[] = [
  { kind: 'spring', label: '弹簧', hint: '胡克定律 F = k·Δx，可调 k 与阻尼' },
  { kind: 'rope', label: '绳', hint: '只拉不推，拉直后长度不变' },
  { kind: 'rod', label: '杆', hint: '刚性连杆，长度锁死（单摆用这个）' },
  { kind: 'hinge', label: '铰链', hint: '在连接点把两个部件铰在一起，能相对转动（端点偏移可调）' },
]

export function MechBar({
  params,
  selected,
  pending,
  anchor,
  playing,
  onPending,
  onAddPart,
  onPatchPart,
  onPatchLink,
  onDelete,
  onDisconnect,
  onClear,
  onPlay,
  onReset,
  onPreset,
  vectors,
  onVectors,
  decompose,
  onDecompose,
  onDuplicate,
  onDuplicatePart,
  onDuplicateSub,
  onGroup,
  onUngroup,
}: Props) {
  const part = selected?.kind === 'part' ? partOf(params.parts, selected.id) : undefined
  const link = selected?.kind === 'link' ? params.links.find((l) => l.id === selected.id) : undefined
  const anchorPart = anchor ? partOf(params.parts, anchor) : undefined
  const period = link ? springPeriod(link, params.parts) : null
  const pulleys = params.parts.filter((p) => p.kind === 'pulley')
  const tracks = params.parts.filter((p) => p.kind === 'track')
  const vias = link ? link.vias ?? (link.via ? [link.via] : []) : []
  const length = link ? linkLength(link, params.parts) : 0

  const hint = pending
    ? anchorPart
      ? `已选起点「${anchorPart.kind === 'anchor' ? '固定点' : anchorPart.kind === 'box' ? '方块' : '小球'}」，再点一个部件完成连接（Esc 取消）`
      : `点第一个部件作为连接起点（当前：${LINKS.find((l) => l.kind === pending)?.label}）`
    : params.parts.length === 0
      ? '把左边的部件拖到画布上，或点一下放到画面中央'
      : '拖部件可移动；点连接件再点两个部件，就连成一台机构'

  return (
    <div className="mechbar" onPointerDown={(e) => e.stopPropagation()}>
      <div className="mechbar__row">
        <span className="mechbar__label">部件</span>
        {PARTS.map((p) => (
          <button
            key={p.kind}
            className="mechbar__part"
            draggable
            title={p.hint}
            data-part-kind={p.kind}
            onDragStart={(e) => {
              e.dataTransfer.setData('text/chordot-mech', p.kind)
              e.dataTransfer.effectAllowed = 'copy'
            }}
            onClick={() => onAddPart(p.kind)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mechbar__row">
        <span className="mechbar__label">连接</span>
        {LINKS.map((l) => (
          <button
            key={l.kind}
            className="mechbar__link"
            data-active={pending === l.kind}
            title={l.hint}
            onClick={() => onPending(pending === l.kind ? null : l.kind)}
          >
            {l.label}
          </button>
        ))}
        <span className="mechbar__sep" />
        <button className="mechbar__play" data-active={playing} onClick={() => onPlay(!playing)}>
          {playing ? '暂停' : '播放'}
        </button>
        <button className="mechbar__mini" onClick={onReset} title="回到摆放位置重新开始">
          重置
        </button>
      </div>

      <div className="mechbar__row mechbar__row--tools">
        <button className="mechbar__mini" onClick={onDisconnect} disabled={params.links.length === 0}>
          拆开全部连接
        </button>
        <button className="mechbar__mini" onClick={onClear} disabled={params.parts.length === 0}>
          清空
        </button>
        <button className="mechbar__mini" data-active={vectors} onClick={() => onVectors(!vectors)}>
          {vectors ? '隐藏矢量' : '显示矢量'}
        </button>
        <button className="mechbar__mini" data-active={decompose} onClick={() => onDecompose(!decompose)}>
          受力分解
        </button>
        <button className="mechbar__mini" onClick={onDuplicate} disabled={params.parts.length === 0}>
          复制机构
        </button>
        <span className="mechbar__sep" />
        <span className="mechbar__presets">
          预设
          <button onClick={() => onPreset('spring')}>弹簧振子</button>
          <button onClick={() => onPreset('pendulum')}>单摆</button>
          <button onClick={() => onPreset('cart')}>小车+弹簧</button>
          <button onClick={() => onPreset('pulley')}>定滑轮</button>
          <button onClick={() => onPreset('pulleyGroup')}>滑轮组</button>
          <button onClick={() => onPreset('wheel')}>电机轮</button>
        </span>
      </div>

      <p className="mechbar__hint">{hint}</p>

      {part && (
        <div className="mechbar__insp">
          <div className="mechbar__insphead">
            {part.kind === 'ball'
              ? '小球'
              : part.kind === 'box'
                ? '方块'
                : part.kind === 'anchor'
                  ? '固定点'
                  : part.kind === 'track'
                    ? '轨道'
                    : part.kind === 'pulley'
                      ? '滑轮'
                      : '轮'}
            <button className="mechbar__del" onClick={onDelete} title="删除这个部件（连着的连接一起删）">
              删除
            </button>
          </div>
          <div className="mechbar__fields">
            {part.kind !== 'anchor' && part.kind !== 'track' && part.kind !== 'pulley' && (
              <label>
                质量
                <Num value={part.mass} unit="kg" min={0.1} max={50} step={0.1} onCommit={(v) => onPatchPart(part.id, { mass: v })} />
              </label>
            )}
            <label>
              {part.kind === 'track' ? '半长' : '半径'}
              <Num
                value={part.size}
                unit="m"
                min={0.08}
                max={part.kind === 'track' ? 8 : 1.6}
                step={0.02}
                onCommit={(v) => onPatchPart(part.id, { size: v })}
              />
            </label>
            {part.kind === 'track' && (
              <label>
                倾角
                <Num
                  value={part.angle ?? 0}
                  unit="°"
                  min={-80}
                  max={80}
                  step={1}
                  onCommit={(v) => onPatchPart(part.id, { angle: v })}
                />
              </label>
            )}
            {part.kind === 'wheel' && (
              <>
                <label>
                  电机力矩
                  <Num
                    value={part.motor ?? 0}
                    unit="N·m"
                    min={-20}
                    max={20}
                    step={0.2}
                    onCommit={(v) => onPatchPart(part.id, { motor: v })}
                  />
                </label>
                <label className="mechbar__check">
                  <input
                    type="checkbox"
                    checked={part.pinned !== false}
                    onChange={(e) => onPatchPart(part.id, { pinned: e.target.checked })}
                  />
                  中心轴固定
                </label>
              </>
            )}
            <label>
              x
              <Num value={part.x} unit="m" min={-20} max={20} step={0.1} onCommit={(v) => onPatchPart(part.id, { x: v })} />
            </label>
            <label>
              y
              <Num value={part.y} unit="m" min={-20} max={20} step={0.1} onCommit={(v) => onPatchPart(part.id, { y: v })} />
            </label>
            {part.kind !== 'anchor' && part.kind !== 'track' && part.kind !== 'pulley' && (
              <label className="mechbar__check">
                <input
                  type="checkbox"
                  checked={Boolean(part.fixed)}
                  onChange={(e) => onPatchPart(part.id, { fixed: e.target.checked })}
                />
                锁死
              </label>
            )}
            {tracks.length > 0 &&
              (part.kind === 'ball' || part.kind === 'box' || part.kind === 'wheel') && (
                <label>
                  轨道约束
                  <select
                    className="mechbar__select"
                    value={part.onTrack ?? ''}
                    onChange={(e) => onPatchPart(part.id, { onTrack: e.target.value || undefined })}
                  >
                    <option value="">不限制</option>
                    {tracks.map((t, i) => (
                      <option key={t.id} value={t.id}>
                        轨道 {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
              )}
          </div>
          <div className="mechbar__actions">
            <button className="mechbar__mini" onClick={onDuplicatePart}>
              复制部件
            </button>
            <button className="mechbar__mini" onClick={onDuplicateSub}>
              复制子机构
            </button>
            <button className="mechbar__mini" onClick={part.group ? onUngroup : onGroup}>
              {part.group ? '解组' : '成组'}
            </button>
            {part.group && <span className="mechbar__meta">整组一起拖</span>}
          </div>
          {part.kind !== 'anchor' && part.kind !== 'track' && part.kind !== 'pulley' && (
            <div className="mechbar__force">
              <label className="mechbar__check">
                <input
                  type="checkbox"
                  checked={Boolean(part.force?.enabled)}
                  onChange={(e) =>
                    onPatchPart(part.id, {
                      force: {
                        expr: part.force?.expr ?? '0.5*m*g',
                        angle: part.force?.angle ?? 0,
                        enabled: e.target.checked,
                      },
                    })
                  }
                />
                公式力
              </label>
              <input
                className="mechbar__expr"
                spellCheck={false}
                placeholder="F(x,v,t)  可用 x y vx vy t m g"
                value={part.force?.expr ?? ''}
                onChange={(e) =>
                  onPatchPart(part.id, {
                    force: {
                      enabled: part.force?.enabled ?? true,
                      angle: part.force?.angle ?? 0,
                      expr: e.target.value,
                    },
                  })
                }
                title="表达式用 mathjs 语法，结果是牛顿"
              />
              <label>
                方向
                <Num
                  value={part.force?.angle ?? 0}
                  unit="°"
                  min={-180}
                  max={180}
                  step={5}
                  onCommit={(v) =>
                    onPatchPart(part.id, {
                      force: {
                        enabled: part.force?.enabled ?? true,
                        expr: part.force?.expr ?? '0',
                        angle: v,
                      },
                    })
                  }
                />
              </label>
            </div>
          )}
        </div>
      )}

      {link && (
        <div className="mechbar__insp">
          <div className="mechbar__insphead">
            {link.kind === 'spring'
              ? '弹簧'
              : link.kind === 'rope'
                ? '绳'
                : link.kind === 'hinge'
                  ? '铰链'
                  : '杆'}
            <button className="mechbar__del" onClick={onDelete} title="拆掉这条连接">
              拆除
            </button>
          </div>
          <div className="mechbar__fields">
            {link.kind !== 'hinge' && (
              <label>
                自然长度
                <Num
                  value={link.rest}
                  unit="m"
                  min={0.2}
                  max={12}
                  step={0.1}
                  onCommit={(v) => onPatchLink(link.id, { rest: v })}
                />
              </label>
            )}
            <label>
              端点 A x
              <Num
                value={link.offsetA?.x ?? 0}
                unit="m"
                min={-2}
                max={2}
                step={0.05}
                width={54}
                onCommit={(v) => onPatchLink(link.id, { offsetA: { x: v, y: link.offsetA?.y ?? 0 } })}
              />
            </label>
            <label>
              y
              <Num
                value={link.offsetA?.y ?? 0}
                unit="m"
                min={-2}
                max={2}
                step={0.05}
                width={54}
                onCommit={(v) => onPatchLink(link.id, { offsetA: { x: link.offsetA?.x ?? 0, y: v } })}
              />
            </label>
            <label>
              端点 B x
              <Num
                value={link.offsetB?.x ?? 0}
                unit="m"
                min={-2}
                max={2}
                step={0.05}
                width={54}
                onCommit={(v) => onPatchLink(link.id, { offsetB: { x: v, y: link.offsetB?.y ?? 0 } })}
              />
            </label>
            <label>
              y
              <Num
                value={link.offsetB?.y ?? 0}
                unit="m"
                min={-2}
                max={2}
                step={0.05}
                width={54}
                onCommit={(v) => onPatchLink(link.id, { offsetB: { x: link.offsetB?.x ?? 0, y: v } })}
              />
            </label>
            {link.kind === 'rope' && pulleys.length > 0 && (
              <div className="mechbar__route">
                <span>绕滑轮</span>
                {pulleys.map((p, i) => (
                  <button
                    key={p.id}
                    className="mechbar__chip"
                    data-on={vias.includes(p.id)}
                    title="按点击顺序绕过去；再点一次取消"
                    onClick={() => {
                      const next = vias.includes(p.id)
                        ? vias.filter((v) => v !== p.id)
                        : [...vias, p.id]
                      onPatchLink(link.id, { vias: next, via: undefined })
                    }}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
            {link.kind === 'spring' && (
              <>
                <label>
                  劲度 k
                  <Num
                    value={link.k ?? 25}
                    unit="N/m"
                    min={1}
                    max={200}
                    step={1}
                    onCommit={(v) => onPatchLink(link.id, { k: v })}
                  />
                </label>
                <label>
                  阻尼 c
                  <Num
                    value={link.c ?? 0}
                    unit="N·s/m"
                    min={0}
                    max={20}
                    step={0.05}
                    onCommit={(v) => onPatchLink(link.id, { c: v })}
                  />
                </label>
              </>
            )}
          </div>
          <p className="mechbar__meta">
            当前长度 {length.toFixed(2)} m
            {period !== null && ` · 理论周期 T = 2π√(m/k) ≈ ${period.toFixed(2)} s`}
          </p>
        </div>
      )}
    </div>
  )
}
