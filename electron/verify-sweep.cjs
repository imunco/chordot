/**
 * 用户视角全流程巡检：把常见操作走一遍，记录控制台报错、异常状态、布局溢出。
 * 只做「发现问题」和「截图」，不写断言的地方也会打印异常。
 */
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { registerStoreIpc } = require('../electron/store.cjs')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')
fs.mkdirSync(outDir, { recursive: true })

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-sweep-'))
app.setPath('userData', userData)

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const problems = []
const consoleLog = []

function note(kind, detail) {
  problems.push({ kind, detail })
  console.log(`PROBLEM ${kind} ${detail}`)
}

async function main() {
  protocol.handle('app', (r) =>
    net.fetch(pathToFileURL(path.join(DIST, decodeURIComponent(new URL(r.url).pathname))).toString()),
  )
  ipcMain.handle('ui:get-state', () => ({}))
  ipcMain.on('ui:set-state', () => {})
  // 文件对话框全部用假实现：巡检不能卡在原生弹窗上
  ipcMain.handle('file:save', async (_e, p) => ({ path: p?.filePath || 'R:////chordot-desktop////.tmp////sweep.chordot' }))
  ipcMain.handle('file:open', async () => ({ canceled: true }))
  ipcMain.handle('pack:export', async () => ({ canceled: true }))
  ipcMain.handle('pack:import', async () => ({ canceled: true }))
  ipcMain.handle('dialog:confirm-unsaved', async () => 1) // 1 = 不保存，直接丢弃
  registerStoreIpc()
  // 更新模块：离线实现，避免巡检时被网络卡住
  ipcMain.handle('update:info', () => ({ version: '0.0.0', mirrors: [] }))
  ipcMain.handle('update:check', () => ({ ok: true, current: '0.0.0', hasUpdate: false }))
  ipcMain.handle('update:probe', () => ({ ok: true, list: [] }))
  ipcMain.handle('update:download', () => ({ ok: false, error: 'offline' }))
  ipcMain.handle('update:cancel', () => true)
  ipcMain.handle('update:install', () => ({ ok: false }))
  ipcMain.handle('update:openRelease', () => true)
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
    backgroundColor: '#FAFAF8',
    webPreferences: {
      preload: path.join(root, 'electron/preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  })

  win.webContents.on('console-message', (...args) => {
    // Electron 新老版本签名不同：新的是 (event, level, message, line, source)
    let level = 0
    let message = ''
    if (typeof args[1] === 'number') {
      level = args[1]
      message = String(args[2] ?? '')
    } else if (args[0] && typeof args[0] === 'object') {
      level = args[0].level
      message = String(args[0].message ?? '')
    }
    if (!message) return
    const lv = typeof level === 'string' ? level : level >= 3 ? 'error' : level === 2 ? 'warn' : 'info'
    consoleLog.push(`${lv}: ${message}`)
    if (lv === 'error') note('console', message.slice(0, 300))
  })
  win.webContents.on('render-process-gone', (_e, d) => note('crash', JSON.stringify(d)))
  win.webContents.on('preload-error', (_e, p, err) => note('preload', `${p} ${err}`))

  const js = (code) => win.webContents.executeJavaScript(code, true)
  const shot = async (name) => {
    const img = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, `sweep-${name}.png`), img.toPNG())
  }
  const clickTitle = (prefix) =>
    js(`(() => { const b = [...document.querySelectorAll('[title]')].find(x => x.getAttribute('title').startsWith(${JSON.stringify(prefix)})); if (!b) return false; b.click(); return true })()`)
  const clickText = (text, sel = 'button') =>
    js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find(x => x.textContent.trim() === ${JSON.stringify(text)}); if (!b) return false; b.click(); return true })()`)
  const key = (k, mods = {}) =>
    js(`window.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify({ key: k, bubbles: true, ...mods })}))`)

  /** 世界坐标 → 视口坐标点击 */
  const worldClick = async (wx, wy) => {
    await js(`(() => {
      const svg = document.querySelector('.canvas__svg');
      const r = svg.getBoundingClientRect();
      const s = 40 * window.__state.zoom;
      const x = r.left + r.width / 2 + window.__state.pan.x + ${wx} * s;
      const y = r.top + r.height / 2 + 40 + window.__state.pan.y - ${wy} * s;
      const opt = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 };
      const hit = document.elementFromPoint(x, y) || svg;
      hit.dispatchEvent(new PointerEvent('pointerdown', opt));
      hit.dispatchEvent(new PointerEvent('pointerup', opt));
      return true;
    })()`)
    await wait(90)
  }

  const snapshot = () =>
    js(`(() => {
      const st = window.__state;
      const d = st.doc.scene.doc || {};
      const objects = (d.points?.length ?? 0) + (d.segments?.length ?? 0) + (d.circles?.length ?? 0) + (d.polygons?.length ?? 0) + (d.functions?.length ?? 0);
      return {
        objects,
        curves: d.functions?.length ?? 0,
        mode: st.mode,
        tool: st.tool,
        selected: st.selected.length,
        past: st.past.length,
        future: st.future.length,
        dirty: st.dirty,
        error: st.solution?.error ?? null,
      };
    })()`)

  /* ───────── 1. 首次启动：引导 ───────── */
  await win.loadURL('app://chordot/index.html')
  await wait(1600)
  const tour = await js(`document.querySelectorAll('.ob').length`)
  if (!tour) note('tour', '首次启动没有出现引导')
  for (let i = 0; i < 12; i++) {
    const done = await js(`!document.querySelector('.ob')`)
    if (done) break
    const ok = await js(`(() => {
      const b = document.querySelector('.ob__nav .btn--primary');
      if (!b) return false;
      b.click();
      return true;
    })()`)
    if (!ok) break
    await wait(260)
  }
  if (await js(`!!document.querySelector('.ob')`)) note('tour', '引导关不掉')
  if (!(await js(`JSON.parse(localStorage.getItem('chordot.settings') || '{}').onboarded === true`)))
    note('tour', '引导完成后 onboarded 没落盘')
  await shot('01-home')

  /* ───────── 2. 函数绘图 ───────── */
  const inputExpr = async (expr) => {
    const ok = await js(`(() => {
      const mf = document.querySelector('.left__input');
      if (!mf) return false;
      mf.focus();
      mf.value = ${JSON.stringify(expr)};
      mf.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return true;
    })()`)
    await wait(420)
    return ok
  }
  for (const e of ['\\sin(x)', 'x^2', '\\frac{1}{x}', '\\sqrt{x}', '\\ln(x)']) {
    if (!(await inputExpr(e))) note('input', `找不到表达式输入框（${e}）`)
  }
  let snap = await snapshot()
  if (snap.curves < 5) note('function', `输入 5 条函数只画了 ${snap.curves} 条`)
  await shot('02-functions')

  // 非法表达式：不该崩，应有提示
  await inputExpr('sin(')
  const badSnap = await snapshot()
  if (badSnap.error) note('function', `非法表达式残留错误状态：${badSnap.error}`)
  await shot('03-bad-expression')

  // 删掉一条
  await js(`(() => { const row = document.querySelector('.left__row'); if (row) row.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return true })()`)
  await wait(200)

  /* ───────── 3. 几何作图 ───────── */
  await clickTitle('线段')
  await worldClick(-4, -2)
  await worldClick(0, -2)
  await clickTitle('圆')
  await worldClick(3, -2)
  await worldClick(4.5, -2)
  await clickTitle('多边形')
  await worldClick(-5, 2)
  await worldClick(-3, 3.5)
  await worldClick(-1.5, 1.6)
  await worldClick(-5, 2)
  await clickTitle('点')
  await worldClick(2, 3)
  snap = await snapshot()
  if (snap.objects < 8) note('geometry', `画完点线圆多边形只有 ${snap.objects} 个对象`)
  await shot('04-geometry')

  // 撤销 / 重做
  const beforeUndo = (await snapshot()).objects
  await key('z', { ctrlKey: true })
  await wait(300)
  const afterUndo = (await snapshot()).objects
  if (afterUndo >= beforeUndo) note('undo', `Ctrl+Z 没生效（${beforeUndo} → ${afterUndo}）`)
  await key('y', { ctrlKey: true })
  await wait(300)
  if ((await snapshot()).objects !== beforeUndo) note('redo', 'Ctrl+Y 没恢复')

  // 选中并拖动
  await clickTitle('选择工具')
  await wait(150)

  /* ───────── 4. 物理模式 ───────── */
  await js(`document.body.focus()`)
  await key('m')
  await wait(700)
  snap = await snapshot()
  if (snap.mode !== 'physics') note('mode', `切物理模式失败：${snap.mode}`)
  await shot('05-physics')

  // 放一个物体 + 运行
  await clickTitle('添加力')
  await worldClick(0, 1)
  await wait(400)
  await js(`(() => { const b = [...document.querySelectorAll('button')].find(x => /播放|运行|开始/.test(x.textContent)); if (b) b.click(); return !!b })()`)
  await wait(1200)
  await shot('06-physics-run')

  /* ───────── 5. 三维样例 ───────── */
  await key('m')
  await wait(500)
  await clickTitle('更多')
  await wait(200)
  const has3d = await clickText('示例：三维斜面受力')
  await wait(900)
  if (!has3d) note('sample', '更多菜单里没有「三维斜面」')
  await shot('07-3d')

  /* ───────── 6. 设置四个分页 ───────── */
  win.webContents.send('app:menu', 'prefs')
  await wait(600)
  const tabs = ['通用', '个性化', '更新', '关于']
  for (const t of tabs) {
    const ok = await js(`(() => { const b = [...document.querySelectorAll('.prefs__tab')].find(x => x.textContent.trim() === ${JSON.stringify(t)}); if (!b) return false; b.click(); return true })()`)
    if (!ok) note('prefs', `设置里没有「${t}」分页`)
    await wait(320)
    const overflow = await js(`(() => { const b = document.querySelector('.prefs__body'); if (!b) return null; return { sh: b.scrollHeight, ch: b.clientHeight, sw: b.scrollWidth, cw: b.clientWidth } })()`)
    if (overflow && overflow.sw > overflow.cw + 2)
      note('prefs', `${t} 页横向溢出 ${overflow.sw} > ${overflow.cw}`)
    await shot(`08-prefs-${t}`)
  }
  await key('Escape')
  await wait(300)
  if (await js(`!!document.querySelector('.prefs')`)) note('prefs', 'Esc 关不掉设置')

  /* ───────── 7. 菜单动作 ───────── */
  win.webContents.send('app:menu', 'about')
  await wait(400)
  const aboutOpen = await js(
    `(() => { const b = document.querySelector('.prefs__tab[data-active="true"]'); return b ? b.textContent.trim() : null })()`,
  )
  if (aboutOpen !== '关于') note('menu', `菜单「关于」没打开关于页（当前 ${aboutOpen}）`)
  await shot('09-menu-about')
  await key('Escape')
  await wait(250)

  win.webContents.send('app:menu', 'shortcuts')
  await wait(400)
  if (!(await js(`!!document.querySelector('.shortcuts')`)))
    note('menu', '菜单「快捷键」没打开面板')
  await shot('10-menu-shortcuts')
  await key('Escape')
  await wait(250)

  win.webContents.send('app:menu', 'tour')
  await wait(400)
  if (!(await js(`!!document.querySelector('.ob')`))) note('menu', '菜单「引导教学」没打开')
  await key('Escape')
  await wait(300)

  win.webContents.send('app:menu', 'undo')
  await wait(300)

  /* ───────── 8. 布局与溢出 ───────── */
  const layout = await js(`(() => {
    const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } };
    return {
      win: { w: innerWidth, h: innerHeight },
      toolbar: r('.toolbar'),
      canvas: r('.canvas'),
      left: r('.left'),
      right: r('.right'),
      statusbar: r('.statusbar'),
      docScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      docScrollY: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      toolbarOverflow: (() => { const t = document.querySelector('.toolbar'); return t ? t.scrollWidth > t.clientWidth + 1 : null })(),
    };
  })()`)
  if (layout.docScrollX || layout.docScrollY) note('layout', `页面出现滚动条 ${JSON.stringify(layout)}`)
  if (layout.toolbarOverflow) note('layout', '工具栏内容溢出')
  console.log('LAYOUT ' + JSON.stringify(layout))

  /* ───────── 9. 缩放 / 平移 ───────── */
  const z0 = await js(`window.__state.zoom`)
  // 用真实鼠标滚轮（合成的 WheelEvent 到不了 React 根监听）
  win.webContents.sendInputEvent({ type: 'mouseWheel', x: 600, y: 400, deltaX: 0, deltaY: -120, canScroll: false })
  await wait(350)
  const z1 = await js(`window.__state.zoom`)
  if (Math.abs(z1 - z0) < 1e-6) note('zoom', '滚轮缩放没反应')
  // 缩放后画布不该整体错位：原点应仍在可视范围内
  const originVisible = await js(`(() => { const st = window.__state; return Math.abs(st.pan.x) < 4000 && Math.abs(st.pan.y) < 4000 })()`)
  if (!originVisible) note('zoom', '缩放后画布跑飞')
  await shot('11-zoom')

  /* ───────── 10. 导出 ───────── */
  await clickTitle('导出')
  await wait(250)
  const exportItems = await js(
    `[...document.querySelectorAll('.menu__item, .export__item, [class*="menu"] button')].map(b => b.textContent.trim()).filter(Boolean)`,
  )
  console.log('EXPORT_ITEMS ' + JSON.stringify(exportItems))

  /* ───────── 11. 新建 ───────── */
  await key('Escape')
  await wait(200)
  win.webContents.send('app:menu', 'new')
  await wait(600)
  snap = await snapshot()
  if (snap.objects !== 0) note('file', `菜单「新建」后还剩 ${snap.objects} 个对象`)
  await shot('12-new')

  /* ───────── 12. 小窗口自适应 ───────── */
  win.setSize(1024, 700)
  await wait(500)
  const small = await js(`(() => ({
    toolbarOverflow: (() => { const t = document.querySelector('.toolbar'); return t ? t.scrollWidth > t.clientWidth + 1 : null })(),
    docScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    canvasW: Math.round(document.querySelector('.canvas').getBoundingClientRect().width),
  }))()`)
  if (small.toolbarOverflow) note('layout', '1024 宽时工具栏溢出')
  if (small.docScrollX) note('layout', '1024 宽时页面横向滚动')
  await shot('13-small')
  win.setSize(1360, 860)
  await wait(400)

  console.log('CONSOLE ' + JSON.stringify(consoleLog.slice(0, 40), null, 1))
  console.log('SUMMARY ' + JSON.stringify({ problems: problems.length, kinds: [...new Set(problems.map((p) => p.kind))] }))
  if (problems.length) console.log('VERIFY FAILED 巡检发现 ' + problems.length + ' 个问题')
  else console.log('RESULT 巡检通过')
  app.quit()
}

app.whenReady().then(main).catch((e) => {
  console.error('FAILED', e)
  app.quit()
})
