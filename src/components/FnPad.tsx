import { useEffect, useRef, useState } from 'react'
import type { MathInputApi } from './MathInput'

/**
 * 函数输入面板：常用函数分类 + 数字键盘 + 实时提示。
 *
 * 和参考图一样，键盘按「能拼出课本里那些式子」来排：
 * 左边数字与四则运算，右边三角函数 / 常数 / 幂与根式，底下退格与回车。
 */

const TEMPLATES: { label: string; tex: string; hint: string }[] = [
  { label: '一次', tex: '2x+1', hint: 'y = 2x + 1' },
  { label: '二次', tex: 'x^2-2x-3', hint: 'y = x² − 2x − 3' },
  { label: '幂', tex: 'x^3', hint: 'y = x³' },
  { label: '指数', tex: '2^x', hint: 'y = 2ˣ' },
  { label: '对数', tex: '\\ln(x)', hint: 'y = ln x' },
  { label: '三角', tex: '\\sin(x)', hint: 'y = sin x' },
]

type Key = { label: string; tex?: string; act?: 'back' | 'clear' | 'enter'; span?: number }

const KEYS: Key[] = [
  { label: 'sin', tex: '\\sin(' },
  { label: 'cos', tex: '\\cos(' },
  { label: 'tan', tex: '\\tan(' },
  { label: 'π', tex: '\\pi' },
  { label: 'e', tex: 'e' },

  { label: '7', tex: '7' },
  { label: '8', tex: '8' },
  { label: '9', tex: '9' },
  { label: '÷', tex: '\\div' },
  { label: 'x²', tex: '^2' },

  { label: '4', tex: '4' },
  { label: '5', tex: '5' },
  { label: '6', tex: '6' },
  { label: '×', tex: '\\times' },
  { label: '√', tex: '\\sqrt{' },

  { label: '1', tex: '1' },
  { label: '2', tex: '2' },
  { label: '3', tex: '3' },
  { label: '−', tex: '-' },
  { label: 'x', tex: 'x' },

  { label: '0', tex: '0' },
  { label: '.', tex: '.' },
  { label: '(', tex: '\\left(' },
  { label: ')', tex: '\\right)' },
  { label: '+', tex: '+' },

  { label: '←', act: 'back' },
  { label: '清空', act: 'clear' },
  { label: '↵ 添加', act: 'enter', span: 3 },
]

interface Props {
  api: React.RefObject<MathInputApi | null>
  /** 表达式输入框：放在分类下面、键盘上面，和参考图一致 */
  field: React.ReactNode
  /** 已有表达式条数 / 上限 */
  count: number
  max: number
  /** 实时校验给出的提示（空串表示没问题） */
  error: string
  /** 键盘展开状态由外面记忆 */
  open: boolean
  onToggle: () => void
}

export function FnPad({ api, field, count, max, error, open, onToggle }: Props) {
  const [flash, setFlash] = useState('')
  const timer = useRef<number | null>(null)

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])

  const say = (text: string) => {
    setFlash(text)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setFlash(''), 1800)
  }

  const press = (k: Key) => {
    const a = api.current
    if (!a) return
    if (k.act === 'back') {
      a.backspace()
      return
    }
    if (k.act === 'clear') {
      a.clear()
      return
    }
    if (k.act === 'enter') {
      if (count >= max) {
        say(`最多 ${max} 条表达式，先删掉一条`)
        return
      }
      a.submit()
      return
    }
    a.insert(k.tex ?? k.label)
  }

  const full = count >= max

  return (
    <div className="fnpad">
      <div className="fnpad__head">
        <span className="fnpad__title">函数</span>
        <span className="fnpad__count" data-full={full}>
          {count}/{max}
        </span>
        <button
          className="fnpad__toggle"
          data-active={open}
          onClick={onToggle}
          title={open ? '收起键盘' : '展开数字键盘'}
        >
          {open ? '收起键盘' : '键盘'}
        </button>
      </div>

      <div className="fnpad__tpl">
        {TEMPLATES.map((t) => (
          <button
            key={t.label}
            className="fnpad__chip"
            title={t.hint}
            disabled={full}
            onClick={() => {
              if (full) {
                say(`最多 ${max} 条表达式`)
                return
              }
              api.current?.insert(t.tex)
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="fnpad__field">{field}</div>

      {open && (
        <div className="fnpad__keys">
          {KEYS.map((k) => (
            <button
              key={k.label}
              className="fnpad__key"
              data-act={k.act ?? undefined}
              style={k.span ? { gridColumn: `span ${k.span}` } : undefined}
              onClick={() => press(k)}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}

      <p className="fnpad__msg" data-error={Boolean(error)}>
        {error || flash || '回车添加；y = 可省略'}
      </p>
    </div>
  )
}
