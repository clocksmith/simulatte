import createContracts from './factories/phase-contracts.js';
import createCompilerApi from './factories/compiler.js';
import createPipelineAdapter from './factories/pipeline-adapter.js';
import { createRuntime } from './index.js';

const contracts = createContracts();
const compiler = createCompilerApi(contracts, createPipelineAdapter(() => Promise.resolve({ createRuntime })));
export const compilerContract = Object.freeze({
  schema: contracts.schema,
  version: contracts.version,
  requestSchema: contracts.PHASE_ZERO_INPUT_SCHEMA,
  envelope: contracts.envelope,
  phases: contracts.phases,
});

export function createCompiler(options) {
  const instance = compiler.create(options);
  return Object.freeze({ run: instance.run, cancel: instance.cancel, close: instance.dispose });
}
