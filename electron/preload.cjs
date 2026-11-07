const { contextBridge, ipcRenderer } = require('electron')

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
  /** 把符号实验室拼好的公式发给主窗口（机构里选中的部件） */
  applySymbolForce: (expr) => ipcRenderer.invoke('symbol:apply', expr),
  onSymbolForce: (cb) => {
    const handler = (_e, expr) => cb(String(expr))
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
