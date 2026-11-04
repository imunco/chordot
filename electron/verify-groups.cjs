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

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-group-')))
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
    /* ============ 1. 物理障碍：斜面 + 墙 ============ */
    await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
    await wait(150)
    await js(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('模板库')).click()`)
    await waitFor(`!!document.querySelector('.gallery')`)
    await wait(350)
    await js(`[...document.querySelectorAll('.gallery__main')].find(c => c.textContent.includes('斜面滑下')).click()`)
    await wait(1300)

    await step('obstaclesAtStart', `(window.__state.doc.scene.params.physics.obstacles ?? []).map(o => o.kind)`)
    await step('obstacleNodes', `document.querySelectorAll('[data-obstacles] > g').length`)

    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
    await wait(400)
    await step(
      'addWall',
      `(() => {
        const b = [...document.querySelectorAll('.props__action')].find(x => x.textContent.includes('加一面墙'));
        if (!b) return 'no-button';
        b.click();
        return 'ok';
      })()`,
    )
    await wait(1000)
    await step('afterWall', `(window.__state.doc.scene.params.physics.obstacles ?? []).map(o => o.kind)`)
    await step('obstacleNodes2', `document.querySelectorAll('[data-obstacles] > g').length`)

    await wait(1200)
    const shot2 = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, 'obstacles.png'), shot2.toPNG())

    /* ============ 2. 整组拖动 ============ */
    await js(`document.querySelector('.toolbar [title="图形库（拖到画布）"]').click()`)
    await waitFor(`!!document.querySelector('.shapes')`)
    await wait(300)
    await js(`[...document.querySelectorAll('.shapes__card')].find(c => c.textContent.includes('物块')).click()`)
    await wait(800)
    await js(`document.querySelector('.shapes .iconbtn').click()`)
    await wait(300)

    const pts = `(() => {
      const sc = window.__state.doc.scene;
      if (sc.kind !== 'sketch') return null;
      return sc.doc.points.map(p => ({ id: p.id, x: +p.x.toFixed(3), y: +p.y.toFixed(3) }));
    })()`
    report.before = await js(pts)

    await js(`(() => {
      const g = document.querySelector('[data-id^="g"] polygon');
      if (!g) return 'no-poly';
      const r = g.getBoundingClientRect();
      const opt = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + 4, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 };
      g.dispatchEvent(new PointerEvent('pointerdown', opt));
      return 'ok';
    })()`)
    await wait(180)
    await js(`(() => {
      const svg = document.querySelector('.canvas__svg');
      const g = document.querySelector('[data-id^="g"] polygon');
      const r = g.getBoundingClientRect();
      const x = r.x + r.width / 2, y = r.y + 4;
      const opt = { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 };
      svg.dispatchEvent(new PointerEvent('pointermove', { ...opt, clientX: x + 40, clientY: y - 40 }));
      svg.dispatchEvent(new PointerEvent('pointerup', { ...opt, clientX: x + 40, clientY: y - 40 }));
      return 'ok';
    })()`)
    await wait(500)
    report.after = await js(pts)
    if (report.before && report.after) {
      const d = report.before.map((p, i) => ({
        dx: +(report.after[i].x - p.x).toFixed(3),
        dy: +(report.after[i].y - p.y).toFixed(3),
      }))
      report.groupDelta = {
        count: d.length,
        allSame: d.every((q) => q.dx === d[0].dx && q.dy === d[0].dy),
        delta: d[0],
      }
    }

    const shot1 = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, 'group-drag.png'), shot1.toPNG())
  } catch (err) {
    report.fatal = String(err).split('\n')[0]
  }

  report.consoleErrors = errors.slice(0, 6)
  console.log('RESULT ' + JSON.stringify(report, null, 2))
  clearTimeout(watchdog)
  app.quit()
})
