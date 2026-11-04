import { useRef, useState } from 'react'
import type { MathfieldElement } from 'mathlive'
import { CloseIcon } from './icons'

interface Tab {
  id: string
  label: string
  keys: string[]
}

const TABS: Tab[] = [
  {
    id: 'common',
    label: '常用',
    keys: [
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.',
      'x', 'y', 't', 'θ', '°', '²', '³', '√', 'π', '∞',
      '≈', '≤', '≥', '≠', '±', '×', '÷', '·', '(', ')', '|', '→',
    ],
  },
  {
    id: 'greek',
    label: '希腊字母',
    keys: ['α', 'β', 'γ', 'δ', 'ε', 'θ', 'λ', 'μ', 'ν', 'ρ', 'σ', 'τ', 'φ', 'χ', 'ψ', 'ω', 'Δ', 'Σ', 'Ω'],
  },
  {
    id: 'ops',
    label: '运算',
    keys: ['+', '-', '*', '/', '^', '√', '∫', '∑', '∏', 'd/dx', 'lim', '!', '%', 'e', 'π'],
  },
  {
    id: 'func',
    label: '函数',
    keys: ['sin(', 'cos(', 'tan(', 'asin(', 'acos(', 'atan(', 'exp(', 'ln(', 'log(', 'abs(', 'sqrt(', 'floor(', 'round('],
  },
  {
    id: 'phys',
    label: '物理量',
    keys: ['m', 'g', 'N', 'f', 'F', 'v', 'a', 's', 'μ', 'θ', 'Δ', '⊥', '∥', '→', '·', 'N·m', 'm/s', 'm/s²'],
  },
]

/** 符号 → LaTeX：数学编辑器要 LaTeX，普通输入框要原文 */
const LATEX: Record<string, string> = {
  '√': '\\sqrt{#0}',
  'π': '\\pi',
  'θ': '\\theta',
  'α': '\\alpha',
  'β': '\\beta',
  'γ': '\\gamma',
  'δ': '\\delta',
  'ε': '\\varepsilon',
  'λ': '\\lambda',
  'μ': '\\mu',
  'ν': '\\nu',
  'ρ': '\\rho',
  'σ': '\\sigma',
  'τ': '\\tau',
  'φ': '\\varphi',
  'χ': '\\chi',
  'ψ': '\\psi',
  'ω': '\\omega',
  'Δ': '\\Delta',
  'Σ': '\\Sigma',
  'Ω': '\\Omega',
  '∞': '\\infty',
  '≈': '\\approx',
  '≤': '\\le',
  '≥': '\\ge',
  '≠': '\\ne',
  '±': '\\pm',
  '×': '\\times',
  '÷': '\\div',
  '·': '\\cdot',
  '→': '\\to',
  '∫': '\\int',
  '∑': '\\sum',
  '∏': '\\prod',
  '⊥': '\\perp',
  '∥': '\\parallel',
  '²': '^2',
  '³': '^3',
  '°': '^{\\circ}',
}

function toLatex(text: string): string {
  if (LATEX[text]) return LATEX[text]
  // sin( → \sin(（单字符 '(' 不能走这条规则）
  if (text.length > 1 && text.endsWith('(')) return `\\${text.slice(0, -1)}(`
  if (text === 'd/dx') return '\\frac{d}{dx}'
  if (text === 'lim') return '\\lim'
  return text
}

/** 把 LaTeX 追加到数学编辑器末尾。
 *
 * 不用 mf.insert() 插普通符号：MathLive 对 ( \times 这类「还缺右操作数」的位置，
 * 下一次 insert 会被吞掉。也不用 mf.selection / mf.position 做字符串拼接：
 * 那是模型偏移而不是 LaTeX 字符偏移，拼出来会得到 \\timespi 这种废串。
 * 追加是唯一不会写坏公式的做法。
 *
 * 例外是带 #0 占位符的结构（√）：只有 insert() 能把光标放进括号里，所以单独走它。
 */
function insertIntoMathField(mf: MathfieldElement, latex: string) {
  // 有占位符时（√ 之后）也必须走 insert，否则内容会落到根号外面
  if (latex.includes('#0') || mf.value.includes('\\placeholder')) {
    mf.focus()
    mf.insert(latex)
    return
  }
  mf.value = mf.value + latex
  mf.focus()
  mf.executeCommand('moveToMathfieldEnd')
}

function asMathField(el: Element | null): MathfieldElement | null {
  if (!el) return null
  if (el.tagName === 'MATH-FIELD') return el as MathfieldElement
  const host = el.closest('math-field')
  return host ? (host as MathfieldElement) : null
}

/** 把文本插入当前聚焦输入框（无聚焦时落到左栏表达式输入） */
function insertText(text: string) {
  const active = document.activeElement

  // 数学编辑器优先：走 MathLive 的 insert，光标位置由它自己维护
  const mf = asMathField(active) ?? document.querySelector<MathfieldElement>('math-field.left__input')
  if (mf) {
    insertIntoMathField(mf, toLatex(text))
    return
  }

  const target =
    active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')
      ? (active as HTMLInputElement | HTMLTextAreaElement)
      : document.querySelector<HTMLInputElement>('.left__input')
  if (!target) return

  const start = target.selectionStart ?? target.value.length
  const end = target.selectionEnd ?? start
  const next = target.value.slice(0, start) + text + target.value.slice(end)

  // 受控 / 非受控输入都走原生 setter，保证 React 收到变更
  const proto = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value')?.set
  setter?.call(target, next)
  target.dispatchEvent(new Event('input', { bubbles: true }))

  target.focus()
  const caret = start + text.length
  target.setSelectionRange(caret, caret)
}

export function SymbolPad({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState(TABS[0].id)
  const current = TABS.find((t) => t.id === tab) ?? TABS[0]
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ dx: number; dy: number } | null>(null)

  const startDrag = (e: React.PointerEvent) => {
    const box = (e.currentTarget as Element).closest('.pad') as HTMLElement | null
    if (!box) return
    const r = box.getBoundingClientRect()
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top }
    setPos({ x: r.left, y: r.top })
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      /* 合成事件忽略 */
    }
  }
  const moveDrag = (e: React.PointerEvent) => {
    if (!drag.current) return
    setPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy })
  }
  const endDrag = () => {
    drag.current = null
  }

  return (
    <div
      className="pad"
      style={pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined}
    >
      <div className="pad__tabs">
        <span
          className="pad__grip"
          title="拖动移动键盘"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          ⠿
        </span>
        {TABS.map((t) => (
          <button
            key={t.id}
            className="pad__tab"
            data-active={t.id === tab}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        <span className="pad__spacer" />
        <button className="iconbtn" title="收起键盘" onClick={onClose}>
          <CloseIcon size={14} />
        </button>
      </div>

      <div className="pad__keys">
        {current.keys.map((k) => (
          <button
            key={k}
            className="pad__key"
            title={k}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertText(k)}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  )
}
