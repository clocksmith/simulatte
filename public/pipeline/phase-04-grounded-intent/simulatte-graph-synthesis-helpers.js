(function attachSimulatteGraphSynthesishelpers(root) {
  const scope = root.__SimulatteGraphSynthesisRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function synthesizeWorldIntent(promptText = '', context = {}, catalog = {}) {
        const prompt = String(promptText || '').trim();
        const spans = extractSpans(prompt);
        const retrieval = retrieveSurfaceCards(prompt, spans, context);
        const nodes = buildNodes(prompt, retrieval);
        const relations = buildRelations(prompt, nodes, retrieval);
        const events = buildEvents(prompt, nodes, retrieval);
        const readouts = buildReadouts(retrieval);
        const environment = buildEnvironment(retrieval);
        const worldIntent = {
          schema: WORLD_INTENT_SCHEMA,
          entities: nodes.filter((node) => node.nodeType === 'entity'),
          assemblies: nodes.filter((node) => node.nodeType === 'assembly'),
          environment,
          relations,
          events,
          readouts,
        };
        const synthGraph = {
          schema: SYNTH_GRAPH_SCHEMA,
          prompt,
          nodes,
          relations,
          events,
          environment,
          readouts,
        };
        const groundedGraph = groundSynthGraph(synthGraph, retrieval, catalog);
        const validation = validateGroundedGraph(synthGraph, groundedGraph, catalog);
        return {
          schema: SYNTHESIS_SCHEMA,
          model: {
            id: SYNTH_MODEL_ID,
            retriever: context.embeddingModel && context.embeddingModel.id
              ? context.embeddingModel.id
              : 'model-backed-surface-card-retriever',
            planner: 'deterministic-typed-card-graph-search',
            grounder: 'simulatte-card-expansion-grounder.v1',
          },
          prompt,
          spans,
          retrieval,
          worldIntent,
          synthGraph,
          groundedGraph,
          validation,
        };
      }

    function groundedPrimitiveRows(synthesis, catalog = {}) {
        const ids = synthesis && synthesis.groundedGraph && synthesis.groundedGraph.primitiveIds || [];
        const primitiveById = typeof catalog.primitiveById === 'function' ? catalog.primitiveById : () => null;
        const rows = ids
          .map((entry) => {
            const id = typeof entry === 'string' ? entry : entry.id;
            const primitive = primitiveById(id);
            if (!primitive) return null;
            return {
              ...primitive,
              score: Number((entry.score || 0.72).toFixed ? entry.score.toFixed(4) : entry.score || 0.72),
              source: 'embedding-guided-graph-synthesis',
              phrase: entry.reason || 'grounded from surface card synthesis',
            };
          })
          .filter(Boolean);
        if (typeof catalog.withPrimitiveDependencies === 'function') {
          return catalog.withPrimitiveDependencies(rows, synthesis.prompt || '');
        }
        return rows;
      }

    function createSurfaceCardDocuments(cards = SURFACE_CARD_LIBRARY) {
        return cards.map((item, order) => ({
          cardId: item.id,
          type: item.type,
          order,
          labels: item.labels.slice(),
          text: cardText(item),
          grounding: item.grounding,
        }));
      }

    function retrieveSurfaceCards(prompt, spans, context) {
        const embeddingMatches = new Map();
        const semanticMatches = context.semanticRag && Array.isArray(context.semanticRag.surfaceRetrieved)
          ? context.semanticRag.surfaceRetrieved
          : [];
        for (const match of [
          ...(context.cardMatches || []),
          ...(context.surfaceCardMatches || []),
          ...semanticMatches,
        ]) {
          const cardId = normalizeIncomingCardId(match.cardId || match.id || '');
          if (!cardId) continue;
          const existing = embeddingMatches.get(cardId);
          const score = clamp01(Number(match.score || match.modelScore || match.semanticScore || 0));
          if (!existing || score > existing.score) {
            embeddingMatches.set(cardId, { ...match, cardId, score });
          }
        }
        const spanMatches = spans.map((span) => {
          const expectedType = expectedTypeForSpan(span.text);
          const matches = SURFACE_CARD_LIBRARY
            .map((item) => {
              const lexicalScore = scoreCardForSpan(span.text, item);
              const embedded = embeddingMatches.get(item.id);
              const typeBoost = expectedType && typeFits(item.type, expectedType) ? 0.1 : 0;
              const score = Math.max(lexicalScore, embedded ? embedded.score * 0.94 : 0) + typeBoost;
              if (score <= 0.12) return null;
              return {
                cardId: item.id,
                type: item.type,
                labels: item.labels.slice(0, 4),
                span: span.text,
                score: Number(clamp01(score).toFixed(4)),
                lexicalScore: Number(lexicalScore.toFixed(4)),
                embeddingScore: embedded ? Number(embedded.score.toFixed(4)) : 0,
                source: embedded ? 'embedding+surface-card' : 'surface-card',
                grounding: item.grounding,
              };
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score || a.cardId.localeCompare(b.cardId))
            .slice(0, 8);
          return { span: span.text, kind: span.kind, start: span.start, matches };
        }).filter((row) => row.matches.length);

        const selected = [];
        const selectedIds = new Set();
        for (const row of spanMatches) {
          for (const match of row.matches.slice(0, 3)) {
            if (selectedIds.has(match.cardId)) continue;
            if (match.score < 0.42 && match.lexicalScore < 0.5 && match.embeddingScore < 0.46) continue;
            selectedIds.add(match.cardId);
            selected.push(match);
          }
        }
        for (const embedded of Array.from(embeddingMatches.values()).sort((a, b) => b.score - a.score)) {
          if (selectedIds.has(embedded.cardId) || embedded.score < 0.5) continue;
          const item = cardById(embedded.cardId);
          if (!item) continue;
          selectedIds.add(item.id);
          selected.push({
            cardId: item.id,
            type: item.type,
            labels: item.labels.slice(0, 4),
            span: 'whole prompt',
            score: Number(embedded.score.toFixed(4)),
            lexicalScore: 0,
            embeddingScore: Number(embedded.score.toFixed(4)),
            source: 'embedding-surface-card',
            grounding: item.grounding,
          });
        }

        const selectedFiltered = selected
          .sort((a, b) => b.score - a.score || a.cardId.localeCompare(b.cardId))
          .filter((match) => !isCoveredSelectedMatch(prompt, match));

        return {
          schema: 'simulatte.surfaceCardRetrieval.v1',
          spans: spanMatches,
          selected: selectedFiltered.slice(0, 32),
        };
      }

    function buildNodes(prompt, retrieval) {
        const selected = retrieval.selected || [];
        const nodeCards = selected
          .map((match) => ({ match, card: cardById(match.cardId) }))
          .filter((row) => row.card && ['entity', 'entity_class', 'assembly', 'assembly_class', 'material'].includes(row.card.type));
        const hasSpecificEntity = nodeCards.some((row) => row.card.type === 'entity');
        const hasSpecificAssembly = nodeCards.some((row) => row.card.type === 'assembly');
        const observedNodeTypes = new Set(nodeCards
          .filter((row) => occurrencesForCard(prompt, row.card).length)
          .map((row) => nodeTypeForCard(row.card)));
        const embeddingOnlyUsed = { entity: 0, assembly: 0 };
        const nodes = [];
        for (const { match, card: item } of nodeCards) {
          if (item.grounding.abstract && item.type === 'entity_class' && hasSpecificEntity) continue;
          if (item.grounding.abstract && item.type === 'assembly_class' && hasSpecificAssembly) continue;
          const occurrences = occurrencesForCard(prompt, item);
          const nodeType = nodeTypeForCard(item);
          if (!occurrences.length) {
            if (!shouldUseEmbeddingOnlyNode(match, nodeType, observedNodeTypes, embeddingOnlyUsed)) continue;
            embeddingOnlyUsed[nodeType] += 1;
          }
          const count = Math.max(occurrences.length, shouldDuplicateFromPrompt(prompt, item) ? 2 : 1);
          for (let i = 0; i < count; i += 1) {
            const suffix = count > 1 ? String.fromCharCode(97 + i) : 'a';
            nodes.push({
              id: `${item.id}_${suffix}`,
              cardId: item.id,
              label: item.labels[0],
              nodeType,
              class: first(item.grounding.classes) || item.id,
              morphology: {
                shapes: array(item.grounding.shapes),
                parts: array(item.grounding.parts),
                scale: scaleForCard(item),
              },
              materials: array(item.grounding.materials),
              behaviors: array(item.grounding.behaviors),
              constraints: array(item.grounding.constraints),
              ports: array(item.grounding.ports),
              positionHint: occurrences[i] !== undefined ? occurrences[i] : prompt.length + nodes.length,
              match: {
                span: match.span,
                score: match.score,
                source: match.source,
              },
            });
          }
        }
        return nodes.sort((a, b) => a.positionHint - b.positionHint || a.id.localeCompare(b.id));
      }

    function nodeTypeForCard(item) {
        return item && String(item.type || '').includes('assembly') ? 'assembly' : 'entity';
      }

    function shouldUseEmbeddingOnlyNode(match, nodeType, observedNodeTypes, embeddingOnlyUsed) {
        if (!(match.embeddingScore >= 0.78 && String(match.source || '').includes('embedding'))) return false;
        if (observedNodeTypes.has(nodeType)) return false;
        return (embeddingOnlyUsed[nodeType] || 0) < 1;
      }

    function buildRelations(prompt, nodes, retrieval) {
        const relations = [];
        const handledCardIds = new Set();
        if (/\b(in|inside|within|contains|containment)\b/i.test(prompt)) {
          const entities = nodes.filter((node) => node.nodeType === 'entity');
          const assemblies = nodes.filter((node) => node.nodeType === 'assembly');
          for (let i = 0; i < Math.min(entities.length, assemblies.length); i += 1) {
            relations.push({
              id: `containment_${i + 1}`,
              type: 'inside',
              participants: [entities[i].id, assemblies[i].id],
              cardId: 'containment',
              physics: ['surface-boundary', 'collision', 'constraint'],
            });
          }
          handledCardIds.add('containment');
          handledCardIds.add('inside');
        }
        for (const match of retrieval.selected || []) {
          if (match.cardId !== 'attached_to' && match.cardId !== 'through' && match.cardId !== 'pushes') continue;
          const item = cardById(match.cardId);
          if (!item) continue;
          handledCardIds.add(item.id);
          relations.push({
            id: `${item.id}_${relations.length + 1}`,
            type: item.id,
            participants: nodes.slice(0, 2).map((node) => node.id),
            cardId: item.id,
            physics: array(item.grounding.primitiveIds),
          });
        }
        for (const match of retrieval.selected || []) {
          if (handledCardIds.has(match.cardId)) continue;
          if (match.type !== 'relation') continue;
          const item = cardById(match.cardId);
          if (!item) continue;
          relations.push({
            id: `${item.id}_${relations.length + 1}`,
            type: item.id,
            participants: nodes.slice(0, 2).map((node) => node.id),
            cardId: item.id,
            physics: array(item.grounding.primitiveIds),
          });
          handledCardIds.add(item.id);
        }
        return uniqueRelations(relations);
      }

    function uniqueRelations(relations) {
        const seen = new Set();
        return (relations || []).filter((relation) => {
          const key = `${relation.type}:${(relation.participants || []).join('>')}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

    function buildEvents(prompt, nodes, retrieval) {
        const events = [];
        const handledCardIds = new Set();
        const wantsCollision = /\b(crash(?:es|ing|ed)?|collision|collid(?:e|es|ing|ed)|impact(?:s|ing|ed)?|hits?|hitting|smash(?:es|ing|ed)?)\b/i.test(prompt)
          || retrieval.selected.some((match) => match.cardId === 'collision_event' || (
            match.cardId === 'collision' && match.type === 'event'
          ));
        if (wantsCollision) {
          const assemblies = nodes.filter((node) => node.nodeType === 'assembly');
          const participants = assemblies.length >= 2 ? assemblies : nodes;
          events.push({
            id: 'collision_1',
            type: 'collision',
            cardId: 'collision_event',
            participants: participants.slice(0, 2).map((node) => node.id),
            physics: ['rigid-body', 'collision', 'friction', 'impulse_response', 'damping'],
          });
          handledCardIds.add('collision_event');
          handledCardIds.add('collision');
        }
        for (const match of retrieval.selected || []) {
          if (!['falling_event', 'break_event', 'flow_event', 'heat_event'].includes(match.cardId)) continue;
          const item = cardById(match.cardId);
          if (!item) continue;
          handledCardIds.add(item.id);
          events.push({
            id: `${item.id}_${events.length + 1}`,
            type: item.id.replace(/_event$/, ''),
            cardId: item.id,
            participants: nodes.slice(0, 2).map((node) => node.id),
            physics: array(item.grounding.primitiveIds),
          });
        }
        for (const match of retrieval.selected || []) {
          if (handledCardIds.has(match.cardId)) continue;
          if (match.type !== 'event') continue;
          const item = cardById(match.cardId);
          if (!item) continue;
          events.push({
            id: `${item.id}_${events.length + 1}`,
            type: item.id,
            cardId: item.id,
            participants: nodes.slice(0, 2).map((node) => node.id),
            physics: array(item.grounding.primitiveIds),
          });
          handledCardIds.add(item.id);
        }
        return events;
      }

    function buildReadouts(retrieval) {
        return (retrieval.selected || [])
          .filter((match) => match.type === 'readout')
          .map((match) => ({ id: match.cardId, label: first(match.labels), source: match.source }));
      }

    function buildEnvironment(retrieval) {
        return (retrieval.selected || [])
          .filter((match) => match.type === 'environment')
          .map((match) => ({ id: match.cardId, label: first(match.labels), source: match.source }));
      }

    function groundSynthGraph(synthGraph, retrieval, catalog) {
        const primitiveScores = new Map();
        const components = [];
        const primitiveExists = typeof catalog.primitiveById === 'function'
          ? (id) => Boolean(catalog.primitiveById(id))
          : () => true;
        const addPrimitive = (id, score, reason) => {
          if (!id) return;
          if (!primitiveExists(id)) return;
          const existing = primitiveScores.get(id);
          if (!existing || score > existing.score) {
            primitiveScores.set(id, { id, score: clamp01(score), reason });
          }
        };
        for (const node of synthGraph.nodes) {
          const item = cardById(node.cardId);
          if (!item) continue;
          const score = node.match && node.match.score || 0.68;
          for (const id of item.grounding.primitiveIds || []) addPrimitive(id, score, node.label);
          components.push({
            nodeId: node.id,
            cardId: item.id,
            label: node.label,
            parts: array(item.grounding.parts),
            shapes: array(item.grounding.shapes),
            materials: array(item.grounding.materials),
            behaviors: array(item.grounding.behaviors),
            constraints: array(item.grounding.constraints),
            ports: array(item.grounding.ports),
          });
        }
        for (const relation of synthGraph.relations) {
          const item = cardById(relation.cardId);
          for (const id of item && item.grounding.primitiveIds || relation.physics || []) {
            addPrimitive(id, 0.74, relation.type);
          }
        }
        for (const event of synthGraph.events) {
          const item = cardById(event.cardId);
          for (const id of item && item.grounding.primitiveIds || event.physics || []) {
            addPrimitive(id, 0.82, event.type);
          }
        }
        for (const env of synthGraph.environment) {
          const item = cardById(env.id);
          for (const id of item && item.grounding.primitiveIds || []) addPrimitive(id, 0.58, env.label);
        }
        for (const readout of synthGraph.readouts) {
          const item = cardById(readout.id);
          for (const id of item && item.grounding.primitiveIds || []) addPrimitive(id, 0.62, readout.label);
        }
        return {
          schema: GROUNDED_GRAPH_SCHEMA,
          primitiveIds: Array.from(primitiveScores.values())
            .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)),
          components,
          relations: synthGraph.relations,
          events: synthGraph.events,
          retrievalTop: (retrieval.selected || []).slice(0, 12).map((match) => ({
            cardId: match.cardId,
            type: match.type,
            score: match.score,
            source: match.source,
          })),
        };
      }

    function validateGroundedGraph(synthGraph, groundedGraph, catalog = {}) {
        const nodeIds = new Set((synthGraph.nodes || []).map((node) => node.id));
        const errors = [];
        const warnings = [];
        const repairs = [];
        if (!synthGraph.nodes.length) errors.push('no typed nodes synthesized');
        if (!groundedGraph.primitiveIds.length) errors.push('no grounded primitives emitted');
        for (const relation of synthGraph.relations || []) {
          for (const participant of relation.participants || []) {
            if (!nodeIds.has(participant)) errors.push(`relation ${relation.id} references missing ${participant}`);
          }
        }
        for (const event of synthGraph.events || []) {
          for (const participant of event.participants || []) {
            if (!nodeIds.has(participant)) errors.push(`event ${event.id} references missing ${participant}`);
          }
        }
        const primitiveById = typeof catalog.primitiveById === 'function' ? catalog.primitiveById : null;
        if (primitiveById) {
          for (const entry of groundedGraph.primitiveIds) {
            if (!primitiveById(entry.id)) errors.push(`missing primitive ${entry.id}`);
          }
        }
        for (const component of groundedGraph.components || []) {
          const item = cardById(component.cardId);
          if (item && item.grounding.approximation) {
            warnings.push(`${item.id} grounded as ${item.grounding.approximation} variant`);
          }
          if (component.ports.includes('body_collision') && !hasPrimitive(groundedGraph, 'collision')) {
            repairs.push(`added default collision shell for ${component.nodeId}`);
          }
        }
        if ((synthGraph.events || []).some((event) => event.type === 'collision') && !hasPrimitive(groundedGraph, 'energy-ledger')) {
          repairs.push('added energy ledger for collision event');
        }
        return {
          schema: 'simulatte.synthGraphValidation.v1',
          valid: errors.length === 0,
          checked: {
            nodes: synthGraph.nodes.length,
            relations: synthGraph.relations.length,
            events: synthGraph.events.length,
            primitives: groundedGraph.primitiveIds.length,
          },
          repairs: uniqueList(repairs),
          warnings: uniqueList(warnings),
          errors,
        };
      }

    function extractSpans(promptText) {
        const prompt = String(promptText || '').toLowerCase();
        const spans = [];
        const add = (text, start, kind = 'span') => {
          const clean = String(text || '').replace(/\s+/g, ' ').trim();
          if (!clean || STOPWORDS.has(clean)) return;
          if (spans.some((span) => span.text === clean && span.start === start)) return;
          spans.push({ text: clean, start: Math.max(0, start || 0), kind });
        };
        for (const item of SURFACE_CARD_LIBRARY) {
          for (const label of item.labels) {
            for (const match of labelOccurrences(prompt, label)) add(match.text, match.index, item.type);
          }
        }
        const words = prompt.split(/[^a-z0-9]+/).filter(Boolean);
        for (let i = 0; i < words.length; i += 1) {
          for (let n = 3; n >= 1; n -= 1) {
            const slice = words.slice(i, i + n);
            if (slice.length !== n || slice.every((word) => STOPWORDS.has(word))) continue;
            add(slice.join(' '), prompt.indexOf(slice.join(' ')), 'ngram');
          }
        }
        add(prompt, 0, 'prompt');
        return spans.sort((a, b) => a.start - b.start || b.text.length - a.text.length).slice(0, 72);
      }

    function scoreCardForSpan(spanText, item) {
        const span = String(spanText || '').toLowerCase();
        if (!span) return 0;
        const labelScore = item.labels.reduce((score, label) => {
          const text = label.toLowerCase();
          if (normalizedPhraseEquals(span, text)) return Math.max(score, 0.98);
          if (normalizedPhraseIncludes(span, text) || normalizedPhraseIncludes(text, span)) return Math.max(score, 0.72);
          return score;
        }, 0);
        const spanTokens = tokenSet(span);
        const cardTokens = tokenSet(cardText(item));
        const overlap = Array.from(spanTokens).filter((token) => cardTokens.has(token)).length;
        const denom = Math.max(1, Math.min(spanTokens.size, 8));
        if (spanTokens.size === 1 && !labelScore) return overlap ? 0.18 : 0;
        return Math.max(labelScore, overlap / denom);
      }

    function expectedTypeForSpan(span) {
        if (/\b(crash|collide|impact|fall|break|flow|heat|cool|burn)\b/i.test(span)) return 'event';
        if (/\b(inside|within|contains|attached|through|push|pull|drive)\b/i.test(span)) return 'relation';
        if (/\b(wheel|loop|machine|apparatus|cart|bike|container|tank)\b/i.test(span)) return 'assembly';
        if (/\b(desert|lab|bench|city|forest|watershed)\b/i.test(span)) return 'environment';
        if (/\b(readout|meter|power|loss)\b/i.test(span)) return 'readout';
        return '';
      }

    function typeFits(cardType, expected) {
        if (!expected) return true;
        if (cardType === expected) return true;
        return expected === 'assembly' && cardType === 'assembly_class'
          || expected === 'entity' && cardType === 'entity_class';
      }

    function occurrencesForCard(prompt, item) {
        return uniqueList(rawOccurrencesForCard(prompt, item)
          .filter((occurrence) => !isEmbeddedSurfacePhrase(
            String(prompt || '').toLowerCase(),
            item,
            occurrence.label,
            occurrence.start
          ))
          .map((occurrence) => occurrence.start))
          .sort((a, b) => a - b);
      }

    function rawOccurrencesForCard(prompt, item) {
        const occurrences = [];
        for (const label of item.labels || []) {
          for (const match of labelOccurrences(prompt, label)) {
            occurrences.push({
              start: match.index,
              end: match.end,
              label: match.text,
            });
          }
        }
        return occurrences.sort((a, b) => a.start - b.start || b.end - a.end);
      }

    function isCoveredSelectedMatch(prompt, match) {
        const item = cardById(match.cardId);
        if (!item) return false;
        if (match.embeddingScore >= 0.66 && String(match.source || '').includes('embedding')) return false;
        const raw = rawOccurrencesForCard(prompt, item);
        const exposed = occurrencesForCard(prompt, item);
        if (raw.length && !exposed.length) return true;
        return !raw.length && match.lexicalScore >= 0.5 && match.embeddingScore < 0.46;
      }

    function isEmbeddedSurfacePhrase(prompt, item, label, start) {
        const labelText = String(label || '').toLowerCase();
        if (!labelText) return false;
        return SURFACE_CARD_LIBRARY.some((candidate) => {
          if (candidate.id === item.id) return false;
          return candidate.labels.some((label) => {
            const candidateText = String(label || '').toLowerCase();
            if (candidateText.length <= labelText.length || !candidateText.includes(labelText)) return false;
            let index = prompt.indexOf(candidateText, Math.max(0, start - candidateText.length));
            while (index !== -1 && index <= start) {
              const end = index + candidateText.length;
              if (start >= index && start + labelText.length <= end) return true;
              index = prompt.indexOf(candidateText, index + 1);
            }
            return false;
          });
        });
      }

    function shouldDuplicateFromPrompt(prompt, item) {
        if (!/\b(another|two|second|pair)\b/i.test(prompt)) return false;
        return item.type === 'assembly' && /\bwheel|cart|vehicle|apparatus\b/i.test(item.labels.join(' '));
      }

    function hasPrimitive(groundedGraph, id) {
        return (groundedGraph.primitiveIds || []).some((entry) => entry.id === id);
      }

    function card(id, type, labels, grounding, text) {
        const normalizedLabels = uniqueList([id.replace(/_/g, ' '), ...(labels || [])]);
        return Object.freeze({
          schema: SURFACE_CARD_SCHEMA,
          id,
          type,
          labels: normalizedLabels,
          grounding: freezeGrounding(grounding || {}),
          text: String(text || ''),
        });
      }

    function mergeSurfaceLibraries(baseCards, importedCards) {
        const byId = new Map();
        for (const item of [...baseCards, ...importedCards]) {
          if (!item || !item.id || byId.has(item.id)) continue;
          byId.set(item.id, item);
        }
        return Array.from(byId.values());
      }

    function importedSemanticSurfaceCards(semanticApi = {}) {
        const surfaceCards = Array.isArray(semanticApi.SEMANTIC_SURFACE_CARDS)
          ? semanticApi.SEMANTIC_SURFACE_CARDS
          : [];
        const basisCards = Array.isArray(semanticApi.GROUNDING_BASIS_CARDS)
          ? semanticApi.GROUNDING_BASIS_CARDS
          : [];
        const basisById = new Map(basisCards.map((item) => [item.id, item]));
        return surfaceCards.map((item) => {
          const id = normalizeIncomingCardId(item.id);
          const type = synthesisTypeForSemanticType(item.type);
          const grounding = {
            classes: item.classHints || [],
            shapes: item.shapeHints || [],
            parts: item.partHints || [],
            materials: normalizeSemanticMaterials(item.materialHints || []),
            behaviors: item.behaviorHints || item.eventHints || [],
            constraints: item.relationHints || [],
            ports: uniqueList([
              ...(item.affordanceHints || []),
              ...(item.relationHints || []),
              ...(item.eventHints || []),
            ]),
            primitiveIds: primitiveIdsForSemanticCard(item, basisById),
            approximation: first(item.classHints) || '',
            abstract: ['entity_class', 'assembly_class'].includes(type),
          };
          return card(
            id,
            type,
            item.labels || [id.replace(/_/g, ' ')],
            grounding,
            [
              item.description,
              (item.classHints || []).join(' '),
              (item.shapeHints || []).join(' '),
              (item.partHints || []).join(' '),
              (item.materialHints || []).join(' '),
              (item.behaviorHints || []).join(' '),
              (item.eventHints || []).join(' '),
              (item.relationHints || []).join(' '),
            ].join(' ')
          );
        });
      }

    function synthesisTypeForSemanticType(type) {
        if (type === 'artifact') return 'assembly';
        if (type === 'material') return 'entity';
        if (type === 'process') return 'behavior';
        return type || 'entity';
      }

    function normalizeIncomingCardId(value) {
        return String(value || '')
          .replace(/^[a-z]+(?:-[a-z]+)*\./, '')
          .replace(/-/g, '_')
          .replace(/[^a-zA-Z0-9_]/g, '_')
          .replace(/^_+|_+$/g, '');
      }

    function normalizeSemanticMaterials(values) {
        return uniqueList((values || []).map((value) => {
          if (value === 'soft_tissue' || value === 'fur' || value === 'feather' || value === 'shell') return 'biomass';
          return value;
        }));
      }

    function primitiveIdsForSemanticCard(item, basisById) {
        const ids = [];
        for (const material of normalizeSemanticMaterials(item.materialHints || [])) ids.push(material);
        for (const groundingId of item.groundingIds || []) {
          if (/^(math|physics|material|component|composition|scene)\./.test(groundingId)) {
            ids.push(groundingId.split('.').pop());
            continue;
          }
          const basis = basisById.get(groundingId);
          if (basis) ids.push(...(basis.primitives || []));
        }
        return uniqueList(ids);
      }

    function freezeGrounding(value) {
        const out = {};
        for (const [key, raw] of Object.entries(value || {})) {
          out[key] = Array.isArray(raw) ? Object.freeze(raw.slice()) : raw;
        }
        return Object.freeze(out);
      }

    function cardById(id) {
        return SURFACE_CARD_LIBRARY.find((item) => item.id === id) || null;
      }

    function cardText(item) {
        const grounding = item.grounding || {};
        return [
          item.id,
          item.type,
          item.labels.join(' '),
          item.text,
          array(grounding.classes).join(' '),
          array(grounding.parts).join(' '),
          array(grounding.shapes).join(' '),
          array(grounding.materials).join(' '),
          array(grounding.behaviors).join(' '),
          array(grounding.constraints).join(' '),
          array(grounding.ports).join(' '),
          array(grounding.primitiveIds).join(' '),
        ].join(' ').replace(/\s+/g, ' ').trim();
      }

    function labelOccurrences(text, label) {
        const source = String(text || '').toLowerCase();
        const sourceTokens = tokenRows(source);
        const labelTokens = tokenRows(label).map((token) => token.root);
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

    function normalizedPhraseEquals(a, b) {
        const left = normalizedTokens(a);
        const right = normalizedTokens(b);
        return left.length === right.length && left.every((token, index) => token === right[index]);
      }

    function normalizedPhraseIncludes(text, phrase) {
        const haystack = normalizedTokens(text);
        const needle = normalizedTokens(phrase);
        if (!haystack.length || !needle.length || needle.length > haystack.length) return false;
        for (let i = 0; i <= haystack.length - needle.length; i += 1) {
          if (needle.every((token, index) => token === haystack[i + index])) return true;
        }
        return false;
      }

    function normalizedTokens(text) {
        return tokenRows(text).map((token) => token.root);
      }

    function tokenRows(text) {
        const out = [];
        const value = String(text || '').toLowerCase();
        let match;
        const re = /[a-z0-9]+/g;
        while ((match = re.exec(value))) {
          const root = normalizeToken(match[0]);
          if (!root || STOPWORDS.has(root)) continue;
          out.push({ value: match[0], root, index: match.index, end: match.index + match[0].length });
        }
        return out;
      }

    function tokenSet(text) {
        return new Set(normalizedTokens(text));
      }

    function normalizeToken(token) {
        let out = String(token || '').toLowerCase().replace(/'/g, '').replace(/[^a-z0-9-]/g, '');
        if (out.endsWith('ies') && out.length > 4) out = `${out.slice(0, -3)}y`;
        else if (/(ches|shes|xes|zes|sses)$/.test(out) && out.length > 5) out = out.slice(0, -2);
        else if (out.endsWith('s') && out.length > 3 && !/(ss|us|is)$/.test(out)) out = out.slice(0, -1);
        if (out === 'mountaint' || out === 'moutnain') out = 'mountain';
        return out;
      }

    function scaleForCard(item) {
        const text = cardText(item);
        if (/\bsmall|mouse|gerbil|hamster|insect\b/i.test(text)) return 'small';
        if (/\bbuilding|planet|city|forest|watershed\b/i.test(text)) return 'large';
        return 'nominal';
      }

    function first(values) {
        const list = array(values);
        return list.length ? list[0] : '';
      }

    function array(value) {
        return Array.isArray(value) ? value.slice() : [];
      }

    Object.assign(scope, {
      synthesizeWorldIntent,
      groundedPrimitiveRows,
      createSurfaceCardDocuments,
      retrieveSurfaceCards,
      buildNodes,
      nodeTypeForCard,
      shouldUseEmbeddingOnlyNode,
      buildRelations,
      uniqueRelations,
      buildEvents,
      buildReadouts,
      buildEnvironment,
      groundSynthGraph,
      validateGroundedGraph,
      extractSpans,
      scoreCardForSpan,
      expectedTypeForSpan,
      typeFits,
      occurrencesForCard,
      rawOccurrencesForCard,
      isCoveredSelectedMatch,
      isEmbeddedSurfacePhrase,
      shouldDuplicateFromPrompt,
      hasPrimitive,
      card,
      mergeSurfaceLibraries,
      importedSemanticSurfaceCards,
      synthesisTypeForSemanticType,
      normalizeIncomingCardId,
      normalizeSemanticMaterials,
      primitiveIdsForSemanticCard,
      freezeGrounding,
      cardById,
      cardText,
      labelOccurrences,
      normalizedPhraseEquals,
      normalizedPhraseIncludes,
      normalizedTokens,
      tokenRows,
      tokenSet,
      normalizeToken,
      scaleForCard,
      first,
      array,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
