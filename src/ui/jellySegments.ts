/**
 * 给所有 .segmented 注入会滑动的玻璃拇指。
 * 仅玻璃主题生效；纸面主题保持原样。
 * 用 MutationObserver / ResizeObserver 跟踪 React 更新，不侵入各组件。
 */
export function installJellySegments(): void {
  if (typeof document === 'undefined') return
  type Rec = {
    seg: HTMLElement
    thumb: HTMLElement
    ro: ResizeObserver
    mo: MutationObserver
    timer: number
  }
  const records = new Map<HTMLElement, Rec>()
  let domObserver: MutationObserver | null = null
  let scanTimer = 0

  const update = (rec: Rec) => {
    const buttons = [...rec.seg.querySelectorAll<HTMLElement>(':scope > .segmented__btn')]
    const active = buttons.find((b) => b.getAttribute('data-active') === 'true')
    if (!active) {
      rec.thumb.style.opacity = '0'
      return
    }
    const left = active.offsetLeft
    const width = active.offsetWidth
    rec.thumb.style.opacity = '1'
    rec.thumb.style.width = width + 'px'
    rec.thumb.style.transform = 'translate3d(' + left + 'px,0,0)'
  }

  const schedule = (rec: Rec) => {
    window.clearTimeout(rec.timer)
    rec.timer = window.setTimeout(() => update(rec), 20)
  }

  const setup = (seg: HTMLElement) => {
    if (records.has(seg) || seg.classList.contains('theme-seg')) return
    if (!seg.querySelector('.segmented__btn')) return
    const thumb = document.createElement('span')
    thumb.className = 'jelly-seg__thumb'
    thumb.setAttribute('aria-hidden', 'true')
    seg.insertBefore(thumb, seg.firstChild)
    seg.setAttribute('data-jelly', '1')
    const rec: Rec = {
      seg,
      thumb,
      ro: null as unknown as ResizeObserver,
      mo: null as unknown as MutationObserver,
      timer: 0,
    }
    rec.ro = new ResizeObserver(() => update(rec))
    rec.ro.observe(seg)
    rec.mo = new MutationObserver(() => schedule(rec))
    rec.mo.observe(seg, { attributes: true, subtree: true, attributeFilter: ['data-active'], childList: true })
    seg.addEventListener('click', () => {
      schedule(rec)
      requestAnimationFrame(() => schedule(rec))
    })
    records.set(seg, rec)
    update(rec)
  }

  const scan = () => {
    if (document.documentElement.dataset.theme !== 'glass') return
    document.querySelectorAll<HTMLElement>('.segmented').forEach(setup)
  }

  const start = () => {
    scan()
    if (!domObserver) {
      domObserver = new MutationObserver(() => {
        window.clearTimeout(scanTimer)
        scanTimer = window.setTimeout(scan, 180)
      })
      domObserver.observe(document.body, { childList: true, subtree: true })
    }
  }

  const stop = () => {
    domObserver?.disconnect()
    domObserver = null
    window.clearTimeout(scanTimer)
    records.forEach((rec) => {
      rec.ro.disconnect()
      rec.mo.disconnect()
      window.clearTimeout(rec.timer)
      rec.thumb.remove()
      rec.seg.removeAttribute('data-jelly')
    })
    records.clear()
  }

  let active = false
  const sync = () => {
    const want = document.documentElement.dataset.theme === 'glass'
    if (want && !active) {
      active = true
      start()
    } else if (!want && active) {
      active = false
      stop()
    }
  }

  new MutationObserver(sync).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
  sync()
}