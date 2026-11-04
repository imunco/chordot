import { useEffect, useState } from 'react'
import type { Settings } from '../settings'
import type { UpdaterState } from '../updater'
import { CloseIcon } from './icons'
import { useEscape } from './useEscape'

type Tab = 'general' | 'look' | 'update' | 'about'

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  onClose: () => void
  onReplayTour: () => void
  updater: UpdaterState
  onCheckUpdate: () => Promise<UpdateCheckResult | null>
  onProbe: () => Promise<{ id: string; name: string; ms: number }[]>
  onDownload: () => void
  onInstall: () => void
  onToast: (text: string) => void
  /** 打开时停在哪一页（菜单「关于」直接跳过去） */
  initialTab?: Tab
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'general', label: '通用' },
  { id: 'look', label: '个性化' },
  { id: 'update', label: '更新' },
  { id: 'about', label: '关于' },
]

const FREQ: { value: Settings['updateFreq']; label: string }[] = [
  { value: 'startup', label: '每次启动' },
  { value: 'daily', label: '每天一次' },
  { value: 'weekly', label: '每周一次' },
  { value: 'never', label: '从不自动检查' },
]

const MIRROR_FALLBACK = [
  { id: 'auto', name: '自动选择最快镜像' },
  { id: 'direct', name: 'GitHub 直连' },
]

const Row = (p: {
  label: string
  hint?: string
  children: React.ReactNode
  wide?: boolean
}) => (
  <div className="prefs__row" data-wide={p.wide || undefined}>
    <div className="prefs__label">
      {p.label}
      {p.hint && <span className="prefs__hint">{p.hint}</span>}
    </div>
    <div className="prefs__control">{p.children}</div>
  </div>
)

const Toggle = (p: { on: boolean; onChange: (v: boolean) => void; onText?: string; offText?: string }) => (
  <button className="props__toggle" data-on={p.on} onClick={() => p.onChange(!p.on)}>
    {p.on ? (p.onText ?? '开') : (p.offText ?? '关')}
  </button>
)

export function Preferences({
  settings,
  onChange,
  onClose,
  onReplayTour,
  updater,
  onCheckUpdate,
  onProbe,
  onDownload,
  onInstall,
  onToast,
  initialTab = 'general',
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab)
  useEscape(true, onClose)
  const [mirrors, setMirrors] = useState<{ id: string; name: string }[]>(MIRROR_FALLBACK)
  const [probe, setProbe] = useState<{ id: string; name: string; ms: number }[] | null>(null)
  const [dataDir, setDataDir] = useState('')
  const [probing, setProbing] = useState(false)
  const [about, setAbout] = useState<{
    name: string
    version: string
    electron: string
    chrome: string
    node: string
    repo: string
  } | null>(null)

  useEffect(() => {
    window.chordot?.update
      ?.info()
      .then((info) => {
        if (info?.mirrors?.length) {
          setMirrors([{ id: 'auto', name: '自动选择最快镜像' }, ...info.mirrors])
        }
      })
      .catch(() => {})
    window.chordot
      ?.about?.()
      .then(setAbout)
      .catch(() => {})
    window.chordot?.store
      ?.dir()
      .then(setDataDir)
      .catch(() => {})
  }, [])

  // 用构建期注入的版本：主进程在开发模式下拿到的是 Electron 版本
  const version = __APP_VERSION__
  const res = updater.result

  const checkNow = async () => {
    const out = await onCheckUpdate()
    if (!out) return
    if (!out.ok) onToast(out.error ?? '检查更新失败')
    else if (out.noRelease) onToast('仓库还没有发布版本')
    else if (out.hasUpdate) onToast(`发现新版本 ${out.latest}`)
    else onToast('已经是最新版本')
  }

  return (
    <div className="gallery" role="dialog" aria-label="设置" onClick={onClose}>
      <div className="prefs" onClick={(e) => e.stopPropagation()}>
        <header className="gallery__head">
          <div className="gallery__title">设置</div>
          <button className="iconbtn" title="关闭" onClick={onClose}>
            <CloseIcon size={15} />
          </button>
        </header>

        <div className="prefs__tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className="prefs__tab"
              data-active={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="prefs__body">
          {tab === 'general' && (
            <>
              <Row label="力箭头标尺" hint="每牛顿的像素长度">
                <input
                  className="prefs__range"
                  type="range"
                  min={2}
                  max={8}
                  step={0.5}
                  value={settings.forceScale}
                  onChange={(e) => onChange({ forceScale: Number(e.target.value) })}
                />
                <span className="prefs__value">{settings.forceScale} px/N</span>
              </Row>

              <Row label="网格" hint="新建课件时默认显示">
                <Toggle on={settings.grid} onChange={(v) => onChange({ grid: v })} onText="显示" offText="隐藏" />
              </Row>

              <Row label="网格密度" hint="每一格代表多少单位">
                <div className="segmented prefs__seg">
                  {[0.5, 1, 2].map((v) => (
                    <button
                      key={v}
                      className="segmented__btn"
                      data-active={settings.gridStep === v}
                      onClick={() => onChange({ gridStep: v })}
                    >
                      {v} 单位
                    </button>
                  ))}
                </div>
              </Row>

              <Row label="角度单位" hint="影响测量与读数显示">
                <div className="segmented prefs__seg">
                  <button
                    className="segmented__btn"
                    data-active={settings.angleUnit === 'deg'}
                    onClick={() => onChange({ angleUnit: 'deg' })}
                  >
                    度
                  </button>
                  <button
                    className="segmented__btn"
                    data-active={settings.angleUnit === 'rad'}
                    onClick={() => onChange({ angleUnit: 'rad' })}
                  >
                    弧度
                  </button>
                </div>
              </Row>

              <Row label="坐标刻度" hint="坐标轴上显示刻度数字">
                <Toggle
                  on={settings.showTicks}
                  onChange={(v) => onChange({ showTicks: v })}
                  onText="显示"
                  offText="隐藏"
                />
              </Row>

              <Row label="启动即触控模式" hint="一体机 / 平板建议打开，命中区更大">
                <Toggle
                  on={settings.touchDefault}
                  onChange={(v) => onChange({ touchDefault: v })}
                  onText="开启"
                  offText="关闭"
                />
              </Row>
            </>
          )}

          {tab === 'look' && (
            <>
              <Row label="曲线线宽" hint="函数图像的笔画粗细">
                <input
                  className="prefs__range"
                  type="range"
                  min={1}
                  max={3}
                  step={0.5}
                  value={settings.curveWidth}
                  onChange={(e) => onChange({ curveWidth: Number(e.target.value) })}
                />
                <span className="prefs__value">{settings.curveWidth.toFixed(1)} px</span>
              </Row>

              <Row label="减弱动效" hint="关掉面板过渡与入场动画，投影更稳">
                <Toggle
                  on={settings.reduceMotion}
                  onChange={(v) => onChange({ reduceMotion: v })}
                  onText="已开启"
                  offText="关闭"
                />
              </Row>

              <Row label="引导教学" hint="随时可以重新看一遍">
                <button className="btn" onClick={onReplayTour}>
                  重新观看
                </button>
              </Row>
            </>
          )}

          {tab === 'update' && (
            <>
              <Row label="自动检查更新" hint="启动时在后台静默检查">
                <Toggle
                  on={settings.updateAuto && !settings.updateMuted}
                  onChange={(v) => onChange({ updateAuto: v, updateMuted: !v ? settings.updateMuted : false })}
                  onText="开启"
                  offText="关闭"
                />
              </Row>

              <Row label="提醒频率" hint="多久提醒一次有新版本">
                <select
                  className="props__input prefs__select"
                  value={settings.updateFreq}
                  onChange={(e) => onChange({ updateFreq: e.target.value as Settings['updateFreq'] })}
                >
                  {FREQ.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </Row>

              <Row label="下载源" hint="国内镜像会自动测速，选最快的一个">
                <select
                  className="props__input prefs__select"
                  value={settings.updateMirror}
                  onChange={(e) => onChange({ updateMirror: e.target.value })}
                >
                  {mirrors.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Row>

              <Row label="手动检查" hint={settings.updateCheckedAt ? `上次检查：${new Date(settings.updateCheckedAt).toLocaleString()}` : '还没检查过'}>
                <button className="btn" disabled={updater.checking} onClick={checkNow}>
                  {updater.checking ? '检查中…' : '检查更新'}
                </button>
              </Row>

              <Row label="镜像测速" hint="并发探测全部镜像，看哪个最快">
                <button
                  className="btn"
                  disabled={probing || !updater.result?.assets?.length}
                  onClick={async () => {
                    setProbing(true)
                    const list = await onProbe()
                    setProbe(list)
                    setProbing(false)
                    if (!list.length) onToast('测速失败，检查网络后重试')
                  }}
                >
                  {probing ? '测速中…' : '开始测速'}
                </button>
              </Row>

              {probe && (
                <div className="prefs__probe">
                  {probe.slice(0, 6).map((m, i) => (
                    <div key={m.id} className="prefs__proberow" data-best={i === 0 || undefined}>
                      <span className="prefs__probemark">{i === 0 ? '最快' : i + 1}</span>
                      <span className="prefs__probename">{m.name}</span>
                      <span className="prefs__probems">{m.ms} ms</span>
                    </div>
                  ))}
                </div>
              )}

              {res?.hasUpdate && (
                <div className="prefs__card">
                  <div className="prefs__cardtitle">发现新版本 {res.latest}</div>
                  <div className="prefs__cardbody">
                    当前 {res.current} · 安装包 {(res.assets?.[0]?.size ?? 0) / 1048576 > 0
                      ? `${((res.assets?.[0]?.size ?? 0) / 1048576).toFixed(1)} MB`
                      : '未知大小'}
                  </div>
                  <div className="prefs__cardfoot">
                    {updater.filePath ? (
                      <button className="btn btn--primary" onClick={onInstall}>
                        打开安装包
                      </button>
                    ) : (
                      <button className="btn btn--primary" disabled={updater.downloading} onClick={onDownload}>
                        {updater.downloading
                          ? `下载中 ${updater.total ? Math.round((updater.received / updater.total) * 100) : 0}%`
                          : '下载更新'}
                      </button>
                    )}
                  </div>
                </div>
              )}
              {updater.error && <div className="update__error">{updater.error}</div>}
              {res && !res.hasUpdate && !res.noRelease && (
                <div className="prefs__ok">已是最新版本（{res.current}）</div>
              )}
              {res?.noRelease && <div className="prefs__ok">仓库还没有发布版本，发布后这里会提示。</div>}
            </>
          )}

          {tab === 'about' && (
            <div className="about">
              <div className="about__mark">弦</div>
              <div className="about__name">弦点 Chordot</div>
              <div className="about__ver">版本 {version}</div>
              <div className="about__dev">奇点未码工作室</div>
              <p className="about__desc">
                给高中数学与物理课用的教学作图工具。纸面风格，离线可用，课件存成 .chordot。
              </p>
              <div className="about__meta">
                <span>Electron {about?.electron ?? '—'}</span>
                <span>Chromium {about?.chrome ?? '—'}</span>
                <span>Node {about?.node ?? '—'}</span>
              </div>
              <div className="about__links">
                <button
                  className="btn"
                  onClick={() => {
                    const url = about?.repo ?? 'https://github.com/imunco/chordot'
                    window.chordot?.update?.openRelease(url)
                  }}
                >
                  项目主页
                </button>
                <button className="btn" onClick={onReplayTour}>
                  再看一遍引导
                </button>
              </div>
              {dataDir && (
                <div className="about__data">
                  <div className="about__datatitle">本机数据目录</div>
                  <code className="about__path">{dataDir}</code>
                  <button className="btn about__open" onClick={() => void window.chordot?.store?.open()}>
                    打开文件夹
                  </button>
                </div>
              )}
              <div className="about__copy">© 2026 奇点未码工作室 · 保留所有权利</div>
            </div>
          )}
        </div>

        <footer className="prefs__foot">
          <span className="prefs__note">设置立即生效，并保存在本机。</span>
          <button className="btn btn--primary" onClick={onClose}>
            完成
          </button>
        </footer>
      </div>
    </div>
  )
}
