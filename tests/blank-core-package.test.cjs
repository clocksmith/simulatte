const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const PACKAGE_ROOT = path.join(ROOT, 'public/shared/blank-core');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    encoding: 'utf8',
    env: { ...process.env, npm_config_update_notifier: 'false' },
  });
  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join('\n'));
  return result.stdout.trim();
}

test('packed Blank core is a complete independent consumer surface', { timeout: 30_000 }, () => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'simulatte-blank-core-'));
  const archiveDirectory = path.join(temporary, 'archive');
  const consumerDirectory = path.join(temporary, 'consumer');
  mkdirSync(archiveDirectory);
  mkdirSync(consumerDirectory);

  try {
    const packument = JSON.parse(run('npm', [
      'pack', '--json', '--pack-destination', archiveDirectory,
    ], { cwd: PACKAGE_ROOT }));
    assert.equal(packument.length, 1);
    assert.equal(packument[0].name, '@simulatte/blank-core');
    assert.match(packument[0].integrity, /^sha512-/);

    const files = new Set(packument[0].files.map((entry) => entry.path));
    for (const required of [
      'index.js', 'index.d.ts', 'compiler.js', 'compiler.d.ts',
      'world.js', 'world.d.ts', 'data.js', 'data.d.ts',
      'render.js', 'render.d.ts', 'schemas/world-spec.schema.json',
      'examples/index.html',
    ]) assert.ok(files.has(required), `packed file missing: ${required}`);
    assert.equal([...files].some((file) => file.startsWith('public/blank/')), false);
    assert.equal([...files].some((file) => file.startsWith('public/simulatte/')), false);

    const archive = path.join(archiveDirectory, packument[0].filename);
    run('npm', [
      'install', '--prefix', consumerDirectory, '--ignore-scripts',
      '--no-audit', '--no-fund', '--offline', archive,
    ]);

    const acceptance = path.join(consumerDirectory, 'acceptance.mjs');
    writeFileSync(acceptance, `
      import assert from 'node:assert/strict';
      import { access } from 'node:fs/promises';
      import { fileURLToPath } from 'node:url';
      import { createRuntime } from '@simulatte/blank-core';
      import { createCompiler, compilerContract } from '@simulatte/blank-core/compiler';
      import {
        editWorldSpec, serializeWorldSpec, worldSpecSchemaURL,
      } from '@simulatte/blank-core/world';
      import {
        compareDataRuns, compileDataWorld, createDataSimulation, decodeInput,
      } from '@simulatte/blank-core/data';
      import { createRendererSession } from '@simulatte/blank-core/render';

      assert.equal(typeof createCompiler, 'function');
      assert.equal(compilerContract.phases.length, 8);
      await access(fileURLToPath(worldSpecSchemaURL));

      const progress = [];
      const runtime = createRuntime({ ports: {
        onProgress(event) { progress.push(event); },
        async yieldTask() {},
      } });
      const pipeline = await runtime.run(2, [{
        id: 'double',
        validateInput(value) { assert.equal(value, 2); },
        run(value) { return value * 2; },
        validateOutput(value) { assert.equal(value, 4); },
      }]);
      assert.equal(pipeline.output, 4);
      assert.deepEqual(progress.map((event) => event.status), ['running', 'completed']);
      await runtime.close();

      const source = await decodeInput('id,x,y,vx,vy\\na,0,0,2,1');
      const program = await compileDataWorld(source, {
        mapping: { id: 'id', label: null, x: 'x', y: 'y', vx: 'vx', vy: 'vy' },
        duration: 2, steps: 2, units: 'm',
      });
      const simulation = createDataSimulation();
      const first = await simulation.run(program);
      const candidate = JSON.parse(serializeWorldSpec(program));
      candidate.objects[0].vx = 3;
      const edited = editWorldSpec(program, candidate, { rationale: 'Acceptance edit' });
      const second = await simulation.run(edited);
      assert.equal(first.frames.at(-1).points[0].x, 4);
      assert.equal(second.frames.at(-1).points[0].x, 6);
      assert.equal(compareDataRuns(first, second).changed, 1);
      await simulation.close();

      const renderer = createRendererSession({
        backend: 'acceptance',
        capabilities: ['render', 'receipt'],
        initialize: () => ({
          render: (frame) => frame,
          receipt: () => Object.freeze({ schema: 'acceptance.frame.v1' }),
          dispose() {},
        }),
      });
      await renderer.ready;
      assert.deepEqual(renderer.render({ frame: 1 }), { frame: 1 });
      await renderer.close();

      await assert.rejects(
        import('@simulatte/blank-core/factories/compiler.js'),
        (error) => error && error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
      );
    `);
    run(process.execPath, [acceptance], { cwd: consumerDirectory });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
