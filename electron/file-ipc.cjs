/** 课件文件读写：全部走原生对话框（design.md §3.3 / §7.1） */
const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const FILTERS = [{ name: '弦点课件', extensions: ['chordot'] }]
const PACK_FILTERS = [{ name: '弦点模板包', extensions: ['chordotpack'] }]

/**
 * @param {{ addRecent: (filePath: string) => void }} hooks
 */
function registerFileIpc({ addRecent }) {
  ipcMain.handle('file:save', async (e, payload) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const { data, filePath, saveAs } = payload ?? {}
    let target = filePath

    if (!target || saveAs) {
      if (process.env.CHORDOT_TEST_SAVE) {
        target = process.env.CHORDOT_TEST_SAVE
      } else {
        const res = await dialog.showSaveDialog(win, {
          title: saveAs ? '课件另存为' : '保存课件',
          defaultPath: filePath || path.join(app.getPath('documents'), '未命名.chordot'),
          filters: FILTERS,
        })
        if (res.canceled || !res.filePath) return { canceled: true }
        target = res.filePath
      }
    }

    try {
      fs.writeFileSync(target, data, 'utf8')
      addRecent(target)
      return { path: target }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('file:open', async (e, requested) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    let target = requested

    if (!target) {
      if (process.env.CHORDOT_TEST_OPEN) {
        target = process.env.CHORDOT_TEST_OPEN
      } else {
        const res = await dialog.showOpenDialog(win, {
          title: '打开课件',
          properties: ['openFile'],
          filters: FILTERS,
        })
        if (res.canceled || res.filePaths.length === 0) return { canceled: true }
        target = res.filePaths[0]
      }
    }

    try {
      const content = fs.readFileSync(target, 'utf8')
      addRecent(target)
      return { path: target, content }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('pack:export', async (e, payload) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const { data, name } = payload ?? {}
    let target = process.env.CHORDOT_TEST_PACK_SAVE

    if (!target) {
      const res = await dialog.showSaveDialog(win, {
        title: '导出模板包',
        defaultPath: path.join(app.getPath('documents'), name || '弦点模板包.chordotpack'),
        filters: PACK_FILTERS,
      })
      if (res.canceled || !res.filePath) return { canceled: true }
      target = res.filePath
    }

    try {
      fs.writeFileSync(target, data, 'utf8')
      return { path: target }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })

  /** 批量导入：一次可选多个 .chordotpack；测试接缝支持分号分隔多路径 */
  ipcMain.handle('pack:import', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const seam = process.env.CHORDOT_TEST_PACK_OPEN
    let targets = seam ? seam.split(';').filter(Boolean) : []

    if (targets.length === 0) {
      const res = await dialog.showOpenDialog(win, {
        title: '导入模板包（可多选）',
        properties: ['openFile', 'multiSelections'],
        filters: PACK_FILTERS,
      })
      if (res.canceled || res.filePaths.length === 0) return { canceled: true }
      targets = res.filePaths
    }

    const files = []
    for (const t of targets) {
      try {
        files.push({ path: t, content: fs.readFileSync(t, 'utf8') })
      } catch (err) {
        files.push({ path: t, error: err instanceof Error ? err.message : String(err) })
      }
    }
    // 兼容旧字段：单文件时同时给出 content
    return { files, path: files[0]?.path, content: files[0]?.content }
  })

  /** 导出图片：原生另存为对话框 + 直接写文件 */
  ipcMain.handle('file:export', async (e, payload) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const { data, encoding = 'utf8', name = '未命名.png', format = 'png' } = payload ?? {}
    const ext = format === 'svg' ? 'svg' : 'png'
    const filters =
      format === 'svg'
        ? [{ name: 'SVG 矢量图', extensions: ['svg'] }]
        : [{ name: 'PNG 图片', extensions: ['png'] }]
    let target = process.env.CHORDOT_TEST_EXPORT

    if (!target) {
      const res = await dialog.showSaveDialog(win, {
        title: '导出图片',
        defaultPath: path.join(app.getPath('pictures'), name),
        filters,
      })
      if (res.canceled || !res.filePath) return { canceled: true }
      target = res.filePath.endsWith(`.${ext}`) ? res.filePath : `${res.filePath}.${ext}`
    }

    try {
      const buf = encoding === 'base64' ? Buffer.from(String(data), 'base64') : Buffer.from(String(data), 'utf8')
      fs.writeFileSync(target, buf)
      return { path: target }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })

  /** 未保存修改的确认：仅用于不可逆操作，默认焦点在“取消” */
  ipcMain.handle('dialog:confirm-unsaved', async (e, name) => {
    // 测试接缝：0 取消 / 1 放弃 / 2 保存
    if (process.env.CHORDOT_TEST_CONFIRM) return Number(process.env.CHORDOT_TEST_CONFIRM)
    const win = BrowserWindow.fromWebContents(e.sender)
    const res = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['取消', '放弃修改', '保存'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      message: `${name} 有未保存的修改`,
      detail: '关闭前要先保存吗？',
    })
    return res.response
  })
}

module.exports = { registerFileIpc, FILTERS }
