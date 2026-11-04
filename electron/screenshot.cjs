/** 仅用于开发期视觉核对：加载构建产物并截图（node_modules/.bin/electron electron/screenshot.cjs） */
const { app, BrowserWindow, net, protocol } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const outDir = path.join(root, '.tmp')

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

async function main() {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url)
    return net.fetch(pathToFileURL(path.join(DIST, decodeURIComponent(pathname))).toString())
  })

  fs.mkdirSync(outDir, { recursive: true })
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    show: false,
    backgroundColor: '#FAFAF8',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#F2F0EC', symbolColor: '#5C5A56', height: 36 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  })

  await win.loadURL('app://chordot/index.html')
  await new Promise((r) => setTimeout(r, 1200))

  const shot = async (name) => {
    const img = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, name), img.toPNG())
  }

  await shot('electron-1.png')

  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'p' })
  win.webContents.sendInputEvent({ type: 'char', keyCode: 'p' })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'p' })
  await new Promise((r) => setTimeout(r, 300))
  await win.webContents.executeJavaScript(
    "document.querySelectorAll('.left__row')[4]?.dispatchEvent(new MouseEvent('click',{bubbles:true}))",
  )
  await new Promise((r) => setTimeout(r, 500))
  await shot('electron-2.png')

  app.quit()
}

app.whenReady().then(main)
