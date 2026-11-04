/** 运动仿真端到端验证：播放 / 暂停 / 数值与解析解对照 */
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')

app.setPath('userData', path.join(os.tmpdir(), 'chordot-verify-sim'))

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

  // 载入「斜面下滑」示例
  await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
  await wait(150)
  await js(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('斜面下滑')).click()`)
  await wait(700)

  // 打开右栏并选中物块
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
  await wait(250)
  await js(`[...document.querySelectorAll('.left__row')].find(r => r.textContent.includes('物块')).dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
  await wait(250)

  const report = {}
  report.arrowBefore = await js(`(() => {
    const g = document.querySelector('[data-id="F_G"] line');
    return Math.round(Math.abs(+g.getAttribute('y2') - +g.getAttribute('y1')));
  })()`)

  // 切到运动仿真
  await js(`[...document.querySelectorAll('.segmented__btn')].find(b => b.textContent.includes('运动仿真')).click()`)
  await wait(300)
  report.panelBeforePlay = await js(`document.querySelector('.sim')?.textContent?.slice(0, 40) ?? null`)

  // 播放
  await js(`[...document.querySelectorAll('.sim__btn')].find(b => b.textContent === '播放').click()`)
  await wait(700)

  const readout = () =>
    js(`(() => {
      const rows = [...document.querySelectorAll('.sim__readout > div')];
      const out = {};
      for (const r of rows) {
        const [k, v] = [...r.children].map(c => c.textContent);
        out[k.trim()] = v.trim();
      }
      return out;
    })()`)

  report.playing = await readout()
  report.arrowPlaying = await js(`(() => {
    const g = document.querySelector('[data-id="F_G"] line');
    return Math.round(Math.abs(+g.getAttribute('y2') - +g.getAttribute('y1')));
  })()`)
  report.labelsPlaying = await js(
    `[...document.querySelectorAll('.canvas__svg text')].map(t => t.textContent).filter(t => t.includes('N'))`,
  )

  const shotPlaying = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'sim-playing.png'), shotPlaying.toPNG())

  // 暂停
  await js(`[...document.querySelectorAll('.sim__btn')].find(b => b.textContent === '暂停').click()`)
  await wait(400)
  report.labelsPaused = await js(
    `[...document.querySelectorAll('.canvas__svg text')].map(t => t.textContent).filter(t => t.includes('N'))`,
  )
  report.arrowPaused = await js(`(() => {
    const g = document.querySelector('[data-id="F_G"] line');
    return Math.round(Math.abs(+g.getAttribute('y2') - +g.getAttribute('y1')));
  })()`)
  report.paused = await readout()

  // 解析解对照：a = g(sinθ − μcosθ)
  const th = (40 * Math.PI) / 180
  const aAnalytic = 10 * (Math.sin(th) - 0.15 * Math.cos(th))
  const t = parseFloat(report.paused['时间 t'] ?? '0')
  const vAnalytic = aAnalytic * t // 大小；沿坡向上为正、下滑为负
  const vSim = parseFloat(report.paused['速度 v'] ?? 'NaN')
  report.analytic = {
    a: +aAnalytic.toFixed(3),
    v: +vAnalytic.toFixed(3),
    vSim,
    absDiff: +Math.abs(Math.abs(vSim) - vAnalytic).toFixed(3),
  }

  const shotPaused = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'sim-paused.png'), shotPaused.toPNG())

  console.log('RESULT ' + JSON.stringify(report, null, 2))
  app.quit()
}

app.whenReady().then(main).catch((e) => {
  console.error('VERIFY FAILED', e)
  app.quit()
})
