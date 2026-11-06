/**
 * 底部工具坞：位置、批注条、菜单方向、触控尺寸、窄窗口不溢出
 *
 * 学校一体机的可及区在屏幕下半屏，所以主工具栏与批注都在底部。
 * 这套脚本守住四件事：
 *   1. 工具栏在画布下方、状态栏上方
 *   2. 进入批注不改变画布尺寸（画面不跳）
 *   3. 菜单向上弹、不超出窗口
 *   4. 1024 / 820 宽不溢出
 */
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-dock-')))

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

let failed = 0
function check(ok, msg) {
  if (!ok) {
    failed += 1
    console.error('VERIFY FAILED ' + msg)
  }
}

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
  const rect = (sel) =>
    js(`(() => {
      const el = document.querySelector('${sel}');
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), bottom: Math.round(b.bottom) };
    })()`)
  const shot = async (name) => {
    const img = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, name), img.toPNG())
  }
  const strokes = () => js(`(window.__state.doc.strokes ?? []).length`)

  await waitFor(`!!document.querySelector('.toolbar')`)
  await wait(400)

  const report = {}

  /* ───── 1. 位置：画布 → 工具坞 → 状态栏 ───── */
  report.canvas = await rect('.canvas')
  report.toolbar = await rect('.toolbar')
  report.status = await rect('.statusbar')
  report.btnH = await js(`Math.round(document.querySelector('.tbtn').getBoundingClientRect().height)`)
  report.labelCount = await js(`document.querySelectorAll('.tbtn__label').length`)
  report.inkCenter = await js(`(() => {
    const b = document.querySelector('.toolbar__ink').getBoundingClientRect();
    return Math.round((b.left + b.right) / 2);
  })()`)
  report.winCenter = await js(`Math.round(innerWidth / 2)`)

  check(report.toolbar.y >= report.canvas.bottom - 1, '工具栏没有落在画布下方')
  check(
    report.status.y >= report.toolbar.y + report.toolbar.h - 1,
    '状态栏没有落在工具栏下方',
  )
  check(report.btnH >= 48, `工具栏按钮太矮，手指点不准：${report.btnH}px`)
  check(report.labelCount >= 10, `带中文标签的工具太少：${report.labelCount}`)
  check(
    Math.abs(report.inkCenter - report.winCenter) < 40,
    `批注组不在屏幕中线：${report.inkCenter} vs ${report.winCenter}`,
  )
  await shot('dock-main.png')

  /* ───── 2. 批注模式：同一行替换，画布不跳 ───── */
  await js(`document.querySelector('.toolbar [title="画笔批注 B"]').click()`)
  await wait(350)
  report.pen = {
    penbar: await js(`!!document.querySelector('.penbar')`),
    toolbarGone: await js(`!document.querySelector('.toolbar')`),
    canvas: await rect('.canvas'),
    height: (await rect('.penbar'))?.h,
  }
  report.noShift =
    Math.abs(report.pen.canvas.h - report.canvas.h) <= 1 &&
    Math.abs(report.pen.canvas.y - report.canvas.y) <= 1
  check(report.pen.penbar, '进入批注后没有出现批注条')
  check(report.pen.toolbarGone, '进入批注后主工具栏还占着位置')
  check(report.noShift, `进入批注后画布跳了：${JSON.stringify({ before: report.canvas, after: report.pen.canvas })}`)
  check(
    Math.abs((report.pen.height ?? 0) - report.toolbar.h) <= 1,
    `批注条高度与工具栏不一致：${report.pen.height} vs ${report.toolbar.h}`,
  )

  /* ───── 3. 快捷色：10 色，点一个能写进状态 ───── */
  report.colorCount = await js(`document.querySelectorAll('.penbar__swatch').length`)
  await js(`document.querySelector('.penbar__swatch[data-color="#4f8a3d"]').click()`)
  await wait(220)
  report.colorPick = {
    state: await js(`window.__state.penColor`),
    active: await js(
      `document.querySelector('.penbar__swatch[data-active="true"]')?.dataset.color ?? null`,
    ),
  }
  check(report.colorCount >= 10, `批注快捷色太少：${report.colorCount} 色`)
  check(report.colorPick.state === '#4f8a3d', `点色块没有改画笔颜色：${report.colorPick.state}`)
  check(report.colorPick.active === '#4f8a3d', '选中的色块没有高亮')

  /* ───── 3b. 更多颜色：色盘浮层里能选到快捷色以外的纯色 ───── */
  await js(`document.querySelector('.penbar__more').click()`)
  await wait(300)
  report.palette = await js(`(() => {
    const p = document.querySelector('.colorpal');
    if (!p) return null;
    const b = p.getBoundingClientRect();
    const dock = document.querySelector('.dock').getBoundingClientRect();
    return {
      open: true,
      swatches: p.querySelectorAll('.colorpal__swatch').length,
      aboveDock: b.bottom <= dock.top + 2,
      inView: b.top >= 0 && b.left >= 0 && b.right <= innerWidth,
    };
  })()`)
  check(!!report.palette, '「更多颜色」没有打开色盘')
  check((report.palette?.swatches ?? 0) >= 24, `色盘颜色太少：${report.palette?.swatches}`)
  check(report.palette?.aboveDock, '色盘没有浮在底栏上方')
  check(report.palette?.inView, '色盘超出窗口')
  await shot('dock-palette.png')
  await js(`document.querySelector('.colorpal__swatch[data-color="#2f8a7a"]').click()`)
  await wait(250)
  report.palettePick = {
    state: await js(`window.__state.penColor`),
    closed: await js(`!document.querySelector('.colorpal')`),
  }
  check(report.palettePick.state === '#2f8a7a', `色盘里的纯色没选中：${report.palettePick.state}`)
  check(report.palettePick.closed, '选完颜色色盘没有收起')

  /* ───── 4. 笔型切换 ───── */
  await js(`[...document.querySelectorAll('.penbar__mode')].find(b => b.textContent.includes('荧光')).click()`)
  await wait(200)
  report.marker = await js(`window.__state.penMode`)
  await js(`[...document.querySelectorAll('.penbar__mode')].find(b => b.textContent === '笔').click()`)
  await wait(150)
  report.penMode = await js(`window.__state.penMode`)
  await js(`[...document.querySelectorAll('.penbar__mode')].find(b => b.textContent.includes('橡皮')).click()`)
  await wait(200)
  report.eraser = {
    tool: await js(`window.__state.tool`),
    hint: await js(`!!document.querySelector('.penbar__hint')`),
    colorsHidden: await js(`!document.querySelector('.penbar__colors')`),
  }
  await js(`[...document.querySelectorAll('.penbar__mode')].find(b => b.textContent === '笔').click()`)
  await wait(200)
  report.backToPen = await js(`window.__state.tool`)

  check(report.marker === 'marker', '荧光笔没有切到 marker')
  check(report.penMode === 'pen', '切回普通笔失败')
  check(report.eraser.tool === 'eraser', '橡皮按钮没有切到橡皮')
  check(report.eraser.hint, '橡皮模式没有操作提示')
  check(report.backToPen === 'pen', '从橡皮切回画笔失败')
  await shot('dock-penbar.png')

  /* ───── 5. 清空要点两次，且可撤销 ───── */
  await js(`(() => {
    const svg = document.querySelector('.canvas__svg');
    const r = svg.getBoundingClientRect();
    const o = (x, y) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0, buttons: 1 });
    svg.dispatchEvent(new PointerEvent('pointerdown', o(r.left + 320, r.top + 300)));
    for (let i = 1; i <= 6; i++) svg.dispatchEvent(new PointerEvent('pointermove', o(r.left + 320 + i * 10, r.top + 300 + i * 4)));
    svg.dispatchEvent(new PointerEvent('pointerup', o(r.left + 380, r.top + 324)));
    return true;
  })()`)
  await wait(400)
  report.strokesBefore = await strokes()

  await js(`document.querySelector('.penbar__clear').click()`)
  await wait(200)
  report.armed = {
    strokes: await strokes(),
    text: await js(`document.querySelector('.penbar__clear').textContent`),
    confirm: await js(`document.querySelector('.penbar__clear').dataset.confirm`),
  }
  await js(`document.querySelector('.penbar__clear').click()`)
  await wait(350)
  report.cleared = await strokes()
  await js(`document.querySelector('.penbar [title^="撤销"]').click()`)
  await wait(350)
  report.restored = await strokes()

  check(report.strokesBefore >= 1, '画笔没有产生笔迹')
  check(report.armed.strokes === report.strokesBefore, '第一次点「清空」就把笔迹清了')
  check(report.armed.text.includes('再点一次'), '第一次点「清空」没有进入确认态')
  check(report.cleared === 0, `第二次点「清空」没有清空：${report.cleared}`)
  check(report.restored === report.strokesBefore, '清空后撤销没有恢复')

  /* ───── 6. 完成 → 回主工具栏 ───── */
  await js(`document.querySelector('.penbar__done').click()`)
  await wait(300)
  report.done = {
    tool: await js(`window.__state.tool`),
    toolbarBack: await js(`!!document.querySelector('.toolbar')`),
  }
  check(report.done.tool === 'select', '「完成」没有回到选择工具')
  check(report.done.toolbarBack, '「完成」后主工具栏没有回来')

  /* ───── 7. 更多菜单向上弹、不超出窗口 ───── */
  await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
  await wait(300)
  report.menu = await js(`(() => {
    const m = document.querySelector('.menu');
    if (!m) return null;
    const b = m.getBoundingClientRect();
    const t = document.querySelector('.toolbar').getBoundingClientRect();
    return {
      top: Math.round(b.top),
      bottom: Math.round(b.bottom),
      toolbarTop: Math.round(t.top),
      above: b.bottom <= t.top + 2,
      inView: b.top >= 0,
      scrollable: m.scrollHeight > m.clientHeight + 1,
    };
  })()`)
  check(!!report.menu, '更多菜单没有打开')
  check(report.menu?.above, '菜单没有向上弹（会顶出窗口底边）')
  check(report.menu?.inView, '菜单顶部超出窗口')
  await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
  await wait(200)

  /* ───── 8. 触控模式：按钮再放大一档 ───── */
  await js(`(() => {
    const svg = document.querySelector('.canvas__svg');
    const opt = { bubbles: true, cancelable: true, clientX: 400, clientY: 300, pointerId: 9, isPrimary: true, pointerType: 'touch', button: 0 };
    svg.dispatchEvent(new PointerEvent('pointerdown', opt));
    svg.dispatchEvent(new PointerEvent('pointerup', opt));
    return true;
  })()`)
  await wait(400)
  report.touch = {
    flag: await js(`document.documentElement.dataset.touch`),
    toolbarH: (await rect('.toolbar'))?.h,
    btnH: await js(`Math.round(document.querySelector('.tbtn').getBoundingClientRect().height)`),
    labelCount: await js(`document.querySelectorAll('.tbtn__label').length`),
  }
  check(report.touch.flag === '1', '触摸后没有进入触控模式')
  check(report.touch.toolbarH >= 72, `触控底栏没有加高：${report.touch.toolbarH}`)
  check(report.touch.btnH >= 56, `触控按钮没有放大：${report.touch.btnH}`)
  await shot('dock-touch.png')

  /* ───── 9. 1024 / 820 窄窗口不溢出 ───── */
  win.setSize(1024, 700)
  await wait(500)
  report.w1024 = await js(`(() => {
    const t = document.querySelector('.toolbar');
    const ink = document.querySelector('.toolbar__ink').getBoundingClientRect();
    const last = [...document.querySelectorAll('.toolbar__side--left .tbtn')].pop().getBoundingClientRect();
    return {
      toolbarOverflow: t ? t.scrollWidth > t.clientWidth + 1 : null,
      docScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      labels: document.querySelectorAll('.tbtn__label').length,
      canvasW: Math.round(document.querySelector('.canvas').getBoundingClientRect().width),
      leftToInk: Math.round(last.right - ink.left),
    };
  })()`)
  check(!report.w1024.toolbarOverflow, '1024 宽时工具栏溢出')
  check(!report.w1024.docScrollX, '1024 宽时页面横向滚动')
  check(report.w1024.canvasW > 400, `1024 宽时画布被挤没：${report.w1024.canvasW}`)
  check(
    report.w1024.leftToInk <= 0,
    `1024 触控时左侧工具压到批注组：${report.w1024.leftToInk}px`,
  )
  await shot('dock-1024.png')

  /* 1200 是应用允许的最小窗口宽度：10 个快捷色 + 更多颜色 + 清空必须整条放得下 */
  win.setSize(1200, 700)
  await wait(500)
  await js(`document.querySelector('.toolbar [title="画笔批注 B"]').click()`)
  await wait(350)
  report.w1200pen = await js(`(() => {
    const p = document.querySelector('.penbar');
    const c = document.querySelector('.penbar__clear');
    const m = document.querySelector('.penbar__more');
    const sw = [...document.querySelectorAll('.penbar__swatch')];
    if (!p || !c || !m) return null;
    const pb = p.getBoundingClientRect();
    const cb = c.getBoundingClientRect();
    const mb = m.getBoundingClientRect();
    const lb = sw.length ? sw[sw.length - 1].getBoundingClientRect() : null;
    return {
      scrollW: p.scrollWidth,
      clientW: p.clientWidth,
      swatches: sw.length,
      clearVisible: cb.left >= pb.left - 1 && cb.right <= pb.right + 1,
      moreVisible: mb.left >= pb.left - 1 && mb.right <= pb.right + 1,
      lastSwatchVisible: lb ? lb.right <= pb.right + 1 : false,
    };
  })()`)
  check(
    (report.w1200pen?.scrollW ?? 0) <= (report.w1200pen?.clientW ?? 0) + 1,
    `1200 宽时批注条溢出：${JSON.stringify(report.w1200pen)}`,
  )
  check(report.w1200pen?.clearVisible, '1200 宽时「清空批注」不在可视区')
  check(report.w1200pen?.moreVisible, '1200 宽时「更多颜色」不在可视区')
  check(report.w1200pen?.lastSwatchVisible, '1200 宽时最后一个快捷色被裁掉')
  await shot('dock-1200.png')
  await js(`document.querySelector('.penbar__done').click()`)
  await wait(300)

  win.setSize(820, 620)
  await wait(500)
  report.w820 = await js(`(() => {
    const t = document.querySelector('.toolbar');
    return {
      toolbarOverflow: t ? t.scrollWidth > t.clientWidth + 1 : null,
      docScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      canvasW: Math.round(document.querySelector('.canvas').getBoundingClientRect().width),
      canvasH: Math.round(document.querySelector('.canvas').getBoundingClientRect().height),
    };
  })()`)
  check(!report.w820.toolbarOverflow, '820 宽时工具栏溢出')
  check(report.w820.canvasW > 200 && report.w820.canvasH > 200, `820×620 画布太小：${JSON.stringify(report.w820)}`)

  await js(`document.querySelector('.toolbar [title="画笔批注 B"]').click()`)
  await wait(350)
  report.w820pen = await js(`(() => {
    const p = document.querySelector('.penbar');
    const d = document.querySelector('.penbar__done');
    if (!p || !d) return null;
    const pb = p.getBoundingClientRect();
    const db = d.getBoundingClientRect();
    return {
      scrollW: p.scrollWidth,
      clientW: p.clientWidth,
      doneVisible: db.left >= pb.left - 1 && db.right <= pb.right + 1,
      modeCount: document.querySelectorAll('.penbar__mode').length,
    };
  })()`)
  check(report.w820pen?.doneVisible, '820 宽时「完成」按钮被挤出批注条')
  check((report.w820pen?.modeCount ?? 0) >= 3, '820 宽时笔型按钮不全')
  await shot('dock-820.png')

  console.log('RESULT ' + JSON.stringify(report, null, 2))
  if (failed) console.error(`VERIFY FAILED 共 ${failed} 项`)
  app.quit()
}

app.whenReady().then(main).catch((e) => {
  console.error('VERIFY FAILED', e)
  app.quit()
})
