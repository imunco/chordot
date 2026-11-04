import type { SceneSpec } from '../kernel/types'
import type { TemplateCategory } from './templates'

const CUSTOM_KEY = 'chordot.templates.custom'
const FAV_KEY = 'chordot.templates.fav'

export interface CustomTemplate {
  id: string
  name: string
  category: TemplateCategory
  hint: string
  file: string
  scene: SceneSpec
  createdAt: number
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 隐私模式等场景静默失败 */
  }
}

export function loadCustom(): CustomTemplate[] {
  const list = read<CustomTemplate[]>(CUSTOM_KEY, [])
  return Array.isArray(list) ? list : []
}

export function saveCustom(list: CustomTemplate[]) {
  write(CUSTOM_KEY, list)
}

export function loadFavorites(): string[] {
  const list = read<string[]>(FAV_KEY, [])
  return Array.isArray(list) ? list : []
}

export function saveFavorites(ids: string[]) {
  write(FAV_KEY, ids)
}

export function newCustomId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/* ───────── 模板包（.chordotpack） ───────── */

export const PACK_VERSION = 1

export interface TemplatePack {
  app: 'chordot-pack'
  version: number
  exportedAt: string
  templates: CustomTemplate[]
}

export function serializePack(list: CustomTemplate[]): string {
  const pack: TemplatePack = {
    app: 'chordot-pack',
    version: PACK_VERSION,
    exportedAt: new Date().toISOString(),
    templates: list,
  }
  return JSON.stringify(pack, null, 2)
}

/** 解析模板包；失败返回教学语言原因 */
export function parsePack(text: string): { templates: CustomTemplate[] } | { error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { error: '这个文件不是有效的模板包' }
  }
  const pack = raw as Partial<TemplatePack>
  if (!pack || pack.app !== 'chordot-pack') return { error: '这个文件不是弦点模板包' }
  if (typeof pack.version !== 'number' || pack.version > PACK_VERSION) {
    return { error: '模板包版本比当前程序更新，请先更新弦点' }
  }
  if (!Array.isArray(pack.templates)) return { error: '模板包内容缺失' }

  const templates = pack.templates.filter(
    (t): t is CustomTemplate =>
      !!t && typeof t.name === 'string' && typeof t.id === 'string' && !!t.scene,
  )
  if (templates.length === 0) return { error: '模板包里没有可用的模板' }
  return { templates }
}

/** 合并导入：同 id 覆盖，否则追加到最前 */
export function mergeTemplates(
  current: CustomTemplate[],
  incoming: CustomTemplate[],
): { next: CustomTemplate[]; added: number; replaced: number } {
  const map = new Map(current.map((t) => [t.id, t]))
  let added = 0
  let replaced = 0
  for (const t of incoming) {
    if (map.has(t.id)) replaced += 1
    else added += 1
    map.set(t.id, t)
  }
  return { next: [...map.values()].sort((a, b) => b.createdAt - a.createdAt), added, replaced }
}
