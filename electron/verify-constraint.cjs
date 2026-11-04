/** 约束工具验证：水平 / 等长 / 拖动后仍满足 / 标记 */
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { registerFileIpc } = require('./file-ipc.cjs')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-cons-')))

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const HELPERS = `
  window.__clickWorld = (wx, wy) => {
    const svg = document.querySelector('.canvas__svg'); const rect = svg.getBoundingClientRect(); const s = 40;
    const x = rect.left + rect.width / 2 + wx * s, y = rect.top + rect.height / 2 + 40 - wy * s;
    const opt = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 };
    const hit = document.elementFromPoint(x, y);
    (hit || svg).dispatchEvent(new PointerEvent('pointerdown', opt));
    (hit || svg).dispatchEvent(new PointerEvent('pointerup', opt));
    return true;
  };
  window.__seg = (i) => {
    const segs = [...document.querySelectorAll('[data-id^="s"] line')].filter(l => l.getAttribute('stroke') !== 'transparent');
    const l = segs[i];
    if (!l) return null;
    const x1 = +l.getAttribute('x1'), y1 = +l.getAttribute('y1'), x2 = +l.getAttribute('x2'), y2 = +l.getAttribute('y2');
    return { x1, y1, x2, y2, len: +Math.hypot(x2 - x1, y2 - y1).toFixed(1) };
  };
  window.__pickSeg = (i) => {
    const segs = [...document.querySelectorAll('[data-id^="s"]')].filter(g => g.querySelector('line'));
    const g = segs[i];
    const l = g.querySelector('line');
    const x = (+l.getAttribute('x1') + +l.getAttribute('x2')) / 2;
    const y = (+l.getAttribute('y1') + +l.getAttribute('y2')) / 2;
    const opt = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 };
    g.dispatchEvent(new PointerEvent('pointerdown', opt));
    g.dispatchEvent(new PointerEvent('pointerup', opt));
    return true;
  };
  window.__pickSegAdd = (i) => {
    const segs = [...document.querySelectorAll('[data-id^="s"]')].filter(g => g.querySelector('line'));
    const g = segs[i];
    const l = g.querySelector('line');
    const x = (+l.getAttribute('x1') + +l.getAttribute('x2')) / 2;
    const y = (+l.getAttribute('y1') + +l.getAttribute('y2')) / 2;
    const opt = { bubbles: true, cancelable: true, shiftKey: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 };
    g.dispatchEvent(new PointerEvent('pointerdown', opt));
    g.dispatchEvent(new PointerEvent('pointerup', opt));
    return true;
  };
  window.__pointX = (label) => { const g = [...document.querySelectorAll('[data-id]')].find(el => el.querySelector('text')?.textContent === label); const c = g?.querySelector('circle'); return c ? Math.round(+c.getAttribute('cx')) : null; };
  window.__pickPoint = (label) => {
    const g = [...document.querySelectorAll('[data-id]')].find(el => el.querySelector('text')?.textContent === label);
    if (!g) return false;
    const r = g.querySelector('circle').getBoundingClientRect();
    const opt = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 };
    g.dispatchEvent(new PointerEvent('pointerdown', opt));
    g.dispatchEvent(new PointerEvent('pointerup', opt));
    return true;
  };
  window.__pointY = (label) => {
    const g = [...document.querySelectorAll('[data-id]')].find(el => el.querySelector('text')?.textContent === label);
    const c = g?.querySelector('circle');
    return c ? Math.round(+c.getAttribute('cy')) : null;
  };
  window.__cons = () => [...document.querySelectorAll('.cons__row')].map(r => r.children[0].textContent);
  window.__apply = (label) => {
    const b = [...document.querySelectorAll('.cons__btn')].find(x => x.textContent === label);
    if (!b) return 'no-btn';
    if (b.disabled) return 'disabled';
    b.click();
    return 'ok';
  };
  window.__badges = () => [...document.querySelectorAll('.canvas__svg text')].map(t => t.textContent).filter(t => ['═','║','=','∥','⊥','∈'].includes(t));
  window.__dragPoint = async (label, dx, dy) => {
    const g = [...document.querySelectorAll('[data-id]')].find(el => el.querySelector('text')?.textContent === label);
    if (!g) return 'no-point';
    const c = g.querySelector('circle');
    const r = c.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const opt = (cx, cy) => ({ bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0, buttons: 1 });
    g.dispatchEvent(new PointerEvent('pointerdown', opt(x, y)));
    const svg = document.querySelector('.canvas__svg');
    for (let i = 1; i <= 6; i++) {
      svg.dispatchEvent(new PointerEvent('pointermove', opt(x + (dx * i) / 6, y + (dy * i) / 6)));
      await new Promise(r2 => setTimeout(r2, 24));
    }
    svg.dispatchEvent(new PointerEvent('pointerup', opt(x + dx, y + dy)));
    await new Promise(r2 => setTimeout(r2, 500));
    return 'ok';
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
  registerFileIpc({ addRecent: () => {} })

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
    if (String(message).includes('sketch-solve')) console.log('[w]', message)
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
  const tool = (t) => js(`document.querySelector('.toolbar [title="${t}"]').click()`)

  /* 先打开右栏，保证后续测量都在同一画布宽度下进行 */
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
  await wait(350)

  /* 画两条线段：A(-3,0)→B(0,2)，B(0,2)→C(3,0.5) */
  await tool('线段')
  await js(`window.__clickWorld(-3, 0)`)
  await wait(120)
  await js(`window.__clickWorld(0, 2)`)
  await wait(250)
  await tool('线段')
  await js(`window.__clickWorld(0, 2)`)
  await wait(120)
  await js(`window.__clickWorld(3, 0.5)`)
  await wait(300)

  report.before = { s1: await js(`window.__seg(0)`), s2: await js(`window.__seg(1)`), ax: await js(`window.__pointX('A')`) }

  /* 选中第一条，加水平 */
  await js(`window.__pickSeg(0)`)
  await wait(200)
  report.horizontalBtn = await js(`window.__apply('水平')`)
  await wait(700)
  report.afterHorizontal = { s1: await js(`window.__seg(0)`), ax: await js(`window.__pointX('A')`) }
  report.consAfterH = await js(`window.__cons()`)
  report.statusText = await js(`document.querySelector('.statusbar__left')?.textContent ?? null`)
  report.state = await js(`(() => {
    const st = window.__state;
    if (!st) return 'no-state';
    const sc = st.doc.scene;
    return {
      anchor: st.solution.anchor ?? null,
      solvedP1: st.solution.points['p1'] ?? null,
      docP1: sc.kind === 'sketch' ? (sc.doc.points.find(p => p.id === 'p1') ?? null) : null,
      status: st.solution.status,
    };
  })()`)

  /* 选中两条，加等长 */
  await js(`window.__pickSeg(0)`)
  await wait(150)
  await js(`window.__pickSegAdd(1)`)
  await wait(200)
  report.equalBtn = await js(`window.__apply('等长')`)
  await wait(800)
  report.afterEqual = { s1: await js(`window.__seg(0)`), s2: await js(`window.__seg(1)`) }
  report.consAfterE = await js(`window.__cons()`)
  report.badges = await js(`window.__badges()`)

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'constraints.png'), shot.toPNG())

  /* 拖动 B，约束应继续满足 */
  await js(`window.__dragPoint('B', 40, -30)`)
  report.afterDrag = { s1: await js(`window.__seg(0)`), s2: await js(`window.__seg(1)`) }

  /* —— 点在线上：把 C 压到 AB 上 —— */
  await win.loadURL(process.env.VERIFY_URL || 'app://chordot/index.html?notour=1')
  await wait(800)
  await js(HELPERS)
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
  await wait(300)

  await tool('线段')
  await js(`window.__clickWorld(-3, 0)`)
  await wait(120)
  await js(`window.__clickWorld(3, 0)`)
  await wait(250)
  await tool('点')
  await js(`window.__clickWorld(0, 2.5)`)
  await wait(300)

  report.onLine = { pointBefore: await js(`window.__pointY('C')`), lineY: await js(`window.__seg(0).y1`) }
  await js(`window.__pickSeg(0)`)
  await wait(150)
  await js(`window.__pickPoint('C')`)
  await wait(150)
  // 同时选中点和线需要 shift 加选
  await js(`window.__pickSeg(0)`)
  await wait(150)
  await js(`(() => {
    const g = [...document.querySelectorAll('[data-id]')].find(el => el.querySelector('text')?.textContent === 'C');
    const r = g.querySelector('circle').getBoundingClientRect();
    g.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, shiftKey: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 }));
    g.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, shiftKey: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 }));
    return true;
  })()`)
  await wait(200)
  report.onLineBtn = await js(`window.__apply('点在线上')`)
  await wait(800)
  report.onLine.state = await js(`(() => {
    const st = window.__state;
    const sc = st.doc.scene;
    const pick = (id) => ({ solved: st.solution.points[id] ?? null, doc: sc.doc.points.find(p => p.id === id) ?? null });
    return { A: pick('p1'), B: pick('p2'), C: pick('p3'), status: st.solution.status, anchor: st.solution.anchor };
  })()`)
  report.onLine.after = await js(`(() => {
    const l = document.querySelector('[data-id^="s"] line');
    const ax = +l.getAttribute('x1'), ay = +l.getAttribute('y1');
    const bx = +l.getAttribute('x2'), by = +l.getAttribute('y2');
    const g = [...document.querySelectorAll('[data-id]')].find(el => el.querySelector('text')?.textContent === 'C');
    const c = g.querySelector('circle');
    const cx = +c.getAttribute('cx'), cy = +c.getAttribute('cy');
    // 叉积 ≈ 0 说明三点共线（C 在 AB 所在直线上）
    const cross = ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / Math.hypot(bx - ax, by - ay);
    return { crossPx: +cross.toFixed(2), cons: window.__cons(), badges: window.__badges(), ay: +ay.toFixed(2), by: +by.toFixed(2) };
  })()`)

  /* 底线不许被转动：加「点在线上」只该动 C */
  if (Math.abs(report.onLine.after.ay - report.onLine.lineY) > 0.6
    || Math.abs(report.onLine.after.by - report.onLine.lineY) > 0.6) {
    throw new Error(`VERIFY FAILED 加「点在线上」时底边被转动：y1=${report.onLine.after.ay} y2=${report.onLine.after.by} 原 ${report.onLine.lineY}`)
  }
  if (Math.abs(report.onLine.after.crossPx) > 0.6) {
    throw new Error(`VERIFY FAILED C 没落到线上：${report.onLine.after.crossPx}px`)
  }
  const shotOnline = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'constraint-online.png'), shotOnline.toPNG())

  /* 加完约束再拖动：C 必须继续贴着线（初值不能回退到加约束之前） */
  await js(`window.__dragPoint('B', 30, -40)`)
  report.onLine.drag = await js(`(() => {
    const l = document.querySelector('[data-id^="s"] line');
    const ax = +l.getAttribute('x1'), ay = +l.getAttribute('y1');
    const bx = +l.getAttribute('x2'), by = +l.getAttribute('y2');
    const g = [...document.querySelectorAll('[data-id]')].find(el => el.querySelector('text')?.textContent === 'C');
    const c = g.querySelector('circle');
    const cross = ((bx - ax) * (+c.getAttribute('cy') - ay) - (by - ay) * (+c.getAttribute('cx') - ax)) / Math.hypot(bx - ax, by - ay);
    return { crossPx: +cross.toFixed(2), moved: +Math.hypot(bx - ax, by - ay).toFixed(1) };
  })()`)
  if (Math.abs(report.onLine.drag.crossPx) > 0.6) {
    throw new Error(`VERIFY FAILED 拖动后 C 脱线：${report.onLine.drag.crossPx}px`)
  }

  /* —— 中点 —— */
  await win.loadURL(process.env.VERIFY_URL || 'app://chordot/index.html?notour=1')
  await wait(800)
  await js(HELPERS)
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
  await wait(300)
  await tool('线段')
  await js(`window.__clickWorld(-3, 0)`)
  await wait(120)
  await js(`window.__clickWorld(3, 0)`)
  await wait(250)
  await tool('点')
  await js(`window.__clickWorld(0, 2)`)
  await wait(300)

  await js(`window.__pickSeg(0)`)
  await wait(150)
  await js(`(() => {
    const g = [...document.querySelectorAll('[data-id]')].find(el => el.querySelector('text')?.textContent === 'C');
    const r = g.querySelector('circle').getBoundingClientRect();
    g.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, shiftKey: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 }));
    g.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, shiftKey: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 }));
    return true;
  })()`)
  await wait(200)
  report.midBtn = await js(`window.__apply('中点')`)
  await wait(800)
  report.midpoint = await js(`(() => {
    const l = document.querySelector('[data-id^="s"] line');
    const ax = +l.getAttribute('x1'), ay = +l.getAttribute('y1');
    const bx = +l.getAttribute('x2'), by = +l.getAttribute('y2');
    const g = [...document.querySelectorAll('[data-id]')].find(el => el.querySelector('text')?.textContent === 'C');
    const c = g.querySelector('circle');
    const cx = +c.getAttribute('cx'), cy = +c.getAttribute('cy');
    return {
      midX: Math.round((ax + bx) / 2), midY: Math.round((ay + by) / 2),
      cx: Math.round(cx), cy: Math.round(cy),
      dx: Math.abs(cx - (ax + bx) / 2).toFixed(1),
      dy: Math.abs(cy - (ay + by) / 2).toFixed(1),
    };
  })()`)

  /* —— 相切：圆 (0,3) r=2 与直线 y=0 —— */
  await win.loadURL(process.env.VERIFY_URL || 'app://chordot/index.html?notour=1')
  await wait(800)
  await js(HELPERS)
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
  await wait(300)
  await tool('线段')
  await js(`window.__clickWorld(-4, 0)`)
  await wait(120)
  await js(`window.__clickWorld(4, 0)`)
  await wait(250)
  await tool('圆')
  await js(`window.__clickWorld(0, 3)`)
  await wait(150)
  await js(`window.__clickWorld(2, 3)`)
  await wait(400)

  report.tangentBefore = await js(`(() => {
    const l = document.querySelector('[data-id^="s"] line');
    const c = document.querySelector('[data-id^="c"] circle');
    const cy = +[...document.querySelectorAll('[data-id^="p"] circle')].pop().getAttribute('cy');
    return { lineY: Math.round(+l.getAttribute('y1')), rPx: Math.round(+c.getAttribute('r')) };
  })()`)

  await js(`window.__pickSeg(0)`)
  await wait(150)
  await js(`(() => {
    const c = document.querySelector('[data-id^="c"]');
    const el = c.querySelector('circle');
    const r = el.getBoundingClientRect();
    c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, shiftKey: true, clientX: r.x + r.width - 2, clientY: r.y + r.height / 2, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 }));
    c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, shiftKey: true, clientX: r.x + r.width - 2, clientY: r.y + r.height / 2, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 }));
    return true;
  })()`)
  await wait(200)
  report.tanBtn = await js(`window.__apply('相切')`)
  await wait(900)
  report.tangentAfter = await js(`(() => {
    const l = document.querySelector('[data-id^="s"] line');
    const c = document.querySelector('[data-id^="c"] circle');
    const lineY = +l.getAttribute('y1');
    const cx = +c.getAttribute('cx'), cy = +c.getAttribute('cy'), r = +c.getAttribute('r');
    return { lineY: Math.round(lineY), cy: Math.round(cy), rPx: Math.round(r), gapPx: +(Math.abs(cy - lineY) - r).toFixed(1), gapUnit: +((Math.abs(cy - lineY) - r) / 40).toFixed(3) };
  })()`)
  report.tanCons = await js(`window.__cons()`)
  report.tanStatus = await js(`(() => { const st = window.__state; return { status: st.solution.status, conflict: st.solution.conflict?.reason ?? null, ms: st.lastMs }; })()`)

  /* —— 只动参与对象：给第二条线加「水平」，第一条线一个像素都不许动 —— */
  await win.loadURL(process.env.VERIFY_URL || 'app://chordot/index.html?notour=1')
  await wait(800)
  await js(HELPERS)
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
  await wait(300)

  await tool('线段')
  await js(`window.__clickWorld(-4, 2)`)
  await wait(120)
  await js(`window.__clickWorld(-1, 2.4)`)
  await wait(250)
  await tool('线段')
  await js(`window.__clickWorld(1, -2)`)
  await wait(120)
  await js(`window.__clickWorld(4, -1.2)`)
  await wait(300)

  const idleBefore = await js(`window.__seg(0)`)
  await js(`window.__pickSeg(1)`)
  await wait(200)
  report.levelBtn = await js(`window.__apply('水平')`)
  await wait(800)
  const idleAfter = await js(`window.__seg(0)`)
  const target = await js(`window.__seg(1)`)
  const drift = Math.max(
    Math.abs(idleAfter.x1 - idleBefore.x1),
    Math.abs(idleAfter.y1 - idleBefore.y1),
    Math.abs(idleAfter.x2 - idleBefore.x2),
    Math.abs(idleAfter.y2 - idleBefore.y2),
  )
  report.moveOnly = {
    idleDriftPx: +drift.toFixed(2),
    targetLevelPx: +Math.abs(target.y2 - target.y1).toFixed(2),
  }
  if (drift > 0.6) throw new Error(`VERIFY FAILED 无关线段被牵动 ${drift.toFixed(2)}px`)
  if (Math.abs(target.y2 - target.y1) > 0.6) throw new Error('VERIFY FAILED 目标线段没变水平')

  /* —— 连续加三条约束不许误判冲突：水平 → 等长 → 垂直 —— */
  await win.loadURL(process.env.VERIFY_URL || 'app://chordot/index.html?notour=1')
  await wait(800)
  await js(HELPERS)
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
  await wait(300)
  await tool('线段')
  await js(`window.__clickWorld(-3, -1)`)
  await wait(120)
  await js(`window.__clickWorld(1, 1)`)
  await wait(250)
  await tool('线段')
  await js(`window.__clickWorld(1, 1)`)
  await wait(120)
  await js(`window.__clickWorld(4, -1)`)
  await wait(300)

  const statuses = []
  const readStatus = () => js(`(() => { const st = window.__state; return { s: st.solution.status, r: st.solution.conflict?.reason ?? null, p: st.solution.points }; })()`)

  await js(`window.__pickSeg(0)`)
  await wait(150)
  await js(`window.__apply('水平')`)
  await wait(700)
  statuses.push(['水平', await readStatus()])

  await js(`window.__pickSeg(0)`)
  await wait(150)
  await js(`window.__pickSegAdd(1)`)
  await wait(150)
  await js(`window.__apply('等长')`)
  await wait(700)
  statuses.push(['等长', await readStatus()])

  await js(`window.__pickSeg(0)`)
  await wait(150)
  await js(`window.__pickSegAdd(1)`)
  await wait(150)
  await js(`window.__apply('垂直')`)
  await wait(900)
  statuses.push(['垂直', await readStatus()])

  report.chain = statuses.map(([k, v]) => `${k}:${v.s}`)
  const bad = statuses.find(([, v]) => v.s !== 'ok')
  if (bad) throw new Error(`VERIFY FAILED 连续约束被误判：${bad[0]} → ${bad[1].s} ${bad[1].r ?? ''}`)

  const shotMove = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'constraint-chain.png'), shotMove.toPNG())

  /* —— 松手位置必须生效：最后一次 pointermove 停在半路，pointerup 再往前 30px —— */
  await win.loadURL(process.env.VERIFY_URL || 'app://chordot/index.html?notour=1')
  await wait(800)
  await js(HELPERS)
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
  await wait(300)
  await tool('线段')
  await js(`window.__clickWorld(-4, 0)`)
  await wait(120)
  await js(`window.__clickWorld(0, 0)`)
  await wait(250)
  await tool('线段')
  await js(`window.__clickWorld(2, -2)`)
  await wait(120)
  await js(`window.__clickWorld(5, -1)`)
  await wait(300)
  await js(`window.__pickSeg(1)`)
  await wait(150)
  await js(`window.__apply('水平')`)
  await wait(700)

  const axBefore = await js(`window.__pointX('A')`)
  await js(`(async () => {
    const g = [...document.querySelectorAll('[data-id]')].find(el => el.querySelector('text')?.textContent === 'A');
    const c = g.querySelector('circle'); const r = c.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const opt = (cx, cy) => ({ bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0, buttons: 1 });
    const svg = document.querySelector('.canvas__svg');
    g.dispatchEvent(new PointerEvent('pointerdown', opt(x, y)));
    for (let i = 1; i <= 3; i++) {
      svg.dispatchEvent(new PointerEvent('pointermove', opt(x + i * 10, y)));
      await new Promise((r2) => setTimeout(r2, 40));
    }
    await new Promise((r2) => setTimeout(r2, 400));
    svg.dispatchEvent(new PointerEvent('pointerup', opt(x + 60, y)));
    await new Promise((r2) => setTimeout(r2, 800));
    return true;
  })()`)
  const axAfter = await js(`window.__pointX('A')`)
  report.dragCommit = { before: axBefore, after: axAfter, movedPx: axAfter - axBefore }
  if (Math.abs(axAfter - axBefore - 60) > 2) {
    throw new Error(`VERIFY FAILED 松手位置没生效：期望 +60px，实际 +${axAfter - axBefore}px`)
  }

  console.log('RESULT ' + JSON.stringify(report, null, 2))
  app.quit()
}

app.whenReady().then(main).catch((e) => {
  console.error('VERIFY FAILED', e)
  app.quit()
})
