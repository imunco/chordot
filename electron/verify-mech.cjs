/** 机构装配（mech）+ 符号公式实验室（独立窗口）验证（v0.14.0：23 部件 / 10 连接 / 18 预设） */
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { registerFileIpc } = require('./file-ipc.cjs')
const { registerStoreIpc } = require('./store.cjs')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')
fs.mkdirSync(outDir, { recursive: true })

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-mech-')))
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
/** 老脚本 180s；本轮新增 9 组预设运动 + 多选 / 吸附 / 测距 / 新部件 / 存档往返，放宽到 5 分钟 */
const watchdog = setTimeout(() => {
  console.log('TIMEOUT')
  app.quit()
}, 300000)

let symbolWin = null

/* ─────────── 规格 §2 / §6 的硬契约（脚本按它断言） ─────────── */
const EXPECT_PART_KINDS = [
  'ball', 'box', 'cart', 'plank', 'disc', 'hoop', 'wedge', 'weight',
  'anchor', 'bracket', 'wall', 'track', 'arcTrack',
  'pulley', 'movablePulley', 'gear', 'rack', 'wheel', 'flywheel', 'conveyor',
  'thruster', 'magnet', 'planet',
]
const EXPECT_LINK_TEXTS = ['弹簧', '阻尼', '绳', '杆', '铰链', '焊接', '皮带', '齿轮啮合', '齿轮齿条', '活塞']
const EXPECT_PRESETS = [
  '空白装配台', '弹簧振子', '水平弹簧振子', '单摆', '小车+弹簧', '杠杆', '斜面滑块', '圆弧轨道',
  '定滑轮', '滑轮组', '动滑轮', '电机轮', '齿轮传动', '带传动', '曲柄滑块', '液压缸', '火箭推力', '磁铁',
]
const EXPECT_CATS = [
  { cat: 'body', label: '刚体' },
  { cat: 'support', label: '支撑' },
  { cat: 'drive', label: '传动' },
  { cat: 'field', label: '装置' },
]
/** 每个分类下的部件按钮数（刚体 8 / 支撑 5 / 传动 7 / 装置 3 = 23） */
const CAT_PARTS = { body: 8, support: 5, drive: 7, field: 3 }
/** 部件 kind → 分类（拖放测试前要切到对应分类页签，按钮才可见） */
const PART_CAT = {
  ball: 'body', box: 'body', cart: 'body', plank: 'body', disc: 'body', hoop: 'body', wedge: 'body', weight: 'body',
  anchor: 'support', bracket: 'support', wall: 'support', track: 'support', arcTrack: 'support',
  pulley: 'drive', movablePulley: 'drive', gear: 'drive', rack: 'drive', wheel: 'drive', flywheel: 'drive', conveyor: 'drive',
  thruster: 'field', magnet: 'field', planet: 'field',
}
const sameSet = (a, b) => {
  const x = [...a].sort()
  const y = [...b].sort()
  return x.length === y.length && x.every((v, i) => v === y[i])
}

/**
 * 页面内的验证助手：读部件世界坐标 / 转角（优先取 data-x / data-y / data-angle，
 * 老组件没挂这些属性时退回 SVG 里的 rotate 变换），并统一发合成 PointerEvent。
 * 这个函数只在渲染进程里执行 —— 用 toString() 注入，省得在 Node 里手写转义。
 */
function pageHelpers() {
  const num = (v) => (typeof v === 'string' && v !== '' ? Number(v) : null)
  const els = () => [...document.querySelectorAll('[data-part]')]
  const geo = (g) => {
    const r = g.getBoundingClientRect()
    return { sx: r.left + r.width / 2, sy: r.top + r.height / 2, w: r.width, h: r.height }
  }
  const angleOf = (g) => {
    let a = num(g.dataset.angle)
    if (a === null) {
      const node = g.matches('[transform*="rotate("]') ? g : g.querySelector('[transform*="rotate("]')
      const tr = node ? String(node.getAttribute('transform') || '') : ''
      const i = tr.indexOf('rotate(')
      if (i >= 0) a = parseFloat(tr.slice(i + 7))
    }
    return a
  }
  const info = (g) =>
    Object.assign(
      { id: g.dataset.part, kind: g.dataset.kind, x: num(g.dataset.x), y: num(g.dataset.y), angle: angleOf(g) },
      geo(g),
    )
  const pick = (kind, idx) => {
    const a = els().filter((g) => g.dataset.kind === kind)
    if (idx === undefined || idx === null) return a[0]
    return idx < 0 ? a[a.length + idx] : a[idx]
  }
  const pointer = (el, type, opt) => {
    const r = el.getBoundingClientRect()
    const o = Object.assign(
      {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        isPrimary: true,
        pointerType: 'mouse',
        button: 0,
        clientX: r.left + r.width / 2,
        clientY: r.top + r.height / 2,
      },
      opt || {},
    )
    el.dispatchEvent(new PointerEvent(type, o))
  }
  const inputSet = (el, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    el.focus()
    set.call(el, String(v))
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    el.blur()
    return true
  }
  window.__v = {
    parts: () => els().map(info),
    part: (kind, idx) => {
      const g = pick(kind, idx)
      return g ? info(g) : null
    },
    count: (kind) => els().filter((g) => g.dataset.kind === kind).length,
    total: () => els().length,
    links: () => document.querySelectorAll('[data-link]').length,
    pxPerM: () => {
      const t = String((document.querySelector('.canvas__scale') || {}).textContent || '')
      const i = t.indexOf('=')
      return i >= 0 ? parseFloat(t.slice(i + 1)) : 40
    },
    tapDown: (kind, idx, opt) => {
      const g = pick(kind, idx)
      if (!g) return false
      pointer(g, 'pointerdown', opt)
      return true
    },
    tapUp: (kind, idx, opt) => {
      const g = pick(kind, idx)
      if (!g) return false
      pointer(g, 'pointerup', opt)
      return true
    },
    move: (kind, idx, opt) => {
      const g = pick(kind, idx)
      if (!g) return false
      pointer(g, 'pointermove', opt)
      return true
    },
    coord: (name) => {
      const row = [...document.querySelectorAll('.mechbar__fields label')].find((r) => r.textContent.trim().startsWith(name))
      return row ? Number(row.querySelector('input').value) : null
    },
    rowValue: (needle) => {
      const row = [...document.querySelectorAll('.mechbar__fields label')].find((r) => r.textContent.includes(needle))
      const el = row ? row.querySelector('input') : null
      return el ? Number(el.value) : null
    },
    rowHas: (needle) => [...document.querySelectorAll('.mechbar__fields label')].some((r) => r.textContent.includes(needle)),
    fields: () => [...document.querySelectorAll('.mechbar__fields label')].map((l) => l.textContent.trim()),
    inputValue: (sel) => {
      const el = document.querySelector(sel)
      return el && 'value' in el ? el.value : null
    },
    checked: (sel) => {
      const el = document.querySelector(sel)
      return el ? Boolean(el.checked) : null
    },
    setInputSel: (sel, v) => {
      const el = document.querySelector(sel)
      if (!el || !('value' in el)) return false
      return inputSet(el, v)
    },
    clickSel: (sel) => {
      const el = document.querySelector(sel)
      if (!el) return false
      el.click()
      return true
    },
    setSelect: (sel, v) => {
      const el = document.querySelector(sel)
      if (!el || el.tagName !== 'SELECT') return false
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
      set.call(el, String(v))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    },
  }
  return true
}

/** 页面内：整个机构场景的概要（老断言用） */
function pageState() {
  const bar = document.querySelector('.mechbar')
  return {
    mech: !!document.querySelector('.mech'),
    parts: document.querySelectorAll('[data-part]').length,
    kinds: [...document.querySelectorAll('[data-part]')].map((el) => el.dataset.kind).join(','),
    links: document.querySelectorAll('[data-link]').length,
    bar: !!bar,
    hint: bar ? (bar.querySelector('.mechbar__hint') ? bar.querySelector('.mechbar__hint').textContent : null) : null,
    live: bar ? (bar.querySelector('.mechbar__live') ? bar.querySelector('.mechbar__live').textContent : null) : null,
    multi: !!document.querySelector('.mechbar__multi'),
    status: (document.querySelector('.statusbar') || {}).textContent || '',
  }
}

app.whenReady().then(async () => {
  protocol.handle('app', (req) =>
    net.fetch(pathToFileURL(path.join(DIST, decodeURIComponent(new URL(req.url).pathname))).toString()),
  )
  ipcMain.handle('ui:get-state', () => ({}))
  ipcMain.on('ui:set-state', () => {})
  registerStoreIpc()
  registerFileIpc({ addRecent: () => {} })
  ipcMain.handle('window:fullscreen', () => true)
  ipcMain.on('lab:sync', () => {})
  ipcMain.handle('lab:capture', () => null)
  ipcMain.handle('update:info', () => ({ version: '0.0.0', mirrors: [] }))
  ipcMain.handle('update:check', () => ({ ok: true, current: '0.0.0', hasUpdate: false }))
  ipcMain.handle('app:about', () => ({ name: 'Chordot', version: '0.0.0', electron: '', chrome: '', node: '', repo: '' }))

  ipcMain.handle('symbol:apply', (_e, expr) => {
    win.webContents.send('symbol:apply', String(expr))
    return true
  })
  ipcMain.handle('symbol:open-window', () => {
    if (!symbolWin || symbolWin.isDestroyed()) {
      symbolWin = new BrowserWindow({
        width: 1200,
        height: 860,
        show: true,
        webPreferences: {
          preload: path.join(root, 'electron', 'preload.cjs'),
          contextIsolation: true,
          sandbox: true,
        },
      })
      void symbolWin.loadURL('app://chordot/index.html?symbols=1')
    }
    return true
  })

  const win = new BrowserWindow({
    width: 1440,
    height: 940,
    show: true,
    webPreferences: {
      preload: path.join(root, 'electron', 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  })

  /** 控制台错误（老 / 新 Electron 的 console-message 签名不同，两套都接住） */
  const errors = []
  win.webContents.on('console-message', (...args) => {
    let level = null
    let message = ''
    for (const a of args) {
      if (a && typeof a === 'object' && typeof a.message === 'string' && 'level' in a) {
        level = a.level
        message = a.message
        break
      }
    }
    if (!message && typeof args[1] === 'number') {
      level = args[1]
      message = String(args[2] || '')
    }
    if (!message) return
    if (level === 'error' || level === 3) errors.push(String(message).slice(0, 300))
  })

  await win.loadURL('app://chordot/index.html?notour=1')
  /** 执行页面脚本；失败时把代码片段打到终端，方便定位是哪一句 page JS 写错 */
  const js = (code) =>
    win.webContents.executeJavaScript(code, true).catch((err) => {
      console.log('PAGE JS FAILED >>> ' + String(code).slice(0, 400))
      throw err
    })
  const waitFor = async (expr, ms = 8000) => {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      try {
        if (await js(expr)) return true
      } catch (err) {
        /* 忽略错误继续等 */
      }
      await wait(80)
    }
    return false
  }
  const shot = async (name, target = win) => {
    const img = await target.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, name), img.toPNG())
  }

  const report = {}
  const failures = []
  let checks = 0
  const check = (ok, msg) => {
    checks += 1
    if (!ok) {
      failures.push(msg)
      console.log('VERIFY FAILED ' + msg)
    }
  }

  /* ─────────── 公共小工具 ─────────── */
  const installHelpers = () => js('(' + pageHelpers.toString() + ')()')
  const state = () => js('(' + pageState.toString() + ')()')

  const readPart = (kind, idx) => js('window.__v.part(' + JSON.stringify(kind) + ', ' + (idx === undefined ? 0 : idx) + ')')
  const allParts = () => js('window.__v.parts()')
  const totalParts = () => js('window.__v.total()')
  const totalLinks = () => js('window.__v.links()')
  const countKind = (kind) => js('window.__v.count(' + JSON.stringify(kind) + ')')

  /** 按选择器点第一个匹配元素；找不到返回 false（交给 check 报失败，别让脚本直接抛错） */
  const clickFirst = (sel) =>
    js('(function () { var el = document.querySelector(' + JSON.stringify(sel) + '); if (!el) return false; el.click(); return true })()')
  const clickWhere = (sel, expr) =>
    js('(function () {\n' +
      ' var el = [...document.querySelectorAll(' + JSON.stringify(sel) + ')].find(function (b) { ' + expr + ' })\n' +
      ' if (!el) return false\n' +
      ' el.click(); return true\n' +
      '})()')
  const clickCat = (cat) => clickFirst('.mechbar__cat[data-cat="' + cat + '"]')
  const visiblePartButtons = () => js('[...document.querySelectorAll(".mechbar__part")].filter(function (b) { return !b.hidden }).length')
  const clickPartButton = (kind) => clickWhere('.mechbar__part', 'return b.dataset.partKind === ' + JSON.stringify(kind))
  const clickLinkButton = (text) => clickWhere('.mechbar__link', 'return b.textContent.trim() === ' + JSON.stringify(text))
  const clickMini = (text) => clickWhere('.mechbar__mini', 'return b.textContent.trim() === ' + JSON.stringify(text))
  const clickMiniIncludes = (needle) => clickWhere('.mechbar__mini', 'return b.textContent.includes(' + JSON.stringify(needle) + ')')
  const clickPreset = (name) => clickWhere('.mechbar__presets button', 'return b.textContent.includes(' + JSON.stringify(name) + ')')
  const openPreset = async (name, ms) => {
    await clickPreset(name)
    await wait(ms || 780)
  }
  const openEmpty = async () => {
    await js('document.querySelector(".toolbar__menu-anchor .tbtn").click()')
    await wait(220)
    const ok = await js('(function () { var b = [...document.querySelectorAll(".menu__item")].find(function (x) { return x.textContent.includes("空白装配台") }); if (!b) return false; b.click(); return true })()')
    await wait(650)
    return ok
  }
  const tapPart = async (kind, idx, mods) => {
    const ok = await js('window.__v.tapDown(' + JSON.stringify(kind) + ', ' + (idx === undefined ? 0 : idx) + ', ' + JSON.stringify(mods || {}) + ')')
    await wait(60)
    await js('window.__v.tapUp(' + JSON.stringify(kind) + ', ' + (idx === undefined ? 0 : idx) + ', ' + JSON.stringify(mods || {}) + ')')
    await wait(140)
    return ok
  }
  /** 拖动：pointerdown / 两段 pointermove / pointerup 分四次 executeJavaScript 发，避免合成事件被合并 */
  const dragPart = async (kind, idx, dx, dy) => {
    const p = await readPart(kind, idx)
    if (!p) return null
    const x0 = Math.round(p.sx)
    const y0 = Math.round(p.sy)
    const down = await js('window.__v.tapDown(' + JSON.stringify(kind) + ', ' + idx + ', { clientX: ' + x0 + ', clientY: ' + y0 + ', buttons: 1 })')
    if (!down) return null
    await wait(80)
    await js('window.__v.move(' + JSON.stringify(kind) + ', ' + idx + ', { clientX: ' + (x0 + Math.round(dx / 2)) + ', clientY: ' + (y0 + Math.round(dy / 2)) + ', buttons: 1 })')
    await wait(60)
    await js('window.__v.move(' + JSON.stringify(kind) + ', ' + idx + ', { clientX: ' + (x0 + dx) + ', clientY: ' + (y0 + dy) + ', buttons: 1 })')
    await wait(60)
    await js('window.__v.tapUp(' + JSON.stringify(kind) + ', ' + idx + ', { clientX: ' + (x0 + dx) + ', clientY: ' + (y0 + dy) + ' })')
    await wait(380)
    return { x0: x0, y0: y0 }
  }
  const playingNow = () => js('String((document.querySelector(".mechbar__play") || {}).textContent || "").includes("暂停")')
  const ensurePlaying = async (want) => {
    for (let i = 0; i < 4; i += 1) {
      const now = await playingNow()
      if (now === want) return true
      await js('(function () { var b = document.querySelector(".mechbar__play"); if (b) b.click() })()')
      await wait(180)
    }
    return false
  }

  /** 从部件盘按钮做一次 HTML5 拖放到画布（DataTransfer 挂在 window 上跨 executeJavaScript 复用） */
  const dragPartButtonToCanvas = async (kind, slot) => {
    const cat = PART_CAT[kind]
    if (cat) {
      await clickCat(cat)
      await wait(160)
    }
    const visible = await js('(function () { var b = [...document.querySelectorAll(".mechbar__part")].find(function (x) { return x.dataset.partKind === ' + JSON.stringify(kind) + ' }); return b ? !b.hidden : null })()')
    const rect = await js('(function () { var r = document.querySelector(".canvas__svg").getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height } })()')
    const clientX = Math.round(rect.left + rect.width * (0.55 + slot * 0.05))
    const clientY = Math.round(rect.top + rect.height * (0.42 + slot * 0.03))
    const started = await js('(function () {\n' +
      ' window.__dt = new DataTransfer()\n' +
      ' var b = [...document.querySelectorAll(".mechbar__part")].find(function (x) { return x.dataset.partKind === ' + JSON.stringify(kind) + ' })\n' +
      ' if (!b) return false\n' +
      ' b.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: window.__dt }))\n' +
      ' if (window.__dt.types.length === 0) window.__dt.setData("text/chordot-mech", ' + JSON.stringify(kind) + ')\n' +
      ' return [...window.__dt.types].join(",")\n' +
      '})()')
    // 按钮没找到（分类 / 搜索被改）就别再发 dragover / drop：dataTransfer 为空会让页面的拖放处理器抛错
    if (!started) return { visible: visible, started: started }
    await wait(120)
    await js('(function () {\n' +
      ' var svg = document.querySelector(".canvas__svg")\n' +
      ' svg.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: window.__dt, clientX: ' + clientX + ', clientY: ' + clientY + ' }))\n' +
      ' return true\n' +
      '})()')
    await wait(80)
    await js('(function () {\n' +
      ' var svg = document.querySelector(".canvas__svg")\n' +
      ' svg.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: window.__dt, clientX: ' + clientX + ', clientY: ' + clientY + ' }))\n' +
      ' return true\n' +
      '})()')
    await wait(420)
    return { visible: visible, started: started }
  }

  const readMechFile = (file) => {
    if (!fs.existsSync(file)) return null
    try {
      const doc = JSON.parse(fs.readFileSync(file, 'utf8'))
      const scene = doc && doc.doc ? doc.doc.scene : null
      return scene && scene.kind === 'mech' ? scene.params : null
    } catch (err) {
      return null
    }
  }
  /** 存到指定路径；saveAs=true 时用「另存为」（Ctrl+Shift+S），否则当前文件已有路径会直接存回去 */
  const saveDoc = async (file, saveAs) => {
    try {
      fs.unlinkSync(file)
    } catch (err) {
      /* 不存在就算了 */
    }
    process.env.CHORDOT_TEST_SAVE = file
    const mods = saveAs ? { key: 's', ctrlKey: true, shiftKey: true, bubbles: true } : { key: 's', ctrlKey: true, bubbles: true }
    await js('window.dispatchEvent(new KeyboardEvent("keydown", ' + JSON.stringify(mods) + '))')
    await wait(1200)
  }
  const openDoc = async (file) => {
    process.env.CHORDOT_TEST_OPEN = file
    process.env.CHORDOT_TEST_CONFIRM = '1'
    await js('window.dispatchEvent(new KeyboardEvent("keydown", { key: "o", ctrlKey: true, bubbles: true }))')
    await wait(1600)
  }

  await wait(1600)
  await installHelpers()
  await wait(120)

  /* ── 1. 从菜单打开机构装配 ── */
  await js('document.querySelector(".toolbar__menu-anchor .tbtn").click()')
  await wait(220)
  const menuHit = await js('(function () {\n' +
    ' var b = [...document.querySelectorAll(".menu__item")].find(function (x) { return x.textContent.includes("机构装配：弹簧振子") })\n' +
    ' if (!b) return false\n' +
    ' b.click()\n' +
    ' return true\n' +
    '})()')
  check(menuHit, '⋯ 菜单里没有「机构装配：弹簧振子」')
  await waitFor('!!document.querySelector(".mech")')
  await wait(700)

  report.open = await state()
  check(report.open.mech === true, '机构场景没有渲染到画布上')
  check(report.open.parts === 2, '弹簧振子应该有 2 个部件（' + report.open.parts + '）')
  check(report.open.kinds === 'anchor,ball', '部件种类不对（' + report.open.kinds + '）')
  check(report.open.links === 1, '弹簧振子应该有 1 条连接（' + report.open.links + '）')
  check(report.open.bar === true, '没有出现部件盘')
  await shot('mech-1-open.png')

  /* ── 1b. 部件盘 4 分类 / 23 部件 / 10 连接 / 18 预设（规格 §6 / §7.1） ── */
  report.catalog = await js('(function () {\n' +
    ' var partBtns = [...document.querySelectorAll(".mechbar__part")]\n' +
    ' var cats = [...document.querySelectorAll(".mechbar__cat")]\n' +
    ' var links = [...document.querySelectorAll(".mechbar__link")]\n' +
    ' var liveEl = document.querySelector(".mechbar__live")\n' +
    ' return {\n' +
    '  cats: cats.map(function (b) { return { cat: b.dataset.cat, label: b.textContent.trim() } }),\n' +
    '  partButtons: partBtns.length,\n' +
    '  partKinds: partBtns.map(function (b) { return b.dataset.partKind }),\n' +
    '  links: links.length,\n' +
    '  linkTexts: links.map(function (b) { return b.textContent.trim() }),\n' +
    '  presets: [...document.querySelectorAll(".mechbar__presets button")].map(function (b) { return b.textContent.trim() }),\n' +
    '  live: liveEl ? liveEl.textContent : null\n' +
    ' }\n' +
    '})()')
  check(report.catalog.cats.length === 4, '部件盘分类不是 4 个（' + report.catalog.cats.length + '）')
  check(
    report.catalog.cats.map(function (c) { return c.cat }).join(',') === EXPECT_CATS.map(function (c) { return c.cat }).join(','),
    '分类 data-cat 不对（' + report.catalog.cats.map(function (c) { return c.cat }).join(',') + '）',
  )
  check(
    report.catalog.cats.map(function (c) { return c.label }).join(',') === EXPECT_CATS.map(function (c) { return c.label }).join(','),
    '分类文案不对（' + report.catalog.cats.map(function (c) { return c.label }).join(',') + '）',
  )
  check(report.catalog.partButtons === 23, '部件按钮不是 23 个（' + report.catalog.partButtons + '）——规格要求全部渲染在 DOM 里')
  check(sameSet(report.catalog.partKinds, EXPECT_PART_KINDS), '部件按钮 data-part-kind 与 23 种目录不一致（' + report.catalog.partKinds.join(',') + '）')
  check(report.catalog.links === 10, '连接按钮不是 10 个（' + report.catalog.links + '）')
  check(sameSet(report.catalog.linkTexts, EXPECT_LINK_TEXTS), '连接按钮文案不对（' + report.catalog.linkTexts.join('/') + '）')
  check(report.catalog.presets.length === 18, '预设按钮不是 18 个（' + report.catalog.presets.length + '）')
  check(sameSet(report.catalog.presets, EXPECT_PRESETS), '预设按钮文案与 18 个预设不一致（' + report.catalog.presets.join('/') + '）')
  check(String(report.catalog.live).includes('动能'), '底部没有实时读数（.mechbar__live 含动能）')

  // 切分类：可见部件按钮数必须变（刚体 8 / 支撑 5 / 传动 7 / 装置 3）
  report.cats = []
  for (let i = 0; i < EXPECT_CATS.length; i += 1) {
    const c = EXPECT_CATS[i]
    await clickCat(c.cat)
    await wait(200)
    const vis = await visiblePartButtons()
    const active = await js('(function () { var b = document.querySelector(".mechbar__cat[data-cat=\\"' + c.cat + '\\"]"); return b ? b.dataset.active : null })()')
    report.cats.push({ cat: c.cat, visible: vis, active: active })
    check(vis === CAT_PARTS[c.cat], '分类「' + c.label + '」可见部件按钮数不对（' + vis + '，期望 ' + CAT_PARTS[c.cat] + '）')
    check(String(active) === 'true', '分类「' + c.label + '」没有 data-active 标记（' + active + '）')
  }
  await clickCat('body')
  await wait(160)

  // 网格 / 世界面板默认值 / 部件 data-* 钩子（验证脚本靠它们读坐标）
  report.hooks = await js('(function () {\n' +
    ' var grid = document.querySelector(".mech__grid")\n' +
    ' var ps = window.__v.parts()\n' +
    ' return {\n' +
    '  gridOverlay: !!grid,\n' +
    '  dataGrid: grid ? grid.getAttribute("data-grid") : null,\n' +
    '  partCount: ps.length,\n' +
    '  withXY: ps.filter(function (p) { return p.x !== null && p.y !== null }).length,\n' +
    '  gravity: (document.querySelector(".mechbar__gravity input") || {}).value,\n' +
    '  timeScale: (document.querySelector("[data-field=\\"timeScale\\"] input") || {}).value,\n' +
    '  collisions: (document.querySelector("[data-field=\\"collisions\\"] input") || {}).checked,\n' +
    '  gridSel: (document.querySelector("[data-field=\\"grid\\"]") || {}).value\n' +
    ' }\n' +
    '})()')
  check(report.hooks.gridOverlay, '画布没有渲染标尺网格 .mech__grid')
  check(report.hooks.dataGrid !== null, '.mech__grid 缺少 data-grid 属性（规格 §7.4）')
  check(report.hooks.withXY === report.hooks.partCount, '部件 <g> 缺少 data-x / data-y（' + report.hooks.withXY + '/' + report.hooks.partCount + '），验证脚本读不到坐标')
  check(report.hooks.gravity !== undefined && report.hooks.gravity !== null, '世界面板没有重力输入框 .mechbar__gravity')
  check(report.hooks.timeScale !== undefined && report.hooks.timeScale !== null, '世界面板没有时间倍率输入框')
  check(report.hooks.collisions !== undefined && report.hooks.collisions !== null, '世界面板没有碰撞开关')
  check(String(report.hooks.gridSel) === '0.1', '网格吸附下拉默认值不是 0.1（' + report.hooks.gridSel + '）')

  /* ── 2. 播放 / 暂停 / 重置 + 实时读数（老断言 + 规格 §7.6） ── */
  const ballY = async () => {
    const p = await readPart('ball', 0)
    return p ? p.y : null
  }
  const y0 = await ballY()
  await ensurePlaying(true)
  await wait(420)
  const y1 = await ballY()
  await wait(420)
  const y2 = await ballY()
  await wait(700)
  const y3 = await ballY()
  report.play = { y0: y0, y1: y1, y2: y2, y3: y3 }
  check(y1 !== y0, '点播放后小球没有动')
  check(y3 !== y2, '小球停住了（没有继续振动）')

  const live1 = await js('String((document.querySelector(".mechbar__live") || {}).textContent || "")')
  await wait(520)
  const live2 = await js('String((document.querySelector(".mechbar__live") || {}).textContent || "")')
  report.live = { a: String(live1).slice(0, 120), b: String(live2).slice(0, 120), changed: live1 !== live2 }
  check(String(live1).includes('动能'), '实时读数里没有动能（' + String(live1).slice(0, 60) + '）')
  check(live1 !== live2, '播放时底部实时读数没有更新（' + String(live1).slice(0, 60) + '）')
  await shot('mech-2-play.png')

  await ensurePlaying(false)
  await wait(200)
  const paused1 = await ballY()
  await wait(500)
  const paused2 = await ballY()
  check(Math.abs(paused1 - paused2) < 1e-3, '暂停后小球还在动（' + paused1 + ' → ' + paused2 + '）')

  await js('(function () { var b = [...document.querySelectorAll(".mechbar__mini")].find(function (x) { return x.textContent.trim() === "重置" }); if (b) b.click() })()')
  await wait(400)
  const yReset = await ballY()
  check(Math.abs(yReset - y0) < 0.02, '重置没有回到初始位置（' + y0 + ' → ' + yReset + '）')

  /* ── 3. 加部件 / 连线 / 改 k / 拆除 / 撤销 / 拆开全部 ── */
  await js('(function () { var b = [...document.querySelectorAll(".mechbar__part")].find(function (x) { return x.dataset.partKind === "box" }); if (b) b.click() })()')
  await wait(400)
  report.addPart = await state()
  check(report.addPart.parts === 3, '点「方块」没有加上部件（' + report.addPart.parts + '）')
  check(report.addPart.kinds.includes('box'), '方块没有出现在场景里')

  // 连接：点「弹簧」→ 点方块 → 点小球
  const clickPart = (kind) =>
    js('(function () {\n' +
      ' var g = [...document.querySelectorAll("[data-part]")].find(function (el) { return el.dataset.kind === ' + JSON.stringify(kind) + ' })\n' +
      ' if (!g) return false\n' +
      ' g.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 7, isPrimary: true, pointerType: "mouse", button: 0, clientX: 0, clientY: 0 }))\n' +
      ' g.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerId: 7, pointerType: "mouse", button: 0, clientX: 0, clientY: 0 }))\n' +
      ' return true\n' +
      '})()')
  await clickLinkButton('弹簧')
  await wait(250)
  report.pending = await js('!!document.querySelector(".mechbar__link[data-active=\\"true\\"]")')
  check(report.pending, '点「弹簧」没有进入连接模式')
  await clickPart('box')
  await wait(250)
  report.anchorHint = await js('String((document.querySelector(".mechbar__hint") || {}).textContent || "")')
  check(String(report.anchorHint).includes('再点一个部件'), '选了起点后没有提示再点第二个部件')
  await clickPart('ball')
  await wait(500)
  report.link2 = await state()
  check(report.link2.links === 2, '连线没有成功（' + report.link2.links + '）')
  await shot('mech-3-link.png')

  // 检查器：选中新弹簧，改 k
  const kBefore = await js('window.__v.rowValue("劲度")')
  check(kBefore !== null, '选中弹簧后没有显示劲度 k')
  if (kBefore !== null) {
    await js('(function () {\n' +
      ' var row = [...document.querySelectorAll(".mechbar__fields label")].find(function (r) { return r.textContent.includes("劲度") })\n' +
      ' var i = row.querySelector("input")\n' +
      ' var set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set\n' +
      ' i.focus(); set.call(i, "40"); i.dispatchEvent(new Event("input", { bubbles: true })); i.blur()\n' +
      ' return true\n' +
      '})()')
    await wait(400)
    report.k = { before: kBefore, after: await js('window.__v.rowValue("劲度")') }
    check(report.k.after === 40, '改劲度没有生效（' + report.k.before + ' → ' + report.k.after + '）')
  }

  // 拆除这条连接（删掉的是新加的那条，原来的弹簧还在）
  await js('(function () { var b = document.querySelector(".mechbar__del"); if (b) b.click() })()')
  await wait(400)
  report.unlink = await state()
  check(report.unlink.links === 1, '拆除连接没有生效（' + report.unlink.links + '）')

  // 撤销 → 回到 2 条
  await js('window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }))')
  await wait(400)
  report.undo = await state()
  check(report.undo.links === 2, '撤销没有恢复连接（' + report.undo.links + '）')

  // 拆开全部连接 → 0 条，部件还在
  await clickMini('拆开全部连接')
  await wait(500)
  report.split = await state()
  check(report.split.links === 0, '拆开全部连接没有生效（' + report.split.links + '）')
  check(report.split.parts === 3, '拆开后部件丢了（' + report.split.parts + '）')
  await shot('mech-4-split.png')
  await js('window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }))')
  await wait(400)

  /* ── 4. 拖动部件（改的是文档坐标，撤销能回去） ── */
  const posOf = () => js('({ x: window.__v.coord("x"), y: window.__v.coord("y") })')
  // 播放后处于「真实」模式，拖动是施力；要改坐标得先切回「编辑」
  await js('(function () { var b = [...document.querySelectorAll(".mechbar__seg button")].find(function (x) { return x.textContent.trim() === "编辑" }); if (b) b.click() })()')
  await wait(400)
  report.editMode = await js('(function () {\n' +
    ' var seg = [...document.querySelectorAll(".mechbar__seg button")]\n' +
    ' var active = seg.find(function (b) { return b.dataset.active === "true" })\n' +
    ' return { seg: seg.map(function (b) { return b.textContent.trim() }), active: active ? active.textContent : null }\n' +
    '})()')
  check(report.editMode.seg.length === 2, '没有编辑/真实模式切换（' + JSON.stringify(report.editMode) + '）')
  check(report.editMode.active === '编辑', '切回编辑模式失败（' + report.editMode.active + '）')
  await clickPart('box')
  await wait(350)
  const before = await posOf()
  await dragPart('box', 0, 50, -40)
  const after = await posOf()
  report.drag = { before: before, after: after, data: await readPart('box', 0) }
  check(
    before.x !== null && after.x !== null && (after.x !== before.x || after.y !== before.y),
    '拖动部件没有写回坐标（' + JSON.stringify(before) + ' → ' + JSON.stringify(after) + '）',
  )

  /* ── 5. 保存成 .chordot：机构要能存下来（老断言） ── */
  const savePath = path.join(outDir, 'mech-verify.chordot')
  await saveDoc(savePath)
  const rawSaved = fs.existsSync(savePath) ? fs.readFileSync(savePath, 'utf8') : ''
  const saved = rawSaved.replace(/\s+/g, '')
  report.save = { exists: !!rawSaved, hasMech: saved.includes('"kind":"mech"'), hasSpring: saved.includes('"spring"') }
  check(report.save.hasMech, '保存的课件里没有机构场景')
  check(report.save.hasSpring, '保存的课件里没有弹簧连接')

  // 重新打开这份课件：机构要能原样回来
  await openDoc(savePath)
  report.reopen = await state()
  check(report.reopen.mech === true, '重新打开的课件里没有机构场景')
  check(report.reopen.parts === 3, '重新打开后部件数不对（' + report.reopen.parts + '）')
  check(report.reopen.links === 2, '重新打开后连接数不对（' + report.reopen.links + '）')

  /* ── 6. 轨道 / 复制机构 / 矢量 / 公式力（老断言） ── */
  await js('(function () { var b = [...document.querySelectorAll(".mechbar__part")].find(function (x) { return x.dataset.partKind === "track" }); if (b) b.click() })()')
  await wait(450)
  report.track = await js('(function () {\n' +
    ' var kinds = [...document.querySelectorAll("[data-part]")].map(function (e) { return e.dataset.kind })\n' +
    ' return { kinds: kinds.join(","), hasAngle: window.__v.rowHas("倾角") }\n' +
    '})()')
  check(report.track.kinds.includes('track'), '没有加上轨道（' + report.track.kinds + '）')
  check(report.track.hasAngle, '轨道没有倾角字段')
  await js('(function () {\n' +
    ' var row = [...document.querySelectorAll(".mechbar__fields label")].find(function (r) { return r.textContent.includes("倾角") })\n' +
    ' var i = row.querySelector("input")\n' +
    ' var set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set\n' +
    ' i.focus(); set.call(i, "30"); i.dispatchEvent(new Event("input", { bubbles: true })); i.blur()\n' +
    ' return true\n' +
    '})()')
  await wait(400)
  report.trackAngle = await js('window.__v.rowValue("倾角")')
  check(report.trackAngle === 30, '轨道倾角没写进去（' + report.trackAngle + '）')

  const beforeDup = await state()
  await clickMini('复制机构')
  await wait(500)
  const afterDup = await state()
  report.duplicate = { before: beforeDup.parts, after: afterDup.parts }
  check(afterDup.parts >= beforeDup.parts * 2 - 1, '复制机构没有复制部件（' + beforeDup.parts + ' → ' + afterDup.parts + '）')

  // 矢量开关：按钮 data-active / 文案要翻转；播放时箭头叠加层 [data-vectors] 出现
  const vecBtnState = () => js('(function () {\n' +
    ' var b = [...document.querySelectorAll(".mechbar__mini")].find(function (x) { return x.textContent.includes("矢量") })\n' +
    ' return b ? { text: b.textContent.trim(), active: b.dataset.active } : null\n' +
    '})()')
  const vecBefore = await vecBtnState()
  await clickMiniIncludes('矢量')
  await wait(300)
  const vecAfterOff = await vecBtnState()
  report.vectors = { before: vecBefore, off: vecAfterOff }
  check(
    vecBefore && vecAfterOff && (vecBefore.text !== vecAfterOff.text || String(vecBefore.active) !== String(vecAfterOff.active)),
    '矢量开关没有生效（' + JSON.stringify(report.vectors) + '）',
  )
  await clickMiniIncludes('矢量')
  await wait(200)
  await ensurePlaying(true)
  await wait(650)
  const vecOverlay = await js('!!document.querySelector("[data-vectors]")')
  await ensurePlaying(false)
  report.vectors.overlay = vecOverlay
  check(vecOverlay, '播放时没有画速度 / 受力箭头（[data-vectors]）')

  // 公式力：选中方块，给 30 N 沿 +x，播放后应该被推走
  await clickPart('box')
  await wait(350)
  const fOk = await js('(function () {\n' +
    ' var cb = [...document.querySelectorAll(".mechbar__force input[type=checkbox]")][0]\n' +
    ' if (!cb) return false\n' +
    ' if (!cb.checked) cb.click()\n' +
    ' var rows = [...document.querySelectorAll(".mechbar__force label")]\n' +
    ' var mag = rows.find(function (r) { return r.textContent.includes("大小") })\n' +
    ' if (!mag) return "no-mag"\n' +
    ' var i = mag.querySelector("input")\n' +
    ' var set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set\n' +
    ' i.focus(); set.call(i, "30"); i.dispatchEvent(new Event("input", { bubbles: true })); i.blur()\n' +
    ' var dir = rows.find(function (r) { return r.textContent.includes("方向") })\n' +
    ' var d = dir && dir.querySelector("input")\n' +
    ' if (d) { d.focus(); set.call(d, "0"); d.dispatchEvent(new Event("input", { bubbles: true })); d.blur() }\n' +
    ' return true\n' +
    '})()')
  check(fOk === true, '选中方块后没有恒力输入框（' + fOk + '）')
  await wait(350)
  const boxScreenX = async () => {
    const p = await readPart('box', 0)
    return p ? Math.round(p.sx) : null
  }
  const fx0 = await boxScreenX()
  await ensurePlaying(true)
  await wait(1000)
  const fx1 = await boxScreenX()
  await ensurePlaying(false)
  report.forceExpr = { before: fx0, after: fx1 }
  check(fx0 !== null && fx1 !== null && fx1 > fx0 + 8, '施加的力没有推动方块（' + fx0 + ' → ' + fx1 + '）')

  /* ── 7. 符号公式实验室（独立窗口，老断言） ── */
  await js('window.chordot.openSymbolWindow()')
  const t0 = Date.now()
  while (Date.now() - t0 < 9000 && (!symbolWin || symbolWin.isDestroyed() || symbolWin.webContents.isLoading())) {
    await wait(150)
  }
  check(!!symbolWin && !symbolWin.isDestroyed(), '符号实验室窗口没有创建')
  if (symbolWin && !symbolWin.isDestroyed()) {
    await wait(1200)
    const sjs = (c) => symbolWin.webContents.executeJavaScript(c, true)
    report.sym = await sjs('(function () { return {\n' +
      ' root: !!document.querySelector(".symlab"),\n' +
      ' chips: document.querySelectorAll(".symlab__chip").length,\n' +
      ' tokens: (document.querySelector(".symlab__tokens") || {}).textContent,\n' +
      ' now: (document.querySelector(".symlab__now") || {}).textContent\n' +
      '} })()')
    check(report.sym.root === true, '符号实验室没有渲染')
    check(report.sym.chips >= 15, '符号太少（' + report.sym.chips + '）')
    check(String(report.sym.tokens).includes('k'), '默认公式不对（' + report.sym.tokens + '）')
    await shot('mech-5-symbols.png', symbolWin)

    const symBallX = () => sjs('(function () { var c = document.querySelector(".symlab__svg circle"); return c ? Number(c.getAttribute("cx")) : null })()')
    const b1 = await symBallX()
    await wait(800)
    const b2 = await symBallX()
    check(b1 !== b2, '拼好的公式没有作用到小球上（小球没动）')

    // 清空 → 点 m → 点 g → 自动补乘号，F 应为 m*g ≈ 9.8
    await sjs('(function () { var b = [...document.querySelectorAll(".symlab__keys button")].find(function (x) { return x.textContent === "清空" }); if (b) b.click() })()')
    await wait(150)
    await sjs('(function () { var b = [...document.querySelectorAll(".symlab__chip")].find(function (x) { return x.dataset.sym === "m" }); if (b) b.click() })()')
    await sjs('(function () { var b = [...document.querySelectorAll(".symlab__chip")].find(function (x) { return x.dataset.sym === "g" }); if (b) b.click() })()')
    await wait(600)
    report.build = await sjs('(function () { return {\n' +
      ' tokens: (document.querySelector(".symlab__tokens") || {}).textContent,\n' +
      ' now: (document.querySelector(".symlab__now") || {}).textContent,\n' +
      ' err: String((document.querySelector(".symlab__err") || {}).textContent || "")\n' +
      '} })()')
    check(String(report.build.tokens).includes('m·g'), '符号拼公式没有自动补乘号（' + report.build.tokens + '）')
    check(String(report.build.now).includes('9.80'), 'm·g 没有算成 9.8 N（' + report.build.now + '）')
    check(report.build.err === '', '公式报错：' + report.build.err)

    // 预设：弹簧回复力
    await sjs('(function () { var b = [...document.querySelectorAll(".symlab__presets button")].find(function (x) { return x.textContent.includes("弹簧回复力") }); if (b) b.click() })()')
    await wait(500)
    const presetFormula = await sjs('String((document.querySelector(".symlab__tokens") || {}).textContent || "")')
    check(String(presetFormula).includes('k'), '预设「弹簧回复力」没有生效（' + presetFormula + '）')
    await shot('mech-6-formula.png', symbolWin)

    // 发送到机构：主窗口里选中的方块应该收到这条公式
    await sjs('(function () { var b = document.querySelector(".symlab__send"); if (b) b.click() })()')
    await wait(700)
    report.bridge = await js('(function () { return {\n' +
      ' expr: (document.querySelector(".mechbar__expr") || {}).value === undefined ? null : document.querySelector(".mechbar__expr").value,\n' +
      ' on: (document.querySelector(".mechbar__force input[type=checkbox]") || {}).checked === undefined ? null : document.querySelector(".mechbar__force input[type=checkbox]").checked\n' +
      '} })()')
    check(String(report.bridge.expr).includes('k'), '公式没有发到机构（' + report.bridge.expr + '）')
    check(report.bridge.on === true, '发过来的公式没有自动启用')

    // 关掉符号窗口：它一开着，主窗口的 rAF 会被后台节流，后面测轨道 / 播放就不动了
    symbolWin.close()
    await wait(500)
  }

  /* ── 8. 滑轮组 / 铰链 / 轨道约束 / 受力分解 / 复制与成组（老断言） ── */
  const clickPartKind = (kind, idx, last) =>
    js('(function () {\n' +
      ' var gs = [...document.querySelectorAll("[data-part]")].filter(function (e) { return e.dataset.kind === ' + JSON.stringify(kind) + ' })\n' +
      ' var g = ' + (last ? 'gs[gs.length - 1]' : 'gs[' + (idx || 0) + ']') + ';\n' +
      ' if (!g) return false\n' +
      ' g.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 5, isPrimary: true, pointerType: "mouse", button: 0 }))\n' +
      ' return true\n' +
      '})()')

  // 滑轮组：一根绳穿两个滑轮 → 折线 4 个点（球、滑轮1、滑轮2、球）
  await openPreset('滑轮组', 700)
  report.pulleyGroup = await js('(function () {\n' +
    ' var nodes = [...document.querySelectorAll("[data-kind=rope]")]\n' +
    ' var poly = nodes.find(function (n) { return n.getAttribute && n.getAttribute("points") })\n' +
    ' if (!poly && nodes[0] && nodes[0].querySelector) poly = nodes[0].querySelector("polyline")\n' +
    ' var raw = poly ? String(poly.getAttribute("points") || "").trim() : ""\n' +
    ' var pts = raw ? raw.split(/ +/).length : 0\n' +
    ' return { parts: document.querySelectorAll("[data-part]").length, pts: pts }\n' +
    '})()')
  check(report.pulleyGroup.parts === 4, '滑轮组部件数不对（' + report.pulleyGroup.parts + '）')
  check(report.pulleyGroup.pts === 4, '绳没有绕过两个滑轮（折线 ' + report.pulleyGroup.pts + ' 点）')

  // 铰链：空白场景 + 两个球 → 点铰链 → 依次点两个球
  check(await openEmpty(), '菜单里没有「空白装配台」')
  await clickPartButton('ball')
  await wait(320)
  await clickPartButton('ball')
  await wait(320)
  await clickLinkButton('铰链')
  await wait(260)
  await clickPartKind('ball', 0)
  await wait(320)
  await clickPartKind('ball', 1)
  await wait(420)
  report.hinge = await js('(function () {\n' +
    ' var head = document.querySelector(".mechbar__insphead")\n' +
    ' return { kind: document.querySelector("[data-kind=hinge]") ? "hinge" : null, head: head ? head.textContent : null }\n' +
    '})()')
  check(report.hinge.kind === 'hinge', '铰链没有连上')
  check(String(report.hinge.head).startsWith('铰链'), '铰链检查器不对（' + report.hinge.head + '）')

  // 受力分解：弹簧振子里选中球，打开分力 → 应该有 G / F弹 标签
  await openPreset('弹簧振子', 620)
  await clickMiniIncludes('受力分解')
  await wait(220)
  await clickPartKind('ball', 0)
  await wait(420)
  report.decompose = await js('(function () {\n' +
    ' var d = document.querySelector("[data-decompose]")\n' +
    ' return { on: !!d, text: d ? d.textContent : "" }\n' +
    '})()')
  check(report.decompose.on, '受力分解没有画出来')
  check(String(report.decompose.text).includes('G'), '分力里没有重力（' + report.decompose.text + '）')

  // 轨道约束：空白场景 + 轨道（20°）+ 新球挂到轨道上 → 沿斜面滑，不竖直掉落
  check(await openEmpty(), '菜单里没有「空白装配台」')
  await clickPartButton('track')
  await wait(320)
  await js('(function () {\n' +
    ' var row = [...document.querySelectorAll(".mechbar__fields label")].find(function (r) { return r.textContent.includes("倾角") })\n' +
    ' var i = row.querySelector("input"); var set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set\n' +
    ' i.focus(); set.call(i, "20"); i.dispatchEvent(new Event("input", { bubbles: true })); i.blur(); return true\n' +
    '})()')
  await wait(320)
  await clickPartButton('ball')
  await wait(320)
  const railSel = await js('(function () {\n' +
    ' var row = [...document.querySelectorAll(".mechbar__fields label")].find(function (r) { return r.textContent.includes("轨道约束") })\n' +
    ' var s = row && row.querySelector("select")\n' +
    ' if (!s) return false\n' +
    ' var opt = [...s.options].find(function (o) { return o.value })\n' +
    ' if (!opt) return false\n' +
    ' var set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set\n' +
    ' set.call(s, opt.value); s.dispatchEvent(new Event("change", { bubbles: true })); return true\n' +
    '})()')
  check(railSel, '没有「轨道约束」下拉')
  await wait(320)
  const ballPos = async () => {
    const p = await readPart('ball', -1)
    return p ? { x: Math.round(p.sx), y: Math.round(p.sy) } : null
  }
  await ensurePlaying(true)
  await wait(450)
  const rp1 = await ballPos()
  await wait(800)
  const rp2 = await ballPos()
  await ensurePlaying(false)
  report.rail = { p1: rp1, p2: rp2 }
  const rdx = rp1 && rp2 ? Math.abs(rp2.x - rp1.x) : 0
  const rdy = rp1 && rp2 ? Math.abs(rp2.y - rp1.y) : 0
  check(rdx > 5, '轨道约束下小球没有沿轨道移动（dx=' + rdx + '）')
  check(rdx > 0 && rdy / rdx > 0.15 && rdy / rdx < 0.7, '小球没按 20° 轨道滑（dy/dx=' + (rdx ? (rdy / rdx).toFixed(3) : 'n/a') + '）')

  // 复制部件 / 成组拖动（弹簧振子：球 + 锚点成组，拖球锚点跟着走）
  await openPreset('弹簧振子', 620)
  await clickPartKind('ball', 0)
  await wait(350)
  const partsBefore = await totalParts()
  await js('(function () { var b = [...document.querySelectorAll(".mechbar__actions .mechbar__mini")].find(function (x) { return x.textContent.trim() === "复制部件" }); if (b) b.click() })()')
  await wait(420)
  report.duplicatePart = { before: partsBefore, after: await totalParts() }
  check(report.duplicatePart.after === partsBefore + 1, '复制部件没生效（' + partsBefore + ' → ' + report.duplicatePart.after + '）')

  await clickPartKind('ball', 0)
  await wait(320)
  await js('(function () { var b = [...document.querySelectorAll(".mechbar__actions .mechbar__mini")].find(function (x) { return x.textContent.trim() === "成组" }); if (b) b.click() })()')
  await wait(320)
  const anchorX = async () => {
    const p = await readPart('anchor', 0)
    return p ? Math.round(p.sx) : null
  }
  const ballX = async () => {
    const p = await readPart('ball', 0)
    return p ? Math.round(p.sx) : null
  }
  const beforeAnchor = await anchorX()
  const beforeBall = await ballX()
  await dragPart('ball', 0, 46, -24)
  const afterAnchor = await anchorX()
  const afterBall = await ballX()
  report.group = { ball: [beforeBall, afterBall], anchor: [beforeAnchor, afterAnchor] }
  check(afterBall > beforeBall + 10, '成组后拖动没有移动被拖的球（' + beforeBall + ' → ' + afterBall + '）')
  check(Math.abs(afterAnchor - beforeAnchor) > 10, '成组后锚点没有跟着走（' + beforeAnchor + ' → ' + afterAnchor + '）')

  /* ── 9. 新增预设逐个打开并验证运动（规格 §7.2） ── */
  const presetInfo = async (name, ms) => {
    await openPreset(name, ms || 780)
    const ps = await allParts()
    return { parts: ps.length, kinds: ps.map(function (p) { return p.kind }), links: await totalLinks() }
  }
  const anglesOf = async (kind) => (await allParts()).filter(function (p) { return p.kind === kind }).map(function (p) { return p.angle })

  // 9.1 齿轮传动：3 个齿轮 + 2 条啮合，播放后齿轮转角变化
  report.gearTrain = await presetInfo('齿轮传动')
  check(report.gearTrain.parts === 3, '齿轮传动预设应有 3 个部件（' + report.gearTrain.parts + '）')
  check(report.gearTrain.kinds.filter(function (k) { return k === 'gear' }).length === 3, '齿轮传动预设不是 3 个齿轮（' + report.gearTrain.kinds.join(',') + '）')
  check(report.gearTrain.links === 2, '齿轮传动预设应有 2 条齿轮啮合（' + report.gearTrain.links + '）')
  await ensurePlaying(true)
  const gear0 = await anglesOf('gear')
  await wait(900)
  const gear1 = await anglesOf('gear')
  await ensurePlaying(false)
  const gearMoved = gear1.filter(function (a, i) { return Number.isFinite(a) && Number.isFinite(gear0[i]) && Math.abs(a - gear0[i]) > 1 }).length
  report.gearAngles = { before: gear0, after: gear1, moved: gearMoved }
  check(gearMoved >= 2, '齿轮传动播放后齿轮没有转（' + JSON.stringify(gear0) + ' → ' + JSON.stringify(gear1) + '）')
  await shot('mech-7-gears.png')

  // 9.2 带传动：2 个带轮 + 皮带
  report.beltDrive = await presetInfo('带传动')
  check(report.beltDrive.parts === 2, '带传动预设应有 2 个部件（' + report.beltDrive.parts + '）')
  check(report.beltDrive.links === 1, '带传动预设应有 1 条皮带（' + report.beltDrive.links + '）')
  await ensurePlaying(true)
  const belt0 = await anglesOf('wheel')
  await wait(850)
  const belt1 = await anglesOf('wheel')
  await ensurePlaying(false)
  const beltMoved = belt1.filter(function (a, i) { return Number.isFinite(a) && Number.isFinite(belt0[i]) && Math.abs(a - belt0[i]) > 1 }).length
  report.beltAngles = { before: belt0, after: belt1, moved: beltMoved }
  check(beltMoved === 2, '带传动播放后两个带轮没有同时转（' + JSON.stringify(belt0) + ' → ' + JSON.stringify(belt1) + '）')

  // 9.3 杠杆：4 个部件，木板因两端砝码不等而下倾
  report.lever = await presetInfo('杠杆')
  check(report.lever.parts === 4, '杠杆预设应有 4 个部件（' + report.lever.parts + '）')
  check(report.lever.links === 3, '杠杆预设应有 3 条连接（' + report.lever.links + '）')
  await ensurePlaying(true)
  const plankP0 = await readPart('plank', 0)
  await wait(700)
  const plankP1 = await readPart('plank', 0)
  await ensurePlaying(false)
  const plank0 = plankP0 ? plankP0.angle : null
  const plank1 = plankP1 ? plankP1.angle : null
  report.leverAngle = { before: plank0, after: plank1 }
  check(Number.isFinite(plank1) && Math.abs(plank1 - plank0) > 0.5, '杠杆播放后木板没有转（' + plank0 + ' → ' + plank1 + '）')

  // 9.4 曲柄滑块：滑块沿轨道动
  report.crankSlider = await presetInfo('曲柄滑块')
  check(report.crankSlider.parts === 3, '曲柄滑块预设应有 3 个部件（' + report.crankSlider.parts + '）')
  check(report.crankSlider.links === 1, '曲柄滑块预设应有 1 条连杆（' + report.crankSlider.links + '）')
  await ensurePlaying(true)
  const sliderP0 = await readPart('box', 0)
  await wait(900)
  const sliderP1 = await readPart('box', 0)
  await ensurePlaying(false)
  const slider0 = sliderP0 ? sliderP0.x : null
  const slider1 = sliderP1 ? sliderP1.x : null
  report.crank = { before: slider0, after: slider1 }
  check(Number.isFinite(slider0) && Number.isFinite(slider1) && Math.abs(slider1 - slider0) > 0.1, '曲柄滑块播放后滑块没动（x ' + slider0 + ' → ' + slider1 + '）')

  // 9.5 圆弧轨道：球沿弧滚动，x 变
  report.arcTrackPreset = await presetInfo('圆弧轨道')
  check(report.arcTrackPreset.parts === 2, '圆弧轨道预设应有 2 个部件（' + report.arcTrackPreset.parts + '）')
  await ensurePlaying(true)
  const arcP0 = await readPart('ball', 0)
  await wait(900)
  const arcP1 = await readPart('ball', 0)
  await ensurePlaying(false)
  const arcBall0 = arcP0 ? arcP0.x : null
  const arcBall1 = arcP1 ? arcP1.x : null
  report.arcBall = { before: arcBall0, after: arcBall1 }
  check(Number.isFinite(arcBall0) && Number.isFinite(arcBall1) && Math.abs(arcBall1 - arcBall0) > 0.1, '圆弧轨道播放后小球没沿弧滚动（x ' + arcBall0 + ' → ' + arcBall1 + '）')

  // 9.6 液压缸：活塞把小车推走
  report.piston = await presetInfo('液压缸')
  check(report.piston.parts === 2, '液压缸预设应有 2 个部件（' + report.piston.parts + '）')
  check(report.piston.links === 1, '液压缸预设应有 1 条活塞（' + report.piston.links + '）')
  await ensurePlaying(true)
  const cartP0 = await readPart('cart', 0)
  await wait(850)
  const cartP1 = await readPart('cart', 0)
  await ensurePlaying(false)
  const cart0 = cartP0 ? cartP0.x : null
  const cart1 = cartP1 ? cartP1.x : null
  report.cart = { before: cart0, after: cart1 }
  check(Number.isFinite(cart0) && Number.isFinite(cart1) && cart1 - cart0 > 0.2, '液压缸没有把小车推走（x ' + cart0 + ' → ' + cart1 + '）')

  // 9.7 火箭推力：滑块右移
  report.rocket = await presetInfo('火箭推力')
  check(report.rocket.parts === 2, '火箭推力预设应有 2 个部件（' + report.rocket.parts + '）')
  check(report.rocket.kinds.includes('thruster'), '火箭推力预设里没有推力器（' + report.rocket.kinds.join(',') + '）')
  await ensurePlaying(true)
  const rocketP0 = await readPart('box', 0)
  await wait(900)
  const rocketP1 = await readPart('box', 0)
  await ensurePlaying(false)
  const rocket0 = rocketP0 ? rocketP0.x : null
  const rocket1 = rocketP1 ? rocketP1.x : null
  report.rocketMove = { before: rocket0, after: rocket1 }
  check(Number.isFinite(rocket0) && Number.isFinite(rocket1) && rocket1 - rocket0 > 0.3, '火箭推力没有把滑块推走（x ' + rocket0 + ' → ' + rocket1 + '）')

  // 9.8 磁铁：N 固定、S 极被吸近
  report.magnet = await presetInfo('磁铁')
  check(report.magnet.parts === 2, '磁铁预设应有 2 个部件（' + report.magnet.parts + '）')
  const magnetDist = async () => {
    const ms = (await allParts()).filter(function (p) { return p.kind === 'magnet' })
    if (ms.length < 2) return null
    return Math.hypot(ms[0].x - ms[1].x, ms[0].y - ms[1].y)
  }
  const md0 = await magnetDist()
  await ensurePlaying(true)
  await wait(1000)
  const md1 = await magnetDist()
  await ensurePlaying(false)
  report.magnetDist = { before: md0, after: md1 }
  check(Number.isFinite(md0) && Number.isFinite(md1) && md1 < md0 - 0.2, '磁铁 S 极没有被吸近（距离 ' + md0 + ' → ' + md1 + '）')

  // 9.9 动滑轮：重物被提起（y 变大）
  report.movablePulley = await presetInfo('动滑轮')
  check(report.movablePulley.parts === 5, '动滑轮预设应有 5 个部件（固定点 + 动滑轮 + 定滑轮 + 重物 + 手）（' + report.movablePulley.parts + '）')
  check(report.movablePulley.kinds.includes('movablePulley'), '动滑轮预设里没有动滑轮（' + report.movablePulley.kinds.join(',') + '）')
  check(report.movablePulley.links === 2, '动滑轮预设应有 2 条连接（' + report.movablePulley.links + '）')
  const loadY = async () => {
    const balls = (await allParts()).filter(function (p) { return p.kind === 'ball' })
    return balls.length ? balls[0].y : null
  }
  const load0 = await loadY()
  await ensurePlaying(true)
  await wait(1000)
  const load1 = await loadY()
  await ensurePlaying(false)
  report.movablePulleyLift = { before: load0, after: load1 }
  check(Number.isFinite(load0) && Number.isFinite(load1) && load1 - load0 > 0.05, '动滑轮没有把重物提起来（y ' + load0 + ' → ' + load1 + '）')
  await shot('mech-8-presets.png')

  /* ── 10. Shift 多选 → .mechbar__multi → 水平对齐（规格 §7.3） ── */
  check(await openEmpty(), '菜单里没有「空白装配台」')
  await wait(400)
  await clickPartButton('box')
  await wait(350)
  await clickPartButton('box')
  await wait(400)
  report.multiBefore = await state()
  check(report.multiBefore.parts === 2, '空白装配台加两个方块失败（' + report.multiBefore.parts + '）')
  await tapPart('box', 0)
  await wait(250)
  await tapPart('box', 1, { shiftKey: true })
  await wait(450)
  report.multi = await js('(function () {\n' +
    ' var m = document.querySelector(".mechbar__multi")\n' +
    ' return { on: !!m, text: m ? m.textContent : null, buttons: m ? [...m.querySelectorAll("button")].map(function (b) { return b.textContent.trim() }) : [] }\n' +
    '})()')
  check(report.multi.on, 'Shift 多选两个部件后没有出现 .mechbar__multi')
  const boxesBefore = (await allParts()).filter(function (p) { return p.kind === 'box' })
  const xsBefore = boxesBefore.map(function (p) { return p.x })
  const alignOk = await js('(function () {\n' +
    ' var m = document.querySelector(".mechbar__multi")\n' +
    ' if (!m) return false\n' +
    ' var b = [...m.querySelectorAll("button")].find(function (x) { return x.textContent.includes("水平对齐") })\n' +
    ' if (!b) return false\n' +
    ' b.click(); return true\n' +
    '})()')
  check(alignOk, '多选工具条里没有「水平对齐」')
  await wait(500)
  const xsAfter = (await allParts()).filter(function (p) { return p.kind === 'box' }).map(function (p) { return p.x })
  report.align = { before: xsBefore, after: xsAfter, buttons: report.multi.buttons }
  check(xsBefore.length === 2 && xsBefore[0] !== xsBefore[1], '对齐前两个方块 x 相同，断言无意义（' + JSON.stringify(xsBefore) + '）')
  check(xsAfter.length === 2 && Math.abs(xsAfter[0] - xsAfter[1]) < 1e-6, '水平对齐后两个方块 x 不同（' + JSON.stringify(xsAfter) + '）')
  await shot('mech-9-multi.png')

  /* ── 11. 网格吸附（规格 §7.4） ── */
  check(await openEmpty(), '菜单里没有「空白装配台」')
  await wait(400)
  await clickPartButton('ball')
  await wait(400)
  report.gridUi = await js('(function () {\n' +
    ' var overlay = document.querySelector(".mech__grid")\n' +
    ' var sel = document.querySelector("[data-field=\\"grid\\"]")\n' +
    ' return { overlay: !!overlay, dataGrid: overlay ? overlay.getAttribute("data-grid") : null, sel: sel ? sel.value : null }\n' +
    '})()')
  check(report.gridUi.overlay, '画布没有渲染 .mech__grid 网格')
  check(report.gridUi.dataGrid !== null, '.mech__grid 缺少 data-grid 属性')
  check(String(report.gridUi.sel) === '0.1', '网格吸附下拉默认值不是 0.1（' + report.gridUi.sel + '）')
  const beforeSnap = await readPart('ball', 0)
  await dragPart('ball', 0, 37, -29)
  const afterSnap = await readPart('ball', 0)
  report.snap = { before: beforeSnap, after: afterSnap }
  const snapOk =
    afterSnap &&
    afterSnap.x !== null &&
    Math.abs(afterSnap.x * 10 - Math.round(afterSnap.x * 10)) < 1e-6 &&
    Math.abs(afterSnap.y * 10 - Math.round(afterSnap.y * 10)) < 1e-6
  check(beforeSnap && afterSnap && afterSnap.x !== beforeSnap.x, '打开网格吸附后拖动没有移动部件（' + JSON.stringify(beforeSnap) + ' → ' + JSON.stringify(afterSnap) + '）')
  check(snapOk, '拖动后坐标不是 0.1 的倍数（x=' + (afterSnap && afterSnap.x) + ', y=' + (afterSnap && afterSnap.y) + '）')

  // 关掉吸附再拖一次：坐标不必再是 0.1 的倍数
  await js('window.__v.setSelect("[data-field=\\"grid\\"]", "0")')
  await wait(300)
  await dragPart('ball', 0, 23, -17)
  const offSnap = await readPart('ball', 0)
  const offIsMultiple = offSnap && Math.abs(offSnap.x * 10 - Math.round(offSnap.x * 10)) < 1e-6
  report.snapOff = { after: offSnap, isMultiple: offIsMultiple }
  check(offSnap && !offIsMultiple, '关闭吸附后坐标仍是 0.1 的倍数（' + (offSnap && offSnap.x) + '），吸附开关可能没生效')
  await js('window.__v.setSelect("[data-field=\\"grid\\"]", "0.1")')
  await wait(200)

  /* ── 12. 测距（规格 §7.5） ── */
  check(await openEmpty(), '菜单里没有「空白装配台」')
  await wait(400)
  await clickPartButton('ball')
  await wait(300)
  await clickPartButton('box')
  await wait(350)
  const measureBtn = await js('(function () {\n' +
    ' var b = document.querySelector("[data-field=\\"measure\\"]") || [...document.querySelectorAll(".mechbar__mini")].find(function (x) { return x.textContent.trim() === "测距" })\n' +
    ' if (!b) return false\n' +
    ' b.click(); return true\n' +
    '})()')
  check(measureBtn, '世界面板里没有「测距」按钮')
  await wait(250)
  await tapPart('ball', 0)
  await wait(250)
  await tapPart('box', 0)
  await wait(500)
  report.measure = await js('(function () {\n' +
    ' var m = document.querySelector("[data-measure]")\n' +
    ' var dim = document.querySelector(".mechbar__dim")\n' +
    ' return { on: !!m, text: m ? m.textContent : null, dim: dim ? dim.textContent : null }\n' +
    '})()')
  check(report.measure.on, '测距模式点两个部件后没有画出 [data-measure]')
  check(String(report.measure.text).includes('m'), '测距叠加层没有长度文字（' + report.measure.text + '）')
  check(String(report.measure.dim).includes('m'), '测距结果 .mechbar__dim 没有距离（' + report.measure.dim + '）')
  await js('(function () { var b = document.querySelector("[data-field=\\"measure\\"]"); if (b) b.click() })()')
  await wait(200)

  /* ── 13. 新部件拖放（规格 §7.7） ── */
  check(await openEmpty(), '菜单里没有「空白装配台」')
  await wait(400)
  const dndKinds = ['gear', 'rack', 'movablePulley', 'thruster', 'arcTrack']
  report.dnd = []
  for (let i = 0; i < dndKinds.length; i += 1) {
    const kind = dndKinds[i]
    const before = await totalParts()
    const res = await dragPartButtonToCanvas(kind, i)
    const after = await totalParts()
    const kindCount = await countKind(kind)
    report.dnd.push({ kind: kind, visible: res.visible, started: res.started, before: before, after: after, kindCount: kindCount })
    check(res.visible === true, '分类切换后「' + kind + '」按钮不可见（无法拖放）')
    check(after === before + 1, '拖动「' + kind + '」到画布没有加部件（' + before + ' → ' + after + '）')
    check(kindCount === 1, '拖动「' + kind + '」后画布上没有该部件（' + kindCount + '）')
  }
  await shot('mech-10-newparts.png')

  /* ── 14. 新部件 + 世界参数 存档 / 读档（规格 §7.8） ── */
  const setTs = await js('window.__v.setInputSel("[data-field=\\"timeScale\\"] input", 0.5)')
  await wait(400)
  const setCol = await js('(function () { var cb = document.querySelector("[data-field=\\"collisions\\"] input"); if (!cb) return false; if (cb.checked) cb.click(); return true })()')
  await wait(400)
  report.worldSet = await js('(function () { return {\n' +
    ' timeScale: (document.querySelector("[data-field=\\"timeScale\\"] input") || {}).value,\n' +
    ' collisions: (document.querySelector("[data-field=\\"collisions\\"] input") || {}).checked\n' +
    '} })()')
  check(setTs, '世界面板没有时间倍率输入框')
  check(setCol, '世界面板没有碰撞开关')
  check(Number(report.worldSet.timeScale) === 0.5, '时间倍率没有写成 0.5（' + report.worldSet.timeScale + '）')
  check(report.worldSet.collisions === false, '碰撞开关没有关掉')

  const worldPath = path.join(outDir, 'mech-verify-world.chordot')
  await saveDoc(worldPath)
  const savedWorld = readMechFile(worldPath)
  report.worldSave = {
    file: !!savedWorld,
    parts: savedWorld ? savedWorld.parts.length : null,
    kinds: savedWorld ? savedWorld.parts.map(function (p) { return p.kind }) : null,
    links: savedWorld ? savedWorld.links.length : null,
    timeScale: savedWorld ? savedWorld.timeScale : null,
    collisions: savedWorld ? savedWorld.collisions : null,
  }
  check(!!savedWorld, '保存新部件机构后文件里没有机构场景')
  check(report.worldSave.parts === 5, '存档里部件数不对（' + report.worldSave.parts + '，期望 5）')
  for (let i = 0; i < dndKinds.length; i += 1) {
    check(report.worldSave.kinds.includes(dndKinds[i]), '存档里缺少新部件 ' + dndKinds[i])
  }
  check(report.worldSave.timeScale === 0.5, '存档里 timeScale 不对（' + report.worldSave.timeScale + '）')
  check(report.worldSave.collisions === false, '存档里 collisions 不对（' + report.worldSave.collisions + '）')

  await openDoc(worldPath)
  await waitFor('document.querySelectorAll("[data-part]").length === 5', 4000)
  await wait(500)
  report.worldReopen = await state()
  check(report.worldReopen.parts === 5, '重新打开后部件数不对（' + report.worldReopen.parts + '）')
  const reopenKinds = report.worldReopen.kinds.split(',')
  check(dndKinds.every(function (k) { return reopenKinds.includes(k) }), '重新打开后新部件丢了（' + report.worldReopen.kinds + '）')
  const worldBack = await js('(function () { return {\n' +
    ' timeScale: (document.querySelector("[data-field=\\"timeScale\\"] input") || {}).value,\n' +
    ' collisions: (document.querySelector("[data-field=\\"collisions\\"] input") || {}).checked\n' +
    '} })()')
  report.worldBack = worldBack
  check(Number(worldBack.timeScale) === 0.5, '重新打开后时间倍率不对（' + worldBack.timeScale + '）')
  check(worldBack.collisions === false, '重新打开后碰撞开关不对')
  // 再存一次：开 → 存往返不丢参数
  const worldPath2 = path.join(outDir, 'mech-verify-world-2.chordot')
  // 打开过的文件已有路径，Ctrl+S 会存回原文件；这里走「另存为」才会写到 worldPath2
  await saveDoc(worldPath2, true)
  const savedWorld2 = readMechFile(worldPath2)
  report.worldResave = savedWorld2 ? { timeScale: savedWorld2.timeScale, collisions: savedWorld2.collisions, parts: savedWorld2.parts.length } : null
  check(!!savedWorld2 && Number(savedWorld2.timeScale) === 0.5 && savedWorld2.collisions === false, '开 → 存一次后世界参数丢了（' + JSON.stringify(report.worldResave) + '）')

  /* ── 15. 控制台错误（规格 §7.7） ── */
  report.consoleErrors = errors.slice(0, 10)
  check(errors.length === 0, '控制台有 ' + errors.length + ' 条错误：' + errors.slice(0, 3).join(' | '))

  report.failures = failures
  report.checks = checks
  console.log('RESULT ' + JSON.stringify(report, null, 2))
  clearTimeout(watchdog)
  app.quit()
}).catch((err) => {
  console.log('SCRIPT ERROR ' + (err && err.stack ? err.stack : err))
  console.log('VERIFY FAILED 脚本本身抛错（不是断言失败）')
  clearTimeout(watchdog)
  app.quit()
})
