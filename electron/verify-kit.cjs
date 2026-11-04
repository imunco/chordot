/** 符号键盘 + 模板库 验证 */
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-verify-kit-')))

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

  const report = {}

  /* —— 符号键盘 —— */
  await js(`document.querySelector('.toolbar [title="符号键盘 Ctrl+/"]').click()`)
  await waitFor(`!!document.querySelector('.pad')`)
  report.tabs = await js(`[...document.querySelectorAll('.pad__tab')].map(b => b.textContent)`)
  report.keyCount = await js(`document.querySelectorAll('.pad__key').length`)

  await js(`(() => { const i = document.querySelector('.left__input'); i.value = ''; i.focus(); return true })()`)
  await js(`(() => {
    const keys = [...document.querySelectorAll('.pad__key')];
    const hit = (t) => keys.find(k => k.textContent === t)?.click();
    hit('('); hit('x'); hit(')');
    return true;
  })()`)
  await wait(200)
  report.typedCommon = await js(`document.querySelector('.left__input').value`)

  await js(`[...document.querySelectorAll('.pad__tab')].find(b => b.textContent === '函数').click()`)
  await wait(200)
  await js(`[...document.querySelectorAll('.pad__key')].find(k => k.textContent === 'sin(')?.click()`)
  await wait(150)
  report.typedFunc = await js(`document.querySelector('.left__input').value`)

  await js(`[...document.querySelectorAll('.pad__tab')].find(b => b.textContent === '希腊字母').click()`)
  await wait(200)
  await js(`(() => {
    const keys = [...document.querySelectorAll('.pad__key')];
    keys.find(k => k.textContent === 'θ')?.click();
    return true;
  })()`)
  await wait(200)
  report.typedGreek = await js(`document.querySelector('.left__input').value`)

  const shotPad = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'symbol-pad.png'), shotPad.toPNG())

  /* —— 模板库：数量 / 搜索 / 收藏 / 存为模板 / 编辑 / 删除 —— */
  await js(`document.querySelector('.toolbar__menu-anchor .tbtn').click()`)
  await wait(150)
  await js(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('模板库')).click()`)
  await waitFor(`!!document.querySelector('.gallery')`)
  report.builtinCount = await js(`document.querySelectorAll('.gallery__card').length`)
  report.categories = await js(`[...document.querySelectorAll('.gallery__tab')].map(b => b.textContent)`)

  const setInput = (sel, value) =>
    js(`(() => {
      const el = document.querySelector('${sel}');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, '${value}');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`)

  /* 搜索 */
  await setInput('.gallery__search', '三角')
  await wait(300)
  report.searchCount = await js(`document.querySelectorAll('.gallery__card').length`)
  report.searchNames = await js(`[...document.querySelectorAll('.gallery__name')].map(n => n.textContent)`)
  await setInput('.gallery__search', '')
  await wait(250)

  /* 收藏 */
  await js(`document.querySelectorAll('.gallery__star')[0].click()`)
  await wait(200)
  await js(`[...document.querySelectorAll('.gallery__tab')].find(b => b.textContent.startsWith('收藏')).click()`)
  await wait(250)
  report.favCount = await js(`document.querySelectorAll('.gallery__card').length`)

  /* 存为模板 + 编辑 + 删除 */
  await js(`[...document.querySelectorAll('.gallery__tab')].find(b => b.textContent === '全部').click()`)
  await wait(200)
  await js(`document.querySelector('.gallery__save').click()`)
  await wait(300)
  await js(`[...document.querySelectorAll('.gallery__tab')].find(b => b.textContent === '自定义').click()`)
  await wait(300)
  report.customCount = await js(`document.querySelectorAll('.gallery__card').length`)
  report.customName = await js(`document.querySelector('.gallery__name')?.textContent ?? null`)

  await js(`[...document.querySelectorAll('.gallery__mini-link')].find(b => b.textContent === '编辑').click()`)
  await wait(250)
  await setInput('.gallery__card--edit .gallery__input', '我的模板')
  await wait(150)
  await js(`[...document.querySelectorAll('.gallery__mini')].find(b => b.textContent === '保存').click()`)
  await wait(300)
  report.renamed = await js(`document.querySelector('.gallery__name')?.textContent ?? null`)

  const shotGallery = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'gallery.png'), shotGallery.toPNG())

  await js(`[...document.querySelectorAll('.gallery__mini-link')].find(b => b.textContent === '删除').click()`)
  await wait(200)
  await js(`[...document.querySelectorAll('.gallery__mini-link')].find(b => b.textContent === '确定删除').click()`)
  await wait(300)
  report.afterDelete = await js(`document.querySelectorAll('.gallery__card').length`)

  /* 载入一个三维模板 */
  await js(`[...document.querySelectorAll('.gallery__tab')].find(b => b.textContent === '三维').click()`)
  await wait(250)
  report.threeDCount = await js(`document.querySelectorAll('.gallery__card').length`)
  await js(`[...document.querySelectorAll('.gallery__main')].find(c => c.textContent.includes('正八面体')).click()`)
  await wait(800)
  report.loadedFile = await js(`document.querySelector('.titlebar__file').textContent`)
  report.leftRows = await js(`[...document.querySelectorAll('.left__row .left__name')].map(n => n.textContent)`)
  report.galleryClosed = await js(`!document.querySelector('.gallery')`)

  const shotLoaded = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'template-loaded.png'), shotLoaded.toPNG())

  console.log('RESULT ' + JSON.stringify(report, null, 2))
  app.quit()
}

app.whenReady().then(main).catch((e) => {
  console.error('VERIFY FAILED', e)
  app.quit()
})
