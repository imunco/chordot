/** 教材实验室 0.10.2：双指捏合、批注重映射 / 选择 / 淡出 / 持久化、画面导出、双窗口同步 */
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

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-lab2-')))
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const watchdog = setTimeout(() => {
  console.log('TIMEOUT')
  app.quit()
}, 180000)

/** 1×1 透明 PNG：截图 IPC 的 mock，只要能被写成文件即可 */
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

let labWindow = null

app.whenReady().then(async () => {
  protocol.handle('app', (req) =>
    net.fetch(pathToFileURL(path.join(DIST, decodeURIComponent(new URL(req.url).pathname))).toString()),
  )
  ipcMain.handle('ui:get-state', () => ({}))
  ipcMain.on('ui:set-state', () => {})
  registerFileIpc({ addRecent: () => {} })
  ipcMain.handle('window:fullscreen', () => true)
  ipcMain.handle('lab:open-window', (_e, payload) => {
    if (!labWindow || labWindow.isDestroyed()) makeLab(payload?.id)
    return true
  })

  const captures = []
  ipcMain.handle('lab:capture', (_e, rect) => {
    captures.push(rect)
    return { data: TINY_PNG, width: 1, height: 1 }
  })

  // 和 main.cjs 一样的转发：谁切听谁的，不回传给发送方
  ipcMain.on('lab:sync', (e, id) => {
    if (typeof id !== 'string' || !id) return
    for (const w of BrowserWindow.getAllWindows()) {
      if (w.isDestroyed() || w.webContents.id === e.sender.id) continue
      w.webContents.send('lab:sync', id)
    }
  })

  function makeLab(id) {
    labWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      show: true,
      webPreferences: {
        preload: path.join(root, 'electron', 'preload.cjs'),
        contextIsolation: true,
        sandbox: true,
      },
    })
    void labWindow.loadURL(`app://chordot/index.html?lab=1&id=${encodeURIComponent(id || '')}`)
    return labWindow
  }

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
    if (ok) return
    failures.push(msg)
    console.log('VERIFY FAILED ' + msg)
  }

  await wait(1600)
  await js(`(() => { const b=[...document.querySelectorAll('.tbtn')].find(x=>(x.title||'').includes('教材实验室')); if(!b) return false; b.click(); return true })()`)
  await waitFor(`!!document.querySelector('.lab')`)
  await wait(900)

  /* ── 1. 双指捏合：以两指中心缩放，范围 100–350% ── */
  const pinch = (from, to) =>
    js(`(() => {
      const s=document.querySelector('.lab__stagebox'); const r=s.getBoundingClientRect();
      const opt=(x,y,id,primary)=>({bubbles:true,cancelable:true,clientX:r.left+x,clientY:r.top+y,pointerId:id,isPrimary:primary,pointerType:'touch',button:0});
      s.dispatchEvent(new PointerEvent('pointerdown', opt(r.width*${from[0]}, r.height*${from[1]}, 11, true)));
      s.dispatchEvent(new PointerEvent('pointerdown', opt(r.width*${from[2]}, r.height*${from[3]}, 12, false)));
      s.dispatchEvent(new PointerEvent('pointermove', opt(r.width*${to[0]}, r.height*${to[1]}, 11, true)));
      s.dispatchEvent(new PointerEvent('pointermove', opt(r.width*${to[2]}, r.height*${to[3]}, 12, false)));
      return true
    })()`)
  const lift = () =>
    js(`(() => {
      const s=document.querySelector('.lab__stagebox'); const r=s.getBoundingClientRect();
      const opt=(x,y,id)=>({bubbles:true,cancelable:true,clientX:r.left+x,clientY:r.top+y,pointerId:id,pointerType:'touch',button:0});
      s.dispatchEvent(new PointerEvent('pointerup', opt(r.width*0.5, r.height*0.5, 11)));
      s.dispatchEvent(new PointerEvent('pointerup', opt(r.width*0.5, r.height*0.5, 12)));
      return true
    })()`)

  // 只挪一根手指：0.16w → 0.36w，正好 2.25×
  await pinch([0.42, 0.5, 0.58, 0.5], [0.22, 0.5, 0.58, 0.5])
  await wait(260)
  report.pinch = await js(`(() => {
    const s=document.querySelector('.lab__stagebox');
    return { zoom:Number(s.dataset.zoom), label:document.querySelector('.lab__zoomval')?.textContent, tf:document.querySelector('.lab__stagezoom')?.style.transform }
  })()`)
  check(report.pinch.zoom > 1.9 && report.pinch.zoom < 2.6, `双指捏合没有按比例放大（${report.pinch.zoom}）`)
  check(String(report.pinch.label).startsWith('2'), `双指缩放没有同步到百分比（${report.pinch.label}）`)
  await shot('lab2-1-pinch.png')
  await lift()

  // 捏到超出上限：夹在 350%
  await pinch([0.45, 0.5, 0.55, 0.5], [0.02, 0.5, 0.98, 0.5])
  await wait(220)
  report.pinchMax = await js(`Number(document.querySelector('.lab__stagebox').dataset.zoom)`)
  check(report.pinchMax <= 3.5001, `双指缩放没有封顶 350%（${report.pinchMax}）`)
  await lift()

  // 单指拖动仍然能移动画面（捏合结束后不能残留双指状态）
  await js(`document.querySelector('.lab__zoomval')?.click()`)
  await wait(200)
  await js(`[...document.querySelectorAll('.lab__viewbtn')].find(b=>b.title.includes('放大'))?.click()`)
  await wait(220)
  const panBefore = await js(`document.querySelector('.lab__stagezoom')?.style.transform`)
  await js(`(() => {
    const s=document.querySelector('.lab__stagebox'); const r=s.getBoundingClientRect();
    const opt=(x,y)=>({bubbles:true,cancelable:true,clientX:r.left+x,clientY:r.top+y,pointerId:22,isPrimary:true,pointerType:'mouse',button:0});
    s.dispatchEvent(new PointerEvent('pointerdown', opt(r.width*0.5, r.height*0.5)));
    s.dispatchEvent(new PointerEvent('pointermove', opt(r.width*0.5+50, r.height*0.5+30)));
    s.dispatchEvent(new PointerEvent('pointerup', opt(r.width*0.5+50, r.height*0.5+30)));
    return true
  })()`)
  await wait(220)
  report.drag = { before: panBefore, after: await js(`document.querySelector('.lab__stagezoom')?.style.transform`) }
  check(report.drag.after !== report.drag.before, '捏合之后单指拖动失效了')
  await js(`document.querySelector('.lab__zoomval')?.click()`)
  await wait(200)

  /* ── 2. 批注：归一化坐标 + 重映射 ── */
  await js(`[...document.querySelectorAll('.lab__viewbtn')].find(b=>b.title.includes('批注'))?.click()`)
  await wait(320)
  const draw = (x0, y0, x1, y1) =>
    js(`(() => {
      const s=document.querySelector('.screenink'); const r=s.getBoundingClientRect();
      const opt=(x,y)=>({bubbles:true,cancelable:true,clientX:r.left+x,clientY:r.top+y,pointerId:93,isPrimary:true,pointerType:'pen',button:0});
      s.dispatchEvent(new PointerEvent('pointerdown', opt(${x0},${y0})));
      for (let i=1;i<=10;i++) s.dispatchEvent(new PointerEvent('pointermove', opt(${x0}+(${x1}-${x0})*i/10, ${y0}+(${y1}-${y0})*i/10)));
      s.dispatchEvent(new PointerEvent('pointerup', opt(${x1},${y1})));
      return true
    })()`)
  await draw(300, 220, 560, 300)
  await wait(500)
  report.ink = await js(`(() => {
    const root=document.querySelector('.screenink');
    const raw=JSON.parse(localStorage.getItem('chordot.lab.ink.' + (window.__lab?.id ?? '')) || '[]');
    const path=document.querySelector('.screenink__canvas path');
    return {
      count:Number(root?.dataset.count),
      pts:raw[0]?.pts?.length ?? 0,
      max:raw[0] ? Math.max(...raw[0].pts.flatMap(p=>[p.x,p.y])) : null,
      d:path?.getAttribute('d')?.slice(0,40),
      w:path?.getAttribute('stroke-width'),
    }
  })()`)
  check(report.ink.count === 1, `批注没有落到状态里（${report.ink.count}）`)
  check(report.ink.max !== null && report.ink.max <= 1.0001, `批注没有存归一化坐标（max=${report.ink.max}）`)
  check(report.ink.pts > 5, `批注点太少（${report.ink.pts}）`)

  const dBefore = await js(`document.querySelector('.screenink__canvas path')?.getAttribute('d')`)
  win.setSize(1200, 820)
  await wait(700)
  const dAfter = await js(`document.querySelector('.screenink__canvas path')?.getAttribute('d')`)
  const num = (d) => Number((String(d).match(/-?\d+(\.\d+)?/g) || [0])[0])
  report.remap = { before: num(dBefore), after: num(dAfter) }
  check(report.remap.after < report.remap.before, `窗口变窄后笔迹没有按比例重映射（${report.remap.before} → ${report.remap.after}）`)
  await shot('lab2-2-ink-remap.png')

  /* ── 3. 选择工具：点选 / 拖动 / 淡出 / 删除 ── */
  await js(`[...document.querySelectorAll('.screenink__tool')].find(b=>b.textContent==='选择')?.click()`)
  await wait(200)
  const selAt = await js(`(() => {
    const s=document.querySelector('.screenink'); const r=s.getBoundingClientRect();
    const p=document.querySelector('.screenink__canvas path'); const b=p.getBBox();
    const x=b.x+b.width*0.5, y=b.y+b.height*0.5;
    const opt=(cx,cy)=>({bubbles:true,cancelable:true,clientX:r.left+cx,clientY:r.top+cy,pointerId:95,isPrimary:true,pointerType:'pen',button:0});
    s.dispatchEvent(new PointerEvent('pointerdown', opt(x,y)));
    s.dispatchEvent(new PointerEvent('pointerup', opt(x,y)));
    return { x:Math.round(x), y:Math.round(y) }
  })()`)
  await wait(260)
  report.select = { sel: await js(`document.querySelector('.screenink')?.dataset.sel`), at: selAt }
  check(report.select.sel === '1', `点选没有选中笔画（sel=${report.select.sel}）`)
  check(await js(`!!document.querySelector('[data-ink-selection]')`), '选中后没有出现选择框')

  const dSel = await js(`document.querySelector('.screenink__canvas path')?.getAttribute('d')`)
  await js(`(() => {
    const s=document.querySelector('.screenink'); const r=s.getBoundingClientRect();
    const opt=(x,y)=>({bubbles:true,cancelable:true,clientX:r.left+x,clientY:r.top+y,pointerId:96,isPrimary:true,pointerType:'pen',button:0});
    s.dispatchEvent(new PointerEvent('pointerdown', opt(${selAt.x},${selAt.y})));
    s.dispatchEvent(new PointerEvent('pointermove', opt(${selAt.x + 60},${selAt.y + 40})));
    s.dispatchEvent(new PointerEvent('pointerup', opt(${selAt.x + 60},${selAt.y + 40})));
    return true
  })()`)
  await wait(260)
  const dMoved = await js(`document.querySelector('.screenink__canvas path')?.getAttribute('d')`)
  check(dMoved !== dSel, '选中后拖动没有移动笔画')

  // 角点缩放：拖右下角手柄，包围盒应被拉大
  const boxW = () => js(`Number(document.querySelector('[data-ink-selection] rect')?.getAttribute('width')||0)`)
  const w0 = await boxW()
  const corner = await js(`(() => {
    const h=document.querySelector('[data-ink-handle="se"]');
    if(!h) return null;
    const b=h.getBoundingClientRect();
    return { x: b.left + b.width/2, y: b.top + b.height/2 }
  })()`)
  check(!!corner, '选择框没有右下角缩放手柄')
  if (corner) {
    await js(`(() => {
      const s=document.querySelector('.screenink'); const r=s.getBoundingClientRect();
      const opt=(x,y)=>({bubbles:true,cancelable:true,clientX:x,clientY:y,pointerId:97,isPrimary:true,pointerType:'pen',button:0});
      s.dispatchEvent(new PointerEvent('pointerdown', opt(${corner.x},${corner.y})));
      s.dispatchEvent(new PointerEvent('pointermove', opt(${corner.x + 60},${corner.y + 40})));
      s.dispatchEvent(new PointerEvent('pointerup', opt(${corner.x + 60},${corner.y + 40})));
      return true
    })()`)
    await wait(280)
    const w1 = await boxW()
    report.scale = { before: w0, after: w1 }
    check(w1 > w0 + 20, `拖角点没有放大笔画（${w0} → ${w1}）`)
  }

  await js(`[...document.querySelectorAll('.screenink__tool')].find(b=>b.textContent==='淡化')?.click()`)
  await wait(240)
  report.fade = await js(`document.querySelector('.screenink__canvas path')?.getAttribute('stroke-opacity')`)
  check(Math.abs(Number(report.fade) - 0.55) < 0.01, `淡化没有把不透明度降到 55%（${report.fade}）`)
  await shot('lab2-3-select.png')

  // 撤销回到 100%，再删掉
  await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))`)
  await wait(240)
  report.fadeUndo = await js(`document.querySelector('.screenink__canvas path')?.getAttribute('stroke-opacity')`)
  check(Math.abs(Number(report.fadeUndo) - 1) < 0.01, `撤销没有恢复不透明度（${report.fadeUndo}）`)

  /* ── 4. 导出：PNG（含 / 不含批注）、讲稿图、SVG ── */
  const outPng = path.join(outDir, 'lab2-export.png')
  const outSheet = path.join(outDir, 'lab2-export-sheet.png')
  const outSvg = path.join(outDir, 'lab2-export.svg')
  for (const f of [outPng, outSheet, outSvg]) {
    try {
      fs.unlinkSync(f)
    } catch {
      /* 不存在就算了 */
    }
  }
  const pickExport = async (label) => {
    await js(`document.querySelector('.lab__exportbtn')?.click()`)
    await wait(220)
    const hit = await js(`(() => {
      const b=[...document.querySelectorAll('.lab__exportmenu button')].find(x=>x.textContent.includes(${JSON.stringify(label)}));
      if(!b) return false; b.click(); return true
    })()`)
    check(hit, `导出菜单里找不到「${label}」`)
    await wait(1000)
  }
  process.env.CHORDOT_TEST_EXPORT = outPng
  await pickExport('当前画面 PNG（含批注）')
  check(fs.existsSync(outPng) && fs.statSync(outPng).size > 50, '导出「当前画面 PNG（含批注）」没有落盘')
  report.capture = { calls: captures.length, last: captures[captures.length - 1] }
  check(captures.length >= 1 && captures[0].width > 200, `截图区域不对（${JSON.stringify(captures[0])}）`)
  check(
    (await js(`document.documentElement.dataset.capturing === undefined && document.documentElement.dataset.hideInk === undefined`)),
    '导出结束后没有清掉 capturing / hideInk 标记',
  )

  process.env.CHORDOT_TEST_EXPORT = outSheet
  await pickExport('讲稿图 PNG')
  check(fs.existsSync(outSheet) && fs.statSync(outSheet).size > 50, '导出讲稿图没有落盘')
  const sheetRect = captures[captures.length - 1]
  check(sheetRect.width > captures[0].width, `讲稿图没有包含读数栏（${sheetRect.width} ≤ ${captures[0].width}）`)

  process.env.CHORDOT_TEST_EXPORT = outSvg
  await pickExport('SVG（矢量')
  const svgText = fs.existsSync(outSvg) ? fs.readFileSync(outSvg, 'utf8') : ''
  check(svgText.startsWith('<svg'), 'SVG 导出文件内容不对')
  check(svgText.includes('<path') && svgText.includes('viewBox="0 0 760 470"'), 'SVG 里没有画面内容或页脚')
  check(svgText.includes('stroke-opacity="0.55"') || svgText.includes('stroke-opacity'), 'SVG 里没有带上批注')
  await shot('lab2-4-export.png')

  /* ── 5. 退出批注：笔迹留在屏幕上，可以隐藏 ── */
  await js(`document.querySelector('.screenink__exit')?.click()`)
  await wait(300)
  report.passive = await js(`(() => {
    const root=document.querySelector('.screenink');
    return { exists:!!root, active:root?.dataset.active, cls:root?.className, paths:document.querySelectorAll('.screenink__canvas path').length }
  })()`)
  check(report.passive.exists === true && report.passive.active === 'false', '退出批注后笔迹应该留在屏幕上（passive）')
  check(report.passive.paths >= 1, '退出批注后笔迹被清掉了')

  const hideBtn = await js(`!![...document.querySelectorAll('.lab__viewbtn')].find(b=>(b.title||'').includes('隐藏批注'))`)
  check(hideBtn, '有批注时工具条没有「隐藏批注」按钮')
  await js(`[...document.querySelectorAll('.lab__viewbtn')].find(b=>(b.title||'').includes('隐藏批注'))?.click()`)
  await wait(260)
  report.hidden = await js(`!!document.querySelector('.screenink')`)
  check(report.hidden === false, '隐藏批注没有生效')
  await js(`[...document.querySelectorAll('.lab__viewbtn')].find(b=>(b.title||'').includes('显示批注'))?.click()`)
  await wait(260)

  /* ── 6. 持久化：关掉教材再打开，同一实验的批注还在 ── */
  await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`)
  await wait(400)
  await js(`(() => { const b=[...document.querySelectorAll('.tbtn')].find(x=>(x.title||'').includes('教材实验室')); if(!b) return false; b.click(); return true })()`)
  await waitFor(`!!document.querySelector('.lab')`)
  await wait(900)
  report.persist = await js(`(() => {
    const root=document.querySelector('.screenink');
    return { exists:!!root, paths:document.querySelectorAll('.screenink__canvas path').length, count:Number(root?.dataset.count) }
  })()`)
  check(report.persist.paths >= 1, '重新打开实验后批注没有恢复')
  await shot('lab2-5-persist.png')

  /* 跨实验：切走不该看到这一笔，切回来还在 */
  const curId = await js(`document.querySelector('.lab__item[data-active="true"]')?.getAttribute('data-id')`)
  await js(`(() => { const items=[...document.querySelectorAll('.lab__item')]; const cur=items.findIndex(i=>i.getAttribute('data-active')==='true'); items[(cur+1)%items.length].click(); return true })()`)
  await wait(700)
  const otherCount = await js(`document.querySelectorAll('.screenink__canvas path').length`)
  await js(`document.querySelector('.lab__item[data-id="${curId}"]')?.click()`)
  await wait(700)
  const backCount = await js(`document.querySelectorAll('.screenink__canvas path').length`)
  report.crossExp = { other: otherCount, back: backCount }
  check(otherCount === 0, `切换实验后仍显示上一个实验的批注（${otherCount}）`)
  check(backCount >= 1, '切回原实验后批注没有恢复')

  /* ── 7. 主窗口 ↔ 独立窗口：切换实验双向同步 ── */
  const ids = await js(`[...document.querySelectorAll('.lab__item')].map(el=>el.getAttribute('data-id')||'').slice(0,3)`)
  const targetId = await js(`(() => {
    const items=[...document.querySelectorAll('.lab__item')];
    const cur=items.findIndex(i=>i.getAttribute('data-active')==='true');
    const next=items[cur+1] || items[0];
    next.click();
    return next.querySelector('.lab__itemname')?.textContent ?? ''
  })()`)
  await wait(600)
  report.switched = { name: targetId, current: await js(`document.querySelector('.lab__item[data-active="true"] .lab__itemname')?.textContent`) }
  check(report.switched.current === targetId, '主窗口切换实验失败')

  // 直接开独立窗口（点标题栏按钮会把主窗口的教材关掉，后面就没法验证双向同步了）
  const openId = await js(`document.querySelector('.lab__item[data-active="true"]')?.getAttribute('data-id')`)
  await js(`window.chordot.openLabWindow(${JSON.stringify(openId)})`)
  const t0 = Date.now()
  while (Date.now() - t0 < 9000 && (!labWindow || labWindow.isDestroyed() || labWindow.webContents.isLoading())) {
    await wait(150)
  }
  check(!!labWindow && !labWindow.isDestroyed(), '独立窗口没有创建')
  if (labWindow && !labWindow.isDestroyed()) {
    await wait(1400)
    const ljs = (c) => labWindow.webContents.executeJavaScript(c, true)
    report.syncA = {
      solo: await ljs(`document.querySelector('.lab__solo-select')?.value`),
      main: await js(`document.querySelector('.lab__item[data-active="true"]')?.getAttribute('data-id')`),
    }
    check(report.syncA.solo === report.syncA.main, `独立窗口打开时没有同步当前实验（${report.syncA.solo} / ${report.syncA.main}）`)

    // 主窗口切 → 独立窗口跟
    const mainNext = await js(`(() => {
      const items=[...document.querySelectorAll('.lab__item')];
      const cur=items.findIndex(i=>i.getAttribute('data-active')==='true');
      const next=items[(cur+1)%items.length];
      next.click();
      return next.getAttribute('data-id') ?? ''
    })()`)
    await wait(700)
    report.syncB = { main: mainNext, solo: await ljs(`document.querySelector('.lab__solo-select')?.value`) }
    check(report.syncB.solo === report.syncB.main, `主窗口切实验没有同步到独立窗口（${report.syncB.solo} / ${report.syncB.main}）`)

    // 独立窗口切 → 主窗口跟
    const soloNext = await ljs(`(() => {
      const s=document.querySelector('.lab__solo-select');
      const opts=[...s.options].map(o=>o.value);
      const i=opts.indexOf(s.value);
      const next=opts[(i+2)%opts.length];
      const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;
      set.call(s,next); s.dispatchEvent(new Event('change',{bubbles:true}));
      return next
    })()`)
    await wait(800)
    report.syncC = { solo: soloNext, main: await js(`document.querySelector('.lab__item[data-active="true"]')?.getAttribute('data-id')`) }
    check(report.syncC.main === report.syncC.solo, `独立窗口切实验没有同步回主窗口（${report.syncC.main} / ${report.syncC.solo}）`)
    await shot('lab2-6-sync.png')
  }

  report.consoleErrors = errors.slice(0, 8)
  report.failures = failures
  console.log('RESULT ' + JSON.stringify(report, null, 2))
  clearTimeout(watchdog)
  app.quit()
})
