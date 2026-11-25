import type { SceneSpec } from '../kernel/types'
import { inclineScene, pendulumScene, sketchScene, solidScene } from '../state'
import { emptyMechScene } from './mech'

/**
 * 「新建课件」的初始画布。
 *
 * 大厅里点模式卡、或新建对话框里选画布，最终都落到这里的一个 Starter：
 * 它只负责「一开始放什么场景」，具体的网格 / 角度单位 / 触控偏好由 App 的 settings 决定。
 */
export type StarterCanvas = 'blank' | 'grid' | 'incline' | 'motion' | 'solid' | 'mech'

export interface StarterDef {
  id: StarterCanvas
  label: string
  hint: string
  /** 物理场景会先把学科切成物理，数学 / 通用场景切成数学 */
  subject: 'math' | 'physics' | 'any'
  /** 缩略图 / 预览用的场景 */
  scene: () => SceneSpec
}

export const STARTERS: StarterDef[] = [
  {
    id: 'blank',
    label: '空白画布',
    hint: '干净的纸，自己决定画什么',
    subject: 'any',
    scene: sketchScene,
  },
  {
    id: 'grid',
    label: '坐标网格',
    hint: '带坐标轴与网格，适合函数与几何',
    subject: 'math',
    scene: sketchScene,
  },
  {
    id: 'incline',
    label: '物理受力',
    hint: '斜面 + 物块 + G / N / f',
    subject: 'physics',
    scene: () => inclineScene(),
  },
  {
    id: 'motion',
    label: '运动仿真',
    hint: '单摆起步，可切换弹簧 / 抛体',
    subject: 'physics',
    scene: () => pendulumScene(),
  },
  {
    id: 'solid',
    label: '三维立体',
    hint: '多面体 / 旋转体，可拖拽旋转',
    subject: 'math',
    scene: () => solidScene(),
  },
  {
    id: 'mech',
    label: '机构装配台',
    hint: '23 种部件 / 10 种连接，装配后能真实运动',
    subject: 'physics',
    scene: () => emptyMechScene(),
  },
]

export const starterOf = (id: StarterCanvas): StarterDef =>
  STARTERS.find((s) => s.id === id) ?? STARTERS[0]

/** 新建课件时真正 dispatch 的场景 */
export function starterScene(id: StarterCanvas): SceneSpec {
  return starterOf(id).scene()
}

/** 文件名的清洗：去掉路径非法字符，补 .chordot，空名给默认值 */
export function cleanFileName(name: string): string {
  const base = name
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.chordot$/i, '')
    .slice(0, 60)
  const safe = base || '未命名课件'
  return `${safe}.chordot`
}

/** 只取文件名（不带目录），大厅最近列表与标题栏共用 */
export function fileNameOf(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

/** 取目录，展示「上次打开的位置」 */
export function folderOf(path: string): string {
  const index = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return index > 0 ? path.slice(0, index) : ''
}
