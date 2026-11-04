/** 首选项：力箭头标尺 / 网格默认 / 角度单位 */
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { registerFileIpc } = require('./file-ipc.cjs')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-prefs-')))

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const HELPERS = `
  window.__openPrefs = async () => {
    document.querySelector('.toolbar__menu-anchor .tbtn').click();
    await new Promise(r => setTimeout(r, 150));
    [...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('首选项')).click();
    await new Promise(r => setTimeout(r, 350));
    return !!document.querySelector('.prefs');
  };
  window.__setRange = async (v) => {
    const el = document.querySelector('.prefs__range');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    return document.querySelector('.prefs__value')?.textContent ?? null;
  };
  window.__arrowLen = () => {
    const g = document.querySelector('[data-id="F_G"] line');
    return g ? Math.round(Math.abs(+g.getAttribute('y2') - +g.getAttribute('y1'))) : null;
  };
  window.__scaleText = () => document.querySelector('.canvas__scale')?.textContent ?? null;
  window.__openTemplate = async (name) => {
    document.querySelector('.toolbar__menu-anchor .tbtn').click();
    await new Promise(r => setTimeout(r, 150));
    [...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('模板库')).click();
    await new Promise(r => setTimeout(r, 450));
    [...document.querySelectorAll('.gallery__main')].find(c => c.textContent.includes(name)).click();
    await new Promise(r => setTimeout(r, 700));
    return true;
  };
  window.__angleRows = () => [...document.querySelectorAll('.measure__row')].map(r => [...r.children].map(c => c.textContent));
  true;
`

async function main() {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url)
    return net.fetch(pathToFileURL(path.join(DIST, decodeURIComponent(pathname))).toString())
  })
  fs.mkdirSync(outDir, { recursive: true })
  ipcMain.handle('ui:get-state', () => ({}))
  ipcMain.on('ui:set-state', () => {})
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
  await js(HELPERS)

  const report = {}

  /* 斜面：默认 4 px/N → G=30N 应为 120px */
  await js(`window.__openTemplate('斜面受力 30')`)
  report.arrowDefault = await js(`window.__arrowLen()`)
  report.scaleDefault = await js(`window.__scaleText()`)

  /* 打开首选项，改成 6 px/N */
  report.prefsOpen = await js(`window.__openPrefs()`)
  report.valueAfterChange = await js(`window.__setRange(6)`)
  await js(`[...document.querySelectorAll('.prefs .btn')].find(b => b.textContent === '完成').click()`)
  await wait(400)

  report.arrowAfter = await js(`window.__arrowLen()`)
  report.scaleAfter = await js(`window.__scaleText()`)

  /* 角度单位改成弧度：三点测量应显示 rad */
  await js(`window.__openPrefs()`)
  await js(`[...document.querySelectorAll('.prefs .segmented__btn')].find(b => b.textContent === '弧度').click()`)
  await wait(300)
  await js(`[...document.querySelectorAll('.prefs .btn')].find(b => b.textContent === '完成').click()`)
  await wait(300)

  /* 画三个点做角度测量 */
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
  await wait(250)
  const clickWorld = (wx, wy) => js(`(() => {
    const svg = document.querySelector('.canvas__svg'); const rect = svg.getBoundingClientRect(); const s = 40;
    const x = rect.left + rect.width / 2 + ${wx} * s, y = rect.top + rect.height / 2 + 40 - ${wy} * s;
    const opt = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 };
    const hit = document.elementFromPoint(x, y) || svg;
    hit.dispatchEvent(new PointerEvent('pointerdown', opt));
    hit.dispatchEvent(new PointerEvent('pointerup', opt));
    return true;
  })()`)
  const tool = (t) => js(`document.querySelector('.toolbar [title="${t}"]').click()`)

  // 新建空白后再画
  await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
  await wait(150)
  await js(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('清空画布')).click()`)
  await wait(400)

  for (const [x, y] of [[-2, 0], [0, 2], [2, 0]]) {
    await tool('点')
    await clickWorld(x, y)
    await wait(150)
  }
  const pick = (label, shift) => js(`(() => {
    const g = [...document.querySelectorAll('[data-id]')].find(el => el.querySelector('text')?.textContent === '${label}');
    const r = g.querySelector('circle').getBoundingClientRect();
    g.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, shiftKey: ${shift}, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 }));
    return true;
  })()`)
  await pick('A', false)
  await wait(120)
  await pick('B', true)
  await wait(120)
  await pick('C', true)
  await wait(350)
  report.angleRad = await js(`window.__angleRows()`)

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'prefs.png'), shot.toPNG())

  console.log('RESULT ' + JSON.stringify(report, null, 2))
  app.quit()
}

app.whenReady().then(main).catch((e) => {
  console.error('VERIFY FAILED', e)
  app.quit()
})
