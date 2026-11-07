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

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-big-')))
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const watchdog = setTimeout(() => {
  console.log('TIMEOUT')
  app.quit()
}, 150000)

let labWindow = null

app.whenReady().then(async () => {
  protocol.handle('app', (req) =>
    net.fetch(pathToFileURL(path.join(DIST, decodeURIComponent(new URL(req.url).pathname))).toString()),
  )
  ipcMain.handle('ui:get-state', () => ({}))
  ipcMain.on('ui:set-state', () => {})
  registerFileIpc({ addRecent: () => {} })

  const makeLab = (id) => {
    labWindow = new BrowserWindow({
      width: 1600,
      height: 1000,
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
  ipcMain.handle('lab:open-window', (_e, payload) => {
    if (!labWindow || labWindow.isDestroyed()) makeLab(payload?.id)
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
    if (ok) return
    failures.push(msg)
    console.log('VERIFY FAILED ' + msg)
  }

  await wait(1600)
  await js(`(() => { const b=[...document.querySelectorAll('.tbtn')].find(x=>(x.title||'').includes('教材实验室')); if(!b) return false; b.click(); return true })()`)
  await waitFor(`!!document.querySelector('.lab')`)
  await wait(800)

  report.initial = await js(`(() => {
    const root = document.querySelector('.lab')
    const stage = document.querySelector('.lab__stagebox')
    const read = document.querySelector('.lab__readvalue')
    return {
      cls: root?.className,
      stage: stage ? { w: stage.clientWidth, h: stage.clientHeight } : null,
      readFont: read ? getComputedStyle(read).fontSize : null,
      titleFont: getComputedStyle(document.querySelector('.lab__title')).fontSize,
    }
  })()`)
  check(String(report.initial.cls).includes('lab--large'), '教材默认没有进入大屏字号')
  check(parseFloat(report.initial.readFont) >= 15, `读数字号太小（${report.initial.readFont}）`)
  await shot('big-verify-1-default.png')

  // 专注模式
  await js(`[...document.querySelectorAll('.lab__mode')].find(b=>b.textContent.includes('专注'))?.click()`)
  await wait(400)
  report.focus = await js(`(() => {
    const stage = document.querySelector('.lab__stagebox')
    return { cls: document.querySelector('.lab')?.className, w: stage.clientWidth, h: stage.clientHeight, notes: getComputedStyle(document.querySelector('.lab__notes')).display }
  })()`)
  check(String(report.focus.cls).includes('lab--focus'), '专注模式没有生效')
  check(report.focus.notes === 'none', '专注模式没有收起底部说明')
  check(report.focus.w > report.initial.stage.w, '专注模式没有放大演示台')
  await shot('big-verify-2-focus.png')

  // 缩放 + 拖动
  await js(`[...document.querySelectorAll('.lab__viewbtn')].find(b=>b.title.includes('放大'))?.click()`)
  await wait(300)
  report.zoomIn = await js(`document.querySelector('.lab__zoomval')?.textContent`)
  check(report.zoomIn === '120%', `放大按钮没有到 120%（${report.zoomIn}）`)
  await js(`(() => {
    const s=document.querySelector('.lab__stagebox'); const r=s.getBoundingClientRect();
    const opt=(x,y)=>({bubbles:true,cancelable:true,clientX:r.left+x,clientY:r.top+y,pointerId:91,isPrimary:true,pointerType:'mouse',button:0});
    s.dispatchEvent(new PointerEvent('pointerdown', opt(r.width*0.5, r.height*0.5)));
    s.dispatchEvent(new PointerEvent('pointermove', opt(r.width*0.62, r.height*0.58)));
    s.dispatchEvent(new PointerEvent('pointerup', opt(r.width*0.62, r.height*0.58)));
    return true
  })()`)
  await wait(250)
  report.pan = await js(`document.querySelector('.lab__stagezoom')?.style.transform`)
  check(String(report.pan).includes('translate') && !String(report.pan).includes('translate(0px, 0px)'), `拖动画面没有改变视角（${report.pan}）`)
  await js(`document.querySelector('.lab__zoomval')?.click()`)
  await wait(250)
  report.zoomReset = await js(`document.querySelector('.lab__zoomval')?.textContent`)
  check(report.zoomReset === '100%', '点击百分比没有复位')

  // 放大镜 / 聚光灯互斥
  await js(`(() => { const s=document.querySelector('.lab__stagebox'); const r=s.getBoundingClientRect(); s.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:r.left+r.width*0.72,clientY:r.top+r.height*0.62,pointerId:92,isPrimary:true,pointerType:'mouse'})); return true })()`)
  await js(`[...document.querySelectorAll('.lab__viewbtn')].find(b=>b.title.includes('放大镜'))?.click()`)
  await wait(400)
  report.lens = await js(`(() => { const l=document.querySelector('.lab__lens'); return l ? { w:l.clientWidth, svg:!!l.querySelector('.lab__svg'), inner:l.querySelector('.lab__lensinner')?.style.transform } : null })()`)
  check(report.lens && report.lens.w > 200 && report.lens.svg, '放大镜没有渲染出放大画面')
  await shot('big-verify-3-lens.png')
  await js(`[...document.querySelectorAll('.lab__viewbtn')].find(b=>b.title.includes('聚光灯'))?.click()`)
  await wait(400)
  report.spot = await js(`(() => ({ spot: !!document.querySelector('.lab__spot'), lens: !!document.querySelector('.lab__lens'), ctl: !!document.querySelector('.lab__spotctl') }))()`)
  check(report.spot.spot && report.spot.ctl, '聚光灯没有出现或没有光圈调节')
  check(!report.spot.lens, '聚光灯和放大镜没有互斥')
  await shot('big-verify-4-spot.png')

  // 全屏批注
  await js(`[...document.querySelectorAll('.lab__viewbtn')].find(b=>b.title.includes('批注'))?.click()`)
  await wait(400)
  report.inkOpen = await js(`!!document.querySelector('.screenink')`)
  check(report.inkOpen === true, '批注层没有打开')
  // Esc 只退出批注，不应关掉整个教材
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await wait(250)
  report.inkEsc = await js(`(() => ({ ink: !!document.querySelector('.screenink'), lab: !!document.querySelector('.lab') }))()`)
  check(!report.inkEsc.ink, 'Esc 没有退出批注')
  check(report.inkEsc.lab, 'Esc 退出批注时把教材也关了')
  // 重新打开再画
  await js(`[...document.querySelectorAll('.lab__viewbtn')].find(b=>b.title.includes('批注'))?.click()`)
  await wait(300)
  await js(`(() => {
    const s=document.querySelector('.screenink'); const r=s.getBoundingClientRect();
    const opt=(x,y)=>({bubbles:true,cancelable:true,clientX:r.left+x,clientY:r.top+y,pointerId:93,isPrimary:true,pointerType:'pen',button:0});
    s.dispatchEvent(new PointerEvent('pointerdown', opt(300,240)));
    for (let i=1;i<=16;i++) s.dispatchEvent(new PointerEvent('pointermove', opt(300+i*20, 240+Math.sin(i/2)*26)));
    s.dispatchEvent(new PointerEvent('pointerup', opt(620,240)));
    return true
  })()`)
  await wait(300)
  report.inkPaths = await js(`document.querySelectorAll('.screenink__canvas path').length`)
  check(report.inkPaths >= 1, '批注没有画出笔画')
  await shot('big-verify-5-ink.png')
  await js(`[...document.querySelectorAll('.screenink__tool')].find(b=>b.textContent.includes('撤销'))?.click()`)
  await wait(200)
  report.inkUndo = await js(`document.querySelectorAll('.screenink__canvas path').length`)
  check(report.inkUndo === 0, '批注撤销没有生效')
  await js(`document.querySelector('.screenink__exit')?.click()`)
  await wait(250)
  check((await js(`!!document.querySelector('.screenink')`)) === false, '退出批注没有关闭批注层')

  // 打开独立窗口（用测试用的 mock IPC）
  report.hasWindowBtn = await js(`!!document.querySelector('.lab__windowbtn')`)
  check(report.hasWindowBtn === true, '教材里没有独立窗口按钮')
  await js(`document.querySelector('.lab__windowbtn')?.click()`)
  const t0 = Date.now()
  while (Date.now() - t0 < 8000 && (!labWindow || labWindow.isDestroyed() || labWindow.webContents.isLoading())) {
    await wait(120)
  }
  check(!!labWindow && !labWindow.isDestroyed(), '独立窗口没有创建')
  if (labWindow && !labWindow.isDestroyed()) {
    await wait(1200)
    const ljs = (c) => labWindow.webContents.executeJavaScript(c, true)
    report.solo = await ljs(`(() => {
      const root=document.querySelector('.lab')
      const stage=document.querySelector('.lab__stagebox')
      return {
        cls: root?.className,
        title: document.title,
        select: document.querySelector('.lab__solo-select')?.value,
        stage: stage ? { w: stage.clientWidth, h: stage.clientHeight } : null,
        readFont: document.querySelector('.lab__readvalue') ? getComputedStyle(document.querySelector('.lab__readvalue')).fontSize : null,
        url: location.search,
      }
    })()`)
    check(String(report.solo.cls).includes('lab--solo'), '独立窗口没有进入 solo 布局')
    check(String(report.solo.cls).includes('lab--focus'), '独立窗口默认没有专注')
    check(report.solo.select === 'tape-speed', `独立窗口没有打开当前实验（${report.solo.select}）`)
    check(parseFloat(report.solo.readFont) >= 20, `独立窗口读数不够大（${report.solo.readFont}）`)
    await shot('big-verify-6-solo.png', labWindow)
    // 关闭窗口
    await ljs(`document.querySelector('.lab__tools .iconbtn:last-child')?.click()`)
    await wait(800)
    report.soloClosed = !labWindow || labWindow.isDestroyed()
    check(report.soloClosed, '独立窗口关闭按钮没有关闭窗口')
  }

  report.consoleErrors = errors.slice(0, 8)
  report.failures = failures
  console.log('RESULT ' + JSON.stringify(report, null, 2))
  clearTimeout(watchdog)
  app.quit()
})
