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

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-anno-')))
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
    /* ============ 1. 物理时间轴 ============ */
    await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
    await wait(150)
    await js(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('模板库')).click()`)
    await waitFor(`!!document.querySelector('.gallery')`)
    await wait(350)
    await js(`[...document.querySelectorAll('.gallery__main')].find(c => c.textContent.includes('物理世界')).click()`)
    await wait(1400)

    await step('timeline', `!!document.querySelector('.timeline')`)
    await step(
      'timelineLen',
      `(() => { const r = document.querySelector('.timeline__range'); return r ? { max: +r.max, value: +r.value } : null; })()`,
    )

    const zAt = `(() => { const sc = window.__state.doc.scene; return sc.kind === 'solid' ? +sc.params.shapes[0].center[2].toFixed(2) : null; })()`
    const z1 = await js(zAt)
    await js(`document.querySelector('.timeline__play').click()`)
    await wait(600)
    const z2 = await js(zAt)
    await wait(700)
    const z3 = await js(zAt)
    report.pause = { z1, z2, z3, playing: await js(`window.__state.physicsPlaying`) }

    await js(`(() => {
      const r = document.querySelector('.timeline__range');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(r, '0');
      r.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`)
    await wait(500)
    report.scrub = {
      z: await js(zAt),
      index: await js(`+document.querySelector('.timeline__range').value`),
      playing: await js(`window.__state.physicsPlaying`),
    }

    const shot2 = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, 'timeline.png'), shot2.toPNG())

    /* ============ 2. 画笔批注（三维场景 → screen 空间） ============ */
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }))`)
    await wait(300)
    await step('penActive', `window.__state.tool`)
    await step('penBar', `!!document.querySelector('.penbar')`)

    await js(`(() => {
      const svg = document.querySelector('.canvas__svg');
      const r = svg.getBoundingClientRect();
      const opt = (x, y) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 });
      const x0 = r.left + r.width / 2 - 60, y0 = r.top + 120;
      svg.dispatchEvent(new PointerEvent('pointerdown', opt(x0, y0)));
      for (let i = 1; i <= 10; i++) {
        svg.dispatchEvent(new PointerEvent('pointermove', opt(x0 + i * 12, y0 + Math.sin(i / 2) * 18)));
      }
      svg.dispatchEvent(new PointerEvent('pointerup', opt(x0 + 120, y0)));
      return true;
    })()`)
    await wait(400)
    await step(
      'strokes',
      `(() => (window.__state.doc.strokes ?? []).map(s => ({ space: s.space, n: s.points.length, mode: s.mode ?? 'pen' })))()`,
    )
    await step(
      'strokeEls',
      `document.querySelectorAll('[data-strokes] path, [data-strokes] circle').length`,
    )
    await step(
      'smooth',
      `document.querySelector('[data-strokes] path')?.getAttribute('d')?.includes('Q') ?? false`,
    )

    /* 先切回选择工具，再旋转相机（画笔状态下拖动是画线） */
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }))`)
    await wait(250)
    const firstPoint = `document.querySelector('[data-strokes] path')?.getAttribute('d')?.slice(0, 40) ?? null`
    const beforeRot = await js(firstPoint)
    await js(`(() => {
      const svg = document.querySelector('.canvas__svg');
      const r = svg.getBoundingClientRect();
      const opt = (x, y) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 5, isPrimary: true, pointerType: 'mouse', button: 0 });
      svg.dispatchEvent(new PointerEvent('pointerdown', opt(r.left + 40, r.top + 40)));
      svg.dispatchEvent(new PointerEvent('pointermove', opt(r.left + 140, r.top + 40)));
      svg.dispatchEvent(new PointerEvent('pointerup', opt(r.left + 140, r.top + 40)));
      return true;
    })()`)
    await wait(400)
    const afterRot = await js(firstPoint)
    report.screenFixed = {
      beforeRot,
      afterRot,
      azimuth: await js(`window.__state.doc.scene.params.camera.azimuth`),
    }

    /* ============ 3. 橡皮 ============ */
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }))`)
    await wait(300)
    await step('eraserActive', `window.__state.tool`)
    await step('strokesBeforeErase', `(window.__state.doc.strokes ?? []).length`)
    await js(`(() => {
      const st = (window.__state.doc.strokes ?? [])[0];
      if (!st) return 'no-stroke';
      const mid = st.points[Math.floor(st.points.length / 2)];
      const svg = document.querySelector('.canvas__svg');
      const r = svg.getBoundingClientRect();
      const opt = (x, y) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 6, isPrimary: true, pointerType: 'mouse', button: 0 });
      svg.dispatchEvent(new PointerEvent('pointerdown', opt(r.left + mid[0], r.top + mid[1])));
      svg.dispatchEvent(new PointerEvent('pointerup', opt(r.left + mid[0], r.top + mid[1])));
      return 'ok';
    })()`)
    await wait(400)
    await step('strokesAfterErase', `(window.__state.doc.strokes ?? []).length`)
    check(report.smooth === true, '笔迹没有平滑成曲线（d 里没有 Q）')
    check(
      report.strokesAfterErase < report.strokesBeforeErase,
      '橡皮单击没有擦掉批注',
    )

    /* ============ 4. 荧光笔 / 点一下成圆点 / 橡皮拖动连擦 ============ */
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }))`)
    await wait(250)
    await js(
      `[...document.querySelectorAll('.penbar__mode')].find(b => b.textContent.includes('荧光'))?.click()`,
    )
    await wait(200)
    await js(`(() => {
      const svg = document.querySelector('.canvas__svg');
      const r = svg.getBoundingClientRect();
      const opt = (x, y) => ({ bubbles: true, cancelable: true, clientX: r.left + x, clientY: r.top + y, pointerId: 7, isPrimary: true, pointerType: 'mouse', button: 0, buttons: 1 });
      svg.dispatchEvent(new PointerEvent('pointerdown', opt(300, 500)));
      for (let i = 1; i <= 8; i++) svg.dispatchEvent(new PointerEvent('pointermove', opt(300 + i * 14, 500)));
      svg.dispatchEvent(new PointerEvent('pointerup', opt(412, 500)));
      return true;
    })()`)
    await wait(350)
    report.marker = await js(`(() => {
      const s = (window.__state.doc.strokes ?? []).find(x => x.mode === 'marker');
      return s ? { width: s.width, mode: s.mode } : null;
    })()`)
    check(!!report.marker && report.marker.width > 6, '荧光笔没有按倍数加粗')
    check(
      (await js(
        `[...document.querySelectorAll('[data-strokes] path')].some(p => +p.getAttribute('stroke-opacity') < 1)`,
      )) === true,
      '荧光笔没有半透明效果',
    )

    /* 点一下 = 圆点 */
    await js(
      `[...document.querySelectorAll('.penbar__mode')].find(b => b.textContent === '笔')?.click()`,
    )
    await wait(150)
    await js(`(() => {
      const svg = document.querySelector('.canvas__svg');
      const r = svg.getBoundingClientRect();
      const opt = { bubbles: true, cancelable: true, clientX: r.left + 620, clientY: r.top + 520, pointerId: 8, isPrimary: true, pointerType: 'mouse', button: 0 };
      svg.dispatchEvent(new PointerEvent('pointerdown', opt));
      svg.dispatchEvent(new PointerEvent('pointerup', opt));
      return true;
    })()`)
    await wait(300)
    report.dot = await js(`document.querySelectorAll('[data-strokes] circle').length`)
    check(report.dot >= 1, '点一下没有留下圆点')

    /* 橡皮按住拖动：一笔擦不到，横向拖过去应该连擦多条 */
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }))`)
    await wait(250)
    const dragBefore = await js(`(window.__state.doc.strokes ?? []).length`)
    await js(`(() => {
      const svg = document.querySelector('.canvas__svg');
      const r = svg.getBoundingClientRect();
      const opt = (x, y) => ({ bubbles: true, cancelable: true, clientX: r.left + x, clientY: r.top + y, pointerId: 9, isPrimary: true, pointerType: 'mouse', button: 0, buttons: 1 });
      svg.dispatchEvent(new PointerEvent('pointerdown', opt(280, 500)));
      for (let x = 280; x <= 640; x += 16) svg.dispatchEvent(new PointerEvent('pointermove', opt(x, 500)));
      svg.dispatchEvent(new PointerEvent('pointerup', opt(640, 500)));
      return true;
    })()`)
    await wait(450)
    const dragAfter = await js(`(window.__state.doc.strokes ?? []).length`)
    report.dragErase = { before: dragBefore, after: dragAfter }
    check(dragAfter <= dragBefore - 1, '橡皮拖动没有连续擦除')

    const shot = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, 'annotate.png'), shot.toPNG())
  } catch (err) {
    report.fatal = String(err).split('\n')[0]
  }

  report.consoleErrors = errors.slice(0, 6)
  report.failures = failures
  console.log('RESULT ' + JSON.stringify(report, null, 2))
  clearTimeout(watchdog)
  app.quit()
})
