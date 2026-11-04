const { app, ipcMain, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const fsp = require('node:fs/promises')

/** 发布仓库：更新检查与下载都指向这里 */
const OWNER = 'imunco'
const REPO = 'chordot'
const API = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`

/**
 * 国内可用的 GitHub 下载加速镜像。
 * 用法统一是「前缀 + 原始 github.com 链接」，所以只需要维护前缀。
 * 顺序不代表优先级——运行时并发测速，取最快的一个。
 */
const MIRRORS = [
  { id: 'direct', name: 'GitHub 直连', prefix: '' },
  { id: 'ghfast', name: 'ghfast.top', prefix: 'https://ghfast.top/' },
  { id: 'ghproxy', name: 'ghproxy.net', prefix: 'https://ghproxy.net/' },
  { id: 'gh-proxy', name: 'gh-proxy.com', prefix: 'https://gh-proxy.com/' },
  { id: 'ghproxy-cc', name: 'ghproxy.cc', prefix: 'https://ghproxy.cc/' },
  { id: 'ghps', name: 'ghps.cc', prefix: 'https://ghps.cc/' },
  { id: 'gitmirror', name: 'hub.gitmirror.com', prefix: 'https://hub.gitmirror.com/' },
  { id: 'moeyy', name: 'github.moeyy.xyz', prefix: 'https://github.moeyy.xyz/' },
  { id: 'llkk', name: 'gh.llkk.cc', prefix: 'https://gh.llkk.cc/' },
  { id: 'gitdl', name: 'gitdl.cn', prefix: 'https://gitdl.cn/' },
  { id: 'ghp', name: 'ghproxy.homeboyc.cn', prefix: 'https://ghproxy.homeboyc.cn/' },
  { id: '7ed', name: 'gh.7ed.net', prefix: 'https://gh.7ed.net/' },
]

/** 版本号：测试时可用 CHORDOT_FAKE_VERSION 冒充旧版本 */
const currentVersion = () => process.env.CHORDOT_FAKE_VERSION || app.getVersion()

const withTimeout = async (fn, ms) => {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), ms)
  try {
    return await fn(ac.signal)
  } finally {
    clearTimeout(timer)
  }
}

async function fetchJson(url, ms = 8000) {
  return withTimeout(async (signal) => {
    const res = await fetch(url, {
      signal,
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Chordot-Updater' },
    })
    if (!res.ok) return { status: res.status, body: null }
    return { status: res.status, body: await res.json() }
  }, ms)
}

/** 1.2.3 / v1.2.3 → [1,2,3] */
function parseVersion(v) {
  return String(v || '')
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .slice(0, 3)
    .map((n) => parseInt(n, 10) || 0)
}

/** a > b 返回 1，相等 0，小于 -1 */
function compareVersions(a, b) {
  const x = parseVersion(a)
  const y = parseVersion(b)
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1
  }
  return 0
}

/** 所有镜像并发探一次，按响应耗时升序返回能用的 */
async function probeAll(url) {
  const results = await Promise.all(
    MIRRORS.map(async (m) => {
      const target = m.prefix + url
      const t0 = Date.now()
      try {
        const ok = await withTimeout(async (signal) => {
          const res = await fetch(target, {
            signal,
            headers: { Range: 'bytes=0-0', 'User-Agent': 'Chordot-Updater' },
          })
          // 206 / 200 都算通；4xx 直接判死
          return res.status < 400
        }, 3500)
        return ok ? { id: m.id, name: m.name, ms: Date.now() - t0, url: target } : null
      } catch {
        return null
      }
    }),
  )
  return results.filter(Boolean).sort((a, b) => a.ms - b.ms)
}

/** 并发测速：谁先吐响应头谁赢 */
async function pickMirror(url, preferred) {
  if (preferred && preferred !== 'auto') {
    const hit = MIRRORS.find((m) => m.id === preferred)
    if (hit) return { ...hit, ms: 0, url: hit.prefix + url }
  }
  const alive = await probeAll(url)
  return alive[0] ?? null
}

let downloadAbort = null

function registerUpdateIpc({ getWindow }) {
  ipcMain.handle('update:info', () => ({
    version: currentVersion(),
    mirrors: MIRRORS.map((m) => ({ id: m.id, name: m.name })),
  }))

  ipcMain.handle('update:check', async (_e, opts = {}) => {
    const current = currentVersion()
    try {
      const { status, body } = await fetchJson(API)
      if (status === 404) {
        return { ok: true, current, hasUpdate: false, noRelease: true }
      }
      if (!body) {
        return { ok: false, current, error: `更新服务返回 ${status}` }
      }
      const latest = String(body.tag_name || body.name || '').replace(/^v/i, '')
      const assets = (body.assets || []).map((a) => ({
        name: a.name,
        size: a.size,
        url: a.browser_download_url,
      }))
      const hasUpdate = compareVersions(latest, current) > 0
      return {
        ok: true,
        current,
        latest,
        hasUpdate,
        notes: String(body.body || '').slice(0, 2000),
        publishedAt: body.published_at,
        assets,
        htmlUrl: body.html_url,
      }
    } catch (err) {
      return { ok: false, current, error: '无法连接 GitHub，请检查网络或代理' }
    }
  })

  /** 测速 + 下载到临时目录，边下边报进度 */
  ipcMain.handle('update:download', async (e, { url, name, preferred }) => {
    const win = getWindow()
    const send = (payload) => {
      if (win && !win.isDestroyed()) win.webContents.send('update:progress', payload)
    }
    const pick = await pickMirror(url, preferred)
    if (!pick) {
      return { ok: false, error: '所有下载源都连不上，请稍后再试' }
    }
    send({ phase: 'start', mirror: pick.name, ms: pick.ms })
    const dir = path.join(app.getPath('temp'), 'chordot-update')
    await fsp.mkdir(dir, { recursive: true })
    const file = path.join(dir, name || 'Chordot-setup.exe')

    const ac = new AbortController()
    downloadAbort = () => ac.abort()
    try {
      const res = await fetch(pick.url, { signal: ac.signal, headers: { 'User-Agent': 'Chordot-Updater' } })
      if (!res.ok || !res.body) {
        return { ok: false, error: `下载失败（HTTP ${res.status}）` }
      }
      const total = Number(res.headers.get('content-length')) || 0
      const handle = await fsp.open(file, 'w')
      let received = 0
      let lastTick = 0
      try {
        for await (const chunk of res.body) {
          await handle.write(chunk)
          received += chunk.length
          const now = Date.now()
          if (now - lastTick > 120) {
            lastTick = now
            send({ phase: 'progress', received, total })
          }
        }
      } finally {
        await handle.close()
      }
      send({ phase: 'done', received, total })
      return { ok: true, path: file, size: received, mirror: pick.name }
    } catch (err) {
      return { ok: false, error: ac.signal.aborted ? '已取消' : '下载中断，请重试' }
    } finally {
      downloadAbort = null
    }
  })

  /** 只测速不下载：设置页的「测速」用它 */
  ipcMain.handle('update:probe', async (_e, url) => {
    if (!url) return { ok: false, error: '缺少下载地址' }
    const list = await probeAll(url)
    return { ok: list.length > 0, list: list.map(({ id, name, ms }) => ({ id, name, ms })) }
  })

  ipcMain.handle('update:cancel', () => {
    downloadAbort?.()
    return true
  })

  ipcMain.handle('update:install', async (_e, filePath) => {
    if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: '安装包不存在' }
    const err = await shell.openPath(filePath)
    return err ? { ok: false, error: err } : { ok: true }
  })

  ipcMain.handle('update:openRelease', async (_e, url) => {
    if (url) shell.openExternal(url)
    return true
  })

  ipcMain.handle('app:about', () => ({
    name: app.getName(),
    version: currentVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    repo: `https://github.com/${OWNER}/${REPO}`,
  }))
}

module.exports = { registerUpdateIpc, MIRRORS, compareVersions }
