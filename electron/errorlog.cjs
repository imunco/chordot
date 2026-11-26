/** 错误日志：主进程异常 / 渲染层上报都落到 userData/logs/error-YYYYMMDD.log
 *  单文件上限 2MB（超了滚成 error-YYYYMMDD-1.log），只保留最近 7 天。 */
const { app, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const MAX_BYTES = 2 * 1024 * 1024
const KEEP_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

const logsDir = () => path.join(app.getPath('userData'), 'logs')

const pad = (n) => String(n).padStart(2, '0')

/** 20261126 */
function dayOf(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

const logFileOf = (day) => path.join(logsDir(), `error-${day}.log`)

/** 清掉 7 天前的日志（包括滚动出来的 -1.log） */
function cleanupLogs() {
  let names = []
  try {
    names = fs.readdirSync(logsDir())
  } catch {
    return
  }
  const cutoff = Date.now() - KEEP_DAYS * DAY_MS
  for (const name of names) {
    if (!/^error-\d{8}(-\d+)?\.log$/.test(name)) continue
    const target = path.join(logsDir(), name)
    try {
      if (fs.statSync(target).mtimeMs < cutoff) fs.unlinkSync(target)
    } catch {
      /* 删不掉就先留着，下次再清 */
    }
  }
}

/** 一条日志：时间 / 来源 / 消息，有堆栈就缩进跟在后面 */
function formatEntry(entry) {
  const at = new Date().toISOString()
  const source = entry.source ? String(entry.source) : 'main'
  const message = String(entry.message || '未知错误')
  const lines = [`[${at}] [${source}] ${message}`]
  if (entry.stack) {
    for (const line of String(entry.stack).split('\n').slice(0, 30)) {
      if (line.trim()) lines.push(`  ${line.trim()}`)
    }
  }
  return `${lines.join('\n')}\n`
}

/** 追加一条日志；任何失败都静默（日志本身不能把应用拖垮） */
function appendLog(entry) {
  try {
    fs.mkdirSync(logsDir(), { recursive: true })
    const day = dayOf()
    const target = logFileOf(day)
    // 单文件到上限就滚一份，旧的滚动态直接覆盖
    try {
      if (fs.statSync(target).size >= MAX_BYTES) {
        const rotated = path.join(logsDir(), `error-${day}-1.log`)
        try {
          fs.unlinkSync(rotated)
        } catch {
          /* 还没有旧的 */
        }
        fs.renameSync(target, rotated)
      }
    } catch {
      /* 今天还没有日志文件 */
    }
    fs.appendFileSync(target, formatEntry(entry), 'utf8')
    return true
  } catch {
    return false
  }
}

/** 主进程启动时挂一次：未捕获异常、未处理的 Promise、渲染层上报 */
function registerErrorLog() {
  cleanupLogs()

  process.on('uncaughtException', (err) => {
    appendLog({
      source: 'main',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : '',
    })
  })

  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason))
    appendLog({ source: 'main', message: `unhandledRejection: ${err.message}`, stack: err.stack })
  })

  // 渲染层对应 preload 的 reportError()
  ipcMain.on('app:error-log', (_e, payload) => {
    const p = payload && typeof payload === 'object' ? payload : {}
    appendLog({
      source: p.source ? `renderer:${String(p.source)}` : 'renderer',
      message: p.message,
      stack: p.stack,
    })
  })

  // 每天顺手清一次过期日志；定时器不阻止进程退出
  const timer = setInterval(cleanupLogs, DAY_MS)
  if (typeof timer.unref === 'function') timer.unref()
  return { appendLog, cleanupLogs }
}

module.exports = { registerErrorLog, appendLog, cleanupLogs, logsDir }
