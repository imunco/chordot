const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')
fs.mkdirSync(outDir, { recursive: true })

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-canvas-')))
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const watchdog = setTimeout(() => {
  console.log('TIMEOUT')
  app.quit()
}, 90000)

app.whenReady().then(async () => {
  protocol.handle('app', (req) =>
    net.fetch(
      pathToFileURL(path.join(DIST, decodeURIComponent(new URL(req.url).pathname))).toString(),
    ),
  )
  ipcMain.handle('ui:get-state', () => ({}))
  ipcMain.on('ui:set-state', () => {})

  const win = new BrowserWindow({
    width: 1360,
    height: 900,
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
  await win.loadURL('app://chordot/index.html?notour=1')
  const js = (c) => win.webContents.executeJavaScript(c, true)
  const waitFor = async (expr, ms = 6000) => {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      try {
        if (await js(expr)) return true
      } catch {
        /* 忽略 */
      }
      await wait(80)
    }
    return false
  }

  const report = {}
  const step = async (label, code) => {
    try {
      report[label] = await js(code)
    } catch (err) {
      report[label] = { error: String(err).split('\n')[0] }
    }
  }

  await wait(1800)
  try {

  /* 载入正八边形，方便看缩放/平移 */
  await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
  await wait(150)
  await js(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('模板库')).click()`)
  await waitFor(`!!document.querySelector('.gallery')`)
  await wait(300)
  await js(`[...document.querySelectorAll('.gallery__tab')].find(b => b.textContent === '几何').click()`)
  await wait(250)
  await js(`[...document.querySelectorAll('.gallery__main')].find(c => c.textContent.includes('正八边形')).click()`)
  await wait(900)

  /* —— 1. 文本不可选中 —— */
  await step('userSelect', `getComputedStyle(document.querySelector('.canvas')).userSelect`)

  /* —— 2. 滚轮缩放，光标下的点不动 —— */
  const before = await js(`(() => {
    const svg = document.querySelector('.canvas__svg');
    const r = svg.getBoundingClientRect();
    const st = window.__state;
    const px = r.left + r.width / 2 + 60, py = r.top + r.height / 2 - 40;
    const s = 40 * st.zoom;
    const cx = r.width / 2 + st.pan.x, cy = r.height / 2 + 40 + st.pan.y;
    return { zoom: st.zoom, pan: st.pan, px, py, world: { x: (px - r.left - cx) / s, y: (cy - (py - r.top)) / s } };
  })()`)
  report.zoomBefore = { zoom: before.zoom, pan: before.pan, world: before.world }

  await js(`(() => {
    const svg = document.querySelector('.canvas__svg');
    for (let i = 0; i < 3; i++) {
      svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: ${before.px}, clientY: ${before.py}, bubbles: true, cancelable: true }));
    }
    return true;
  })()`)
  await wait(350)
  report.zoomAfter = await js(`(() => {
    const svg = document.querySelector('.canvas__svg');
    const r = svg.getBoundingClientRect();
    const st = window.__state;
    const s = 40 * st.zoom;
    const cx = r.width / 2 + st.pan.x, cy = r.height / 2 + 40 + st.pan.y;
    const wx = (${before.px} - r.left - cx) / s;
    const wy = (cy - (${before.py} - r.top)) / s;
    return { zoom: st.zoom, pan: st.pan, worldAtCursor: { x: +wx.toFixed(4), y: +wy.toFixed(4) } };
  })()`)

  /* —— 3. 左键拖空白 = 平移 —— */
  await js(`(() => {
    const svg = document.querySelector('.canvas__svg');
    const r = svg.getBoundingClientRect();
    const x = r.left + 40, y = r.top + r.height - 60;
    const opt = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 };
    window.__panOrigin = { x, y };
    const hit = document.elementFromPoint(x, y);
    (hit || svg).dispatchEvent(new PointerEvent('pointerdown', opt));
    return true;
  })()`)
  await wait(120)
  await step('panStart', `window.__state.pan`)
  await js(`(() => {
    const o = window.__panOrigin;
    const svg = document.querySelector('.canvas__svg');
    const opt = { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 };
    svg.dispatchEvent(new PointerEvent('pointermove', { ...opt, clientX: o.x + 40, clientY: o.y - 30 }));
    svg.dispatchEvent(new PointerEvent('pointermove', { ...opt, clientX: o.x + 80, clientY: o.y - 60 }));
    svg.dispatchEvent(new PointerEvent('pointerup', { ...opt, clientX: o.x + 80, clientY: o.y - 60 }));
    return true;
  })()`)
  await wait(300)
  await step('panAfterDrag', `window.__state.pan`)

  /* —— 4. 点空白（不移动）= 取消选择 —— */
  await js(`(() => {
    const g = [...document.querySelectorAll('[data-id]')].find(el => el.querySelector('text')?.textContent === 'A');
    const c = g.querySelector('circle');
    const r = c.getBoundingClientRect();
    g.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 }));
    return true;
  })()`)
  await wait(200)
  await step('selectedAfterClick', `window.__state.selected.length`)
  await js(`(() => {
    const svg = document.querySelector('.canvas__svg');
    const r = svg.getBoundingClientRect();
    const x = r.left + 30, y = r.top + r.height - 40;
    const opt = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 };
    const hit = document.elementFromPoint(x, y);
    (hit || svg).dispatchEvent(new PointerEvent('pointerdown', opt));
    (hit || svg).dispatchEvent(new PointerEvent('pointerup', opt));
    return true;
  })()`)
  await wait(250)
  await step('selectedAfterBlankClick', `window.__state.selected.length`)

  /* —— 5. 力工具：点画布放置力 —— */
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', ctrlKey: true, bubbles: true }))`)
  await wait(400)
  await js(`[...document.querySelectorAll('.tbtn')].find(b => b.title && b.title.includes('添加力')).click()`)
  await wait(250)
  await step('toolAfterPick', `window.__state.tool`)
  await js(`(() => {
    const svg = document.querySelector('.canvas__svg');
    const r = svg.getBoundingClientRect();
    const x = r.left + r.width / 2 + 40, y = r.top + r.height / 2 - 60;
    const opt = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 };
    const hit = document.elementFromPoint(x, y);
    (hit || svg).dispatchEvent(new PointerEvent('pointerdown', opt));
    (hit || svg).dispatchEvent(new PointerEvent('pointerup', opt));
    return true;
  })()`)
  await wait(500)
  await step('forceAdded', `(() => {
    const st = window.__state;
    const sc = st.doc.scene;
    if (sc.kind !== 'sketch') return 'not-sketch';
    return { count: (sc.doc.forces ?? []).length, first: (sc.doc.forces ?? [])[0] ?? null, tool: st.tool, selected: st.selected };
  })()`)

  /* 右栏出现力编辑区 */
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
  await wait(400)
  await step('forceEditor', `!!document.querySelector('.forceedit')`)
  await step('forceArrow', `(() => {
    const g = [...document.querySelectorAll('[data-id^="F"]')];
    const line = g[0]?.querySelector('line');
    return line ? Math.round(Math.hypot(+line.getAttribute('x2') - +line.getAttribute('x1'), +line.getAttribute('y2') - +line.getAttribute('y1'))) : null;
  })()`)

  /* 改成随时间变化的力 F(t) = 2t，拖滑块看箭头变化 */
  await js(`(() => {
    const sel = document.querySelector('.forceedit__select');
    sel.value = 'time';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`)
  await wait(400)
  await js(`(() => {
    const input = document.querySelector('.forceedit__input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '2t');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    return true;
  })()`)
  await wait(500)
  await step('forceTimeValue', `(() => {
    const st = window.__state;
    const f = (st.doc.scene.doc.forces ?? [])[0];
    const obj = st.solution ? null : null;
    const g = [...document.querySelectorAll('[data-id^="F"]')];
    const line = g[0]?.querySelector('line');
    return {
      expr: f?.expr, kind: f?.kind,
      arrowPx: line ? Math.round(Math.hypot(+line.getAttribute('x2') - +line.getAttribute('x1'), +line.getAttribute('y2') - +line.getAttribute('y1'))) : null,
    };
  })()`)

  await js(`(() => {
    const range = document.querySelector('.forceedit__range');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(range, '3');
    range.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`)
  await wait(500)
  await step('forcePreview3', `(() => {
    const g = [...document.querySelectorAll('[data-id^="F"]')];
    const line = g[0]?.querySelector('line');
    return {
      preview: window.__state.forcePreview,
      arrowPx: line ? Math.round(Math.hypot(+line.getAttribute('x2') - +line.getAttribute('x1'), +line.getAttribute('y2') - +line.getAttribute('y1'))) : null,
      now: document.querySelector('.forceedit__now')?.textContent ?? null,
    };
  })()`)

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'canvas-force.png'), shot.toPNG())

  } catch (err) {
    report.fatal = String(err).split('\n')[0]
  }
  report.consoleErrors = errors.slice(0, 5)
  console.log('RESULT ' + JSON.stringify(report, null, 2))
  clearTimeout(watchdog)
  app.quit()
})
