/** 动态测量端到端验证：距离 / 角度 / 圆 / 多边形面积 */
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')

app.setPath('userData', path.join(os.tmpdir(), 'chordot-verify-measure'))

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

  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.log('[renderer]', message)
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
    window.__pick = (label, shift = false) => {
      const g = [...document.querySelectorAll('[data-id]')].find(el => el.querySelector('text')?.textContent === label);
      if (!g) return false;
      const r = g.querySelector('circle').getBoundingClientRect();
      g.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, shiftKey: shift, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 }));
      return true;
    };
    window.__measure = () => [...document.querySelectorAll('.measure__row')].map(r => [...r.children].map(c => c.textContent));
    window.__labels = () => [...document.querySelectorAll('.canvas__svg text')].map(t => t.textContent);
    true;
  `)

  const report = {}
  const tool = (title) => js(`document.querySelector('.toolbar [title="${title}"]').click()`)

  // 打开右栏
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
  await wait(250)

  /* 三个点：A(-2,1) B(3,1) C(-2,4) */
  for (const [x, y] of [
    [-2, 1],
    [3, 1],
    [-2, 4],
  ]) {
    await tool('点')
    await js(`window.__clickWorld(${x}, ${y})`)
    await wait(150)
  }

  /* 两点距离：A + B → 5.00 cm */
  await js(`window.__pick('A')`)
  await wait(150)
  await js(`window.__pick('B', true)`)
  await wait(300)
  report.distance = await js(`window.__measure()`)
  report.distanceLabel = (await js(`window.__labels()`)).filter((t) => t.includes('cm'))

  /* 角度：A + C + B，顶点取第二个（C）→ 59.0° */
  await js(`window.__pick('A')`)
  await wait(120)
  await js(`window.__pick('C', true)`)
  await wait(120)
  await js(`window.__pick('B', true)`)
  await wait(300)
  report.angle = await js(`window.__measure()`)
  report.angleLabel = (await js(`window.__labels()`)).filter((t) => t.includes('°'))

  const shotAngle = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'measure-angle.png'), shotAngle.toPNG())

  /* 圆：圆心 A，半径 4 */
  await tool('圆')
  await js(`window.__clickWorld(-2, 1)`)
  await wait(150)
  await js(`window.__clickWorld(2, 1)`)
  await wait(300)
  await waitFor(`[...document.querySelectorAll('.left__row')].some(r => r.textContent.includes('⊙A'))`)
  report.circleRows = await js(`[...document.querySelectorAll('.left__row .left__name')].map(n => n.textContent)`)
  await js(`[...document.querySelectorAll('.left__row')].find(r => r.textContent.includes('⊙A')).dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
  await wait(300)
  report.circle = await js(`window.__measure()`)
  report.circleLabel = (await js(`window.__labels()`)).filter((t) => t.startsWith('r ='))

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'measure.png'), shot.toPNG())

  /* 多边形面积：切到约束三角形示例（6-5-4，面积 9.92） */
  await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
  await wait(150)
  await js(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('约束三角形')).click()`)
  await wait(700)
  await js(`[...document.querySelectorAll('.left__row')].find(r => r.textContent.includes('三角形')).dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
  await wait(300)
  report.triangleArea = await js(`window.__measure()`)

  console.log('RESULT ' + JSON.stringify(report, null, 2))
  app.quit()
}

app.whenReady().then(main).catch((e) => {
  console.error('VERIFY FAILED', e)
  app.quit()
})
