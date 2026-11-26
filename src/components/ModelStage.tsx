import type { LabExperiment, LabModel } from '../lab/types'
import { Arrow, Tag, INK, SOFT, WARN, LINE } from './labkit'

/**
 * 模型专题的通用画布。
 * 每个模型只画最关键的两三个物体和箭头，把注意力留给「位移关系 / 速度关系 / 能量关系」。
 */
export function ModelStage({ exp, m }: { exp: LabExperiment; m: LabModel }) {
  const g = m.g
  const type = exp.modelType ?? 'boat'
  switch (type) {
    case 'boat': {
      const boatW = Math.min(260, Math.max(110, g.L * 56))
      const sx = 380 + g.sb * 46
      const personX = sx - boatW / 2 + g.walk * 46
      const personY = 258
      return (
        <g>
          <rect x="40" y="300" width="680" height="88" fill="#e7eef0" stroke={LINE} strokeWidth="1" />
          {[80, 180, 280, 380, 480, 580, 680].map((x) => (
            <path key={x} d={'M' + x + ' 318 q 14 -8 28 0'} stroke="#c3d5d8" strokeWidth="1.4" fill="none" />
          ))}
          <polygon
            points={(sx - boatW / 2) + ',278 ' + (sx + boatW / 2) + ',278 ' + (sx + boatW / 2 - 20) + ',310 ' + (sx - boatW / 2 + 20) + ',310'}
            fill="#f2e8d8"
            stroke="#7a5f43"
            strokeWidth="1.6"
          />
          <line x1={sx - boatW / 2} y1="278" x2={sx + boatW / 2} y2="278" stroke="#7a5f43" strokeWidth="2" />
          <circle cx={personX} cy={personY - 18} r="10" fill="#fff" stroke={INK} strokeWidth="1.6" />
          <line x1={personX} y1={personY - 8} x2={personX} y2={personY + 18} stroke={INK} strokeWidth="2" />
          <line x1={personX} y1={personY} x2={personX - 12} y2={personY + 10} stroke={INK} strokeWidth="1.8" />
          <line x1={personX} y1={personY} x2={personX + 12} y2={personY + 10} stroke={INK} strokeWidth="1.8" />
          <line x1={personX} y1={personY + 18} x2={personX - 9} y2={personY + 32} stroke={INK} strokeWidth="1.8" />
          <line x1={personX} y1={personY + 18} x2={personX + 9} y2={personY + 32} stroke={INK} strokeWidth="1.8" />
          <Arrow x1={sx} y1={200} x2={sx + g.sb * 46} y2={200} color={WARN} dashed />
          <Tag x={sx + g.sb * 46} y={192} text={'船位移 ' + g.sb.toFixed(2) + ' m'} color={WARN} />
          <Arrow x1={300} y1={120} x2={300 + g.sp * 46} y2={120} color={INK} />
          <Tag x={300 + g.sp * 46} y={112} text={'人地位移 ' + g.sp.toFixed(2) + ' m'} color={INK} />
          <Tag x={380} y={352} text={'船长 ' + g.L.toFixed(1) + ' m · 人相对船 ' + g.walk.toFixed(2) + ' m'} color={SOFT} />
          <Tag x={640} y={252} text={'m人 ' + g.mp.toFixed(0) + ' kg'} color={SOFT} />
          <Tag x={640} y={274} text={'m船 ' + g.mb.toFixed(0) + ' kg'} color={SOFT} />
        </g>
      )
    }

    case 'board': {
      const boardX = 260 + g.xB * 34
      const boardW = 300
      const blockX = 260 + g.xA * 34
      return (
        <g>
          <line x1="70" y1="330" x2="690" y2="330" stroke={INK} strokeWidth="2" />
          <rect x={boardX} y="300" width={boardW} height="30" fill="#f2e8d8" stroke="#7a5f43" strokeWidth="1.6" rx="2" />
          <rect x={blockX - 22} y="264" width="44" height="36" fill="#e3e8e6" stroke={INK} strokeWidth="1.6" rx="3" />
          <text x={blockX} y="288" textAnchor="middle" fontSize="12" fill={INK}>m</text>
          <Arrow x1={blockX} y1={248} x2={blockX + g.vA * 18} y2={248} color={INK} />
          <text x={blockX + g.vA * 18 + 4} y={244} fontSize="11" fill={INK}>v</text>
          <Arrow x1={boardX + 80} y1={290} x2={boardX + 80 + g.vB * 22} y2={290} color={WARN} />
          <text x={boardX + 80 + g.vB * 22 + 4} y="286" fontSize="11" fill={WARN}>V</text>
          <Tag x={380} y={370} text={'相对位移 ' + Math.min(g.sRel, g.L).toFixed(2) + ' m' + (g.off ? '（已滑出）' : '')} color={g.off ? WARN : SOFT} />
          <Tag x={130} y={270} text={'木板 M'} color={SOFT} />
          <Tag x={130} y={244} text={'滑块 m'} color={SOFT} />
        </g>
      )
    }

    case 'belt': {
      const blockX = 200 + Math.min(g.s, g.L) * 78
      return (
        <g>
          <line x1="120" y1="330" x2="640" y2="330" stroke={LINE} strokeWidth="1" />
          <circle cx="190" cy="290" r="24" fill="#e7eef0" stroke={INK} strokeWidth="1.5" />
          <circle cx="570" cy="290" r="24" fill="#e7eef0" stroke={INK} strokeWidth="1.5" />
          <line x1="190" y1="266" x2="570" y2="266" stroke={INK} strokeWidth="2.2" />
          <line x1="190" y1="314" x2="570" y2="314" stroke={INK} strokeWidth="2.2" />
          <Arrow x1={260} y1={250} x2={260 + g.vb * 22} y2={250} color={WARN} />
          <text x={260 + g.vb * 22 + 4} y="246" fontSize="11" fill={WARN}>v带</text>
          <rect x={blockX - 22} y="238" width="44" height="28" fill="#e3e8e6" stroke={INK} strokeWidth="1.6" rx="3" />
          <Arrow x1={blockX} y1={222} x2={blockX + g.v * 16} y2={222} color={INK} />
          <Tag x={380} y={370} text={'物块位移 ' + Math.min(g.s, g.L).toFixed(2) + ' m · 同速时间 ' + g.tAcc.toFixed(2) + ' s'} color={SOFT} />
        </g>
      )
    }

    case 'pursuit': {
      const aX = 120 + g.xA * 8
      const bX = 120 + g.xB * 8
      return (
        <g>
          <line x1="60" y1="330" x2="700" y2="330" stroke={INK} strokeWidth="2" />
          <rect x={aX} y="300" width="52" height="26" fill="#e3e8e6" stroke={INK} strokeWidth="1.5" rx="5" />
          <text x={aX + 26} y="318" textAnchor="middle" fontSize="11" fill={INK}>A</text>
          <rect x={bX} y="300" width="52" height="26" fill="#f2e8d8" stroke="#7a5f43" strokeWidth="1.5" rx="5" />
          <text x={bX + 26} y="318" textAnchor="middle" fontSize="11" fill="#7a5f43">B</text>
          <line x1={bX + 52} y1="286" x2={aX} y2="286" stroke={WARN} strokeWidth="1.2" strokeDasharray="4 3" />
          <text x={(aX + bX + 52) / 2} y="280" textAnchor="middle" fontSize="11" fill={WARN}>间距 {g.sep.toFixed(1)} m</text>
          <Tag x={380} y={370} text={'追上时间 ' + (g.tCatch > 0 ? g.tCatch.toFixed(2) + ' s' : '追不上')} color={SOFT} />
        </g>
      )
    }

    case 'connected': {
      return (
        <g>
          <rect x="130" y="220" width="380" height="12" fill="#e6e1d8" stroke={LINE} />
          <rect x="210" y="184" width="54" height="36" fill="#e3e8e6" stroke={INK} strokeWidth="1.5" rx="3" />
          <text x="237" y="207" textAnchor="middle" fontSize="12" fill={INK}>m₁</text>
          <circle cx="540" cy="212" r="18" fill="#e7eef0" stroke={INK} strokeWidth="1.6" />
          <line x1="264" y1="200" x2="522" y2="200" stroke={SOFT} strokeWidth="1.3" />
          <line x1="522" y1="200" x2="540" y2="194" stroke={SOFT} strokeWidth="1.3" />
          <line x1="540" y1="230" x2="540" y2="280" stroke={SOFT} strokeWidth="1.3" />
          <rect x="514" y="280" width="52" height="34" fill="#f2e8d8" stroke="#7a5f43" strokeWidth="1.5" rx="3" />
          <text x="540" y="302" textAnchor="middle" fontSize="12" fill="#7a5f43">m₂</text>
          <Arrow x1={237} y1={240} x2={237 + g.a * 28} y2={240} color={INK} />
          <text x={237 + g.a * 28 + 4} y="236" fontSize="11" fill={INK}>a</text>
          <Tag x={380} y={370} text={'a = ' + g.a.toFixed(2) + ' m/s² · T = ' + g.T.toFixed(2) + ' N'} color={SOFT} />
        </g>
      )
    }

    case 'orbit': {
      const cx = 380
      const cy = 210
      if (g.mode === 1) {
        const r = 150
        const px = cx + r * Math.cos(g.th)
        const py = cy + r * Math.sin(g.th)
        return (
          <g>
            <circle cx={cx} cy={cy} r="34" fill="#9fb0b4" stroke={INK} strokeWidth="1.5" />
            <text x={cx} y={cy + 5} textAnchor="middle" fontSize="12" fill="#fff">地球</text>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={LINE} strokeDasharray="5 4" />
            <circle cx={px} cy={py} r="9" fill="#f2e8d8" stroke="#7a5f43" strokeWidth="1.5" />
            <line x1={cx} y1={cy} x2={px} y2={py} stroke={SOFT} strokeDasharray="3 3" />
            <Tag x={cx} y={390} text={'r = ' + (g.r / 1000).toFixed(0) + ' km · 周期 ' + (g.T / 60).toFixed(1) + ' min'} color={SOFT} />
          </g>
        )
      }
      const r1 = Math.max(30, Math.min(150, g.r1 * 10))
      const r2 = Math.max(30, Math.min(150, g.r2 * 10))
      const m1x = cx - r1 * Math.cos(g.th)
      const m1y = cy - r1 * Math.sin(g.th)
      const m2x = cx + r2 * Math.cos(g.th)
      const m2y = cy + r2 * Math.sin(g.th)
      return (
        <g>
          <circle cx={cx} cy={cy} r={r1} fill="none" stroke={LINE} strokeDasharray="5 4" />
          <circle cx={cx} cy={cy} r={r2} fill="none" stroke={LINE} strokeDasharray="5 4" />
          <circle cx={m1x} cy={m1y} r="16" fill="#e3e8e6" stroke={INK} strokeWidth="1.6" />
          <text x={m1x} y={m1y + 4} textAnchor="middle" fontSize="11" fill={INK}>M₁</text>
          <circle cx={m2x} cy={m2y} r="11" fill="#f2e8d8" stroke="#7a5f43" strokeWidth="1.6" />
          <text x={m2x} y={m2y + 4} textAnchor="middle" fontSize="10" fill="#7a5f43">M₂</text>
          <circle cx={cx} cy={cy} r="3" fill={WARN} />
          <Tag x={cx} y={390} text={'r₁:r₂ = ' + g.ratio.toFixed(2) + ' · T = ' + g.T.toFixed(1) + ' s'} color={SOFT} />
        </g>
      )
    }

    case 'charge': {
      const cx = 380
      const cy = 210
      const r = Math.max(50, Math.min(150, g.r * 1000 + 90))
      const px = cx + r * Math.cos(g.th)
      const py = cy + r * Math.sin(g.th)
      return (
        <g>
          {Array.from({ length: 6 }).map((_, i) =>
            Array.from({ length: 4 }).map((__, j) => (
              <circle key={i + '-' + j} cx={100 + i * 110} cy={80 + j * 90} r="2.2" fill={SOFT} />
            )),
          )}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={INK} strokeDasharray="5 4" />
          <circle cx={px} cy={py} r="8" fill="#e3e8e6" stroke={INK} strokeWidth="1.6" />
          <text x={px + 12} y={py - 8} fontSize="11" fill={INK}>+q</text>
          <Arrow x1={px} y1={py} x2={px + 34 * Math.cos(g.th + Math.PI / 2)} y2={py + 34 * Math.sin(g.th + Math.PI / 2)} color={WARN} />
          <text x={cx} y={390} textAnchor="middle" fontSize="11" fill={SOFT}>B 垂直纸面向外 · r = mv/(qB)</text>
        </g>
      )
    }

    case 'twinRod': {
      const x1 = 220 + g.x1 * 260
      const x2 = 220 + g.x2 * 260
      return (
        <g>
          <line x1="150" y1="180" x2="650" y2="180" stroke={INK} strokeWidth="2" />
          <line x1="150" y1="300" x2="650" y2="300" stroke={INK} strokeWidth="2" />
          <rect x={x1 - 6} y="176" width="12" height="128" fill="#e3e8e6" stroke={INK} strokeWidth="1.6" />
          <rect x={x2 - 6} y="176" width="12" height="128" fill="#f2e8d8" stroke="#7a5f43" strokeWidth="1.6" />
          <text x={x1} y="164" textAnchor="middle" fontSize="11" fill={INK}>杆1</text>
          <text x={x2} y="164" textAnchor="middle" fontSize="11" fill="#7a5f43">杆2</text>
          {[240, 380, 520].map((x) => (
            <text key={x} x={x} y="122" fontSize="12" fill={SOFT}>× B</text>
          ))}
          <Tag x={380} y={370} text={'v共 = ' + g.vf.toFixed(2) + ' m/s · Q = ' + g.heat.toFixed(2) + ' J'} color={SOFT} />
        </g>
      )
    }

    case 'slope': {
      const th = (g.th * Math.PI) / 180
      const x0 = 220
      const y0 = 330
      const len = 300
      const x1 = x0 + len * Math.cos(th)
      const y1 = y0 - len * Math.sin(th)
      const s = Math.min(g.s, 2.6) * 60
      const bx = x0 + s * Math.cos(th)
      const by = y0 - s * Math.sin(th)
      return (
        <g>
          <polygon points={x0 + ',' + y0 + ' ' + x1 + ',' + y1 + ' ' + x1 + ',' + y0} fill="#f2e8d8" stroke="#7a5f43" strokeWidth="1.5" />
          <rect
            x={bx - 20}
            y={by - 30}
            width="40"
            height="26"
            fill="#e3e8e6"
            stroke={INK}
            strokeWidth="1.6"
            rx="3"
            transform={'rotate(' + (-g.th) + ' ' + bx + ' ' + (by - 17) + ')'}
          />
          <text x={(x0 + x1) / 2} y={y0 + 24} fontSize="11" fill={SOFT}>θ = {g.th.toFixed(0)}°</text>
          <Tag x={380} y={390} text={'a = ' + g.a.toFixed(2) + ' m/s² · N = ' + g.N.toFixed(1) + ' N'} color={SOFT} />
        </g>
      )
    }

    case 'wave': {
      const cy = 240
      const amp = 90
      const pts = Array.from({ length: 100 }, (_, i) => {
        const x = 110 + i * 5.4
        const u = Math.sin((i / 100) * Math.PI * 4 + g.th)
        return x + ',' + (cy - u * amp)
      }).join(' ')
      return (
        <g>
          <line x1="100" y1={cy} x2="660" y2={cy} stroke={LINE} strokeDasharray="4 4" />
          <polyline points={pts} fill="none" stroke={INK} strokeWidth="2" />
          <line x1="100" y1={cy - amp} x2="660" y2={cy - amp} stroke={WARN} strokeDasharray="4 3" />
          <text x="108" y={cy - amp - 6} fontSize="11" fill={WARN}>Um = {g.Um.toFixed(0)} V</text>
          <text x="620" y={cy + 18} fontSize="11" fill={SOFT}>T = {(g.T * 1000).toFixed(1)} ms</text>
          <Tag x={380} y={370} text={'U有效 = ' + g.U.toFixed(1) + ' V · 瞬时 u = ' + g.u.toFixed(1) + ' V'} color={SOFT} />
        </g>
      )
    }

    case 'levels': {
      if (g.mode === 1) {
        return (
          <g>
            <line x1="160" y1="330" x2="600" y2="330" stroke={INK} strokeWidth="3" />
            <text x="170" y="318" fontSize="12" fill={INK}>金属板</text>
            <Arrow x1={210} y1={100} x2={320} y2={220} color={WARN} />
            <text x="210" y="90" fontSize="11" fill={WARN}>光子 E = {g.Eph.toFixed(2)} eV</text>
            <circle cx="360" cy="300" r="8" fill="#e3e8e6" stroke={INK} strokeWidth="1.5" />
            <text x="376" y="304" fontSize="11" fill={INK}>电子</text>
            <Arrow x1={380} y1={280} x2={380 + Math.min(200, g.Kmax * 46)} y2={180} color={INK} />
            <Tag x={380} y={390} text={'逸出功 W = ' + g.W.toFixed(2) + ' eV · Ekmax = ' + g.Kmax.toFixed(2) + ' eV'} color={SOFT} />
          </g>
        )
      }
      const levels = [1, 2, 3, 4].map((n) => ({ n, y: 330 - (n - 1) * 62, E: -13.6 / (n * n) }))
      return (
        <g>
          <line x1="220" y1="80" x2="220" y2="360" stroke={LINE} />
          {levels.map((l) => (
            <g key={l.n}>
              <line x1="220" y1={l.y} x2="560" y2={l.y} stroke={INK} strokeWidth="2" />
              <text x="180" y={l.y + 4} textAnchor="end" fontSize="11" fill={INK}>n={l.n}</text>
              <text x="570" y={l.y + 4} fontSize="10" fill={SOFT}>{l.E.toFixed(2)} eV</text>
            </g>
          ))}
          <Arrow x1={420} y1={levels[Math.min(3, g.n1 - 1)].y} x2={420} y2={levels[Math.min(3, g.n2 - 1)].y} color={WARN} />
          <Tag x={380} y={390} text={'ΔE = ' + g.dE.toFixed(2) + ' eV · λ = ' + g.lambda.toFixed(0) + ' nm'} color={SOFT} />
        </g>
      )
    }

    case 'cyclotron': {
      const cx = 380
      const cy = 210
      return (
        <g>
          <path d={'M ' + (cx - 150) + ' ' + (cy - 95) + ' a 95 95 0 0 0 0 190 l 0 -190'} fill="#eef1ef" stroke={INK} strokeWidth="1.6" />
          <path d={'M ' + (cx + 150) + ' ' + (cy - 95) + ' a 95 95 0 0 1 0 190 l 0 -190'} fill="#eef1ef" stroke={INK} strokeWidth="1.6" />
          <line x1={cx} y1={cy - 105} x2={cx} y2={cy + 105} stroke={LINE} strokeDasharray="4 4" />
          <path
            d={Array.from({ length: 90 }, (_, i) => {
              const a = i * 0.38
              const r = 8 + i * 0.9
              return (i === 0 ? 'M ' : 'L ') + (cx + r * Math.cos(a)).toFixed(1) + ' ' + (cy + r * Math.sin(a)).toFixed(1)
            }).join(' ')}
            fill="none"
            stroke={WARN}
            strokeWidth="1.4"
          />
          <Tag x={380} y={390} text={'f = ' + (g.freq / 1e6).toFixed(2) + ' MHz · Ekmax = ' + g.Kmax.toFixed(1) + ' MeV'} color={SOFT} />
        </g>
      )
    }

    default:
      return (
        <g>
          <text x="380" y="210" textAnchor="middle" fontSize="16" fill={SOFT}>模型演示</text>
        </g>
      )
  }
}
