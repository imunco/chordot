/** 约束冲突提示 + 函数表达式编辑 验证 */
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')

app.setPath('userData', path.join(os.tmpdir(), 'chordot-verify-conflict'))

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

  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    show: true,
    backgroundColor: '#FAFAF8',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#F2F0EC', symbolColor: '#5C5A56', height: 36 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  })

  win.webContents.on('console-message', (e) => { if (e && e.level === 'error') console.log('[renderer]', e.message); })
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

  const menu = async (label) => {
    await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
    await wait(150)
    await js(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('${label}')).click()`)
    await wait(700)
  }

  const report = {}

  /* —— 约束冲突 —— */
  await menu('约束冲突')
  report.conflictMarker = await js(`!!document.querySelector('[data-conflict]')`)
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
  await wait(350)
  report.conflictReason = await js(`document.querySelector('.conflict__head')?.textContent ?? null`)
  await js(`document.querySelector('.conflict__btn')?.click()`)
  await wait(250)
  report.selectedAfterJump = await js(`document.querySelector('.statusbar__left').textContent`)

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'conflict.png'), shot.toPNG())

  /* 正常三角形不应有冲突标记 */
  await menu('约束三角形')
  report.noConflictNormal = await js(`!document.querySelector('[data-conflict]')`)

  /* —— 函数表达式编辑 —— */
  await menu('清空画布')
  await wait(300)
  await js(`(() => {
    const mf = document.querySelector('math-field.left__input');
    mf.focus();
    mf.value = '\\\\sin(x)';
    mf.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return true;
  })()`)
  await wait(500)

  const firstPoint = () =>
    js(`document.querySelector('.canvas__svg polyline')?.getAttribute('points')?.split(' ')[0] ?? null`)

  report.curveSin = await firstPoint()
  await js(`[...document.querySelectorAll('.left__row')].find(r => r.textContent.includes('f1')).dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
  await wait(300)
  report.editorValue = await js(`(() => {
    const mf = document.querySelector('math-field.fexpr__input');
    return mf ? { ascii: mf.getValue('ascii-math'), latex: mf.value } : null;
  })()`)

  await js(`(() => {
    const mf = document.querySelector('math-field.fexpr__input');
    mf.value = '\\\\cos(x)';
    mf.dispatchEvent(new FocusEvent('blur'));
    return true;
  })()`)
  await wait(500)
  report.curveCos = await firstPoint()
  report.curveChanged = report.curveSin !== report.curveCos

  /* 非法表达式：应提示且不改动 */
  await js(`(() => {
    const mf = document.querySelector('math-field.fexpr__input');
    mf.value = '\\\\sin(';
    mf.dispatchEvent(new FocusEvent('blur'));
    return true;
  })()`)
  await wait(500)
  report.invalidToast = await js(`[...document.querySelectorAll('.toast')].map(t => t.textContent)`)
  report.curveAfterInvalid = await firstPoint()

  const shot2 = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'function-edit.png'), shot2.toPNG())

  console.log('RESULT ' + JSON.stringify(report, null, 2))
  app.quit()
}

app.whenReady().then(main).catch((e) => {
  console.error('VERIFY FAILED', e)
  app.quit()
})
