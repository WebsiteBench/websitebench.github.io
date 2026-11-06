/* Task browser. tools/prerender.js writes the pages; this adds sorting and search on the sheet and, on one website's page, the reference and rebuild comparison. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const setPressed = (group, isOn) => group.querySelectorAll('button[aria-pressed]').forEach(b => b.setAttribute('aria-pressed', String(isOn(b))));

  /* ------------------------------------------------------- contact sheet */
  const grid = $('#task-grid');
  if (grid) {
    const items = [...grid.children], tools = $('.catalog-tools'), search = $('#catalog-search'), sortGroup = $('#catalog-sort'), empty = $('#catalog-empty');
    const sorts = {name: (a, b) => a.dataset.i - b.dataset.i, best: (a, b) => b.dataset.best - a.dataset.best, tests: (a, b) => b.dataset.tests - a.dataset.tests};
    const folded = text => text.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
    const state = {sort: 'name', q: ''};
    const syncAddress = () => {
      const query = new URLSearchParams();
      if (state.sort !== 'name') query.set('sort', state.sort);
      if (state.q) query.set('q', state.q);
      const text = query.toString();
      history.replaceState(history.state, '', location.pathname + (text ? `?${text}` : ''));
    };
    // After a change the reader sees the top of the list, under the sticky tools.
    const showGridTop = () => {
      const under = tools.getBoundingClientRect().bottom, top = grid.getBoundingClientRect().top;
      if (top < under) scrollBy({top: top - under - 14, behavior: 'instant'});
    };
    const applySort = () => {
      setPressed(sortGroup, b => b.dataset.sort === state.sort);
      grid.append(...items.slice().sort(sorts[state.sort]));
    };
    const applySearch = () => {
      const query = folded(state.q);
      let shown = 0;
      for (const item of items) {
        item.hidden = !(folded(item.dataset.name).includes(query) || folded(item.dataset.id).includes(query));
        if (!item.hidden) shown += 1;
      }
      empty.hidden = shown > 0;
    };
    sortGroup.addEventListener('click', e => {
      const key = e.target.closest('button')?.dataset.sort;
      if (!key) return;
      state.sort = key;
      applySort(); syncAddress(); showGridTop();
    });
    search.addEventListener('input', () => {
      state.q = search.value.trim();
      applySearch(); syncAddress(); showGridTop();
    });
    search.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const shown = items.filter(item => !item.hidden);
      if (shown.length === 1) shown[0].querySelector('a').click();
    });
    $('#catalog-clear').addEventListener('click', () => {
      search.value = state.q = '';
      applySearch(); syncAddress();
      search.focus();
    });
    const params = new URLSearchParams(location.search);
    if (sorts[params.get('sort')]) { state.sort = params.get('sort'); applySort(); }
    if (params.get('q')) { state.q = search.value = params.get('q'); applySearch(); }
    // Back from a website returns focus to its card.
    grid.addEventListener('click', e => {
      const id = e.target.closest('li')?.dataset.id;
      if (id) history.replaceState({...history.state, opened: id}, '');
    });
    addEventListener('pageshow', () => {
      const opened = history.state && history.state.opened;
      const item = opened && items.find(li => li.dataset.id === opened);
      if (item) item.querySelector('a').focus({preventScroll: true});
    });
    return;
  }

  /* ------------------------------------------------------------ one task */
  const {escape, taskUrl, shot, runRowsHtml, runSentence, shotAlt} = WebsiteBenchTasks;
  const task = JSON.parse($('#task-data').textContent);
  const runLabel = run => run.model.name;
  const compare = $('#compare'), frame = $('#compare-frame'), divider = $('#compare-divider');
  const picker = $('#task-picker'), viewTabs = $('#view-tabs'), modes = $('#compare-modes'), runRows = $('#runs'), rebuilds = $('#rebuilds');
  const shotImages = {reference: $('#shot-reference'), rebuild: $('#shot-rebuild')};
  const current = {view: null, run: null};
  const address = new URLSearchParams(location.search);
  let pinned = address.has('model') || address.has('run');
  let chosenMode = 'side';

  function renderSelection() {
    const {view, run} = current, pic = shot(view, run);
    runRows.querySelectorAll('tr').forEach(row => {
      const on = row.dataset.run === run.id;
      row.classList.toggle('is-on', on);
      row.querySelector('input').checked = on;
    });
    if (!pic) setMode('divider', false);
    else if (compare.dataset.mode === 'divider' && chosenMode !== 'divider') setMode(chosenMode, false);
    setPressed(viewTabs, b => b.dataset.view === view.id);
    showImages(view, run, pic);
    if (compare.dataset.mode === 'all') renderRebuilds();
  }

  // Every rebuild of this page at once, loaded only when asked for.
  function renderRebuilds() {
    const {view} = current;
    const tile = (src, alt, label) => `<img class="rebuild-shot" src="${escape(src)}" width="${view.viewport.width}" height="${view.viewport.height}" loading="lazy" decoding="async" alt="${escape(alt)}"><span class="rebuild-label">${label}</span>`;
    rebuilds.innerHTML = `<li class="is-reference">${tile(view.reference.image, shotAlt(task, view, null), '<span class="m-name">Reference</span>')}</li>` + task.runs.filter(run => shot(view, run)).map(run =>
      `<li><button type="button" data-run="${run.id}" aria-pressed="${run === current.run}"${run === current.run ? ' class="is-on"' : ''}>${tile(shot(view, run), shotAlt(task, view, run), `<span class="m-name"><img class="model-logo" src="${escape(run.model.logo)}" alt="" width="15" height="15">${escape(runLabel(run))}</span>${run.rate === null ? '' : `<b>${run.rate.toFixed(1)}%</b>`}`)}</button></li>`).join('');
  }

  // Both sides swap together, once both are ready, so a comparison is never half old.
  let swap = 0;
  function showImages(view, run, pic) {
    const token = ++swap;
    const sides = {reference: view.reference.image, rebuild: pic};
    if (shotImages.reference.getAttribute('src') !== sides.reference || (pic && shotImages.rebuild.getAttribute('src') !== pic)) compare.setAttribute('aria-busy', 'true');
    const ready = Object.values(sides).filter(Boolean).map(src => new Promise(done => {
      const image = new Image();
      image.onload = image.onerror = done;
      image.src = src;
    }));
    Promise.all(ready).then(() => {
      if (token !== swap) return;
      compare.removeAttribute('aria-busy');
      $('#task-run').textContent = runSentence(view, run);
      $('#side-rebuild').textContent = runLabel(run);
      compare.classList.toggle('is-reference-only', !pic);
      modes.hidden = !pic;
      frame.querySelectorAll('[data-route]').forEach(path => { path.textContent = view.route; });
      compare.style.setProperty('--shot-ratio', `${view.viewport.width} / ${view.viewport.height}`);
      shotImages.reference.src = sides.reference;
      shotImages.reference.alt = shotAlt(task, view, null);
      if (pic) {
        shotImages.rebuild.src = sides.rebuild;
        shotImages.rebuild.alt = shotAlt(task, view, run);
      }
      setSplit(split);
    });
  }

  function syncUrl() {
    const {view, run} = current, extra = {};
    if (pinned || run !== defaultRun(view)) Object.assign(extra, {model: run.model.id}, run.id.endsWith('-none') ? {} : {run: run.id});
    if (view !== task.views[0]) extra.view = view.id;
    if (compare.dataset.mode !== 'side' && !compare.classList.contains('is-reference-only')) extra.mode = compare.dataset.mode;
    history.replaceState(null, '', taskUrl(task.id, extra) + location.hash);
    carryModel();
  }
  // Previous and Next keep the model the reader chose.
  const steps = [$('#previous-task'), $('#next-task')];
  const stepPaths = steps.map(link => link.getAttribute('href'));
  function carryModel() {
    const query = pinned ? `?model=${encodeURIComponent(current.run.model.id)}` : '';
    steps.forEach((link, i) => { link.href = stepPaths[i] + query; });
  }

  const defaultRun = view => task.runs.find(run => shot(view, run));
  function chooseRun(wanted) {
    current.run = wanted[0] || defaultRun(current.view);
    renderSelection();
  }

  // Arrow keys walk the list in place; Enter or leaving the picker opens the website shown.
  const walks = !/Mac|iPhone|iPad/.test(navigator.platform);
  let walking = false;
  const open = () => { location.href = taskUrl(picker.value); };
  picker.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key) && !e.altKey) walking = walks;
    else if (e.key === ' ' || e.altKey || e.key === 'F4') walking = false;
    else if (e.key === 'Enter' && walking && picker.value !== task.id) { e.preventDefault(); open(); }
  });
  picker.addEventListener('pointerdown', () => { walking = false; });
  picker.addEventListener('change', () => {
    if (!walking) { open(); return; }
    $('#task-picker-label').textContent = picker.selectedOptions[0].textContent;
    history.replaceState(null, '', taskUrl(picker.value));
  });
  picker.addEventListener('blur', () => { if (walking && picker.value !== task.id) open(); });
  addEventListener('pageshow', () => { walking = false; picker.value = task.id; $('#task-picker-label').textContent = task.name; });
  viewTabs.addEventListener('click', e => {
    const id = e.target.closest('button')?.dataset.view;
    if (!id) return;
    current.view = task.views.find(v => v.id === id);
    runRows.innerHTML = runRowsHtml(task, current.view, null);
    chooseRun([current.run]);
    syncUrl();
  });
  runRows.addEventListener('click', e => {
    if (e.target.type !== 'radio') e.target.closest('tr')?.querySelector('input').click();
  });
  function pickRun(id) {
    pinned = true;
    chooseRun(task.runs.filter(r => r.id === id));
    syncUrl();
    if ($('#compare-stage').getBoundingClientRect().bottom < 120) compare.scrollIntoView({block: 'start'});
  }
  // Picking one rebuild out of all of them opens it side by side.
  function leaveAllRebuilds() {
    if (compare.dataset.mode !== 'all') return;
    setMode('side');
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
    const run = task.runs.find(r => r.id === e.target.closest('tr')?.dataset.run);
    if (run && shot(current.view, run)) new Image().src = shot(current.view, run);
  });

  /* -------------------------------------------------------- the comparison */
  let split = 50;
  function setSplit(value) {
    split = Math.max(0, Math.min(100, value));
    frame.style.setProperty('--split', split + '%');
    divider.setAttribute('aria-valuenow', String(Math.round(split)));
    divider.setAttribute('aria-valuetext', `${Math.round(split)} percent reference`);
    // A side label stays only while it fits on its own side of the divider.
    const w = frame.clientWidth, x = w * split / 100, sr = frame.querySelector('.layer:not(.is-cand) .side'), sc = frame.querySelector('.is-cand .side');
    sr.classList.toggle('is-off', x < sr.offsetWidth + 44);
    sc.classList.toggle('is-off', w - x < sc.offsetWidth + 44);
  }
  const dragTo = e => {
    const box = frame.getBoundingClientRect();
    setSplit((e.clientX - box.left) / box.width * 100);
  };
  // The whole picture is the handle. A touch moves the divider only once it moves sideways, so a page can still scroll over it.
  frame.addEventListener('pointerdown', e => {
    if (compare.dataset.mode !== 'divider' || compare.classList.contains('is-reference-only') || e.button) return;
    frame.setPointerCapture(e.pointerId);
    const x0 = e.clientX, y0 = e.clientY;
    let armed = e.pointerType === 'mouse';
    if (armed) { divider.classList.add('is-dragging'); dragTo(e); }
    const moveTo = ev => {
      if (!armed) {
        const dx = Math.abs(ev.clientX - x0), dy = Math.abs(ev.clientY - y0);
        if (dx < 8 || dy > dx) return;
        armed = true;
        divider.classList.add('is-dragging');
      }
      dragTo(ev);
    };
    const stop = () => {
      divider.classList.remove('is-dragging');
      frame.removeEventListener('pointermove', moveTo);
      frame.removeEventListener('pointerup', stop);
      frame.removeEventListener('pointercancel', stop);
    };
    frame.addEventListener('pointermove', moveTo);
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
  function setMode(mode, chosen = true) {
    if (chosen) chosenMode = mode;
    compare.dataset.mode = mode;
    setPressed(modes, b => b.dataset.mode === mode);
    if (mode === 'all') renderRebuilds();
    if (mode === 'divider') setSplit(split);
  }
  modes.addEventListener('click', e => {
    const mode = e.target.closest('button')?.dataset.mode;
    if (mode) { setMode(mode); syncUrl(); }
  });
  $('#compare-full').hidden = !document.fullscreenEnabled;
  $('#compare-full').addEventListener('click', () => compare.requestFullscreen());
  $('#compare-exit').addEventListener('click', () => document.exitFullscreen());
  addEventListener('resize', () => setSplit(split));

  /* ----------------------------------------------- what the address asks for */
  const wanted = task.runs.filter(r => r.id === address.get('run')).concat(task.runs.filter(r => r.model.id === address.get('model')));
  current.view = task.views.find(v => v.id === address.get('view')) || task.views[0];
  if (current.view !== task.views[0]) runRows.innerHTML = runRowsHtml(task, current.view, null);
  chooseRun(wanted);
  if (['divider', 'all'].includes(address.get('mode')) && shot(current.view, current.run)) setMode(address.get('mode'));
  carryModel();
  if (address.has('context')) syncUrl();
})();
