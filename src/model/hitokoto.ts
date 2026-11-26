/**
 * 每日一言：Hitokoto（一言）API + 离线兜底。
 *
 * 参考：https://blog.csdn.net/Roufsi/article/details/162047531
 * 工程约定（文章里的最佳实践都照做）：
 * - 3 秒超时，失败立刻退回本地句子，绝不阻塞大厅；
 * - 按「日期 + 分类」缓存，一天只请求一次；
 * - 过滤长度（<= 36 字），避免长句把卡片撑破；
 * - 断网 / 国内网络不通时，本地池按日期确定性地挑一句（同一天固定）。
 */

export interface DailyQuote {
  text: string
  from: string
  source: 'hitokoto' | 'local'
}

/** 本地兜底池：教学 / 读书 / 科普向，短句为主 */
const LOCAL: [string, string][] = [
  ['教育不是注满一桶水，而是点燃一把火。', '叶芝'],
  ['学而不思则罔，思而不学则殆。', '论语'],
  ['纸上得来终觉浅，绝知此事要躬行。', '陆游'],
  ['问渠那得清如许？为有源头活水来。', '朱熹'],
  ['不积跬步，无以至千里。', '荀子'],
  ['知之者不如好之者，好之者不如乐之者。', '论语'],
  ['路漫漫其修远兮，吾将上下而求索。', '屈原'],
  ['真理是时间的女儿。', '达·芬奇'],
  ['想象力比知识更重要。', '爱因斯坦'],
  ['把简单的事情做好就是不简单。', '佚名'],
  ['数学是科学的皇后。', '高斯'],
  ['宇宙最不可理解之处，就是它居然可以被理解。', '爱因斯坦'],
  ['自然是数学的另一种写法。', '伽利略'],
  ['每一个不曾起舞的日子，都是对生命的辜负。', '尼采'],
  ['所谓成长，就是把听过的大道理活成小习惯。', '佚名'],
  ['好奇心是科学工作者最宝贵的品质。', '爱因斯坦'],
  ['慢慢来，比较快。', '佚名'],
  ['读书之法，在循序而渐进，熟读而精思。', '朱熹'],
  ['万物皆有裂痕，那是光进来的地方。', '莱昂纳德·科恩'],
  ['教育的目的，是让人学会自己教育自己。', '杜威'],
  ['敏而好学，不耻下问。', '论语'],
  ['千里之行，始于足下。', '老子'],
  ['知识就是力量。', '培根'],
  ['我思故我在。', '笛卡尔'],
  ['天行健，君子以自强不息。', '周易'],
  ['兴趣是最好的老师。', '爱因斯坦'],
  ['教育的根是苦的，但果实是甜的。', '亚里士多德'],
  ['读万卷书，行万里路。', '顾炎武'],
  ['一个人只有在他不追求什么的时候，才最像一个人。', '帕斯卡'],
  ['生活的理想，就是为了理想的生活。', '张闻天'],
]

const CACHE_KEY = 'chordot.quote.daily'

function dateKey(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + d
}

/** 同一天固定的一句本地句子 */
export function localQuote(day = dateKey()): DailyQuote {
  let hash = 0
  for (let i = 0; i < day.length; i += 1) hash = (hash * 31 + day.charCodeAt(i)) >>> 0
  const item = LOCAL[hash % LOCAL.length]
  return { text: item[0], from: item[1], source: 'local' }
}

interface Cache {
  day: string
  quote: DailyQuote
}

function readCache(): Cache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Cache
    if (!parsed || typeof parsed.day !== 'string' || !parsed.quote?.text) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(cache: Cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    /* 隐私模式 ignore */
  }
}

/** 缓存里今天的那句（没有就 null）；大厅首屏先同步显示，不用等网络 */
export function cachedQuote(day = dateKey()): DailyQuote | null {
  const cache = readCache()
  return cache && cache.day === day ? cache.quote : null
}

/**
 * 取今天的一句话。优先缓存 → 网络（3s）→ 本地池。
 * 注意：Vite 开发环境 / 打包后都可以 fetch；失败一律兜底，不抛错。
 */
export async function fetchDailyQuote(category = 'k'): Promise<DailyQuote> {
  const day = dateKey()
  const cached = cachedQuote(day)
  if (cached) return cached

  const fallback = localQuote(day)
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    const url =
      'https://v1.hitokoto.cn/?encode=json&charset=utf-8&max_length=36&c=' + encodeURIComponent(category)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = (await res.json()) as { hitokoto?: string; from?: string; from_who?: string }
    const text = String(data.hitokoto ?? '').trim()
    if (!text || text.length > 40) throw new Error('empty')
    const quote: DailyQuote = {
      text,
      from: String(data.from_who || data.from || '一言'),
      source: 'hitokoto',
    }
    writeCache({ day, quote })
    return quote
  } catch {
    return fallback
  }
}

/** 手动换一句（不写当日缓存，只给当前会话看） */
export async function randomQuote(category = 'k'): Promise<DailyQuote> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    const url =
      'https://v1.hitokoto.cn/?encode=json&charset=utf-8&max_length=36&c=' + encodeURIComponent(category)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = (await res.json()) as { hitokoto?: string; from?: string; from_who?: string }
    const text = String(data.hitokoto ?? '').trim()
    if (!text) throw new Error('empty')
    return { text, from: String(data.from_who || data.from || '一言'), source: 'hitokoto' }
  } catch {
    return localQuote()
  }
}
