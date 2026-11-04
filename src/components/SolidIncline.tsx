import { useMemo } from 'react'
import type { Camera } from '../kernel/types'
import { buildIncline3D } from '../model/incline3d'
import { projectMesh, projectPoint3, projectVector, type FaceView, type Vec3 } from '../model/solid'

/** 曲面平滑着色（和 CanvasStage 里同一套做法） */
function faceDefs(prefix: string, faces: FaceView[]) {
  const items = faces
    .map((f, i) =>
      f.grad ? (
        <linearGradient
          key={i}
          id={`${prefix}-${i}`}
          gradientUnits="userSpaceOnUse"
          x1={f.grad.x1}
          y1={f.grad.y1}
          x2={f.grad.x2}
          y2={f.grad.y2}
        >
          <stop offset="0%" stopColor={f.grad.from} />
          <stop offset="100%" stopColor={f.grad.to} />
        </linearGradient>
      ) : null,
    )
    .filter(Boolean)
  return items.length > 0 ? <defs>{items}</defs> : null
}

const faceFill = (prefix: string, f: FaceView, i: number) =>
  f.grad ? `url(#${prefix}-${i})` : f.shade

const FONT = "'Noto Serif SC', 'Source Han Serif SC', serif"

interface Props {
  angleDeg: number
  mass: number
  mu: number
  camera: Camera
  toScreen: (p: [number, number]) => [number, number]
  /** 力箭头标尺：每牛顿像素 */
  pxPerN: number
  /** 是否显示重力分解 */
  decompose: boolean
}

/** 三维斜面受力图：楔形 + 物块 + 力矢量 + 重力分解虚线 */
export function SolidIncline({
  angleDeg,
  mass,
  mu,
  camera,
  toScreen,
  pxPerN,
  decompose,
}: Props) {
  const model = useMemo(() => buildIncline3D(angleDeg, mass, mu), [angleDeg, mass, mu])
  const wedge = useMemo(() => projectMesh(model.mesh, camera, toScreen), [model, camera, toScreen])
  const block = useMemo(() => projectMesh(model.block, camera, toScreen), [model, camera, toScreen])

  const [ox, oy] = toScreen([model.center[0], model.center[1]])
  // 物块中心的屏幕位置（投影是仿射的，直接用顶点的投影均值更准）
  const [cx, cy] = (() => {
    const pts = block.vertices
    if (pts.length === 0) return [ox, oy]
    const sx = pts.reduce((s, p) => s + p.x, 0) / pts.length
    const sy = pts.reduce((s, p) => s + p.y, 0) / pts.length
    return [sx, sy]
  })()

  const arrow = (dir: Vec3, mag: number, len: number) => {
    const [dx, dy] = projectVector(dir, camera, 1)
    const l = Math.hypot(dx, dy) || 1
    const k = (mag * pxPerN) / l
    return { x: cx + dx * k, y: cy + dy * k, dx: (dx / l) * len, dy: (dy / l) * len, ux: dx / l, uy: dy / l }
  }

  const tip = (id: string) => {
    const f = model.forces.find((q) => q.id === id)!
    const [dx, dy] = projectVector(f.dir, camera, 1)
    const l = Math.hypot(dx, dy) || 1
    const k = (f.mag * pxPerN) / l
    return { x: cx + dx * k, y: cy + dy * k }
  }

  // 倾角弧：在底面顶点处，从 +y 转到沿斜面方向
  const thetaArc = useMemo(() => {
    const v = model.thetaAt.vertex
    const r = 1.5
    const pts: string[] = []
    const steps = 16
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * model.theta
      // 底边方向 (0,-1,0) 转到沿斜面方向 u 的中间姿态
      const dir: Vec3 = [0, -Math.cos(t), Math.sin(t)]
      const p: Vec3 = [v[0] + dir[0] * r, v[1] + dir[1] * r, v[2] + dir[2] * r]
      const [tx, ty] = projectPoint3(p, camera, toScreen)
      pts.push(`${tx},${ty}`)
    }
    return pts.join(' ')
  }, [model, camera, toScreen])

  const arcMid = useMemo(() => {
    const v = model.thetaAt.vertex
    const r = 1.9
    const t = model.theta / 2
    const dir: Vec3 = [0, -Math.cos(t), Math.sin(t)]
    return projectPoint3([v[0] + dir[0] * r, v[1] + dir[1] * r, v[2] + dir[2] * r], camera, toScreen)
  }, [model, camera, toScreen])

  const gTip = tip('G')
  const gaTip = tip('Ga')
  const gnTip = tip('Gn')

  return (
    <g data-incline3d>
      {/* 楔形 */}
      {faceDefs('iw', wedge.faces)}
      {wedge.faces.map((f, i) => {
        const fill = faceFill('iw', f, i)
        return (
          <polygon
            key={`wf${i}`}
            points={f.points.map((p) => p.join(',')).join(' ')}
            fill={fill}
            stroke={fill}
            strokeWidth={0.6}
            strokeLinejoin="round"
          />
        )
      })}
      {wedge.hiddenEdges.map((e, i) => (
        <line
          key={`wh${i}`}
          x1={e.a[0]}
          y1={e.a[1]}
          x2={e.b[0]}
          y2={e.b[1]}
          stroke="#3d5a66"
          strokeWidth={0.9}
          strokeOpacity={0.3}
          strokeDasharray="3 3"
        />
      ))}
      {wedge.edges.map((e, i) => (
        <line
          key={`we${i}`}
          x1={e.a[0]}
          y1={e.a[1]}
          x2={e.b[0]}
          y2={e.b[1]}
          stroke="#3d5a66"
          strokeWidth={1}
          strokeOpacity={0.55}
        />
      ))}

      {/* 倾角弧 + 标注 */}
      <polyline points={thetaArc} fill="none" stroke="#3d5a66" strokeWidth={1} strokeOpacity={0.75} />
      <text x={arcMid[0]} y={arcMid[1]} fontSize={12} fill="#3d5a66" fontFamily={FONT} textAnchor="middle">
        θ = {angleDeg.toFixed(0)}°
      </text>

      {/* 物块 */}
      {faceDefs('ib', block.faces)}
      {block.faces.map((f, i) => {
        const fill = faceFill('ib', f, i)
        return (
          <polygon
            key={`bf${i}`}
            points={f.points.map((p) => p.join(',')).join(' ')}
            fill={fill}
            stroke={fill}
            strokeWidth={0.6}
            strokeLinejoin="round"
          />
        )
      })}
      {block.hiddenEdges.map((e, i) => (
        <line
          key={`bh${i}`}
          x1={e.a[0]}
          y1={e.a[1]}
          x2={e.b[0]}
          y2={e.b[1]}
          stroke="#3d5a66"
          strokeWidth={0.9}
          strokeOpacity={0.3}
          strokeDasharray="3 3"
        />
      ))}
      {block.edges.map((e, i) => (
        <line
          key={`be${i}`}
          x1={e.a[0]}
          y1={e.a[1]}
          x2={e.b[0]}
          y2={e.b[1]}
          stroke="#3d5a66"
          strokeWidth={1}
        />
      ))}

      {/* 重力分解：从 G 末端连虚线到两个分量末端 */}
      {decompose && (
        <g stroke="#8a4a6a" strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.75} fill="none">
          <line x1={gTip.x} y1={gTip.y} x2={gaTip.x} y2={gaTip.y} />
          <line x1={gTip.x} y1={gTip.y} x2={gnTip.x} y2={gnTip.y} />
        </g>
      )}

      {/* 力矢量 */}
      {model.forces
        .filter((f) => (f.ghost ? decompose : true))
        .map((f) => {
          const a = arrow(f.dir, f.mag, 9)
          const dash = f.ghost ? '4 3' : undefined
          const opacity = f.ghost ? 0.8 : 1
          return (
            <g key={f.id} data-force={f.id}>
              <line
                x1={cx}
                y1={cy}
                x2={a.x}
                y2={a.y}
                stroke={f.color}
                strokeWidth={f.ghost ? 1.2 : 1.8}
                strokeDasharray={dash}
                strokeOpacity={opacity}
              />
              {/* 箭头：两条短线，避免依赖 marker 定义 */}
              <polyline
                points={`${a.x - a.ux * 9 - a.uy * 4},${a.y - a.uy * 9 + a.ux * 4} ${a.x},${a.y} ${a.x - a.ux * 9 + a.uy * 4},${a.y - a.uy * 9 - a.ux * 4}`}
                fill="none"
                stroke={f.color}
                strokeWidth={f.ghost ? 1.2 : 1.8}
                strokeLinecap="round"
                strokeOpacity={opacity}
              />
              <text
                x={a.x + a.ux * 10 + 2}
                y={a.y + a.uy * 10}
                fontSize={11.5}
                fill={f.color}
                stroke="#FAFAF8"
                strokeWidth={3}
                style={{ paintOrder: 'stroke' }}
                fontFamily={FONT}
                dominantBaseline="middle"
              >
                {f.name}
              </text>
            </g>
          )
        })}
    </g>
  )
}
