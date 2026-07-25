(function attachSimulatteConstructionPlacement(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('compositionGraph');
    function constructionGraphParts(graph = {}, palette = [], layoutVariant = {}) {
      const byRole = new Map();
      for (const nodeRow of graph.nodes || []) {
        const rows = byRole.get(nodeRow.role) || [];
        rows.push(nodeRow);
        byRole.set(nodeRow.role, rows);
      }
      const placements = new Map();
      for (const [roleId, rows] of byRole.entries()) {
        rows.forEach((nodeRow, index) => {
          const placement = constructionPlacementForRole(roleId, index, rows.length, graph.topologyId, layoutVariant);
          placements.set(nodeRow.id, {
            ...placement,
            size: nodeRow.size || placement.size,
            constraintIds: [],
          });
        });
      }
      const constraintReceipts = applyConstructionGraphConstraints(graph, byRole, placements);
      graph.constraints = constraintReceipts;
      const parts = [];
      const spread = Number(layoutVariant.spread || 1);
      const aspect = Number(layoutVariant.aspect || 1);
      const add = (nodeRow, placement, roleIndex) => {
        parts.push({
          ...scope.constructionGeometryPart(
            nodeRow.id,
            nodeRow.primitive,
            [placement.center[0] * spread, placement.center[1] * aspect],
            placement.size,
            nodeRow.role === 'sensor' ? palette[3] || palette[0] : palette[parts.length % Math.max(1, palette.length)],
            placement.rotation || 0
          ),
          order: parts.length,
          constructionRole: nodeRow.role,
          constructionRoleIndex: roleIndex,
          sourceHint: nodeRow.sourceHint || '',
          constructionConstraintIds: (placement.constraintIds || []).slice(),
          opacity: nodeRow.role === 'field' ? 0.2 : nodeRow.role === 'opening' ? 0.76 : 1,
        });
      };
      const roleDepth = ['field', 'core', 'panel', 'support', 'appendage', 'joint', 'opening', 'path', 'detail', 'sensor'];
      for (const [roleId, rows] of [...byRole.entries()].sort((a, b) => roleDepth.indexOf(a[0]) - roleDepth.indexOf(b[0]))) {
        rows.forEach((nodeRow, index) => add(nodeRow, placements.get(nodeRow.id), index));
      }
      return normalizeConstructionParts(parts);
    }

    function normalizeConstructionParts(parts = []) {
      if (!parts.length) return parts;
      const bounds = parts.map((part) => {
        const rotation = Number(part.rotation || 0);
        const width = Number(part.size && part.size[0] || 0.1);
        const height = Number(part.size && part.size[1] || 0.1);
        const halfWidth = (Math.abs(Math.cos(rotation)) * width + Math.abs(Math.sin(rotation)) * height) * 0.5;
        const halfHeight = (Math.abs(Math.sin(rotation)) * width + Math.abs(Math.cos(rotation)) * height) * 0.5;
        return [part.center[0] - halfWidth, part.center[1] - halfHeight,
          part.center[0] + halfWidth, part.center[1] + halfHeight];
      });
      const left = Math.min(...bounds.map((row) => row[0]));
      const top = Math.min(...bounds.map((row) => row[1]));
      const right = Math.max(...bounds.map((row) => row[2]));
      const bottom = Math.max(...bounds.map((row) => row[3]));
      const width = Math.max(0.01, right - left);
      const height = Math.max(0.01, bottom - top);
      const factor = Math.min(1, 0.94 / width, 0.94 / height);
      const center = [(left + right) * 0.5, (top + bottom) * 0.5];
      return parts.map((part) => ({
        ...part,
        center: [(part.center[0] - center[0]) * factor, (part.center[1] - center[1]) * factor],
        size: [part.size[0] * factor, part.size[1] * factor],
      }));
    }

    function applyConstructionGraphConstraints(graph = {}, byRole = new Map(), placements = new Map()) {
      return (graph.edges || []).map((edge, index) => {
        const [operation, sourceRole = '', targetRole = '', anchor = ''] = String(edge || '').split(':');
        const sources = byRole.get(sourceRole) || [];
        const targets = byRole.get(targetRole) || [];
        const anchorTargets = byRole.get(anchor) || [];
        const id = `constraint-${index + 1}`;
        const applied = constructionConstraintOperation(
          operation, sources, targets, anchor, placements, graph.topologyId, id, anchorTargets
        );
        return {
          id,
          operation,
          sourceRole,
          targetRole,
          anchor,
          sourceNodeIds: sources.map((row) => row.id),
          targetNodeIds: targets.map((row) => row.id),
          applied,
        };
      });
    }

    function constructionConstraintOperation(
      operation = '', sources = [], targets = [], anchor = '', placements = new Map(), topologyId = '', constraintId = '',
      anchorTargets = []
    ) {
      if (!sources.length) return false;
      const target = constructionTargetPlacement(targets, placements, anchor);
      const set = (nodeRow, next) => constructionSetPlacement(placements, nodeRow, next, constraintId);
      if (operation === 'attach') {
        sources.forEach((nodeRow, index) => set(nodeRow, constructionAttachedPlacement(
          placements.get(nodeRow.id), target, anchor, index, sources.length, nodeRow.role
        )));
        return true;
      }
      if (operation === 'mirror') {
        sources.forEach((nodeRow, index) => set(nodeRow, constructionMirroredPlacement(
          placements.get(nodeRow.id), target, anchor, index, sources.length, nodeRow.role
        )));
        return true;
      }
      if (operation === 'radial' || operation === 'orbit' || operation === 'surround') {
        const cephalopodFan = operation === 'radial' && /cephalopod/.test(topologyId) && anchor === 'below';
        const radius = operation === 'surround' ? 0.12 : operation === 'orbit' ? 0.36 : cephalopodFan ? 0.39 : 0.3;
        sources.forEach((nodeRow, index) => {
          const span = anchor === 'below' ? Math.PI * (cephalopodFan ? 0.92 : 0.72) : Math.PI * 2; const start = anchor === 'below' ? Math.PI * (cephalopodFan ? 0.04 : 0.14) : -Math.PI * 0.5;
          const angle = start + span * index / Math.max(1, sources.length - (anchor === 'below' ? 1 : 0));
          const current = placements.get(nodeRow.id) || {};
          set(nodeRow, {
            ...current,
            center: [target.center[0] + Math.cos(angle) * radius, target.center[1] + Math.sin(angle) * radius],
            rotation: operation === 'orbit' ? angle + Math.PI * 0.5 : angle,
            size: operation === 'surround'
              ? [Math.max(current.size[0], 0.72 - index * 0.06), Math.max(current.size[1], 0.48 - index * 0.04)]
              : cephalopodFan ? [Math.max(current.size[0], 0.46 + (index % 2) * 0.055), Math.min(current.size[1], 0.068)] : current.size,
          });
        });
        return true;
      }
      if (operation === 'chain') {
        const targetRotation = Number(target.rotation || 0);
        let endpoint = targets.length
          ? [
              target.center[0] + Math.cos(targetRotation) * target.size[0] * 0.34,
              target.center[1] - Math.sin(targetRotation) * target.size[0] * 0.34 - target.size[1] * 0.32,
            ]
          : [-0.3, 0.26];
        sources.forEach((nodeRow, index) => {
          const current = placements.get(nodeRow.id) || {};
          const rotation = anchor === 'boom'
            ? (index === 0 ? 0.78 : -0.52 - (index - 1) * 0.28)
            : -0.82 + index * 0.48;
          const length = Math.max(0.18, Number(current.size && current.size[0] || 0.38));
          const center = [
            endpoint[0] + Math.cos(rotation) * length * 0.5,
            endpoint[1] - Math.sin(rotation) * length * 0.5,
          ];
          set(nodeRow, { ...current, center, rotation });
          endpoint = [
            center[0] + Math.cos(rotation) * length * 0.5,
            center[1] - Math.sin(rotation) * length * 0.5,
          ];
        });
        return true;
      }
      if (operation === 'pair') {
        sources.forEach((nodeRow, index) => {
          const paired = targets[index % Math.max(1, targets.length)];
          const pairedPlacement = paired && placements.get(paired.id) || target;
          const rotation = Number(pairedPlacement.rotation || 0);
          const endOffset = /^(?:ends|chain-ends)$/.test(anchor) ? Number(pairedPlacement.size && pairedPlacement.size[0] || 0) * (anchor === 'chain-ends' ? 0.5 : 0.47) : 0;
          set(nodeRow, {
            ...(placements.get(nodeRow.id) || {}),
            center: [
              pairedPlacement.center[0] + Math.cos(rotation) * endOffset,
              pairedPlacement.center[1] - Math.sin(rotation) * endOffset,
            ],
          });
        });
        return true;
      }
      if (operation === 'parallel') {
        sources.forEach((nodeRow, index) => {
          const current = placements.get(nodeRow.id) || {};
          const vertical = anchor === 'vertical';
          const below = anchor === 'below';
          set(nodeRow, {
            ...current,
            center: vertical
              ? [target.center[0] - 0.075 + index * 0.05, target.center[1] - 0.04]
              : [target.center[0], target.center[1] + (below ? 0.25 : -0.18) + index * (below ? 0.08 : 0.12)],
            size: vertical
              ? [Math.max(current.size[0], target.size[1] * 1.35), Math.min(current.size[1], 0.025)]
              : [Math.max(current.size[0], 0.76), Math.min(current.size[1], below ? 0.11 : 0.07)],
            rotation: vertical ? 1.57 : 0,
          });
        });
        return true;
      }
      if (operation === 'span' && anchorTargets.length) {
        const targetPlacements = [...targets, ...anchorTargets].map((row) => placements.get(row.id)).filter(Boolean);
        const verticalExtent = (row) => {
          const rotation = Number(row.rotation || 0);
          return Math.abs(Math.sin(rotation)) * Number(row.size[0] || 0) * 0.5 +
            Math.abs(Math.cos(rotation)) * Number(row.size[1] || 0) * 0.5;
        };
        const top = Math.min(...targetPlacements.map((row) => row.center[1] - verticalExtent(row)));
        const bottom = Math.max(...targetPlacements.map((row) => row.center[1] + verticalExtent(row)));
        const centerX = targetPlacements.reduce((sum, row) => sum + row.center[0], 0) / targetPlacements.length;
        sources.forEach((nodeRow, index) => set(nodeRow, {
          ...(placements.get(nodeRow.id) || {}),
          center: [centerX + (index - (sources.length - 1) * 0.5) * 0.012, (top + bottom) * 0.5],
          size: [Math.max(0.2, bottom - top), 0.008],
          rotation: 1.57,
        }));
        return true;
      }
      if (operation === 'stack') {
        const spacing = anchor === 'spread' ? 0.24 : anchor === 'contour' ? 0.13 : 0.11;
        sources.forEach((nodeRow, index) => {
          const current = placements.get(nodeRow.id) || {};
          const centered = index - (sources.length - 1) * 0.5;
          set(nodeRow, { ...current, center: [target.center[0], target.center[1] + centered * spacing] });
        });
        return true;
      }
      if (operation === 'grid' || operation === 'network' || operation === 'scatter') {
        const columns = Math.max(2, Math.ceil(Math.sqrt(sources.length)));
        sources.forEach((nodeRow, index) => {
          const row = Math.floor(index / columns);
          const column = index % columns;
          const jitter = operation === 'scatter' ? ((index * 0.61803398875) % 1 - 0.5) * 0.08 : 0;
          set(nodeRow, {
            ...(placements.get(nodeRow.id) || {}),
            center: [
              target.center[0] + (column - (columns - 1) * 0.5) * 0.2 + jitter,
              target.center[1] + (row - (Math.ceil(sources.length / columns) - 1) * 0.5) * 0.17 - jitter,
            ],
          });
        });
        return true;
      }
      if (operation === 'inside') {
        sources.forEach((nodeRow, index) => set(nodeRow, {
          ...(placements.get(nodeRow.id) || {}),
          center: [target.center[0] + (index - (sources.length - 1) * 0.5) * 0.08, target.center[1]],
          size: [Math.min(0.26, target.size[0] * 0.42), Math.min(0.3, target.size[1] * 0.52)],
        }));
        return true;
      }
      if (operation === 'mesh') {
        sources.forEach((nodeRow, index) => {
          const angle = index * Math.PI * 2 / Math.max(1, sources.length);
          set(nodeRow, {
            ...(placements.get(nodeRow.id) || {}),
            center: [target.center[0] + Math.cos(angle) * 0.22, target.center[1] + Math.sin(angle) * 0.18],
          });
        });
        return true;
      }
      if (operation === 'through') {
        sources.forEach((nodeRow, index) => set(nodeRow, {
          ...(placements.get(nodeRow.id) || {}),
          center: [target.center[0], target.center[1] + (index - (sources.length - 1) * 0.5) * 0.13],
          size: [Math.max(0.76, target.size[0]), 0.055],
          rotation: index % 2 ? 0.12 : -0.12,
        }));
        return true;
      }
      return false;
    }

    function constructionTargetPlacement(targets = [], placements = new Map(), anchor = '') {
      const rows = targets.map((row) => placements.get(row.id)).filter(Boolean);
      if (!rows.length) return { center: [0, 0], size: [0.68, 0.54] };
      if (anchor === 'end' || anchor === 'end-down') return rows[rows.length - 1];
      if (anchor === 'start') return rows[0];
      if (anchor === 'top') return rows.slice().sort((a, b) => a.center[1] - b.center[1])[0];
      if (anchor === 'below') return rows.slice().sort((a, b) => b.center[1] - a.center[1])[0];
      return {
        center: [
          rows.reduce((sum, row) => sum + row.center[0], 0) / rows.length,
          rows.reduce((sum, row) => sum + row.center[1], 0) / rows.length,
        ],
        size: [Math.max(...rows.map((row) => row.size[0])), Math.max(...rows.map((row) => row.size[1]))],
      };
    }

    function constructionSetPlacement(placements, nodeRow, next = {}, constraintId = '') {
      const current = placements.get(nodeRow.id) || { center: [0, 0], size: [0.2, 0.2], rotation: 0, constraintIds: [] };
      placements.set(nodeRow.id, {
        ...current,
        ...next,
        center: (next.center || current.center).slice(),
        size: (next.size || current.size).slice(),
        constraintIds: scope.uniqueList([...(current.constraintIds || []), constraintId]),
      });
    }

    function constructionAttachedPlacement(current = {}, target = {}, anchor = '', index = 0, count = 1, role = '') {
      const centered = index - (count - 1) * 0.5;
      const targetRotation = Number(target.rotation || 0);
      const longitudinal = Math.max(0.2, Number(target.size && target.size[0] || 0.2) * 0.54) +
        Math.max(0, Number(current.size && current.size[0] || 0.2) * 0.2);
      const offsets = {
        start: [-Math.cos(targetRotation) * longitudinal, Math.sin(targetRotation) * longitudinal + centered * 0.13],
        end: [Math.cos(targetRotation) * longitudinal, -Math.sin(targetRotation) * longitudinal + centered * 0.13],
        'end-down': [Math.cos(targetRotation) * longitudinal, -Math.sin(targetRotation) * longitudinal + centered * 0.13],
        top: [centered * 0.24, -constructionVerticalAttachmentOffset(current, target)], 'top-close': [centered * 0.1, -constructionVerticalAttachmentOffset(current, target) * 0.72],
        'top-left': [-target.size[0] * 0.22 + centered * 0.18, -constructionVerticalAttachmentOffset(current, target)],
        below: [centered * 0.24, constructionVerticalAttachmentOffset(current, target)],
        front: [centered * 0.15, -0.08], side: [0.36, centered * 0.15], center: [0, 0],
      };
      const offset = offsets[anchor] || [centered * 0.18, 0];
      const vertical = anchor === 'top' && role === 'appendage';
      return {
        ...current,
        center: [target.center[0] + offset[0], target.center[1] + offset[1]],
        size: current.size,
        rotation: vertical ? 1.57 : anchor === 'center' ? 0 : anchor === 'end-down' ? targetRotation + 0.9 : current.rotation,
      };
    }

    function constructionVerticalAttachmentOffset(current = {}, target = {}) {
      const verticalExtent = (row) => {
        const size = row.size || [0.2, 0.2];
        const rotation = Number(row.rotation || 0);
        return Math.abs(Math.sin(rotation)) * Number(size[0] || 0) +
          Math.abs(Math.cos(rotation)) * Number(size[1] || 0);
      };
      return Math.max(0.12, verticalExtent(target) * 0.42 + verticalExtent(current) * 0.32);
    }

    function constructionMirroredPlacement(current = {}, target = {}, anchor = '', index = 0, count = 1, role = '') {
      const unit = count <= 1 ? 0 : (index - (count - 1) * 0.5) / Math.max(1, (count - 1) * 0.5);
      if (anchor === 'below') {
        return { ...current, center: [target.center[0] + unit * 0.36, target.center[1] + 0.31], rotation: 1.57 };
      }
      if (anchor === 'ends') {
        return { ...current, center: [target.center[0] + unit * 0.39, target.center[1] + 0.2] };
      }
      if (anchor === 'outer-sides' || anchor === 'inner-sides') {
        const radius = anchor === 'outer-sides'
          ? target.size[0] * 0.55 + current.size[0] * 0.65 : target.size[0] * 0.27;
        return { ...current, center: [target.center[0] + unit * radius, target.center[1]], rotation: (anchor === 'inner-sides' ? 1.57 : 0) + unit * 0.12 };
      }
      return {
        ...current,
        center: [target.center[0] + unit * 0.36, target.center[1]],
        rotation: role === 'support' ? 1.57 : unit * 0.14,
      };
    }

    function constructionPlacementForRole(roleId, index, count, topologyId, variant = {}) {
      const centered = index - (count - 1) / 2;
      const unit = count <= 1 ? 0 : centered / Math.max(1, (count - 1) / 2);
      const angle = index * 2.399963 + Number(variant.radialStep || 0.72);
      if (roleId === 'core') {
        return { center: [centered * 0.22, 0], size: [count > 1 ? 0.46 : 0.68, 0.54], rotation: 0 };
      }
      if (roleId === 'head') return { center: [0.34, -0.13 + centered * 0.15], size: [0.3, 0.3], rotation: 0 };
      if (roleId === 'support') {
        const x = count <= 2 ? unit * 0.27 : unit * 0.38;
        const y = /branching/.test(topologyId) ? 0.2 - index * 0.08 : 0.31;
        return { center: [x, y], size: [0.38, 0.1], rotation: 1.57 + unit * 0.08 };
      }
      if (roleId === 'appendage') {
        if (/articulated-machine/.test(topologyId)) {
          return { center: [-0.22 + index * 0.24, 0.22 - index * 0.2], size: [0.42, 0.09], rotation: -0.82 + index * 0.52 };
        }
        return { center: [Math.cos(angle) * 0.34, Math.sin(angle) * 0.27], size: [0.4, 0.085], rotation: angle };
      }
      if (roleId === 'joint') {
        if (/wheeled|conveyor/.test(topologyId)) {
          return { center: [unit * 0.36, 0.3 - Math.floor(index / 2) * 0.08], size: [0.2, 0.2], rotation: 0 };
        }
        return { center: [Math.cos(angle) * 0.29, Math.sin(angle) * 0.24], size: [0.18, 0.18], rotation: 0 };
      }
      if (roleId === 'panel') {
        return { center: [unit * 0.31, -0.1 + Math.floor(index / 2) * 0.2], size: [0.4, 0.27], rotation: unit * 0.22 };
      }
      if (roleId === 'sensor') {
        return { center: [0.23 + centered * 0.13, -0.22 + Math.abs(centered) * 0.025], size: [0.1, 0.1], rotation: 0 };
      }
      if (roleId === 'opening') return { center: [centered * 0.2, 0.14], size: [0.2, 0.25], rotation: 0 };
      if (roleId === 'path') return { center: [0, -0.24 + index * 0.17], size: [0.82, 0.055], rotation: index % 2 ? 0.08 : -0.08 };
      if (roleId === 'field') {
        return { center: [Math.cos(angle) * 0.16, Math.sin(angle) * 0.13], size: [0.72 - index * 0.08, 0.52 - index * 0.05], rotation: angle * 0.1 };
      }
      return { center: [Math.cos(angle) * 0.27, Math.sin(angle) * 0.22], size: [0.15, 0.14], rotation: angle * 0.16 };
    }


    root.SimulattePhaseModuleRegistry.define('compositionGraph', 'simulatte-construction-placement.js', {
      constructionGraphParts,
      normalizeConstructionParts,
      applyConstructionGraphConstraints,
      constructionConstraintOperation,
      constructionTargetPlacement,
      constructionSetPlacement,
      constructionAttachedPlacement,
      constructionVerticalAttachmentOffset,
      constructionMirroredPlacement,
      constructionPlacementForRole,
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
