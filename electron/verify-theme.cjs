/** 0.18.0：主题切换（纸面 / 液态玻璃）+ 动效与持久化 */
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
require('./verify-setup.cjs')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { registerFileIpc } = require('./file-ipc.cjs')
const { registerStoreIpc } = require('./store.cjs')

app.disableHardwareAcceleration()
const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')
fs.mkdirSync(outDir, { recursive: true })
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-theme-')))
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  protocol.handle('app', (req) =>
    net.fetch(pathToFileURL(path.join(DIST, decodeURIComponent(new URL(req.url).pathname))).toString()),
  )
  registerStoreIpc()
  registerFileIpc({ addRecent: () => {} })
  ipcMain.handle('ui:get-state', () => ({ recent: [], lastFile: null, autosave: null, slowStart: 0 }))
  ipcMain.on('ui:set-state', () => {})
  ipcMain.handle('update:check', () => ({ ok: true, current: '0.18.0', hasUpdate: false }))
  ipcMain.handle('update:info', () => ({ version: '0.18.0', mirrors: [] }))
  ipcMain.handle('app:about', () => null)
  ipcMain.handle('window:fullscreen', () => true)
  ipcMain.handle('lab:open-window', () => true)
  ipcMain.handle('symbol:open-window', () => true)
  ipcMain.handle('gallery:open-window', () => true)
  ipcMain.handle('file:export-pdf', () => ({ canceled: true }))

  const win = new BrowserWindow({
    width: 1440, height: 940, show: true,
    webPreferences: { preload: path.join(root, 'electron', 'preload.cjs'), contextIsolation: true, sandbox: true },
  })
  const errors = []
  win.webContents.on('console-message', (e) => {
    if (e && e.level === 'error') errors.push(String(e.message || '').slice(0, 200))
  })
  const jsRun = (c) => win.webContents.executeJavaScript(c, true)
  const evalPage = (fn) => jsRun('(' + fn.toString() + ')()')
  const waitFor = async (fn, ms) => {
    const budget = ms || 8000
    const t0 = Date.now()
    while (Date.now() - t0 < budget) {
      try { if (await evalPage(fn)) return true } catch { /* ignore */ }
      await wait(90)
    }
    return false
  }
  const checks = []
  let failures = 0
  const check = (ok, msg) => {
    checks.push({ ok: Boolean(ok), msg })
    if (!ok) { failures += 1; console.log('VERIFY FAILED ' + msg) }
  }

  await win.loadURL('app://chordot/index.html?lobby=1&notour=1')
  await waitFor(() => !!document.querySelector('[data-lobby]'))
  const initial = await evalPage(() => ({
    theme: document.documentElement.dataset.theme,
    label: document.querySelector('[data-theme-toggle]').textContent.trim(),
  }))
  check(initial.theme === 'paper', '默认主题不是纸面：' + initial.theme)
  check(initial.label.includes('液态玻璃'), '大厅主题按钮没有显示「液态玻璃」：' + initial.label)

  await evalPage(() => document.querySelector('[data-theme-toggle]').click())
  await wait(2200)
  const glass = await evalPage(() => {
    const mode = document.querySelector('.lobby__mode')
    const cs = getComputedStyle(mode)
    const before = getComputedStyle(mode, '::before')
    const bodyBefore = getComputedStyle(document.body, '::before')
    return {
      theme: document.documentElement.dataset.theme,
      saved: JSON.parse(localStorage.getItem('chordot.settings') || '{}').theme || '',
      label: document.querySelector('[data-theme-toggle]').textContent.trim(),
      backdrop: cs.backdropFilter,
      animation: cs.animationName,
      radius: cs.borderRadius,
      borderBefore: before.backgroundImage.slice(0, 60),
      bodyAnimation: bodyBefore.animationName,
      cardBackdrop: cs.backdropFilter,
      running: document.getAnimations().filter(function(a){return a.playState==='running'}).map(function(a){return a.animationName}),
    }
  })
  check(glass.theme === 'glass', '点击后主题没有切到液态玻璃')
  check(glass.saved === 'glass', '主题没有写入设置（' + glass.saved + '）')
  check(glass.label.includes('纸面'), '切到玻璃后按钮没有变成「纸面」')
  check(String(glass.backdrop).includes('blur(8px)'), '主题卡的轻量模糊没有生效：' + glass.backdrop)
  check(!String(glass.backdrop).includes('24px'), '主题卡还在使用 24px 重模糊：' + glass.backdrop)
  check(glass.animation === 'glass-card-in', '主题卡没有入场动画：' + glass.animation)
  check(glass.bodyAnimation === 'none', '背景极光还在整页动画：' + glass.bodyAnimation)
  check(glass.running.indexOf('glass-aurora') < 0, '仍有整页极光动画在跑：' + JSON.stringify(glass.running))
  check(glass.radius !== '0px', '主题卡没有圆角')
  check(String(glass.cardBackdrop).includes('blur(8px)'), '大厅卡片的轻量模糊没有生效：' + glass.cardBackdrop)
  try { fs.writeFileSync(path.join(outDir, 'theme-lobby.png'), (await win.webContents.capturePage()).toPNG()) } catch { /* ignore */ }

  const cardCenter = await evalPage(() => { const r = document.querySelector('.lobby__mode').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })
  win.webContents.sendInputEvent({ type: 'mouseMove', x: cardCenter.x, y: cardCenter.y })
  await wait(300)
  const pointer = await evalPage(() => {
    const el = document.querySelector('.lobby__mode')
    el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 1100, clientY: 250, pointerType: 'mouse' }))
    return { gx: el.style.getPropertyValue('--gx'), gy: el.style.getPropertyValue('--gy') }
  })
  check(pointer.gx && pointer.gx !== '28%', '卡片高光没有跟随指针：' + JSON.stringify(pointer))
  await wait(200)
  const hoverAnim = await evalPage(() => {
    const el = document.querySelector('.lobby__mode')
    const before = getComputedStyle(el, '::before')
    return { hover: el.matches(':hover'), anim: before.animationName, glow: getComputedStyle(el, '::after').opacity }
  })
  check(hoverAnim.hover && hoverAnim.glow !== '', '悬停高光没有生效：' + JSON.stringify(hoverAnim))
  try { fs.writeFileSync(path.join(outDir, 'theme-hover.png'), (await win.webContents.capturePage()).toPNG()) } catch { /* ignore */ }

  await win.reload()
  await waitFor(() => !!document.querySelector('[data-lobby]'))
  await wait(400)
  check(await evalPage(() => document.documentElement.dataset.theme === 'glass'), '刷新后主题没有保持液态玻璃')

  await evalPage(() => document.querySelector('.lobby__iconbtn[title=设置]').click())
  await waitFor(() => !!document.querySelector('.prefs'))
  await wait(500)
  if (!(await evalPage(() => !!document.querySelector('.theme-picker')))) {
    await evalPage(() => {
      const t = [...document.querySelectorAll('.prefs__tab')].find((x) => x.textContent.includes('个性化'))
      if (t) t.click()
    })
    await wait(250)
  }
  const picker = await evalPage(() => ({
    tabs: [...document.querySelectorAll('.prefs__tab')].map((x) => x.textContent.trim()),
    cards: [...document.querySelectorAll('.theme-card')].map((x) => ({
      choice: x.getAttribute('data-theme-choice'),
      active: x.getAttribute('data-active'),
      text: x.textContent.trim().slice(0, 20),
    })),
  }))
  check(picker.cards.length === 2, '设置里没有两张主题卡：' + JSON.stringify(picker.cards))
  check(picker.cards.some((c) => c.choice === 'glass' && c.active === 'true'), '玻璃主题卡没有选中态')
  try { fs.writeFileSync(path.join(outDir, 'theme-prefs.png'), (await win.webContents.capturePage()).toPNG()) } catch { /* ignore */ }

  await evalPage(() => document.querySelector('.theme-card[data-theme-choice=paper]').click())
  await wait(500)
  const paper = await evalPage(() => ({
    theme: document.documentElement.dataset.theme,
    backdrop: getComputedStyle(document.querySelector('.lobby__mode')).backdropFilter,
  }))
  check(paper.theme === 'paper', '设置里没有切回纸面')
  check(paper.backdrop === 'none', '纸面主题仍残留玻璃 backdrop：' + paper.backdrop)
  try { fs.writeFileSync(path.join(outDir, 'theme-paper.png'), (await win.webContents.capturePage()).toPNG()) } catch { /* ignore */ }

  await evalPage(() => document.querySelector('.theme-card[data-theme-choice=glass]').click())
  await wait(450)
  check(await evalPage(() => document.documentElement.dataset.theme === 'glass'), '设置里没有切回液态玻璃')
  await evalPage(() => document.querySelector('.prefs .iconbtn').click())
  await wait(350)
  check(await evalPage(() => !document.querySelector('.prefs')), '设置关闭按钮没有关掉弹层')

  await evalPage(() => document.querySelector('.lobby__mode[data-mode=math]').click())
  await wait(900)
  const editor = await evalPage(() => {
    const left = document.querySelector('.left')
    const dock = document.querySelector('.dock')
    const canvas = document.querySelector('.canvas')
    return {
      app: !!document.querySelector('.app'),
      left: getComputedStyle(left).backdropFilter,
      leftRadius: getComputedStyle(left).borderRadius,
      dock: getComputedStyle(dock).backdropFilter,
      canvasRadius: getComputedStyle(canvas).borderRadius,
      canvasBg: getComputedStyle(canvas).backgroundColor,
    }
  })
  check(editor.app, '没有进入编辑器')
  check(String(editor.left).includes('blur(14px)'), '编辑器左栏的轻量模糊没有生效：' + editor.left)
  check(String(editor.dock).includes('blur'), '编辑器工具坞没有玻璃：' + editor.dock)
  check(editor.leftRadius !== '0px', '编辑器左栏没有圆角')
  check(editor.canvasRadius !== '0px', '画布没有圆角')
  try { fs.writeFileSync(path.join(outDir, 'theme-editor.png'), (await win.webContents.capturePage()).toPNG()) } catch { /* ignore */ }

  if (errors.length) check(false, '主题页面有控制台错误：' + JSON.stringify(errors.slice(0, 4)))

  fs.writeFileSync(path.join(outDir, 'verify-theme.json'), JSON.stringify({ checks, failures, initial, glass, pointer, hoverAnim, picker, paper, editor, errors }, null, 2))
  console.log('CHECKS ' + checks.length + ' FAIL ' + failures)
  console.log('THEME ' + JSON.stringify({ initial, glass, pickerCards: picker.cards, paper, editor, hoverAnim, errors: errors.slice(0, 2) }))
  app.exit(failures === 0 ? 0 : 1)
}).catch((e) => {
  console.error(e && e.stack)
  app.exit(1)
})