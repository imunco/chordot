import type { SolidMaterial } from '../kernel/types'

/**
 * 立体表面的程序化纹理。
 *
 * 不引入图片资源：图案全部用 SVG 画在 0..1 的单位方格里，
 * 由 <pattern> 的 patternTransform 贴到每个面的 UV 上（见 model/solid.ts 的 uvMatrix）。
 * 明暗不在这里做：渲染层会在纹理上叠一层 multiply 的灰阶，立体感不丢。
 */

/** 单位方格里的图案本体；颜色一律低饱和，和纸面风格一致 */
function TextureBody({ kind }: { kind: SolidMaterial }) {
  switch (kind) {
    case 'paper':
      return (
        <>
          <rect width="1" height="1" fill="#f7f4ed" />
          <path
            d="M0 0.12H1M0 0.38H1M0 0.63H1M0 0.88H1"
            stroke="#ece6d9"
            strokeWidth="0.012"
          />
          <circle cx="0.18" cy="0.62" r="0.018" fill="#e3dccd" />
          <circle cx="0.72" cy="0.24" r="0.014" fill="#e3dccd" />
          <circle cx="0.44" cy="0.8" r="0.011" fill="#e3dccd" />
        </>
      )

    case 'wood':
      return (
        <>
          <rect width="1" height="1" fill="#e8ddc8" />
          <path
            d="M0 0.18C0.25 0.1 0.55 0.26 1 0.16M0 0.42C0.3 0.36 0.6 0.5 1 0.4M0 0.66C0.22 0.6 0.5 0.74 1 0.64M0 0.88C0.35 0.8 0.62 0.92 1 0.84"
            fill="none"
            stroke="#d3c09d"
            strokeWidth="0.016"
          />
          <path
            d="M0 0.3C0.3 0.26 0.6 0.34 1 0.28M0 0.54C0.3 0.5 0.62 0.58 1 0.52M0 0.78C0.3 0.74 0.6 0.82 1 0.76"
            fill="none"
            stroke="#dccbad"
            strokeWidth="0.008"
          />
          <ellipse
            cx="0.66"
            cy="0.34"
            rx="0.07"
            ry="0.04"
            fill="none"
            stroke="#d3c09d"
            strokeWidth="0.012"
          />
        </>
      )

    case 'grid':
      return (
        <>
          <rect width="1" height="1" fill="#f4f2ec" />
          <path
            d="M0 0.2H1M0 0.4H1M0 0.6H1M0 0.8H1M0.2 0V1M0.4 0V1M0.6 0V1M0.8 0V1"
            stroke="#cdc7bb"
            strokeWidth="0.009"
          />
        </>
      )

    case 'dots':
      return (
        <>
          <rect width="1" height="1" fill="#f4f2ed" />
          {[0.125, 0.375, 0.625, 0.875].map((x) =>
            [0.125, 0.375, 0.625, 0.875].map((y) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="0.03" fill="#c7c0b5" />
            )),
          )}
        </>
      )

    case 'metal':
      return (
        <>
          <rect width="1" height="1" fill="#efedea" />
          <path d="M0 0.1 1 0.02" stroke="#dad6cf" strokeWidth="0.02" />
          <path d="M0 0.3 1 0.22" stroke="#e7e4de" strokeWidth="0.05" />
          <path d="M0 0.55 1 0.47" stroke="#d5d1c9" strokeWidth="0.012" />
          <path d="M0 0.78 1 0.7" stroke="#e2dfd8" strokeWidth="0.04" />
        </>
      )

    default:
      return <rect width="1" height="1" fill="#f2f0ec" />
  }
}

/**
 * 一个面的纹理：unit = 1 时按面 UV 铺（patternTransform 给矩阵）；
 * unit = 42 时按屏幕像素铺（球这种细分曲面用，避免上千个 pattern）。
 */
export function MaterialPattern({
  id,
  kind,
  transform,
  unit = 1,
}: {
  id: string
  kind: SolidMaterial
  transform?: string
  unit?: number
}) {
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      width={unit}
      height={unit}
      patternTransform={transform}
    >
      <g transform={`scale(${unit})`}>
        <TextureBody kind={kind} />
      </g>
    </pattern>
  )
}
