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

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-lab-')))
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const watchdog = setTimeout(() => {
  console.log('TIMEOUT')
  app.quit()
}, 120000)

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
  const shot = async (name) => {
    const img = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, name), img.toPNG())
  }

  const report = {}
  const failures = []
  const check = (ok, msg) => {
    if (ok) return
    failures.push(msg)
    console.log('VERIFY FAILED ' + msg)
  }
  const step = async (label, code) => {
    try {
      report[label] = await js(code)
    } catch (err) {
      report[label] = { error: String(err).split('\n')[0] }
    }
  }

  await wait(1800)
  try {
    /* 1. 打开教材 */
    const opened = await js(`(() => {
      const b = [...document.querySelectorAll('.tbtn')].find(x => (x.title||'').includes('教材实验室'));
      if (!b) return false;
      b.click();
      return true;
    })()`)
    await waitFor(`!!document.querySelector('.lab')`)
    check(opened, '工具栏里找不到教材按钮')
    await step('experimentCount', `document.querySelectorAll('.lab__item').length`)
    check(report.experimentCount >= 20, `实验数量不足（${report.experimentCount}）`)
    await step('books', `document.querySelectorAll('.lab__book').length`)
    await step('readings', `document.querySelectorAll('.lab__read').length`)
    // 教材打开时画布快捷键必须让位，不能把背景的笔 / 删除键放进来
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }))`)
    await wait(150)
    await step('toolAfterB', `window.__state.tool`)
    check(report.toolAfterB === 'select', '教材打开时画布快捷键穿透了')
    await wait(600)
    await shot('lab-1-default.png')

    /* 2. 读数会随时间变化 */
    const r1 = await js(`[...document.querySelectorAll('.lab__readvalue')].slice(0,3).map(x=>x.textContent).join('|')`)
    await wait(900)
    const r2 = await js(`[...document.querySelectorAll('.lab__readvalue')].slice(0,3).map(x=>x.textContent).join('|')`)
    report.readingsLive = { r1, r2 }
    check(r1 !== r2, '实时读数没有随时间变化')

    /* 3. 逐个切换实验并截图 */
    const picks = ['简谐运动', '振幅、周期', '弹簧弹力', '平抛运动', '向心力', '单摆测', '玻璃折射率', '双缝干涉', '电动势与内阻', '多用电表', '玻意耳', '油膜法', '变压器', '传感器', '动量守恒', '电容器充放电', '楞次定律', '机械能守恒', '电阻率', '力的合成', '加速度与力', '作用力与反作用力', '小车速度']
    const seen = []
    for (const name of picks) {
      const ok = await js(`(() => {
        const it = [...document.querySelectorAll('.lab__item')].find(x => x.textContent.includes(${JSON.stringify(name)}));
        if (!it) return false;
        it.click();
        return true;
      })()`)
      await wait(420)
      const stage = await js(`document.querySelector('.lab__svg')?.children.length ?? 0`)
      seen.push({ name, ok, stage })
      check(ok, `列表里找不到「${name}」`)
      check(stage > 3, `「${name}」的演示台没有内容（${stage} 个节点）`)
      await shot(`lab-${picks.indexOf(name) + 1}-${name}.png`)
    }
    report.switched = seen

    /* 4. 标签页 */
    await js(`[...document.querySelectorAll('.lab__tab')].find(x=>x.textContent.includes('器材与步骤')).click()`)
    await wait(250)
    await step('stepsTab', `document.querySelectorAll('.lab__steps li').length`)
    check(report.stepsTab > 2, '器材与步骤页没有内容')
    await js(`[...document.querySelectorAll('.lab__tab')].find(x=>x.textContent.includes('误差与注意')).click()`)
    await wait(200)
    await step('errorsTab', `document.querySelectorAll('.lab__bullets li').length`)
    check(report.errorsTab > 2, '误差与注意页没有内容')

    /* 5. 搜索与分类 */
    await js(`(() => {
      const inp = document.querySelector('.lab__search');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(inp, '折射');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`)
    await wait(300)
    await step('searchCount', `document.querySelectorAll('.lab__item').length`)
    check(report.searchCount >= 1 && report.searchCount < 6, '搜索没有过滤列表')
    await js(`(() => {
      const inp = document.querySelector('.lab__search');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(inp, '');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`)
    await wait(200)
    await js(`[...document.querySelectorAll('.lab__book')].find(x=>x.textContent.includes('必修二')).click()`)
    await wait(250)
    await step('bookFilter', `document.querySelectorAll('.lab__item').length`)
    check(report.bookFilter === 3, `必修二应有 3 个实验，实际 ${report.bookFilter}`)

    /* 6. 收藏 */
    await js(`document.querySelector('.lab__itemfav').click()`)
    await wait(200)
    await step('favCount', `document.querySelectorAll('.lab__itemfav[data-on="true"]').length`)
    check(report.favCount === 1, '收藏没有生效')

    /* 7. 参数滑杆 */
    await js(`[...document.querySelectorAll('.lab__book')].find(x=>x.textContent.includes('全部')).click()`)
    await wait(200)
    await js(`(() => {
      const it = [...document.querySelectorAll('.lab__item')].find(x => x.textContent.includes('玻意耳'));
      it.click();
      return true;
    })()`)
    await wait(300)
    const before = await js(`document.querySelector('.lab__readvalue')?.textContent ?? ''`)
    await js(`(() => {
      const r = document.querySelector('.lab__ctl input[type=range]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(r, '320');
      r.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`)
    await wait(300)
    const after = await js(`document.querySelector('.lab__readvalue')?.textContent ?? ''`)
    report.param = { before, after }
    check(before !== after, '拖动参数后读数没有变化')

    /* 8. Esc 关闭 */
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    await wait(300)
    await step('closed', `!document.querySelector('.lab')`)
    check(report.closed === true, 'Esc 没有关闭教材')

    /* 9. 批注：铅笔 / 速度感应 / 自定义色 / 隐藏 */
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }))`)
    await wait(250)
    await js(`[...document.querySelectorAll('.penbar__mode')].find(b=>b.textContent.includes('铅笔')).click()`)
    await wait(200)
    await js(`(() => {
      const svg = document.querySelector('.canvas__svg');
      const r = svg.getBoundingClientRect();
      const opt = (x,y) => ({ bubbles:true, cancelable:true, clientX:r.left+x, clientY:r.top+y, pointerId:31, isPrimary:true, pointerType:'mouse', button:0 });
      svg.dispatchEvent(new PointerEvent('pointerdown', opt(360, 300)));
      for (let i=1;i<=14;i++) svg.dispatchEvent(new PointerEvent('pointermove', opt(360+i*13, 300+Math.sin(i/2)*20)));
      svg.dispatchEvent(new PointerEvent('pointerup', opt(542, 300)));
      return true;
    })()`)
    await wait(400)
    report.pencil = await js(`(() => {
      const s = (window.__state.doc.strokes ?? []).slice(-1)[0];
      return s ? { mode: s.mode, weights: (s.weights ?? []).length, min: s.weights ? Math.min(...s.weights) : null, max: s.weights ? Math.max(...s.weights) : null } : null;
    })()`)
    check(report.pencil && report.pencil.mode === 'pencil', '没有切到铅笔笔型')
    check(report.pencil && report.pencil.weights > 3, '速度感应没有记录逐点线宽')
    check(
      report.pencil && report.pencil.min !== null && report.pencil.max - report.pencil.min > 0.05,
      '速度感应线宽没有变化',
    )
    await step('ribbon', `!!document.querySelector('[data-strokes] path[filter]')`)
    check(report.ribbon === true, '铅笔笔迹没有纸面纹理滤镜')

    await js(`document.querySelector('.penbar__more').click()`)
    await wait(250)
    await step('palette', `!!document.querySelector('.colorpal')`)
    await step('customColor', `!!document.querySelector('.colorpal__custom input[type=color]')`)
    check(report.palette && report.customColor, '色盘里没有自定义取色')
    await js(`(() => {
      const inp = document.querySelector('.colorpal__custom input[type=color]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(inp, '#2f6fa8');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`)
    await wait(250)
    await step('penColor', `window.__state.penColor`)
    check(report.penColor === '#2f6fa8', '自定义颜色没有写进状态')
    await js(`document.querySelector('.colorpal__mini').click()`)
    await wait(200)
    await step('favColor', `document.querySelectorAll('.colorpal__swatch--fav').length`)
    check(report.favColor === 1, '收藏颜色没有生效')
    await shot('lab-ink-palette.png')
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    await wait(300)
    await shot('lab-ink-pencil.png')

    await js(`[...document.querySelectorAll('.penbar__icon')].find(b=>(b.title||'').includes('隐藏全部批注')).click()`)
    await wait(250)
    await step('inkHidden', `window.__state.inkHidden`)
    await step('inkGone', `document.querySelectorAll('[data-strokes] path').length`)
    check(report.inkHidden === true, '隐藏批注没有生效')
    check(report.inkGone === 0, '隐藏后仍渲染了笔迹')
    await shot('lab-ink-hidden.png')
  } catch (err) {
    report.fatal = String(err).split('\n')[0]
  }

  report.consoleErrors = errors.slice(0, 8)
  report.failures = failures
  console.log('RESULT ' + JSON.stringify(report, null, 2))
  clearTimeout(watchdog)
  app.quit()
})
