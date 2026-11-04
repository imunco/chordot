import { useEffect, useRef } from 'react'
import { MathfieldElement } from 'mathlive'
import { parse } from 'mathjs'
import { normalizeExpr } from '../kernel/scene'

let configured = false
function configure() {
  if (configured) return
  configured = true
  // 字体随应用打包，不走 CDN，保证离线可用
  MathfieldElement.fontsDirectory = '/mathlive/fonts'
  MathfieldElement.soundsDirectory = null
}

/** mathjs 表达式 → LaTeX；解析失败时原样交给编辑器 */
export function toTex(expr: string): string {
  const src = expr.trim()
  if (!src) return ''
  try {
    return parse(normalizeExpr(src)).toTex({ parenthesis: 'auto' })
  } catch {
    return src
  }
}

/** LaTeX → mathjs 表达式（MathLive 的 ascii-math 输出最接近 mathjs 语法） */
export function fromTex(field: MathfieldElement): string {
  const ascii = field.getValue('ascii-math').trim()
  return tidy(ascii)
}

/** ascii-math 会给出 `\sin x`、`2x` 这类写法，补成 mathjs 能算的形式 */
function tidy(src: string): string {
  let out = src
    // \sin x → sin(x)
    .replace(/\\(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log|exp|sqrt|abs)\b/g, '$1')
    .replace(/π/g, 'pi')
    .replace(/·|×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')')
  // MathLive 的 ascii-math 会把函数写成「sin (x)」，去掉这个多余空格
  out = out.replace(
    /\b(sin|cos|tan|cot|sec|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log10|log|exp|abs|sqrt|floor|round)\s+\(/g,
    '$1(',
  )
  // 函数名后面直接跟参数（没有括号）时补括号：sin x → sin(x)
  out = out.replace(
    /\b(sin|cos|tan|cot|sec|arcsin|arccos|arctan|sinh|cosh|tanh|ln|exp|abs)\s+([a-zA-Z0-9.]+)/g,
    '$1($2)',
  )
  return out.trim()
}

interface Props {
  /** 初始表达式（mathjs 语法） */
  initial: string
  className?: string
  /** 回车提交；返回 true 表示接受，编辑器会清空 */
  onSubmit: (expr: string) => boolean
  /** 失焦提交（编辑已有表达式时用） */
  commitOnBlur?: boolean
  onEscape?: () => void
  /** 外部值变化时同步（受控场景） */
  value?: string
  /** 附加到 <math-field> 自身的类名，便于外部定位 */
  fieldClass?: string
}

export function MathInput({
  initial,
  className,
  onSubmit,
  commitOnBlur,
  onEscape,
  value,
  fieldClass,
}: Props) {
  const host = useRef<HTMLDivElement>(null)
  const field = useRef<MathfieldElement | null>(null)
  const last = useRef(initial)

  useEffect(() => {
    configure()
    const node = host.current
    if (!node) return

    const mf = new MathfieldElement()
    mf.className = fieldClass ? `mathfield ${fieldClass}` : 'mathfield'
    mf.setAttribute('virtual-keyboard-mode', 'manual')
    mf.setAttribute('aria-label', '数学表达式')
    mf.value = toTex(initial)
    node.appendChild(mf)
    field.current = mf

    const submit = () => {
      const expr = fromTex(mf)
      if (!expr) return false
      last.current = expr
      const accepted = onSubmit(expr)
      if (accepted) mf.value = ''
      return accepted
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        submit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        mf.value = toTex(last.current)
        onEscape?.()
        mf.blur()
      }
    }
    const onBlur = () => {
      if (!commitOnBlur) return
      const expr = fromTex(mf)
      if (!expr || expr === last.current) return
      last.current = expr
      onSubmit(expr)
    }

    mf.addEventListener('keydown', onKey)
    mf.addEventListener('blur', onBlur)
    return () => {
      mf.removeEventListener('keydown', onKey)
      mf.removeEventListener('blur', onBlur)
      mf.remove()
      field.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const mf = field.current
    if (!mf || value === undefined) return
    if (fromTex(mf) === value) return
    last.current = value
    mf.value = toTex(value)
  }, [value])

  return <div ref={host} className={className ?? 'mathfield-host'} />
}
