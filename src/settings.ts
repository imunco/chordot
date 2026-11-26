import { mirror } from './persist'

const KEY = 'chordot.settings'

export type ThemeId = 'paper' | 'glass'

export interface Settings {
  /** 力箭头标尺：每牛顿多少像素 */
  forceScale: number
  /** 新建时是否显示网格 */
  grid: boolean
  /** 角度单位 */
  angleUnit: 'deg' | 'rad'
  /** 网格密度：多少世界单位一格 */
  gridStep: number
  /** 坐标轴上是否显示刻度数字 */
  showTicks: boolean
  /** 函数曲线线宽 */
  curveWidth: number
  /** 减弱动效：关掉过渡与入场动画 */
  reduceMotion: boolean
  /** 启动即进入触控模式（一体机 / 平板） */
  touchDefault: boolean
  /** 首次引导是否已完成 */
  onboarded: boolean
  /** 启动时先显示大厅（选择模式 / 新建 / 打开最近） */
  startInLobby: boolean
  /** 自动保存 / 崩溃恢复 */
  autosave: boolean
  /** 自动保存间隔（秒） */
  autosaveInterval: number
  /** 大厅显示每日一言（Hitokoto + 本地兜底） */
  dailyQuote: boolean
  /** 一言分类（c=游戏 i=诗词 k=哲学... 见 model/hitokoto.ts） */
  quoteCategory: string
  /** 本地错误日志开关 */
  errorLog: boolean
  /** 教材 / 模板库默认开独立窗口（关掉则回落到内嵌面板） */
  independentWindows: boolean
  /** 界面主题：纸面（默认）/ 液态玻璃 */
  theme: ThemeId
  /** 批注：上次用的颜色 / 粗细 / 笔型 */
  penColor: string
  penWidth: number
  penMode: 'pen' | 'marker' | 'pencil'
  /** 批注：速度感应线宽 */
  penVelocity: boolean

  /** 自动检查更新 */
  updateAuto: boolean
  /** 提醒频率 */
  updateFreq: 'startup' | 'daily' | 'weekly' | 'never'
  /** 不再提醒（用户主动关掉所有更新提示） */
  updateMuted: boolean
  /** 忽略的版本号 */
  updateSkip: string
  /** 上次检查时间（毫秒） */
  updateCheckedAt: number
  /** 下载源：auto = 自动竞速，其余为镜像 id */
  updateMirror: string
}

export const DEFAULT_SETTINGS: Settings = {
  forceScale: 4,
  grid: true,
  angleUnit: 'deg',
  gridStep: 1,
  showTicks: true,
  curveWidth: 1.5,
  reduceMotion: false,
  touchDefault: false,
  onboarded: false,
  startInLobby: true,
  autosave: true,
  autosaveInterval: 30,
  dailyQuote: true,
  quoteCategory: 'k',
  errorLog: true,
  independentWindows: true,
  theme: 'paper',
  penColor: '#9a5b4a',
  penWidth: 2.5,
  penMode: 'pen',
  penVelocity: true,
  updateAuto: true,
  updateFreq: 'startup',
  updateMuted: false,
  updateSkip: '',
  updateCheckedAt: 0,
  updateMirror: 'auto',
}

const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fallback

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_SETTINGS
    const p = JSON.parse(raw) as Partial<Settings>
    const freq: Settings['updateFreq'][] = ['startup', 'daily', 'weekly', 'never']
    return {
      forceScale: num(p.forceScale, 1, 12, DEFAULT_SETTINGS.forceScale),
      grid: typeof p.grid === 'boolean' ? p.grid : DEFAULT_SETTINGS.grid,
      angleUnit: p.angleUnit === 'rad' ? 'rad' : 'deg',
      gridStep: [0.5, 1, 2].includes(Number(p.gridStep)) ? Number(p.gridStep) : 1,
      showTicks: typeof p.showTicks === 'boolean' ? p.showTicks : true,
      curveWidth: num(p.curveWidth, 1, 3, 1.5),
      reduceMotion: typeof p.reduceMotion === 'boolean' ? p.reduceMotion : false,
      touchDefault: typeof p.touchDefault === 'boolean' ? p.touchDefault : false,
      onboarded: typeof p.onboarded === 'boolean' ? p.onboarded : false,
      startInLobby: typeof p.startInLobby === 'boolean' ? p.startInLobby : true,
      autosave: typeof p.autosave === 'boolean' ? p.autosave : true,
      autosaveInterval: num(p.autosaveInterval, 10, 300, 30),
      dailyQuote: typeof p.dailyQuote === 'boolean' ? p.dailyQuote : true,
      quoteCategory:
        typeof p.quoteCategory === 'string' && /^[a-l]$/.test(p.quoteCategory) ? p.quoteCategory : 'k',
      errorLog: typeof p.errorLog === 'boolean' ? p.errorLog : true,
      independentWindows: typeof p.independentWindows === 'boolean' ? p.independentWindows : true,
      theme: p.theme === 'glass' ? 'glass' : 'paper',
      penColor: typeof p.penColor === 'string' && /^#[0-9a-f]{6}$/i.test(p.penColor) ? p.penColor : DEFAULT_SETTINGS.penColor,
      penWidth: num(p.penWidth, 1, 8, DEFAULT_SETTINGS.penWidth),
      penMode:
        p.penMode === 'marker' || p.penMode === 'pencil' || p.penMode === 'pen'
          ? p.penMode
          : DEFAULT_SETTINGS.penMode,
      penVelocity: typeof p.penVelocity === 'boolean' ? p.penVelocity : true,
      updateAuto: typeof p.updateAuto === 'boolean' ? p.updateAuto : true,
      updateFreq: freq.includes(p.updateFreq as Settings['updateFreq'])
        ? (p.updateFreq as Settings['updateFreq'])
        : 'startup',
      updateMuted: typeof p.updateMuted === 'boolean' ? p.updateMuted : false,
      updateSkip: typeof p.updateSkip === 'string' ? p.updateSkip : '',
      updateCheckedAt: num(p.updateCheckedAt, 0, Number.MAX_SAFE_INTEGER, 0),
      updateMirror: typeof p.updateMirror === 'string' ? p.updateMirror : 'auto',
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* 隐私模式等场景静默失败 */
  }
  // 再镜像一份到 userData/data/settings.json
  mirror('settings', s)
}

/** 按提醒频率判断现在该不该自动检查 */
export function dueForCheck(s: Settings, now = Date.now()): boolean {
  if (!s.updateAuto || s.updateMuted) return false
  if (s.updateFreq === 'never') return false
  if (s.updateFreq === 'startup') return true
  const gap = s.updateFreq === 'daily' ? 864e5 : 6048e5
  return now - s.updateCheckedAt >= gap
}
