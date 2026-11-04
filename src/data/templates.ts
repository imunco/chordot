import type { SceneSpec, SketchDoc, SketchFunction } from '../kernel/types'
import {
  conflictScene,
  inclineScene,
  pendulumScene,
  projectileScene,
  springScene,
  triangleScene,
} from '../state'

export type TemplateCategory = '数学' | '几何' | '物理' | '三维'

export interface Template {
  id: string
  name: string
  category: TemplateCategory
  /** 二级分类 */
  sub: string
  hint: string
  file: string
  build: () => SceneSpec
}

const fn = (id: string, expr: string, name: string): SketchFunction => ({ id, expr, name })

function sketch(functions: SketchFunction[], doc?: Partial<SketchDoc>): SceneSpec {
  return {
    kind: 'sketch',
    doc: { points: [], segments: [], circles: [], polygons: [], functions, constraints: [], forces: [], ...doc },
  }
}

function poly(points: [number, number][], extra: Partial<SketchDoc> = {}): SceneSpec {
  const pts = points.map(([x, y], i) => ({ id: `p${i + 1}`, x, y, name: String.fromCharCode(65 + i) }))
  const segments = pts.map((p, i) => ({
    id: `s${i + 1}`,
    a: p.id,
    b: pts[(i + 1) % pts.length].id,
  }))
  return {
    kind: 'sketch',
    doc: { points: pts, segments, circles: [], polygons: [], functions: [], constraints: [], forces: [], ...extra },
  }
}

function regular(n: number, r: number, rotate = -Math.PI / 2): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const a = rotate + (i / n) * Math.PI * 2
    return [Math.cos(a) * r, Math.sin(a) * r] as [number, number]
  })
}

type Shape = {
  id: string
  name: string
  type: 'cube' | 'pyramid' | 'prism' | 'tetra' | 'octahedron' | 'sphere'
  center: [number, number, number]
  size: number
  sides?: number
}

function solid(shapes: Shape[], camera?: { azimuth: number; elevation: number }): SceneSpec {
  return {
    kind: 'solid',
    params: {
      shapes,
      camera: {
        azimuth: camera?.azimuth ?? 45,
        elevation: camera?.elevation ?? 25,
        zoom: 1,
        view: 'free',
        perspective: true,
        dist: 14,
      },
    },
  }
}

const one = (shape: Omit<Shape, 'id'>): SceneSpec => solid([{ id: 's1', ...shape }])

export const TEMPLATES: Template[] = [
  /* ───────── 数学 ───────── */
  { id: 'linear', name: '一次函数', category: '数学', sub: '函数图像', hint: 'y = 2x + 1', file: '一次函数.chordot', build: () => sketch([fn('fn1', '2x + 1', 'f1')]) },
  { id: 'quadratic', name: '二次函数', category: '数学', sub: '函数图像', hint: 'y = x² − 2x − 3', file: '二次函数.chordot', build: () => sketch([fn('fn1', 'x^2 - 2x - 3', 'f1')]) },
  { id: 'cubic', name: '三次函数', category: '数学', sub: '函数图像', hint: 'y = x³ − 3x', file: '三次函数.chordot', build: () => sketch([fn('fn1', 'x^3 - 3x', 'f1')]) },
  { id: 'reciprocal', name: '反比例函数', category: '数学', sub: '指数与对数', hint: 'y = 1/x（双支）', file: '反比例.chordot', build: () => sketch([fn('fn1', '1/x', 'f1')]) },
  { id: 'exp', name: '指数衰减', category: '数学', sub: '指数与对数', hint: 'y = e^(−x/3)', file: '指数衰减.chordot', build: () => sketch([fn('fn1', 'exp(-x/3)', 'f1')]) },
  { id: 'exp-grow', name: '指数增长', category: '数学', sub: '指数与对数', hint: 'y = e^(x/2)', file: '指数增长.chordot', build: () => sketch([fn('fn1', 'exp(x/2)', 'f1')]) },
  { id: 'log', name: '对数曲线', category: '数学', sub: '指数与对数', hint: 'y = ln(x)', file: '对数曲线.chordot', build: () => sketch([fn('fn1', 'ln(x)', 'f1')]) },
  { id: 'abs', name: '绝对值', category: '数学', sub: '函数图像', hint: 'y = |x| − 2', file: '绝对值.chordot', build: () => sketch([fn('fn1', 'abs(x) - 2', 'f1')]) },
  { id: 'sine', name: '正弦曲线', category: '数学', sub: '三角函数', hint: 'y = sin(x)', file: '正弦曲线.chordot', build: () => sketch([fn('fn1', 'sin(x)', 'f1')]) },
  { id: 'cosine', name: '余弦曲线', category: '数学', sub: '三角函数', hint: 'y = cos(x)', file: '余弦曲线.chordot', build: () => sketch([fn('fn1', 'cos(x)', 'f1')]) },
  { id: 'tangent', name: '正切曲线', category: '数学', sub: '三角函数', hint: 'y = tan(x)（间断处自动断开）', file: '正切曲线.chordot', build: () => sketch([fn('fn1', 'tan(x)', 'f1')]) },
  { id: 'superpose', name: '三角叠加', category: '数学', sub: '三角函数', hint: 'sin(x) + cos(2x)', file: '三角叠加.chordot', build: () => sketch([fn('fn1', 'sin(x) + cos(2x)', 'f1')]) },
  { id: 'damped', name: '阻尼振荡', category: '数学', sub: '三角函数', hint: 'e^(−x/4)·sin(3x)', file: '阻尼振荡.chordot', build: () => sketch([fn('fn1', 'exp(-x/4) * sin(3x)', 'f1')]) },
  { id: 'gauss', name: '钟形曲线', category: '数学', sub: '指数与对数', hint: 'y = e^(−x²/8)', file: '钟形曲线.chordot', build: () => sketch([fn('fn1', 'exp(-x^2 / 8)', 'f1')]) },
  { id: 'floor', name: '取整函数', category: '数学', sub: '函数图像', hint: 'y = floor(x)', file: '取整函数.chordot', build: () => sketch([fn('fn1', 'floor(x)', 'f1')]) },
  { id: 'sqrt', name: '根式函数', category: '数学', sub: '函数图像', hint: 'y = √x', file: '根式函数.chordot', build: () => sketch([fn('fn1', 'sqrt(x)', 'f1')]) },
  {
    id: 'compare',
    name: '函数对比',
    category: '数学',
    sub: '函数图像',
    hint: 'x²、2x、log₂x 同图',
    file: '函数对比.chordot',
    build: () => sketch([fn('fn1', 'x^2', 'f1'), fn('fn2', '2x', 'f2'), fn('fn3', 'log(x, 2)', 'f3')]),
  },

  { id: 'sq-inv', name: '平方反比', category: '数学', sub: '指数与对数', hint: 'y = 1/x²，双支都为正', file: '平方反比.chordot', build: () => sketch([fn('fn1', '1/x^2', 'f1')]) },
  { id: 'abs-sum', name: '绝对值之和', category: '数学', sub: '函数图像', hint: 'y = |x−1| + |x+1|，折线', file: '绝对值之和.chordot', build: () => sketch([fn('fn1', 'abs(x - 1) + abs(x + 1)', 'f1')]) },
  { id: 'rational', name: '分式函数', category: '数学', sub: '函数图像', hint: 'y = (x+1)/(x−1)', file: '分式函数.chordot', build: () => sketch([fn('fn1', '(x + 1) / (x - 1)', 'f1')]) },
  { id: 'pythag', name: '平方和恒等式', category: '数学', sub: '三角函数', hint: 'sin²x + cos²x ≡ 1', file: '平方和恒等式.chordot', build: () => sketch([fn('fn1', 'sin(x)^2 + cos(x)^2', 'f1')]) },
  { id: 'hyperbola', name: '双曲线上支', category: '数学', sub: '函数图像', hint: 'y = √(x²+1)', file: '双曲线上支.chordot', build: () => sketch([fn('fn1', 'sqrt(x^2 + 1)', 'f1')]) },
  {
    id: 'growth-compare',
    name: '增长对比',
    category: '数学',
    sub: '指数与对数',
    hint: 'y=x²、y=2^x、y=x! 近似（三条曲线分色）',
    file: '增长对比.chordot',
    build: () =>
      sketch([fn('fn1', 'x^2', 'f1'), fn('fn2', '2^x', 'f2'), fn('fn3', 'x^3 / 3', 'f3')]),
  },

  /* ───────── 几何 ───────── */
  { id: 'tri-345', name: '直角三角形', category: '几何', sub: '三角形', hint: '3-4-5 勾股', file: '直角三角形.chordot', build: () => poly([[0, 0], [4, 0], [0, 3]]) },
  {
    id: 'tri-free',
    name: '三角形（可拖）',
    category: '几何',
    sub: '三角形',
    hint: '拖顶点，三边跟着变',
    file: '三角形.chordot',
    build: () => poly([[-2.6, -1.5], [2.6, -1.5], [0.4, 2]]),
  },
  { id: 'tri-iso', name: '等腰三角形', category: '几何', sub: '三角形', hint: '底 5 腰 3.2', file: '等腰三角形.chordot', build: () => poly([[-2.5, -1], [2.5, -1], [0, 2.5]]) },
  {
    id: 'equilateral',
    name: '等边三角形',
    category: '几何',
    sub: '三角形',
    hint: '外接圆半径 2.31',
    file: '等边三角形.chordot',
    build: () => poly(regular(3, 2.31)),
  },
  {
    id: 'square',
    name: '正方形',
    category: '几何',
    sub: '四边形',
    hint: '边长 4',
    file: '正方形.chordot',
    build: () => poly([[-2, -2], [2, -2], [2, 2], [-2, 2]]),
  },
  {
    id: 'rect',
    name: '长方形',
    category: '几何',
    sub: '四边形',
    hint: '6 × 3',
    file: '长方形.chordot',
    build: () => poly([[-3, -1.5], [3, -1.5], [3, 1.5], [-3, 1.5]]),
  },
  { id: 'parallelogram', name: '平行四边形', category: '几何', sub: '四边形', hint: '底 5 高 2.5', file: '平行四边形.chordot', build: () => poly([[-2.5, -1.25], [2.5, -1.25], [3.5, 1.25], [-1.5, 1.25]]) },
  { id: 'trapezoid', name: '梯形', category: '几何', sub: '四边形', hint: '上底 3 下底 6', file: '梯形.chordot', build: () => poly([[-3, -1.25], [3, -1.25], [1.5, 1.25], [-1.5, 1.25]]) },
  { id: 'rhombus', name: '菱形', category: '几何', sub: '四边形', hint: '对角线 6 与 4', file: '菱形.chordot', build: () => poly([[0, -2], [3, 0], [0, 2], [-3, 0]]) },
  { id: 'pentagon', name: '正五边形', category: '几何', sub: '正多边形', hint: '外接圆半径 3', file: '正五边形.chordot', build: () => poly(regular(5, 3)) },
  { id: 'hexagon', name: '正六边形', category: '几何', sub: '正多边形', hint: '外接圆半径 3', file: '正六边形.chordot', build: () => poly(regular(6, 3)) },
  { id: 'octagon', name: '正八边形', category: '几何', sub: '正多边形', hint: '外接圆半径 3', file: '正八边形.chordot', build: () => poly(regular(8, 3)) },
  {
    id: 'circle-square',
    name: '圆与内接正方形',
    category: '几何',
    sub: '圆',
    hint: '半径 3 的圆 + 内接正方形',
    file: '圆与正方形.chordot',
    build: () => {
      const base = poly(regular(4, 2.12, Math.PI / 4))
      if (base.kind !== 'sketch') return base
      return { kind: 'sketch', doc: { ...base.doc, circles: [{ id: 'c1', c: 'p1', r: 3 }] } }
    },
  },
  {
    id: 'unit-circle',
    name: '单位圆',
    category: '几何',
    sub: '圆',
    hint: '半径 1 + 圆心',
    file: '单位圆.chordot',
    build: () => ({
      kind: 'sketch',
      doc: {
        points: [{ id: 'p1', x: 0, y: 0, name: 'O' }],
        segments: [],
        circles: [{ id: 'c1', c: 'p1', r: 1 }],
        polygons: [],
        functions: [],
        constraints: [],
        forces: [],
      },
    }),
  },
  { id: 'triangle-rigid', name: '约束三角形', category: '几何', sub: '约束', hint: '拖动顶点保持 6 / 5 / 4', file: '约束三角形.chordot', build: () => triangleScene() },
  { id: 'triangle-conflict', name: '约束冲突', category: '几何', sub: '约束', hint: '6 / 1 / 1 围不成三角形', file: '约束冲突.chordot', build: () => conflictScene() },

  {
    id: 'force-basic',
    name: '恒力与变力',
    category: '物理',
    sub: '静力学',
    hint: 'F1 恒力 10 N、F2 随时间 F(t)=2t',
    file: '恒力与变力.chordot',
    build: () => ({
      kind: 'sketch',
      doc: {
        points: [
          { id: 'p1', x: -1, y: 0, name: 'O' },
          { id: 'p2', x: 2, y: 0, name: 'P' },
        ],
        segments: [{ id: 's1', a: 'p1', b: 'p2' }],
        circles: [],
        polygons: [],
        functions: [],
        constraints: [],
        forces: [
          {
            id: 'fA',
            name: 'F1',
            expr: '10',
            angle: 30,
            at: [-1, 0],
            kind: 'constant',
          },
          {
            id: 'fB',
            name: 'F2',
            expr: '2t',
            angle: 0,
            at: [2, 0],
            kind: 'time',
          },
        ],
      },
    }),
  },

  {
    id: 'circle-tri',
    name: '圆内接正三角形',
    category: '几何',
    sub: '圆',
    hint: '半径 3 的圆 + 内接等边三角形',
    file: '圆内接三角形.chordot',
    build: () => {
      const base = poly(regular(3, 3))
      if (base.kind !== 'sketch') return base
      return { kind: 'sketch', doc: { ...base.doc, circles: [{ id: 'c1', c: 'p1', r: 3 }] } }
    },
  },
  { id: 'rhombus-diag', name: '菱形对角线', category: '几何', sub: '四边形', hint: '对角线互相垂直平分', file: '菱形对角线.chordot', build: () => poly([[0, -2], [3, 0], [0, 2], [-3, 0]], { segments: [
    { id: 's1', a: 'p1', b: 'p2' },
    { id: 's2', a: 'p2', b: 'p3' },
    { id: 's3', a: 'p3', b: 'p4' },
    { id: 's4', a: 'p4', b: 'p1' },
    { id: 's5', a: 'p1', b: 'p3' },
    { id: 's6', a: 'p2', b: 'p4' },
  ] }) },
  {
    id: 'similar',
    name: '相似三角形',
    category: '几何',
    sub: '三角形',
    hint: '1 : 2 的两个直角三角形',
    file: '相似三角形.chordot',
    build: () =>
      poly([[0, 0], [2, 0], [0, 1.5], [0.6, 0], [2.6, 0], [0.6, 1.5]], {
        segments: [
          { id: 's1', a: 'p1', b: 'p2' },
          { id: 's2', a: 'p2', b: 'p3' },
          { id: 's3', a: 'p3', b: 'p1' },
          { id: 's4', a: 'p4', b: 'p5' },
          { id: 's5', a: 'p5', b: 'p6' },
          { id: 's6', a: 'p6', b: 'p4' },
        ],
        polygons: [
          { id: 'g1', points: ['p1', 'p2', 'p3'] },
          { id: 'g2', points: ['p4', 'p5', 'p6'] },
        ],
      }),
  },
  {
    id: 'hex-diag',
    name: '正六边形与对角线',
    category: '几何',
    sub: '正多边形',
    hint: '三条主对角线交于中心',
    file: '六边形对角线.chordot',
    build: () => {
      const base = poly(regular(6, 3))
      if (base.kind !== 'sketch') return base
      const extra = [
        { id: 's7', a: 'p1', b: 'p4' },
        { id: 's8', a: 'p2', b: 'p5' },
        { id: 's9', a: 'p3', b: 'p6' },
      ]
      return { kind: 'sketch', doc: { ...base.doc, segments: [...base.doc.segments, ...extra] } }
    },
  },

  /* ───────── 物理 ───────── */
  { id: 'incline-15', name: '缓坡受力 15°', category: '物理', sub: '静力学', hint: '小角度对比', file: '缓坡受力.chordot', build: () => inclineScene(15, 0.5, 3, 0.8) },
  { id: 'incline-30', name: '斜面受力 30°', category: '物理', sub: '静力学', hint: '静态平衡，ΣF = 0', file: '斜面受力.chordot', build: () => inclineScene(30) },
  { id: 'incline-45', name: '斜面受力 45°', category: '物理', sub: '静力学', hint: '摩擦因数 0.8', file: '斜面受力45.chordot', build: () => inclineScene(45, 0.5, 3, 0.8) },
  { id: 'incline-60', name: '陡坡受力 60°', category: '物理', sub: '静力学', hint: '大角度，接近自由下滑', file: '陡坡受力.chordot', build: () => inclineScene(60, 0.5, 3, 0.8) },
  { id: 'incline-heavy', name: '重物斜面 30°', category: '物理', sub: '静力学', hint: '质量 8 kg，摩擦 0.9', file: '重物斜面.chordot', build: () => inclineScene(30, 0.5, 8, 0.9) },
  { id: 'incline-slide', name: '斜面下滑', category: '物理', sub: '静力学', hint: '40°、μ=0.15，可跑运动仿真', file: '斜面下滑.chordot', build: () => inclineScene(40, 0.92, 3, 0.15) },
  { id: 'pendulum', name: '单摆', category: '物理', sub: '动力学', hint: '摆长 2.4 m、初始 40°，可跑仿真', file: '单摆.chordot', build: () => pendulumScene() },
  { id: 'pendulum-damped', name: '阻尼单摆', category: '物理', sub: '动力学', hint: '带阻尼，振幅逐渐衰减', file: '阻尼单摆.chordot', build: () => ({ kind: 'motion', params: { ...(pendulumScene() as any).params, damping: 0.4 } }) },
  { id: 'spring', name: '弹簧振子', category: '物理', sub: '动力学', hint: 'k=20、m=1，周期 1.41 s', file: '弹簧振子.chordot', build: () => springScene() },
  { id: 'projectile', name: '平抛 / 斜抛', category: '物理', sub: '动力学', hint: '初速 8 m/s、45°', file: '抛体运动.chordot', build: () => projectileScene() },

  { id: 'incline-smooth', name: '光滑斜面 45°', category: '物理', sub: '静力学', hint: 'μ=0，只有 G 与 N', file: '光滑斜面.chordot', build: () => inclineScene(45, 0.5, 3, 0) },
  { id: 'incline-steep', name: '临界角附近', category: '物理', sub: '静力学', hint: '35°、μ=0.7，刚好要滑', file: '临界角.chordot', build: () => inclineScene(35, 0.5, 3, 0.7) },
  {
    id: 'three-force',
    name: '三力平衡',
    category: '物理',
    sub: '静力学',
    hint: '三个力首尾相接闭合',
    file: '三力平衡.chordot',
    build: () => ({
      kind: 'sketch',
      doc: {
        points: [{ id: 'p1', x: 0, y: 0, name: 'O' }],
        segments: [],
        circles: [],
        polygons: [],
        functions: [],
        constraints: [],
        forces: [
          { id: 'f1', name: 'F₁', expr: '10', angle: 90, at: [0, 0], kind: 'constant' },
          { id: 'f2', name: 'F₂', expr: '10', angle: 210, at: [0, 0], kind: 'constant' },
          { id: 'f3', name: 'F₃', expr: '10', angle: 330, at: [0, 0], kind: 'constant' },
        ],
      },
    }),
  },

  /* ───────── 三维 ───────── */
  { id: 'cube', name: '正方体', category: '三维', sub: '多面体', hint: '棱长 4', file: '正方体.chordot', build: () => one({ name: '正方体', type: 'cube', center: [0, 0, 0], size: 4 }) },
  { id: 'pyramid4', name: '正四棱锥', category: '三维', sub: '多面体', hint: '底面边长 4', file: '正四棱锥.chordot', build: () => one({ name: '正四棱锥', type: 'pyramid', center: [0, 0, 0], size: 4, sides: 4 }) },
  { id: 'cone', name: '圆锥', category: '三维', sub: '旋转体', hint: '底面圆 + 顶点', file: '圆锥.chordot', build: () => one({ name: '圆锥', type: 'pyramid', center: [0, 0, 0], size: 4, sides: 32 }) },
  { id: 'prism3', name: '正三棱柱', category: '三维', sub: '多面体', hint: '底面正三角形', file: '正三棱柱.chordot', build: () => one({ name: '正三棱柱', type: 'prism', center: [0, 0, 0], size: 4, sides: 3 }) },
  { id: 'prism6', name: '正六棱柱', category: '三维', sub: '多面体', hint: '底面正六边形', file: '正六棱柱.chordot', build: () => one({ name: '正六棱柱', type: 'prism', center: [0, 0, 0], size: 4, sides: 6 }) },
  { id: 'cylinder', name: '圆柱', category: '三维', sub: '旋转体', hint: '底面圆', file: '圆柱.chordot', build: () => one({ name: '圆柱', type: 'prism', center: [0, 0, 0], size: 4, sides: 32 }) },
  { id: 'tetra', name: '正四面体', category: '三维', sub: '多面体', hint: '四个全等三角形', file: '正四面体.chordot', build: () => one({ name: '正四面体', type: 'tetra', center: [0, 0, 0], size: 4 }) },
  { id: 'octa', name: '正八面体', category: '三维', sub: '多面体', hint: '八个全等三角形', file: '正八面体.chordot', build: () => one({ name: '正八面体', type: 'octahedron', center: [0, 0, 0], size: 4 }) },
  { id: 'sphere', name: '球', category: '三维', sub: '旋转体', hint: '半径 2', file: '球.chordot', build: () => one({ name: '球', type: 'sphere', center: [0, 0, 0], size: 4 }) },
  { id: 'box', name: '长方体', category: '三维', sub: '多面体', hint: '底面正方形、高 6', file: '长方体.chordot', build: () => one({ name: '长方体', type: 'prism', center: [0, 0, 0], size: 6, sides: 4 }) },
  { id: 'prism5', name: '正五棱柱', category: '三维', sub: '多面体', hint: '底面正五边形', file: '正五棱柱.chordot', build: () => one({ name: '正五棱柱', type: 'prism', center: [0, 0, 0], size: 4, sides: 5 }) },
  {
    id: 'double-cone',
    name: '双锥体',
    category: '三维',
    sub: '组合',
    hint: '两个四棱锥对底拼接',
    file: '双锥体.chordot',
    build: () =>
      solid([
        { id: 's1', name: '上锥', type: 'pyramid', center: [0, 0, 1.7], size: 3.4, sides: 4 },
        { id: 's2', name: '下锥', type: 'pyramid', center: [0, 0, -1.7], size: 3.4, sides: 4 },
      ]),
  },
  {
    id: 'ball-box',
    name: '球与正方体',
    category: '三维',
    sub: '组合',
    hint: '球内切于正方体',
    file: '球与正方体.chordot',
    build: () =>
      solid([
        { id: 's1', name: '正方体', type: 'cube', center: [0, 0, 0], size: 4 },
        { id: 's2', name: '球', type: 'sphere', center: [0, 0, 0], size: 4 },
      ]),
  },

  {
    id: 'physics-ramp',
    name: '物理世界·斜面滑下',
    category: '三维',
    sub: '物理世界',
    hint: '球与方块从斜面上滑下，可调倾角与摩擦',
    file: '物理世界斜面.chordot',
    build: () => ({
      kind: 'solid',
      params: {
        shapes: [
          { id: 'r1', name: '球', type: 'sphere', center: [-1, -1.6, 4.2], size: 1.4 },
          { id: 'r2', name: '方块', type: 'cube', center: [1.2, -2.0, 4.4], size: 1.4 },
        ],
        camera: { azimuth: 40, elevation: 26, zoom: 1, view: 'free', perspective: true, dist: 20 },
        physics: {
          enabled: true,
          gravity: 10,
          restitution: 0.2,
          friction: 0.35,
          obstacles: [{ id: 'ramp1', kind: 'ramp', angleDeg: 30, x: 0, y: 0 }],
        },
      },
    }),
  },
  {
    id: 'physics-sandbox',
    name: '物理世界·自由下落',
    category: '三维',
    sub: '物理世界',
    hint: '四个物体同时落下，可调重力/弹性/摩擦',
    file: '物理世界.chordot',
    build: () => ({
      kind: 'solid',
      params: {
        shapes: [
          { id: 'a', name: '正方体', type: 'cube', center: [-1.4, 0, 3.2], size: 2 },
          { id: 'b', name: '球', type: 'sphere', center: [0.2, -1.6, 5], size: 2 },
          { id: 'c', name: '圆柱', type: 'prism', center: [1.6, 0, 4], size: 2, sides: 16 },
          { id: 'd', name: '正四棱锥', type: 'pyramid', center: [-0.4, 1.9, 6], size: 2, sides: 4 },
        ],
        camera: { azimuth: 42, elevation: 24, zoom: 1, view: 'free', perspective: true, dist: 22 },
        physics: { enabled: true, gravity: 10, restitution: 0.25, friction: 0.6 },
      },
    }),
  },
  {
    id: 'incline3d',
    name: '三维斜面受力',
    category: '三维',
    sub: '组合',
    hint: '30° 斜面 + 重力分解虚线',
    file: '三维斜面受力.chordot',
    build: () => ({
      kind: 'solidIncline',
      params: {
        angleDeg: 30,
        mass: 3,
        mu: 0.5,
        decompose: true,
        camera: { azimuth: 42, elevation: 30, zoom: 1, view: 'free', perspective: true, dist: 18 },
      },
    }),
  },
  {
    id: 'combo',
    name: '组合体',
    category: '三维',
    sub: '组合',
    hint: '正方体 + 棱锥',
    file: '组合体.chordot',
    build: () =>
      solid([
        { id: 's1', name: '正方体', type: 'cube', center: [0, 0, 0], size: 3.4 },
        { id: 's2', name: '棱锥', type: 'pyramid', center: [0, 0, 3.2], size: 3.4, sides: 4 },
      ]),
  },
]

export const CATEGORIES: TemplateCategory[] = ['数学', '几何', '物理', '三维']

/** 一级分类下的二级分类，顺序即展示顺序 */
export const SUB_CATEGORIES: Record<TemplateCategory, string[]> = {
  数学: ['函数图像', '三角函数', '指数与对数'],
  几何: ['三角形', '四边形', '圆', '正多边形', '约束'],
  物理: ['静力学', '动力学'],
  三维: ['多面体', '旋转体', '组合', '物理世界'],
}
