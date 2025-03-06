import {
    createWorld,
    addEntity,
    removeEntity,
    Types,
    defineComponent,
    addComponent,
    removeComponent,
    hasComponent,
    defineQuery,
    Changed,
    Not,
    enterQuery,
    exitQuery,
    defineSerializer,
    defineDeserializer,
    pipe, IWorld,

} from 'bitecs'

import {BoxCollider, Node, game, SphereCollider} from 'cc';

const NodeMap = new Map<number, Node>();
const StatusEnum = {
    DIRTY: 1 << 0,    // 1
    BOX: 1 << 1,      // 2
    SPHERE: 1 << 2,   // 4
    STATIC: 1 << 3,
    SHAPE_BITS: (1 << 1) | (1 << 2)  // 6
}

export class ECSManager {
    world: IWorld = createWorld();

    // 添加重力常数
    gravityConstant = -9.8; // 重力加速度，向下为负方向

    Vector3 = {x: Types.f32, y: Types.f32, z: Types.f32};
    Vector4 = {x: Types.f32, y: Types.f32, z: Types.f32, w: Types.f32};
    VectorAABB = {min: this.Vector3, max: this.Vector3};

    WorldPosition = defineComponent(this.Vector3);
    WorldRotation = defineComponent(this.Vector4);
    WorldScale = defineComponent(this.Vector3);
    Velocity = defineComponent(this.Vector3);
    AngularVelocity = defineComponent(this.Vector3);
    Mass = defineComponent({value: Types.f32});
    MomentOfInertia = defineComponent({value: Types.f32});
    IsStatic = defineComponent({value: Types.i8});
    BridgeInfo = defineComponent({value: Types.i16});
    AABB = defineComponent(this.VectorAABB);
    CollisionPair = defineComponent({entityA: Types.eid, entityB: Types.eid});
    ShapeSize = defineComponent({x: Types.f32, y: Types.f32, z: Types.f32, radius: Types.f32});
    BitStatus = defineComponent({value: Types.i16});
    Force = defineComponent(this.Vector3);
    /**
     * 状态位：
     * 0: dirty
     * 1: box
     * 2: sphere
     */

        // Initialize queries with the world context
    CollisionQuery = defineQuery([this.AABB, this.WorldPosition]);
    UpDateAAPPQuery = defineQuery([this.WorldPosition, this.WorldRotation, this.WorldScale]);
    MovementQuery = defineQuery([this.WorldPosition]);
    syncQuery = defineQuery([this.WorldPosition, this.WorldRotation, this.BridgeInfo]);
    responseQuery = defineQuery([
        this.WorldPosition,
        this.WorldRotation,
        this.Velocity,
        this.AngularVelocity,
        this.Mass,
        this.MomentOfInertia,
        this.BitStatus,
        this.ShapeSize
        ]);
        
        // Initialize pipeline that doesn't take a world parameter
    pipeline = () => {
        this.updateAABBSystem();
        this.phaseCollisionDetectionSystem();
        this.collisionResponseSystem();
        this.gravitySystem();
        this.moveSystem();
        this.syncSystem();
        this.testSystem();
    };
    NodeId = 0;

    constructor() {
        

    }

    addEntity(node: Node, isStatic: boolean = false) {
        const eid = addEntity(this.world);
        addComponent(this.world, this.WorldPosition, eid);
        this.WorldPosition.x[eid] = node.getPosition().x;
        this.WorldPosition.y[eid] = node.getPosition().y;
        this.WorldPosition.z[eid] = node.getPosition().z;

        addComponent(this.world, this.WorldRotation, eid);
        this.WorldRotation.x[eid] = node.getRotation().x;
        this.WorldRotation.y[eid] = node.getRotation().y;
        this.WorldRotation.z[eid] = node.getRotation().z;
        this.WorldRotation.w[eid] = node.getRotation().w;

        addComponent(this.world, this.WorldScale, eid);
        this.WorldScale.x[eid] = node.getScale().x;
        this.WorldScale.y[eid] = node.getScale().y;
        this.WorldScale.z[eid] = node.getScale().z;

        addComponent(this.world, this.BitStatus, eid);
        addComponent(this.world, this.ShapeSize, eid);
        let status = StatusEnum.DIRTY;
        if (node.name === "Box-RB" || node.name === "Box") {
            status |= StatusEnum.BOX;
            this.ShapeSize.x[eid] = node.getComponent(BoxCollider)?.size.x ?? 0;
            this.ShapeSize.y[eid] = node.getComponent(BoxCollider)?.size.y ?? 0;
            this.ShapeSize.z[eid] = node.getComponent(BoxCollider)?.size.z ?? 0;
        } else {
            status |= StatusEnum.SPHERE;
            this.ShapeSize.radius[eid] = node.getComponent(SphereCollider)?.radius ?? 0;
        }
        if (isStatic) {
            status |= StatusEnum.STATIC;
        }
        this.BitStatus.value[eid] = status;

        addComponent(this.world, this.Velocity, eid);
        this.Velocity.x[eid] = 0;
        this.Velocity.y[eid] = 0;
        this.Velocity.z[eid] = 0;

        addComponent(this.world, this.AngularVelocity, eid);
        this.AngularVelocity.x[eid] = 0;
        this.AngularVelocity.y[eid] = 0;
        this.AngularVelocity.z[eid] = 0;

        addComponent(this.world, this.Mass, eid);
        this.Mass.value[eid] = isStatic ? 1000000.0 : 10.0;

        addComponent(this.world, this.MomentOfInertia, eid);
        const radius = 1.0;
        this.MomentOfInertia.value[eid] = isStatic ? 1000000.0 : (2/5) * this.Mass.value[eid] * radius * radius;

        addComponent(this.world, this.IsStatic, eid);
        this.IsStatic.value[eid] = isStatic ? 1 : 0;

        addComponent(this.world, this.BridgeInfo, eid);
        this.BridgeInfo.value[eid] = this.NodeId;

        addComponent(this.world, this.AABB, eid);
        
        // 添加力组件并初始化为0
        addComponent(this.world, this.Force, eid);
        this.Force.x[eid] = 0;
        this.Force.y[eid] = 0;
        this.Force.z[eid] = 0;

        NodeMap.set(this.NodeId++, node);
    }

    moveSystem() {
        try {
            // Use the class's world property directly
            const entities = this.MovementQuery(this.world);
            const deltaTime = game.deltaTime;

            console.log(`Found ${entities.length} entities for movement`);
            
            for (let i = 0; i < entities.length; i++) {
                const eid = entities[i];
                if (this.BitStatus.value[eid] & StatusEnum.STATIC) {
                    continue;
                }
                
                this.WorldPosition.x[eid] += this.Velocity.x[eid] * deltaTime;
                this.WorldPosition.y[eid] += this.Velocity.y[eid] * deltaTime;
                this.WorldPosition.z[eid] += this.Velocity.z[eid] * deltaTime;

                this.WorldRotation.x[eid] += this.AngularVelocity.x[eid] * deltaTime;
                this.WorldRotation.y[eid] += this.AngularVelocity.y[eid] * deltaTime;
                this.WorldRotation.z[eid] += this.AngularVelocity.z[eid] * deltaTime;
                
                // 归一化四元数，防止旋转累加导致四元数变大
                const length = Math.sqrt(
                    this.WorldRotation.x[eid] * this.WorldRotation.x[eid] +
                    this.WorldRotation.y[eid] * this.WorldRotation.y[eid] +
                    this.WorldRotation.z[eid] * this.WorldRotation.z[eid] +
                    this.WorldRotation.w[eid] * this.WorldRotation.w[eid]
                );
                
                if (length > 0.0001) {
                    this.WorldRotation.x[eid] /= length;
                    this.WorldRotation.y[eid] /= length;
                    this.WorldRotation.z[eid] /= length;
                    this.WorldRotation.w[eid] /= length;
                }
            }
        } catch (error) {
            console.error("Error in moveSystem:", error);
        }
    }

    syncSystem() {
        try {
            const entities = this.syncQuery(this.world);

            for (let i = 0; i < entities.length; i++) {
                const eid = entities[i];
                
                const node = NodeMap.get(this.BridgeInfo.value[eid]);
                if (node) {
                    node.setPosition(this.WorldPosition.x[eid], this.WorldPosition.y[eid], this.WorldPosition.z[eid]);
                    node.setRotation(this.WorldRotation.x[eid], this.WorldRotation.y[eid], this.WorldRotation.z[eid], this.WorldRotation.w[eid]);
                    
                    // 添加缩放同步
                    node.setScale(this.WorldScale.x[eid], this.WorldScale.y[eid], this.WorldScale.z[eid]);
                }
            }
        } catch (error) {
            console.error("Error in syncSystem:", error);
        }
    }

    phaseCollisionDetectionSystem() {
        try {
            const entities = this.CollisionQuery(this.world);
            for (let i = 0; i < entities.length; i++) {
                const entityA = entities[i];
                for (let j = i + 1; j < entities.length; j++) {
                    if (i === j) continue;
                    
                    const entityB = entities[j];
                    if (!this.checkAABBOverlap(entityA, entityB)) continue;


                    if (this.narrowPhaseCollision[(this.BitStatus.value[entityA] | this.BitStatus.value[entityB]) & StatusEnum.SHAPE_BITS](entityA, entityB)) {
                        this.makeCollisionPair(entityA, entityB);
                    }

                }
            }
        } catch (error) {
            console.error("Error in phaseCollisionDetectionSystem:", error);
        }
    }

    private narrowPhaseCollision = {
        [StatusEnum.BOX]: (entityA: number, entityB: number) => {
            // 获取两个盒子的半长度
            const boxAHalfExtents = {
                x: this.ShapeSize.x[entityA] * 0.5,
                y: this.ShapeSize.y[entityA] * 0.5,
                z: this.ShapeSize.z[entityA] * 0.5
            };
            
            const boxBHalfExtents = {
                x: this.ShapeSize.x[entityB] * 0.5,
                y: this.ShapeSize.y[entityB] * 0.5,
                z: this.ShapeSize.z[entityB] * 0.5
            };

            // 获取位置和旋转
            const posA = {
                x: this.WorldPosition.x[entityA],
                y: this.WorldPosition.y[entityA],
                z: this.WorldPosition.z[entityA]
            };
            
            const posB = {
                x: this.WorldPosition.x[entityB],
                y: this.WorldPosition.y[entityB],
                z: this.WorldPosition.z[entityB]
            };

            const quatA = {
                x: this.WorldRotation.x[entityA],
                y: this.WorldRotation.y[entityA],
                z: this.WorldRotation.z[entityA],
                w: this.WorldRotation.w[entityA]
            };

            const quatB = {
                x: this.WorldRotation.x[entityB],
                y: this.WorldRotation.y[entityB],
                z: this.WorldRotation.z[entityB],
                w: this.WorldRotation.w[entityB]
            };

            // 获取两个盒子的轴向量
            const axesA = [
                this.rotateByQuat({x: 1, y: 0, z: 0}, quatA),
                this.rotateByQuat({x: 0, y: 1, z: 0}, quatA),
                this.rotateByQuat({x: 0, y: 0, z: 1}, quatA)
            ];

            const axesB = [
                this.rotateByQuat({x: 1, y: 0, z: 0}, quatB),
                this.rotateByQuat({x: 0, y: 1, z: 0}, quatB),
                this.rotateByQuat({x: 0, y: 0, z: 1}, quatB)
            ];

            // 计算两个盒子中心的向量
            const diff = {
                x: posB.x - posA.x,
                y: posB.y - posA.y,
                z: posB.z - posA.z
            };

            // 检查所有可能的分离轴
            // 1. 检查A的三个轴
            for (let i = 0; i < 3; i++) {
                if (!this.overlapOnAxis(diff, axesA[i], axesA, axesB, boxAHalfExtents, boxBHalfExtents)) {
                    return false;
                }
            }

            // 2. 检查B的三个轴
            for (let i = 0; i < 3; i++) {
                if (!this.overlapOnAxis(diff, axesB[i], axesA, axesB, boxAHalfExtents, boxBHalfExtents)) {
                    return false;
                }
            }

            // 3. 检查九个叉积轴
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    const axis = this.cross(axesA[i], axesB[j]);
                    const length = Math.sqrt(axis.x * axis.x + axis.y * axis.y + axis.z * axis.z);
                    if (length > 0.001) { // 避免平行轴
                        const normalizedAxis = {
                            x: axis.x / length,
                            y: axis.y / length,
                            z: axis.z / length
                        };
                        if (!this.overlapOnAxis(diff, normalizedAxis, axesA, axesB, boxAHalfExtents, boxBHalfExtents)) {
                            return false;
                        }
                    }
                }
            }

            return true;
        },

        [StatusEnum.SPHERE | StatusEnum.BOX]: (entityA: number, entityB: number) => {
            // 确保 entityA 是球体，entityB 是盒子
            if (this.BitStatus.value[entityA] & StatusEnum.BOX) {
                [entityA, entityB] = [entityB, entityA];
            }

            const sphereRadius = this.ShapeSize.radius[entityA];
            const boxHalfExtents = {
                x: this.ShapeSize.x[entityB] * 0.5,
                y: this.ShapeSize.y[entityB] * 0.5,
                z: this.ShapeSize.z[entityB] * 0.5
            };

            // 获取位置
            const spherePos = {
                x: this.WorldPosition.x[entityA],
                y: this.WorldPosition.y[entityA],
                z: this.WorldPosition.z[entityA]
            };
            
            const boxPos = {
                x: this.WorldPosition.x[entityB],
                y: this.WorldPosition.y[entityB],
                z: this.WorldPosition.z[entityB]
            };

            // 获取盒子的旋转
            const boxQuat = {
                x: this.WorldRotation.x[entityB],
                y: this.WorldRotation.y[entityB],
                z: this.WorldRotation.z[entityB],
                w: this.WorldRotation.w[entityB]
            };

            // 1. 计算球心到盒子中心的向量
            const box_to_sphere = {
                x: spherePos.x - boxPos.x,
                y: spherePos.y - boxPos.y,
                z: spherePos.z - boxPos.z
            };

            // 2. 获取盒子的局部坐标轴
            const sides = [
                this.rotateByQuat({x: 1, y: 0, z: 0}, boxQuat),
                this.rotateByQuat({x: 0, y: 1, z: 0}, boxQuat),
                this.rotateByQuat({x: 0, y: 0, z: 1}, boxQuat)
            ];

            // 3. 将球心位置转换到盒子的局部空间
            const localPoint = {
                x: this.dot(box_to_sphere, sides[0]),
                y: this.dot(box_to_sphere, sides[1]),
                z: this.dot(box_to_sphere, sides[2])
            };

            // 4. 计算局部空间中最近点（将点限制在盒子范围内）
            const closestPoint = {
                x: Math.max(-boxHalfExtents.x, Math.min(boxHalfExtents.x, localPoint.x)),
                y: Math.max(-boxHalfExtents.y, Math.min(boxHalfExtents.y, localPoint.y)),
                z: Math.max(-boxHalfExtents.z, Math.min(boxHalfExtents.z, localPoint.z))
            };

            // 5. 计算最近点到球心的距离
            const dx = localPoint.x - closestPoint.x;
            const dy = localPoint.y - closestPoint.y;
            const dz = localPoint.z - closestPoint.z;
            const distanceSquared = dx * dx + dy * dy + dz * dz;

            // 6. 如果距离小于球体半径，则发生碰撞
            return distanceSquared <= sphereRadius * sphereRadius;
        },
        [StatusEnum.SPHERE]: (entityA: number, entityB: number) => {
            const dx = this.WorldPosition.x[entityA] - this.WorldPosition.x[entityB];
            const dy = this.WorldPosition.y[entityA] - this.WorldPosition.y[entityB];
            const dz = this.WorldPosition.z[entityA] - this.WorldPosition.z[entityB];
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            return distance <= this.ShapeSize.x[entityA] + this.ShapeSize.x[entityB];
        },
    }

    private dot(v1: {x: number, y: number, z: number}, v2: {x: number, y: number, z: number}): number {
        return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    }

    private rotateByQuat(v: {x: number, y: number, z: number}, q: {x: number, y: number, z: number, w: number}) {
        const ix = q.w * v.x + q.y * v.z - q.z * v.y;
        const iy = q.w * v.y + q.z * v.x - q.x * v.z;
        const iz = q.w * v.z + q.x * v.y - q.y * v.x;
        const iw = -q.x * v.x - q.y * v.y - q.z * v.z;

        return {
            x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
            y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
            z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x
        };
    }

    private isBox(entity: number): boolean {
        return (this.BitStatus.value[entity] & StatusEnum.BOX) != 0;
    }

    private makeCollisionPair(entityA: number, entityB: number) {
        const eid = addEntity(this.world);
        addComponent(this.world, this.CollisionPair, eid);
        this.CollisionPair.entityA[eid] = entityA;
        this.CollisionPair.entityB[eid] = entityB;
    }

    private updateAABBSystem() {
        try {
            const entities = this.UpDateAAPPQuery(this.world);
            for (let i = 0; i < entities.length; i++) {
                const entity = entities[i];
                this.updateAABB[this.BitStatus.value[entity] & StatusEnum.SHAPE_BITS](entity);
            }
        } catch (error) {
            console.error("Error in updateAABBSystem:", error);
        }
    }

    private updateAABB = {
        [StatusEnum.BOX]: (entity: number) => {
            // 获取盒子的半长度和位置
            const halfExtents = {
                x: this.ShapeSize.x[entity] * 0.5,
                y: this.ShapeSize.y[entity] * 0.5,
                z: this.ShapeSize.z[entity] * 0.5
            };

            const pos = {
                x: this.WorldPosition.x[entity], 
                y: this.WorldPosition.y[entity],
                z: this.WorldPosition.z[entity]
            };

            // 获取旋转
            const quat = {
                x: this.WorldRotation.x[entity],
                y: this.WorldRotation.y[entity],
                z: this.WorldRotation.z[entity],
                w: this.WorldRotation.w[entity]
            };

            // 获取旋转后的三个轴向
            const axes = [
                this.rotateByQuat({x: 1, y: 0, z: 0}, quat),
                this.rotateByQuat({x: 0, y: 1, z: 0}, quat),
                this.rotateByQuat({x: 0, y: 0, z: 1}, quat)
            ];

            // 计算8个顶点
            const vertices = [];
            for (let i = 0; i < 2; i++) {
                for (let j = 0; j < 2; j++) {
                    for (let k = 0; k < 2; k++) {
                        const vertex = {
                            x: pos.x + (i * 2 - 1) * halfExtents.x * axes[0].x +
                               (j * 2 - 1) * halfExtents.y * axes[1].x +
                               (k * 2 - 1) * halfExtents.z * axes[2].x,
                            y: pos.y + (i * 2 - 1) * halfExtents.x * axes[0].y +
                               (j * 2 - 1) * halfExtents.y * axes[1].y +
                               (k * 2 - 1) * halfExtents.z * axes[2].y,
                            z: pos.z + (i * 2 - 1) * halfExtents.x * axes[0].z +
                               (j * 2 - 1) * halfExtents.y * axes[1].z +
                               (k * 2 - 1) * halfExtents.z * axes[2].z
                        };
                        vertices.push(vertex);
                    }
                }
            }

            // 找出最小和最大点
            let minX = vertices[0].x, minY = vertices[0].y, minZ = vertices[0].z;
            let maxX = vertices[0].x, maxY = vertices[0].y, maxZ = vertices[0].z;

            for (let i = 1; i < vertices.length; i++) {
                minX = Math.min(minX, vertices[i].x);
                minY = Math.min(minY, vertices[i].y);
                minZ = Math.min(minZ, vertices[i].z);
                maxX = Math.max(maxX, vertices[i].x);
                maxY = Math.max(maxY, vertices[i].y);
                maxZ = Math.max(maxZ, vertices[i].z);
            }

            // 更新AABB
            this.AABB.min.x[entity] = minX;
            this.AABB.min.y[entity] = minY;
            this.AABB.min.z[entity] = minZ;
            this.AABB.max.x[entity] = maxX;
            this.AABB.max.y[entity] = maxY;
            this.AABB.max.z[entity] = maxZ;
        },

        [StatusEnum.SPHERE]: (entity: number) => {
            const radius = this.ShapeSize.radius[entity];
            const pos = {
                x: this.WorldPosition.x[entity],
                y: this.WorldPosition.y[entity],
                z: this.WorldPosition.z[entity]
            };

            // 球体的AABB就是中心点加减半径
            this.AABB.min.x[entity] = pos.x - radius;
            this.AABB.min.y[entity] = pos.y - radius;
            this.AABB.min.z[entity] = pos.z - radius;
            this.AABB.max.x[entity] = pos.x + radius;
            this.AABB.max.y[entity] = pos.y + radius;
            this.AABB.max.z[entity] = pos.z + radius;
        }
    }

    private checkAABBOverlap(entityA: number, entityB: number): boolean {
        const overlabX = (this.AABB.min.x[entityA] <= this.AABB.max.x[entityB] && 
                         this.AABB.min.x[entityA] >= this.AABB.min.x[entityB]) || 
                        (this.AABB.max.x[entityA] <= this.AABB.max.x[entityB] && 
                         this.AABB.max.x[entityA] >= this.AABB.min.x[entityB]);
        
        const overlabY = (this.AABB.min.y[entityA] <= this.AABB.max.y[entityB] && 
                         this.AABB.min.y[entityA] >= this.AABB.min.y[entityB]) || 
                        (this.AABB.max.y[entityA] <= this.AABB.max.y[entityB] && 
                         this.AABB.max.y[entityA] >= this.AABB.min.y[entityB]);
        
        const overlabZ = (this.AABB.min.z[entityA] <= this.AABB.max.z[entityB] && 
                         this.AABB.min.z[entityA] >= this.AABB.min.z[entityB]) || 
                        (this.AABB.max.z[entityA] <= this.AABB.max.z[entityB] && 
                         this.AABB.max.z[entityA] >= this.AABB.min.z[entityB]);
        
        return overlabX && overlabY && overlabZ;
    }

    testSystem() {
        console.info("ECS Tick!!!!");
    }
    
    collisionResponseSystem() {
        const entities = this.responseQuery(this.world);
        const deltaTime = game.deltaTime;

        for (let i = 0; i < entities.length; i++) {
            const eid1 = entities[i];
            
            for (let j = i + 1; j < entities.length; j++) {
                const eid2 = entities[j];
                
                // 使用 BitStatus 检查静态状态
                const isStatic1 = (this.BitStatus.value[eid1] & StatusEnum.STATIC) !== 0;
                const isStatic2 = (this.BitStatus.value[eid2] & StatusEnum.STATIC) !== 0;
                
                if (isStatic1 && isStatic2) continue;
                
                if (this.checkAABBOverlap(eid1, eid2)) {
                    // 获取质量和转动惯量
                    const m1 = isStatic1 ? Infinity : this.Mass.value[eid1];
                    const m2 = isStatic2 ? Infinity : this.Mass.value[eid2];
                    const I1 = isStatic1 ? Infinity : this.MomentOfInertia.value[eid1];
                    const I2 = isStatic2 ? Infinity : this.MomentOfInertia.value[eid2];
                    
                    // 计算相对位置
                    const dx = this.WorldPosition.x[eid2] - this.WorldPosition.x[eid1];
                    const dy = this.WorldPosition.y[eid2] - this.WorldPosition.y[eid1];
                    const dz = this.WorldPosition.z[eid2] - this.WorldPosition.z[eid1];
                    
                    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    if (length > 0) {
                        const nx = dx / length;
                        const ny = dy / length;
                        const nz = dz / length;

                        // 计算相对速度
                        const relativeVx = this.Velocity.x[eid2] - this.Velocity.x[eid1];
                        const relativeVy = this.Velocity.y[eid2] - this.Velocity.y[eid1];
                        const relativeVz = this.Velocity.z[eid2] - this.Velocity.z[eid1];
                        
                        const relativeSpeed = relativeVx * nx + relativeVy * ny + relativeVz * nz;
                        
                        if (relativeSpeed > 0) continue;

                        // 计算冲量
                        const restitution = 0.8; // 可以根据物体材质从组件中获取
                        const j = -(1 + restitution) * relativeSpeed / 
                                (1/m1 + 1/m2); // 对于静态物体，1/Infinity = 0

                        // 应用线性冲量
                        if (!isStatic1) {
                            this.Velocity.x[eid1] -= (j * nx) / m1;
                            this.Velocity.y[eid1] -= (j * ny) / m1;
                            this.Velocity.z[eid1] -= (j * nz) / m1;
                        }
                        
                        if (!isStatic2) {
                            this.Velocity.x[eid2] += (j * nx) / m2;
                            this.Velocity.y[eid2] += (j * ny) / m2;
                            this.Velocity.z[eid2] += (j * nz) / m2;
                        }

                        // 应用角冲量
                        if (!isStatic1) {
                            // 可以从形状组件获取特征半径
                            const radius1 = (this.BitStatus.value[eid1] & StatusEnum.SPHERE) !== 0 
                                ? this.ShapeSize.radius[eid1] 
                                : Math.min(this.ShapeSize.x[eid1], this.ShapeSize.y[eid1], this.ShapeSize.z[eid1]) * 0.5;
                            const r1 = radius1 * nx;
                            const deltaOmega1 = (j * r1) / I1;
                            this.AngularVelocity.x[eid1] += deltaOmega1;
                            this.AngularVelocity.y[eid1] += deltaOmega1;
                            this.AngularVelocity.z[eid1] += deltaOmega1;
                        }
                        
                        if (!isStatic2) {
                            const radius2 = (this.BitStatus.value[eid2] & StatusEnum.SPHERE) !== 0 
                                ? this.ShapeSize.radius[eid2] 
                                : Math.min(this.ShapeSize.x[eid2], this.ShapeSize.y[eid2], this.ShapeSize.z[eid2]) * 0.5;
                            const r2 = radius2 * nx;
                            const deltaOmega2 = (j * r2) / I2;
                            this.AngularVelocity.x[eid2] -= deltaOmega2;
                            this.AngularVelocity.y[eid2] -= deltaOmega2;
                            this.AngularVelocity.z[eid2] -= deltaOmega2;
                        }

                        // 位置修正（避免穿透）
                        const offset = 0.1;
                        if (!isStatic1) {
                            this.WorldPosition.x[eid1] -= nx * offset;
                            this.WorldPosition.y[eid1] -= ny * offset;
                            this.WorldPosition.z[eid1] -= nz * offset;
                        }
                        
                        if (!isStatic2) {
                            this.WorldPosition.x[eid2] += nx * offset;
                            this.WorldPosition.y[eid2] += ny * offset;
                            this.WorldPosition.z[eid2] += nz * offset;
                        }
                    }
                }
            }
        }
    }

    private cross(a: {x: number, y: number, z: number}, b: {x: number, y: number, z: number}) {
        return {
            x: a.y * b.z - a.z * b.y,
            y: a.z * b.x - a.x * b.z,
            z: a.x * b.y - a.y * b.x
        };
    }

    private overlapOnAxis(
        diff: {x: number, y: number, z: number},
        axis: {x: number, y: number, z: number},
        axesA: Array<{x: number, y: number, z: number}>,
        axesB: Array<{x: number, y: number, z: number}>,
        halfA: {x: number, y: number, z: number},
        halfB: {x: number, y: number, z: number}
    ): boolean {
        const projectionA = this.getProjectionRadius(axesA, halfA, axis);
        const projectionB = this.getProjectionRadius(axesB, halfB, axis);
        const distance = Math.abs(this.dot(diff, axis));
        
        return distance <= projectionA + projectionB;
    }

    private getProjectionRadius(
        axes: Array<{x: number, y: number, z: number}>,
        halfExtents: {x: number, y: number, z: number},
        axis: {x: number, y: number, z: number}
    ): number {
        return halfExtents.x * Math.abs(this.dot(axes[0], axis)) +
               halfExtents.y * Math.abs(this.dot(axes[1], axis)) +
               halfExtents.z * Math.abs(this.dot(axes[2], axis));
    }

    // 重力系统 - 对所有非静态物体施加恒定重力
    gravitySystem() {
        try {
            const entities = this.MovementQuery(this.world);
            const deltaTime = game.deltaTime;
            
            for (let i = 0; i < entities.length; i++) {
                const eid = entities[i];
                // 跳过静态物体
                if (this.BitStatus.value[eid] & StatusEnum.STATIC) {
                    continue;
                }
                
                // 为Y轴速度应用重力加速度
                this.Velocity.y[eid] += this.gravityConstant * deltaTime;

                // 应用Force组件中的力
                if (hasComponent(this.world, this.Force, eid)) {
                    const mass = this.Mass.value[eid];
                    // F = ma, a = F/m
                    this.Velocity.x[eid] += (this.Force.x[eid] / mass) * deltaTime;
                    this.Velocity.y[eid] += (this.Force.y[eid] / mass) * deltaTime;
                    this.Velocity.z[eid] += (this.Force.z[eid] / mass) * deltaTime;
                    
                    // 应用力后重置Force组件，除非需要持续应用力
                    this.Force.x[eid] = 0;
                    this.Force.y[eid] = 0;
                    this.Force.z[eid] = 0;
                }
            }
        } catch (error) {
            console.error("Error in gravitySystem:", error);
        }
    }
}

