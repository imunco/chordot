import type { ReactNode } from 'react'

/** 教材演示台共用的小零件：箭头、标签、台面、网格、表盘 */

export const INK = '#3d5a66'
export const SOFT = '#8e8a84'
export const WARN = '#b08a3e'
export const LINE = '#c9c4bc'
export const PAPER = '#fafaf8'
export const FONT = "'IBM Plex Sans SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif"
export const MONO = "'IBM Plex Mono', 'Cascadia Mono', Consolas, monospace"

export function Arrow({
  x1,
  y1,
  x2,
  y2,
  color = INK,
  width = 2,
  dashed = false,
  head = 9,
  opacity = 1,
}: {
  x1: number
  y1: number
  x2: number
  y2: number
  color?: string
  width?: number
  dashed?: boolean
  head?: number
  opacity?: number
}) {
  const ang = Math.atan2(y2 - y1, x2 - x1)
  const len = Math.hypot(x2 - x1, y2 - y1)
  if (len < 1) return null
  const h = Math.min(head, Math.max(4, len * 0.5))
  const bx = x2 - h * Math.cos(ang)
  const by = y2 - h * Math.sin(ang)
  const nx = -Math.sin(ang)
  const ny = Math.cos(ang)
  const pts = `${x2},${y2} ${bx + nx * h * 0.42},${by + ny * h * 0.42} ${bx - nx * h * 0.42},${by - ny * h * 0.42}`
  return (
    <g opacity={opacity}>
      <line
        x1={x1}
        y1={y1}
        x2={bx}
        y2={by}
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={dashed ? '5 4' : undefined}
      />
      <polygon points={pts} fill={color} />
    </g>
  )
}

export function Tag({
  x,
  y,
  text,
  color = INK,
  bg = '#ffffff',
  size = 11,
  bold = false,
  anchor = 'middle',
  opacity = 1,
}: {
  x: number
  y: number
  text: string
  color?: string
  bg?: string
  size?: number
  bold?: boolean
  anchor?: 'start' | 'middle' | 'end'
  opacity?: number
}) {
  const w =
    [...text].reduce((s, ch) => s + (ch.charCodeAt(0) > 255 ? size : size * 0.58), 0) + 10
  const h = size + 9
  const rx = anchor === 'start' ? x - 5 : anchor === 'end' ? x - w + 5 : x - w / 2
  return (
    <g opacity={opacity}>
      <rect
        x={rx}
        y={y - h + 3}
        width={w}
        height={h}
        rx={4}
        fill={bg}
        stroke={LINE}
        strokeWidth={0.7}
        opacity={0.96}
      />
      <text
        x={x}
        y={y}
        fontSize={size}
        fontWeight={bold ? 600 : 400}
        fill={color}
        fontFamily={FONT}
        textAnchor={anchor}
      >
        {text}
      </text>
    </g>
  )
}

export function Txt({
  x,
  y,
  text,
  size = 11,
  color = SOFT,
  anchor = 'middle',
  bold = false,
  opacity = 1,
  mono = false,
}: {
  x: number
  y: number
  text: string
  size?: number
  color?: string
  anchor?: 'start' | 'middle' | 'end'
  bold?: boolean
  opacity?: number
  mono?: boolean
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fontWeight={bold ? 600 : 400}
      fill={color}
      fontFamily={mono ? MONO : FONT}
      textAnchor={anchor}
      opacity={opacity}
    >
      {text}
    </text>
  )
}

/** 桌面 / 地面：一条基准线加一点淡阴影 */
export function Bench({ y, x1 = 60, x2 = 700 }: { y: number; x1?: number; x2?: number }) {
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={LINE} strokeWidth={1.2} />
      <rect x={x1} y={y} width={x2 - x1} height={5} fill="#efece6" opacity={0.7} />
    </g>
  )
}

export function Grid({ w = 760, h = 430, step = 32 }: { w?: number; h?: number; step?: number }) {
  const xs: ReactNode[] = []
  for (let x = step; x < w; x += step) {
    xs.push(<line key={`x${x}`} x1={x} y1={0} x2={x} y2={h} stroke="#efede8" strokeWidth={0.6} />)
  }
  for (let y = step; y < h; y += step) {
    xs.push(<line key={`y${y}`} x1={0} y1={y} x2={w} y2={y} stroke="#efede8" strokeWidth={0.6} />)
  }
  return <g opacity={0.75}>{xs}</g>
}

export function Shadow({ cx, cy, rx, ry = 6, opacity = 0.12 }: { cx: number; cy: number; rx: number; ry?: number; opacity?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#3a3a38" opacity={opacity} />
}

/** 圆角盒子：仪器外壳 */
export function Box({
  x,
  y,
  w,
  h,
  r = 8,
  fill = '#ffffff',
  stroke = LINE,
  children,
  opacity = 1,
}: {
  x: number
  y: number
  w: number
  h: number
  r?: number
  fill?: string
  stroke?: string
  children?: ReactNode
  opacity?: number
}) {
  return (
    <g opacity={opacity}>
      <rect x={x} y={y} width={w} height={h} rx={r} fill={fill} stroke={stroke} strokeWidth={1.1} />
      {children}
    </g>
  )
}

/** 电流 / 磁通流动：虚线沿路径流动 */
export function Flow({
  d,
  color = INK,
  width = 2,
  offset = 0,
  reverse = false,
  opacity = 0.7,
}: {
  d: string
  color?: string
  width?: number
  offset?: number
  reverse?: boolean
  opacity?: number
}) {
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeDasharray="5 9"
      strokeDashoffset={(reverse ? offset : -offset) % 14}
      strokeLinecap="round"
      opacity={opacity}
    />
  )
}

/** 模拟表头：一个带刻度和指针的半圆 */
export function Dial({
  cx,
  cy,
  r,
  angle,
  label,
  sub,
  color = INK,
  ticks = 12,
}: {
  cx: number
  cy: number
  r: number
  angle: number
  label: string
  sub?: string
  color?: string
  ticks?: number
}) {
  const a0 = Math.PI
  const a1 = 0
  const arc = `M ${cx + r * Math.cos(a0)} ${cy - r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy - r * Math.sin(a1)}`
  const marks: ReactNode[] = []
  for (let i = 0; i <= ticks; i++) {
    const a = a0 + ((a1 - a0) * i) / ticks
    const long = i % 3 === 0
    marks.push(
      <line
        key={i}
        x1={cx + (r - (long ? 9 : 5)) * Math.cos(a)}
        y1={cy - (r - (long ? 9 : 5)) * Math.sin(a)}
        x2={cx + r * Math.cos(a)}
        y2={cy - r * Math.sin(a)}
        stroke={SOFT}
        strokeWidth={long ? 1.2 : 0.7}
        opacity={0.8}
      />,
    )
  }
  const rad = (Math.PI * (180 - angle)) / 180
  return (
    <g>
      <path d={arc} fill="none" stroke={LINE} strokeWidth={1.4} />
      {marks}
      <line
        x1={cx}
        y1={cy}
        x2={cx + (r - 12) * Math.cos(rad)}
        y2={cy - (r - 12) * Math.sin(rad)}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r={4} fill={color} />
      <Txt x={cx} y={cy + 26} text={label} size={12} color={INK} bold />
      {sub && <Txt x={cx} y={cy + 42} text={sub} size={10} color={SOFT} />}
    </g>
  )
}
