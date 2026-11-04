/**
 * 深度使用巡检：文件读写、导出、模板库、命令面板、图形库、测量、批注、右栏属性、时间轴。
 * 每个流程都断言结果，失败打 VERIFY FAILED。
 */
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { registerFileIpc } = require('../electron/file-ipc.cjs')
const { registerStoreIpc } = require('../electron/store.cjs')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')
fs.mkdirSync(outDir, { recursive: true })

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-ux-'))
const savePath = path.join(work, 'demo.chordot')
const exportSvg = path.join(work, 'demo.svg')
const exportPng = path.join(work, 'demo.png')

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-ux-data-')))
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const report = {}

function fail(msg) {
  failed++
  console.error('VERIFY FAILED ' + msg)
}
function check(cond, msg) {
  if (!cond) fail(msg)
}

async function main() {
  protocol.handle('app', (r) =>
    net.fetch(pathToFileURL(path.join(DIST, decodeURIComponent(new URL(r.url).pathname))).toString()),
  )
  ipcMain.handle('ui:get-state', () => ({}))
  ipcMain.on('ui:set-state', () => {})
  registerStoreIpc()
  registerFileIpc({ addRecent: () => {} })
  ipcMain.handle('update:info', () => ({ version: '0.0.0', mirrors: [] }))
  ipcMain.handle('update:check', () => ({ ok: true, current: '0.0.0', hasUpdate: false }))
  ipcMain.handle('app:about', () => ({
    name: 'Chordot',
    version: '0.0.0',
    electron: '',
    chrome: '',
    node: '',
    repo: '',
  }))

  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    show: true,
    webPreferences: {
      preload: path.join(root, 'electron/preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  })
  win.webContents.on('console-message', (...args) => {
    let level = 0
    let message = ''
    if (typeof args[1] === 'number') {
      level = args[1]
      message = String(args[2] ?? '')
    } else if (args[0] && typeof args[0] === 'object') {
      level = args[0].level
      message = String(args[0].message ?? '')
    }
    if (message && (level === 'error' || level >= 3)) console.log('PAGE_ERROR ' + message.slice(0, 300))
  })
  const js = (c) => win.webContents.executeJavaScript(c, true)
  const shot = async (name) => {
    const img = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, `ux-${name}.png`), img.toPNG())
  }
  const tool = (t) =>
    js(`(() => { const b = [...document.querySelectorAll('[title]')].find(x => x.getAttribute('title').startsWith(${JSON.stringify(t)})); if (!b) return false; b.click(); return true })()`)
  const worldClick = async (wx, wy) => {
    await js(`(() => {
      const svg = document.querySelector('.canvas__svg');
      const r = svg.getBoundingClientRect();
      const s = 40 * window.__state.zoom;
      const x = r.left + r.width / 2 + window.__state.pan.x + ${wx} * s;
      const y = r.top + r.height / 2 + 40 + window.__state.pan.y - ${wy} * s;
      const o = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 };
      const hit = document.elementFromPoint(x, y) || svg;
      hit.dispatchEvent(new PointerEvent('pointerdown', o));
      hit.dispatchEvent(new PointerEvent('pointerup', o));
      return true;
    })()`)
    await wait(110)
  }
  const counts = () =>
    js(`(() => { const d = window.__state.doc.scene.doc || {}; return {
      points: d.points?.length ?? 0, segments: d.segments?.length ?? 0,
      circles: d.circles?.length ?? 0, polygons: d.polygons?.length ?? 0,
      functions: d.functions?.length ?? 0, strokes: window.__state.doc.strokes?.length ?? 0,
    } })()`)

  await win.loadURL('app://chordot/index.html?notour=1')
  await wait(1500)

  /* ───── 1. 作图 ───── */
  await tool('线段')
  await worldClick(-5, 0)
  await worldClick(-1, 0)
  await tool('圆')
  await worldClick(3, 0)
  await worldClick(4.5, 0)
  await tool('点')
  await worldClick(0, 3)
  let c = await counts()
  check(c.segments === 1 && c.circles === 1 && c.points >= 3, `基础作图数量不对 ${JSON.stringify(c)}`)

  /* ───── 2. 保存 → 修改 → 重新打开 ───── */
  process.env.CHORDOT_TEST_SAVE = savePath
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))`)
  await wait(900)
  check(fs.existsSync(savePath), '保存没有写出文件')
  if (fs.existsSync(savePath)) {
    const raw = fs.readFileSync(savePath, 'utf8')
    let parsed = null
    try {
      parsed = JSON.parse(raw)
    } catch {
      fail('保存的文件不是合法 JSON')
    }
    report.savedBytes = raw.length
    check(parsed && parsed.version, '保存的文件缺 version')
    check(parsed?.app === 'chordot', '保存的文件缺 app 标记')
    check(parsed?.doc?.scene?.doc?.segments?.length === 1, '保存的文件里线段数量不对')
    check((await js(`window.__state.dirty`)) === false, '保存后 dirty 没清掉')
  }

  // 再画一个点，然后打开刚才的文件
  await tool('点')
  await worldClick(6, 2)
  const beforeOpen = await counts()
  process.env.CHORDOT_TEST_OPEN = savePath
  process.env.CHORDOT_TEST_CONFIRM = '1' // 放弃修改，直接打开
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, bubbles: true }))`)
  await wait(1000)
  const afterOpen = await counts()
  check(afterOpen.points !== beforeOpen.points, `打开文件后点数没变（${beforeOpen.points}）`)
  check(afterOpen.points === 4, `打开后点数应为 4，实际 ${afterOpen.points}`)
  check((await js(`window.__state.file`)) === 'demo.chordot', '打开后文件名没更新')

  /* ───── 3. 导出（先选中一个对象，检查高亮不会被导出） ───── */
  await js(`(() => {
    const g = [...document.querySelectorAll('[data-id]')].find(el => el.querySelector('line'));
    if (!g) return false;
    const r = g.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 };
    g.dispatchEvent(new PointerEvent('pointerdown', o));
    g.dispatchEvent(new PointerEvent('pointerup', o));
    return true;
  })()`)
  await wait(300)
  check((await js(`window.__state.selected.length`)) === 1, '点选线段失败')

  process.env.CHORDOT_TEST_EXPORT = exportSvg
  win.webContents.send('app:menu', 'export-svg')
  await wait(900)
  check(fs.existsSync(exportSvg), 'SVG 导出没有写出文件')
  if (fs.existsSync(exportSvg)) {
    const svg = fs.readFileSync(exportSvg, 'utf8')
    report.svgBytes = svg.length
    check(svg.startsWith('<svg'), 'SVG 文件头不对')
    check(!svg.includes('data-ui'), 'SVG 里残留了界面装饰（data-ui）')
    check(!svg.includes('stroke-opacity="0.22"'), 'SVG 里残留了选中光晕')
    check(svg.includes('<line'), 'SVG 里没有线段')
  }

  process.env.CHORDOT_TEST_EXPORT = exportPng
  win.webContents.send('app:menu', 'export-png')
  await wait(1400)
  check(fs.existsSync(exportPng), 'PNG 导出没有写出文件')
  if (fs.existsSync(exportPng)) {
    const buf = fs.readFileSync(exportPng)
    report.pngBytes = buf.length
    check(buf.length > 8000, `PNG 太小（${buf.length}B）`)
    check(buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG', 'PNG 文件头不对')
  }

  /* ───── 4. 模板库 ───── */
  await js(`(() => { const b = [...document.querySelectorAll('[title]')].find(x => x.getAttribute('title').startsWith('更多')); b?.click(); return true })()`)
  await wait(250)
  await js(`(() => { const b = [...document.querySelectorAll('.menu__item')].find(x => x.textContent.includes('模板库')); b?.click(); return true })()`)
  await wait(600)
  const galleryOpen = await js(`!!document.querySelector('.gallery[aria-label="模板库"]')`)
  check(galleryOpen, '模板库没打开')
  const cards = await js(`document.querySelectorAll('.gallery__card').length`)
  report.templateCards = cards
  check(cards > 0, '模板库没有卡片')
  await shot('templates')
  // 选第一个模板
  const picked = await js(`(() => {
    const b = document.querySelector('.gallery__main');
    if (!b) return false;
    b.click();
    return true;
  })()`)
  await wait(900)
  check(picked, '没找到可点的模板卡片')
  check(!(await js(`!!document.querySelector('.gallery[aria-label="模板库"]')`)), '选模板后模板库没关')
  const afterTemplate = await counts()
  report.afterTemplate = afterTemplate
  check(
    afterTemplate.points + afterTemplate.segments + afterTemplate.functions > 0,
    '套用模板后画布还是空的',
  )

  /* ───── 5. 命令面板 ───── */
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))`)
  await wait(400)
  check(await js(`!!document.querySelector('.palette')`), '命令面板没打开')
  await js(`(() => {
    const input = document.querySelector('.palette input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '网格');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`)
  await wait(350)
  const gridBefore = await js(`window.__state.grid`)
  await js(`(() => {
    const input = document.querySelector('.palette input');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return true;
  })()`)
  await wait(450)
  check(!(await js(`!!document.querySelector('.palette')`)), '命令面板回车后没关')
  check((await js(`window.__state.grid`)) !== gridBefore, '命令面板执行「网格」没生效')

  /* ───── 6. 图形库拖放 ───── */
  await js(`(() => { const b = [...document.querySelectorAll('[title]')].find(x => x.getAttribute('title').startsWith('图形库')); b?.click(); return true })()`)
  await wait(400)
  const shapeItems = await js(`document.querySelectorAll('.shapes__card').length`)
  report.shapeItems = shapeItems
  if (shapeItems === 0) fail('图形库没有条目')
  await shot('shapes')
  await js(`(() => { const b = [...document.querySelectorAll('[title]')].find(x => x.getAttribute('title').startsWith('图形库')); b?.click(); return true })()`)
  await wait(250)

  /* ───── 7. 测量：选两个点 ───── */
  // 测量需要草图里的两个点：先新建一张干净的草图
  win.webContents.send('app:menu', 'new')
  await wait(700)
  await tool('点')
  await worldClick(-2, 3)
  await tool('点')
  await worldClick(2, 3)
  await tool('选择工具')
  await wait(200)
  console.log('MEASURE_PTS ' + await js(`JSON.stringify({ pts: window.__state.doc.scene.doc.points.map(p => p.id), sel: window.__state.selected, tool: window.__state.tool, kind: window.__state.doc.scene.kind, domIds: [...document.querySelectorAll('[data-id]')].map(e => e.getAttribute('data-id')) })`))
  // 用真实鼠标输入点选：合成的 PointerEvent 在 SVG 子元素上不总能走到 React 委托
  const ptPos = await js(`(() => {
    const ids = window.__state.doc.scene.doc.points.slice(0, 2).map(p => p.id);
    return ids.map(id => {
      const c = document.querySelector('[data-id="' + id + '"] circle');
      const r = c.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
  })()`)
  for (const [i, p] of ptPos.entries()) {
    win.webContents.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: 'left', clickCount: 1, modifiers: i > 0 ? ['shift'] : [] })
    win.webContents.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y, button: 'left', clickCount: 1, modifiers: i > 0 ? ['shift'] : [] })
    await wait(220)
  }
  await wait(500)
  console.log('MEASURE_SEL ' + await js(`JSON.stringify(window.__state.selected)`))
  const statusText = await js(`document.querySelector('.statusbar')?.textContent ?? ''`)
  report.statusText = statusText
  check(/距离/.test(statusText), '选中两点后状态栏没有显示距离')
  // 打开右栏，测量面板里也应有明细
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
  await wait(400)
  const measureRows = await js(`document.querySelectorAll('.measure__row').length`)
  report.measureRows = measureRows
  check(measureRows > 0, '右栏没有出现测量明细')
  await shot('measure')

  /* ───── 8. 批注画笔 ───── */
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await wait(150)
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }))`)
  await wait(300)
  const strokeBefore = await js(`(window.__state.doc.strokes || []).length`)
  await js(`(async () => {
    const svg = document.querySelector('.canvas__svg');
    const r = svg.getBoundingClientRect();
    const o = (x, y) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0, buttons: 1 });
    svg.dispatchEvent(new PointerEvent('pointerdown', o(r.left + 300, r.top + 300)));
    for (let i = 1; i <= 6; i++) {
      svg.dispatchEvent(new PointerEvent('pointermove', o(r.left + 300 + i * 8, r.top + 300 + i * 4)));
      await new Promise((res) => setTimeout(res, 30));
    }
    svg.dispatchEvent(new PointerEvent('pointerup', o(r.left + 350, r.top + 325)));
    return true;
  })()`)
  await wait(500)
  const strokeAfter = await js(`(window.__state.doc.strokes || []).length`)
  report.strokes = { before: strokeBefore, after: strokeAfter }
  check(strokeAfter > strokeBefore, '画笔没有产生批注')
  await shot('pen')
  // 撤销批注
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))`)
  await wait(350)
  check((await js(`(window.__state.doc.strokes || []).length`)) < strokeAfter, '批注撤销不回去')

  /* ───── 9. 右栏属性编辑 ───── */
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await wait(150)
  if (!(await js(`!!document.querySelector('.right')`))) {
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
    await wait(400)
  }
  const panelOpen = await js(`!!document.querySelector('.right')`)
  check(panelOpen, 'P 键没有打开右栏')
  await shot('right-panel')

  /* ───── 10. 物理模式 + 时间轴 ───── */
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }))`)
  await wait(600)
  check((await js(`window.__state.mode`)) === 'physics', 'M 键没切到物理模式')
  await js(`(() => { const b = [...document.querySelectorAll('[title]')].find(x => x.getAttribute('title').startsWith('更多')); b?.click(); return true })()`)
  await wait(200)
  await js(`(() => { const b = [...document.querySelectorAll('.menu__item')].find(x => x.textContent.includes('单摆')); b?.click(); return true })()`)
  await wait(900)
  await shot('physics-sample')
  const sub = await js(`window.__state.subState`)
  report.subState = sub
  check(sub === 'kinematics', `单摆样例没有进入运动学面板（${sub}）`)
  // 选中摆球（用真实鼠标），右栏才会出现播放控件
  const bob = await js(`(() => {
    const g = [...document.querySelectorAll('.canvas__svg [data-id]')].find(el => el.querySelector('circle'));
    if (!g) return null;
    const c = g.querySelector('circle');
    const r = c.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`)
  console.log('BOB ' + JSON.stringify(bob) + ' sel0=' + (await js(`JSON.stringify(window.__state.selected)`)))
  if (bob) {
    win.webContents.sendInputEvent({ type: 'mouseDown', x: bob.x, y: bob.y, button: 'left', clickCount: 1 })
    win.webContents.sendInputEvent({ type: 'mouseUp', x: bob.x, y: bob.y, button: 'left', clickCount: 1 })
    await wait(400)
  }
  if (!(await js(`!!document.querySelector('.right')`))) {
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
    await wait(300)
  }
  await js(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '播放'); b?.click(); return !!b })()`)
  await wait(1500)
  console.log('PLAYSTATE ' + await js(`JSON.stringify({ playing: window.__state.playing, sel: window.__state.selected, right: !!document.querySelector('.right'), btns: [...document.querySelectorAll('.right button')].map(b => b.textContent.trim()) })`))
  const playing = await js(`window.__state.playing`)
  report.playing = playing
  check(playing === true, '点播放后没有开始仿真')
  await shot('physics-playing')
  // 暂停
  await js(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '暂停'); b?.click(); return !!b })()`)
  await wait(300)

  /* ───── 11. 三维相机 ───── */
  await js(`(() => { const b = [...document.querySelectorAll('[title]')].find(x => x.getAttribute('title').startsWith('更多')); b?.click(); return true })()`)
  await wait(200)
  await js(`(() => { const b = [...document.querySelectorAll('.menu__item')].find(x => x.textContent.includes('正方体')); b?.click(); return true })()`)
  await wait(900)
  const camOf = `(() => { const sc = window.__state.doc.scene; return JSON.stringify(sc.params?.camera ?? null) })()`
  const camBefore = await js(camOf)
  await js(`(() => {
    const svg = document.querySelector('.canvas__svg');
    const r = svg.getBoundingClientRect();
    const o = (x, y) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0, buttons: 1 });
    svg.dispatchEvent(new PointerEvent('pointerdown', o(r.left + 400, r.top + 300)));
    for (let i = 1; i <= 5; i++) svg.dispatchEvent(new PointerEvent('pointermove', o(r.left + 400 + i * 12, r.top + 300)));
    svg.dispatchEvent(new PointerEvent('pointerup', o(r.left + 460, r.top + 300)));
    return true;
  })()`)
  await wait(400)
  const camAfter = await js(camOf)
  report.cameraChanged = camBefore !== camAfter
  check(camBefore !== camAfter, '三维里拖动没有旋转相机')
  await shot('3d')

  console.log('REPORT ' + JSON.stringify(report, null, 1))
  if (failed === 0) console.log('RESULT 深度巡检通过')
  else console.log(`SUMMARY ${failed} 项失败`)
  app.quit()
}

app.whenReady().then(main).catch((e) => {
  console.error('FAILED', e)
  app.quit()
})
