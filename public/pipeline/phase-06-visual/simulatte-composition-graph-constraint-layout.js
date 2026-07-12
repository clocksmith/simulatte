(function attachSimulatteCompositionGraphConstraintLayout(root) {
  const scope = root.__SimulatteCompositionGraphRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const SPATIAL_CONSTRAINTS = Object.freeze(new Set([
      'in', 'inside', 'into', 'within', 'on', 'onto', 'at', 'over', 'above', 'under',
      'below', 'beside', 'near', 'outside', 'around', 'behind', 'in-front-of',
      'attached-to', 'against', 'through', 'between',
      'supports',
    ]));

    function constraintLayoutObjects(objects = [], sceneKind = '', spec = {}, visualGenome = null) {
      const canonicalObjects = canonicalVisualObjects(objects);
      const states = canonicalObjects.map((object, index) => initialLayoutState(object, index, canonicalObjects.length, visualGenome));
      const relations = layoutRelationsForSpec(spec, states);
      const applied = new Map(states.map((state) => [state.object.id, []]));
      for (let pass = 0; pass < 12; pass += 1) {
        for (const relation of relations) applySpatialConstraint(relation, states, applied);
        separateUnrelatedObjects(states, relations);
        states.forEach(clampLayoutState);
      }
      return states.map((state) => {
        const relationIds = uniqueList(applied.get(state.object.id) || []);
        const relationPredicates = uniqueList(relations
          .filter((relation) => relationIds.includes(relation.id))
          .map((relation) => relation.predicate)
          .filter(Boolean));
        const evidence = uniqueList([
          ...(state.object.evidence || []),
          ...relationIds.map((id) => `layout-relation:${id}`),
          ...relationPredicates.map((predicate) => `layout-predicate:${predicate}`),
        ]);
        return {
          ...state.object,
          pose: {
            ...(state.object.pose || {}),
            x: Number(state.x.toFixed(5)),
            y: Number(state.y.toFixed(5)),
            w: Number(state.w.toFixed(5)),
            h: Number(state.h.toFixed(5)),
            rotation: Number(state.rotation.toFixed(5)),
          },
          evidence,
          layoutConstraints: relationIds,
          layoutReceipt: {
            schema: 'simulatte.constraintLayoutReceipt.v1',
            solver: 'typed-spatial-constraints',
            sceneKind,
            topology: visualGenome && visualGenome.compositionTopology || '',
            relationIds,
            relationCount: relationIds.length,
          },
        };
      });
    }

    function canonicalVisualObjects(objects = []) {
      const output = [];
      const ordered = (objects || []).slice().sort((a, b) => (
        canonicalVisualObjectPriority(b) - canonicalVisualObjectPriority(a) ||
        Number(Boolean(b.semanticRef)) - Number(Boolean(a.semanticRef)) ||
        Number(b.directlyGrounded === true) - Number(a.directlyGrounded === true)
      ));
      for (const object of ordered) {
        const existing = output.find((row) => visualObjectsShareConcept(row, object));
        if (!existing) {
          output.push({ ...object });
          continue;
        }
        existing.evidence = uniqueList([...(existing.evidence || []), ...(object.evidence || [])]);
        existing.sourceIds = uniqueList([...(existing.sourceIds || []), ...(object.sourceIds || []), object.id]);
        existing.aliases = uniqueList([...(existing.aliases || []), ...(object.aliases || []), object.sourceLabel, object.role]);
        existing.physicsOperators = uniqueList([...(existing.physicsOperators || []), ...(object.physicsOperators || [])]);
        existing.behavior = existing.behavior || object.behavior || null;
        existing.construction = existing.construction || object.construction || null;
        existing.constructionProvenance = existing.constructionProvenance || object.constructionProvenance || [];
      }
      return output;
    }

    function canonicalVisualObjectPriority(object = {}) {
      const source = String(object.source || '');
      const promptRef = /^prompt[.-]/.test(String(object.semanticRef || object.physicalRef || ''));
      if (object.directlyGrounded === true && source === 'render-ir' && promptRef) return 5;
      if (object.directlyGrounded === true && promptRef && !/^embedding-guided-synth-event/.test(source)) return 4;
      if (object.directlyGrounded === true && promptRef) return 3;
      if (/^embedding-guided-synth-event/.test(source) || object.kind === 'event') return 0;
      return object.directlyGrounded === true ? 2 : 1;
    }

    function visualObjectsShareConcept(left = {}, right = {}) {
      if (left.id && right.id && left.id === right.id) return true;
      if (left.physicalRef && right.physicalRef && left.physicalRef === right.physicalRef) return true;
      if (left.semanticRef && right.semanticRef && left.semanticRef === right.semanticRef) {
        if (left.physicalRef && right.physicalRef) return false;
        return Boolean(left.sourceObject && right.sourceObject && left.sourceObject === right.sourceObject);
      }
      const leftLabel = layoutIdentityTokens(left.sourceLabel || left.label || left.role || '').join(' ');
      const rightLabel = layoutIdentityTokens(right.sourceLabel || right.label || right.role || '').join(' ');
      if (leftLabel && leftLabel === rightLabel &&
        left.directlyGrounded === true && right.directlyGrounded === true &&
        !(left.semanticRef && right.semanticRef) && !(left.physicalRef && right.physicalRef)) return true;
      return false;
    }

    function visualObjectIdentityTokens(object = {}) {
      const semanticTail = String(object.semanticRef || '').split('.').pop();
      const source = semanticTail || object.sourceLabel || object.role || object.label || object.id;
      return layoutIdentityTokens(source).filter((token) => !/^(?:component|generated|physics|material|entity)$/.test(token));
    }

    function initialLayoutState(object = {}, index = 0, total = 1, visualGenome = null) {
      const pose = object.pose || {};
      const container = layoutContainerObject(object);
      const topology = String(visualGenome && visualGenome.compositionTopology || '');
      const hash = stableLayoutHash(`${object.id || index}:${object.semanticRef || ''}:${topology}`);
      const phase = (hash % 10000) / 10000 * Math.PI * 2;
      const t = total <= 1 ? 0.5 : index / Math.max(1, total - 1);
      const radius = topology === 'orbit' || topology === 'radial' ? 0.3 : 0.22 + (index % 3) * 0.055;
      const corridor = topology === 'corridor' || topology === 'conveyor' || topology === 'ladder';
      const x = container ? 0.5 : corridor ? 0.14 + t * 0.72 : 0.5 + Math.cos(phase) * radius;
      const y = container ? 0.52 : corridor ? 0.34 + (index % 2) * 0.3 : 0.5 + Math.sin(phase) * radius * 0.78;
      const size = layoutObjectSize(object, container);
      return {
        object,
        x,
        y,
        w: size[0],
        h: size[1],
        rotation: Number.isFinite(Number(pose.rotation)) ? Number(pose.rotation) : 0,
        container,
      };
    }

    function layoutObjectSize(object = {}, container = false) {
      const pose = object.pose || {};
      if (container) return [Math.max(0.58, Number(pose.w || 0)), Math.max(0.44, Number(pose.h || 0))];
      const construction = object.construction || {};
      const scaleText = (construction.scaleHints || []).join(' ').toLowerCase();
      const partCount = (construction.partHints || []).length;
      const scale = /microscopic|tiny|small/.test(scaleText) ? 0.78 : /large|landscape|architectural|orbital/.test(scaleText) ? 1.35 : 1;
      const complexity = Math.min(1.35, 1 + partCount * 0.025);
      return [
        clampLayoutNumber((Number(pose.w || 0.17) || 0.17) * scale * complexity, 0.08, 0.4),
        clampLayoutNumber((Number(pose.h || 0.13) || 0.13) * scale * complexity, 0.07, 0.38),
      ];
    }

    function layoutContainerObject(object = {}) {
      const semanticTokens = new Set([object.kind, object.semanticClass, ...(object.domainTags || [])]
        .map((value) => String(value || '').toLowerCase().replace(/_/g, '-'))
        .filter(Boolean));
      const relations = (object.construction && object.construction.relationHints || []).join(' ').toLowerCase();
      return ['environment', 'medium', 'field', 'domain', 'interior', 'terrain']
        .some((token) => semanticTokens.has(token)) ||
        /contains|containment|interior|surrounds/.test(relations);
    }

    function layoutRelationsForSpec(spec = {}, states = []) {
      const ledger = spec.renderIR && spec.renderIR.compositionLedger ||
        spec.physicsIR && spec.physicsIR.compositionLedger || {};
      const rows = [];
      for (const relation of ledger.relations || []) {
        let spatialRelation = normalizeSpatialConstraint(
          relation.spatialRelation || relation.predicate || relation.relation || relation.kind
        );
        if (relation.process === 'impact' && ['in', 'inside', 'into', 'within'].includes(spatialRelation)) {
          spatialRelation = 'against';
        }
        if (!spatialRelation) continue;
        const from = layoutObjectForReference(states, relation.from || relation.sourceSpanId);
        const targetRef = relation.kind === 'spatial-constraint' ? relation.to : relation.target || relation.to;
        const to = layoutObjectForReference(states, targetRef || relation.targetSpanId);
        if (!from || !to || from === to) continue;
        rows.push({
          id: relation.id || `relation-${rows.length + 1}`,
          spatialRelation,
          predicate: relation.predicate || relation.process || '',
          from,
          to,
          direct: relation.kind === 'spatial-constraint',
        });
      }
      const containmentByChild = new Map(rows
        .filter((row) => ['in', 'inside', 'into', 'within'].includes(row.spatialRelation))
        .map((row) => [row.from.object.id, row]));
      const resolvedRows = rows.map((row) => {
        if (row.spatialRelation !== 'against') return row;
        const sourceContainer = containmentByChild.get(row.from.object.id);
        const targetContainer = containmentByChild.get(row.to.object.id);
        return {
          ...row,
          from: sourceContainer ? sourceContainer.to : row.from,
          to: targetContainer ? targetContainer.to : row.to,
        };
      }).filter((row) => row.from !== row.to);
      const byConstraint = new Map();
      for (const row of resolvedRows) {
        const key = `${row.from.object.id}:${row.to.object.id}:${row.spatialRelation}`;
        const existing = byConstraint.get(key);
        if (!existing || row.direct) byConstraint.set(key, row);
      }
      return Array.from(byConstraint.values());
    }

    function normalizeSpatialConstraint(value = '') {
      const normalized = String(value || '').toLowerCase().replace(/_/g, '-');
      if (SPATIAL_CONSTRAINTS.has(normalized)) return normalized;
      if (normalized === 'inside' || normalized === 'supportedby') return normalized === 'inside' ? 'inside' : 'on';
      return '';
    }

    function layoutObjectForReference(states = [], reference = '') {
      const instanceRef = String(reference || '').toLowerCase().match(/^(entity|environment|medium):([^:]+?)(?::(\d+))?$/);
      if (instanceRef) {
        const prefix = instanceRef[1] === 'environment' ? 'prompt-environment-' :
          instanceRef[1] === 'medium' ? 'prompt-material-' : 'prompt-body-';
        const physicalRef = `${prefix}${instanceRef[2]}${instanceRef[3] ? `-${instanceRef[3]}` : ''}`;
        const exactState = states.find((state) => String(state.object.physicalRef || '').toLowerCase() === physicalRef);
        if (exactState) return exactState;
      }
      const target = layoutIdentityTokens(reference);
      if (!target.length) return null;
      const ranked = states.map((state) => {
        const tokens = layoutIdentityTokens([
          state.object.id, state.object.semanticRef, state.object.physicalRef, state.object.sourceObject,
          state.object.sourceGraphId, state.object.role, state.object.label, state.object.sourceLabel,
          ...(state.object.aliases || []),
        ].filter(Boolean).join(' '));
        const score = target.reduce((sum, token) => sum + (tokens.includes(token) ? 1 : 0), 0);
        return { state, score, exact: target.length === tokens.length && target.every((token) => tokens.includes(token)) };
      }).filter((row) => row.score > 0)
        .sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score);
      return ranked[0] && ranked[0].score === target.length ? ranked[0].state : null;
    }

    function applySpatialConstraint(relation, states, applied) {
      const a = relation.from;
      const b = relation.to;
      const type = relation.spatialRelation;
      let direction = stableLayoutHash(relation.id) % 2 ? 1 : -1;
      if (['in', 'inside', 'into', 'within'].includes(type)) {
        b.container = true;
        b.w = Math.max(b.w, Math.min(0.78, a.w * 2.8));
        b.h = Math.max(b.h, Math.min(0.68, a.h * 2.8));
        a.x += (b.x + direction * Math.min(0.12, b.w * 0.18) - a.x) * 0.62;
        a.y += (b.y + Math.min(0.08, b.h * 0.14) - a.y) * 0.62;
      } else if (type === 'outside') {
        a.x += (b.x + direction * (b.w + a.w) * 0.62 - a.x) * 0.58;
        a.y += (b.y + Math.min(0.12, b.h * 0.3) - a.y) * 0.44;
      } else if (type === 'on' || type === 'onto' || type === 'at') {
        a.x += (b.x + direction * b.w * 0.12 - a.x) * 0.52;
        a.y += (b.y - b.h * 0.5 - a.h * 0.5 - 0.012 - a.y) * 0.68;
      } else if (type === 'supports') {
        b.x += (a.x - b.x) * 0.62;
        b.y += (a.y - a.h * 0.5 - b.h * 0.5 - 0.012 - b.y) * 0.68;
      } else if (type === 'over' || type === 'above') {
        a.y += (b.y - (a.h + b.h) * 0.72 - a.y) * 0.64;
      } else if (type === 'under' || type === 'below') {
        a.y += (b.y + (a.h + b.h) * 0.72 - a.y) * 0.64;
      } else if (type === 'beside' || type === 'near') {
        a.x += (b.x + direction * (a.w + b.w) * (type === 'near' ? 0.48 : 0.66) - a.x) * 0.62;
        a.y += (b.y - a.y) * 0.38;
      } else if (type === 'attached-to' || type === 'against') {
        const offset = (a.w + b.w) * 0.46;
        const preferred = b.x + direction * offset;
        if (preferred < a.w * 0.52 + 0.025 || preferred > 0.975 - a.w * 0.52) direction *= -1;
        a.x += (b.x + direction * (a.w + b.w) * 0.46 - a.x) * 0.72;
        a.y += (b.y - a.y) * 0.62;
      } else if (type === 'through') {
        a.x += (b.x - a.x) * 0.62;
        a.y += (b.y - a.y) * 0.62;
        a.rotation = Math.atan2(b.h, Math.max(0.01, b.w));
      } else if (type === 'around') {
        a.x += (b.x + Math.cos(stableLayoutHash(a.object.id) % 628 / 100) * (b.w + a.w) * 0.56 - a.x) * 0.55;
        a.y += (b.y + Math.sin(stableLayoutHash(a.object.id) % 628 / 100) * (b.h + a.h) * 0.56 - a.y) * 0.55;
      } else if (type === 'behind' || type === 'in-front-of') {
        a.x += (b.x + direction * b.w * 0.18 - a.x) * 0.48;
        a.y += (b.y + (type === 'behind' ? -1 : 1) * b.h * 0.2 - a.y) * 0.48;
      }
      applied.get(a.object.id).push(relation.id);
      applied.get(b.object.id).push(relation.id);
    }

    function separateUnrelatedObjects(states = [], relations = []) {
      const linked = new Set(relations.map((row) => [row.from.object.id, row.to.object.id].sort().join(':')));
      for (let left = 0; left < states.length; left += 1) {
        for (let right = left + 1; right < states.length; right += 1) {
          const a = states[left];
          const b = states[right];
          if (a.container || b.container || linked.has([a.object.id, b.object.id].sort().join(':'))) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const overlapX = (a.w + b.w) * 0.52 - Math.abs(dx);
          const overlapY = (a.h + b.h) * 0.52 - Math.abs(dy);
          if (overlapX <= 0 || overlapY <= 0) continue;
          const sign = dx === 0 ? (stableLayoutHash(a.object.id) % 2 ? 1 : -1) : Math.sign(dx);
          a.x += sign * overlapX * 0.28;
          b.x -= sign * overlapX * 0.28;
        }
      }
    }

    function clampLayoutState(state) {
      state.w = clampLayoutNumber(state.w, 0.06, 0.82);
      state.h = clampLayoutNumber(state.h, 0.05, 0.74);
      state.x = clampLayoutNumber(state.x, state.w * 0.52 + 0.025, 0.975 - state.w * 0.52);
      state.y = clampLayoutNumber(state.y, state.h * 0.52 + 0.025, 0.975 - state.h * 0.52);
    }

    function layoutIdentityTokens(value = '') {
      const ignored = new Set(['artifact', 'body', 'entity', 'environment', 'medium', 'primitive', 'prompt', 'render', 'surface']);
      return uniqueList(String(value || '').toLowerCase().split(/[^a-z0-9]+/)
        .filter((token) => (token.length > 2 || /^\d+$/.test(token)) && !ignored.has(token))
        .map((token) => token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token));
    }

    function stableLayoutHash(value = '') {
      let hash = 2166136261;
      for (const character of String(value || '')) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    }

    function clampLayoutNumber(value, minimum, maximum) {
      return Math.max(minimum, Math.min(maximum, Number(value) || 0));
    }

    Object.assign(scope, {
      SPATIAL_CONSTRAINTS,
      constraintLayoutObjects,
      canonicalVisualObjects,
      visualObjectsShareConcept,
      layoutRelationsForSpec,
      layoutObjectForReference,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
