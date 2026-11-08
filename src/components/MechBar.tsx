import { useEffect, useRef, useState, type ReactNode } from 'react'
import type {
  MechCategory,
  MechForce,
  MechLink,
  MechLinkKind,
  MechLive,
  MechMaterial,
  MechParams,
  MechPart,
  MechPartKind,
} from '../kernel/types'
import {
  linkLength,
  linkRatio,
  linkVias,
  materialOf,
  MECH_CATEGORIES,
  MECH_LINK_CATALOG,
  MECH_LINK_SPEC,
  MECH_MATERIALS,
  MECH_MOTOR_KINDS,
  MECH_PART_CATALOG,
  MECH_PART_SPEC,
  MECH_PRESETS,
  MECH_STATIC_KINDS,
  partOf,
  springPeriod,
  type MechPartSpec,
  type MechPresetId,
} from '../model/mech'

/**
 * 机构装配的部件盘 + 检查器 + 世界面板（浮在画布左上角）。
 *
 * 面板是一块「纸面模型工作台」：
 * - 顶部：编辑 / 真实 分段 + 播放 / 重置；
 * - 部件盘：4 个分类 pill + 搜索 + 图标网格（23 种部件各有手绘线稿图标）；
 * - 连接行：10 种连接，每种一个线稿图标；
 * - 工具栏 / 预设 / 世界面板：全部收成紧凑的一行或两行；
 * - 检查器：分组字段 + 实时读数，底部常驻能量读数。
 *
 * DOM 钩子（.mechbar__part / __link / __cat / __presets / __world / __insp …）与
 * Props 接口是验证脚本的契约，改样式时一条都不能丢（见 docs/MECH_SPEC.md §6）。
 *
 * 实时数据（动能、速度…）由画布层写进 props.live.current，这里用 120ms 定时器轮询，
 * 不跟着物理帧 setState，避免每帧重渲染整块面板。
 */

interface Props {
  params: MechParams
  selected: { id: string; kind: 'part' | 'link' } | null
  selectedIds: string[]
  live: { current: MechLive }
  pending: MechLinkKind | null
  anchor: string | null
  playing: boolean
  editing: boolean
  vectors: boolean
  decompose: boolean
  labels: boolean
  trails: boolean
  grid: number
  snapAngle: boolean
  measure: { a: string; b: string } | null
  measureMode: boolean
  onEditing: (v: boolean) => void
  onPending: (k: MechLinkKind | null) => void
  onAddPart: (kind: MechPartKind) => void
  onPatchPart: (id: string, patch: Partial<MechPart>) => void
  onPatchLink: (id: string, patch: Partial<MechLink>) => void
  onPatchParams: (patch: Partial<MechParams>) => void
  onDelete: () => void
  onDisconnect: () => void
  onClear: () => void
  onPlay: (v: boolean) => void
  onReset: () => void
  onPreset: (preset: MechPresetId) => void
  onVectors: (v: boolean) => void
  onDecompose: (v: boolean) => void
  onLabels: (v: boolean) => void
  onTrails: (v: boolean) => void
  onGrid: (v: number) => void
  onSnapAngle: (v: boolean) => void
  onMeasureMode: (v: boolean) => void
  onMeasureClear: () => void
  onDuplicate: () => void
  onDuplicatePart: () => void
  onDuplicateSub: () => void
  onGroup: () => void
  onUngroup: () => void
  onSelectMany: (ids: string[]) => void
  onAlign: (axis: 'x' | 'y') => void
  onDistribute: (axis: 'x' | 'y') => void
  onRotate: (delta: number) => void
}

/* ───────── 常量 / 小工具 ───────── */

/** 角度有意义的部件（其余是转动对称件，不显示角度字段） */
const ANGLE_KINDS: MechPartKind[] = ['box', 'plank', 'wedge', 'track', 'arcTrack', 'conveyor', 'thruster', 'rack']

/** 可以勾「中心轴固定」的转动件 */
const PINNED_KINDS: MechPartKind[] = ['disc', 'hoop', 'gear', 'wheel', 'flywheel']

/** 网格吸附档位（0 = 关闭） */
const GRID_STEPS: { value: number; label: string }[] = [
  { value: 0, label: '关闭' },
  { value: 0.1, label: '0.1 m' },
  { value: 0.25, label: '0.25 m' },
  { value: 0.5, label: '0.5 m' },
]

/** 恒力方向的快捷按钮 */
const FORCE_DIRS: { label: string; angle: number; hint: string }[] = [
  { label: '→', angle: 0, hint: '向右' },
  { label: '↑', angle: 90, hint: '向上' },
  { label: '←', angle: 180, hint: '向左' },
  { label: '↓', angle: -90, hint: '向下' },
]

const CATEGORY_TEXT: Record<MechCategory, string> = {
  body: '刚体',
  support: '支撑',
  drive: '传动',
  field: '装置',
}

const LINK_GROUP_TEXT: Record<string, string> = {
  elastic: '弹性',
  rigid: '刚性',
  drive: '传动',
  actuator: '驱动',
}

const fixed3 = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')

/** 摘要里用：9.80 → 9.8，1.00 → 1 */
const trimNum = (v: number, d = 2): string => (Number.isFinite(v) ? String(Number(v.toFixed(d))) : '—')

const nameOfPart = (p: MechPart) => p.label || MECH_PART_SPEC[p.kind]?.label || '部件'

/** 主尺寸的中文名 */
function sizeLabel(kind: MechPartKind): string {
  switch (kind) {
    case 'track':
    case 'conveyor':
    case 'rack':
    case 'plank':
      return '半长'
    case 'wall':
      return '半宽'
    case 'wedge':
      return '半底宽'
    case 'box':
    case 'cart':
    case 'weight':
    case 'bracket':
      return '半边长'
    default:
      return '半径'
  }
}

/** 次尺寸的中文名（板厚 / 车高 / 楔块高…） */
function size2Label(kind: MechPartKind): string {
  switch (kind) {
    case 'plank':
      return '半厚'
    case 'cart':
    case 'wall':
    case 'rack':
    case 'bracket':
      return '半高'
    case 'wedge':
      return '高'
    default:
      return '次尺寸'
  }
}

/** 角度字段的中文名 */
function angleLabel(kind: MechPartKind): string {
  if (kind === 'track' || kind === 'conveyor' || kind === 'plank') return '倾角'
  if (kind === 'arcTrack' || kind === 'thruster') return '朝向'
  return '角度'
}

function partMatches(spec: MechPartSpec, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (spec.label + ' ' + spec.kind + ' ' + spec.hint).toLowerCase().includes(q)
}

/* ───────── 线稿图标（统一 24×24 / stroke=currentColor / 1.4 / 圆头） ───────── */

const round2 = (v: number) => Math.round(v * 100) / 100

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const rad = (deg * Math.PI) / 180
  return { x: round2(cx + r * Math.cos(rad)), y: round2(cy + r * Math.sin(rad)) }
}

/** 沿圆周画 count 根齿（齿轮 / 齿条 / 啮合） */
function gearTeeth(cx: number, cy: number, r1: number, r2: number, count: number, phase = 0): ReactNode {
  return Array.from({ length: count }, (_, i) => {
    const deg = phase + (360 / count) * i
    const a = polar(cx, cy, r1, deg)
    const b = polar(cx, cy, r2, deg)
    return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
  })
}

/** 一个线稿图标的外壳（不放进 <title>，否则会污染按钮的 textContent） */
function IconBase({
  children,
  size = 22,
  className,
}: {
  children: ReactNode
  size?: number
  className?: string
}) {
  return (
    <svg
      className={'mechbar__icon' + (className ? ' ' + className : '')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

/** 23 种部件的专属图标：每种一眼能认出来（球是圆、齿轮有齿、传送带有滚轮…） */
const PART_ICONS: Record<MechPartKind, ReactNode> = {
  ball: <circle cx="12" cy="12" r="7.6" />,
  box: <rect x="4.8" y="4.8" width="14.4" height="14.4" rx="1.8" />,
  cart: (
    <>
      <rect x="3.2" y="7.2" width="17.6" height="6.4" rx="2.2" />
      <circle cx="8" cy="17.4" r="2.3" />
      <circle cx="16" cy="17.4" r="2.3" />
      <path d="M8 13.6v1.5M16 13.6v1.5" />
    </>
  ),
  plank: (
    <>
      <rect x="2.4" y="10.1" width="19.2" height="3.8" rx="1.9" />
      <path d="M7.2 11.3h2.4M12.4 12.7h3.2" />
    </>
  ),
  disc: (
    <>
      <circle cx="12" cy="12" r="7.8" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 9.8V12l2.4 2.4" />
    </>
  ),
  hoop: (
    <>
      <circle cx="12" cy="12" r="7.8" />
      <circle cx="12" cy="12" r="5.1" />
    </>
  ),
  wedge: (
    <>
      <path d="M3.4 18.8h17.2L3.4 6.2z" />
      <path d="M7 16.2l1.3-1.3M10.1 16.2l1.3-1.3M13.2 16.2l1.3-1.3M16.3 16.2l1.3-1.3" />
    </>
  ),
  weight: (
    <>
      <rect x="7" y="8.2" width="10" height="9.6" rx="1.5" />
      <path d="M9.5 8.2V6.6a2.5 2.5 0 0 1 5 0v1.6M12 3.2v1.4" />
    </>
  ),
  anchor: (
    <>
      <path d="M4.9 4.5h14.2M9 4.5L7 7.1M15 4.5l2 2.6" />
      <path d="M12 4.5v4.3" />
      <circle cx="12" cy="11.7" r="2.7" />
    </>
  ),
  bracket: (
    <>
      <path d="M6 3.8v16.4h13.4" />
      <path d="M6 12.2l6.6 8" />
      <path d="M6 6.2h2.2" />
    </>
  ),
  wall: (
    <>
      <rect x="4" y="5.2" width="16" height="13.6" rx="1.4" />
      <path d="M7.4 8.2l3.2 3.2M7.4 11.8l3.2 3.2M11.8 8.2l3.2 3.2M7.4 15.2l1.2 1.2M15 8.2l1.8 1.8" />
    </>
  ),
  track: (
    <>
      <path d="M3.2 13.2h17.6M3.2 17.2h17.6" />
      <path d="M4.8 13.2v4M19.2 13.2v4" />
      <path d="M7 17.2v1.8M10 17.2v1.8M13 17.2v1.8M16 17.2v1.8M19 17.2v1.8" />
    </>
  ),
  arcTrack: (
    <>
      <path d="M3.4 8.6a8.6 8.6 0 0 0 17.2 0" />
      <path d="M3.4 8.6V7M20.6 8.6V7" />
      <path d="M8 16.4l1 1M12 17.3v1.4M16 16.4l-1 1" />
    </>
  ),
  pulley: (
    <>
      <path d="M8.6 3.4h6.8M12 3.4v4.2" />
      <circle cx="12" cy="13" r="5.4" />
      <circle cx="12" cy="13" r="1.9" />
    </>
  ),
  movablePulley: (
    <>
      <circle cx="12" cy="10.4" r="5.4" />
      <circle cx="12" cy="10.4" r="1.9" />
      <path d="M12 15.8v3.6M9.2 19.4h5.6" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="5.2" />
      <circle cx="12" cy="12" r="1.7" />
      {gearTeeth(12, 12, 5.2, 8.3, 8)}
    </>
  ),
  rack: (
    <>
      <rect x="2.8" y="7.6" width="18.4" height="5.4" rx="1.2" />
      <path d="M5.6 13v2.4M8.4 13v2.4M11.2 13v2.4M14 13v2.4M16.8 13v2.4M19.6 13v2.4" />
    </>
  ),
  wheel: (
    <>
      <circle cx="12" cy="12" r="7.8" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 9.8V4.2M12 14.2v5.6M9.8 12H4.2M14.2 12h5.6" />
    </>
  ),
  flywheel: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="6.2" />
      <circle cx="12" cy="12" r="1.6" />
      <path d="M12 10.4V5.8M12 13.6v4.6M10.4 12H5.8M13.6 12h4.6" />
    </>
  ),
  conveyor: (
    <>
      <circle cx="5.4" cy="14.4" r="2.4" />
      <circle cx="18.6" cy="14.4" r="2.4" />
      <path d="M5.4 12h13.2M5.4 16.8h13.2" />
      <path d="M9.4 14.4h4.2M12 13.2l1.2 1.2-1.2 1.2" />
    </>
  ),
  thruster: (
    <>
      <path d="M8.4 7.8h5.6l4.2 4.2-4.2 4.2H8.4z" />
      <path d="M8.4 10.2L3.6 12M8.4 13.8L4.6 12M8.4 12H2.8" />
    </>
  ),
  magnet: (
    <>
      <path d="M7.2 4.6v8a4.8 4.8 0 0 0 9.6 0v-8" />
      <path d="M4.8 4.6h4.8M14.4 4.6h4.8" />
    </>
  ),
  planet: (
    <>
      <circle cx="12" cy="12" r="3.1" />
      <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-26 12 12)" />
      <circle cx="19.6" cy="8.4" r="1.2" />
    </>
  ),
}

/** 10 种连接的小图标 */
const LINK_ICONS: Record<MechLinkKind, ReactNode> = {
  spring: <path d="M2.8 12h2l2-4.6 3.2 9.2 3.2-9.2 3.2 9.2 2-4.6h2.4" />,
  damper: (
    <>
      <rect x="8.4" y="6.4" width="7.2" height="11.2" rx="1.4" />
      <path d="M3 12h5.4M15.6 12H21M11 9.4v5.2" />
    </>
  ),
  rope: <path d="M3.6 5.8v4.4c0 4.2 3.8 6 8.4 6s8.4-1.8 8.4-6V5.8" />,
  rod: (
    <>
      <path d="M5.4 18.6L18.6 5.4" />
      <circle cx="5.4" cy="18.6" r="2.1" />
      <circle cx="18.6" cy="5.4" r="2.1" />
    </>
  ),
  hinge: (
    <>
      <circle cx="12" cy="12" r="2.4" />
      <path d="M10.3 10.7L4.8 6.6M13.7 13.3l5.5 4.1" />
    </>
  ),
  weld: (
    <>
      <path d="M3.4 7.8h17.2M3.4 16.2h17.2" />
      <path d="M6.2 7.8l1.7 8.4 1.7-8.4 1.7 8.4 1.7-8.4 1.7 8.4 1.7-8.4 1.7 8.4" />
    </>
  ),
  belt: (
    <>
      <circle cx="6.6" cy="12" r="3.6" />
      <circle cx="18" cy="12" r="2.2" />
      <path d="M6.6 8.4l11.4 1.1M6.6 15.6l11.4-1.1" />
    </>
  ),
  gearPair: (
    <>
      <circle cx="8.2" cy="12" r="4.4" />
      <circle cx="16.8" cy="12" r="3.1" />
      <circle cx="8.2" cy="12" r="1.2" />
      <circle cx="16.8" cy="12" r="1" />
      {gearTeeth(8.2, 12, 4.4, 6, 8)}
      {gearTeeth(16.8, 12, 3.1, 4.4, 6)}
    </>
  ),
  rackPinion: (
    <>
      <circle cx="8.6" cy="8.2" r="3.8" />
      <circle cx="8.6" cy="8.2" r="1.1" />
      {gearTeeth(8.6, 8.2, 3.8, 5.3, 8)}
      <path d="M2.8 17.2h18.4M2.8 20.8h18.4M6.4 17.2v-2.4M10 17.2v-2.4M13.6 17.2v-2.4M17.2 17.2v-2.4" />
    </>
  ),
  piston: (
    <>
      <rect x="2.6" y="8.2" width="9.8" height="7.6" rx="1.3" />
      <path d="M8.4 9.8v4.4M8.4 12h12.8" />
    </>
  ),
}

/** 界面用的小图标（工具栏 / 世界面板 / 搜索框…） */
const UI_ICONS = {
  search: (
    <>
      <circle cx="10.6" cy="10.6" r="5.6" />
      <path d="M14.9 14.9l4 4" />
    </>
  ),
  chevron: <path d="M7.5 10l4.5 4.5 4.5-4.5" />,
  close: <path d="M8.4 8.4l7.2 7.2M15.6 8.4l-7.2 7.2" />,
  play: <path d="M9.2 6.4l8.2 5.6-8.2 5.6z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="8.2" y="6.4" width="3" height="11.2" rx="1" fill="currentColor" stroke="none" />
      <rect x="12.8" y="6.4" width="3" height="11.2" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  reset: (
    <>
      <path d="M5.4 12a6.6 6.6 0 1 0 2-4.7" />
      <path d="M5.2 4.6v3.8h3.8" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 11.2v5M12 7.8v.2" />
    </>
  ),
  scissors: (
    <>
      <circle cx="7" cy="7" r="2.2" />
      <circle cx="7" cy="17" r="2.2" />
      <path d="M9 8.4l11 7.2M9 15.6L20 8.4" />
    </>
  ),
  trash: (
    <>
      <path d="M4.8 7h14.4M9.4 7V4.8h5.2V7M7.2 7l.8 12h8L16.8 7" />
      <path d="M10.4 10.6v5M13.6 10.6v5" />
    </>
  ),
  vector: (
    <>
      <path d="M4.4 19.6L19.6 4.4" />
      <path d="M19.6 4.4h-5M19.6 4.4v5" />
    </>
  ),
  decompose: (
    <>
      <path d="M12 20v-6.6M12 13.4L5.4 5.4M12 13.4l6.6-8" />
      <path d="M5.4 5.4h4.2M5.4 5.4v4.2M18.6 5.4h-4.2M18.6 5.4v4.2" />
    </>
  ),
  copy: (
    <>
      <rect x="8.4" y="8.4" width="11" height="11" rx="1.6" />
      <path d="M5.6 15.6h-.9a1.3 1.3 0 0 1-1.3-1.3V4.7a1.3 1.3 0 0 1 1.3-1.3h9.6a1.3 1.3 0 0 1 1.3 1.3v.9" />
    </>
  ),
  ruler: (
    <>
      <rect x="2.8" y="9.2" width="18.4" height="5.6" rx="1.2" />
      <path d="M6.6 9.2v2.4M9.8 9.2v2.4M13 9.2v2.4M16.2 9.2v2.4" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="7.8" />
      <path d="M4.4 12h15.2M12 4.2c2.3 2.4 2.3 13.2 0 15.6M12 4.2c-2.3 2.4-2.3 13.2 0 15.6" />
    </>
  ),
  gravity: <path d="M12 4.2v14.4M7.4 13.8L12 18.4l4.6-4.6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="7.4" />
      <path d="M12 7.6V12l3.1 1.9" />
    </>
  ),
  link: (
    <>
      <path d="M9.4 14.6l5.2-5.2" />
      <path d="M8.4 9.6L6.7 11.3a3.5 3.5 0 0 0 4.9 4.9l1.7-1.7M15.6 14.4l1.7-1.7a3.5 3.5 0 0 0-4.9-4.9l-1.7 1.7" />
    </>
  ),
} as const

type UiIconName = keyof typeof UI_ICONS

function UiIcon({ name, size = 14, className }: { name: UiIconName; size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      {UI_ICONS[name]}
    </IconBase>
  )
}

function PartIcon({ kind, size = 22 }: { kind: MechPartKind; size?: number }) {
  return <IconBase size={size}>{PART_ICONS[kind]}</IconBase>
}

function LinkIcon({ kind, size = 15 }: { kind: MechLinkKind; size?: number }) {
  return <IconBase size={size}>{LINK_ICONS[kind]}</IconBase>
}

/* ───────── 基础输入件 ───────── */

/** 失焦 / 回车才提交的数字框（和右栏同一套习惯） */
function Num({
  value,
  unit,
  min,
  max,
  step = 0.1,
  digits = 3,
  width = 58,
  onCommit,
}: {
  value: number
  unit?: string
  min?: number
  max?: number
  step?: number
  digits?: number
  width?: number
  onCommit: (v: number) => void
}) {
  const [text, setText] = useState(String(Number(value.toFixed(digits))))
  useEffect(() => setText(String(Number(value.toFixed(digits)))), [value, digits])
  const commit = (raw?: string) => {
    const source = raw ?? text
    const n = Number(source)
    if (!Number.isFinite(n) || source.trim() === '') {
      setText(String(Number(value.toFixed(digits))))
      return
    }
    const v = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
    onCommit(v)
    setText(String(Number(v.toFixed(digits))))
  }
  return (
    <span className="mechbar__field">
      <input
        type="number"
        className="mechbar__num"
        style={{ width }}
        value={text}
        step={step}
        onChange={(e) => {
          const raw = e.target.value
          setText(raw)
          // 世界面板折叠时输入框在 display:none 里，拿不到焦点 → 程序化改值直接提交，
          // 否则值只停在 DOM 上，不会写回文档（验证脚本会这样改世界参数）
          if (document.activeElement !== e.currentTarget) commit(raw)
        }}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
      />
      {unit && <i>{unit}</i>}
    </span>
  )
}

/** 失焦 / 回车才提交的文本框（标签、强调色这类字符串字段） */
function Text({
  value,
  placeholder,
  width = 118,
  onCommit,
}: {
  value: string
  placeholder?: string
  width?: number
  onCommit: (v: string) => void
}) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const commit = () => onCommit(text.trim())
  return (
    <input
      type="text"
      className="mechbar__text"
      style={{ flex: '0 0 auto', width, minWidth: 0 }}
      spellCheck={false}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
    />
  )
}

/** 一行勾选框 */
function Check({
  checked,
  onChange,
  title,
  dataField,
  extra,
  children,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  title?: string
  dataField?: string
  /** 额外类名（给验证脚本更稳的钩子，如 mechbar__collisions） */
  extra?: string
  children: ReactNode
}) {
  return (
    <label className={'mechbar__check' + (extra ? ' ' + extra : '')} title={title} data-field={dataField}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  )
}

/** 一个带小标题的字段分组（检查器里的「基本」「材质与摩擦」…） */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mechbar__group">
      <div className="mechbar__heading">{title}</div>
      <div className="mechbar__fieldrow">{children}</div>
    </div>
  )
}

/* ───────── 施加力（恒力 / 公式力） ───────── */

function ForceEditor({ part, onPatch }: { part: MechPart; onPatch: (patch: Partial<MechPart>) => void }) {
  const force = part.force
  const mode = force?.mode ?? 'const'
  const base: MechForce = {
    enabled: force?.enabled ?? true,
    mode,
    n: force?.n ?? 5,
    expr: force?.expr ?? '0.5*m*g',
    angle: force?.angle ?? 0,
  }
  const patch = (next: Partial<MechForce>) => onPatch({ force: { ...base, ...next } })
  return (
    <div className="mechbar__force">
      <div className="mechbar__forcerow">
        <label className="mechbar__check mechbar__forceon">
          <input
            type="checkbox"
            checked={Boolean(force?.enabled)}
            onChange={(e) => patch({ enabled: e.target.checked })}
          />
          施加力
        </label>
        <select
          className="mechbar__select mechbar__forcemode"
          value={mode}
          onChange={(e) => patch({ mode: e.target.value as 'const' | 'expr' })}
          title="恒力：直接给牛顿数；公式力：随位置 / 速度 / 时间变化"
        >
          <option value="const">恒力</option>
          <option value="expr">公式力</option>
        </select>
      </div>

      {mode === 'const' ? (
        <div className="mechbar__forcegrid">
          <label>
            大小
            <Num
              value={base.n ?? 5}
              unit="N"
              min={-500}
              max={500}
              step={0.5}
              onCommit={(v) => patch({ n: v, mode: 'const' })}
            />
          </label>
          <label>
            方向
            <Num
              value={base.angle}
              unit="°"
              min={-180}
              max={180}
              step={5}
              onCommit={(v) => patch({ angle: v, mode: 'const' })}
            />
          </label>
          <div className="mechbar__dirs" title="快速设定恒力方向">
            {FORCE_DIRS.map((d) => (
              <button
                key={d.label}
                className="mechbar__chip"
                data-on={base.angle === d.angle}
                title={d.hint}
                onClick={() => patch({ angle: d.angle, mode: 'const' })}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mechbar__forcegrid mechbar__forcegrid--expr">
          <input
            className="mechbar__expr"
            spellCheck={false}
            placeholder="F(x,v,t)  可用 x y vx vy t m g"
            value={force?.expr ?? ''}
            onChange={(e) => patch({ expr: e.target.value, mode: 'expr' })}
            title="表达式用 mathjs 语法，结果是牛顿"
          />
          <label>
            方向
            <Num
              value={base.angle}
              unit="°"
              min={-180}
              max={180}
              step={5}
              onCommit={(v) => patch({ angle: v, mode: 'expr' })}
            />
          </label>
        </div>
      )}
    </div>
  )
}

/* ───────── 部件检查器 ───────── */

function PartInspector({
  part,
  parts,
  live,
  onPatch,
  onDelete,
  onDuplicatePart,
  onDuplicateSub,
  onGroup,
  onUngroup,
}: {
  part: MechPart
  parts: MechPart[]
  live: MechLive
  onPatch: (patch: Partial<MechPart>) => void
  onDelete: () => void
  onDuplicatePart: () => void
  onDuplicateSub: () => void
  onGroup: () => void
  onUngroup: () => void
}) {
  const spec = MECH_PART_SPEC[part.kind]
  const mat = materialOf(part)
  const staticKind = MECH_STATIC_KINDS.includes(part.kind)
  const tracks = parts.filter((p) => p.kind === 'track')
  const livePart = live.parts[part.id]
  const canMotor = MECH_MOTOR_KINDS.includes(part.kind)
  const canPin = PINNED_KINDS.includes(part.kind)
  const showTeeth = part.kind === 'gear' || part.kind === 'rack'
  const showDevice =
    part.kind === 'thruster' ||
    part.kind === 'magnet' ||
    part.kind === 'planet' ||
    part.kind === 'conveyor' ||
    part.kind === 'arcTrack'
  const showSize2 = part.size2 !== undefined || spec.size2 !== undefined

  return (
    <div className="mechbar__insp">
      <div className="mechbar__insphead">
        <PartIcon kind={part.kind} size={18} />
        <span className="mechbar__insptitle">{spec.label}</span>
        <span className="mechbar__inspbadge">{CATEGORY_TEXT[spec.category]}</span>
        <button className="mechbar__del" onClick={onDelete} title="删除这个部件（连着的连接一起删）">
          <UiIcon name="trash" size={12} />
          删除
        </button>
      </div>

      <div className="mechbar__fields">
        <Group title="基本">
          <label data-field="mass">
            质量
            <Num value={part.mass} unit="kg" min={0} max={200} step={0.1} onCommit={(v) => onPatch({ mass: v })} />
          </label>
          <label data-field="x">
            x
            <Num value={part.x} unit="m" min={-20} max={20} step={0.1} onCommit={(v) => onPatch({ x: v })} />
          </label>
          <label data-field="y">
            y
            <Num value={part.y} unit="m" min={-20} max={20} step={0.1} onCommit={(v) => onPatch({ y: v })} />
          </label>
          <label data-field="size">
            {sizeLabel(part.kind)}
            <Num value={part.size} unit="m" min={0.02} max={8} step={0.02} onCommit={(v) => onPatch({ size: v })} />
          </label>
          {showSize2 && (
            <label data-field="size2">
              {size2Label(part.kind)}
              <Num
                value={part.size2 ?? 0.1}
                unit="m"
                min={0.005}
                max={4}
                step={0.01}
                onCommit={(v) => onPatch({ size2: v })}
              />
            </label>
          )}
          {ANGLE_KINDS.includes(part.kind) && (
            <label data-field="angle">
              {angleLabel(part.kind)}
              <Num
                value={part.angle ?? 0}
                unit="°"
                min={-180}
                max={180}
                step={1}
                onCommit={(v) => onPatch({ angle: v })}
              />
            </label>
          )}
        </Group>

        {!staticKind && tracks.length > 0 && (
          <Group title="运动约束">
            <label className="mechbar__cell--wide">
              轨道约束
              <select
                className="mechbar__select"
                data-field="onTrack"
                value={part.onTrack ?? ''}
                onChange={(e) => onPatch({ onTrack: e.target.value || undefined })}
                title="勾上后这个部件只能沿选中的轨道滑"
              >
                <option value="">不限制</option>
                {tracks.map((t, i) => (
                  <option key={t.id} value={t.id}>
                    轨道 {i + 1}
                  </option>
                ))}
              </select>
            </label>
          </Group>
        )}

        <Group title="材质与摩擦">
          <label className="mechbar__cell--wide" data-field="material">
            材质
            <select
              className="mechbar__select"
              value={part.material ?? 'wood'}
              onChange={(e) => onPatch({ material: e.target.value as MechMaterial })}
              title="材质给一组默认摩擦 / 恢复系数，下面两项可以单独覆盖"
            >
              {(Object.keys(MECH_MATERIALS) as MechMaterial[]).map((id) => (
                <option key={id} value={id}>
                  {MECH_MATERIALS[id].label}
                </option>
              ))}
            </select>
          </label>
          <label data-field="friction">
            摩擦
            <Num
              value={mat.friction}
              min={0}
              max={1}
              step={0.01}
              digits={2}
              onCommit={(v) => onPatch({ friction: v })}
            />
          </label>
          <label data-field="restitution">
            恢复系数
            <Num
              value={mat.restitution}
              min={0}
              max={1}
              step={0.01}
              digits={2}
              onCommit={(v) => onPatch({ restitution: v })}
            />
          </label>
        </Group>

        {(canMotor || canPin || showTeeth) && (
          <Group title="转动 / 传动">
            {canMotor && (
              <label data-field="motor">
                电机力矩
                <Num
                  value={part.motor ?? 0}
                  unit="N·m"
                  min={-20}
                  max={20}
                  step={0.2}
                  onCommit={(v) => onPatch({ motor: v })}
                />
              </label>
            )}
            {canPin && (
              <Check
                checked={Boolean(part.pinned)}
                onChange={(v) => onPatch({ pinned: v })}
                title="中心轴固定在原地，只转不动（转动副）"
                dataField="pinned"
              >
                中心轴固定
              </Check>
            )}
            {showTeeth && (
              <label data-field="teeth">
                齿数
                <Num
                  value={part.teeth ?? 16}
                  unit="齿"
                  min={6}
                  max={60}
                  step={1}
                  onCommit={(v) => onPatch({ teeth: v })}
                />
              </label>
            )}
          </Group>
        )}

        {showDevice && (
          <Group title="装置 / 场">
            {part.kind === 'thruster' && (
              <label data-field="thrust">
                推力
                <Num
                  value={part.thrust ?? 15}
                  unit="N"
                  min={-200}
                  max={200}
                  step={1}
                  onCommit={(v) => onPatch({ thrust: v })}
                />
              </label>
            )}
            {part.kind === 'magnet' && (
              <>
                <label data-field="pole">
                  磁极
                  <select
                    className="mechbar__select"
                    value={part.pole ?? 'N'}
                    onChange={(e) => onPatch({ pole: e.target.value === 'S' ? 'S' : 'N' })}
                  >
                    <option value="N">N 极</option>
                    <option value="S">S 极</option>
                  </select>
                </label>
                <label data-field="strength">
                  磁强度
                  <Num
                    value={part.strength ?? 8}
                    unit="N·m²"
                    min={0}
                    max={200}
                    step={0.5}
                    onCommit={(v) => onPatch({ strength: v })}
                  />
                </label>
              </>
            )}
            {part.kind === 'planet' && (
              <label data-field="strength">
                引力强度
                <Num
                  value={part.strength ?? 40}
                  unit="m³/s²"
                  min={0}
                  max={500}
                  step={1}
                  onCommit={(v) => onPatch({ strength: v })}
                />
              </label>
            )}
            {part.kind === 'conveyor' && (
              <label data-field="speed">
                表面速度
                <Num
                  value={part.speed ?? 1.2}
                  unit="m/s"
                  min={-10}
                  max={10}
                  step={0.1}
                  onCommit={(v) => onPatch({ speed: v })}
                />
              </label>
            )}
            {part.kind === 'arcTrack' && (
              <label data-field="span">
                跨度
                <Num
                  value={part.span ?? 150}
                  unit="°"
                  min={20}
                  max={330}
                  step={5}
                  onCommit={(v) => onPatch({ span: v })}
                />
              </label>
            )}
          </Group>
        )}

        <Group title="状态">
          <div className="mechbar__checks">
            {staticKind ? (
              <span className="mechbar__meta">固定件：钉死在画布上，不参与受力</span>
            ) : (
              <Check
                checked={Boolean(part.fixed)}
                onChange={(v) => onPatch({ fixed: v })}
                title="固定 = 锁死不动（仍可选中 / 删除）"
                dataField="fixed"
              >
                固定
              </Check>
            )}
            <Check
              checked={Boolean(part.locked)}
              onChange={(v) => onPatch({ locked: v })}
              title="锁定：编辑模式里拖不动，防止误碰"
              dataField="locked"
            >
              锁定
            </Check>
          </div>
          {!staticKind && (
            <label data-field="gravityScale">
              自重比例
              <Num
                value={part.gravityScale ?? 1}
                min={-2}
                max={3}
                step={0.1}
                digits={2}
                onCommit={(v) => onPatch({ gravityScale: v })}
              />
            </label>
          )}
          <label data-field="color">
            强调色
            <Text
              value={part.color ?? ''}
              placeholder="#a4514a"
              width={88}
              onCommit={(v) => onPatch({ color: v || undefined })}
            />
          </label>
          <label className="mechbar__cell--wide" data-field="label">
            标签
            <Text
              value={part.label ?? ''}
              placeholder="缺省用部件名"
              onCommit={(v) => onPatch({ label: v || undefined })}
            />
          </label>
          {part.group && <span className="mechbar__meta mechbar__cell--wide">已归入子机构</span>}
        </Group>
      </div>

      <p className="mechbar__meta">
        {livePart
          ? '当前 v = ' +
            fixed3(livePart.speed) +
            ' m/s · ω = ' +
            fixed3(livePart.omega) +
            ' rad/s · 动能 ' +
            fixed3(livePart.ke) +
            ' J'
          : '实时读数：播放后这里显示速度 / 角速度 / 动能'}
        {part.fixed || staticKind ? ' · 固定件' : ''}
      </p>

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

      {!staticKind && <ForceEditor part={part} onPatch={onPatch} />}
    </div>
  )
}

/* ───────── 连接检查器 ───────── */

function LinkInspector({
  link,
  parts,
  onPatch,
  onDelete,
}: {
  link: MechLink
  parts: MechPart[]
  onPatch: (patch: Partial<MechLink>) => void
  onDelete: () => void
}) {
  const spec = MECH_LINK_SPEC[link.kind]
  const length = linkLength(link, parts)
  const period = springPeriod(link, parts)
  const ratio = linkRatio(link, parts)
  const pulleys = parts.filter((p) => p.kind === 'pulley' || p.kind === 'movablePulley')
  const vias = linkVias(link)
  const zeroRest =
    link.kind === 'hinge' ||
    link.kind === 'weld' ||
    link.kind === 'belt' ||
    link.kind === 'gearPair' ||
    link.kind === 'rackPinion'
  const driving = link.kind === 'belt' || link.kind === 'gearPair' || link.kind === 'rackPinion'

  return (
    <div className="mechbar__insp">
      <div className="mechbar__insphead">
        <LinkIcon kind={link.kind} size={18} />
        <span className="mechbar__insptitle">{spec.label}</span>
        <span className="mechbar__inspbadge">{LINK_GROUP_TEXT[spec.category] ?? ''}</span>
        <button className="mechbar__del" onClick={onDelete} title="拆掉这条连接">
          <UiIcon name="trash" size={12} />
          拆除
        </button>
      </div>

      <div className="mechbar__fields">
        <Group title="基本">
          {!zeroRest && (
            <label data-field="rest">
              自然长度
              <Num
                value={link.rest}
                unit="m"
                min={0}
                max={12}
                step={0.05}
                onCommit={(v) => onPatch({ rest: v })}
              />
            </label>
          )}
          {driving && (
            <label data-field="ratio">
              传动比
              <Num
                value={link.ratio ?? Number(ratio.toFixed(3))}
                min={-20}
                max={20}
                step={0.01}
                digits={3}
                onCommit={(v) => onPatch({ ratio: v === 0 ? undefined : v })}
              />
            </label>
          )}
        </Group>

        <Group title="端点偏移">
          <label data-field="offsetAX">
            端点 A x
            <Num
              value={link.offsetA?.x ?? 0}
              unit="m"
              min={-3}
              max={3}
              step={0.05}
              onCommit={(v) => onPatch({ offsetA: { x: v, y: link.offsetA?.y ?? 0 } })}
            />
          </label>
          <label data-field="offsetAY">
            A y
            <Num
              value={link.offsetA?.y ?? 0}
              unit="m"
              min={-3}
              max={3}
              step={0.05}
              onCommit={(v) => onPatch({ offsetA: { x: link.offsetA?.x ?? 0, y: v } })}
            />
          </label>
          <label data-field="offsetBX">
            端点 B x
            <Num
              value={link.offsetB?.x ?? 0}
              unit="m"
              min={-3}
              max={3}
              step={0.05}
              onCommit={(v) => onPatch({ offsetB: { x: v, y: link.offsetB?.y ?? 0 } })}
            />
          </label>
          <label data-field="offsetBY">
            B y
            <Num
              value={link.offsetB?.y ?? 0}
              unit="m"
              min={-3}
              max={3}
              step={0.05}
              onCommit={(v) => onPatch({ offsetB: { x: link.offsetB?.x ?? 0, y: v } })}
            />
          </label>
        </Group>

        {(link.kind === 'spring' || link.kind === 'piston' || link.kind === 'damper') && (
          <Group title="弹性 / 阻尼">
            {(link.kind === 'spring' || link.kind === 'piston') && (
              <label data-field="k">
                劲度 k
                <Num
                  value={link.k ?? (link.kind === 'piston' ? 400 : 25)}
                  unit="N/m"
                  min={1}
                  max={2000}
                  step={5}
                  onCommit={(v) => onPatch({ k: v })}
                />
              </label>
            )}
            {(link.kind === 'spring' || link.kind === 'damper') && (
              <label data-field="c">
                阻尼 c
                <Num
                  value={link.c ?? (link.kind === 'damper' ? 2 : 0)}
                  unit="N·s/m"
                  min={0}
                  max={50}
                  step={0.05}
                  onCommit={(v) => onPatch({ c: v })}
                />
              </label>
            )}
          </Group>
        )}

        {link.kind === 'hinge' && (
          <Group title="角度限位">
            <label data-field="lo">
              下限 lo
              <Num value={link.lo ?? 0} unit="°" min={-180} max={180} step={5} onCommit={(v) => onPatch({ lo: v })} />
            </label>
            <label data-field="hi">
              上限 hi
              <Num value={link.hi ?? 0} unit="°" min={-180} max={180} step={5} onCommit={(v) => onPatch({ hi: v })} />
            </label>
          </Group>
        )}

        {link.kind === 'piston' && (
          <Group title="活塞">
            <label data-field="target">
              目标长度
              <Num
                value={link.target ?? link.rest}
                unit="m"
                min={0}
                max={12}
                step={0.05}
                onCommit={(v) => onPatch({ target: v })}
              />
            </label>
            <label data-field="maxForce">
              最大推力
              <Num
                value={link.maxForce ?? 150}
                unit="N"
                min={0}
                max={2000}
                step={5}
                onCommit={(v) => onPatch({ maxForce: v })}
              />
            </label>
          </Group>
        )}

        {link.kind === 'rope' && pulleys.length > 0 && (
          <Group title="绕滑轮">
            <div className="mechbar__route">
              <span className="mechbar__routehint">按点击顺序绕过（再点一次取消）</span>
              {pulleys.map((p, i) => (
                <button
                  key={p.id}
                  className="mechbar__chip"
                  data-on={vias.includes(p.id)}
                  title={nameOfPart(p) + (vias.includes(p.id) ? '：已绕过，点一下取消' : '：点一下加入路线')}
                  onClick={() => {
                    const next = vias.includes(p.id) ? vias.filter((v) => v !== p.id) : [...vias, p.id]
                    onPatch({ vias: next, via: undefined })
                  }}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </Group>
        )}
      </div>

      <p className="mechbar__meta">
        {'当前长度 ' + fixed3(length) + ' m'}
        {period !== null && ' · 理论周期 T = 2π√(m/k) ≈ ' + fixed3(period) + ' s'}
        {driving && ' · 实际传动比 ' + fixed3(ratio)}
      </p>
    </div>
  )
}

/* ───────── 实时读数轮询 ───────── */

/** 每 120ms 从 ref 里取一次引擎读数，避免跟着物理帧重渲染 */
function useLiveSnap(live: { current: MechLive }): MechLive {
  const read = (): MechLive => {
    const cur = live.current
    return { ...cur, parts: cur.parts ?? {} }
  }
  const [snap, setSnap] = useState<MechLive>(read)
  useEffect(() => {
    const timer = window.setInterval(() => {
      const cur = live.current
      setSnap({ ...cur, parts: cur.parts ?? {} })
    }, 120)
    return () => window.clearInterval(timer)
  }, [live])
  return snap
}

/* ───────── 主面板 ───────── */

export function MechBar(props: Props) {
  const {
    params,
    selected,
    selectedIds,
    live,
    pending,
    anchor,
    playing,
    editing,
    vectors,
    decompose,
    labels,
    trails,
    grid,
    snapAngle,
    measure,
    measureMode,
    onEditing,
    onPending,
    onAddPart,
    onPatchPart,
    onPatchLink,
    onPatchParams,
    onDelete,
    onDisconnect,
    onClear,
    onPlay,
    onReset,
    onPreset,
    onVectors,
    onDecompose,
    onLabels,
    onTrails,
    onGrid,
    onSnapAngle,
    onMeasureMode,
    onMeasureClear,
    onDuplicate,
    onDuplicatePart,
    onDuplicateSub,
    onGroup,
    onUngroup,
    onSelectMany,
    onAlign,
    onDistribute,
    onRotate,
  } = props

  const [cat, setCat] = useState<MechCategory>('body')
  const [query, setQuery] = useState('')
  /** 世界参数默认收成一行摘要，点开才展开字段（字段始终在 DOM 里，验证脚本能读到） */
  const [worldOpen, setWorldOpen] = useState(false)
  const snap = useLiveSnap(live)
  const barRef = useRef<HTMLDivElement>(null)

  const part = selected?.kind === 'part' ? partOf(params.parts, selected.id) : undefined
  const link = selected?.kind === 'link' ? params.links.find((l) => l.id === selected.id) : undefined
  const anchorPart = anchor ? partOf(params.parts, anchor) : undefined

  /* 选中部件 / 连接时，把检查器滚进视野；选中多个时回到顶部看多选工具条 */
  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    if (selected) {
      const insp = bar.querySelector('.mechbar__insp')
      if (insp) insp.scrollIntoView({ block: 'nearest' })
    }
  }, [selected])

  useEffect(() => {
    if (selectedIds.length >= 2 && !selected) barRef.current?.scrollTo({ top: 0 })
  }, [selectedIds.length, selected])

  /* 操作提示：连接模式下必须出现「再点一个部件」这句（老验证脚本依赖） */
  let hint: string
  if (measureMode) {
    hint =
      measure && measure.b
        ? '测距：已量出两点距离，再点一个部件重新开始（Esc 退出）'
        : '测距：依次点两个部件，量出它们的距离与连线角度（Esc 退出）'
  } else if (pending) {
    hint = anchorPart
      ? '已选起点「' + nameOfPart(anchorPart) + '」，再点一个部件完成连接（Esc 取消）'
      : '点第一个部件作为连接起点（当前：' + MECH_LINK_SPEC[pending].label + '）'
  } else if (params.parts.length === 0) {
    hint = '把部件盘里的部件拖到画布上，或点一下放到画面中央；再从「连接」行选一种连接把两个部件串起来'
  } else if (editing) {
    hint = '编辑：拖部件摆位置；选一种连接再点两个部件就能连成机构'
  } else {
    hint = '真实：按住部件拖动就是施力；选中后可改力的大小与方向'
  }

  /* 测距结果：优先读引擎里的实时位置，暂停时退回文档坐标 */
  const measureInfo = (() => {
    if (!measure) return null
    const a = partOf(params.parts, measure.a)
    const b = partOf(params.parts, measure.b)
    if (!a || !b) return null
    const pa = (playing ? snap.parts[a.id] : undefined) ?? { x: a.x, y: a.y }
    const pb = (playing ? snap.parts[b.id] : undefined) ?? { x: b.x, y: b.y }
    const dx = pb.x - pa.x
    const dy = pb.y - pa.y
    return {
      a: nameOfPart(a),
      b: nameOfPart(b),
      dist: Math.hypot(dx, dy),
      angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    }
  })()

  const selectedPart = part
  const selectedLive = selectedPart ? snap.parts[selectedPart.id] : undefined

  return (
    <div className="mechbar" ref={barRef} onPointerDown={(e) => e.stopPropagation()}>
      {/* 1. 顶部：编辑 / 真实 + 播放 + 重置 */}
      <div className="mechbar__mode" data-editing={editing}>
        <div className="mechbar__seg">
          <button data-active={editing} onClick={() => onEditing(true)} title="摆零件、连结构、改参数；物理暂停">
            编辑
          </button>
          <button
            data-active={!editing}
            onClick={() => onEditing(false)}
            title="按真实物理运行：重力、弹簧、摩擦全部生效；拖动部件就是施力"
          >
            真实
          </button>
        </div>
        <button className="mechbar__play" data-active={playing} onClick={() => onPlay(!playing)} title={playing ? '暂停物理（可继续摆零件）' : '开始按物理规律运行'}>
          <UiIcon name={playing ? 'pause' : 'play'} size={13} />
          {playing ? '暂停' : '播放'}
        </button>
        <button className="mechbar__mini mechbar__reset" onClick={onReset} title="回到摆放位置重新开始">
          <UiIcon name="reset" size={13} />
          重置
        </button>
      </div>

      {/* 2. 多选工具条：选中 ≥2 个部件时贴在顶部，一眼可见 */}
      {selectedIds.length >= 2 && (
        <div className="mechbar__multi">
          <span className="mechbar__multihead">多选 {selectedIds.length}</span>
          <button className="mechbar__mini" onClick={() => onAlign('x')} title="让选中的部件 x 坐标相同">
            水平对齐
          </button>
          <button className="mechbar__mini" onClick={() => onAlign('y')} title="让选中的部件 y 坐标相同">
            垂直对齐
          </button>
          <button className="mechbar__mini" onClick={() => onDistribute('x')} title="按 x 坐标等间距排开">
            水平分布
          </button>
          <button className="mechbar__mini" onClick={() => onDistribute('y')} title="按 y 坐标等间距排开">
            垂直分布
          </button>
          <button className="mechbar__mini" onClick={() => onRotate(-15)} title="选中的部件逆时针转 15°">
            旋转 -15°
          </button>
          <button className="mechbar__mini" onClick={() => onRotate(15)} title="选中的部件顺时针转 15°">
            旋转 +15°
          </button>
          <button className="mechbar__mini" onClick={onGroup}>
            成组
          </button>
          <button className="mechbar__mini" onClick={onDuplicate} disabled={params.parts.length === 0}>
            复制
          </button>
          <button className="mechbar__mini" onClick={onDelete}>
            删除
          </button>
          <button className="mechbar__mini" onClick={() => onSelectMany([])}>
            取消多选
          </button>
        </div>
      )}

      {/* 操作提示（多选时让位给上面的多选工具条，DOM 仍保留） */}
      <p className="mechbar__hint" hidden={selectedIds.length >= 2}>
        <UiIcon name="info" size={12} className="mechbar__hinticon" />
        <span>{hint}</span>
      </p>

      {/* 3. 部件盘：分类 pill + 搜索 + 图标网格；23 个按钮全部在 DOM，非当前分类 hidden */}
      <section className="mechbar__section mechbar__section--palette">
        <div className="mechbar__cats" role="tablist" aria-label="部件分类">
          {MECH_CATEGORIES.map((c) => (
            <button
              key={c.id}
              className="mechbar__cat"
              data-cat={c.id}
              data-active={cat === c.id && !query.trim()}
              onClick={() => {
                setCat(c.id)
                setQuery('')
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="mechbar__searchbox">
          <UiIcon name="search" size={14} className="mechbar__searchicon" />
          <input
            className="mechbar__search"
            type="search"
            value={query}
            spellCheck={false}
            placeholder="搜索 23 种部件…"
            onChange={(e) => setQuery(e.target.value)}
          />
          {query.trim() && (
            <button className="mechbar__searchclear" type="button" onClick={() => setQuery('')} title="清空搜索">
              <UiIcon name="close" size={11} />
            </button>
          )}
        </div>
        <div className="mechbar__palette">
          {MECH_PART_CATALOG.map((p) => {
            const visible = query.trim() ? partMatches(p, query) : p.category === cat
            return (
              <button
                key={p.kind}
                className="mechbar__part"
                hidden={!visible}
                draggable
                data-part-kind={p.kind}
                data-cat={p.category}
                title={p.label + '：' + p.hint}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/chordot-mech', p.kind)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => onAddPart(p.kind)}
              >
                <PartIcon kind={p.kind} size={20} />
                <span className="mechbar__partlabel">{p.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* 4. 连接行：10 种连接全部可见，每种一个小图标 */}
      <section className="mechbar__section mechbar__section--links">
        <div className="mechbar__sectionhead">
          <span className="mechbar__label">连接</span>
          <span className="mechbar__sectionhint">选一种，再依次点两个部件</span>
        </div>
        <div className="mechbar__links">
          {MECH_LINK_CATALOG.map((l) => (
            <button
              key={l.kind}
              className="mechbar__link"
              data-kind={l.kind}
              data-active={pending === l.kind}
              title={l.hint}
              onClick={() => onPending(pending === l.kind ? null : l.kind)}
            >
              <LinkIcon kind={l.kind} />
              <span>{l.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 5. 工具栏：一排小号图标 chip */}
      <div className="mechbar__row mechbar__row--tools">
        <button
          className="mechbar__mini mechbar__tool"
          onClick={onDisconnect}
          disabled={params.links.length === 0}
          title="拆掉所有连接，部件留在画布上"
        >
          <UiIcon name="scissors" size={12} />
          拆开全部连接
        </button>
        <button
          className="mechbar__mini mechbar__tool"
          onClick={onClear}
          disabled={params.parts.length === 0}
          title="清空整台机构"
        >
          <UiIcon name="trash" size={12} />
          清空
        </button>
        <button className="mechbar__mini mechbar__tool" data-active={vectors} onClick={() => onVectors(!vectors)} title="在部件上画速度 / 受力箭头">
          <UiIcon name="vector" size={12} />
          {vectors ? '隐藏矢量' : '显示矢量'}
        </button>
        <button
          className="mechbar__mini mechbar__tool"
          data-active={decompose}
          onClick={() => onDecompose(!decompose)}
          title="把重力 / 弹力 / 合力分解成分力显示"
        >
          <UiIcon name="decompose" size={12} />
          受力分解
        </button>
        <button
          className="mechbar__mini mechbar__tool"
          onClick={onDuplicate}
          disabled={params.parts.length === 0}
          title="整套机构复制一份，方便对比"
        >
          <UiIcon name="copy" size={12} />
          复制机构
        </button>
      </div>

      {/* 6. 预设：18 个小胶囊，两行横向滚动（会替换当前场景） */}
      <section className="mechbar__section mechbar__section--presets">
        <div className="mechbar__sectionhead">
          <span className="mechbar__label">预设</span>
          <span className="mechbar__sectionhint">一键换一台机构（左右滚动看全部）</span>
        </div>
        <div className="mechbar__presets">
          {MECH_PRESETS.map((p) => (
            <button
              key={p.id}
              data-group={p.group}
              onClick={() => onPreset(p.id)}
              title={p.group + '：' + p.label + '（会替换当前场景）'}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* 7. 世界面板：默认一行摘要，展开后是完整字段（字段始终在 DOM 里） */}
      <div className="mechbar__world" data-open={worldOpen}>
        <button
          className="mechbar__worldtoggle"
          type="button"
          aria-expanded={worldOpen}
          onClick={() => setWorldOpen((v) => !v)}
          title={worldOpen ? '收起世界参数' : '展开世界参数：重力 / 时间倍率 / 空气阻力 / 网格吸附 / 显示开关'}
        >
          <UiIcon name="globe" size={14} className="mechbar__worldicon" />
          <span className="mechbar__worldtitle">世界</span>
          <span className="mechbar__worldsum">
            重力 {trimNum(params.gravity, 2)}
            <i>·</i>时间 ×{trimNum(params.timeScale ?? 1, 2)}
            {params.collisions === false && (
              <>
                <i>·</i>碰撞关
              </>
            )}
            {measureMode && (
              <>
                <i>·</i>测距中
              </>
            )}
            <i>·</i>网格 {grid > 0 ? trimNum(grid, 2) + ' m' : '关'}
          </span>
          <UiIcon name="chevron" size={13} className="mechbar__chev" />
        </button>
        <div className="mechbar__worldbody" hidden={!worldOpen}>
          <div className="mechbar__fieldrow mechbar__worldgrid">
            <label className="mechbar__gravity" data-field="gravity">
              重力
              <Num
                value={params.gravity}
                unit="m/s²"
                min={-30}
                max={30}
                step={0.1}
                digits={2}
                onCommit={(v) => onPatchParams({ gravity: v })}
              />
            </label>
            <label className="mechbar__timescale" data-field="timeScale">
              时间倍率
              <Num
                value={params.timeScale ?? 1}
                unit="×"
                min={0.1}
                max={2}
                step={0.1}
                digits={2}
                onCommit={(v) => onPatchParams({ timeScale: v })}
              />
            </label>
            <label className="mechbar__airdrag" data-field="airDrag">
              空气阻力
              <Num
                value={params.airDrag ?? 0}
                min={0}
                max={0.2}
                step={0.0005}
                digits={4}
                onCommit={(v) => onPatchParams({ airDrag: v })}
              />
            </label>
            <label>
              网格吸附
              <select
                className="mechbar__select mechbar__grid"
                data-field="grid"
                value={String(grid)}
                onChange={(e) => onGrid(Number(e.target.value))}
                title="拖部件时贴到网格上（0 = 不吸附）"
              >
                {GRID_STEPS.map((g) => (
                  <option key={g.value} value={String(g.value)}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="mechbar__worldchecks">
              <Check
                checked={params.collisions !== false}
                onChange={(v) => onPatchParams({ collisions: v })}
                title="关掉后部件之间互相穿过（地面 / 轨道照样挡）"
                dataField="collisions"
                extra="mechbar__collisions"
              >
                部件碰撞
              </Check>
              <Check checked={snapAngle} onChange={onSnapAngle} title="旋转部件时按 15° 吸附" dataField="snapAngle">
                角度吸附
              </Check>
              <Check checked={labels} onChange={onLabels} title="在部件旁边显示名字与质量" dataField="labels">
                标签
              </Check>
              <Check checked={trails} onChange={onTrails} title="记录运动轨迹（最多 160 点）" dataField="trails">
                轨迹
              </Check>
              <button
                className="mechbar__mini mechbar__measure"
                data-field="measure"
                data-active={measureMode}
                onClick={() => onMeasureMode(!measureMode)}
                title="点两个部件，量出它们的距离与连线角度"
              >
                <UiIcon name="ruler" size={13} />
                测距
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 8. 检查器 */}
      {part && (
        <PartInspector
          part={part}
          parts={params.parts}
          live={snap}
          onPatch={(patch) => onPatchPart(part.id, patch)}
          onDelete={onDelete}
          onDuplicatePart={onDuplicatePart}
          onDuplicateSub={onDuplicateSub}
          onGroup={onGroup}
          onUngroup={onUngroup}
        />
      )}
      {link && (
        <LinkInspector
          link={link}
          parts={params.parts}
          onPatch={(patch) => onPatchLink(link.id, patch)}
          onDelete={onDelete}
        />
      )}

      {/* 9. 测距结果（在实时读数上方，读数常驻底部） */}
      {measureInfo && (
        <div className="mechbar__dim">
          <span className="mechbar__dimtext">
            测距 {measureInfo.a} → {measureInfo.b}：L = {fixed3(measureInfo.dist)} m · 角度{' '}
            {fixed3(measureInfo.angle, 1)}°
          </span>
          <button className="mechbar__mini" onClick={onMeasureClear}>
            清除测距
          </button>
        </div>
      )}

      {/* 10. 底部实时读数（120ms 轮询，不跟物理帧 setState） */}
      <div className="mechbar__live">
        <span className="mechbar__liveitem">
          <i>t</i>
          <b>{fixed3(snap.t)}</b>
          <em>s</em>
        </span>
        <span className="mechbar__liveitem">
          <i>动能</i>
          <b>{fixed3(snap.ke)}</b>
          <em>J</em>
        </span>
        <span className="mechbar__liveitem">
          <i>重力势能</i>
          <b>{fixed3(snap.pe)}</b>
          <em>J</em>
        </span>
        <span className="mechbar__liveitem">
          <i>弹性势能</i>
          <b>{fixed3(snap.elastic)}</b>
          <em>J</em>
        </span>
        <span className="mechbar__liveitem">
          <i>总机械能</i>
          <b>{fixed3(snap.ke + snap.pe + snap.elastic)}</b>
          <em>J</em>
        </span>
        <span className="mechbar__liveitem">
          <i>动量</i>
          <b>{fixed3(snap.momentum)}</b>
          <em>kg·m/s</em>
        </span>
        {selectedLive && (
          <span className="mechbar__liveitem mechbar__liveitem--sel">
            <i>选中</i>
            <b>{fixed3(selectedLive.speed)}</b>
            <em>m/s</em>
            <i>ω</i>
            <b>{fixed3(selectedLive.omega)}</b>
            <em>rad/s</em>
            <i>动能</i>
            <b>{fixed3(selectedLive.ke)}</b>
            <em>J</em>
          </span>
        )}
      </div>
    </div>
  )
}
