import { useCallback, useEffect, useRef, useState } from 'react'
import type { Settings } from './settings'

export interface UpdaterState {
  checking: boolean
  result: UpdateCheckResult | null
  error: string | null
  downloading: boolean
  received: number
  total: number
  mirror: string | null
  filePath: string | null
}

const EMPTY: UpdaterState = {
  checking: false,
  result: null,
  error: null,
  downloading: false,
  received: 0,
  total: 0,
  mirror: null,
  filePath: null,
}

/**
 * 更新器：检查 → 弹窗 → 下载（多镜像竞速）→ 打开安装包。
 * 网络与文件操作都在主进程，这里只管状态和设置。
 */
export function useUpdater(settings: Settings, patch: (p: Partial<Settings>) => void) {
  const [state, setState] = useState<UpdaterState>(EMPTY)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  useEffect(() => {
    const api = window.chordot?.update
    if (!api) return
    return api.onProgress((p) => {
      if (p.phase === 'start') {
        setState((s) => ({ ...s, mirror: p.mirror ?? null, received: 0, total: 0 }))
      } else if (p.phase === 'progress') {
        setState((s) => ({ ...s, received: p.received ?? 0, total: p.total ?? 0 }))
      } else if (p.phase === 'done') {
        setState((s) => ({ ...s, received: p.received ?? 0, total: p.total ?? s.total }))
      }
    })
  }, [])

  const check = useCallback(
    async (silent = false) => {
      const api = window.chordot?.update
      if (!api) {
        setState((s) => ({
          ...s,
          checking: false,
          error: '当前环境不支持检查更新（需要在桌面端运行）',
        }))
        return null
      }
      setState((s) => ({ ...s, checking: true, error: null, result: null }))
      const res = await api.check({ preferred: settingsRef.current.updateMirror })
      patch({ updateCheckedAt: Date.now() })
      setState((s) => ({
        ...s,
        checking: false,
        result: res,
        error: res.ok ? null : (res.error ?? '检查失败'),
      }))
      if (!silent && res.ok && !res.hasUpdate && !res.noRelease) {
        /* 交给调用方决定是否提示「已是最新」 */
      }
      return res
    },
    [patch],
  )

  const download = useCallback(async () => {
    const api = window.chordot?.update
    const res = state.result
    if (!api || !res?.assets?.length) return
    // 优先装 setup（安装包），没有就退回第一个 exe
    const asset =
      res.assets.find((a) => /setup\.exe$/i.test(a.name)) ??
      res.assets.find((a) => /\.exe$/i.test(a.name)) ??
      res.assets[0]
    setState((s) => ({
      ...s,
      downloading: true,
      error: null,
      received: 0,
      total: asset.size || 0,
      filePath: null,
    }))
    const out = await api.download({
      url: asset.url,
      name: asset.name,
      preferred: settingsRef.current.updateMirror,
    })
    setState((s) => ({
      ...s,
      downloading: false,
      mirror: out.mirror ?? s.mirror,
      filePath: out.ok ? (out.path ?? null) : null,
      error: out.ok ? null : (out.error ?? '下载失败'),
    }))
    return out
  }, [state.result])

  const install = useCallback(async () => {
    const api = window.chordot?.update
    if (!api || !state.filePath) return
    await api.install(state.filePath)
  }, [state.filePath])

  const cancel = useCallback(async () => {
    await window.chordot?.update?.cancel()
    setState((s) => ({ ...s, downloading: false }))
  }, [])

  /** 只测速：把每个镜像的响应耗时排出来 */
  const probe = useCallback(async () => {
    const api = window.chordot?.update
    const asset = state.result?.assets?.find((a) => /\.exe$/i.test(a.name)) ?? state.result?.assets?.[0]
    if (!api || !asset) return []
    setState((s) => ({ ...s, checking: true, error: null }))
    const out = await api.probe(asset.url)
    setState((s) => ({
      ...s,
      checking: false,
      error: out.ok ? null : (out.error ?? '测速失败'),
    }))
    return out.list ?? []
  }, [state.result])

  const dismiss = useCallback(() => {
    setState((s) => ({ ...s, result: null, error: null }))
  }, [])

  return { state, check, download, install, cancel, dismiss, probe }
}
