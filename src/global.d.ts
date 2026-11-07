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
      openLabWindow: (id?: string) => Promise<boolean>
      /** 符号公式实验室（独立窗口） */
      openSymbolWindow: () => Promise<boolean>
      /** 把符号实验室的公式发给主窗口 */
      applySymbolForce: (expr: string) => Promise<boolean>
      onSymbolForce: (cb: (expr: string) => void) => () => void
      /** 教材画面导出：截当前窗口内容区的一块，返回 base64 PNG */
      labCapture: (rect: { x: number; y: number; width: number; height: number }) => Promise<{
        data?: string
        width?: number
        height?: number
        error?: string
      } | null>
      /** 实验切换同步：主窗口 ↔ 独立窗口 */
      syncLab: (id: string) => void
      onLabSync: (cb: (id: string) => void) => () => void
      /** 原生全屏（教材全屏演示，能盖住任务栏） */
      setFullscreen: (on: boolean) => Promise<boolean>
      onFullscreenChange: (cb: (on: boolean) => void) => () => void
      onLabSwitch: (cb: (id: string) => void) => () => void
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
