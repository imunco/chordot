import type { ThumbPrim } from '../model/thumb'

/**
 * 图形库：可以直接拖到画布上的常用教具。
 *
 * 每个图形都以 (0,0) 为锚点描述自己的形状，落点由调用方平移过去。
 * 物块 / 斜面这类「面」一定带上自己的顶点，这样拖动顶点就能改形，
 * 和其他作图对象的行为一致。
 */
export interface ShapePart {
  points: { id: string; x: number; y: number; name?: string }[]
  segments: { id: string; a: string; b: string }[]
  circles: { id: string; c: string; r: number }[]
  polygons: { id: string; points: string[] }[]
}

export interface ShapeDef {
  id: string
  name: string
  hint: string
  /** 缩略图（世界坐标，渲染时统一缩放） */
  preview: ThumbPrim[]
  build: () => ShapePart
}

const seg = (id: string, a: string, b: string) => ({ id, a, b })

/** 矩形物块 */
function block(w: number, h: number): ShapePart {
  return {
    points: [
      { id: 'p1', x: -w / 2, y: 0, name: 'A' },
      { id: 'p2', x: w / 2, y: 0, name: 'B' },
      { id: 'p3', x: w / 2, y: h, name: 'C' },
      { id: 'p4', x: -w / 2, y: h, name: 'D' },
    ],
    segments: [seg('s1', 'p1', 'p2'), seg('s2', 'p2', 'p3'), seg('s3', 'p3', 'p4'), seg('s4', 'p4', 'p1')],
    circles: [],
    polygons: [{ id: 'g1', points: ['p1', 'p2', 'p3', 'p4'] }],
  }
}

function rectPrim(w: number, h: number, y0 = 0): ThumbPrim {
  return {
    t: 'poly',
    pts: [
      [-w / 2, y0],
      [w / 2, y0],
      [w / 2, y0 + h],
      [-w / 2, y0 + h],
    ],
    fill: true,
  }
}

export const SHAPES: ShapeDef[] = [
  {
    id: 'block',
    name: '物块',
    hint: '1.6 × 1.0 矩形',
    preview: [rectPrim(1.6, 1)],
    build: () => block(1.6, 1),
  },
  {
    id: 'block-tall',
    name: '高物块',
    hint: '1.2 × 1.8',
    preview: [rectPrim(1.2, 1.8)],
    build: () => block(1.2, 1.8),
  },
  {
    id: 'ball',
    name: '小球',
    hint: '半径 0.45 的圆',
    preview: [{ t: 'circle', c: [0, 0.45], r: 0.45 }],
    build: () => ({
      points: [{ id: 'p1', x: 0, y: 0.45, name: 'O' }],
      segments: [],
      circles: [{ id: 'c1', c: 'p1', r: 0.45 }],
      polygons: [],
    }),
  },
  {
    id: 'incline',
    name: '斜面',
    hint: '底 5、高 2.5',
    preview: [
      { t: 'poly', pts: [[-2.5, 0], [2.5, 0], [2.5, 2.5]], fill: true },
    ],
    build: () => ({
      points: [
        { id: 'p1', x: -2.5, y: 0, name: 'A' },
        { id: 'p2', x: 2.5, y: 0, name: 'B' },
        { id: 'p3', x: 2.5, y: 2.5, name: 'C' },
      ],
      segments: [seg('s1', 'p1', 'p2'), seg('s2', 'p2', 'p3'), seg('s3', 'p3', 'p1')],
      circles: [],
      polygons: [{ id: 'g1', points: ['p1', 'p2', 'p3'] }],
    }),
  },
  {
    id: 'ground',
    name: '地面',
    hint: '带斜线的水平线',
    preview: [
      { t: 'line', a: [-2.5, 0], b: [2.5, 0] },
      { t: 'line', a: [-2.2, 0], b: [-2.5, -0.35], faint: true },
      { t: 'line', a: [-1.5, 0], b: [-1.8, -0.35], faint: true },
      { t: 'line', a: [-0.8, 0], b: [-1.1, -0.35], faint: true },
      { t: 'line', a: [-0.1, 0], b: [-0.4, -0.35], faint: true },
      { t: 'line', a: [0.6, 0], b: [0.3, -0.35], faint: true },
      { t: 'line', a: [1.3, 0], b: [1.0, -0.35], faint: true },
      { t: 'line', a: [2.0, 0], b: [1.7, -0.35], faint: true },
    ],
    build: () => ({
      points: [
        { id: 'p1', x: -2.5, y: 0, name: 'A' },
        { id: 'p2', x: 2.5, y: 0, name: 'B' },
      ],
      segments: [seg('s1', 'p1', 'p2')],
      circles: [],
      polygons: [],
    }),
  },
  {
    id: 'pulley',
    name: '滑轮',
    hint: '半径 0.35 的定滑轮',
    preview: [{ t: 'circle', c: [0, 0], r: 0.35 }, { t: 'dot', p: [0, 0] }],
    build: () => ({
      points: [{ id: 'p1', x: 0, y: 0, name: 'O' }],
      segments: [],
      circles: [{ id: 'c1', c: 'p1', r: 0.35 }],
      polygons: [],
    }),
  },
  {
    id: 'spring',
    name: '弹簧',
    hint: '水平 8 节折线',
    preview: [
      {
        t: 'path',
        pts: [
          [0, 0],
          [0.2, 0.3],
          [0.5, -0.3],
          [0.8, 0.3],
          [1.1, -0.3],
          [1.4, 0.3],
          [1.7, -0.3],
          [2, 0],
        ],
      },
    ],
    build: () => {
      const n = 8
      const w = 2
      const pts: ShapePart['points'] = [{ id: 'p1', x: 0, y: 0, name: 'A' }]
      const segments: { id: string; a: string; b: string }[] = []
      for (let i = 1; i <= n; i++) {
        const id = `p${i + 1}`
        pts.push({ id, x: (w * i) / n, y: i % 2 === 0 ? -0.3 : 0.3 })
        segments.push(seg(`s${i}`, `p${i}`, id))
      }
      pts.push({ id: `p${n + 2}`, x: w, y: 0, name: 'B' })
      segments.push(seg(`s${n + 1}`, `p${n + 1}`, `p${n + 2}`))
      return { points: pts, segments, circles: [], polygons: [] }
    },
  },
  {
    id: 'rope',
    name: '绳子',
    hint: '一段直线',
    preview: [{ t: 'line', a: [0, 0], b: [2, 1.4] }],
    build: () => ({
      points: [
        { id: 'p1', x: 0, y: 0, name: 'A' },
        { id: 'p2', x: 2, y: 1.4, name: 'B' },
      ],
      segments: [seg('s1', 'p1', 'p2')],
      circles: [],
      polygons: [],
    }),
  },
  {
    id: 'right-angle',
    name: '直角标记',
    hint: '小方框',
    preview: [
      { t: 'path', pts: [[0, 0.5], [0.5, 0.5], [0.5, 0]] },
    ],
    build: () => ({
      points: [
        { id: 'p1', x: 0, y: 0.5, name: 'A' },
        { id: 'p2', x: 0.5, y: 0.5, name: 'B' },
        { id: 'p3', x: 0.5, y: 0, name: 'C' },
      ],
      segments: [seg('s1', 'p1', 'p2'), seg('s2', 'p2', 'p3')],
      circles: [],
      polygons: [],
    }),
  },
  {
    id: 'axes',
    name: '坐标轴',
    hint: '十字轴',
    preview: [
      { t: 'line', a: [-2, 0], b: [2, 0] },
      { t: 'line', a: [0, -1.5], b: [0, 1.5] },
    ],
    build: () => ({
      points: [
        { id: 'p1', x: -2, y: 0, name: 'A' },
        { id: 'p2', x: 2, y: 0, name: 'B' },
        { id: 'p3', x: 0, y: -1.5, name: 'C' },
        { id: 'p4', x: 0, y: 1.5, name: 'D' },
      ],
      segments: [seg('s1', 'p1', 'p2'), seg('s2', 'p3', 'p4')],
      circles: [],
      polygons: [],
    }),
  },
]

export function shapeById(id: string): ShapeDef | undefined {
  return SHAPES.find((s) => s.id === id)
}
