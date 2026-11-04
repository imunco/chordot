const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')
fs.mkdirSync(outDir, { recursive: true })

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-phys-')))
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
  const heights = `(() => {
    const sc = window.__state.doc.scene;
    if (sc.kind !== 'solid') return null;
    return sc.params.shapes.map(s => ({ n: s.name, z: +s.center[2].toFixed(2), r: s.rotation ? s.rotation.map(v => +v.toFixed(2)) : null }));
  })()`

  await wait(1800)
  try {
    /* 载入物理世界模板 */
    await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
    await wait(150)
    await js(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('模板库')).click()`)
    await waitFor(`!!document.querySelector('.gallery')`)
    await wait(350)
    await js(`[...document.querySelectorAll('.gallery__main')].find(c => c.textContent.includes('物理世界')).click()`)
    await wait(400)

    await step('t0', heights)
    await wait(2200)
    await step('t2', heights)

    /* 地面网格出现 */
    await step('ground', `!!document.querySelector('[data-ground]')`)

    /* 关掉物理世界 → 回到摆放位置 */
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
    await wait(400)
    await js(`(() => {
      const t = [...document.querySelectorAll('.props__toggle')].find(b => b.closest('.props__row')?.textContent.includes('按真实物理下落'));
      if (!t) return 'no-toggle';
      t.click();
      return 'ok';
    })()`)
    await wait(700)
    await step('afterOff', heights)
    await step('groundAfterOff', `!!document.querySelector('[data-ground]')`)

    const shot = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, 'physics-restored.png'), shot.toPNG())

    /* 再开一次，确认能重新跑起来 */
    await js(`(() => {
      const t = [...document.querySelectorAll('.props__toggle')].find(b => b.closest('.props__row')?.textContent.includes('按真实物理下落'));
      t.click();
      return true;
    })()`)
    await wait(1500)
    await step('tAgain', heights)
  } catch (err) {
    report.fatal = String(err).split('\n')[0]
  }

  report.consoleErrors = errors.slice(0, 6)
  console.log('RESULT ' + JSON.stringify(report, null, 2))
  clearTimeout(watchdog)
  app.quit()
})
