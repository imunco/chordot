/** 应用菜单：文件 / 编辑 / 视图 / 帮助。菜单栏默认隐藏，Alt 唤出，加速键始终生效。 */
const { Menu, shell } = require('electron')
const path = require('node:path')

/**
 * @param {{
 *   sendMenu: (action: string, arg?: string) => void
 *   recent: () => string[]
 * }} deps
 */
function buildAppMenu({ sendMenu, recent }) {
  const list = Array.isArray(recent()) ? recent().slice(0, 8) : []
  const recentItems =
    list.length === 0
      ? [{ label: '（还没有打开过文件）', enabled: false }]
      : [
          ...list.map((p) => ({
            label: path.basename(p),
            toolTip: p,
            click: () => sendMenu('open-recent', p),
          })),
          { type: 'separator' },
          { label: '清除列表', click: () => sendMenu('clear-recent') },
        ]

  const menu = Menu.buildFromTemplate([
    {
      label: '文件',
      submenu: [
        // 这几个快捷键由渲染层统一处理（输入框里也要能用），菜单只做提示，不挂加速键，
        // 免得一次按键走两条路
        { label: '新建  Ctrl+N', click: () => sendMenu('new') },
        { label: '打开…  Ctrl+O', click: () => sendMenu('open') },
        { label: '保存  Ctrl+S', click: () => sendMenu('save') },
        { label: '另存为…  Ctrl+Shift+S', click: () => sendMenu('save-as') },
        { type: 'separator' },
        { label: '最近打开', submenu: recentItems },
        { type: 'separator' },
        { label: '导出 PNG…', accelerator: 'CmdOrCtrl+E', click: () => sendMenu('export-png') },
        { label: '导出 SVG…', accelerator: 'CmdOrCtrl+Shift+E', click: () => sendMenu('export-svg') },
        { type: 'separator' },
        { label: '打开数据目录', click: () => sendMenu('data-dir') },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销  Ctrl+Z', click: () => sendMenu('undo') },
        { label: '重做  Ctrl+Shift+Z', click: () => sendMenu('redo') },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { type: 'separator' },
        { label: '设置…', accelerator: 'CmdOrCtrl+,', click: () => sendMenu('prefs') },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { label: '教材实验室…', click: () => sendMenu('textbook') },
        { label: '教材实验室（独立窗口）…', click: () => sendMenu('textbook-window') },
        { type: 'separator' },
        // 讲台投影时去掉标题栏和任务栏，多出一整条画布
        { role: 'togglefullscreen', label: '全屏（F11）', accelerator: 'F11' },
        { role: 'resetZoom', label: '重置界面缩放' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        // 不挂 F1 加速键：渲染层自己处理，避免和页面快捷键各触发一次
        { label: '快捷键一览（F1）', click: () => sendMenu('shortcuts') },
        { label: '引导教学', click: () => sendMenu('tour') },
        { type: 'separator' },
        { label: '检查更新…', click: () => sendMenu('check-update') },
        { label: '关于弦点 Chordot', click: () => sendMenu('about') },
        { type: 'separator' },
        { label: '项目主页', click: () => shell.openExternal('https://github.com/imunco/chordot') },
        {
          label: '问题反馈',
          click: () => shell.openExternal('https://github.com/imunco/chordot/issues'),
        },
      ],
    },
  ])
  Menu.setApplicationMenu(menu)
  return menu
}

module.exports = { buildAppMenu }
