/** 触控：命中区放大、双指缩放、双指平移、中键平移 */
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-touch-')))

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const HELPERS = `
  window.__world = (wx, wy) => {
    const svg = document.querySelector('.canvas__svg');
    const rect = svg.getBoundingClientRect();
    const s = 40;
    return { x: rect.left + rect.width / 2 + wx * s, y: rect.top + rect.height / 2 + 40 - wy * s };
  };
  window.__tap = (wx, wy, type = 'touch') => {
    const svg = document.querySelector('.canvas__svg');
    const p = window.__world(wx, wy);
    const opt = { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, pointerId: 11, isPrimary: true, pointerType: type, button: 0 };
    const hit = document.elementFromPoint(p.x, p.y) || svg;
    hit.dispatchEvent(new PointerEvent('pointerdown', opt));
    hit.dispatchEvent(new PointerEvent('pointerup', opt));
    return true;
  };
  window.__pointX = (label) => {
    const g = [...document.querySelectorAll('[data-id]')].find(el => el.querySelector('text')?.textContent === label);
    const c = g?.querySelector('circle');
    return c ? Math.round(+c.getAttribute('cx')) : null;
  };
  window.__hitR = (label) => {
    const g = [...document.querySelectorAll('[data-id]')].find(el => el.querySelector('text')?.textContent === label);
    const circles = g ? [...g.querySelectorAll('circle')] : [];
    const hit = circles.find(c => c.getAttribute('fill') === 'transparent');
    return hit ? +hit.getAttribute('r') : null;
  };
  window.__pinch = async (from, to) => {
    const svg = document.querySelector('.canvas__svg');
    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const mk = (id, x, y) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: id, pointerType: 'touch', isPrimary: id === 1, button: 0 });
    svg.dispatchEvent(new PointerEvent('pointerdown', mk(1, cx - from, cy)));
    svg.dispatchEvent(new PointerEvent('pointerdown', mk(2, cx + from, cy)));
    for (let i = 1; i <= 6; i++) {
      const d = from + ((to - from) * i) / 6;
      svg.dispatchEvent(new PointerEvent('pointermove', mk(1, cx - d, cy)));
      svg.dispatchEvent(new PointerEvent('pointermove', mk(2, cx + d, cy)));
      await new Promise(r => setTimeout(r, 16));
    }
    svg.dispatchEvent(new PointerEvent('pointerup', mk(1, cx - to, cy)));
    svg.dispatchEvent(new PointerEvent('pointerup', mk(2, cx + to, cy)));
    await new Promise(r => setTimeout(r, 200));
    return true;
  };
  window.__twoFingerPan = async (dx) => {
    const svg = document.querySelector('.canvas__svg');
    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const mk = (id, x, y) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: id, pointerType: 'touch', isPrimary: id === 1, button: 0 });
    svg.dispatchEvent(new PointerEvent('pointerdown', mk(1, cx - 60, cy)));
    svg.dispatchEvent(new PointerEvent('pointerdown', mk(2, cx + 60, cy)));
    for (let i = 1; i <= 5; i++) {
      const d = (dx * i) / 5;
      svg.dispatchEvent(new PointerEvent('pointermove', mk(1, cx - 60 + d, cy)));
      svg.dispatchEvent(new PointerEvent('pointermove', mk(2, cx + 60 + d, cy)));
      await new Promise(r => setTimeout(r, 16));
    }
    svg.dispatchEvent(new PointerEvent('pointerup', mk(1, cx - 60 + dx, cy)));
    svg.dispatchEvent(new PointerEvent('pointerup', mk(2, cx + 60 + dx, cy)));
    await new Promise(r => setTimeout(r, 200));
    return true;
  };
  window.__middleDrag = async (dx) => {
    const svg = document.querySelector('.canvas__svg');
    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const mk = (x, y, btn) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 7, pointerType: 'mouse', button: btn, buttons: 1 });
    svg.dispatchEvent(new PointerEvent('pointerdown', mk(cx, cy, 1)));
    for (let i = 1; i <= 5; i++) svg.dispatchEvent(new PointerEvent('pointermove', mk(cx + (dx * i) / 5, cy, 1)));
    svg.dispatchEvent(new PointerEvent('pointerup', mk(cx + dx, cy, 1)));
    await new Promise(r => setTimeout(r, 200));
    return true;
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
  await js(HELPERS)

  const report = {}
  report.touchBefore = await js(`document.documentElement.dataset.touch`)

  /* 触摸放置两个点，命中区应放大 */
  await js(`document.querySelector('.toolbar [title="点"]').click()`)
  await js(`window.__tap(-2, 0)`)
  await wait(200)
  await js(`document.querySelector('.toolbar [title="点"]').click()`)
  await js(`window.__tap(2, 0)`)
  await wait(300)
  report.touchAfter = await js(`document.documentElement.dataset.touch`)
  report.hitRadius = await js(`window.__hitR('A')`)

  const x0 = await js(`window.__pointX('A')`)
  const x1 = await js(`window.__pointX('B')`)
  report.spreadBefore = Math.abs(x1 - x0)

  /* 双指放大 1.5 倍 */
  await js(`window.__pinch(80, 120)`)
  const x0b = await js(`window.__pointX('A')`)
  const x1b = await js(`window.__pointX('B')`)
  report.pinch = {
    before: report.spreadBefore,
    after: Math.abs(x1b - x0b),
    zoomed: Math.abs(x1b - x0b) > report.spreadBefore,
  }

  /* 双指平移 +120px */
  const before = await js(`window.__pointX('A')`)
  await js(`window.__twoFingerPan(120)`)
  const after = await js(`window.__pointX('A')`)
  report.twoFingerPan = { before, after, delta: after - before }

  /* 中键平移 -80px */
  const b2 = await js(`window.__pointX('A')`)
  await js(`window.__middleDrag(-80)`)
  const a2 = await js(`window.__pointX('A')`)
  report.middlePan = { before: b2, after: a2, delta: a2 - b2 }

  /* Ctrl+0 适配后应回到居中 */
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', ctrlKey: true, bubbles: true }))`)
  await wait(300)
  report.afterFit = await js(`window.__pointX('A')`)

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'touch-mode.png'), shot.toPNG())

  console.log('RESULT ' + JSON.stringify(report, null, 2))
  app.quit()
}

app.whenReady().then(main).catch((e) => {
  console.error('VERIFY FAILED', e)
  app.quit()
})
