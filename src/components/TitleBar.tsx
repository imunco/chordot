interface Props {
  file: string
  dirty: boolean
  /** 课件标题（meta.title，缺省不显示） */
  title?: string
  /** 传了才显示「返回大厅」按钮 */
  onHome?: () => void
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path
        d="M4 10.5 12 4l8 6.5V20h-5.5v-5h-5v5H4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function TitleBar({ file, dirty, title, onHome }: Props) {
  const display = title && title.trim() ? title.trim() : ''
  return (
    <div className="titlebar">
      {onHome && (
        <button className="titlebar__home" onClick={onHome} title="返回大厅（新建 / 打开 / 换模式）">
          <HomeIcon />
          <span>大厅</span>
        </button>
      )}
      {display ? <span className="titlebar__title">{display}</span> : null}
      <span className="titlebar__file">{file}</span>
      {dirty && (
        <span className="titlebar__dirty" title="有未保存的修改">
          ·
        </span>
      )}
    </div>
  )
}
