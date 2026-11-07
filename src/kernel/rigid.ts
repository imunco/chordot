import * as CANNON from 'cannon-es'
import type { PhysicsObstacle, SolidShape } from './types'
import { buildMesh, groundedZ, type Mesh, type Vec3 } from '../model/solid'
import { buildIncline3D } from '../model/incline3d'

/**
 * 三维场景的「物理世界」。
 *
 * 世界坐标与渲染层一致：**z 轴向上**，重力沿 -z。
 * 只有地面是静止的，其余每个形体都是刚体；每帧把位置和姿态写回 shape。
 */

export interface BodySnapshot {
  id: string
  position: [number, number, number]
  quaternion: [number, number, number, number]
}

export interface PhysicsOptions {
  gravity: number
  restitution: number
  friction: number
}

/** 圆柱类形体在 cannon 里沿 Y 轴，需要转到我们的 Z 轴 */
function zUpQuat(): CANNON.Quaternion {
  const q = new CANNON.Quaternion()
  q.setFromEuler(-Math.PI / 2, 0, 0)
  return q
}

/** 网格 → 凸多面体（顶点相对 center） */
function convexOf(mesh: Mesh, center: Vec3): CANNON.ConvexPolyhedron | null {
  try {
    const vertices = mesh.vertices.map(
      (v) => new CANNON.Vec3(v[0] - center[0], v[1] - center[1], v[2] - center[2]),
    )
    const faces = mesh.faces.map((f) => [...f])
    return new CANNON.ConvexPolyhedron({ vertices, faces })
  } catch {
    return null
  }
}

/** 直接用渲染网格构造碰撞体，保证碰撞形状和看到的形状一致 */
function convexFromMesh(shape: SolidShape): CANNON.ConvexPolyhedron | null {
  return convexOf(buildMesh(shape), shape.center)
}

export class RigidWorld {
  private world: CANNON.World
  private bodies = new Map<string, CANNON.Body>()
  private mat: CANNON.Material

  constructor(opts: PhysicsOptions) {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, 0, -Math.max(0.1, opts.gravity)),
    })
    this.world.broadphase = new CANNON.SAPBroadphase(this.world)
    this.world.allowSleep = true
    ;(this.world.solver as { iterations?: number }).iterations = 12

    this.mat = new CANNON.Material('surface')
    this.world.defaultContactMaterial.friction = opts.friction
    this.world.defaultContactMaterial.restitution = opts.restitution
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.mat, this.mat, {
        friction: opts.friction,
        restitution: opts.restitution,
      }),
    )

    // 地面：cannon 的 Plane 法向就是局部 +z，正好对上
    const ground = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: this.mat,
    })
    this.world.addBody(ground)
  }

  add(shape: SolidShape) {
    const half = shape.size / 2
    // 旋转过的立体最低点比 center − size/2 更低，直接按 center 落地会先埋进地面再被弹飞
    const z = Math.max(shape.center[2], groundedZ(shape))
    const body = new CANNON.Body({
      mass: 1,
      material: this.mat,
      position: new CANNON.Vec3(shape.center[0], shape.center[1], z),
      linearDamping: 0.02,
      angularDamping: 0.08,
    })

    const n = shape.sides ?? 4
    if (shape.type === 'sphere') {
      body.addShape(new CANNON.Sphere(half))
    } else if (shape.type === 'cube') {
      body.addShape(new CANNON.Box(new CANNON.Vec3(half, half, half)))
    } else if (shape.type === 'prism') {
      if (n >= 12) {
        // 圆柱：沿 Z 轴的圆柱
        body.addShape(new CANNON.Cylinder(half, half, shape.size, 14), new CANNON.Vec3(), zUpQuat())
      } else {
        body.addShape(convexFromMesh(shape) ?? new CANNON.Box(new CANNON.Vec3(half, half, half)))
      }
    } else if (shape.type === 'pyramid') {
      // 棱锥 / 圆锥都直接用凸多面体，形状才对得上；用圆台近似会陷进地面
      body.addShape(convexFromMesh(shape) ?? new CANNON.Box(new CANNON.Vec3(half, half, half)))
    } else {
      // 正四面体 / 正八面体：用内接盒子近似，落点稳、不抖
      const k = shape.type === 'tetra' ? 0.32 : 0.42
      body.addShape(new CANNON.Box(new CANNON.Vec3(half * k, half * k, half * k)))
    }

    if (shape.rotation) {
      const [x, y, z, w] = shape.rotation
      body.quaternion.set(x, y, z, w)
    }

    this.world.addBody(body)
    this.bodies.set(shape.id, body)
  }

  /** 静态障碍：斜面或墙 */
  addObstacle(o: PhysicsObstacle) {
    const body = new CANNON.Body({ mass: 0, material: this.mat })
    if (o.kind === 'ramp') {
      const { mesh } = buildIncline3D(o.angleDeg ?? 30, 1, 0)
      const shape = convexOf(mesh, [0, 0, 0])
      if (!shape) return
      body.addShape(shape)
      body.position.set(o.x, o.y, 0)
    } else {
      const w = o.w ?? 4
      const d = o.d ?? 0.6
      const h = o.h ?? 3
      body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, d / 2, h / 2)))
      body.position.set(o.x, o.y, h / 2)
    }
    this.world.addBody(body)
  }

  /** 施加外力；给了 id 就只推那一个物体 */
  applyExternal(force: Vec3, id?: string) {
    const f = new CANNON.Vec3(force[0], force[1], force[2])
    const targets = id ? [this.bodies.get(id)] : [...this.bodies.values()]
    for (const body of targets) {
      if (!body) continue
      // 睡着刚体不吃力，得先叫醒
      body.wakeUp()
      body.applyForce(f, body.position)
    }
  }

  step(dt: number) {
    // 固定子步 1/120，最多追 4 步，避免掉帧时穿模
    this.world.step(1 / 120, Math.min(dt, 0.05), 4)
  }

  snapshot(): BodySnapshot[] {
    const out: BodySnapshot[] = []
    for (const [id, body] of this.bodies) {
      const p = body.position
      const q = body.quaternion
      out.push({
        id,
        position: [p.x, p.y, p.z],
        quaternion: [q.x, q.y, q.z, q.w],
      })
    }
    return out
  }

  dispose() {
    this.bodies.clear()
  }
}
