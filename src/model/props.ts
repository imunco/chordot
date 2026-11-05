import type { PhysicsForce, SceneSpec, SolidShape } from '../kernel/types'

export type FieldValue = number | boolean | string

export interface Field {
  key: string
  label: string
  /** vec：三维方向向量（"1,-1,0"），右栏带方向预览 + 非法描红 */
  kind: 'number' | 'toggle' | 'select' | 'action' | 'text' | 'vec'
  unit?: string
  min?: number
  max?: number
  step?: number
  options?: { value: string; label: string }[]
  get: () => FieldValue
  /** 返回要合并进 scene.params 的补丁 */
  set: (value: FieldValue) => Record<string, unknown>
}

export interface PropGroup {
  title: string
  fields: Field[]
}

/** 绕竖直轴（z）的偏航角，单位度；任意四元数都能读 */
function yawDeg(q?: [number, number, number, number]): number {
  if (!q) return 0
  const [x, y, z, w] = q
  return (Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)) * 180) / Math.PI
}

function quatYaw(deg: number): [number, number, number, number] {
  const a = (deg * Math.PI) / 360
  return [0, 0, Math.sin(a), Math.cos(a)]
}

const num = (
  key: string,
  label: string,
  get: () => number,
  extra: { unit?: string; min?: number; max?: number; step?: number } = {},
  map?: (v: number) => Record<string, unknown>,
): Field => ({
  key,
  label,
  kind: 'number',
  unit: extra.unit,
  min: extra.min,
  max: extra.max,
  step: extra.step ?? 0.1,
  get,
  set: (v) => (map ? map(Number(v)) : { [key]: Number(v) }),
})

/** 三维方向向量输入：右栏渲染成「文本框 + 等轴投影箭头」 */
const vec = (
  key: string,
  label: string,
  get: () => string,
  map: (v: string) => Record<string, unknown>,
): Field => ({
  key,
  label,
  kind: 'vec',
  get,
  set: (v) => map(String(v)),
})

/** 依据场景类型生成属性表单；草图与三角形返回 null（它们按对象编辑） */
export function schemaFor(scene: SceneSpec, selectedId?: string | null): PropGroup[] | null {
  if (scene.kind === 'incline') {
    const p = scene.params
    return [
      {
        title: '斜面',
        fields: [
          num('angleDeg', '倾角', () => p.angleDeg, { unit: '°', min: 0, max: 85, step: 1 }),
          {
            key: 'smooth',
            label: '接触面光滑',
            kind: 'toggle',
            get: () => p.mu === 0,
            set: (v) => ({ mu: v ? 0 : 0.3 }),
          },
          num('mu', '摩擦因数 μ', () => p.mu, { min: 0, max: 1.5, step: 0.05 }),
        ],
      },
      {
        title: '物块',
        fields: [
          num('mass', '质量', () => p.mass, { unit: 'kg', min: 0.5, max: 20, step: 0.5 }),
          num('t', '位置（沿斜面）', () => p.t, { min: 0, max: 1, step: 0.01 }),
        ],
      },
    ]
  }

  if (scene.kind === 'solidIncline') {
    const p = scene.params
    return [
      {
        title: '三维斜面',
        fields: [
          num('angleDeg', '倾角', () => p.angleDeg, { unit: '°', min: 5, max: 75, step: 1 }),
          {
            key: 'smooth',
            label: '接触面光滑',
            kind: 'toggle',
            get: () => p.mu === 0,
            set: (v) => ({ mu: v ? 0 : 0.3 }),
          },
          num('mu', '摩擦因数 μ', () => p.mu, { min: 0, max: 1.2, step: 0.05 }),
          num('mass', '质量', () => p.mass, { unit: 'kg', min: 0.5, max: 20, step: 0.5 }),
          {
            key: 'decompose',
            label: '重力分解',
            kind: 'toggle',
            get: () => p.decompose,
            set: (v) => ({ decompose: Boolean(v) }),
          },
        ],
      },
    ]
  }

  if (scene.kind === 'motion') {
    const p = scene.params
    const common: Field[] = [
      num('mass', '质量', () => p.mass, { unit: 'kg', min: 0.1, max: 20, step: 0.1 }),
      num('gravity', '重力加速度 g', () => p.gravity, { unit: 'm/s²', min: 1, max: 20, step: 0.1 }),
    ]
    const damping = num('damping', '阻尼系数', () => p.damping, { min: 0, max: 2, step: 0.05 })

    if (p.model === 'pendulum') {
      return [
        {
          title: '单摆',
          fields: [
            num('length', '摆长', () => p.length, { unit: 'm', min: 0.5, max: 4, step: 0.1 }),
            num('angle0', '初始摆角', () => p.angle0, { unit: '°', min: -80, max: 80, step: 1 }),
            damping,
            ...common,
          ],
        },
      ]
    }
    if (p.model === 'spring') {
      return [
        {
          title: '弹簧振子',
          fields: [
            num('stiffness', '劲度系数 k', () => p.stiffness, { unit: 'N/m', min: 1, max: 100, step: 1 }),
            num('amplitude', '初始位移', () => p.amplitude, { unit: 'm', min: -4, max: 4, step: 0.1 }),
            damping,
            ...common,
          ],
        },
      ]
    }
    return [
      {
        title: '抛体',
        fields: [
          num('speed', '初速度', () => p.speed, { unit: 'm/s', min: 1, max: 30, step: 0.5 }),
          num('launch', '抛射角', () => p.launch, { unit: '°', min: 0, max: 90, step: 1 }),
          num('height', '初始高度', () => p.height, { unit: 'm', min: 0, max: 6, step: 0.1 }),
          ...common,
        ],
      },
    ]
  }

  if (scene.kind === 'solid') {
    const phys = scene.params.physics
    const withPhysics = (patch: Record<string, unknown>) => ({
      physics: {
        enabled: phys?.enabled ?? false,
        gravity: phys?.gravity ?? 10,
        restitution: phys?.restitution ?? 0.3,
        friction: phys?.friction ?? 0.4,
        ...patch,
      },
    })
    const DIRS = [
      { value: 'x+', label: '+x（向右）' },
      { value: 'x-', label: '−x（向左）' },
      { value: 'y+', label: '+y（向里）' },
      { value: 'y-', label: '−y（向外）' },
      { value: 'z+', label: '+z（向上）' },
      { value: 'z-', label: '−z（向下）' },
    ]
    /** 变力字段的补丁：只改传进来的那几项 */
    const withForce = (
      prev: PhysicsForce | undefined,
      patch: Partial<PhysicsForce>,
    ): PhysicsForce => ({
      enabled: prev?.enabled ?? false,
      expr: prev?.expr ?? '2t',
      dir: prev?.dir ?? 'x+',
      vec: prev?.vec ?? '',
      ...patch,
    })
    const patchShape = (id: string, patch: Partial<SolidShape>) => ({
      shapes: scene.params.shapes.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    })
    const forceFields = (shape: SolidShape): Field[] => [
      {
        key: `sf-on-${shape.id}`,
        label: '这个物体的变力',
        kind: 'toggle',
        get: () => shape.force?.enabled ?? false,
        set: (v) => patchShape(shape.id, { force: withForce(shape.force, { enabled: Boolean(v) }) }),
      },
      {
        key: `sf-expr-${shape.id}`,
        label: 'F(t)',
        kind: 'text',
        get: () => shape.force?.expr ?? '2t',
        set: (v) => patchShape(shape.id, { force: withForce(shape.force, { expr: String(v) }) }),
      },
      {
        key: `sf-dir-${shape.id}`,
        label: '方向',
        kind: 'select',
        options: [...DIRS],
        get: () => shape.force?.dir ?? 'x+',
        set: (v) => patchShape(shape.id, { force: withForce(shape.force, { dir: String(v) }) }),
      },
      vec(
        `sf-vec-${shape.id}`,
        '自定义方向',
        () => shape.force?.vec ?? '',
        (v) => patchShape(shape.id, { force: withForce(shape.force, { vec: v }) }),
      ),
    ]

    const groups = scene.params.shapes.map((shape, i) => ({
      title: shape.name,
      fields: [
        num(
          `size-${shape.id}`,
          '尺寸',
          () => shape.size,
          { unit: 'm', min: 0.5, max: 10, step: 0.5 },
          (v) => ({
            shapes: scene.params.shapes.map((s, j) => (j === i ? { ...s, size: v } : s)),
          }),
        ),
        num(
          `z-${shape.id}`,
          '高度',
          () => shape.center[2],
          { unit: 'm', min: -6, max: 6, step: 0.5 },
          (v) => ({
            shapes: scene.params.shapes.map((s, j) =>
              j === i ? { ...s, center: [s.center[0], s.center[1], v] } : s,
            ),
          }),
        ),
        num(
          `rot-${shape.id}`,
          '旋转',
          () => Math.round(yawDeg(shape.rotation)),
          { unit: '°', min: -180, max: 180, step: 5 },
          (v) => ({
            shapes: scene.params.shapes.map((s, j) =>
              j === i ? { ...s, rotation: quatYaw(v) } : s,
            ),
          }),
        ),
        ...(shape.id === selectedId ? forceFields(shape) : []),
      ],
    }))

    groups.push({
      title: '物理世界',
      fields: [
        {
          key: 'physics-on',
          label: '按真实物理下落',
          kind: 'toggle',
          get: () => phys?.enabled ?? false,
          set: (v) => withPhysics({ enabled: Boolean(v) }),
        },
        num(
          'gravity',
          '重力加速度 g',
          () => phys?.gravity ?? 10,
          { unit: 'm/s²', min: 1, max: 25, step: 0.5 },
          (v) => withPhysics({ gravity: v }),
        ),
        num(
          'restitution',
          '弹性',
          () => phys?.restitution ?? 0.3,
          { min: 0, max: 1, step: 0.05 },
          (v) => withPhysics({ restitution: v }),
        ),
        num(
          'friction',
          '摩擦',
          () => phys?.friction ?? 0.4,
          { min: 0, max: 1, step: 0.05 },
          (v) => withPhysics({ friction: v }),
        ),
        {
          key: 'add-ramp',
          label: '加一块斜面',
          kind: 'action',
          get: () => '',
          set: () =>
            withPhysics({
              obstacles: [
                ...(phys?.obstacles ?? []),
                { id: `r${Date.now().toString(36)}`, kind: 'ramp', angleDeg: 30, x: 0, y: 0 },
              ],
            }),
        },
        {
          key: 'add-wall',
          label: '加一面墙',
          kind: 'action',
          get: () => '',
          set: () =>
            withPhysics({
              obstacles: [
                ...(phys?.obstacles ?? []),
                {
                  id: `w${Date.now().toString(36)}`,
                  kind: 'wall',
                  x: 4,
                  y: 0,
                  w: 5,
                  h: 2.5,
                  d: 0.6,
                },
              ],
            }),
        },
        num(
          'ramp-angle',
          '斜面倾角',
          () => phys?.obstacles?.find((o) => o.kind === 'ramp')?.angleDeg ?? 30,
          { unit: '°', min: 5, max: 70, step: 1 },
          (v) =>
            withPhysics({
              obstacles: (phys?.obstacles ?? []).map((o) =>
                o.kind === 'ramp' ? { ...o, angleDeg: v } : o,
              ),
            }),
        ),
        {
          key: 'force-on',
          label: '施加变力 F(t)',
          kind: 'toggle',
          get: () => phys?.force?.enabled ?? false,
          set: (v) => withPhysics({ force: withForce(phys?.force, { enabled: Boolean(v) }) }),
        },
        {
          key: 'force-expr',
          label: 'F(t) 表达式',
          kind: 'text',
          get: () => phys?.force?.expr ?? '2t',
          set: (v) => withPhysics({ force: withForce(phys?.force, { expr: String(v) }) }),
        },
        {
          key: 'force-dir',
          label: '力的方向',
          kind: 'select',
          options: [...DIRS],
          get: () => phys?.force?.dir ?? 'x+',
          set: (v) => withPhysics({ force: withForce(phys?.force, { dir: String(v) }) }),
        },
        vec(
          'force-vec',
          '自定义方向',
          () => phys?.force?.vec ?? '',
          (v) => withPhysics({ force: withForce(phys?.force, { vec: v }) }),
        ),
        {
          key: 'clear-obstacles',
          label: '清空障碍',
          kind: 'action',
          get: () => '',
          set: () => withPhysics({ obstacles: [] }),
        },
      ],
    })

    return groups
  }

  return null
}
