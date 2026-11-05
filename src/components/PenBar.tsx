const COLORS = ['#9a5b4a', '#3d5a66', '#4a6b8a', '#5a7a52', '#8a4a6a', '#3a3a38']
const WIDTHS = [1.6, 2.5, 4]

interface Props {
  color: string
  width: number
  mode: 'pen' | 'marker'
  onChange: (patch: { color?: string; width?: number; mode?: 'pen' | 'marker' }) => void
  onClear: () => void
}

/** 画笔设置条：笔型 + 颜色 + 粗细 + 清空 */
export function PenBar({ color, width, mode, onChange, onClear }: Props) {
  return (
    <div className="penbar">
      <span className="penbar__label">批注</span>
      <div className="penbar__modes">
        <button
          className="penbar__mode"
          data-active={mode === 'pen'}
          title="普通笔：实线"
          onClick={() => onChange({ mode: 'pen' })}
        >
          笔
        </button>
        <button
          className="penbar__mode"
          data-active={mode === 'marker'}
          title="荧光笔：粗、半透明，用来划重点"
          onClick={() => onChange({ mode: 'marker' })}
        >
          荧光
        </button>
      </div>
      <span className="penbar__sep" />
      <div className="penbar__colors">
        {COLORS.map((c) => (
          <button
            key={c}
            className="penbar__swatch"
            style={{ background: c }}
            data-active={c === color}
            title={c}
            onClick={() => onChange({ color: c })}
          />
        ))}
      </div>
      <span className="penbar__sep" />
      <div className="penbar__widths">
        {WIDTHS.map((w) => (
          <button
            key={w}
            className="penbar__width"
            data-active={w === width}
            title={`线宽 ${w}`}
            onClick={() => onChange({ width: w })}
          >
            <span
              style={{
                height: mode === 'marker' ? Math.min(9, w * 2.2) : w,
                background: 'currentColor',
                opacity: mode === 'marker' ? 0.45 : 1,
              }}
            />
          </button>
        ))}
      </div>
      <span className="penbar__sep" />
      <button className="penbar__clear" onClick={onClear}>
        清空批注
      </button>
    </div>
  )
}
