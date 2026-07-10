(function attachSimulattePhysicsModelphasesimulation(root) {
  const scope = root.__SimulattePhysicsModelRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const normalizedSimulationSpecs = new WeakSet();

    function scenePacketIdentitySummary(sceneRenderPacket = {}) {
    		    return Array.from(new Set((sceneRenderPacket.entities || [])
    		      .flatMap((row) => {
    		        const identity = row.identity || {};
    		        return [identity.label, identity.type, identity.sourceLabel, row.label, row.id];
    		      })
    		      .filter(Boolean)));
    		  }

    function renderObligationProof(sceneRenderPacket = {}, visualObligations = [], compositionLedger = null, frameReceipt = {}) {
    	    const identities = new Set((sceneRenderPacket.entities || [])
    	      .map((row) => row.identity && row.identity.type)
    	      .filter(Boolean));
    	    const packetText = JSON.stringify({
              packet: sceneRenderPacket,
    	      identities: Array.from(identities),
    	    }).toLowerCase();
    	    const obligations = visualObligations.length
    	      ? visualObligations
    	      : (compositionLedger && compositionLedger.obligations || []).filter((row) => row.kind === 'visual' || row.ownedByPhase === 6);
    	    const entityObligationTargets = new Set(((compositionLedger && compositionLedger.obligations) || [])
    	      .filter((row) => row.kind === 'entity')
    	      .map((row) => normalizeForEvidence(row.target || ''))
    	      .filter(Boolean));
    	    const identityList = Array.from(identities).map((identity) => normalizeForEvidence(identity));
    	    const distinctEntityIdentityCount = entityObligationTargets.size
    	      ? identityList.filter((identity) => entityObligationTargets.has(identity)).length
    	      : identityList.length;
    	    return obligations.map((row) => {
    	      const target = normalizeForEvidence(row.target || row.obligationId || row.id || '');
              const packetSatisfied = visualObligationPacketSatisfied(target, packetText, distinctEntityIdentityCount);
    		      const rendered = frameReceipt.rendered === true;
    		      const sourceStatus = row.status || '';
    		      const status = rendered && packetSatisfied && !LEDGER_FAILURE_STATUSES.has(sourceStatus)
    		        ? 'pass'
    		        : rendered ? 'fail' : 'not-proven';
    		      return phaseCarryObject({
    		        schema: 'simulatte.phase7VisualObligationProof.v1',
    		        obligationId: row.obligationId || row.id || '',
    		        target: row.target || '',
    		        required: row.required === true,
    		        phase6Status: sourceStatus,
    		        packetSatisfied,
    		        pixelSatisfied: rendered && packetSatisfied,
    		        status,
    		        pass: status === 'pass',
    		        evidence: packetSatisfied ? ['sceneRenderPacket'] : [],
    		      });
    		    });
          }

    function visualObligationPacketSatisfied(target = '', packetText = '', distinctEntityIdentityCount = 0) {
	    if (/compiled scene packet/.test(target)) return /simulatte\.scenerenderpacket\.v1/.test(packetText) && /"entities":\[/.test(packetText);
            if (/species distinct|species-distinct/.test(target)) return distinctEntityIdentityCount >= 2;
            if (/wake|ripple/.test(target)) return /wake|ripple/.test(packetText);
            if (/submersion/.test(target)) return /submersion/.test(packetText);
            if (/swimming|swim/.test(target)) return /swim/.test(packetText);
            const ignored = new Set(['and', 'the', 'with', 'from', 'into', 'over', 'under', 'across', 'through']);
            const terms = target.split(/\s+|-/).filter((term) => term.length > 2 && !ignored.has(term));
            return terms.length > 0 && terms.every((term) => packetText.includes(term));
          }

    function summarizeRenderObligationProof(proofs = []) {
    		    return {
    		      schema: 'simulatte.phase7VisualObligationProofSummary.v1',
    		      proofCount: proofs.length,
    		      passCount: proofs.filter((row) => row.status === 'pass').length,
    		      failCount: proofs.filter((row) => row.status === 'fail').length,
    		      notProvenCount: proofs.filter((row) => row.status === 'not-proven').length,
    		      requiredObligationIds: proofs
    		        .filter((row) => row.required === true)
    		        .map((row) => row.obligationId)
    		        .filter(Boolean),
    		      passedObligationIds: proofs
    		        .filter((row) => row.status === 'pass')
    		        .map((row) => row.obligationId)
    		        .filter(Boolean),
    		      failedObligationIds: proofs
    		        .filter((row) => row.status === 'fail')
    		        .map((row) => row.obligationId)
    		        .filter(Boolean),
    		    };
    		  }

    function renderPixelAudit(sceneRenderPacket = {}, frameReceipt = {}, canvas = null, proofSummary = {}) {
    		    const width = Number(canvas && canvas.width || frameReceipt.canvas && frameReceipt.canvas.width || 0);
    		    const height = Number(canvas && canvas.height || frameReceipt.canvas && frameReceipt.canvas.height || 0);
    		    const hasCanvasPixels = width * height > 0;
    		    const packetDrawables = scenePacketDrawableCount(sceneRenderPacket);
    		    const drawCount = Number(frameReceipt.drawCount || frameReceipt.sceneInstanceCount || packetDrawables || 0);
    		    const livePixelAudit = auditLivePixelSamples(
    		      phase7PixelSamples(frameReceipt, canvas),
    		      {
    		        required: frameReceipt.requireLivePixelSamples === true,
    		        proofSummary,
    		        drawableCount: packetDrawables,
    		      }
    		    );
    		    const thresholds = {
    		      minDrawableCount: packetDrawables > 0 ? 1 : 0,
    		      minDrawCount: packetDrawables > 0 ? 1 : 0,
    		      minCanvasPixels: hasCanvasPixels ? 1 : 0,
    		      minLivePixelSamples: livePixelAudit.required ? livePixelAudit.thresholds.minVisibleSampleCount : 0,
    		      minLivePixelContrast: livePixelAudit.required ? livePixelAudit.thresholds.minContrast : 0,
    		      maxFailedObligations: 0,
    		    };
    		    const checks = [
    		      {
    		        id: 'rendered-frame',
    		        actual: frameReceipt.rendered === true,
    		        expected: true,
    		        pass: frameReceipt.rendered === true,
    		      },
    		      {
    		        id: 'scene-packet-drawables',
    		        actual: packetDrawables,
    		        expectedMin: thresholds.minDrawableCount,
    		        pass: packetDrawables >= thresholds.minDrawableCount,
    		      },
    		      {
    		        id: 'draw-count',
    		        actual: drawCount,
    		        expectedMin: thresholds.minDrawCount,
    		        pass: drawCount >= thresholds.minDrawCount,
    		      },
    		      {
    		        id: 'canvas-pixels',
    		        actual: width * height,
    		        expectedMin: thresholds.minCanvasPixels,
    		        pass: width * height >= thresholds.minCanvasPixels,
    		      },
    		      {
    		        id: 'visual-obligation-failures',
    		        actual: Number(proofSummary.failCount || 0),
    		        expectedMax: thresholds.maxFailedObligations,
    		        pass: Number(proofSummary.failCount || 0) <= thresholds.maxFailedObligations,
    		      },
    		      {
    		        id: 'live-pixel-sample-count',
    		        actual: livePixelAudit.visibleSampleCount,
    		        expectedMin: thresholds.minLivePixelSamples,
    		        pass: livePixelAudit.visibleSampleCount >= thresholds.minLivePixelSamples,
    		      },
    		      {
    		        id: 'live-pixel-contrast',
    		        actual: livePixelAudit.minContrast,
    		        expectedMin: thresholds.minLivePixelContrast,
    		        pass: livePixelAudit.minContrast >= thresholds.minLivePixelContrast,
    		      },
    		      {
    		        id: 'visual-obligation-pixel-samples',
    		        actual: livePixelAudit.sampledRequiredObligationCount,
    		        expectedMin: livePixelAudit.required ? livePixelAudit.requiredObligationCount : 0,
    		        pass: livePixelAudit.obligationsSampled,
    		      },
    		    ];
    		    return {
    		      schema: 'simulatte.phase7PixelAudit.v1',
    		      method: livePixelAudit.sampleCount > 0
    		        ? 'live-pixel-samples'
    		        : hasCanvasPixels ? 'canvas-render-receipt' : 'scene-packet-render-receipt',
    		      status: checks.every((check) => check.pass) ? 'pass' : 'fail',
    		      thresholds,
    		      checks,
    		      canvas: { width, height },
    		      drawCount,
    		      drawableCount: packetDrawables,
    		      livePixelAudit,
    		    };
    		  }

    function phase7PixelSamples(frameReceipt = {}, canvas = null) {
    		    return normalizePhase7PixelSamples(
    		      frameReceipt.pixelSamples ||
    		      frameReceipt.livePixelSamples ||
    		      frameReceipt.renderData && (frameReceipt.renderData.pixelSamples || frameReceipt.renderData.livePixelSamples) ||
    		      canvas && canvas.__simulattePixelSamples ||
    		      null
    		    );
    		  }

    function normalizePhase7PixelSamples(source = null) {
    		    const rows = Array.isArray(source)
    		      ? source
    		      : source && (source.samples || source.rows || source.pixelSamples) || [];
    		    return rows.map((row, index) => {
    		      const rgba = normalizeSampleRgba(row && (row.rgba || row.color || row.pixel));
    		      const contrast = Number.isFinite(Number(row && row.contrast))
    		        ? Number(row.contrast)
    		        : rgbaContrast(rgba, row && (row.backgroundRgba || row.background || row.expectedBackground));
    		      return {
    		        schema: 'simulatte.phase7PixelSample.v1',
    		        id: row && row.id || `sample:${index + 1}`,
    		        obligationId: row && (row.obligationId || row.obligation || row.targetObligationId) || '',
    		        label: row && row.label || '',
    		        rgba,
    		        alpha: rgba[3],
    		        contrast,
    		        visible: row && row.visible === false ? false : rgba[3] >= 8 && contrast >= 0.02,
    		      };
    		    });
    		  }

    function auditLivePixelSamples(samples = [], options = {}) {
    		    const required = options.required === true;
    		    const drawableCount = Number(options.drawableCount || 0);
    		    const requiredIds = options.proofSummary && Array.isArray(options.proofSummary.requiredObligationIds)
    		      ? options.proofSummary.requiredObligationIds
    		      : [];
    		    const visibleSamples = samples.filter((row) => row.visible === true);
    		    const sampledRequiredIds = new Set(samples
    		      .filter((row) => row.visible === true && row.obligationId && requiredIds.includes(row.obligationId))
    		      .map((row) => row.obligationId));
            const minVisibleSampleCount = required
              ? Math.max(1, Math.min(3, drawableCount || 1, samples.length || 1))
    		      : 0;
    		    const minContrast = required ? 0.035 : 0;
    		    const minContrastValue = visibleSamples.length
    		      ? Math.min(...visibleSamples.map((row) => Number(row.contrast || 0)))
    		      : 0;
    		    const obligationsSampled = !required || requiredIds.length === 0 ||
    		      requiredIds.every((id) => sampledRequiredIds.has(id));
    		    return {
    		      schema: 'simulatte.phase7LivePixelAudit.v1',
    		      required,
    		      sampleCount: samples.length,
    		      visibleSampleCount: visibleSamples.length,
    		      minContrast: Number(minContrastValue.toFixed(4)),
    		      sampledRequiredObligationCount: sampledRequiredIds.size,
    		      requiredObligationCount: requiredIds.length,
    		      obligationsSampled,
    		      sampledObligationIds: Array.from(sampledRequiredIds),
    		      thresholds: {
    		        minVisibleSampleCount,
    		        minContrast,
    		      },
    		      status: visibleSamples.length >= minVisibleSampleCount &&
    		        minContrastValue >= minContrast &&
    		        obligationsSampled ? 'pass' : 'fail',
    		      samples: samples.slice(0, 32),
    		    };
    		  }

    function normalizeSampleRgba(value) {
    		    const row = Array.isArray(value) ? value : [];
    		    return [
    		      clampByte(row[0]),
    		      clampByte(row[1]),
    		      clampByte(row[2]),
    		      clampByte(row[3] == null ? 255 : row[3]),
    		    ];
    		  }

    function rgbaContrast(rgba = [], background = null) {
    		    const base = Array.isArray(background) && background.length >= 3
    		      ? background.map(clampByte)
    		      : [0, 0, 0, 255];
    		    const dr = Math.abs(clampByte(rgba[0]) - base[0]);
    		    const dg = Math.abs(clampByte(rgba[1]) - base[1]);
    		    const db = Math.abs(clampByte(rgba[2]) - base[2]);
    		    return Number((Math.max(dr, dg, db) / 255).toFixed(4));
    		  }

    function clampByte(value) {
    		    const parsed = Number(value);
    		    if (!Number.isFinite(parsed)) return 0;
    		    return Math.max(0, Math.min(255, Math.round(parsed)));
    		  }

    function scenePacketDrawableCount(sceneRenderPacket = {}) {
    		    return (sceneRenderPacket.entities || []).length +
    		      (sceneRenderPacket.fields || []).length +
    		      (sceneRenderPacket.effects || []).length;
    		  }

    function createSpec(templateId = 'magnetic-wheel', overrides = {}) {
        const template = templateById(templateId);
        const name = String(overrides.name || template.name).trim() || template.name;
        const controls = (overrides.controls || template.controls || []).map(normalizeControl);
        const modules = uniqueList(overrides.modules || template.modules || []);
        const objects = normalizeObjects(overrides.objects, template.objects || []);
        const spec = {
          schema: 'simulatte.simulationSpec.v1',
          id: overrides.id || `${slugify(name)}-${Date.now().toString(36)}`,
          templateId: template.id,
          name,
          kind: template.kind,
          description: String(overrides.description || template.description),
          modules,
          objects,
          controls,
          params: normalizeParams(template, overrides.params, controls),
          intent: overrides.intent || null,
          contract: overrides.contract || (
            overrides.intent && overrides.intent.resolution
              ? overrides.intent.resolution.contract || null
              : null
          ),
          promptParse: overrides.promptParse || null,
          universeGraph: overrides.universeGraph || null,
          physicsIR: overrides.physicsIR || null,
          validationReceipt: overrides.validationReceipt || null,
          solverGraph: overrides.solverGraph || null,
          renderIR: overrides.renderIR || null,
          phaseArtifacts: mergePhaseArtifacts(
            overrides.phaseArtifacts,
            overrides.intent && overrides.intent.phaseArtifacts
          ),
          createdAt: overrides.createdAt || new Date(0).toISOString(),
          remixOf: overrides.remixOf || '',
        };
        if (spec.templateId === 'custom-world') {
          Object.assign(spec, compileCompilerArtifacts(spec, overrides));
        }
        if (spec.phaseArtifacts && spec.phaseArtifacts.phase4 && !spec.phaseArtifacts.phase5) {
          const phase5 = runPhase5SimulationCompile(spec.phaseArtifacts.phase4, runtimeContextFromPhase(spec.phaseArtifacts.phase4));
          const simulationCompile = phase5.artifact && phase5.artifact.simulationCompile || {};
          spec.phaseArtifacts = mergePhaseArtifacts(spec.phaseArtifacts, phaseArtifactSet(null, phase5));
          spec.physicsIR = spec.physicsIR || simulationCompile.physicsIR || null;
          spec.validationReceipt = spec.validationReceipt || simulationCompile.validationReceipt || null;
          spec.solverGraph = spec.solverGraph || simulationCompile.solverGraph || null;
          spec.renderIR = spec.renderIR || simulationCompile.renderIR || null;
        }
        if (spec.phaseArtifacts && spec.phaseArtifacts.phase5) {
          const phase6Compiled = compilePhase6VisualProgram(spec.phaseArtifacts.phase5, overrides.compositionGraph || null);
          spec.compositionGraph = phase6Compiled.compositionGraph;
          spec.renderProgram = phase6Compiled.visualProgram;
          spec.phaseArtifacts = {
            ...spec.phaseArtifacts,
            phase6: createVisualCompileEnvelopeFromCompiled(spec.phaseArtifacts.phase5, phase6Compiled),
          };
        } else {
          spec.compositionGraph = overrides.compositionGraph || (
            buildCompositionGraph && spec.templateId === 'custom-world' ? buildCompositionGraph(spec) : null
          );
          spec.renderProgram = overrides.renderProgram || (
            spec.compositionGraph && compileCompositionToRenderProgram
              ? compileCompositionToRenderProgram(spec.compositionGraph, spec)
              : null
          );
        }
        spec.physicalSpec = overrides.physicalSpec || (
          spec.contract && spec.contract.graph ? compilePhysicalSpec(spec) : null
        );
        normalizedSimulationSpecs.add(spec);
        return spec;
      }

    function refineRenderProgramSceneKind(renderProgram, spec) {
        const current = renderProgram.rendererPlan && renderProgram.rendererPlan.sceneKind || '';
        const authoritative = authoritativeVisualSceneKind(renderProgram);
        const sceneKind = authoritative || fineSceneKindFromSpec(spec, current);
        const visualIR = renderProgram.visualIR
          ? {
            ...renderProgram.visualIR,
            sceneKind,
            painterKind: renderProgram.visualIR.painterKind === 'generic' ||
              renderProgram.visualIR.painterKind === 'literal-composite'
              ? sceneKind
              : renderProgram.visualIR.painterKind,
          }
          : renderProgram.visualIR;
        return {
          ...renderProgram,
          rendererPlan: {
            ...(renderProgram.rendererPlan || {}),
            sceneKind,
          },
          visualIR,
          provenance: {
            ...(renderProgram.provenance || {}),
            sceneKind,
          },
        };
      }

    function authoritativeVisualSceneKind(renderProgram) {
        const candidates = [
          renderProgram && renderProgram.visualIR && renderProgram.visualIR.sceneKind,
          renderProgram && renderProgram.rendererPlan &&
            renderProgram.rendererPlan.visualIdentity &&
            renderProgram.rendererPlan.visualIdentity.sceneKind,
          renderProgram && renderProgram.rendererPlan &&
            renderProgram.rendererPlan.visualRecipe &&
            renderProgram.rendererPlan.visualRecipe.sceneKind,
          renderProgram && renderProgram.provenance &&
            renderProgram.provenance.visualIdentity &&
            renderProgram.provenance.visualIdentity.sceneKind,
        ];
        return candidates
          .map((value) => String(value || '').trim())
          .find((value) => value && value !== 'generic' && value !== 'literal-composite') || '';
      }

    function positiveLanguageText(value = '') {
        const word = "[a-z0-9]+(?:[-'][a-z0-9]+)*";
        const stop = '(?:and|with|while|where|when|because|but|however|though|although|unless|inside|outside|near|around|between|against|across|during|through|then|so)';
        const negated = new RegExp(`\\b(?:no|not|never|none|without|cannot|can't|wont|won't|avoid|exclude|except)\\b(?:\\s+(?:a|an|the|any))?(?:\\s+(?!\\b${stop}\\b)${word}){1,6}`, 'gi');
        return String(value || '').toLowerCase().replace(negated, ' ').replace(/\s+/g, ' ').trim();
      }

    function fineSceneKindFromSpec(spec, current = '') {
        const authoritative = authoritativeVisualSceneKind(spec && spec.renderProgram);
        if (authoritative) return authoritative;
        const renderIR = spec && spec.renderIR || {};
        const renderText = [
          renderIR.sceneHint,
          ...(renderIR.objects || []).map((object) => [
            object.id,
            object.label,
            object.glyph,
            object.materialId,
            object.visualRegime,
            object.semanticRef,
            object.physicalRef,
          ].filter(Boolean).join(' ')),
          ...(renderIR.fields || []).map((field) => [
            field.id,
            field.name,
            field.channel,
            field.domainId,
          ].filter(Boolean).join(' ')),
          ...(renderIR.causalAffordances || []).map((row) => [
            row.id,
            row.causalRelationId,
            row.sceneKind,
            row.geometry,
            ...(row.shaderHints || []),
            ...(row.motionHints || []),
          ].filter(Boolean).join(' ')),
        ].join(' ');
        const objectText = (spec.objects || []).map((object) => [
          object.id,
          object.type,
          object.role,
          object.layer,
          object.material,
          object.visualRegime,
          object.assembly,
          object.phrase,
          ...(object.domains || []),
          ...(object.slots || []),
        ].filter(Boolean).join(' ')).join(' ');
        const moduleText = (spec.modules || []).join(' ');
        const text = positiveLanguageText(`${renderText} ${objectText} ${moduleText}`);
        if (/\b(supercell|thunderstorm|hail|cloud microphysics|monsoon|atmospheric river|jetstream|storm cell|rain band|convection)\b/.test(text)) return 'weather-atmosphere';
        if (/\b(glacier calving|fjord|sea ice|ice shelf|iceberg|internal ocean wave|internal ocean waves|kelp canopy|ocean mixing|plankton bloom|thermocline)\b/.test(text)) return 'ocean-cryosphere';
        if (/\b(microgrid|battery inverter|inverter|transformer overload|substation|power flow|load shedding|frequency control|grid storage|voltage sag)\b/.test(text)) return 'grid-energy';
        if (/\b(warehouse robot|warehouse robots|robot arm|robot arms|robotic gripper|robot gripper|servo gripper|servo loop|drone swarm|autopilot|path planner|pick and place|pick-and-place|mobile robot|robot sorts|robot sort|contact force workcell|robotic workcell)\b/.test(text)) return 'robotics-control';
        if (/\b(injection molding|steel tooling|assembly line|conveyor belt|conveyor belts|cnc|extruder|cooling die|factory line|pick station)\b/.test(text)) return 'manufacturing-line';
        if (/\b(qubit|quantum chip|phase readout|microwave resonator|superconducting circuit|ion trap|spin lattice|photonic chip|wavefunction|electron microscope)\b/.test(text)) return 'quantum-instrument';
        if (/\b(compost|greenhouse crop|greenhouse crops|anaerobic digester|organic waste|nutrient loop|crop rotation|fish farm|soil nutrients|algae bioreactor)\b/.test(text)) return 'agro-waste-loop';
        if (/\b(neutrino|muon|particle collider|calorimeter|phototube|detector slice|water tank detector|underground water tank|cherenkov|photon cone)\b/.test(text)) return 'particle-instrument';
        if (/\b(protein folding|protein fold|bond constraint|energy minimization|molecular chain|amino acid|ligand|fermentation|sourdough|gluten|dough matrix|yeast|microbial fermentation)\b/.test(text)) return 'molecular-biology';
        if (/\b(chemical clock|belousov|polymer|epoxy|crosslink|electroplat|nickel|crystal nucleation|supersaturated|catalyst|ammonia|electrolyzer|hydrogen|reactor|reaction dish|microfluidic|droplet|droplets|channel junction|acidity gradient|acid gradient)\b/.test(text)) return 'chemistry-lab';
        if (/\b(museum preservation|archive preservation|oil paint aging|paint drying|pigment film|varnish aging|ceramic glaze|manuscript humidity|conservation lab)\b/.test(text)) return 'cultural-material';
        if (/\b(festival|stadium|restaurant|hotel|elevator|crowd|fan agents|guests|order queue|concourse|venue)\b/.test(text)) return 'venue-crowd';
        if (/\b(skate|skateboard|ski|surf|sailing|regatta|archery|fairground|mountain bike|rider|sports|trajectory transfer|centripetal|curved bowl|friction loss)\b/.test(text)) return 'sport-motion';
        if (/\b(bridge resonance|vortex shedding|wind vortex|bridge cable|bridge cables|structural mode|modal vibration|aeroelastic|flutter)\b/.test(text)) return 'structural-mechanics';
        if (/\b(radio telescope|telescope array|radio dishes|deep space network|microwave|beamforming|probe|link budget|baseline|antenna)\b/.test(text)) return 'space-instrument';
        if (/\b(heat|thermal|cooling|battery runaway|reentry|lava|magma|molten|volcano)\b/.test(text)) return 'thermal-plume';
        if (/\b(asteroid|mining|mars|venus|europa|titan|interstellar|comet|planetary ring|planetary rings|shepherd moon|moon resonance|orbital resonance|dark matter|galaxy cluster|exoplanet|magnetosphere|aurora|solar flare|cosmic ray|neutrino|black hole|singularity)\b/.test(text)) return 'planetary-space';
        if (/\b(population genetics|allele|ecological succession|predator|prey|pollinator|fish school|bird flock|animal trail|bee agents|plant cohorts|flower visitation)\b/.test(text)) return 'evolution-ecology';
        if (/\b(crop rotation|greenhouse|fish farm|algae bioreactor|compost|landfill|recycling|soil nutrients|oxygen water|organic waste|mixed materials)\b/.test(text)) return 'agro-waste-loop';
        if (/\b(tunnel boring|mine ventilation|earthquake|tsunami|hurricane|tornado|urban heat|noise pollution|light pollution|air quality|desertification|fault|hazard)\b/.test(text)) return 'hazard-atmosphere';
        if (/\b(housing market|power market|carbon credit|supply demand|bullwhip|transit priority|bike network|emergency response|policy|audit ledger)\b/.test(text)) return 'civic-market';
        if (/\b(cyber|blockchain|mempool|recommendation|search engine|index shard|query routing|service graph|network packet|attack propagation|embedding space|server rack|cooling aisle)\b/.test(text)) return 'digital-network';
        if (/\b(robot surgery|prosthetic|rehab|vaccine|hospital|patient|clinical|tissue mesh|sensor skin|muscle activation|bedflow|triage|kidney|liver|cochlea|eye aqueous|lymph|insulin|wound|dna|crispr|ribosome|mitochondria)\b/.test(text)) return 'clinical-control';
        if (/\b(water treatment|peatland|oyster reef|living breakwater|restoration|rewetting|nitrification|biofilm media|water table|shell beds)\b/.test(text)) return 'restoration-water';
        if (/\b(nuclear waste|stellarator|fusion|plasma ribbon|magnetic twist|canister|geologic repository|membrane stack)\b/.test(text)) return 'advanced-energy';
        if (/\b(compiler|database|logic|neural network|tensor|activation|boolean|chip|wafer|semiconductor|server rack|data center)\b/.test(text)) return 'digital-network';
        if (/\b(mangrove|kelp|coral|plankton|ocean|river|delta|aquifer|storm sewer|dam sediment|bridge scour|groundwater|estuary|glacier|permafrost|lake|sea ice)\b/.test(text)) return 'watershed';
        if (/\b(qubit|quantum|electron microscope|photonic|metamaterial|laser cavity|telescope|lens|mirror|wavefront|light|optics)\b/.test(text)) return 'optics';
        if (/\b(acoustic|sound|violin|speaker|cochlea|echolocation|granular synthesis|music)\b/.test(text)) return 'acoustic';
        if (/\b(bio|cell|neuron|organ|microbe|plant|root|phloem|chloroplast|gut|immune|bone|protein|enzyme|fermentation|sourdough|gluten|dough|yeast)\b/.test(text)) return 'biology';
        if (/\b(fire|wildfire|flame|combustion|burn|smoke)\b/.test(text)) return 'fire';
        if (/\b(grain|powder|sand|dune|granular|sediment core|snowpack|avalanche)\b/.test(text)) return 'granular';
        if (/\b(magnet|ferrofluid|coil|plasma confinement|field)\b/.test(text)) return 'ferrofluid';
        if (/\b(robot|vehicle|bridge|cable|exoskeleton|drivetrain|compressor|turbine|bearing|collision|fracture|pendulum|mechanical|wheel)\b/.test(text)) return 'mechanical';
        if (/\b(queue|network|agent|market|traffic|subway|port|grid|water network|dispatch|scheduling)\b/.test(text)) return 'city';
        if (current && current !== 'generic' && current !== 'literal-composite') return current;
        if (hasModule(spec, 'network') || hasModule(spec, 'queue')) return 'city';
        if (hasModule(spec, 'chemistry')) return 'chemistry-lab';
        if (hasModule(spec, 'biology')) return 'biology';
        if (hasModule(spec, 'fluid')) return 'watershed';
        if (hasModule(spec, 'acoustics') || hasModule(spec, 'wave')) return 'acoustic';
        if (hasModule(spec, 'optics')) return 'optics';
        if (hasModule(spec, 'thermal')) return 'thermal-plume';
        if (hasModule(spec, 'granular')) return 'granular';
        return 'mechanical';
      }

    function normalizeSpec(raw) {
        if (!raw || typeof raw !== 'object') return createSpec('magnetic-wheel');
        if (normalizedSimulationSpecs.has(raw)) return raw;
        const template = templateById(raw.templateId);
        return createSpec(template.id, {
          id: raw.id || `${template.id}-${Date.now().toString(36)}`,
          name: raw.name || template.name,
          description: raw.description || template.description,
          modules: raw.modules || template.modules || [],
          objects: raw.objects || template.objects || [],
          controls: raw.controls || template.controls || [],
          params: raw.params || {},
          intent: raw.intent || null,
          contract: raw.contract || null,
          compositionGraph: raw.compositionGraph || null,
          renderProgram: raw.renderProgram || null,
          physicalSpec: raw.physicalSpec || null,
          promptParse: raw.promptParse || null,
          universeGraph: raw.universeGraph || null,
          physicsIR: raw.physicsIR || null,
          validationReceipt: raw.validationReceipt || null,
          solverGraph: raw.solverGraph || null,
          renderIR: raw.renderIR || null,
          phaseArtifacts: raw.phaseArtifacts || null,
          createdAt: raw.createdAt || new Date(0).toISOString(),
          remixOf: raw.remixOf || '',
        });
      }

    function compileCompilerArtifacts(spec, overrides = {}) {
        const intent = spec.intent || {};
        const phaseArtifacts = mergePhaseArtifacts(
          spec.phaseArtifacts,
          intent.phaseArtifacts,
          overrides.phaseArtifacts
        );
        const phase2Output = phaseArtifacts.phase2 || null;
        const phase4Output = phaseArtifacts.phase4 || null;
        const languageGraph = phase2Output && phase2Output.artifact && phase2Output.artifact.languageGraph || {};
        const groundedIntent = phase4Output && phase4Output.artifact && phase4Output.artifact.groundedIntent || {};
        const prompt = languageGraph.sourceText || spec.name || '';
        const promptParse = overrides.promptParse || spec.promptParse || intent.promptParse || (
          parsePrompt ? parsePrompt(prompt) : null
        );
        const selectedUniverseGraph = overrides.universeGraph ||
          spec.universeGraph ||
          groundedIntent.acceptedGraph ||
          intent.universeGraph ||
          (
          groundUniverseGraph && promptParse
            ? groundUniverseGraph({
              prompt,
              promptParse,
              components: spec.objects || [],
              semanticRag: intent.semanticRag,
              universeMatches: intent.universeMatches,
              synthesis: intent.synthesis,
              cardMatches: intent.cardMatches || [],
              intentBrief: intent.intentBrief || null,
            })
            : null
          );
        const universeGraph = mergeUniverseGraphIntentBrief(selectedUniverseGraph, intent.intentBrief || null);
        let nextIR = overrides.physicsIR || spec.physicsIR || null;
        if (!nextIR && buildPhysicsIR && universeGraph) {
          nextIR = buildPhysicsIR({
            universeGraph,
            objects: spec.objects || [],
            params: spec.params || {},
            contract: spec.contract,
          });
        }
        const validationReceipt = overrides.validationReceipt || spec.validationReceipt || (
          nextIR && validatePhysicsIR ? validatePhysicsIR(nextIR) : null
        );
        if (nextIR && validationReceipt) {
          nextIR = {
            ...nextIR,
            receipt: {
              exact: validationReceipt.exact || [],
              approximate: validationReceipt.approximate || [],
              unresolved: validationReceipt.unresolved || [],
              unsupported: validationReceipt.unsupported || [],
            },
          };
        }
        const solverGraph = overrides.solverGraph || spec.solverGraph || (
          nextIR && compileSolverGraph ? compileSolverGraph(nextIR, validationReceipt) : null
        );
        const nextRenderIR = overrides.renderIR || spec.renderIR || (
          nextIR && solverGraph && compileRenderIR
            ? attachRenderIRPhaseInputs(compileRenderIR(nextIR, solverGraph, universeGraph), universeGraph)
            : null
        );
        const nextIntent = intent && promptParse && universeGraph
          ? { ...intent, promptParse, universeGraph }
          : intent;
        let generatedPhaseArtifacts = {};
        let runtimeContext = phase4Output ? runtimeContextFromPhase(phase4Output) : runtimeContextFromOptions({});
        let nextPhase4 = phase4Output || null;
        if (!nextPhase4) {
          const compatibilityPhase1 = withPhase1RetrievalEvidence(
            phaseArtifacts.phase1 || runPhase1RuntimeGate(prompt, { allowPrototypeFallback: true }),
            {
              semanticRag: intent.semanticRag,
              universeMatches: intent.universeMatches || [],
              intentBrief: intent.intentBrief || null,
              universeGraph,
              contract: spec.contract,
              components: spec.objects || [],
              visualSource: {
                specId: spec.id,
                templateId: spec.templateId,
                name: spec.name,
                kind: spec.kind,
                modules: spec.modules || [],
                objects: spec.objects || [],
                params: spec.params || {},
                contract: spec.contract || null,
              },
            }
          );
          runtimeContext = runtimeContextFromPhase(compatibilityPhase1);
          const compatibilityPhase2 = phaseArtifacts.phase2 || runPhase2LanguageGraph(compatibilityPhase1);
          const compatibilityPhase3 = runPhase3Retrieval(compatibilityPhase2, runtimeContext);
          nextPhase4 = runPhase4GroundedIntent(compatibilityPhase3, runtimeContext);
          generatedPhaseArtifacts = phaseArtifactSet(
            compatibilityPhase1,
            compatibilityPhase2,
            compatibilityPhase3,
            nextPhase4
          );
        }
        nextPhase4 = mergePhase4IntentBrief(nextPhase4, intent.intentBrief || null);
        const nextPhase5 = phaseArtifacts.phase5 || runPhase5SimulationCompile(nextPhase4, runtimeContext);
        const simulationCompile = nextPhase5.artifact && nextPhase5.artifact.simulationCompile || {};
        return {
          intent: nextIntent,
          promptParse,
          universeGraph,
          physicsIR: simulationCompile.physicsIR || nextIR,
          validationReceipt: simulationCompile.validationReceipt || validationReceipt,
          solverGraph: simulationCompile.solverGraph || solverGraph,
          renderIR: simulationCompile.renderIR || nextRenderIR,
          phaseArtifacts: mergePhaseArtifacts(phaseArtifacts, generatedPhaseArtifacts, phaseArtifactSet(nextPhase4, nextPhase5)),
        };
      }

    function attachRenderIRPhaseInputs(renderIR, universeGraph) {
        if (!renderIR || typeof renderIR !== 'object') return renderIR;
        return {
          ...renderIR,
          causalAffordances: Array.isArray(universeGraph && universeGraph.visualAffordances)
            ? universeGraph.visualAffordances.slice(0, 8).map((row) => ({ ...row }))
            : [],
          intentBriefReceipt: universeGraph && universeGraph.intentBrief
            ? intentBriefReceipt(universeGraph.intentBrief)
            : null,
          phaseInputs: {
            ...(renderIR.phaseInputs || {}),
            source: 'universeGraph.visualAffordances',
            neighboringIO: true,
          },
        };
      }

    function compilePhysicalSpec(spec) {
        const graph = spec.contract && spec.contract.graph || {};
        const renderProgram = spec.renderProgram || {};
        const solverPlan = renderProgram.solverPlan || solverPlanForGraph(graph);
        const solverGraph = spec.solverGraph || null;
        const solverChannels = solverGraph ? Object.keys(solverGraph.channels || {}) : [];
        const solverSteps = solverGraph ? solverGraph.steps || [] : [];
        const nodes = graph.nodes || [];
        // Prefer the executable solverGraph channels as the source of truth for state
        // hints; fall back to the legacy solverPlan only when no solverGraph compiled.
        // This keeps visual hints from desyncing with the authoritative execution graph.
        const visualStateHints = uniqueList([
          ...(solverGraph ? solverChannels : (solverPlan.state || [])),
          ...nodes.flatMap((node) => node.solverRequirements || []),
        ]);
        const intentBrief = spec.universeGraph && spec.universeGraph.intentBrief || null;
        const intentBriefLedger = intentBriefLedgerCounts(intentBrief);
        const visualPassHints = renderPassesForSolverPlan(solverPlan);
        const nodeIdsByType = (type) => nodes.filter((node) => node.nodeType === type).map((node) => node.id);
        return {
          schema: 'simulatte.physicalSpec.v1',
          sourceGraph: graph.schema || '',
          prompt: spec.renderIR && spec.renderIR.prompt || spec.universeGraph && spec.universeGraph.prompt || spec.name,
          materials: graphMaterialMap(nodes),
          operators: spec.physicsIR && spec.physicsIR.operators ? spec.physicsIR.operators : graph.operators || [],
          executionSource: solverGraph ? 'solverGraph' : 'solverPlan',
          executableSolverGraph: solverGraph ? {
            schema: solverGraph.schema,
            schedule: solverGraph.schedule || [],
            channelCount: solverChannels.length,
            stepCount: solverSteps.length,
            channels: solverChannels,
            steps: solverSteps.map((step) => ({
              operatorId: step.operatorId,
              operatorType: step.operatorType,
              solverId: step.solverId,
              stage: step.stage,
              reads: step.reads || [],
              writes: step.writes || [],
            })),
          } : null,
          stateChannels: solverChannels,
          stateTextures: solverGraph ? solverChannels : visualStateHints,
          visualStateHints,
          sources: nodeIdsByType('source'),
          sinks: nodeIdsByType('sink'),
          boundaries: nodeIdsByType('boundary'),
          sensors: nodeIdsByType('sensor'),
          controllers: nodeIdsByType('controller'),
          particles: particlePlansForNodes(nodes),
          fields: renderProgram.fields || [],
          readouts: spec.contract && spec.contract.readouts || [],
          renderPasses: solverGraph ? renderPassesForSolverGraph(solverGraph) : visualPassHints,
          visualPassHints: solverGraph ? visualPassHints : [],
          debugViews: debugViewsForGraph(graph),
          quality: graph.quality || { score: 1, residualTerms: [] },
          receipt: {
            classifier: spec.intent && spec.intent.classification ? spec.intent.classification.model.id : '',
            rerank: spec.intent && spec.intent.rerank ? spec.intent.rerank : null,
            rag: spec.intent && spec.intent.semanticRag ? spec.intent.semanticRag.model.id : '',
            doppler: dopplerReceipt(spec.intent && spec.intent.dopplerIntent),
            synthesis: synthesisReceipt(spec.intent && spec.intent.synthesis),
            renderer: renderProgram.rendererPlan ? renderProgram.rendererPlan.renderer : '',
            visualIdentity: renderProgram.provenance ? renderProgram.provenance.visualIdentity || null : null,
            visualGenome: renderProgram.provenance ? renderProgram.provenance.visualGenome || null : null,
            graphValidation: graph.validation ? graph.validation.status : 'unknown',
            validation: spec.validationReceipt || null,
            intentEvidenceCount: intentBriefLedger.evidenceCount,
            causalEdgeCount: intentBriefLedger.causalEdgeCount,
            causalAffordanceCount: intentBriefLedger.causalAffordanceCount,
            assumptionCount: intentBriefLedger.assumptionCount,
            unsupportedCount: intentBriefLedger.unsupportedCount,
            degradedCount: intentBriefLedger.degradedCount,
            intentBrief: intentBriefReceipt(intentBrief),
            physicsIR: spec.physicsIR ? spec.physicsIR.schema : '',
            solverGraph: spec.solverGraph ? spec.solverGraph.schema : '',
            renderIR: spec.renderIR ? spec.renderIR.schema : '',
          },
        };
      }

    function mergeUniverseGraphIntentBrief(universeGraph = null, authoritativeBrief = null) {
        if (!universeGraph || typeof universeGraph !== 'object') return universeGraph;
        if (!authoritativeBrief || typeof authoritativeBrief !== 'object') return universeGraph;
        const current = universeGraph.intentBrief || null;
        const authoritativeReceipt = intentBriefReceipt(authoritativeBrief);
        if (!authoritativeReceipt) return universeGraph;
        return {
          ...universeGraph,
          intentBrief: {
            ...(current || {}),
            ...authoritativeReceipt,
            activationSummary: current && current.activationSummary || authoritativeBrief.activationSummary || null,
            languageEvidence: current && current.languageEvidence || authoritativeBrief.languageEvidence || null,
            groundedInterpretation: current && current.groundedInterpretation || authoritativeBrief.groundedInterpretation || null,
            retrievedEvidence: current && current.retrievedEvidence || authoritativeBrief.retrievedEvidence || [],
            causalGraph: current && Array.isArray(current.causalGraph) && current.causalGraph.length
              ? current.causalGraph
              : authoritativeBrief.causalGraph || [],
            assumptions: current && current.assumptions || authoritativeBrief.assumptions || [],
            alternatives: current && current.alternatives || authoritativeBrief.alternatives || [],
            unsupported: current && current.unsupported || authoritativeBrief.unsupported || [],
            degradedTo: current && current.degradedTo || authoritativeBrief.degradedTo || [],
            negativeKnowledge: current && current.negativeKnowledge || authoritativeBrief.negativeKnowledge || [],
            visualIntent: current && current.visualIntent || authoritativeBrief.visualIntent || null,
          },
          visualAffordances: Array.isArray(universeGraph.visualAffordances) && universeGraph.visualAffordances.length
            ? universeGraph.visualAffordances
            : authoritativeBrief.visualIntent && Array.isArray(authoritativeBrief.visualIntent.affordances)
              ? authoritativeBrief.visualIntent.affordances.slice(0, 8).map((row) => ({ ...row }))
              : universeGraph.visualAffordances || [],
        };
      }

    Object.assign(scope, {
      scenePacketIdentitySummary,
      renderObligationProof,
      summarizeRenderObligationProof,
      renderPixelAudit,
      phase7PixelSamples,
      normalizePhase7PixelSamples,
      auditLivePixelSamples,
      normalizeSampleRgba,
      rgbaContrast,
      clampByte,
      scenePacketDrawableCount,
      createSpec,
      refineRenderProgramSceneKind,
      authoritativeVisualSceneKind,
      positiveLanguageText,
      fineSceneKindFromSpec,
      normalizeSpec,
      compileCompilerArtifacts,
      attachRenderIRPhaseInputs,
      compilePhysicalSpec,
      mergeUniverseGraphIntentBrief,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
