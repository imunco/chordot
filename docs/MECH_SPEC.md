# 机构装配（物理模式）v0.14.0 实现规格

> 这是本轮「物理模式部件大扩充」的共享契约。Lead 已改完 `src/kernel/types.ts`（机构部分）与 `src/model/mech.ts`
> （23 种部件目录 / 10 种连接 / 18 个预设 / 老文件迁移）。以下文件由各人按此规格实现，**不要改别人的文件**。

## 0. 文件所有权（严格）

| 文件 | 负责人 | 说明 |
|---|---|---|
| `src/kernel/types.ts`、`src/model/mech.ts` | Lead（已完成） | 类型与目录；发现缺字段先找 Lead |
| `src/components/MechStage.tsx` | teammate `mech-stage` | 画布层：Matter 引擎 + SVG 渲染 + 交互 |
| `src/components/MechBar.tsx` | teammate `mech-ui` | 部件盘 + 检查器 + 世界面板 + 预设 |
| `src/App.tsx`、`src/components/CanvasStage.tsx`、`src/styles/app.css`、`src/io/file.ts` | Lead | 接线 / 样式 / 存档迁移 |
| `electron/verify-mech.cjs` | teammate `mech-verify` | 端到端验证 |
| `docs/MECH_SPEC.md` | Lead | 本文件 |

开始前先读：`src/kernel/types.ts`（MechPart / MechLink / MechParams / MechLive）、`src/model/mech.ts`（目录与预设）、旧版 `MechStage.tsx` / `MechBar.tsx`、以及 `electron/verify-mech.cjs`（老断言不能挂）。

## 1. 目标

物理模式要像一台**专业二维机构 / 物理建模台**：部件齐全（23 种，覆盖中学物理与常见机械）、连接与传动齐全（10 种）、
拖动摆放能吸附、能多选、能测距、能看实时读数，装配完按「真实」就真的按物理规律动。

## 2. 部件清单（kind → 物理 / 渲染）

世界坐标 y 向上，地面 `MECH_GROUND_Y = -2.4`；Matter 的 y 向下，**建体时 position 直接传世界坐标、gravity.y 取负**（沿用旧实现）。
角度：面板里是「度、逆时针为正、0=水平」，Matter 里 `angle = -deg*PI/180`（y 翻转）。

| kind | 中文 | 碰撞体 / 惯量 | 默认静态 | 特殊物理 |
|---|---|---|---|---|
| ball | 小球 | 圆 r=size，I=½mr² | 否 | 会滚 |
| box | 方块 | 方块边长 2size，I=∞（只滑不转） | 否 | — |
| cart | 小车 | 矩形 2size×2size2，I=∞ | 否 | 默认 friction 0.06 |
| plank | 木板 | 矩形 2size×2size2，I=m(L²+t²)/12 | 否 | 可自由转 |
| disc | 圆盘 | 圆 r=size，I=½mr² | 否 | 可钉住 |
| hoop | 圆环 | 圆 r=size，I=mr² | 否 | 可钉住 |
| wedge | 斜面 | 仅斜边薄矩形（静态），靠渲染画三角形 | 是 | 见 §3.1 几何 |
| weight | 砝码 | 方块 2size，I=∞ | 否 | 渲染画挂钩 |
| anchor | 固定点 | 静态圆 r=size | 是 | 实体销子（restitution 0.2） |
| bracket | 固定座 | 静态矩形 2size×2size2 | 是 | 可当铰链支座 |
| wall | 挡板 | 静态矩形 2size×2size2 | 是 | — |
| track | 轨道 | 静态薄矩形 2size×0.12，angle | 是 | 可勾 onTrack 让部件沿它滑 |
| arcTrack | 圆弧轨道 | 静态：沿圆弧排 N 段薄矩形（N≥14）合成碰撞；渲染画圆弧槽 | 是 | 几何见 §3.2 |
| pulley | 定滑轮 | 静态圆 r=size | 是 | 绳 vias 可绕 |
| movablePulley | 动滑轮 | 动态圆 r=size，I=½mr² | 否 | 绳绕过时受两段张力（§3.3） |
| gear | 齿轮 | 圆 r=size，I=½mr²，默认 pinned | 否 | 电机力矩 + gearPair 传动 |
| rack | 齿条 | 矩形 2size×2size2，I=细杆 | 默认固定 | rackPinion 传动；渲染画齿 |
| wheel | 轮 | 圆 r=size，I=½mr² | 否 | 可 pinned + motor |
| flywheel | 飞轮 | 圆 r=size，I=0.85mr²（默认 pinned） | 否 | 大转动惯量 |
| conveyor | 传送带 | 静态矩形 2size×0.12，angle | 是 | 表面速度 speed m/s：把接触物体往 speed 拉（§3.4） |
| thruster | 推力器 | 圆 r=size（实体小方块也可以） | 否 | 沿 angle 施加 thrust N 的力到自身（§3.5） |
| magnet | 磁铁 | 圆 r=size | 否 | 磁铁之间 F=±strength1·strength2/r²（§3.6） |
| planet | 引力源 | 静态圆 r=size | 是 | 对所有动态体 F=GM·m/r² 指向它（GM=strength） |

材质：`MECH_MATERIALS[part.material]` 给 friction / restitution；`part.friction` / `part.restitution` 可单独覆盖。
质量：`Matter.Body.setMass(body, part.mass)`，**然后按 `inertiaKind(part)` 用 `Body.setInertia` 设精确值**（否则转动件惯量是全按密度算的）。
质量 0 的固定件用 isStatic，不要 setMass。

建体统一：`frictionAir = 静态?0:(params.airDrag ?? 0.0015)`，`friction` / `restitution` 按材质，`density:0.001`，`slop` 默认。
`collisions === false` 时：部件之间不碰撞（保留地面 / 轨道等静态碰撞）——把动态部件的 `collisionFilter.mask` 里去掉部件类别位（部件 category=0x0001、场地=0x0002、地面=0x0004）。

## 3. 特殊物理（必须在 physicsStep 里实现）

### 3.1 斜面 wedge
顶点（世界局部）：A=(-size, -size2/2)、B=(+size, -size2/2)、C=(-size, +size2/2)；斜边 C→B。
碰撞体 = 沿斜边 C→B 的薄矩形（厚 0.1，长度 = |CB|），中心在 CB 中点，角度 = atan2(B.y-C.y, B.x-C.x)（世界），再按 part.angle 旋转。楔块是静态件。

### 3.2 圆弧轨道 arcTrack
圆心 = part 位置，半径 = size，圆弧从 `angle - span/2` 到 `angle + span/2`（度）；默认 angle=-90、span=150 → 碗形（凹向上）。
碰撞：把圆弧按 N=max(14, round(span/8)) 段折线，每段一个静态薄矩形（厚 0.1，放在段中点、沿弦方向），全部加入引擎世界。
`bodies` 里为这个部件放一个静态占位 Body（圆 r=size、不参与碰撞、category 0x0002）——选中 / 位置 / 链接偏移都读它。

### 3.3 绳经过动滑轮
现有 `linkForce` 只返回两端受力。改为：对每个 `vias` 里的滑轮（静态或动滑轮），绳在其两侧各有分段方向；张力 T 对**动滑轮**施加 `T*(u_prev + u_next)`（把两段方向单位向量相加），并记入 forcesRef。
静态滑轮不受力（钉死）。这样动滑轮两端各一半张力、能省一半力。

### 3.4 传送带 conveyor
表面方向 u=(cos a, sin a)，表面速度 v0=part.speed。对每个动态部件：若其底部离传送带上表面 <0.12 m 且水平投影落在带长范围内，则
沿 u 施力 `F = clamp(200*(v0 - v·u), -μ·m·g, μ·m·g)`（μ 用部件与传送带摩擦的较大者，g 用 params.gravity）。

### 3.5 推力器 thruster
每步对自身（非静态时）沿 angle 施加 `thrust` N；若它被 weld/hinge 连在别的体上，通过约束自然带动整体。

### 3.6 磁铁 / 引力源
磁铁对：对每对磁铁（至少一个动态），r=|Δp|（clamp ≥0.18），F = -(poleA*poleB)*strengthA*strengthB/r²（N 极=+1，S 极=-1），沿连线方向，单对上限 400 N；作用在两个动态体上（静态不动）。
引力源：对每个动态部件（排除自身、排除 planet），F = strength * mass / r² 指向引力源，r clamp ≥0.25，上限 400 N。

### 3.7 电机 / 公式力 / 轨道约束
沿用旧实现：`body.torque += motor*1e-6`；公式力 `F(x,y,vx,vy,t,m,g)`（mathjs，作用在中心，方向 angle，需要 force.angle 可与表达式方向叠加？保持旧语义：大小由表达式给出、方向 angle）；恒力 n N 方向 angle。
`onTrack` 轨道约束沿用旧的投影 + 只抹法向速度（直接改 `positionPrev`，用 `as unknown as {positionPrev}`）。
自重比例 `gravityScale`：引擎重力要按体单独处理——建体时若 `gravityScale !== 1`，不要靠引擎全局重力，改为每步对该体施加 `m*g*gravityScale` 向下（关闭该体的默认重力比较麻烦，Matter 没有 per-body gravityScale；做法：所有动态体都每步手动施加 `m*g*part.gravityScale`，并把引擎 `gravity.y` 设为 0）。**推荐**：engine.gravity.y = 0，所有重力由 physicsStep 统一施加 `-m*g*gravityScale`，这样也方便画受力分解。

### 3.8 连接（links）

| kind | 实现 |
|---|---|
| spring | 每步 F = k(dist-rest) + c·v_rel_along，两端各一份（沿连线，作用在连接点）；旧实现保留 |
| damper | F = c·v_rel_along，沿连线，只阻尼（不按 rest） |
| rope | 只拉不推（dist>rest 时 F=ROPE_K·(dist-rest)）；支持 vias 折线总长；视觉松弛时画下垂曲线 |
| rod | Matter.Constraint（length=rest, stiffness=1, damping=0.04），pointA/pointB=offsetA/offsetB |
| hinge | Matter.Constraint length=0（pointA/pointB=offsetA/offsetB）；若设了 lo/hi：每步把相对角度夹在 [初始相对角+lo, +hi]，越界时施加角速度修正 |
| weld | 刚性焊接：用**两条**零长度 Constraint 锁两个不同局部点（offsetA 与 offsetA+perpendicular 0.18 m 各一条），分别连到 B 对应点 → 锁相对位置与角度 |
| belt | 速度耦合：每步让 ωB 向 `ωA * rA / rB`（同向）靠拢，用角速度混合（0.25 权重）+ 必要时给微小力矩；记录 slip 能量损耗不要求 |
| gearPair | 速度耦合：ωB 向 `-ωA * rA / rB` 靠拢（反向）；用 `linkRatio()` |
| rackPinion | 转动 ↔ 平动耦合：齿轮 ω 与齿条沿自身 angle 的线速度满足 v = ω*r（符号按两者相对位置：用齿条局部方向 u，v_rack = -ω*r 时把 ω 修正，或按实际几何取符号；验收要求「齿轮转一圈，齿条移动 2πr」） |
| piston | F = clamp(k*(target - dist), -maxForce, +maxForce)，沿连线推 / 拉两端（两端各一份）；渲染画缸筒 + 活塞杆 |

约束限位 / 传动耦合都在 `Matter.Engine.update` **之前**施加（改 torque / velocity），弹簧力也在之前施加。

## 4. 渲染（SVG，纸面插画风格）

沿用旧配色：`#3d5a66` 主线、`#fbfaf7` 纸面、`#e7e3dc` 填充、材质色见 `MECH_MATERIALS`。所有部件画成 `<g data-part={id} data-kind={kind}>`，连接画成 `<g data-link={id} data-kind={kind}>`。
旧版每种部件的画法保留（ball / box / anchor / track / pulley / wheel），新增：
- 小车：车身圆角矩形 + 两个轮子 + 轴；
- 木板：圆角长条 + 木纹线；
- 圆盘：圆 + 同心圆纹 + 半径线（跟着 angle 转）；
- 圆环：粗圆环（stroke-width 按半径）；
- 楔块：直角三角形 path（斜边朝右下）+ 斜边阴影线；
- 砝码：方块 + 顶部挂钩（小圆弧 + 竖线）；
- 固定座：壁挂三角支架（L 形 + 斜撑）；
- 挡板：斜纹墙块；
- 圆弧轨道：圆弧双线 + 沿线短刻度；
- 齿轮：圆 + N 个梯形齿（N=teeth，沿圆周），中心轴孔；
- 齿条：长条 + 下沿齿（teeth 个）；
- 飞轮：外环 + 辐条 + 中心孔；
- 传送带：两端圆角 + 表面箭头（按 speed 方向）+ 滚轮；
- 推力器：梯形喷管 + 尾部火焰（播放时画 3 条渐短火焰线）；
- 磁铁：U 形磁铁，左半 N（红棕 #a4514a）右半 S（墨蓝 #3d5a66），中间字母；
- 引力源：同心圆 + 星环；
- 定滑轮 / 动滑轮：滑轮 + 顶部挂架（定滑轮画挂杆到上方 20px）。

**必须保留的旧结构**：滑轮画在绳之前（绳压在滑轮上）；`[data-kind="rope"]` 的多滑轮绳仍是 `<polyline>` 且两点滑轮时点数 = 4（首尾 + 2 个拐点）。

叠加层（全部 `pointerEvents="none"`，方便验证脚本抓）：
- 标尺网格：`.mech__grid`（`params` 之外由 props.grid>0 开启，画 0.5 m 细线 + 1 m 粗线）；
- 选中框：选中件外虚线框（多选都画），主选加实心角点；
- 轨迹：`<polyline data-trail={id}>`，每 4 步采样一次，最多 160 点；
- 标签：`<text className="mech__label" data-label={id}>`（部件名 + 质量；`props.labels` 开启）；
- 测距：`data-measure`，画两点连线 + 长度文字「L = x.xx m」+ 角度；
- 实时箭头：沿用旧 `Arrow`（速度 / 合力 / 受力分解 G / F弹 / F / N / f）；
- 速度 / 受力文字不变。

### 4.1 画布交互

- 点击部件：单选（Ctrl/Shift+点击：加选/减选）→ `onSelect(id,'part')`；多选时调 `onSelectMany(ids)`。
- 点击连接：`onSelect(id,'link')`。
- 连线模式 `pending` 沿用旧逻辑（第一次点记 anchor，第二次点连上；Esc 取消由 App 处理）。
- 编辑模式拖动：移动所有已选部件（及 group 同组），拖动时按 `props.grid` 吸附（0 = 不吸）；鼠标位移 >3px 才算拖动；松手 `onCommitParts` 写回坐标（保留旧语义：只有拖完才写文档）。
- `locked` 部件不可拖动，但仍可选中 / 删除。
- 真实模式：按住拖动 = 施力（沿用旧 PULL_K=90 / PULL_MAX=60），不写文档。
- 测距模式 `measureMode`：点两个部件 → `onMeasurePart(id)`；已选满两个后点第三个重新开始。
- **键盘快捷键由 App 处理**，MechStage 不监听全局键盘。

## 5. 组件接口（必须逐字照抄）

### 5.1 MechStageProps

```ts
interface Props {
  params: MechParams
  toScreen: (p: [number, number]) => [number, number]
  toWorld: (clientX: number, clientY: number) => { x: number; y: number }
  selectedId: string | null
  selectedIds: string[]
  onSelect: (id: string | null, kind: 'part' | 'link' | null) => void
  onSelectMany: (ids: string[]) => void
  pending: MechLinkKind | null
  anchor: string | null
  onAnchor: (id: string | null) => void
  onLink: (kind: MechLinkKind, a: string, b: string) => void
  playing: boolean
  editing: boolean
  vectors: boolean
  decompose: boolean
  labels: boolean
  trails: boolean
  grid: number
  snapAngle: boolean
  measure: { a: string; b: string } | null
  measureMode: boolean
  onMeasurePart: (id: string) => void
  resetToken: number
  onCommitParts: (parts: MechPart[]) => void
  /** 引擎实时读数写进这个 ref，MechBar 轮询显示；不触发 React 重渲染 */
  live: { current: MechLive }
}
```

`live.current` 每帧（或每 6 步）更新：`t / running / ke / pe / elastic / momentum / parts`（见 kernel/types.ts）。
能量：平动 ½mv² + 转动 ½Iω² 计入 ke；重力势能 m·g·(y - MECH_GROUND_Y) 计入 pe（gravityScale 用有效重力）；弹簧 ½kΔx² 计入 elastic；动量 = |Σ m·v|。

### 5.2 MechBarProps

```ts
interface Props {
  params: MechParams
  selected: { id: string; kind: 'part' | 'link' } | null
  selectedIds: string[]
  live: { current: MechLive }
  pending: MechLinkKind | null
  anchor: string | null
  playing: boolean
  editing: boolean
  vectors: boolean
  decompose: boolean
  labels: boolean
  trails: boolean
  grid: number
  snapAngle: boolean
  measure: { a: string; b: string } | null
  measureMode: boolean
  onEditing: (v: boolean) => void
  onPending: (k: MechLinkKind | null) => void
  onAddPart: (kind: MechPartKind) => void
  onPatchPart: (id: string, patch: Partial<MechPart>) => void
  onPatchLink: (id: string, patch: Partial<MechLink>) => void
  onPatchParams: (patch: Partial<MechParams>) => void
  onDelete: () => void
  onDisconnect: () => void
  onClear: () => void
  onPlay: (v: boolean) => void
  onReset: () => void
  onPreset: (preset: MechPresetId) => void
  onVectors: (v: boolean) => void
  onDecompose: (v: boolean) => void
  onLabels: (v: boolean) => void
  onTrails: (v: boolean) => void
  onGrid: (v: number) => void
  onSnapAngle: (v: boolean) => void
  onMeasureMode: (v: boolean) => void
  onMeasureClear: () => void
  onDuplicate: () => void
  onDuplicatePart: () => void
  onDuplicateSub: () => void
  onGroup: () => void
  onUngroup: () => void
  onSelectMany: (ids: string[]) => void
  onAlign: (axis: 'x' | 'y') => void
  onDistribute: (axis: 'x' | 'y') => void
  onRotate: (delta: number) => void
}
```

## 6. MechBar 布局与必须保留的 DOM 钩子

浮在画布左上角（`.mechbar`，宽 min(520px, 100%-28px)，max-height 100%-28，纵向滚动）。结构：
1. 编辑 / 真实 分段 + 播放 / 重置（`.mechbar__mode`、`.mechbar__seg button[data-active]`、`.mechbar__play`）；
2. 部件盘：4 个分类页签 `.mechbar__cat[data-cat]`（刚体 / 支撑 / 传动 / 装置）+ 搜索框 `.mechbar__search`；当前分类的部件按钮 `.mechbar__part[data-part-kind]`（可拖可点）。
   **注意**：23 个 `.mechbar__part` 按钮全部渲染在 DOM 里，非当前分类用 `hidden` 属性隐藏——老验证脚本会直接 `.click()` 找 kind，必须能点到。
3. 连接行：10 个 `.mechbar__link[data-kind]` 按钮（全部可见，可换行）；文本必须完全等于：弹簧 / 阻尼 / 绳 / 杆 / 铰链 / 焊接 / 皮带 / 齿轮啮合 / 齿轮齿条 / 活塞。
4. 工具栏 `.mechbar__row--tools`：拆开全部连接、清空、显示/隐藏矢量、受力分解、复制机构、预设行 `.mechbar__presets button`（18 个预设，文本用 label）。
5. 显示 / 世界面板 `.mechbar__world`：重力 `.mechbar__gravity`、时间倍率、空气阻力、碰撞开关、网格吸附下拉、角度吸附、标签、轨迹、测距按钮。
6. 多选工具条 `.mechbar__multi`：选中 N 个时显示「水平对齐 / 垂直对齐 / 水平分布 / 垂直分布 / 旋转 -15° / +15° / 成组 / 复制 / 删除」。
7. 检查器 `.mechbar__insp`（选中部件 / 连接时）：
   - `.mechbar__insphead` 头部（部件中文名 + `.mechbar__del` 删除）；
   - `.mechbar__fields label` 字段（质量 / 坐标 / 主尺寸 / 次尺寸 / 角度 / 材质下拉 / 摩擦 / 恢复系数 / 固定 / 锁定 / 电机 / 齿数 / 推力 / 磁极 / 磁强度 / 表面速度 / 弧度 / 标签 / 轨道约束 / 自重比例）；
   - `.mechbar__meta` 一行实时读数（当前速度 / 角速度 / 动能）；
   - `.mechbar__actions .mechbar__mini`：复制部件 / 复制子机构 / 成组 / 解组；
   - `.mechbar__force`：施加力（勾选框 + 模式选择 + 大小/方向 + 方向 chips + `.mechbar__expr`），结构与旧版一致；
   - 连接检查器：自然长度 / 端点偏移 A、B / 弹簧 k、c / 阻尼 c / 铰链限位 lo、hi / 活塞目标长度、最大推力、k / 绳绕滑轮 `.mechbar__route .mechbar__chip[data-on]` / 传动比 ratio；
   - 顶部保持 `.mechbar__hint` 操作提示。
8. 底部实时读数 `.mechbar__live`：t / 动能 / 势能 / 弹性势能 / 总机械能 / 动量；用 `useEffect + setInterval(120ms)` 轮询 `props.live.current`，**不要**每帧 setState。
9. 测距结果 `.mechbar__dim`：显示两点距离与连线角度。

老验证脚本依赖的文本 / 类名一个都不能改：`.mechbar__mini` 里的「拆开全部连接 / 清空 / 复制机构 / 复制部件 / 复制子机构 / 成组 / 解组」、`.mechbar__fields label` 里的「劲度」「倾角」「大小」「方向」、`.mechbar__presets button`、`.mechbar__hint` 文案「再点一个部件」、`.mechbar__expr`。

## 7. 验证脚本（mech-verify 负责）

扩展 `electron/verify-mech.cjs`，老断言全部保留（必要时把「点部件前先切分类」补上），新增断言：
1. 部件盘 4 个分类、23 个部件按钮、10 个连接按钮；切分类后可见按钮变化。
2. 新预设逐个打开：齿轮传动 3 部件 + 齿轮转（角度变化）；带传动 2 轮；杠杆 4 部件；曲柄滑块滑块沿轨道动；圆弧轨道球沿弧动（x 变）；液压缸小车被推走；火箭推力滑块右移；磁铁 S 极被吸近；动滑轮重物上升（y 变大）。
3. 多选：Shift 点两个部件 → `.mechbar__multi` 出现 → 点水平对齐后两个部件 x 相同；成组后拖动整组移动。
4. 网格吸附：`data-grid` 存在，拖到非整数处后坐标是 0.1 的倍数。
5. 测距：点两个部件 → `[data-measure]` 出现且文字含「m」。
6. 实时读数：`.mechbar__live` 出现且含「动能」。
7. 拖动新的「齿轮 / 齿条 / 动滑轮 / 推力器」等部件到画布不报错；控制台无错误。
8. 存档 / 读档：新增部件与世界参数（timeScale、collisions）能存能开。
9. 原有：弹簧振子播放 / 暂停 / 重置、连线、改 k、轨道约束、受力分解、符号实验室桥接、滑轮组折线 4 点、铰链。

跑法：先 `npm run build`（tsc + vite），再 `env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron electron/verify-mech.cjs`。

## 8. 硬约束

- 不许改 `src/kernel/types.ts` / `src/model/mech.ts`（缺字段先发消息给 Lead）。
- 不许动教材实验室、符号实验室、三维、草图等其它场景。
- `tsc --noEmit` 必须 0 错误；`npm run build` 必须成功。
- 物理步骤固定 1/120 s；播放时用 rAF + 累加器（沿用旧实现），`params.timeScale` 乘到步长上（0.1–2）。
- 撤销 / 存档只走 `onCommitParts` / App 的 scene-patch；播放过程绝不写文档。
- 性能：23 部件 + 10 连接时 60fps；CSS 只在 Lead 的 app.css 里加，组件内联样式不要大改布局。