/* Leaderboard table, Pareto chart and per-task Waffle, all from the same selected results. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const scoreNames = {overall: 'Overall', request: 'Request', browser: 'Browser', system: 'System'};
  const resourceNames = {cost: 'cost (USD)', tokens: 'tokens (millions)', turns: 'agent turns'};
  const boardData = JSON.parse($('#leaderboard-data').textContent);
  const taskData = JSON.parse($('#waffle-data').textContent);
  const contextPicker = $('#waffle-context');
  const initialContext = new URLSearchParams(location.search).get('context');
  contextPicker.value = ['overview', '1m', '200k'].includes(initialContext) ? initialContext : 'overview';
  let models = boardData.views[contextPicker.value];
  let sortKey = 'overall', descending = true;
  const tabs = $$('[data-view]');
  const panels = $$('.result-panel');
  let activeView = 'table';
  const company = $('#results-company');
  Array.from(new Set(models.map(m => m.org))).forEach(org => {
    const option = document.createElement('option'); option.value = org; option.textContent = org; company.appendChild(option);
  });
  const visibleModels = () => models.filter(m => company.value === 'all' || m.org === company.value);
  const format = (value, resource) => resource === 'cost' ? '$' + value.toLocaleString('en-US', {minimumFractionDigits: 1, maximumFractionDigits: 1})
    : resource === 'tokens' ? value.toLocaleString('en-US', {maximumFractionDigits: 1}) + 'M'
    : value.toLocaleString('en-US', {maximumFractionDigits: 1});

  const tooltip = document.createElement('div');
  tooltip.className = 'result-tooltip'; tooltip.id = 'result-tooltip'; tooltip.setAttribute('role', 'tooltip'); tooltip.hidden = true; document.body.appendChild(tooltip);
  let tooltipHideTimer, tooltipSource;
  const hideTooltip = () => { clearTimeout(tooltipHideTimer); tooltip.hidden = true; tooltipSource = null; };
  const scheduleTooltipHide = () => {
    clearTimeout(tooltipHideTimer);
    tooltipHideTimer = setTimeout(() => {
      if (!tooltip.matches(':hover') && !tooltip.contains(document.activeElement) && document.activeElement !== tooltipSource) hideTooltip();
    }, 200);
  };
  tooltip.addEventListener('pointerenter', () => clearTimeout(tooltipHideTimer));
  tooltip.addEventListener('pointerleave', scheduleTooltipHide);
  const bindTooltip = (element, html) => {
    element.setAttribute('aria-describedby', tooltip.id);
    const show = event => {
      clearTimeout(tooltipHideTimer); tooltipSource = element;
      tooltip.innerHTML = html; tooltip.hidden = false;
      const rect = element.getBoundingClientRect();
      const width = tooltip.offsetWidth, height = tooltip.offsetHeight;
      const x = Number.isFinite(event.clientX) && event.clientX > 0 ? event.clientX : rect.left + rect.width / 2;
      const y = Number.isFinite(event.clientY) && event.clientY > 0 ? event.clientY : rect.top;
      tooltip.style.left = Math.max(8, Math.min(innerWidth - width - 8, x + 15)) + 'px';
      tooltip.style.top = Math.max(8, Math.min(innerHeight - height - 8, y + 15)) + 'px';
    };
    element.addEventListener('pointerenter', show); element.addEventListener('focus', show);
    element.addEventListener('pointerleave', scheduleTooltipHide);
    element.addEventListener('blur', scheduleTooltipHide);
  };
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hideTooltip(); });
  window.addEventListener('scroll', hideTooltip, true);
  const modelTooltip = model => `<strong>${escape(model.name)}</strong><span>${escape(model.org)}</span>`;

  function showView(view, updateURL = true) {
    if (!['table', 'pareto', 'waffle'].includes(view)) view = 'table';
    company.closest('label').hidden = view === 'waffle';
    activeView = view; hideTooltip();
    tabs.forEach(tab => { const selected = tab.dataset.view === view; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; });
    panels.forEach(panel => { panel.hidden = panel.id !== `result-${view}`; });
    if (view === 'table') renderTable();
    if (view === 'pareto') renderPareto();
    if (view === 'waffle') renderWaffle();
    const csv = $('#board-csv');
    csv.href = view === 'waffle' ? `data/waffle-${contextPicker.value}.csv` : `data/leaderboard-${contextPicker.value}.csv`;
    csv.querySelector('span').textContent = view === 'waffle' ? 'Per-task CSV' : 'CSV';
    if (updateURL) {
      try { const url = new URL(location.href); if (view === 'table') url.searchParams.delete('view'); else url.searchParams.set('view', view); history.replaceState(null, '', url); } catch (_) { /* File previews may not support history. */ }
    }
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => showView(tab.dataset.view));
    tab.addEventListener('keydown', event => {
      let target;
      if (event.key === 'ArrowRight') target = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') target = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') target = 0;
      if (event.key === 'End') target = tabs.length - 1;
      if (target === undefined) return;
      event.preventDefault(); tabs[target].focus(); showView(tabs[target].dataset.view);
    });
  });

  function renderTable() {
    const visible = visibleModels().slice().sort((a, b) => {
      if (a[sortKey] === null || b[sortKey] === null) return Number(a[sortKey] === null) - Number(b[sortKey] === null) || b.overall - a.overall;
      return (a[sortKey] - b[sortKey]) * (descending ? -1 : 1) || b.overall - a.overall;
    });
    $('#board-body').innerHTML = WebsiteBenchLeaderboard.renderRows(visible);
    $$('#board thead th').forEach(th => th.removeAttribute('aria-sort'));
    const active = $(`#board [data-sort="${sortKey}"]`);
    if (active) active.parentElement.setAttribute('aria-sort', descending ? 'descending' : 'ascending');
  }
  company.addEventListener('change', () => showView(activeView, false));
  $('#board').addEventListener('click', event => {
    const button = event.target.closest('[data-sort]'); if (!button) return;
    const key = button.dataset.sort;
    descending = key === sortKey ? !descending : Object.keys(scoreNames).includes(key); sortKey = key; renderTable();
  });

  function renderPareto() {
    hideTooltip();
    const resource = $('#pareto-resource').value, score = $('#pareto-score').value;
    const chart = $('#pareto-chart'), list = $('#pareto-list');
    const candidates = visibleModels();
    const visible = candidates.filter(m => m[resource] !== null && m[score] !== null && ($('#pareto-scale').value !== 'log' || m[resource] > 0));
    if (!visible.length) { chart.innerHTML = '<p class="chart-empty">No model in this selection has both a score and a recorded resource.</p>'; list.innerHTML = ''; $('#pareto-summary').textContent = ''; return; }
    const narrow = chart.clientWidth < 600;
    chart.classList.toggle('is-narrow', narrow);
    const log = $('#pareto-scale').value === 'log';
    const full = $('#pareto-range').value === 'full';
    const frontier = visible.filter(a => !visible.some(b => b[resource] <= a[resource] && b[score] >= a[score] && (b[resource] < a[resource] || b[score] > a[score]))).sort((a, b) => a[resource] - b[resource]);
    const frontierIDs = new Set(frontier.map(m => m.id));
    const [width, height, left, right, top, bottom] = narrow ? [420, 360, 50, 18, 18, 60] : [1080, 490, 76, 44, 32, 66];
    const plotW = width - left - right, plotH = height - top - bottom;
    const maxValue = Math.max(0.000001, ...visible.map(m => m[resource]));
    const minValue = Math.min(...visible.map(m => m[resource]));
    const niceStep = value => { const power = 10 ** Math.floor(Math.log10(value)); const fraction = value / power; return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power; };
    const linearStep = niceStep(maxValue * 1.15 / (narrow ? 4 : 5));
    const xMin = log ? minValue * .6 : 0, xMax = log ? maxValue * 1.5 : Math.ceil(maxValue * 1.15 / linearStep) * linearStep;
    const yMax = full ? 100 : Math.min(100, Math.max(10, Math.ceil(Math.max(...visible.map(m => m[score])) * 1.23 / 5) * 5));
    const yStep = yMax <= 35 ? 5 : yMax <= 70 ? 10 : 20;
    const X = value => left + (log ? (Math.log(value) - Math.log(xMin)) / (Math.log(xMax) - Math.log(xMin)) : value / xMax) * plotW;
    const Y = value => top + (1 - value / yMax) * plotH;
    const xTicks = [];
    if (log) {
      for (let p = Math.floor(Math.log10(xMin)); p <= Math.ceil(Math.log10(xMax)); p++) for (const base of narrow ? [1, 3] : [1, 2, 5]) {
        const tick = base * 10 ** p; if (tick >= xMin && tick <= xMax) xTicks.push(tick);
      }
    } else for (let tick = 0; tick <= xMax; tick += linearStep) xTicks.push(tick);
    let svg = `<svg viewBox="0 0 ${width} ${height}" aria-labelledby="pareto-title" aria-describedby="pareto-description" role="group"><title id="pareto-title">${scoreNames[score]} pass rate versus mean ${resourceNames[resource]} per task</title><desc id="pareto-description">${visible.length} models, ${frontier.length} on the Pareto frontier. Lower resource use and a higher pass rate are better. ${log ? 'Logarithmic' : 'Linear'} horizontal axis.</desc>`;
    for (let tick = 0; tick <= yMax; tick += yStep) svg += `<line class="plot-grid" x1="${left}" y1="${Y(tick)}" x2="${width - right}" y2="${Y(tick)}"/><text class="plot-tick" x="${left - 10}" y="${Y(tick) + 4}" text-anchor="end">${tick}%</text>`;
    if (yMax % yStep) svg += `<text class="plot-tick" x="${left - 10}" y="${top + 4}" text-anchor="end">${yMax}%</text>`;
    xTicks.forEach(tick => { svg += `<line class="plot-grid" x1="${X(tick)}" y1="${top}" x2="${X(tick)}" y2="${height - bottom}"/><text class="plot-tick" x="${X(tick)}" y="${height - bottom + 22}" text-anchor="middle">${format(tick, resource)}</text>`; });
    svg += `<line class="plot-axis" x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}"/><line class="plot-axis" x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}"/>`;
    if (frontier.length > 1) svg += `<polyline class="frontier-line" points="${frontier.map(m => `${X(m[resource])},${Y(m[score])}`).join(' ')}"/>`;
    svg += `<text class="axis-title" x="${left + plotW / 2}" y="${height - 10}" text-anchor="middle">Mean ${resourceNames[resource]} per task${narrow ? '' : ` · ${log ? 'log' : 'linear'} scale`}</text><text class="axis-title" transform="translate(${narrow ? 13 : 18} ${top + plotH / 2}) rotate(-90)" text-anchor="middle">${scoreNames[score]} pass rate</text>`;
    const points = visible.map(m => ({model: m, x: X(m[resource]), y: Y(m[score])}));
    if (!narrow) {
      // Place each label where it overlaps no other label or point.
      const boxes = [];
      const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      [...points].sort((a, b) => b.y - a.y).forEach(point => {
        const m = point.model, value = `${m[score].toFixed(1)}% · ${format(m[resource], resource)}`, w = Math.max(m.short.length * 6.8, value.length * 6.4) + 10, h = 34;
        const spots = [[24, -40], [24, 10], [-w - 24, -40], [-w - 24, 10], [24, -80], [-w - 24, -80], [24, 48], [-w - 24, 48], [24, -120], [-w - 24, -120]];
        const box = spots.map(([dx, dy]) => ({x: Math.max(left + 4, Math.min(width - right - w, point.x + dx)), y: Math.max(top + 4, Math.min(height - bottom - h - 4, point.y + dy)), w, h}))
          .find(b => !boxes.some(other => intersects(b, other)) && !points.some(other => intersects(b, {x: other.x - 17, y: other.y - 17, w: 34, h: 34})))
          || {x: Math.max(left + 4, Math.min(width - right - w, point.x + 24)), y: Math.max(top + 4, point.y - 40), w, h};
        boxes.push(box);
        const endX = point.x < box.x ? box.x - 4 : point.x > box.x + w ? box.x + w + 4 : box.x + w / 2;
        const endY = point.y < box.y ? box.y : point.y > box.y + h ? box.y + h : box.y + h / 2;
        svg += `<g class="plot-label"><line x1="${point.x}" y1="${point.y}" x2="${endX}" y2="${endY}"/><text x="${box.x}" y="${box.y + 12}">${escape(m.short)}</text><text class="plot-value" x="${box.x}" y="${box.y + 28}">${escape(value)}</text></g>`;
      });
    }
    const r = narrow ? 13 : 15, logo = narrow ? 14 : 18;
    points.forEach(({model: m, x, y}) => {
      const onFrontier = frontierIDs.has(m.id);
      svg += `<g class="plot-point${onFrontier ? ' on-frontier' : ''}" tabindex="0" data-model="${escape(m.id)}" aria-label="${escape(m.name)}: ${m[score].toFixed(1)}% ${scoreNames[score]} pass rate, ${format(m[resource], resource)} mean ${resourceNames[resource]} per task${onFrontier ? ', on the Pareto frontier' : ''}"><circle cx="${x}" cy="${y}" r="${r}"/><image class="plot-logo" href="${escape(m.logo)}" x="${x - logo / 2}" y="${y - logo / 2}" width="${logo}" height="${logo}"/></g>`;
    });
    svg += '</svg>';
    chart.innerHTML = svg;
    chart.querySelectorAll('.plot-point').forEach(point => {
      const m = visible.find(model => model.id === point.dataset.model);
      bindTooltip(point, modelTooltip(m) + `<dl><div><dt>${scoreNames[score]} pass rate</dt><dd>${m[score].toFixed(1)}%</dd></div><div><dt>Mean ${resourceNames[resource]} / task</dt><dd>${format(m[resource], resource)}</dd></div></dl><span class="tooltip-status">${frontierIDs.has(m.id) ? 'On the Pareto frontier' : 'Another model scores higher for less'}</span>`);
    });
    list.innerHTML = narrow ? visible.slice().sort((a, b) => b[score] - a[score]).map(m => `<li><img class="model-logo" src="${escape(m.logo)}" alt="" width="18" height="18"><b>${escape(m.short)}${frontierIDs.has(m.id) ? '<small>frontier</small>' : ''}</b><span>${m[score].toFixed(1)}% · ${format(m[resource], resource)}</span></li>`).join('') : '';
    $('#pareto-summary').textContent = `${visible.length} of ${candidates.length} models · ${frontier.length} on the frontier`;
  }

  const tasks = taskData.tasks;
  const waffleModels = taskData.models;
  const entryFor = (task, model) => task.results[model.id].contexts[model.variable_context ? contextPicker.value : 'recorded'];
  const trialScore = entry => entry.status === 'scored' ? 100 * entry.passed / entry.total : null;
  // Calibrated shades: separate low scores from the middle range without clipping high scores
  // or normalizing to the maximum. The three ramp colours are theme tokens (--ramp-0 to --ramp-2):
  // pale grey through README slate to ink on light pages, and the reverse on dark pages.
  const shadeStops = [[0, 0], [5, .107], [10, .254], [25, .607], [50, .869], [100, 1]];
  const scoreColor = score => {
    const index = Math.max(1, shadeStops.findIndex(([value]) => value >= score));
    const [low, a] = shadeStops[index - 1], [high, b] = shadeStops[index];
    const u = a + (b - a) * (score - low) / (high - low);
    const [from, to, t] = u < .5 ? [0, 1, u / .5] : [1, 2, (u - .5) / .5];
    return `color-mix(in srgb, var(--ramp-${to}) ${(100 * t).toFixed(1)}%, var(--ramp-${from}))`;
  };
  const contextLabel = value => value === '1m' ? '1M' : value === '200k' ? '200K' : 'recorded';
  const missingText = entry => entry.failure_kind === 'timeout' ? 'The run timed out' : entry.failure_kind === 'error' ? 'The run or its evaluation failed' : 'No result';
  const summarize = entries => {
    const scores = entries.map(trialScore).filter(score => score !== null);
    return {mean: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null, count: scores.length};
  };
  const poolEntries = entries => {
    const known = entries.filter(e => e.status === 'scored');
    const passed = known.reduce((sum, e) => sum + e.passed, 0), total = known.reduce((sum, e) => sum + e.total, 0);
    return {mean: total ? 100 * passed / total : null, count: known.length};
  };
  const byMeanDescending = (a, b) => a.mean === null || b.mean === null
    ? Number(a.mean === null) - Number(b.mean === null) || a.name.localeCompare(b.name)
    : b.mean - a.mean || a.name.localeCompare(b.name);
  let waffleEnlarged = false;

  function renderWaffle() {
    hideTooltip();
    // Rank both axes from scored cells in the selected context. Models pool test counts;
    // tasks average the model pass rates. Cells without a result are left out, not zero.
    const visible = waffleModels.map(model => ({...model, ...poolEntries(tasks.map(task => entryFor(task, model)))})).sort(byMeanDescending);
    const rows = tasks.map(task => ({task, name: task.name, ...summarize(visible.map(model => entryFor(task, model)))})).sort(byMeanDescending);
    const chart = $('#waffle-chart');
    const columns = innerWidth >= 900 ? 2 : 1;
    const blockSize = Math.ceil(tasks.length / columns);
    const pitch = waffleEnlarged ? 23 : columns === 2 ? Math.max(14, Math.min(16, Math.floor((innerHeight - 300) / blockSize))) : 12;
    const labelWidth = innerWidth < 500 ? 146 : 190;
    chart.style.setProperty('--cell-pitch', `${pitch}px`);
    chart.style.setProperty('--trial-size', `${pitch - 1}px`);
    chart.style.setProperty('--row-height', `${pitch}px`);
    chart.style.setProperty('--task-label-width', `${labelWidth}px`);
    chart.style.setProperty('--task-font-size', `${Math.min(10.5, pitch)}px`);
    chart.dataset.blocks = columns;
    let html = '', scored = 0;
    const chunks = columns === 2 ? [rows.slice(0, blockSize), rows.slice(blockSize)] : [rows];
    chunks.forEach((chunk, block) => {
      html += `<table class="task-waffle-table" style="width:${labelWidth + visible.length * pitch}px"><caption class="sr-only">${columns === 2 ? `Tasks ${block * blockSize + 1}–${block * blockSize + chunk.length} of ${tasks.length}` : `All ${tasks.length} tasks`} and ${visible.length} models. Tasks run from easiest to hardest, models from strongest to weakest. Models use the test-pooled pass rate; tasks use the mean model pass rate. Brick red marks an error, ochre a timeout, and a diagonal line a task without a result.</caption><colgroup><col style="width:${labelWidth}px">${visible.map(() => `<col style="width:${pitch}px">`).join('')}</colgroup><thead><tr><th scope="col" class="task-name-heading" title="Tasks ranked by mean pass rate, easiest first.">${columns === 2 ? `${block * blockSize + 1}–${block * blockSize + chunk.length} · ${block === 0 ? 'Easier' : 'Harder'}` : 'Easy → hard'}</th>`;
      visible.forEach(model => {
        const labels = [...new Set(tasks.map(task => entryFor(task, model).label).filter(Boolean))];
        const context = labels.filter(label => !/recorded/i.test(label)).map(label => label.replace(/k/ig, 'K')).sort().join(' / ');
        const meanLabel = model.mean === null ? 'No scored tasks' : `Test-pooled pass rate: ${model.mean.toFixed(1)}%`;
        html += `<th scope="col" class="task-model-column" data-model="${escape(model.id)}" title="${escape(model.name)}${context ? ' · ' + escape(context) : ''}\n${escape(meanLabel)}"><span class="task-model-heading"><span>${escape(model.short)}</span>${context ? `<small class="task-model-context">${escape(context)}</small>` : ''}</span><img class="model-logo" src="${escape(model.logo)}" alt="${escape(model.org)}" width="9" height="9"></th>`;
      });
      html += '</tr></thead><tbody>';
      chunk.forEach(({task, mean, count}) => {
        const difficulty = mean === null ? 'No scored models' : `Mean pass rate: ${mean.toFixed(1)}%`;
        html += `<tr data-task="${escape(task.id)}"><th scope="row" class="task-name"><a href="/tasks?task=${encodeURIComponent(task.id)}" title="${escape(task.name)}\n${escape(difficulty)}">${escape(task.name)}</a></th>`;
        visible.forEach(model => {
          const entry = entryFor(task, model), score = trialScore(entry);
          if (score !== null) scored++;
          const description = score !== null ? `${entry.passed}/${entry.total} tests (${score.toFixed(1)}%)` : missingText(entry);
          const classes = `waffle-point ${score !== null ? 'scored' : 'missing'}${score === null && ['error', 'timeout'].includes(entry.failure_kind) ? ' ' + entry.failure_kind : ''}`;
          const attributes = `class="${classes}"${score !== null ? ` style="--score-color:${scoreColor(score)}"` : ''} data-task="${escape(task.id)}" data-model="${escape(model.id)}" aria-label="${escape(task.name)}, ${escape(model.name)}: ${escape(description)}"`;
          const href = `/tasks?task=${encodeURIComponent(task.id)}&model=${encodeURIComponent(model.id)}${entry.run ? `&context=${encodeURIComponent(entry.run)}` : ''}`;
          html += `<td class="task-result"><a href="${href}" ${attributes}></a></td>`;
        });
        html += '</tr>';
      });
      html += '</tbody></table>';
    });
    chart.innerHTML = html;
    chart.querySelectorAll('.waffle-point').forEach(point => {
      const task = tasks.find(t => t.id === point.dataset.task), model = visible.find(m => m.id === point.dataset.model), entry = entryFor(task, model), score = trialScore(entry);
      let details = `<strong>${escape(task.name)}</strong><span>${escape(model.name)}${entry.label && !/recorded/i.test(entry.label) ? ' · ' + escape(entry.label) : ''}</span>`;
      if (score !== null) details += `<span class="tooltip-score">${entry.passed}/${entry.total} tests · ${score.toFixed(1)}%</span>`;
      else details += `<span>${missingText(entry)}. Not counted in the average.</span>`;
      if (score === null && model.variable_context) {
        const available = ['1m', '200k'].filter(key => task.results[model.id].contexts[key]?.status === 'scored');
        if (available.length) details += `<span>A ${available.map(contextLabel).join(' / ')} result is in the other context view.</span>`;
      }
      details += '<span class="tooltip-status">Open the task →</span>';
      bindTooltip(point, details);
      point.addEventListener('pointerenter', () => point.closest('tr').classList.add('is-highlighted'));
      point.addEventListener('pointerleave', () => point.closest('tr').classList.remove('is-highlighted'));
    });
    $('#waffle-legend').innerHTML = `<span class="waffle-simple-legend"><span>Test pass rate</span>${[0, 10, 25, 50, 100].map(value => `<span class="legend-item"><i style="background:${scoreColor(value)}" aria-hidden="true"></i>${value}%</span>`).join('')}<span class="legend-item"><i class="legend-error" aria-hidden="true"></i>Error</span><span class="legend-item"><i class="legend-timeout" aria-hidden="true"></i>Timeout</span><span class="legend-item"><i class="legend-unscored" aria-hidden="true"></i>No result</span></span>`;
    $('#waffle-note').textContent = 'Models from strongest to weakest, tasks from easiest to hardest.';
  }

  contextPicker.addEventListener('change', () => {
    models = boardData.views[contextPicker.value];
    showView(activeView, false);
    try { const url = new URL(location.href); url.searchParams.set('context', contextPicker.value); history.replaceState(null, '', url); } catch (_) { /* optional */ }
  });
  $('#waffle-expand').addEventListener('click', () => {
    waffleEnlarged = !waffleEnlarged;
    $('#waffle-expand').setAttribute('aria-pressed', String(waffleEnlarged));
    $('#waffle-expand').setAttribute('aria-label', waffleEnlarged ? 'Use compact Waffle chart' : 'Enlarge Waffle chart');
    $('#waffle-expand').title = waffleEnlarged ? 'Compact' : 'Enlarge';
    renderWaffle();
  });
  let resizeFrame, lastWidth = innerWidth;
  window.addEventListener('resize', () => {
    if (innerWidth === lastWidth) return;
    lastWidth = innerWidth;
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { if (activeView === 'waffle') renderWaffle(); if (activeView === 'pareto') renderPareto(); });
  });
  ['pareto-score', 'pareto-resource', 'pareto-scale', 'pareto-range'].forEach(id => $('#' + id).addEventListener('change', renderPareto));
  showView(new URLSearchParams(location.search).get('view') || 'table', false);
})();
