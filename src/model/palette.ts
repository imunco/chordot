/** 曲线配色：低饱和、彼此可区分，仍然保持纸面插画的调子 */
export const CURVE_COLORS = [
  '#3d5a66',
  '#8a5a3c',
  '#5a7a52',
  '#7a5c8a',
  '#9a5b4a',
  '#4a6b8a',
  '#6b6b4a',
  '#8a4a6a',
]

/** 按当前已有曲线数取下一个颜色，尽量不撞色 */
export function nextCurveColor(used: string[]): string {
  const taken = new Set(used)
  for (const c of CURVE_COLORS) if (!taken.has(c)) return c
  return CURVE_COLORS[used.length % CURVE_COLORS.length]
}
