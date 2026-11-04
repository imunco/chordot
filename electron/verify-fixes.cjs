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

const solidFile = path.join(outDir, 'fix-solid.chordot')
const motionFile = path.join(outDir, 'fix-motion.chordot')

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-fixes-')))
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const watchdog = setTimeout(() => {
  console.log('TIMEOUT')
  app.quit()
}, 90000)

app.whenReady().then(async () => {
  protocol.handle('app', (req) =>
    net.fetch(
      pathToFileURL(path.join(DIST, decodeURIComponent(new URL(req.url).pathname))).toString(),
    ),
  )
  ipcMain.handle('ui:get-state', () => ({}))
  ipcMain.on('ui:set-state', () => {})
  registerFileIpc({ addRecent: () => {} })

  // 导出走 a[download]，不给 will-download 兜底会弹保存框把脚本卡住
  const downloads = []
  require('electron').session.defaultSession.on('will-download', (_e, item) => {
    downloads.push(item.getFilename())
    item.cancel()
  })

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

  const report = {}
  const step = async (label, code) => {
    try {
      report[label] = await js(code)
    } catch (err) {
      report[label] = { error: String(err).split('\n')[0] }
    }
  }
  const openGallery = async (name) => {
    await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
    await wait(150)
    await js(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('模板库')).click()`)
    await waitFor(`!!document.querySelector('.gallery')`)
    await wait(300)
    await js(`[...document.querySelectorAll('.gallery__tab')].find(b => b.textContent === '全部').click()`)
    await wait(250)
    await js(`[...document.querySelectorAll('.gallery__main')].find(c => c.textContent.includes(${JSON.stringify(name)})).click()`)
    await wait(900)
  }

  await wait(1800)

  /* —— 1. 三维课件存盘再打开 —— */
  await openGallery('正方体')
  await step('solidBefore', `window.__state.doc.scene.kind`)
  process.env.CHORDOT_TEST_SAVE = solidFile
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))`)
  await wait(900)
  report.solidSaved = fs.existsSync(solidFile)

  await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
  await wait(150)
  await js(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('清空画布')).click()`)
  await wait(500)
  process.env.CHORDOT_TEST_OPEN = solidFile
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, bubbles: true }))`)
  await wait(1200)
  await step('solidAfterOpen', `(() => {
    const st = window.__state;
    return { kind: st.doc.scene.kind, shapes: st.doc.scene.kind === 'solid' ? st.doc.scene.params.shapes.length : null, file: st.file };
  })()`)
  await step('solidToast', `[...document.querySelectorAll('.toast')].map(t => t.textContent)`)

  /* —— 2. 运动课件存盘再打开 —— */
  await openGallery('单摆')
  await step('motionBefore', `window.__state.doc.scene.kind`)
  process.env.CHORDOT_TEST_SAVE = motionFile
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))`)
  await wait(900)
  report.motionSaved = fs.existsSync(motionFile)

  await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
  await wait(150)
  await js(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('清空画布')).click()`)
  await wait(500)
  process.env.CHORDOT_TEST_OPEN = motionFile
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, bubbles: true }))`)
  await wait(1200)
  await step('motionAfterOpen', `(() => {
    const st = window.__state;
    return { kind: st.doc.scene.kind, model: st.doc.scene.kind === 'motion' ? st.doc.scene.params.model : null, mode: st.mode, subState: st.subState, file: st.file };
  })()`)

  /* —— 3. PNG 导出 —— */
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))`)
  await waitFor(`!!document.querySelector('.palette')`)
  await wait(250)
  await step('paletteItems', `[...document.querySelectorAll('.palette__item')].map(i => i.textContent)`)
  await step('pngClicked', `(() => { const i = [...document.querySelectorAll('.palette__item')].find(i => i.textContent.includes('导出 PNG')); if (!i) return 'no-item'; i.click(); return 'ok'; })()`)
  await wait(2000)
  await step('pngToast', `[...document.querySelectorAll('.toast')].map(t => t.textContent)`)

  /* —— 4. 单摆速度是线速度 —— */
  await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
  await wait(150)
  await js(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('模板库')).click()`)
  await waitFor(`!!document.querySelector('.gallery')`)
  await wait(300)
  await js(`[...document.querySelectorAll('.gallery__main')].find(c => c.textContent.includes('单摆')).click()`)
  await wait(900)
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))`)
  await wait(400)
  await js(`(() => {
    const row = [...document.querySelectorAll('.left__row')].find(r => r.textContent.includes('摆球'));
    row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return !!row;
  })()`)
  await wait(400)
  await js(`[...document.querySelectorAll('.segmented__btn')].find(b => b.textContent.includes('运动仿真'))?.click()`)
  await wait(400)
  await step('playFound', `(() => { const b = [...document.querySelectorAll('.sim__btn')].find(b => b.textContent === '播放'); if (!b) return 'no-play'; b.click(); return 'ok'; })()`)
  await wait(900)
  await js(`[...document.querySelectorAll('.sim__btn')].find(b => b.textContent === '暂停')?.click()`)
  await wait(400)
  await step('pendulumReadout', `(() => {
    const map = {};
    for (const d of document.querySelectorAll('.sim__readout > div')) {
      if (d.children.length === 2) map[d.children[0].textContent] = d.children[1].textContent;
    }
    return map;
  })()`)

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'fix-pendulum.png'), shot.toPNG())

  report.downloads = downloads
  report.consoleErrors = errors.slice(0, 5)
  console.log('RESULT ' + JSON.stringify(report, null, 2))
  clearTimeout(watchdog)
  app.quit()
})
