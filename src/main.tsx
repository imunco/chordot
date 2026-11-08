import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LabWindow } from './components/LabWindow'
import { SymbolLab } from './components/SymbolLab'
import { hydrate } from './persist'
import './styles/tokens.css'
import './styles/app.css'
// 机构装配（物理模式）的专属样式：面板 / 图标网格 / 世界面板，覆盖 app.css 里的旧 .mechbar 规则
import './styles/mech.css'

/**
 * 先把磁盘上的用户数据同步回 localStorage 再渲染，
 * 这样组件里所有读取都还是同步的。
 */
async function boot() {
  const query = new URLSearchParams(location.search)
  const lab = query.get('lab')
  const labId = query.get('id') ?? undefined
  const symbols = query.get('symbols')

  // 本地数据最多等 1.2s，等太久不如先出界面
  await Promise.race([hydrate(), new Promise((r) => setTimeout(r, 1200))])
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        {symbols ? <SymbolLab /> : lab ? <LabWindow initialId={labId} /> : <App />}
      </ErrorBoundary>
    </StrictMode>,
  )
  // 首帧画完再撤启动占位，避免闪一下白屏
  requestAnimationFrame(() => {
    requestAnimationFrame(() => document.getElementById('boot')?.remove())
  })
}

void boot()
