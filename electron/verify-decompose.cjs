/** 正交分解端到端验证 */
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')

app.setPath('userData', path.join(os.tmpdir(), 'chordot-verify-decompose'))

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

  // 载入斜面示例
  await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
  await wait(150)
  await js(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('斜面受力')).click()`)
  await wait(800)

  await js(`
    window.__pickForce = (id) => {
      const g = document.querySelector('[data-id="' + id + '"]');
      if (!g) return false;
      const line = g.querySelector('line');
      const x = (+line.getAttribute('x1') + +line.getAttribute('x2')) / 2;
      const y = (+line.getAttribute('y1') + +line.getAttribute('y2')) / 2;
      g.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 }));
      return true;
    };
    window.__key = (key) => { window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); return true; };
    window.__decomp = () => [...document.querySelectorAll('[data-decomp]')].map(g => ({
      id: g.getAttribute('data-decomp'),
      arrows: g.querySelectorAll('line').length,
      labels: [...g.querySelectorAll('text')].map(t => t.textContent),
    }));
    window.__rows = () => [...document.querySelectorAll('.left__row .left__name')].map(n => n.textContent);
    true;
  `)

  const report = {}
  report.rowsBefore = await js(`window.__rows()`)

  /* G：竖直向下，只有 y 分量 */
  report.pickG = await js(`window.__pickForce('F_G')`)
  await wait(200)
  await js(`window.__key('d')`)
  await wait(300)
  report.afterG = await js(`window.__decomp()`)

  /* N：垂直斜面，两个分量 */
  report.pickN = await js(`window.__pickForce('F_N')`)
  await wait(200)
  await js(`window.__key('d')`)
  await wait(300)
  report.afterN = await js(`window.__decomp()`)

  /* 右栏：分解开关应处于开启态 */
  await js(`window.__key('p')`)
  await wait(350)
  report.switchState = await js(`(() => {
    const b = document.querySelector('.fitem__switch');
    return b ? { text: b.textContent, on: b.getAttribute('data-on') } : null;
  })()`)

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'decompose.png'), shot.toPNG())

  report.rowsAfter = await js(`window.__rows()`)

  /* 再按一次 D 收起 */
  await js(`window.__key('d')`)
  await wait(250)
  report.afterToggleOff = await js(`window.__decomp()`)

  /* 合力校验条：分量明细 */
  await js(`[...document.querySelectorAll('.netcheck__expand')][0]?.click()`)
  await wait(250)
  report.detail = await js(`document.querySelector('.netdetail')?.textContent ?? null`)

  console.log('RESULT ' + JSON.stringify(report, null, 2))
  app.quit()
}

app.whenReady().then(main).catch((e) => {
  console.error('VERIFY FAILED', e)
  app.quit()
})
