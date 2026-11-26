/** 0.16.0：每日一言 / 课件元信息 / 自动保存恢复 / 版本历史 / 演示者 / 独立窗口 / 错误日志 */
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
require('./verify-setup.cjs')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { registerFileIpc } = require('./file-ipc.cjs')
const { registerStoreIpc } = require('./store.cjs')
const { registerAutosaveIpc, getAutosaveSummary, writeSnapshot } = require('./autosave.cjs')
const { registerHistoryIpc, recordHistory } = require('./history.cjs')
const { registerErrorLog, logsDir } = require('./errorlog.cjs')
const { registerPrintIpc } = require('./print.cjs')

app.disableHardwareAcceleration()
const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')
fs.mkdirSync(outDir, { recursive: true })
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-016-')))
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const savePath = path.join(outDir, 'verify-016-meta.chordot')
const pdfPath = path.join(outDir, 'verify-016.pdf')
process.env.CHORDOT_TEST_SAVE = savePath
process.env.CHORDOT_TEST_CONFIRM = '2'
process.env.CHORDOT_TEST_PDF_SAVE = pdfPath
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const watchdog = setTimeout(() => { console.log('TIMEOUT'); app.quit() }, 180000)

const docJson = (title) => JSON.stringify({
  app: 'chordot', version: 2, savedAt: new Date().toISOString(),
  doc: {
    scene: { kind: 'sketch', doc: { points: [], segments: [], circles: [], polygons: [], functions: [], constraints: [], forces: [] } },
    hidden: {}, names: {}, strokes: [], meta: { title, subject: 'physics', grade: '高一', chapter: '3.2 摩擦力', note: '验证备注' },
  },
})

let recent = []
let lastFile = null
const addRecent = (p) => { recent = [p, ...recent.filter((x) => x !== p)].slice(0, 10); lastFile = p }

let labWindow = null
let galleryWindow = null
const makeAux = async (kind) => {
  const win = new BrowserWindow({
    width: 1280, height: 860, show: true,
    webPreferences: { preload: path.join(root, 'electron', 'preload.cjs'), contextIsolation: true, sandbox: true },
  })
  await win.loadURL('app://chordot/index.html?' + (kind === 'lab' ? 'lab=1&id=' : 'gallery=1'))
  return win
}

app.whenReady().then(async () => {
  protocol.handle('app', (req) =>
    net.fetch(pathToFileURL(path.join(DIST, decodeURIComponent(new URL(req.url).pathname))).toString()),
  )
  registerStoreIpc()
  registerFileIpc({ addRecent })
  registerAutosaveIpc()
  registerHistoryIpc()
  registerErrorLog()

  ipcMain.handle('ui:get-state', () => ({
    recent,
    lastFile,
    autosave: getAutosaveSummary(),
    slowStart: 0,
  }))
  ipcMain.on('ui:set-state', () => {})
  ipcMain.handle('update:info', () => ({ version: '0.16.0', mirrors: [] }))
  ipcMain.handle('update:check', () => ({ ok: true, current: '0.16.0', hasUpdate: false }))
  ipcMain.handle('app:about', () => ({ name: 'Chordot', version: '0.16.0', electron: '', chrome: '', node: '', repo: '' }))
  ipcMain.handle('window:fullscreen', () => true)
  ipcMain.on('lab:sync', () => {})
  ipcMain.handle('lab:capture', () => null)
  ipcMain.handle('symbol:apply', () => true)
  ipcMain.handle('symbol:open-window', () => true)
  ipcMain.handle('lab:open-window', async () => { if (!labWindow || labWindow.isDestroyed()) labWindow = await makeAux('lab'); return true })
  ipcMain.handle('gallery:open-window', async () => { if (!galleryWindow || galleryWindow.isDestroyed()) galleryWindow = await makeAux('gallery'); return true })
  ipcMain.handle('gallery:pick', () => true)
  registerPrintIpc({
    createPrintWindow: () => {
      const pw = new BrowserWindow({
        width: 1200, height: 860, show: false,
        webPreferences: { preload: path.join(root, 'electron', 'preload.cjs'), contextIsolation: true, sandbox: true },
      })
      void pw.loadURL('app://chordot/index.html?print=1')
      return pw
    },
  })

  const win = new BrowserWindow({
    width: 1440, height: 940, show: true,
    webPreferences: { preload: path.join(root, 'electron', 'preload.cjs'), contextIsolation: true, sandbox: true },
  })
  const errors = []
  win.webContents.on('console-message', (e) => {
    if (e && e.level === 'error') errors.push(String(e.message || '').slice(0, 240))
  })
  await win.loadURL('app://chordot/index.html?lobby=1&notour=1')
  const js = (c) => win.webContents.executeJavaScript(c, true)
  const waitFor = async (expr, ms = 8000) => {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      try { if (await js(expr)) return true } catch { /* 继续等 */ }
      await wait(80)
    }
    return false
  }
  const shot = async (name, target = win) => {
    try { fs.writeFileSync(path.join(outDir, name), (await target.webContents.capturePage()).toPNG()) } catch { /* ignore */ }
  }
  const report = {}
  const failures = []
  let checks = 0
  const check = (ok, msg) => { checks += 1; if (!ok) { failures.push(msg); console.log('VERIFY FAILED ' + msg) } }
  const setInput = (sel, value, index) => js('(function(){var els=[...document.querySelectorAll(' + JSON.stringify(sel) + ')];var el=els[' + (index || 0) + '];if(!el)return false;var set=Object.getOwnPropertyDescriptor(el.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,"value").set;set.call(el,' + JSON.stringify(String(value)) + ');el.dispatchEvent(new Event("input",{bubbles:true}));return true})()')
  const palette = async (text) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const open = await js('!!document.querySelector(".palette")')
      if (!open) {
        await js('window.dispatchEvent(new KeyboardEvent("keydown",{key:"k",ctrlKey:true,bubbles:true}))')
      }
      await wait(350)
      const hit = await js('(function(){var t=' + JSON.stringify(text) + ';var it=[...document.querySelectorAll(".palette__item")].find(function(x){return x.textContent.includes(t)});if(!it)return false;it.click();return true})()')
      if (hit) return true
      await js('window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))')
      await wait(200)
    }
    return false
  }

  /* 1. 大厅每日一言 */
  await waitFor('!!document.querySelector("[data-lobby]")')
  await waitFor('!!document.querySelector(".lobby__quote")', 7000)
  const quote0 = await js('(function(){var q=document.querySelector(".lobby__quote");return q?q.textContent.trim():""})()')
  report.quote = quote0.slice(0, 80)
  check(quote0.length > 6, '大厅没有每日一言')
  await js('document.querySelector(".lobby__quoterefresh")?.click()')
  await wait(600)
  const quote1 = await js('(function(){var q=document.querySelector(".lobby__quote");return q?q.textContent.trim():""})()')
  check(quote1.length > 6, '换一句之后每日一言消失了')
  await shot('016-1-lobby.png')

  /* 2. 新建课件：元信息 + 保存 */
  await js('document.querySelector(".lobby__primary").click()')
  await waitFor('!!document.querySelector("[data-newdoc]")')
  await setInput('#newdoc-name', '元信息课件')
  await setInput('.newdoc__text', '高一', 0)
  await setInput('.newdoc__text', '3.2 摩擦力', 1)
  await setInput('.newdoc__note', '验证备注：这是元信息')
  await js('document.querySelector(".newdoc__create").click()')
  await waitFor('!!document.querySelector(".app") && !document.querySelector("[data-lobby]")')
  await wait(500)
  report.newDoc = await js('(function(){return {file:document.querySelector(".titlebar__file")?.textContent||"",title:document.querySelector(".titlebar__title")?.textContent||""}})()')
  check(String(report.newDoc.file).includes('元信息课件.chordot'), '新建课件的文件名不对（' + report.newDoc.file + '）')
  check(String(report.newDoc.title).includes('元信息课件'), '新建课件的标题没有显示（' + report.newDoc.title + '）')
  await js('window.dispatchEvent(new KeyboardEvent("keydown",{key:"s",ctrlKey:true,bubbles:true}))')
  const t0 = Date.now()
  while (Date.now() - t0 < 6000 && !fs.existsSync(savePath)) await wait(120)
  check(fs.existsSync(savePath), 'Ctrl+S 没有写出课件文件')
  let saved = null
  try { saved = JSON.parse(fs.readFileSync(savePath, 'utf8')) } catch { /* ignore */ }
  report.meta = saved && saved.doc && saved.doc.meta ? saved.doc.meta : null
  check(saved && saved.version === 2, '保存的文件版本不是 2（' + (saved && saved.version) + '）')
  check(report.meta && report.meta.title === '元信息课件', '元信息标题没有落盘')
  check(report.meta && report.meta.grade === '高一' && report.meta.chapter === '3.2 摩擦力' && report.meta.note.includes('验证备注'), '学段 / 章节 / 备注没有落盘（' + JSON.stringify(report.meta) + '）')
  await shot('016-2-meta.png')

  /* 3. 保存到课件库 + 回大厅看最近 / 课件库 */
  const libPath = await js('window.chordot.library.add({path:"课件库课件.chordot",content:' + JSON.stringify(docJson('课件库课件')) + '})')
  check(typeof libPath === 'string' && libPath.length > 0, '保存到课件库失败')
  await js('document.querySelector(".titlebar__home").click()')
  await waitFor('!!document.querySelector("[data-lobby]")')
  await wait(600)
  report.lobbyRecent = await js('[...document.querySelectorAll(".lobby__file")].map(function(b){return b.textContent.trim()})')
  report.library = await js('(function(){var l=document.querySelector(".lobby__library");return l?l.textContent.trim():""})()')
  check(JSON.stringify(report.lobbyRecent).includes('元信息课件'), '大厅最近课件没有显示元信息标题')
  check(String(report.library).includes('课件库课件'), '大厅「我的课件」没有显示课件库文件')
  await shot('016-3-lobby-meta.png')

  /* 4. 自动保存 / 崩溃恢复 */
  writeSnapshot({ data: docJson('崩溃恢复测试'), file: '崩溃恢复测试.chordot', filePath: null, at: Date.now() })
  await win.loadURL('app://chordot/index.html?lobby=1&notour=1')
  await waitFor('!!document.querySelector("[data-lobby]")')
  await waitFor('!!document.querySelector(".lobby__recovery")')
  const rec = await js('(function(){var r=document.querySelector(".lobby__recovery");return r?r.textContent.trim():""})()')
  report.recovery = rec
  check(String(rec).includes('崩溃恢复测试'), '大厅没有出现未保存快照的恢复卡（' + rec + '）')
  await js('document.querySelector(".lobby__recoverygo").click()')
  await waitFor('!!document.querySelector(".titlebar__file")')
  await wait(500)
  const restored = await js('(function(){return {file:document.querySelector(".titlebar__file")?.textContent||"",dirty:!!document.querySelector(".titlebar__dirty")}})()')
  report.restored = restored
  check(String(restored.file).includes('崩溃恢复测试.chordot'), '恢复后的文件名不对（' + restored.file + '）')
  check(restored.dirty, '恢复出来的课件没有标记为未保存')
  await shot('016-4-recovery.png')

  /* 5. 版本历史：先把恢复稿保存一次（拿到 filePath），再造一份旧版本 → 打开弹窗恢复 */
  await js('window.dispatchEvent(new KeyboardEvent("keydown",{key:"s",ctrlKey:true,bubbles:true}))')
  await wait(900)
  recordHistory(savePath, docJson('旧版本课件'))
  // 走应用菜单命令（真实用户可用 Ctrl+K 命令面板，探针已单独验证；这里测命令链路更稳）
  win.webContents.send('app:menu', 'history')
  await waitFor('!!document.querySelector(".histdlg")')
  const hist = await js('(function(){return {open:!!document.querySelector(".histdlg"),items:document.querySelectorAll(".histdlg__item").length,empty:!!document.querySelector(".histdlg__empty")}})()')
  report.history = hist
  check(hist.open && hist.items >= 1, '版本历史弹窗没有列出版本（' + JSON.stringify(hist) + '）')
  if (hist.items >= 1) {
    await js('document.querySelector(".histdlg__item button").click()')
    await wait(700)
    const histTitle = await js('document.querySelector(".titlebar__file")?.textContent||""')
    check(String(histTitle).includes('历史版本'), '恢复历史版本后的文件名不对（' + histTitle + '）')
  }
  await shot('016-5-history.png')

  /* 6. 演示者模式 */
  win.webContents.send('app:menu', 'presenter')
  await waitFor('!!document.querySelector(".presenter")')
  const pres = await js('(function(){var p=document.querySelector(".presenter");return {on:!!p,app:document.querySelector(".app")?.className,text:p?p.textContent.trim():""}})()')
  report.presenter = pres
  check(pres.on && String(pres.app).includes('app--present'), '演示者模式没有进入全屏布局')
  check(/[0-9]{2}:[0-9]{2}/.test(String(pres.text)), '演示者模式没有计时器（' + pres.text.slice(0, 60) + '）')
  await js('(function(){var b=[...document.querySelectorAll(".presenter__btn")].find(function(x){return x.textContent.includes("记视角")});if(b)b.click()})()')
  await wait(400)
  const pres2 = await js('document.querySelector(".presenter")?.textContent||""')
  check(String(pres2).includes('1/1'), '记视角后镜头计数不对（' + pres2.slice(0, 80) + '）')
  await js('window.dispatchEvent(new KeyboardEvent("keydown",{key:"b",bubbles:true}))')
  await wait(250)
  const boost = await js('document.querySelector(".app")?.classList.contains("app--boost")')
  check(boost, 'B 键没有切换投影增强')
  await js('window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))')
  await wait(350)
  const presOff = await js('!document.querySelector(".presenter") && !document.querySelector(".app")?.classList.contains("app--present")')
  check(presOff, 'Esc 没有退出演示者模式')
  await shot('016-6-presenter.png')

  /* 7. 独立窗口：教材 / 模板库 */
  await js('document.querySelector(".titlebar__home")?.click()')
  await waitFor('!!document.querySelector("[data-lobby]")')
  await js('document.querySelector(".lobby__mode[data-mode=lab]").click()')
  await wait(1200)
  let labOk = false
  let labRoot = false
  try {
    if (labWindow && !labWindow.isDestroyed()) {
      labOk = true
      labRoot = await labWindow.webContents.executeJavaScript('!!document.querySelector(".lab")', true)
    }
  } catch { /* ignore */ }
  report.labWindow = { created: labOk, root: labRoot }
  check(labOk && labRoot, '教材实验室没有打开独立窗口')
  await js('document.querySelector(".lobby__mode[data-mode=gallery]").click()')
  await wait(1000)
  let galOk = false
  let galRoot = false
  try {
    if (galleryWindow && !galleryWindow.isDestroyed()) {
      galOk = true
      galRoot = await galleryWindow.webContents.executeJavaScript('!!document.querySelector(".gallery")', true)
    }
  } catch { /* ignore */ }
  report.galleryWindow = { created: galOk, root: galRoot }
  check(galOk && galRoot, '模板库没有打开独立窗口')
  if (labWindow && !labWindow.isDestroyed()) labWindow.close()
  if (galleryWindow && !galleryWindow.isDestroyed()) galleryWindow.close()

  /* 8. 错误日志 + PDF 导出（真实 printToPDF） */
  try { fs.unlinkSync(pdfPath) } catch { /* 本来就没有 */ }
  const pdf = await js('window.chordot.exportPDF({png:' + JSON.stringify(TINY_PNG) + ',title:"测试讲义",subtitle:"高一 · 3.2"})')
  const pdfOk = pdf && pdf.path && fs.existsSync(pdfPath) && fs.readFileSync(pdfPath).slice(0, 4).toString() === '%PDF'
  report.pdf = { result: pdf, bytes: fs.existsSync(pdfPath) ? fs.statSync(pdfPath).size : 0, ok: pdfOk }
  check(pdfOk, 'PDF 讲义没有导出成功（' + JSON.stringify(report.pdf) + '）')
  await js('window.chordot.reportError({message:"verify-016-marker",source:"verify"})')
  await wait(500)
  let logText = ''
  try {
    const dir = logsDir()
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.log')) logText += fs.readFileSync(path.join(dir, name), 'utf8')
    }
  } catch { /* ignore */ }
  report.errorLog = logText.includes('verify-016-marker')
  check(report.errorLog, '本地错误日志没有写入 marker')

  report.consoleErrors = errors.filter((m) => !/hitokoto|ERR_|Failed to load resource/i.test(m))
  check(report.consoleErrors.length === 0, '控制台有错误：' + report.consoleErrors.slice(0, 3).join(' | '))

  console.log(JSON.stringify({ report, failures, checks }, null, 2))
  clearTimeout(watchdog)
  app.quit()
})
