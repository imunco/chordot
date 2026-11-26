const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
// 无显示环境公共设置：关 GPU / 关后台节流 / capturePage 走 CDP 兜底
require('./verify-setup.cjs')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { registerFileIpc } = require('./file-ipc.cjs')

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')
fs.mkdirSync(outDir, { recursive: true })
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-lobby-')))
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const watchdog = setTimeout(() => {
  console.log('TIMEOUT')
  app.quit()
}, 180000)

const samplePath = path.join(outDir, 'lobby-verify-sample.chordot')
fs.writeFileSync(
  samplePath,
  JSON.stringify({
    app: 'chordot',
    version: 1,
    savedAt: new Date().toISOString(),
    doc: {
      scene: {
        kind: 'sketch',
        doc: { points: [], segments: [], circles: [], polygons: [], functions: [], constraints: [], forces: [] },
      },
      hidden: {},
      names: {},
      strokes: [],
    },
  }),
)

app.whenReady().then(async () => {
  protocol.handle('app', (req) =>
    net.fetch(pathToFileURL(path.join(DIST, decodeURIComponent(new URL(req.url).pathname))).toString()),
  )
  ipcMain.handle('ui:get-state', () => ({ recent: [samplePath], lastFile: samplePath }))
  ipcMain.on('ui:set-state', () => {})
  ipcMain.handle('store:get', async () => null)
  ipcMain.handle('store:set', async () => true)
  ipcMain.handle('store:dir', async () => null)
  ipcMain.handle('store:open', async () => null)
  ipcMain.handle('store:dump', async () => [])
  ipcMain.handle('update:check', async () => ({ ok: false, current: '0.17.0', error: 'offline' }))
  ipcMain.handle('update:info', async () => ({ version: '0.17.0', mirrors: [] }))
  ipcMain.handle('window:fullscreen', async () => true)
  ipcMain.handle('app:about', async () => null)
  ipcMain.on('lab:sync', () => {})
  ipcMain.handle('lab:capture', () => null)
  ipcMain.handle('symbol:open-window', () => true)
  ipcMain.handle('symbol:apply', () => true)
  registerFileIpc({ addRecent: () => {} })

  const makeWindow = async (url) => {
    const win = new BrowserWindow({
      width: 1440,
      height: 940,
      show: true,
      webPreferences: {
        preload: path.join(root, 'electron', 'preload.cjs'),
        contextIsolation: true,
        sandbox: true,
      },
    })
    const errors = []
    win.webContents.on('console-message', (e) => {
      if (e && e.level === 'error') errors.push(e.message)
    })
    await win.loadURL(url)
    return { win, errors }
  }

  const { win, errors } = await makeWindow('app://chordot/index.html?lobby=1&notour=1')
  const js = (c) => win.webContents.executeJavaScript(c, true)
  const waitFor = async (expr, ms = 8000) => {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      try { if (await js(expr)) return true } catch {}
      await wait(80)
    }
    return false
  }
  const shot = async (name) => {
    try {
      const img = await win.webContents.capturePage()
      fs.writeFileSync(path.join(outDir, name), img.toPNG())
    } catch {}
  }

  const report = {}
  const failures = []
  let checks = 0
  const check = (ok, msg) => {
    checks += 1
    if (!ok) { failures.push(msg); console.log('VERIFY FAILED ' + msg) }
  }

  const lobbyState = () => js(`(() => {
    const q = (s) => document.querySelector(s)
    const modes = [...document.querySelectorAll('.lobby__mode')].map((b) => b.dataset.mode)
    const resumes = [...document.querySelectorAll('.lobby__resumecard')].map((b) => b.textContent)
    return {
      lobby: !!q('.lobby'),
      modes,
      versions: q('.lobby__version')?.textContent ?? '',
      recent: [...document.querySelectorAll('.lobby__file')].map((b) => b.textContent),
      resumes,
      empty: !!q('.lobby__empty'),
      editor: !!q('.workspace'),
      modal: !!q('.newdoc'),
    }
  })()`)

  await wait(1600)
  report.start = await lobbyState()
  check(report.start.lobby === true, '启动后没有进入大厅')
  check(report.start.modes.length === 8, `大厅模式卡应有 8 个（${report.start.modes.length}）`)
  check(report.start.modes.includes('math') && report.start.modes.includes('mech') && report.start.modes.includes('lab'), '大厅模式卡缺少数学 / 机构 / 教材')
  check(report.start.recent.length === 1, `最近课件应显示 1 个（${report.start.recent.length}）`)
  check(String(report.start.resumes.join('')).includes('上次打开'), '大厅没有「上次打开」卡片')
  check(report.start.versions.includes('0.17'), `大厅版本号不对（${report.start.versions}）`)
  check(report.start.editor === false, '大厅启动时编辑器仍然渲染了（不应出现工作区）')
  await shot('lobby-verify-1-start.png')

  /* 1. 新建对话框：属性、预览、创建 */
  await js(`document.querySelector('.lobby__primary').click()`)
  await waitFor(`!!document.querySelector('.newdoc')`)
  await wait(300)
  const dialog = await js(`(() => {
    const q = (s) => document.querySelector(s)
    return {
      open: !!q('.newdoc'),
      canvases: [...document.querySelectorAll('.newdoc__canvas')].map((b) => b.dataset.canvas),
      activeCanvas: q('.newdoc__canvas[data-active="true"]')?.dataset.canvas ?? '',
      grid: q('.newdoc__check input')?.checked ?? null,
      preview: !!q('.newdoc__previewcard'),
      subject: [...document.querySelectorAll('.newdoc__segbtn[data-active="true"]')].map((b) => b.textContent.trim()),
    }
  })()`)
  report.dialog = dialog
  check(dialog.open === true, '点「新建课件」没有打开属性对话框')
  check(Array.isArray(dialog.canvases) && dialog.canvases.length === 6, `初始画布应有 6 个选项（${dialog.canvases && dialog.canvases.length}）`)
  check(!!dialog.preview, '新建对话框没有预览区')
  await js(`(() => {
    const i = document.querySelector('.newdoc__name')
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    set.call(i, '我的立体课')
    i.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await wait(200)
  await js(`document.querySelector('[data-canvas="solid"]').click()`)
  await wait(300)
  await shot('lobby-verify-2-newdoc.png')
  await js(`document.querySelector('.newdoc__create').click()`)
  const created = await waitFor(`!!document.querySelector('.workspace') && !document.querySelector('.lobby')`)
  await wait(900)
  report.created = { ok: created, title: await js(`document.querySelector('.titlebar__file')?.textContent ?? ''`), status: await js(`document.querySelector('.statusbar')?.textContent ?? ''`) }
  check(created, '点「创建并进入」没有进入编辑器')
  check(String(report.created.title).includes('我的立体课'), `新建后标题栏名称不对（${report.created.title}）`)
  check(String(report.created.status).includes('正交投影'), `新建三维课件后状态栏不对（${report.created.status}）`)
  await shot('lobby-verify-3-editor.png')

  /* 2. 返回大厅：当前编辑卡片 */
  await js(`document.querySelector('.titlebar__home')?.click()`)
  await waitFor(`!!document.querySelector('.lobby')`)
  await wait(600)
  report.back = await lobbyState()
  check(report.back.lobby === true, '标题栏「大厅」按钮没有返回大厅')
  check(String(report.back.resumes.join('')).includes('我的立体课'), '返回大厅后没有「当前正在编辑」卡片')
  await shot('lobby-verify-4-back.png')

  /* 3. Ctrl+N 在大厅里也能开新建对话框 */
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }))`)
  await waitFor(`!!document.querySelector('.newdoc')`)
  const ctrlN = await js(`!!document.querySelector('.newdoc')`)
  check(ctrlN, '大厅里按 Ctrl+N 没有打开新建对话框')
  await js(`document.querySelector('.newdoc__cancel').click()`)
  await wait(300)

  /* 4. 最近课件点击 → 打开文件 */
  await js(`document.querySelector('.lobby__file')?.click()`)
  const opened = await waitFor(`!!document.querySelector('.workspace') && !document.querySelector('.lobby')`)
  await wait(500)
  report.recentOpen = { ok: opened, title: await js(`document.querySelector('.titlebar__file')?.textContent ?? ''`) }
  check(opened, '点最近课件没有进入编辑器')
  check(String(report.recentOpen.title).includes('lobby-verify-sample'), `最近课件打开的文件不对（${report.recentOpen.title}）`)

  /* 5. 模式卡：机构装配直接开空白装配台 */
  await js(`document.querySelector('.titlebar__home')?.click()`)
  await waitFor(`!!document.querySelector('.lobby')`)
  await wait(500)
  await js(`document.querySelector('[data-mode="mech"]').click()`)
  const mechOk = await waitFor(`!!document.querySelector('.mech') && !!document.querySelector('.mechbar')`)
  await wait(800)
  report.mech = { ok: mechOk, title: await js(`document.querySelector('.titlebar__file')?.textContent ?? ''`) }
  check(mechOk, '大厅「机构装配」模式没有进入装配台')
  check(String(report.mech.title).includes('机构装配'), `机构装配模式文件名不对（${report.mech.title}）`)
  await shot('lobby-verify-5-mech.png')

  /* 6. 大厅设置 / 启动页开关 */
  await js(`document.querySelector('.titlebar__home')?.click()`)
  await waitFor(`!!document.querySelector('.lobby')`)
  await wait(500)
  const prefsOpen = await js(`(() => {
    const b = [...document.querySelectorAll('.lobby__iconbtn')].find((x) => x.textContent.includes('设置'))
    if (!b) return false
    b.click()
    return true
  })()`)
  await wait(500)
  const prefsState = await js(`(() => ({
    open: !!document.querySelector('.prefs'),
    hasLobbyRow: (document.querySelector('.prefs')?.textContent ?? '').includes('启动页'),
  }))()`)
  report.prefs = prefsState
  check(prefsOpen && prefsState.open, '大厅「设置」没有打开首选项')
  check(prefsState.hasLobbyRow, '首选项里没有「启动页」设置')
  await js(`document.querySelector('.prefs .iconbtn')?.click()`)
  await wait(300)

  /* 7. 关掉大厅设置后，主窗口不再显示大厅（?notour=1 场景也要保持兼容） */
  await js(`(() => {
    const raw = localStorage.getItem('chordot.settings')
    const s = raw ? JSON.parse(raw) : {}
    s.startInLobby = false
    s.onboarded = true
    localStorage.setItem('chordot.settings', JSON.stringify(s))
    return true
  })()`)
  await win.loadURL('app://chordot/index.html')
  await wait(1800)
  const afterSetting = await js(`({ lobby: !!document.querySelector('.lobby'), editor: !!document.querySelector('.workspace') })`)
  report.skipSetting = afterSetting
  check(afterSetting.lobby === false && afterSetting.editor === true, '关掉「启动页」设置后仍然显示大厅')

  const second = await makeWindow('app://chordot/index.html?notour=1')
  await wait(1200)
  const secondState = await second.win.webContents.executeJavaScript(
    `({ lobby: !!document.querySelector('.lobby'), editor: !!document.querySelector('.workspace') })`,
    true,
  )
  report.querySkip = secondState
  check(secondState.lobby === false && secondState.editor === true, '带查询参数（验证 / 独立窗口）的窗口不应进大厅')
  second.win.destroy()

  report.consoleErrors = errors.slice(0, 8)
  report.failures = failures
  report.checks = checks
  console.log('RESULT ' + JSON.stringify(report, null, 2))
  clearTimeout(watchdog)
  app.quit()
}).catch((err) => {
  console.log('SCRIPT ERROR ' + (err && err.stack ? err.stack : err))
  clearTimeout(watchdog)
  app.quit()
})