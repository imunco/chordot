interface Props {
  file: string
  dirty: boolean
}

export function TitleBar({ file, dirty }: Props) {
  return (
    <div className="titlebar">
      <span className="titlebar__file">{file}</span>
      {dirty && (
        <span className="titlebar__dirty" title="有未保存的修改">
          ·
        </span>
      )}
    </div>
  )
}
