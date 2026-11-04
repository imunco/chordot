const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('chordot', {
  platform: process.platform,
  getUiState: () => ipcRenderer.invoke('ui:get-state'),
  setUiState: (patch) => ipcRenderer.send('ui:set-state', patch),

  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
  openFile: (filePath) => ipcRenderer.invoke('file:open', filePath),
  confirmUnsaved: (name) => ipcRenderer.invoke('dialog:confirm-unsaved', name),
  exportPack: (payload) => ipcRenderer.invoke('pack:export', payload),
  importPack: () => ipcRenderer.invoke('pack:import'),
  closeWindow: () => ipcRenderer.send('app:close'),
  onRequestClose: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('app:request-close', handler)
    return () => ipcRenderer.removeListener('app:request-close', handler)
  },

  /** 更新：检查 / 下载 / 安装 / 进度 */
  update: {
    info: () => ipcRenderer.invoke('update:info'),
    check: (opts) => ipcRenderer.invoke('update:check', opts),
    download: (payload) => ipcRenderer.invoke('update:download', payload),
    cancel: () => ipcRenderer.invoke('update:cancel'),
    install: (filePath) => ipcRenderer.invoke('update:install', filePath),
    openRelease: (url) => ipcRenderer.invoke('update:openRelease', url),
    onProgress: (cb) => {
      const handler = (_e, payload) => cb(payload)
      ipcRenderer.on('update:progress', handler)
      return () => ipcRenderer.removeListener('update:progress', handler)
    },
  },
  about: () => ipcRenderer.invoke('app:about'),
})
