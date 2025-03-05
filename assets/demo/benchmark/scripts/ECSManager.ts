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

import {BoxCollider, Node, SphereCollider} from 'cc';

const NodeMap = new Map<number, Node>();
export class ECSManager {
    world: IWorld = createWorld();

    Vector3 = {x: Types.f32, y: Types.f32, z: Types.f32};
    Vector4 = {x: Types.f32, y: Types.f32, z: Types.f32, w: Types.f32};
    VectorAABB = {min: this.Vector3, max: this.Vector3};

    WorldPosition = defineComponent(this.Vector3);
    WorldRotation = defineComponent(this.Vector4);
    WorldScale = defineComponent(this.Vector3);
    BridgeInfo = defineComponent({value: Types.i16});
    AABB = defineComponent(this.VectorAABB);
    CollionPair = defineComponent({entityA: Types.i16, entityB: Types.i16});

    MovementQuery = defineQuery([this.WorldPosition, this.WorldRotation, this.WorldScale]);
    CollisionQuery = defineQuery([this.AABB, this.WorldPosition]);
    UpDateAAPPQuery = defineQuery([this.WorldPosition, this.WorldRotation, this.WorldScale]); // TODO: 完善AABB查询

    NodeId = 0;

    constructor() {}

    addEntity(node: Node) {
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

        addComponent(this.world, this.BridgeInfo, eid);
        this.BridgeInfo.value[eid] = this.NodeId;

        addComponent(this.world, this.AABB, eid);
        

        NodeMap.set(this.NodeId++, node);
    }

    moveSystem(world: IWorld) {

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
                const aabb1 = {
                    min: { x: this.AABB.min.x[entityA], y: this.AABB.min.y[entityA], z: this.AABB.min.z[entityA] },
                    max: { x: this.AABB.max.x[entityA], y: this.AABB.max.y[entityA], z: this.AABB.max.z[entityA] }
                };
                const aabb2 = {
                    min: { x: this.AABB.min.x[entityB], y: this.AABB.min.y[entityB], z: this.AABB.min.z[entityB] },
                    max: { x: this.AABB.max.x[entityB], y: this.AABB.max.y[entityB], z: this.AABB.max.z[entityB] }
                };
                if (!this.checkAABBOverlap(aabb1, aabb2)) {
                    continue;
                }
                if (this.narrowPhaseCollisionDetection(entityA, entityB)) {
                    this.makeCollisionPair(entityA, entityB);
                }
            }
        }
    }

    private narrowPhaseCollisionDetection(entityA: number, entityB: number): boolean {
        if (this.isBox(entityA) && this.isBox(entityB)) {
            return this.checkBoxBoxCollision(entityA, entityB);
        } else if (!this.isBox(entityA) && !this.isBox(entityB)) {
            return this.checkSphereSphereCollision(entityA, entityB);
        } else {
            return this.checkBoxSphereCollision(entityA, entityB);
        }
    }

    private checkBoxBoxCollision(entityA: number, entityB: number): boolean {
        // TODO: 检测两个box是否碰撞
        return false;
    }

    private checkBoxSphereCollision(entityA: number, entityB: number): boolean {
        // TODO: 检测box和sphere是否碰撞
        return false;
    }

    private checkSphereSphereCollision(entityA: number, entityB: number): boolean {
        // TODO: 检测两个sphere是否碰撞
        return false;
    }

    private isBox(entity: number): boolean {
        const node = NodeMap.get(this.BridgeInfo.value[entity]);
        if (!node) {
            console.error("Node not found");
        }
        return node?.getComponent(BoxCollider) !== null;
    }



    private makeCollisionPair(entityA: number, entityB: number) {
        const eid = addEntity(this.world);
        addComponent(this.world, this.CollionPair, eid);
        this.CollionPair.entityA[eid] = entityA;
        this.CollionPair.entityB[eid] = entityB;
    }

    private updateAABBSystem(world: IWorld) {
        const entities = this.UpDateAAPPQuery(world);
        for (let i = 0; i < entities.length; i++) {
            const entity = entities[i];
            if (this.isBox(entity)) {
                this.calculateBoxAABB(entity);
            } else {
                this.calculateSphereAABB(entity);
            }
        }
    }

    private calculateBoxAABB(entity: number) {
        // TODO: 计算AABB
    }

    private calculateSphereAABB(entity: number) {
        // TODO: 计算AABB
    }

    private checkAABBOverlap(aabb1: any, aabb2: any): boolean {
        return (aabb1.min.x <= aabb2.max.x && aabb1.max.x >= aabb2.min.x) &&
               (aabb1.min.y <= aabb2.max.y && aabb1.max.y >= aabb2.min.y) &&
               (aabb1.min.z <= aabb2.max.z && aabb1.max.z >= aabb2.min.z);
    }

    testSystem(world: IWorld) {
        console.info("ECS Tick!!!")
    }
    
    pipeline = pipe(this.phaseCollisionDetectionSystem, this.moveSystem, this.updateAABBSystem, this.testSystem);
}

