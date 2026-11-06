/* Leaderboard table, Pareto chart and Waffle chart, with the toolbar that filters, exports and shares them. */
(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const SCORES = {overall: 'Overall', request: 'Request', browser: 'Browser', system: 'System'};
  const RESOURCES = {cost: 'cost (USD)', tokens: 'tokens (millions)', turns: 'agent turns'};
  const RESOURCE_LABELS = {cost: 'Cost', tokens: 'Tokens', turns: 'Turns'};
  const COLUMNS = {...SCORES, ...RESOURCE_LABELS};
  const VIEWS = ['table', 'pareto', 'waffle'];
  const TITLE = 'Can AI agents rebuild websites through browser exploration?';

  const boardData = JSON.parse($('#leaderboard-data').textContent);
  const taskData = JSON.parse($('#waffle-data').textContent);
  const tasks = taskData.tasks, waffleModels = taskData.models;
  const allModels = boardData.views.overview;

  const params = new URLSearchParams(location.search);
  const pick = (key, allowed, fallback) => allowed.includes(params.get(key)) ? params.get(key) : fallback;
  const listParam = (key, allowed) => {
    const chosen = (params.get(key) || '').split(',').filter(value => allowed.includes(value));
    return chosen.length ? chosen : allowed;
  };
  const state = {
    view: pick('view', VIEWS, 'table'),
    score: pick('score', Object.keys(SCORES), 'overall'),
    resource: pick('resource', Object.keys(RESOURCES), 'cost'),
    scale: pick('scale', ['log', 'linear'], 'log'),
    range: pick('y', ['focused', 'full'], 'focused'),
    sort: pick('sort', ['difficulty', 'name', ...allModels.map(m => m.id)], 'difficulty'),
    large: params.get('size') === 'large',
    models: new Set(listParam('models', allModels.map(m => m.id))),
    columns: new Set(listParam('cols', Object.keys(COLUMNS))),
    sortKey: 'overall',
    descending: true,
  };
  const visibleModels = () => allModels.filter(m => state.models.has(m.id));

  /* ---------------------------------------------------------------- address */
  function stateURL() {
    const url = new URL('/', location.origin);
    const set = (key, value, fallback) => { if (value !== fallback) url.searchParams.set(key, value); };
    set('view', state.view, 'table');
    if (state.models.size !== allModels.length) url.searchParams.set('models', allModels.map(m => m.id).filter(id => state.models.has(id)).join(','));
    if (state.columns.size !== Object.keys(COLUMNS).length) url.searchParams.set('cols', Object.keys(COLUMNS).filter(key => state.columns.has(key)).join(','));
    if (state.view === 'pareto') { set('score', state.score, 'overall'); set('resource', state.resource, 'cost'); set('scale', state.scale, 'log'); set('y', state.range, 'focused'); }
    if (state.view === 'waffle') { set('sort', state.sort, 'difficulty'); if (state.large) url.searchParams.set('size', 'large'); }
    return url.href.replace(/%2C/g, ',');
  }
  const syncURL = () => { try { history.replaceState(null, '', stateURL() + location.hash); } catch (_) { /* optional */ } };

  /* ---------------------------------------------------------------- tooltip */
  const tooltip = document.createElement('div');
  tooltip.className = 'result-tooltip'; tooltip.id = 'result-tooltip'; tooltip.setAttribute('role', 'tooltip'); tooltip.hidden = true;
  document.body.appendChild(tooltip);
  let tooltipSource = null;
  const hideTooltip = () => { tooltip.hidden = true; tooltipSource = null; };
  function showTooltip(source, html, event) {
    tooltipSource = source;
    tooltip.innerHTML = html; tooltip.hidden = false;
    const rect = source.getBoundingClientRect();
    const fromPointer = event && Number.isFinite(event.clientX) && event.clientX > 0;
    const x = fromPointer ? event.clientX + 14 : rect.right + 10;
    const y = fromPointer ? event.clientY + 14 : rect.top;
    const width = tooltip.offsetWidth, height = tooltip.offsetHeight;
    const left = x + width > innerWidth - 8 ? (fromPointer ? event.clientX - width - 14 : rect.left - width - 10) : x;
    const top = y + height > innerHeight - 8 ? (fromPointer ? event.clientY - height - 14 : rect.bottom - height) : y;
    tooltip.style.left = clamp(left, 8, innerWidth - width - 8) + 'px';
    tooltip.style.top = clamp(top, 8, innerHeight - height - 8) + 'px';
  }
  window.addEventListener('scroll', () => { if (tooltipSource !== document.activeElement) hideTooltip(); }, {capture: true, passive: true});

  /* ---------------------------------------------------------------- colour */
  const token = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const toRGB = hex => { const h = hex.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const toHex = rgb => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  // Calibrated shades keep low scores apart without normalizing to the maximum.
  const SHADE_STOPS = [[0, 0], [5, .107], [10, .254], [25, .607], [50, .869], [100, 1]];
  function scorePainter() {
    const ramp = ['--ramp-0', '--ramp-1', '--ramp-2'].map(name => toRGB(token(name)));
    return score => {
      const index = Math.max(1, SHADE_STOPS.findIndex(([value]) => value >= score));
      const [low, a] = SHADE_STOPS[index - 1], [high, b] = SHADE_STOPS[index];
      const u = a + (b - a) * (score - low) / (high - low);
      const [from, to, t] = u < .5 ? [0, 1, u / .5] : [1, 2, (u - .5) / .5];
      return toHex(ramp[from].map((value, i) => value + (ramp[to][i] - value) * t));
    };
  }

  /* ---------------------------------------------------------------- number formats */
  const decimal = (value, digits = 1) => value.toLocaleString('en-US', {minimumFractionDigits: digits, maximumFractionDigits: digits});
  const formatResource = (value, resource) => resource === 'cost' ? '$' + decimal(value) : resource === 'tokens' ? decimal(value) + 'M' : decimal(value);
  const formatTick = (value, resource) => {
    const text = value.toLocaleString('en-US', {maximumFractionDigits: value < 1 ? 2 : value < 10 ? 1 : 0});
    return resource === 'cost' ? '$' + text : resource === 'tokens' ? text + 'M' : text;
  };

  /* ---------------------------------------------------------------- table */
  const tableModels = () => visibleModels().slice().sort((a, b) => {
    const key = state.sortKey;
    if (a[key] === null || b[key] === null) return Number(a[key] === null) - Number(b[key] === null) || b.overall - a.overall;
    return (a[key] - b[key]) * (state.descending ? -1 : 1) || b.overall - a.overall;
  });
  function renderTable() {
    $('#board-body').innerHTML = WebsiteBenchLeaderboard.renderRows(tableModels());
    $$('#board thead th').forEach(th => th.removeAttribute('aria-sort'));
    const active = $(`#board [data-sort="${state.sortKey}"]`);
    if (active) active.parentElement.setAttribute('aria-sort', state.descending ? 'descending' : 'ascending');
    Object.keys(COLUMNS).forEach(key => $('#board').classList.toggle('hide-' + key, !state.columns.has(key)));
  }
  $('#board').addEventListener('click', event => {
    const button = event.target.closest('[data-sort]'); if (!button) return;
    const key = button.dataset.sort;
    state.descending = key === state.sortKey ? !state.descending : Object.keys(SCORES).includes(key);
    state.sortKey = key; renderTable();
  });

  /* ---------------------------------------------------------------- Pareto */
  const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  function segmentHitsBox(a, b, box) {
    let t0 = 0, t1 = 1;
    const dx = b.x - a.x, dy = b.y - a.y;
    for (const [p, q] of [[-dx, a.x - box.x], [dx, box.x + box.w - a.x], [-dy, a.y - box.y], [dy, box.y + box.h - a.y]]) {
      if (p === 0) { if (q < 0) return false; continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) return false; t0 = Math.max(t0, r); } else { if (r < t0) return false; t1 = Math.min(t1, r); }
    }
    return t0 <= t1;
  }
  const niceStep = value => { const power = 10 ** Math.floor(Math.log10(value)); const f = value / power; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * power; };

  function paretoMarkup({width, height, compact, models}) {
    const {score, resource} = state, log = state.scale === 'log', full = state.range === 'full';
    const shown = models.filter(m => m[resource] !== null && m[score] !== null && (!log || m[resource] > 0));
    const frontier = shown.filter(a => !shown.some(b => b[resource] <= a[resource] && b[score] >= a[score] && (b[resource] < a[resource] || b[score] > a[score]))).sort((a, b) => a[resource] - b[resource]);
    const frontierIDs = new Set(frontier.map(m => m.id));
    const left = compact ? 46 : 62, right = compact ? 14 : 26, top = 12, bottom = compact ? 48 : 50;
    const plotW = width - left - right, plotH = height - top - bottom;
    const values = shown.map(m => m[resource]), scores = shown.map(m => m[score]);
    const maxValue = Math.max(0.000001, ...values), minValue = Math.min(...values);
    const linearStep = niceStep(maxValue * 1.12 / (compact ? 4 : 6));
    const xMin = log ? minValue * .68 : 0, xMax = log ? maxValue * 1.32 : Math.ceil(maxValue * 1.12 / linearStep) * linearStep;
    const span = Math.max(...scores) - Math.min(...scores);
    const yMin = full ? 0 : Math.max(0, Math.floor((Math.min(...scores) - Math.max(1, span * .08)) / 5) * 5);
    const yMax = full ? 100 : Math.min(100, Math.max(yMin + 10, Math.ceil((Math.max(...scores) + Math.max(1.5, span * .12)) / 5) * 5));
    const yStep = yMax - yMin <= 35 ? 5 : yMax - yMin <= 70 ? 10 : 20;
    const X = value => left + (log ? (Math.log(value) - Math.log(xMin)) / (Math.log(xMax) - Math.log(xMin)) : value / xMax) * plotW;
    const Y = value => top + (1 - (value - yMin) / (yMax - yMin)) * plotH;
    const floorY = top + plotH, endX = left + plotW;
    const xTicks = [];
    if (log) {
      for (let p = Math.floor(Math.log10(xMin)); p <= Math.ceil(Math.log10(xMax)); p++) for (const base of compact ? [1, 3] : [1, 2, 5]) {
        const tick = base * 10 ** p; if (tick >= xMin && tick <= xMax) xTicks.push(tick);
      }
    } else for (let tick = 0; tick <= xMax + 1e-9; tick += linearStep) xTicks.push(tick);

    let body = '';
    if (frontier.length) {
      const line = frontier.map(m => `${X(m[resource]).toFixed(1)},${Y(m[score]).toFixed(1)}`);
      const first = frontier[0], last = frontier[frontier.length - 1];
      body += `<polygon class="plot-reach" points="${left},${top} ${endX},${top} ${endX},${Y(last[score]).toFixed(1)} ${line.slice().reverse().join(' ')} ${X(first[resource]).toFixed(1)},${floorY} ${left},${floorY}"/>`;
    }
    for (let tick = yMin; tick <= yMax + 1e-9; tick += yStep) body += `<line class="plot-grid" x1="${left}" y1="${Y(tick)}" x2="${endX}" y2="${Y(tick)}"/><text class="plot-tick" x="${left - 9}" y="${Y(tick) + 4}" text-anchor="end">${tick}%</text>`;
    xTicks.forEach(tick => { body += `<line class="plot-grid" x1="${X(tick)}" y1="${top}" x2="${X(tick)}" y2="${floorY}"/><text class="plot-tick" x="${X(tick)}" y="${floorY + 19}" text-anchor="middle">${formatTick(tick, resource)}</text>`; });
    body += `<line class="plot-axis" x1="${left}" y1="${top}" x2="${left}" y2="${floorY}"/><line class="plot-axis" x1="${left}" y1="${floorY}" x2="${endX}" y2="${floorY}"/>`;
    if (frontier.length > 1) body += `<polyline class="frontier-line" points="${frontier.map(m => `${X(m[resource]).toFixed(1)},${Y(m[score]).toFixed(1)}`).join(' ')}"/>`;
    body += `<text class="axis-title" x="${left + plotW / 2}" y="${height - 8}" text-anchor="middle">Mean ${RESOURCES[resource]} per task${compact ? '' : log ? ' · log scale' : ' · linear scale'}</text><text class="axis-title" transform="translate(${compact ? 11 : 14} ${top + plotH / 2}) rotate(-90)" text-anchor="middle">${SCORES[score]} pass rate</text>`;
    if (!compact) body += `<text class="plot-hint" x="${left + 12}" y="${top + 19}">↖ Better: higher score, lower ${RESOURCE_LABELS[resource].toLowerCase()}</text>`;

    const r = compact ? 11 : 13, logo = compact ? 12 : 15;
    const points = shown.map(m => ({model: m, x: X(m[resource]), y: Y(m[score]), on: frontierIDs.has(m.id)}));
    let labels = '';
    if (!compact) {
      const hint = {x: left + 8, y: top + 6, w: 280, h: 20};
      const boxes = [hint];
      const segments = frontier.slice(1).map((m, i) => [{x: X(frontier[i][resource]), y: Y(frontier[i][score])}, {x: X(m[resource]), y: Y(m[score])}]);
      const ordered = [...points].sort((a, b) => Number(b.on) - Number(a.on) || a.y - b.y);
      ordered.forEach(point => {
        const m = point.model, value = `${decimal(m[score])}% · ${formatResource(m[resource], resource)}`;
        const w = Math.max(m.short.length * 7, value.length * 6.5) + 6, h = 32, g = r + 5;
        const spots = [[g, 3], [-w - g, -h - 3], [g, -h / 2], [-w - g, -h / 2], [g, -h - 3], [-w - g, 3], [-w / 2, g], [-w / 2, -h - g], [g + 12, 22], [-w - g - 12, -h - 22], [g + 12, -h - 22], [-w - g - 12, 22]];
        const fits = box => box.x >= left + 3 && box.x + box.w <= endX - 2 && box.y >= top + 2 && box.y + box.h <= floorY - 2;
        const clear = box => fits(box) && !boxes.some(other => intersects(box, other))
          && !points.some(other => other !== point && intersects(box, {x: other.x - r - 2, y: other.y - r - 2, w: 2 * r + 4, h: 2 * r + 4}))
          && !segments.some(([a, b]) => segmentHitsBox(a, b, box));
        const candidates = spots.map(([dx, dy]) => ({x: point.x + dx, y: point.y + dy, w, h}));
        const box = candidates.find(clear) || candidates.find(fits) || {x: clamp(point.x + g, left + 3, endX - w - 2), y: clamp(point.y + 3, top + 2, floorY - h - 2), w, h};
        boxes.push(box);
        const nearX = clamp(point.x, box.x, box.x + box.w), nearY = clamp(point.y, box.y, box.y + box.h);
        const leader = Math.hypot(nearX - point.x, nearY - point.y) > r + 12 ? `<line x1="${point.x.toFixed(1)}" y1="${point.y.toFixed(1)}" x2="${nearX.toFixed(1)}" y2="${nearY.toFixed(1)}"/>` : '';
        labels += `<g class="plot-label${point.on ? ' on-frontier' : ''}" data-model="${escape(m.id)}">${leader}<text class="plot-name" x="${box.x.toFixed(1)}" y="${(box.y + 12).toFixed(1)}">${escape(m.short)}</text><text class="plot-value" x="${box.x.toFixed(1)}" y="${(box.y + 27).toFixed(1)}">${escape(value)}</text></g>`;
      });
    }
    body += `<g class="plot-guides"></g>` + labels;
    [...points].sort((a, b) => a.y === b.y ? 0 : b.y - a.y).forEach(({model: m, x, y, on}) => {
      body += `<g class="plot-point${on ? ' on-frontier' : ''}" tabindex="0" data-model="${escape(m.id)}" aria-label="${escape(m.name)}: ${decimal(m[score])}% ${SCORES[score]} pass rate, ${formatResource(m[resource], resource)} mean ${RESOURCES[resource]} per task${on ? ', on the Pareto frontier' : ''}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}"/><image class="plot-logo" href="${escape(m.logo)}" x="${(x - logo / 2).toFixed(1)}" y="${(y - logo / 2).toFixed(1)}" width="${logo}" height="${logo}"/></g>`;
    });
    return {body, shown, frontier, frontierIDs, geom: {X, Y, left, floorY, top, endX}, positions: Object.fromEntries(points.map(p => [p.model.id, [p.x, p.y]]))};
  }

  let paretoView = null, lastPositions = null;
  function renderPareto() {
    hideTooltip();
    const chart = $('#pareto-chart'), list = $('#pareto-list');
    const models = visibleModels();
    const padded = chart.clientWidth - 16;
    const compact = padded < 600;
    chart.classList.toggle('is-narrow', compact);
    const footer = $('#result-pareto .chart-footer').offsetHeight || 44;
    const room = innerHeight - (chart.getBoundingClientRect().top + scrollY) - footer - 20;
    const height = compact ? Math.round(clamp(padded * .86, 280, 400)) : Math.round(clamp(room, 300, Math.min(600, padded * .5)));
    const view = paretoMarkup({width: padded, height, compact, models});
    if (!view.shown.length) {
      chart.innerHTML = '<p class="chart-empty">Choose at least one model with this score and resource.</p>';
      list.innerHTML = ''; $('#pareto-summary').textContent = ''; paretoView = null; return;
    }
    chart.innerHTML = `<svg viewBox="0 0 ${padded} ${height}" width="${padded}" height="${height}" role="group" aria-labelledby="pareto-title" aria-describedby="pareto-description"><title id="pareto-title">${SCORES[state.score]} pass rate versus mean ${RESOURCES[state.resource]} per task</title><desc id="pareto-description">${view.shown.length} models, ${view.frontier.length} on the Pareto frontier. Lower resource use and a higher pass rate are better. ${state.scale === 'log' ? 'Logarithmic' : 'Linear'} horizontal axis.</desc>${view.body}</svg>`;
    paretoView = view;
    list.innerHTML = compact ? view.shown.slice().sort((a, b) => b[state.score] - a[state.score]).map(m => `<li><img class="model-logo" src="${escape(m.logo)}" alt="" width="18" height="18"><b>${escape(m.short)}${view.frontierIDs.has(m.id) ? '<small>frontier</small>' : ''}</b><span>${decimal(m[state.score])}% · ${formatResource(m[state.resource], state.resource)}</span></li>`).join('') : '';
    $('#pareto-summary').textContent = `${view.shown.length} of ${allModels.length} models · ${view.frontier.length} on the frontier`;
    // Points glide from where they were when an axis changes.
    if (lastPositions && lastPositions.width === padded && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      chart.querySelectorAll('.plot-point').forEach(point => {
        const before = lastPositions.points[point.dataset.model], after = view.positions[point.dataset.model];
        if (!before || !after || (before[0] === after[0] && before[1] === after[1])) return;
        point.style.transition = 'none';
        point.style.transform = `translate(${before[0] - after[0]}px, ${before[1] - after[1]}px)`;
        requestAnimationFrame(() => requestAnimationFrame(() => { point.style.transition = ''; point.style.transform = ''; }));
      });
      chart.classList.remove('is-entering'); void chart.getBoundingClientRect(); chart.classList.add('is-entering');
    }
    lastPositions = {width: padded, points: view.positions};
  }
  function heatPoint(point, event) {
    if (!paretoView) return;
    const chart = $('#pareto-chart'), m = paretoView.shown.find(model => model.id === point.dataset.model);
    if (!m) return;
    const {X, Y, left, floorY} = paretoView.geom, {score, resource} = state;
    chart.classList.add('has-hot');
    chart.querySelectorAll('.is-hot').forEach(el => el.classList.remove('is-hot'));
    point.classList.add('is-hot');
    const label = chart.querySelector(`.plot-label[data-model="${CSS.escape(m.id)}"]`); if (label) label.classList.add('is-hot');
    const x = X(m[resource]), y = Y(m[score]), xText = formatResource(m[resource], resource), yText = decimal(m[score]) + '%';
    const chipY = yText.length * 6.8 + 12, chipX = xText.length * 6.8 + 12;
    chart.querySelector('.plot-guides').innerHTML = `<line x1="${left}" y1="${y}" x2="${x}" y2="${y}"/><line x1="${x}" y1="${y}" x2="${x}" y2="${floorY}"/>`
      + `<rect x="${left - chipY - 4}" y="${y - 10}" width="${chipY}" height="20" rx="4"/><text x="${left - 4 - chipY / 2}" y="${y + 4}" text-anchor="middle">${yText}</text>`
      + `<rect x="${x - chipX / 2}" y="${floorY + 5}" width="${chipX}" height="20" rx="4"/><text x="${x}" y="${floorY + 19}" text-anchor="middle">${xText}</text>`;
    const rows = Object.keys(SCORES).map(key => `<div><dt>${SCORES[key]}</dt><dd>${decimal(m[key])}%</dd></div>`).join('')
      + Object.keys(RESOURCE_LABELS).map(key => `<div><dt>${RESOURCE_LABELS[key]}</dt><dd>${formatResource(m[key], key)}</dd></div>`).join('');
    showTooltip(point, `<strong>${escape(m.name)}</strong><span>${escape(m.org)}</span><dl>${rows}</dl><span class="tooltip-status">${paretoView.frontierIDs.has(m.id) ? 'On the Pareto frontier' : 'Another model scores higher for less'}</span>`, event);
  }
  function coolPoints() {
    const chart = $('#pareto-chart');
    chart.classList.remove('has-hot');
    chart.querySelectorAll('.is-hot').forEach(el => el.classList.remove('is-hot'));
    const guides = chart.querySelector('.plot-guides'); if (guides) guides.innerHTML = '';
    hideTooltip();
  }
  {
    const chart = $('#pareto-chart');
    chart.addEventListener('pointerover', event => { const point = event.target.closest('.plot-point'); if (point) heatPoint(point, event); });
    chart.addEventListener('pointerout', event => { if (event.target.closest('.plot-point') && !(event.relatedTarget && event.relatedTarget.closest && event.relatedTarget.closest('.plot-point'))) coolPoints(); });
    chart.addEventListener('focusin', event => { const point = event.target.closest('.plot-point'); if (point) heatPoint(point); });
    chart.addEventListener('focusout', coolPoints);
  }

  /* ---------------------------------------------------------------- Waffle */
  const entryFor = (task, model) => task.results[model.id].contexts.overview;
  const trialScore = entry => entry.status === 'scored' ? 100 * entry.passed / entry.total : null;
  const statusText = entry => entry.status === 'timeout' ? 'Timeout' : 'Error';
  const byMeanDescending = (a, b) => a.mean === null || b.mean === null
    ? Number(a.mean === null) - Number(b.mean === null) || a.name.localeCompare(b.name)
    : b.mean - a.mean || a.name.localeCompare(b.name);
  function waffleData() {
    const models = waffleModels.filter(m => state.models.has(m.id)).map(model => {
      const known = tasks.map(task => entryFor(task, model)).filter(e => e.status === 'scored');
      const passed = known.reduce((sum, e) => sum + e.passed, 0), total = known.reduce((sum, e) => sum + e.total, 0);
      return {...model, mean: total ? 100 * passed / total : null};
    }).sort(byMeanDescending);
    let rows = tasks.map(task => {
      const scores = models.map(model => trialScore(entryFor(task, model))).filter(score => score !== null);
      return {task, name: task.name, mean: scores.length ? scores.reduce((sum, s) => sum + s, 0) / scores.length : null};
    }).sort(byMeanDescending);
    if (state.sort === 'name') rows = rows.slice().sort((a, b) => a.name.localeCompare(b.name, 'en', {sensitivity: 'base'}));
    const sortModel = models.find(m => m.id === state.sort);
    if (sortModel) {
      const value = row => trialScore(entryFor(row.task, sortModel));
      rows = rows.slice().sort((a, b) => (value(b) === null ? -1 : value(b)) - (value(a) === null ? -1 : value(a)));
    }
    return {models, rows};
  }
  const taskHref = (task, model, entry) => `/tasks?task=${encodeURIComponent(task.id)}${model ? `&model=${encodeURIComponent(model.id)}` : ''}${entry && entry.run ? `&run=${encodeURIComponent(entry.run)}` : ''}`;
  const clip = (text, limit) => text.length > limit ? text.slice(0, limit - 1).trimEnd() + '…' : text;

  function waffleMarkup({width, data, exporting}) {
    const {models, rows} = data, n = rows.length, m = models.length;
    const paint = scorePainter();
    const angle = 58 * Math.PI / 180;
    const horizontal = exporting || width >= 940;
    let body = '', height, cellAt;
    const link = (attrs, inner) => exporting ? `<g ${attrs.replace(/ ?href="[^"]*"/, '')}>${inner}</g>` : `<a ${attrs}>${inner}</a>`;
    const cell = (r, c, box) => {
      const {task} = rows[c], model = models[r], entry = entryFor(task, model), score = trialScore(entry);
      const fill = score !== null ? ` fill="${paint(score)}"` : '';
      const kind = score !== null ? '' : entry.status === 'timeout' ? ' is-timeout' : ' is-error';
      const description = score !== null ? `${entry.passed.toLocaleString('en-US')} of ${entry.total.toLocaleString('en-US')} tests, ${decimal(score)}%` : statusText(entry);
      const rect = `<rect class="wf-cell${kind}" x="${box.x + .5}" y="${box.y + .5}" width="${box.w - 1}" height="${box.h - 1}" rx="2"${fill}/>`;
      if (exporting) return rect;
      return `<a class="wf-link" href="${taskHref(task, model, entry)}" tabindex="${r === 0 && c === 0 ? 0 : -1}" data-r="${r}" data-c="${c}" aria-label="${escape(task.name)}, ${escape(model.name)}: ${escape(description)}">${rect}</a>`;
    };
    if (horizontal) {
      const labelW = 194, longest = Math.min(18, Math.max(...rows.map(row => row.name.length)));
      const headH = Math.ceil(longest * 5.5 * Math.sin(angle)) + 8, rightPad = 36;
      const pitch = state.large && !exporting ? 21 : clamp(Math.floor((width - labelW - rightPad) / n), 9, 21);
      const cellSize = pitch - 2, rowPitch = Math.max(pitch, 22), cellH = rowPitch - 2;
      height = headH + m * rowPitch + 4;
      const gridW = n * pitch;
      const total = labelW + gridW + rightPad;
      cellAt = (r, c) => ({x: labelW + c * pitch, y: headH + r * rowPitch, w: cellSize, h: cellH});
      if (!exporting) body += `<rect class="wf-band wf-band-r" x="0" y="0" width="${labelW + gridW - 2}" height="${rowPitch}" rx="4"/><rect class="wf-band wf-band-c" x="0" y="0" width="${pitch}" height="${height - 4}" rx="4"/>`;
      rows.forEach((row, c) => {
        const x = labelW + c * pitch + cellSize / 2 + 3, y = headH - 6;
        body += link(`class="wf-task" href="${taskHref(row.task)}" tabindex="-1" data-c="${c}"`, `<text transform="translate(${x} ${y}) rotate(-58)">${escape(clip(row.name, 18))}</text>`);
      });
      models.forEach((model, r) => {
        const y = headH + r * rowPitch + cellH / 2;
        const logo = 14;
        body += `<g class="wf-model" data-r="${r}" data-model="${escape(model.id)}"><rect class="wf-model-hit" x="0" y="${headH + r * rowPitch - 1}" width="${labelW - 6}" height="${rowPitch}" fill="transparent"/><image class="plot-logo" href="${escape(model.logo)}" x="0" y="${y - logo / 2}" width="${logo}" height="${logo}"/><text class="wf-model-name" x="20" y="${y + 4}">${escape(clip(model.short, 19))}</text><text class="wf-model-score" x="${labelW - 12}" y="${y + 3.5}" text-anchor="end">${model.mean === null ? '' : decimal(model.mean)}</text></g>`;
        rows.forEach((row, c) => { body += cell(r, c, cellAt(r, c)); });
      });
      return {body, width: Math.max(total, width), height, contentWidth: total, cellAt, horizontal, labelW, headH, gridW, pitch, rowsTop: headH};
    }
    // Narrow screens: tasks down the side, models across the top, in one or two blocks.
    const blocks = width >= 700 ? 2 : 1, gutter = 24;
    const blockW = (width - gutter * (blocks - 1)) / blocks;
    const labelW = blocks === 2 ? 138 : 120, longest = Math.min(19, Math.max(...models.map(model => model.short.length)));
    const headH = Math.ceil(longest * 5.6 * Math.sin(angle)) + 12, rightPad = Math.ceil(longest * 5.6 * Math.cos(angle)) - 8;
    const colPitch = clamp(Math.floor((blockW - labelW - rightPad) / m), 14, 26), rowPitch = state.large ? 20 : 15;
    const perBlock = Math.ceil(n / blocks);
    height = headH + perBlock * rowPitch + 4;
    cellAt = (r, c) => {
      const block = Math.floor(c / perBlock), offset = block * (blockW + gutter);
      return {x: offset + labelW + r * colPitch, y: headH + (c - block * perBlock) * rowPitch, w: colPitch - 2, h: rowPitch - 2};
    };
    for (let block = 0; block < blocks; block++) {
      const offset = block * (blockW + gutter);
      models.forEach((model, r) => {
        const x = offset + labelW + r * colPitch + colPitch / 2 + 2;
        body += `<g class="wf-model" data-r="${r}" data-model="${escape(model.id)}"><text class="wf-model-name" transform="translate(${x} ${headH - 6}) rotate(-58)">${escape(clip(model.short, 19))}</text></g>`;
      });
    }
    rows.forEach((row, c) => {
      const box = cellAt(0, c);
      body += link(`class="wf-task" href="${taskHref(row.task)}" tabindex="-1" data-c="${c}"`, `<text x="${box.x - 8}" y="${box.y + box.h - 2.5}" text-anchor="end">${escape(clip(row.name, blocks === 2 ? 22 : 19))}</text>`);
      models.forEach((model, r) => { body += cell(r, c, cellAt(r, c)); });
    });
    return {body, width, height, contentWidth: width, cellAt, horizontal, labelW, headH};
  }

  let waffleView = null, waffleCurrent = null, armedCell = null, lastPointer = 'mouse';
  function renderWaffle() {
    hideTooltip();
    const chart = $('#waffle-chart'), holder = $('#result-waffle .waffle-scroll');
    const width = holder.clientWidth - 24;
    const data = waffleData();
    if (!data.models.length) { chart.innerHTML = ''; return; }
    const view = waffleMarkup({width, data});
    waffleView = {...view, data};
    chart.innerHTML = `<svg viewBox="0 0 ${view.contentWidth} ${view.height}" width="${view.contentWidth}" height="${view.height}" role="group" aria-label="Tests passed by task and model">${view.body}<rect class="wf-focus" x="0" y="0" width="0" height="0" rx="3"/></svg>`;
    chart.style.justifyContent = view.contentWidth < width ? 'center' : 'flex-start';
    const paint = scorePainter();
    $('#waffle-legend').innerHTML = `<span class="wf-legend-scale"><span>0%</span>${[0, 5, 10, 25, 50, 100].map(value => `<i style="background:${paint(value)}" aria-hidden="true"></i>`).join('')}<span>100%</span></span><span class="wf-legend-item"><i class="wf-key-timeout" aria-hidden="true"></i>Timeout</span><span class="wf-legend-item"><i class="wf-key-error" aria-hidden="true"></i>Error</span><span class="wf-legend-note">each cell is one run</span>`;
    const select = $('#waffle-sort');
    select.innerHTML = `<option value="difficulty">Easiest first</option><option value="name">Name</option>${data.models.map(m => `<option value="${escape(m.id)}">${escape(m.short)} score</option>`).join('')}`;
    if (![...select.options].some(option => option.value === state.sort)) state.sort = 'difficulty';
    select.value = state.sort;
    const expand = $('#waffle-expand');
    expand.setAttribute('aria-pressed', String(state.large));
    expand.setAttribute('aria-label', state.large ? 'Use the compact Waffle' : 'Enlarge the Waffle');
    expand.title = state.large ? 'Compact' : 'Enlarge';
  }
  function waffleCellParts(link) {
    const r = Number(link.dataset.r), c = Number(link.dataset.c), {models, rows} = waffleView.data;
    const model = models[r], task = rows[c].task;
    return {r, c, model, task, entry: entryFor(task, model)};
  }
  function heatCell(link, event) {
    const chart = $('#waffle-chart'), {r, c, model, task, entry} = waffleCellParts(link), score = trialScore(entry), box = waffleView.cellAt(r, c);
    chart.querySelectorAll('.is-hot').forEach(el => el.classList.remove('is-hot'));
    const row = chart.querySelectorAll(`.wf-model[data-r="${r}"]`), col = chart.querySelector(`.wf-task[data-c="${c}"]`);
    row.forEach(el => el.classList.add('is-hot')); if (col) col.classList.add('is-hot');
    const bandR = chart.querySelector('.wf-band-r'), bandC = chart.querySelector('.wf-band-c');
    if (bandR && bandC) {
      bandR.setAttribute('y', box.y - 1); bandC.setAttribute('x', box.x - 1);
      bandR.classList.add('is-on'); bandC.classList.add('is-on');
    }
    const focus = chart.querySelector('.wf-focus');
    focus.setAttribute('x', box.x - .5); focus.setAttribute('y', box.y - .5); focus.setAttribute('width', box.w + 1); focus.setAttribute('height', box.h + 1); focus.classList.add('is-on');
    let details = `<strong>${escape(task.name)}</strong><span>${escape(model.name)}</span>`;
    details += score !== null ? `<span class="tooltip-score">${entry.passed.toLocaleString('en-US')} of ${entry.total.toLocaleString('en-US')} tests · ${decimal(score)}%</span>` : `<span class="tooltip-score">${statusText(entry)}</span>`;
    details += '<span class="tooltip-status">Open the task →</span>';
    showTooltip(link, details, event);
    waffleCurrent = link;
  }
  function coolCells() {
    const chart = $('#waffle-chart');
    chart.querySelectorAll('.is-hot, .is-on').forEach(el => el.classList.remove('is-hot', 'is-on'));
    hideTooltip(); armedCell = null;
  }
  {
    const chart = $('#waffle-chart');
    chart.addEventListener('pointerdown', event => { lastPointer = event.pointerType; });
    chart.addEventListener('pointerover', event => {
      const link = event.target.closest('.wf-link');
      if (link) { if (event.pointerType !== 'touch') heatCell(link, event); return; }
      const task = event.target.closest('.wf-task');
      if (task) {
        chart.querySelectorAll('.is-hot').forEach(el => el.classList.remove('is-hot')); task.classList.add('is-hot');
        const band = chart.querySelector('.wf-band-c');
        if (band) { band.setAttribute('x', waffleView.cellAt(0, Number(task.dataset.c)).x - 1); band.classList.add('is-on'); }
      }
      const model = event.target.closest('.wf-model');
      if (model) {
        const band = chart.querySelector('.wf-band-r');
        if (band) { band.setAttribute('y', waffleView.cellAt(Number(model.dataset.r), 0).y - 1); band.classList.add('is-on'); }
      }
    });
    chart.addEventListener('pointerleave', () => { if (document.activeElement && chart.contains(document.activeElement)) return; coolCells(); });
    chart.addEventListener('pointerout', event => {
      if (!event.relatedTarget || !event.relatedTarget.closest || !event.relatedTarget.closest('.wf-link, .wf-task, .wf-model')) coolCells();
    });
    chart.addEventListener('focusin', event => { const link = event.target.closest('.wf-link'); if (link) heatCell(link); });
    chart.addEventListener('focusout', coolCells);
    chart.addEventListener('click', event => {
      const model = event.target.closest('.wf-model');
      if (model) { state.sort = state.sort === model.dataset.model ? 'difficulty' : model.dataset.model; renderWaffle(); syncURL(); return; }
      const link = event.target.closest('.wf-link');
      if (link && lastPointer === 'touch' && armedCell !== link) { event.preventDefault(); armedCell = link; heatCell(link); }
    });
    chart.addEventListener('keydown', event => {
      const link = event.target.closest('.wf-link'); if (!link) return;
      if (event.key === 'Enter') { location.href = link.getAttribute('href'); return; }
      const {models, rows} = waffleView.data;
      const horizontal = waffleView.horizontal;
      let r = Number(link.dataset.r), c = Number(link.dataset.c);
      const moves = horizontal
        ? {ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0]}
        : {ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1]};
      if (moves[event.key]) { r = clamp(r + moves[event.key][0], 0, models.length - 1); c = clamp(c + moves[event.key][1], 0, rows.length - 1); }
      else if (event.key === 'Home') c = 0;
      else if (event.key === 'End') c = rows.length - 1;
      else return;
      event.preventDefault();
      const next = chart.querySelector(`.wf-link[data-r="${r}"][data-c="${c}"]`);
      if (next) { link.setAttribute('tabindex', '-1'); next.setAttribute('tabindex', '0'); next.focus({preventScroll: true}); }
    });
    $('#waffle-expand').addEventListener('click', () => { state.large = !state.large; renderWaffle(); syncURL(); });
    $('#waffle-sort').addEventListener('change', event => { state.sort = event.target.value; renderWaffle(); syncURL(); });
  }

  /* ---------------------------------------------------------------- view switching */
  const tabs = $$('[data-view]');
  const panels = $$('.result-panel');
  function renderCurrent() {
    if (state.view === 'table') renderTable();
    if (state.view === 'pareto') renderPareto();
    if (state.view === 'waffle') renderWaffle();
  }
  function showView(view, updateURL = true) {
    state.view = VIEWS.includes(view) ? view : 'table';
    closeMenus(); hideTooltip();
    tabs.forEach(tab => { const selected = tab.dataset.view === state.view; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; });
    panels.forEach(panel => { panel.hidden = panel.id !== `result-${state.view}`; });
    $('#columns-btn').disabled = state.view !== 'table';
    $('#board-csv').href = state.view === 'waffle' ? 'data/waffle-overview.csv' : 'data/leaderboard-overview.csv';
    renderCurrent();
    if (updateURL) syncURL();
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

  /* ---------------------------------------------------------------- menus */
  const menuButtons = $$('[data-menu]');
  function closeMenus(refocus) {
    menuButtons.forEach(button => {
      const pop = $('#' + button.getAttribute('aria-controls'));
      if (pop.hidden) return;
      pop.hidden = true; button.setAttribute('aria-expanded', 'false');
      if (refocus) button.focus();
    });
  }
  menuButtons.forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      const pop = $('#' + button.getAttribute('aria-controls')), opening = pop.hidden;
      closeMenus();
      if (!opening) return;
      if (button.id === 'share-btn') refreshShareLinks();
      pop.hidden = false; button.setAttribute('aria-expanded', 'true');
      const first = pop.querySelector('a, button, input'); if (first) first.focus({preventScroll: true});
    });
  });
  document.addEventListener('click', event => { if (!event.target.closest('.tool-pop')) closeMenus(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { closeMenus(true); hideTooltip(); return; }
    const menu = event.target.closest && event.target.closest('[role="menu"]');
    if (!menu || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = $$('[role="menuitem"]', menu), at = items.indexOf(event.target);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  });

  let statusTimer;
  function announce(message, source) {
    const status = $('#tool-status');
    status.textContent = message; status.classList.add('is-on');
    clearTimeout(statusTimer);
    if (source) source.classList.add('is-done');
    statusTimer = setTimeout(() => { status.classList.remove('is-on'); status.textContent = ''; $$('.tool-btn.is-done').forEach(el => el.classList.remove('is-done')); }, 2000);
  }

  /* ---------------------------------------------------------------- copy link and share */
  $('#copy-link').addEventListener('click', async event => {
    try { await navigator.clipboard.writeText(stateURL()); announce('Link copied', event.currentTarget || $('#copy-link')); }
    catch (_) { announce('Copy this page address from the browser'); }
  });
  function refreshShareLinks() {
    const url = stateURL();
    const best = Math.max(...allModels.map(m => m.overall));
    const text = `${TITLE} The best model passes ${decimal(best)}% of the hidden tests on WebsiteBench.`;
    const links = {
      x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
      reddit: `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`,
      hn: `https://news.ycombinator.com/submitlink?u=${encodeURIComponent(url)}&t=${encodeURIComponent(TITLE)}`,
    };
    $$('[data-share]').forEach(link => { link.href = links[link.dataset.share]; });
  }
  $('#share-menu').addEventListener('click', event => { if (event.target.closest('a')) closeMenus(); });

  /* ---------------------------------------------------------------- filter and columns */
  function renderFilter() {
    const list = $('#filter-list');
    if (!list.childElementCount) {
      list.innerHTML = allModels.map(m => `<li><label><input type="checkbox" data-model="${escape(m.id)}"><img class="model-logo" src="${escape(m.logo)}" alt="" width="16" height="16"><span>${escape(m.name)}</span></label></li>`).join('');
    }
    $$('input', list).forEach(input => { input.checked = state.models.has(input.dataset.model); });
    const openIDs = allModels.filter(m => m.group === 'open').map(m => m.id), closedIDs = allModels.filter(m => m.group !== 'open').map(m => m.id);
    const same = ids => ids.length === state.models.size && ids.every(id => state.models.has(id));
    const active = same(allModels.map(m => m.id)) ? 'all' : same(closedIDs) ? 'proprietary' : same(openIDs) ? 'open' : '';
    $$('[data-group]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.group === active)));
    const count = $('#filter-count'), filtered = state.models.size !== allModels.length;
    count.hidden = !filtered; count.textContent = state.models.size;
    $('#filter-btn').classList.toggle('is-active', filtered);
    $('#filter-btn').setAttribute('aria-label', filtered ? `Filter models, ${state.models.size} shown` : 'Filter models');
  }
  $('#filter-list').addEventListener('change', event => {
    const id = event.target.dataset.model; if (!id) return;
    if (!event.target.checked && state.models.size === 1) { event.target.checked = true; return; }
    if (event.target.checked) state.models.add(id); else state.models.delete(id);
    renderFilter(); renderCurrent(); syncURL();
  });
  $$('[data-group]').forEach(button => button.addEventListener('click', () => {
    const group = button.dataset.group;
    state.models = new Set(allModels.filter(m => group === 'all' || (group === 'open' ? m.group === 'open' : m.group !== 'open')).map(m => m.id));
    renderFilter(); renderCurrent(); syncURL();
  }));
  function renderColumns() {
    const list = $('#columns-list');
    if (!list.childElementCount) list.innerHTML = Object.entries(COLUMNS).map(([key, label]) => `<li><label><input type="checkbox" data-col="${key}"><span>${label}</span></label></li>`).join('');
    $$('input', list).forEach(input => { input.checked = state.columns.has(input.dataset.col); });
    const hidden = Object.keys(COLUMNS).length - state.columns.size;
    $('#columns-btn').classList.toggle('is-active', hidden > 0);
    const count = $('#columns-count'); count.hidden = !hidden; count.textContent = state.columns.size;
  }
  $('#columns-list').addEventListener('change', event => {
    const key = event.target.dataset.col; if (!key) return;
    if (!event.target.checked && state.columns.size === 1) { event.target.checked = true; return; }
    if (event.target.checked) state.columns.add(key); else state.columns.delete(key);
    renderColumns(); renderTable(); syncURL();
  });

  /* ---------------------------------------------------------------- export */
  const toBase64 = buffer => {
    const bytes = new Uint8Array(buffer); let out = '';
    for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(out);
  };
  const assetCache = new Map();
  const dataURI = (path, type) => {
    if (!assetCache.has(path)) assetCache.set(path, fetch(path).then(response => response.arrayBuffer()).then(buffer => `data:${type};base64,${toBase64(buffer)}`));
    return assetCache.get(path);
  };
  async function exportCSS() {
    let rules = '';
    for (const sheet of document.styleSheets) {
      let list; try { list = sheet.cssRules; } catch (_) { continue; }
      for (const rule of list) if (rule.selectorText && /^(\.plot-|\.frontier-|\.axis-title|\.wf-|\.xt-)/.test(rule.selectorText) && !/:hover|:focus|is-hot|is-on|has-hot/.test(rule.selectorText)) rules += rule.cssText + '\n';
    }
    rules = rules.replace(/var\((--[\w-]+)(?:,[^)]*)?\)/g, (_, name) => token(name));
    const faces = await Promise.all([
      ['Schibsted Grotesk', 'schibsted-grotesk-latin', '400 900', ''],
      ['Martian Mono', 'martian-mono-latin', '100 800', 'font-stretch:75% 112.5%;'],
      ['EB Garamond', 'eb-garamond-latin', '400 800', ''],
    ].map(async ([family, file, weight, extra]) => `@font-face{font-family:'${family}';font-weight:${weight};${extra}src:url(${await dataURI(`/assets/fonts/${file}.woff2`, 'font/woff2')}) format('woff2');}`));
    return faces.join('\n') + '\n' + rules;
  }
  function tableMarkup(width, models) {
    const columns = Object.keys(COLUMNS).filter(key => state.columns.has(key));
    const fmt = (key, value) => value === null || value === undefined ? '—' : WebsiteBenchLeaderboard.format(key, value);
    const rowH = 38, headH = 34;
    const rankW = 34, modelW = 228, numW = 92;
    const others = columns.filter(key => key !== 'overall');
    const overallW = columns.includes('overall') ? Math.max(200, width - rankW - modelW - others.length * numW) : 0;
    const best = Object.fromEntries(Object.keys(SCORES).map(key => [key, Math.max(...models.map(m => m[key] === null ? -Infinity : m[key]))]));
    let x = rankW + modelW, heads = `<text class="xt-head" x="4" y="22">#</text><text class="xt-head" x="${rankW}" y="22">Model</text>`, positions = {};
    if (overallW) { positions.overall = x + overallW; heads += `<text class="xt-head" x="${positions.overall - 8}" y="22" text-anchor="end">Overall</text>`; x += overallW; }
    others.forEach(key => { x += numW; positions[key] = x; heads += `<text class="xt-head" x="${x - 8}" y="22" text-anchor="end">${COLUMNS[key]}</text>`; });
    let body = `<line class="plot-axis" x1="0" y1="${headH}" x2="${width}" y2="${headH}"/>` + heads;
    models.forEach((m, index) => {
      const y = headH + index * rowH, mid = y + rowH / 2;
      body += `<text class="xt-rank" x="4" y="${mid + 4}">${index + 1}</text><image class="plot-logo" href="${escape(m.logo)}" x="${rankW}" y="${mid - 8}" width="16" height="16"/><text class="xt-name" x="${rankW + 24}" y="${mid + 4.5}">${escape(m.name)}</text>`;
      if (overallW) {
        const barW = overallW - 80;
        body += `<rect class="xt-track" x="${rankW + modelW}" y="${mid - 5}" width="${barW}" height="10" rx="5"/><rect class="${m.group === 'open' ? 'xt-open' : 'xt-proprietary'}" x="${rankW + modelW}" y="${mid - 5}" width="${(barW * (m.overall || 0) / 100).toFixed(1)}" height="10" rx="5"/>`;
        body += `<text class="xt-cell${m.overall === best.overall ? ' xt-best' : ''}" x="${positions.overall - 8}" y="${mid + 4.5}" text-anchor="end">${fmt('overall', m.overall)}</text>`;
      }
      others.forEach(key => { body += `<text class="xt-cell${SCORES[key] && m[key] === best[key] ? ' xt-best' : ''}" x="${positions[key] - 8}" y="${mid + 4.5}" text-anchor="end">${fmt(key, m[key])}</text>`; });
      body += `<line class="plot-grid" x1="0" y1="${y + rowH}" x2="${width}" y2="${y + rowH}"/>`;
    });
    const height = headH + models.length * rowH + 30;
    body += `<rect class="xt-proprietary" x="0" y="${height - 15}" width="18" height="8" rx="4"/><text class="xt-note" x="24" y="${height - 7}">Proprietary model</text><rect class="xt-open" x="150" y="${height - 15}" width="18" height="8" rx="4"/><text class="xt-note" x="174" y="${height - 7}">Open-source model</text>`;
    return {body, height};
  }
  function currentTitle() {
    if (state.view === 'pareto') return `${SCORES[state.score]} pass rate vs. mean ${RESOURCES[state.resource]} per task`;
    if (state.view === 'waffle') return 'Tests passed by task and model';
    return 'Leaderboard';
  }
  async function buildSVG() {
    const W = 1280, pad = 36, inner = W - 2 * pad, top = 92, foot = 46;
    let body, bodyH;
    if (state.view === 'table') {
      const view = tableMarkup(inner, tableModels()); body = view.body; bodyH = view.height;
    } else if (state.view === 'pareto') {
      const view = paretoMarkup({width: inner, height: 560, compact: false, models: visibleModels()});
      bodyH = 560 + 26;
      const legendY = 560 + 16;
      body = view.body + `<circle class="xt-frontier-key" cx="8" cy="${legendY}" r="6"/><text class="xt-note" x="22" y="${legendY + 4}">Pareto frontier</text><circle class="xt-other-key" cx="136" cy="${legendY}" r="6"/><text class="xt-note" x="150" y="${legendY + 4}">Other models</text><text class="xt-note" x="${inner}" y="${legendY + 4}" text-anchor="end">${view.shown.length} of ${allModels.length} models · ${view.frontier.length} on the frontier</text>`;
    } else {
      const data = waffleData(), view = waffleMarkup({width: inner, data, exporting: true}), paint = scorePainter();
      const legendY = view.height + 22;
      let legend = `<text class="xt-note" x="${view.labelW}" y="${legendY + 9}">0%</text>`;
      [0, 5, 10, 25, 50, 100].forEach((value, i) => { legend += `<rect class="wf-cell" x="${view.labelW + 26 + i * 15}" y="${legendY}" width="12" height="12" rx="2" fill="${paint(value)}"/>`; });
      const after = view.labelW + 26 + 6 * 15 + 4;
      legend += `<text class="xt-note" x="${after}" y="${legendY + 9}">100%</text><rect class="wf-cell is-timeout" x="${after + 52}" y="${legendY}" width="12" height="12" rx="2"/><text class="xt-note" x="${after + 70}" y="${legendY + 9}">Timeout</text><rect class="wf-cell is-error" x="${after + 134}" y="${legendY}" width="12" height="12" rx="2"/><text class="xt-note" x="${after + 152}" y="${legendY + 9}">Error</text><text class="xt-note" x="${after + 206}" y="${legendY + 9}">each cell is one run</text>`;
      body = view.body + legend; bodyH = legendY + 18;
    }
    const height = top + bodyH + foot;
    const logos = [...new Set(allModels.map(m => m.logo))];
    const uris = Object.fromEntries(await Promise.all(logos.map(async logo => [logo, await dataURI(logo, 'image/svg+xml')])));
    body = body.replace(/href="(assets\/logos\/[^"]+)"/g, (_, logo) => `href="${uris[logo]}"`);
    const dark = toRGB(token('--paper')).reduce((sum, v) => sum + v, 0) < 380;
    if (dark) body = body.replace(/<image /g, '<image filter="url(#wb-invert)" ');
    const css = await exportCSS();
    const ink = token('--ink'), accent = token('--brand-accent') || token('--salmon');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="img" aria-label="WebsiteBench: ${escape(currentTitle())}"><title>WebsiteBench: ${escape(currentTitle())}</title><defs><filter id="wb-invert" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="-1 0 0 0 1 0 -1 0 0 1 0 0 -1 0 1 0 0 0 1 0"/></filter><style><![CDATA[
${css}
.xh-brand{font:500 27px 'EB Garamond',serif;fill:${ink};}
.xh-title{font:600 15px 'Schibsted Grotesk',sans-serif;fill:${ink};}
.xh-meta{font:500 12px 'Martian Mono',monospace;font-stretch:86%;fill:${token('--ink-3')};}
]]></style></defs><rect width="${W}" height="${height}" fill="${token('--paper')}"/>`
      + `<g transform="translate(${pad} 22)"><g transform="scale(.82)"><rect x="3" y="5" width="26" height="22" rx="4" fill="none" stroke="${ink}" stroke-width="2.5"/><path d="M16 5h9a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4h-9z" fill="${ink}"/><path d="M16 1.5v29" stroke="${accent}" stroke-width="2.5"/></g><text class="xh-brand" x="36" y="21">WebsiteBench</text></g>`
      + `<text class="xh-title" x="${pad}" y="74">${escape(currentTitle())}</text>`
      + `<svg x="${pad}" y="${top}" width="${inner}" height="${bodyH}" viewBox="0 0 ${inner} ${bodyH}" overflow="visible">${body}</svg>`
      + `<line x1="${pad}" y1="${height - foot + 8}" x2="${W - pad}" y2="${height - foot + 8}" stroke="${token('--rule')}"/><text class="xh-meta" x="${pad}" y="${height - 14}">${escape(TITLE)}</text><text class="xh-meta" x="${W - pad}" y="${height - 14}" text-anchor="end">website-bench.com</text></svg>`;
    return {svg, width: W, height};
  }
  async function buildPNG() {
    const {svg, width, height} = await buildSVG();
    const image = new Image();
    image.src = 'data:image/svg+xml;base64,' + toBase64(new TextEncoder().encode(svg).buffer);
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width * 2; canvas.height = height * 2;
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG failed')), 'image/png'));
  }
  function buildMarkdown() {
    let table;
    if (state.view === 'table') {
      const columns = Object.keys(COLUMNS).filter(key => state.columns.has(key));
      table = [`| # | Model | ${columns.map(key => COLUMNS[key]).join(' | ')} |`, `|---|---|${columns.map(() => '---:').join('|')}|`,
        ...tableModels().map((m, i) => `| ${i + 1} | ${m.name} | ${columns.map(key => WebsiteBenchLeaderboard.format(key, m[key])).join(' | ')} |`)];
    } else if (state.view === 'pareto') {
      const view = paretoMarkup({width: 1000, height: 500, compact: true, models: visibleModels()});
      table = [`| Model | ${SCORES[state.score]} pass rate | Mean ${RESOURCES[state.resource]} per task | Pareto frontier |`, '|---|---:|---:|---|',
        ...view.shown.slice().sort((a, b) => b[state.score] - a[state.score]).map(m => `| ${m.name} | ${decimal(m[state.score])}% | ${formatResource(m[state.resource], state.resource)} | ${view.frontierIDs.has(m.id) ? 'Yes' : ''} |`)];
    } else {
      const {models, rows} = waffleData();
      table = [`| Task | ${models.map(m => m.short).join(' | ')} |`, `|---|${models.map(() => '---:').join('|')}|`,
        ...rows.map(row => `| ${row.name} | ${models.map(m => { const e = entryFor(row.task, m); return e.status === 'scored' ? `${e.passed}/${e.total}` : statusText(e); }).join(' | ')} |`)];
    }
    return `**WebsiteBench: ${currentTitle()}**\n\n${table.join('\n')}\n\nSource: ${stateURL()}\n`;
  }
  function download(blob, extension) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `websitebench-${state.view}.${extension}`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  }
  $('#export-menu').addEventListener('click', async event => {
    const item = event.target.closest('[data-export], a'); if (!item) return;
    const action = item.dataset.export, source = $('#export-btn');
    closeMenus();
    if (!action) { announce('CSV downloaded', source); return; }
    try {
      if (action === 'markdown') { await navigator.clipboard.writeText(buildMarkdown()); announce('Markdown copied', source); }
      if (action === 'copy-png') { await navigator.clipboard.write([new ClipboardItem({'image/png': buildPNG()})]); announce('PNG copied', source); }
      if (action === 'png') { download(await buildPNG(), 'png'); announce('PNG downloaded', source); }
      if (action === 'svg') { const {svg} = await buildSVG(); download(new Blob([svg], {type: 'image/svg+xml'}), 'svg'); announce('SVG downloaded', source); }
    } catch (_) { announce('Your browser blocked this. Try Download PNG.'); }
  });

  /* ---------------------------------------------------------------- wiring */
  [['pareto-score', 'score'], ['pareto-resource', 'resource'], ['pareto-scale', 'scale'], ['pareto-range', 'range']].forEach(([id, key]) => {
    const select = $('#' + id); select.value = state[key];
    select.addEventListener('change', () => { state[key] = select.value; renderPareto(); syncURL(); });
  });
  let resizeFrame, lastWidth = innerWidth, lastHeight = innerHeight;
  window.addEventListener('resize', () => {
    if (innerWidth === lastWidth && innerHeight === lastHeight) return;
    lastWidth = innerWidth; lastHeight = innerHeight;
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { lastPositions = null; if (state.view !== 'table') renderCurrent(); });
  });
  // Waffle colours are computed from the theme, so a theme change redraws the charts.
  new MutationObserver(() => { if (state.view === 'waffle') renderWaffle(); }).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.view === 'waffle') renderWaffle(); });

  renderFilter(); renderColumns();
  showView(state.view, false);
})();
