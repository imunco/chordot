const { app, ipcMain, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

/**
 * 用户数据的本地落盘目录。
 *
 * 渲染进程平时写 localStorage（快、同步），这里再镜像一份到
 * `userData/data/<name>.json`：
 * - localStorage 所在的 leveldb 偶尔会因为崩溃损坏，文件还在就能恢复
 * - 纯 JSON，用户可以直接备份、拷到另一台机器
 */
const dataDir = () => path.join(app.getPath('userData'), 'data')

const safeName = (name) => {
  const clean = String(name || '').replace(/[^a-zA-Z0-9_-]/g, '')
  return clean || 'store'
}

const fileOf = (name) => path.join(dataDir(), `${safeName(name)}.json`)

function read(name) {
  try {
    return JSON.parse(fs.readFileSync(fileOf(name), 'utf8'))
  } catch {
    return null
  }
}

function write(name, payload) {
  try {
    fs.mkdirSync(dataDir(), { recursive: true })
    const target = fileOf(name)
    const tmp = `${target}.tmp`
    // 先写临时文件再改名：中途断电不会留下半个 JSON
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8')
    fs.renameSync(tmp, target)
    return true
  } catch {
    return false
  }
}

function registerStoreIpc() {
  ipcMain.handle('store:get', (_e, name) => read(name))
  ipcMain.handle('store:set', (_e, name, payload) => write(name, payload))
  ipcMain.handle('store:dir', () => dataDir())
  ipcMain.handle('store:open', async () => {
    fs.mkdirSync(dataDir(), { recursive: true })
    const err = await shell.openPath(dataDir())
    return err || null
  })
  /** 导出整份数据目录里的 JSON，给「备份」用 */
  ipcMain.handle('store:dump', () => {
    try {
      const files = fs.readdirSync(dataDir()).filter((f) => f.endsWith('.json'))
      return files.map((f) => ({
        name: f.replace(/\.json$/, ''),
        content: fs.readFileSync(path.join(dataDir(), f), 'utf8'),
      }))
    } catch {
      return []
    }
  })
}

module.exports = { registerStoreIpc, dataDir }
