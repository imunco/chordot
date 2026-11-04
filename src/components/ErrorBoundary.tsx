import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * 兜底：任何渲染异常都不该让老师面对一片白屏。
 * 出错时给一张纸面卡片，可以重新加载或导出当前数据目录里的文件。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('渲染出错：', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="crash">
        <div className="crash__card">
          <div className="crash__title">弦点遇到了一点问题</div>
          <p className="crash__text">
            界面渲染出错了。已经保存的课件不会丢失，可以重新加载继续。
          </p>
          <pre className="crash__detail">{String(error.message || error)}</pre>
          <div className="crash__actions">
            <button className="btn btn--primary" onClick={() => location.reload()}>
              重新加载
            </button>
            <button className="btn" onClick={() => window.chordot?.store?.open()}>
              打开数据目录
            </button>
          </div>
        </div>
      </div>
    )
  }
}
