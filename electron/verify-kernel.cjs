/** 内核端到端验证：真实窗口里切换示例、模拟拖动、读回几何与受力数值 */
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { pathToFileURL } = require('node:url')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')

// 独立 profile，避免继承上一次运行的 lastFile
app.setPath('userData', path.join(os.tmpdir(), 'chordot-verify-kernel'))

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
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.log('[renderer]', message)
  })

  await win.loadURL(process.env.VERIFY_URL || 'app://chordot/index.html?notour=1')

  const js = (code) => win.webContents.executeJavaScript(code, true)

  /** 轮询等待渲染进程进入某个状态 */
  const waitFor = async (expr, timeout = 12000) => {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      if (await js(expr)) return true
      await wait(120)
    }
    throw new Error(`等待超时: ${expr}`)
  }

  /** 打开 ⋯ 菜单并点中某一项，再等标题切换到位 */
  const clickMenuItem = async (label, expectFile) => {
    await waitFor(`!!document.querySelector('.toolbar__menu-anchor .tbtn')`)
    for (let i = 0; i < 8; i++) {
      const hit = await js(`(async () => {
        const btn = document.querySelector('.toolbar__menu-anchor .tbtn');
        if (document.querySelectorAll('.menu__item').length === 0) btn.click();
        await new Promise(r => setTimeout(r, 150));
        const item = [...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('${label}'));
        if (!item) return false;
        item.click();
        return true;
      })()`)
      if (hit) break
      await wait(250)
      if (i === 7) throw new Error(`菜单项未找到: ${label}`)
    }
    await waitFor(`document.querySelector('.titlebar__file')?.textContent.startsWith('${expectFile}')`)
    await wait(250)
  }

  const dragPoint = async (id, dx, dy) => {
    return js(`(async () => {
      const g = document.querySelector('[data-id="${id}"]');
      if (!g) return 'no-point';
      const svg = document.querySelector('.canvas__svg');
      const c = g.querySelector('circle');
      const r = c.getBoundingClientRect();
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      const opt = (cx, cy) => ({ bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0, buttons: 1 });
      g.dispatchEvent(new PointerEvent('pointerdown', opt(x, y)));
      for (let i = 1; i <= 6; i++) {
        svg.dispatchEvent(new PointerEvent('pointermove', opt(x + (${dx} * i) / 6, y + (${dy} * i) / 6)));
        await new Promise((r) => setTimeout(r, 16));
      }
      svg.dispatchEvent(new PointerEvent('pointerup', opt(x + ${dx}, y + ${dy})));
      return 'ok';
    })()`)
  }

  const report = {}

  /* —— 场景 1：约束三角形（planegcs / WASM） —— */
  await clickMenuItem('约束三角形', '约束三角形')
  await wait(900)

  const sides = () =>
    js(`(() => {
      const el = document.querySelector('[data-id="tri"] polygon');
      if (!el) return null;
      const pts = el.getAttribute('points').trim().split(/\\s+/).map(s => s.split(',').map(Number));
      const d = (a, b) => Math.hypot(pts[a][0]-pts[b][0], pts[a][1]-pts[b][1]) / 40;
      return { AB: +d(0,1).toFixed(3), BC: +d(1,2).toFixed(3), CA: +d(2,0).toFixed(3) };
    })()`)

  report.triangleBefore = await sides()
  report.dragC = await dragPoint('C', 70, -45)
  await wait(500)
  report.triangleAfter = await sides()
  report.triangleStatus = await js(`document.querySelector('.statusbar__left').textContent`)
  await js(`document.querySelectorAll('.left__row')[0]?.dispatchEvent(new MouseEvent('click',{bubbles:true}))`)

  const shot1 = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'kernel-triangle.png'), shot1.toPNG())

  /* —— 场景 2：斜面受力（拖动 B 改变倾角，N/f 实时变化） —— */
  await clickMenuItem('斜面受力', '斜面受力')
  await wait(700)

  const forces = () =>
    js(`(() => {
      const texts = [...document.querySelectorAll('.canvas__svg text')].map(t => t.textContent);
      const grab = (k) => { const t = texts.find(x => x.startsWith(k + ' = ')); return t ? t : null };
      return { G: grab('G'), N: grab('N'), f: grab('f'), scale: document.querySelector('.canvas__scale')?.textContent };
    })()`)

  report.inclineBefore = await forces()
  report.dragB = await dragPoint('B', -120, 40)
  await wait(500)
  report.inclineAfter = await forces()
  report.inclineStatus = await js(`document.querySelector('.statusbar__left').textContent`)

  // 撤销一次拖动：应回到 30°（N=26.0 / f=15.0）
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))`)
  await wait(400)
  report.afterUndo = await forces()

  // 再重做回来
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true }))`)
  await wait(400)
  report.afterRedo = await forces()

  // 打开右栏看合力校验条
  await js(`document.querySelectorAll('.left__row')[4]?.dispatchEvent(new MouseEvent('click',{bubbles:true}))`)
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
  await wait(400)
  report.netBar = await js(`document.querySelector('.netcheck')?.textContent ?? null`)

  const shot2 = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'kernel-incline.png'), shot2.toPNG())

  console.log('RESULT ' + JSON.stringify(report, null, 2))
  app.quit()
}

app.whenReady().then(main).catch((e) => {
  console.error('VERIFY FAILED', e)
  app.quit()
})
