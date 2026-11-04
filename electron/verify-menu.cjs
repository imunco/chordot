/** 应用菜单巡检：结构、各项动作、最近打开 */
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { registerFileIpc } = require('../electron/file-ipc.cjs')
const { registerStoreIpc } = require('../electron/store.cjs')
const { buildAppMenu } = require('../electron/menu.cjs')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-menu-'))

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordot-menu-data-')))
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const sent = []
const recent = []
function check(cond, msg) {
  if (!cond) {
    failed++
    console.error('VERIFY FAILED ' + msg)
  }
}

async function main() {
  protocol.handle('app', (r) =>
    net.fetch(pathToFileURL(path.join(DIST, decodeURIComponent(new URL(r.url).pathname))).toString()),
  )
  ipcMain.handle('ui:get-state', () => ({ recent }))
  ipcMain.on('ui:set-state', () => {})
  registerStoreIpc()
  registerFileIpc({ addRecent: () => {} })
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
    height: 860,
    show: true,
    webPreferences: {
      preload: path.join(root, 'electron/preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  })
  const js = (c) => win.webContents.executeJavaScript(c, true)

  // 记录菜单发出的动作，同时真的转给渲染层（两端都能验）
  let menu = buildAppMenu({
    sendMenu: (action, arg) => {
      sent.push([action, arg])
      win.webContents.send('app:menu', action, arg)
    },
    recent: () => recent,
  })

  await win.loadURL('app://chordot/index.html?notour=1')
  await wait(1500)

  /* ───── 结构 ───── */
  const labels = menu.items.map((i) => i.label)
  check(
    ['文件', '编辑', '视图', '帮助'].every((l) => labels.includes(l)),
    `菜单缺项：${labels.join('/')}`,
  )

  const find = (top, item) => {
    const m = menu.items.find((i) => i.label === top)
    return m?.submenu?.items.find((i) => i.label === item || i.label.startsWith(item))
  }
  const click = (top, item) => {
    const it = find(top, item)
    if (!it) return false
    it.click()
    return true
  }

  /* ───── 帮助 → 关于 ───── */
  check(click('帮助', '关于弦点'), '帮助菜单里没有「关于」')
  await wait(500)
  const aboutTab = await js(
    `document.querySelector('.prefs__tab[data-active="true"]')?.textContent.trim() ?? null`,
  )
  check(aboutTab === '关于', `「关于」没打开关于页（当前 ${aboutTab}）`)
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await wait(300)

  /* ───── 帮助 → 快捷键 ───── */
  check(click('帮助', '快捷键一览'), '帮助菜单里没有「快捷键一览」')
  await wait(400)
  check(await js(`!!document.querySelector('.shortcuts')`), '「快捷键一览」没打开面板')
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await wait(300)

  /* ───── 帮助 → 引导教学 ───── */
  check(click('帮助', '引导教学'), '帮助菜单里没有「引导教学」')
  await wait(400)
  check(await js(`!!document.querySelector('.ob')`), '「引导教学」没打开')
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await wait(300)

  /* ───── 帮助 → 检查更新（离线桩：无更新 → toast） ───── */
  check(click('帮助', '检查更新'), '帮助菜单里没有「检查更新」')
  await wait(800)
  const toast = await js(`[...document.querySelectorAll('.toast')].pop()?.textContent ?? ''`)
  check(/最新版本/.test(toast), `检查更新没有反馈（toast=${toast}）`)

  /* ───── 编辑 → 撤销 / 重做 ───── */
  const before = await js(`window.__state.past.length`)
  check(click('编辑', '撤销'), '编辑菜单里没有「撤销」')
  await wait(300)
  check(click('编辑', '重做'), '编辑菜单里没有「重做」')
  await wait(300)
  check(typeof before === 'number', '撤销/重做读取状态失败')

  /* ───── 文件 → 新建 / 导出 ───── */
  check(click('文件', '新建'), '文件菜单里没有「新建」')
  await wait(500)

  process.env.CHORDOT_TEST_EXPORT = path.join(work, 'menu.svg')
  check(click('文件', '导出 SVG'), '文件菜单里没有「导出 SVG」')
  await wait(900)
  check(fs.existsSync(path.join(work, 'menu.svg')), '菜单导出 SVG 没有落盘')

  /* ───── 最近打开 ───── */
  recent.length = 0
  recent.push(path.join(work, 'a.chordot'), path.join(work, 'b.chordot'))
  menu = buildAppMenu({
    sendMenu: (action, arg) => {
      sent.push([action, arg])
      win.webContents.send('app:menu', action, arg)
    },
    recent: () => recent,
  })
  const recentMenu = menu.items.find((i) => i.label === '文件').submenu.items.find(
    (i) => i.label === '最近打开',
  )
  const recentLabels = recentMenu.submenu.items.map((i) => i.label)
  check(recentLabels.includes('a.chordot'), `最近打开里没有 a.chordot：${recentLabels.join('/')}`)
  check(recentLabels.includes('清除列表'), '最近打开里没有「清除列表」')

  // 点第一条：应把路径原样发给渲染层
  recentMenu.submenu.items.find((i) => i.label === 'a.chordot').click()
  await wait(300)
  const last = sent[sent.length - 1]
  check(last[0] === 'open-recent' && last[1] === path.join(work, 'a.chordot'), `最近打开传参不对：${JSON.stringify(last)}`)

  // 清除列表
  recentMenu.submenu.items.find((i) => i.label === '清除列表').click()
  await wait(300)
  check(sent.some(([a]) => a === 'clear-recent'), '清除列表没发动作')

  // 清空后的占位
  recent.length = 0
  menu = buildAppMenu({ sendMenu: () => {}, recent: () => recent })
  const emptyItems = menu.items
    .find((i) => i.label === '文件')
    .submenu.items.find((i) => i.label === '最近打开').submenu.items
  check(emptyItems.length === 1 && emptyItems[0].enabled === false, '最近打开为空时没有占位项')

  console.log('SENT ' + JSON.stringify(sent))
  if (failed === 0) console.log('RESULT 菜单巡检通过')
  else console.log(`SUMMARY ${failed} 项失败`)
  app.quit()
}

app.whenReady().then(main).catch((e) => {
  console.error('FAILED', e)
  app.quit()
})
