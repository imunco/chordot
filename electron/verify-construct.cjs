/** 构造工具端到端验证：点 / 线段 / 圆 / 函数曲线 / 拖动 */
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { pathToFileURL } = require('node:url')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')

// 独立 profile，避免继承上一次运行的 lastFile
app.setPath('userData', path.join(os.tmpdir(), 'chordot-verify-construct'))

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

  // 页面内的辅助函数：按世界坐标点击画布
  await js(`
    window.__clickWorld = (wx, wy) => {
      const svg = document.querySelector('.canvas__svg');
      const rect = svg.getBoundingClientRect();
      const s = 40;
      const x = rect.left + rect.width / 2 + wx * s;
      const y = rect.top + rect.height / 2 + 40 - wy * s;
      const opt = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 };
      const hit = document.elementFromPoint(x, y);
      (hit || svg).dispatchEvent(new PointerEvent('pointerdown', opt));
      (hit || svg).dispatchEvent(new PointerEvent('pointerup', opt));
      return hit ? hit.tagName : 'none';
    };
    window.__rows = () => [...document.querySelectorAll('.left__row .left__name')].map(n => n.textContent);
    true;
  `)

  const rows = () => js(`window.__rows()`)
  const tool = (title) => js(`document.querySelector('.toolbar [title="${title}"]').click()`)
  const report = {}

  report.startRows = await rows()

  /* 点工具：放置后自动回到选择模式（design.md §5.3），因此每次都重新取工具 */
  await tool('点')
  await js(`window.__clickWorld(-2, 1)`)
  await wait(120)
  await tool('点')
  await js(`window.__clickWorld(3, 2)`)
  await wait(200)
  report.afterPoints = await rows()

  /* 线段工具：连接两个已有点（吸附） */
  await tool('线段')
  await js(`window.__clickWorld(-2, 1)`)
  await wait(120)
  await js(`window.__clickWorld(3, 2)`)
  await wait(200)
  report.afterSegment = await rows()

  /* 圆工具：圆心 A，半径 4 */
  await tool('圆')
  await js(`window.__clickWorld(-2, 1)`)
  await wait(120)
  await js(`window.__clickWorld(2, 1)`)
  await wait(200)
  report.afterCircle = await rows()

  /* 表达式输入 */
  await js(`(() => {
    const input = document.querySelector('.left__input');
    input.focus();
    input.value = 'sin(x)';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return true;
  })()`)
  await wait(400)
  report.afterExpr = await rows()
  report.curvePolylines = await js(`document.querySelectorAll('.canvas__svg polyline').length`)

  /* 拖动点 A：线段与圆应跟随 */
  const before = await js(`(() => {
    const seg = document.querySelector('[data-id^="s"] line');
    const circle = document.querySelector('[data-id^="c"] circle');
    return { segX1: seg && +seg.getAttribute('x1'), circleR: circle && +circle.getAttribute('r') };
  })()`)
  await js(`(async () => {
    const g = [...document.querySelectorAll('[data-id]')].find(el => el.querySelector('text')?.textContent === 'A');
    const c = g.querySelector('circle');
    const r = c.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const opt = (cx, cy) => ({ bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0, buttons: 1 });
    g.dispatchEvent(new PointerEvent('pointerdown', opt(x, y)));
    const svg = document.querySelector('.canvas__svg');
    for (let i = 1; i <= 5; i++) { svg.dispatchEvent(new PointerEvent('pointermove', opt(x + 8 * i, y - 6 * i))); await new Promise(r => setTimeout(r, 16)); }
    svg.dispatchEvent(new PointerEvent('pointerup', opt(x + 40, y - 30)));
    return 'ok';
  })()`)
  await wait(400)
  const after = await js(`(() => {
    const seg = document.querySelector('[data-id^="s"] line');
    const circle = document.querySelector('[data-id^="c"] circle');
    return { segX1: seg && +seg.getAttribute('x1'), circleR: circle && +circle.getAttribute('r') };
  })()`)
  report.drag = { before, after }
  report.status = await js(`document.querySelector('.statusbar__left').textContent`)

  /* 多边形：三点后点回起点闭合 */
  await tool('多边形')
  await js(`window.__clickWorld(-6, 3)`)
  await wait(100)
  await js(`window.__clickWorld(-4, 4.2)`)
  await wait(100)
  await js(`window.__clickWorld(-6.2, 4.6)`)
  await wait(100)
  report.polygonMid = await js(`document.querySelector('.statusbar__left').textContent`)
  await js(`window.__clickWorld(-6, 3)`)
  await wait(250)
  report.afterPolygon = await rows()

  /* 删除点 A：依附的线段与圆应一并移除 */
  await js(`(() => {
    const g = [...document.querySelectorAll('[data-id]')].find(el => el.querySelector('text')?.textContent === 'A');
    const r = g.querySelector('circle').getBoundingClientRect();
    g.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    return true;
  })()`)
  await wait(300)
  report.afterDelete = await rows()

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'construct.png'), shot.toPNG())

  console.log('RESULT ' + JSON.stringify(report, null, 2))
  app.quit()
}

app.whenReady().then(main).catch((e) => {
  console.error('VERIFY FAILED', e)
  app.quit()
})
