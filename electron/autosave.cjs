/** 自动保存快照：崩溃 / 断电后把最近一次编辑找回来
 *  只留一份 userData/autosave/latest.json（原子写），另写一份摘要给启动时读，
 *  免得 ui:get-state 为了几个字段去解析一份 20MB 的快照。 */
const { app, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

/** 超过这个长度的内容不写快照：主进程为了自动保存复制一份 20MB 字符串不划算 */
const MAX_CHARS = 20 * 1024 * 1024

const autosaveDir = () => path.join(app.getPath('userData'), 'autosave')
const snapshotPath = () => path.join(autosaveDir(), 'latest.json')
const summaryPath = () => path.join(autosaveDir(), 'latest.meta.json')

/** 先写 .tmp 再改名：中途断电不会留下半个 JSON */
function writeJsonAtomic(target, value) {
  const tmp = `${target}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value), 'utf8')
  fs.renameSync(tmp, target)
}

function normalize(payload) {
  const p = payload && typeof payload === 'object' ? payload : {}
  return {
    data: typeof p.data === 'string' ? p.data : '',
    file: typeof p.file === 'string' ? p.file : '',
    filePath: typeof p.filePath === 'string' && p.filePath ? p.filePath : null,
    at: Number.isFinite(p.at) ? Number(p.at) : Date.now(),
  }
}

function writeSnapshot(payload) {
  const snap = normalize(payload)
  // 空内容 / 超大内容都不写；覆盖旧快照比留一份空的好，但这里选择保留旧快照
  if (!snap.data || snap.data.length >= MAX_CHARS) return false
  try {
    fs.mkdirSync(autosaveDir(), { recursive: true })
    writeJsonAtomic(snapshotPath(), { exists: true, ...snap })
    writeJsonAtomic(summaryPath(), { at: snap.at, file: snap.file, filePath: snap.filePath })
    return true
  } catch {
    return false
  }
}

function readSnapshot() {
  try {
    const snap = JSON.parse(fs.readFileSync(snapshotPath(), 'utf8'))
    if (!snap || typeof snap.data !== 'string') return null
    return {
      exists: true,
      data: snap.data,
      file: typeof snap.file === 'string' ? snap.file : '',
      filePath: typeof snap.filePath === 'string' ? snap.filePath : null,
      at: Number.isFinite(snap.at) ? Number(snap.at) : 0,
    }
  } catch {
    return null
  }
}

/** 只取摘要（at / file / filePath），给 ui:get-state 用 */
function getAutosaveSummary() {
  try {
    const meta = JSON.parse(fs.readFileSync(summaryPath(), 'utf8'))
    if (meta && Number.isFinite(meta.at)) {
      return {
        at: Number(meta.at),
        file: typeof meta.file === 'string' ? meta.file : '',
        filePath: typeof meta.filePath === 'string' ? meta.filePath : null,
      }
    }
  } catch {
    /* 没有摘要（老快照）：退回整份解析 */
  }
  const snap = readSnapshot()
  return snap ? { at: snap.at, file: snap.file, filePath: snap.filePath } : null
}

function clearSnapshot() {
  for (const target of [snapshotPath(), summaryPath()]) {
    try {
      fs.unlinkSync(target)
    } catch {
      /* 本来就没有就算了 */
    }
  }
  return true
}

function registerAutosaveIpc() {
  ipcMain.handle('autosave:write', (_e, payload) => writeSnapshot(payload))
  ipcMain.handle('autosave:read', () => readSnapshot())
  ipcMain.handle('autosave:clear', () => clearSnapshot())
}

module.exports = { registerAutosaveIpc, getAutosaveSummary, autosaveDir, writeSnapshot, readSnapshot }
