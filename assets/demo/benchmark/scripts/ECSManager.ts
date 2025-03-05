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

import {Node, game} from 'cc';

const NodeMap = new Map<number, Node>();
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
    NodeId = 0;

    movementQuery = defineQuery([this.WorldPosition, this.WorldRotation, this.WorldScale, this.Velocity, this.AngularVelocity, Not(this.IsStatic)]);
    syncQuery = defineQuery([this.WorldPosition, this.WorldRotation, this.BridgeInfo]);
    collisionQuery = defineQuery([this.WorldPosition, this.Velocity, this.AngularVelocity, this.AABB, this.Mass, this.MomentOfInertia]);

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
        const size = 1.0;
        this.AABB.min.x[eid] = this.WorldPosition.x[eid] - size;
        this.AABB.min.y[eid] = this.WorldPosition.y[eid] - size;
        this.AABB.min.z[eid] = this.WorldPosition.z[eid] - size;
        this.AABB.max.x[eid] = this.WorldPosition.x[eid] + size;
        this.AABB.max.y[eid] = this.WorldPosition.y[eid] + size;
        this.AABB.max.z[eid] = this.WorldPosition.z[eid] + size;
        
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

    broadphaseCollisionSystem(world: IWorld) {

    }

    narrowphaseCollisionSystem(world: IWorld) {

    }

    private checkAABBOverlap(aabb1: any, aabb2: any): boolean {
        return (aabb1.min.x <= aabb2.max.x && aabb1.max.x >= aabb2.min.x) &&
               (aabb1.min.y <= aabb2.max.y && aabb1.max.y >= aabb2.min.y) &&
               (aabb1.min.z <= aabb2.max.z && aabb1.max.z >= aabb2.min.z);
    }

    testSystem(world: IWorld) {
        console.info("zjt!!!")
    }
    
    collisionResponseSystem(world: IWorld) {
        const entities = this.collisionQuery(world);
        const deltaTime = game.deltaTime;

        for (let i = 0; i < entities.length; i++) {
            const eid1 = entities[i];
            
            for (let j = i + 1; j < entities.length; j++) {
                const eid2 = entities[j];
                
                if (this.IsStatic.value[eid1] && this.IsStatic.value[eid2]) continue;
                
                if (this.checkAABBOverlap(
                    {min: {x: this.AABB.min.x[eid1], y: this.AABB.min.y[eid1], z: this.AABB.min.z[eid1]},
                    max: {x: this.AABB.max.x[eid1], y: this.AABB.max.y[eid1], z: this.AABB.max.z[eid1]}},
                    {min: {x: this.AABB.min.x[eid2], y: this.AABB.min.y[eid2], z: this.AABB.min.z[eid2]},
                    max: {x: this.AABB.max.x[eid2], y: this.AABB.max.y[eid2], z: this.AABB.max.z[eid2]}}
                )) {
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
        this.broadphaseCollisionSystem, 
        this.narrowphaseCollisionSystem,
        this.collisionResponseSystem,
        this.moveSystem,
        this.syncSystem,
        this.testSystem
    );
}

