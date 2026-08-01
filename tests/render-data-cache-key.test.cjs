const assert = require('node:assert');
const test = require('node:test');

require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');
require('../public/blank/pipeline/phase-07-render/simulatte-webgpu-renderer-dependencies.js');
require('../public/blank/pipeline/phase-07-render/simulatte-webgpu-renderer-packets.js');

const { phaseFamily } = require('./phase-module-fixture.cjs');
const renderer = phaseFamily('webGpuRenderer');

function scenePacket(overrides = {}) {
  return {
    schema: 'simulatte.sceneRenderPacket.v1',
    sceneKind: 'ocean',
    entities: [{
      id: 'entity:dog',
      layerSlot: 'geometry',
      identity: { type: 'dog', category: 'animal' },
      sourceGraphId: 'entity:dog',
      transform: { position: [0.4, 0.5], scale: [0.2, 0.2] },
      geometry: { bounds: [0.3, 0.4, 0.2, 0.2], program: { grammarId: 'animal-body' } },
      animation: { kind: 'swim-cycle' },
      material: { id: 'fur', color: '#624321' },
    }],
    fields: [],
    effects: [],
    uniforms: {
      palette: [0.1, 0.2, 0.3, 1, 0.4, 0.5, 0.6, 1, 0.2, 0.3, 0.4, 1, 0.7, 0.8, 0.9, 1],
      atmosphere: { density: 0.2 },
    },
    lights: [{ id: 'key', intensity: 1 }],
    camera: { zoom: 1 },
    ...overrides,
  };
}

test('render-data cache key changes for render-relevant packet values outside the spatial hash', () => {
  const base = scenePacket();
  const recolored = scenePacket({
    uniforms: { ...base.uniforms, palette: [0.9, ...base.uniforms.palette.slice(1)] },
  });
  const relit = scenePacket({ lights: [{ id: 'key', intensity: 0.15 }] });
  const rematerialed = scenePacket({
    entities: [{ ...base.entities[0], material: { id: 'fur', color: '#ee6633' } }],
  });

  const baseKey = renderer.sceneRenderPacketRenderDataKey(base, base.sceneKind);
  assert.notEqual(renderer.sceneRenderPacketRenderDataKey(recolored, recolored.sceneKind), baseKey);
  assert.notEqual(renderer.sceneRenderPacketRenderDataKey(relit, relit.sceneKind), baseKey);
  assert.notEqual(renderer.sceneRenderPacketRenderDataKey(rematerialed, rematerialed.sceneKind), baseKey);
});
