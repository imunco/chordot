const { contextBridge, ipcRenderer, webUtils } = require('electron')

// 打印窗口的 payload 可能在 React 挂载前就到了（print.cjs 在页面 load 后立刻发），
// 先缓冲一份，等 PrintSheet 订阅时补发，避免「打印页面准备超时」。
let printPayloadBuffer = null
ipcRenderer.on('print:payload', (_e, payload) => {
  printPayloadBuffer = payload && typeof payload === 'object' ? payload : null
})

// 文件关联 / 第二实例可能在 React 挂载前就送到；先攒着，App 订阅后补发
const openFileBuffer = []
ipcRenderer.on('app:open-file', (_e, filePath) => {
  if (filePath) openFileBuffer.push(String(filePath))
})

// 模板库窗口的选取同理：主窗口可能刚启动
let galleryPickBuffer = null
ipcRenderer.on('gallery:pick', (_e, payload) => {
  galleryPickBuffer = payload && typeof payload === 'object' ? payload : null
})

contextBridge.exposeInMainWorld('chordot', {
  platform: process.platform,
  getUiState: () => ipcRenderer.invoke('ui:get-state'),
  setUiState: (patch) => ipcRenderer.send('ui:set-state', patch),

  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
  openFile: (filePath) => ipcRenderer.invoke('file:open', filePath),
  confirmUnsaved: (name) => ipcRenderer.invoke('dialog:confirm-unsaved', name),
  exportFile: (payload) => ipcRenderer.invoke('file:export', payload),
  exportPack: (payload) => ipcRenderer.invoke('pack:export', payload),
  importPack: () => ipcRenderer.invoke('pack:import'),
  closeWindow: () => ipcRenderer.send('app:close'),
  openLabWindow: (id) => ipcRenderer.invoke('lab:open-window', { id }),
  openSymbolWindow: () => ipcRenderer.invoke('symbol:open-window'),
  /** 把符号实验室拼好的公式发给主窗口：{ expr, target, value }，旧字符串也兼容 */
  applySymbolForce: (payload) => ipcRenderer.invoke('symbol:apply', payload),
  onSymbolForce: (cb) => {
    const handler = (_e, payload) => {
      if (typeof payload === 'string') cb({ expr: payload, target: 'force', value: null })
      else cb(payload || { expr: '', target: 'force', value: null })
    }
    ipcRenderer.on('symbol:apply', handler)
    return () => ipcRenderer.removeListener('symbol:apply', handler)
  },
  /** 教材画面导出：截当前窗口的一块内容区，返回 base64 PNG */
  labCapture: (rect) => ipcRenderer.invoke('lab:capture', rect),
  /** 主窗口 / 独立窗口实验切换同步 */
  syncLab: (id) => ipcRenderer.send('lab:sync', id),
  onLabSync: (cb) => {
    const handler = (_e, id) => cb(String(id))
    ipcRenderer.on('lab:sync', handler)
    return () => ipcRenderer.removeListener('lab:sync', handler)
  },
  setFullscreen: (on) => ipcRenderer.invoke('window:fullscreen', Boolean(on)),
  onFullscreenChange: (cb) => {
    const handler = (_e, on) => cb(Boolean(on))
    ipcRenderer.on('window:fullscreen', handler)
    return () => ipcRenderer.removeListener('window:fullscreen', handler)
  },
  onLabSwitch: (cb) => {
    const handler = (_e, id) => cb(id)
    ipcRenderer.on('lab:switch', handler)
    return () => ipcRenderer.removeListener('lab:switch', handler)
  },
  onRequestClose: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('app:request-close', handler)
    return () => ipcRenderer.removeListener('app:request-close', handler)
  },
  /** 应用菜单动作（新建/打开/保存/撤销/设置/关于…） */
  onMenu: (cb) => {
    const handler = (_e, action, arg) => cb(action, arg)
    ipcRenderer.on('app:menu', handler)
    return () => ipcRenderer.removeListener('app:menu', handler)
  },

  /** 自动保存 / 崩溃恢复 */
  autosave: {
    write: (payload) => ipcRenderer.invoke('autosave:write', payload),
    read: () => ipcRenderer.invoke('autosave:read'),
    clear: () => ipcRenderer.invoke('autosave:clear'),
  },

  /** 版本历史 / 课件库 / 文件头元信息 */
  history: {
    list: (filePath) => ipcRenderer.invoke('history:list', filePath),
    read: (historyPath) => ipcRenderer.invoke('history:read', historyPath),
  },
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    add: (payload) => ipcRenderer.invoke('library:add', payload),
    open: (filePath) => ipcRenderer.invoke('library:open', filePath),
  },
  peekFile: (filePath) => ipcRenderer.invoke('file:peek', filePath),

  /** 文件关联 / 第二次启动 / 拖拽 */
  onOpenFile: (cb) => {
    const handler = (_e, filePath) => {
      if (filePath) cb(String(filePath))
    }
    ipcRenderer.on('app:open-file', handler)
    while (openFileBuffer.length > 0) {
      const pending = openFileBuffer.shift()
      setTimeout(() => cb(pending), 0)
    }
    return () => ipcRenderer.removeListener('app:open-file', handler)
  },
  getPathForFile: (file) => {
    try {
      return file && webUtils && webUtils.getPathForFile ? webUtils.getPathForFile(file) : ''
    } catch {
      return ''
    }
  },

  /** 独立模板库窗口 */
  openGalleryWindow: () => ipcRenderer.invoke('gallery:open-window'),
  galleryPick: (payload) => ipcRenderer.invoke('gallery:pick', payload),
  onGalleryPick: (cb) => {
    const handler = (_e, payload) => cb(payload || { scene: null, file: null })
    ipcRenderer.on('gallery:pick', handler)
    if (galleryPickBuffer) {
      const pending = galleryPickBuffer
      galleryPickBuffer = null
      setTimeout(() => cb(pending), 0)
    }
    return () => ipcRenderer.removeListener('gallery:pick', handler)
  },

  /** PDF 讲义导出 */
  exportPDF: (payload) => ipcRenderer.invoke('file:export-pdf', payload),
  onPrintPayload: (cb) => {
    const handler = (_e, payload) => cb(payload || {})
    ipcRenderer.on('print:payload', handler)
    if (printPayloadBuffer) {
      const pending = printPayloadBuffer
      printPayloadBuffer = null
      setTimeout(() => cb(pending), 0)
    }
    return () => ipcRenderer.removeListener('print:payload', handler)
  },
  printReady: () => ipcRenderer.send('print:ready'),

  /** 本地错误日志 */
  reportError: (payload) => ipcRenderer.send('app:error-log', payload),

  /** 更新：检查 / 下载 / 安装 / 进度 */
  update: {
    info: () => ipcRenderer.invoke('update:info'),
    check: (opts) => ipcRenderer.invoke('update:check', opts),
    download: (payload) => ipcRenderer.invoke('update:download', payload),
    cancel: () => ipcRenderer.invoke('update:cancel'),
    probe: (url) => ipcRenderer.invoke('update:probe', url),
    install: (filePath) => ipcRenderer.invoke('update:install', filePath),
    openRelease: (url) => ipcRenderer.invoke('update:openRelease', url),
    onProgress: (cb) => {
      const handler = (_e, payload) => cb(payload)
      ipcRenderer.on('update:progress', handler)
      return () => ipcRenderer.removeListener('update:progress', handler)
    },
  },
  about: () => ipcRenderer.invoke('app:about'),

  /** 本地持久化：localStorage 之外再落一份 JSON */
  store: {
    get: (name) => ipcRenderer.invoke('store:get', name),
    set: (name, payload) => ipcRenderer.invoke('store:set', name, payload),
    dir: () => ipcRenderer.invoke('store:dir'),
    open: () => ipcRenderer.invoke('store:open'),
    dump: () => ipcRenderer.invoke('store:dump'),
  },
})

// 首屏渲染完成（两帧后）告诉主进程，用于 ui:get-state.slowStart
window.addEventListener('load', () => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        ipcRenderer.send('app:interactive')
      } catch {
        /* 忽略 */
      }
    })
  })
})
