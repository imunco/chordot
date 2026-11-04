import { useMemo, useRef, useState } from 'react'
import {
  CATEGORIES,
  SUB_CATEGORIES,
  TEMPLATES,
  type Template,
  type TemplateCategory,
} from '../data/templates'
import {
  loadCustom,
  loadFavorites,
  mergeTemplates,
  newCustomId,
  parsePack,
  saveCustom,
  saveFavorites,
  serializePack,
  type CustomTemplate,
} from '../data/template-store'
import type { SceneSpec } from '../kernel/types'
import { CloseIcon } from './icons'
import { Thumb } from './Thumb'

interface Props {
  scene: SceneSpec
  file: string
  onPick: (t: Template) => void
  onClose: () => void
}

interface Row extends Template {
  custom?: boolean
}

export function TemplateGallery({ scene, file, onPick, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState<string>('全部')
  const [sub, setSub] = useState<string>('全部')
  const [custom, setCustom] = useState<CustomTemplate[]>(() => loadCustom())
  const [fav, setFav] = useState<string[]>(() => loadFavorites())
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: '', hint: '', category: '数学' as TemplateCategory })
  const [confirming, setConfirming] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState('')

  const flashTimer = useRef<number | null>(null)
  const flash = (msg: string) => {
    setSavedFlash(msg)
    // 清掉上一个计时器，否则旧消息会把新消息提前擦掉
    if (flashTimer.current) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setSavedFlash(''), 2400)
  }

  const exportPack = async () => {
    const api = window.chordot
    if (!api) return
    if (custom.length === 0) {
      flash('还没有自定义模板可导出')
      return
    }
    const res = await api.exportPack({
      data: serializePack(custom),
      name: '弦点模板包.chordotpack',
    })
    if (res.canceled) return
    if (res.error) {
      flash(`导出失败：${res.error}`)
      return
    }
    flash(`已导出 ${custom.length} 个模板`)
  }

  const importPack = async () => {
    const api = window.chordot
    if (!api) return
    const res = await api.importPack()
    if (res.canceled) return

    const files = res.files ?? (res.content ? [{ path: res.path ?? '', content: res.content }] : [])
    if (files.length === 0) {
      flash(`导入失败：${res.error ?? '没有读到文件'}`)
      return
    }

    let acc = custom
    let added = 0
    let replaced = 0
    const failed: string[] = []
    for (const f of files) {
      if (f.error || !f.content) {
        failed.push(f.path.split(/[\\/]/).pop() ?? f.path)
        continue
      }
      const parsed = parsePack(f.content)
      if ('error' in parsed) {
        failed.push(`${f.path.split(/[\\/]/).pop() ?? f.path}（${parsed.error}）`)
        continue
      }
      const merged = mergeTemplates(acc, parsed.templates)
      acc = merged.next
      added += merged.added
      replaced += merged.replaced
    }

    setCustom(acc)
    saveCustom(acc)

    if (added === 0 && replaced === 0) {
      flash(failed[0] ? `导入失败：${failed[0]}` : '模板包里没有可用的模板')
      return
    }
    const tail = replaced > 0 ? `，覆盖 ${replaced} 个` : ''
    flash(
      failed.length > 0
        ? `导入 ${added} 个${tail}，${failed.length} 个文件跳过`
        : `导入 ${added} 个${tail}`,
    )
  }

  const rows: Row[] = useMemo(
    () => [
      ...TEMPLATES,
      ...custom.map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category,
        sub: '',
        hint: c.hint,
        file: c.file,
        build: () => c.scene,
        custom: true,
      })),
    ],
    [custom],
  )

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((t) => {
      if (cat === '收藏' && !fav.includes(t.id)) return false
      if (cat === '自定义' && !t.custom) return false
      if (cat !== '全部' && cat !== '收藏' && cat !== '自定义' && t.category !== cat) return false
      if (sub !== '全部' && t.sub !== sub) return false
      if (!q) return true
      return (
        t.name.toLowerCase().includes(q) ||
        t.hint.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      )
    })
  }, [rows, cat, sub, query, fav])

  const toggleFav = (id: string) => {
    const next = fav.includes(id) ? fav.filter((x) => x !== id) : [...fav, id]
    setFav(next)
    saveFavorites(next)
  }

  const startEdit = (t: Row) => {
    setEditing(t.id)
    setConfirming(null)
    setDraft({ name: t.name, hint: t.hint, category: t.category })
  }

  const commitEdit = (id: string) => {
    const next = custom.map((c) =>
      c.id === id
        ? { ...c, name: draft.name.trim() || c.name, hint: draft.hint.trim(), category: draft.category }
        : c,
    )
    setCustom(next)
    saveCustom(next)
    setEditing(null)
  }

  const removeCustom = (id: string) => {
    const next = custom.filter((c) => c.id !== id)
    setCustom(next)
    saveCustom(next)
    setConfirming(null)
    if (fav.includes(id)) {
      const nf = fav.filter((x) => x !== id)
      setFav(nf)
      saveFavorites(nf)
    }
  }

  const saveCurrentAsTemplate = () => {
    const name = file.replace(/\.chordot$/, '') || '未命名模板'
    const item: CustomTemplate = {
      id: newCustomId(),
      name,
      category: '数学',
      hint: '来自当前课件',
      file: `${name}.chordot`,
      scene,
      createdAt: Date.now(),
    }
    const next = [item, ...custom]
    setCustom(next)
    saveCustom(next)
    flash(`已存为模板「${name}」`)
  }

  return (
    <div className="gallery" role="dialog" aria-label="模板库" onClick={onClose}>
      <div className="gallery__panel" onClick={(e) => e.stopPropagation()}>
        <header className="gallery__head">
          <div className="gallery__title">
            模板库
            <span className="gallery__count">
              {list.length} / {rows.length} 个
            </span>
          </div>
          <div className="gallery__tools">
            <input
              className="gallery__search"
              placeholder="搜索模板…"
              value={query}
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="btn gallery__save" onClick={saveCurrentAsTemplate}>
              存为模板
            </button>
            <button className="btn gallery__save" onClick={exportPack} title="把自定义模板导出为 .chordotpack">
              导出
            </button>
            <button className="btn gallery__save" onClick={importPack} title="从 .chordotpack 导入模板">
              导入
            </button>
            <button className="iconbtn" title="关闭" onClick={onClose}>
              <CloseIcon size={15} />
            </button>
          </div>
        </header>

        <div className="gallery__tabs">
          {['全部', '收藏', ...CATEGORIES, '自定义'].map((c) => (
            <button
              key={c}
              className="gallery__tab"
              data-active={c === cat}
              onClick={() => {
                setCat(c)
                // 换一级分类时二级分类必须回到「全部」，否则会残留上一个分类的筛选条件
                setSub('全部')
              }}
            >
              {c}
              {c === '收藏' && fav.length > 0 && <span className="gallery__badge">{fav.length}</span>}
            </button>
          ))}
          {savedFlash && <span className="gallery__flash">{savedFlash}</span>}
        </div>

        {SUB_CATEGORIES[cat as TemplateCategory] && (
          <div className="gallery__subtabs">
            {['全部', ...SUB_CATEGORIES[cat as TemplateCategory]].map((sc) => (
              <button
                key={sc}
                className="gallery__subtab"
                data-active={sc === sub}
                onClick={() => setSub(sc)}
              >
                {sc}
              </button>
            ))}
          </div>
        )}

        <div className="gallery__grid">
          {list.length === 0 && <div className="gallery__empty">没有匹配的模板</div>}
          {list.map((t) => {
            if (editing === t.id) {
              return (
                <div key={t.id} className="gallery__card gallery__card--edit">
                  <input
                    className="gallery__input"
                    value={draft.name}
                    placeholder="模板名称"
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                  <input
                    className="gallery__input"
                    value={draft.hint}
                    placeholder="一句话说明"
                    onChange={(e) => setDraft({ ...draft, hint: e.target.value })}
                  />
                  <select
                    className="gallery__input"
                    value={draft.category}
                    onChange={(e) => setDraft({ ...draft, category: e.target.value as TemplateCategory })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <div className="gallery__actions">
                    <button className="btn gallery__mini" onClick={() => commitEdit(t.id)}>
                      保存
                    </button>
                    <button className="btn gallery__mini" onClick={() => setEditing(null)}>
                      取消
                    </button>
                  </div>
                </div>
              )
            }

            return (
              <div key={t.id} className="gallery__card">
                <button className="gallery__main" onClick={() => onPick(t)}>
                  <Thumb scene={t.build()} cacheKey={t.id} />
                  <span className="gallery__name">{t.name}</span>
                  <span className="gallery__hint">{t.hint}</span>
                  <span className="gallery__cat">
                    {t.custom ? '自定义' : t.sub ? `${t.category} · ${t.sub}` : t.category}
                  </span>
                </button>

                <div className="gallery__cardtools">
                  <button
                    className="gallery__star"
                    data-on={fav.includes(t.id)}
                    title={fav.includes(t.id) ? '取消收藏' : '收藏'}
                    onClick={() => toggleFav(t.id)}
                  >
                    ★
                  </button>
                  {t.custom && (
                    <>
                      <button className="gallery__mini-link" onClick={() => startEdit(t)}>
                        编辑
                      </button>
                      {confirming === t.id ? (
                        <>
                          <button className="gallery__mini-link" onClick={() => removeCustom(t.id)}>
                            确定删除
                          </button>
                          <button className="gallery__mini-link" onClick={() => setConfirming(null)}>
                            取消
                          </button>
                        </>
                      ) : (
                        <button className="gallery__mini-link" onClick={() => setConfirming(t.id)}>
                          删除
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
