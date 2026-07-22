(function attachPluginRandom(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginRandom = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPluginRandomModule() {
  // Named, splittable, deterministic random streams for the simulation substrate.
  //
  // A single global sdk.random() would be fragile: adding one draw to one plugin would
  // shift every other plugin's sequence. Instead every stream's state is derived
  // purely from a stable identity string:
  //
  //   application root seed | plugin id | scenario id | stream name | entity id | algo
  //
  // so a stream produces the same sequence regardless of evaluation order, and two
  // differently named streams never interfere. The generator is integer-only
  // (cyrb128 seeding + sfc32), which is stable across browsers and Node.
  const ALGORITHM = 'cyrb128+sfc32.v1';

  function cyrb128(seedText) {
    let h1 = 1779033703;
    let h2 = 3144134277;
    let h3 = 1013904242;
    let h4 = 2773480762;
    for (let index = 0; index < seedText.length; index += 1) {
      const k = seedText.charCodeAt(index);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
  }

  function seedHashHex(seedText) {
    return cyrb128(seedText).map((word) => word.toString(16).padStart(8, '0')).join('');
  }

  function createStream(identity) {
    const [a0, b0, c0, d0] = cyrb128(identity);
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    let drawCount = 0;

    function next() {
      drawCount += 1;
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      const t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      const result = (t + d) | 0;
      c = (c + result) | 0;
      return (result >>> 0) / 4294967296;
    }

    const stream = {
      identity,
      algorithm: ALGORITHM,
      next,
      float(minimum = 0, maximum = 1) { return minimum + (maximum - minimum) * next(); },
      integer(limit) {
        if (!Number.isInteger(limit) || limit < 1) throw randomError('random_integer_limit_invalid', `Stream integer expected a positive limit, received ${limit}`);
        return Math.floor(next() * limit);
      },
      int(minimum, maximum) {
        if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || maximum < minimum) throw randomError('random_int_range_invalid', `Stream int expected minimum <= maximum integers, received ${minimum}..${maximum}`);
        return minimum + Math.floor(next() * (maximum - minimum + 1));
      },
      bool(probability = 0.5) { return next() < probability; },
      pick(items) {
        if (!Array.isArray(items) || !items.length) throw randomError('random_pick_empty', 'Stream pick expected a non-empty array');
        return items[Math.floor(next() * items.length)];
      },
      weightedIndex(weights) {
        const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
        if (total <= 0) throw randomError('random_weight_invalid', 'Stream weightedIndex expected positive total weight');
        let target = next() * total;
        for (let index = 0; index < weights.length; index += 1) {
          target -= Math.max(0, weights[index]);
          if (target < 0) return index;
        }
        return weights.length - 1;
      },
      shuffle(items) {
        const copy = items.slice();
        for (let index = copy.length - 1; index > 0; index -= 1) {
          const swap = Math.floor(next() * (index + 1));
          const value = copy[index];
          copy[index] = copy[swap];
          copy[swap] = value;
        }
        return copy;
      },
      // Box-Muller standard normal; two draws per sample.
      normal(mean = 0, standardDeviation = 1) {
        let u = 0;
        let v = 0;
        while (u === 0) u = next();
        while (v === 0) v = next();
        return mean + standardDeviation * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      },
      lognormal(mu, sigma) { return Math.exp(stream.normal(mu, sigma)); },
      exponential(rate) {
        if (!(rate > 0)) throw randomError('random_rate_invalid', `Stream exponential expected a positive rate, received ${rate}`);
        let u = 0;
        while (u === 0) u = next();
        return -Math.log(u) / rate;
      },
      // Knuth's algorithm for small/moderate lambda; guarded for reproducibility.
      poisson(lambda) {
        if (!(lambda >= 0)) throw randomError('random_lambda_invalid', `Stream poisson expected lambda >= 0, received ${lambda}`);
        if (lambda === 0) return 0;
        if (lambda > 700) return Math.max(0, Math.round(stream.normal(lambda, Math.sqrt(lambda))));
        const limit = Math.exp(-lambda);
        let count = 0;
        let product = 1;
        do {
          count += 1;
          product *= next();
        } while (product > limit);
        return count - 1;
      },
      binomial(trials, probability) {
        if (!Number.isInteger(trials) || trials < 0) throw randomError('random_binomial_trials_invalid', `Stream binomial expected trials >= 0, received ${trials}`);
        const p = Math.min(1, Math.max(0, probability));
        let successes = 0;
        for (let index = 0; index < trials; index += 1) if (next() < p) successes += 1;
        return successes;
      },
      // Multinomial split of a non-negative integer count across weighted buckets.
      multinomial(count, weights) {
        const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
        const result = new Array(weights.length).fill(0);
        if (total <= 0 || count <= 0) return result;
        let remaining = count;
        let remainingWeight = total;
        for (let index = 0; index < weights.length - 1; index += 1) {
          const weight = Math.max(0, weights[index]);
          const probability = remainingWeight > 0 ? weight / remainingWeight : 0;
          const draw = stream.binomial(remaining, probability);
          result[index] = draw;
          remaining -= draw;
          remainingWeight -= weight;
        }
        result[weights.length - 1] = remaining;
        return result;
      },
      drawCount() { return drawCount; },
      // Splittable: a named child stream whose identity nests the parent's, so it is
      // reproducible and independent of how many draws the parent has taken.
      stream(childName, entityId = null) {
        return createStream(`${identity}|${childName}${entityId === null ? '' : `#${entityId}`}`);
      },
      receipt() {
        return Object.freeze({
          schema: 'simulatte.randomStreamReceipt.v1',
          algorithm: ALGORITHM,
          identity,
          identityHash: seedHashHex(identity),
          drawCount,
        });
      },
    };
    return Object.freeze(stream);
  }

  // Host-facing factory. The host supplies the application root seed and (optionally)
  // the active scenario id; the returned object is bound per plugin so stream identity
  // always includes the plugin id.
  function createRandomPort({ rootSeed, scenarioId = null, algorithmVersion = ALGORITHM }) {
    const rootSeedHash = seedHashHex(String(rootSeed));
    function forPlugin(pluginId) {
      const base = `${rootSeedHash}|${algorithmVersion}|${pluginId}|${scenarioId || 'no-scenario'}`;
      const created = [];
      return Object.freeze({
        rootSeedHash,
        algorithmVersion,
        scenarioId,
        stream(name, entityId = null) {
          if (typeof name !== 'string' || !name) throw randomError('random_stream_name_invalid', 'Stream name expected non-empty text');
          const created_stream = createStream(`${base}|${name}${entityId === null ? '' : `#${entityId}`}`);
          created.push(created_stream);
          return created_stream;
        },
        receipts() { return Object.freeze(created.map((stream) => stream.receipt())); },
      });
    }
    return Object.freeze({ rootSeedHash, algorithmVersion, scenarioId, forPlugin });
  }

  function randomError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulattePluginRandomError';
    error.code = code;
    return error;
  }

  return { ALGORITHM, createRandomPort, createStream, seedHashHex, cyrb128 };
});
