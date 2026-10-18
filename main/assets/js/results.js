/* Historical aggregate views and current, explicitly separated per-context scores. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const scoreNames = {overall: 'Overall', request: 'Request', browser: 'Browser', system: 'System'};
  const scoreColumns = {overall: 2, request: 3, browser: 4, system: 5};
  const boardData = JSON.parse($('#leaderboard-data').textContent);
  const taskData = JSON.parse($('#waffle-data').textContent);
  const contextPicker = $('#waffle-context');
  const initialContext = new URLSearchParams(location.search).get('context');
  contextPicker.value = ['overview','1m','200k'].includes(initialContext) ? initialContext : 'overview';
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
  const format = (value, resource) => resource === 'cost' ? '$' + value.toLocaleString('en-US', {maximumFractionDigits: 2})
    : resource === 'tokens' ? value.toLocaleString('en-US', {maximumFractionDigits: 1}) + 'M'
    : value.toLocaleString('en-US', {maximumFractionDigits: 1});

  const tooltip = document.createElement('div');
  tooltip.className = 'result-tooltip'; tooltip.id = 'result-tooltip'; tooltip.role = 'tooltip'; tooltip.hidden = true; document.body.appendChild(tooltip);
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
  tooltip.addEventListener('focusin', () => clearTimeout(tooltipHideTimer));
  tooltip.addEventListener('focusout', scheduleTooltipHide);
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
    element.addEventListener('pointerenter', show); element.addEventListener('focus', show); element.addEventListener('click', show);
    element.addEventListener('pointerleave', scheduleTooltipHide);
    element.addEventListener('blur', scheduleTooltipHide);
  };
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hideTooltip(); });
  window.addEventListener('scroll', hideTooltip, true);
  const modelTooltip = model => `<strong>${escape(model.name)}</strong><span>${escape(model.org)}</span>`;

  function showView(view, updateURL = true) {
    if (!['table', 'pareto', 'waffle'].includes(view)) view = 'table';
    company.closest('label').hidden = view === 'waffle';
    $('#results-description').textContent = view === 'waffle'
      ? `${taskData.tasks.length} tasks × ${taskData.models.length} models · selected per-task results.`
      : `${taskData.tasks.length} tasks · mean per-task pass rate · coverage shown; missing scores excluded.`;
    activeView = view; hideTooltip();
    tabs.forEach(tab => { const selected = tab.dataset.view === view; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; });
    panels.forEach(panel => { panel.hidden = panel.id !== `result-${view}`; });
    if (view === 'table') renderTable();
    if (view === 'pareto') renderPareto();
    if (view === 'waffle') renderWaffle();
    const download = $('.section-heading .download');
    download.href = view === 'waffle' ? `data/waffle-${$('#waffle-context').value}.csv` : `data/leaderboard-${contextPicker.value}.csv`;
    download.innerHTML = view === 'waffle' ? 'Per-task CSV <span aria-hidden="true">↓</span>' : 'Leaderboard CSV <span aria-hidden="true">↓</span>';
    if (view === 'waffle' && updateURL) $('#results-toolbar').scrollIntoView({block: 'start'});
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
    const visible=visibleModels().slice().sort((a,b)=>{
      if(a[sortKey]===null||b[sortKey]===null)return Number(a[sortKey]===null)-Number(b[sortKey]===null)||b.overall-a.overall;
      return (a[sortKey]-b[sortKey])*(descending?-1:1)||b.overall-a.overall;
    });
    $('#board-body').innerHTML=WebsiteBenchLeaderboard.renderRows(visible);
    $$('#board thead th').forEach(th=>th.removeAttribute('aria-sort'));
    $$('#board [data-sort]').forEach(button=>{
      button.hidden=false;button.previousElementSibling.hidden=true;
      const active=button.dataset.sort===sortKey;
      if(active)button.parentElement.setAttribute('aria-sort',descending?'descending':'ascending');
      button.querySelector('.sort-arrow').textContent=active?(descending?'↓':'↑'):'↕';
    });
  }
  company.addEventListener('change',()=>showView(activeView,false));
  $('#board').addEventListener('click',event=>{
    const button=event.target.closest('[data-sort]');if(!button)return;
    const key=button.dataset.sort;
    descending=key===sortKey?!descending:['overall','request','browser','system'].includes(key);sortKey=key;renderTable();
  });

  function renderPareto() {
    hideTooltip();
    const resource = $('#pareto-resource').value, score = $('#pareto-score').value;
    const candidates = visibleModels();
    const visible = candidates.flatMap(m=>{const paired=m.pareto[resource][score];return paired.count && ($('#pareto-scale').value!=='log'||paired.resource_mean>0) ? [{...m,[resource]:paired.resource_mean,[score]:paired.score_mean,pairedCount:paired.count}] : [];});
    if(!visible.length){$('#pareto-chart').innerHTML='<p class=table-note>No paired score/resource records in this selection.</p>';$('#pareto-summary').textContent='No resource data for this selection';return;}
    const log = $('#pareto-scale').value === 'log';
    const full = $('#pareto-range').value === 'full';
    const frontier = visible.filter(a => !visible.some(b => b[resource] <= a[resource] && b[score] >= a[score] && (b[resource] < a[resource] || b[score] > a[score]))).sort((a, b) => a[resource] - b[resource]);
    const frontierIDs = new Set(frontier.map(m => m.id));
    const width = 1080, height = 490, left = 76, right = 44, top = 32, bottom = 66;
    const plotW = width - left - right, plotH = height - top - bottom;
    const maxValue = Math.max(0.000001, ...visible.map(m => m[resource]));
    const minValue = Math.min(...visible.map(m => m[resource]));
    const niceStep = value => { const power = 10 ** Math.floor(Math.log10(value)); const fraction = value / power; return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power; };
    const linearStep = niceStep(maxValue * 1.15 / 5);
    const xMin = log ? minValue * .6 : 0, xMax = log ? maxValue * 1.5 : Math.ceil(maxValue * 1.15 / linearStep) * linearStep;
    const yMax = full ? 100 : Math.min(100, Math.max(10, Math.ceil(Math.max(...visible.map(m => m[score])) * 1.23 / 5) * 5));
    const yStep = yMax <= 35 ? 5 : yMax <= 70 ? 10 : 20;
    const X = value => left + (log ? (Math.log(value) - Math.log(xMin)) / (Math.log(xMax) - Math.log(xMin)) : value / xMax) * plotW;
    const Y = value => top + (1 - value / yMax) * plotH;
    const xTicks = [];
    if (log) {
      for (let p = Math.floor(Math.log10(xMin)); p <= Math.ceil(Math.log10(xMax)); p++) for (const base of [1, 2, 5]) {
        const tick = base * 10 ** p; if (tick >= xMin && tick <= xMax) xTicks.push(tick);
      }
    } else for (let tick = 0; tick <= xMax; tick += linearStep) xTicks.push(tick);
    let svg = `<svg viewBox="0 0 ${width} ${height}" aria-labelledby="pareto-title" aria-describedby="pareto-description" role="group"><title id="pareto-title">${scoreNames[score]} hidden-test pass rate versus mean ${resource} per task</title><desc id="pareto-description">${visible.length} models. ${frontier.length} on the Pareto frontier. Lower resource use and higher pass rate are better. ${log ? 'Logarithmic' : 'Linear'} horizontal axis. No confidence intervals are available.</desc>`;
    for (let tick = 0; tick <= yMax; tick += yStep) svg += `<line class="plot-grid" x1="${left}" y1="${Y(tick)}" x2="${width - right}" y2="${Y(tick)}"/><text class="plot-tick" x="${left - 14}" y="${Y(tick) + 4}" text-anchor="end">${tick}%</text>`;
    if (yMax % yStep) svg += `<text class="plot-tick" x="${left - 14}" y="${top + 4}" text-anchor="end">${yMax}%</text>`;
    xTicks.forEach(tick => { svg += `<line class="plot-grid" x1="${X(tick)}" y1="${top}" x2="${X(tick)}" y2="${height - bottom}"/><text class="plot-tick" x="${X(tick)}" y="${height - bottom + 25}" text-anchor="middle">${format(tick, resource)}</text>`; });
    svg += `<line class="plot-axis" x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}"/><line class="plot-axis" x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}"/>`;
    if (frontier.length > 1) svg += `<polyline class="frontier-line" points="${frontier.map(m => `${X(m[resource])},${Y(m[score])}`).join(' ')}"/>`;
    svg += `<text class="axis-title" x="${left + plotW / 2}" y="${height - 12}" text-anchor="middle">Mean ${resource === 'cost' ? 'cost (USD)' : resource === 'tokens' ? 'tokens (millions)' : 'turns'} per task · ${log ? 'log' : 'linear'} scale</text><text class="axis-title" transform="translate(18 ${top + plotH / 2}) rotate(-90)" text-anchor="middle">${scoreNames[score]} hidden-test pass rate</text>`;
    // Choose label positions that avoid other labels and point markers.
    const points = visible.map(m => ({model: m, x: X(m[resource]), y: Y(m[score])}));
    const boxes = [];
    const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const labels = [];
    [...points].sort((a, b) => b.y - a.y).forEach(point => {
      const m = point.model, w = m.short.length * 6.6 + 8, h = 34;
      const candidates = [[24,-40],[24,10],[-w-24,-40],[-w-24,10],[24,-80],[-w-24,-80],[24,48],[-w-24,48],[24,-120],[-w-24,-120]];
      const position = candidates.map(([dx,dy]) => ({x: Math.max(left + 4, Math.min(width - right - w, point.x + dx)), y: Math.max(top + 4, Math.min(height - bottom - h - 4, point.y + dy)), w, h})).find(box => !boxes.some(other => intersects(box, other)) && !points.some(other => intersects(box, {x:other.x-16,y:other.y-16,w:32,h:32}))) || {x: Math.max(left + 4, Math.min(width - right - w, point.x + 24)), y: Math.max(top + 4, point.y - 40), w, h};
      boxes.push(position);
      const endX = point.x < position.x ? position.x - 4 : position.x > position.x + w ? position.x + w + 4 : position.x + w / 2;
      const endY = point.y < position.y ? position.y : point.y > position.y + h ? position.y + h : position.y + h / 2;
      labels.push(`<g class="plot-label ${frontierIDs.has(m.id) ? 'on-frontier' : 'dominated'}"><line x1="${point.x}" y1="${point.y}" x2="${endX}" y2="${endY}"/><text x="${position.x}" y="${position.y + 12}">${escape(m.short)}</text><text class="plot-value" x="${position.x}" y="${position.y + 28}">${m[score].toFixed(1)}% · ${format(m[resource], resource)}</text></g>`);
    });
    svg += labels.join('');
    points.forEach(({model:m,x,y}) => {
      const onFrontier = frontierIDs.has(m.id);
      svg += `<g class="plot-point ${onFrontier ? 'on-frontier' : 'dominated'}" tabindex="0" role="button" data-model="${escape(m.id)}" data-resource-value="${m[resource]}" data-score-value="${m[score]}" data-coverage="${m.pairedCount}" aria-label="${escape(m.name)}: ${m[score].toFixed(1)}% ${scoreNames[score]} pass rate, ${format(m[resource], resource)} mean ${resource} per task; ${m.pairedCount}/${boardData.total_tasks} paired tasks${onFrontier ? ', on Pareto frontier' : ''}"><circle cx="${x}" cy="${y}" r="15"/><image class="plot-logo" href="${m.logo}" x="${x - 9}" y="${y - 9}" width="18" height="18"/><title>${escape(m.name)}: ${m[score].toFixed(1)}%, ${format(m[resource], resource)}</title></g>`;
    });
    svg += '</svg>';
    $('#pareto-chart').innerHTML = svg;
    $('#pareto-chart').querySelectorAll('.plot-point').forEach(point => {
      const m = visible.find(model => model.id === point.dataset.model);
      const onFrontier = frontierIDs.has(m.id);
      bindTooltip(point, modelTooltip(m) + `<span>${m.pairedCount}/${boardData.total_tasks} paired tasks · reported resources (estimates/partial usage may remain)</span><dl><div><dt>${scoreNames[score]} pass rate</dt><dd>${m[score].toFixed(1)}%</dd></div><div><dt>Mean ${resource} / task</dt><dd>${format(m[resource], resource)}</dd></div></dl><span class="tooltip-status">${onFrontier ? 'On the Pareto frontier' : 'Dominated by a visible model'}</span>`);
      point.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); point.dispatchEvent(new Event('click')); } });
    });
    $('#pareto-summary').textContent = `${visible.length}/${candidates.length} models with paired resource data · ${frontier.length} on the frontier`;
  }
  const tasks = taskData.tasks;
  const waffleModels = taskData.models;
  const entryFor = (task, model) => task.results[model.id].contexts[model.variable_context ? contextPicker.value : 'recorded'];
  const trialScore = entry => entry.status === 'scored' ? 100 * entry.passed / entry.total : null;
  // Calibrated continuous shades: separate low scores from the middle range
  // without changing fractions, clipping high scores, or normalizing to a max.
  const shadeStops = [[0,244], [5,218], [10,182], [25,96], [50,32], [100,0]];
  const scoreColor = score => {
    const index = Math.max(1, shadeStops.findIndex(([value]) => value >= score));
    const [low, light] = shadeStops[index - 1], [high, dark] = shadeStops[index];
    const channel = Math.round(light + (dark - light) * (score - low) / (high - low));
    return `rgb(${channel}, ${channel}, ${channel})`;
  };
  const contextLabel = value => value === '1m' ? '1M' : value === '200k' ? '200K' : 'recorded';
  const summarize = entries => {
    const scores = entries.map(trialScore).filter(score => score !== null);
    return {mean: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null, count: scores.length};
  };
  const byMeanDescending = (a, b) => a.mean === null || b.mean === null
    ? Number(a.mean === null) - Number(b.mean === null) || a.name.localeCompare(b.name)
    : b.mean - a.mean || a.name.localeCompare(b.name);
  let waffleEnlarged = false;

  function renderWaffle() {
    hideTooltip();
    // Rank both axes using only scored cells in the selected context. Every
    // task has equal weight in a model mean; unscored cells are never zeros.
    const visible = waffleModels.map(model => ({...model,
      ...summarize(tasks.map(task => entryFor(task, model))),
    })).sort(byMeanDescending);
    const rows = tasks.map(task => ({task, name: task.name,
      ...summarize(visible.map(model => entryFor(task, model))),
    })).sort(byMeanDescending);
    const chart = $('#waffle-chart');
    const columns = innerWidth >= 900 ? 2 : 1;
    const blockSize = Math.ceil(tasks.length / columns);
    const pitch = waffleEnlarged ? 23 : columns === 2 ? Math.max(14, Math.min(16, Math.floor((innerHeight - 300) / blockSize))) : 12;
    const labelWidth = innerWidth < 500 ? 146 : 190;
    chart.style.setProperty('--cell-pitch', `${pitch}px`);
    chart.style.setProperty('--trial-size', `${pitch - 1}px`);
    chart.style.setProperty('--row-height', `${pitch}px`);
    chart.style.setProperty('--task-label-width', `${labelWidth}px`);
    chart.style.setProperty('--task-font-size', `${Math.min(10, pitch)}px`);
    chart.dataset.blocks = columns;
    let html = '', scored = 0;
    const unscored = {};
    const chunks = columns === 2 ? [rows.slice(0,blockSize), rows.slice(blockSize)] : [rows];
    chunks.forEach((chunk, block) => {
    html += `<table class="task-waffle-table" style="width:${labelWidth + visible.length * pitch}px"><caption class="sr-only">${columns === 2 ? `Tasks ${block * blockSize + 1}–${block * blockSize + chunk.length} of ${tasks.length}` : `All ${tasks.length} website tasks`} and ${visible.length} models. Read tasks down the left block, then down the right block: easiest first, hardest last. Models are ordered strongest to weakest from left to right in both blocks. Both axes use mean reported pass rate in the selected context, excluding unscored cells. Switch context for GLM, DeepSeek and Qwen. Other models keep their recorded context. Red means error, orange means timeout, and a diagonal mark means unscored. None is zero.</caption><colgroup><col style="width:${labelWidth}px">${visible.map(() => `<col style="width:${pitch}px">`).join('')}</colgroup><thead><tr><th scope="col" class="task-name-heading" title="Tasks ranked by mean pass rate, easier first. Read down the left block, then the right block.">${columns === 2 ? `${block * blockSize + 1}–${block * blockSize + chunk.length} · ${block === 0 ? 'Easier' : 'Harder'}` : 'Easy → hard'}</th>`;
    visible.forEach(model => {
      const labels = [...new Set(tasks.map(task => entryFor(task, model).label).filter(Boolean))];
      const context = labels.filter(label=>!/recorded/i.test(label)).map(label=>label.replace(/k/ig,'K')).sort().join(' / ');
      const meanLabel = model.mean === null ? 'No scored tasks' : `Mean pass rate: ${model.mean.toFixed(2)}% · ${model.count}/${tasks.length} scored tasks`;
      html += `<th scope="col" class="task-model-column" data-model="${escape(model.id)}" data-context="${escape(context)}" title="${escape(model.name)} · ${escape(context || 'recorded context')}\n${escape(meanLabel)}"><span class="task-model-heading"><span>${escape(model.short)}</span>${context ? `<small class="task-model-context">${escape(context)}</small>` : ''}</span><img class="model-logo" src="${escape(model.logo)}" alt="${escape(model.org)}" width="9" height="9"></th>`;
    });
    html += '</tr></thead><tbody>';
    chunk.forEach(({task, mean, count}) => {
      const difficulty = mean === null ? 'No scored models' : `Mean pass rate: ${mean.toFixed(2)}% · ${count}/${visible.length} scored models`;
      html += `<tr data-task="${escape(task.id)}"><th scope="row" class="task-name"><a href="tasks.html?task=${encodeURIComponent(task.id)}" title="${escape(task.name)}\n${escape(difficulty)}">${escape(task.name)}</a></th>`;
      visible.forEach(model => {
        const entry = entryFor(task, model), score = trialScore(entry);
        if (score !== null) scored++; else unscored[entry.status] = (unscored[entry.status] || 0) + 1;
        const description = score !== null ? `${entry.passed}/${entry.total} tests (${score.toFixed(1)}%)` : entry.failure_kind === 'timeout' ? 'Generation timed out' : entry.failure_kind === 'error' ? 'Run or evaluation error' : entry.status === 'conflict' ? 'Conflicting source scores' : entry.status === 'withdrawn' ? 'Source score withdrawn' : entry.status === 'incomparable' ? `Legacy scoring protocol: ${entry.value}` : entry.status === 'invalid' ? 'No valid evaluation' : 'Score not reported';
        const classes = `waffle-point ${score !== null ? 'scored' : 'missing'}${entry.status === 'conflict' ? ' conflict' : ''}${score === null && ['error','timeout'].includes(entry.failure_kind) ? ' '+entry.failure_kind : ''}`;
        const attributes = `class="${classes}"${score !== null ? ` style="--score-color:${scoreColor(score)}"` : ''} data-task="${escape(task.id)}" data-model="${escape(model.id)}" data-score="${score === null ? '' : score}" data-context="${escape(entry.label)}" data-failure="${escape(entry.failure_kind||'')}" aria-label="${escape(task.name)}, ${escape(model.name)}: ${escape(description)}"`;
        const href = entry.run ? `tasks.html?task=${encodeURIComponent(task.id)}&model=${encodeURIComponent(model.id)}&context=${encodeURIComponent(entry.run)}` : '';
        html += `<td class="task-result" data-model="${escape(model.id)}">${href ? `<a href="${href}" ${attributes}></a>` : `<button type="button" ${attributes}></button>`}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    });
    chart.innerHTML = html;
    chart.querySelectorAll('.waffle-point').forEach(point => {
      const task = tasks.find(t => t.id === point.dataset.task), model = visible.find(m => m.id === point.dataset.model), entry = entryFor(task, model), score = trialScore(entry);
      const context = entry.label || 'Recorded context';
      let details = `<strong>${escape(task.name)}</strong><span>${escape(model.name)} · ${escape(context)}</span>`;
      if (score !== null) details += `<span class="tooltip-score">${entry.passed}/${entry.total} tests · ${score.toFixed(2)}%</span>`;
      else if (entry.status === 'conflict') {
        const records = task.results[model.id].records.filter(r => r.context === entryFor(task, model).context || entry.cells.includes(r.cell));
        details += `<span>Different fractions in the source: ${records.map(r => escape(r.value || 'blank')).join(', ')}.</span>`;
      } else details += `<span>${entry.failure_kind === 'timeout' ? 'Generation exceeded the time budget; no admitted score.' : entry.failure_kind === 'error' ? 'Run/provider/evaluation error; no valid score.' : entry.status === 'withdrawn' ? 'Score withdrawn in the source.' : entry.status === 'invalid' ? 'The current evaluation is invalid.' : entry.status === 'incomparable' ? `Legacy fraction: ${escape(entry.value)}; uses a different scoring protocol.` : 'No current valid score for this task and context.'} This is not a zero.</span>`;
      if (entry.note) {
        const note = entry.note.split('\n').find(line => line.trim()) || '';
        details += `<span>${escape(note.slice(0, 240))}${note.length > 240 ? '…' : ''}</span>`;
      }
      if (score === null && model.variable_context) {
        const available = ['1m', '200k'].filter(key => task.results[model.id].contexts[key]?.status === 'scored');
        if (available.length) details += `<span>A published ${available.map(contextLabel).join(' / ')} result is available in another view.</span>`;
      }
      if (entry.repaired) details += '<span>Published score is for a repaired candidate; replay shows the archived original.</span>';
      details += entry.source_url ? `<span>Source: <a href="${escape(entry.source_url)}" target="_blank" rel="noopener">HF score file ↗</a></span>` : `<span>Source: ${escape(entry.source_sheet || taskData.source.sheet)}${entry.cells.length ? '!' + entry.cells.map(escape).join(', ') : ''}</span>`;
      if (entry.run) details += '<span class="tooltip-status">Click to compare the website and browse its trajectory →</span>';
      else details += '<span class="tooltip-status">No unique recorded trace is bound to this context.</span>';
      bindTooltip(point, details);
      point.addEventListener('pointerenter', () => point.closest('tr').classList.add('is-highlighted'));
      point.addEventListener('pointerleave', () => point.closest('tr').classList.remove('is-highlighted'));
    });
    const missingLabels = {missing:'unscored', withdrawn:'withdrawn', conflict:'conflict', invalid:'invalid', incomparable:'legacy'};
    $('#waffle-coverage').textContent = `${scored}/${tasks.length*waffleModels.length} scored` + ['error','timeout','unscored'].map(kind=>{const count=tasks.reduce((n,task)=>n+visible.filter(model=>{const e=entryFor(task,model);return e.status!=='scored'&&(e.failure_kind===kind||(kind==='unscored'&&!['error','timeout'].includes(e.failure_kind)));}).length,0);return count?` · ${count} ${kind}`:'';}).join('');
    $('#waffle-legend').innerHTML = `<span class="waffle-simple-legend"><span>Test pass rate</span>${[0,10,25,50,100].map(value => `<span class="legend-item"><i style="background:${scoreColor(value)}" aria-hidden="true"></i>${value}%</span>`).join('')}<span class="legend-item"><i class="legend-error" aria-hidden="true"></i>Error</span><span class="legend-item"><i class="legend-timeout" aria-hidden="true"></i>Timeout</span><span class="legend-item"><i class="legend-unscored" aria-hidden="true"></i>Unscored</span>${unscored.conflict ? '<span class="legend-item"><i class="legend-conflict" aria-hidden="true"></i>Conflict</span>' : ''}</span>`;
    $('#waffle-note').innerHTML = 'Sorted by mean test pass rate. Unscored cells excluded. <a href="https://huggingface.co/datasets/TIGER-Lab/WebsiteBenchArtifacts/blob/main/missing/score-gaps.md" target="_blank" rel="noopener">Score details ↗</a>';
  }
  contextPicker.addEventListener('change', () => {
    models=boardData.views[contextPicker.value];
    showView(activeView,false);
    const url = new URL(location.href); url.searchParams.set('context', contextPicker.value); history.replaceState(null, '', url);
  });
  $('#waffle-expand').addEventListener('click', () => {
    waffleEnlarged = !waffleEnlarged;
    $('#waffle-expand').setAttribute('aria-pressed', String(waffleEnlarged));
    $('#waffle-expand').setAttribute('aria-label', waffleEnlarged ? 'Use compact Waffle chart' : 'Enlarge Waffle chart');
    $('#waffle-expand').title = waffleEnlarged ? 'Compact' : 'Enlarge';
    renderWaffle();
  });
  let waffleResizeFrame;
  window.addEventListener('resize',()=>{
    cancelAnimationFrame(waffleResizeFrame);
    waffleResizeFrame=requestAnimationFrame(()=>{if(activeView==='waffle')renderWaffle();});
  });
  ['pareto-score','pareto-resource','pareto-scale','pareto-range'].forEach(id=>$('#'+id).addEventListener('change',renderPareto));
  $('#results-toolbar').hidden=false;
  showView(new URLSearchParams(location.search).get('view')||'table',false);
  window.addEventListener('load', () => {
    if (activeView === 'waffle' && location.hash === '#results') requestAnimationFrame(() => $('#results-toolbar').scrollIntoView({block:'start'}));
  }, {once:true});
})();
