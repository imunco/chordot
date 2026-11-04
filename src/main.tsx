import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { hydrate } from './persist'
import './styles/tokens.css'
import './styles/app.css'

/**
 * 先把磁盘上的用户数据同步回 localStorage 再渲染，
 * 这样组件里所有读取都还是同步的。
 */
async function boot() {
  // 本地数据最多等 1.2s，等太久不如先出界面
  await Promise.race([hydrate(), new Promise((r) => setTimeout(r, 1200))])
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
  // 首帧画完再撤启动占位，避免闪一下白屏
  requestAnimationFrame(() => {
    requestAnimationFrame(() => document.getElementById('boot')?.remove())
  })
}

void boot()
