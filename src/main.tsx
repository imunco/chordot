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
  await Promise.race([hydrate(), new Promise((r) => setTimeout(r, 1200))])
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}

void boot()
