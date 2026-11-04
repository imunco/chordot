import type { ForceKind, SolidShape } from '../kernel/types'

export type ObjKind =
  | 'point'
  | 'line'
  | 'polygon'
  | 'circle'
  | 'polyline'
  | 'function'
  | 'solid'
  | 'force'

export type ForceType = 'gravity' | 'normal' | 'friction' | 'tension' | 'external'

export interface BaseObj {
  /** 构成该对象的点 id（拖动对象本体时整组平移这些点） */
  anchorIds?: string[]
  id: string
  kind: ObjKind
  name: string
  color: string
  visible: boolean
  /** 依附父对象（力矢量依附于物体），左栏用 12px 缩进表达 */
  parentId?: string
}

export interface PointObj extends BaseObj {
  kind: 'point'
  x: number
  y: number
  /** 可拖动点（画布手柄） */
  draggable?: boolean
}

export interface LineObj extends BaseObj {
  kind: 'line'
  a: [number, number]
  b: [number, number]
}

export interface PolygonObj extends BaseObj {
  kind: 'polygon'
  points: [number, number][]
}

export interface CircleObj extends BaseObj {
  kind: 'circle'
  center: [number, number]
  r: number
}

export interface SolidObj extends BaseObj {
  kind: 'solid'
  shape: SolidShape
}

export interface PolylineObj extends BaseObj {
  kind: 'polyline'
  points: [number, number][]
  dashed?: boolean
}

export interface FunctionObj extends BaseObj {
  kind: 'function'
  expr: string
  /** 采样折线，按不连续处断开 */
  curves: [number, number][][]
  error?: string
}

export interface ForceObj extends BaseObj {
  kind: 'force'
  forceType: ForceType
  /** 牛顿 */
  magnitude: number
  /** 世界坐标角度，0° 指向 +x，逆时针为正 */
  angle: number
  at: [number, number]
  /** 约束力由求解器决定，不可拖拽方向 */
  constrained: boolean
  /** 方向状态文字，教学语言 */
  directionLabel: string
  /** 数值来源说明 */
  origin?: string
  /** 手工添加的力：大小表达式 */
  expr?: string
  /** 手工添加的力：取值方式 */
  forceKind?: ForceKind
  /** 求值失败时的提示 */
  error?: string
}

export type GeoObj =
  | PointObj
  | LineObj
  | PolygonObj
  | CircleObj
  | FunctionObj
  | SolidObj
  | PolylineObj
  | ForceObj

export type Mode = 'math' | 'physics'
export type SubState = 'statics' | 'kinematics'
export type ToolId = 'select' | 'point' | 'line' | 'circle' | 'polygon' | 'curve' | 'force'

export interface Vec2 {
  x: number
  y: number
}

export interface NetResult {
  sumF: Vec2
  sumM: number
  balanced: boolean
}

export const FORCE_COLOR: Record<ForceType, string> = {
  gravity: '#3a3a38',
  normal: '#4a6b8a',
  friction: '#9a5b4a',
  tension: '#4a6b55',
  external: '#4a6b55',
}

export const FORCE_LABEL: Record<ForceType, string> = {
  gravity: '重力',
  normal: '支持力',
  friction: '摩擦力',
  tension: '张力',
  external: '外力',
}
