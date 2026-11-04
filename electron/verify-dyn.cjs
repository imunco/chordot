const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { registerFileIpc } = require('./file-ipc.cjs')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')
fs.mkdirSync(outDir, { recursive: true })

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-dyn-')))
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
  registerFileIpc({ addRecent: () => {} })

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
    /* ============ 1. 浮动符号键盘 ============ */
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', ctrlKey: true, bubbles: true }))`)
    await waitFor(`!!document.querySelector('.pad')`)
    await wait(300)
    await step('padGrip', `!!document.querySelector('.pad__grip')`)
    const posBefore = await js(`(() => { const r = document.querySelector('.pad').getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y) }; })()`)
    await js(`(() => {
      const g = document.querySelector('.pad__grip');
      const r = g.getBoundingClientRect();
      const opt = (x, y) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 });
      g.dispatchEvent(new PointerEvent('pointerdown', opt(r.x + 8, r.y + 8)));
      g.dispatchEvent(new PointerEvent('pointermove', opt(r.x + 8 - 220, r.y + 8 - 120)));
      g.dispatchEvent(new PointerEvent('pointerup', opt(r.x + 8 - 220, r.y + 8 - 120)));
      return true;
    })()`)
    await wait(300)
    const posAfter = await js(`(() => { const el = document.querySelector('.pad'); const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), left: el.style.left, top: el.style.top }; })()`)
    report.padMove = { before: posBefore, after: posAfter }
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', ctrlKey: true, bubbles: true }))`)
    await wait(250)

    /* ============ 2. 物理变力 + 3D 线框 ============ */
    await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
    await wait(150)
    await js(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('模板库')).click()`)
    await waitFor(`!!document.querySelector('.gallery')`)
    await wait(350)
    await js(`[...document.querySelectorAll('.gallery__main')].find(c => c.textContent.includes('物理世界·自由下落')).click()`)
    await wait(1400)

    await step('dashedEdges', `document.querySelectorAll('[data-id] line[stroke-dasharray]').length`)
    await step('solidEdges', `document.querySelectorAll('[data-id] line:not([stroke-dasharray])').length`)

    /* 开外力 F(t)=2t，方向 +x */
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
    await wait(400)
    await step(
      'forceToggle',
      `(() => {
        const b = [...document.querySelectorAll('.props__toggle')].find(x => x.closest('.props__row')?.textContent.includes('施加变力'));
        if (!b) return 'no-toggle';
        b.click();
        return 'ok';
      })()`,
    )
    await wait(300)
    await step('forceState', `window.__state.doc.scene.params.physics.force`)

    const xOf = `(() => { const sc = window.__state.doc.scene; return sc.kind === 'solid' ? sc.params.shapes.map(s => +s.center[0].toFixed(2)) : null; })()`
    const x1 = await js(xOf)
    await wait(1600)
    const x2 = await js(xOf)
    await wait(1200)
    const x3 = await js(xOf)
    report.forceDrift = { x1, x2, x3, moved: JSON.stringify(x1) !== JSON.stringify(x3) }

    const shot = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, 'force-physics.png'), shot.toPNG())

    /* ============ 3. 拖动时显示长度 ============ */
    await js(`document.querySelector('.toolbar [title="图形库（拖到画布）"]').click()`)
    await waitFor(`!!document.querySelector('.shapes')`)
    await wait(300)
    await js(`[...document.querySelectorAll('.shapes__card')].find(c => c.textContent.includes('物块')).click()`)
    await wait(800)
    await js(`document.querySelector('.shapes .iconbtn').click()`)
    await wait(300)

    await js(`(() => {
      const g = [...document.querySelectorAll('[data-id]')].find(el => el.querySelector('text')?.textContent === 'A');
      if (!g) return 'no-point';
      const c = g.querySelector('circle');
      const r = c.getBoundingClientRect();
      const opt = (x, y) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 2, isPrimary: true, pointerType: 'mouse', button: 0 });
      g.dispatchEvent(new PointerEvent('pointerdown', opt(r.x + r.width / 2, r.y + r.height / 2)));
      const svg = document.querySelector('.canvas__svg');
      svg.dispatchEvent(new PointerEvent('pointermove', opt(r.x + r.width / 2 + 30, r.y + r.height / 2 - 20)));
      return 'ok';
    })()`)
    await wait(400)
    await step('lenLabels', `[...document.querySelectorAll('[data-len] text')].map(t => t.textContent)`)
    const shot2 = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, 'drag-length.png'), shot2.toPNG())
    await js(`(() => {
      const svg = document.querySelector('.canvas__svg');
      const r = svg.getBoundingClientRect();
      svg.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: r.x + 10, clientY: r.y + 10, pointerId: 2, isPrimary: true, pointerType: 'mouse', button: 0 }));
      return true;
    })()`)
    await wait(300)
    await step('lenAfterUp', `document.querySelectorAll('[data-len]').length`)
  } catch (err) {
    report.fatal = String(err).split('\n')[0]
  }

  report.consoleErrors = errors.slice(0, 6)
  console.log('RESULT ' + JSON.stringify(report, null, 2))
  clearTimeout(watchdog)
  app.quit()
})
