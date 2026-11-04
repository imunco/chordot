import type { Camera, SolidShape, SolidType } from '../kernel/types'
import { projectSolid } from '../model/solid'
import type { ThumbPrim } from '../model/thumb'

/**
 * 三维图形库：拖进画布就是一个可旋转的立体。
 *
 * 缩略图直接用 projectSolid 投影生成，所以预览和画布上看到的是同一套几何。
 */
export interface Shape3DDef {
  id: string
  name: string
  hint: string
  type: SolidType
  size: number
  sides?: number
}

export const SHAPES3D: Shape3DDef[] = [
  { id: 'cube', name: '正方体', hint: '棱长 4', type: 'cube', size: 4 },
  { id: 'cuboid', name: '四棱柱', hint: '底面正方形', type: 'prism', size: 4, sides: 4 },
  { id: 'pyramid4', name: '正四棱锥', hint: '底面边长 4', type: 'pyramid', size: 4, sides: 4 },
  { id: 'pyramid3', name: '三棱锥', hint: '底面正三角形', type: 'pyramid', size: 4, sides: 3 },
  { id: 'prism3', name: '三棱柱', hint: '底面正三角形', type: 'prism', size: 4, sides: 3 },
  { id: 'prism6', name: '六棱柱', hint: '底面正六边形', type: 'prism', size: 4, sides: 6 },
  { id: 'cylinder', name: '圆柱', hint: '底面圆', type: 'prism', size: 4, sides: 32 },
  { id: 'cone', name: '圆锥', hint: '底面圆 + 顶点', type: 'pyramid', size: 4, sides: 32 },
  { id: 'tetra', name: '正四面体', hint: '四个全等三角形', type: 'tetra', size: 4 },
  { id: 'octa', name: '正八面体', hint: '八个全等三角形', type: 'octahedron', size: 4 },
  { id: 'sphere', name: '球', hint: '半径 2', type: 'sphere', size: 4 },
]

export function shape3dById(id: string): Shape3DDef | undefined {
  return SHAPES3D.find((s) => s.id === id)
}

const PREVIEW_CAMERA: Camera = {
  azimuth: 42,
  elevation: 26,
  zoom: 1,
  view: 'free',
  perspective: false,
}

/** 生成等轴测缩略图图元（世界坐标，交给 Mini 统一缩放） */
export function preview3d(def: Shape3DDef): ThumbPrim[] {
  const shape: SolidShape = {
    id: 'preview',
    name: def.name,
    type: def.type,
    center: [0, 0, 0],
    size: def.size,
    sides: def.sides,
  }
  const view = projectSolid(shape, PREVIEW_CAMERA, (p) => [p[0], -p[1]])
  const out: ThumbPrim[] = []
  for (const f of view.faces) out.push({ t: 'poly', pts: f.points, fill: true })
  for (const e of view.edges) out.push({ t: 'line', a: e.a, b: e.b })
  return out
}
