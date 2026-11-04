/** 本地持久化验证：设置写盘 → 清掉 localStorage → 重启后从磁盘恢复 */
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
const USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-store-'))

app.setPath('userData', USER_DATA)

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const watchdog = setTimeout(() => {
  console.log('TIMEOUT')
  app.quit()
}, 120000)

async function main() {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url)
    return net.fetch(pathToFileURL(path.join(DIST, decodeURIComponent(pathname))).toString())
  })
  fs.mkdirSync(outDir, { recursive: true })
  ipcMain.handle('ui:get-state', () => ({}))
  ipcMain.on('ui:set-state', () => {})
  registerFileIpc({ addRecent: () => {} })
  registerStoreIpc()
  // 这个套件不测更新，给几个空实现免得渲染进程报「没有处理器」
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
  const storeFile = (name) => path.join(USER_DATA, 'data', `${name}.json`)
  const readStore = (name) => {
    try {
      return JSON.parse(fs.readFileSync(storeFile(name), 'utf8'))
    } catch {
      return null
    }
  }
  const openPrefs = async (tab) => {
    await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
    await wait(200)
    await js(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('首选项')).click()`)
    await wait(350)
    if (tab) {
      await js(`[...document.querySelectorAll('.prefs__tab')].find(t => t.textContent === '${tab}').click()`)
      await wait(200)
    }
  }

  try {
    /* 1. 首次启动：走完引导（Esc = 完成） */
    await win.loadURL('app://chordot/index.html')
    await wait(1500)
    report.tourShown = await js(`!!document.querySelector('.ob')`)
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    await wait(600)

    /* 2. 改一个设置：角度单位 → 弧度 */
    await openPrefs('通用')
    await js(`[...document.querySelectorAll('.prefs .segmented__btn')].find(b => b.textContent === '弧度').click()`)
    await wait(900)
    await js(`[...document.querySelectorAll('.prefs .btn')].find(b => b.textContent === '完成').click()`)
    await wait(400)

    const settingsFile = readStore('settings')
    report.fileWritten = Boolean(settingsFile)
    report.fileAngleUnit = settingsFile?.data?.angleUnit ?? null
    report.fileOnboarded = settingsFile?.data?.onboarded ?? null
    report.dataDirExists = fs.existsSync(path.join(USER_DATA, 'data'))

    /* 3. 清掉 localStorage，模拟 leveldb 损坏 */
    await js(`localStorage.clear()`)
    await win.loadURL('app://chordot/index.html')
    await wait(1800)

    report.tourAfterWipe = await js(`!!document.querySelector('.ob')`)
    await openPrefs('通用')
    report.angleAfterWipe = await js(`(() => {
      const row = [...document.querySelectorAll('.prefs__row')].find(r => r.textContent.includes('角度单位'));
      return row?.querySelector('.segmented__btn[data-active="true"]')?.textContent ?? null;
    })()`)
    await js(`[...document.querySelectorAll('.prefs .btn')].find(b => b.textContent === '完成').click()`)
    await wait(300)

    /* 4. 关于页能看到数据目录 */
    await openPrefs('关于')
    report.dataDirShown = await js(`document.querySelector('.about__path')?.textContent ?? null`)

    const shot = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, 'persist-about.png'), shot.toPNG())

    if (!report.fileWritten) console.error('VERIFY FAILED 设置没有写到磁盘')
    if (report.fileAngleUnit !== 'rad') console.error('VERIFY FAILED 磁盘上的角度单位不是 rad')
    if (report.fileOnboarded !== true) console.error('VERIFY FAILED onboarded 没有落盘')
    if (report.tourAfterWipe) console.error('VERIFY FAILED 清掉 localStorage 后引导又出现了')
    if (report.angleAfterWipe !== '弧度') console.error('VERIFY FAILED 清掉 localStorage 后设置没恢复')
    if (!report.dataDirShown) console.error('VERIFY FAILED 关于页没有显示数据目录')
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
