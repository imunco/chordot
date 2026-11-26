import type { LabExperiment, LabModel } from '../lab/types'
import { Arrow, Flow, Grid, INK, LINE, SOFT, Shadow, Tag, WARN } from './labkit'

/**
 * 模型专题的高质量演示台。
 * 统一使用「天空 / 场地 / 仪器」三层视觉：渐变材质、柔和投影、发光轨迹，
 * 运动量全部来自解析模型（m.g + t），不做逐帧积分。
 */

const BLUE = '#2f6f9f'
const BLUE2 = '#5eb6e8'
const GOLD = '#c49a4a'
const RED = '#b06a50'
const G = 9.8

function ModelDefs() {
  return (
    <defs>
      <linearGradient id="msSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f8fbfd" />
        <stop offset="58%" stopColor="#eef5f8" />
        <stop offset="100%" stopColor="#e7eff3" />
      </linearGradient>
      <linearGradient id="msGround" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#efe9df" />
        <stop offset="100%" stopColor="#ddd3c4" />
      </linearGradient>
      <linearGradient id="msWater" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#cfe6ed" />
        <stop offset="100%" stopColor="#a9cbd7" />
      </linearGradient>
      <linearGradient id="msWood" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f4e4c9" />
        <stop offset="48%" stopColor="#dfc39a" />
        <stop offset="100%" stopColor="#b98e5b" />
      </linearGradient>
      <linearGradient id="msMetal" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="45%" stopColor="#dfe8ed" />
        <stop offset="100%" stopColor="#aebfc8" />
      </linearGradient>
      <linearGradient id="msBlue" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#8fd0f5" />
        <stop offset="55%" stopColor="#3b8fc2" />
        <stop offset="100%" stopColor="#255d85" />
      </linearGradient>
      <linearGradient id="msWarm" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#f6d79a" />
        <stop offset="100%" stopColor="#c99a45" />
      </linearGradient>
      <linearGradient id="msRed" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#e6ad91" />
        <stop offset="100%" stopColor="#a85c43" />
      </linearGradient>
      <linearGradient id="msScreen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#20313f" />
        <stop offset="100%" stopColor="#0d1a24" />
      </linearGradient>
      <radialGradient id="msSun" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
        <stop offset="45%" stopColor="#f6e3b6" stopOpacity="0.45" />
        <stop offset="100%" stopColor="#f6e3b6" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="msGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#72d8ff" stopOpacity="0.8" />
        <stop offset="55%" stopColor="#72d8ff" stopOpacity="0.25" />
        <stop offset="100%" stopColor="#72d8ff" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="msSpace" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#172b3c" />
        <stop offset="100%" stopColor="#0b1722" />
      </linearGradient>
      <linearGradient id="msTrail" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#72d8ff" stopOpacity="0" />
        <stop offset="100%" stopColor="#5ec8ff" stopOpacity="0.9" />
      </linearGradient>
    </defs>
  )
}

function Shell({ exp, t, children, tone = 'ground' }: {
  exp: LabExperiment
  t: number
  tone?: 'ground' | 'water' | 'space' | 'screen' | 'field'
  children: React.ReactNode
}) {
  const pulse = 0.55 + 0.25 * Math.sin(t * 2.1)
  return (
    <g>
      <ModelDefs />
      <rect width="760" height="430" fill="url(#msSky)" />
      <circle cx="642" cy="72" r="120" fill="url(#msSun)" opacity="0.8" />
      <circle cx="104" cy="390" r="170" fill="#cfe2ea" opacity="0.28" />
      <g opacity="0.22">
        <Grid step={38} />
      </g>
      {tone === 'water' && (
        <g>
          <rect x="34" y="302" width="692" height="98" rx="8" fill="url(#msWater)" />
          {[0, 1, 2].map((i) => (
            <path
              key={i}
              d={'M34 ' + (326 + i * 22) + ' q 86 -10 172 0 t 172 0 t 172 0 t 172 0'}
              fill="none"
              stroke="#ffffff"
              strokeOpacity={0.36 - i * 0.08}
              strokeWidth="1.4"
            />
          ))}
        </g>
      )}
      {tone === 'ground' && (
        <g>
          <rect x="24" y="352" width="712" height="58" rx="10" fill="url(#msGround)" opacity="0.9" />
          <rect x="24" y="352" width="712" height="4" fill="#ffffff" opacity="0.55" />
        </g>
      )}
      {tone === 'space' && (
        <g>
          <rect x="30" y="42" width="700" height="354" rx="24" fill="url(#msSpace)" />
          {Array.from({ length: 46 }).map((_, i) => {
            const x = 52 + ((i * 137) % 650)
            const y = 64 + ((i * 83) % 300)
            return <circle key={i} cx={x} cy={y} r={i % 7 === 0 ? 1.6 : 0.8} fill="#dff5ff" opacity={0.28 + (i % 5) * 0.1} />
          })}
          <circle cx="640" cy="92" r="56" fill="#7c9cff" opacity="0.12" />
        </g>
      )}
      {tone === 'screen' && (
        <g>
          <rect x="42" y="58" width="676" height="326" rx="18" fill="url(#msScreen)" />
          <g opacity="0.22" stroke="#9fd7f2" strokeWidth="0.7">
            {Array.from({ length: 9 }).map((_, i) => (
              <line key={'h' + i} x1="64" y1={92 + i * 34} x2="696" y2={92 + i * 34} />
            ))}
            {Array.from({ length: 15 }).map((_, i) => (
              <line key={'v' + i} x1={72 + i * 44} y1="76" x2={72 + i * 44} y2="366" />
            ))}
          </g>
        </g>
      )}
      {tone === 'field' && (
        <g>
          <rect x="34" y="62" width="692" height="318" rx="20" fill="#f6fbfd" stroke="#d5e4eb" />
          {Array.from({ length: 7 }).map((_, i) =>
            Array.from({ length: 4 }).map((__, j) => (
              <g key={i + '-' + j}>
                <circle cx={80 + i * 100} cy={102 + j * 82} r="2" fill={SOFT} opacity="0.55" />
                <circle cx={80 + i * 100} cy={102 + j * 82} r="8" fill="none" stroke="#8fb5c4" strokeWidth="0.5" opacity="0.25" />
              </g>
            )),
          )}
        </g>
      )}
      {Array.from({ length: 14 }).map((_, i) => {
        const x = 46 + ((i * 97) % 660)
        const y = 70 + ((i * 61) % 290)
        return <circle key={'p' + i} cx={x} cy={y} r={i % 3 === 0 ? 1.8 : 1.1} fill="#ffffff" opacity={0.18 + 0.12 * Math.sin(t * 1.3 + i)} />
      })}
      <g opacity={pulse}>{children}</g>
      {exp.formulas[0] && (
        <g>
          <rect x="196" y="18" width="356" height="42" rx="14" fill="#ffffff" opacity="0.58" stroke={LINE} strokeWidth="0.7" />
          <text x="210" y="33" fontSize="8.5" fill={SOFT} fontFamily="'IBM Plex Sans SC', sans-serif">核心关系</text>
          <text x="210" y="49" fontSize="10.5" fill={INK} fontFamily="'IBM Plex Sans SC', sans-serif">
            {exp.formulas[0].expr.slice(0, 46)}
          </text>
        </g>
      )}
      <g>
        <rect x="574" y="18" width="154" height="42" rx="14" fill="#ffffff" opacity="0.64" stroke={LINE} strokeWidth="0.7" />
        <text x="588" y="34" fontSize="9" fill={SOFT} fontFamily="'IBM Plex Sans SC', sans-serif">LIVE / {exp.field}</text>
        <text x="588" y="50" fontSize="11" fill={INK} fontWeight="600" fontFamily="'IBM Plex Mono', monospace">{t.toFixed(2)} s</text>
        <circle cx="712" cy="32" r="3" fill={BLUE2} opacity={pulse} />
      </g>
      <g opacity="0.35" stroke={INK} fill="none" strokeWidth="0.8">
        <path d="M18 30 v-12 h12" /><path d="M742 30 v-12 h-12" />
        <path d="M18 400 v12 h12" /><path d="M742 400 v12 h-12" />
      </g>
      <g>
        <rect x="24" y="18" width="154" height="25" rx="12.5" fill="#ffffff" opacity="0.88" stroke={LINE} strokeWidth="0.8" />
        <circle cx="38" cy="30.5" r="3" fill={BLUE2} opacity={pulse} />
        <text x="48" y="34" fontSize="10.5" fill={INK} fontWeight="600" fontFamily="'IBM Plex Sans SC', sans-serif">
          {'MODEL · ' + exp.short}
        </text>
      </g>
    </g>
  )
}

function Ball({ cx, cy, r, tone = 'blue', opacity = 1 }: { cx: number; cy: number; r: number; tone?: 'blue' | 'warm' | 'metal'; opacity?: number }) {
  const fill = tone === 'warm' ? 'url(#msWarm)' : tone === 'metal' ? 'url(#msMetal)' : 'url(#msBlue)'
  return (
    <g opacity={opacity}>
      <Shadow cx={cx} cy={cy + r * 0.9} rx={r * 0.9} ry={r * 0.32} opacity={0.16} />
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke="#ffffff" strokeWidth="1.2" />
      <circle cx={cx - r * 0.28} cy={cy - r * 0.3} r={r * 0.34} fill="#ffffff" opacity="0.3" />
    </g>
  )
}

function Crate({ x, y, w, h, tone = 'metal', radius = 5 }: { x: number; y: number; w: number; h: number; tone?: 'metal' | 'wood' | 'warm'; radius?: number }) {
  const fill = tone === 'wood' ? 'url(#msWood)' : tone === 'warm' ? 'url(#msWarm)' : 'url(#msMetal)'
  return (
    <g>
      <Shadow cx={x + w / 2} cy={y + h + 4} rx={w * 0.55} ry={6} opacity={0.16} />
      <rect x={x} y={y} width={w} height={h} rx={radius} fill={fill} stroke="#ffffff" strokeWidth="1.1" />
      <rect x={x + 2} y={y + 2} width={w - 4} height={h * 0.32} rx={radius * 0.7} fill="#ffffff" opacity="0.25" />
    </g>
  )
}

function Bracket({ x1, x2, y, text, color = SOFT }: { x1: number; x2: number; y: number; text: string; color?: string }) {
  return (
    <g>
      <line x1={x1} y1={y - 5} x2={x1} y2={y + 5} stroke={color} strokeWidth="1" />
      <line x1={x2} y1={y - 5} x2={x2} y2={y + 5} stroke={color} strokeWidth="1" />
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeWidth="0.9" strokeDasharray="3 3" />
      <Tag x={(x1 + x2) / 2} y={y - 8} text={text} color={color} size={10} />
    </g>
  )
}

function Lamp({ x, y, on = true }: { x: number; y: number; on?: boolean }) {
  return (
    <g opacity={on ? 1 : 0.35}>
      <circle cx={x} cy={y} r="18" fill="url(#msGlow)" />
      <circle cx={x} cy={y} r="7" fill="#ffd98a" stroke="#ffffff" strokeWidth="1" />
    </g>
  )
}

export function ModelStage({ exp, m, t }: { exp: LabExperiment; m: LabModel; t: number }) {
  const body = renderModel(exp, m, t)
  return <Shell exp={exp} t={t} tone={toneFor(exp.modelType ?? 'boat')}>{body}</Shell>
}

function toneFor(type: string): 'ground' | 'water' | 'space' | 'screen' | 'field' {
  if (type === 'boat') return 'water'
  if (type === 'orbit') return 'space'
  if (type === 'wave') return 'screen'
  if (type === 'charge' || type === 'singleRod') return 'field'
  return 'ground'
}

function renderModel(exp: LabExperiment, m: LabModel, t: number): React.ReactNode {
  const g = m.g
  const type = exp.modelType ?? 'boat'
  switch (type) {

    case 'boat': {
      const boatW = Math.min(300, Math.max(150, g.L * 68))
      const sx = 370 + g.sb * 54
      const personX = sx - boatW / 2 + g.walk * 48
      const y = 284
      const bob = Math.sin(t * 2.4) * 2
      return (
        <g>
          <path d={'M' + (sx - boatW / 2) + ' ' + (y + bob) + ' L' + (sx + boatW / 2) + ' ' + (y + bob) + ' L' + (sx + boatW / 2 - 28) + ' ' + (y + 38 + bob) + ' L' + (sx - boatW / 2 + 30) + ' ' + (y + 38 + bob) + ' Z'} fill="url(#msWood)" stroke="#7a5f43" strokeWidth="1.8" />
          <path d={'M' + (sx - boatW / 2 + 12) + ' ' + (y + 8 + bob) + ' L' + (sx + boatW / 2 - 12) + ' ' + (y + 8 + bob)} stroke="#fff4df" strokeWidth="2" opacity="0.5" />
          <path d={'M' + (sx - boatW / 2 + 34) + ' ' + (y + 24 + bob) + ' Q' + sx + ' ' + (y + 34 + bob) + ' ' + (sx + boatW / 2 - 34) + ' ' + (y + 24 + bob)} fill="none" stroke="#7a5f43" strokeWidth="1" opacity="0.45" />
          {[0, 1, 2, 3, 4].map((i) => (
            <path key={i} d={'M' + (70 + i * 130) + ' ' + (330 + (i % 2) * 22) + ' q 13 -7 26 0'} fill="none" stroke="#ffffff" strokeWidth="1.5" opacity="0.55" />
          ))}
          <g transform={'translate(' + personX + ' ' + (y - 4) + ')'}>
            <Shadow cx={0} cy={16} rx={14} ry={4} opacity={0.18} />
            <circle cx="0" cy="-28" r="10" fill="#f7e5d3" stroke="#6e4f3a" strokeWidth="1.2" />
            <path d="M-7 -16 Q0 -22 7 -16 L9 6 L-9 6 Z" fill="url(#msBlue)" stroke="#ffffff" strokeWidth="1" />
            <line x1="-9" y1="-6" x2="-20" y2="5" stroke="#6e4f3a" strokeWidth="2.2" strokeLinecap="round" />
            <line x1="9" y1="-6" x2="19" y2="4" stroke="#6e4f3a" strokeWidth="2.2" strokeLinecap="round" />
            <line x1="-5" y1="6" x2="-8" y2="19" stroke="#405a68" strokeWidth="2.4" strokeLinecap="round" />
            <line x1="5" y1="6" x2="8" y2="19" stroke="#405a68" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="14" cy="2" r="3" fill="#ffd37a" />
          </g>
          <path d={'M' + (sx - boatW / 2) + ' 204 L' + (sx + boatW / 2) + ' 204'} stroke={WARN} strokeWidth="1.2" strokeDasharray="4 4" opacity="0.6" />
          <Arrow x1={sx} y1={210} x2={sx + g.sb * 54} y2={210} color={WARN} width={2.4} />
          <Tag x={sx + g.sb * 54} y={200} text={'船位移 ' + g.sb.toFixed(2) + ' m'} color={WARN} />
          <Arrow x1={personX} y1={116} x2={personX + g.sp * 54} y2={116} color={BLUE} width={2.4} />
          <Tag x={personX + g.sp * 54} y={106} text={'人 ' + g.sp.toFixed(2) + ' m'} color={BLUE} />
          <path d={'M' + (personX - 8) + ' 300 q 5 8 16 0'} fill="none" stroke="#ffffff" strokeWidth="1.4" opacity="0.8" />
          <Tag x={380} y={380} text={'船长 ' + g.L.toFixed(1) + ' m · 人相对船 ' + g.walk.toFixed(2) + ' m · m人 ' + g.mp.toFixed(0) + ' kg'} color={SOFT} />
          <Tag x={650} y={284} text={'m船 ' + g.mb.toFixed(0) + ' kg'} color={SOFT} />
          <line x1={sx - boatW / 2} y1={344} x2={sx + boatW / 2} y2={344} stroke={LINE} strokeWidth="1" />
          <text x={sx - boatW / 2} y="362" fontSize="10" fill={SOFT} fontFamily="'IBM Plex Sans SC', sans-serif">船头</text>
          <text x={sx + boatW / 2} y="362" textAnchor="end" fontSize="10" fill={SOFT} fontFamily="'IBM Plex Sans SC', sans-serif">船尾</text>
        </g>
      )
    }

    case 'board': {
      const boardX = 210 + g.xB * 30
      const blockX = 210 + g.xA * 30
      return (
        <g>
          <rect x={boardX} y="298" width="330" height="34" rx="5" fill="url(#msWood)" stroke="#ffffff" strokeWidth="1" />
          <line x1={boardX + 12} y1="306" x2={boardX + 318} y2="306" stroke="#fff4df" strokeWidth="1" opacity="0.4" />
          <Crate x={blockX - 24} y={252} w={48} h={42} tone="metal" />
          <text x={blockX} y="279" textAnchor="middle" fontSize="12" fill={INK} fontWeight="600" fontFamily="'IBM Plex Sans SC', sans-serif">m</text>
          <Arrow x1={blockX} y1={236} x2={blockX + g.vA * 18} y2={236} color={BLUE} width={2.4} />
          <text x={blockX + g.vA * 18 + 5} y="233" fontSize="11" fill={BLUE} fontFamily="'IBM Plex Sans SC', sans-serif">v</text>
          <Arrow x1={boardX + 80} y1={282} x2={boardX + 80 + g.vB * 22} y2={282} color={WARN} width={2.4} />
          <text x={boardX + 80 + g.vB * 22 + 5} y="279" fontSize="11" fill={WARN} fontFamily="'IBM Plex Sans SC', sans-serif">V</text>
          <path d={'M' + (boardX + 8) + ' 289 l 12 0'} stroke={RED} strokeWidth="2" />
          <text x={boardX + 24} y="292" fontSize="10" fill={RED} fontFamily="'IBM Plex Sans SC', sans-serif">f</text>
          <Bracket x1={blockX} x2={blockX + Math.min(g.sRel, g.L) * 32} y={356} text={'相对位移 ' + Math.min(g.sRel, g.L).toFixed(2) + ' m'} color={g.off ? WARN : SOFT} />
          <Tag x={120} y={300} text={'木板 M'} color={SOFT} />
          <Tag x={120} y={262} text={'滑块 m'} color={SOFT} />
          <Tag x={380} y={398} text={g.off ? '滑块已滑出木板' : '摩擦力使滑块减速、木板加速，直到共速'} color={g.off ? WARN : SOFT} />
        </g>
      )
    }

    case 'belt': {
      const blockX = 210 + Math.min(g.s, g.L) * 66
      return (
        <g>
          <path d="M190 258 H570 A26 26 0 0 1 570 310 H190 A26 26 0 0 1 190 258 Z" fill="#dfe9ec" stroke="#9fb6be" strokeWidth="1.2" opacity="0.85" />
          <circle cx="190" cy="284" r="26" fill="url(#msMetal)" stroke="#ffffff" strokeWidth="1.2" />
          <circle cx="570" cy="284" r="26" fill="url(#msMetal)" stroke="#ffffff" strokeWidth="1.2" />
          <circle cx="190" cy="284" r="8" fill="#9fb6be" />
          <circle cx="570" cy="284" r="8" fill="#9fb6be" />
          <Flow d="M190 258 H570" color={BLUE} width={2.2} offset={t * 28} />
          <Flow d="M570 310 H190" color={BLUE} width={2.2} offset={t * 28} reverse />
          <Crate x={blockX - 24} y={222} w={48} h={36} tone="warm" />
          <Shadow cx={blockX} cy={264} rx={28} ry={5} opacity={0.18} />
          <Arrow x1={blockX} y1={210} x2={blockX + g.v * 16} y2={210} color={INK} width={2.2} />
          <Arrow x1={270} y1={244} x2={270 + g.vb * 22} y2={244} color={WARN} width={2} />
          <text x={270 + g.vb * 22 + 5} y="241" fontSize="10" fill={WARN} fontFamily="'IBM Plex Sans SC', sans-serif">v带</text>
          <Lamp x={690} y={284} on={g.tAcc < 9} />
          <Tag x={380} y={388} text={'物块位移 ' + Math.min(g.s, g.L).toFixed(2) + ' m · 共速时间 ' + g.tAcc.toFixed(2) + ' s'} color={SOFT} />
        </g>
      )
    }

    case 'pursuit': {
      const aX = 110 + g.xA * 7
      const bX = 110 + g.xB * 7
      return (
        <g>
          <rect x="30" y="300" width="700" height="62" rx="12" fill="#dfe3e2" />
          <line x1="30" y1="331" x2="730" y2="331" stroke="#ffffff" strokeWidth="2" strokeDasharray="22 18" opacity="0.8" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={i} x={74 + i * 112} y="322" width="54" height="3" rx="1.5" fill="#ffffff" opacity="0.5" />
          ))}
          <g>
            <Shadow cx={aX + 30} cy={300} rx={38} ry={6} opacity={0.18} />
            <path d={'M' + aX + ' 274 q 4 -16 20 -16 h 20 q 16 0 20 16 l 4 24 h -70 z'} fill="url(#msBlue)" stroke="#ffffff" strokeWidth="1.2" />
            <circle cx={aX + 16} cy={300} r="7" fill="#22333d" /><circle cx={aX + 52} cy={300} r="7" fill="#22333d" />
            <text x={aX + 34} y="286" textAnchor="middle" fontSize="11" fill="#ffffff" fontWeight="600">A</text>
          </g>
          <g>
            <Shadow cx={bX + 30} cy={300} rx={38} ry={6} opacity={0.18} />
            <path d={'M' + bX + ' 274 q 4 -16 20 -16 h 20 q 16 0 20 16 l 4 24 h -70 z'} fill="url(#msWarm)" stroke="#ffffff" strokeWidth="1.2" />
            <circle cx={bX + 16} cy={300} r="7" fill="#22333d" /><circle cx={bX + 52} cy={300} r="7" fill="#22333d" />
            <text x={bX + 34} y="286" textAnchor="middle" fontSize="11" fill="#5a4022" fontWeight="600">B</text>
          </g>
          <line x1={aX + 68} y1={254} x2={bX} y2={254} stroke={WARN} strokeWidth="1.1" strokeDasharray="4 4" opacity="0.6" />
          <Bracket x1={aX + 68} x2={bX} y={246} text={'间距 ' + g.sep.toFixed(1) + ' m'} color={WARN} />
          <Arrow x1={aX + 20} y1={234} x2={aX + 20 + g.vA * 6} y2={234} color={BLUE} width={2} />
          <Tag x={380} y={388} text={g.tCatch > 0 ? '追上时间 ' + g.tCatch.toFixed(2) + ' s' : '后车不加速，追不上'} color={g.tCatch > 0 ? SOFT : WARN} />
        </g>
      )
    }

    case 'connected': {
      return (
        <g>
          <rect x="110" y="212" width="420" height="14" rx="5" fill="url(#msWood)" />
          <rect x="110" y="226" width="420" height="5" fill="#8a684a" opacity="0.35" />
          <Crate x={210} y={164} w={58} h={48} tone="metal" />
          <text x="239" y="193" textAnchor="middle" fontSize="13" fill={INK} fontWeight="600">m₁</text>
          <circle cx="532" cy="206" r="19" fill="url(#msMetal)" stroke="#ffffff" strokeWidth="1.2" />
          <circle cx="532" cy="206" r="5" fill="#7f939d" />
          <path d="M268 184 H516 Q532 184 532 198" fill="none" stroke={SOFT} strokeWidth="1.6" />
          <path d="M532 220 V282" fill="none" stroke={SOFT} strokeWidth="1.6" />
          <Crate x={506} y={282} w={52} h={38} tone="wood" />
          <text x="532" y="306" textAnchor="middle" fontSize="12" fill="#5a4022">m₂</text>
          <Arrow x1={239} y1={224} x2={239 + g.a * 28} y2={224} color={BLUE} width={2.2} />
          <text x={239 + g.a * 28 + 5} y="222" fontSize="11" fill={BLUE}>a</text>
          <Arrow x1={400} y1={200} x2={400 + g.T * 7} y2={200} color={WARN} width={2} />
          <text x={400 + g.T * 7 + 4} y="194" fontSize="10" fill={WARN}>T</text>
          <Tag x={380} y={384} text={'a = ' + g.a.toFixed(2) + ' m/s² · T = ' + g.T.toFixed(2) + ' N'} color={SOFT} />
        </g>
      )
    }

    case 'orbit': {
      const cx = 380
      const cy = 218
      if (g.mode === 1) {
        const R = 148
        const px = cx + R * Math.cos(g.th)
        const py = cy + R * Math.sin(g.th)
        return (
          <g>
            <circle cx={cx} cy={cy} r="62" fill="url(#msGlow)" opacity="0.25" />
            <circle cx={cx} cy={cy} r="38" fill="url(#msBlue)" stroke="#bfeaff" strokeWidth="1.2" />
            <path d={'M' + (cx - 22) + ' ' + (cy - 12) + ' q 18 -10 36 4 q -4 16 -20 18 q -20 -4 -16 -22'} fill="#5aa0c4" opacity="0.7" />
            <circle cx={cx} cy={cy} r={R} fill="none" stroke="#8fcbe4" strokeDasharray="4 6" opacity="0.6" />
            <circle cx={cx} cy={cy} r={R} fill="none" stroke="url(#msTrail)" strokeWidth="2" strokeDasharray="80 360" strokeDashoffset={-t * 60} />
            <g transform={'translate(' + px + ' ' + (py - 14) + ')'}>
              <rect x="-17" y="-7" width="34" height="14" rx="2" fill="url(#msMetal)" stroke="#ffffff" />
              <rect x="-30" y="-3" width="12" height="6" fill="#5d93b6" /><rect x="18" y="-3" width="12" height="6" fill="#5d93b6" />
              <circle cx="0" cy="0" r="5" fill="#e8c87a" />
            </g>
            <Arrow x1={px} y1={py} x2={px - 42 * Math.sin(g.th)} y2={py + 42 * Math.cos(g.th)} color={WARN} width={2} />
            <Tag x={cx} y={402} text={'r = ' + (g.r / 1000).toFixed(0) + ' km · T = ' + (g.T / 60).toFixed(1) + ' min'} color={SOFT} />
          </g>
        )
      }
      const r1 = Math.max(34, Math.min(150, g.r1 * 11))
      const r2 = Math.max(34, Math.min(150, g.r2 * 11))
      const m1x = cx - r1 * Math.cos(g.th)
      const m1y = cy - r1 * Math.sin(g.th)
      const m2x = cx + r2 * Math.cos(g.th)
      const m2y = cy + r2 * Math.sin(g.th)
      return (
        <g>
          <circle cx={cx} cy={cy} r={r1} fill="none" stroke="#87c8e3" strokeDasharray="4 6" opacity="0.55" />
          <circle cx={cx} cy={cy} r={r2} fill="none" stroke="#e6c489" strokeDasharray="4 6" opacity="0.55" />
          <circle cx={cx} cy={cy} r="5" fill="#ffffff" opacity="0.8" />
          <circle cx={m1x} cy={m1y} r="21" fill="url(#msBlue)" stroke="#ffffff" strokeWidth="1.2" />
          <text x={m1x} y={m1y + 5} textAnchor="middle" fontSize="11" fill="#ffffff" fontWeight="600">M₁</text>
          <circle cx={m2x} cy={m2y} r="15" fill="url(#msWarm)" stroke="#ffffff" strokeWidth="1.2" />
          <text x={m2x} y={m2y + 4} textAnchor="middle" fontSize="10" fill="#5a4022" fontWeight="600">M₂</text>
          <line x1={m1x} y1={m1y} x2={m2x} y2={m2y} stroke="#a9d9ee" strokeWidth="0.9" strokeDasharray="3 4" opacity="0.5" />
          <Tag x={cx} y={402} text={'r₁:r₂ = ' + g.ratio.toFixed(2) + ' · T = ' + g.T.toFixed(1) + ' s'} color={SOFT} />
        </g>
      )
    }

    case 'charge': {
      const cx = 380
      const cy = 218
      const r = Math.max(54, Math.min(150, g.r * 1050))
      const px = cx + r * Math.cos(g.th)
      const py = cy + r * Math.sin(g.th)
      const trail = Array.from({ length: 22 }, (_, i) => {
        const a = g.th - i * 0.09
        return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
      })
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#9fc7d8" strokeDasharray="4 6" />
          <polyline points={trail.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ')} fill="none" stroke="url(#msTrail)" strokeWidth="2" opacity="0.8" />
          <circle cx={px} cy={py} r="15" fill="url(#msGlow)" />
          <circle cx={px} cy={py} r="8" fill="#ffffff" stroke="#5eb6e8" strokeWidth="1.5" />
          <text x={px + 14} y={py - 8} fontSize="12" fill={INK} fontWeight="600">+q</text>
          <Arrow x1={px} y1={py} x2={px + 38 * Math.cos(g.th + Math.PI / 2)} y2={py + 38 * Math.sin(g.th + Math.PI / 2)} color={WARN} width={2} />
          <text x={cx} y={392} textAnchor="middle" fontSize="11" fill={SOFT}>B 垂直纸面向外 · 洛伦兹力提供向心力</text>
        </g>
      )
    }

    case 'twinRod': {
      const x1 = 228 + g.x1 * 270
      const x2 = 228 + g.x2 * 270
      return (
        <g>
          <rect x="150" y="178" width="500" height="7" rx="3.5" fill="url(#msMetal)" />
          <rect x="150" y="298" width="500" height="7" rx="3.5" fill="url(#msMetal)" />
          <line x1="168" y1="185" x2="168" y2="298" stroke="#8a684a" strokeWidth="3" opacity="0.6" />
          {[250, 380, 510].map((x) => (
            <g key={x}>
              <circle cx={x} cy="110" r="2" fill={SOFT} opacity="0.6" />
              <text x={x} y="98" textAnchor="middle" fontSize="10" fill={SOFT}>× B</text>
            </g>
          ))}
          <rect x={x1 - 7} y="174" width="14" height="132" rx="4" fill="url(#msBlue)" stroke="#ffffff" />
          <rect x={x2 - 7} y="174" width="14" height="132" rx="4" fill="url(#msWarm)" stroke="#ffffff" />
          <text x={x1} y="162" textAnchor="middle" fontSize="11" fill={BLUE}>杆 1</text>
          <text x={x2} y="162" textAnchor="middle" fontSize="11" fill={GOLD}>杆 2</text>
          <Flow d={'M' + x1 + ' 186 H' + x2 + ' V292 H' + x1 + ' Z'} color={BLUE2} width={1.8} offset={t * 35} opacity={0.55} />
          <circle cx={x1} cy="240" r="14" fill="url(#msGlow)" opacity="0.7" />
          <Arrow x1={x1} y1={140} x2={x1 + 34} y2={140} color={BLUE} width={2} />
          <Arrow x1={x2} y1={140} x2={x2 + 24} y2={140} color={WARN} width={2} />
          <Tag x={380} y={382} text={'v共 = ' + g.vf.toFixed(2) + ' m/s · Q = ' + g.heat.toFixed(2) + ' J'} color={SOFT} />
        </g>
      )
    }

    case 'slope': {
      const th = (g.th * Math.PI) / 180
      const x0 = 190
      const y0 = 338
      const len = 360
      const x1 = x0 + len * Math.cos(th)
      const y1 = y0 - len * Math.sin(th)
      const s = Math.min(g.s, 2.8) * 58
      const bx = x0 + s * Math.cos(th)
      const by = y0 - s * Math.sin(th)
      return (
        <g>
          <path d={'M' + x0 + ' ' + y0 + ' L' + x1 + ' ' + y1 + ' L' + x1 + ' ' + y0 + ' Z'} fill="url(#msWood)" stroke="#7a5f43" strokeWidth="1.4" />
          <path d={'M' + x0 + ' ' + y0 + ' L' + x1 + ' ' + y1 + ' L' + x1 + ' ' + y0} fill="none" stroke="#fff4df" strokeWidth="1.4" opacity="0.5" />
          <path d={'M' + (x0 + 24 * Math.cos(th)) + ' ' + (y0 - 24 * Math.sin(th)) + ' a 24 24 0 0 0 ' + (24 * Math.cos(th)) + ' ' + (24 * Math.sin(th))} fill="none" stroke={WARN} strokeWidth="1.2" />
          <text x={x0 + 48} y={y0 - 8} fontSize="11" fill={WARN}>θ = {g.th.toFixed(0)}°</text>
          <g transform={'translate(' + bx + ' ' + by + ')'}>
            <Shadow cx={0} cy={22} rx={26} ry={6} opacity={0.2} />
            <rect x="-25" y="-32" width="50" height="32" rx="4" fill="url(#msMetal)" stroke="#ffffff" transform={'rotate(' + -g.th + ' 0 0)'} />
            <text x="0" y="-10" textAnchor="middle" fontSize="11" fill={INK} transform={'rotate(' + -g.th + ' 0 0)'}>m</text>
            <Arrow x1={-30} y1={-42} x2={-30 + g.N * 5} y2={-42 - g.N * 2} color={BLUE} width={1.8} />
            <Arrow x1={0} y1={-56} x2={0} y2={-16} color={INK} width={2} />
            <Arrow x1={-8} y1={-34} x2={-8 + 28 * Math.cos(th)} y2={-34 + 28 * Math.sin(th)} color={RED} width={1.8} />
          </g>
          <Tag x={380} y={398} text={'a = ' + g.a.toFixed(2) + ' m/s² · N = ' + g.N.toFixed(1) + ' N · f = ' + g.fr.toFixed(1) + ' N'} color={SOFT} />
        </g>
      )
    }

    case 'wave': {
      const cy = 230
      const amp = 78
      const pts: string[] = []
      for (let i = 0; i <= 120; i += 1) {
        const x = 100 + i * 4.7
        const u = Math.sin((i / 120) * Math.PI * 4 + g.th)
        pts.push(x + ',' + (cy - u * amp))
      }
      const cursorX = 100 + ((g.th / (Math.PI * 2)) % 1) * 564
      return (
        <g>
          <line x1="90" y1={cy} x2="680" y2={cy} stroke="#8fb6c9" strokeDasharray="4 5" opacity="0.4" />
          <line x1="90" y1={cy - amp} x2="680" y2={cy - amp} stroke="#f2c978" strokeDasharray="4 4" opacity="0.65" />
          <line x1="90" y1={cy + amp} x2="680" y2={cy + amp} stroke="#f2c978" strokeDasharray="4 4" opacity="0.35" />
          <polyline points={pts.join(' ')} fill="none" stroke="url(#msTrail)" strokeWidth="3" strokeLinecap="round" />
          <circle cx={cursorX} cy={cy - Math.sin(((cursorX - 100) / 564) * Math.PI * 4 + g.th) * amp} r="9" fill="url(#msGlow)" />
          <circle cx={cursorX} cy={cy - Math.sin(((cursorX - 100) / 564) * Math.PI * 4 + g.th) * amp} r="4" fill="#ffffff" stroke={BLUE2} strokeWidth="1.5" />
          <text x="104" y={cy - amp - 8} fontSize="11" fill="#f2c978">Um = {g.Um.toFixed(0)} V</text>
          <text x="640" y={cy + 26} fontSize="10" fill="#bfe6f7">T = {(g.T * 1000).toFixed(1)} ms</text>
          <rect x="104" y="318" width="210" height="26" rx="13" fill="#ffffff" opacity="0.12" />
          <text x="118" y="335" fontSize="10" fill="#e9f8ff">U有效 = {g.U.toFixed(1)} V</text>
          <circle cx="284" cy="331" r="3" fill="#7de1b5" />
          <text x="292" y="335" fontSize="10" fill="#bfe6f7">u = {g.u.toFixed(1)} V</text>
        </g>
      )
    }

    case 'levels': {
      if (g.mode === 1) {
        return (
          <g>
            <rect x="150" y="294" width="460" height="26" rx="6" fill="url(#msBlue)" stroke="#ffffff" />
            <text x="164" y="312" fontSize="11" fill="#ffffff">金属板</text>
            {[0, 1, 2].map((i) => (
              <g key={i}>
                <path d={'M84 ' + (124 + i * 34) + ' q 26 -12 52 0'} fill="none" stroke="#e8c87a" strokeWidth="2" />
                <circle cx={82 + i * 6} cy={124 + i * 34} r="3" fill="#e8c87a" />
                <Arrow x1={118 + i * 6} y1={124 + i * 34} x2={222 + i * 10} y2={256 + i * 10} color="#c49a4a" width={1.8} />
              </g>
            ))}
            <text x="78" y="86" fontSize="11" fill={GOLD}>光子 E = {g.Eph.toFixed(2)} eV</text>
            <circle cx="390" cy="286" r="12" fill="url(#msGlow)" />
            <circle cx="390" cy="286" r="6" fill="#ffffff" stroke={BLUE2} strokeWidth="1.4" />
            <Arrow x1={414} y1={270} x2={414 + Math.min(180, g.Kmax * 42)} y2={160} color={BLUE} width={2.4} />
            <text x="424" y="160" fontSize="11" fill={BLUE}>电子 Ekmax = {g.Kmax.toFixed(2)} eV</text>
            <Tag x={380} y={392} text={'逸出功 W = ' + g.W.toFixed(2) + ' eV'} color={SOFT} />
          </g>
        )
      }
      const levels = [1, 2, 3, 4].map((n) => ({ n, y: 320 - (n - 1) * 58, E: -13.6 / (n * n) }))
      const y1 = levels[Math.min(3, Math.max(0, g.n1 - 1))].y
      const y2 = levels[Math.min(3, Math.max(0, g.n2 - 1))].y
      return (
        <g>
          <rect x="190" y="58" width="330" height="310" rx="16" fill="#ffffff" opacity="0.55" stroke="#d5e4eb" />
          {levels.map((l) => (
            <g key={l.n}>
              <rect x="222" y={l.y - 3} width="260" height="6" rx="3" fill="url(#msMetal)" />
              <circle cx="222" cy={l.y} r="5" fill={l.n === 1 ? BLUE : GOLD} opacity={0.8} />
              <text x="204" y={l.y + 4} textAnchor="end" fontSize="11" fill={INK}>n={l.n}</text>
              <text x="494" y={l.y + 4} fontSize="10" fill={SOFT}>{l.E.toFixed(2)} eV</text>
            </g>
          ))}
          <path d={'M440 ' + y1 + ' Q470 ' + ((y1 + y2) / 2) + ' 440 ' + y2} fill="none" stroke={WARN} strokeWidth="2" />
          <Arrow x1={440} y1={y1} x2={440} y2={y2} color={WARN} width={2.4} />
          <circle cx={420} cy={(y1 + y2) / 2} r="14" fill="url(#msGlow)" />
          <circle cx={420} cy={(y1 + y2) / 2} r="5" fill="#ffffff" stroke={BLUE2} />
          <text x="454" y={(y1 + y2) / 2 + 4} fontSize="11" fill={WARN}>hν = {g.dE.toFixed(2)} eV</text>
          <Tag x={380} y={402} text={'λ = ' + g.lambda.toFixed(0) + ' nm · ' + (g.n2 > g.n1 ? '吸收光子' : '放出光子')} color={SOFT} />
        </g>
      )
    }

    case 'cyclotron': {
      const cx = 380
      const cy = 218
      const ph = g.phase
      const rr = 20 + (ph / (Math.PI * 2)) * 96
      const px = cx + rr * Math.cos(ph * 2.2)
      const py = cy + rr * Math.sin(ph * 2.2)
      return (
        <g>
          <path d={'M ' + (cx - 154) + ' ' + (cy - 94) + ' a 94 94 0 0 0 0 188 l 0 -188 Z'} fill="url(#msMetal)" stroke="#ffffff" strokeWidth="1.2" />
          <path d={'M ' + (cx + 154) + ' ' + (cy - 94) + ' a 94 94 0 0 1 0 188 l 0 -188 Z'} fill="url(#msMetal)" stroke="#ffffff" strokeWidth="1.2" />
          <line x1={cx} y1={cy - 108} x2={cx} y2={cy + 108} stroke="#8fb6c9" strokeDasharray="4 5" opacity="0.6" />
          <g opacity="0.55" stroke={BLUE2} strokeWidth="1">
            {[70, 120, 170].map((r) => <circle key={r} cx={cx} cy={cy} r={r} fill="none" strokeDasharray="3 8" />)}
          </g>
          <circle cx={px} cy={py} r="14" fill="url(#msGlow)" />
          <circle cx={px} cy={py} r="6" fill="#ffffff" stroke={BLUE2} strokeWidth="1.5" />
          {Array.from({ length: 5 }).map((_, i) => (
            <text key={i} x={cx - 70 + i * 35} y={cy + 48} fontSize="10" fill={SOFT}>× B</text>
          ))}
          <Arrow x1={cx - 210} y1={cy} x2={cx - 170} y2={cy} color={WARN} width={2} />
          <Arrow x1={cx + 170} y1={cy} x2={cx + 210} y2={cy} color={WARN} width={2} />
          <Tag x={380} y={404} text={'f = ' + (g.freq / 1e6).toFixed(2) + ' MHz · Ekmax = ' + g.Kmax.toFixed(1) + ' MeV'} color={SOFT} />
        </g>
      )
    }

    case 'collision': {
      const x1 = g.x1
      const x2 = g.x2
      const hit = g.hit
      const near = Math.abs(g.phase - hit) < 0.16
      const explosion = g.mode === 2
      return (
        <g>
          <rect x="40" y="300" width="680" height="8" rx="4" fill="#b9c4c6" />
          <rect x="40" y="308" width="680" height="34" rx="8" fill="#e2e7e7" />
          {Array.from({ length: 9 }).map((_, i) => (
            <rect key={i} x={72 + i * 70} y="312" width="42" height="3" rx="1.5" fill="#ffffff" opacity="0.65" />
          ))}
          <g transform="translate(58 74)">
            <rect width="190" height="92" rx="14" fill="#ffffff" opacity="0.62" stroke={LINE} strokeWidth="0.7" />
            <text x="14" y="22" fontSize="9" fill={SOFT}>系统动能</text>
            <text x="14" y="42" fontSize="10" fill={INK}>碰前 <tspan fontWeight="600">{'0.5·m₁v₁²'}</tspan></text>
            <rect x="14" y="50" width={Math.max(10, Math.min(160, (0.5 * g.m1 * g.v1 * g.v1) * 260))} height="8" rx="4" fill="url(#msBlue)" />
            <text x="14" y="76" fontSize="10" fill={INK}>碰后 <tspan fontWeight="600">{g.loss > 0.0001 ? '动能减少' : '动能守恒'}</tspan></text>
            <rect x="14" y="84" width={Math.max(10, Math.min(160, (0.5 * g.m1 * g.v1 * g.v1 - g.loss) * 260))} height="8" rx="4" fill="url(#msWarm)" />
          </g>
          <circle cx={(x1 + x2) / 2} cy="278" r={near ? 36 : 22} fill="url(#msGlow)" opacity={near ? 0.9 : 0.35} />
          {!explosion && !g.mode && (
            <g opacity={g.phase < hit ? 1 : 0.35}>
              <Crate x={x1 - 22} y={252} w={44} h={44} tone="metal" />
              <text x={x1} y="280" textAnchor="middle" fontSize="12" fill={INK}>m₁</text>
            </g>
          )}
          {g.mode === 1 && (
            <g opacity={g.phase < hit ? 1 : 0.4}>
              <path d={'M' + (x1 - 46) + ' 276 q 18 -8 36 0'} fill="none" stroke="#9ecfe8" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
              <Ball cx={x1} cy={276} r={9} tone="metal" />
              <text x={x1} y="300" textAnchor="middle" fontSize="10" fill={INK}>子弹 m₁</text>
            </g>
          )}
          {!explosion && (
            <g opacity={0.9}>
              <Crate x={x2 - 24} y={248} w={48} h={48} tone="wood" />
              <text x={x2} y="278" textAnchor="middle" fontSize="12" fill="#5a4022">m₂</text>
            </g>
          )}
          {explosion && (
            <g>
              <circle cx={(x1 + x2) / 2} cy="274" r="30" fill="url(#msWarm)" opacity="0.75" />
              {Array.from({ length: 10 }).map((_, i) => {
                const a = (i / 10) * Math.PI * 2
                return <line key={i} x1={(x1 + x2) / 2 + 10 * Math.cos(a)} y1={274 + 10 * Math.sin(a)} x2={(x1 + x2) / 2 + 34 * Math.cos(a)} y2={274 + 34 * Math.sin(a)} stroke="#f4c46a" strokeWidth="2" strokeLinecap="round" />
              })}
              <Crate x={x1 - 28} y={246} w={40} h={40} tone="metal" />
              <Crate x={x2 - 18} y={256} w={36} h={36} tone="wood" />
              <text x={x1 - 8} y="240" fontSize="10" fill={SOFT}>碎片 1</text>
              <text x={x2 + 2} y="250" fontSize="10" fill={SOFT}>碎片 2</text>
            </g>
          )}
          {near && (
            <g>
              <circle cx={(x1 + x2) / 2} cy="272" r="34" fill="url(#msGlow)" />
              {Array.from({ length: 8 }).map((_, i) => {
                const a = (i / 8) * Math.PI * 2
                return <line key={i} x1={(x1 + x2) / 2 + 8 * Math.cos(a)} y1={272 + 8 * Math.sin(a)} x2={(x1 + x2) / 2 + 30 * Math.cos(a)} y2={272 + 30 * Math.sin(a)} stroke="#f6cf82" strokeWidth="2" strokeLinecap="round" />
              })}
            </g>
          )}
          <Arrow x1={x1} y1={222} x2={x1 + 46} y2={222} color={BLUE} width={2.2} />
          <text x={x1 + 52} y="219" fontSize="11" fill={BLUE}>v₁</text>
          <Arrow x1={x2} y1={222} x2={x2 + g.v2 * 16} y2={222} color={WARN} width={2.2} />
          <text x={x2 + g.v2 * 16 + 5} y="219" fontSize="11" fill={WARN}>v₂</text>
          <Tag x={380} y={392} text={explosion ? '爆炸：动量守恒，动能增加' : g.elastic ? '弹性碰撞：动量与动能都守恒' : '完全非弹性：碰后共速，动能损失最大'} color={SOFT} />
        </g>
      )
    }

    case 'pendulum': {
      const L = Math.min(280, 170 + g.L * 70)
      const th = (g.th * Math.PI) / 180
      const px = 380 + L * Math.sin(th)
      const py = 96 + L * Math.cos(th)
      const arc = []
      for (let i = -1; i <= 1; i += 0.04) {
        const a = (i * 13 * Math.PI) / 180
        arc.push((380 + L * Math.sin(a)).toFixed(1) + ',' + (96 + L * Math.cos(a)).toFixed(1))
      }
      return (
        <g>
          <rect x="260" y="82" width="240" height="14" rx="7" fill="url(#msWood)" />
          <circle cx="380" cy="96" r="6" fill={INK} />
          <line x1="380" y1="96" x2={px} y2={py} stroke="#7f939d" strokeWidth="2" />
          <polyline points={arc.join(' ')} fill="none" stroke="#9fc7d8" strokeDasharray="3 5" opacity="0.6" />
          {(() => {
            const a0 = (-g.th0 * Math.PI) / 180
            const a1 = (g.th0 * Math.PI) / 180
            const x0 = 380 + L * Math.sin(a0)
            const y0 = 96 + L * Math.cos(a0)
            const x1 = 380 + L * Math.sin(a1)
            const y1 = 96 + L * Math.cos(a1)
            return (
              <g>
                <path d={'M380 96 L' + x0 + ' ' + y0 + ' A' + L + ' ' + L + ' 0 0 1 ' + x1 + ' ' + y1 + ' Z'} fill="url(#msGlow)" opacity="0.13" />
                {[-1, -0.5, 0.5, 1].map((q) => {
                  const a = (q * g.th0 * Math.PI) / 180
                  return <circle key={q} cx={380 + L * Math.sin(a)} cy={96 + L * Math.cos(a)} r="4" fill="#8fc9df" opacity="0.28" />
                })}
              </g>
            )
          })()}
          <path d={'M380 140 A 44 44 0 0 1 ' + (380 + 44 * Math.sin((g.th0 * Math.PI) / 180)) + ' ' + (96 + 44 * Math.cos((g.th0 * Math.PI) / 180))} fill="none" stroke={GOLD} strokeWidth="1.2" opacity="0.7" />
          <text x="390" y="148" fontSize="10" fill={GOLD}>θ₀</text>
          <Ball cx={px} cy={py} r={22} tone="warm" />
          <line x1={px} y1={py} x2={px} y2={py + 78} stroke={INK} strokeWidth="1.4" strokeDasharray="3 3" opacity="0.5" />
          <Arrow x1={px} y1={py} x2={px} y2={py + 72} color={BLUE} width={1.8} />
          <text x={px + 8} y={py + 74} fontSize="10" fill={BLUE}>mg</text>
          <Arrow x1={px} y1={py} x2={px - 48 * Math.sin(th)} y2={py - 48 * Math.cos(th)} color={WARN} width={1.8} />
          <text x={px - 48 * Math.sin(th) - 14} y={py - 48 * Math.cos(th)} fontSize="10" fill={WARN}>T</text>
          <text x={px + 30} y={py + 16} fontSize="11" fill={INK}>m</text>
          <Tag x={380} y={396} text={'T = ' + g.T.toFixed(2) + ' s · θ = ' + g.th.toFixed(1) + '° · g = ' + G.toFixed(1) + ' m/s²'} color={SOFT} />
        </g>
      )
    }

    case 'springOsc': {
      const x = g.x
      const kx = 240 + x * 620
      const spring = []
      for (let i = 0; i <= 16; i += 1) {
        const t2 = i / 16
        spring.push((170 + t2 * (kx - 170)).toFixed(1) + ',' + (260 + (i % 2 === 0 ? -16 : 16) * Math.sin(t2 * Math.PI)).toFixed(1))
      }
      return (
        <g>
          <rect x="130" y="120" width="24" height="250" rx="6" fill="url(#msWood)" />
          <line x1="154" y1="260" x2={kx - 28} y2="260" stroke="#9fb6be" strokeWidth="2" />
          <polyline points={spring.join(' ')} fill="none" stroke={BLUE} strokeWidth="2.2" strokeLinejoin="round" />
          <Crate x={kx - 30} y={230} w={60} h={60} tone="metal" />
          <text x={kx} y="264" textAnchor="middle" fontSize="12" fill={INK} fontWeight="600">m</text>
          <line x1={kx} y1="212" x2={kx + g.v * 30} y2="212" stroke={WARN} strokeWidth="2" />
          <Arrow x1={kx} y1={212} x2={kx + g.v * 30} y2={212} color={WARN} width={2} />
          <text x={kx + g.v * 30 + 6} y="209" fontSize="11" fill={WARN}>v</text>
          <line x1="380" y1="200" x2="380" y2="320" stroke={SOFT} strokeDasharray="4 4" opacity="0.4" />
          <Tag x={380} y={396} text={'T = ' + g.T.toFixed(2) + ' s · A = ' + (g.A * 100).toFixed(1) + ' cm · E = ' + g.E.toFixed(2) + ' J'} color={SOFT} />
        </g>
      )
    }

    case 'projectile': {
      const x = 130 + g.x * 58
      const y = 150 + g.drop * 72
      const traj = []
      for (let i = 0; i <= 60; i += 1) {
        const tt = (i / 60) * g.tFall
        traj.push((130 + g.v0 * tt * 58).toFixed(1) + ',' + (150 + 0.5 * G * tt * tt * 72).toFixed(1))
      }
      return (
        <g>
          <rect x="70" y="150" width="170" height="10" rx="5" fill="url(#msWood)" />
          <path d="M70 160 L70 338" stroke="#a08a72" strokeWidth="8" opacity="0.35" />
          <rect x="40" y="338" width="690" height="26" rx="10" fill="url(#msGround)" />
          <polyline points={traj.join(' ')} fill="none" stroke={BLUE2} strokeWidth="2" strokeDasharray="4 5" opacity="0.75" />
          <Ball cx={x} cy={y} r={12} tone="warm" />
          <line x1={x} y1={y} x2={x + g.v0 * 12} y2={y} stroke={BLUE} strokeWidth="1.8" />
          <line x1={x} y1={y} x2={x} y2={y + g.vy * 12} stroke={WARN} strokeWidth="1.8" />
          <Bracket x1={130} x2={130 + g.v0 * g.tFall * 58} y={388} text={'射程 ' + (g.v0 * g.tFall).toFixed(2) + ' m'} color={SOFT} />
          <text x="84" y="142" fontSize="11" fill={BLUE}>v₀ = {g.v0.toFixed(1)} m/s</text>
          <Tag x={380} y={414} text={'t = ' + g.tFall.toFixed(2) + ' s · 落地速度 ' + g.vt.toFixed(2) + ' m/s'} color={SOFT} />
        </g>
      )
    }

    case 'vCircle': {
      const cx = 380
      const cy = 220
      const r = 88
      const px = cx + r * Math.cos(g.ang)
      const py = cy + r * Math.sin(g.ang)
      return (
        <g>
          <circle cx={cx} cy={cy} r={r + 7} fill="none" stroke="#a9cbd7" strokeWidth="8" opacity="0.55" />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={BLUE} strokeWidth="2" strokeDasharray="20 8" opacity="0.65" />
          <circle cx={cx} cy={cy} r="8" fill="#a9cbd7" opacity="0.4" />
          <line x1={cx} y1={cy} x2={px} y2={py} stroke={SOFT} strokeDasharray="3 3" />
          <Ball cx={px} cy={py} r={15} tone="blue" />
          <Arrow x1={px} y1={py} x2={px - 38 * Math.cos(g.ang)} y2={py - 38 * Math.sin(g.ang)} color={WARN} width={2} />
          <Arrow x1={px} y1={py} x2={px} y2={py + 34} color={INK} width={1.8} />
          <Tag x={380} y={400} text={'v = ' + g.v.toFixed(2) + ' m/s · vmin = ' + g.vmin.toFixed(2) + ' m/s · ' + (g.complete ? '可通过最高点' : '不能通过')} color={g.complete ? SOFT : WARN} />
        </g>
      )
    }

    case 'singleRod': {
      const x = 380 + Math.sin(t * 0.8) * 34
      return (
        <g>
          <rect x="150" y="178" width="460" height="7" rx="3.5" fill="url(#msMetal)" />
          <rect x="150" y="288" width="460" height="7" rx="3.5" fill="url(#msMetal)" />
          <rect x={x - 7} y="174" width="14" height="122" rx="4" fill="url(#msBlue)" stroke="#ffffff" />
          <rect x="560" y="206" width="42" height="58" rx="5" fill="url(#msMetal)" stroke="#ffffff" />
          <path d={'M150 181 H' + (x - 8) + ' V292 H150'} fill="none" stroke={BLUE} strokeWidth="2" />
          <Flow d={'M' + x + ' 180 H600 V290 H' + x} color={BLUE2} width={1.8} offset={t * 34} opacity={0.7} />
          <Arrow x1={x} y1={148} x2={x + g.F * 14} y2={148} color={WARN} width={2} />
          <text x={x + g.F * 14 + 6} y="145" fontSize="10" fill={WARN}>F安</text>
          <Arrow x1={x} y1={326} x2={x + g.v * 10} y2={326} color={INK} width={2} />
          <text x={x + g.v * 10 + 6} y="329" fontSize="10" fill={INK}>v</text>
          <text x="568" y="200" fontSize="10" fill={SOFT}>R</text>
          <Tag x={380} y={386} text={'E = ' + g.E.toFixed(2) + ' V · I = ' + g.I.toFixed(2) + ' A · P = ' + g.P.toFixed(2) + ' W'} color={SOFT} />
        </g>
      )
    }

    case 'transformer': {
      const n1 = Math.max(4, Math.round((g.n1 / 800) * 10))
      const n2 = Math.max(3, Math.round((g.n2 / 400) * 8))
      return (
        <g>
          <rect x="210" y="118" width="28" height="196" rx="8" fill="url(#msMetal)" stroke="#ffffff" />
          <rect x="522" y="118" width="28" height="196" rx="8" fill="url(#msMetal)" stroke="#ffffff" />
          <rect x="238" y="188" width="284" height="30" rx="8" fill="url(#msMetal)" />
          <g>
            {Array.from({ length: n1 }).map((_, i) => (
              <path key={i} d={'M' + (230 - i * 1.4) + ' ' + (142 + i * 15) + ' q -30 8 0 16'} fill="none" stroke={BLUE} strokeWidth="3" opacity={0.8 - i * 0.025} />
            ))}
            <text x="176" y="108" textAnchor="middle" fontSize="10" fill={BLUE}>n₁ = {g.n1.toFixed(0)}</text>
          </g>
          <g>
            {Array.from({ length: n2 }).map((_, i) => (
              <path key={i} d={'M' + (530 + i * 1.4) + ' ' + (146 + i * 18) + ' q 30 8 0 16'} fill="none" stroke={GOLD} strokeWidth="3" opacity={0.8 - i * 0.025} />
            ))}
            <text x="584" y="108" textAnchor="middle" fontSize="10" fill={GOLD}>n₂ = {g.n2.toFixed(0)}</text>
          </g>
          <path d="M120 260 H204" stroke={BLUE} strokeWidth="2" />
          <path d="M558 260 H646" stroke={GOLD} strokeWidth="2" />
          <text x="112" y="254" textAnchor="end" fontSize="10" fill={SOFT}>U₁</text>
          <text x="654" y="254" fontSize="10" fill={SOFT}>U₂</text>
          <rect x="108" y="272" width="34" height="18" rx="4" fill="#ffffff" stroke={LINE} />
          <text x="125" y="285" textAnchor="middle" fontSize="9" fill={SOFT}>AC</text>
          <g opacity="0.6">
            <path d="M650 300 q 26 -46 60 0" fill="none" stroke={GOLD} strokeWidth="1.5" />
            <path d="M690 240 v70 M678 258 h24 M678 280 h24" stroke="#a08a72" strokeWidth="1.4" />
            <path d="M690 240 q 50 10 40 60" fill="none" stroke="#a08a72" strokeWidth="1.2" strokeDasharray="4 4" />
          </g>
          <Tag x={380} y={398} text={'U₂ = ' + g.U2.toFixed(1) + ' V · P损 = ' + g.loss.toFixed(1) + ' W · η = ' + (g.eff * 100).toFixed(1) + '%'} color={SOFT} />
        </g>
      )
    }

    case 'circuit': {
      const I = g.I
      return (
        <g>
          <rect x="180" y="140" width="390" height="200" rx="18" fill="#ffffff" opacity="0.55" stroke="#d5e4eb" />
          <path d="M220 300 H560 V200 H440 M340 300 V200 M220 200 H220 V300" fill="none" stroke={BLUE} strokeWidth="2.4" />
          <rect x="200" y="286" width="48" height="28" rx="4" fill="url(#msMetal)" />
          <text x="224" y="304" textAnchor="middle" fontSize="11" fill={INK}>E</text>
          <rect x="318" y="286" width="52" height="28" rx="5" fill="url(#msWarm)" opacity="0.7" />
          <text x="344" y="304" textAnchor="middle" fontSize="10" fill="#5a4022">r</text>
          <rect x="452" y="186" width="52" height="28" rx="5" fill="url(#msMetal)" />
          <text x="478" y="204" textAnchor="middle" fontSize="10" fill={INK}>R</text>
          <circle cx="220" cy="200" r="15" fill="#ffffff" stroke={BLUE} strokeWidth="2" />
          <text x="220" y="205" textAnchor="middle" fontSize="11" fill={BLUE}>A</text>
          <circle cx="560" cy="200" r="15" fill="#ffffff" stroke={WARN} strokeWidth="2" />
          <text x="560" y="205" textAnchor="middle" fontSize="11" fill={WARN}>V</text>
          <Flow d="M244 300 H318 M370 300 H560 V200" color={BLUE2} width={1.8} offset={t * I * 40} opacity={0.7} />
          <Tag x={380} y={390} text={'I = ' + I.toFixed(3) + ' A · U = ' + g.U.toFixed(2) + ' V · η = ' + (g.eff * 100).toFixed(1) + '%'} color={SOFT} />
        </g>
      )
    }

    case 'energy': {
      const drop = g.drop
      const bx = 240 + drop * 60
      const by = 150 + (g.h - drop) * 90
      return (
        <g>
          <path d="M120 338 Q260 220 400 260 Q560 304 660 190" fill="none" stroke="#a9cbd7" strokeWidth="9" opacity="0.6" strokeLinecap="round" />
          <path d="M120 338 Q260 220 400 260 Q560 304 660 190" fill="none" stroke={BLUE} strokeWidth="2" strokeDasharray="4 8" opacity="0.7" />
          <Ball cx={bx} cy={by} r={14} tone="blue" />
          <line x1={bx} y1={by} x2={bx} y2={by + 94} stroke={SOFT} strokeDasharray="3 4" opacity="0.5" />
          <Bracket x1={bx} x2={bx} y={by + 84} text={'h = ' + (g.h - drop).toFixed(2) + ' m'} color={SOFT} />
          <rect x="540" y="130" width="92" height="150" rx="10" fill="#ffffff" opacity="0.6" stroke="#d5e4eb" />
          <text x="560" y="152" fontSize="10" fill={SOFT}>能量</text>
          <rect x="560" y={262 - Math.min(90, (g.m * G * (g.h - drop)) / g.E * 90)} width="26" height={Math.min(90, (g.m * G * (g.h - drop)) / g.E * 90)} rx="4" fill="url(#msWarm)" />
          <rect x="592" y={262 - Math.min(90, (g.m * G * drop) / g.E * 90)} width="26" height={Math.min(90, (g.m * G * drop) / g.E * 90)} rx="4" fill="url(#msBlue)" />
          <text x="560" y="276" fontSize="8" fill={GOLD}>Ep</text>
          <text x="592" y="276" fontSize="8" fill={BLUE}>Ek</text>
          <Tag x={380} y={396} text={'v = ' + g.v.toFixed(2) + ' m/s · E = ' + g.E.toFixed(2) + ' J · 机械能守恒'} color={SOFT} />
        </g>
      )
    }

    default:
      return <Tag x={380} y={220} text="模型演示" color={SOFT} />
  }
}