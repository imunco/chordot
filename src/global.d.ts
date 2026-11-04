export {}

declare global {
  /** 构建时由 vite define 注入，来源是 package.json 的 version */
  const __APP_VERSION__: string

  interface Window {
    chordot?: {
      platform: string
      getUiState: () => Promise<{
        leftWidth?: number
        rightOpen?: boolean
        lastFile?: string | null
        recent?: string[]
      }>
      setUiState: (patch: Record<string, unknown>) => void
      saveFile: (payload: {
        data: string
        filePath?: string | null
        saveAs?: boolean
      }) => Promise<{ path?: string; canceled?: boolean; error?: string }>
      openFile: (
        filePath?: string | null,
      ) => Promise<{ path?: string; content?: string; canceled?: boolean; error?: string }>
      confirmUnsaved: (name: string) => Promise<number>
      exportFile: (payload: {
        data: string
        encoding?: 'utf8' | 'base64'
        name?: string
        format?: 'png' | 'svg'
      }) => Promise<{ path?: string; canceled?: boolean; error?: string }>
      exportPack: (payload: {
        data: string
        name?: string
      }) => Promise<{ path?: string; canceled?: boolean; error?: string }>
      importPack: () => Promise<{
        path?: string
        content?: string
        files?: { path: string; content?: string; error?: string }[]
        canceled?: boolean
        error?: string
      }>
      closeWindow: () => void
      onRequestClose: (cb: () => void) => () => void
      onMenu: (cb: (action: string, arg?: string) => void) => () => void
      update?: {
        info: () => Promise<{
          version: string
          mirrors: { id: string; name: string }[]
        }>
        check: (opts?: { preferred?: string }) => Promise<UpdateCheckResult>
        download: (payload: {
          url: string
          name?: string
          preferred?: string
        }) => Promise<{
          ok: boolean
          path?: string
          size?: number
          mirror?: string
          error?: string
        }>
        cancel: () => Promise<boolean>
        probe: (url: string) => Promise<{
          ok: boolean
          list: { id: string; name: string; ms: number }[]
          error?: string
        }>
        install: (filePath: string) => Promise<{ ok: boolean; error?: string }>
        openRelease: (url: string) => Promise<boolean>
        onProgress: (
          cb: (p: { phase: string; received?: number; total?: number; mirror?: string; ms?: number }) => void,
        ) => () => void
      }
      store?: {
        get: (name: string) => Promise<{ savedAt?: number; data?: unknown } | null>
        set: (name: string, payload: unknown) => Promise<boolean>
        dir: () => Promise<string>
        open: () => Promise<string | null>
        dump: () => Promise<{ name: string; content: string }[]>
      }
      about?: () => Promise<{
        name: string
        version: string
        electron: string
        chrome: string
        node: string
        repo: string
      }>
    }
  }

  interface UpdateCheckResult {
    ok: boolean
    current: string
    latest?: string
    hasUpdate?: boolean
    noRelease?: boolean
    notes?: string
    publishedAt?: string
    htmlUrl?: string
    assets?: { name: string; size: number; url: string }[]
    error?: string
  }
}
