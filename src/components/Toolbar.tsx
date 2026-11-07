import { useEffect, useRef, useState } from 'react'
import type { Mode } from '../model/types'
import type { ToolId } from '../state'
import {
  BookIcon,
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
      | 'mech'
      | 'mech-empty'
      | 'symbols'
      | 'textbook'
      | 'textbook-window'
      | 'clear'
      | 'palette',
  ) => void
}

interface ToolDef {
  id: ToolId
  /** 按钮下方的中文标签：一体机上不靠 hover 提示也能认出来 */
  label: string
  /** title 保留完整说明，同时是验证脚本的选择器 */
  title: string
  Icon: typeof PointIcon
}

const DRAW_TOOLS: ToolDef[] = [
  { id: 'point', label: '点', title: '点', Icon: PointIcon },
  { id: 'line', label: '线段', title: '线段', Icon: LineIcon },
  { id: 'circle', label: '圆', title: '圆', Icon: CircleIcon },
  { id: 'polygon', label: '多边形', title: '多边形', Icon: PolygonIcon },
]

const MATH_TAIL: ToolDef[] = [
  { id: 'curve', label: '函数', title: '函数曲线', Icon: CurveIcon },
  { id: 'force', label: '力', title: '添加力（点画布放置）', Icon: ForceIcon },
  { id: 'constraint', label: '约束', title: '添加几何约束', Icon: ConstraintIcon },
]

const PHYSICS_TAIL: ToolDef[] = [
  { id: 'decompose', label: '分解', title: '显示正交分解 D', Icon: DecomposeIcon },
]

/** 图标 + 文字的主按钮 */
function DockButton({
  label,
  title,
  Icon,
  active,
  disabled,
  onClick,
  iconSize = 20,
}: {
  label?: string
  title: string
  Icon: typeof PointIcon
  active?: boolean
  disabled?: boolean
  onClick: () => void
  iconSize?: number
}) {
  return (
    <button
      className={label ? 'tbtn tbtn--label' : 'tbtn'}
      title={title}
      data-active={active}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={iconSize} />
      {label && <span className="tbtn__label">{label}</span>}
    </button>
  )
}

/**
 * 底部工具坞。
 *
 * 学校电子大屏 / 一体机的操作区在下半屏：教师站在屏幕前，抬手够顶部工具栏很吃力。
 * 所以主工具栏整体放到窗口底部，并给常用工具配中文标签（触屏没有 hover 提示）。
 * 批注单独成组、居中放置，是最常用也最需要「够得着」的一组。
 */
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

  const tools = [...DRAW_TOOLS, ...(props.mode === 'math' ? MATH_TAIL : PHYSICS_TAIL)]

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
      | 'mech'
      | 'mech-empty'
      | 'symbols'
      | 'textbook'
      | 'textbook-window'
      | 'clear'
      | 'palette',
  ) => {
    setMenuOpen(false)
    setExportOpen(false)
    props.onCommand(cmd)
  }

  return (
    <div className="toolbar">
      {/* 左：历史 + 作图工具 */}
      <div className="toolbar__side toolbar__side--left">
        <div className="toolbar__group">
          <DockButton label="撤销" title="撤销 Ctrl+Z" Icon={UndoIcon} disabled={!props.canUndo} onClick={props.onUndo} />
          <DockButton label="重做" title="重做 Ctrl+Y" Icon={RedoIcon} disabled={!props.canRedo} onClick={props.onRedo} />
          <DockButton
            label="选择"
            title="选择工具 Esc"
            Icon={PointerIcon}
            active={props.tool === 'select'}
            onClick={() => props.onTool('select')}
          />
        </div>

        <div className="toolbar__divider" />

        <div className="toolbar__group">
          {tools.map(({ id, label, title, Icon }) => (
            <DockButton
              key={id}
              label={label}
              title={title}
              Icon={Icon}
              active={props.tool === id}
              onClick={() => props.onTool(id)}
            />
          ))}
        </div>
      </div>

      {/* 中：批注。位置固定在屏幕中线附近，左右手都好够 */}
      <div className="toolbar__ink" role="group" aria-label="批注">
        <DockButton
          label="批注"
          title="画笔批注 B"
          Icon={PenIcon}
          active={props.tool === 'pen'}
          onClick={() => props.onTool('pen')}
          iconSize={22}
        />
        <DockButton
          label="橡皮"
          title="擦除批注 E"
          Icon={EraserIcon}
          active={props.tool === 'eraser'}
          onClick={() => props.onTool('eraser')}
          iconSize={22}
        />
      </div>

      {/* 右：视图与低频入口 */}
      <div className="toolbar__side toolbar__side--right">
        <div className="toolbar__group">
          <DockButton title="缩放适配 Ctrl+0" Icon={FitIcon} onClick={props.onFit} />
          <DockButton
            title="网格 G"
            Icon={GridIcon}
            active={props.grid}
            onClick={props.onToggleGrid}
          />
          <DockButton
            title="教材实验室：高中物理教材实验"
            Icon={BookIcon}
            onClick={() => runCommand('textbook')}
          />
          <DockButton
            title="图形库（拖到画布）"
            Icon={ShapesIcon}
            active={props.shapes}
            onClick={props.onToggleShapes}
          />
          <DockButton
            title="符号键盘 Ctrl+/"
            Icon={KeyboardIcon}
            active={props.pad}
            onClick={props.onTogglePad}
          />
          <DockButton
            title="导出"
            Icon={ExportIcon}
            active={exportOpen}
            onClick={() => {
              setExportOpen((v) => !v)
              setMenuOpen(false)
            }}
          />
        </div>

        <div className="toolbar__divider" />

        <div className="toolbar__group toolbar__menu-anchor" ref={menuRef}>
          <DockButton
            title="更多"
            Icon={MoreIcon}
            active={menuOpen}
            onClick={() => {
              setMenuOpen((v) => !v)
              setExportOpen(false)
            }}
          />

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
              <button className="menu__item" onClick={() => runCommand('textbook')}>
                教材实验室…
              </button>
              <button className="menu__item" onClick={() => runCommand('textbook-window')}>
                教材实验室（独立窗口）…
              </button>
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
              <div className="menu__sep" />
              <button className="menu__item" onClick={() => runCommand('mech')}>
                机构装配：弹簧振子（部件 → 连线 → 机构）
              </button>
              <button className="menu__item" onClick={() => runCommand('mech-empty')}>
                机构装配：空白装配台
              </button>
              <button className="menu__item" onClick={() => runCommand('symbols')}>
                符号公式实验室（独立窗口）…
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
    </div>
  )
}
