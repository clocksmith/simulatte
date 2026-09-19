import createAuthorship from './factories/world-spec-authorship.js';
import createWorld from './factories/world-spec.js';

const world = createWorld(createAuthorship());
export const parseWorldSpec = world.parseWorldSpec;
export const validateWorldSpec = world.validateWorldSpec;
export const serializeWorldSpec = world.serializeWorldSpec;
export const editWorldSpec = world.prepareUserEdit;
export const worldSpecSchemaURL = new URL('./schemas/world-spec.schema.json', import.meta.url).href;
