# 弦点 v0.16.0 实现规格（共享契约）

> 目标：把「大厅工程化 + 辅助窗口独立 + 教学演示」这批需求落地；P2 的机构物理 / 符号实验室 / 三维贴图并行推进。
> 明确不做：多页课件（scene → pages 重构）、批注锚定。

## 0. 文件所有权（严格）

| 文件 / 目录 | 负责人 |
|---|---|
| src/App.tsx、src/main.tsx、src/components/Lobby.tsx、NewDocDialog.tsx、PrintSheet.tsx（新）、TitleBar.tsx、Preferences.tsx、src/settings.ts、src/io/file.ts、src/kernel/types.ts、src/styles/*.css（print.css 除外）、src/model/starters.ts、src/model/hitokoto.ts（新） | Lead |
| electron/main.cjs、preload.cjs、file-ipc.cjs、menu.cjs、autosave.cjs（新）、history.cjs（新）、print.cjs（新）、errorlog.cjs（新）、package.json 的 build 配置 | teammate electron-core |
| src/components/MechStage.tsx、electron/verify-mech.cjs | teammate mech-fidelity |
| src/components/SymbolLab.tsx、src/data/symbolLibrary.ts（新） | teammate symbol-lab |
| src/model/solid.ts、src/components/solidTexture.tsx、SolidNet.tsx（新）、src/components/CanvasStage.tsx、RightPanel.tsx（仅三维部分） | teammate three-d |
| src/components/PrintSheet.tsx（新）、src/styles/print.css（新） | Lead（与 electron-core 的 print.cjs 对接） |
| 其余 electron/verify-*.cjs | Lead |

不要动别人的文件。需要对方改接口时发消息给 Lead。不要 git commit / push / 打包 / 跑全量回归（Lead 最后统一做）。类型检查用 npx tsc --noEmit，只看自己文件的错误。

## 1. electron-core 的 IPC 契约（Lead 会按这个在 src 里接线）

### 1.1 自动保存 / 崩溃恢复

主进程新增 electron/autosave.cjs，registerAutosaveIpc() 暴露：

- ipcMain.handle('autosave:write', (e, payload))：payload = { data: string, file: string, filePath: string | null, at: number }；
  写入 userData/autosave/latest.json（原子写：先写 .tmp 再 rename；最多保留一份），返回 true。
- ipcMain.handle('autosave:read')：返回 { exists, data, file, filePath, at } | null。
- ipcMain.handle('autosave:clear')：删除快照，返回 true。
- 快照只在 data 长度 < 20MB 时写。
- 主进程启动时若发现快照文件，ui:get-state 额外返回 autosave: { at, file, filePath }（不含 data，避免启动负载）。

### 1.2 版本历史 / 课件库

主进程新增 electron/history.cjs，registerHistoryIpc()：

- history:record：保存成功时由主进程在 file:save 成功后自动做（不需要渲染层调用）——
  在 userData/history/<fileBase>/<yyyyMMdd-HHmmss>.chordot 记录保存前旧文件内容（若 filePath 存在）。
  每个文件最多保留 20 份，按时间倒序清理。
- history:list (e, filePath) → { items: [{ name, path, at, size }] }；
- history:read (e, path) → { content }（只允许读 history 目录内的路径）；
- 课件库：library:list → 扫描 userData/library/*.chordot（不存在就建目录），返回 { items: [{ path, name, at, size }] }；
  library:add (e, { path, content }) → 把当前课件另存一份进 library（文件名去重），返回 path；
  library:open (e, path) → { content }（限 library 目录）。
- 渲染层还需要一个现成课件的「元信息预览」：file:peek (e, path) → { exists, name, at, meta? }（读文件头部 16KB 解析 doc.meta；失败就给 name/at）。供大厅最近课件显示标题/学科。

### 1.3 文件关联 / 拖拽 / 第二次启动

- package.json 的 build 增加：
  fileAssociations: [{ ext: 'chordot', name: '弦点课件', description: '弦点 / Chordot 课件', role: 'Editor' }]
- electron/main.cjs：
  - app.requestSingleInstanceLock()；second-instance 时从 argv 里找出 .chordot 路径，mainWindow.webContents.send('app:open-file', path) 并聚焦窗口；
  - app.on('open-file')（macOS）同样转发；
  - 首次启动如果 process.argv 带 .chordot，等窗口 did-finish-load 后发送。
- preload 暴露：onOpenFile(cb)（channel app:open-file）、getPathForFile(file)（用 webUtils.getPathForFile）——Lead 在 App 里处理拖拽。
- 独立窗口 createLabWindow 拆成通用 createAuxWindow(kind)：lab、symbols、gallery（新，模板库独立窗口）、print（打印用，隐藏）。

### 1.4 辅助窗口独立

- 教材实验室：入口都改走 lab:open-window（独立窗口），主窗口不再内嵌 .lab 模态；独立窗口保留自己的实验选择状态。
- 模板库：新增 ?gallery=1 独立窗口（gallery:open-window）；窗口内选中模板后 ipcRenderer.invoke('gallery:pick', { scene, file })，主进程转发给主窗口 gallery:pick，主窗口 App 收到后 dispatch。
- 跨窗口同步：取消强制同步（lab:sync 不再由主窗口监听/广播；教材窗口内部切换不改变主窗口）。保留 channel 防旧文件兼容。
- 窗口都记忆自己的 bounds（state 里 key 分开），主窗口关闭时随应用退出（window-all-closed 逻辑保持）。

### 1.5 PDF / 讲义导出

- electron/print.cjs，registerPrintIpc()：
  - ipcMain.handle('file:export-pdf', async (e, payload))：payload = { png: base64, title: string, subtitle?: string, footer?: string, defaultName?: string }；
  - 弹 dialog.showSaveDialog（默认名 *.pdf，过滤 pdf）；
  - 创建隐藏 BrowserWindow（preload 用同一个 preload.cjs）加载 app://chordot/index.html?print=1；
  - did-finish-load 后发 print:payload 给渲染层，渲染层 printReady（print:ready）后 webContents.printToPDF({ pageSize: 'A4', landscape: true, printBackground: true })；
  - 写文件、关窗口、返回 { path }；任意失败返回 { error }；取消返回 { canceled: true }。
- preload 暴露：onPrintPayload(cb)、printReady()、exportPDF(payload)。
- Lead 写 src/components/PrintSheet.tsx（A4 横向：标题 + 大图 + 页脚 + 日期）与 print.css。

### 1.6 错误日志（性能与稳定性）

- electron/errorlog.cjs：registerErrorLog() 捕获 process.on('uncaughtException'|'unhandledRejection')，追加到 userData/logs/error-YYYYMMDD.log（单文件 < 2MB，保留 7 天）；ipcMain.on('app:error-log', ...) 写同一份日志。
- preload 暴露 reportError({ message, stack?, source? })。
- ui:get-state 增加 slowStart: number（主进程记录 ready→页面可交互耗时；没有就返回 0）。

## 2. mech-fidelity：机构物理保真

只改 src/components/MechStage.tsx（必要时 src/model/mech.ts 先问 Lead），目标：

1. 自定义库仑摩擦替换 Matter 自带接触摩擦（引擎里 friction 全设 0）：
   - 每步接触检测：物体底部距地面/轨道表面 < 0.08 m 且水平重叠；
   - 法向支持力 N 按「竖直方向其余外力 + 重力」反推（轨道约束时用轨道法向）；
   - 切向摩擦 f = clamp(-k_t * v_t, ±μN)；静止时（|v_t| < 0.02 且 |其他切向力| < μN）把切向速度清零；
   - μ 取两物体材质较大/较小值（按现有 materialOf；地面 0.55）。
   - 目标行为：20° 轨道球能滑；地面 30 N 推箱子在低摩擦下能推动；受力分解 N/f 来自模型。
2. decomposeOf 的 N、f 改用上面的接触模型结果，标出「静摩擦 / 滑动摩擦」。
3. electron/verify-mech.cjs 增补断言：冰面方块 30 N 推力 1 s 位移 > 0.2 m；斜面 N ≈ mg·cosθ（±20%）；旧 169 项必须仍通过。
4. 自测：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron electron/verify-mech.cjs；报告结果。

## 3. symbol-lab：符号实验室深化

只改 src/components/SymbolLab.tsx + 新建 src/data/symbolLibrary.ts：

- 常量可编辑并记住：g/k/c/m 等常量可编辑；localStorage chordot.sym.constants 持久化；求值使用。
- 公式库：内置 ≥10 条（简谐、阻尼、重力、万有引力、匀加速、动能、圆周、胡克…）一键载入；支持保存当前公式到自定义库（localStorage chordot.sym.formulas），可删除。
- 发送到机构（新协议）：target 选择 force（旧）/ springK / springC / mass；调用 window.chordot.applySymbolForce({ expr, target, value })（value 为当前求值数字）。preload/main/App 由 Lead 改。
- 保留全部 .symlab__* 类名与 data-sym（verify-mech 依赖 .symlab__tokens/.symlab__now/.symlab__presets button/.symlab__send/.symlab__err/.symlab__keys button）。
- npx tsc --noEmit 自己文件 0 错误；报告行数与自测结果。

## 4. three-d：三维真实贴图 / UV / 展开图

文件：src/model/solid.ts、src/components/solidTexture.tsx、新建 SolidNet.tsx、src/components/CanvasStage.tsx、RightPanel.tsx（仅三维材质/展开图相关）。

1. 真实位图贴图：保留现有程序化材质，新增 SolidMaterial 'image'；运行时用 canvas 生成 512x512 PNG dataURL（木纹/纸纹/金属拉丝/网格），作为 <image> 贴到每个面；SolidShape.texture?: string；RightPanel 三维材质区加「贴图…」按钮选本地图片（FileReader→dataURL，限 2MB）。
2. UV 修正：检查圆柱/圆锥/球接缝不翻面；立方体/棱柱逐面完整贴图。
3. 展开图：新建 SolidNet.tsx：把多面体（cube/pyramid/prism/tetra/octahedron）按面展开成 2D 平面网（画在三维画布右下方，可收起），带棱长标注；RightPanel 三维区加「展开图」开关（仅多面体有效）。
4. 不改 SceneSpec 现有字段语义；纹理只存 shape，保持旧 .chordot 兼容。
5. 不破坏 verify-3d 旧断言；npx tsc --noEmit 自己文件 0 错误；报告改动与需要 Lead 接线的点。

## 5. 验收

- Lead 负责最终 npm run build、全量回归 + 新增验证、打包（用户要求时）。
- 每个 teammate 完成后发 message：文件、行数、自测结果、遗留风险。
