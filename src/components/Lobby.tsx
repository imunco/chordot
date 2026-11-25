import type { ReactNode } from 'react'
import { fileNameOf, folderOf } from '../model/starters'

/**
 * 大厅（启动页）。
 *
 * 进程序先看到它：选模式、新建课件（带属性）、打开最近、进模板库 / 教材实验室。
 * 设计原则：一屏之内完成「今天要做什么」的选择，不把编辑器的工具栏先摆出来。
 */

export type LobbyQuick =
  | 'math'
  | 'physics'
  | 'motion'
  | 'solid'
  | 'mech'
  | 'lab'
  | 'symbols'
  | 'gallery'

interface Props {
  version: string
  recent: string[]
  /** 上次打开的课件（来自主进程的 UI 状态） */
  lastFile: string | null
  /** 本次已经在编辑的课件（从编辑器点「返回大厅」时保留） */
  currentFile: string | null
  onNew: () => void
  onOpen: () => void
  onOpenRecent: (path: string) => void
  onResumeLast: () => void
  onResumeCurrent: () => void
  onQuick: (id: LobbyQuick) => void
  onPrefs: () => void
  onShortcuts: () => void
  onTour: () => void
  onUpdate: () => void
  onDataDir: () => void
}

/* ───────── 线稿图标（和机构部件盘同一套手绘风：stroke=currentColor、圆头） ───────── */

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M12 5v14M5 12h14" {...S} />
    </svg>
  )
}

function IconFolder() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M3.5 7.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2.2h6.5a1.5 1.5 0 0 1 1.5 1.5v8.3a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" {...S} />
    </svg>
  )
}

function IconTemplates() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" {...S} />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" {...S} />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" {...S} />
      <path d="M17 13.5v7M13.5 17h7" {...S} />
    </svg>
  )
}

function IconMath() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M4.5 4v15.5H20" {...S} />
      <path d="M6.5 13.5c2.2-5.4 4.3-5.8 6.3-1.2 1.8 4.2 3.8 4 6.2-1.4" {...S} />
      <circle cx="8.6" cy="16.9" r="1.1" {...S} />
    </svg>
  )
}

function IconForce() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M3 19.5h18L3 8.5z" {...S} />
      <path d="M8.5 15.2v-4" {...S} />
      <path d="M8.5 11.2 6.9 13M8.5 11.2l1.6 1.8" {...S} />
    </svg>
  )
}

function IconMotion() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M5 4.5h14" {...S} />
      <path d="M12 4.5 6.5 15.5" {...S} />
      <circle cx="6.5" cy="17.5" r="2.3" {...S} />
      <path d="M9.6 15.2a7 7 0 0 0 8.9-1.2" {...S} strokeDasharray="2.5 2.5" />
    </svg>
  )
}

function IconSolid() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="m12 3.2 7.4 4.2v9.2L12 20.8l-7.4-4.2V7.4z" {...S} />
      <path d="m4.6 7.4 7.4 4.2 7.4-4.2M12 11.6v9.2" {...S} />
    </svg>
  )
}

function IconMech() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="12" cy="12" r="3.1" {...S} />
      <path d="M12 3.2v2.4M12 18.4v2.4M3.2 12h2.4M18.4 12h2.4M5.8 5.8l1.7 1.7M16.5 16.5l1.7 1.7M18.2 5.8l-1.7 1.7M7.5 16.5l-1.7 1.7" {...S} />
    </svg>
  )
}

function IconLab() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M9.5 3.5h5M10.5 3.5v5.2L5.6 17a2 2 0 0 0 1.7 3h9.4a2 2 0 0 0 1.7-3l-4.9-8.3V3.5" {...S} />
      <path d="M8.1 14.5h7.8" {...S} />
    </svg>
  )
}

function IconSymbol() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M17.5 5.5h-9l5 6.5-5 6.5h9" {...S} />
      <path d="M4 12h3" {...S} />
    </svg>
  )
}

function IconGearTop() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
      <circle cx="12" cy="12" r="2.8" {...S} />
      <path d="M12 4.5v2M12 17.5v2M4.5 12h2M17.5 12h2M6.7 6.7l1.4 1.4M15.9 15.9l1.4 1.4M17.3 6.7l-1.4 1.4M8.1 15.9l-1.4 1.4" {...S} />
    </svg>
  )
}

function IconKeyboard() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
      <rect x="3" y="6.5" width="18" height="11" rx="2" {...S} />
      <path d="M6.5 10h.01M9.5 10h.01M12.5 10h.01M15.5 10h.01M18 10h.01M7.5 13.8h9" {...S} />
    </svg>
  )
}

function IconUpdate() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
      <path d="M12 4v10" {...S} />
      <path d="m8 11 4 3.5 4-3.5" {...S} />
      <path d="M5 16.5v2h14v-2" {...S} />
    </svg>
  )
}

function IconArrow() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M5 12h13M13 7l5 5-5 5" {...S} />
    </svg>
  )
}

function IconClock() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <circle cx="12" cy="12" r="8" {...S} />
      <path d="M12 7.5V12l3 2" {...S} />
    </svg>
  )
}

interface ModeCard {
  id: LobbyQuick
  title: string
  hint: string
  icon: ReactNode
  /** 卡片右下角的小标注 */
  badge?: string
}

const MODES: ModeCard[] = [
  { id: 'math', title: '数学作图', hint: '函数图像 · 几何约束 · 动态测量', icon: <IconMath /> },
  { id: 'physics', title: '物理受力', hint: '斜面 · 受力分解 · 正交分解', icon: <IconForce /> },
  { id: 'motion', title: '运动仿真', hint: '单摆 · 弹簧振子 · 抛体', icon: <IconMotion /> },
  { id: 'solid', title: '三维立体', hint: '多面体 · 旋转体 · 刚体物理', icon: <IconSolid /> },
  { id: 'mech', title: '机构装配', hint: '23 种部件 · 10 种连接', icon: <IconMech />, badge: '新' },
  { id: 'lab', title: '教材实验室', hint: '人教版高中物理实验 + 大屏演示', icon: <IconLab /> },
  { id: 'symbols', title: '符号实验室', hint: '拖符号拼公式（独立窗口）', icon: <IconSymbol /> },
  { id: 'gallery', title: '模板库', hint: '现成课件一键套用', icon: <IconTemplates /> },
]

function RecentRow({ path, onOpen }: { path: string; onOpen: (p: string) => void }) {
  const name = fileNameOf(path)
  const folder = folderOf(path)
  return (
    <button className="lobby__file" onClick={() => onOpen(path)} title={path}>
      <span className="lobby__file-icon">
        <IconFolder />
      </span>
      <span className="lobby__file-text">
        <b>{name}</b>
        <i>{folder || '本地文件'}</i>
      </span>
      <span className="lobby__file-go">
        <IconArrow />
      </span>
    </button>
  )
}

export function Lobby({
  version,
  recent,
  lastFile,
  currentFile,
  onNew,
  onOpen,
  onOpenRecent,
  onResumeLast,
  onResumeCurrent,
  onQuick,
  onPrefs,
  onShortcuts,
  onTour,
  onUpdate,
  onDataDir,
}: Props) {
  const seen = new Set<string>()
  const files = recent.filter((p) => {
    if (!p || seen.has(p)) return false
    seen.add(p)
    return true
  })
  const showLast = Boolean(lastFile && lastFile !== currentFile)
  const hasResume = Boolean(currentFile || showLast)

  return (
    <div className="lobby" data-lobby="1">
      <div className="lobby__paper" aria-hidden="true" />

      <header className="lobby__top">
        <div className="lobby__brand">
          <span className="lobby__mark" aria-hidden="true">
            <svg viewBox="0 0 40 40" width="34" height="34">
              <rect x="3.5" y="3.5" width="33" height="33" rx="9" fill="#fbfaf7" stroke="#3d5a66" strokeWidth="1.6" />
              <path d="M11 27c4.5-9.5 8-13 10.5-13 3 0 3.5 5 6.5 5 1.2 0 2.2-.6 3-1.6" fill="none" stroke="#3d5a66" strokeWidth="2" strokeLinecap="round" />
              <circle cx="27.5" cy="13.6" r="2.2" fill="#3d5a66" />
              <circle cx="12" cy="31" r="1.5" fill="#b08a3e" />
            </svg>
          </span>
          <span className="lobby__brandtext">
            <b>弦点</b>
            <i>Chordot</i>
          </span>
          <span className="lobby__version">v{version}</span>
        </div>

        <div className="lobby__top-actions">
          <button className="lobby__iconbtn" onClick={onUpdate} title="检查更新">
            <IconUpdate />
            <span>更新</span>
          </button>
          <button className="lobby__iconbtn" onClick={onShortcuts} title="快捷键一览">
            <IconKeyboard />
            <span>快捷键</span>
          </button>
          <button className="lobby__iconbtn" onClick={onPrefs} title="设置">
            <IconGearTop />
            <span>设置</span>
          </button>
        </div>
      </header>

      <main className="lobby__body">
        <section className="lobby__hero">
          <p className="lobby__eyebrow">数学 · 物理 · 教学作图</p>
          <h1 className="lobby__title">
            从一张干净的纸
            <br />
            开始今天的课
          </h1>
          <p className="lobby__sub">
            点线圆多边形、函数与几何约束、受力分解、三维立体、机构装配和教材实验，都在同一个工作台里。
          </p>

          <div className="lobby__cta">
            <button className="lobby__primary" onClick={onNew}>
              <IconPlus />
              新建课件
            </button>
            <button className="lobby__ghost" onClick={onOpen}>
              <IconFolder />
              打开课件…
            </button>
            <button className="lobby__ghost" onClick={() => onQuick('gallery')}>
              <IconTemplates />
              模板库
            </button>
          </div>

          {hasResume && (
            <div className="lobby__resume">
              {currentFile && (
                <div className="lobby__resumecard">
                  <span className="lobby__resumeicon">
                    <IconClock />
                  </span>
                  <span className="lobby__resumetext">
                    <i>当前正在编辑</i>
                    <b>{fileNameOf(currentFile)}</b>
                  </span>
                  <button className="lobby__resumego" onClick={onResumeCurrent}>
                    回到编辑
                  </button>
                </div>
              )}
              {showLast && (
                <div className="lobby__resumecard">
                  <span className="lobby__resumeicon">
                    <IconClock />
                  </span>
                  <span className="lobby__resumetext">
                    <i>上次打开</i>
                    <b>{fileNameOf(lastFile as string)}</b>
                  </span>
                  <button className="lobby__resumego" onClick={onResumeLast}>
                    继续
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="lobby__modes" aria-label="选择模式">
          <div className="lobby__modeshead">
            <h2>选择模式</h2>
            <p>每个模式都会开一张新的工作台；已有课件请从「最近课件」打开。</p>
          </div>
          <div className="lobby__modegrid">
            {MODES.map((m) => (
              <button key={m.id} className="lobby__mode" data-mode={m.id} onClick={() => onQuick(m.id)}>
                <span className="lobby__modeicon">{m.icon}</span>
                <span className="lobby__modetext">
                  <b>
                    {m.title}
                    {m.badge && <em className="lobby__badge">{m.badge}</em>}
                  </b>
                  <i>{m.hint}</i>
                </span>
                <span className="lobby__modego">
                  <IconArrow />
                </span>
              </button>
            ))}
          </div>
        </section>
      </main>

      <section className="lobby__recent" aria-label="最近课件">
        <div className="lobby__recenthead">
          <h2>最近课件</h2>
          <span>只显示本机打开过的文件</span>
        </div>
        {files.length === 0 ? (
          <div className="lobby__empty">
            <span className="lobby__emptyart" aria-hidden="true">
              <svg viewBox="0 0 120 64" width="120" height="64">
                <path d="M12 52h96" stroke="#d8d4ce" strokeWidth="1.2" strokeLinecap="round" />
                <rect x="26" y="18" width="40" height="28" rx="3" fill="none" stroke="#c9c4bc" strokeWidth="1.3" strokeDasharray="4 3" />
                <path d="M30 24h10M30 29h18M30 34h14" stroke="#d8d4ce" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M78 20c7 0 11 5 14 12" stroke="#c9c4bc" strokeWidth="1.2" fill="none" strokeLinecap="round" />
                <circle cx="94" cy="33" r="2.4" fill="#c9c4bc" />
              </svg>
            </span>
            <p>还没有最近打开的课件。先新建一个，或者从模板库里挑一个现成的。</p>
            <div className="lobby__emptybtns">
              <button className="lobby__ghost" onClick={onNew}>
                新建课件
              </button>
              <button className="lobby__ghost" onClick={() => onQuick('gallery')}>
                打开模板库
              </button>
            </div>
          </div>
        ) : (
          <div className="lobby__filelist">
            {files.slice(0, 8).map((p) => (
              <RecentRow key={p} path={p} onOpen={onOpenRecent} />
            ))}
          </div>
        )}
      </section>

      <footer className="lobby__foot">
        <span>
          弦点 Chordot <b>v{version}</b> · 课件保存在你自己的电脑上
        </span>
        <div className="lobby__footlinks">
          <button onClick={onTour}>重新观看引导</button>
          <button onClick={onDataDir}>打开数据目录</button>
        </div>
      </footer>
    </div>
  )
}
