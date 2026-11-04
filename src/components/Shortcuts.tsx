import { CloseIcon } from './icons'

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: '文件',
    rows: [
      ['Ctrl + N', '新建课件'],
      ['Ctrl + O', '打开课件'],
      ['Ctrl + S', '保存'],
      ['Ctrl + Shift + S', '另存为'],
    ],
  },
  {
    title: '编辑',
    rows: [
      ['Ctrl + Z', '撤销'],
      ['Ctrl + Y / Ctrl + Shift + Z', '重做'],
      ['Ctrl + D', '复制选中对象'],
      ['Delete', '删除选中对象'],
      ['Esc', '取消选择 / 退出工具'],
    ],
  },
  {
    title: '工具',
    rows: [
      ['B', '画笔批注'],
      ['E', '擦除批注'],
      ['Ctrl + /', '符号键盘'],
      ['Ctrl + K', '命令面板'],
      ['D', '正交分解（选中力时）'],
    ],
  },
  {
    title: '视图',
    rows: [
      ['G', '显示 / 隐藏网格'],
      ['P', '属性面板'],
      ['M', '切换数学 / 物理模式'],
      ['Ctrl + 0', '缩放适配'],
      ['空格', '播放 / 暂停（物理世界、运动仿真）'],
      ['滚轮', '缩放画布（围绕光标）'],
      ['拖动空白', '平移画布'],
    ],
  },
]

export function Shortcuts({ onClose }: { onClose: () => void }) {
  return (
    <div className="gallery" role="dialog" aria-label="快捷键" onClick={onClose}>
      <div className="prefs shortcuts" onClick={(e) => e.stopPropagation()}>
        <header className="gallery__head">
          <div className="gallery__title">快捷键</div>
          <button className="iconbtn" title="关闭" onClick={onClose}>
            <CloseIcon size={15} />
          </button>
        </header>
        <div className="prefs__body">
          {GROUPS.map((g) => (
            <section key={g.title} className="shortcuts__group">
              <h4 className="fgroup__title">{g.title}</h4>
              {g.rows.map(([k, v]) => (
                <div className="shortcuts__row" key={k}>
                  <span className="shortcuts__key">{k}</span>
                  <span className="shortcuts__desc">{v}</span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
