import type { Solution } from '../kernel/types'
import type { Mode } from '../model/types'

interface Props {
  mode: Mode
  selectedCount: number
  picks: number
  zoom: number
  scaleText: string
  busy: boolean
  slow: boolean
  solveMs: number
  source: Solution['source'] | null
  /** 选中两个点时直接在状态栏给出距离，不用打开右栏 */
  measureText?: string
  /** 右栏是否展开：没展开时提示按 P */
  rightOpen: boolean
  onToggleMode: () => void
}

export function StatusBar({
  mode,
  selectedCount,
  picks,
  zoom,
  scaleText,
  busy,
  slow,
  solveMs,
  source,
  measureText,
  rightOpen,
  onToggleMode,
}: Props) {
  return (
    <footer className="statusbar">
      <div className="statusbar__left">
        <button className="modebtn" title="切换模式 M" onClick={onToggleMode}>
          {mode === 'physics' ? '物理模式' : '数学模式'}
        </button>
        {busy && <span className="calc-dot" data-slow={slow} />}
        <span className="sep">·</span>
        <span>
          {selectedCount > 0
            ? `已选 ${selectedCount} 个对象${rightOpen ? '' : '（按 P 看属性）'}`
            : '未选中对象'}
        </span>
        {picks > 0 && (
          <>
            <span className="sep">·</span>
            <span>构造中，已拾取 {picks} 点（Esc 取消）</span>
          </>
        )}
        {measureText && (
          <>
            <span className="sep">·</span>
            <span className="statusbar__measure" title="两点距离">
              {measureText}
            </span>
          </>
        )}
        {!busy && source && (
          <>
            <span className="sep">·</span>
            <span title="内核求解耗时">
              内核 {solveMs < 10 ? solveMs.toFixed(1) : Math.round(solveMs)} ms
              {source === 'wasm' ? ' · WASM' : ''}
            </span>
          </>
        )}
      </div>
      <div className="statusbar__right">
        <span>缩放 {Math.round(zoom * 100)}%</span>
        <span className="sep">·</span>
        <span>{scaleText}</span>
      </div>
    </footer>
  )
}
