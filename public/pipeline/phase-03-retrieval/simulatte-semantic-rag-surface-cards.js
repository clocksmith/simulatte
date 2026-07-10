(function attachSimulatteSemanticRagsurfacecards(root) {
  const scope = root.__SimulatteSemanticRagRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function synthesizeEvents(prompt, nodes, eventCards) {
        const hints = uniqueList(eventCards.flatMap((match) => match.card.eventHints || []));
        const promptLower = String(prompt || '').toLowerCase();
        const events = [];
        if (hints.includes('collision') || /\b(crash|crashes|crashing|collision|collide|collides|impact|hit|smash)\b/.test(promptLower)) {
          const participants = collisionParticipants(nodes);
          if (participants.length >= 2) {
            events.push({
              id: 'event_collision_1',
              type: 'collision',
              participants: participants.slice(0, 2).map((node) => node.id),
              groundingIds: ['ground.collision-event'],
              physics: ['rigid-body', 'soft-body', 'collision', 'friction', 'energy-ledger'],
              score: 0.94,
            });
          }
        }
        if (hints.includes('flow') || /\b(flow|flowing|pour|stream|river|pipe)\b/.test(promptLower)) events.push(eventFor('flow', nodes, ['ground.fluid-domain']));
        if (hints.includes('heat_exchange') || /\b(heat|cool|melt|boil|freeze|thermal)\b/.test(promptLower)) events.push(eventFor('heat_exchange', nodes, ['ground.thermal-machine']));
        if (hints.includes('combustion') || /\b(fire|burn|flame|combust|ignite)\b/.test(promptLower)) events.push(eventFor('combustion', nodes, ['ground.combustion-event']));
        if (hints.includes('optics') || /\b(light|lens|laser|prism|reflect|refract|focus)\b/.test(promptLower)) events.push(eventFor('optics', nodes, ['ground.optical-element']));
        if (hints.includes('magnetic_force') || /\b(magnet|magnetic|electromagnet)\b/.test(promptLower)) events.push(eventFor('magnetic_force', nodes, ['ground.magnetic-source']));
        if (hints.includes('growth') || /\b(grow|growth|colony|spread)\b/.test(promptLower)) events.push(eventFor('growth', nodes, ['ground.biological-colony']));
        if (hints.includes('erosion') || /\b(erosion|erode|sediment|weathering)\b/.test(promptLower)) events.push(eventFor('erosion', nodes, ['ground.erosion-event']));
        return events.filter(Boolean);
      }

    function eventFor(type, nodes, groundingIds) {
        return {
          id: `event_${type}_1`,
          type,
          participants: nodes.slice(0, 4).map((node) => node.id),
          groundingIds,
          physics: [],
          score: 0.62,
        };
      }

    function groundSurfaceGraph(nodes, relations, events, primitiveIds, basisById) {
        const primitiveScores = new Map();
        const evidenceByPrimitive = new Map();
        const unresolved = [];
        const addPrimitive = (primitiveId, score, evidence) => {
          if (!primitiveIds.has(primitiveId)) {
            unresolved.push(`${evidence.id || evidence.source || 'grounding'} -> missing primitive ${primitiveId}`);
            return;
          }
          primitiveScores.set(primitiveId, Math.max(primitiveScores.get(primitiveId) || 0, score));
          const rows = evidenceByPrimitive.get(primitiveId) || [];
          rows.push(evidence);
          evidenceByPrimitive.set(primitiveId, rows);
        };
        const expand = (groundingIds, score, evidence) => {
          for (const id of groundingIds || []) {
            if (primitiveIds.has(id)) {
              addPrimitive(id, score, evidence);
              continue;
            }
            const basis = basisById.get(id);
            if (!basis) {
              unresolved.push(`${evidence.id || evidence.source || 'grounding'} -> missing basis ${id}`);
              continue;
            }
            for (const primitiveId of basis.primitives || []) addPrimitive(primitiveId, score, { ...evidence, basisId: basis.id });
          }
        };
        for (const node of nodes) expand(node.groundingIds, 0.72 + Math.min(0.18, node.score * 0.12), {
          id: node.id,
          cardId: node.cardId,
          source: 'surface-node',
          phrase: node.sourceSpan.text,
        });
        for (const relationRow of relations) expand(relationRow.groundingIds, 0.66, {
          id: relationRow.id,
          source: 'surface-relation',
          phrase: relationRow.type,
        });
        for (const eventRow of events) expand(eventRow.groundingIds, 0.78, {
          id: eventRow.id,
          source: 'surface-event',
          phrase: eventRow.type,
        });
        const groundedPrimitives = Array.from(primitiveScores.entries())
          .map(([primitiveId, score]) => ({
            primitiveId,
            score: Number(score.toFixed(4)),
            source: 'semantic-surface-grounding',
            evidence: (evidenceByPrimitive.get(primitiveId) || []).slice(0, 6),
          }))
          .sort((a, b) => b.score - a.score || a.primitiveId.localeCompare(b.primitiveId));
        const openComponents = nodes.map((node, index) => surfaceOpenComponent(node, index, relations, events, basisById));
        return { groundedPrimitives, openComponents, unresolved: uniqueList(unresolved).slice(0, 12) };
      }

    function surfaceOpenComponent(node, index, relations, events, basisById) {
        const phrase = node.sourceSpan.text || node.label;
        const visualRegime = visualRegimeForSurfaceNode(node);
        const assembly = assemblyForSurfaceNode(node);
        const material = node.materialHints[0] || materialForText(phrase, visualRegime);
        const basisIds = node.groundingIds.filter((id) => basisById.has(id));
        const basisParts = uniqueList(basisIds.flatMap((id) => (basisById.get(id).parts || []))).slice(0, 10);
        const id = `surface-${slug(node.id)}`;
        return {
          id,
          type: assembly,
          role: `generated ${node.type} ${node.label}: ${node.classHints.join(' ') || phrase}`,
          layer: 'component',
          domains: domainsForSurfaceNode(node, visualRegime),
          material,
          visualRegime,
          assembly,
          phrase,
          params: {
            ...paramsForVisual(visualRegime, assembly, index),
            semanticScale: scaleValue(node.scaleHints[0]),
            relationCount: relations.filter((relationRow) => relationRow.from === node.id || relationRow.to === node.id).length,
            eventCount: events.filter((eventRow) => (eventRow.participants || []).includes(node.id)).length,
          },
          controls: controlsForVisual(visualRegime, assembly),
          score: Number((0.66 + Math.min(0.18, node.score * 0.12)).toFixed(4)),
          source: 'semantic-surface-grounder',
          index: node.sourceSpan.index,
          cardId: node.cardId,
          grounding: {
            schema: 'simulatte.surfaceGrounding.v1',
            basisIds,
            parts: basisParts,
            slots: node.slots,
          },
          primitiveProgram: buildPrimitiveProgram({
            id,
            phrase,
            visualRegime,
            assembly,
            material,
            seed: index + node.sourceSpan.index,
          }),
        };
      }

    function mergeOpenComponents(primary, secondary, limit) {
        const out = [];
        const seen = new Set();
        for (const component of [...(primary || []), ...(secondary || [])]) {
          if (!component || !component.id || seen.has(component.id)) continue;
          seen.add(component.id);
          out.push(component);
          if (out.length >= limit) break;
        }
        return out.sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || Number(a.index || 0) - Number(b.index || 0));
      }

    function nearestContainer(entity, nodes) {
        const candidates = nodes.filter((node) => node.id !== entity.id && (
          node.affordanceHints.includes('contains') ||
          node.classHints.includes('container') ||
          node.classHints.includes('rotating_apparatus') ||
          node.groundingIds.includes('ground.containment')
        ));
        if (!candidates.length) return null;
        return candidates
          .map((node) => ({ node, distance: Math.abs((node.sourceSpan.index || 0) - (entity.sourceSpan.index || 0)) }))
          .sort((a, b) => a.distance - b.distance || a.node.id.localeCompare(b.node.id))[0].node;
      }

    function nearestPair(nodes) {
        if (nodes.length < 2) return null;
        const sorted = nodes.slice().sort((a, b) => a.sourceSpan.index - b.sourceSpan.index);
        return [sorted[0], sorted[1]];
      }

    function collisionParticipants(nodes) {
        const apparatus = nodes.filter((node) => (
          node.classHints.includes('rotating_apparatus') ||
          node.classHints.includes('wheeled_vehicle') ||
          node.groundingIds.includes('ground.rotating-apparatus')
        ));
        if (apparatus.length >= 2) return apparatus;
        const bodies = nodes.filter((node) => node.type === 'entity' || node.groundingIds.some((id) => /body|vehicle|apparatus/.test(id)));
        return bodies.length >= 2 ? bodies : nodes;
      }

    function uniqueRelations(relations) {
        const seen = new Set();
        return relations.filter((relationRow) => {
          const key = `${relationRow.type}:${relationRow.from}:${relationRow.to}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

    function visualRegimeForSurfaceNode(node) {
        const text = [
          node.label,
          node.classHints.join(' '),
          node.materialHints.join(' '),
          node.behaviorHints.join(' '),
          node.groundingIds.join(' '),
        ].join(' ');
        const visual = visualRegimeForText(text);
        if (visual !== 'generic') return visual;
        if (node.type === 'entity' && (node.classHints.includes('small_mammal') || node.classHints.includes('plant'))) return 'biological';
        if (node.classHints.some((item) => /vehicle|machine|apparatus|rotating/.test(item))) return 'magnetic';
        if (node.classHints.some((item) => /environment|terrain/.test(item))) return 'granular';
        return 'generic';
      }

    function assemblyForSurfaceNode(node) {
        if (node.type === 'environment') return 'field';
        if (node.type === 'event') return 'reaction';
        if (node.type === 'relation') return 'constraint';
        if (node.classHints.some((item) => /network|queue/.test(item))) return 'network';
        if (node.classHints.some((item) => /machine|vehicle|apparatus|wheel|rotating/.test(item))) return 'mechanism';
        if (node.classHints.some((item) => /fluid|vessel|channel/.test(item))) return 'flow';
        return 'material';
      }

    function domainsForSurfaceNode(node, visual) {
        return uniqueList([
          visual,
          node.type,
          ...node.classHints.map((item) => item.replace(/_/g, '-')),
          ...node.materialHints,
          ...node.behaviorHints.map((item) => item.replace(/_/g, '-')),
        ].filter(Boolean));
      }

    function domainsForCard(card) {
        return uniqueList([
          card.type,
          ...((card.classHints || []).map((item) => item.replace(/_/g, '-'))),
          ...((card.materialHints || []).map((item) => item.replace(/_/g, '-'))),
          ...((card.behaviorHints || []).map((item) => item.replace(/_/g, '-'))),
          ...((card.eventHints || []).map((item) => item.replace(/_/g, '-'))),
          ...((card.relationHints || []).map((item) => item.replace(/_/g, '-'))),
          ...((card.physics || []).map((item) => item.replace(/_/g, '-'))),
        ].filter(Boolean));
      }

    function cardCuration(id, type, labels = [], hints = {}) {
        const labelScores = (labels || []).map(labelSpecificity);
        const specificity = labelScores.length ? Math.max(...labelScores) : 0.35;
        const primarySpecificity = labels.length ? labelSpecificity(labels[0]) : specificity;
        const groundingDepth = uniqueList([
          ...(hints.classHints || []),
          ...(hints.shapeHints || []),
          ...(hints.partHints || []),
          ...(hints.materialHints || []),
          ...(hints.behaviorHints || []),
          ...(hints.affordanceHints || []),
          ...(hints.relationHints || []),
          ...(hints.eventHints || []),
          ...(hints.groundingIds || []),
        ]).length;
        const generic = primarySpecificity < 0.42 || /\b(class|system|thing|object|world|field)\b/.test(String(id || ''));
        const groundingScore = clamp(groundingDepth / 12, 0, 1);
        const typeWeight = type === 'relation' || type === 'event' ? 0.74 : type === 'environment' ? 0.8 : 0.88;
        const priority = clamp(specificity * 0.58 + groundingScore * 0.3 + typeWeight * 0.12 - (generic ? 0.14 : 0), 0, 1);
        return Object.freeze({
          schema: 'simulatte.semanticCardCuration.v1',
          specificity: Number(specificity.toFixed(4)),
          primarySpecificity: Number(primarySpecificity.toFixed(4)),
          groundingDepth,
          generic,
          priority: Number(priority.toFixed(4)),
        });
      }

    function labelSpecificity(label) {
        const value = String(label || '').toLowerCase().trim();
        if (!value) return 0;
        const genericLabels = new Set(['in', 'on', 'at', 'to', 'with', 'world', 'field', 'plant', 'plants', 'wheel', 'rim', 'cell', 'sun']);
        if (genericLabels.has(value)) return 0.16;
        const words = value.split(/\s+/).filter(Boolean);
        if (words.length >= 3) return 0.96;
        if (words.length === 2) return 0.82;
        if (value.length >= 9) return 0.74;
        if (value.length >= 5) return 0.58;
        if (value.length >= 3) return 0.52;
        return 0.28;
      }

    function promptTypeFit(prompt, type) {
        const lower = String(prompt || '').toLowerCase();
        if (type === 'event') return /\b(crash|collid|impact|flow|heat|cool|burn|grow|erod|wave|explode|spin|roll)\b/.test(lower) ? 1 : 0;
        if (type === 'relation') return /\b(inside|within|through|across|around|attached|connected|push|pull|drive|power)\b/.test(lower) ? 1 : 0;
        if (type === 'environment') return /\b(in|near|at|inside|environment|storm|forest|city|lab|desert|ocean|space|room|field)\b/.test(lower) ? 0.7 : 0;
        return 0.5;
      }

    function directLabelMatch(prompt, labels = []) {
        const lower = String(prompt || '').toLowerCase();
        let best = 0;
        for (const label of labels || []) {
          const normalized = String(label || '').toLowerCase().trim();
          if (!normalized) continue;
          if (labelOccurrences(lower, normalized).length) {
            best = Math.max(best, Math.min(1, 0.52 + labelSpecificity(normalized) * 0.38));
          }
        }
        return best;
      }

    function labelOccurrences(text, label) {
        const source = String(text || '').toLowerCase();
        const sourceTokens = tokensWithPositions(source);
        const labelTokens = tokensWithPositions(label).map((token) => token.root);
        if (!sourceTokens.length || !labelTokens.length) return [];
        const out = [];
        for (let i = 0; i <= sourceTokens.length - labelTokens.length; i += 1) {
          let ok = true;
          for (let j = 0; j < labelTokens.length; j += 1) {
            if (sourceTokens[i + j].root !== labelTokens[j]) {
              ok = false;
              break;
            }
          }
          if (!ok) continue;
          const start = sourceTokens[i].index;
          const end = sourceTokens[i + labelTokens.length - 1].end;
          out.push({ index: start, end, text: source.slice(start, end) });
        }
        return out;
      }

    function scaleValue(scale) {
        const values = { tiny: 0.18, small: 0.32, medium: 0.5, human: 0.58, large: 0.78 };
        return values[scale] || 0.5;
      }

    function escapeRegExp(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }

    function extractOpenComponents(prompt, retrieved, typedSpans = [], suppressObservableOpenComponents = false) {
        const tokens = tokensWithPositions(prompt);
        const phrases = [];
        for (let i = 0; i < tokens.length; i += 1) {
          for (let width = 3; width >= 1; width -= 1) {
            const span = tokens.slice(i, i + width);
            if (span.length !== width || span.some((token) => STOPS.has(token.root))) continue;
            const phrase = span.map((token) => token.value).join(' ');
            const range = { index: tokens[i].index, end: span[span.length - 1].end };
            if (!openPhraseAlignsWithTypedSpans(range, typedSpans, suppressObservableOpenComponents)) continue;
            const classified = classifyOpenPhrase(phrase, retrieved);
            if (!classified) continue;
            phrases.push({ phrase, index: tokens[i].index, ...classified });
            i += width - 1;
            break;
          }
        }
        const seen = new Set();
        return phrases
          .filter((item) => {
            const key = `${item.assembly}:${item.phrase}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map((item, index) => openComponent(item, index))
          .sort((a, b) => b.score - a.score || a.index - b.index);
      }

    function openPhraseAlignsWithTypedSpans(range, typedSpans = [], suppressObservableOpenComponents = false) {
        const overlaps = (typedSpans || []).filter((span) => (
          Number.isFinite(span.start) &&
          Number.isFinite(span.end) &&
          range.index < span.end &&
          range.end > span.start
        ));
        if (!overlaps.length) return true;
        if (overlaps[0].kind === 'modifier') return false;
        if (overlaps[0].kind === 'observable' && suppressObservableOpenComponents) return false;
        return overlaps.length === 1;
      }

    function classifyOpenPhrase(phrase, retrieved) {
        const roots = tokens(phrase);
        if (!roots.length) return null;
        const visual = visualRegimeForText(phrase);
        const assembly = assemblyForText(phrase);
        const domainBoost = retrieved.some((doc) => (doc.domains || []).includes(visual));
        const head = roots[roots.length - 1];
        if (!domainBoost && assembly === 'sample' && roots.length < 2 && !knownPhysicalToken(head)) return null;
        return {
          assembly,
          visualRegime: visual,
          domains: domainsForVisual(visual, phrase),
          material: materialForText(phrase, visual),
          layer: layerForAssembly(assembly, visual),
          score: Number((0.48 + Math.min(0.28, roots.length * 0.07) + (domainBoost ? 0.12 : 0)).toFixed(4)),
        };
      }

    function openComponent(item, index) {
        const id = `open-${slug(item.phrase)}-${index + 1}`;
        const controls = controlsForVisual(item.visualRegime, item.assembly);
        return {
          id,
          type: item.assembly,
          role: `prompt-derived ${item.visualRegime} primitive: ${item.phrase}`,
          layer: item.layer,
          domains: item.domains,
          material: item.material,
          visualRegime: item.visualRegime,
          assembly: item.assembly,
          phrase: item.phrase,
          params: paramsForVisual(item.visualRegime, item.assembly, index),
          controls,
          score: item.score,
          source: 'open-semantic-rag',
          index: item.index,
          primitiveProgram: buildPrimitiveProgram({
            id,
            phrase: item.phrase,
            visualRegime: item.visualRegime,
            assembly: item.assembly,
            material: item.material,
            seed: index + item.index,
          }),
        };
      }

    function buildPrimitiveProgram(input) {
        const seed = hashString(`${input.assembly}:${input.phrase}:${input.seed || 0}`);
        const visual = input.visualRegime || visualRegimeForText(input.phrase);
        const parts = programPartsForVisual(visual, input.assembly, seed);
        return {
          schema: 'simulatte.primitiveProgram.v1',
          source: 'grid-style-open-semantic-program',
          shapeKey: `sp_${seed.toString(16).padStart(8, '0')}`,
          phrase: input.phrase,
          assembly: input.assembly,
          visualRegime: visual,
          material: input.material || materialForText(input.phrase, visual),
          parts,
          provenance: {
            promptPhrase: input.phrase,
            tokenHash: seed >>> 0,
          },
        };
      }

    function programPartsForVisual(visual, assembly, seed) {
        const wobble = (seed % 5) * 0.03;
        const common = [{ kind: 'field-line', count: 4 + (seed % 5), alpha: 0.08 + wobble }];
        if (visual === 'fluid') return [
          { kind: 'stream', count: 8, alpha: 0.14, drift: 0.42 },
          { kind: 'droplet', count: 32, alpha: 0.12, drift: 0.58 },
          { kind: 'ripple', count: 7, alpha: 0.1 },
        ];
        if (visual === 'thermal') return [
          { kind: 'plume', count: 14, alpha: 0.13, drift: 0.74 },
          { kind: 'spark', count: 28, alpha: 0.18, drift: 0.8 },
          { kind: 'field-line', count: 5, alpha: 0.06 },
        ];
        if (visual === 'optical') return [
          { kind: 'spectral-ray', count: 9, alpha: 0.22, drift: 0.2 },
          { kind: 'caustic', count: 8, alpha: 0.12 },
          { kind: 'particle', count: 18, alpha: 0.09 },
        ];
        if (visual === 'magnetic') return [
          { kind: 'flux-loop', count: 12, alpha: 0.12 },
          { kind: 'ring', count: assembly === 'mechanism' ? 8 : 5, alpha: 0.1 },
          { kind: 'particle', count: 20, alpha: 0.1 },
        ];
        if (visual === 'electrical') return [
          { kind: 'arc', count: 10, alpha: 0.15 },
          { kind: 'pulse', count: 16, alpha: 0.13 },
          { kind: 'spectral-ray', count: 5, alpha: 0.1 },
        ];
        if (visual === 'biological') return [
          { kind: 'branch', count: 11, alpha: 0.14, drift: 0.22 },
          { kind: 'cell', count: 24, alpha: 0.1 },
          { kind: 'membrane', count: 5, alpha: 0.08 },
        ];
        if (visual === 'soft') return [
          { kind: 'membrane', count: 10, alpha: 0.13 },
          { kind: 'ripple', count: 8, alpha: 0.09 },
          { kind: 'droplet', count: 18, alpha: 0.07 },
        ];
        if (visual === 'granular') return [
          { kind: 'strata', count: 9, alpha: 0.12 },
          { kind: 'grain', count: 42, alpha: 0.1 },
          { kind: 'stream', count: 4, alpha: 0.06 },
        ];
        if (visual === 'atomic') return [
          { kind: 'orbital', count: 8, alpha: 0.14 },
          { kind: 'lattice', count: 28, alpha: 0.1 },
          { kind: 'particle', count: 20, alpha: 0.1 },
        ];
        if (visual === 'acoustic') return [
          { kind: 'wavefront', count: 12, alpha: 0.11 },
          { kind: 'ripple', count: 8, alpha: 0.09 },
          { kind: 'pulse', count: 10, alpha: 0.08 },
        ];
        if (visual === 'phase') return [
          { kind: 'phase-band', count: 9, alpha: 0.12 },
          { kind: 'droplet', count: 16, alpha: 0.08 },
          { kind: 'membrane', count: 5, alpha: 0.08 },
        ];
        if (visual === 'network') return [
          { kind: 'network-thread', count: 12, alpha: 0.12 },
          { kind: 'pulse', count: 18, alpha: 0.1 },
          { kind: 'particle', count: 14, alpha: 0.08 },
        ];
        return common.concat([{ kind: 'particle', count: 18, alpha: 0.08 }]);
      }

    function buildSemanticFeatureVector(text, dim = FEATURE_DIM) {
        const out = new Float32Array(dim);
        const roots = tokens(text);
        for (const token of roots) {
          addFeature(out, `w:${token}`, 1);
          addCharNgrams(out, token);
        }
        for (let i = 0; i < roots.length - 1; i += 1) {
          addFeature(out, `b:${roots[i]}_${roots[i + 1]}`, 1.35);
        }
        return normalizeDense(out);
      }

    function tokens(text) {
        const out = [];
        const lower = String(text || '').toLowerCase();
        let match;
        while ((match = TOKEN_RE.exec(lower))) {
          const token = normalizeToken(match[0]);
          if (!token || STOPS.has(token)) continue;
          out.push(token);
          const syn = TOKEN_SYNONYMS && TOKEN_SYNONYMS[token];
          if (Array.isArray(syn)) for (const item of syn) out.push(normalizeToken(item));
        }
        return uniqueList(out);
      }

    function tokensWithPositions(text) {
        const out = [];
        const lower = String(text || '').toLowerCase();
        let match;
        while ((match = TOKEN_RE.exec(lower))) {
          const value = match[0].replace(/'/g, '');
          const root = normalizeToken(value);
          if (!root) continue;
          out.push({ value, root, index: match.index, end: match.index + match[0].length });
        }
        return out;
      }

    function visualRegimeForText(text) {
        const roots = new Set(tokens(text));
        for (const item of VISUAL_RULES) {
          if ([...roots].some((token) => item.words.has(token))) return item.id;
        }
        return 'generic';
      }

    function assemblyForText(text) {
        const roots = new Set(tokens(text));
        for (const item of ASSEMBLY_RULES) {
          if ([...roots].some((token) => item.words.has(token) || token.endsWith(item.id))) return item.id;
        }
        return 'sample';
      }

    function materialForText(text, visual) {
        const lower = String(text || '').toLowerCase();
        const pairs = [
          ['brine', /brine/], ['mercury', /mercury/], ['copper', /copper/],
          ['silicon', /silicon/], ['carbon', /carbon|graphite/], ['gel', /gel/],
          ['foam', /foam|bubble/], ['membrane', /membrane/], ['glass', /glass|lens|prism/],
          ['water', /water|river|flow|droplet/], ['fire', /fire|flame|combust|plasma|heat/],
          ['magnet', /magnet|flux/], ['metal', /metal|wheel|rotor|motor/],
          ['sand', /sand|grain|sediment/], ['soil', /soil|terrain/], ['rock', /rock|crystal/],
          ['wood', /wood|biomass/], ['bacteria', /bacteria|cell|colony/], ['mycelium', /mycelium|fungal/],
        ];
        for (const [material, pattern] of pairs) if (pattern.test(lower)) return material;
        const defaults = {
          fluid: 'water',
          thermal: 'fire',
          optical: 'glass',
          magnetic: 'magnet',
          electrical: 'copper',
          granular: 'sand',
          biological: 'bacteria',
          soft: 'membrane',
          atomic: 'carbon',
        };
        return defaults[visual] || 'light';
      }

    function domainsForVisual(visual, text) {
        const domains = [visual];
        const lower = String(text || '').toLowerCase();
        if (/heat|sun|thermal|fire/.test(lower)) domains.push('thermal');
        if (/water|flow|river|fluid/.test(lower)) domains.push('fluid');
        if (/magnet|motor|wheel|rotor/.test(lower)) domains.push('mechanics', 'electromagnetism');
        if (/lens|light|prism|glass/.test(lower)) domains.push('optics');
        if (/cell|bacteria|growth|fungal/.test(lower)) domains.push('biology');
        if (/logistics|supply|warehouse|transport/.test(lower)) domains.push('logistics');
        if (/market|demand|queue|backlog|traffic/.test(lower)) domains.push('queue', 'operations');
        if (/sensor|feedback|control|controller/.test(lower)) domains.push('control', 'signal');
        if (/data|audit|trace|ledger/.test(lower)) domains.push('data', 'audit');
        return uniqueList(domains.filter(Boolean));
      }

    function layerForAssembly(assembly, visual) {
        if (assembly === 'material' || ['soft', 'granular', 'atomic'].includes(visual)) return 'material';
        if (assembly === 'field' || ['magnetic', 'electrical', 'acoustic'].includes(visual)) return 'physics';
        if (assembly === 'network') return 'math';
        return 'component';
      }

    function controlsForVisual(visual, assembly) {
        const controls = {
          fluid: ['flowRate', 'viscosity', 'pressure'],
          thermal: ['heatTransfer', 'combustibility', 'thermalFlux'],
          optical: ['lightIntensity', 'refractiveIndex', 'opacity'],
          magnetic: ['magneticStrength', 'fieldStrength', 'driveTiming'],
          electrical: ['electricField', 'charge', 'conductivity'],
          granular: ['granularFriction', 'terrainSlope', 'erosionRate'],
          biological: ['populationGrowth', 'infectionRate', 'diffusionA'],
          soft: ['membraneTension', 'pressure', 'damping'],
          acoustic: ['soundFrequency', 'waveAmplitude', 'pressure'],
          phase: ['phaseThreshold', 'latentHeat', 'heatTransfer'],
          atomic: ['atomicMass', 'bondStrength', 'ionization'],
          network: ['queueBacklog', 'serviceRate', 'networkLatency'],
        };
        return uniqueList([...(controls[visual] || []), ...(assembly === 'source' ? ['energyInput'] : [])]);
      }

    function paramsForVisual(visual, assembly, index) {
        const n = hashNoise(index + 31, String(visual).length + String(assembly).length);
        const base = { complexity: 0.42 + n * 0.22 };
        if (visual === 'fluid') return { ...base, flowRate: 0.36 + n * 0.48, viscosity: 0.08 + n * 0.3 };
        if (visual === 'thermal') return { ...base, heatTransfer: 0.42 + n * 0.44, combustibility: 0.34 + n * 0.5 };
        if (visual === 'optical') return { ...base, lightIntensity: 0.52 + n * 0.42, refractiveIndex: 1.18 + n * 0.58 };
        if (visual === 'magnetic') return { ...base, magneticStrength: 0.46 + n * 0.62, fieldStrength: 0.38 + n * 0.44 };
        if (visual === 'electrical') return { ...base, charge: -0.4 + n * 0.9, electricField: 0.32 + n * 0.52 };
        if (visual === 'granular') return { ...base, granularFriction: 0.28 + n * 0.5, erosionRate: 0.18 + n * 0.44 };
        if (visual === 'biological') return { ...base, populationGrowth: 0.24 + n * 0.56, infectionRate: 0.08 + n * 0.42 };
        if (visual === 'soft') return { ...base, membraneTension: 0.28 + n * 0.64, pressure: 0.22 + n * 0.52 };
        if (visual === 'acoustic') return { ...base, soundFrequency: 0.16 + n * 0.9, waveAmplitude: 0.16 + n * 0.68 };
        if (visual === 'phase') return { ...base, phaseThreshold: 0.28 + n * 0.54, latentHeat: 0.22 + n * 0.56 };
        if (visual === 'atomic') return { ...base, atomicMass: 8 + Math.round(n * 80), bondStrength: 0.26 + n * 0.62 };
        return base;
      }

    function dominantDomains(retrieved, openComponents) {
        const totals = new Map();
        for (const doc of retrieved || []) for (const domain of doc.domains || []) {
          totals.set(domain, (totals.get(domain) || 0) + doc.score);
        }
        for (const component of openComponents || []) for (const domain of component.domains || []) {
          totals.set(domain, (totals.get(domain) || 0) + component.score);
        }
        return Array.from(totals.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([id, score]) => ({ id, score: Number(score.toFixed(4)) }))
          .slice(0, 18);
      }

    function matchedTerms(a, b) {
        const bTokens = new Set(tokens(b));
        return tokens(a).filter((token) => bTokens.has(token));
      }

    function lexicalOverlap(a, b) {
        const query = tokens(a);
        if (!query.length) return 0;
        const doc = new Set(tokens(b));
        return query.filter((token) => doc.has(token)).length / query.length;
      }

    function knownPhysicalToken(token) {
        return VISUAL_RULES.some((item) => item.words.has(token)) || ASSEMBLY_RULES.some((item) => item.words.has(token));
      }

    function addFeature(out, feature, value = 1) {
        const hash = hashString(feature);
        const sign = hash & 0x80000000 ? -1 : 1;
        out[hash % out.length] += value * sign;
      }

    function addCharNgrams(out, token) {
        const padded = `^${token}$`;
        for (let n = 3; n <= 4; n += 1) {
          if (padded.length < n) continue;
          for (let i = 0; i <= padded.length - n; i += 1) {
            addFeature(out, `c${n}:${padded.slice(i, i + n)}`, 0.42);
          }
        }
      }

    function normalizeDense(out) {
        let norm = 0;
        for (let i = 0; i < out.length; i += 1) norm += out[i] * out[i];
        norm = Math.sqrt(norm) || 1;
        for (let i = 0; i < out.length; i += 1) out[i] /= norm;
        return out;
      }

    function cosineDense(a, b) {
        let score = 0;
        for (let i = 0; i < Math.min(a.length, b.length); i += 1) score += a[i] * b[i];
        return Math.max(0, score);
      }

    function normalizeToken(token) {
        let out = String(token || '').toLowerCase().replace(/'/g, '').replace(/[^a-z0-9-]/g, '');
        if (out.endsWith('ies') && out.length > 4) out = `${out.slice(0, -3)}y`;
        else if (/(ches|shes|xes|zes|sses)$/.test(out) && out.length > 5) out = out.slice(0, -2);
        else if (out.endsWith('s') && out.length > 3 && !/(ss|us|is)$/.test(out)) out = out.slice(0, -1);
        if (out === 'mountaint' || out === 'moutnain') out = 'mountain';
        return out;
      }

    function hashString(str) {
        let h = 2166136261;
        for (let i = 0; i < String(str).length; i += 1) {
          h ^= String(str).charCodeAt(i);
          h = Math.imul(h, 16777619);
        }
        return h >>> 0;
      }

    function slug(value) {
        return String(value || 'primitive')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 48) || 'primitive';
      }

    Object.assign(scope, {
      synthesizeEvents,
      eventFor,
      groundSurfaceGraph,
      surfaceOpenComponent,
      mergeOpenComponents,
      nearestContainer,
      nearestPair,
      collisionParticipants,
      uniqueRelations,
      visualRegimeForSurfaceNode,
      assemblyForSurfaceNode,
      domainsForSurfaceNode,
      domainsForCard,
      cardCuration,
      labelSpecificity,
      promptTypeFit,
      directLabelMatch,
      labelOccurrences,
      scaleValue,
      escapeRegExp,
      extractOpenComponents,
      classifyOpenPhrase,
      openComponent,
      buildPrimitiveProgram,
      programPartsForVisual,
      buildSemanticFeatureVector,
      tokens,
      tokensWithPositions,
      visualRegimeForText,
      assemblyForText,
      materialForText,
      domainsForVisual,
      layerForAssembly,
      controlsForVisual,
      paramsForVisual,
      dominantDomains,
      matchedTerms,
      lexicalOverlap,
      knownPhysicalToken,
      addFeature,
      addCharNgrams,
      normalizeDense,
      cosineDense,
      normalizeToken,
      hashString,
      slug,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
