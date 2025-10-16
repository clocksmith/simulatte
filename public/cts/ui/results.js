import { formatCurrency, formatPercent } from '../utils.js';

export class ResultsPanel {
  constructor({ container, tablist }) {
    this.container = container;
    this.tablist = tablist;
    this.activeTab = 'cap-table';
    this.result = null;
    this.selectedStageId = null;

    this.tablist?.addEventListener('click', (event) => {
      const tab = event.target.closest('.cts-tab');
      if (!tab) return;
      const tabName = tab.getAttribute('data-tab');
      if (!tabName) return;
      this.setActiveTab(tabName);
    });
  }

  render(result, { selectedStageId } = {}) {
    this.result = result;
    this.selectedStageId = selectedStageId;
    this.renderActiveTab();
  }

  setActiveTab(tabName) {
    if (this.activeTab === tabName) return;
    this.activeTab = tabName;
    this.tablist?.querySelectorAll('.cts-tab').forEach((tab) => {
      const name = tab.getAttribute('data-tab');
      tab.setAttribute('aria-selected', String(name === this.activeTab));
    });
    this.renderActiveTab();
  }

  renderActiveTab() {
    if (!this.container) return;
    switch (this.activeTab) {
      case 'cap-table':
        this.renderCapTable();
        break;
      case 'dilution':
        this.renderDilution();
        break;
      case 'math':
        this.renderMath();
        break;
      case 'exit':
        this.renderExit();
        break;
      default:
        this.renderCapTable();
    }
  }

  renderCapTable() {
    const view = this.ensureView('cap-table');

    if (!this.result) {
      view.innerHTML = '<div class="cts-results-placeholder">No results yet.</div>';
      return;
    }
    const stage = this.findStageResult();
    const rows = stage?.capTable || [];
    const totalShares = stage?.capTable?.reduce((sum, row) => sum + (Number(row.shares) || 0), 0) || 0;

    const table = document.createElement('table');
    table.className = 'cts-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th scope="col">Stakeholder</th>
          <th scope="col">Class</th>
          <th scope="col" class="cts-cell--numeric">Shares</th>
          <th scope="col" class="cts-cell--numeric">Ownership</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.label}</td>
        <td>${row.class || '—'}</td>
        <td class="cts-cell--numeric">${Number(row.shares || 0).toLocaleString()}</td>
        <td class="cts-cell--numeric">${formatPercent(row.percent || (totalShares ? row.shares / totalShares : 0))}</td>
      `;
      tbody.appendChild(tr);
    });

    view.innerHTML = '';
    const heading = document.createElement('div');
    heading.className = 'cts-results-heading';
    heading.textContent = stage?.name ? `${stage.name} · Cap Table` : 'Cap Table';
    view.appendChild(heading);
    if (stage?.warnings?.length) {
      const warnings = document.createElement('div');
      warnings.className = 'cts-warning-strip';
      warnings.innerHTML = stage.warnings.map((warning) => `<span>${warning}</span>`).join('');
      view.appendChild(warnings);
    }
    view.appendChild(table);
  }

  renderDilution() {
    const view = this.ensureView('dilution');
    if (!this.result) {
      view.innerHTML = '<div class="cts-results-placeholder">No dilution data yet.</div>';
      return;
    }
    const list = document.createElement('ol');
    list.className = 'cts-dilution-list';

    (this.result.stageResults || []).forEach((stage) => {
      const foundersPercent = stage.capTable
        ? stage.capTable
            .filter((row) => /founder/i.test(row.label))
            .reduce((sum, row) => sum + (row.percent || 0), 0)
        : 0;
      const item = document.createElement('li');
      item.innerHTML = `
        <strong>${stage.name || stage.type}</strong>
        <span>Founder ownership: ${formatPercent(foundersPercent)}</span>
      `;
      list.appendChild(item);
    });

    view.innerHTML = '';
    const heading = document.createElement('div');
    heading.className = 'cts-results-heading';
    heading.textContent = 'Dilution Storyboard';
    view.appendChild(heading);
    view.appendChild(list);
  }

  renderMath() {
    const view = this.ensureView('math');
    if (!this.result) {
      view.innerHTML = '<div class="cts-results-placeholder">Math ledger will appear here.</div>';
      return;
    }
    const stage = this.findStageResult();
    const math = stage?.math || [];
    const list = document.createElement('ul');
    list.className = 'cts-math-ledger';
    math.forEach((entry) => {
      const item = document.createElement('li');
      item.textContent = entry;
      list.appendChild(item);
    });

    view.innerHTML = '';
    const heading = document.createElement('div');
    heading.className = 'cts-results-heading';
    heading.textContent = stage?.name ? `${stage.name} · Math` : 'Math Ledger';
    view.appendChild(heading);
    if (stage?.warnings?.length) {
      const warnings = document.createElement('div');
      warnings.className = 'cts-warning-strip';
      warnings.innerHTML = stage.warnings.map((warning) => `<span>${warning}</span>`).join('');
      view.appendChild(warnings);
    }
    view.appendChild(list);
  }

  renderExit() {
    const view = this.ensureView('exit');
    if (!this.result) {
      view.innerHTML = '<div class="cts-results-placeholder">Add an exit stage to see payouts.</div>';
      return;
    }
    const stage = this.findStageResult();
    const exitData = stage?.exitWaterfall || this.result.exitWaterfall;
    if (!exitData || !exitData.length) {
      view.innerHTML = '<div class="cts-results-placeholder">Add an exit stage to see payouts.</div>';
      return;
    }
    const table = document.createElement('table');
    table.className = 'cts-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th scope="col">Stakeholder</th>
          <th scope="col" class="cts-cell--numeric">Shares</th>
          <th scope="col" class="cts-cell--numeric">Payout</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');
    exitData.forEach((entry) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${entry.stakeholder}</td>
        <td class="cts-cell--numeric">${Number(entry.shares || 0).toLocaleString()}</td>
        <td class="cts-cell--numeric">${formatCurrency(entry.payout || 0, { maximumFractionDigits: 0 })}</td>
      `;
      tbody.appendChild(tr);
    });

    view.innerHTML = '';
    const heading = document.createElement('div');
    heading.className = 'cts-results-heading';
    heading.textContent = 'Exit Waterfall';
    view.appendChild(heading);
    if ((stage?.warnings && stage.warnings.length) || (this.result.warnings && this.result.warnings.length)) {
      const warnings = document.createElement('div');
      warnings.className = 'cts-warning-strip';
      const list = stage?.warnings?.length ? stage.warnings : this.result.warnings;
      warnings.innerHTML = list.map((warning) => `<span>${warning}</span>`).join('');
      view.appendChild(warnings);
    }
    view.appendChild(table);
  }

  ensureView(name) {
    // Remove any loading placeholders from the parent container
    const placeholder = this.container.querySelector('.cts-results-placeholder');
    if (placeholder) placeholder.remove();

    const selector = `[data-view="${name}"]`;
    let view = this.container.querySelector(selector);
    if (!view) {
      view = document.createElement('div');
      view.className = 'cts-results-view';
      view.dataset.view = name;
      this.container.appendChild(view);
    }
    this.container.querySelectorAll('.cts-results-view').forEach((panel) => {
      panel.dataset.visible = String(panel === view);
    });
    return view;
  }

  findStageResult() {
    if (!this.result || !Array.isArray(this.result.stageResults)) return null;
    if (this.selectedStageId) {
      return this.result.stageResults.find((stage) => stage.id === this.selectedStageId) || null;
    }
    return this.result.stageResults[this.result.stageResults.length - 1] || null;
  }
}
