import { useEffect, useRef, useState } from 'react'
import type { Mode } from '../model/types'
import type { ToolId } from '../state'
import {
  CircleIcon,
  ConstraintIcon,
  CurveIcon,
  DecomposeIcon,
  ExportIcon,
  FitIcon,
  ForceIcon,
  GridIcon,
  KeyboardIcon,
  LineIcon,
  MoreIcon,
  PointIcon,
  PolygonIcon,
  PointerIcon,
  RedoIcon,
  RulerIcon,
  PenIcon,
  EraserIcon,
  ShapesIcon,
  UndoIcon,
} from './icons'

interface Props {
  mode: Mode
  tool: ToolId
  grid: boolean
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onTool: (tool: ToolId) => void
  onToggleGrid: () => void
  pad: boolean
  onTogglePad: () => void
  shapes: boolean
  onToggleShapes: () => void
  onFit: () => void
  onExport: (format: 'svg' | 'png') => void
  onCommand: (
    cmd:
      | 'open'
      | 'save'
      | 'saveAs'
      | 'prefs'
      | 'shortcuts'
      | 'samples'
      | 'slide'
      | 'triangle'
      | 'conflict'
      | 'solid'
      | 'gallery'
      | 'pendulum'
      | 'incline3d'
      | 'clear'
      | 'palette',
  ) => void
}

const BASE_TOOLS: { id: ToolId; label: string; Icon: typeof PointIcon }[] = [
  { id: 'point', label: '点', Icon: PointIcon },
  { id: 'line', label: '线段', Icon: LineIcon },
  { id: 'circle', label: '圆', Icon: CircleIcon },
  { id: 'polygon', label: '多边形', Icon: PolygonIcon },
  { id: 'pen', label: '画笔批注 B', Icon: PenIcon },
  { id: 'eraser', label: '擦除批注 E', Icon: EraserIcon },
]

const MATH_TAIL: { id: ToolId; label: string; Icon: typeof PointIcon }[] = [
  { id: 'curve', label: '函数曲线', Icon: CurveIcon },
  { id: 'force', label: '添加力（点画布放置）', Icon: ForceIcon },
  { id: 'constraint', label: '添加几何约束', Icon: ConstraintIcon },
]

const PHYSICS_TAIL: { id: ToolId; label: string; Icon: typeof PointIcon }[] = [
  { id: 'decompose', label: '显示正交分解 D', Icon: DecomposeIcon },
]

export function Toolbar(props: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen && !exportOpen) return
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false)
        setExportOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen, exportOpen])

  const tools = [...BASE_TOOLS, ...(props.mode === 'math' ? MATH_TAIL : PHYSICS_TAIL)]

  const runCommand = (
    cmd:
      | 'open'
      | 'save'
      | 'saveAs'
      | 'prefs'
      | 'shortcuts'
      | 'samples'
      | 'slide'
      | 'triangle'
      | 'conflict'
      | 'solid'
      | 'gallery'
      | 'pendulum'
      | 'incline3d'
      | 'clear'
      | 'palette',
  ) => {
    setMenuOpen(false)
    setExportOpen(false)
    props.onCommand(cmd)
  }

  return (
    <div className="toolbar">
      {/* 区域 A：撤销 / 重做 / 选择 */}
      <div className="toolbar__group">
        <button className="tbtn" title="撤销 Ctrl+Z" disabled={!props.canUndo} onClick={props.onUndo}>
          <UndoIcon />
        </button>
        <button className="tbtn" title="重做 Ctrl+Y" disabled={!props.canRedo} onClick={props.onRedo}>
          <RedoIcon />
        </button>
        <button
          className="tbtn"
          title="选择工具 Esc"
          data-active={props.tool === 'select'}
          onClick={() => props.onTool('select')}
        >
          <PointerIcon />
        </button>
      </div>

      <div className="toolbar__divider" />

      {/* 区域 B：构造工具 */}
      <div className="toolbar__group">
        {tools.map(({ id, label, Icon }) => (
          <button
            key={id}
            className="tbtn"
            title={label}
            data-active={props.tool === id}
            onClick={() => props.onTool(id)}
          >
            <Icon />
          </button>
        ))}
      </div>

      <div className="toolbar__spacer" />

      {/* 区域 C：视图控制 */}
      <div className="toolbar__group">
        <button className="tbtn" title="缩放适配 Ctrl+0" onClick={props.onFit}>
          <FitIcon />
        </button>
        <button
          className="tbtn"
          title="网格 G"
          data-active={props.grid}
          onClick={props.onToggleGrid}
        >
          <GridIcon />
        </button>
        <button
          className="tbtn"
          title="图形库（拖到画布）"
          data-active={props.shapes}
          onClick={props.onToggleShapes}
        >
          <ShapesIcon />
        </button>
        <button className="tbtn" title="标尺调整" onClick={() => props.onCommand('prefs')}>
          <RulerIcon />
        </button>
        <button
          className="tbtn"
          title="符号键盘 Ctrl+/"
          data-active={props.pad}
          onClick={props.onTogglePad}
        >
          <KeyboardIcon />
        </button>
        <button
          className="tbtn"
          title="导出"
          data-active={exportOpen}
          onClick={() => {
            setExportOpen((v) => !v)
            setMenuOpen(false)
          }}
        >
          <ExportIcon />
        </button>
      </div>

      <div className="toolbar__divider" />

      {/* 区域 D：低频菜单 */}
      <div className="toolbar__group toolbar__menu-anchor" ref={menuRef}>
        <button
          className="tbtn"
          title="更多"
          data-active={menuOpen}
          onClick={() => {
            setMenuOpen((v) => !v)
            setExportOpen(false)
          }}
        >
          <MoreIcon />
        </button>

        {exportOpen && (
          <div className="menu" role="menu">
            <button
              className="menu__item"
              onClick={() => {
                setExportOpen(false)
                props.onExport('svg')
              }}
            >
              导出 SVG
            </button>
            <button
              className="menu__item"
              onClick={() => {
                setExportOpen(false)
                props.onExport('png')
              }}
            >
              导出 PNG
            </button>
          </div>
        )}

        {menuOpen && (
          <div className="menu" role="menu">
            <button className="menu__item" onClick={() => runCommand('gallery')}>
              模板库…
            </button>
            <button className="menu__item" onClick={() => runCommand('open')}>
              打开…
              <span className="menu__kbd">Ctrl+O</span>
            </button>
            <button className="menu__item" onClick={() => runCommand('save')}>
              保存
              <span className="menu__kbd">Ctrl+S</span>
            </button>
            <button className="menu__item" onClick={() => runCommand('saveAs')}>
              另存为…
              <span className="menu__kbd">Ctrl+Shift+S</span>
            </button>
            <div className="menu__sep" />
            <button className="menu__item" onClick={() => runCommand('palette')}>
              命令面板
              <span className="menu__kbd">Ctrl+K</span>
            </button>
            <div className="menu__sep" />
            <button className="menu__item" onClick={() => runCommand('samples')}>
              示例：斜面受力
            </button>
            <button className="menu__item" onClick={() => runCommand('slide')}>
              示例：斜面下滑
            </button>
            <button className="menu__item" onClick={() => runCommand('triangle')}>
              示例：约束三角形
            </button>
            <button className="menu__item" onClick={() => runCommand('conflict')}>
              示例：约束冲突
            </button>
            <button className="menu__item" onClick={() => runCommand('solid')}>
              示例：正方体（三维）
            </button>
            <button className="menu__item" onClick={() => runCommand('pendulum')}>
              示例：单摆（动力学）
            </button>
            <button className="menu__item" onClick={() => runCommand('incline3d')}>
              示例：三维斜面受力
            </button>
            <button className="menu__item" onClick={() => runCommand('clear')}>
              清空画布
            </button>
            <div className="menu__sep" />
            <button className="menu__item" onClick={() => runCommand('prefs')}>
              首选项
            </button>
            <button className="menu__item" onClick={() => runCommand('shortcuts')}>
              快捷键参考
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
