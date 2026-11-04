/** 通用动力学（单摆 / 弹簧 / 抛体）验证：每个模型独立加载，避免状态串味 */
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-motion-')))

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const HELPERS = `
  window.__read = () => {
    const rows = [...document.querySelectorAll('.sim__readout > div')];
    const out = {};
    for (const r of rows) { const [k, v] = [...r.children].map(c => c.textContent); out[k.trim()] = v.trim(); }
    return out;
  };
  window.__openTemplate = async (name) => {
    document.querySelector('.toolbar__menu-anchor .tbtn').click();
    await new Promise(r => setTimeout(r, 150));
    [...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('模板库')).click();
    await new Promise(r => setTimeout(r, 450));
    [...document.querySelectorAll('.gallery__main')].find(c => c.textContent.includes(name)).click();
    await new Promise(r => setTimeout(r, 650));
    return document.querySelector('.titlebar__file').textContent;
  };
  window.__ready = async (rowName) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    [...document.querySelectorAll('.left__row')].find(r => r.textContent.includes(rowName))?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    [...document.querySelectorAll('.segmented__btn')].find(b => b.textContent.includes('运动仿真'))?.click();
    await new Promise(r => setTimeout(r, 250));
    return !!document.querySelector('.sim');
  };
  window.__play = async (ms) => {
    [...document.querySelectorAll('.sim__btn')].find(b => b.textContent === '播放')?.click();
    await new Promise(r => setTimeout(r, ms));
    [...document.querySelectorAll('.sim__btn')].find(b => b.textContent === '暂停')?.click();
    await new Promise(r => setTimeout(r, 250));
    return window.__read();
  };
  true;
`

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

  const js = (code) => win.webContents.executeJavaScript(code, true)
  const load = async () => {
    await win.loadURL(process.env.VERIFY_URL || 'app://chordot/index.html?notour=1')
    await wait(800)
    await js(HELPERS)
  }

  const report = {}

  /* —— 单摆：无阻尼时总能量守恒 —— */
  await load()
  report.pendulumFile = await js(`window.__openTemplate('单摆')`)
  report.pendulumReady = await js(`window.__ready('摆球')`)
  report.pendulum = await js(`window.__play(1400)`)
  report.pendulumTrail = await js(`!!document.querySelector('[data-id="trail"]')`)

  const E0 = 1 * 10 * 2.4 * (1 - Math.cos((40 * Math.PI) / 180))
  const E1 = parseFloat(report.pendulum['总能量 E'] ?? '0')
  report.energy = { E0: +E0.toFixed(3), E1, drift: +(Math.abs(E1 - E0) / E0).toFixed(4) }
  const shotPend = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'motion-pendulum.png'), shotPend.toPNG())

  /* —— 弹簧振子：总能量 = ½kA² = 40 J —— */
  await load()
  report.springFile = await js(`window.__openTemplate('弹簧振子')`)
  report.springReady = await js(`window.__ready('滑块')`)
  report.spring = await js(`window.__play(900)`)
  const Espring = parseFloat(report.spring['总能量 E'] ?? '0')
  report.springEnergy = { expected: 40, actual: Espring, diff: +Math.abs(Espring - 40).toFixed(3) }
  const tSpring = parseFloat(report.spring['时间 t'] ?? '0')
  report.springX = {
    t: tSpring,
    sim: parseFloat(report.spring['位移 x'] ?? 'NaN'),
    analytic: +(2 * Math.cos(Math.sqrt(20) * tSpring)).toFixed(3),
  }

  /* —— 抛体：落地后停住 —— */
  await load()
  report.projectileFile = await js(`window.__openTemplate('平抛')`)
  report.projectileReady = await js(`window.__ready('小球')`)
  report.projectile = await js(`window.__play(2000)`)
  report.projectileTrail = await js(`!!document.querySelector('[data-id="trail"]')`)
  const shotProj = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'motion-projectile.png'), shotProj.toPNG())

  console.log('RESULT ' + JSON.stringify(report, null, 2))
  app.quit()
}

app.whenReady().then(main).catch((e) => {
  console.error('VERIFY FAILED', e)
  app.quit()
})
