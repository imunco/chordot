const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')
fs.mkdirSync(outDir, { recursive: true })

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-feat-')))
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
    /* —— 1. 图形库 —— */
    await js(`document.querySelector('.toolbar [title="图形库（拖到画布）"]').click()`)
    await waitFor(`!!document.querySelector('.shapes')`)
    await wait(300)
    await step('shapeCards', `document.querySelectorAll('.shapes__card').length`)
    await js(`[...document.querySelectorAll('.shapes__card')].find(c => c.textContent.includes('物块')).click()`)
    await wait(600)
    await step('afterInsert', `(() => {
      const sc = window.__state.doc.scene;
      if (sc.kind !== 'sketch') return 'not-sketch';
      return { points: sc.doc.points.length, segments: sc.doc.segments.length, polygons: sc.doc.polygons.length, selected: window.__state.selected.length };
    })()`)
    await js(`[...document.querySelectorAll('.shapes__card')].find(c => c.textContent.includes('斜面')).click()`)
    await wait(600)
    await step('afterInsert2', `(() => {
      const sc = window.__state.doc.scene;
      return { points: sc.doc.points.length, polygons: sc.doc.polygons.length };
    })()`)

    const shotShapes = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, 'feat-shapes.png'), shotShapes.toPNG())

    /* —— 2. 多条曲线不同颜色 —— */
    const addExpr = async (tex) => {
      await js(`(() => {
        const mf = document.querySelector('math-field.left__input');
        const BS = String.fromCharCode(92);
        mf.focus();
        mf.value = ${JSON.stringify(tex)}.split('@').join(BS);
        mf.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        return mf.value;
      })()`)
      await wait(600)
    }
    await addExpr('@sin(x)')
    await addExpr('@cos(x)')
    await addExpr('0.5x')
    await step('curveColors', `(() => {
      const sc = window.__state.doc.scene;
      return sc.doc.functions.map(f => ({ expr: f.expr, color: f.color ?? null }));
    })()`)
    await step('curveObjs', `(() => window.__state.solution.curves ? Object.keys(window.__state.solution.curves) : [])()`)

    /* 坐标刻度 + 曲线标签 */
    await step('axisTicks', `(() => {
      const t = [...document.querySelectorAll('.canvas__ticks text')].map(x => x.textContent);
      return { count: t.length, hasOrigin: t.includes('O'), sample: t.slice(0, 5) };
    })()`)
    await step('curveLabels', `(() => {
      const svg = document.querySelector('svg.canvas__svg');
      const labels = [...svg.querySelectorAll('text')].filter(t => t.getAttribute('font-style') === 'italic');
      // 曲线现在采样到 ±48，整条折线的端点早跑出视口了：
      // 标签贴的是「最后一个可见点」，所以只在视口内的顶点里找最近距离
      const box = svg.getBoundingClientRect();
      const ends = [...svg.querySelectorAll('polyline')].flatMap(p => {
        const pts = (p.getAttribute('points') || '').trim().split(' ');
        return pts.map(s => s.split(',').map(Number)).filter(q => q[0] >= 0 && q[0] <= box.width && q[1] >= 0 && q[1] <= box.height);
      });
      return labels.map(l => {
        const x = +l.getAttribute('x'), y = +l.getAttribute('y');
        let best = 1e9;
        for (const e of ends) best = Math.min(best, Math.hypot(e[0] - x, e[1] - y));
        return { name: l.textContent, dist: +best.toFixed(1) };
      });
    })()`)
    if (!report.axisTicks || report.axisTicks.count < 8 || !report.axisTicks.hasOrigin) {
      console.error('VERIFY FAILED 坐标刻度缺失')
    }
    if (!Array.isArray(report.curveLabels) || report.curveLabels.length < 3) {
      console.error('VERIFY FAILED 曲线标签数量不对')
    } else {
      const far = report.curveLabels.filter((l) => l.dist > 12)
      if (far.length) console.error('VERIFY FAILED 曲线标签离曲线太远 ' + JSON.stringify(far))
    }

    /* —— 3. 左栏右键菜单：复制 —— */
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
    await wait(400)
    await step('rowsBefore', `document.querySelectorAll('.left__row').length`)
    await js(`(() => {
      const row = [...document.querySelectorAll('.left__row')].find(r => r.textContent.includes('f1'));
      const r = row.getBoundingClientRect();
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 40, clientY: r.y + 10 }));
      return true;
    })()`)
    await wait(300)
    await step('menuShown', `document.querySelector('.ctxmenu') ? [...document.querySelectorAll('.ctxmenu__item')].map(b => b.textContent.trim()) : null`)
    await step('menuColors', `document.querySelectorAll('.ctxmenu__swatch').length`)
    await js(`[...document.querySelectorAll('.ctxmenu__item')].find(b => b.textContent.includes('复制')).click()`)
    await wait(600)
    await step('afterDuplicate', `(() => {
      const sc = window.__state.doc.scene;
      return { functions: sc.doc.functions.length, names: sc.doc.functions.map(f => f.name), selected: window.__state.selected.length };
    })()`)

    /* —— 4. 右键删除 —— */
    await js(`(() => {
      const row = [...document.querySelectorAll('.left__row')].find(r => r.textContent.includes('f1′'));
      const r = row.getBoundingClientRect();
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 40, clientY: r.y + 10 }));
      return true;
    })()`)
    await wait(300)
    await js(`[...document.querySelectorAll('.ctxmenu__item')].find(b => b.textContent.includes('删除')).click()`)
    await wait(500)
    await step('afterDelete', `window.__state.doc.scene.doc.functions.length`)

    const shotMenu = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, 'feat-curves.png'), shotMenu.toPNG())

    /* —— 1b. 立体分页：拖入三维模型 —— */
    await js(`[...document.querySelectorAll('.shapes__tab')].find(b => b.textContent === '立体').click()`)
    await wait(300)
    await step('shape3dCards', `document.querySelectorAll('.shapes__card').length`)
    await step('shape3dPreview', `(() => {
      const svg = document.querySelector('.shapes__card svg');
      return svg ? svg.children.length : 0;
    })()`)
    await js(`[...document.querySelectorAll('.shapes__card')].find(c => c.textContent.includes('正方体')).click()`)
    await wait(800)
    await step('afterInsert3d', `(() => {
      const sc = window.__state.doc.scene;
      return sc.kind === 'solid' ? { kind: sc.kind, shapes: sc.params.shapes.length, name: sc.params.shapes[0]?.name } : { kind: sc.kind };
    })()`)
    await js(`[...document.querySelectorAll('.shapes__card')].find(c => c.textContent.includes('圆柱')).click()`)
    await wait(800)
    await step('afterInsert3d2', `(() => {
      const sc = window.__state.doc.scene;
      return sc.kind === 'solid' ? sc.params.shapes.map(s => s.name) : null;
    })()`)

    /* —— 5. 模板库数量 —— */
    await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
    await wait(150)
    await js(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('模板库')).click()`)
    await waitFor(`!!document.querySelector('.gallery')`)
    await wait(400)
    await step('templateCount', `document.querySelectorAll('.gallery__card').length`)
    await step('templateThumbs', `document.querySelectorAll('.gallery__card .thumb').length`)
    await js(`[...document.querySelectorAll('.gallery__tab')].find(b => b.textContent === '三维').click()`)
    await wait(350)
    await step('solidTemplates', `document.querySelectorAll('.gallery__card').length`)
    await js(`document.querySelector('.gallery .iconbtn[title="关闭"]').click()`)
    await wait(300)

    /* —— 6. 三维斜面 —— */
    await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
    await wait(150)
    await js(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('三维斜面受力')).click()`)
    await wait(1200)
    await step('incline3d', `(() => {
      const g = document.querySelector('[data-incline3d]');
      if (!g) return null;
      return {
        kind: window.__state.doc.scene.kind,
        forceLabels: [...g.querySelectorAll('text')].map(t => t.textContent),
        dashed: g.querySelectorAll('line[stroke-dasharray]').length,
        faces: g.querySelectorAll('polygon').length,
      };
    })()`)
    await js(`(() => {
      const input = [...document.querySelectorAll('.props__input')][0];
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '45');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      return true;
    })()`)
    await wait(700)
    await step('afterAngle', `(() => {
      const g = document.querySelector('[data-incline3d]');
      return { angle: window.__state.doc.scene.params.angleDeg, labels: [...g.querySelectorAll('text')].map(t => t.textContent) };
    })()`)

    const shot3d = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, 'feat-incline3d.png'), shot3d.toPNG())
  } catch (err) {
    report.fatal = String(err).split('\n')[0]
  }

  report.consoleErrors = errors.slice(0, 6)
  console.log('RESULT ' + JSON.stringify(report, null, 2))
  clearTimeout(watchdog)
  app.quit()
})
