import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LabWindow } from './components/LabWindow'
import { SymbolLab } from './components/SymbolLab'
import { PrintSheet } from './components/PrintSheet'
import { GalleryWindow } from './components/GalleryWindow'
import { hydrate } from './persist'
import { loadSettings } from './settings'
import { installJellySegments } from './ui/jellySegments'
import './styles/tokens.css'
import './styles/app.css'
// 机构装配（物理模式）的专属样式：面板 / 图标网格 / 世界面板，覆盖 app.css 里的旧 .mechbar 规则
import './styles/mech.css'
// 启动大厅与新建课件对话框
import './styles/lobby.css'
import './styles/print.css'
import './styles/glass.css'

/**
 * 先把磁盘上的用户数据同步回 localStorage 再渲染，
 * 这样组件里所有读取都还是同步的。
 */
// 主题必须在首帧前写入：避免白底闪一下；打印窗口永远用纸面
const bootQuery = new URLSearchParams(location.search)
const bootIsPrint = Boolean(bootQuery.get('print'))
const applyTheme = () => {
  document.documentElement.dataset.theme = bootIsPrint ? 'paper' : loadSettings().theme
}
applyTheme()
installJellySegments()
window.addEventListener('storage', (e) => {
  if (e.key === 'chordot.settings') applyTheme()
})

async function boot() {
  const query = new URLSearchParams(location.search)
  const lab = query.get('lab')
  const labId = query.get('id') ?? undefined
  const symbols = query.get('symbols')
  const print = query.get('print')
  const gallery = query.get('gallery')

  // 本地数据最多等 1.2s，等太久不如先出界面
  await Promise.race([hydrate(), new Promise((r) => setTimeout(r, 1200))])
  const root = createRoot(document.getElementById('root')!)
  // 同步提交首帧：撤启动占位不能只靠两帧 rAF —— 窗口在后台 / 远程桌面时 rAF 会被节流，
  // #boot 会一直盖在画布上挡住鼠标事件（验证脚本踩过：elementFromPoint 返回 #boot）。
  flushSync(() => {
    root.render(
      <StrictMode>
        <ErrorBoundary>
          {symbols ? (
            <SymbolLab />
          ) : print ? (
            <PrintSheet />
          ) : gallery ? (
            <GalleryWindow />
          ) : lab ? (
            <LabWindow initialId={labId} />
          ) : (
            <App />
          )}
        </ErrorBoundary>
      </StrictMode>,
    )
  })
  document.getElementById('boot')?.remove()
  requestAnimationFrame(() => document.getElementById('boot')?.remove())
}

void boot()
