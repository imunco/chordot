import type { SolidMaterial } from '../kernel/types'

/**
 * 立体表面的贴图。
 *
 * 两层：
 * 1. 位图贴图（wood / paper / metal / grid）：运行时用 512×512 的 canvas 画出来，
 *    再 toDataURL 成 PNG，作为 <image> 放进 <pattern>，由 patternTransform 按 UV 贴到面上。
 *    这样每个面是真实像素纹理（有颗粒、有深浅），不是几条矢量线。
 * 2. 程序化矢量（dots 以及 canvas 不可用时的兜底）：仍是原来的 SVG 图案，
 *    用 <pattern> 的 scale(unit) 铺在单位方格里。
 *
 * 明暗不在这里做：渲染层会在纹理上叠一层 multiply 的灰阶，立体感不丢。
 */

/** 位图边长（px）；2 的幂，纹理采样和缩放都干净 */
const TEX_SIZE = 512

/** 已经生成过的位图（按材质缓存，dataURL 很大，不能每帧重画） */
const bitmapCache = new Map<SolidMaterial, string>()
/** 生成失败的材质：记住失败，别每次渲染都重试 */
const bitmapFailed = new Set<SolidMaterial>()

/** 简单可复现的伪随机：同一材质每次生成的花纹一致，截图和课件里不会忽深忽浅 */
function makeRandom(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function makeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = TEX_SIZE
  canvas.height = TEX_SIZE
  const ctx = canvas.getContext('2d')
  return ctx ? { canvas, ctx } : null
}

/** 木纹：暖色底 + 起伏的年轮曲线 + 两个节疤 + 细颗粒 */
function drawWood(ctx: CanvasRenderingContext2D) {
  const rand = makeRandom(0x51a3)
  const base = ctx.createLinearGradient(0, 0, TEX_SIZE, TEX_SIZE * 0.4)
  base.addColorStop(0, '#ead9bc')
  base.addColorStop(0.35, '#e2cda9')
  base.addColorStop(0.68, '#ecdec8')
  base.addColorStop(1, '#dfc9a2')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE)

  // 年轮：34 条沿 x 方向缓慢起伏的曲线，粗细和透明度都随机
  for (let i = 0; i < 34; i++) {
    const y0 = (i / 33) * TEX_SIZE + (rand() - 0.5) * 8
    const phase = rand() * Math.PI * 2
    const amp = 4 + rand() * 9
    const freq = 0.005 + rand() * 0.006
    ctx.beginPath()
    for (let x = 0; x <= TEX_SIZE; x += 8) {
      const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.7 + phase) * amp * 0.3
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = `rgba(148,113,68,${(0.045 + rand() * 0.13).toFixed(3)})`
    ctx.lineWidth = 0.7 + rand() * 2.3
    ctx.stroke()
  }

  // 节疤：几圈同心椭圆，纹理在附近收拢
  for (const [cx, cy, rx, ry] of [
    [0.68, 0.33, 34, 19],
    [0.24, 0.73, 21, 12],
  ] as const) {
    const x = cx * TEX_SIZE
    const y = cy * TEX_SIZE
    for (let k = 0; k < 4; k++) {
      ctx.beginPath()
      ctx.ellipse(x, y, rx - k * 6, ry - k * 3, 0.22, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(132,96,55,${0.16 - k * 0.03})`
      ctx.lineWidth = 1.6
      ctx.stroke()
    }
  }

  // 细颗粒：让平涂的渐变有「木头表面」的粗糙感
  for (let i = 0; i < 2600; i++) {
    const a = 0.015 + rand() * 0.05
    ctx.fillStyle = `rgba(112,82,46,${a.toFixed(3)})`
    ctx.fillRect(rand() * TEX_SIZE, rand() * TEX_SIZE, 1, 1 + rand() * 2)
  }
}

/** 纸纹：米白底 + 纤维 + 四条很淡的横线（沿用原来「纸面」的观感） */
function drawPaper(ctx: CanvasRenderingContext2D) {
  const rand = makeRandom(0x2f77)
  const base = ctx.createLinearGradient(0, 0, 0, TEX_SIZE)
  base.addColorStop(0, '#faf8f2')
  base.addColorStop(0.55, '#f6f2e9')
  base.addColorStop(1, '#f9f6ef')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE)

  // 纸纤维：短、淡、方向随机
  for (let i = 0; i < 1400; i++) {
    const x = rand() * TEX_SIZE
    const y = rand() * TEX_SIZE
    const len = 4 + rand() * 18
    const a = 0.02 + rand() * 0.045
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + len, y + (rand() - 0.5) * 2)
    ctx.strokeStyle = `rgba(196,186,166,${a.toFixed(3)})`
    ctx.lineWidth = 0.6 + rand() * 0.6
    ctx.stroke()
  }

  // 很淡的横线：保留原来纸面材质的手写本质感
  for (const ry of [0.12, 0.38, 0.63, 0.88]) {
    const y = ry * TEX_SIZE
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(TEX_SIZE, y)
    ctx.strokeStyle = 'rgba(222,214,197,0.55)'
    ctx.lineWidth = 2.4
    ctx.stroke()
  }

  // 几个淡墨点，和纸面材质原来的小圆点呼应
  for (const [cx, cy, r] of [
    [0.18, 0.62, 8],
    [0.72, 0.24, 6],
    [0.44, 0.8, 4.5],
  ] as const) {
    ctx.beginPath()
    ctx.arc(cx * TEX_SIZE, cy * TEX_SIZE, r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(214,205,186,0.55)'
    ctx.fill()
  }
}

/** 金属拉丝：斜向银灰渐变 + 上千条长短不一的高光 / 暗丝 */
function drawMetal(ctx: CanvasRenderingContext2D) {
  const rand = makeRandom(0x7c1d)
  const base = ctx.createLinearGradient(0, 0, TEX_SIZE, TEX_SIZE)
  base.addColorStop(0, '#f4f3f0')
  base.addColorStop(0.22, '#dcd9d3')
  base.addColorStop(0.48, '#f1efeb')
  base.addColorStop(0.72, '#d8d4cd')
  base.addColorStop(1, '#eceae6')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE)

  // 拉丝：水平方向的细线，长度和位置都随机，密度高才有金属反光
  for (let i = 0; i < 3200; i++) {
    const y = rand() * TEX_SIZE
    const x0 = rand() * TEX_SIZE
    const len = 30 + rand() * TEX_SIZE
    const light = rand() > 0.45
    const a = 0.025 + rand() * 0.09
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(Math.min(TEX_SIZE, x0 + len), y + (rand() - 0.5) * 1.2)
    ctx.strokeStyle = light
      ? `rgba(255,255,252,${a.toFixed(3)})`
      : `rgba(108,104,98,${a.toFixed(3)})`
    ctx.lineWidth = 0.5 + rand() * 0.9
    ctx.stroke()
  }

  // 几条更宽的反光带，让面转起来时金属有「亮条」流动的感觉
  for (let i = 0; i < 5; i++) {
    const y = rand() * TEX_SIZE
    const grad = ctx.createLinearGradient(0, y - 10, 0, y + 10)
    grad.addColorStop(0, 'rgba(255,255,255,0)')
    grad.addColorStop(0.5, 'rgba(255,255,255,0.22)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, y - 10, TEX_SIZE, 20)
  }
}

/** 网格：坐标纸的细格 + 粗格，格线不落在边缘，铺开接缝不叠线 */
function drawGrid(ctx: CanvasRenderingContext2D) {
  const rand = makeRandom(0x19e5)
  ctx.fillStyle = '#f6f4ee'
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE)

  // 细格：10 等分；0 和 1 两条边不画，交给相邻面的边
  for (let i = 1; i < 10; i++) {
    if (i === 5) continue
    const x = (i / 10) * TEX_SIZE
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, TEX_SIZE)
    ctx.moveTo(0, x)
    ctx.lineTo(TEX_SIZE, x)
    ctx.strokeStyle = 'rgba(196,190,178,0.7)'
    ctx.lineWidth = 1.4
    ctx.stroke()
  }
  // 粗格：对半分
  ctx.beginPath()
  ctx.moveTo(TEX_SIZE / 2, 0)
  ctx.lineTo(TEX_SIZE / 2, TEX_SIZE)
  ctx.moveTo(0, TEX_SIZE / 2)
  ctx.lineTo(TEX_SIZE, TEX_SIZE / 2)
  ctx.strokeStyle = 'rgba(150,143,130,0.8)'
  ctx.lineWidth = 3
  ctx.stroke()

  // 纸面颗粒
  for (let i = 0; i < 1200; i++) {
    ctx.fillStyle = `rgba(150,142,126,${(0.015 + rand() * 0.03).toFixed(3)})`
    ctx.fillRect(rand() * TEX_SIZE, rand() * TEX_SIZE, 1, 1)
  }
}

/** 位图材质；dots / none / image 没有内置位图（image 用 shape.texture） */
export function bitmapMaterial(kind: SolidMaterial): boolean {
  return kind === 'wood' || kind === 'paper' || kind === 'metal' || kind === 'grid'
}

/** 取（或生成）某种材质的 512×512 PNG dataURL；生成不了返回 null，渲染层退回矢量图案 */
export function generatedTexture(kind: SolidMaterial): string | null {
  if (!bitmapMaterial(kind)) return null
  const hit = bitmapCache.get(kind)
  if (hit) return hit
  if (bitmapFailed.has(kind)) return null
  const made = makeCanvas()
  if (!made) return null
  try {
    const { canvas, ctx } = made
    if (kind === 'wood') drawWood(ctx)
    else if (kind === 'paper') drawPaper(ctx)
    else if (kind === 'metal') drawMetal(ctx)
    else drawGrid(ctx)
    const url = canvas.toDataURL('image/png')
    bitmapCache.set(kind, url)
    return url
  } catch {
    bitmapFailed.add(kind)
    return null
  }
}

/** 图片材质的兜底：用户还没选图时给一张淡雅的纸纹，面不至于变成空白 */
export function textureFallback(): string | null {
  return generatedTexture('paper')
}

/** 单位方格里的矢量图案；canvas 不可用或 dots 时使用（颜色一律低饱和，和纸面风格一致） */
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

    case 'image':
      return (
        <>
          <rect width="1" height="1" fill="#f3f0ea" />
          <path
            d="M0.08 0.72 0.34 0.44 0.5 0.62 0.68 0.36 0.92 0.72Z"
            fill="#ddd6c8"
            stroke="#c9c1b1"
            strokeWidth="0.012"
          />
          <circle cx="0.28" cy="0.3" r="0.055" fill="#e4ddcf" stroke="#c9c1b1" strokeWidth="0.01" />
        </>
      )

    default:
      return <rect width="1" height="1" fill="#f2f0ec" />
  }
}

/**
 * 一个面的纹理。
 * unit = 1 时按面 UV 铺（patternTransform 给矩阵）；
 * unit = 2×半径时给球用（整张图铺满球的屏幕包围盒，避免上千个 pattern）。
 * x / y 是 pattern 的贴图原点（userSpaceOnUse），球用它在球心对齐。
 */
export function MaterialPattern({
  id,
  kind,
  transform,
  unit = 1,
  src,
  x,
  y,
}: {
  id: string
  kind: SolidMaterial
  transform?: string
  unit?: number
  /** 图片材质的数据源（shape.texture） */
  src?: string
  x?: number
  y?: number
}) {
  const bitmap = kind === 'image' ? src ?? textureFallback() : generatedTexture(kind)
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      width={unit}
      height={unit}
      x={x}
      y={y}
      patternTransform={transform}
    >
      {bitmap ? (
        // preserveAspectRatio="slice"：用户传进来的照片不是正方形也能铺满整个面，不露白边
        <image
          href={bitmap}
          x={0}
          y={0}
          width={unit}
          height={unit}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <g transform={`scale(${unit})`}>
          <TextureBody kind={kind} />
        </g>
      )}
    </pattern>
  )
}
