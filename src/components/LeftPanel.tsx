import { useEffect, useMemo, useRef, useState } from 'react'
import type { GeoObj } from '../model/types'
import { MathInput } from './MathInput'
import type { MathInputApi } from './MathInput'
import { FnPad } from './FnPad'
import { checkExpression } from '../kernel/scene'
import { CURVE_COLORS } from '../model/palette'
import {
  CircleIcon,
  CubeIcon,
  CurveIcon,
  EyeIcon,
  EyeOffIcon,
  ForceIcon,
  LineIcon,
  PointIcon,
  PolygonIcon,
  SettingsIcon,
} from './icons'

interface Props {
  objects: GeoObj[]
  selected: string[]
  width: number
  onSelect: (ids: string[]) => void
  onToggleVisible: (id: string) => void
  onOpenProps: (id: string) => void
  onResize: (width: number) => void
  onDelete: () => void
  onHide: () => void
  onGroup: () => void
  onSubmitExpr: (expr: string) => boolean
  onDuplicate: (ids: string[]) => void
  onDeleteIds: (ids: string[]) => void
  onColor: (id: string, color: string) => void
  /** 列表为空时给一句说明（三维场景和空草图说的不是一回事） */
  emptyHint?: string
}

function kindIcon(kind: GeoObj['kind']) {
  switch (kind) {
    case 'point':
      return <PointIcon size={16} />
    case 'line':
      return <LineIcon size={16} />
    case 'polygon':
      return <PolygonIcon size={16} />
    case 'circle':
      return <CircleIcon size={16} />
    case 'function':
      return <CurveIcon size={16} />
    case 'solid':
      return <CubeIcon size={16} />
    case 'force':
      return <ForceIcon size={16} />
    default:
      return <PointIcon size={16} />
  }
}

/** 表达式条数上限：和参考图一样，一屏最多 6 条 */
const MAX_FN = 6
const PAD_KEY = 'chordot.fnpad.open'

export function LeftPanel(props: Props) {
  const dragging = useRef(false)
  /** 函数输入框的插入句柄：软键盘按钮直接补在光标处 */
  const apiRef = useRef<MathInputApi | null>(null)
  const [exprHint, setExprHint] = useState('')
  const [padOpen, setPadOpen] = useState(() => {
    try {
      return localStorage.getItem(PAD_KEY) === '1'
    } catch {
      return false
    }
  })
  const [menu, setMenu] = useState<{ x: number; y: number; obj: GeoObj } | null>(null)
  const fnCount = props.objects.filter((o) => o.kind === 'function').length

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('pointerdown', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('blur', close)
    }
  }, [menu])

  /** 依赖顺序扁平化：父对象在上，依附对象以 12px 缩进跟随 */
  const rows = useMemo(() => {
    const out: { obj: GeoObj; depth: number; newGroup: boolean }[] = []
    const tops = props.objects.filter((o) => !o.parentId)
    tops.forEach((parent, i) => {
      out.push({ obj: parent, depth: 0, newGroup: i > 0 })
      for (const child of props.objects) {
        if (child.parentId === parent.id) out.push({ obj: child, depth: 1, newGroup: false })
      }
    })
    return out
  }, [props.objects])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    const rect = e.currentTarget.parentElement?.getBoundingClientRect()
    if (!rect) return
    props.onResize(e.clientX - rect.left)
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const handleRowClick = (e: React.MouseEvent, id: string) => {
    if (e.shiftKey) {
      props.onSelect(Array.from(new Set([...props.selected, id])))
    } else if (e.ctrlKey || e.metaKey) {
      props.onSelect(
        props.selected.includes(id) ? props.selected.filter((s) => s !== id) : [...props.selected, id],
      )
    } else {
      props.onSelect([id])
    }
  }

  return (
    <aside className="left" style={{ width: props.width }}>
      <div
        className="left__resizer"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />

      {props.selected.length > 1 && (
        <div className="left__bulk">
          <strong>{props.selected.length} 个对象</strong>
          <span aria-hidden="true">→</span>
          <button onClick={props.onDelete}>删除</button>
          <button onClick={props.onHide}>隐藏</button>
          <button onClick={props.onGroup}>分组</button>
        </div>
      )}

      <div className="left__list">
        {rows.length === 0 && props.emptyHint && (
          <p className="left__empty">{props.emptyHint}</p>
        )}
        {rows.map(({ obj, depth, newGroup }) => (
          <div
            key={obj.id}
            className="left__row"
            data-selected={props.selected.includes(obj.id)}
            data-hidden={!obj.visible}
            data-group-gap={newGroup}
            onClick={(e) => handleRowClick(e, obj.id)}
            onDoubleClick={() => props.onOpenProps(obj.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              // 右键没选中它的话，先把选择切到这一行
              if (!props.selected.includes(obj.id)) props.onSelect([obj.id])
              setMenu({ x: e.clientX, y: e.clientY, obj })
            }}
          >
            <span className="left__indent" style={{ width: 8 + depth * 12 }} />
            <span className="left__icon">{kindIcon(obj.kind)}</span>
            <span className="left__swatch" style={{ background: obj.color }} />
            <span className="left__name">{obj.name}</span>
            <span className="left__actions">
              <button
                className="iconbtn"
                title={obj.visible ? '隐藏' : '显示'}
                data-off={!obj.visible}
                onClick={(e) => {
                  e.stopPropagation()
                  props.onToggleVisible(obj.id)
                }}
              >
                {obj.visible ? <EyeIcon size={15} /> : <EyeOffIcon size={15} />}
              </button>
              <button
                className="iconbtn"
                title="属性"
                onClick={(e) => {
                  e.stopPropagation()
                  props.onOpenProps(obj.id)
                }}
              >
                <SettingsIcon size={15} />
              </button>
            </span>
          </div>
        ))}
      </div>

      {menu && (
        <div
          className="ctxmenu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            className="ctxmenu__item"
            onClick={() => {
              props.onDuplicate(
                props.selected.includes(menu.obj.id) ? props.selected : [menu.obj.id],
              )
              setMenu(null)
            }}
          >
            复制
            <span className="ctxmenu__hint">Ctrl+D</span>
          </button>
          <button
            className="ctxmenu__item"
            onClick={() => {
              props.onDeleteIds(
                props.selected.includes(menu.obj.id) ? props.selected : [menu.obj.id],
              )
              setMenu(null)
            }}
          >
            删除
            <span className="ctxmenu__hint">Del</span>
          </button>
          <button
            className="ctxmenu__item"
            onClick={() => {
              props.onToggleVisible(menu.obj.id)
              setMenu(null)
            }}
          >
            {menu.obj.visible ? '隐藏' : '显示'}
          </button>
          <button
            className="ctxmenu__item"
            onClick={() => {
              props.onOpenProps(menu.obj.id)
              setMenu(null)
            }}
          >
            属性…
          </button>
          {menu.obj.kind === 'function' && (
            <>
              <div className="ctxmenu__sep" />
              <div className="ctxmenu__label">曲线颜色</div>
              <div className="ctxmenu__colors">
                {CURVE_COLORS.map((c) => (
                  <button
                    key={c}
                    className="ctxmenu__swatch"
                    style={{ background: c }}
                    title={c}
                    data-active={menu.obj.color === c}
                    onClick={() => {
                      props.onColor(menu.obj.id, c)
                      setMenu(null)
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="left__footer">
        <FnPad
          api={apiRef}
          count={fnCount}
          max={MAX_FN}
          error={exprHint}
          open={padOpen}
          onToggle={() => {
            const next = !padOpen
            setPadOpen(next)
            try {
              localStorage.setItem(PAD_KEY, next ? '1' : '0')
            } catch {
              /* 隐私模式忽略 */
            }
          }}
          field={
            <MathInput
              initial=""
              className="left__input-host"
              fieldClass="left__input"
              onChange={(expr) => setExprHint(checkExpression(expr) ?? '')}
              onReady={(api) => {
                apiRef.current = api
              }}
              onSubmit={(expr) => {
                if (fnCount >= MAX_FN) return false
                const ok = props.onSubmitExpr(expr)
                if (ok) setExprHint('')
                return ok
              }}
            />
          }
        />
      </div>
    </aside>
  )
}
