/** 首次引导 + 设置分页 + 关于页 + 更新页 验证 */
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

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-tour-')))

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
  registerUpdateIpc({ getWindow: () => win })

  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    show: true,
    backgroundColor: '#FAFAF8',
    titleBarStyle: 'hidden',
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

  try {
    /* 预置：关掉自动检查更新，避免弹窗干扰 */
    await win.loadURL('app://chordot/index.html?notour=1')
    await wait(1200)
    await js(`localStorage.setItem('chordot.settings', JSON.stringify({ updateAuto: false }))`)

    /* —— 1. 首次启动应该出现引导 —— */
    await win.loadURL('app://chordot/index.html')
    await wait(1600)
    report.tourShown = await js(`!!document.querySelector('.ob')`)
    report.firstStep = await js(`(() => {
      const c = document.querySelector('.ob__count')?.textContent;
      const t = document.querySelector('.ob__title')?.textContent;
      const pts = document.querySelectorAll('.ob__points li').length;
      return { count: c, title: t, points: pts };
    })()`)
    await shot('tour-1.png')

    /* —— 2. 走完 8 步 —— */
    const nextLabel = () => js(`document.querySelector('.ob__nav .btn--primary')?.textContent`)
    const steps = []
    for (let i = 0; i < 8; i++) {
      steps.push(await js(`document.querySelector('.ob__count')?.textContent`))
      if (i < 7) {
        await js(`document.querySelector('.ob__nav .btn--primary').click()`)
        await wait(140)
      }
    }
    report.steps = steps
    report.lastLabel = await nextLabel()
    await shot('tour-last.png')

    await js(`document.querySelector('.ob__nav .btn--primary').click()`)
    await wait(500)
    report.closedAfterFinish = await js(`!document.querySelector('.ob')`)
    report.onboardedSaved = await js(
      `JSON.parse(localStorage.getItem('chordot.settings') || '{}').onboarded === true`,
    )

    /* —— 3. 重开不再出现 —— */
    await win.loadURL('app://chordot/index.html')
    await wait(1500)
    report.noTourOnSecondRun = await js(`!document.querySelector('.ob')`)

    /* —— 4. 设置分页 —— */
    await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
    await wait(200)
    await js(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('首选项')).click()`)
    await wait(400)
    report.prefsOpen = await js(`!!document.querySelector('.prefs')`)
    report.tabs = await js(`[...document.querySelectorAll('.prefs__tab')].map(t => t.textContent)`)
    report.generalRows = await js(
      `[...document.querySelectorAll('.prefs__label')].map(l => l.childNodes[0].textContent.trim())`,
    )
    await shot('prefs-general.png')

    /* 个性化 */
    await js(`[...document.querySelectorAll('.prefs__tab')].find(t => t.textContent === '个性化').click()`)
    await wait(250)
    report.lookRows = await js(
      `[...document.querySelectorAll('.prefs__label')].map(l => l.childNodes[0].textContent.trim())`,
    )
    await shot('prefs-look.png')

    /* 关于 */
    await js(`[...document.querySelectorAll('.prefs__tab')].find(t => t.textContent === '关于').click()`)
    await wait(250)
    report.about = await js(`(() => ({
      name: document.querySelector('.about__name')?.textContent,
      ver: document.querySelector('.about__ver')?.textContent,
      dev: document.querySelector('.about__dev')?.textContent,
      meta: [...document.querySelectorAll('.about__meta span')].map(s => s.textContent),
      copy: document.querySelector('.about__copy')?.textContent,
    }))()`)
    await shot('prefs-about.png')

    /* 更新 */
    await js(`[...document.querySelectorAll('.prefs__tab')].find(t => t.textContent === '更新').click()`)
    await wait(250)
    report.updateRows = await js(
      `[...document.querySelectorAll('.prefs__label')].map(l => l.childNodes[0].textContent.trim())`,
    )
    report.mirrorOptions = await js(
      `[...document.querySelectorAll('.prefs__select')].map(s => [...s.options].map(o => o.textContent))`,
    )
    await shot('prefs-update.png')

    /* —— 5. 重新观看引导 —— */
    await js(`[...document.querySelectorAll('.prefs__tab')].find(t => t.textContent === '个性化').click()`)
    await wait(200)
    await js(`[...document.querySelectorAll('.prefs .btn')].find(b => b.textContent === '重新观看').click()`)
    await wait(400)
    report.tourReplay = await js(`!!document.querySelector('.ob')`)

    /* 断言 */
    if (!report.tourShown) console.error('VERIFY FAILED 首次启动没有出现引导')
    if (report.firstStep?.count !== '1 / 8') console.error('VERIFY FAILED 引导步数不对')
    if (report.lastLabel !== '开始作图') console.error('VERIFY FAILED 最后一步按钮文案不对')
    if (!report.closedAfterFinish) console.error('VERIFY FAILED 引导没有关闭')
    if (!report.onboardedSaved) console.error('VERIFY FAILED onboarded 没落盘')
    if (!report.noTourOnSecondRun) console.error('VERIFY FAILED 第二次启动还在显示引导')
    if (report.tabs?.join(',') !== '通用,个性化,更新,关于')
      console.error('VERIFY FAILED 设置分页不对')
    if (report.about?.name !== '弦点 Chordot') console.error('VERIFY FAILED 关于页应用名不对')
    if (!/版本 \d+\.\d+\.\d+/.test(report.about?.ver ?? ''))
      console.error('VERIFY FAILED 关于页版本号不对')
    if (report.about?.dev !== '奇点未码工作室') console.error('VERIFY FAILED 关于页开发者不对')
    if (!report.updateRows?.includes('自动检查更新')) console.error('VERIFY FAILED 更新页缺少自动检查')
    if (!report.tourReplay) console.error('VERIFY FAILED 设置里没能重新观看引导')
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
