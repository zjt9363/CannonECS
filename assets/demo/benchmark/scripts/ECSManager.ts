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
    DIRTY: 1 << 0,
    BOX: 1 << 1,
    SPHERE: 1 << 2,
    SHAPE_BIT: 1 << 1 | 1 << 2,
}

export class ECSManager {
    world: IWorld = createWorld();

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
    /**
     * 状态位：
     * 0: dirty
     * 1: box
     * 2: sphere
     */

    MovementQuery = defineQuery([this.WorldPosition, this.WorldRotation, this.WorldScale]);
    CollisionQuery = defineQuery([this.AABB, this.WorldPosition]);
    UpDateAAPPQuery = defineQuery([this.WorldPosition, this.WorldRotation, this.WorldScale]); // TODO: 完善AABB查询
    movementQuery = defineQuery([this.WorldPosition, this.WorldRotation, this.WorldScale, this.Velocity, this.AngularVelocity, Not(this.IsStatic)]);
    syncQuery = defineQuery([this.WorldPosition, this.WorldRotation, this.BridgeInfo]);
    collisionQuery = defineQuery([this.WorldPosition, this.Velocity, this.AngularVelocity, this.AABB, this.Mass, this.MomentOfInertia]);

    NodeId = 0;

    constructor() {}

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
        if (node.name == "Box-RB" || "Box") {
            this.BitStatus.value[eid] = StatusEnum.BOX | StatusEnum.DIRTY;
            this.ShapeSize.x[eid] = node.getComponent(BoxCollider)?.size.x ?? 0;
            this.ShapeSize.y[eid] = node.getComponent(BoxCollider)?.size.y ?? 0;
            this.ShapeSize.z[eid] = node.getComponent(BoxCollider)?.size.z ?? 0;
        } else {
            this.BitStatus.value[eid] = StatusEnum.SPHERE | StatusEnum.DIRTY;
            this.ShapeSize.radius[eid] = node.getComponent(SphereCollider)?.radius ?? 0;
        }

        addComponent(this.world, this.Velocity, eid);
        this.Velocity.x[eid] = isStatic ? 0 : 1.0;
        this.Velocity.y[eid] = isStatic ? 0 : 0.5;
        this.Velocity.z[eid] = isStatic ? 0 : 0.3;

        addComponent(this.world, this.AngularVelocity, eid);
        this.AngularVelocity.x[eid] = isStatic ? 0 : 0.1;
        this.AngularVelocity.y[eid] = isStatic ? 0 : 0.2;
        this.AngularVelocity.z[eid] = isStatic ? 0 : 0.15;

        addComponent(this.world, this.Mass, eid);
        this.Mass.value[eid] = isStatic ? 1000000.0 : 1.0;

        addComponent(this.world, this.MomentOfInertia, eid);
        const radius = 1.0;
        this.MomentOfInertia.value[eid] = isStatic ? 1000000.0 : (2/5) * this.Mass.value[eid] * radius * radius;

        addComponent(this.world, this.IsStatic, eid);
        this.IsStatic.value[eid] = isStatic ? 1 : 0;

        addComponent(this.world, this.BridgeInfo, eid);
        this.BridgeInfo.value[eid] = this.NodeId;

        addComponent(this.world, this.AABB, eid);
        

        NodeMap.set(this.NodeId++, node);
    }

    moveSystem(world: IWorld) {
        const entities = this.movementQuery(world);
        const deltaTime = game.deltaTime;

        for (let i = 0; i < entities.length; i++) {
            const eid = entities[i];
            
            this.WorldPosition.x[eid] += this.Velocity.x[eid] * deltaTime;
            this.WorldPosition.y[eid] += this.Velocity.y[eid] * deltaTime;
            this.WorldPosition.z[eid] += this.Velocity.z[eid] * deltaTime;

            this.WorldRotation.x[eid] += this.AngularVelocity.x[eid] * deltaTime;
            this.WorldRotation.y[eid] += this.AngularVelocity.y[eid] * deltaTime;
            this.WorldRotation.z[eid] += this.AngularVelocity.z[eid] * deltaTime;
        }
    }

    syncSystem(world: IWorld) {
        const entities = this.syncQuery(world);

        for (let i = 0; i < entities.length; i++) {
            const eid = entities[i];
            
            const node = NodeMap.get(this.BridgeInfo.value[eid]);
            if (node) {
                node.setPosition(this.WorldPosition.x[eid], this.WorldPosition.y[eid], this.WorldPosition.z[eid]);
                node.setRotation(this.WorldRotation.x[eid], this.WorldRotation.y[eid], this.WorldRotation.z[eid], this.WorldRotation.w[eid]);
            }
        }
    }

    phaseCollisionDetectionSystem(world: IWorld) {
        const entities = this.CollisionQuery(world);
        for (let i = 0; i < entities.length; i++) {
            const entityA = entities[i];
            for (let j = i + 1; j < entities.length; j++) {
                if (i === j) {
                    continue;
                }
                const entityB = entities[j];
                if (!this.checkAABBOverlap(entityA, entityB)) {
                    continue;
                }
                if (this.narrowPhaseCollision[this.BitStatus.value[entityA] | this.BitStatus.value[entityB] | StatusEnum.SHAPE_BIT](entityA, entityB)) {
                    this.makeCollisionPair(entityA, entityB);
                }
            }
        }
    }

    private narrowPhaseCollision = {
        [StatusEnum.BOX]: (entityA: number, entityB: number) => {
            return false
        },
        [StatusEnum.SPHERE | StatusEnum.BOX]: (entityA: number, entityB: number) => {
            return false
        },
        [StatusEnum.SPHERE]: (entityA: number, entityB: number) => {
            const dx = this.WorldPosition.x[entityA] - this.WorldPosition.x[entityB];
            const dy = this.WorldPosition.y[entityA] - this.WorldPosition.y[entityB];
            const dz = this.WorldPosition.z[entityA] - this.WorldPosition.z[entityB];
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            return distance <= this.ShapeSize.x[entityA] + this.ShapeSize.x[entityB];
        },
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

    private updateAABBSystem(world: IWorld) {
        const entities = this.UpDateAAPPQuery(world);
        for (let i = 0; i < entities.length; i++) {
            const entity = entities[i];
            this.calculateAABB[this.BitStatus.value[entity] | StatusEnum.SPHERE](entity);
        }
    }

    private calculateAABB = {
        [StatusEnum.BOX]: (entity: number) => {
            // TODO: 计算box的AABB
        },
        [StatusEnum.SPHERE]: (entity: number) => {
            // TODO: 计算sphere的AABB
        },
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

    testSystem(world: IWorld) {
        console.info("ECS Tick!!!")
    }
    
    collisionResponseSystem(world: IWorld) {
        const entities = this.collisionQuery(world);
        const deltaTime = game.deltaTime;

        for (let i = 0; i < entities.length; i++) {
            const eid1 = entities[i];
            
            for (let j = i + 1; j < entities.length; j++) {
                const eid2 = entities[j];
                
                if (this.IsStatic.value[eid1] && this.IsStatic.value[eid2]) continue;
                
                if (this.checkAABBOverlap(eid1, eid2)) {
                    const m1 = this.Mass.value[eid1];
                    const m2 = this.Mass.value[eid2];
                    const I1 = this.MomentOfInertia.value[eid1];
                    const I2 = this.MomentOfInertia.value[eid2];
                    
                    const dx = this.WorldPosition.x[eid2] - this.WorldPosition.x[eid1];
                    const dy = this.WorldPosition.y[eid2] - this.WorldPosition.y[eid1];
                    const dz = this.WorldPosition.z[eid2] - this.WorldPosition.z[eid1];
                    
                    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    if (length > 0) {
                        const nx = dx / length;
                        const ny = dy / length;
                        const nz = dz / length;

                        const relativeVx = this.Velocity.x[eid2] - this.Velocity.x[eid1];
                        const relativeVy = this.Velocity.y[eid2] - this.Velocity.y[eid1];
                        const relativeVz = this.Velocity.z[eid2] - this.Velocity.z[eid1];
                        
                        const relativeSpeed = relativeVx * nx + relativeVy * ny + relativeVz * nz;
                        
                        if (relativeSpeed > 0) continue;

                        const restitution = 0.8;
                        const j = -(1 + restitution) * relativeSpeed / (1/m1 + 1/m2);

                        if (!this.IsStatic.value[eid1]) {
                            this.Velocity.x[eid1] -= (j * nx) / m1;
                            this.Velocity.y[eid1] -= (j * ny) / m1;
                            this.Velocity.z[eid1] -= (j * nz) / m1;
                        }
                        
                        if (!this.IsStatic.value[eid2]) {
                            this.Velocity.x[eid2] += (j * nx) / m2;
                            this.Velocity.y[eid2] += (j * ny) / m2;
                            this.Velocity.z[eid2] += (j * nz) / m2;
                        }

                        if (!this.IsStatic.value[eid1]) {
                            const radius = 1.0;
                            const r = radius * nx;
                            const deltaOmega1 = (j * r) / I1;
                            this.AngularVelocity.x[eid1] += deltaOmega1;
                            this.AngularVelocity.y[eid1] += deltaOmega1;
                            this.AngularVelocity.z[eid1] += deltaOmega1;
                        }
                        
                        if (!this.IsStatic.value[eid2]) {
                            const radius = 1.0;
                            const r = radius * nx;
                            const deltaOmega2 = (j * r) / I2;
                            this.AngularVelocity.x[eid2] -= deltaOmega2;
                            this.AngularVelocity.y[eid2] -= deltaOmega2;
                            this.AngularVelocity.z[eid2] -= deltaOmega2;
                        }

                        const offset = 0.1;
                        if (!this.IsStatic.value[eid1]) {
                            this.WorldPosition.x[eid1] -= nx * offset;
                            this.WorldPosition.y[eid1] -= ny * offset;
                            this.WorldPosition.z[eid1] -= nz * offset;
                        }
                        
                        if (!this.IsStatic.value[eid2]) {
                            this.WorldPosition.x[eid2] += nx * offset;
                            this.WorldPosition.y[eid2] += ny * offset;
                            this.WorldPosition.z[eid2] += nz * offset;
                        }
                    }
                }
            }
        }
    }

    pipeline = pipe(
        this.phaseCollisionDetectionSystem,
        this.collisionResponseSystem,
        this.moveSystem,
        this.syncSystem,
        this.updateAABBSystem,
        this.testSystem
    );
}

