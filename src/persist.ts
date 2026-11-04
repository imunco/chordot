/**
 * 本地持久化。
 *
 * 主存储还是 localStorage（同步、启动快），另外镜像一份 JSON 到
 * `userData/data/*.json`：leveldb 损坏时能恢复，用户也能直接备份。
 */

type StoreName = 'settings' | 'templates' | 'favorites'

const KEYS: Record<StoreName, string> = {
  settings: 'chordot.settings',
  templates: 'chordot.templates.custom',
  favorites: 'chordot.templates.fav',
}

interface Envelope {
  savedAt?: number
  data?: unknown
}

const stampKey = (key: string) => `${key}.savedAt`

function localStamp(key: string): number {
  try {
    return Number(localStorage.getItem(stampKey(key)) || 0)
  } catch {
    return 0
  }
}

/**
 * 启动时把磁盘上更新的那份拉回 localStorage。
 * 顺序是「文件比本地新才覆盖」，避免把刚改的设置又盖回旧值。
 */
export async function hydrate(): Promise<void> {
  const api = window.chordot?.store
  if (!api) return
  for (const name of Object.keys(KEYS) as StoreName[]) {
    const key = KEYS[name]
    try {
      const env = (await api.get(name)) as Envelope | null
      const raw = localStorage.getItem(key)
      const lsAt = localStamp(key)

      if (env && typeof env.savedAt === 'number' && env.savedAt > lsAt && env.data !== undefined) {
        localStorage.setItem(key, JSON.stringify(env.data))
        localStorage.setItem(stampKey(key), String(env.savedAt))
      } else if (!env && raw) {
        // 首次升级：把已有的 localStorage 数据补一份到磁盘
        try {
          await api.set(name, { savedAt: Date.now(), data: JSON.parse(raw) })
          localStorage.setItem(stampKey(key), String(Date.now()))
        } catch {
          /* 原数据不是合法 JSON，跳过 */
        }
      }
    } catch {
      /* 单条失败不影响启动 */
    }
  }
}

const timers = new Map<StoreName, number>()

/** 写 localStorage 之后调用；磁盘写做了 250ms 防抖 */
export function mirror(name: StoreName, data: unknown): void {
  const api = window.chordot?.store
  const key = KEYS[name]
  const now = Date.now()
  try {
    localStorage.setItem(stampKey(key), String(now))
  } catch {
    /* 隐私模式静默失败 */
  }
  if (!api) return
  const prev = timers.get(name)
  if (prev) window.clearTimeout(prev)
  timers.set(
    name,
    window.setTimeout(() => {
      timers.delete(name)
      void api.set(name, { savedAt: now, data })
    }, 250),
  )
}

/** 立刻落盘（关闭窗口前用） */
export function flush(name: StoreName, data: unknown): void {
  const prev = timers.get(name)
  if (prev) window.clearTimeout(prev)
  timers.delete(name)
  void window.chordot?.store?.set(name, { savedAt: Date.now(), data })
}
