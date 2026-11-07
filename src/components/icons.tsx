import type { ReactNode, SVGProps } from 'react'

/**
 * 线条图标集 —— design.md §8.4
 * 16px 基准，1.5px 描边，单色 currentColor，24 视口。
 * 为避免引入体积大且版本漂移的图标包，这里内联绘制。
 */
type Props = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number }

function Icon({ size = 16, children, ...rest }: Props & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const UndoIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Icon>
)

export const RedoIcon = (p: Props) => (
  <Icon {...p}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </Icon>
)

export const PointerIcon = (p: Props) => (
  <Icon {...p}>
    <path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3Z" />
  </Icon>
)

export const PointIcon = (p: Props) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="2.4" />
    <path d="M12 3.5v2.6M12 17.9v2.6M3.5 12h2.6M17.9 12h2.6" />
  </Icon>
)

export const LineIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M5 19 19 5" />
    <circle cx="5" cy="19" r="1.6" />
    <circle cx="19" cy="5" r="1.6" />
  </Icon>
)

export const CircleIcon = (p: Props) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
  </Icon>
)

export const PolygonIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M12 3.6 20.2 9.5 17.1 19.2H6.9L3.8 9.5Z" />
  </Icon>
)

export const CurveIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M3 17.5c3.4 0 4.6-11 9-11s5.6 11 9 11" />
  </Icon>
)

export const ForceIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M7 17 17 7" />
    <path d="M8 7h9v9" />
  </Icon>
)

export const ConstraintIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M9.5 16.5H7a4.5 4.5 0 0 1 0-9h2.5" />
    <path d="M14.5 7.5H17a4.5 4.5 0 0 1 0 9h-2.5" />
    <path d="M8.5 12h7" />
  </Icon>
)

export const DecomposeIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M5 19h13" />
    <path d="M5 19V6" />
    <path d="m5 19 9-9" />
    <path d="M11 10h3v3" />
  </Icon>
)

export const FitIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9" />
    <path d="M20 9V5.5A1.5 1.5 0 0 0 18.5 4H15" />
    <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20H9" />
    <path d="M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15" />
  </Icon>
)

export const GridIcon = (p: Props) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="1" />
    <path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17" />
  </Icon>
)

export const RulerIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M15.4 3.6 20.4 8.6 8.6 20.4 3.6 15.4Z" />
    <path d="m7 12.4 2 2M10.2 9.2l2 2M13.4 6l2 2" />
  </Icon>
)

export const ExportIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M12 3.6v10.8" />
    <path d="m7.6 10 4.4 4.4 4.4-4.4" />
    <path d="M4.5 20.4h15" />
  </Icon>
)

export const MoreIcon = (p: Props) => (
  <Icon {...p}>
    <circle cx="5.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
  </Icon>
)

export const EyeIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M2.6 12S6.1 5.6 12 5.6 21.4 12 21.4 12 17.9 18.4 12 18.4 2.6 12 2.6 12Z" />
    <circle cx="12" cy="12" r="2.9" />
  </Icon>
)

export const EyeOffIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M2.6 12S6.1 5.6 12 5.6c1.4 0 2.6.3 3.7.8" />
    <path d="M21.4 12S17.9 18.4 12 18.4c-1.4 0-2.6-.3-3.7-.8" />
    <path d="m4 4 16 16" />
  </Icon>
)

/** 属性面板入口（滑杆图标，比齿轮在 16px 下更易辨识） */
export const SettingsIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M4 7.5h7M17 7.5h3M4 16.5h3M13 16.5h7" />
    <circle cx="13.5" cy="7.5" r="2.2" />
    <circle cx="9.5" cy="16.5" r="2.2" />
  </Icon>
)

export const CloseIcon = (p: Props) => (
  <Icon {...p}>
    <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />
  </Icon>
)

/** 完成 / 退出当前模式 */
export const CheckIcon = (p: Props) => (
  <Icon {...p}>
    <path d="m4.5 12.5 5 5L19.5 6.5" />
  </Icon>
)

export const ChevronRightIcon = (p: Props) => (
  <Icon {...p}>
    <path d="m9.5 6 6 6-6 6" />
  </Icon>
)

export const GripIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M20 8 8 20M20 14l-6 6" />
  </Icon>
)

export function CubeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 3 4.5 7.2v9.6L12 21l7.5-4.2V7.2Z" />
      <path d="M4.5 7.2 12 11.4l7.5-4.2" />
      <path d="M12 11.4V21" />
    </svg>
  )
}

export function KeyboardIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 9.5h.01M9.5 9.5h.01M13 9.5h.01M16.5 9.5h.01M6 12.5h.01M9.5 12.5h.01M13 12.5h.01M16.5 12.5h.01M8 15.5h8" />
    </svg>
  )
}

export function ShapesIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <circle cx="17.5" cy="6.5" r="3.5" />
      <path d="M6.5 14 10 21H3Z" />
      <path d="M14 15h7v6h-7z" />
    </svg>
  )
}

export function PenIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 20l1.2-4.2L16.4 4.6a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L8.2 18.8Z" />
      <path d="M14.6 6.4 17.6 9.4" />
    </svg>
  )
}

export function EraserIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M8 20h11" />
      <path d="M4.5 15.5 11 9l6 6-4.5 4.5H7Z" />
      <path d="M9 7 15 13" />
    </svg>
  )
}

export function PlayIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M8 5.5v13l11-6.5Z" />
    </svg>
  )
}

export function PauseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <rect x="7" y="5.5" width="3.5" height="13" rx="1" />
      <rect x="13.5" y="5.5" width="3.5" height="13" rx="1" />
    </svg>
  )
}

export function BookIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15.5H6.5A2.5 2.5 0 0 0 4 21Z" />
      <path d="M4 18.5V5.5" />
      <path d="M8 7h7M8 10.5h5" />
    </svg>
  )
}

export function ResetIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 4v6h6" />
      <path d="M4.5 13a8 8 0 1 0 2.2-7.1L4 10" />
    </svg>
  )
}

export function PencilIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M16.5 3.5 20.5 7.5 8 20H4v-4Z" />
      <path d="m14 6 4 4" />
    </svg>
  )
}

export function PaletteIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2 0-1.4-1-1.6-1-2.6 0-.9.7-1.4 1.6-1.4H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8Z" />
      <circle cx="7.5" cy="10.5" r="1" fill="currentColor" />
      <circle cx="11" cy="7.5" r="1" fill="currentColor" />
      <circle cx="15.5" cy="8.5" r="1" fill="currentColor" />
    </svg>
  )
}

export function ZoomInIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21M7.5 10.5h6M10.5 7.5v6" />
    </svg>
  )
}

export function ZoomOutIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21M7.5 10.5h6" />
    </svg>
  )
}

export function LensIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M16 16 21 21M8.5 11h5M11 8.5v5" />
    </svg>
  )
}

export function SpotlightIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="13" r="4.5" />
      <path d="M12 3v2M4.9 5.9l1.4 1.4M19.1 5.9l-1.4 1.4M3 13h2M19 13h2M6 21h12" />
    </svg>
  )
}

export function HandIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 11V6.5a1.5 1.5 0 0 1 3 0V11M11 10V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V13c0 4-2.2 7-6 7-2.2 0-3.6-1-4.8-2.8L4 13.5a1.5 1.5 0 0 1 2.4-1.8L8 14" />
    </svg>
  )
}

export function FullscreenIcon({ size = 18, exit = false }: { size?: number; exit?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {exit ? (
        <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      ) : (
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      )}
    </svg>
  )
}

export function WindowIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="13" height="11" rx="1.5" />
      <path d="M8 19h11a2 2 0 0 0 2-2V8" />
    </svg>
  )
}

export function TextSizeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6h8M8 6v13M5.5 19h5" />
      <path d="M14 11h6M17 11v8M15 19h4" />
    </svg>
  )
}

export function ExpandIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      <path d="M9 9 4 4M15 9l5-5M9 15l-5 5M15 15l5 5" opacity=".35" />
    </svg>
  )
}
