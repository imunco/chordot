/** 保存 / 打开 端到端验证：真实写盘、真实读回 */
const { app, BrowserWindow, dialog, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { registerFileIpc } = require('./file-ipc.cjs')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-file-'))
const TARGET = path.join(TMP, '验证课件.chordot')

app.setPath('userData', path.join(TMP, 'profile'))

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url)
    return net.fetch(pathToFileURL(path.join(DIST, decodeURIComponent(pathname))).toString())
  })
  fs.mkdirSync(outDir, { recursive: true })
  ipcMain.handle('ui:get-state', () => ({}))
  ipcMain.on('ui:set-state', () => {})
  // 自动化里不能弹原生模态框：记录调用次数并自动选择“放弃修改”
  let confirmCalls = 0
  dialog.showMessageBox = async () => {
    confirmCalls += 1
    return { response: 1 }
  }
  registerFileIpc({ addRecent: () => {} })

  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    show: true,
    backgroundColor: '#FAFAF8',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#F2F0EC', symbolColor: '#5C5A56', height: 36 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  })

  await win.loadURL(process.env.VERIFY_URL || 'app://chordot/index.html?notour=1')
  const js = (code) => win.webContents.executeJavaScript(code, true)
  const waitFor = async (expr, timeout = 12000) => {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      if (await js(expr)) return true
      await wait(120)
    }
    throw new Error(`等待超时: ${expr}`)
  }
  await waitFor(`!!document.querySelector('.toolbar')`)
  await wait(300)

  await js(`
    window.__clickWorld = (wx, wy) => {
      const svg = document.querySelector('.canvas__svg'); const rect = svg.getBoundingClientRect(); const s = 40;
      const x = rect.left + rect.width / 2 + wx * s, y = rect.top + rect.height / 2 + 40 - wy * s;
      const opt = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 };
      const hit = document.elementFromPoint(x, y);
      (hit || svg).dispatchEvent(new PointerEvent('pointerdown', opt));
      return true;
    };
    window.__rows = () => [...document.querySelectorAll('.left__row .left__name')].map(n => n.textContent);
    window.__key = (key, mods = {}) => { window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...mods })); return true; };
    true;
  `)

  const rows = () => js(`window.__rows()`)
  const report = {}

  /* 画两个点 + 一条线段 */
  await js(`document.querySelector('.toolbar [title="点"]').click()`)
  await js(`window.__clickWorld(-2, 1)`)
  await wait(120)
  await js(`document.querySelector('.toolbar [title="点"]').click()`)
  await js(`window.__clickWorld(3, 2)`)
  await wait(120)
  await js(`document.querySelector('.toolbar [title="线段"]').click()`)
  await js(`window.__clickWorld(-2, 1)`)
  await wait(120)
  await js(`window.__clickWorld(3, 2)`)
  await wait(250)
  report.beforeSave = await rows()
  report.dirtyBeforeSave = await js(`!!document.querySelector('.titlebar__dirty')`)

  /* Ctrl+S */
  process.env.CHORDOT_TEST_SAVE = TARGET
  await js(`window.__key('s', { ctrlKey: true })`)
  await wait(600)
  report.saved = fs.existsSync(TARGET)
  if (report.saved) {
    const json = JSON.parse(fs.readFileSync(TARGET, 'utf8'))
    report.file = {
      app: json.app,
      version: json.version,
      kind: json.doc?.scene?.kind,
      points: json.doc?.scene?.doc?.points?.length,
      segments: json.doc?.scene?.doc?.segments?.length,
    }
  }
  report.titleAfterSave = await js(`document.querySelector('.titlebar__file').textContent`)
  report.dirtyAfterSave = await js(`!!document.querySelector('.titlebar__dirty')`)

  /* Ctrl+N 新建：保存后 dirty=false，不应弹确认 */
  await js(`window.__key('n', { ctrlKey: true })`)
  await wait(400)
  report.afterNew = await rows()

  /* Ctrl+O 打开刚才的文件 */
  process.env.CHORDOT_TEST_OPEN = TARGET
  await js(`window.__key('o', { ctrlKey: true })`)
  await wait(700)
  report.afterOpen = await rows()
  report.titleAfterOpen = await js(`document.querySelector('.titlebar__file').textContent`)


  /* 非草图场景也要能存回来 */
  await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
  await wait(150)
  await js(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('斜面受力')).click()`)
  await wait(600)
  const INCLINE_TARGET = path.join(TMP, '斜面.chordot')
  process.env.CHORDOT_TEST_SAVE = INCLINE_TARGET
  await js(`window.__key('s', { ctrlKey: true })`)
  await wait(600)
  report.inclineSaved = fs.existsSync(INCLINE_TARGET)
  if (report.inclineSaved) {
    const j = JSON.parse(fs.readFileSync(INCLINE_TARGET, 'utf8'))
    report.inclineKind = j.doc?.scene?.kind
    report.inclineAngle = j.doc?.scene?.params?.angleDeg
  }

  /* 损坏文件：应给教学语言提示且不改动当前课件 */
  const BAD = path.join(TMP, '坏文件.chordot')
  fs.writeFileSync(BAD, '{"app":"other"}', 'utf8')
  process.env.CHORDOT_TEST_OPEN = BAD
  await js(`window.__key('o', { ctrlKey: true })`)
  await wait(600)
  report.badFileToast = await js(`[...document.querySelectorAll('.toast')].map(t => t.textContent)`)
  report.afterBadOpen = await js(`document.querySelector('.titlebar__file').textContent`)

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'file-roundtrip.png'), shot.toPNG())

  report.confirmCalls = confirmCalls
  report.toasts = await js(`[...document.querySelectorAll('.toast')].map(t => t.textContent)`)
  console.log('RESULT ' + JSON.stringify(report, null, 2))
  app.quit()
}

app.whenReady().then(main).catch((e) => {
  console.error('VERIFY FAILED', e)
  app.quit()
})
