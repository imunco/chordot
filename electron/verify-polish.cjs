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

/* 预置两个模板包，用于批量导入 */
const packA = path.join(outDir, 'pack-a.chordotpack')
const packB = path.join(outDir, 'pack-b.chordotpack')
const mkPack = (id, name) =>
  JSON.stringify({
    app: 'chordot-pack',
    version: 1,
    exportedAt: new Date().toISOString(),
    templates: [
      {
        id,
        name,
        category: '数学',
        hint: '批量导入测试',
        file: `${name}.chordot`,
        createdAt: Date.now(),
        scene: {
          kind: 'sketch',
          doc: { points: [], segments: [], circles: [], polygons: [], functions: [], constraints: [] },
        },
      },
    ],
  })
fs.writeFileSync(packA, mkPack('imp-a', '包甲模板'), 'utf8')
fs.writeFileSync(packB, mkPack('imp-b', '包乙模板'), 'utf8')
process.env.CHORDOT_TEST_PACK_OPEN = `${packA};${packB}`

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-polish-')))
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const watchdog = setTimeout(() => {
  console.log('TIMEOUT')
  app.quit()
}, 90000)

const HELPERS = `
  window.__dragOrigin = null;
  window.__dragDown = (label) => {
    const g = [...document.querySelectorAll('[data-id]')].find(el => el.querySelector('text')?.textContent === label);
    if (!g) return 'no-group';
    const c = g.querySelector('circle');
    const r = c.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    window.__dragOrigin = { x, y };
    const opt = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 };
    g.dispatchEvent(new PointerEvent('pointerdown', opt));
    return 'ok';
  };
  window.__dragMove = (dx, dy) => {
    const o = window.__dragOrigin;
    if (!o) return 'no-origin';
    const svg = document.querySelector('.canvas__svg');
    const opt = { bubbles: true, cancelable: true, clientX: o.x + dx, clientY: o.y + dy, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 };
    svg.dispatchEvent(new PointerEvent('pointermove', opt));
    return 'ok';
  };
  window.__dragUp = (dx, dy) => {
    const o = window.__dragOrigin;
    if (!o) return 'no-origin';
    const svg = document.querySelector('.canvas__svg');
    const opt = { bubbles: true, cancelable: true, clientX: o.x + dx, clientY: o.y + dy, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 };
    svg.dispatchEvent(new PointerEvent('pointerup', opt));
    window.__dragOrigin = null;
    return 'ok';
  };
  window.__labelBoxes = () => [...document.querySelectorAll('text[data-plabel]')].map(t => {
    const r = t.getBoundingClientRect();
    return { id: t.getAttribute('data-plabel'), text: t.textContent, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
  'ok';
`

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
  /* —— 1. 模板库：缩略图 + 二级分类 —— */
  await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
  await wait(150)
  await js(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('模板库')).click()`)
  await waitFor(`!!document.querySelector('.gallery')`)
  await wait(400)

  await step('cards', `document.querySelectorAll('.gallery__card').length`)
  await step('thumbs', `document.querySelectorAll('.gallery__card .thumb').length`)
  await step('emptyThumbs', `[...document.querySelectorAll('.gallery__card')].filter(c => c.querySelector('.thumb--empty')).map(c => c.querySelector('.gallery__name')?.textContent)`)
  await step(
    'thumbNonEmpty',
    `[...document.querySelectorAll('.gallery__card .thumb')].filter(t => t.tagName.toLowerCase() === 'svg' && t.children.length > 0).length`,
  )

  await js(`[...document.querySelectorAll('.gallery__tab')].find(b => b.textContent === '数学').click()`)
  await wait(300)
  await step('subTabs', `[...document.querySelectorAll('.gallery__subtab')].map(b => b.textContent)`)
  await step('mathCount', `document.querySelectorAll('.gallery__card').length`)

  await js(`[...document.querySelectorAll('.gallery__subtab')].find(b => b.textContent === '三角函数').click()`)
  await wait(300)
  await step('trigNames', `[...document.querySelectorAll('.gallery__name')].map(n => n.textContent)`)

  /* —— 2. 批量导入两个包 —— */
  await js(`[...document.querySelectorAll('.gallery__tab')].find(b => b.textContent === '全部').click()`)
  await wait(250)
  await js(`[...document.querySelectorAll('.gallery__save')].find(b => b.textContent === '导入').click()`)
  await wait(1200)
  await step('importFlash', `document.querySelector('.gallery__flash')?.textContent ?? null`)
  await js(`[...document.querySelectorAll('.gallery__tab')].find(b => b.textContent === '自定义').click()`)
  await wait(300)
  await step('customNames', `[...document.querySelectorAll('.gallery__name')].map(n => n.textContent)`)
  await step('customEmpty', `document.querySelector('.gallery__empty')?.textContent ?? null`)
  await step('customTabs', `[...document.querySelectorAll('.gallery__tab')].map(b => b.textContent)`)

  const shotCustom = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'polish-gallery-custom.png'), shotCustom.toPNG())

  await js(`[...document.querySelectorAll('.gallery__tab')].find(b => b.textContent === '全部').click()`)
  await wait(400)
  const shotGallery = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'polish-gallery.png'), shotGallery.toPNG())

  /* —— 3. 增量重算：正八边形拖动一个点 —— */
  await step('clickGeo', `(() => { const b = [...document.querySelectorAll('.gallery__tab')].find(b => b.textContent === '几何'); if (!b) return 'no-tab'; b.click(); return 'ok'; })()`)
  await wait(250)
  await step('geoCount', `document.querySelectorAll('.gallery__card').length`)
  await step('clickOctagon', `(() => { const c = [...document.querySelectorAll('.gallery__main')].find(c => c.textContent.includes('正八边形')); if (!c) return 'no-card'; c.click(); return 'ok'; })()`)
  await wait(900)
  await step('file', `document.querySelector('.titlebar__file')?.textContent ?? null`)
  await js(HELPERS)

  await step('statsAfterLoad', `window.__buildStats ?? null`)
  await step('p1Before', `(() => { const sc = window.__state.doc.scene; return sc.kind === 'sketch' ? sc.doc.points[0] : null; })()`)
  await step('dragDown', `window.__dragDown('A')`)
  await wait(150)
  await step('dragMove1', `window.__dragMove(10, -7)`)
  await wait(80)
  await step('dragMove2', `window.__dragMove(22, -14)`)
  await wait(80)
  await step('dragMove3', `window.__dragMove(30, -20)`)
  await wait(120)
  await step('dragUp', `window.__dragUp(30, -20)`)
  await wait(700)
  await step('statsAfterDrag', `window.__buildStats ?? null`)
  await step('p1After', `(() => { const sc = window.__state.doc.scene; return sc.kind === 'sketch' ? sc.doc.points[0] : null; })()`)
  await step('labelCount', `document.querySelectorAll('text[data-plabel]').length`)

  /* —— 4. 标签不重叠 —— */
  await step(
    'labelOverlaps',
    `(() => {
      const boxes = window.__labelBoxes();
      const bad = [];
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
            bad.push([a.text, b.text]);
          }
        }
      }
      return { total: boxes.length, overlaps: bad };
    })()`,
  )

  const shotCanvas = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'polish-labels.png'), shotCanvas.toPNG())

  } catch (err) {
    report.fatal = String(err).split('\n')[0]
  }
  console.log('RESULT ' + JSON.stringify(report, null, 2))
  clearTimeout(watchdog)
  app.quit()
})
