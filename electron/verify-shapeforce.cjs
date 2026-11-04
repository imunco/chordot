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

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-sf-')))
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
    await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
    await wait(150)
    await js(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('模板库')).click()`)
    await waitFor(`!!document.querySelector('.gallery')`)
    await wait(350)
    await js(`[...document.querySelectorAll('.gallery__main')].find(c => c.textContent.includes('物理世界·自由下落')).click()`)
    await wait(1600)

    /* 选中「球」 */
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
    await wait(400)
    await js(`(() => {
      const row = [...document.querySelectorAll('.left__row')].find(r => r.textContent.includes('球'));
      row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return !!row;
    })()`)
    await wait(400)
    await step('panelHasForce', `[...document.querySelectorAll('.props__row')].some(r => r.textContent.includes('这个物体的变力'))`)
    await step('panelShapeTitle', `[...document.querySelectorAll('.fgroup__title')].map(t => t.textContent)`)

    const xs = `(() => { const sc = window.__state.doc.scene; return sc.kind === 'solid' ? sc.params.shapes.map(s => ({ n: s.name, x: +s.center[0].toFixed(2) })) : null; })()`
    report.before = await js(xs)

    await step(
      'toggle',
      `(() => {
        const b = [...document.querySelectorAll('.props__toggle')].find(x => x.closest('.props__row')?.textContent.includes('这个物体的变力'));
        if (!b) return 'no-toggle';
        b.click();
        return 'ok';
      })()`,
    )
    await wait(300)
    await step('forceState', `(() => {
      const sc = window.__state.doc.scene;
      const ball = sc.params.shapes.find(s => s.name === '球');
      const other = sc.params.shapes.find(s => s.name === '正方体');
      return { ball: ball?.force ?? null, other: other?.force ?? null, global: sc.params.physics.force ?? null };
    })()`)

    /* 自定义方向：填 0,0,-1 应被接受并覆盖预设 */
    await step(
      'vecSet',
      `(() => {
        const row = [...document.querySelectorAll('.props__row')].find(r => r.textContent.includes('自定义方向'));
        if (!row) return 'no-row';
        const input = row.querySelector('input');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, '0,0,-1');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        return 'ok';
      })()`,
    )
    await wait(500)
    const shotDir = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, 'shape-force-dir.png'), shotDir.toPNG())
    await step('vecStored', `(() => {
      const sc = window.__state.doc.scene;
      return sc.params.shapes.find(s => s.name === '球')?.force ?? null;
    })()`)
    await step('arrowTip', `(() => {
      const t = [...document.querySelectorAll('svg text')].find(x => x.textContent.startsWith('F = '));
      if (!t) return 'no-label';
      return { x: Math.round(+t.getAttribute('x')), y: Math.round(+t.getAttribute('y')), text: t.textContent };
    })()`)
    if (!report.vecStored || report.vecStored.vec !== '0,0,-1') {
      console.error('VERIFY FAILED 自定义方向没写进文档')
    }


    await wait(1200)
    report.after = await js(xs)

    const shot = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, 'shape-force.png'), shot.toPNG())
  } catch (err) {
    report.fatal = String(err).split('\n')[0]
  }

  report.consoleErrors = errors.slice(0, 6)
  console.log('RESULT ' + JSON.stringify(report, null, 2))
  clearTimeout(watchdog)
  app.quit()
})
