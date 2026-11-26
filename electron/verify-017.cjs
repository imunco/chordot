/** 0.18.0：全局聚光灯 / 放大镜 + 教材实验室模型专题（26 个） */
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
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-017-')))
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const watchdog = setTimeout(() => { console.log('TIMEOUT'); app.quit() }, 180000)

let labWindow = null
const makeLab = async () => {
  if (labWindow && !labWindow.isDestroyed()) return labWindow
  labWindow = new BrowserWindow({
    width: 1440, height: 900, show: true,
    webPreferences: { preload: path.join(root, 'electron', 'preload.cjs'), contextIsolation: true, sandbox: true },
  })
  await labWindow.loadURL('app://chordot/index.html?lab=1')
  return labWindow
}

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
  ipcMain.handle('lab:open-window', async () => { await makeLab(); return true })
  ipcMain.handle('lab:capture', () => null)
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
  await win.loadURL('app://chordot/index.html?lobby=1&notour=1')
  const js = (c) => win.webContents.executeJavaScript(c, true)
  const waitFor = async (expr, ms = 8000) => {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      try { if (await js(expr)) return true } catch { /* ignore */ }
      await wait(90)
    }
    return false
  }
  const report = {}
  const failures = []
  let checks = 0
  const check = (ok, msg) => { checks += 1; if (!ok) { failures.push(msg); console.log('VERIFY FAILED ' + msg) } }

  /* 1. 打开教材独立窗口，进入模型分册 */
  await waitFor('!!document.querySelector("[data-lobby]")')
  await js('document.querySelector(".lobby__mode[data-mode=lab]").click()')
  const lab = await makeLab()
  const labRun = (c) => lab.webContents.executeJavaScript(c, true)
  await wait(900)
  check(await labRun('!!document.querySelector(".lab")'), '教材实验室独立窗口没有渲染')
  const books = await labRun('[...document.querySelectorAll(".lab__book")].map(function(x){return x.textContent.trim()})')
  report.books = books
  check(books.some((b) => b.includes('模型')), '教材实验室没有「模型」分册')
  await labRun('(function(){var b=[...document.querySelectorAll(".lab__book")].find(function(x){return x.textContent.includes("模型")});if(b)b.click();return true})()')
  await wait(500)
  const modelCount = await labRun('document.querySelectorAll(".lab__item").length')
  report.modelCount = modelCount
  check(modelCount >= 26, '模型数量不足（' + modelCount + '）')

  /* 2. 人船模型 */
  await labRun('(function(){var it=[...document.querySelectorAll(".lab__item")].find(function(x){return x.textContent.includes("人船模型")});if(!it)return false;it.click();return true})()')
  await wait(700)
  const boat = await labRun('(function(){return {title:document.querySelector(".lab__title")?.textContent||"",reads:[...document.querySelectorAll(".lab__read")].map(function(x){return x.textContent.trim()}),poly:document.querySelectorAll(".lab__svg polygon").length,text:document.querySelector(".lab__svg")?.textContent||""}})()')
  report.boat = { title: boat.title, reads: boat.reads.slice(0, 3), poly: boat.poly }
  check(boat.title.includes('人船'), '人船模型没有打开（' + boat.title + '）')
  check(boat.reads.some((r) => r.includes('船对地位移')), '人船模型没有船对地位移读数')
  check(boat.text.includes('船位移'), '人船模型画面没有位移标注')
  try {
    fs.writeFileSync(path.join(outDir, '017-lab-boat-check.png'), (await lab.webContents.capturePage()).toPNG())
  } catch { /* ignore */ }

  /* 3. 26 个模型逐项渲染（标题 / SVG / 读数） */
  const bad = []
  const count = await labRun('document.querySelectorAll(".lab__item").length')
  for (let i = 0; i < count; i += 1) {
    await labRun('(function(){var items=[...document.querySelectorAll(".lab__item")];if(items[' + i + '])items[' + i + '].click();return true})()')
    await wait(120)
    const info = await labRun('(function(){return {title:document.querySelector(".lab__title")?.textContent||"",svg:document.querySelectorAll(".lab__svg *").length,reads:document.querySelectorAll(".lab__read").length}})()')
    if (!info.title || info.svg < 5 || info.reads < 3) bad.push({ i, ...info })
  }
  report.modelsBad = bad
  check(bad.length === 0, '有模型渲染失败：' + JSON.stringify(bad.slice(0, 3)))

  /* 4. 全局聚光灯 / 放大镜 */
  await js('document.querySelector(".lobby__mode[data-mode=math]")?.click()')
  await wait(700)
  win.webContents.send('app:menu', 'spotlight')
  await wait(500)
  const spot = await js('(function(){return {on:!!document.querySelector(".presenttools-spot"),bar:document.querySelector(".presenttools-bar")?.textContent||""}})()')
  report.spot = spot
  check(spot.on, '全局聚光灯没有出现')
  check(spot.bar.includes('聚光灯'), '聚光灯没有控制条')
  try {
    fs.writeFileSync(path.join(outDir, '017-spotlight-check.png'), (await win.webContents.capturePage()).toPNG())
  } catch { /* ignore */ }
  win.webContents.send('app:menu', 'magnifier')
  await wait(700)
  const lens = await js('(function(){return {on:!!document.querySelector(".presenttools-lens"),img:!!document.querySelector(".presenttools-lens img"),bar:document.querySelector(".presenttools-bar")?.textContent||""}})()')
  report.lens = lens
  check(lens.on && lens.img, '全局放大镜没有出现或没有画面')
  await js('window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))')
  await wait(300)
  check(await js('!document.querySelector(".presenttools-lens") && !document.querySelector(".presenttools-spot")'), 'Esc 没有关闭全局演示工具')

  report.consoleErrors = errors.filter((m) => !/hitokoto|ERR_|Failed to load resource/i.test(m))
  check(report.consoleErrors.length === 0, '控制台有错误：' + report.consoleErrors.slice(0, 3).join(' | '))

  console.log(JSON.stringify({ report, failures, checks }, null, 2))
  clearTimeout(watchdog)
  app.quit()
})
