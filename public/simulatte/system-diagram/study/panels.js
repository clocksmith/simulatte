// Study panels shown beside the Excalidraw canvas: stage, approach, problem, selection and file tabs,
// the stage stepper and dialogs. Everything shown comes from the authored document; nothing is generated.
(function (root) {
  'use strict';
  const {createElement: h, useEffect, useRef} = root.React;
  const join = (...parts) => parts.filter(Boolean).join(' ');

  function Section({title, children, hidden}) { return hidden ? null : h('section', {className: 'sw-section'}, title && h('h3', null, title), children); }
  function List({items, render = x => x}) { return items?.length ? h('ul', {className: 'sw-list'}, items.map((x, i) => h('li', {key: i}, render(x)))) : null; }
  function Code({block}) {
    return h('figure', {className: 'sw-code'}, h('figcaption', null, join(block.kind === 'api' ? 'API' : 'Pseudocode', block.language ? `· ${block.language}` : '')), h('pre', null, block.text));
  }
  function Shape({value}) {
    return h('dl', {className: 'sw-shape'}, Object.entries(value || {}).map(([k, v]) => [h('dt', {key: `k${k}`}, k), h('dd', {key: `v${k}`}, v)]));
  }
  function Evidence({evidence}) {
    return evidence ? h('span', {className: 'sw-evidence tested'}, `Reference test: ${evidence.testFile} › ${evidence.testName}`) : h('span', {className: 'sw-evidence'}, 'Specification: no executed evidence');
  }

  function StagePanel({concealed,solution, stageIndex, built, edited, onReset, showRemoved, onToggleRemoved, followups}) {
    if (stageIndex < 0) return h('div', {className: 'sw-panel'}, h('p', {className: 'sw-eyebrow'}, 'STARTING POINT'), h('h2', null, solution.title), h('p', null, 'The initial graph before the first stage.'));
    const stage = solution.stages[stageIndex], checks = new Map(solution.acceptanceCases.map(c => [c.id, c]));
    const c = built?.changes, count = (map, kind) => [...(map?.values() || [])].filter(v => v === kind).length;
    return h('div', {className: 'sw-panel'},
      h('p', {className: 'sw-eyebrow'}, `STAGE ${stageIndex + 1} OF ${solution.stages.length}`),
      h('h2', null, stage.title),
      h(Section, {title: 'Question'}, h('p', null, stage.question)),
      h(Section, {title: 'Why this stage',hidden:concealed}, h('p', null, stage.reason)),
      h(Section, {title: 'Explanation', hidden: concealed||!stage.explanation}, h('p', null, root.SimulatteStudyText.render(stage.explanation||'',h))),
      h(Section, {title: 'Board notes', hidden: concealed||!stage.notes?.length}, h(List, {items: stage.notes})),
      h(Section, {title: 'Follow-ups answered', hidden: !stage.followupIds?.length}, h(List, {items: stage.followupIds, render: id => followups?.get(id) ? `${followups.get(id).title}: ${followups.get(id).prompt}` : id})),
      h(Section, {title: 'Changes in this stage'},
        h('p', {className: 'sw-legend'}, h('span', {className: 'added'}, `${count(c?.node, 'added') + count(c?.node, 'merged')} added`), h('span', {className: 'changed'}, `${count(c?.node, 'changed')} changed`),
          h('span', {className: 'removed'}, `${c?.removedNodes.length || 0} removed`), h('span', null, `${count(c?.edge, 'added')} new connections`)),
        h(List, {items: built?.summary}),
        h('label', {className: 'sw-check'}, h('input', {type: 'checkbox', checked: showRemoved, onChange: e => onToggleRemoved(e.target.checked)}), 'Show removed components')),
      h(Section, {title: 'Code', hidden: concealed||!stage.code?.length}, (stage.code || []).map(block => h(Code, {key: block.id, block}))),
      h(Section, {title: 'Invariants', hidden: concealed||!stage.invariants?.length}, h(List, {items: stage.invariants})),
      h(Section, {title: 'Correctness checks', hidden: concealed||!stage.checkIds.length}, stage.checkIds.map(id => checks.get(id)).filter(Boolean).map(check => h('div', {className: 'sw-case', key: check.id},
        h('p', null, h('b', null, 'Given '), check.given), h('p', null, h('b', null, 'When '), check.when), h('p', null, h('b', null, 'Then '), check.then), h(Evidence, {evidence: check.evidence})))),
      h(Section, {title: 'Your edits'}, edited
        ? h('div', {className: 'sw-row'}, h('span', null, 'This stage has your edits. Other stages and the authored solution are unchanged.'), h('button', {className: 'sw-button', onClick: onReset}, 'Reset stage'))
        : h('p', {className: 'sw-muted'}, 'Authored layout. Edits you make here stay with this stage only.')),
      h('p', {className: 'sw-note'}, 'Authored design and correctness criteria. This view does not execute or prove the architecture.'));
  }

  function ApproachPanel({solution}) {
    return h('div', {className: 'sw-panel'},
      h('p', {className: 'sw-eyebrow'}, 'APPROACH'), h('h2', null, solution.title),
      h(Section, {title: 'Choose when'}, h('p', null, solution.chooseWhen)),
      h(Section, {title: 'Tradeoffs'}, h(List, {items: solution.tradeoffs})),
      h(Section, {title: 'Assumptions'}, h(List, {items: solution.assumptions})),
      h(Section, {title: 'APIs', hidden: !solution.apis.length}, solution.apis.map((api, i) => h('div', {className: 'sw-case', key: i},
        h('p', null, h('code', null, `${api.method} ${api.path}`)), h('p', null, h('b', null, 'Request '), api.request), h('p', null, h('b', null, 'Response '), api.response), h('p', null, h('b', null, 'Errors '), api.errors), h('p', {className: 'sw-muted'}, `Owner: ${api.ownerNodeId}`)))),
      h(Section, {title: 'Algorithms', hidden: !solution.algorithms.length}, solution.algorithms.map(a => h('div', {key: a.id},
        h(Code, {block: {kind: 'pseudocode', language: a.language, text: a.code}}), h('p', {className: 'sw-muted'}, `Owner: ${a.ownerNodeId}`), h(List, {items: a.guarantees})))));
  }

  function ProblemPanel({document, entry}) {
    const p = document.problem;
    return h('div', {className: 'sw-panel'},
      h('p', {className: 'sw-eyebrow'}, p.referenceId), h('h2', null, entry?.title || p.studyLabel),
      entry?.description && h('p', null, entry.description),
      entry?.attribution?.company && h('p', {className: 'sw-muted'}, `Reported for ${entry.attribution.company}${entry.provenance?.kind ? ` (${entry.provenance.kind})` : ''}.`),
      h(Section, {title: 'Study scope'}, h('p', null, h('b', null, p.studyLabel)), h('p', null, p.scope)),
      h(Section, {title: 'Requirements'}, h(List, {items: p.requirements, render: r => h('span', null, h('code', null, r.id), ' ', r.text)})),
      h(Section, {title: 'References', hidden: !document.references.length}, h(List, {items: document.references, render: r => h('span', null, h('a', {href: r.url, target: '_blank', rel: 'noopener noreferrer'}, r.title), ` — ${r.supports}`)})),
      h('p', {className: 'sw-note'}, `${document.provenance.note} Execution: ${document.execution.kind}.`));
  }

  function InspectPanel({info, onToggleCollapse, onConnect, onDisconnect}) {
    if (!info || info.kind === 'none') return h('div', {className: 'sw-panel'}, h('p', {className: 'sw-muted'}, 'Select a component or connection to see its definition, ports and contract.'));
    if (info.kind === 'multiple') return h('div', {className: 'sw-panel'}, h('p', null, `${info.count} elements selected.`));
    if (info.kind === 'sketch') return h('div', {className: 'sw-panel'}, h('h2', null, 'Your sketch'), h('p', {className: 'sw-muted'}, 'Drawings you add belong to this stage only. They are not part of the authored architecture.'));
    if (info.kind === 'arrow') return h('div', {className: 'sw-panel'}, h('h2', null, 'Your arrow'),
      info.connection
        ? [h('p', {key: 'c'}, `Typed connection: ${info.connection.contractId} from ${info.connection.fromPortId} to ${info.connection.toPortId}.`), h(Shape, {key: 's', value: info.contract?.request}), h('button', {key: 'b', className: 'sw-button', onClick: onDisconnect}, 'Make it a sketch again')]
        : info.options.length
          ? [h('p', {key: 'p'}, 'Choose the contract this arrow carries:'), info.options.map(o => h('button', {key: o.contractId + o.toPortId, className: 'sw-button block', onClick: () => onConnect(o)}, `${o.contractId}  (${o.fromPortId} → ${o.toPortId})`))]
          : h('p', {className: 'sw-warning'}, info.reason));
    const {node, definition, subsystem} = info;
    if (info.kind === 'edge') return h('div', {className: 'sw-panel'},
      h('p', {className: 'sw-eyebrow'}, `CONNECTION · ${info.edge.mode}`), h('h2', null, info.edge.label || info.edge.contractId),
      h('p', null, `${info.from?.label} (${info.edge.from.portId}) → ${info.to?.label} (${info.edge.to.portId})`),
      info.change && h('p', {className: `sw-change ${info.change}`}, `${info.change} in this stage`),
      h(Section, {title: `Request · ${info.edge.contractId} v${info.contract?.version}`}, h(Shape, {value: info.contract?.request})),
      h(Section, {title: 'Response'}, h(Shape, {value: info.contract?.response})));
    if (info.kind === 'mapping') return h('div', {className: 'sw-panel'}, h('h2', null, 'Exposed port mapping'), h('p', null, `${info.port.id} (${info.port.direction}, ${info.port.contractId}) maps to ${info.port.target.nodeId}/${info.port.target.portId}.`));
    return h('div', {className: 'sw-panel'},
      h('p', {className: 'sw-eyebrow'}, `${definition.extends.id.replace('core.', '').toUpperCase()} · ${definition.id} v${definition.version}`),
      h('h2', null, node.label),
      info.change && h('p', {className: `sw-change ${info.change}`}, `${info.change} in this stage`),
      node.lineageIds && h('p', null, `Merged from ${node.lineageIds.join(', ')}.`),
      node.parentId && h('p', {className: 'sw-muted'}, `Inside ${info.parent?.label || node.parentId}.`),
      h(Section, {title: 'Responsibility'}, h('p', null, definition.responsibility)),
      h(Section, {title: 'Owns state', hidden: !definition.stateOwnership.length}, h(List, {items: definition.stateOwnership})),
      h(Section, {title: 'Ports'}, h(List, {items: definition.ports, render: p => h('span', null, h('code', null, p.direction), ` ${p.id} · ${p.contractId}`)})),
      subsystem && h(Section, {title: `Subsystem ${subsystem.id}`},
        h(List, {items: subsystem.ports, render: q => `${q.id} → ${q.target.nodeId}/${q.target.portId}`}),
        h('button', {className: 'sw-button', onClick: onToggleCollapse}, info.collapsed ? 'Expand subsystem' : 'Collapse subsystem')));
  }

  function FilePanel({saveStatus, editedStages, outdated, onImport, onExport, onExportAuthored, onUsePublished}) {
    return h('div', {className: 'sw-panel'},
      h('p', {className: 'sw-eyebrow'}, 'FILE'), h('h2', null, 'Workspace file'),
      h('p', {className: 'sw-status', role: 'status'}, saveStatus),
      h('p', {className: 'sw-muted'}, `${editedStages} edited stage${editedStages === 1 ? '' : 's'}. Browser storage is not a backup; export to keep a copy.`),
      outdated && h('p', {className: 'sw-warning'}, 'Your saved workspace uses an earlier version of this authored solution.'),
      h('div', {className: 'sw-stack'},
        h('button', {className: 'sw-button', onClick: onImport}, 'Import JSON…'),
        h('button', {className: 'sw-button primary', onClick: onExport}, 'Export workspace (authored + your edits)'),
        h('button', {className: 'sw-button', onClick: onExportAuthored}, 'Export authored document only'),
        h('button', {className: 'sw-button', onClick: onUsePublished}, 'Discard edits and load the published version')));
  }

  // Arrows come first so they never move when the stage title changes length.
  function Stepper({stageIndex, minIndex, count, title, edited, onStep, onReset}) {
    return h('div', {className: 'sw-stepper', role: 'group', 'aria-label': 'Stage'},
      h('button', {className: 'sw-icon', disabled: stageIndex <= minIndex, onClick: () => onStep(-1), 'aria-label': 'Previous stage', title: 'Previous stage · Page Up (Mac laptop: Fn+↑)', 'aria-keyshortcuts':'PageUp'}, '‹', h('kbd',{className:'sw-key-hint','aria-hidden':true},'PgUp')),
      h('button', {className: 'sw-icon', disabled: stageIndex >= count - 1, onClick: () => onStep(1), 'aria-label': 'Next stage', title: 'Next stage · Page Down (Mac laptop: Fn+↓)', 'aria-keyshortcuts':'PageDown'}, '›', h('kbd',{className:'sw-key-hint','aria-hidden':true},'PgDn')),
      h('span', {className: 'sw-stage-title'}, h('b', null, stageIndex < 0 ? 'Start' : `${stageIndex + 1}/${count}`), ' ', title),
      edited && h('button', {className: 'sw-pill', onClick: onReset, title: 'Reset this stage to the authored layout'}, 'Edited · reset'));
  }

  function Pickers({catalogue, referenceId, solutions, solutionId, onProblem, onSolution}) {
    return h('div', {className: 'sw-pickers'},
      h('select', {'aria-label': 'Problem', value: referenceId || '', onChange: e => onProblem(e.target.value)}, catalogue.map(p => h('option', {key: p.referenceId, value: p.referenceId}, `${p.referenceId} ${p.title}`))),
      h('select', {'aria-label': 'Approach', value: solutionId || '', onChange: e => onSolution(e.target.value), disabled: !solutions?.length}, (solutions || []).map(s => h('option', {key: s.id, value: s.id}, s.title))));
  }

  // Native modal dialog. Keys typed inside never reach the canvas shortcuts.
  function Dialog({open, title, children, actions, onClose}) {
    const ref = useRef(null);
    useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
    return h('dialog', {ref, className: 'sw-dialog', onClose, onCancel: e => { e.preventDefault(); onClose(); }, onKeyDown: e => e.nativeEvent.stopPropagation()},
      h('h2', null, title), children,
      h('div', {className: 'sw-actions'}, (actions || []).map(a => h('button', {key: a.label, className: join('sw-button', a.primary && 'primary'), onClick: a.onClick}, a.label))));
  }

  root.SimulatteStudyPanels = Object.freeze({StagePanel, ApproachPanel, ProblemPanel, InspectPanel, FilePanel, Stepper, Pickers, Dialog});
})(globalThis);
