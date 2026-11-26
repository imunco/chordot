const { app, BrowserWindow, dialog, ipcMain, net, protocol, screen } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { registerFileIpc } = require('./file-ipc.cjs')
const { registerUpdateIpc } = require('./update.cjs')
const { buildAppMenu } = require('./menu.cjs')
const { registerStoreIpc } = require('./store.cjs')
const { registerAutosaveIpc, getAutosaveSummary } = require('./autosave.cjs')
const { registerHistoryIpc } = require('./history.cjs')
const { registerPrintIpc } = require('./print.cjs')
const { registerErrorLog } = require('./errorlog.cjs')

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)

// 主进程崩溃 / 未捕获异常先落日志：启动阶段出问题才有据可查
registerErrorLog()

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
/** 辅助窗口按 kind 复用：lab / symbols / gallery；print 每次新建，导出完就销毁 */
const auxWindows = { lab: null, symbols: null, gallery: null }
let forceClose = false
let runtimeDirty = false
/** 第二实例 / 文件关联带进来的课件路径，等主窗口能收消息时再发 */
let pendingOpenFile = null
/** 主进程 ready → 主窗口可交互的毫秒数（ui:get-state 的 slowStart） */
let readyAt = 0
let slowStartMs = 0
let interactiveReported = false

/** 页面还在加载就等加载完再发，避免消息发空 */
function sendWhenReady(wc, channel, ...args) {
  if (!wc || wc.isDestroyed()) return
  if (wc.isLoading()) {
    wc.once('did-finish-load', () => {
      if (!wc.isDestroyed()) wc.send(channel, ...args)
    })
  } else {
    wc.send(channel, ...args)
  }
}

/** 把主窗口叫到前面；没有主窗口就再开一个 */
function focusMainWindow() {
  if (!app.isReady()) return
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/** 等主窗口能收消息了再把待打开课件发过去（窗口刚建好时页面可能还没加载完） */
function flushPendingOpenFile() {
  if (!pendingOpenFile) return
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.webContents.isLoading()) return
  const filePath = pendingOpenFile
  pendingOpenFile = null
  mainWindow.webContents.send('app:open-file', filePath)
}

/** 文件关联 / 第二实例 / 拖进来的课件都走这里 */
function queueOpenFile(filePath) {
  if (typeof filePath !== 'string' || !filePath) return
  pendingOpenFile = path.resolve(filePath)
  focusMainWindow()
  flushPendingOpenFile()
}

/** 从命令行里找 .chordot 路径：双击课件启动 / 第二实例带参数都靠它 */
function chordotPathFromArgs(argv) {
  if (!Array.isArray(argv)) return null
  for (const arg of argv.slice(1)) {
    if (typeof arg !== 'string' || arg.startsWith('-')) continue
    if (!/\.chordot$/i.test(arg)) continue
    return path.resolve(arg)
  }
  return null
}

/** 主窗口全局唯一：第二实例把课件丢过来之后自己退出 */
const gotSingleLock = app.requestSingleInstanceLock()

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

  // 页面加载完：兜底记一次慢启动耗时（渲染层还会上报更准的一次），并送出待打开课件
  mainWindow.webContents.on('did-finish-load', () => {
    if (!interactiveReported && !slowStartMs && readyAt) slowStartMs = Date.now() - readyAt
    flushPendingOpenFile()
  })

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

  // 主窗口关了辅助窗口继续留着（各是各的窗口）；全部关掉后由 window-all-closed 收尾
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadURL('app://chordot/index.html')
  }
  return mainWindow
}

/**
 * 辅助窗口配置：每个 kind 自己的标题、查询串和 bounds state key。
 * print 是隐藏窗口，每次导出新建、不记忆位置。
 */
const AUX_KINDS = {
  lab: {
    title: '教材实验室 · 弦点',
    stateKey: 'labBounds',
    maxKey: 'labMaximized',
    query: (opts) => `?lab=1${opts.id ? `&id=${encodeURIComponent(opts.id)}` : ''}`,
    minWidth: 980,
    minHeight: 680,
    width: (wa) => Math.min(1680, Math.round(wa.width * 0.94)),
    height: (wa) => Math.min(1040, Math.round(wa.height * 0.94)),
  },
  symbols: {
    title: '符号公式实验室 · 弦点',
    stateKey: 'symbolsBounds',
    maxKey: 'symbolsMaximized',
    query: () => '?symbols=1',
    minWidth: 980,
    minHeight: 700,
    width: () => 1200,
    height: () => 860,
  },
  gallery: {
    title: '模板库 · 弦点',
    stateKey: 'galleryBounds',
    maxKey: 'galleryMaximized',
    query: () => '?gallery=1',
    minWidth: 900,
    minHeight: 620,
    width: (wa) => Math.min(1440, Math.round(wa.width * 0.86)),
    height: (wa) => Math.min(940, Math.round(wa.height * 0.9)),
  },
  print: {
    title: '讲义打印 · 弦点',
    hidden: true,
    query: () => '?print=1',
    width: () => 1280,
    height: () => 900,
  },
}

/**
 * 通用辅助窗口：lab / symbols / gallery / print。
 * lab、symbols、gallery 同一时刻各只有一个（再点就把现有窗口叫到前面），
 * print 每次新建隐藏窗口，导出完由 print.cjs 销毁。
 */
function createAuxWindow(kind, opts = {}) {
  const meta = AUX_KINDS[kind]
  if (!meta) throw new Error(`未知的辅助窗口类型：${kind}`)

  const reusable = kind !== 'print'
  if (reusable) {
    const existing = auxWindows[kind]
    if (existing && !existing.isDestroyed()) {
      existing.show()
      existing.focus()
      if (kind === 'lab' && opts.id) sendWhenReady(existing.webContents, 'lab:switch', opts.id)
      return existing
    }
  }

  const saved = readState()
  const bounds = meta.hidden ? null : ensureVisible(saved[meta.stateKey])
  const wa = screen.getPrimaryDisplay().workArea
  const width = bounds?.width ?? meta.width(wa)
  const height = bounds?.height ?? meta.height(wa)
  const x = bounds?.x ?? Math.round(wa.x + (wa.width - width) / 2)
  const y = bounds?.y ?? Math.round(wa.y + (wa.height - height) / 2)

  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    ...(meta.minWidth ? { minWidth: meta.minWidth, minHeight: meta.minHeight } : {}),
    show: false,
    backgroundColor: '#FAFAF8',
    title: meta.title,
    autoHideMenuBar: true,
    ...(windowIcon ? { icon: windowIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // 打印窗口是隐藏的，别让 Chromium 节流它的定时器
      ...(meta.hidden ? { backgroundThrottling: false } : {}),
    },
  })

  if (!meta.hidden) {
    if (saved[meta.maxKey]) win.maximize()
    win.once('ready-to-show', () => win.show())
    bindFullscreenEvents(win)

    // 每个窗口记自己的 bounds，互不影响
    const persist = () => {
      if (win.isDestroyed()) return
      const maximized = win.isMaximized()
      const b = maximized ? readState()[meta.stateKey] : win.getBounds()
      writeState({ [meta.stateKey]: b, [meta.maxKey]: maximized })
    }
    win.on('resize', persist)
    win.on('move', persist)
    win.on('close', persist)
  }

  win.on('closed', () => {
    if (reusable && auxWindows[kind] === win) auxWindows[kind] = null
  })

  const query = meta.query(opts)
  if (isDev) {
    win.loadURL(`${process.env.VITE_DEV_SERVER_URL}${query}`)
  } else {
    win.loadURL(`app://chordot/index.html${query}`)
  }

  if (reusable) auxWindows[kind] = win
  return win
}

ipcMain.handle('symbol:open-window', () => {
  createAuxWindow('symbols')
  return true
})

/** 模板库独立窗口：双屏时一边挑模板一边留着画布 */
ipcMain.handle('gallery:open-window', () => {
  createAuxWindow('gallery')
  return true
})

/** 模板库窗口 → 主窗口：选中模板后交给主窗口套用 */
ipcMain.handle('gallery:pick', (_e, payload) => {
  if (!payload || typeof payload !== 'object') return false
  const scene = payload.scene
  const file = typeof payload.file === 'string' ? payload.file : null
  if (!scene && !file) return false
  return sendToMain('gallery:pick', { scene, file })
})

/** 发给主窗口；主窗口已经关了就先开回来（页面加载完再发，preload 会缓冲） */
function sendToMain(channel, ...args) {
  if (!app.isReady()) return false
  if (!mainWindow || mainWindow.isDestroyed()) createWindow()
  if (!mainWindow || mainWindow.isDestroyed()) return false
  sendWhenReady(mainWindow.webContents, channel, ...args)
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  return true
}

/** 符号实验室 → 主窗口：把拼好的公式交给机构里选中的部件 */
ipcMain.handle('symbol:apply', (_e, payload) => {
  const p =
    typeof payload === 'string'
      ? { expr: payload, target: 'force', value: null }
      : payload && typeof payload === 'object'
        ? payload
        : null
  if (!p || typeof p.expr !== 'string' || !p.expr.trim()) return false
  if (mainWindow && !mainWindow.isDestroyed()) {
    sendWhenReady(mainWindow.webContents, 'symbol:apply', p)
    mainWindow.focus()
  }
  return true
})

/** 教材实验室独立窗口：适合双屏 / 投影，主窗口继续留着画布 */
ipcMain.handle('lab:open-window', (_e, payload) => {
  createAuxWindow('lab', { id: typeof payload?.id === 'string' ? payload.id : '' })
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

/**
 * 教材窗口 / 主窗口的实验切换同步已取消（0.16.0 起各窗口独立）。
 * 通道保留：旧渲染层还会 send，收下但不转发，免得报错。
 */
ipcMain.on('lab:sync', () => {})

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
  buildAppMenu({
    sendMenu,
    recent: () => readState().recent,
    openGalleryWindow: () => createAuxWindow('gallery'),
  })
  // 菜单栏常显：触控用户没有 Alt 键，藏起来等于没有菜单
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setMenuBarVisibility(true)
}

ipcMain.handle('ui:get-state', () => {
  const s = readState()
  const autosave = getAutosaveSummary()
  return {
    leftWidth: s.leftWidth,
    rightOpen: s.rightOpen,
    lastFile: s.lastFile,
    recent: Array.isArray(s.recent) ? s.recent : [],
    // 崩溃恢复：只给摘要，不带 data
    autosave: autosave ? { at: autosave.at, file: autosave.file, filePath: autosave.filePath } : null,
    // 慢启动耗时（毫秒）；测不到就是 0
    slowStart: slowStartMs,
  }
})

/** 渲染层首屏挂载完（preload 在 load + 两帧后自动发），记一次更准的慢启动耗时 */
ipcMain.on('app:interactive', (e) => {
  if (interactiveReported || !readyAt) return
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (e.sender.id !== mainWindow.webContents.id) return
  interactiveReported = true
  slowStartMs = Date.now() - readyAt
})

ipcMain.on('ui:set-state', (_e, patch) => {
  if (!patch || typeof patch !== 'object') return
  if ('dirty' in patch) runtimeDirty = Boolean(patch.dirty)
  writeState(patch)
  if ('recent' in patch && app.isReady()) buildMenu()
})

/** 退出：先关所有窗口（主窗口有未保存修改时渲染层已经确认过了） */
ipcMain.on('app:close', () => {
  forceClose = true
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.close()
  }
})

/** 最近打开：写进 window-state.json，供启动恢复与“最近课件”使用 */
function addRecent(filePath) {
  const s = readState()
  const recent = [filePath, ...(Array.isArray(s.recent) ? s.recent : []).filter((p) => p !== filePath)]
  writeState({ recent: recent.slice(0, 8), lastFile: filePath })
  // 菜单里的「最近打开」跟着更新
  if (app.isReady()) buildMenu()
}

if (!gotSingleLock) {
  // 已经有实例在跑：把命令行里的课件路径交给它，自己退出
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const filePath = chordotPathFromArgs(argv)
    if (filePath) queueOpenFile(filePath)
    else focusMainWindow()
  })

  // macOS：Dock 拖文件 / 双击课件（必须在 ready 之前挂）
  app.on('open-file', (e, filePath) => {
    e.preventDefault()
    queueOpenFile(filePath)
  })

  app.whenReady().then(() => {
    readyAt = Date.now()

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
    registerAutosaveIpc()
    registerHistoryIpc()
    registerPrintIpc({ createPrintWindow: () => createAuxWindow('print') })
    createWindow()
    buildMenu()

    // 双击 / 文件关联首次启动：等窗口加载完再发（did-finish-load 里 flush）
    const startupFile = chordotPathFromArgs(process.argv)
    if (startupFile) queueOpenFile(startupFile)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
