/**
 * 验证脚本共用启动设置。
 *
 * 在无显示环境（远程桌面断开 / 锁屏 / CI）里：
 * - GPU 合成会让 capturePage 报 "Current display surface not available"；
 * - 窗口 visibilityState=hidden 时 rAF 被节流，动画 / 物理测试会假失败；
 * - capturePage 本身拿不到 display surface。
 * 所以统一关 GPU、关后台节流，并给 capturePage 挂一个 CDP 截图兜底。
 * 任何 verify-*.cjs 顶部 require 一次即可（必须在 app ready 之前）。
 */
const { app, powerSaveBlocker } = require('electron')

// 长回归 / 远程桌面：阻止显示器休眠，否则跑到十几分钟后所有窗口都变成 hidden，
// rAF 停摆、截图失败，后面的套件会整片假失败。
let sleepBlockId = null
app.whenReady().then(() => {
  try {
    sleepBlockId = powerSaveBlocker.start('prevent-display-sleep')
  } catch {
    /* 平台不支持就算了 */
  }
})

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
// 远程桌面 / 锁屏时 Windows 会把窗口判定为 occluded，Chromium 暂停 rAF、截图拿不到 surface。
// 这几项让后台 / 遮挡窗口仍按前台节奏跑（验证脚本专用，不影响正常启动）。
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

async function cdpShot(wc) {
  let attached = false
  try {
    wc.debugger.attach('1.3')
    attached = true
  } catch {
    /* 已经附着 / 不支持就当失败 */
  }
  try {
    await wc.debugger.sendCommand('Page.enable').catch(() => {})
    const res = await wc.debugger.sendCommand('Page.captureScreenshot', { format: 'png' })
    if (!res || !res.data) throw new Error('CDP 没有返回截图')
    const png = Buffer.from(res.data, 'base64')
    return {
      toPNG: () => png,
      isEmpty: () => png.length === 0,
      getSize: () => ({ width: 0, height: 0 }),
      toDataURL: () => 'data:image/png;base64,' + png.toString('base64'),
    }
  } finally {
    if (attached) {
      try {
        wc.debugger.detach()
      } catch {
        /* 忽略 */
      }
    }
  }
}

function patchWebContents(wc) {
  try {
    wc.setBackgroundThrottling(false)
  } catch {
    /* 旧版本没有这个 API */
  }
  if (wc.__chordotCapturePatched) return
  wc.__chordotCapturePatched = true
  const original = wc.capturePage.bind(wc)
  wc.capturePage = async (rect) => {
    try {
      return await original(rect)
    } catch (err) {
      try {
        return await cdpShot(wc)
      } catch {
        throw err
      }
    }
  }
}

app.on('web-contents-created', (_event, wc) => patchWebContents(wc))

module.exports = { patchWebContents }
