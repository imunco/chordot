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
