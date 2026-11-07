import type { LabExperiment, LabModel } from '../lab/types'
import { fmtSci } from '../lab/models'
import { Arrow, Bench, Box, Dial, Flow, Grid, INK, LINE, PAPER, Shadow, SOFT, Tag, Txt, WARN } from './labkit'

interface Props {
  exp: LabExperiment
  m: LabModel
  t: number
}

/**
 * 教材演示台。
 *
 * 每个实验一个场景，共用纸面配色与线宽；几何全部按 760×430 的视口绘制，
 * 由外层按容器宽度等比缩放，因此在任何窗口尺寸下都不会变形。
 */
export function LabStage({ exp, m, t }: Props) {
  return (
    <svg className="lab__svg" viewBox="0 0 760 430" role="img" aria-label={exp.name}>
      <defs>
        <radialGradient id="labGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#e8c87a" stopOpacity="0.85" />
          <stop offset="55%" stopColor="#e8c87a" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#e8c87a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="labBall" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#dfe6e6" />
          <stop offset="100%" stopColor="#9fb0b4" />
        </radialGradient>
        <linearGradient id="labWater" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dce8ea" />
          <stop offset="100%" stopColor="#c3d5d8" />
        </linearGradient>
        <linearGradient id="labGas" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#eef1ef" />
          <stop offset="100%" stopColor="#e3e9e6" />
        </linearGradient>
      </defs>

      <rect width="760" height="430" fill={PAPER} />
      <Grid />
      {renderStage(exp, m, t)}
    </svg>
  )
}

function renderStage(exp: LabExperiment, m: LabModel, t: number) {
  switch (exp.stage) {
    case 'track':
      return <TrackStage m={m} t={t} />
    case 'cart':
      return <CartStage m={m} />
    case 'spring':
      return <SpringStage m={m} />
    case 'vectors':
      return <VectorsStage m={m} t={t} />
    case 'reaction':
      return <ReactionStage m={m} t={t} />
    case 'projectile':
      return <ProjectileStage m={m} />
    case 'circular':
      return <CircularStage m={m} />
    case 'fall':
      return <FallStage m={m} />
    case 'rc':
      return <RCStage m={m} t={t} />
    case 'resistivity':
      return <ResistivityStage m={m} t={t} />
    case 'multimeter':
      return <MultimeterStage m={m} />
    case 'emf':
      return <EMFStage m={m} />
    case 'collision':
      return <CollisionStage m={m} />
    case 'pendulum':
      return <PendulumStage m={m} t={t} />
    case 'shm':
      return <SHMStage m={m} t={t} />
    case 'refraction':
      return <RefractionStage m={m} t={t} />
    case 'interference':
      return <InterferenceStage m={m} t={t} />
    case 'induction':
      return <InductionStage m={m} />
    case 'transformer':
      return <TransformerStage m={m} t={t} />
    case 'sensor':
      return <SensorStage m={m} t={t} />
    case 'oilfilm':
      return <OilFilmStage m={m} t={t} />
    case 'gas':
      return <GasStage m={m} t={t} />
    default:
      return null
  }
}

/* ───────────────────────── 力学：纸带 / 小车 ───────────────────────── */

function TrackStage({ m, t }: { m: LabModel; t: number }) {
  const { pos, v, v0, a, tt } = m.g
  const T = 0.02
  // 计数点模式：每 dotEvery 个计时点只标 1 个，相邻计数点之间 dotEvery-1 个点不画
  const dotEvery = Math.max(1, Math.round(m.g.dotEvery ?? 1))
  const countT = m.g.countT ?? T
  const px = 160 + Math.min(pos, 5.3) * 92
  const actual = Math.min(Math.floor((tt ?? 0) / T) + 1, 400)
  const dotPts: number[] = []
  for (let i = 0; i < actual; i += dotEvery) {
    const q = i * T
    dotPts.push(160 + (v0 * q + 0.5 * a * q * q) * 92)
  }
  const last = dotPts[dotPts.length - 1] ?? 120
  // 教材用 xₙ₊₁ − xₙ₋₁ 求中间时刻速度，括号要跨两个打点间隔（2T）
  const prev2 = dotPts[dotPts.length - 3] ?? dotPts[0] ?? 160
  const dotR = dotEvery > 1 ? 2.5 : 1.9

  return (
    <g>
      <Txt x={380} y={34} text="打点计时器 + 纸带" size={13} color={INK} bold />

      {/* 计时器 */}
      <Box x={40} y={236} w={66} h={84} />
      <circle cx={73} cy={266} r={17} fill="#f2f0ec" stroke={LINE} />
      <g transform={`rotate(${(t * 720) % 360} 73 266)`} opacity={0.65}>
        <line x1={73} y1={266} x2={73} y2={252} stroke={INK} strokeWidth={2} strokeLinecap="round" />
      </g>
      <Txt x={73} y={302} text="50 Hz" size={9} color={SOFT} />
      <Txt x={73} y={314} text="0.02 s" size={9} color={SOFT} />

      {/* 导轨与纸带 */}
      <line x1={110} y1={300} x2={700} y2={300} stroke={LINE} strokeWidth={1.2} />
      <rect x={110} y={326} width={590} height={26} rx={3} fill="#ffffff" stroke={LINE} strokeWidth={0.8} />
      <Txt x={98} y={344} text="纸带" size={10} color={SOFT} anchor="end" />

      {dotPts.map((x, i) => (
        <circle
          key={i}
          cx={x}
          cy={339}
          r={dotR}
          fill={INK}
          opacity={dotEvery > 1 ? 0.82 : i > dotPts.length - 8 ? 0.9 : 0.55}
        />
      ))}

      {/* 相邻两点间距 Δx */}
      {dotPts.length >= 3 && (
        <g>
          <line x1={prev2} y1={356} x2={prev2} y2={362} stroke={SOFT} strokeWidth={0.8} />
          <line x1={last} y1={356} x2={last} y2={362} stroke={SOFT} strokeWidth={0.8} />
          <line x1={prev2} y1={359} x2={last} y2={359} stroke={SOFT} strokeWidth={0.8} />
          <Txt
            x={(prev2 + last) / 2}
            y={373}
            text={`xₙ₊₁ − xₙ₋₁（2T = ${String(Number((2 * countT).toFixed(3)))} s）`}
            size={9}
            color={SOFT}
            mono
          />
        </g>
      )}

      {/* 刻度尺 */}
      {Array.from({ length: 12 }, (_, i) => {
        const x = 160 + i * 46
        return (
          <g key={i}>
            <line x1={x} y1={306} x2={x} y2={312} stroke={SOFT} strokeWidth={0.7} opacity={0.7} />
            {i % 2 === 0 && <Txt x={x} y={322} text={`${(i * 0.5).toFixed(1)}`} size={8} color={SOFT} mono />}
          </g>
        )
      })}

      {/* 小车 */}
      {[3, 2, 1].map((k) => (
        <rect
          key={k}
          x={px - 34 - v * k * 8}
          y={268}
          width={68}
          height={32}
          rx={5}
          fill="#dfe6e6"
          opacity={0.16}
        />
      ))}
      <Shadow cx={px} cy={302} rx={38} />
      <rect x={px - 38} y={262} width={76} height={38} rx={5} fill="#ffffff" stroke={INK} strokeWidth={1.3} />
      <rect x={px - 38} y={262} width={76} height={10} rx={4} fill={INK} opacity={0.12} />
      <circle cx={px - 22} cy={302} r={5.6} fill="#5c5a56" />
      <circle cx={px + 22} cy={302} r={5.6} fill="#5c5a56" />

      <Arrow x1={px + 6} y1={250} x2={px + 6 + Math.min(70, v * 26)} y2={250} color={WARN} width={2} />
      <Tag x={px + 12} y={244} text={`v = ${v.toFixed(2)} m/s`} color={WARN} anchor="start" />

      <Tag x={px} y={226} text={`s = ${pos.toFixed(2)} m`} color={INK} />
      <Txt
        x={380}
        y={406}
        text={
          dotEvery > 1
            ? `每 ${dotEvery} 个计时点取 1 个计数点（相邻计数点间 ${dotEvery - 1} 个点未标出）；取前后两个计数点求瞬时速度`
            : '每 0.02 s 打一个点（实际密度）；取中间时刻前后两个点求瞬时速度'
        }
        size={10}
        color={SOFT}
      />
    </g>
  )
}

function CartStage({ m }: { m: LabModel }) {
  const { x, a, F, M, m: mm, ratio } = m.g
  const px = 112 + Math.min(x, 3.2) * 150
  const weightY = 325 + Math.min(x, 3.2) * 16
  return (
    <g>
      <Txt x={380} y={34} text="小车 + 槽码：平衡摩擦力后研究 a 与 F、M 的关系" size={12.5} color={INK} bold />

      {/* 垫高的长木板 */}
      <path d="M90 300 L660 300 L660 308 L90 316 Z" fill="#eeeae3" stroke={LINE} strokeWidth={0.8} />
      <path d="M90 300 L90 316 L130 315 L130 300 Z" fill="#e2ded8" opacity={0.7} />
      <Txt x={110} y={334} text="垫高，平衡摩擦力" size={9} color={SOFT} anchor="start" />

      <line x1={90} y1={300} x2={660} y2={300} stroke={LINE} strokeWidth={1.1} />

      {/* 小车 */}
      <Shadow cx={px} cy={302} rx={34} />
      <rect x={px - 32} y={268} width={64} height={32} rx={5} fill="#ffffff" stroke={INK} strokeWidth={1.3} />
      <circle cx={px - 18} cy={302} r={4.6} fill="#5c5a56" />
      <circle cx={px + 18} cy={302} r={4.6} fill="#5c5a56" />
      <Txt x={px} y={288} text="M" size={11} color={INK} bold />

      <Arrow x1={px + 32} y1={282} x2={px + 32 + Math.min(64, F * 18)} y2={282} color={WARN} />
      <Tag x={px + 40} y={276} text={`F ≈ mg = ${F.toFixed(2)} N`} color={WARN} anchor="start" />

      {/* 滑轮 + 细绳 */}
      <line x1={px + 32} y1={284} x2={642} y2={284} stroke={INK} strokeWidth={1} opacity={0.75} />
      <circle cx={652} cy={296} r={13} fill="#ffffff" stroke={INK} strokeWidth={1.2} />
      <circle cx={652} cy={296} r={3} fill={INK} />
      <line x1={652} y1={309} x2={652} y2={weightY - 16} stroke={INK} strokeWidth={1} opacity={0.75} />

      {/* 槽码 */}
      <Shadow cx={652} cy={weightY + 18} rx={24} opacity={0.1} />
      <rect x={632} y={weightY - 16} width={40} height={34} rx={4} fill="#f2f0ec" stroke={INK} strokeWidth={1.2} />
      <Txt x={652} y={weightY + 4} text={`m = ${mm.toFixed(2)} kg`} size={9} color={INK} />
      <Arrow x1={652} y1={weightY + 22} x2={652} y2={weightY + 46} color="#3a3a38" width={1.6} />
      <Txt x={664} y={weightY + 44} text="G" size={10} color="#3a3a38" anchor="start" />

      <Tag x={px} y={236} text={`a = ${a.toFixed(2)} m/s²`} color={INK} />
      <Tag x={560} y={120} text={`M = ${M.toFixed(2)} kg`} color={INK} />
      <Tag x={560} y={146} text={`m / M = ${ratio.toFixed(2)}`} color={ratio > 0.2 ? WARN : SOFT} />
      {ratio > 0.2 && (
        <Txt x={380} y={398} text="槽码质量不再远小于小车质量：绳张力明显小于 mg，图线会弯曲" size={10} color={WARN} />
      )}
    </g>
  )
}

/* ───────────────────────── 胡克定律 ───────────────────────── */

function SpringStage({ m }: { m: LabModel }) {
  const { k, F, x, l0, l, idx } = m.g
  // 按「挂满 5 个钩码」的伸长量定标尺：不同劲度系数下弹簧都填满画面
  const maxX = (5 * m.g.m * 9.8) / k
  const scale = 260 / Math.max(0.2, l0 + maxX + 0.02)
  const top = 54
  const endY = top + l * scale
  const coils = 14
  const amp = 22
  const pts: string[] = []
  for (let i = 0; i <= coils; i++) {
    const yy = top + 10 + ((endY - top - 26) * i) / coils
    const xx = 380 + (i === 0 || i === coils ? 0 : i % 2 === 0 ? amp : -amp)
    pts.push(`${i === 0 ? 'M' : 'L'}${xx} ${yy}`)
  }
  return (
    <g>
      <Txt x={380} y={32} text="竖直悬挂弹簧：逐个挂钩码，记录 F 与 x" size={12.5} color={INK} bold />
      <rect x={250} y={44} width={260} height={9} rx={3} fill="#e2ded8" stroke={LINE} strokeWidth={0.8} />
      <path d={pts.join(' ')} fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

      {/* 指针与长度 */}
      <line x1={380} y1={top} x2={380} y2={endY} stroke={SOFT} strokeWidth={0.6} strokeDasharray="3 4" opacity={0.5} />
      <line x1={352} y1={endY} x2={408} y2={endY} stroke={INK} strokeWidth={1.2} />

      {/* 钩码 */}
      {Array.from({ length: idx }, (_, i) => (
        <g key={i}>
          <rect x={356} y={endY + 4 + i * 17} width={48} height={14} rx={3} fill="#f2f0ec" stroke={INK} strokeWidth={1} />
          <line x1={364} y1={endY + 8 + i * 17} x2={396} y2={endY + 8 + i * 17} stroke={SOFT} strokeWidth={0.6} />
        </g>
      ))}
      <Txt x={380} y={endY + 20 + idx * 17} text={`${idx} 个钩码`} size={9.5} color={SOFT} />

      {/* 力箭头 */}
      <Arrow x1={430} y1={endY - 10} x2={430} y2={endY - 10 - Math.min(90, F * 14)} color={WARN} />
      <Tag x={438} y={endY - 14 - Math.min(90, F * 14)} text={`F = ${F.toFixed(2)} N`} color={WARN} anchor="start" />
      <Arrow x1={330} y1={endY + 10} x2={330} y2={endY + 10 + Math.min(60, F * 10)} color="#3a3a38" width={1.6} />
      <Txt x={318} y={endY + 22 + Math.min(60, F * 10)} text="G" size={10} color="#3a3a38" anchor="end" />

      {/* 长度标尺：直接量弹簧原长到当前长度，避免固定刻度与动态比例尺对不上 */}
      <line x1={540} y1={top} x2={540} y2={endY} stroke={SOFT} strokeWidth={0.9} strokeDasharray="3 4" />
      <line x1={534} y1={top} x2={546} y2={top} stroke={SOFT} strokeWidth={0.9} />
      <line x1={534} y1={endY} x2={546} y2={endY} stroke={SOFT} strokeWidth={0.9} />
      <Txt x={554} y={(top + endY) / 2 + 4} text={`l = ${(l * 100).toFixed(1)} cm`} size={9.5} color={SOFT} anchor="start" mono />

      <Tag x={210} y={120} text={`原长 l₀ = ${(l0 * 100).toFixed(1)} cm`} color={SOFT} />
      <Tag x={210} y={150} text={`伸长 x = ${(x * 100).toFixed(1)} cm`} color={INK} />
      <Tag x={210} y={180} text={`k = ${k.toFixed(0)} N/m`} color={INK} bold />
      <Tag x={210} y={210} text={`F / x = ${(F / x).toFixed(1)} N/m`} color={SOFT} />
      <Tag x={210} y={240} text={`弹簧长度 l = ${(l * 100).toFixed(1)} cm`} color={INK} />
    </g>
  )
}

/* ───────────────────────── 力的合成 ───────────────────────── */

function VectorsStage({ m, t }: { m: LabModel; t: number }) {
  const { f1, f2, ang, F, phi } = m.g
  const O = { x: 356, y: 348 }
  const s = 54
  const rad = (ang * Math.PI) / 180
  const p1 = { x: O.x + f1 * s, y: O.y }
  const p2 = { x: O.x + f2 * s * Math.cos(rad), y: O.y - f2 * s * Math.sin(rad) }
  const pf = { x: O.x + (f1 + f2 * Math.cos(rad)) * s, y: O.y - f2 * s * Math.sin(rad) }
  // 常驻完整图形：用流动的虚线和沿对角线移动的光点做动效，
  // 不再从空白开始画，避免刚打开时画面是空的
  const a1 = 1
  const a2 = 1
  const a4 = 1
  const dash = -((t * 14) % 9)
  const travel = (t * 0.42) % 1
  const dot = { x: O.x + (pf.x - O.x) * travel, y: O.y + (pf.y - O.y) * travel }
  return (
    <g>
      <Txt x={380} y={32} text="同一次实验：两次都把橡皮条结点拉到 O 点" size={12.5} color={INK} bold />
      <circle cx={O.x} cy={O.y} r={4} fill={INK} />
      <Txt x={O.x - 10} y={O.y + 18} text="O" size={12} color={INK} bold />

      {/* 平行四边形辅助线 */}
      <line x1={p1.x} y1={p1.y} x2={pf.x} y2={pf.y} stroke={SOFT} strokeWidth={1.1} strokeDasharray="5 4" strokeDashoffset={dash} opacity={0.9} />
      <line x1={p2.x} y1={p2.y} x2={pf.x} y2={pf.y} stroke={SOFT} strokeWidth={1.1} strokeDasharray="5 4" strokeDashoffset={dash} opacity={0.9} />

      {/* 夹角弧 */}
      <path
        d={`M ${O.x + 52} ${O.y} A 52 52 0 0 0 ${O.x + 52 * Math.cos(rad)} ${O.y - 52 * Math.sin(rad)}`}
        fill="none"
        stroke={SOFT}
        strokeWidth={1}
        opacity={a2}
      />
      <Txt
        x={O.x + 64 * Math.cos(rad / 2)}
        y={O.y - 64 * Math.sin(rad / 2) + 4}
        text={`θ = ${ang.toFixed(0)}°`}
        size={10}
        color={SOFT}
      />

      <Arrow x1={O.x} y1={O.y} x2={p1.x} y2={p1.y} color={INK} width={2.2} opacity={a1} />
      <Tag x={p1.x + 8} y={p1.y + 18} text={`F₁ = ${f1.toFixed(1)} N`} color={INK} anchor="start" opacity={a1} />

      <Arrow x1={O.x} y1={O.y} x2={p2.x} y2={p2.y} color="#4a6b8a" width={2.2} opacity={a2} />
      <Tag x={p2.x + 10} y={p2.y - 6} text={`F₂ = ${f2.toFixed(1)} N`} color="#4a6b8a" anchor="start" opacity={a2} />

      <line x1={O.x} y1={O.y} x2={pf.x} y2={pf.y} stroke={WARN} strokeWidth={9} strokeLinecap="round" opacity={0.08 + 0.05 * Math.sin(t * 3)} />
      <Arrow x1={O.x} y1={O.y} x2={pf.x} y2={pf.y} color={WARN} width={2.6} opacity={a4} />
      <circle cx={dot.x} cy={dot.y} r={3.6} fill="#ffffff" stroke={WARN} strokeWidth={1.6} opacity={0.9} />
      <Tag
        x={pf.x + 12}
        y={pf.y - 10}
        text={`F = ${F.toFixed(2)} N`}
        color={WARN}
        bold
        anchor="start"
        opacity={a4}
      />
      <Txt
        x={380}
        y={392}
        text="虚线：把 F₁、F₂ 平移到对边；对角线就是合力 F"
        size={10}
        color={SOFT}
      />
      <Tag x={640} y={60} text={`φ = ${phi.toFixed(1)}°`} color={SOFT} />
    </g>
  )
}

/* ───────────────────────── 作用力与反作用力 ───────────────────────── */

function ReactionStage({ m, t }: { m: LabModel; t: number }) {
  const F = m.g.f
  const pulse = 0.5 + 0.5 * Math.sin(t * 5.2)
  const scale = (x: number, y: number, dir: 1 | -1, value: number, label: string) => (
    <g>
      <Shadow cx={x + dir * 78} cy={y + 32} rx={70} opacity={0.08} />
      <rect x={x} y={y} width={156} height={54} rx={7} fill="#ffffff" stroke={INK} strokeWidth={1.3} />
      <rect x={x + 6} y={y + 6} width={60} height={42} rx={4} fill="#f2f0ec" stroke={LINE} strokeWidth={0.7} />
      <Txt x={x + 36} y={y + 18} text={label} size={13} color={INK} bold />
      <Txt x={x + 36} y={y + 36} text={value.toFixed(1)} size={13} color={INK} bold mono />
      <Txt x={x + 36} y={y + 48} text="N" size={8} color={SOFT} />
      {Array.from({ length: 7 }, (_, i) => (
        <line
          key={i}
          x1={x + 74 + i * 10}
          y1={y + 8}
          x2={x + 74 + i * 10}
          y2={i % 2 === 0 ? y + 18 : y + 14}
          stroke={SOFT}
          strokeWidth={0.8}
        />
      ))}
      <line
        x1={dir === 1 ? x + 74 + value * 6 : x + 134 - value * 6}
        y1={y + 22}
        x2={dir === 1 ? x + 74 + value * 6 : x + 134 - value * 6}
        y2={y + 40}
        stroke={WARN}
        strokeWidth={1.6}
      />

    </g>
  )
  return (
    <g>
      <Txt x={380} y={34} text="两个弹簧测力计对拉：读数始终相等，方向始终相反" size={12.5} color={INK} bold />
      {scale(120, 200, 1, F, 'A')}
      {scale(484, 200, -1, F, 'B')}
      <line x1={276} y1={227} x2={484} y2={227} stroke={INK} strokeWidth={1.2} />
      <circle cx={276} cy={227} r={3} fill={INK} />
      <circle cx={484} cy={227} r={3} fill={INK} />

      <Arrow x1={250} y1={160} x2={250 + Math.min(80, F * 12)} y2={160} color="#4a6b8a" />
      <Txt x={250} y={148} text="B 对 A 的力" size={9} color="#4a6b8a" anchor="middle" />
      <Arrow x1={510} y1={160} x2={510 - Math.min(80, F * 12)} y2={160} color="#4a6b8a" />
      <Txt x={510} y={148} text="A 对 B 的力" size={9} color="#4a6b8a" anchor="middle" />

      <g opacity={0.5 + pulse * 0.5}>
        <circle cx={380} cy={227} r={6} fill={WARN} opacity={0.25} />
        <circle cx={380} cy={227} r={2.4} fill={WARN} />
      </g>

      {['等大', '反向', '共线', '异体', '同时'].map((s, i) => (
        <Tag key={s} x={230 + i * 76} y={320} text={s} color={i < 3 ? INK : SOFT} />
      ))}
      <Txt x={380} y={386} text="作用在两个物体上，不能求合力；与一对平衡力有本质区别" size={10} color={SOFT} />
    </g>
  )
}

/* ───────────────────────── 平抛 ───────────────────────── */

function ProjectileStage({ m }: { m: LabModel }) {
  const { x, y, vx, vy, v, h, tEnd } = m.g
  const ground = 372
  const ox = 140
  // 竖向固定占 260px，横向按射程自适应：不同参数下画面都饱满
  const sy = 260 / Math.max(0.35, h)
  const sc = Math.min(250, 540 / Math.max(0.6, v0range(vx, tEnd)))
  const bx = ox + x * sc
  const by = ground - y * sy
  const pts: [number, number][] = []
  const n = 40
  for (let i = 0; i <= n; i++) {
    const q = (tEnd * i) / n
    pts.push([ox + vx * q * sc, ground - (h - 0.5 * 9.8 * q * q) * sy])
  }
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const ghosts: [number, number][] = []
  for (let i = 0; i <= 9; i++) {
    const q = (tEnd * i) / 9
    ghosts.push([ox + vx * q * sc, ground - (h - 0.5 * 9.8 * q * q) * sy])
  }
  const topY = ground - h * sy
  return (
    <g>
      <Txt x={380} y={32} text="平抛：水平方向匀速，竖直方向自由落体" size={12.5} color={INK} bold />
      <Bench y={ground} x1={70} x2={720} />

      {/* 发射台：一根细立柱 + 小平台，不挡轨迹 */}
      <line x1={ox - 34} y1={ground} x2={ox - 34} y2={topY + 4} stroke={LINE} strokeWidth={5} />
      <rect x={ox - 52} y={topY - 4} width={40} height={7} rx={2} fill="#e2ded8" stroke={LINE} strokeWidth={0.8} />
      <Txt x={ox - 34} y={topY - 12} text={`h = ${h.toFixed(2)} m`} size={9.5} color={SOFT} />

      <path d={path} fill="none" stroke={INK} strokeWidth={1.5} strokeDasharray="5 4" opacity={0.7} />
      {ghosts.map(([gx, gy], i) => (
        <circle key={i} cx={gx} cy={gy} r={3.6} fill={INK} opacity={0.12 + i * 0.025} />
      ))}

      <Shadow cx={bx} cy={ground - 2} rx={10} opacity={0.1} />
      <circle cx={bx} cy={by} r={9.5} fill="url(#labBall)" stroke={INK} strokeWidth={1.1} />

      <Arrow x1={bx} y1={by} x2={bx + Math.min(80, vx * 17)} y2={by} color={WARN} />
      <Txt x={bx + Math.min(80, vx * 17) + 5} y={by - 5} text={`vₓ = ${vx.toFixed(1)}`} size={9.5} color={WARN} anchor="start" />
      <Arrow x1={bx} y1={by} x2={bx} y2={by + Math.min(90, vy * 13)} color="#9a5b4a" />
      <Txt x={bx + 7} y={by + Math.min(90, vy * 13) + 4} text={`v_y = ${vy.toFixed(1)}`} size={9.5} color="#9a5b4a" anchor="start" />
      <Tag x={bx} y={by - 22} text={`v = ${v.toFixed(2)} m/s`} color={INK} />

      {/* 水平射程 */}
      <line x1={ox} y1={ground + 22} x2={bx} y2={ground + 22} stroke={SOFT} strokeWidth={0.9} />
      <line x1={ox} y1={ground + 18} x2={ox} y2={ground + 26} stroke={SOFT} strokeWidth={0.9} />
      <line x1={bx} y1={ground + 18} x2={bx} y2={ground + 26} stroke={SOFT} strokeWidth={0.9} />
      <Txt x={(ox + bx) / 2} y={ground + 38} text={`x = ${x.toFixed(2)} m`} size={10} color={SOFT} mono />

      {/* 竖直下落高度 */}
      <line x1={ox - 62} y1={topY} x2={ox - 62} y2={by} stroke={SOFT} strokeWidth={0.8} strokeDasharray="3 4" />
      <Txt x={ox - 68} y={(topY + by) / 2} text={`${(h - y).toFixed(2)} m`} size={9} color={SOFT} anchor="end" mono />
    </g>
  )
}

/** 估算水平射程，用来定横向比例尺 */
function v0range(vx: number, tEnd: number) {
  return vx * tEnd
}

/* ───────────────────────── 圆周运动 ───────────────────────── */

function CircularStage({ m }: { m: LabModel }) {
  const { th, F, v, T, r, w } = m.g
  const cx = 372
  const cy = 212
  const R = 150
  const bx = cx + R * Math.cos(th)
  const by = cy - R * Math.sin(th)
  const tx = -Math.sin(th)
  const ty = -Math.cos(th)
  return (
    <g>
      <Txt x={380} y={32} text="匀速圆周运动：向心力始终指向圆心" size={12.5} color={INK} bold />
      <ellipse cx={cx} cy={cy} rx={R} ry={R} fill="none" stroke={LINE} strokeWidth={1} strokeDasharray="4 5" />
      <ellipse cx={cx} cy={cy} rx={R + 22} ry={R + 22} fill="none" stroke="#efede8" strokeWidth={0.8} />

      <line x1={cx} y1={cy} x2={bx} y2={by} stroke={INK} strokeWidth={1} strokeDasharray="4 4" opacity={0.6} />
      <Txt x={(cx + bx) / 2} y={(cy + by) / 2 - 6} text={`r = ${r.toFixed(2)} m`} size={9} color={SOFT} />

      <circle cx={cx} cy={cy} r={4} fill={INK} />
      <circle cx={bx} cy={by} r={10} fill="url(#labBall)" stroke={INK} strokeWidth={1.2} />

      <Arrow x1={bx} y1={by} x2={bx + tx * Math.min(80, v * 28)} y2={by + ty * Math.min(80, v * 28)} color={WARN} />
      <Txt x={bx + tx * 92} y={by + ty * 92 + 4} text={`v = ${v.toFixed(2)}`} size={9} color={WARN} />
      <Arrow x1={bx} y1={by} x2={bx - Math.cos(th) * Math.min(76, F * 26)} y2={by + Math.sin(th) * Math.min(76, F * 26)} color="#4a6b8a" />
      <Txt
        x={bx - Math.cos(th) * 88}
        y={by + Math.sin(th) * 88 + 4}
        text={`F = ${F.toFixed(2)} N`}
        size={9}
        color="#4a6b8a"
      />

      <path
        d={`M ${cx + 30} ${cy} A 30 30 0 ${th > Math.PI ? 1 : 0} 0 ${cx + 30 * Math.cos(th)} ${cy - 30 * Math.sin(th)}`}
        fill="none"
        stroke={SOFT}
        strokeWidth={1}
      />
      <Txt x={cx + 42} y={cy - 6} text="ω" size={10} color={SOFT} mono />

      <Tag x={150} y={110} text={`ω = ${w.toFixed(1)} rad/s`} color={INK} />
      <Tag x={150} y={140} text={`T = ${T.toFixed(2)} s`} color={SOFT} />
      <Tag x={150} y={170} text={`F = mω²r`} color={INK} bold />
      <Txt x={380} y={398} text="向心力只改变速度方向，不改变速度大小；它不是新的性质力" size={10} color={SOFT} />
    </g>
  )
}

/* ───────────────────────── 机械能守恒 ───────────────────────── */

function FallStage({ m }: { m: LabModel }) {
  const { y, v, ke, pe, tot, h, m: mass } = m.g
  const top = 58
  const bottom = 350
  const sc = (bottom - top) / h
  const wy = top + (h - y) * sc
  const maxE = Math.max(0.001, mass * 9.8 * h)
  const barW = 190
  const barX = 470
  const bars = [
    { label: 'Ek', val: ke, color: WARN },
    { label: 'Ep', val: pe, color: '#4a6b8a' },
    { label: 'E', val: tot, color: INK },
  ]
  return (
    <g>
      <Txt x={380} y={30} text="重锤下落：势能减少量 = 动能增加量" size={12.5} color={INK} bold />
      {/* 竖直刻度尺 */}
      <line x1={210} y1={top} x2={210} y2={bottom} stroke={LINE} strokeWidth={1.2} />
      {Array.from({ length: 17 }, (_, i) => {
        const yy = top + ((bottom - top) * i) / 16
        return (
          <g key={i}>
            <line x1={210} y1={yy} x2={i % 4 === 0 ? 226 : 218} y2={yy} stroke={SOFT} strokeWidth={0.7} />
            {i % 4 === 0 && (
              <Txt x={198} y={yy + 3} text={((h * i) / 16).toFixed(2)} size={8} color={SOFT} anchor="end" mono />
            )}
          </g>
        )
      })}
      <Txt x={198} y={top - 10} text="m" size={9} color={SOFT} anchor="end" />
      <Txt x={210} y={bottom + 18} text="下落距离 / m" size={8.5} color={SOFT} />

      {/* 纸带 + 重锤 */}
      <rect x={244} y={top - 12} width={10} height={wy - top + 12} fill="#ffffff" stroke={LINE} strokeWidth={0.8} />
      {Array.from({ length: Math.floor((h - y) / 0.02) + 1 }, (_, i) => {
        const yy = top + 0.5 * 9.8 * (i * 0.02) ** 2 * sc
        return yy < wy && <circle key={i} cx={249} cy={yy} r={1.4} fill={INK} opacity={0.5} />
      })}
      <Shadow cx={249} cy={bottom} rx={24} opacity={0.1} />
      <rect x={228} y={wy} width={42} height={30} rx={4} fill="#f2f0ec" stroke={INK} strokeWidth={1.3} />
      <Txt x={249} y={wy + 19} text="m" size={11} color={INK} bold />
      <Arrow x1={292} y1={wy + 6} x2={292} y2={wy + 46} color="#3a3a38" width={1.6} />
      <Txt x={300} y={wy + 46} text="G" size={10} color="#3a3a38" anchor="start" />

      <Tag x={249} y={wy - 12} text={`v = ${v.toFixed(2)} m/s`} color={WARN} />

      {/* 能量条 */}
      {bars.map((b, i) => {
        const yy = 110 + i * 76
        const wpx = Math.max(0, Math.min(1, b.val / maxE)) * barW
        return (
          <g key={b.label}>
            <Txt x={barX} y={yy - 10} text={b.label} size={11} color={INK} bold anchor="start" mono />
            <rect x={barX} y={yy} width={barW} height={16} rx={3} fill="#efede8" />
            <rect x={barX} y={yy} width={wpx} height={16} rx={3} fill={b.color} opacity={0.55} />
            <Txt x={barX + barW + 8} y={yy + 12} text={`${b.val.toFixed(3)} J`} size={9.5} color={SOFT} anchor="start" mono />
          </g>
        )
      })}
      <Txt x={barX} y={352} text="总能量保持不变（条形长度恒定）" size={9} color={SOFT} anchor="start" />
      <Tag x={470} y={72} text={`½v² = ${(0.5 * v * v).toFixed(2)}，gh = ${(9.8 * (h - y)).toFixed(2)}`} color={INK} anchor="start" />
    </g>
  )
}

/* ───────────────────────── 电容器充放电 ───────────────────────── */

function RCStage({ m, t }: { m: LabModel; t: number }) {
  const { u, i, phase, tau } = m.g
  const charging = phase === 0
  const discharging = phase === 1
  const level = Math.max(0, Math.min(1, u / Math.max(0.001, m.g.E ?? 6)))
  // 充电：电池 → 左触点 → 开关 → R → 电容 → 电流表 → 电池
  // 放电：电容 → R → 开关 → 右触点 → 回电容下极板
  const chargePath =
    'M130 210 L130 102 L266 102 L300 130 L470 130 M550 130 L640 130 L640 210 M640 236 L640 320 L130 320 L130 228'
  const dischargePath =
    'M640 210 L640 130 L550 130 M470 130 L300 130 L334 102 L700 102 L700 320 L640 320 L640 236'
  return (
    <g>
      <Txt x={380} y={30} text="RC 电路：观察充电与放电时电流、电压的变化" size={12.5} color={INK} bold />

      {/* 导线：电容上、下极板分别接 R 和电流表，不能一条线穿过极板 */}
      <path d="M130 210 L130 102 L266 102" fill="none" stroke={LINE} strokeWidth={2} />
      <path d="M300 130 L470 130" fill="none" stroke={LINE} strokeWidth={2} />
      <path d="M550 130 L640 130 L640 210" fill="none" stroke={LINE} strokeWidth={2} />
      <path d="M640 236 L640 320 L130 320 L130 228" fill="none" stroke={LINE} strokeWidth={2} />
      <path d="M334 102 L700 102 L700 320" fill="none" stroke={LINE} strokeWidth={2} />
      <Flow
        d={charging ? chargePath : dischargePath}
        color={INK}
        offset={t * 26}
        opacity={Math.min(0.85, 0.2 + Math.abs(i) * 0.5)}
      />

      {/* 电源 */}
      <line x1={108} y1={210} x2={152} y2={210} stroke={INK} strokeWidth={2.4} />
      <line x1={118} y1={228} x2={142} y2={228} stroke={INK} strokeWidth={1.4} />
      <Txt x={96} y={205} text="+" size={11} color={INK} anchor="end" />
      <Txt x={96} y={236} text="−" size={11} color={INK} anchor="end" />
      <Txt x={86} y={260} text="E" size={10} color={SOFT} anchor="end" mono />

      {/* 单刀双掷开关 */}
      <circle cx={300} cy={130} r={3.5} fill={INK} />
      <circle cx={266} cy={102} r={3.5} fill={INK} />
      <circle cx={334} cy={102} r={3.5} fill={INK} />
      <line
        x1={300}
        y1={130}
        x2={charging ? 266 : 334}
        y2={102}
        stroke={WARN}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <Txt x={252} y={94} text="充" size={9} color={SOFT} />
      <Txt x={344} y={94} text="放" size={9} color={SOFT} />
      <Txt x={300} y={156} text="单刀双掷开关" size={9} color={SOFT} />

      {/* 电阻 */}
      <rect x={470} y={114} width={80} height={32} rx={4} fill="#ffffff" stroke={INK} strokeWidth={1.2} />
      {Array.from({ length: 7 }, (_, k) => (
        <line key={k} x1={480 + k * 10} y1={118} x2={480 + k * 10} y2={142} stroke={SOFT} strokeWidth={1} />
      ))}
      <Txt x={510} y={106} text="R" size={10} color={INK} bold />

      {/* 电容器 */}
      <line x1={610} y1={210} x2={670} y2={210} stroke={INK} strokeWidth={3} />
      <line x1={610} y1={236} x2={670} y2={236} stroke={INK} strokeWidth={3} />
      <rect x={614} y={214} width={52} height={18} rx={3} fill="#eef1ef" stroke={LINE} strokeWidth={0.7} />
      <rect x={614} y={214 + 18 * (1 - level)} width={52} height={18 * level} rx={2} fill={WARN} opacity={0.55} />
      <Txt x={690} y={210} text="C" size={10} color={INK} anchor="start" bold />
      <Txt x={690} y={236} text={`${u.toFixed(2)} V`} size={9} color={SOFT} anchor="start" mono />

      {/* 电流表：串在电容下极板回路里，充放电都能读数 */}
      <circle cx={640} cy={280} r={22} fill="#ffffff" stroke={INK} strokeWidth={1.2} />
      <Txt x={640} y={276} text="A" size={11} color={INK} bold />
      <Txt x={640} y={291} text={`${Math.abs(i).toFixed(2)} mA`} size={7} color={SOFT} mono />
      <Arrow x1={670} y1={charging ? 268 : 292} x2={670} y2={charging ? 292 : 268} color={WARN} width={1.6} />
      <Txt x={678} y={284} text="i" size={9} color={WARN} anchor="start" />

      <Tag x={200} y={200} text={charging ? '充电中' : discharging ? '放电中' : '断开'} color={charging ? WARN : discharging ? '#4a6b8a' : SOFT} bold />
      <Tag x={200} y={228} text={`τ = ${tau.toFixed(2)} s`} color={SOFT} />
      <Tag x={470} y={72} text={`u = ${u.toFixed(2)} V，i = ${i.toFixed(2)} mA`} color={INK} />
      <Txt x={380} y={404} text="充电：电流减小、电压升高；放电：电流反向、电压降低" size={10} color={SOFT} />
    </g>
  )
}

/* ───────────────────────── 电阻率 ───────────────────────── */

function ResistivityStage({ m, t }: { m: LabModel; t: number }) {
  const { L, d, R, U, rho } = m.g
  const x1 = 120
  const x2 = x1 + L * 380
  // 电压表接在金属丝两端（电流表外接法），抽头随丝长移动
  const xa = x1 + 0.18 * (x2 - x1)
  const xb = x1 + 0.82 * (x2 - x1)
  const xm = (xa + xb) / 2
  return (
    <g>
      <Txt x={380} y={30} text="测金属丝的直径、长度和电阻，再由 ρ = πd²R/(4L) 求电阻率" size={12} color={INK} bold />

      {/* 金属丝：直接作为电路的上支路 */}
      <line x1={x1} y1={170} x2={x2} y2={170} stroke="#9a5b4a" strokeWidth={2.6} />
      <rect x={x1 - 18} y={154} width={18} height={32} rx={3} fill="#e2ded8" stroke={INK} strokeWidth={1} />
      <rect x={x2} y={154} width={18} height={32} rx={3} fill="#e2ded8" stroke={INK} strokeWidth={1} />
      <Txt x={(x1 + x2) / 2} y={148} text={`L = ${L.toFixed(2)} m`} size={9.5} color={SOFT} mono />

      {/* 螺旋测微器 */}
      <g>
        <rect x={540} y={64} width={44} height={72} rx={5} fill="#f2f0ec" stroke={INK} strokeWidth={1.1} />
        <rect x={584} y={86} width={54} height={28} rx={4} fill="#ffffff" stroke={INK} strokeWidth={1.1} />
        <g transform={`rotate(${(t * 90) % 360} 611 100)`}>
          <circle cx={611} cy={100} r={13} fill="#e8e4dd" stroke={INK} strokeWidth={1} />
          <line x1={611} y1={87} x2={611} y2={100} stroke={INK} strokeWidth={1.4} />
        </g>
        <line x1={584} y1={100} x2={566} y2={100} stroke={INK} strokeWidth={2} />
        <Txt x={562} y={82} text={`d = ${d.toFixed(3)} mm`} size={9.5} color={INK} anchor="end" mono />
        <Txt x={611} y={152} text="螺旋测微器" size={9} color={SOFT} />
      </g>

      {/* 主回路：电池 → 金属丝 → 右引线 → 电流表 → 电池 */}
      <path d="M120 170 L120 240" fill="none" stroke={LINE} strokeWidth={1.8} />
      <path d="M120 252 L120 330 L720 330" fill="none" stroke={LINE} strokeWidth={1.8} />
      <path d={`M720 330 L720 170 L${x2} 170`} fill="none" stroke={LINE} strokeWidth={1.8} />
      <Flow
        d={`M120 170 L${x2} 170 L720 170 L720 330 L120 330 Z`}
        color={INK}
        offset={t * 22}
        opacity={0.4}
      />
      {/* 电池：两平行极板，长板为正 */}
      <line x1={104} y1={240} x2={136} y2={240} stroke={INK} strokeWidth={2.6} />
      <line x1={112} y1={252} x2={128} y2={252} stroke={INK} strokeWidth={1.6} />
      <Txt x={96} y={236} text="+" size={10} color={INK} anchor="end" />
      <Txt x={96} y={262} text="−" size={10} color={INK} anchor="end" />
      <Txt x={96} y={282} text="E" size={9} color={SOFT} anchor="end" mono />

      {/* 电流表 */}
      <circle cx={250} cy={330} r={19} fill="#fff" stroke={INK} strokeWidth={1.1} />
      <Txt x={250} y={326} text="A" size={10} color={INK} bold />
      <Txt x={250} y={338} text="I" size={7.5} color={SOFT} />

      {/* 电压表：直接并在金属丝两端 */}
      <path d={`M${xa} 170 L${xa} 214 L${xb} 214 L${xb} 170`} fill="none" stroke={LINE} strokeWidth={1.4} />
      <circle cx={xm} cy={214} r={17} fill="#fff" stroke={INK} strokeWidth={1.1} />
      <Txt x={xm} y={210} text="V" size={10} color={INK} bold />
      <Txt x={xm} y={222} text={`${U.toFixed(2)} V`} size={7} color={SOFT} mono />

      <Tag x={660} y={260} text={`ρ = ${rho.toExponential(2)} Ω·m`} color={INK} anchor="end" />
      <Tag x={660} y={288} text={`S = ${(Math.PI * (d * 1e-3) ** 2 / 4 * 1e6).toFixed(3)} mm²`} color={SOFT} anchor="end" />
      <Tag x={660} y={316} text={`R = ${R.toFixed(2)} Ω`} color={SOFT} anchor="end" />
      <Txt x={380} y={418} text="小电阻采用电流表外接法；测直径要在不同位置测三次" size={10} color={SOFT} />
    </g>
  )
}

/* ───────────────────────── 多用电表 ───────────────────────── */

function MultimeterStage({ m }: { m: LabModel }) {
  const { mult, mid, midScale, deflect, reading } = m.g
  const cx = 350
  const cy = 318
  const r = 168
  const a = 180 * (1 - deflect)
  const vals = [5, 10, 15, 20, 30, 50, 100, 200]
  const marks = vals.map((v) => {
    const df = 1 / (1 + v / midScale)
    const ang = Math.PI * (1 - df)
    return {
      v,
      x1: cx + (r - 8) * Math.cos(ang),
      y1: cy - (r - 8) * Math.sin(ang),
      x2: cx + r * Math.cos(ang),
      y2: cy - r * Math.sin(ang),
      tx: cx + (r - 34) * Math.cos(ang),
      ty: cy - (r - 34) * Math.sin(ang) + 3,
    }
  })
  const knobIdx = mult === 1 ? 0 : mult === 10 ? 1 : 2
  const knobAng = -140 + knobIdx * 50
  const knobRad = (knobAng * Math.PI) / 180
  return (
    <g>
      <Txt x={380} y={28} text="欧姆挡：指针指在中值附近时读数最准" size={12.5} color={INK} bold />
      <rect x={92} y={40} width={576} height={364} rx={14} fill="#ffffff" stroke={LINE} strokeWidth={1.2} />
      <rect x={108} y={56} width={544} height={332} rx={10} fill="#fafaf8" stroke="#e8e4dd" strokeWidth={0.8} />

      {/* 刻度弧 */}
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={LINE} strokeWidth={1.4} />
      {marks.map((mk) => (
        <g key={mk.v}>
          <line x1={mk.x1} y1={mk.y1} x2={mk.x2} y2={mk.y2} stroke={SOFT} strokeWidth={1} />
          <Txt x={mk.tx} y={mk.ty} text={String(mk.v)} size={10} color={SOFT} mono />
        </g>
      ))}
      <Txt x={cx + r - 6} y={cy - 8} text="0" size={12} color={SOFT} anchor="end" mono />
      <Txt x={cx - r + 6} y={cy - 8} text="∞" size={12} color={SOFT} anchor="start" />

      {/* 指针 */}
      <g transform={`rotate(${a} ${cx} ${cy})`}>
        <line x1={cx} y1={cy} x2={cx + r - 14} y2={cy} stroke={WARN} strokeWidth={2.4} strokeLinecap="round" />
        <polygon points={`${cx + r - 14},${cy} ${cx + r - 25},${cy - 4} ${cx + r - 25},${cy + 4}`} fill={WARN} />
      </g>
      <circle cx={cx} cy={cy} r={6} fill={INK} />
      <Txt x={cx} y={cy + 24} text="Ω" size={10} color={SOFT} mono />

      {/* 读数窗口：表壳右缘在 668，窗口必须留在壳内 */}
      <rect x={530} y={72} width={112} height={58} rx={6} fill="#eef1ef" stroke={LINE} strokeWidth={0.9} />
      <Txt x={586} y={94} text="读数" size={9} color={SOFT} />
      <Txt x={586} y={116} text={`${(reading * mult).toFixed(0)} Ω`} size={16} color={INK} bold mono />
      <Txt x={586} y={129} text={`×${mult} 挡`} size={8} color={SOFT} />

      {/* 选择开关 */}
      <circle cx={620} cy={322} r={30} fill="#f2f0ec" stroke={INK} strokeWidth={1.2} />
      <line
        x1={620}
        y1={322}
        x2={620 + 24 * Math.cos(knobRad)}
        y2={322 - 24 * Math.sin(knobRad)}
        stroke={INK}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <circle cx={620} cy={322} r={5} fill={INK} />
      {[
        { t: '×1', x: 584, y: 372 },
        { t: '×10', x: 620, y: 380 },
        { t: '×100', x: 654, y: 372 },
      ].map((s2, i) => (
        <Txt
          key={s2.t}
          x={s2.x}
          y={s2.y}
          text={s2.t}
          size={8.5}
          color={i === knobIdx ? INK : SOFT}
          bold={i === knobIdx}
        />
      ))}

      {/* 表笔 */}
      <path d="M 430 360 C 446 376, 458 384, 472 388" fill="none" stroke="#9a5b4a" strokeWidth={2.2} />
      <path d="M 414 364 C 426 382, 434 390, 444 394" fill="none" stroke="#3a3a38" strokeWidth={2.2} />
      <circle cx={472} cy={388} r={2.4} fill="#9a5b4a" />
      <circle cx={444} cy={394} r={2.4} fill="#3a3a38" />
      <Txt x={480} y={386} text="红表笔 +" size={8} color="#9a5b4a" anchor="start" />
      <Txt x={406} y={404} text="黑表笔 −" size={8} color="#3a3a38" anchor="end" />

      <Tag x={150} y={86} text={`中值 ${mid.toFixed(0)} Ω`} color={SOFT} anchor="start" />
    </g>
  )
}

/* ───────────────────────── 电动势与内阻 ───────────────────────── */

function EMFStage({ m }: { m: LabModel }) {
  const { r, R, I, U } = m.g
  const slider = 600 - ((R - 1) / 9) * 110
  return (
    <g>
      <Txt x={380} y={30} text="改变外电阻，测多组 U、I；U-I 图的截距是 E、斜率是 r" size={12} color={INK} bold />
      <path d="M130 320 L130 120 L640 120 L640 320 L130 320" fill="none" stroke={LINE} strokeWidth={2} />
      <Flow d="M130 320 L130 120 L640 120 L640 320 L130 320" color={INK} offset={I * 40} opacity={0.45} />

      {/* 电池 + 内阻 */}
      <line x1={108} y1={200} x2={152} y2={200} stroke={INK} strokeWidth={2.6} />
      <line x1={118} y1={220} x2={142} y2={220} stroke={INK} strokeWidth={1.6} />
      <Txt x={96} y={196} text="E" size={10} color={INK} anchor="end" mono />
      <Txt x={96} y={228} text="r" size={10} color={SOFT} anchor="end" mono />
      <Txt x={96} y={246} text={`${r.toFixed(2)} Ω`} size={8} color={SOFT} anchor="end" mono />

      {/* 滑动变阻器 */}
      <rect x={470} y={104} width={140} height={32} rx={4} fill="#fff" stroke={INK} strokeWidth={1.1} />
      <line x1={482} y1={120} x2={598} y2={120} stroke={SOFT} strokeWidth={2} />
      <polygon points={`${slider},112 ${slider - 5},120 ${slider + 5},120`} fill={WARN} />
      <line x1={slider} y1={120} x2={slider} y2={104} stroke={WARN} strokeWidth={1.8} />
      <Txt x={540} y={96} text="滑动变阻器 R" size={9} color={SOFT} />

      {/* 电流表 */}
      <circle cx={640} cy={220} r={24} fill="#fff" stroke={INK} strokeWidth={1.2} />
      <Txt x={640} y={216} text="A" size={11} color={INK} bold />
      <Txt x={640} y={230} text={`${I.toFixed(2)} A`} size={7.5} color={SOFT} mono />

      {/* 电压表并联在电池两端 */}
      <path d="M130 260 L130 280 L220 280 L220 320" fill="none" stroke={LINE} strokeWidth={1.4} />
      <circle cx={220} cy={280} r={22} fill="#fff" stroke={INK} strokeWidth={1.2} />
      <Txt x={220} y={276} text="V" size={11} color={INK} bold />
      <Txt x={220} y={290} text={`${U.toFixed(2)} V`} size={7.5} color={SOFT} mono />

      <Txt x={300} y={190} text="改变 R，读多组 U、I" size={10} color={SOFT} anchor="start" />
      <Txt x={300} y={208} text="作 U-I 图：截距 E，斜率 r" size={10} color={SOFT} anchor="start" />
      <Txt x={380} y={400} text="电流不宜过大、通电时间要短；个别偏离直线过远的点应舍去" size={10} color={SOFT} />
    </g>
  )
}

/* ───────────────────────── 动量守恒 ───────────────────────── */

function CollisionStage({ m }: { m: LabModel }) {
  const { x1, x2, v1, v2, pBefore, pAfter, tt, tc, elastic } = m.g
  // 极端质量比时滑块可能冲出导轨，绘制时夹在导轨范围内（数据仍按真实速度算）
  const px1 = 380 + Math.max(-2.1, Math.min(2.35, x1)) * 130
  const px2 = 380 + Math.max(-2.1, Math.min(2.35, x2)) * 130
  const hit = Math.abs(tt - tc) < 0.22
  return (
    <g>
      <Txt x={380} y={30} text="气垫导轨上的碰撞：碰前总动量 = 碰后总动量" size={12.5} color={INK} bold />
      <Bench y={300} x1={70} x2={720} />
      <rect x={90} y={286} width={600} height={14} rx={4} fill="#eef1ef" stroke={LINE} strokeWidth={0.9} />
      {Array.from({ length: 14 }, (_, i) => (
        <circle key={i} cx={110 + i * 42} cy={293} r={1.6} fill={SOFT} opacity={0.5} />
      ))}

      {/* 光电门 */}
      {[330, 560].map((gx) => (
        <g key={gx}>
          <line x1={gx} y1={214} x2={gx} y2={284} stroke={INK} strokeWidth={1.4} />
          <rect x={gx - 8} y={206} width={16} height={12} rx={2} fill="#f2f0ec" stroke={INK} strokeWidth={1} />
          <Txt x={gx} y={198} text="光电门" size={8} color={SOFT} />
        </g>
      ))}

      {/* 滑块 */}
      {[
        { x: px1, v: v1, p: 0, label: 'm₁' },
        { x: px2, v: v2, p: 1, label: 'm₂' },
      ].map((b) => (
        <g key={b.label}>
          <Shadow cx={b.x} cy={300} rx={32} opacity={0.1} />
          <rect x={b.x - 32} y={256} width={64} height={30} rx={4} fill="#ffffff" stroke={INK} strokeWidth={1.2} />
          <rect x={b.x - 32} y={256} width={64} height={8} rx={3} fill={INK} opacity={0.1} />
          <Txt x={b.x} y={276} text={b.label} size={10} color={INK} bold />
          <Arrow
            x1={b.x + (b.v >= 0 ? 34 : -34)}
            y1={242}
            x2={b.x + (b.v >= 0 ? 34 : -34) + Math.min(60, Math.abs(b.v) * 70) * (b.v >= 0 ? 1 : -1)}
            y2={242}
            color={WARN}
          />
          <Txt x={b.x} y={230} text={`v = ${Math.abs(b.v).toFixed(2)}`} size={9} color={WARN} />
        </g>
      ))}

      {hit && <circle cx={(px1 + px2) / 2} cy={270} r={28} fill="none" stroke={WARN} strokeWidth={2} opacity={0.5} />}

      {/* 动量对比 */}
      <g>
        <Txt x={520} y={336} text="碰前" size={9} color={SOFT} anchor="start" />
        <rect x={558} y={327} width={Math.min(120, pBefore * 700)} height={9} rx={2} fill={INK} opacity={0.45} />
        <Txt x={520} y={356} text="碰后" size={9} color={SOFT} anchor="start" />
        <rect x={558} y={347} width={Math.min(120, pAfter * 700)} height={9} rx={2} fill={WARN} opacity={0.6} />
        <Txt x={690} y={372} text={`${pBefore.toFixed(3)} kg·m/s`} size={8.5} color={SOFT} anchor="end" mono />
      </g>
      <Tag x={170} y={100} text={elastic ? '弹性碰撞：动量、动能都守恒' : '完全非弹性碰撞：动量守恒，动能减少'} color={INK} />
      <Tag x={170} y={130} text={`p = ${pBefore.toFixed(3)} kg·m/s`} color={INK} bold />
    </g>
  )
}

/* ───────────────────────── 简谐运动 / 弹簧振子 ───────────────────────── */

function SHMStage({ m, t }: { m: LabModel; t: number }) {
  const { A, theta, x, v, T, m: mass } = m.g
  const scale = 13 // px/cm
  const cx = 110
  const cy = 215
  const r = Math.max(20, A * scale)
  const th = theta
  const pointX = cx + r * Math.sin(th)
  const pointY = cy - r * Math.cos(th)
  const massX = 360
  const massY = cy - x * scale
  const massW = 46
  const massH = 34
  const massTop = massY - massH / 2
  const ceilY = 62
  const springLen = Math.max(30, massTop - ceilY)
  const coils = 12
  const amp = Math.min(14, springLen / 8)
  const springPts: string[] = []
  for (let i = 0; i <= coils; i++) {
    const yy = ceilY + (springLen * i) / coils
    const xx = massX + (i === 0 || i === coils ? 0 : i % 2 === 0 ? amp : -amp)
    springPts.push(`${i === 0 ? 'M' : 'L'}${xx.toFixed(1)} ${yy.toFixed(1)}`)
  }

  // x-t 图：直接复用模型给出的曲线点
  const gx0 = 500
  const gx1 = 720
  const gy = 215
  const gs = 13 // px/cm
  const curve = m.chart?.series[0]?.pts ?? []
  const gx = (tt: number) => gx0 + (tt / Math.max(0.001, 2 * T)) * (gx1 - gx0)
  const gyy = (xx: number) => gy - xx * gs
  const path = curve.map(([tt, xx], i) => `${i === 0 ? 'M' : 'L'}${gx(tt).toFixed(1)} ${gyy(xx).toFixed(1)}`).join(' ')
  const cursorT = ((t % (2 * T)) + 2 * T) % (2 * T)
  const cursorX = gx(cursorT)
  const cursorY = gyy(x)
  const vLen = Math.min(46, Math.abs(v) * 100)
  const fLen = Math.min(38, (Math.abs(x) / Math.max(0.1, A)) * 34)
  const arcR = 42
  const arcEnd = { x: cx + arcR * Math.sin(th), y: cy - arcR * Math.cos(th) }
  const showArc = th > 0.03

  return (
    <g>
      <Txt x={380} y={30} text="简谐运动：参考圆投影 → 弹簧振子 → x-t 图像" size={12.5} color={INK} bold />

      {/* 参考圆 */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={INK} strokeWidth={1.4} opacity={0.8} />
      <line x1={cx} y1={cy - r - 10} x2={cx} y2={cy + r + 10} stroke={SOFT} strokeWidth={0.8} strokeDasharray="4 5" opacity={0.55} />
      <line x1={cx} y1={cy} x2={pointX} y2={pointY} stroke={INK} strokeWidth={1.4} />
      <line x1={cx} y1={pointY} x2={massX - massW / 2} y2={massY} stroke={SOFT} strokeWidth={0.8} strokeDasharray="4 4" opacity={0.55} />
      {showArc && (
        <path
          d={`M ${cx} ${cy - arcR} A ${arcR} ${arcR} 0 ${th > Math.PI ? 1 : 0} 1 ${arcEnd.x} ${arcEnd.y}`}
          fill="none"
          stroke={WARN}
          strokeWidth={1.2}
        />
      )}
      <Txt x={cx + (arcR + 12) * Math.sin(th / 2)} y={cy - (arcR + 12) * Math.cos(th / 2) + 4} text="θ" size={11} color={WARN} mono />
      <circle cx={cx} cy={cy} r={3.2} fill={INK} />
      <Txt x={cx - 10} y={cy + 16} text="O" size={10} color={SOFT} />
      <circle cx={pointX} cy={pointY} r={4.5} fill="#ffffff" stroke={INK} strokeWidth={1.6} />
      <Txt x={pointX + 8} y={pointY - 6} text="P" size={10} color={INK} bold />
      <circle cx={cx} cy={pointY} r={3} fill={WARN} />
      <Txt x={cx + 8} y={pointY + 4} text="P′" size={9} color={WARN} />
      <Txt x={cx} y={cy - r - 18} text="参考圆" size={10} color={SOFT} />

      {/* 弹簧振子 */}
      <rect x={massX - 42} y={52} width={84} height={9} rx={3} fill="#e2ded8" stroke={LINE} strokeWidth={0.8} />
      <path d={springPts.join(' ')} fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <line x1={massX} y1={massTop - 6} x2={massX} y2={massTop} stroke={INK} strokeWidth={1.6} />
      <rect x={massX - massW / 2} y={massTop} width={massW} height={massH} rx={4} fill="#ffffff" stroke={INK} strokeWidth={1.4} />
      <rect x={massX - massW / 2} y={massTop} width={massW} height={8} rx={3} fill={INK} opacity={0.1} />
      <Txt x={massX} y={massY + 5} text="m" size={12} color={INK} bold />
      <Txt x={massX} y={massY + 27} text={`${mass.toFixed(2)} kg`} size={8.5} color={SOFT} />
      <line x1={250} y1={cy} x2={470} y2={cy} stroke={SOFT} strokeWidth={0.8} strokeDasharray="4 4" opacity={0.5} />
      <Txt x={252} y={cy - 6} text="平衡位置" size={9} color={SOFT} anchor="start" />

      {/* 位移标尺 */}
      {Math.abs(x) > 0.15 && (
        <g>
          <line x1={300} y1={cy} x2={300} y2={massY} stroke={SOFT} strokeWidth={0.9} />
          <line x1={296} y1={cy} x2={304} y2={cy} stroke={SOFT} strokeWidth={0.9} />
          <line x1={296} y1={massY} x2={304} y2={massY} stroke={SOFT} strokeWidth={0.9} />
          <Txt x={292} y={(cy + massY) / 2 + 4} text={`x = ${x.toFixed(1)} cm`} size={9} color={SOFT} anchor="end" mono />
        </g>
      )}

      {/* v / F 箭头 */}
      {vLen > 2 && (
        <g>
          <Arrow x1={massX + 30} y1={massY} x2={massX + 30} y2={massY - Math.sign(v) * vLen} color={WARN} width={1.8} />
          <Txt x={massX + 38} y={massY - Math.sign(v) * vLen + 4} text="v" size={10} color={WARN} bold />
        </g>
      )}
      {fLen > 2 && (
        <g>
          <Arrow x1={massX - 30} y1={massY} x2={massX - 30} y2={massY + Math.sign(x) * fLen} color="#4a6b8a" width={1.8} />
          <Txt x={massX - 38} y={massY + Math.sign(x) * fLen + 4} text="F" size={10} color="#4a6b8a" bold anchor="end" />
        </g>
      )}

      {/* x-t 图 */}
      <rect x={480} y={80} width={260} height={290} rx={8} fill="#ffffff" stroke={LINE} strokeWidth={0.9} />
      <Txt x={610} y={98} text="x-t 图像" size={10} color={SOFT} />
      <line x1={gx0} y1={gy} x2={gx1} y2={gy} stroke={LINE} strokeWidth={1} />
      <line x1={gx0} y1={95} x2={gx0} y2={335} stroke={LINE} strokeWidth={1} />
      <path d={path} fill="none" stroke={WARN} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <line x1={gx(T)} y1={95} x2={gx(T)} y2={335} stroke={SOFT} strokeWidth={0.8} strokeDasharray="3 4" opacity={0.6} />
      <Txt x={gx(T)} y={gy + 16} text="T" size={9} color={SOFT} mono />
      <Txt x={gx1} y={gy + 16} text="2T" size={9} color={SOFT} mono />
      <Txt x={gx0 - 6} y={gyy(A) + 4} text="A" size={9} color={SOFT} anchor="end" mono />
      <Txt x={gx0 - 6} y={gyy(-A) + 4} text="−A" size={9} color={SOFT} anchor="end" mono />
      <Txt x={gx0 - 6} y={gy + 4} text="0" size={8} color={SOFT} anchor="end" mono />
      <Txt x={gx0} y={90} text="x/cm" size={9} color={SOFT} anchor="start" />
      <Txt x={gx1} y={gy - 8} text="t/s" size={9} color={SOFT} anchor="end" />
      <line x1={cursorX} y1={gy} x2={cursorX} y2={cursorY} stroke={SOFT} strokeWidth={0.8} strokeDasharray="2 3" opacity={0.7} />
      <line x1={gx0} y1={cursorY} x2={cursorX} y2={cursorY} stroke={SOFT} strokeWidth={0.8} strokeDasharray="2 3" opacity={0.7} />
      <circle cx={cursorX} cy={cursorY} r={4} fill="#ffffff" stroke={WARN} strokeWidth={1.8} />

      <Tag x={610} y={390} text={`T = ${T.toFixed(2)} s，A = ${A.toFixed(1)} cm`} color={INK} />
      <Txt x={380} y={414} text="参考圆上一点匀速转动，它在直径上的投影就是振子的位移；投影随时间展开即 x-t 图像" size={9.5} color={SOFT} />
    </g>
  )
}

/* ───────────────────────── 单摆 ───────────────────────── */

function PendulumStage({ m, t }: { m: LabModel; t: number }) {
  const { th, T, v, vs, L, th0 } = m.g
  const px = 380
  const py = 80
  const sc = 200
  const amp = (th0 * Math.PI) / 180
  const bx = px + L * Math.sin(th) * sc
  const by = py + L * Math.cos(th) * sc
  const trail: [number, number][] = []
  for (let k = 1; k <= 4; k++) {
    const q = t - k * 0.07
    const a = amp * Math.cos(Math.sqrt(9.8 / L) * q)
    trail.push([px + L * Math.sin(a) * sc, py + L * Math.cos(a) * sc])
  }
  // 速度箭头沿切线方向，并且随摆动方向翻转；长度按当前速率缩放
  const vmax = L * amp * Math.sqrt(9.8 / L)
  const dir = vs >= 0 ? 1 : -1
  const len = 66 * Math.min(1, Math.abs(vs) / Math.max(0.001, vmax))
  const ax = bx + Math.cos(th) * len * dir
  const ay = by - Math.sin(th) * len * dir
  return (
    <g>
      <Txt x={380} y={30} text="单摆：摆角小于 5° 时做简谐运动" size={12.5} color={INK} bold />
      <rect x={320} y={62} width={120} height={9} rx={3} fill="#e2ded8" stroke={LINE} strokeWidth={0.8} />
      <line x1={px} y1={py} x2={bx} y2={by} stroke={INK} strokeWidth={1.2} />
      <circle cx={px} cy={py} r={3.5} fill={INK} />

      {/* 摆动轨迹：半径与最大摆角都跟着参数走 */}
      <path
        d={`M ${px - L * Math.sin(amp) * sc} ${py + L * Math.cos(amp) * sc} A ${L * sc} ${L * sc} 0 0 1 ${px + L * Math.sin(amp) * sc} ${py + L * Math.cos(amp) * sc}`}
        fill="none"
        stroke={LINE}
        strokeWidth={1}
        strokeDasharray="4 5"
      />
      {trail.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={9 - i} fill={INK} opacity={0.06} />
      ))}
      <Shadow cx={bx} cy={by + 22} rx={14} opacity={0.12} />
      <circle cx={bx} cy={by} r={13} fill="url(#labBall)" stroke={INK} strokeWidth={1.2} />

      {len > 2 && (
        <g>
          <Arrow x1={bx} y1={by} x2={ax} y2={ay} color={WARN} width={1.8} />
          <Txt
            x={ax + (dir > 0 ? 6 : -6)}
            y={ay - 6}
            text={`v = ${v.toFixed(2)}`}
            size={9}
            color={WARN}
            anchor={dir > 0 ? 'start' : 'end'}
          />
        </g>
      )}

      {/* 量角器：标出 ±5° 的简谐运动范围 */}
      <path d={`M ${px - 62} ${py} A 62 62 0 0 0 ${px + 62} ${py}`} fill="none" stroke={SOFT} strokeWidth={0.8} opacity={0.55} />
      {[-5, 0, 5].map((d) => {
        const a = (d * Math.PI) / 180
        return (
          <g key={d}>
            <line x1={px + 58 * Math.sin(a)} y1={py + 58 * Math.cos(a)} x2={px + 66 * Math.sin(a)} y2={py + 66 * Math.cos(a)} stroke={SOFT} strokeWidth={0.7} />
            <Txt x={px + 76 * Math.sin(a)} y={py + 76 * Math.cos(a) + 3} text={`${d}°`} size={8} color={SOFT} />
          </g>
        )
      })}

      <Tag x={170} y={120} text={`L = ${L.toFixed(2)} m`} color={INK} />
      <Tag x={170} y={150} text={`T = ${T.toFixed(3)} s`} color={INK} bold />
      <Tag x={170} y={180} text={`30T = ${(30 * T).toFixed(2)} s`} color={SOFT} />
      <Tag x={170} y={210} text={`g = ${(4 * Math.PI * Math.PI * L / (T * T)).toFixed(2)} m/s²`} color={WARN} />
      <Txt x={380} y={408} text="从最低点开始计时，测 30~50 次全振动；摆长要加上摆球半径" size={10} color={SOFT} />
    </g>
  )
}

/* ───────────────────────── 折射率 ───────────────────────── */

function RefractionStage({ m, t }: { m: LabModel; t: number }) {
  const { i, r, n } = m.g
  // 玻璃砖加宽到 330 px，n=1.3、i=75° 时折射光线仍从下表面射出，不会穿出右侧
  const O = { x: 430, y: 180 }
  const radI = (i * Math.PI) / 180
  const radR = (r * Math.PI) / 180
  const A = { x: O.x - 138 * Math.sin(radI), y: O.y - 138 * Math.cos(radI) }
  const B = { x: O.x + 150 * Math.tan(radR), y: 330 }
  const C = { x: B.x + 92 * Math.sin(radI), y: B.y + 92 * Math.cos(radI) }
  const pulse = (t * 0.55) % 1
  const seg1 = Math.hypot(O.x - A.x, O.y - A.y)
  const seg2 = Math.hypot(B.x - O.x, B.y - O.y)
  const seg3 = Math.hypot(C.x - B.x, C.y - B.y)
  const total = seg1 + seg2 + seg3
  const pos = pulse * total
  const at = (() => {
    if (pos < seg1) {
      const k = pos / seg1
      return { x: A.x + (O.x - A.x) * k, y: A.y + (O.y - A.y) * k }
    }
    if (pos < seg1 + seg2) {
      const k = (pos - seg1) / seg2
      return { x: O.x + (B.x - O.x) * k, y: O.y + (B.y - O.y) * k }
    }
    const k = (pos - seg1 - seg2) / seg3
    return { x: B.x + (C.x - B.x) * k, y: B.y + (C.y - B.y) * k }
  })()
  return (
    <g>
      <Txt x={380} y={30} text="光从空气斜射入玻璃：入射角与折射角的正弦之比为常数" size={12} color={INK} bold />
      <rect x={290} y={180} width={330} height={150} rx={3} fill="#e8eef0" stroke="#9fb0b4" strokeWidth={1.4} opacity={0.75} />
      <Txt x={455} y={262} text="玻璃砖" size={12} color="#6a7a86" />
      <Txt x={455} y={280} text={`n = ${n.toFixed(2)}`} size={10} color="#6a7a86" mono />

      {/* 法线 */}
      <line x1={O.x} y1={40} x2={O.x} y2={390} stroke={SOFT} strokeWidth={0.8} strokeDasharray="4 5" />
      <line x1={B.x} y1={B.y - 6} x2={B.x} y2={B.y + 50} stroke={SOFT} strokeWidth={0.8} strokeDasharray="4 5" />

      <line x1={A.x} y1={A.y} x2={O.x} y2={O.y} stroke={WARN} strokeWidth={2} />
      <line x1={O.x} y1={O.y} x2={B.x} y2={B.y} stroke={WARN} strokeWidth={2} />
      <line x1={B.x} y1={B.y} x2={C.x} y2={C.y} stroke={WARN} strokeWidth={2} />
      <circle cx={at.x} cy={at.y} r={4.5} fill="#fff" stroke={WARN} strokeWidth={1.4} />

      {/* 入射角：画在上方，夹在法线与入射光线之间 */}
      <path
        d={`M ${O.x} ${O.y - 58} A 58 58 0 0 0 ${O.x - 58 * Math.sin(radI)} ${O.y - 58 * Math.cos(radI)}`}
        fill="none"
        stroke={INK}
        strokeWidth={1}
      />
      <Txt
        x={O.x - 68 * Math.sin(radI / 2)}
        y={O.y - 68 * Math.cos(radI / 2) + 3}
        text={`θ₁ = ${i.toFixed(0)}°`}
        size={9.5}
        color={INK}
      />
      {/* 折射角：画在下方，夹在法线与折射光线之间 */}
      <path
        d={`M ${O.x} ${O.y + 44} A 44 44 0 0 1 ${O.x + 44 * Math.sin(radR)} ${O.y + 44 * Math.cos(radR)}`}
        fill="none"
        stroke="#4a6b8a"
        strokeWidth={1}
      />
      <Txt x={O.x + 54 * Math.sin(radR / 2)} y={O.y + 54 * Math.cos(radR / 2) + 10} text={`θ₂ = ${r.toFixed(1)}°`} size={9.5} color="#4a6b8a" />

      <Tag x={120} y={110} text={`sinθ₁ = ${Math.sin(radI).toFixed(3)}`} color={INK} anchor="start" />
      <Tag x={120} y={138} text={`sinθ₂ = ${Math.sin(radR).toFixed(3)}`} color="#4a6b8a" anchor="start" />
      <Tag x={120} y={166} text={`n = sinθ₁ / sinθ₂ = ${(Math.sin(radI) / Math.sin(radR)).toFixed(2)}`} color={WARN} anchor="start" />
      <Tag x={640} y={110} text="空气" color={SOFT} anchor="start" />
      <Tag x={316} y={310} text="玻璃" color="#6a7a86" anchor="start" />
      <Txt x={380} y={414} text="入射角、折射角都是光线与法线的夹角；改变入射角多做几次取平均" size={10} color={SOFT} />
    </g>
  )
}

/* ───────────────────────── 双缝干涉 ───────────────────────── */

function waveColor(lam: number) {
  if (lam < 450) return '#6a5f8a'
  if (lam < 500) return '#4a6b8a'
  if (lam < 560) return '#3f7a6a'
  if (lam < 600) return '#5a7a52'
  if (lam < 640) return '#8a7a3e'
  return '#9a5b4a'
}

function InterferenceStage({ m, t }: { m: LabModel; t: number }) {
  const { lam, d, L, dx } = m.g
  const color = waveColor(lam)
  // 屏上 1 mm 对应 9 px；条纹很密时也不再放大，保证 Δx 与图形一致
  const spacing = Math.max(2.2, dx * 9000)
  const center = 220
  const slitY1 = 190
  const slitY2 = 250
  const waves: { r: number; y: number; o: number }[] = []
  for (let k = 0; k < 8; k++) {
    const rr = ((t * 85 + k * 30) % 430) + 10
    waves.push({ r: rr, y: slitY1, o: 0.3 * (1 - rr / 450) })
    waves.push({ r: rr, y: slitY2, o: 0.3 * (1 - rr / 450) })
  }
  const bands: { y: number; o: number }[] = []
  for (let y = 70; y <= 370; y += 2) {
    bands.push({ y, o: Math.cos((Math.PI * (y - center)) / spacing) ** 2 })
  }
  return (
    <g>
      <Txt x={380} y={30} text="双缝干涉：相邻亮纹间距 Δx = Lλ/d" size={12.5} color={INK} bold />
      {/* 光源 */}
      <rect x={44} y={196} width={66} height={40} rx={5} fill="#fff" stroke={INK} strokeWidth={1.2} />
      <Txt x={77} y={212} text="光源" size={9} color={SOFT} />
      <Txt x={77} y={226} text="+ 滤光片" size={8} color={SOFT} />
      {/* 光束要照到两条缝，不能打在中缝的不透光部分 */}
      <path d={`M110 216 L252 ${slitY1} L252 ${slitY2} Z`} fill={color} opacity={0.08} />
      <line x1={110} y1={216} x2={252} y2={slitY1} stroke={color} strokeWidth={1.4} opacity={0.65} />
      <line x1={110} y1={216} x2={252} y2={slitY2} stroke={color} strokeWidth={1.4} opacity={0.65} />

      {/* 双缝板 */}
      <line x1={260} y1={70} x2={260} y2={180} stroke={INK} strokeWidth={2.4} />
      <line x1={260} y1={200} x2={260} y2={240} stroke={INK} strokeWidth={2.4} />
      <line x1={260} y1={260} x2={260} y2={370} stroke={INK} strokeWidth={2.4} />
      <Txt x={260} y={60} text="双缝" size={9} color={SOFT} />
      <Txt x={278} y={190} text="S₁" size={8} color={SOFT} anchor="start" />
      <Txt x={278} y={250} text="S₂" size={8} color={SOFT} anchor="start" />

      {/* 波前 */}
      {waves.map((w, i) => (
        <circle key={i} cx={260} cy={w.y} r={w.r} fill="none" stroke={color} strokeWidth={0.9} opacity={w.o} />
      ))}

      {/* 屏 */}
      <rect x={650} y={64} width={28} height={316} rx={2} fill="#f2f0ec" stroke={LINE} strokeWidth={1} />
      {bands.map((b, i) => (
        <rect key={i} x={652} y={b.y} width={24} height={2} fill={color} opacity={b.o * 0.75} />
      ))}
      <Txt x={664} y={54} text="屏" size={9} color={SOFT} />
      <Txt x={664} y={396} text={`λ = ${lam.toFixed(0)} nm`} size={9} color={color} mono />

      {/* Δx：标在屏右侧，标签向右留出空间 */}
      <line x1={686} y1={center - spacing} x2={686} y2={center + spacing} stroke={SOFT} strokeWidth={0.9} />
      <line x1={682} y1={center - spacing} x2={690} y2={center - spacing} stroke={SOFT} strokeWidth={0.9} />
      <line x1={682} y1={center + spacing} x2={690} y2={center + spacing} stroke={SOFT} strokeWidth={0.9} />
      <Txt x={694} y={center + 3} text={`Δx = ${(dx * 1000).toFixed(2)} mm`} size={8.5} color={SOFT} anchor="start" mono />

      <Tag x={150} y={110} text={`d = ${d.toFixed(2)} mm`} color={INK} anchor="start" />
      <Tag x={150} y={138} text={`L = ${L.toFixed(2)} m`} color={INK} anchor="start" />
      <Tag x={150} y={166} text={`Δx = Lλ/d`} color={SOFT} anchor="start" />
      <Txt x={380} y={420} text="单缝与双缝必须平行；用测量头测 n 条亮纹总间距 a，Δx = a/(n−1)" size={10} color={SOFT} />
    </g>
  )
}

/* ───────────────────────── 楞次定律 ───────────────────────── */

function InductionStage({ m }: { m: LabModel }) {
  const { pos, flux, emf, pole } = m.g
  const cx = 430
  const cy = 220
  const mx = cx + pos * 250
  const needle = Math.max(-72, Math.min(72, emf * 40))
  return (
    <g>
      <Txt x={380} y={30} text="条形磁铁靠近 / 远离线圈：感应电流的磁场阻碍磁通量的变化" size={11.5} color={INK} bold />
      {/* 线圈 */}
      {Array.from({ length: 6 }, (_, i) => (
        <ellipse key={i} cx={cx - 34 + i * 14} cy={cy} rx={13} ry={56} fill="none" stroke={INK} strokeWidth={1.6} opacity={0.8} />
      ))}
      <Txt x={cx} y={294} text="线圈" size={9} color={SOFT} />

      {/* 磁铁：朝向线圈的那一端才是“朝向”的磁极 */}
      <g>
        <rect x={mx - 46} y={cy - 18} width={46} height={36} rx={3} fill={pole === 1 ? '#3d5a66' : '#e2ded8'} stroke={INK} strokeWidth={1} />
        <rect x={mx} y={cy - 18} width={46} height={36} rx={3} fill={pole === 1 ? '#e2ded8' : '#3d5a66'} stroke={INK} strokeWidth={1} />
        <Txt x={mx - 23} y={cy + 5} text={pole === 1 ? 'N' : 'S'} size={14} color={pole === 1 ? '#ffffff' : INK} bold />
        <Txt x={mx + 23} y={cy + 5} text={pole === 1 ? 'S' : 'N'} size={14} color={pole === 1 ? INK : '#ffffff'} bold />
      </g>
      {[26, 40, 54].map((r) => (
        <path
          key={r}
          d={`M ${mx} ${cy - 18} C ${mx + r * 0.4} ${cy - 18 - r}, ${mx - r * 0.4} ${cy - 18 - r}, ${mx} ${cy - 18}`}
          fill="none"
          stroke={SOFT}
          strokeWidth={0.8}
          opacity={0.45}
        />
      ))}

      {/* 电流计 */}
      <line x1={cx + 40} y1={cy + 40} x2={610} y2={300} stroke={INK} strokeWidth={1} opacity={0.7} />
      <line x1={cx - 40} y1={cy + 40} x2={610} y2={340} stroke={INK} strokeWidth={1} opacity={0.7} />
      <circle cx={640} cy={320} r={44} fill="#fff" stroke={INK} strokeWidth={1.2} />
      <Dial cx={640} cy={340} r={34} angle={90 + needle} label="电流计" color={WARN} ticks={8} />
      <Txt x={640} y={382} text={emf > 0.05 ? '向右偏' : emf < -0.05 ? '向左偏' : '不偏转'} size={8.5} color={SOFT} />

      {/* 电流方向箭头 */}
      {emf !== 0 &&
        [0, 1, 2].map((i) => {
          const yy = cy - 34 + i * 34
          return (
            <Arrow
              key={i}
              x1={cx - 60}
              y1={yy}
              x2={cx - 60}
              y2={yy + (emf > 0 ? -18 : 18)}
              color={WARN}
              width={1.6}
              head={6}
              opacity={0.75}
            />
          )
        })}

      <Tag x={150} y={110} text={`磁通量 Φ = ${flux.toFixed(3)}`} color={INK} anchor="start" />
      <Tag x={150} y={138} text={`感应电动势 ∝ ${Math.abs(emf).toFixed(3)}`} color={WARN} anchor="start" />
      <Tag x={150} y={166} text={emf > 0 ? '感应电流：逆时针（从右端看）' : emf < 0 ? '感应电流：顺时针（从右端看）' : '磁通量变化率为零'} color={SOFT} anchor="start" />
      <Txt x={380} y={414} text="增反减同、来拒去留：感应电流总要阻碍磁通量的变化" size={10} color={SOFT} />
    </g>
  )
}

/* ───────────────────────── 变压器 ───────────────────────── */

function TransformerStage({ m, t }: { m: LabModel; t: number }) {
  const { n1, n2, U1, U2, I1, I2 } = m.g
  const core = '#e6e2da'
  const fluxPhase = (t * 2) % 1
  return (
    <g>
      <Txt x={380} y={30} text="原线圈接交流电，铁芯中的交变磁通在副线圈产生感应电动势" size={11.5} color={INK} bold />
      {/* 铁芯 */}
      <rect x={318} y={100} width={30} height={230} rx={3} fill={core} stroke={LINE} strokeWidth={1} />
      <rect x={452} y={100} width={30} height={230} rx={3} fill={core} stroke={LINE} strokeWidth={1} />
      <rect x={318} y={100} width={164} height={28} rx={3} fill={core} stroke={LINE} strokeWidth={1} />
      <rect x={318} y={302} width={164} height={28} rx={3} fill={core} stroke={LINE} strokeWidth={1} />
      <Txt x={400} y={88} text="闭合铁芯" size={9} color={SOFT} />

      {/* 磁通箭头 */}
      {[0, 1, 2].map((i) => {
        const o = (fluxPhase + i / 3) % 1
        return (
          <circle
            key={i}
            cx={333 + o * 134}
            cy={114}
            r={3}
            fill={WARN}
            opacity={0.35 + 0.4 * Math.sin(o * Math.PI)}
          />
        )
      })}

      {/* 线圈 */}
      {Array.from({ length: 8 }, (_, i) => (
        <ellipse key={`l${i}`} cx={333} cy={130 + i * 22} rx={24} ry={9} fill="none" stroke={INK} strokeWidth={1.5} />
      ))}
      {Array.from({ length: 4 }, (_, i) => (
        <ellipse key={`r${i}`} cx={467} cy={150 + i * 30} rx={24} ry={9} fill="none" stroke="#4a6b8a" strokeWidth={1.5} />
      ))}
      <Txt x={290} y={120} text={`n₁ = ${n1}`} size={9} color={INK} anchor="end" mono />
      <Txt x={510} y={140} text={`n₂ = ${n2}`} size={9} color="#4a6b8a" anchor="start" mono />

      {/* 交流电源 */}
      <circle cx={140} cy={220} r={30} fill="#fff" stroke={INK} strokeWidth={1.2} />
      <path d="M124 220 Q132 208 140 220 T156 220" fill="none" stroke={WARN} strokeWidth={1.6} />
      <Txt x={140} y={266} text={`U₁ = ${U1} V`} size={9} color={SOFT} />
      <line x1={170} y1={220} x2={310} y2={220} stroke={INK} strokeWidth={1} opacity={0.7} />
      <line x1={140} y1={190} x2={140} y2={120} stroke={INK} strokeWidth={1} opacity={0.7} />
      <path d="M140 120 L333 120 L333 130" fill="none" stroke={INK} strokeWidth={1} opacity={0.7} />

      {/* 负载 */}
      <path d="M482 150 L620 150 L620 192" fill="none" stroke={INK} strokeWidth={1} opacity={0.7} />
      <circle cx={620} cy={220} r={26} fill="#fff" stroke={INK} strokeWidth={1.2} />
      <path d="M608 208 L632 232 M632 208 L608 232" stroke={WARN} strokeWidth={1.2} />
      <path d="M612 244 L628 244 L626 254 L614 254 Z" fill="#e2ded8" stroke={INK} strokeWidth={1} />
      <Txt x={650} y={286} text="负载" size={8.5} color={SOFT} anchor="start" />
      <path d="M620 246 L620 272 L482 272 L482 240" fill="none" stroke={INK} strokeWidth={1} opacity={0.7} />
      <Txt x={650} y={224} text={`U₂ = ${U2.toFixed(1)} V`} size={9} color="#4a6b8a" anchor="start" />
      <Txt x={650} y={240} text={`I₂ = ${I2.toFixed(2)} A`} size={8} color={SOFT} anchor="start" />

      <Tag x={170} y={330} text={`I₁ = ${I1.toFixed(3)} A`} color={INK} anchor="start" />
      <Tag x={170} y={358} text={`U₁/U₂ = ${(U1 / U2).toFixed(2)}，n₁/n₂ = ${(n1 / n2).toFixed(2)}`} color={WARN} anchor="start" />
      <Txt x={380} y={404} text="必须接交流电；电压比等于匝数比，电流与匝数成反比" size={10} color={SOFT} />
    </g>
  )
}

/* ───────────────────────── 传感器 ───────────────────────── */

function SensorStage({ m, t }: { m: LabModel; t: number }) {
  const { temp, R, I, on, th } = m.g
  const glow = on ? 0.85 : 0
  return (
    <g>
      <Txt x={380} y={30} text="热敏电阻 + 继电器：温度超过阈值时自动点亮灯泡" size={12} color={INK} bold />
      {/* 烧杯 */}
      <path d="M150 220 L150 350 Q150 362 164 362 L276 362 Q290 362 290 350 L290 220" fill="url(#labWater)" stroke="#9fb0b4" strokeWidth={1.4} opacity={0.9} />
      <line x1={142} y1={220} x2={298} y2={220} stroke="#9fb0b4" strokeWidth={1.2} />
      <Txt x={220} y={214} text="水" size={9} color={SOFT} />
      {/* 热敏电阻 */}
      <rect x={212} y={196} width={14} height={120} rx={7} fill="#f2f0ec" stroke={INK} strokeWidth={1.2} />
      <Txt x={234} y={188} text="R" size={9} color={INK} anchor="start" />
      {/* 加热丝 */}
      <path d="M170 336 Q180 324 190 336 T210 336 T230 336 T250 336 T270 336" fill="none" stroke={WARN} strokeWidth={1.6} opacity={0.7} />
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M ${180 + i * 34} ${320 - ((t * 20 + i * 30) % 40)} q 6 -8 0 -16`}
          fill="none"
          stroke={SOFT}
          strokeWidth={0.8}
          opacity={0.35}
        />
      ))}
      <Txt x={220} y={382} text={`${temp.toFixed(1)} °C`} size={11} color={WARN} bold mono />

      {/* 控制盒 */}
      <Box x={330} y={170} w={190} h={150} />
      <Txt x={425} y={192} text="控制电路" size={9} color={SOFT} />
      <rect x={352} y={210} width={64} height={26} rx={3} fill="#f2f0ec" stroke={INK} strokeWidth={1} />
      <Txt x={384} y={227} text="继电器" size={8.5} color={INK} />
      <line x1={352} y1={252} x2={440} y2={252} stroke={INK} strokeWidth={1.2} />
      <line x1={352} y1={252} x2={on ? 438 : 404} y2={on ? 251 : 218} stroke={WARN} strokeWidth={2} strokeLinecap="round" />
      <circle cx={352} cy={252} r={3} fill={INK} />
      <circle cx={440} cy={252} r={3} fill={INK} />
      <Txt x={425} y={288} text={on ? '触点闭合' : '触点断开'} size={8.5} color={on ? WARN : SOFT} />

      {/* 灯泡 */}
      <circle cx={610} cy={238} r={40} fill="url(#labGlow)" opacity={glow} />
      <circle cx={610} cy={238} r={22} fill={on ? '#f6e6b8' : '#f2f0ec'} stroke={INK} strokeWidth={1.2} />
      <path d="M604 236 q6 -8 12 0 q-6 8 -12 0" fill="none" stroke={on ? WARN : SOFT} strokeWidth={1} />
      <path d="M603 258 L617 258 L615 268 L605 268 Z" fill="#e2ded8" stroke={INK} strokeWidth={1} />
      <Txt x={610} y={292} text="小灯泡" size={9} color={SOFT} />
      <Txt x={610} y={306} text={on ? '亮' : '灭'} size={10} color={on ? WARN : SOFT} bold />

      {/* 连线：控制电路进控制盒；工作电路从控制盒出来接到灯泡两端 */}
      <path d="M220 196 L220 170 L330 170" fill="none" stroke={LINE} strokeWidth={1.4} />
      <path d="M150 300 L110 300 L110 170 L330 170" fill="none" stroke={LINE} strokeWidth={1.2} opacity={0.7} />
      <path d="M520 220 L560 220 L560 196 L610 196 L610 216" fill="none" stroke={LINE} strokeWidth={1.4} />
      <path d="M520 245 L580 245 L580 350 L650 350 L650 238 L632 238" fill="none" stroke={LINE} strokeWidth={1.4} />

      <Tag x={380} y={110} text={`R = ${(R / 1000).toFixed(2)} kΩ`} color={INK} />
      <Tag x={380} y={138} text={`I = ${I.toFixed(2)} mA`} color={SOFT} />
      <Tag x={620} y={110} text={`阈值 ${th.toFixed(0)} °C`} color={WARN} />
      <Txt x={380} y={410} text="NTC 热敏电阻：温度升高，阻值减小，控制电流增大" size={10} color={SOFT} />
    </g>
  )
}

/* ───────────────────────── 油膜法 ───────────────────────── */

function OilFilmStage({ m, t }: { m: LabModel; t: number }) {
  const { Vpure, S, d, r, settled } = m.g
  const cx = 280
  const cy = 270
  const rx = Math.max(4, r * 560)
  const ry = Math.max(2, rx * 0.42)
  const dropT = Math.min(1, t / 0.8)
  const dropY = 70 + 200 * dropT
  const showGrid = t > 1.2
  return (
    <g>
      <Txt x={380} y={30} text="一滴油酸在水面铺成单分子层，d = V/S" size={12.5} color={INK} bold />
      <defs>
        <clipPath id="dishClip">
          <ellipse cx={cx} cy={cy} rx={200} ry={84} />
        </clipPath>
      </defs>
      <ellipse cx={cx} cy={cy} rx={204} ry={88} fill="#f2f0ec" stroke={LINE} strokeWidth={1.2} />
      <ellipse cx={cx} cy={cy} rx={200} ry={84} fill="url(#labWater)" />
      {/* 痱子粉 */}
      {Array.from({ length: 70 }, (_, i) => (
        <circle
          key={i}
          cx={cx + ((i * 53) % 190) - 95}
          cy={cy + ((i * 31) % 78) - 39}
          r={1.2}
          fill="#ffffff"
          opacity={0.65}
        />
      ))}
      {/* 油膜 */}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={WARN} opacity={0.26} />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={WARN} strokeWidth={1.2} opacity={0.55} />
      {showGrid && (
        <g clipPath="url(#dishClip)" opacity={0.4}>
          {Array.from({ length: 11 }, (_, i) => (
            <line key={`gx${i}`} x1={cx - 200 + i * 40} y1={cy - 84} x2={cx - 200 + i * 40} y2={cy + 84} stroke={SOFT} strokeWidth={0.6} />
          ))}
          {Array.from({ length: 9 }, (_, i) => (
            <line key={`gy${i}`} x1={cx - 200} y1={cy - 84 + i * 21} x2={cx + 200} y2={cy - 84 + i * 21} stroke={SOFT} strokeWidth={0.6} />
          ))}
        </g>
      )}
      {/* 液滴 */}
      {dropT < 1 && (
        <g>
          <circle cx={cx} cy={dropY} r={4.5} fill={WARN} opacity={0.85} />
          <line x1={cx} y1={dropY - 16} x2={cx} y2={dropY - 6} stroke={SOFT} strokeWidth={1} />
        </g>
      )}
      <Txt x={cx} y={cy + 104} text="浅盘水面（已撒痱子粉）" size={9} color={SOFT} />

      {/* 分子层放大 */}
      <g>
        <rect x={540} y={150} width={180} height={150} rx={8} fill="#ffffff" stroke={LINE} strokeWidth={1} />
        <Txt x={630} y={168} text="单分子层（放大）" size={8.5} color={SOFT} />
        {Array.from({ length: 7 }, (_, i) => (
          <circle key={i} cx={566 + i * 22} cy={230} r={10} fill="#e8eef0" stroke={INK} strokeWidth={0.9} />
        ))}
        <line x1={556} y1={256} x2={712} y2={256} stroke={SOFT} strokeWidth={0.8} />
        <line x1={556} y1={250} x2={556} y2={262} stroke={SOFT} strokeWidth={0.8} />
        <line x1={712} y1={250} x2={712} y2={262} stroke={SOFT} strokeWidth={0.8} />
        <Txt x={634} y={276} text="分子直径 d" size={8.5} color={INK} />
      </g>

      <Tag x={120} y={110} text={`V = ${fmtSci(Vpure, 1)} m³`} color={INK} anchor="start" />
      <Tag x={120} y={138} text={`S = ${S.toFixed(3)} m²`} color={INK} anchor="start" />
      <Tag
        x={120}
        y={166}
        text={settled ? `d = ${fmtSci(d, 2)} m` : 'd：油膜铺展中…'}
        color={WARN}
        anchor="start"
        bold
      />
      <Txt x={380} y={410} text="油膜不再扩散后再描轮廓；数格子时不足半格舍去、多于半格算一格（网格为示意）" size={10} color={SOFT} />
    </g>
  )
}

/* ───────────────────────── 玻意耳定律 ───────────────────────── */

function GasStage({ m, t }: { m: LabModel; t: number }) {
  const { V, P, pV, T } = m.g
  const Vmax = m.g.Vmax ?? 40
  const left = 150
  const right = 560
  const pistonX = left + (V / Vmax) * (right - left)
  const gauge = Math.min(1, P / 320)
  const mols = Array.from({ length: 26 }, (_, i) => {
    const x = left + 20 + ((i * 67 + t * (18 + (i % 5) * 4)) % Math.max(24, pistonX - left - 30))
    const y = 190 + ((i * 41) % 76) + Math.sin(t * 2 + i) * 4
    return { x, y }
  })
  return (
    <g>
      <Txt x={380} y={30} text="缓慢推拉活塞，保持温度不变：pV 近似为常数" size={12.5} color={INK} bold />
      <defs>
        <clipPath id="gasClip">
          <rect x={left + 2} y={176} width={Math.max(2, pistonX - left - 4)} height={104} rx={4} />
        </clipPath>
      </defs>
      {/* 注射器筒 */}
      <rect x={left} y={170} width={right - left} height={116} rx={7} fill="#ffffff" stroke={INK} strokeWidth={1.3} />
      <rect x={left + 2} y={176} width={Math.max(2, pistonX - left - 4)} height={104} rx={4} fill="url(#labGas)" />
      <g clipPath="url(#gasClip)">
        {mols.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.6} fill={INK} opacity={0.55} />
        ))}
      </g>
      {/* 活塞 */}
      <rect x={pistonX} y={168} width={16} height={120} rx={3} fill="#e2ded8" stroke={INK} strokeWidth={1.2} />
      <rect x={pistonX + 16} y={220} width={54} height={10} rx={3} fill="#e2ded8" stroke={INK} strokeWidth={1} />
      <circle cx={pistonX + 74} cy={225} r={8} fill="#f2f0ec" stroke={INK} strokeWidth={1} />
      {/* 接口与压强传感器 */}
      <rect x={left - 26} y={206} width={28} height={44} rx={4} fill="#f2f0ec" stroke={INK} strokeWidth={1} />
      <path d={`M ${left - 26} 228 L 104 228`} fill="none" stroke={LINE} strokeWidth={1.4} />
      <circle cx={72} cy={230} r={42} fill="#fff" stroke={INK} strokeWidth={1.2} />
      <Dial cx={72} cy={246} r={31} angle={20 + gauge * 140} label="压强" sub={`${P.toFixed(0)} kPa`} color={WARN} ticks={9} />

      <Tag x={170} y={110} text={`V = ${V.toFixed(1)} mL`} color={INK} anchor="start" />
      <Tag x={170} y={138} text={`p = ${P.toFixed(1)} kPa`} color={WARN} anchor="start" bold />
      <Tag x={400} y={110} text={`pV = ${pV.toFixed(0)} kPa·mL`} color={INK} anchor="start" />
      <Tag x={400} y={138} text={`T = ${T.toFixed(0)} K`} color={SOFT} anchor="start" />
      <Txt x={380} y={330} text="p-V 图线是双曲线的一支；改作 p-1/V 图，得到过原点的直线" size={10} color={SOFT} />
      <Txt x={380} y={412} text="手不要握住注射器的气体部分；推拉要慢，读数稳定后再记录" size={10} color={SOFT} />
    </g>
  )
}

