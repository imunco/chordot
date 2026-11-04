import type { SceneSpec, SketchDoc, Stroke } from '../kernel/types'
import type { Doc } from '../state'

export const FILE_VERSION = 1

export interface ChordotFile {
  app: 'chordot'
  version: number
  savedAt: string
  doc: {
    scene: SceneSpec
    hidden: Record<string, boolean>
    names: Record<string, string>
    strokes?: Stroke[]
  }
}

export function serializeDoc(doc: Doc): string {
  const payload: ChordotFile = {
    app: 'chordot',
    version: FILE_VERSION,
    savedAt: new Date().toISOString(),
    doc: {
      scene: doc.scene,
      hidden: doc.hidden,
      names: doc.names,
      strokes: doc.strokes ?? [],
    },
  }
  return JSON.stringify(payload, null, 2)
}

function normalizeSketch(doc: SketchDoc): SketchDoc {
  return {
    points: Array.isArray(doc.points) ? doc.points : [],
    segments: Array.isArray(doc.segments) ? doc.segments : [],
    circles: Array.isArray(doc.circles) ? doc.circles : [],
    polygons: Array.isArray(doc.polygons) ? doc.polygons : [],
    functions: Array.isArray(doc.functions) ? doc.functions : [],
    constraints: Array.isArray(doc.constraints) ? doc.constraints : [],
    forces: Array.isArray(doc.forces) ? doc.forces : [],
  }
}

/** 解析课件文件；失败时返回教学语言原因，不抛异常 */
export function parseDoc(text: string): { doc: Doc } | { error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { error: '这个文件不是有效的课件文件' }
  }
  const file = raw as Partial<ChordotFile>
  if (!file || file.app !== 'chordot') return { error: '这个文件不是弦点课件' }
  if (typeof file.version !== 'number' || file.version > FILE_VERSION) {
    return { error: '课件版本比当前程序更新，请先更新弦点' }
  }

  const scene = file.doc?.scene as SceneSpec | undefined
  if (!scene || typeof scene !== 'object') return { error: '课件内容缺失，无法打开' }

  if (scene.kind === 'sketch') {
    scene.doc = normalizeSketch(scene.doc)
  } else if (scene.kind === 'incline') {
    if (typeof scene.params?.angleDeg !== 'number') return { error: '课件内容损坏：斜面参数缺失' }
  } else if (scene.kind === 'triangle') {
    if (!Array.isArray(scene.params?.points)) return { error: '课件内容损坏：三角形参数缺失' }
  } else if (scene.kind === 'solid') {
    if (!Array.isArray(scene.params?.shapes) || !scene.params.camera) {
      return { error: '课件内容损坏：三维参数缺失' }
    }
  } else if (scene.kind === 'solidIncline') {
    if (typeof scene.params?.angleDeg !== 'number' || !scene.params.camera) {
      return { error: '课件内容损坏：三维斜面参数缺失' }
    }
  } else if (scene.kind === 'motion') {
    if (!scene.params || typeof scene.params.model !== 'string') {
      return { error: '课件内容损坏：运动参数缺失' }
    }
  } else {
    return { error: '课件包含当前版本不支持的内容' }
  }

  return {
    doc: {
      scene,
      hidden: file.doc?.hidden && typeof file.doc.hidden === 'object' ? file.doc.hidden : {},
      names: file.doc?.names && typeof file.doc.names === 'object' ? file.doc.names : {},
      deleted: [],
      strokes: Array.isArray(file.doc?.strokes) ? (file.doc.strokes as Stroke[]) : [],
    },
  }
}

export function baseName(filePath: string): string {
  const parts = filePath.split(/[\\/]/)
  return parts[parts.length - 1] || filePath
}
