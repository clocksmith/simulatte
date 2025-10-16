import { appBus } from './app-bus.js';
import { createStore } from './store.js';
import { runScenario } from './engine/index.js';
import { TimelinePanel } from './ui/timeline.js';
import { StageForm } from './ui/stage-form.js';
import { ResultsPanel } from './ui/results.js';
import { ModalHost } from './ui/modals.js';
import { loadDatabase, loadSnapshot, saveSnapshot } from './persistence/db.js';
import { listTemplates, instantiateTemplate } from './templates/catalog.js';
import { focusWithin, formatPercent, formatCurrency, structuredCopy, debounce } from './utils.js';

const store = createStore({ bus: appBus });

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    console.error('[CTS] Uncaught error', event.error || event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[CTS] Unhandled rejection', event.reason);
  });
}

let timelinePanel;
let stageForm;
let resultsPanel;
let currentSnapshot = null;
let modalHost;
const persistSnapshot = debounce((snapshot) => {
  const data = {
    scenarios: snapshot.scenarios,
    activeScenarioId: snapshot.activeScenarioId,
    selectedStageId: snapshot.selectedStageId,
    preferences: snapshot.preferences
  };
  saveSnapshot(data);
}, 350);

window.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
  console.log('[CTS] DOMContentLoaded fired, starting initialization...');
  try {
    console.log('[CTS] Step 1: Loading database...');
    await loadDatabase();

    console.log('[CTS] Step 2: Caching DOM...');
    cacheDom();

    console.log('[CTS] Step 3: Wiring theme toggle...');
    wireThemeToggle();

    console.log('[CTS] Step 4: Wiring mobile nav...');
    wireMobileNav();

    console.log('[CTS] Step 5: Creating modal host...');
    modalHost = new ModalHost({ root: document.getElementById('cts-modal-root') });

    console.log('[CTS] Step 6: Mounting modules...');
    mountModules();

    console.log('[CTS] Step 7: Subscribing to store...');
    store.subscribe(onStateChange);

    console.log('[CTS] Step 8: Loading persisted data...');
    const persisted = loadSnapshot();
    if (persisted) {
      console.log('[CTS] Found persisted data, hydrating...');
      store.dispatch({ type: 'state:hydrate', payload: persisted });
    } else {
      console.log('[CTS] No persisted data, will use defaults');
    }

    console.log('[CTS] Step 9: Checking for shared scenario...');
    maybeLoadSharedScenario();

    console.log('[CTS] Step 10: Initialization complete!');
    announce('CTS ready. Founding stage initialized.');
  } catch (error) {
    console.error('[CTS] Initialization failed at step:', error);
    console.error('[CTS] Error stack:', error.stack);
    showFatalError('Failed to initialize CTS. Please refresh the page.');
  }
}

function cacheDom() {
  const root = document.body;
  Object.assign(root.dataset, { initialized: 'true' });
}

function showFatalError(message) {
  const status = document.getElementById('cts-status');
  if (status) {
    status.textContent = `Error: ${message}`;
    status.style.color = 'var(--accent-red, #ff4444)';
  }
  const mainContent = document.querySelector('.cts-stage');
  if (mainContent) {
    mainContent.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 48px; text-align: center; border: 2px solid var(--accent-red, #ff4444); border-radius: 12px; background: rgba(255, 68, 68, 0.1);">
        <h2 style="color: var(--accent-red, #ff4444); margin: 0 0 16px 0;">⚠️ Error</h2>
        <p style="margin: 0; font-size: 1rem;">${message}</p>
        <button onclick="location.reload()" style="margin-top: 24px; padding: 12px 24px; background: var(--accent-red, #ff4444); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 0.95rem;">Reload Page</button>
      </div>
    `;
  }
}

function wireThemeToggle() {
  const themeButton = document.querySelector('[data-command="toggle-theme"]');
  if (themeButton) {
    themeButton.addEventListener('click', () => {
      const nextTheme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
      document.body.dataset.theme = nextTheme;
      store.dispatch({ type: 'preferences:update', payload: { theme: nextTheme } });
      announce(`Theme set to ${nextTheme}`);
    });
  }

  const templatesButton = document.querySelector('[data-command="open-templates"]');
  if (templatesButton) {
    templatesButton.addEventListener('click', () => {
      appBus.emit('templates:open');
    });
  }

  const compareButton = document.querySelector('[data-command="open-compare"]');
  if (compareButton) {
    compareButton.addEventListener('click', () => {
      appBus.emit('compare:open');
    });
  }
}

function wireMobileNav() {
  const buttons = document.querySelectorAll('.cts-mobile-nav__item[data-scroll-target]');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const selector = button.getAttribute('data-scroll-target');
      const target = selector ? document.querySelector(selector) : null;
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        console.warn('[CTS] mobile nav target missing', selector);
      }
    });
  });
}

function mountModules() {
  console.log('[CTS] mountModules: Looking for DOM elements...');
  const stageListEl = document.getElementById('cts-stage-list');
  const stageFormEl = document.getElementById('cts-stage-form');
  const stageMetaEl = document.getElementById('cts-stage-meta');
  const resultsRootEl = document.getElementById('cts-results-root');
  const tabsEl = document.querySelector('.cts-tabs');

  console.log('[CTS] mountModules: Found elements:', {
    stageList: !!stageListEl,
    stageForm: !!stageFormEl,
    stageMeta: !!stageMetaEl,
    resultsRoot: !!resultsRootEl,
    tabs: !!tabsEl
  });

  timelinePanel = new TimelinePanel({
    container: stageListEl,
    bus: appBus,
    store
  });
  console.log('[CTS] TimelinePanel created');

  stageForm = new StageForm({
    form: stageFormEl,
    metaTarget: stageMetaEl,
    bus: appBus,
    store
  });
  console.log('[CTS] StageForm created');

  resultsPanel = new ResultsPanel({
    container: resultsRootEl,
    tablist: tabsEl,
    bus: appBus
  });
  console.log('[CTS] ResultsPanel created');
}

function onStateChange(snapshot) {
  try {
    currentSnapshot = snapshot;
    const scenario = snapshot.scenarios[snapshot.activeScenarioId];
    if (snapshot.preferences?.theme) {
      document.body.dataset.theme = snapshot.preferences.theme;
    }
    timelinePanel.render(snapshot);
    stageForm.render({ scenario, stageId: snapshot.selectedStageId });
    runCalculations(scenario, snapshot.selectedStageId);
    persistSnapshot(snapshot);
  } catch (error) {
    console.error('[CTS] State change error', error);
    announce('Error updating display. Some data may not be current.');
  }
}

function runCalculations(scenario, selectedStageId) {
  if (!scenario) return;
  try {
    const result = runScenario(scenario, { untilStageId: selectedStageId });
    resultsPanel.render(result, { selectedStageId });
  } catch (error) {
    console.error('[CTS] runScenario failed', error);
    announce('Calculation error. Please check your stage parameters.');
    resultsPanel.render({
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      stageResults: [],
      capTable: [],
      totalShares: 0,
      exitWaterfall: null,
      warnings: [`Calculation failed: ${error.message || 'Unknown error'}`]
    }, { selectedStageId });
  }
}

function announce(message) {
  const status = document.getElementById('cts-status');
  if (!status) return;
  status.textContent = message;
}

appBus.on('stage:focus', (event) => {
  const { selector } = event.detail;
  focusWithin(document, selector);
});

appBus.on('command:dispatch', (event) => {
  const { command } = event.detail;
  if (!command) return;
  store.dispatch(command);
});

appBus.on('templates:open', () => openTemplatesModal());
appBus.on('compare:open', () => openCompareModal());
appBus.on('scenario:export-requested', () => openExportModal());

function openTemplatesModal() {
  if (!modalHost) return;
  const templates = listTemplates();
  modalHost.open({
    renderer(container, ctx) {
      container.innerHTML = '';
      const heading = document.createElement('h3');
      heading.textContent = 'Template Library';
      const description = document.createElement('p');
      description.textContent = 'Fork a predefined journey to explore different financing paths.';
      const list = document.createElement('div');
      list.className = 'cts-template-list';

      templates.forEach((template) => {
        const card = document.createElement('article');
        card.className = 'cts-template-card';
        card.innerHTML = `
          <header><h4>${template.name}</h4></header>
          <p>${template.description}</p>
          <footer>
            <button type="button" class="cts-button" data-template="${template.id}">Use Template</button>
          </footer>
        `;
        card.querySelector('button').addEventListener('click', () => {
          const scenario = instantiateTemplate(template.id);
          if (scenario) {
            store.dispatch({ type: 'scenario:insert', payload: { scenario } });
            announce(`${template.name} loaded.`);
          }
          ctx.close();
        });
        list.appendChild(card);
      });

      container.appendChild(heading);
      container.appendChild(description);
      container.appendChild(list);
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'cts-button';
      closeBtn.textContent = 'Close';
      closeBtn.addEventListener('click', () => ctx.close());
      container.appendChild(closeBtn);
    }
  });
}

function openCompareModal() {
  if (!modalHost) return;
  const scenarios = Object.values(currentSnapshot?.scenarios || {});
  if (!scenarios.length) return;
  const summaries = scenarios.map((scenario) => buildScenarioSummary(scenario));
  modalHost.open({
    renderer(container, ctx) {
      container.innerHTML = '';
      const heading = document.createElement('h3');
      heading.textContent = 'Scenario Comparison';
      const table = document.createElement('table');
      table.className = 'cts-table';
      table.innerHTML = `
        <thead>
          <tr>
            <th scope="col">Scenario</th>
            <th scope="col">Founder % (latest)</th>
            <th scope="col">Total Raised</th>
            <th scope="col">Rounds</th>
            <th scope="col">Exit Founder Value</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      const tbody = table.querySelector('tbody');
      summaries.forEach((summary) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${summary.name}</td>
          <td class="cts-cell--numeric">${summary.founderPercent}</td>
          <td class="cts-cell--numeric">${summary.totalRaised}</td>
          <td class="cts-cell--numeric">${summary.roundCount}</td>
          <td class="cts-cell--numeric">${summary.exitFounderValue}</td>
        `;
        tbody.appendChild(row);
      });
      container.appendChild(heading);
      container.appendChild(table);
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'cts-button';
      closeBtn.textContent = 'Close';
      closeBtn.addEventListener('click', () => ctx.close());
      container.appendChild(closeBtn);
    }
  });
}

function openExportModal() {
  if (!modalHost || !currentSnapshot) return;
  const scenario = currentSnapshot.scenarios[currentSnapshot.activeScenarioId];
  if (!scenario) return;
  const scenarioJson = JSON.stringify(structuredCopy(scenario), null, 2);

  modalHost.open({
    renderer(container, ctx) {
      container.innerHTML = '';
      const heading = document.createElement('h3');
      heading.textContent = `Export ${scenario.name}`;
      const textarea = document.createElement('textarea');
      textarea.value = scenarioJson;
      textarea.rows = 16;
      textarea.className = 'cts-export-textarea';

      const actions = document.createElement('div');
      actions.className = 'cts-export-actions';

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'cts-button';
      copyBtn.textContent = 'Copy JSON';
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(textarea.value);
          announce('Scenario JSON copied to clipboard.');
        } catch {
          announce('Copy failed; select text manually.');
        }
      });

      const downloadBtn = document.createElement('button');
      downloadBtn.type = 'button';
      downloadBtn.className = 'cts-button';
      downloadBtn.textContent = 'Download JSON';
      downloadBtn.addEventListener('click', () => {
        const blob = new Blob([textarea.value], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${scenario.name.replace(/\s+/g, '_').toLowerCase()}_cts.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      });

      const shareBtn = document.createElement('button');
      shareBtn.type = 'button';
      shareBtn.className = 'cts-button';
      shareBtn.textContent = 'Generate Share Link';
      shareBtn.addEventListener('click', () => {
        const latestScenario = currentSnapshot?.scenarios[currentSnapshot.activeScenarioId];
        if (!latestScenario) return;
        const shareFragment = createShareFragment(latestScenario);
        const url = `${window.location.origin}${window.location.pathname}#${shareFragment}`;
        textarea.value = url;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(url).then(() => {
            announce('Share link copied to clipboard.');
          }).catch(() => {
            announce('Share link ready. Copy manually if needed.');
          });
        } else {
          announce('Share link ready. Copy manually if needed.');
        }
      });

      const importLabel = document.createElement('label');
      importLabel.textContent = 'Import Scenario JSON';
      importLabel.className = 'cts-import-label';
      const importInput = document.createElement('input');
      importInput.type = 'file';
      importInput.accept = 'application/json';
      importInput.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        importScenarioFromJson(text, ctx);
      });

      actions.appendChild(copyBtn);
      actions.appendChild(downloadBtn);
      actions.appendChild(shareBtn);

      container.appendChild(heading);
      container.appendChild(textarea);
      container.appendChild(actions);
      importLabel.appendChild(importInput);
      container.appendChild(importLabel);
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'cts-button';
      closeBtn.textContent = 'Close';
      closeBtn.addEventListener('click', () => ctx.close());
      container.appendChild(closeBtn);
    }
  });
}

function buildScenarioSummary(scenario) {
  const result = runScenario(scenario);
  const latest = result.stageResults[result.stageResults.length - 1];
  const founderPercent = latest
    ? formatPercent(latest.capTable
        .filter((row) => /founder/i.test(row.label))
        .reduce((sum, row) => sum + (row.percent || 0), 0))
    : '—';
  const totalRaised = scenario.timeline.reduce((sum, stage) => {
    switch (stage.type) {
      case 'PRICED_ROUND':
        return sum + (Number(stage.params?.investment) || 0);
      case 'PRE_MONEY_SAFE':
      case 'POST_MONEY_SAFE':
        return sum + (Number(stage.params?.investment) || 0);
      case 'CONVERTIBLE_NOTE':
        return sum + (Number(stage.params?.principal) || 0);
      default:
        return sum;
    }
  }, 0);
  const exitFounderValue = result.exitWaterfall
    ? formatCurrency(result.exitWaterfall
        .filter((entry) => /founder/i.test(entry.stakeholder))
        .reduce((sum, entry) => sum + (entry.payout || 0), 0), { maximumFractionDigits: 0 })
    : '—';
  return {
    name: scenario.name,
    founderPercent,
    totalRaised: formatCurrency(totalRaised, { maximumFractionDigits: 0 }),
    roundCount: scenario.timeline.filter((stage) => stage.type === 'PRICED_ROUND').length,
    exitFounderValue
  };
}

function createShareFragment(scenario) {
  const payload = JSON.stringify(structuredCopy(scenario));
  const encoded = btoa(encodeURIComponent(payload));
  return `cts=${encoded}`;
}

function maybeLoadSharedScenario() {
  const hash = window.location.hash;
  const prefix = '#cts=';
  if (!hash.startsWith(prefix)) return;
  try {
    const encoded = hash.slice(prefix.length);
    const json = decodeURIComponent(atob(encoded));
    const scenario = JSON.parse(json);
    if (!scenario || !scenario.timeline) {
      throw new Error('Invalid scenario format');
    }
    store.dispatch({ type: 'scenario:insert', payload: { scenario } });
    announce('Shared scenario loaded successfully.');
  } catch (error) {
    console.error('Failed to load scenario from hash', error);
    announce('Unable to load shared scenario. The link may be corrupted.');
  } finally {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

function importScenarioFromJson(text, ctx) {
  try {
    const scenario = JSON.parse(text);
    store.dispatch({ type: 'scenario:insert', payload: { scenario } });
    announce('Scenario imported successfully.');
    ctx.close();
  } catch (error) {
    console.error('Import failed', error);
    announce('Import failed; invalid JSON.');
  }
}
