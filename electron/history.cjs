/** 版本历史 + 课件库
 *  历史由 file:save 成功后自动记录（保存前的旧内容），课件库是用户显式收藏的课件副本。
 *  两者都在 userData 下，读回时只认自己目录里的路径。 */
const { app, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

/** 每个课件最多保留 20 份历史，按时间倒序清理 */
const MAX_HISTORY = 20

const historyRoot = () => path.join(app.getPath('userData'), 'history')
const libraryRoot = () => path.join(app.getPath('userData'), 'library')

const pad = (n) => String(n).padStart(2, '0')

/** 20261126-013005 */
function timeStamp(d = new Date()) {
  const day = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `${day}-${time}`
}

/** 文件名安全化：去掉扩展名、路径分隔符和 Windows 非法字符 */
function safeBase(filePath) {
  const base = path.basename(String(filePath || '')).replace(/\.chordot$/i, '')
  const clean = base.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 60)
  return clean || '未命名'
}

/** 只认 root 目录内的路径（防 ../ 穿越） */
function inside(root, target) {
  const rootPath = path.resolve(root)
  const full = path.resolve(String(target || ''))
  return full.startsWith(rootPath + path.sep)
}

function statItem(target) {
  try {
    const st = fs.statSync(target)
    return { size: st.size, at: Math.round(st.mtimeMs) }
  } catch {
    return { size: 0, at: 0 }
  }
}

function pruneHistory(dir) {
  let names = []
  try {
    names = fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.chordot'))
  } catch {
    return
  }
  const items = names.map((name) => ({ name, ...statItem(path.join(dir, name)) }))
  items.sort((a, b) => b.at - a.at)
  for (const item of items.slice(MAX_HISTORY)) {
    try {
      fs.unlinkSync(path.join(dir, item.name))
    } catch {
      /* 删不掉就留着 */
    }
  }
}

/** file:save 成功后由主进程调用：把「保存前」的旧内容记一份 */
function recordHistory(filePath, content) {
  if (typeof filePath !== 'string' || !filePath) return null
  if (typeof content !== 'string' || !content) return null
  try {
    const dir = path.join(historyRoot(), safeBase(filePath))
    fs.mkdirSync(dir, { recursive: true })
    // 同一秒内连续保存：加序号，别互相覆盖
    const base = timeStamp()
    let name = `${base}.chordot`
    let i = 2
    while (fs.existsSync(path.join(dir, name))) {
      name = `${base}-${i}.chordot`
      i += 1
    }
    const target = path.join(dir, name)
    fs.writeFileSync(target, content, 'utf8')
    pruneHistory(dir)
    return target
  } catch {
    return null
  }
}

function listHistory(filePath) {
  if (typeof filePath !== 'string' || !filePath) return { items: [] }
  const dir = path.join(historyRoot(), safeBase(filePath))
  let names = []
  try {
    names = fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.chordot'))
  } catch {
    return { items: [] }
  }
  const items = names.map((name) => {
    const target = path.join(dir, name)
    const { at, size } = statItem(target)
    return { name: name.replace(/\.chordot$/i, ''), path: target, at, size }
  })
  items.sort((a, b) => b.at - a.at)
  return { items }
}

function readHistory(historyPath) {
  const target = path.resolve(String(historyPath || ''))
  if (!inside(historyRoot(), target)) return { error: '只允许读取版本历史目录内的文件' }
  try {
    return { content: fs.readFileSync(target, 'utf8') }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

function ensureLibrary() {
  fs.mkdirSync(libraryRoot(), { recursive: true })
}

function listLibrary() {
  try {
    ensureLibrary()
    const names = fs.readdirSync(libraryRoot()).filter((n) => n.toLowerCase().endsWith('.chordot'))
    const items = names.map((name) => {
      const target = path.join(libraryRoot(), name)
      const { at, size } = statItem(target)
      return { path: target, name: name.replace(/\.chordot$/i, ''), at, size }
    })
    items.sort((a, b) => b.at - a.at)
    return { items }
  } catch {
    return { items: [] }
  }
}

/** 把当前课件另存一份进课件库：重名自动加序号，成功返回新路径，失败返回空串 */
function addLibrary(payload) {
  const p = payload && typeof payload === 'object' ? payload : {}
  const content = typeof p.content === 'string' ? p.content : ''
  if (!content) return ''
  try {
    ensureLibrary()
    const base = safeBase(p.path || '未命名课件')
    let name = `${base}.chordot`
    let i = 2
    while (fs.existsSync(path.join(libraryRoot(), name))) {
      name = `${base} (${i}).chordot`
      i += 1
    }
    const target = path.join(libraryRoot(), name)
    fs.writeFileSync(target, content, 'utf8')
    return target
  } catch {
    return ''
  }
}

function openLibrary(filePath) {
  const target = path.resolve(String(filePath || ''))
  if (!inside(libraryRoot(), target)) return { error: '只允许打开课件库内的文件' }
  try {
    return { content: fs.readFileSync(target, 'utf8') }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

function registerHistoryIpc() {
  ipcMain.handle('history:list', (_e, filePath) => listHistory(filePath))
  ipcMain.handle('history:read', (_e, historyPath) => readHistory(historyPath))
  ipcMain.handle('library:list', () => listLibrary())
  ipcMain.handle('library:add', (_e, payload) => addLibrary(payload))
  ipcMain.handle('library:open', (_e, filePath) => openLibrary(filePath))
}

module.exports = {
  registerHistoryIpc,
  recordHistory,
  historyRoot,
  libraryRoot,
  listHistory,
  listLibrary,
}
