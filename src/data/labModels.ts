import type { LabExperiment } from '../lab/types'

/**
 * 高中物理常用模型（模型专题）。
 *
 * 模型不是教材分组实验，而是「一类问题的固定解法」：人船、板块、传送带、双星、双杆……
 * 每条都给出模型特征、核心方程、易错点和可调参数的演示台。
 */
type ModelCfg = Omit<
  LabExperiment,
  'book' | 'chapter' | 'section' | 'kind' | 'apparatus' | 'steps' | 'data' | 'errors' | 'cautions'
> &
  Partial<Pick<LabExperiment, 'apparatus' | 'steps' | 'data' | 'errors' | 'cautions'>>

const M = (cfg: ModelCfg): LabExperiment => ({
  book: '模型',
  chapter: '模型专题',
  section: '高中物理常用模型',
  kind: '模型',
  apparatus: ['纸笔推导', '（可选）动画演示台'],
  steps: [
    '明确研究对象和物理过程，画出受力 / 运动示意图。',
    '标出已知量、未知量和临界条件（共速、追上、脱离、恰好通过最高点等）。',
    '选择规律：牛顿定律、动量守恒、能量守恒、动能定理或电磁学公式。',
    '列方程求解，代回检验方向、单位和临界条件。',
  ],
  data: ['先判断模型属于「力与运动」「动量与能量」「场与路」哪一类，再选规律。'],
  errors: ['不要把相对位移与对地位移混为一谈。'],
  cautions: ['注意模型的适用条件和临界状态。'],
  ...cfg,
})

export const LAB_MODELS: LabExperiment[] = [
  M({
    id: 'model-boat',
    name: '人船模型',
    short: '人船模型',
    field: '力学',
    stage: 'model',
    modelType: 'boat',
    tagline: '人在船上走，船向反方向退；系统质心不动，位移与质量成反比。',
    principle:
      '人站在静止的船上，从船头走到船尾。水平方向系统不受外力，总动量守恒且初动量为零，所以人向右走时船向左退。设人相对船的位移为 L，人对地位移为 s人，船对地位移为 s船，则 m人·s人 = m船·s船，且 s人 + s船 = L。',
    formulas: [
      { expr: 'm人·s人 = m船·s船', note: '水平方向动量守恒（初动量为零）' },
      { expr: 's人 + s船 = L相对', note: '相对位移等于船长（或人相对船走过的距离）' },
      { expr: 's船 = m人·L / (m人 + m船)', note: '船对地位移大小' },
    ],
    steps: [
      '选人和船为系统，判断水平方向合外力为零。',
      '设人相对船的位移 L，人对地 s人、船对地 s船，画位移关系图。',
      '由 0 = m人v人 − m船v船 积分得 m人s人 = m船s船。',
      '联立 s人 + s船 = L，解出双方对地位移。',
    ],
    data: ['位移均相对地面；相对位移才是船长。', '人停船也停，系统质心始终不动。'],
    errors: ['把「人对船的位移」直接当成「人对地的位移」。', '忘记船的质量，认为船不动。'],
    cautions: ['水平方向必须无外力（忽略水的阻力）。', '人相对船运动过程中系统总动量始终为零。'],
    conclusion: '人船模型中，人和船的对地位移与质量成反比，系统质心保持不动。',
    controls: [
      { id: 'mp', label: '人质量 m人', min: 30, max: 100, step: 5, unit: 'kg' },
      { id: 'mb', label: '船质量 m船', min: 40, max: 240, step: 10, unit: 'kg' },
      { id: 'L', label: '相对位移 L', min: 1, max: 5, step: 0.5, unit: 'm' },
    ],
    params: { mp: 60, mb: 120, L: 3 },
    chartTitle: '人、船位移随时间变化',
  }),

  M({
    id: 'model-board',
    name: '板块模型',
    short: '板块模型',
    field: '力学',
    stage: 'model',
    modelType: 'board',
    tagline: '滑块在木板上滑，摩擦力让一个减速、一个加速，最后共速或滑出。',
    principle:
      '滑块以初速度 v₀ 滑上静止的长木板。滑块受滑动摩擦力减速，木板受反作用力加速；若木板足够长，二者最终达到共同速度，之后一起匀速。若木板太短，滑块会在共速前滑出。',
    formulas: [
      { expr: 'm v₀ = (m + M) v共', note: '水平方向动量守恒' },
      { expr: 'Q = μmg·Δs = ½mv₀² − ½(m+M)v共²', note: '摩擦生热等于机械能减少量' },
      { expr: 'v共 = m v₀ / (m + M)', note: '共速（木板足够长）' },
    ],
    steps: [
      '分别对滑块、木板受力分析，求各自加速度。',
      '设经过时间 t 共速，由速度关系求 t，再由位移关系求相对位移。',
      '比较相对位移与木板长度，判断是否滑出。',
      '用动量守恒求共速，用能量守恒求摩擦生热。',
    ],
    data: ['相对位移 Δs 是滑块相对木板的位移，等于两者对地位移之差。'],
    errors: ['把木板的位移当成相对位移。', '忽略木板也会运动。'],
    cautions: ['只有滑动摩擦力才用 μmg；共速后改为静摩擦分析。', '木板固定时相对位移就是滑块位移。'],
    conclusion: '板块模型的核心是「动量守恒 + 相对位移生热」；是否共速取决于木板长度。',
    controls: [
      { id: 'm', label: '滑块质量 m', min: 0.5, max: 3, step: 0.5, unit: 'kg' },
      { id: 'M', label: '木板质量 M', min: 1, max: 6, step: 0.5, unit: 'kg' },
      { id: 'mu', label: '动摩擦因数 μ', min: 0.05, max: 0.8, step: 0.05 },
      { id: 'v0', label: '滑块初速度 v₀', min: 1, max: 8, step: 0.5, unit: 'm/s' },
      { id: 'L', label: '木板长度 L', min: 0.5, max: 5, step: 0.5, unit: 'm' },
    ],
    params: { m: 1, M: 3, mu: 0.3, v0: 4, L: 2 },
  }),

  M({
    id: 'model-belt',
    name: '传送带模型',
    short: '传送带模型',
    field: '力学',
    stage: 'model',
    modelType: 'belt',
    tagline: '物块放上传送带，先被摩擦力加速（或减速），达到带速后一起走。',
    principle:
      '物块以初速度 v₀ 放上速度为 v带的水平传送带。若二者速度不同，物块受滑动摩擦力产生加速度 a = μg；速度相同后摩擦力消失，随带匀速。传送带足够长时物块能达到带速，否则中途离开。',
    formulas: [
      { expr: 'a = μg', note: '滑动摩擦力产生的加速度' },
      { expr: 'v = v₀ + at', note: '加速或减速到带速' },
      { expr: 'Q = μmg·Δs相对', note: '摩擦生热' },
    ],
    steps: [
      '比较物块初速度与带速，判断加速还是减速。',
      '由 a = μg 求达到带速所需时间和位移。',
      '比较位移与传送带长度，判断是否达到带速。',
      '用相对位移求摩擦生热，用能量守恒求电机多做的功。',
    ],
    data: ['达到带速后物块与带无相对滑动，摩擦力为零。'],
    errors: ['认为物块一直受摩擦力。', '把传送带速度当成物块速度。'],
    cautions: ['传送带倾斜时，重力分量会改变加速度。', '注意物块是否在达到带速前离开传送带。'],
    conclusion: '传送带模型先判断相对运动方向，再用 μmg 求加速度，最后看是否达到带速。',
    controls: [
      { id: 'v0', label: '物块初速度 v₀', min: 0, max: 6, step: 0.5, unit: 'm/s' },
      { id: 'vb', label: '传送带速度 v带', min: 0.5, max: 5, step: 0.5, unit: 'm/s' },
      { id: 'mu', label: '动摩擦因数 μ', min: 0.05, max: 0.8, step: 0.05 },
      { id: 'L', label: '传送带长度 L', min: 1, max: 10, step: 0.5, unit: 'm' },
    ],
    params: { v0: 0, vb: 2, mu: 0.3, L: 4 },
  }),

  M({
    id: 'model-pursuit',
    name: '追及相遇模型',
    short: '追及相遇',
    field: '力学',
    stage: 'model',
    modelType: 'pursuit',
    tagline: '后车加速追前车，速度相等时距离最近；能否追上，看临界。',
    principle:
      '前车以速度 vA 匀速，后车从静止以加速度 a 追赶。后车速度小于 vA 时，间距仍在增大；速度等于 vA 时间距最大；之后间距开始减小。能否追上取决于初始间距与速度、加速度。',
    formulas: [
      { expr: 'gap + ½at² = vA t', note: '追上时位移关系' },
      { expr: 't = (vA + √(vA² + 2a·gap))/a', note: '追上时间' },
      { expr: 'vB = vA 时距离最大', note: '临界条件' },
    ],
    steps: [
      '画两车位置图，明确初始间距和速度方向。',
      '写出两车位移随时间变化的表达式。',
      '由位移相等列方程，解追上时间。',
      '用速度相等判断是否出现「追不上」的临界。',
    ],
    data: ['速度相等是距离最大 / 最小的临界点。'],
    errors: ['把「速度相等」当成「追上」。', '忽略两车初始间距。'],
    cautions: ['刹车类问题要先判断何时停止。', '相向运动与同向运动列式不同。'],
    conclusion: '追及问题的关键临界是两车速度相等；能否追上由位移方程是否有正根决定。',
    controls: [
      { id: 'vA', label: '前车速度 vA', min: 2, max: 20, step: 1, unit: 'm/s' },
      { id: 'aB', label: '后车加速度 a', min: 0, max: 5, step: 0.2, unit: 'm/s²' },
      { id: 'gap', label: '初始间距', min: 2, max: 60, step: 2, unit: 'm' },
    ],
    params: { vA: 10, aB: 2, gap: 20 },
  }),

  M({
    id: 'model-connected',
    name: '连接体模型',
    short: '连接体',
    field: '力学',
    stage: 'model',
    modelType: 'connected',
    tagline: '几个物体用绳 / 杆连在一起，加速度相同；先整体，再隔离。',
    principle:
      '桌面上的 m₁ 通过细绳绕过定滑轮与悬挂的 m₂ 相连。绳不可伸长，两者加速度大小相同。把系统看成整体求加速度，再隔离 m₁ 或 m₂ 求绳张力；m₁ 受桌面的滑动摩擦力时，整体式里要减去 μm₁g。',
    formulas: [
      { expr: 'a = (m₂g − μm₁g)/(m₁ + m₂)', note: '整体法求加速度' },
      { expr: 'T = m₁(a + μg)', note: '隔离 m₁ 求张力' },
      { expr: 'T = m₂(g − a)', note: '隔离 m₂ 校验' },
    ],
    steps: [
      '判断绳 / 杆是否不可伸长，确认各物体加速度关系。',
      '把加速度相同的物体看成整体，列牛顿第二定律。',
      '隔离受力较简单的物体，求绳张力或杆的弹力。',
      '检查结果：张力不能为负，加速度方向要与假设一致。',
    ],
    data: ['整体法不涉及内力，求加速度最方便；求内力必须隔离。'],
    errors: ['整体法列式时漏掉摩擦力。', '把绳张力当成外力。'],
    cautions: ['绳只能拉不能推；杆可以拉也可以推。', '滑轮有质量或摩擦时，两侧张力不相等。'],
    conclusion: '连接体模型的口诀是「先整体求加速度，再隔离求内力」。',
    controls: [
      { id: 'm1', label: '桌面质量 m₁', min: 0.5, max: 6, step: 0.5, unit: 'kg' },
      { id: 'm2', label: '悬挂质量 m₂', min: 0.2, max: 4, step: 0.2, unit: 'kg' },
      { id: 'mu', label: '桌面动摩擦因数 μ', min: 0, max: 0.6, step: 0.05 },
    ],
    params: { m1: 2, m2: 1, mu: 0.2 },
  }),

  M({
    id: 'model-double-star',
    name: '双星模型',
    short: '双星模型',
    field: '力学',
    stage: 'model',
    modelType: 'orbit',
    tagline: '两颗星绕共同质心转，半径与质量成反比，周期相同。',
    principle:
      '双星系统中两颗星彼此之间的万有引力提供各自的向心力，它们绕连线上的共同质心做同周期圆周运动。设两星质量 M₁、M₂，间距 d，轨道半径 r₁、r₂，则 r₁ + r₂ = d，且 M₁r₁ = M₂r₂。',
    formulas: [
      { expr: 'G M₁M₂/d² = M₁ω²r₁ = M₂ω²r₂', note: '万有引力提供向心力' },
      { expr: 'r₁/r₂ = M₂/M₁', note: '轨道半径与质量成反比' },
      { expr: 'T = 2π√(d³ / G(M₁+M₂))', note: '共同周期' },
    ],
    steps: [
      '确定双星间距 d 和各自轨道半径 r₁、r₂（对同一点质心）。',
      '对任一颗星写万有引力 = 向心力。',
      '利用 r₁ + r₂ = d 和 M₁r₁ = M₂r₂ 联立。',
      '求周期、角速度或质量比。',
    ],
    data: ['双星的周期、角速度相同，轨道半径不同。'],
    errors: ['把两星间距 d 当成某一颗星的轨道半径。', '认为质量大的星半径大。'],
    cautions: ['万有引力中的距离是两星间距 d，向心力中的半径是各自轨道半径。'],
    conclusion: '双星模型：同周期、同角速度，轨道半径与质量成反比。',
    selects: [
      {
        id: 'mode',
        label: '演示类型',
        options: [
          { value: 'double', label: '双星' },
          { value: 'satellite', label: '卫星' },
        ],
      },
    ],
    controls: [
      { id: 'M1', label: '星 1 质量 M₁', min: 1, max: 8, step: 0.5, unit: '相对值' },
      { id: 'M2', label: '星 2 质量 M₂', min: 0.5, max: 6, step: 0.5, unit: '相对值' },
      { id: 'd', label: '两星间距 d', min: 4, max: 20, step: 1, unit: '相对值' },
    ],
    params: { mode: 'double', M1: 2, M2: 1, d: 10 },
  }),

  M({
    id: 'model-satellite',
    name: '卫星变轨与宇宙速度',
    short: '卫星变轨',
    field: '力学',
    stage: 'model',
    modelType: 'orbit',
    tagline: '半径越大，速度越小、周期越长；变轨要在关键点加速或减速。',
    principle:
      '卫星绕地球做匀速圆周运动时，万有引力提供向心力：GMm/r² = mv²/r，所以 v = √(GM/r)，T = 2π√(r³/GM)。轨道半径越大，线速度越小、周期越长。卫星从低轨道到高轨道，需要在近地点加速进入椭圆转移轨道，再在远地点加速圆化。',
    formulas: [
      { expr: 'v = √(GM/r)', note: '圆轨道线速度' },
      { expr: 'T = 2π√(r³/GM)', note: '圆轨道周期' },
      { expr: 'v₁ = √(GM/R) ≈ 7.9 km/s', note: '第一宇宙速度（近地圆轨道）' },
    ],
    steps: [
      '明确中心天体质量 M 和轨道半径 r（从球心算起）。',
      '由万有引力 = 向心力推出 v、T、a 与 r 的关系。',
      '变轨问题比较同一点不同轨道的速度：加速做离心运动，减速做向心运动。',
      '注意「高轨低速大周期」的结论。',
    ],
    data: ['轨道半径是到地心的距离，不是离地高度。'],
    errors: ['把离地高度当成轨道半径。', '认为高轨道卫星速度更大。'],
    cautions: ['第一宇宙速度是最小发射速度、最大圆轨道环绕速度。', '变轨时速度变化，但同一点加速度由万有引力决定。'],
    conclusion: '卫星圆轨道满足「高轨低速大周期」；变轨靠关键点加速或减速。',
    selects: [
      {
        id: 'mode',
        label: '演示类型',
        options: [
          { value: 'satellite', label: '卫星' },
          { value: 'double', label: '双星' },
        ],
      },
    ],
    controls: [
      { id: 'r', label: '轨道半径 r', min: 6.6e6, max: 4.2e7, step: 1e6, unit: 'm' },
    ],
    params: { mode: 'satellite', M: 5.97e24, r: 6.8e6 },
  }),

  M({
    id: 'model-charge',
    name: '带电粒子在匀强磁场中的运动',
    short: '带电粒子在磁场',
    field: '电磁学',
    stage: 'model',
    modelType: 'charge',
    tagline: '速度垂直磁场时，洛伦兹力提供向心力，粒子做匀速圆周运动。',
    principle:
      '带电粒子以速度 v 垂直进入磁感应强度为 B 的匀强磁场，洛伦兹力 F = qvB 始终与速度垂直，提供向心力：qvB = mv²/r。所以 r = mv/(qB)，T = 2πm/(qB)。周期与速度大小无关，这是回旋加速器的原理。',
    formulas: [
      { expr: 'qvB = mv²/r', note: '洛伦兹力提供向心力' },
      { expr: 'r = mv/(qB)', note: '轨道半径' },
      { expr: 'T = 2πm/(qB)', note: '周期与速度无关' },
    ],
    steps: [
      '判断电荷正负和速度方向，用左手定则确定洛伦兹力方向。',
      '由 qvB = mv²/r 求半径。',
      '由 T = 2πm/(qB) 求周期，注意周期与 v 无关。',
      '画出圆周轨迹，找圆心（垂直于速度的线）和几何关系。',
    ],
    data: ['圆心在垂直于速度方向的直线上，半径由 qvB = mv²/r 决定。'],
    errors: ['把半径公式写成 r = qB/(mv)。', '忘记判断洛伦兹力方向。'],
    cautions: ['速度与磁场平行时不受洛伦兹力。', '重力可忽略时才是匀速圆周运动。'],
    conclusion: '垂直进入匀强磁场的带电粒子做匀速圆周运动，r = mv/(qB)，T = 2πm/(qB)。',
    controls: [
      { id: 'v', label: '速度 v', min: 2e6, max: 2e7, step: 1e6, unit: 'm/s' },
      { id: 'B', label: '磁感应强度 B', min: 0.1, max: 2, step: 0.1, unit: 'T' },
      { id: 'qm', label: '比荷 q/m', min: 2e7, max: 2e8, step: 1e7, unit: 'C/kg' },
    ],
    params: { v: 1e7, B: 0.5, qm: 1e8 },
  }),

  M({
    id: 'model-twin-rod',
    name: '双杆导轨模型',
    short: '双杆导轨',
    field: '电磁学',
    stage: 'model',
    modelType: 'twinRod',
    tagline: '两根杆在导轨上运动，安培力让速度趋于相同，动量守恒、机械能变焦耳热。',
    principle:
      '两根导体棒垂直放在光滑水平导轨上，处在竖直向下的匀强磁场中。给杆 1 初速度 v₀，回路面积变化产生感应电动势和电流，安培力使杆 1 减速、杆 2 加速，最终两杆以共同速度匀速运动。水平方向安培力是内力，系统动量守恒；减少的机械能转化为焦耳热。',
    formulas: [
      { expr: 'E = BLv，I = E/R，F = BIL', note: '电磁感应与安培力' },
      { expr: 'm₁v₀ = (m₁+m₂)v共', note: '动量守恒' },
      { expr: 'Q = ½m₁v₀² − ½(m₁+m₂)v共²', note: '焦耳热' },
    ],
    steps: [
      '判断感应电流方向（楞次定律 / 右手定则）。',
      '对两杆分别写安培力，注意方向相反。',
      '用动量守恒求最终共同速度。',
      '用能量守恒求总焦耳热（或某一杆的发热量按电阻分配）。',
    ],
    data: ['两杆最终速度相同，回路中不再有感应电流。'],
    errors: ['把安培力当成外力，误用动量定理。', '忘记两杆质量不同时速度分配不同。'],
    cautions: ['导轨光滑、磁场恒定是动量守恒的前提。', '若回路有电阻，机械能全部转化为焦耳热。'],
    conclusion: '双杆模型：动量守恒求共速，能量守恒求焦耳热；安培力是系统内力。',
    controls: [
      { id: 'm1', label: '杆 1 质量', min: 0.1, max: 1, step: 0.05, unit: 'kg' },
      { id: 'm2', label: '杆 2 质量', min: 0.05, max: 0.8, step: 0.05, unit: 'kg' },
      { id: 'v0', label: '杆 1 初速度', min: 0.5, max: 6, step: 0.5, unit: 'm/s' },
      { id: 'B', label: '磁感应强度 B', min: 0.1, max: 2, step: 0.1, unit: 'T' },
      { id: 'L', label: '导轨间距 L', min: 0.2, max: 1, step: 0.1, unit: 'm' },
      { id: 'R', label: '总电阻 R', min: 0.1, max: 2, step: 0.1, unit: 'Ω' },
    ],
    params: { m1: 0.2, m2: 0.1, v0: 2, B: 0.5, L: 0.4, R: 0.2 },
  }),

  M({
    id: 'model-slope',
    name: '斜面模型',
    short: '斜面模型',
    field: '力学',
    stage: 'model',
    modelType: 'slope',
    tagline: '重力沿斜面分力与摩擦力较劲，决定物体加速下滑还是静止。',
    principle:
      '质量为 m 的物体放在倾角为 θ 的斜面上。重力沿斜面的分力为 mg sinθ，垂直斜面的分力为 mg cosθ，支持力 N = mg cosθ。若滑动，摩擦力 f = μN；沿斜面加速度 a = g(sinθ − μcosθ)。当 μ ≥ tanθ 时，物体保持静止。',
    formulas: [
      { expr: 'N = mg cosθ，f = μN', note: '支持力与滑动摩擦力' },
      { expr: 'a = g(sinθ − μcosθ)', note: '沿斜面下滑的加速度' },
      { expr: 'μ ≥ tanθ 时静止', note: '斜面上的自锁条件' },
    ],
    steps: [
      '把重力分解为沿斜面和垂直斜面两个方向。',
      '垂直方向平衡求支持力 N = mg cosθ。',
      '沿斜面方向列牛顿第二定律，注意摩擦力方向。',
      '判断 μ 与 tanθ 的大小，确定静止还是滑动。',
    ],
    data: ['斜面问题通常沿斜面 / 垂直斜面建坐标系，比水平竖直更简单。'],
    errors: ['把重力沿斜面的分力写成 mg cosθ。', '摩擦力方向判断反了。'],
    cautions: ['静摩擦最大值略大于滑动摩擦，但高中通常近似相等。', '斜面加速时，支持力仍等于 mg cosθ（无竖直加速度）。'],
    conclusion: '斜面模型：N = mgcosθ，沿斜面 a = g(sinθ − μcosθ)，μ ≥ tanθ 时静止。',
    controls: [
      { id: 'theta', label: '倾角 θ', min: 5, max: 70, step: 5, unit: '°' },
      { id: 'mu', label: '动摩擦因数 μ', min: 0, max: 1, step: 0.05 },
      { id: 'm', label: '质量 m', min: 0.5, max: 5, step: 0.5, unit: 'kg' },
    ],
    params: { theta: 30, mu: 0.2, m: 1 },
  }),

  M({
    id: 'model-ac-rms',
    name: '交变电流有效值模型',
    short: '交流有效值',
    field: '电磁学',
    stage: 'model',
    modelType: 'wave',
    tagline: '有效值不是平均值，而是按「发热相同」折算出的等效直流值。',
    principle:
      '正弦交流电 u = Um sin(ωt) 的有效值 U = Um/√2。有效值是根据电流的热效应定义的：让交流电和直流电分别通过相同电阻，在相同时间内产生相同热量，这个直流电的数值就是交流电的有效值。计算电功、电功率、热量时都要用有效值。',
    formulas: [
      { expr: 'U = Um/√2 ≈ 0.707Um', note: '正弦交流电有效值' },
      { expr: 'I = Im/√2', note: '电流有效值' },
      { expr: 'P = UI = I²R = U²/R', note: '功率用有效值计算' },
    ],
    steps: [
      '写出交流电瞬时值表达式，确定峰值 Um 和角频率 ω。',
      '由 U = Um/√2 求有效值。',
      '计算功率、热量时用有效值，不能用峰值。',
      '非正弦交流电要用「发热等效」定义求有效值。',
    ],
    data: ['交流电表读数、铭牌上的额定值都是有效值。'],
    errors: ['把峰值当成有效值算功率。', '认为有效值等于平均值。'],
    cautions: ['只有正弦交流电才有 U = Um/√2 的简单关系。', '电容器耐压值要看峰值。'],
    conclusion: '正弦交流电有效值等于峰值的 1/√2；功率、热量用有效值计算。',
    controls: [
      { id: 'Um', label: '峰值 Um', min: 50, max: 400, step: 10, unit: 'V' },
      { id: 'f', label: '频率 f', min: 10, max: 100, step: 5, unit: 'Hz' },
    ],
    params: { Um: 311, f: 50 },
    chartTitle: '正弦交流电的波形与有效值',
  }),

  M({
    id: 'model-levels',
    name: '氢原子能级跃迁模型',
    short: '能级跃迁',
    field: '电磁学',
    stage: 'model',
    modelType: 'levels',
    tagline: '能级是分立的；跃迁吸收或放出的光子能量等于两能级差。',
    principle:
      '氢原子能级 Eₙ = −13.6/n² eV。电子在能级间跃迁时，吸收或放出能量为 hν = |E₂ − E₁| 的光子。从高能级向低能级跃迁放出光子，从低能级向高能级跃迁吸收光子。一群处于 n 能级的氢原子可能发出多种频率的光。',
    formulas: [
      { expr: 'Eₙ = −13.6/n² eV', note: '氢原子能级公式' },
      { expr: 'hν = |E₂ − E₁|', note: '光子能量等于能级差' },
      { expr: 'λ = hc/ΔE', note: '光子波长' },
    ],
    steps: [
      '确定初、末能级 n₁、n₂。',
      '由 Eₙ = −13.6/n² 求两能级能量。',
      '求能级差 ΔE，判断吸收还是放出光子。',
      '由 λ = hc/ΔE 求波长。',
    ],
    data: ['能级差越大，光子频率越高、波长越短。'],
    errors: ['把能级能量当成正值。', '认为跃迁可以吸收任意能量的光子。'],
    cautions: ['光子能量必须恰好等于能级差才能被吸收（电离除外）。', '一群原子与一个原子的发光种数不同。'],
    conclusion: '能级跃迁：hν = ΔE；氢原子能级 Eₙ = −13.6/n² eV。',
    selects: [
      {
        id: 'mode',
        label: '演示类型',
        options: [
          { value: 'transition', label: '能级跃迁' },
          { value: 'photoelectric', label: '光电效应' },
        ],
      },
    ],
    controls: [
      { id: 'n1', label: '初态能级 n₁', min: 1, max: 4, step: 1, digits: 0 },
      { id: 'n2', label: '末态能级 n₂', min: 1, max: 4, step: 1, digits: 0 },
    ],
    params: { mode: 'transition', n1: 1, n2: 3 },
  }),

  M({
    id: 'model-photoelectric',
    name: '光电效应模型',
    short: '光电效应',
    field: '电磁学',
    stage: 'model',
    modelType: 'levels',
    tagline: '光子能量大于逸出功才有光电子；最大初动能只与频率有关。',
    principle:
      '光照射金属表面，光子能量 hν 大于金属的逸出功 W 时，电子吸收光子后逸出，最大初动能 Ek = hν − W。能否发生光电效应取决于入射光频率是否大于截止频率，与光强无关；光强只影响单位时间逸出的光电子数。',
    formulas: [
      { expr: 'Ek = hν − W', note: '爱因斯坦光电方程' },
      { expr: 'eUc = Ek', note: '截止电压' },
      { expr: 'νc = W/h', note: '截止频率' },
    ],
    steps: [
      '比较光子能量 hν 与逸出功 W，判断能否发生光电效应。',
      '由 Ek = hν − W 求最大初动能。',
      '由 eUc = Ek 求截止电压。',
      '区分「光强」与「频率」对光电流、最大初动能的影响。',
    ],
    data: ['最大初动能与光强无关，只与频率和金属逸出功有关。'],
    errors: ['认为光强越大，最大初动能越大。', '认为光照时间越长，电子能量越大。'],
    cautions: ['逸出功由金属材料决定。', '光强影响饱和光电流大小。'],
    conclusion: '光电效应：Ek = hν − W；能否发生看频率，最大初动能看频率和逸出功。',
    selects: [
      {
        id: 'mode',
        label: '演示类型',
        options: [
          { value: 'photoelectric', label: '光电效应' },
          { value: 'transition', label: '能级跃迁' },
        ],
      },
    ],
    controls: [
      { id: 'Eph', label: '光子能量 hν', min: 1, max: 6, step: 0.1, unit: 'eV' },
      { id: 'W', label: '逸出功 W', min: 1, max: 5, step: 0.1, unit: 'eV' },
    ],
    params: { mode: 'photoelectric', Eph: 3, W: 2.2 },
  }),

  M({
    id: 'model-cyclotron',
    name: '回旋加速器模型',
    short: '回旋加速器',
    field: '电磁学',
    stage: 'model',
    modelType: 'cyclotron',
    tagline: '电场加速、磁场回旋；周期与速度无关，所以交流电频率固定。',
    principle:
      '回旋加速器的 D 形盒处在匀强磁场中，缝隙加高频交流电压。粒子在磁场中做圆周运动，周期 T = 2πm/(qB) 与速度无关；每次经过缝隙被电场加速，半径逐渐增大。最终能量由 D 形盒半径 R 和磁感应强度 B 决定：Ek = q²B²R²/(2m)。',
    formulas: [
      { expr: 'f = qB/(2πm)', note: '回旋频率，与速度无关' },
      { expr: 'vmax = qBR/m', note: '最大速度' },
      { expr: 'Ekmax = q²B²R²/(2m)', note: '最大动能' },
    ],
    steps: [
      '明确粒子在磁场中回旋、在缝隙中被电场加速。',
      '由 qvB = mv²/r 得 r = mv/(qB)。',
      '由 T = 2πm/(qB) 说明周期与速度无关，交流电频率固定。',
      '由最大半径 R 求最大速度和最大动能。',
    ],
    data: ['加速电压越大，加速次数越少，但最大动能不变（由 R、B 决定）。'],
    errors: ['认为加速电压越大，最终动能越大。', '把回旋频率写成与速度有关。'],
    cautions: ['相对论效应在高速时不可忽略，回旋加速器不能无限加速。', '交流电频率要等于回旋频率。'],
    conclusion: '回旋加速器：回旋周期与速度无关，最大动能由 q、B、R 决定。',
    controls: [
      { id: 'B', label: '磁感应强度 B', min: 0.2, max: 2, step: 0.1, unit: 'T' },
      { id: 'R', label: 'D 形盒半径 R', min: 0.2, max: 1, step: 0.1, unit: 'm' },
      { id: 'qm', label: '比荷 q/m', min: 2e7, max: 2e8, step: 1e7, unit: 'C/kg' },
    ],
    params: { B: 1, R: 0.5, qm: 1e8 },
  }),

  M({
    id: 'model-bullet-block',
    name: '子弹打木块模型',
    short: '子弹打木块',
    field: '力学',
    stage: 'collision',
    tagline: '子弹射入木块，动量守恒；机械能损失变成热，可能射穿也可能留在块内。',
    principle:
      '子弹以速度 v₀ 水平射入静止木块。水平方向不受外力，动量守恒；若子弹留在木块内，属于完全非弹性碰撞，共同速度 v = m弹v₀/(m弹+m块)，损失的动能转化为内能。若子弹射穿，则要分别知道子弹和木块的速度，用动量守恒和能量关系分析。',
    formulas: [
      { expr: 'm弹v₀ = (m弹+m块)v', note: '子弹留在木块内（完全非弹性）' },
      { expr: 'Q = ½m弹v₀² − ½(m弹+m块)v²', note: '系统损失的机械能' },
      { expr: 'Q = f·d相对', note: '相对位移与摩擦生热' },
    ],
    steps: [
      '判断子弹是否射穿木块，确定末状态。',
      '水平方向列动量守恒。',
      '由能量守恒求摩擦生热或相对位移。',
      '检查速度方向与相对位移是否合理。',
    ],
    data: ['子弹质量小、速度大；木块质量大、速度小。'],
    errors: ['误认为子弹动量全部传给木块。', '忽略系统机械能损失。'],
    cautions: ['水平方向动量守恒的前提是忽略外力冲量。', '射穿时相对位移等于木块厚度。'],
    conclusion: '子弹打木块：动量守恒，机械能减少量等于摩擦生热。',
    controls: [
      { id: 'm1', label: '子弹质量 m', min: 0.01, max: 0.2, step: 0.01, unit: 'kg' },
      { id: 'm2', label: '木块质量 M', min: 0.1, max: 2, step: 0.1, unit: 'kg' },
      { id: 'v1', label: '子弹初速度 v₀', min: 50, max: 600, step: 10, unit: 'm/s' },
    ],
    selects: [
      {
        id: 'type',
        label: '碰撞类型',
        options: [
          { value: 'inelastic', label: '完全非弹性（留在块内）' },
          { value: 'elastic', label: '弹性（示意）' },
        ],
      },
    ],
    params: { m1: 0.02, m2: 0.5, v1: 300, type: 'inelastic' },
  }),

  M({
    id: 'model-explosion',
    name: '爆炸模型',
    short: '爆炸模型',
    field: '力学',
    stage: 'collision',
    tagline: '爆炸瞬间内力远大于外力，动量守恒，动能增加。',
    principle:
      '爆炸过程中内力远大于外力，系统动量近似守恒。爆炸前系统静止或具有初动量，爆炸后各碎片按动量守恒分配速度；化学能转化为碎片的动能，所以总动能增加。',
    formulas: [
      { expr: '0 = m₁v₁ + m₂v₂', note: '爆炸前静止' },
      { expr: 'p₁ = −p₂', note: '碎片动量等大反向' },
      { expr: 'ΔEk > 0', note: '化学能转化为动能' },
    ],
    steps: [
      '判断爆炸时间极短、内力远大于外力，动量守恒。',
      '规定正方向，写爆炸前后的动量守恒式。',
      '由动量守恒求各碎片速度。',
      '比较爆炸前后的动能，求增加的机械能。',
    ],
    data: ['爆炸后碎片动量等大反向（初动量为零时）。'],
    errors: ['认为爆炸过程机械能守恒。', '忘记动量是矢量。'],
    cautions: ['爆炸问题通常忽略重力的瞬时冲量。', '碎片速度方向要按正方向取符号。'],
    conclusion: '爆炸模型：动量守恒，动能增加；碎片动量等大反向。',
    controls: [
      { id: 'm1', label: '碎片 1 质量', min: 0.1, max: 2, step: 0.1, unit: 'kg' },
      { id: 'm2', label: '碎片 2 质量', min: 0.1, max: 2, step: 0.1, unit: 'kg' },
      { id: 'v1', label: '碎片 1 初速度', min: 0, max: 10, step: 1, unit: 'm/s' },
    ],
    selects: [
      {
        id: 'type',
        label: '碰撞类型',
        options: [
          { value: 'elastic', label: '爆炸（弹性示意）' },
          { value: 'inelastic', label: '完全非弹性（示意）' },
        ],
      },
    ],
    params: { m1: 1, m2: 1, v1: 2, type: 'elastic' },
  }),

  M({
    id: 'model-elastic-collision',
    name: '弹性碰撞模型',
    short: '弹性碰撞',
    field: '力学',
    stage: 'collision',
    tagline: '动量守恒、动能也守恒；质量相等时交换速度。',
    principle:
      '两物体发生弹性正碰，碰撞前后总动量守恒，总动能也守恒。联立解得 v₁′ = ((m₁−m₂)v₁)/(m₁+m₂)，v₂′ = (2m₁v₁)/(m₁+m₂)。若 m₁ = m₂，则 v₁′ = 0、v₂′ = v₁，即交换速度。',
    formulas: [
      { expr: 'm₁v₁ = m₁v₁′ + m₂v₂′', note: '动量守恒' },
      { expr: '½m₁v₁² = ½m₁v₁′² + ½m₂v₂′²', note: '动能守恒' },
      { expr: 'm₁ = m₂ 时交换速度', note: '等质量弹性碰撞' },
    ],
    steps: [
      '判断是否为弹性碰撞（动能守恒）。',
      '列动量守恒和动能守恒两个方程。',
      '解出两物体碰后速度，注意方向。',
      '用极限情况（等质量、m₁≫m₂）检验结果。',
    ],
    data: ['弹性碰撞动能守恒；非弹性碰撞动能减少。'],
    errors: ['把弹性碰撞当成完全非弹性。', '解方程时漏掉方向符号。'],
    cautions: ['弹性碰撞是理想模型，实际碰撞会有能量损失。', '一维正碰才可用上面的速度公式。'],
    conclusion: '弹性碰撞：动量守恒、动能守恒；等质量时交换速度。',
    controls: [
      { id: 'm1', label: '物体 1 质量', min: 0.1, max: 2, step: 0.1, unit: 'kg' },
      { id: 'm2', label: '物体 2 质量', min: 0.1, max: 2, step: 0.1, unit: 'kg' },
      { id: 'v1', label: '物体 1 初速度', min: 0.2, max: 5, step: 0.2, unit: 'm/s' },
    ],
    selects: [
      {
        id: 'type',
        label: '碰撞类型',
        options: [
          { value: 'elastic', label: '弹性碰撞' },
          { value: 'inelastic', label: '完全非弹性' },
        ],
      },
    ],
    params: { m1: 0.2, m2: 0.2, v1: 1.2, type: 'elastic' },
  }),

  M({
    id: 'model-inelastic-collision',
    name: '完全非弹性碰撞模型',
    short: '完全非弹性碰撞',
    field: '力学',
    stage: 'collision',
    tagline: '碰后粘在一起，动量守恒，动能损失最大。',
    principle:
      '两物体碰撞后粘在一起以共同速度运动，称为完全非弹性碰撞。此过程动量守恒，但动能损失最大：v = (m₁v₁ + m₂v₂)/(m₁+m₂)，ΔEk = ½m₁v₁² + ½m₂v₂² − ½(m₁+m₂)v²。',
    formulas: [
      { expr: 'm₁v₁ + m₂v₂ = (m₁+m₂)v', note: '动量守恒' },
      { expr: 'ΔEk = ½m₁v₁² + ½m₂v₂² − ½(m₁+m₂)v²', note: '损失的动能' },
      { expr: 'v = (m₁v₁+m₂v₂)/(m₁+m₂)', note: '共同速度' },
    ],
    steps: [
      '判断碰后是否粘在一起（共速）。',
      '列动量守恒求共同速度。',
      '用初末动能差求损失。',
      '检验共同速度方向与总动量方向一致。',
    ],
    data: ['完全非弹性碰撞动能损失最大，损失量等于相对运动动能。'],
    errors: ['认为动能守恒。', '忘记碰后两物体质量相加。'],
    cautions: ['子弹打木块、板块共速都属于完全非弹性碰撞。', '碰撞时间极短，外力冲量可忽略。'],
    conclusion: '完全非弹性碰撞：动量守恒、碰后共速、动能损失最大。',
    controls: [
      { id: 'm1', label: '物体 1 质量', min: 0.1, max: 2, step: 0.1, unit: 'kg' },
      { id: 'm2', label: '物体 2 质量', min: 0.1, max: 2, step: 0.1, unit: 'kg' },
      { id: 'v1', label: '物体 1 初速度', min: 0.2, max: 5, step: 0.2, unit: 'm/s' },
    ],
    selects: [
      {
        id: 'type',
        label: '碰撞类型',
        options: [
          { value: 'inelastic', label: '完全非弹性' },
          { value: 'elastic', label: '弹性' },
        ],
      },
    ],
    params: { m1: 0.2, m2: 0.3, v1: 1.2, type: 'inelastic' },
  }),

  M({
    id: 'model-pendulum',
    name: '单摆模型',
    short: '单摆模型',
    field: '力学',
    stage: 'pendulum',
    tagline: '小角度单摆做简谐运动，周期 T = 2π√(L/g)，与摆球质量无关。',
    principle:
      '细线悬挂小球，摆角小于 5° 时，回复力 F = −(mg/L)x，近似简谐运动。周期 T = 2π√(L/g)，与摆球质量、振幅（小角度）无关。利用单摆可测重力加速度 g = 4π²L/T²。',
    formulas: [
      { expr: 'T = 2π√(L/g)', note: '单摆周期（小角度）' },
      { expr: 'g = 4π²L/T²', note: '测重力加速度' },
      { expr: 'F = −(mg/L)x', note: '小角度回复力' },
    ],
    steps: ['测摆长 L（线长 + 球半径）。', '小角度释放，测多次全振动时间求 T。', '由 T = 2π√(L/g) 求 g。', '改变摆长重复，作 T²-L 图像。'],
    data: ['摆长是悬点到球心的距离。', '小角度条件下周期与振幅无关。'],
    errors: ['把线长当成摆长。', '摆角过大，周期公式失效。'],
    cautions: ['摆角小于 5°。', '从最低点开始计时，测 30~50 次全振动。'],
    conclusion: '单摆小角度周期 T = 2π√(L/g)，与摆球质量无关。',
    controls: [
      { id: 'L', label: '摆长 L', min: 0.5, max: 1.5, step: 0.1, unit: 'm' },
      { id: 'th0', label: '初始摆角', min: 1, max: 5, step: 1, unit: '°' },
    ],
    params: { L: 1, th0: 5 },
  }),

  M({
    id: 'model-spring-osc',
    name: '弹簧振子模型',
    short: '弹簧振子',
    field: '力学',
    stage: 'shm',
    tagline: '回复力 F = −kx，周期 T = 2π√(m/k)，与振幅无关。',
    principle:
      '水平弹簧振子以平衡位置为中心振动，回复力 F = −kx，加速度 a = −(k/m)x，所以做简谐运动。周期 T = 2π√(m/k)，只由振子质量和弹簧劲度系数决定，与振幅无关。',
    formulas: [
      { expr: 'F = −kx', note: '胡克定律提供回复力' },
      { expr: 'T = 2π√(m/k)', note: '弹簧振子周期' },
      { expr: 'x = A cos(ωt + φ)', note: '位移随时间变化' },
    ],
    steps: ['确定平衡位置和振幅 A。', '写回复力 F = −kx。', '由 a = −(k/m)x 判断简谐运动。', '由 T = 2π√(m/k) 分析周期与 m、k 的关系。'],
    data: ['周期与振幅无关，这是简谐运动的等时性。'],
    errors: ['认为振幅越大周期越大。', '把弹簧长度当成形变量。'],
    cautions: ['在弹性限度内。', '竖直弹簧振子的平衡位置包含重力影响。'],
    conclusion: '弹簧振子：F = −kx，T = 2π√(m/k)，与振幅无关。',
    controls: [
      { id: 'A', label: '振幅 A', min: 2, max: 8, step: 0.5, unit: 'cm' },
      { id: 'k', label: '劲度系数 k', min: 5, max: 40, step: 1, unit: 'N/m' },
      { id: 'm', label: '振子质量 m', min: 0.1, max: 0.5, step: 0.05, unit: 'kg' },
      { id: 'phi', label: '初相 φ₀', min: 0, max: 360, step: 15, unit: '°' },
    ],
    params: { A: 6, k: 20, m: 0.2, phi: 0 },
  }),

  M({
    id: 'model-projectile',
    name: '平抛 / 类平抛模型',
    short: '平抛模型',
    field: '力学',
    stage: 'projectile',
    tagline: '水平方向匀速，竖直方向匀加速；轨迹是抛物线。',
    principle:
      '平抛运动可分解为水平匀速直线运动和竖直自由落体运动：x = v₀t，y = ½gt²。飞行时间只由高度决定 t = √(2h/g)，水平射程 x = v₀√(2h/g)。类平抛（如带电粒子在平行板电场中的偏转）只是把 g 换成等效加速度。',
    formulas: [
      { expr: 'x = v₀t，y = ½gt²', note: '分运动规律' },
      { expr: 't = √(2h/g)', note: '飞行时间' },
      { expr: 'tanθ = gt/v₀', note: '速度偏角' },
    ],
    steps: ['把运动分解为水平和竖直两个方向。', '水平匀速、竖直自由落体。', '由高度求时间，由时间求水平射程。', '求合速度、速度偏角或轨迹方程。'],
    data: ['平抛时间只由高度决定，与初速度无关。'],
    errors: ['认为初速度越大，下落时间越长。', '把位移偏角当成速度偏角。'],
    cautions: ['初速度必须水平。', '类平抛要把「重力」换成恒定的等效力。'],
    conclusion: '平抛：水平匀速、竖直自由落体，轨迹为抛物线。',
    controls: [
      { id: 'v0', label: '初速度 v₀', min: 1, max: 6, step: 0.2, unit: 'm/s' },
      { id: 'h', label: '抛出高度 h', min: 0.4, max: 2, step: 0.1, unit: 'm' },
    ],
    params: { v0: 4, h: 1.25 },
  }),

  M({
    id: 'model-vertical-circle',
    name: '竖直圆周运动临界模型',
    short: '竖直圆周临界',
    field: '力学',
    stage: 'circular',
    tagline: '绳模型最高点最小速度 √(gR)；杆模型最高点速度可以为零。',
    principle:
      '小球在竖直平面内做圆周运动。绳（或内轨道）模型在最高点的临界条件是重力恰好提供向心力：mg = mv²/R，所以 vmin = √(gR)。杆（或双轨道）模型可以提供支持力，最高点速度可以为零，临界条件不同。',
    formulas: [
      { expr: 'mg = mv²/R', note: '绳模型最高点临界' },
      { expr: 'vmin = √(gR)', note: '绳模型最高点最小速度' },
      { expr: 'F = mv²/R − mg', note: '最高点绳张力' },
    ],
    steps: ['判断是绳模型还是杆模型。', '在最高点 / 最低点写向心力方程。', '由临界条件求最小速度。', '用机械能守恒联系高低点速度。'],
    data: ['绳只能拉，最高点速度不能小于 √(gR)；杆可支持，速度可为零。'],
    errors: ['把杆模型也当成 vmin = √(gR)。', '忘记重力也提供向心力。'],
    cautions: ['临界条件取决于约束类型（绳 / 杆 / 轨道）。', '最高点速度小于临界值时，绳会松弛。'],
    conclusion: '竖直圆周临界：绳模型最高点 vmin = √(gR)，杆模型可为零。',
    controls: [
      { id: 'm', label: '小球质量 m', min: 0.1, max: 2, step: 0.1, unit: 'kg' },
      { id: 'r', label: '圆周半径 r', min: 0.2, max: 1.5, step: 0.1, unit: 'm' },
      { id: 'w', label: '角速度 ω', min: 2, max: 10, step: 0.5, unit: 'rad/s' },
    ],
    params: { m: 0.2, r: 0.5, w: 6 },
  }),

  M({
    id: 'model-single-rod',
    name: '电磁感应单杆模型',
    short: '单杆电磁感应',
    field: '电磁学',
    stage: 'induction',
    tagline: '杆切割磁感线产生电动势，安培力阻碍相对运动（楞次定律）。',
    principle:
      '导体棒在磁场中切割磁感线，产生感应电动势 E = BLv；回路闭合时产生感应电流，安培力 F = BIL 阻碍导体棒的运动。这就是楞次定律「来拒去留、增反减同」的力学表现。',
    formulas: [
      { expr: 'E = BLv', note: '动生电动势' },
      { expr: 'I = E/R = BLv/R', note: '闭合回路电流' },
      { expr: 'F = BIL = B²L²v/R', note: '安培力（阻力）' },
    ],
    steps: ['判断杆的运动方向与磁场方向。', '由 E = BLv 求电动势。', '由闭合电路欧姆定律求电流。', '由 F = BIL 求安培力，用楞次定律判断方向。'],
    data: ['安培力总是阻碍相对运动，做负功。'],
    errors: ['把安培力当成动力。', '忘记感应电动势的方向。'],
    cautions: ['杆、磁场、运动方向三者互相垂直时 E = BLv。', '回路总电阻包括杆和导轨电阻。'],
    conclusion: '单杆切割磁感线：E = BLv，F = B²L²v/R，安培力阻碍运动。',
    selects: [
      {
        id: 'pole',
        label: '磁场方向',
        options: [
          { value: 'N', label: 'N 极朝向线圈' },
          { value: 'S', label: 'S 极朝向线圈' },
        ],
      },
    ],
    controls: [],
    params: { pole: 'N' },
  }),

  M({
    id: 'model-transformer',
    name: '变压器与远距离输电模型',
    short: '变压器 / 输电',
    field: '电磁学',
    stage: 'transformer',
    tagline: '电压比等于匝数比；高压输电减小电流，从而减少线路损耗。',
    principle:
      '理想变压器 U₁/U₂ = n₁/n₂，I₁/I₂ = n₂/n₁，P₁ = P₂。远距离输电时，输送功率 P 一定，电压越高电流 I = P/U 越小，线路损耗 P损 = I²R线 越小，所以要用升压变压器后再输送。',
    formulas: [
      { expr: 'U₁/U₂ = n₁/n₂', note: '电压比等于匝数比' },
      { expr: 'P损 = I²R线 = (P/U)²R线', note: '线路损耗' },
      { expr: 'P₁ = P₂', note: '理想变压器功率守恒' },
    ],
    steps: ['确定原、副线圈匝数和输入电压。', '由匝数比求副线圈电压。', '由功率求电流，再求线路损耗。', '分析高压输电为什么能减少损耗。'],
    data: ['变压器只改变交流电压，不改变频率。'],
    errors: ['认为升压变压器能省电。', '把电压比与电流比弄反。'],
    cautions: ['变压器不能接直流电。', '实际变压器有漏磁和损耗。'],
    conclusion: '变压器：电压比等于匝数比；高压输电可减小线路损耗。',
    controls: [
      { id: 'n1', label: '原线圈匝数 n₁', min: 200, max: 800, step: 20 },
      { id: 'n2', label: '副线圈匝数 n₂', min: 50, max: 400, step: 10 },
      { id: 'U1', label: '原线圈电压 U₁', min: 6, max: 24, step: 1, unit: 'V' },
    ],
    params: { n1: 400, n2: 200, U1: 12 },
  }),

  M({
    id: 'model-dynamic-circuit',
    name: '电路动态分析 / 限流分压模型',
    short: '电路动态分析',
    field: '电磁学',
    stage: 'emf',
    tagline: '滑动变阻器一变，总电阻、总电流、路端电压连锁变化。',
    principle:
      '闭合电路中，外电阻变化会引起总电流、路端电压和各支路电压 / 电流的连锁变化。分析顺序通常是「局部 → 整体 → 局部」：先看变阻器怎么变，再判断总电阻、总电流，最后由 U = E − Ir 判断路端电压，再回到各支路。',
    formulas: [
      { expr: 'I = E/(R+r)', note: '闭合电路欧姆定律' },
      { expr: 'U = E − Ir', note: '路端电压' },
      { expr: '串联分压、并联分流', note: '电路结构分析' },
    ],
    steps: ['明确变阻器哪一部分接入电路、如何变化。', '判断总电阻变大还是变小。', '由闭合电路欧姆定律判断总电流、路端电压。', '回到局部，判断各支路电压、电流、功率。'],
    data: ['路端电压随外电阻增大而增大，随电流增大而减小。'],
    errors: ['只看局部，不看总电流变化。', '把路端电压当成电动势。'],
    cautions: ['注意电流表、电压表的内阻影响。', '限流接法与分压接法的调节范围不同。'],
    conclusion: '电路动态分析按「局部—整体—局部」顺序，抓住总电流和路端电压。',
    controls: [
      { id: 'E', label: '电动势 E', min: 1.2, max: 6, step: 0.1, unit: 'V' },
      { id: 'r', label: '内阻 r', min: 0.2, max: 3, step: 0.1, unit: 'Ω' },
    ],
    params: { E: 3, r: 0.5 },
  }),

  M({
    id: 'model-energy',
    name: '机械能守恒 / 功能关系模型',
    short: '机械能守恒',
    field: '力学',
    stage: 'fall',
    tagline: '只有重力 / 弹力做功时机械能守恒；有其他力做功要看功能关系。',
    principle:
      '物体只受重力（或弹簧弹力）做功时，动能和势能相互转化，机械能总量保持不变：½mv² + mgh = 常量。若还有摩擦力等做功，机械能不守恒，但可以用动能定理 W合 = ΔEk 或功能关系 W其他 = ΔE机械。',
    formulas: [
      { expr: '½mv₁² + mgh₁ = ½mv₂² + mgh₂', note: '机械能守恒' },
      { expr: 'W合 = ΔEk', note: '动能定理' },
      { expr: 'W其他 = ΔE机械', note: '功能关系' },
    ],
    steps: ['判断是否只有重力 / 弹力做功。', '选零势能面，写初末机械能。', '列机械能守恒或动能定理。', '解速度、高度或功。'],
    data: ['机械能守恒的条件是「只有重力 / 弹力做功」，不是「只受重力」。'],
    errors: ['有摩擦力时仍用机械能守恒。', '忘记选零势能面。'],
    cautions: ['动能定理对任何过程都成立。', '摩擦生热 Q = f·s相对，不是 f·s对地。'],
    conclusion: '机械能守恒看做功条件；不守恒时用动能定理或功能关系。',
    controls: [{ id: 'h', label: '下落高度 h', min: 0.2, max: 2, step: 0.1, unit: 'm' }],
    params: { h: 0.8 },
  }),
]
