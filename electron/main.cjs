const { app, BrowserWindow, dialog, ipcMain, net, protocol, screen } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { registerFileIpc } = require('./file-ipc.cjs')
const { registerUpdateIpc } = require('./update.cjs')
const { buildAppMenu } = require('./menu.cjs')
const { registerStoreIpc } = require('./store.cjs')

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)

// Windows 任务栏图标/通知归属：不设的话任务栏会挂到 electron.exe 名下
if (process.platform === 'win32') app.setAppUserModelId('cn.chordot.desktop')

/** 窗口图标：只有开发时读 build/icon.ico，打包后 exe 自带图标 */
const windowIcon = (() => {
  if (app.isPackaged) return undefined
  const p = path.join(__dirname, '..', 'build', 'icon.ico')
  try {
    return fs.existsSync(p) ? p : undefined
  } catch {
    return undefined
  }
})()
const DIST = path.join(__dirname, '..', 'dist')

/** 生产环境用自定义协议加载渲染进程：file:// 下 ES module 会被 CORS 拦截 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
])

/** 窗口几何 + 界面状态持久化（design.md §4.1） */
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json')

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'))
  } catch {
    return {}
  }
}

let saveTimer = null
function writeState(patch) {
  const next = { ...readState(), ...patch }
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(stateFile(), JSON.stringify(next, null, 2), 'utf8')
    } catch {
      /* 磁盘不可写时静默失败，不影响使用 */
    }
  }, 250)
  return next
}

/** 多显示器断开时回退主屏居中 */
function ensureVisible(bounds) {
  if (!bounds || typeof bounds.x !== 'number') return null
  const displays = screen.getAllDisplays()
  const visible = displays.some((d) => {
    const a = d.workArea
    return (
      bounds.x < a.x + a.width &&
      bounds.x + bounds.width > a.x &&
      bounds.y < a.y + a.height &&
      bounds.y + bounds.height > a.y
    )
  })
  if (visible) return bounds
  const primary = screen.getPrimaryDisplay().workArea
  return {
    width: Math.min(bounds.width, primary.width),
    height: Math.min(bounds.height, primary.height),
    x: Math.round(primary.x + (primary.width - bounds.width) / 2),
    y: Math.round(primary.y + (primary.height - bounds.height) / 2),
  }
}

let mainWindow = null
let labWindow = null
let symbolWindow = null
let forceClose = false

function createWindow() {
  const saved = readState()
  const bounds = ensureVisible(saved.bounds)
  const wa = screen.getPrimaryDisplay().workArea

  mainWindow = new BrowserWindow({
    width: bounds?.width ?? Math.min(1280, wa.width),
    height: bounds?.height ?? Math.min(820, wa.height),
    x: bounds?.x,
    y: bounds?.y,
    // 底栏要同时放下 10 个快捷色、更多颜色和清空；低于 1200 宽会开始挤压重叠
    minWidth: 1200,
    minHeight: 700,
    show: false,
    backgroundColor: '#FAFAF8',
    title: '弦点 / Chordot',
    ...(windowIcon ? { icon: windowIcon } : {}),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#F2F0EC',
      symbolColor: '#5C5A56',
      height: 36,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (saved.maximized) {
    mainWindow.maximize()
  } else if (!saved.bounds) {
    // 首次启动：教室一体机 / 大屏上直接铺满，教师不用再找最大化按钮
    if (wa.width >= 1600 && wa.height >= 900) mainWindow.maximize()
  }

  mainWindow.once('ready-to-show', () => mainWindow.show())
  bindFullscreenEvents(mainWindow)

  const persistBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const maximized = mainWindow.isMaximized()
    const b = maximized ? readState().bounds : mainWindow.getBounds()
    writeState({ bounds: b, maximized })
  }

  mainWindow.on('resize', persistBounds)
  mainWindow.on('move', persistBounds)
  mainWindow.on('close', persistBounds)

  // 有未保存修改时先让渲染进程确认，确认后才真正关闭
  mainWindow.on('close', (e) => {
    if (forceClose || !runtimeDirty) return
    e.preventDefault()
    mainWindow.webContents.send('app:request-close')
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    if (labWindow && !labWindow.isDestroyed()) labWindow.close()
    if (symbolWindow && !symbolWindow.isDestroyed()) symbolWindow.close()
  })

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadURL('app://chordot/index.html')
  }
}

/** 教材实验室独立窗口：适合双屏 / 投影，主窗口继续留着画布 */
function createLabWindow(id) {
  if (labWindow && !labWindow.isDestroyed()) {
    labWindow.show()
    labWindow.focus()
    if (id) {
      const send = () => {
        if (labWindow && !labWindow.isDestroyed()) labWindow.webContents.send('lab:switch', id)
      }
      if (labWindow.webContents.isLoading()) labWindow.webContents.once('did-finish-load', send)
      else send()
    }
    return labWindow
  }

  const saved = readState()
  const bounds = ensureVisible(saved.labBounds)
  const wa = screen.getPrimaryDisplay().workArea
  const width = bounds?.width ?? Math.min(1680, Math.round(wa.width * 0.94))
  const height = bounds?.height ?? Math.min(1040, Math.round(wa.height * 0.94))
  const x = bounds?.x ?? Math.round(wa.x + (wa.width - width) / 2)
  const y = bounds?.y ?? Math.round(wa.y + (wa.height - height) / 2)

  labWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 980,
    minHeight: 680,
    show: false,
    backgroundColor: '#FAFAF8',
    title: '教材实验室 · 弦点',
    autoHideMenuBar: true,
    ...(windowIcon ? { icon: windowIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (saved.labMaximized) labWindow.maximize()
  labWindow.once('ready-to-show', () => labWindow.show())
  bindFullscreenEvents(labWindow)

  const persist = () => {
    if (!labWindow || labWindow.isDestroyed()) return
    const maximized = labWindow.isMaximized()
    const b = maximized ? readState().labBounds : labWindow.getBounds()
    writeState({ labBounds: b, labMaximized: maximized })
  }
  labWindow.on('resize', persist)
  labWindow.on('move', persist)
  labWindow.on('close', persist)
  labWindow.on('closed', () => {
    labWindow = null
  })

  const query = `?lab=1${id ? `&id=${encodeURIComponent(id)}` : ''}`
  if (isDev) {
    labWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}${query}`)
  } else {
    labWindow.loadURL(`app://chordot/index.html${query}`)
  }
  return labWindow
}

/** 符号公式实验室：独立窗口，拼出来的表达式就是作用在小球上的合力 */
function createSymbolWindow() {
  if (symbolWindow && !symbolWindow.isDestroyed()) {
    symbolWindow.show()
    symbolWindow.focus()
    return symbolWindow
  }
  symbolWindow = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 980,
    minHeight: 700,
    show: false,
    backgroundColor: '#FAFAF8',
    title: '符号公式实验室 · 弦点',
    autoHideMenuBar: true,
    ...(windowIcon ? { icon: windowIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  symbolWindow.once('ready-to-show', () => symbolWindow.show())
  symbolWindow.on('closed', () => {
    symbolWindow = null
  })
  const query = '?symbols=1'
  if (isDev) {
    symbolWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}${query}`)
  } else {
    symbolWindow.loadURL(`app://chordot/index.html${query}`)
  }
  return symbolWindow
}

ipcMain.handle('symbol:open-window', () => {
  createSymbolWindow()
  return true
})

/** 符号实验室 → 主窗口：把拼好的公式交给机构里选中的部件 */
ipcMain.handle('symbol:apply', (_e, expr) => {
  if (typeof expr !== 'string' || !expr.trim()) return false
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('symbol:apply', expr)
    mainWindow.focus()
  }
  return true
})

ipcMain.handle('lab:open-window', (_e, payload) => {
  createLabWindow(typeof payload?.id === 'string' ? payload.id : '')
  return true
})

/**
 * 教材画面导出：把渲染层给的内容区矩形截成 PNG（base64）。
 * 走 capturePage 而不是前端拼 SVG，缩放、放大镜、批注、读数都是「所见即所得」。
 */
ipcMain.handle('lab:capture', async (e, rect) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win || win.isDestroyed()) return null
  const [cw, ch] = win.getContentSize()
  const x = Math.max(0, Math.min(cw - 1, Math.round(Number(rect?.x) || 0)))
  const y = Math.max(0, Math.min(ch - 1, Math.round(Number(rect?.y) || 0)))
  const width = Math.max(1, Math.min(cw - x, Math.round(Number(rect?.width) || 1)))
  const height = Math.max(1, Math.min(ch - y, Math.round(Number(rect?.height) || 1)))
  try {
    const img = await win.webContents.capturePage({ x, y, width, height })
    if (img.isEmpty()) return null
    return { data: img.toPNG().toString('base64'), width, height }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
})

/** 主窗口 ↔ 独立窗口：实验切换双向同步（谁切的听谁的，不回传给发送方） */
ipcMain.on('lab:sync', (e, id) => {
  if (typeof id !== 'string' || !id) return
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.id === e.sender.id) continue
    win.webContents.send('lab:sync', id)
  }
})

/** 教材「全屏演示」：必须走原生 setFullScreen，才能盖住 Windows 任务栏 */
ipcMain.handle('window:fullscreen', (e, on) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win || win.isDestroyed()) return false
  win.setFullScreen(Boolean(on))
  return Boolean(on)
})

/** 原生全屏状态可能被 F11 / 系统手势改掉，通知渲染层同步按钮和布局 */
function bindFullscreenEvents(win) {
  const notify = () => {
    if (!win.isDestroyed()) win.webContents.send('window:fullscreen', win.isFullScreen())
  }
  win.on('enter-full-screen', notify)
  win.on('leave-full-screen', notify)
}

/** 把菜单动作转给渲染层（Alt 唤出菜单栏，或点菜单项） */
function sendMenu(action, arg) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('app:menu', action, arg)
}

function buildMenu() {
  buildAppMenu({ sendMenu, recent: () => readState().recent })
  // 菜单栏常显：触控用户没有 Alt 键，藏起来等于没有菜单
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setMenuBarVisibility(true)
}

ipcMain.handle('ui:get-state', () => {
  const s = readState()
  return {
    leftWidth: s.leftWidth,
    rightOpen: s.rightOpen,
    lastFile: s.lastFile,
    recent: Array.isArray(s.recent) ? s.recent : [],
  }
})

let runtimeDirty = false

ipcMain.on('ui:set-state', (_e, patch) => {
  if (!patch || typeof patch !== 'object') return
  if ('dirty' in patch) runtimeDirty = Boolean(patch.dirty)
  writeState(patch)
  if ('recent' in patch && app.isReady()) buildMenu()
})

ipcMain.on('app:close', () => {
  forceClose = true
  if (symbolWindow && !symbolWindow.isDestroyed()) symbolWindow.close()
  if (labWindow && !labWindow.isDestroyed()) labWindow.close()
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close()
})

/** 最近打开：写进 window-state.json，供启动恢复与“最近课件”使用 */
function addRecent(filePath) {
  const s = readState()
  const recent = [filePath, ...(Array.isArray(s.recent) ? s.recent : []).filter((p) => p !== filePath)]
  writeState({ recent: recent.slice(0, 8), lastFile: filePath })
  // 菜单里的「最近打开」跟着更新
  if (app.isReady()) buildMenu()
}

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url)
    const target = path.join(DIST, decodeURIComponent(pathname))
    // 防目录穿越
    if (!target.startsWith(DIST)) {
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(target).toString())
  })

  registerFileIpc({ addRecent })
  registerUpdateIpc({ getWindow: () => mainWindow })
  registerStoreIpc()
  createWindow()
  buildMenu()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
