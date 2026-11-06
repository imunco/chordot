import { useEffect, useState } from 'react'

interface Step {
  title: string
  lead: string
  points: string[]
  art: 'welcome' | 'canvas' | 'tools' | 'constraint' | 'measure' | 'physics' | 'solid' | 'files'
}

const STEPS: Step[] = [
  {
    title: '欢迎使用弦点',
    lead: '一块给数学和物理课用的电子黑板：随手画图，自动守规矩。',
    points: [
      '纸面插画风格，浅色低饱和，投影和一体机上都看得清',
      '图形、受力图、三维模型、动态仿真都在同一个画布上',
      '所有文件都是本机的 .chordot，不联网也能用',
    ],
    art: 'welcome',
  },
  {
    title: '先学会移动画布',
    lead: '画布比屏幕大，先把「看哪里」掌握住，再谈画什么。',
    points: [
      '左键按住空白处拖动 = 平移画面（超过 3px 才算，不会误触）',
      '滚轮缩放，光标下那一点始终不动，缩放不会跑偏',
      '触屏上双指捏合缩放、双指拖动平移',
    ],
    art: 'canvas',
  },
  {
    title: '工具栏：从点到函数',
    lead: '主工具栏在屏幕底部，按「几何 → 函数 → 力」排列，用哪个点哪个。',
    points: [
      '点、线段、圆、多边形：点两下就成形，端点会自动吸附已有点',
      '函数与力：左栏输入表达式出曲线；「力」工具拖出矢量，可设恒力 / F(t) / F(x)',
      '批注在底部正中，落笔不用抬手到屏幕上方；写完点「完成」回到作图',
    ],
    art: 'tools',
  },
  {
    title: '约束：让图自己守规矩',
    lead: '选中线段或点，右栏（按 P 打开）会出现约束按钮。',
    points: [
      '水平、竖直、等长、平行、垂直、点在线上、中点、相切',
      '加约束时只动参与的那几个对象，旁边的图形不会被带偏',
      '加完之后再拖，约束依然成立；矛盾时会提示并高亮相关对象',
    ],
    art: 'constraint',
  },
  {
    title: '测量：把答案写在图上',
    lead: '选中对象就能读出距离、角度、面积，单位随模式切换。',
    points: [
      '两点距离、三点角度、多边形面积',
      '数学模式用 cm，物理模式用 m，读数跟着缩放走',
      '拖动时相邻线段会实时显示长度，讲题时不用另外算',
    ],
    art: 'measure',
  },
  {
    title: '物理：受力与运动',
    lead: '物理模式里有现成的斜面、单摆、弹簧、抛体。',
    points: [
      '斜面受力：G / N / f 自动算好，可正交分解成 mg·sinθ 与 mg·cosθ',
      '运动仿真：时间轴可播放、暂停、拖回去看某一刻',
      '回放是纯看录像，不会改动你的图',
    ],
    art: 'physics',
  },
  {
    title: '三维：立体与物理世界',
    lead: '图形库里 11 个立体模型，拖到画布就能转。',
    points: [
      '拖拽旋转、滚轮缩放，默认透视，可切正投影',
      '开物理世界后是真正的刚体：会掉、会滚、会撞',
      '选中立体可以看到 G、F、F总 的力箭头',
    ],
    art: 'solid',
  },
  {
    title: '课件与模板',
    lead: '71 个内置模板，覆盖高中大部分图形。',
    points: [
      '模板库按二级分类整理，可搜索、可收藏',
      '自己画的图可以「存为模板」，也能导出 .chordotpack 给同事',
      'Ctrl+K 打开命令面板，P 开关右栏，? 看全部快捷键',
    ],
    art: 'files',
  },
]

/** 每一步的小插图：全部用细线 + 低饱和色，和画布同一套语言 */
function Art({ kind }: { kind: Step['art'] }) {
  const line = '#5C5A56'
  const soft = '#B9B3A8'
  const accent = '#3D5A66'
  const warm = '#9A5B4A'
  return (
    <svg viewBox="0 0 220 160" className="ob__art" aria-hidden="true">
      <rect x="0" y="0" width="220" height="160" rx="10" fill="#FCFBF8" />
      {kind === 'welcome' && (
        <g stroke={soft} fill="none" strokeWidth="1">
          {Array.from({ length: 8 }, (_, i) => (
            <line key={`v${i}`} x1={30 + i * 22} y1="18" x2={30 + i * 22} y2="142" />
          ))}
          {Array.from({ length: 6 }, (_, i) => (
            <line key={`h${i}`} x1="18" y1={26 + i * 22} x2="202" y2={26 + i * 22} />
          ))}
          <g stroke={accent} strokeWidth="1.6">
            <line x1="18" y1="114" x2="202" y2="114" />
            <line x1="110" y1="18" x2="110" y2="142" />
          </g>
          <polyline points="40,104 66,72 92,84 118,52 144,66 170,38" stroke={warm} strokeWidth="1.8" />
          <circle cx="118" cy="52" r="3" fill="#FFFFFF" stroke={warm} strokeWidth="1.5" />
        </g>
      )}
      {kind === 'canvas' && (
        <g fill="none" strokeWidth="1.4">
          <rect x="24" y="26" width="172" height="108" rx="6" stroke={soft} strokeDasharray="4 4" />
          <path d="M96 80 L124 80 M110 66 L110 94" stroke={line} />
          <path d="M40 118 C 70 96, 92 132, 120 108 S 170 76, 186 92" stroke={warm} />
          <circle cx="110" cy="80" r="9" stroke={accent} strokeDasharray="3 3" />
        </g>
      )}
      {kind === 'tools' && (
        <g fill="none" strokeWidth="1.5" stroke={line}>
          <line x1="36" y1="120" x2="88" y2="52" />
          <circle cx="88" cy="52" r="3" fill="#FFF" />
          <circle cx="36" cy="120" r="3" fill="#FFF" />
          <circle cx="150" cy="60" r="24" stroke={accent} />
          <polygon points="60,140 110,140 150,110 100,110" stroke={warm} />
          <polyline points="120,120 136,96 152,104 168,80" stroke={soft} strokeWidth="1.2" />
        </g>
      )}
      {kind === 'constraint' && (
        <g fill="none" strokeWidth="1.5">
          <line x1="40" y1="110" x2="180" y2="110" stroke={line} />
          <line x1="110" y1="110" x2="150" y2="52" stroke={line} />
          <path d="M110 96 L124 96 L124 110" stroke={soft} strokeWidth="1.2" />
          <text x="112" y="128" fontSize="11" fill={accent} fontFamily="serif">
            ⊥
          </text>
          <circle cx="150" cy="52" r="3" fill="#FFF" stroke={line} />
          <circle cx="110" cy="110" r="3" fill="#FFF" stroke={line} />
          <circle cx="40" cy="110" r="3" fill="#FFF" stroke={line} />
          <circle cx="180" cy="110" r="3" fill="#FFF" stroke={line} />
        </g>
      )}
      {kind === 'measure' && (
        <g fill="none" strokeWidth="1.4">
          <polygon points="50,120 170,120 130,50" stroke={line} />
          <path d="M50 108 L62 108 L62 120" stroke={soft} strokeWidth="1.1" />
          <text x="96" y="140" fontSize="11" fill={accent} fontFamily="serif">
            6.0 cm
          </text>
          <path d="M120 120 A 26 26 0 0 0 116 96" stroke={warm} strokeWidth="1.2" />
          <text x="128" y="112" fontSize="11" fill={warm} fontFamily="serif">
            52°
          </text>
        </g>
      )}
      {kind === 'physics' && (
        <g fill="none" strokeWidth="1.5">
          <line x1="26" y1="126" x2="194" y2="126" stroke={soft} />
          <path d="M40 126 L176 126 L40 62 Z" stroke={line} />
          <rect x="86" y="82" width="26" height="26" stroke={warm} transform="rotate(-30 99 95)" />
          <line x1="99" y1="95" x2="99" y2="132" stroke={accent} />
          <path d="M99 132 l-3 -6 M99 132 l3 -6" stroke={accent} />
          <line x1="99" y1="95" x2="76" y2="64" stroke={accent} strokeDasharray="3 3" />
          <text x="104" y="134" fontSize="10" fill={accent} fontFamily="serif">
            G
          </text>
        </g>
      )}
      {kind === 'solid' && (
        <g fill="none" strokeWidth="1.4" stroke={line}>
          <polygon points="70,96 130,96 160,72 100,72" stroke={soft} />
          <polygon points="70,96 70,44 100,20 100,72" />
          <polygon points="100,72 160,72 160,20 100,20" />
          <polygon points="100,20 130,44 160,20" stroke={soft} />
          <line x1="130" y1="96" x2="130" y2="44" />
          <line x1="130" y1="44" x2="100" y2="20" />
          <line x1="70" y1="44" x2="100" y2="72" />
        </g>
      )}
      {kind === 'files' && (
        <g fill="none" strokeWidth="1.4">
          <rect x="34" y="34" width="60" height="76" rx="5" stroke={soft} />
          <rect x="80" y="26" width="60" height="76" rx="5" stroke={soft} />
          <rect x="126" y="40" width="60" height="76" rx="5" stroke={accent} />
          <line x1="140" y1="58" x2="172" y2="58" stroke={accent} />
          <line x1="140" y1="72" x2="166" y2="72" stroke={soft} />
          <line x1="140" y1="86" x2="172" y2="86" stroke={soft} />
          <polyline points="140,104 152,92 164,100 172,88" stroke={warm} />
        </g>
      )}
    </svg>
  )
}

interface Props {
  onDone: () => void
}

export function Onboarding({ onDone }: Props) {
  const [i, setI] = useState(0)
  const step = STEPS[i]
  const last = i === STEPS.length - 1

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onDone()
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
        if (last) onDone()
        else setI((v) => v + 1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setI((v) => Math.max(0, v - 1))
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [last, onDone])

  return (
    <div className="ob" role="dialog" aria-label="使用引导">
      <div className="ob__card">
        <div className="ob__left">
          <Art kind={step.art} />
          <div className="ob__dots">
            {STEPS.map((s, k) => (
              <button
                key={s.title}
                className="ob__dot"
                data-active={k === i}
                data-past={k < i}
                title={s.title}
                onClick={() => setI(k)}
              />
            ))}
          </div>
        </div>

        <div className="ob__right">
          <div className="ob__count">
            {i + 1} / {STEPS.length}
          </div>
          <h2 className="ob__title">{step.title}</h2>
          <p className="ob__lead">{step.lead}</p>
          <ul className="ob__points">
            {step.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>

          <div className="ob__foot">
            <button className="ob__skip" onClick={onDone}>
              跳过引导
            </button>
            <div className="ob__nav">
              <button
                className="btn"
                disabled={i === 0}
                onClick={() => setI((v) => Math.max(0, v - 1))}
              >
                上一步
              </button>
              <button className="btn btn--primary" onClick={() => (last ? onDone() : setI(i + 1))}>
                {last ? '开始作图' : '下一步'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
