(function attachSimulatteCompositionGraphEntityLowering(root) {
  const scope = root.__SimulatteCompositionGraphRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function visualEntityForObject(object, index, sceneKind, constructionApproach = {}) {
      const text = renderObjectText(object);
      return {
        id: object.id || `entity-${index + 1}`,
        sourceObject: object.id || '',
        label: object.phrase || object.role || object.id || `entity ${index + 1}`,
        sourceLabel: object.sourceLabel || object.phrase || object.role || '',
        aliases: object.aliases || [],
        semanticClass: object.semanticClass || '',
        visualArchetype: object.visualArchetype || '',
        shapeHints: object.shapeHints || [],
        construction: object.construction || object.geometry && object.geometry.construction || null,
        constructionHypotheses: object.constructionHypotheses ||
          object.geometry && object.geometry.constructionHypotheses || [],
        constructionProvenance: object.constructionProvenance || [],
        constructionApproachId: constructionApproach.id || CONSTRUCTION_APPROACH_IDS.targeted,
        constructionApproachSeed: Number(constructionApproach.seed || 0),
        constructionApproachAttempt: Number(constructionApproach.attempt || 0),
        constructionApproachRejectedGrammarIds: (constructionApproach.rejectedGrammarIds || []).slice(0, 64),
        properties: (object.properties || []).map((row) => ({ ...row })),
        partGraph: (object.partGraph || []).map((row) => ({
          ...row,
          properties: (row.properties || []).map((property) => ({ ...property })),
        })),
        cardinality: Number.isFinite(Number(object.cardinality)) ? Number(object.cardinality) : 1,
        poseHint: object.poseHint ? { ...object.poseHint } : null,
        directlyGrounded: object.directlyGrounded === true,
        domainTags: object.domainTags || [],
        kind: visualEntityKind(object, text),
        role: visualEntityRole(object, text, sceneKind),
        material: object.material || 'matte',
        shape: object.shape || 'body',
        visualRegime: object.visualRegime || 'generic',
        pose: object.pose || {},
        semanticRef: object.semanticRef || '',
        physicalRef: object.physicalRef || '',
        sourceGraphId: object.visualSourceGraphId || object.id || '',
        sourceKind: object.visualSourceKind || object.source || 'compiled-object',
        sourceIds: object.visualSourceIds || uniqueList([object.id, object.semanticRef, object.physicalRef].filter(Boolean)),
        behavior: object.behavior || null,
        physicsOperators: object.physicsOperators || [],
        stateBindings: object.stateBindings || {},
        status: object.visualStatus || 'accepted',
        confidence: Number.isFinite(Number(object.visualConfidence)) ? Number(object.visualConfidence) : 0.72,
        reason: object.visualReason || 'accepted compiled graph object',
        supportOnly: object.visualSupportOnly === true,
        evidence: visualEvidenceForObject(object, text),
      };
    }

    function visualEntityKind(object, text) {
      if (/field-envelope|vector-band|thermal|gravity|dipole/.test(text) || object.kind === 'field') return 'field';
      if (/queue|traffic|agent|patient|robot|vehicle|animal|fish|bird|crowd/.test(text)) return 'agent';
      if (/water|air|smoke|plume|fluid|lava|foam|gel|soil|sand|biofilm|plasma/.test(text)) return 'medium';
      if (/sensor|meter|instrument|lens|probe|antenna|detector|camera|microscope|telescope/.test(text)) return 'instrument';
      if (/wall|boundary|bridge|building|vessel|tank|cage|reactor|repository/.test(text)) return 'surface';
      return 'object';
    }

    function visualEntityRole(object, text, sceneKind) {
      if (/source|sun|lamp|battery|pump|heater|injector/.test(text)) return 'source';
      if (/sink|load|ledger|sensor|detector|readout/.test(text)) return 'measurement';
      if (/constraint|wall|boundary|containment|repository|vessel/.test(text)) return 'constraint';
      if (/flow|path|channel|queue|route|orbit|track/.test(text)) return 'path';
      if (/process|front|reaction|burn|growth|fracture|collision/.test(text)) return 'process';
      if (/city|digital|civic/.test(sceneKind) && /node|agent|queue/.test(text)) return 'agent';
      return 'primary';
    }

    function visualEvidenceForObject(object, text) {
      return uniqueList([
        ...(object.evidence || []),
        object.source || 'compiled-object',
        object.shape ? `shape:${object.shape}` : '',
        object.material ? `material:${object.material}` : '',
        object.visualRegime ? `regime:${object.visualRegime}` : '',
        object.phrase ? `phrase:${object.phrase}` : '',
        ...(object.behavior && object.behavior.sourceEvidence || []),
        ...(object.layoutConstraints || []).map((id) => `layout-relation:${id}`),
        ...(object.construction && object.construction.sourceCardIds || []).map((id) => `construction-card:${id}`),
        text.includes('embedding-guided') ? 'embedding-grounded' : '',
      ].filter(Boolean));
    }

    function scenePacketPromptIdentityType(sourceLabel = '') {
      const text = String(sourceLabel || '').trim().toLowerCase();
      const row = [
        ['dog', /\bdogs?\b/], ['cat', /\bcats?\b/], ['castle', /\bcastles?\b/],
        ['black-hole', /\bblack[- ]hole\b|event[- ]horizon/], ['television', /\b(tv|television)\b/],
        ['person', /\b(person|people|human)\b/], ['chair', /\b(chair|stool|seat)\b/],
        ['table', /\b(table|desk|bench)\b/], ['building', /\b(building|house|apartment)\b/],
        ['galaxy', /\b(galaxy|nebula)\b/], ['planet', /\b(planets?|moons?)\b/], ['star', /\b(stars?|sun)\b/],
        ['tree', /\b(trees?|oak|pine|willow|maple)\b/], ['flower', /\b(flowers?|rose|orchid)\b/],
        ['bicycle', /\b(bicycle|bike)\b/], ['sofa', /\b(sofa|couch)\b/], ['lamp', /\b(?:floor )?lamp\b/],
        ['airplane', /\b(airplane|aircraft)\b/], ['bridge', /\bbridge\b/], ['road', /\broad\b/],
        ['river', /\briver\b/], ['boat', /\b(boat|vessel)\b/], ['cloud', /\bclouds?\b/],
        ['bird', /\bbirds?\b/], ['fish', /\bfish\b/], ['horse', /\bhorses?\b/],
        ['book', /\bbooks?\b/], ['cup', /\b(cup|mug)\b/], ['phone', /\b(phone|smartphone)\b/],
        ['laptop', /\blaptops?\b/], ['shelf', /\bshel(?:f|ves)\b/],
        ['parcel', /\b(parcels?|packages?|cartons?|shipping boxes?)\b/],
      ].find(([, pattern]) => pattern.test(text));
      return row ? row[0] : '';
    }

    function scenePacketGroundedIdentityCategory(type = '') {
      const value = String(type || '').toLowerCase();
      if (/dog|cat|animal|bird|fish|horse/.test(value)) return 'animal';
      if (/person|human|people/.test(value)) return 'person';
      if (/tree|plant|flower/.test(value)) return 'plant';
      if (/water|river|lake|ocean|road/.test(value)) return value === 'road' ? 'surface' : 'medium';
      if (/building|bridge|castle|shelf|server-rack|stairwell/.test(value)) return 'structure';
      if (/robot|conveyor/.test(value)) return 'machine';
      if (/bicycle|car|airplane|boat|vehicle/.test(value)) return 'vehicle';
      if (/sofa|chair|table|lamp/.test(value)) return 'furniture';
      if (/phone|laptop|television|book|cup|parcel/.test(value)) return 'artifact';
      if (/galaxy|planet|star|black-hole/.test(value)) return 'celestial';
      return 'object';
    }

    function scenePacketIdentityLabel(type, entity = {}) {
      if (type && type !== 'object' && type !== 'field') return type;
      const role = String(entity.role || '').toLowerCase();
      const roleMatch = role.match(/\b(dog|cat|mouse|gerbil|hamster|person|human|chair|table|television|tv|building|galaxy|star|planet|water|robot|fire|smoke|protein|cell|plant|flower|tree|root|instrument|readout|structure)\b/);
      if (roleMatch) return roleMatch[1];
      return entity.label || entity.id || type || 'object';
    }

    Object.assign(scope, {
      visualEntityForObject,
      visualEntityKind,
      visualEntityRole,
      visualEvidenceForObject,
      scenePacketPromptIdentityType,
      scenePacketGroundedIdentityCategory,
      scenePacketIdentityLabel,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
