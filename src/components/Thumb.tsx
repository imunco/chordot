import { useMemo } from 'react'
import { thumbnail, THUMB_H, THUMB_W, type ThumbPrim } from '../model/thumb'
import type { SceneSpec } from '../kernel/types'

interface Props {
  scene: SceneSpec
  /** 缓存键：同一模板只算一次 */
  cacheKey: string
}

const cache = new Map<string, ThumbPrim[]>()

function prims(scene: SceneSpec, key: string): ThumbPrim[] {
  const hit = cache.get(key)
  if (hit) return hit
  const next = thumbnail(scene)
  cache.set(key, next)
  return next
}

/** 模板卡片缩略图：纯 SVG，不跑求解器 */
export function Thumb({ scene, cacheKey }: Props) {
  const list = useMemo(() => prims(scene, cacheKey), [scene, cacheKey])

  if (list.length === 0) {
    return <div className="thumb thumb--empty" aria-hidden="true" />
  }

  return (
    <svg
      className="thumb"
      width={THUMB_W}
      height={THUMB_H}
      viewBox={`0 0 ${THUMB_W} ${THUMB_H}`}
      aria-hidden="true"
      focusable="false"
    >
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
              strokeLinecap="round"
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
              points={p.pts.map((q) => `${q[0]},${q[1]}`).join(' ')}
              fill="none"
              stroke={p.dashed ? '#8e8a84' : '#3d5a66'}
              strokeWidth={1}
              strokeDasharray={p.dashed ? '2 2' : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )
        }
        return (
          <polygon
            key={i}
            points={p.pts.map((q) => `${q[0]},${q[1]}`).join(' ')}
            fill={p.fill ? 'rgba(61, 90, 102, 0.07)' : 'none'}
            stroke="#3d5a66"
            strokeWidth={1}
            strokeLinejoin="round"
          />
        )
      })}
    </svg>
  )
}
