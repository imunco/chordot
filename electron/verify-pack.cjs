/** 模板包导出 / 导入 验证 */
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { registerFileIpc } = require('./file-ipc.cjs')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-pack-'))
const PACK = path.join(TMP, '共享模板.chordotpack')

app.setPath('userData', path.join(TMP, 'profile'))

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

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

  await js(`
    window.__openGallery = async () => {
      document.querySelector('.toolbar__menu-anchor .tbtn').click();
      await new Promise(r => setTimeout(r, 150));
      [...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('模板库')).click();
      await new Promise(r => setTimeout(r, 400));
      return !!document.querySelector('.gallery');
    };
    window.__tab = (name) => [...document.querySelectorAll('.gallery__tab')].find(b => b.textContent === name).click();
    window.__count = () => document.querySelectorAll('.gallery__card').length;
    true;
  `)

  const report = {}

  /* 存两个模板：当前空课件 + 正方体模板 */
  await js(`window.__openGallery()`)
  await js(`document.querySelector('.gallery__save').click()`)
  await wait(250)
  await js(`document.querySelector('.iconbtn[title="关闭"]')?.click()`)
  await wait(200)

  // 载入一个三维模板，再存一次
  await js(`window.__openGallery()`)
  await js(`[...document.querySelectorAll('.gallery__main')].find(c => c.textContent.includes('正方体')).click()`)
  await wait(600)
  await js(`window.__openGallery()`)
  await js(`document.querySelector('.gallery__save').click()`)
  await wait(300)
  await js(`window.__tab('自定义')`)
  await wait(250)
  report.beforeExport = await js(`window.__count()`)
  report.names = await js(`[...document.querySelectorAll('.gallery__name')].map(n => n.textContent)`)

  /* 导出 */
  process.env.CHORDOT_TEST_PACK_SAVE = PACK
  await js(`[...document.querySelectorAll('.gallery__save')].find(b => b.textContent === '导出').click()`)
  await wait(600)
  report.exported = fs.existsSync(PACK)
  if (report.exported) {
    const pack = JSON.parse(fs.readFileSync(PACK, 'utf8'))
    report.pack = {
      app: pack.app,
      version: pack.version,
      count: pack.templates?.length,
      names: pack.templates?.map((t) => t.name),
    }
  }
  report.exportFlash = await js(`document.querySelector('.gallery__flash')?.textContent ?? null`)

  /* 全部删掉，再用模板包恢复 */
  for (let i = 0; i < 4; i++) {
    const left = await js(`window.__count()`)
    if (left === 0) break
    await js(`[...document.querySelectorAll('.gallery__mini-link')].find(b => b.textContent === '删除')?.click()`)
    await wait(150)
    await js(`[...document.querySelectorAll('.gallery__mini-link')].find(b => b.textContent === '确定删除')?.click()`)
    await wait(250)
  }
  report.afterDelete = await js(`window.__count()`)

  process.env.CHORDOT_TEST_PACK_OPEN = PACK
  await js(`[...document.querySelectorAll('.gallery__save')].find(b => b.textContent === '导入').click()`)
  await wait(700)
  report.afterImport = await js(`window.__count()`)
  report.importNames = await js(`[...document.querySelectorAll('.gallery__name')].map(n => n.textContent)`)
  report.importFlash = await js(`document.querySelector('.gallery__flash')?.textContent ?? null`)

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'template-pack.png'), shot.toPNG())

  /* 损坏的模板包：应给教学语言提示 */
  const BAD = path.join(TMP, '坏包.chordotpack')
  fs.writeFileSync(BAD, '{"app":"other"}', 'utf8')
  process.env.CHORDOT_TEST_PACK_OPEN = BAD
  await js(`[...document.querySelectorAll('.gallery__save')].find(b => b.textContent === '导入').click()`)
  await wait(500)
  report.badPackFlash = await js(`document.querySelector('.gallery__flash')?.textContent ?? null`)
  report.afterBadImport = await js(`window.__count()`)

  console.log('RESULT ' + JSON.stringify(report, null, 2))
  app.quit()
}

app.whenReady().then(main).catch((e) => {
  console.error('VERIFY FAILED', e)
  app.quit()
})
