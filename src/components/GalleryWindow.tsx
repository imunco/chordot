import { useMemo } from 'react'
import { TemplateGallery } from './TemplateGallery'
import { emptySketch } from '../kernel/types'
import type { SceneSpec } from '../kernel/types'
import type { Template } from '../data/templates'

/**
 * 模板库独立窗口（?gallery=1）。
 *
 * 和主窗口里的模态不同：窗口自己挑模板，选中后通过 gallery:pick 把 {scene,file}
 * 发给主窗口套用，主窗口不被遮挡。窗口本身不持有课件，所以「存为模板」用空场景占位。
 */
export function GalleryWindow() {
  const scene = useMemo<SceneSpec>(() => ({ kind: 'sketch', doc: emptySketch() }), [])
  return (
    <div className="gallerywin">
      <TemplateGallery
        scene={scene}
        file="模板库.chordot"
        onPick={(t: Template) => {
          window.chordot?.galleryPick?.({ scene: t.build(), file: t.file })
        }}
        onClose={() => window.close()}
      />
    </div>
  )
}
