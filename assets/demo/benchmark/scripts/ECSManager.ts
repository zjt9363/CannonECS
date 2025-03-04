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

import {Node} from 'cc';

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
    NodeId = 0;

    movementQuery = defineQuery([this.WorldPosition, this.WorldRotation, this.WorldScale]);

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
    
    pipeline = pipe(this.broadphaseCollisionSystem, this.narrowphaseCollisionSystem, this.moveSystem, this.testSystem);
}

