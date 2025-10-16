import { FoundingStage } from './founding.js';
import { ConvertibleNoteStage } from './convertible-note.js';
import { PreMoneySafeStage } from './pre-money-safe.js';
import { PostMoneySafeStage } from './post-money-safe.js';
import { PricedRoundStage } from './priced-round.js';
import { ExitStage } from './exit.js';

const registry = new Map();
[
  FoundingStage,
  ConvertibleNoteStage,
  PreMoneySafeStage,
  PostMoneySafeStage,
  PricedRoundStage,
  ExitStage
].forEach((stage) => {
  registry.set(stage.type, stage);
});

export function getStageDefinition(type) {
  return registry.get(type);
}

export function listStageDefinitions() {
  return Array.from(registry.values());
}

export function createStageFromDefinition(type) {
  const def = getStageDefinition(type);
  if (!def) return null;
  return {
    type: def.type,
    name: def.label,
    params: typeof def.defaults === 'function' ? def.defaults() : {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    id: null
  };
}
