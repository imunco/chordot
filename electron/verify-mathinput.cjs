const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')
fs.mkdirSync(outDir, { recursive: true })

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-math-')))
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const watchdog = setTimeout(() => {
  console.log('TIMEOUT')
  app.quit()
}, 60000)

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
    height: 860,
    show: true,
    webPreferences: {
      preload: path.join(root, 'electron', 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  })

  const logs = []
  win.webContents.on('console-message', (e) => {
    const msg = e && e.message ? e.message : ''
    if (e && e.level === 'error') logs.push(msg)
  })

  await win.loadURL('app://chordot/index.html?notour=1')
  const js = (c) => win.webContents.executeJavaScript(c, true)

  const report = {}
  const step = async (label, code) => {
    try {
      report[label] = await js(code)
    } catch (err) {
      report[label] = { error: String(err).split('\n')[0] }
    }
  }

  const waitFor = async (expr, ms = 5000) => {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      try {
        if (await js(expr)) return true
      } catch {
        /* 页面还没就绪 */
      }
      await wait(80)
    }
    return false
  }

  await wait(1800)

  report.mounted = await waitFor(`!!document.querySelector('math-field.left__input')`)
  await step('tag', `document.querySelector('math-field.left__input')?.tagName ?? null`)

  await step(
    'fonts',
    `(async () => {
      await document.fonts.ready;
      const list = [];
      document.fonts.forEach((f) => list.push(f.family + ':' + f.status));
      return { total: list.length, katex: list.filter(s => s.includes('KaTeX')).slice(0, 3) };
    })()`,
  )

  await step(
    'bridge',
    `(async () => {
      const mf = document.querySelector('math-field.left__input');
      const cases = ['\\\\frac{x^2}{2}', '\\\\sqrt{x}', '\\\\sin(x)', 'e^{-x/3}', '\\\\frac{1}{x}'];
      const out = [];
      for (const tex of cases) {
        mf.value = tex;
        let ascii = null;
        try { ascii = mf.getValue('ascii-math'); } catch (e) { ascii = 'ERR:' + e.message; }
        out.push({ tex, ascii });
      }
      mf.value = '';
      return out;
    })()`,
  )

  await step(
    'type',
    `(() => {
      const mf = document.querySelector('math-field.left__input');
      mf.focus();
      mf.value = '\\\\frac{x^2}{4}';
      mf.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      return mf.getValue('latex');
    })()`,
  )
  await wait(800)
  await step(
    'committed',
    `(() => {
      const st = window.__state;
      const sc = st && st.doc.scene;
      if (!sc || sc.kind !== 'sketch') return null;
      return { exprs: sc.doc.functions.map(f => f.expr), curveKeys: st.solution.curves ? Object.keys(st.solution.curves) : [] };
    })()`,
  )

  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', ctrlKey: true, bubbles: true }))`)
  await waitFor(`!!document.querySelector('.pad')`)
  await js(`document.querySelector('math-field.left__input').focus()`)
  await wait(150)
  await js(`[...document.querySelectorAll('.pad__key')].find(k => k.textContent === '√')?.click()`)
  await wait(250)
  await step('afterSqrt', `document.querySelector('math-field.left__input').getValue('latex')`)

  await js(`[...document.querySelectorAll('.pad__tab')].find(b => b.textContent === '希腊字母')?.click()`)
  await wait(200)
  await js(`[...document.querySelectorAll('.pad__key')].find(k => k.textContent === 'θ')?.click()`)
  await wait(250)
  await step('afterTheta', `document.querySelector('math-field.left__input').getValue('latex')`)

  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
  await wait(400)
  await js(`(() => {
    const row = [...document.querySelectorAll('.left__row')].find(r => r.textContent.includes('f1'));
    row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return !!row;
  })()`)
  await wait(400)
  await step('rightEditor', `!!document.querySelector('math-field.fexpr__input')`)

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'mathinput.png'), shot.toPNG())

  report.consoleErrors = logs.slice(0, 5)
  console.log('RESULT ' + JSON.stringify(report, null, 2))
  clearTimeout(watchdog)
  app.quit()
})
