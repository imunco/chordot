/** 旋转（二维手柄 / 属性按钮、三维三轴）与四边形纵横比锁定 */
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')
fs.mkdirSync(outDir, { recursive: true })

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-rot-')))
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const watchdog = setTimeout(() => {
  console.log('TIMEOUT')
  app.quit()
}, 120000)

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
    backgroundColor: '#FAFAF8',
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
  const failures = []
  const check = (ok, msg) => {
    if (ok) return
    failures.push(msg)
    console.log('VERIFY FAILED ' + msg)
  }
  const step = async (label, code) => {
    try {
      report[label] = await js(code)
    } catch (err) {
      report[label] = { error: String(err).split('\n')[0] }
    }
  }

  await wait(1800)
  try {
    /* ============ 1. 插入矩形，选中，出现旋转手柄 ============ */
    await js(`document.querySelector('.tbtn[title^="图形库"]').click()`)
    await waitFor(`!!document.querySelector('.shapes')`)
    await js(
      `[...document.querySelectorAll('.shapes__card')].find(c => c.textContent.includes('物块'))?.click()`,
    )
    await wait(700)
    await js(`document.querySelector('.tbtn[title^="图形库"]').click()`)
    await wait(300)

    await js(
      `[...document.querySelectorAll('.left__row')].find(r => r.textContent.includes('多边形'))?.click()`,
    )
    await wait(300)
    if (!(await js(`!!document.querySelector('.right')`))) {
      await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
      await wait(400)
    }

    await js(`(() => {
      window.__quad = () => {
        const d = window.__state.doc.scene.doc;
        const g = d.polygons[0];
        if (!g) return null;
        const pts = g.points.map((id) => d.points.find((p) => p.id === id));
        const side = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
        const dot = (a, b, c) => (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
        return {
          ratio: g.ratio ?? null,
          pts: pts.map((p) => [+p.x.toFixed(3), +p.y.toFixed(3)]),
          sides: [side(pts[0], pts[1]), side(pts[1], pts[2]), side(pts[2], pts[3]), side(pts[3], pts[0])],
          right: [dot(pts[0], pts[1], pts[2]), dot(pts[1], pts[2], pts[3])],
        };
      };
      window.__dragPoint = async (label, dx, dy) => {
        const g = [...document.querySelectorAll('[data-id]')].find((el) => el.querySelector('text')?.textContent === label);
        if (!g) return 'no-point';
        const c = g.querySelector('circle');
        const r = c.getBoundingClientRect();
        const x = r.x + r.width / 2, y = r.y + r.height / 2;
        const opt = (cx, cy) => ({ bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0, buttons: 1 });
        g.dispatchEvent(new PointerEvent('pointerdown', opt(x, y)));
        const svg = document.querySelector('.canvas__svg');
        for (let i = 1; i <= 6; i++) {
          svg.dispatchEvent(new PointerEvent('pointermove', opt(x + (dx * i) / 6, y + (dy * i) / 6)));
          await new Promise((r2) => setTimeout(r2, 24));
        }
        svg.dispatchEvent(new PointerEvent('pointerup', opt(x + dx, y + dy)));
        return 'ok';
      };
      return true;
    })()`)

    await step('handle', `!!document.querySelector('[data-rotate] circle')`)
    await step('panel', `({ quad: !!document.querySelector('.quadedit'), rot: !!document.querySelector('.rotedit') })`)
    check(report.handle === true, '选中对象后没有出现旋转手柄')
    check(report.panel && report.panel.rot === true, '右栏没有「旋转」区块')
    check(report.panel && report.panel.quad === true, '四边形没有「锁定纵横比」区块')

    const before = await js(`window.__quad()`)
    report.before = before

    /* ============ 2. 属性按钮 +90°：形状不变，方向转 90° ============ */
    await js(
      `[...document.querySelectorAll('.rotedit__btn')].find(b => b.textContent === '+90°')?.click()`,
    )
    await wait(450)
    const after90 = await js(`window.__quad()`)
    report.after90 = after90
    check(
      Math.abs(after90.sides[0] - before.sides[0]) < 0.01 &&
        Math.abs(after90.sides[1] - before.sides[1]) < 0.01,
      '旋转后边长变了（不是刚体旋转）',
    )
    const moved =
      Math.hypot(after90.pts[0][0] - before.pts[0][0], after90.pts[0][1] - before.pts[0][1]) > 0.5
    check(moved, '点了 +90° 但图形没动')

    /* ============ 3. 锁定纵横比后拖顶点：仍是矩形 ============ */
    await js(`document.querySelector('.quadedit .props__toggle')?.click()`)
    await wait(350)
    const locked = await js(`window.__quad()`)
    report.locked = locked
    check(typeof locked.ratio === 'number', '开关没有把 ratio 写进文档')

    await js(`window.__dragPoint('B', 160, -120)`)
    await wait(500)
    const dragged = await js(`window.__quad()`)
    report.afterLockedDrag = dragged
    const r = dragged.ratio
    const got = dragged.sides[0] / dragged.sides[1]
    check(Math.abs(dragged.right[0]) < 0.02 && Math.abs(dragged.right[1]) < 0.02, '锁定后拖动不是直角')
    check(Math.abs(got - r) < 0.02, `锁定后宽高比不对：期望 ${r}，实际 ${got.toFixed(3)}`)

    /* ============ 4. 解锁后拖动：允许变斜 ============ */
    await js(
      `[...document.querySelectorAll('.left__row')].find(r => r.textContent.includes('多边形'))?.click()`,
    )
    await wait(300)
    await js(`document.querySelector('.quadedit .props__toggle')?.click()`)
    await wait(300)
    check((await js(`window.__quad()`)).ratio === null, '关不掉纵横比锁定')
    await js(`window.__dragPoint('B', -50, 140)`)
    await wait(500)
    const free = await js(`window.__quad()`)
    report.afterFreeDrag = free
    check(Math.abs(free.right[0]) > 0.05, '解锁后拖动仍然被强行保持直角')

    /* ============ 5. 拖手柄旋转 ============ */
    await js(
      `[...document.querySelectorAll('.left__row')].find(r => r.textContent.includes('多边形'))?.click()`,
    )
    await wait(300)
    const beforeHandle = await js(`window.__quad()`)
    const hasHandle = await js(`!!document.querySelector('[data-rotate] circle')`)
    check(hasHandle, '重新选中后手柄没回来')
    await js(`(() => {
      const svg = document.querySelector('.canvas__svg');
      const c = document.querySelector('[data-rotate] circle');
      const r = c.getBoundingClientRect();
      const hx = r.x + r.width / 2, hy = r.y + r.height / 2;
      const opt = (x, y) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 4, isPrimary: true, pointerType: 'mouse', button: 0, buttons: 1 });
      c.dispatchEvent(new PointerEvent('pointerdown', opt(hx, hy)));
      for (let i = 1; i <= 8; i++) svg.dispatchEvent(new PointerEvent('pointermove', opt(hx + i * 16, hy + i * 5)));
      svg.dispatchEvent(new PointerEvent('pointerup', opt(hx + 128, hy + 40)));
      return true;
    })()`)
    await wait(500)
    const afterHandle = await js(`window.__quad()`)
    report.handleDrag = { before: beforeHandle.pts, after: afterHandle.pts }
    const movedByHandle =
      Math.hypot(
        afterHandle.pts[0][0] - beforeHandle.pts[0][0],
        afterHandle.pts[0][1] - beforeHandle.pts[0][1],
      ) > 0.2
    check(movedByHandle, '拖手柄没有旋转图形')

    const shot = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, 'rotate.png'), shot.toPNG())

    /* ============ 6. 三维：俯仰 / 翻滚 ============ */
    await win.loadURL('app://chordot/index.html?notour=1')
    await wait(1400)
    await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
    await wait(150)
    await js(
      `[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('正方体')).click()`,
    )
    await wait(1100)
    await js(`document.querySelector('.left__row')?.click()`)
    await wait(250)
    if (!(await js(`!!document.querySelector('.right')`))) {
      await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
      await wait(400)
    }
    const setField = (label, v) => `(() => {
      const row = [...document.querySelectorAll('.props__row')].find(r => r.querySelector('span')?.textContent === ${JSON.stringify(label)});
      const el = row?.querySelector('input');
      if (!el) return 'no-field';
      el.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(String(v))});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.blur();
      return 'ok';
    })()`
    report.labels3d = await js(
      `[...document.querySelectorAll('.props__row > span:first-child')].map(s => s.textContent)`,
    )
    check(
      report.labels3d.includes('俯仰') && report.labels3d.includes('翻滚'),
      '立体属性里没有俯仰 / 翻滚',
    )
    await js(setField('俯仰', 35))
    await wait(400)
    const rot = await js(
      `window.__state.doc.scene.params.shapes[0].rotation?.map(v => +v.toFixed(3)) ?? null`,
    )
    report.rotation3d = rot
    check(!!rot && Math.abs(rot[1] - Math.sin((35 / 2) * (Math.PI / 180))) < 0.02, '俯仰没有写进四元数')
  } catch (err) {
    report.fatal = String(err).split('\n')[0]
  }

  report.consoleErrors = errors.slice(0, 6)
  report.failures = failures
  console.log('RESULT ' + JSON.stringify(report, null, 2))
  clearTimeout(watchdog)
  app.quit()
})
