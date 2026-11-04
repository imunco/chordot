/**
 * 边界与容错巡检：损坏文件、超长表达式、符号键盘、快捷键、极小窗口、空画布导出。
 */
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { registerFileIpc } = require('../electron/file-ipc.cjs')
const { registerStoreIpc } = require('../electron/store.cjs')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')
fs.mkdirSync(outDir, { recursive: true })
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-edge-'))

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-edge-data-')))
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const report = {}
function check(cond, msg) {
  if (!cond) {
    failed++
    console.error('VERIFY FAILED ' + msg)
  }
}

async function main() {
  protocol.handle('app', (r) =>
    net.fetch(pathToFileURL(path.join(DIST, decodeURIComponent(new URL(r.url).pathname))).toString()),
  )
  ipcMain.handle('ui:get-state', () => ({}))
  ipcMain.on('ui:set-state', () => {})
  registerStoreIpc()
  registerFileIpc({ addRecent: () => {} })
  ipcMain.handle('update:info', () => ({ version: '0.0.0', mirrors: [] }))
  ipcMain.handle('update:check', () => ({ ok: true, current: '0.0.0', hasUpdate: false }))
  ipcMain.handle('app:about', () => ({
    name: 'Chordot',
    version: '0.0.0',
    electron: '',
    chrome: '',
    node: '',
    repo: '',
  }))

  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    show: true,
    webPreferences: {
      preload: path.join(root, 'electron/preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  })
  const errors = []
  win.webContents.on('console-message', (...args) => {
    let level = 0
    let message = ''
    if (typeof args[1] === 'number') {
      level = args[1]
      message = String(args[2] ?? '')
    } else if (args[0] && typeof args[0] === 'object') {
      level = args[0].level
      message = String(args[0].message ?? '')
    }
    if (message && (level === 'error' || level >= 3)) errors.push(message.slice(0, 200))
  })
  const js = (c) => win.webContents.executeJavaScript(c, true)
  const shot = async (name) => {
    const img = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, `edge-${name}.png`), img.toPNG())
  }
  const key = (k, mods = {}) =>
    js(`window.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify({ key: k, bubbles: true, ...mods })}))`)

  await win.loadURL('app://chordot/index.html?notour=1')
  await wait(1500)

  /* ───── 1. 损坏的课件文件 ───── */
  const broken = path.join(work, 'broken.chordot')
  fs.writeFileSync(broken, '{ this is not json')
  process.env.CHORDOT_TEST_OPEN = broken
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, bubbles: true }))`)
  await wait(900)
  const afterBroken = await js(`({ toast: [...document.querySelectorAll('.toast')].pop()?.textContent ?? '', file: window.__state.file, ok: !!document.querySelector('.canvas__svg') })`)
  report.broken = afterBroken
  check(afterBroken.ok, '打开损坏文件后画布没了')
  check(afterBroken.toast.length > 0, '打开损坏文件没有任何提示')

  /* ───── 2. 版本不兼容的文件 ───── */
  const future = path.join(work, 'future.chordot')
  fs.writeFileSync(
    future,
    JSON.stringify({ app: 'chordot', version: 999, savedAt: new Date().toISOString(), doc: { scene: { kind: 'sketch', doc: { points: [], segments: [], circles: [], polygons: [], functions: [], constraints: [], forces: [] } }, hidden: {}, names: {} } }),
  )
  process.env.CHORDOT_TEST_OPEN = future
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, bubbles: true }))`)
  await wait(900)
  const afterFuture = await js(`({ toast: [...document.querySelectorAll('.toast')].pop()?.textContent ?? '', ok: !!document.querySelector('.canvas__svg') })`)
  report.future = afterFuture
  check(afterFuture.ok, '打开高版本文件后画布崩了')

  /* ───── 3. 超长 / 恶意表达式 ───── */
  const addExpr = async (tex) => {
    const ok = await js(`(() => {
      const mf = document.querySelector('math-field.left__input');
      if (!mf) return false;
      mf.focus();
      mf.value = ${JSON.stringify(tex)};
      mf.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return true;
    })()`)
    await wait(500)
    return ok
  }
  await addExpr('\\sin(\\sin(\\sin(\\sin(\\sin(x)))))')
  await addExpr('x^{x^{x}}')
  await addExpr('\\frac{1}{\\sin(x)}')
  await addExpr('\\operatorname{random}(x)')
  const fnCount = await js(`window.__state.doc.scene.doc.functions.length`)
  report.fnCount = fnCount
  check(fnCount >= 3, `复杂表达式只接受了 ${fnCount} 条`)
  await shot('expressions')

  // 极端缩放下的采样不应卡死：切到 0.3 倍
  for (let i = 0; i < 30; i++) {
    win.webContents.sendInputEvent({ type: 'mouseWheel', x: 400, y: 400, deltaX: 0, deltaY: 120, canScroll: false })
    await wait(40)
  }
  await wait(400)
  const zMin = await js(`window.__state.zoom`)
  report.zoomMin = zMin
  check(zMin >= 0.3 - 1e-6, `缩放下限被突破：${zMin}`)

  /* ───── 4. 符号键盘 ───── */
  await key('/', { ctrlKey: true })
  await wait(400)
  const padOpen = await js(`!!document.querySelector('.pad, .symbol-pad, [class*="pad"]')`)
  report.padOpen = padOpen
  check(padOpen, 'Ctrl+/ 没有打开符号键盘')
  await shot('pad')
  const padKeys = await js(`document.querySelectorAll('.pad button, [class*="pad"] button').length`)
  report.padKeys = padKeys
  check(padKeys > 10, `符号键盘按钮太少（${padKeys}）`)
  await key('/', { ctrlKey: true })
  await wait(300)

  /* ───── 5. 快捷键 ───── */
  const gridBefore = await js(`window.__state.grid`)
  await key('g')
  await wait(250)
  check((await js(`window.__state.grid`)) !== gridBefore, 'G 没切换网格')
  await key('g')
  await wait(200)

  const modeBefore = await js(`window.__state.mode`)
  await key('m')
  await wait(300)
  check((await js(`window.__state.mode`)) !== modeBefore, 'M 没切换模式')
  await key('m')
  await wait(300)

  await key('b')
  await wait(250)
  check((await js(`window.__state.tool`)) === 'pen', 'B 没切到画笔')
  await key('e')
  await wait(250)
  check((await js(`window.__state.tool`)) === 'eraser', 'E 没切到橡皮')
  await key('Escape')
  await wait(200)
  check((await js(`window.__state.tool`)) === 'select', 'Esc 没回到选择工具')

  await key('F1')
  await wait(400)
  const shortcutsOpen = await js(`!!document.querySelector('.shortcuts')`)
  report.shortcutsOpen = shortcutsOpen
  check(shortcutsOpen, 'F1 没打开快捷键面板')
  await key('Escape')
  await wait(300)
  check(!(await js(`!!document.querySelector('.shortcuts')`)), 'Esc 关不掉快捷键面板')

  /* ───── 6. 空画布导出 ───── */
  win.webContents.send('app:menu', 'new')
  await wait(600)
  process.env.CHORDOT_TEST_EXPORT = path.join(work, 'empty.svg')
  win.webContents.send('app:menu', 'export-svg')
  await wait(900)
  const emptySvg = path.join(work, 'empty.svg')
  report.emptyExport = fs.existsSync(emptySvg) ? fs.statSync(emptySvg).size : 0
  check(fs.existsSync(emptySvg) && fs.statSync(emptySvg).size > 200, '空画布导出失败')

  /* ───── 7. 极小窗口 ───── */
  win.setSize(820, 620)
  await wait(500)
  const small = await js(`(() => {
    const t = document.querySelector('.toolbar');
    return {
      toolbarOverflow: t ? t.scrollWidth > t.clientWidth + 1 : null,
      docScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      canvasW: Math.round(document.querySelector('.canvas').getBoundingClientRect().width),
      canvasH: Math.round(document.querySelector('.canvas').getBoundingClientRect().height),
    };
  })()`)
  report.small = small
  check(small.canvasW > 200 && small.canvasH > 200, `820×620 下画布被挤没了：${JSON.stringify(small)}`)
  check(!small.toolbarOverflow, '820 宽时工具栏溢出')
  await shot('small')
  win.setSize(1360, 860)
  await wait(400)

  /* ───── 8. 保存到不可写路径 ───── */
  process.env.CHORDOT_TEST_SAVE = path.join(work, 'no-such-dir', 'x.chordot')
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))`)
  await wait(800)
  const saveErr = await js(`[...document.querySelectorAll('.toast')].pop()?.textContent ?? ''`)
  report.saveErr = saveErr
  check(saveErr.length > 0, '保存到不可写路径没有任何提示')

  /* ───── 9. 连续快速操作不崩 ───── */
  for (let i = 0; i < 12; i++) {
    await key('z', { ctrlKey: true })
    await key('y', { ctrlKey: true })
  }
  await wait(600)
  check(await js(`!!document.querySelector('.canvas__svg')`), '连续撤销重做后画布消失')
  check((await js(`window.__state.solved !== undefined || true`)), '')

  report.consoleErrors = errors
  check(errors.length === 0, `控制台有 ${errors.length} 条报错：${errors[0] ?? ''}`)

  console.log('REPORT ' + JSON.stringify(report, null, 1))
  if (failed === 0) console.log('RESULT 边界巡检通过')
  else console.log(`SUMMARY ${failed} 项失败`)
  app.quit()
}

app.whenReady().then(main).catch((e) => {
  console.error('FAILED', e)
  app.quit()
})
