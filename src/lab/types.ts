/**
 * 教材实验室：类型定义
 *
 * 一个实验 = 一份「教材内容」+ 一组可调参数 + 一个可播放的演示台。
 * 演示台的几何与读数全部由 labModel() 从 (参数, 时间) 解析算出，
 * 不做逐帧积分，所以拖时间、暂停、换参数都能得到同一套数值。
 */

export type LabBook = '必修一' | '必修二' | '必修三' | '选必一' | '选必二' | '选必三'

export type LabField = '力学' | '电磁学' | '光学' | '热学' | '实验技能'

export type StageKind =
  | 'track'
  | 'cart'
  | 'spring'
  | 'vectors'
  | 'reaction'
  | 'projectile'
  | 'circular'
  | 'fall'
  | 'rc'
  | 'resistivity'
  | 'multimeter'
  | 'emf'
  | 'collision'
  | 'pendulum'
  | 'shm'
  | 'refraction'
  | 'interference'
  | 'induction'
  | 'transformer'
  | 'sensor'
  | 'oilfilm'
  | 'gas'

export interface LabControl {
  id: string
  label: string
  min: number
  max: number
  step: number
  unit?: string
  /** 显示几位小数，默认 2 */
  digits?: number
  /** 只在某个下拉参数取到指定值时才显示（如「未标出点数」只在计数点模式有意义） */
  showWhen?: { id: string; is: string }
}

export interface LabSelect {
  id: string
  label: string
  options: { value: string; label: string }[]
}

export interface LabExperiment {
  id: string
  name: string
  /** 列表里的短名 */
  short: string
  book: LabBook
  chapter: string
  section: string
  field: LabField
  kind: '分组实验' | '探究实验' | '验证实验' | '演示实验'
  stage: StageKind
  /** 一句话通俗解释，列表与标题下都显示 */
  tagline: string
  principle: string
  formulas: { expr: string; note: string }[]
  apparatus: string[]
  steps: string[]
  data: string[]
  errors: string[]
  cautions: string[]
  conclusion: string
  controls: LabControl[]
  selects?: LabSelect[]
  params: Record<string, number | string>
  /** 图表标题，缺省用「实时图像」 */
  chartTitle?: string
}

export type LabParams = Record<string, number | string>

export interface Reading {
  label: string
  value: string
  unit?: string
  /** 小字补充 */
  hint?: string
  /** 强调色读数 */
  tone?: 'accent' | 'warn' | 'plain'
}

export interface ChartSeries {
  pts: [number, number][]
  color?: string
  dashed?: boolean
  label?: string
  /** 只画点不连线（实验数据点） */
  dots?: boolean
}

export interface LabChart {
  title: string
  xLabel: string
  yLabel: string
  xRange: [number, number]
  yRange: [number, number]
  series: ChartSeries[]
  /** 当前时刻的游标点 */
  cursor?: [number, number]
  /** 竖直参考线（阈值 / 渐近线） */
  vline?: number
  hline?: number
}

export interface LabModel {
  readings: Reading[]
  chart?: LabChart
  /** 一句话解释此刻发生了什么 */
  note?: string
  /** 当前公式与代入值 */
  formula?: { expr: string; sub?: string }
  /** 渲染用的几何量（各 stage 自己约定字段） */
  g: Record<string, number>
  /** 需要额外画出的散点 / 轨迹 */
  pts?: [number, number][]
  /** 标签 / 状态文字 */
  tags?: string[]
}

export const FIELD_COLOR: Record<LabField, string> = {
  力学: '#3d5a66',
  电磁学: '#4a6b8a',
  光学: '#8a7a3e',
  热学: '#9a5b4a',
  实验技能: '#4a6b55',
}

export const BOOK_ORDER: LabBook[] = ['必修一', '必修二', '必修三', '选必一', '选必二', '选必三']

export const FIELD_ORDER: LabField[] = ['力学', '电磁学', '光学', '热学', '实验技能']
