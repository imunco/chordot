/** PDF / 讲义导出：隐藏窗口渲染 A4 横向讲义，再 printToPDF 落盘
 *  渲染层 PrintSheet.tsx 收到 print:payload 后把图画完，调 printReady()，这里才出 PDF。 */
const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

/** 渲染层迟迟不就绪就别一直挂着（图片解码失败 / 组件报错） */
const READY_TIMEOUT = 20000

function safeName(name) {
  const clean = String(name || '')
    .replace(/[\\/:*?"<>|\r\n]/g, '_')
    .trim()
    .slice(0, 80)
  return clean || '弦点讲义'
}

/** 等页面加载完；已经加载完就直接返回（同步检查，中间不会漏事件） */
function whenLoaded(wc) {
  if (!wc.isLoading()) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('打印窗口加载超时'))
    }, READY_TIMEOUT)
    function onLoad() {
      cleanup()
      resolve()
    }
    function onGone() {
      cleanup()
      reject(new Error('打印窗口已关闭'))
    }
    function cleanup() {
      clearTimeout(timer)
      wc.removeListener('did-finish-load', onLoad)
      wc.removeListener('destroyed', onGone)
    }
    wc.once('did-finish-load', onLoad)
    wc.once('destroyed', onGone)
  })
}

/** 等渲染层通知「讲义画好了」 */
function whenPrintReady(wc) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('打印页面准备超时'))
    }, READY_TIMEOUT)
    function onReady(e) {
      if (e.sender !== wc) return
      cleanup()
      resolve()
    }
    function onGone() {
      cleanup()
      reject(new Error('打印窗口已关闭'))
    }
    function cleanup() {
      clearTimeout(timer)
      ipcMain.removeListener('print:ready', onReady)
      wc.removeListener('destroyed', onGone)
    }
    ipcMain.on('print:ready', onReady)
    wc.once('destroyed', onGone)
  })
}

/**
 * @param {{ createPrintWindow: () => import('electron').BrowserWindow }} deps
 *   createPrintWindow 由 main.cjs 提供：隐藏窗口 + 同一个 preload，加载 ?print=1
 */
function registerPrintIpc({ createPrintWindow }) {
  ipcMain.handle('file:export-pdf', async (e, payload) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const p = payload && typeof payload === 'object' ? payload : {}
    const title = typeof p.title === 'string' ? p.title : ''
    const defaultName = safeName(p.defaultName || title)

    // 自动化接缝：不走原生另存为
    let target = process.env.CHORDOT_TEST_PDF_SAVE
    if (!target) {
      const res = await dialog.showSaveDialog(win, {
        title: '导出 PDF 讲义',
        defaultPath: path.join(app.getPath('documents'), `${defaultName}.pdf`),
        filters: [{ name: 'PDF 讲义', extensions: ['pdf'] }],
      })
      if (res.canceled || !res.filePath) return { canceled: true }
      target = /\.pdf$/i.test(res.filePath) ? res.filePath : `${res.filePath}.pdf`
    }

    let printWin = null
    try {
      printWin = createPrintWindow()
      await whenLoaded(printWin.webContents)
      // 监听先挂好再发，避免渲染层秒回 ready 时漏掉
      const ready = whenPrintReady(printWin.webContents)
      ready.catch(() => {}) // 下面异常路径不 await 时别变成未处理 rejection
      printWin.webContents.send('print:payload', {
        png: typeof p.png === 'string' ? p.png : '',
        title,
        subtitle: typeof p.subtitle === 'string' ? p.subtitle : '',
        footer: typeof p.footer === 'string' ? p.footer : '',
      })
      await ready
      const pdf = await printWin.webContents.printToPDF({
        pageSize: 'A4',
        landscape: true,
        printBackground: true,
      })
      fs.writeFileSync(target, pdf)
      return { path: target }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    } finally {
      if (printWin && !printWin.isDestroyed()) printWin.destroy()
    }
  })
}

module.exports = { registerPrintIpc }
