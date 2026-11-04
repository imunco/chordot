import { useMemo, useState } from 'react'
import { SHAPES, type ShapeDef } from '../data/shapes'
import { preview3d, SHAPES3D, type Shape3DDef } from '../data/shapes3d'
import type { ThumbPrim } from '../model/thumb'
import { CloseIcon } from './icons'

const W = 64
const H = 44
const PAD = 5

/** 把图形的世界坐标缩略图画进小方框 */
function Mini({ prims }: { prims: ThumbPrim[] }) {
  const { list } = useMemo(() => {
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    const grow = (x: number, y: number) => {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    for (const p of prims) {
      if (p.t === 'line') {
        grow(p.a[0], p.a[1])
        grow(p.b[0], p.b[1])
      } else if (p.t === 'circle') {
        grow(p.c[0] - p.r, p.c[1] - p.r)
        grow(p.c[0] + p.r, p.c[1] + p.r)
      } else if (p.t === 'dot') {
        grow(p.p[0], p.p[1])
      } else {
        for (const q of p.pts) grow(q[0], q[1])
      }
    }
    if (!Number.isFinite(minX)) return { list: [] as ThumbPrim[] }
    const w = Math.max(maxX - minX, 1e-3)
    const h = Math.max(maxY - minY, 1e-3)
    const k = Math.min((W - PAD * 2) / w, (H - PAD * 2) / h)
    const ox = (W - w * k) / 2 - minX * k
    const oy = (H - h * k) / 2 - minY * k
    const map = (p: [number, number]): [number, number] => [
      p[0] * k + ox,
      H - (p[1] * k + oy),
    ]
    return {
      list: prims.map((p): ThumbPrim => {
        if (p.t === 'line') return { ...p, a: map(p.a), b: map(p.b) }
        if (p.t === 'circle') return { t: 'circle', c: map(p.c), r: p.r * k }
        if (p.t === 'dot') return { t: 'dot', p: map(p.p) }
        return { ...p, pts: p.pts.map(map) }
      }),
    }
  }, [prims])

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
      {list.map((p, i) => {
        if (p.t === 'line') {
          return (
            <line
              key={i}
              x1={p.a[0]}
              y1={p.a[1]}
              x2={p.b[0]}
              y2={p.b[1]}
              stroke={p.faint ? '#c9c5be' : '#3d5a66'}
              strokeWidth={p.faint ? 0.8 : 1}
            />
          )
        }
        if (p.t === 'circle') {
          return (
            <circle
              key={i}
              cx={p.c[0]}
              cy={p.c[1]}
              r={Math.max(0.6, p.r)}
              fill="none"
              stroke="#3d5a66"
              strokeWidth={1}
            />
          )
        }
        if (p.t === 'dot') {
          return <circle key={i} cx={p.p[0]} cy={p.p[1]} r={1.6} fill="#3d5a66" />
        }
        if (p.t === 'path') {
          return (
            <polyline
              key={i}
              points={p.pts.map((q) => q.join(',')).join(' ')}
              fill="none"
              stroke="#3d5a66"
              strokeWidth={1}
              strokeLinejoin="round"
            />
          )
        }
        return (
          <polygon
            key={i}
            points={p.pts.map((q) => q.join(',')).join(' ')}
            fill={p.fill ? 'rgba(61, 90, 102, 0.07)' : 'none'}
            stroke="#3d5a66"
            strokeWidth={1}
          />
        )
      })}
    </svg>
  )
}

interface Props {
  onInsert: (key: string) => void
  onClose: () => void
}

export function ShapePanel({ onInsert, onClose }: Props) {
  const [tab, setTab] = useState<'2d' | '3d'>('2d')

  return (
    <div className="shapes">
      <header className="shapes__head">
        <span className="shapes__title">图形库</span>
        <button className="iconbtn" title="收起" onClick={onClose}>
          <CloseIcon size={14} />
        </button>
      </header>

      <div className="shapes__tabs">
        <button className="shapes__tab" data-active={tab === '2d'} onClick={() => setTab('2d')}>
          平面
        </button>
        <button className="shapes__tab" data-active={tab === '3d'} onClick={() => setTab('3d')}>
          立体
        </button>
      </div>

      <p className="shapes__hint">
        {tab === '2d' ? '拖到画布上，或点一下放到画面中央' : '拖进画布即可旋转观察'}
      </p>

      <div className="shapes__grid">
        {tab === '2d'
          ? SHAPES.map((s: ShapeDef) => (
              <button
                key={s.id}
                className="shapes__card"
                title={`${s.name} · ${s.hint}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/chordot-shape', `2d:${s.id}`)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => onInsert(`2d:${s.id}`)}
              >
                <Mini prims={s.preview} />
                <span className="shapes__name">{s.name}</span>
              </button>
            ))
          : SHAPES3D.map((s: Shape3DDef) => (
              <button
                key={s.id}
                className="shapes__card"
                title={`${s.name} · ${s.hint}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/chordot-shape', `3d:${s.id}`)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => onInsert(`3d:${s.id}`)}
              >
                <Mini prims={preview3d(s)} />
                <span className="shapes__name">{s.name}</span>
              </button>
            ))}
      </div>
    </div>
  )
}
