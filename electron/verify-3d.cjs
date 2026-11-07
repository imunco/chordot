/** 三维：固定视角 / 轨道旋转 / 滚轮缩放 验证 */
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')

app.setPath('userData', path.join(os.tmpdir(), 'chordot-verify-3d'))

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

  await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
  await wait(150)
  await js(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('正方体')).click()`)
  await wait(800)

  await js(`
    window.__face = () => document.querySelector('[data-id="s1"] polygon')?.getAttribute('points') ?? null;
    window.__faceCount = () => document.querySelectorAll('[data-id="s1"] polygon').length;
    window.__ys = () => [...document.querySelectorAll('[data-id="s1"] circle')].map(c => +c.getAttribute('cy'));
    window.__view = () => [...document.querySelectorAll('.canvas__view')].map(b => ({ label: b.textContent, active: b.getAttribute('data-active') }));
    window.__clickView = (label) => { [...document.querySelectorAll('.canvas__view')].find(b => b.textContent === label)?.click(); return true; };
    window.__orbit = async (dx, dy) => {
      const svg = document.querySelector('.canvas__svg');
      const r = svg.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2 + 120;
      const opt = (cx, cy) => ({ bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0, buttons: 1 });
      svg.dispatchEvent(new PointerEvent('pointerdown', opt(x, y)));
      for (let i = 1; i <= 6; i++) {
        svg.dispatchEvent(new PointerEvent('pointermove', opt(x + (dx * i) / 6, y + (dy * i) / 6)));
        await new Promise(r2 => setTimeout(r2, 16));
      }
      svg.dispatchEvent(new PointerEvent('pointerup', opt(x + dx, y + dy)));
      return true;
    };
    window.__wheel = (deltaY) => {
      const svg = document.querySelector('.canvas__svg');
      svg.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY }));
      return true;
    };
    true;
  `)

  const report = {}
  const failures = []
  const check = (ok, msg) => {
    if (ok) return
    failures.push(msg)
    console.log('VERIFY FAILED ' + msg)
  }
  report.views = await js(`window.__view()`)
  report.faces = await js(`window.__faceCount()`)
  report.leftRows = await js(`[...document.querySelectorAll('.left__row .left__name')].map(n => n.textContent)`)

  const shotIso = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'solid-iso.png'), shotIso.toPNG())

  const p0 = await js(`window.__face()`)

  /* 正视图 + 透视：近大远小，前后两层顶点投影高度不同 */
  await js(`window.__clickView('正')`)
  await wait(350)
  report.perspDefault = await js(`document.querySelector('.canvas__view[title^="切换透视"]').getAttribute('data-active')`)
  const ysPersp = await js(`window.__ys()`)
  report.frontPerspective = {
    distinctY: [...new Set(ysPersp.map((y) => Math.round(y)))].length,
  }

  /* 关掉透视 → 正交：8 个顶点应只剩两个高度 */
  await js(`document.querySelector('.canvas__view[title^="切换透视"]').click()`)
  await wait(350)
  const ys = await js(`window.__ys()`)
  const uniq = [...new Set(ys.map((y) => Math.round(y)))]
  report.frontOrtho = { distinctY: uniq.length, ys: uniq.slice(0, 6) }
  report.perspOff = await js(`document.querySelector('.canvas__view[title^="切换透视"]').getAttribute('data-active')`)
  report.faceChangedByView = (await js(`window.__face()`)) !== p0

  const shotFront = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'solid-front.png'), shotFront.toPNG())

  /* 轨道旋转 */
  const beforeOrbit = await js(`window.__face()`)
  await js(`window.__orbit(120, 40)`)
  await wait(400)
  report.orbitChanged = (await js(`window.__face()`)) !== beforeOrbit
  report.viewAfterOrbit = await js(`window.__view()`)

  /* 滚轮缩放：顶点应向外扩 */
  const spread = () =>
    js(`(() => {
      const ys = window.__ys();
      return Math.round(Math.max(...ys) - Math.min(...ys));
    })()`)
  const s1 = await spread()
  await js(`window.__wheel(-240)`)
  await wait(300)
  const s2 = await spread()
  report.zoom = { before: s1, after: s2, grew: s2 > s1 }

  const shotOrbit = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'solid-orbit.png'), shotOrbit.toPNG())

  /* ── 材质 / 贴图：面用 pattern 填，纹理矩阵跟着 UV 走 ── */
  await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'p',bubbles:true}))`)
  await wait(400)
  const setField = (label, value, kind = 'select') =>
    js(`(() => {
      const row=[...document.querySelectorAll('.props__row')].find(r=>r.textContent.startsWith(${JSON.stringify(label)}));
      if(!row) return false;
      const el=row.querySelector(${kind === 'select' ? "'select'" : "'input'"});
      if(!el) return false;
      const proto=${kind === 'select' ? 'HTMLSelectElement' : 'HTMLInputElement'}.prototype;
      const set=Object.getOwnPropertyDescriptor(proto,'value').set;
      el.focus(); set.call(el,${JSON.stringify(String(value))});
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
      if (${kind === 'select' ? 'false' : 'true'}) el.blur();
      return true
    })()`)

  report.hasMaterialField = await setField('材质', 'wood')
  check(report.hasMaterialField, '右栏没有「材质」字段')
  await wait(500)
  report.texture = await js(`(() => {
    const g=document.querySelector('[data-id="s1"]');
    const pats=[...g.querySelectorAll('pattern')];
    const fills=[...g.querySelectorAll('polygon')].map(p=>p.getAttribute('fill')||'').filter(f=>f.startsWith('url(#tx-'));
    return {
      patterns:pats.length,
      texturedFills:fills.length,
      matrix:pats[0]?.getAttribute('patternTransform') ?? null,
      woodLine:pats[0] ? !!pats[0].querySelector('path') : false,
    }
  })()`)
  check(report.texture.patterns >= 3, `材质没有生成纹理图案（${report.texture.patterns}）`)
  check(report.texture.texturedFills >= 3, `面没有用纹理填充（${report.texture.texturedFills}）`)
  check(String(report.texture.matrix).startsWith('matrix('), `纹理没有按 UV 贴到面上（${report.texture.matrix}）`)
  const shotWood = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'solid-wood.png'), shotWood.toPNG())

  /* ── 旋转后落地：俯仰 35°，中心抬到最低点贴地 ── */
  const zBefore = await js(`(() => {
    const row=[...document.querySelectorAll('.props__row')].find(r=>r.textContent.startsWith('高度'));
    return Number(row?.querySelector('input')?.value)
  })()`)
  await setField('俯仰', '35', 'number')
  await wait(600)
  const zAfter = await js(`(() => {
    const row=[...document.querySelectorAll('.props__row')].find(r=>r.textContent.startsWith('高度'));
    return Number(row?.querySelector('input')?.value)
  })()`)
  report.grounded = { before: zBefore, after: zAfter, expect: +(zBefore * (Math.cos(35 * Math.PI / 180) + Math.sin(35 * Math.PI / 180))).toFixed(2) }
  check(zAfter > zBefore + 0.5, `俯仰后中心没有抬起来（${zBefore} → ${zAfter}）`)
  check(Math.abs(zAfter - report.grounded.expect) < 0.05, `抬升高度不对（${zAfter} ≠ ${report.grounded.expect}）`)
  const shotTilt = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'solid-tilt.png'), shotTilt.toPNG())

  report.failures = failures
  console.log('RESULT ' + JSON.stringify(report, null, 2))
  app.quit()
}

app.whenReady().then(main).catch((e) => {
  console.error('VERIFY FAILED', e)
  app.quit()
})
