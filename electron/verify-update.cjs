/**
 * 自动更新验证：检查 → 启动弹窗 → 忽略本次 / 不再提醒 → 设置页手动检查
 * 用 CHORDOT_FAKE_VERSION 冒充旧版本，让线上 release 看起来是新版本。
 */
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { registerFileIpc } = require('./file-ipc.cjs')
const { registerUpdateIpc } = require('./update.cjs')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-upd-')))
process.env.CHORDOT_FAKE_VERSION = '0.0.1'

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const watchdog = setTimeout(() => {
  console.log('TIMEOUT')
  app.quit()
}, 150000)

async function main() {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url)
    return net.fetch(pathToFileURL(path.join(DIST, decodeURIComponent(pathname))).toString())
  })
  fs.mkdirSync(outDir, { recursive: true })
  ipcMain.handle('ui:get-state', () => ({}))
  ipcMain.on('ui:set-state', () => {})
  registerFileIpc({ addRecent: () => {} })
  registerUpdateIpc({ getWindow: () => win })

  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    show: true,
    backgroundColor: '#FAFAF8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  })
  const js = (code) => win.webContents.executeJavaScript(code, true)
  const report = {}
  const shot = async (name) => {
    const img = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, name), img.toPNG())
  }
  const setSettings = (patch) =>
    js(`(() => {
      const k = 'chordot.settings';
      const cur = JSON.parse(localStorage.getItem(k) || '{}');
      localStorage.setItem(k, JSON.stringify(Object.assign({ updateAuto: true, updateFreq: 'startup', updateCheckedAt: 0, updateSkip: '', updateMuted: false, onboarded: true }, cur, ${JSON.stringify(patch)})));
      return true;
    })()`)

  try {
    await win.loadURL('app://chordot/index.html?notour=1')
    await wait(1000)
    await setSettings({})
    await js(`localStorage.removeItem('chordot.settings')`)
    await js(`localStorage.setItem('chordot.settings', JSON.stringify({ updateAuto: true, updateFreq: 'startup', updateCheckedAt: 0, updateSkip: '', updateMuted: false, onboarded: true }))`)

    /* —— 1. 启动后自动检查并弹窗 —— */
    await win.loadURL('app://chordot/index.html')
    let shown = false
    for (let i = 0; i < 40; i++) {
      await wait(500)
      shown = await js(`!!document.querySelector('.update__card')`)
      if (shown) break
    }
    report.dialogShown = shown
    if (shown) {
      report.dialog = await js(`(() => ({
        title: document.querySelector('.update__title')?.textContent,
        sub: document.querySelector('.update__sub')?.textContent,
        buttons: [...document.querySelectorAll('.update__foot button')].map(b => b.textContent.trim()),
      }))()`)
      await shot('update-dialog.png')
    }

    /* —— 2. 忽略本次更新 —— */
    if (shown) {
      await js(`[...document.querySelectorAll('.update__link')].find(b => b.textContent.includes('忽略本次更新')).click()`)
      await wait(500)
      report.skipClosed = await js(`!document.querySelector('.update__card')`)
      report.skipSaved = await js(
        `JSON.parse(localStorage.getItem('chordot.settings') || '{}').updateSkip || ''`,
      )
    }

    /* —— 3. 忽略后重启不再弹 —— */
    await win.loadURL('app://chordot/index.html')
    await wait(7000)
    report.noDialogAfterSkip = await js(`!document.querySelector('.update__card')`)

    /* —— 4. 不再提醒 —— */
    await setSettings({ updateSkip: '' })
    await win.loadURL('app://chordot/index.html')
    let again = false
    for (let i = 0; i < 30; i++) {
      await wait(500)
      again = await js(`!!document.querySelector('.update__card')`)
      if (again) break
    }
    report.dialogAgain = again
    if (again) {
      await js(`[...document.querySelectorAll('.update__link')].find(b => b.textContent.includes('不再提醒')).click()`)
      await wait(1200)
      report.mutedSaved = await js(`(() => {
        const s = JSON.parse(localStorage.getItem('chordot.settings') || '{}');
        return { muted: s.updateMuted === true, autoOff: s.updateAuto === false };
      })()`)
    }
    await win.loadURL('app://chordot/index.html')
    await wait(6000)
    report.noDialogAfterMute = await js(`!document.querySelector('.update__card')`)

    /* —— 5. 设置页手动检查 —— */
    // 关掉自动检查，免得弹窗盖住设置面板
    await setSettings({ updateMuted: false, updateAuto: false, updateSkip: '' })
    await win.loadURL('app://chordot/index.html')
    await wait(1200)
    await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
    await wait(200)
    await js(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('首选项')).click()`)
    await wait(300)
    await js(`[...document.querySelectorAll('.prefs__tab')].find(t => t.textContent === '更新').click()`)
    await wait(200)
    await js(`[...document.querySelectorAll('.prefs .btn')].find(b => b.textContent === '检查更新').click()`)
    let manual = null
    for (let i = 0; i < 30; i++) {
      await wait(500)
      manual = await js(`(() => {
        const card = document.querySelector('.prefs__cardtitle')?.textContent ?? null;
        const ok = document.querySelector('.prefs__ok')?.textContent ?? null;
        const btn = [...document.querySelectorAll('.prefs .btn')].map(b => b.textContent).find(t => t.includes('检查'));
        return { card, ok, btn };
      })()`)
      if (manual.card || manual.ok) break
    }
    report.manualCheck = manual

    /* 镜像测速：只探测响应头，不下载 */
    await js(`[...document.querySelectorAll('.prefs .btn')].find(b => b.textContent === '开始测速')?.click()`)
    let probe = []
    for (let i = 0; i < 24; i++) {
      await wait(500)
      probe = await js(`[...document.querySelectorAll('.prefs__proberow')].map(r => r.textContent)`)
      if (probe.length) break
    }
    report.probe = probe.slice(0, 4)
    await shot('update-settings.png')

    if (!report.dialogShown) console.error('VERIFY FAILED 启动没有弹出更新提示')
    if (!report.skipClosed) console.error('VERIFY FAILED 忽略本次更新没关掉弹窗')
    if (!report.skipSaved) console.error('VERIFY FAILED 忽略的版本没落盘')
    if (!report.noDialogAfterSkip) console.error('VERIFY FAILED 忽略后重启还在弹')
    if (!report.noDialogAfterMute) console.error('VERIFY FAILED 不再提醒后重启还在弹')
    if (!report.manualCheck?.card && !report.manualCheck?.ok)
      console.error('VERIFY FAILED 设置页手动检查没有结果')
    if (!report.probe?.length) console.error('VERIFY FAILED 镜像测速没有结果')
    else if (!String(report.probe[0]).startsWith('最快'))
      console.error('VERIFY FAILED 测速结果没有标出最快的镜像')
  } catch (err) {
    console.error('VERIFY FAILED', err)
  }

  console.log('RESULT ' + JSON.stringify(report, null, 2))
  clearTimeout(watchdog)
  app.quit()
}

app.whenReady().then(main).catch((e) => {
  console.error('VERIFY FAILED', e)
  app.quit()
})
