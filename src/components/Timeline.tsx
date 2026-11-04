import { PauseIcon, PlayIcon } from './icons'

interface Props {
  playing: boolean
  /** 当前回放位置（帧序号） */
  index: number
  /** 当前帧的真实仿真时刻（秒）；缺省时按 60fps 估算 */
  time?: number
  /** 已记录的帧数 */
  total: number
  onToggle: () => void
  onScrub: (index: number) => void
  onLive: () => void
}

/** 物理世界的时间轴：播放 / 暂停 / 拖动回溯 */
export function Timeline({ playing, index, total, time, onToggle, onScrub, onLive }: Props) {
  const max = Math.max(0, total - 1)
  const atLive = index >= max
  const seconds = (time ?? index / 60).toFixed(1)

  return (
    <div className="timeline">
      <button
        className="timeline__play"
        title={playing ? '暂停 空格' : '继续播放'}
        onClick={onToggle}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      <input
        className="timeline__range"
        type="range"
        min={0}
        max={max}
        step={1}
        value={Math.min(index, max)}
        onChange={(e) => onScrub(Number(e.target.value))}
        aria-label="回放时间轴"
      />

      <span className="timeline__time">{seconds}s</span>

      <button className="timeline__live" data-active={atLive} onClick={onLive} disabled={atLive}>
        回到当前
      </button>
    </div>
  )
}
