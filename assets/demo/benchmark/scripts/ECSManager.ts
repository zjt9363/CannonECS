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

    pipe,

} from 'bitecs'

const Vector3 = { x: Types.f32, y: Types.f32, z: Types.f32 }
const world = createWorld()
export class ECSManager {

}



