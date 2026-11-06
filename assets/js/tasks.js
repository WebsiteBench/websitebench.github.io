/* Task browser: a contact sheet of the 70 websites and, for one website, every run's result beside a reference and rebuild comparison. */
(async () => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const count = value => value.toLocaleString('en-US');
  const taskUrl = (task, extra = {}) => `tasks.html?${new URLSearchParams({task: task.id, ...extra})}`;
  const setPressed = (group, isOn) => group.querySelectorAll('button[aria-pressed]').forEach(b => b.setAttribute('aria-pressed', String(isOn(b))));

  const [materials, previews] = await Promise.all(['data/task-materials.json', 'data/task-previews.json'].map(url => fetch(url).then(r => r.json())));

  const tasks = materials.tasks.map(task => {
    const runs = materials.models.flatMap(model => task.models[model.id].runs.map(run => {
      const [passed, total] = run.scores.length ? run.scores[0].value.split('/').map(Number) : [null, null];
      const [size, effort] = run.context.split('-');
      return {id: run.id, model, size: size.toUpperCase(), effort, passed, total, rate: total && 100 * passed / total};
    })).sort((a, b) => (a.rate === null) - (b.rate === null) || b.rate - a.rate || a.model.name.localeCompare(b.model.name));
    // A task's hidden test count is the total used by most of its scored runs, as in tools/prerender.js.
    const totals = new Map();
    for (const run of runs) if (run.total) totals.set(run.total, (totals.get(run.total) || 0) + 1);
    const tests = [...totals].sort((a, b) => b[1] - a[1])[0][0];
    return {id: task.id, name: task.name, runs, tests, best: runs[0], views: previews.tasks[task.id]?.views || []};
  }).sort((a, b) => a.name.localeCompare(b.name, 'en', {sensitivity: 'base'}));

  const shot = (view, run) => view.runs[run.id]?.image;
  const runLabel = run => run.model.name + (run.size ? `, ${run.size}` : '');
  const testsPassed = run => `${count(run.passed)} of ${count(run.total)} tests passed`;

  /* ------------------------------------------------------- contact sheet */
  const grid = $('#task-grid');
  const sorts = {name: () => 0, best: (a, b) => b.best.rate - a.best.rate, tests: (a, b) => b.tests - a.tests};
  const hardest = tasks.reduce((a, b) => (b.best.rate < a.best.rate ? b : a));
  const easiest = tasks.reduce((a, b) => (b.best.rate > a.best.rate ? b : a));
  const testCounts = tasks.map(t => t.tests);
  $('#catalog-lede').textContent = `Every website in the benchmark, with its hidden tests and the best pass rate any model reached on it: from ${hardest.best.rate.toFixed(1)}% on ${hardest.name} to ${easiest.best.rate.toFixed(1)}% on ${easiest.name}. Select one to compare each model’s rebuild with the reference.`;
  $('#catalog-facts').innerHTML = `<li><b>${tasks.length}</b> websites</li><li><b>${count(testCounts.reduce((a, b) => a + b))}</b> hidden tests</li><li><b>${count(Math.min(...testCounts))}</b> tests on the smallest</li><li><b>${count(Math.max(...testCounts))}</b> tests on the largest</li>`;

  grid.innerHTML = tasks.map(task => {
    const thumb = task.views[0]?.reference.image, {width, height} = task.views[0]?.viewport || {};
    return `<li data-id="${escape(task.id)}"><a class="task-card" href="${taskUrl(task)}" data-nav>`
      + `<span class="task-thumb">${thumb ? `<img src="${escape(thumb)}" width="${width}" height="${height}" loading="lazy" decoding="async" alt="">` : `<span class="task-thumb-name" aria-hidden="true">${escape(task.name)}</span>`}</span>`
      + `<span class="rate-rule${task.best.model.group === 'open' ? ' is-open' : ''}" style="--rate:${task.best.rate.toFixed(2)}" aria-hidden="true"></span>`
      + `<span class="task-card-name" title="${escape(task.name)}">${escape(task.name)}</span>`
      + `<span class="task-card-meta"><span>${count(task.tests)} tests</span><span class="task-card-best" title="${escape(runLabel(task.best))}: ${testsPassed(task.best)}"><img class="model-logo" src="${escape(task.best.model.logo)}" width="13" height="13" alt=""><span class="sr-only">${escape(runLabel(task.best))}, best pass rate </span>${task.best.rate.toFixed(1)}%</span></span>`
      + `</a></li>`;
  }).join('');

  $('#catalog-sort').addEventListener('click', e => {
    const key = e.target.closest('button')?.dataset.sort;
    if (!key) return;
    setPressed(e.currentTarget, b => b.dataset.sort === key);
    grid.append(...[...tasks].sort(sorts[key]).map(task => grid.querySelector(`[data-id="${CSS.escape(task.id)}"]`)));
  });
  $('#catalog-search').addEventListener('input', e => {
    const query = e.target.value.trim().toLowerCase();
    for (const task of tasks) grid.querySelector(`[data-id="${CSS.escape(task.id)}"]`).hidden = !task.name.toLowerCase().includes(query);
  });

  /* ------------------------------------------------------------ one task */
  const page = $('#task-view'), compare = $('#compare'), frame = $('#compare-frame'), divider = $('#compare-divider');
  const picker = $('#task-picker'), viewTabs = $('#view-tabs'), modes = $('#compare-modes'), runRows = $('#runs'), rebuilds = $('#rebuilds');
  const shotImages = {reference: $('#shot-reference'), rebuild: $('#shot-rebuild')};
  const current = {task: null, view: null, run: null};
  picker.replaceChildren(...tasks.map(t => new Option(t.name, t.id)));

  function renderRuns() {
    const {task, view} = current;
    $('#runs-caption').textContent = `Every model and run on ${task.name}`;
    runRows.innerHTML = task.runs.map(run => {
      const open = run.model.group === 'open' ? ' class="is-open"' : '';
      const org = [run.model.org, run.size, run.effort].filter(Boolean).join(', ');
      const scored = run.rate !== null;
      const pick = view && shot(view, run)
        ? `<input class="sr-only" type="radio" name="run" value="${run.id}" aria-label="Compare ${escape(runLabel(run))} with the reference"><svg class="split-glyph" viewBox="0 0 16 13" aria-hidden="true"><rect x=".75" y=".75" width="14.5" height="11.5" rx="2.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path class="split-half" d="M8 .75h5a2.25 2.25 0 0 1 2.25 2.25v7a2.25 2.25 0 0 1-2.25 2.25H8z" fill="currentColor"/><path d="M8 .75v11.5" stroke="currentColor" stroke-width="1.5"/></svg>`
        : '—';
      return `<tr data-run="${run.id}"${scored ? ` style="--rate:${run.rate.toFixed(2)}"` : ''}>`
        + `<th scope="row"${open} title="${escape(org)}"><span class="m-name"><img class="model-logo" src="${escape(run.model.logo)}" alt="" width="16" height="16">${escape(run.model.name)}${run.size ? `<small>${run.size}</small>` : ''}</span></th>`
        + (scored ? `<td title="${testsPassed(run)}">${count(run.passed)}</td><td title="${testsPassed(run)}">${run.rate.toFixed(1)}</td>` : '<td>—</td><td>—</td>')
        + `<td class="run-shot">${pick}</td></tr>`;
    }).join('');
  }

  function renderSelection() {
    const {view, run} = current;
    runRows.querySelectorAll('tr').forEach(row => {
      const on = row.dataset.run === run?.id;
      row.classList.toggle('is-on', on);
      row.classList.toggle('is-linked', !on && row.dataset.run === current.linked);
      const radio = row.querySelector('input');
      if (radio) radio.checked = on;
    });
    if (!view) return;
    $('#task-run').textContent = run
      ? `Rebuilt by ${run.model.name}${run.size ? ` with a ${run.size} context window` : ''}${run.rate === null ? '' : `: ${count(run.passed)} of ${count(run.total)} hidden tests passed (${run.rate.toFixed(1)}%)`}`
      : '';
    $('#side-rebuild').textContent = run ? runLabel(run) : '';
    compare.classList.toggle('is-reference-only', !run);
    modes.hidden = !run;
    if (!run) setMode('divider');
    setPressed(viewTabs, b => b.dataset.view === view.id);
    frame.querySelectorAll('[data-route]').forEach(path => { path.textContent = view.route; });
    compare.style.setProperty('--shot-ratio', `${view.viewport.width} / ${view.viewport.height}`);
    showImages(view, run);
    if (compare.dataset.mode === 'all') renderRebuilds();
  }

  // Every rebuild of this page at once, loaded only when asked for.
  function renderRebuilds() {
    const {task, view} = current;
    const tile = (src, alt, label) => `<img class="rebuild-shot" src="${escape(src)}" width="${view.viewport.width}" height="${view.viewport.height}" loading="lazy" decoding="async" alt="${escape(alt)}"><span class="rebuild-label">${label}</span>`;
    rebuilds.innerHTML = `<li class="is-reference">${tile(view.reference.image, `Reference for ${task.name}, ${view.label}`, '<span class="m-name">Reference</span>')}</li>` + task.runs.filter(run => shot(view, run)).map(run =>
      `<li><button type="button" data-run="${run.id}"${run === current.run ? ' class="is-on"' : ''}>${tile(shot(view, run), `Rebuild by ${runLabel(run)}, ${view.label}`, `<span class="m-name"><img class="model-logo" src="${escape(run.model.logo)}" alt="" width="15" height="15">${escape(run.model.name)}${run.size ? `<small>${run.size}</small>` : ''}</span>${run.rate === null ? '' : `<b>${run.rate.toFixed(1)}%</b>`}`)}</button></li>`).join('');
  }

  // Both sides swap together, once both are ready, so a comparison is never half old.
  let swap = 0;
  function showImages(view, run) {
    const token = ++swap;
    const sides = {reference: view.reference.image, rebuild: run && shot(view, run)};
    const ready = Object.values(sides).filter(Boolean).map(src => new Promise(done => {
      const image = new Image();
      image.onload = image.onerror = done;
      image.src = src;
    }));
    Promise.all(ready).then(() => {
      if (token !== swap) return;
      shotImages.reference.src = sides.reference;
      shotImages.reference.alt = `Reference for ${current.task.name}, ${view.label}`;
      if (run) {
        shotImages.rebuild.src = sides.rebuild;
        shotImages.rebuild.alt = `Rebuild by ${runLabel(run)}, ${view.label}`;
      }
    });
  }

  function syncUrl() {
    const {task, view, run} = current, extra = {};
    if (run) Object.assign(extra, {model: run.model.id, context: run.id});
    if (view && view !== task.views[0]) extra.view = view.id;
    history.replaceState(null, '', taskUrl(task, extra));
  }

  function chooseRun(wanted) {
    current.run = current.view && [...wanted, ...current.task.runs].find(run => shot(current.view, run));
    renderSelection();
  }

  function openTask(task, params) {
    const index = tasks.indexOf(task), wanted = task.runs.filter(r => r.id === params.get('context')).concat(task.runs.filter(r => r.model.id === params.get('model')));
    current.task = task;
    current.view = task.views.find(v => v.id === params.get('view')) || task.views[0];
    current.linked = wanted[0]?.id;
    document.title = `${task.name} | WebsiteBench`;
    picker.value = task.id;
    page.classList.toggle('no-shots', !current.view);
    const previous = tasks[(index - 1 + tasks.length) % tasks.length], next = tasks[(index + 1) % tasks.length];
    $('#previous-task').href = taskUrl(previous);
    $('#previous-task').title = previous.name;
    $('#next-task').href = taskUrl(next);
    $('#next-task').title = next.name;
    $('#task-facts').innerHTML = `<li><b>${count(task.tests)}</b> hidden tests</li><li><b>${task.best.rate.toFixed(1)}%</b> best pass rate</li>`;
    viewTabs.innerHTML = task.views.map(v => `<button type="button" data-view="${escape(v.id)}" aria-pressed="false">${escape(v.label)}</button>`).join('');
    renderRuns();
    chooseRun(wanted);
  }

  picker.addEventListener('change', () => go(taskUrl(tasks.find(t => t.id === picker.value))));
  viewTabs.addEventListener('click', e => {
    const id = e.target.closest('button')?.dataset.view;
    if (!id) return;
    const previous = current.run;
    current.view = current.task.views.find(v => v.id === id);
    renderRuns();
    chooseRun(previous ? [previous] : []);
    syncUrl();
  });
  runRows.addEventListener('click', e => {
    if (e.target.type !== 'radio') e.target.closest('tr').querySelector('input')?.click();
  });
  function pickRun(id) {
    current.linked = null;
    chooseRun(current.task.runs.filter(r => r.id === id));
    syncUrl();
  }
  // Picking one rebuild out of all of them opens it in the divider.
  function leaveAllRebuilds() {
    if (compare.dataset.mode !== 'all') return;
    setMode('divider');
    scrollTo({top: 0, behavior: 'instant'});
  }
  runRows.addEventListener('change', e => {
    leaveAllRebuilds();
    pickRun(e.target.value);
  });
  rebuilds.addEventListener('click', e => {
    const id = e.target.closest('button')?.dataset.run;
    if (!id) return;
    leaveAllRebuilds();
    pickRun(id);
  });
  runRows.addEventListener('pointerover', e => {
    const run = current.task.runs.find(r => r.id === e.target.closest('tr')?.dataset.run);
    if (run && current.view && shot(current.view, run)) new Image().src = shot(current.view, run);
  });

  /* -------------------------------------------------------- the comparison */
  let split = 50;
  function setSplit(value) {
    split = Math.max(0, Math.min(100, value));
    frame.style.setProperty('--split', split + '%');
    divider.setAttribute('aria-valuenow', String(Math.round(split)));
    divider.setAttribute('aria-valuetext', `${Math.round(split)} percent reference`);
  }
  const dragTo = e => {
    const box = frame.getBoundingClientRect();
    setSplit((e.clientX - box.left) / box.width * 100);
  };
  // The whole picture is the handle. A touch moves the divider only once it moves sideways, so a page can still scroll over it.
  frame.addEventListener('pointerdown', e => {
    if (compare.dataset.mode !== 'divider' || compare.classList.contains('is-reference-only') || e.button) return;
    frame.setPointerCapture(e.pointerId);
    divider.classList.add('is-dragging');
    if (e.pointerType === 'mouse') dragTo(e);
    const stop = () => {
      divider.classList.remove('is-dragging');
      frame.removeEventListener('pointermove', dragTo);
      frame.removeEventListener('pointerup', stop);
      frame.removeEventListener('pointercancel', stop);
    };
    frame.addEventListener('pointermove', dragTo);
    frame.addEventListener('pointerup', stop);
    frame.addEventListener('pointercancel', stop);
  });
  divider.addEventListener('keydown', e => {
    const step = e.shiftKey ? 10 : 2;
    const to = {ArrowLeft: split - step, ArrowDown: split - step, ArrowRight: split + step, ArrowUp: split + step, PageDown: split - 10, PageUp: split + 10, Home: 0, End: 100}[e.key];
    if (to === undefined) return;
    e.preventDefault();
    setSplit(to);
  });
  function setMode(mode) {
    compare.dataset.mode = mode;
    setPressed(modes, b => b.dataset.mode === mode);
    if (mode === 'all') renderRebuilds();
  }
  modes.addEventListener('click', e => {
    const mode = e.target.closest('button')?.dataset.mode;
    if (mode) setMode(mode);
  });
  $('#compare-full').hidden = !document.fullscreenEnabled;
  $('#compare-full').addEventListener('click', () => compare.requestFullscreen());

  /* ------------------------------------------------------------- routing */
  // Returning to the sheet returns to the same place on it.
  history.scrollRestoration = 'manual';
  let sheetScroll = 0;
  function route() {
    const params = new URLSearchParams(location.search);
    const task = tasks.find(t => t.id === params.get('task'));
    if (!$('#catalog').hidden) sheetScroll = scrollY;
    $('#catalog').hidden = Boolean(task);
    page.hidden = !task;
    if (task) openTask(task, params);
    else document.title = 'Tasks | WebsiteBench';
    scrollTo({top: task ? 0 : sheetScroll, behavior: 'instant'});
  }
  function go(url) {
    history.pushState(null, '', url);
    route();
  }
  addEventListener('popstate', route);
  document.addEventListener('click', e => {
    const link = e.target.closest('a[data-nav]');
    if (!link || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button) return;
    e.preventDefault();
    go(link.getAttribute('href'));
    if (!link.offsetParent) $('#main').focus({preventScroll: true});
  });
  route();
})();
