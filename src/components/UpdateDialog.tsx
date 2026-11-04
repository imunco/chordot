import { CloseIcon } from './icons'

interface Props {
  result: UpdateCheckResult
  downloading: boolean
  received: number
  total: number
  mirror: string | null
  filePath: string | null
  error: string | null
  onDownload: () => void
  onInstall: () => void
  onLater: () => void
  onSkipVersion: () => void
  onMute: () => void
  onClose: () => void
}

const mb = (n: number) => (n > 0 ? `${(n / 1048576).toFixed(1)} MB` : '')

export function UpdateDialog(p: Props) {
  const total = p.total || 0
  const pct = total > 0 ? Math.min(100, Math.round((p.received / total) * 100)) : 0
  const ready = Boolean(p.filePath)

  return (
    <div className="gallery update" role="dialog" aria-label="发现新版本" onClick={p.onClose}>
      <div className="update__card" onClick={(e) => e.stopPropagation()}>
        <header className="update__head">
          <div>
            <div className="update__title">发现新版本 {p.result.latest}</div>
            <div className="update__sub">
              当前 {p.result.current}
              {p.result.publishedAt ? ` · ${String(p.result.publishedAt).slice(0, 10)} 发布` : ''}
            </div>
          </div>
          <button className="iconbtn" title="关闭" onClick={p.onClose}>
            <CloseIcon size={15} />
          </button>
        </header>

        <div className="update__notes">
          {p.result.notes ? (
            p.result.notes
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean)
              .map((line, i) =>
                line.startsWith('#') ? (
                  <div key={i} className="update__section">
                    {line.replace(/^#+\s*/, '')}
                  </div>
                ) : (
                  <p key={i} className="update__line">
                    {line.replace(/^[-*]\s*/, '')}
                  </p>
                ),
              )
          ) : (
            <p className="update__line update__line--muted">这个版本没有写更新说明。</p>
          )}
        </div>

        {p.downloading && (
          <div className="update__progress">
            <div className="update__bar">
              <span style={{ width: `${pct}%` }} />
            </div>
            <div className="update__meta">
              <span>
                {total > 0 ? `${pct}% · ${mb(p.received)} / ${mb(total)}` : mb(p.received)}
              </span>
              {p.mirror && <span>来自 {p.mirror}</span>}
            </div>
          </div>
        )}

        {p.error && <div className="update__error">{p.error}</div>}

        <footer className="update__foot">
          <div className="update__quiet">
            <button className="update__link" onClick={p.onSkipVersion}>
              忽略本次更新
            </button>
            <button className="update__link" onClick={p.onMute}>
              不再提醒
            </button>
          </div>
          <div className="update__actions">
            <button className="btn" onClick={p.onLater}>
              下次提醒我
            </button>
            {ready ? (
              <button className="btn btn--primary" onClick={p.onInstall}>
                打开安装包
              </button>
            ) : (
              <button className="btn btn--primary" disabled={p.downloading} onClick={p.onDownload}>
                {p.downloading ? '正在下载…' : '立即下载'}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}
