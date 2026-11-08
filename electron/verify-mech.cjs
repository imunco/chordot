/** 机构装配（mech）+ 符号公式实验室（独立窗口）验证 */
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

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-mech-')))
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const watchdog = setTimeout(() => {
  console.log('TIMEOUT')
  app.quit()
}, 180000)

let symbolWin = null

app.whenReady().then(async () => {
  protocol.handle('app', (req) =>
    net.fetch(pathToFileURL(path.join(DIST, decodeURIComponent(new URL(req.url).pathname))).toString()),
  )
  ipcMain.handle('ui:get-state', () => ({}))
  ipcMain.on('ui:set-state', () => {})
  registerFileIpc({ addRecent: () => {} })
  ipcMain.handle('window:fullscreen', () => true)
  ipcMain.on('lab:sync', () => {})
  ipcMain.handle('lab:capture', () => null)

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
  const errors = []
  win.webContents.on('console-message', (e) => {
    if (e && e.level === 'error') errors.push(e.message)
  })
  await win.loadURL('app://chordot/index.html?notour=1')
  const js = (c) => win.webContents.executeJavaScript(c, true)
  const waitFor = async (expr, ms = 8000) => {
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
  const shot = async (name, target = win) => {
    const img = await target.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, name), img.toPNG())
  }

  const report = {}
  const failures = []
  const check = (ok, msg) => {
    if (!ok) {
      failures.push(msg)
      console.log('VERIFY FAILED ' + msg)
    }
  }

  await wait(1600)

  /* ── 1. 从菜单打开机构装配 ── */
  await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
  await wait(220)
  const menuHit = await js(`(() => {
    const b=[...document.querySelectorAll('.menu__item')].find(x=>x.textContent.includes('机构装配：弹簧振子'));
    if(!b) return false; b.click(); return true
  })()`)
  check(menuHit, '⋯ 菜单里没有「机构装配：弹簧振子」')
  await waitFor(`!!document.querySelector('.mech')`)
  await wait(700)

  const state = () =>
    js(`(() => {
      const parts=[...document.querySelectorAll('[data-part]')].map(el=>({
        kind:el.dataset.kind,
        id:el.dataset.part,
        cy:+el.querySelector('circle,rect')?.getAttribute('cy') || +el.querySelector('rect')?.getAttribute('y') || 0,
      }));
      const bar=document.querySelector('.mechbar');
      return {
        mech:!!document.querySelector('.mech'),
        parts:parts.length,
        kinds:parts.map(p=>p.kind).join(','),
        links:document.querySelectorAll('[data-link]').length,
        bar:!!bar,
        hint:bar?.querySelector('.mechbar__hint')?.textContent,
        zoom:document.querySelector('.lab__zoomval')?.textContent,
        status:document.querySelector('.statusbar')?.textContent ?? '',
      }
    })()`)

  report.open = await state()
  check(report.open.mech === true, '机构场景没有渲染到画布上')
  check(report.open.parts === 2, `弹簧振子应该有 2 个部件（${report.open.parts}）`)
  check(report.open.kinds === 'anchor,ball', `部件种类不对（${report.open.kinds}）`)
  check(report.open.links === 1, `弹簧振子应该有 1 条连接（${report.open.links}）`)
  check(report.open.bar === true, '没有出现部件盘')
  await shot('mech-1-open.png')

  /* ── 2. 播放 / 暂停 / 重置 ── */
  const ballCy = () => js(`+[...document.querySelectorAll('[data-part]')].find(el=>el.dataset.kind==='ball')?.querySelector('circle')?.getAttribute('cy')`)
  const cy0 = await ballCy()
  await js(`document.querySelector('.mechbar__play')?.click()`)
  await wait(420)
  const cy1 = await ballCy()
  await wait(420)
  const cy2 = await ballCy()
  await wait(700)
  const cy3 = await ballCy()
  report.play = { cy0, cy1, cy2, cy3 }
  check(cy1 !== cy0, '点播放后小球没有动')
  check(cy3 !== cy2, '小球停住了（没有继续振动）')
  await shot('mech-2-play.png')

  await js(`document.querySelector('.mechbar__play')?.click()`)
  await wait(200)
  const paused1 = await ballCy()
  await wait(500)
  const paused2 = await ballCy()
  check(Math.abs(paused1 - paused2) < 0.5, `暂停后小球还在动（${paused1} → ${paused2}）`)

  await js(`[...document.querySelectorAll('.mechbar__mini')].find(b=>b.textContent==='重置')?.click()`)
  await wait(400)
  const cyReset = await ballCy()
  check(Math.abs(cyReset - cy0) < 2, `重置没有回到初始位置（${cy0} → ${cyReset}）`)

  /* ── 3. 加部件 / 连线 / 拆开 ── */
  await js(`[...document.querySelectorAll('.mechbar__part')].find(b=>b.dataset.partKind==='box')?.click()`)
  await wait(400)
  report.addPart = await state()
  check(report.addPart.parts === 3, `点「方块」没有加上部件（${report.addPart.parts}）`)
  check(report.addPart.kinds.includes('box'), '方块没有出现在场景里')

  // 连接：点「弹簧」→ 点方块 → 点小球
  const clickPart = (kind) =>
    js(`(() => {
      const g=[...document.querySelectorAll('[data-part]')].find(el=>el.dataset.kind==='${kind}');
      if(!g) return false;
      g.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:7,isPrimary:true,pointerType:'mouse',button:0,clientX:0,clientY:0}));
      g.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerId:7,pointerType:'mouse',button:0,clientX:0,clientY:0}));
      return true
    })()`)
  await js(`[...document.querySelectorAll('.mechbar__link')].find(b=>b.textContent==='弹簧')?.click()`)
  await wait(250)
  report.pending = await js(`!!document.querySelector('.mechbar__link[data-active="true"]')`)
  check(report.pending, '点「弹簧」没有进入连接模式')
  await clickPart('box')
  await wait(250)
  report.anchorHint = await js(`document.querySelector('.mechbar__hint')?.textContent`)
  check(String(report.anchorHint).includes('再点一个部件'), '选了起点后没有提示再点第二个部件')
  await clickPart('ball')
  await wait(500)
  report.link2 = await state()
  check(report.link2.links === 2, `连线没有成功（${report.link2.links}）`)
  await shot('mech-3-link.png')

  // 检查器：选中新弹簧，改 k
  const kBefore = await js(`(() => {
    const rows=[...document.querySelectorAll('.mechbar__fields label')];
    const row=rows.find(r=>r.textContent.includes('劲度'));
    return row ? +row.querySelector('input').value : null
  })()`)
  check(kBefore !== null, '选中弹簧后没有显示劲度 k')
  if (kBefore !== null) {
    await js(`(() => {
      const row=[...document.querySelectorAll('.mechbar__fields label')].find(r=>r.textContent.includes('劲度'));
      const i=row.querySelector('input');
      const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      i.focus(); set.call(i,'40'); i.dispatchEvent(new Event('input',{bubbles:true})); i.blur();
      return true
    })()`)
    await wait(400)
    report.k = { before: kBefore, after: await js(`(() => {
      const row=[...document.querySelectorAll('.mechbar__fields label')].find(r=>r.textContent.includes('劲度'));
      return row ? +row.querySelector('input').value : null
    })()`) }
    check(report.k.after === 40, `改劲度没有生效（${report.k.before} → ${report.k.after}）`)
  }

  // 拆除这条连接（删掉的是新加的那条，原来的弹簧还在）
  await js(`document.querySelector('.mechbar__del')?.click()`)
  await wait(400)
  report.unlink = await state()
  check(report.unlink.links === 1, `拆除连接没有生效（${report.unlink.links}）`)

  // 撤销 → 回到 2 条
  await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))`)
  await wait(400)
  report.undo = await state()
  check(report.undo.links === 2, `撤销没有恢复连接（${report.undo.links}）`)

  // 拆开全部连接 → 0 条，部件还在
  await js(`[...document.querySelectorAll('.mechbar__mini')].find(b=>b.textContent==='拆开全部连接')?.click()`)
  await wait(500)
  report.split = await state()
  check(report.split.links === 0, `拆开全部连接没有生效（${report.split.links}）`)
  check(report.split.parts === 3, `拆开后部件丢了（${report.split.parts}）`)
  await shot('mech-4-split.png')
  await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))`)
  await wait(400)

  /* ── 4. 拖动部件（改的是文档坐标，撤销能回去） ── */
  const posOf = () =>
    js(`(() => {
      const rows=[...document.querySelectorAll('.mechbar__fields label')];
      const get=(name)=>{const r=rows.find(x=>x.textContent.trim().startsWith(name)); return r?+r.querySelector('input').value:null};
      return { x:get('x'), y:get('y') }
    })()`)
  // 新语义：播放后处于「真实」模式，拖动是施力；要改坐标得先切回「编辑」
  await js(`[...document.querySelectorAll('.mechbar__seg button')].find(b=>b.textContent==='编辑')?.click()`)
  await wait(400)
  report.editMode = await js(`(() => ({
    seg: [...document.querySelectorAll('.mechbar__seg button')].map(b=>b.textContent),
    active: [...document.querySelectorAll('.mechbar__seg button')].find(b=>b.dataset.active==='true')?.textContent,
  }))()`)
  check(report.editMode.seg.length === 2, `没有编辑/真实模式切换（${JSON.stringify(report.editMode)}）`)
  check(report.editMode.active === '编辑', `切回编辑模式失败（${report.editMode.active}）`)
  await clickPart('box')
  await wait(350)
  const before = await posOf()
  await js(`(() => {
    const g=[...document.querySelectorAll('[data-part]')].find(el=>el.dataset.kind==='box');
    const b=g.getBoundingClientRect();
    const x=b.left+b.width/2, y=b.top+b.height/2;
    const opt=(cx,cy)=>({bubbles:true,cancelable:true,clientX:cx,clientY:cy,pointerId:9,isPrimary:true,pointerType:'mouse',button:0,buttons:1});
    g.dispatchEvent(new PointerEvent('pointerdown', opt(x,y)));
    g.dispatchEvent(new PointerEvent('pointermove', opt(x+50, y-40)));
    g.dispatchEvent(new PointerEvent('pointerup', opt(x+50, y-40)));
    return { x, y, left:b.left, top:b.top, w:b.width }
  })()`)
  await wait(500)
  const after = await posOf()
  report.drag = { before, after }
  check(before.x !== null && after.x !== null && (after.x !== before.x || after.y !== before.y), `拖动部件没有写回坐标（${JSON.stringify(before)} → ${JSON.stringify(after)}）`)

  /* ── 5. 保存成 .chordot：机构要能存下来 ── */
  const savePath = path.join(outDir, 'mech-verify.chordot')
  try {
    fs.unlinkSync(savePath)
  } catch {
    /* 不存在就算了 */
  }
  process.env.CHORDOT_TEST_SAVE = savePath
  await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true}))`)
  await wait(1200)
  const rawSaved = fs.existsSync(savePath) ? fs.readFileSync(savePath, 'utf8') : ''
  const saved = rawSaved.replace(/\s+/g, '')
  report.save = { exists: !!rawSaved, hasMech: saved.includes('"kind":"mech"'), hasSpring: saved.includes('"spring"') }
  check(report.save.hasMech, '保存的课件里没有机构场景')
  check(report.save.hasSpring, '保存的课件里没有弹簧连接')

  // 重新打开这份课件：机构要能原样回来
  process.env.CHORDOT_TEST_OPEN = savePath
  process.env.CHORDOT_TEST_CONFIRM = '1'
  await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'o',ctrlKey:true,bubbles:true}))`)
  await wait(1600)
  report.reopen = await state()
  check(report.reopen.mech === true, '重新打开的课件里没有机构场景')
  check(report.reopen.parts === 3, `重新打开后部件数不对（${report.reopen.parts}）`)
  check(report.reopen.links === 2, `重新打开后连接数不对（${report.reopen.links}）`)

  /* ── 6. 轨道 / 复制机构 / 矢量 / 公式力 ── */
  await js(`[...document.querySelectorAll('.mechbar__part')].find(b=>b.dataset.partKind==='track')?.click()`)
  await wait(450)
  report.track = await js(`(() => {
    const kinds=[...document.querySelectorAll('[data-part]')].map(e=>e.dataset.kind)
    const row=[...document.querySelectorAll('.mechbar__fields label')].find(r=>r.textContent.includes('倾角'))
    return { kinds: kinds.join(','), hasAngle: !!row }
  })()`)
  check(report.track.kinds.includes('track'), `没有加上轨道（${report.track.kinds}）`)
  check(report.track.hasAngle, '轨道没有倾角字段')
  await js(`(() => {
    const row=[...document.querySelectorAll('.mechbar__fields label')].find(r=>r.textContent.includes('倾角'));
    const i=row.querySelector('input');
    const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    i.focus(); set.call(i,'30'); i.dispatchEvent(new Event('input',{bubbles:true})); i.blur();
    return true
  })()`)
  await wait(400)
  report.trackAngle = await js(`(() => { const row=[...document.querySelectorAll('.mechbar__fields label')].find(r=>r.textContent.includes('倾角')); return row ? +row.querySelector('input').value : null })()`)
  check(report.trackAngle === 30, `轨道倾角没写进去（${report.trackAngle}）`)

  const beforeDup = await state()
  await js(`[...document.querySelectorAll('.mechbar__mini')].find(b=>b.textContent==='复制机构')?.click()`)
  await wait(500)
  const afterDup = await state()
  report.duplicate = { before: beforeDup.parts, after: afterDup.parts }
  check(afterDup.parts >= beforeDup.parts * 2 - 1, `复制机构没有复制部件（${beforeDup.parts} → ${afterDup.parts}）`)

  const vecOn = await js(`!!document.querySelector('[data-vectors]')`)
  await js(`[...document.querySelectorAll('.mechbar__mini')].find(b=>/矢量/.test(b.textContent))?.click()`)
  await wait(300)
  const vecOff = await js(`!!document.querySelector('[data-vectors]')`)
  report.vectors = { on: vecOn, off: vecOff }
  check(vecOn && !vecOff, '矢量开关没有生效')
  await js(`[...document.querySelectorAll('.mechbar__mini')].find(b=>/矢量/.test(b.textContent))?.click()`)

  // 公式力：选中方块，给 30 N 沿 +x，播放后应该被推走
  await clickPart('box')
  await wait(350)
  const fOk = await js(`(() => {
    const cb=[...document.querySelectorAll('.mechbar__force input[type=checkbox]')][0];
    if(!cb) return false;
    if(!cb.checked) cb.click();
    // 恒力：直接填牛顿数，方向 0°
    const rows=[...document.querySelectorAll('.mechbar__force label')];
    const mag=rows.find(r=>r.textContent.includes('大小'));
    if(!mag) return 'no-mag';
    const i=mag.querySelector('input');
    const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    i.focus(); set.call(i,'30'); i.dispatchEvent(new Event('input',{bubbles:true})); i.blur();
    const dir=rows.find(r=>r.textContent.includes('方向'));
    const d=dir&&dir.querySelector('input');
    if(d){ d.focus(); set.call(d,'0'); d.dispatchEvent(new Event('input',{bubbles:true})); d.blur(); }
    return true
  })()`)
  check(fOk === true, `选中方块后没有恒力输入框（${fOk}）`)
  await wait(350)
  // 仿真位置只在引擎里，文档坐标不变 —— 量屏幕上的实际位置
  const screenX = () => js(`(() => {
    const els=[...document.querySelectorAll('[data-part]')].filter(e=>e.dataset.kind==='box')
    if(!els.length) return null
    const b=els[0].getBoundingClientRect()
    return Math.round(b.left)
  })()`)
  const fx0 = await screenX()
  await js(`document.querySelector('.mechbar__play')?.click()`)
  await wait(1000)
  const fx1 = await screenX()
  await js(`document.querySelector('.mechbar__play')?.click()`)
  report.forceExpr = { before: fx0, after: fx1 }
  check(fx0 !== null && fx1 !== null && fx1 > fx0 + 8, `施加的力没有推动方块（${fx0} → ${fx1}）`)

  /* ── 7. 符号公式实验室（独立窗口） ── */
  await js(`window.chordot.openSymbolWindow()`)
  const t0 = Date.now()
  while (Date.now() - t0 < 9000 && (!symbolWin || symbolWin.isDestroyed() || symbolWin.webContents.isLoading())) {
    await wait(150)
  }
  check(!!symbolWin && !symbolWin.isDestroyed(), '符号实验室窗口没有创建')
  if (symbolWin && !symbolWin.isDestroyed()) {
    await wait(1200)
    const sjs = (c) => symbolWin.webContents.executeJavaScript(c, true)
    report.sym = await sjs(`(() => ({
      root: !!document.querySelector('.symlab'),
      chips: document.querySelectorAll('.symlab__chip').length,
      tokens: document.querySelector('.symlab__tokens')?.textContent,
      ball: document.querySelector('.symlab__svg circle')?.getAttribute('cx'),
      now: document.querySelector('.symlab__now')?.textContent,
    }))()`)
    check(report.sym.root === true, '符号实验室没有渲染')
    check(report.sym.chips >= 15, `符号太少（${report.sym.chips}）`)
    check(String(report.sym.tokens).includes('k'), `默认公式不对（${report.sym.tokens}）`)
    await shot('mech-5-symbols.png', symbolWin)

    const b1 = await sjs(`+document.querySelector('.symlab__svg circle')?.getAttribute('cx')`)
    await wait(800)
    const b2 = await sjs(`+document.querySelector('.symlab__svg circle')?.getAttribute('cx')`)
    check(b1 !== b2, '拼好的公式没有作用到小球上（小球没动）')

    // 清空 → 点 m → 点 g → 自动补乘号，F 应为 m*g ≈ 9.8
    await sjs(`[...document.querySelectorAll('.symlab__keys button')].find(b=>b.textContent==='清空')?.click()`)
    await wait(150)
    await sjs(`[...document.querySelectorAll('.symlab__chip')].find(b=>b.dataset.sym==='m')?.click()`)
    await sjs(`[...document.querySelectorAll('.symlab__chip')].find(b=>b.dataset.sym==='g')?.click()`)
    await wait(600)
    report.build = await sjs(`({
      tokens: document.querySelector('.symlab__tokens')?.textContent,
      now: document.querySelector('.symlab__now')?.textContent,
      err: document.querySelector('.symlab__err')?.textContent ?? '',
    })`)
    check(String(report.build.tokens).includes('m·g'), `符号拼公式没有自动补乘号（${report.build.tokens}）`)
    check(String(report.build.now).includes('9.80'), `m·g 没有算成 9.8 N（${report.build.now}）`)
    check(report.build.err === '', `公式报错：${report.build.err}`)

    // 预设：弹簧回复力
    await sjs(`[...document.querySelectorAll('.symlab__presets button')].find(b=>b.textContent.includes('弹簧回复力'))?.click()`)
    await wait(500)
    const presets = await sjs(`document.querySelector('.symlab__tokens')?.textContent`)
    check(String(presets).includes('k'), `预设「弹簧回复力」没有生效（${presets}）`)
    await shot('mech-6-formula.png', symbolWin)

    // 发送到机构：主窗口里选中的方块应该收到这条公式
    await sjs(`document.querySelector('.symlab__send')?.click()`)
    await wait(700)
    report.bridge = await js(`({
      expr: document.querySelector('.mechbar__expr')?.value ?? null,
      on: document.querySelector('.mechbar__force input[type=checkbox]')?.checked ?? null,
    })`)
    check(String(report.bridge.expr).includes('k'), `公式没有发到机构（${report.bridge.expr}）`)
    check(report.bridge.on === true, '发过来的公式没有自动启用')

    // 关掉符号窗口：它一开着，主窗口的 rAF 会被后台节流，后面测轨道 / 播放就不动了
    symbolWin.close()
    await wait(500)
  }

  /* ── 8. 滑轮组 / 铰链 / 轨道约束 / 受力分解 / 复制与成组 ── */
  const preset = (name) =>
    js(`[...document.querySelectorAll('.mechbar__presets button')].find(b=>b.textContent.includes(${JSON.stringify(name)}))?.click()`)
  const openEmpty = async () => {
    await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
    await wait(220)
    await js(`[...document.querySelectorAll('.menu__item')].find(x=>x.textContent.includes('空白装配台'))?.click()`)
    await wait(600)
  }
  const addPart = async (kind) => {
    await js(`[...document.querySelectorAll('.mechbar__part')].find(b=>b.dataset.partKind==='${kind}')?.click()`)
    await wait(320)
  }
  /** 点某类部件的第 idx 个；last=true 取最后一个 */
  const clickPartKind = (kind, idx = 0, last = false) =>
    js(`(() => {
      const gs=[...document.querySelectorAll('[data-part]')].filter(e=>e.dataset.kind==='${kind}');
      const g=${last ? 'gs[gs.length-1]' : `gs[${idx}]`};
      if(!g) return false;
      g.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:5,isPrimary:true,pointerType:'mouse',button:0}));
      return true
    })()`)

  // 滑轮组：一根绳穿两个滑轮 → 折线 4 个点（球、滑轮1、滑轮2、球）
  await preset('滑轮组')
  await wait(700)
  report.pulleyGroup = await js(`({
    parts: document.querySelectorAll('[data-part]').length,
    pts: document.querySelector('[data-kind="rope"]')?.getAttribute('points')?.split(' ').length ?? 0,
  })`)
  check(report.pulleyGroup.parts === 4, `滑轮组部件数不对（${report.pulleyGroup.parts}）`)
  check(report.pulleyGroup.pts === 4, `绳没有绕过两个滑轮（折线 ${report.pulleyGroup.pts} 点）`)

  // 铰链：空白场景 + 两个球 → 点铰链 → 依次点两个球
  await openEmpty()
  await addPart('ball')
  await addPart('ball')
  await js(`[...document.querySelectorAll('.mechbar__link')].find(b=>b.textContent==='铰链')?.click()`)
  await wait(260)
  await clickPartKind('ball', 0)
  await wait(320)
  await clickPartKind('ball', 1)
  await wait(420)
  report.hinge = await js(`({
    kind: document.querySelector('[data-kind="hinge"]') ? 'hinge' : null,
    head: document.querySelector('.mechbar__insphead')?.textContent,
  })`)
  check(report.hinge.kind === 'hinge', '铰链没有连上')
  check(String(report.hinge.head).startsWith('铰链'), `铰链检查器不对（${report.hinge.head}）`)

  // 受力分解：弹簧振子里选中球，打开分力 → 应该有 G / F弹 标签
  await preset('弹簧振子')
  await wait(620)
  await js(`[...document.querySelectorAll('.mechbar__mini')].find(b=>b.textContent==='受力分解')?.click()`)
  await wait(220)
  await clickPartKind('ball', 0)
  await wait(420)
  report.decompose = await js(`({
    on: !!document.querySelector('[data-decompose]'),
    text: document.querySelector('[data-decompose]')?.textContent ?? '',
  })`)
  check(report.decompose.on, '受力分解没有画出来')
  check(String(report.decompose.text).includes('G'), `分力里没有重力（${report.decompose.text}）`)

  // 轨道约束：空白场景 + 轨道（20°）+ 新球挂到轨道上 → 沿斜面滑，不竖直掉落
  await openEmpty()
  await addPart('track')
  await js(`(() => {
    const row=[...document.querySelectorAll('.mechbar__fields label')].find(r=>r.textContent.includes('倾角'));
    const i=row.querySelector('input'); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    i.focus(); set.call(i,'20'); i.dispatchEvent(new Event('input',{bubbles:true})); i.blur(); return true
  })()`)
  await wait(320)
  await addPart('ball')
  await wait(320)
  const railSel = await js(`(() => {
    const s=[...document.querySelectorAll('.mechbar__fields select')].find(x=>[...x.options].some(o=>o.value));
    if(!s) return false;
    const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;
    const opt=[...s.options].find(o=>o.value);
    set.call(s,opt.value); s.dispatchEvent(new Event('change',{bubbles:true}));
    return true
  })()`)
  check(railSel, '没有「轨道约束」下拉')
  await wait(320)
  const ballPos = () => js(`(() => {
    const gs=[...document.querySelectorAll('[data-part]')].filter(e=>e.dataset.kind==='ball');
    const r=gs[gs.length-1].getBoundingClientRect();
    return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) }
  })()`)
  await js(`document.querySelector('.mechbar__play')?.click()`)
  await wait(450)
  const rp1 = await ballPos()
  await wait(800)
  const rp2 = await ballPos()
  await js(`document.querySelector('.mechbar__play')?.click()`)
  report.rail = { p1: rp1, p2: rp2 }
  const rdx = Math.abs(rp2.x - rp1.x)
  const rdy = Math.abs(rp2.y - rp1.y)
  check(rdx > 5, `轨道约束下小球没有沿轨道移动（dx=${rdx}）`)
  check(rdx > 0 && rdy / rdx > 0.15 && rdy / rdx < 0.7, `小球没按 20° 轨道滑（dy/dx=${(rdy / rdx).toFixed(3)}）`)

  // 复制部件 / 成组拖动（弹簧振子：球 + 锚点成组，拖球锚点跟着走）
  await preset('弹簧振子')
  await wait(620)
  await clickPartKind('ball', 0)
  await wait(350)
  const partsBefore = await js(`document.querySelectorAll('[data-part]').length`)
  await js(`[...document.querySelectorAll('.mechbar__actions .mechbar__mini')].find(b=>b.textContent==='复制部件')?.click()`)
  await wait(420)
  report.duplicatePart = {
    before: partsBefore,
    after: await js(`document.querySelectorAll('[data-part]').length`),
  }
  check(report.duplicatePart.after === partsBefore + 1, `复制部件没生效（${partsBefore} → ${report.duplicatePart.after}）`)

  await clickPartKind('ball', 0)
  await wait(320)
  await js(`[...document.querySelectorAll('.mechbar__actions .mechbar__mini')].find(b=>b.textContent==='成组')?.click()`)
  await wait(320)
  const anchorX = () => js(`(() => {
    const g=document.querySelector('[data-part][data-kind="anchor"]');
    return g ? Math.round(g.getBoundingClientRect().left) : null
  })()`)
  const beforeAnchor = await anchorX()
  const beforeBall = await js(`(() => {
    const g=[...document.querySelectorAll('[data-part]')].filter(e=>e.dataset.kind==='ball')[0];
    return Math.round(g.getBoundingClientRect().left)
  })()`)
  await js(`(() => {
    const g=[...document.querySelectorAll('[data-part]')].filter(e=>e.dataset.kind==='ball')[0];
    const b=g.getBoundingClientRect();
    const x=b.left+b.width/2, y=b.top+b.height/2;
    const opt=(cx,cy)=>({bubbles:true,cancelable:true,clientX:cx,clientY:cy,pointerId:8,isPrimary:true,pointerType:'mouse',button:0,buttons:1});
    g.dispatchEvent(new PointerEvent('pointerdown', opt(x,y)));
    g.dispatchEvent(new PointerEvent('pointermove', opt(x+46, y-24)));
    g.dispatchEvent(new PointerEvent('pointerup', opt(x+46, y-24)));
    return true
  })()`)
  await wait(520)
  const afterAnchor = await anchorX()
  const afterBall = await js(`(() => {
    const g=[...document.querySelectorAll('[data-part]')].filter(e=>e.dataset.kind==='ball')[0];
    return Math.round(g.getBoundingClientRect().left)
  })()`)
  report.group = { ball: [beforeBall, afterBall], anchor: [beforeAnchor, afterAnchor] }
  check(afterBall > beforeBall + 10, `成组后拖动没有移动被拖的球（${beforeBall} → ${afterBall}）`)
  check(Math.abs(afterAnchor - beforeAnchor) > 10, `成组后锚点没有跟着走（${beforeAnchor} → ${afterAnchor}）`)

  report.consoleErrors = errors.slice(0, 8)
  report.failures = failures
  console.log('RESULT ' + JSON.stringify(report, null, 2))
  clearTimeout(watchdog)
  app.quit()
})
