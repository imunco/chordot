const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, screen } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { registerFileIpc } = require('./file-ipc.cjs')
const { registerUpdateIpc } = require('./update.cjs')
const { registerStoreIpc } = require('./store.cjs')

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)
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
let forceClose = false

function createWindow() {
  const saved = readState()
  const bounds = ensureVisible(saved.bounds)

  mainWindow = new BrowserWindow({
    width: bounds?.width ?? 1280,
    height: bounds?.height ?? 820,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#FAFAF8',
    title: '弦点 / Chordot',
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

  if (saved.maximized) mainWindow.maximize()

  mainWindow.once('ready-to-show', () => mainWindow.show())

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
  })

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadURL('app://chordot/index.html')
  }
}

function buildMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置界面缩放' },
      ],
    },
  ])
  Menu.setApplicationMenu(menu)
  // 菜单栏隐藏但保留快捷键
  if (mainWindow) mainWindow.setMenuBarVisibility(false)
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
})

ipcMain.on('app:close', () => {
  forceClose = true
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close()
})

/** 最近打开：写进 window-state.json，供启动恢复与“最近课件”使用 */
function addRecent(filePath) {
  const s = readState()
  const recent = [filePath, ...(Array.isArray(s.recent) ? s.recent : []).filter((p) => p !== filePath)]
  writeState({ recent: recent.slice(0, 8), lastFile: filePath })
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
