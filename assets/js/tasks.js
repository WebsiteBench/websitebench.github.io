/* Task browser: every model's result on one task, with the recorded screenshots where a task has them. */
(async () => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const params = new URLSearchParams(location.search);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const count = value => value.toLocaleString('en-US');
  const contextLabel = value => value.replace(/1m/i, '1M').replace(/(\d)k/i, '$1K').replace(/-(max|xhigh)$/, ', $1');

  const catalog = await (await fetch('data/task-materials.json')).json();
  const picker = $('#task-picker'), statePicker = $('#state-picker');
  picker.replaceChildren(...catalog.tasks.map(t => new Option(t.name, t.id)));
  picker.value = catalog.tasks.some(t => t.id === params.get('task')) ? params.get('task') : 'medium';
  const linked = {model: params.get('model'), run: params.get('context')};

  function rowsFor(task) {
    const rows = catalog.models.flatMap(model => task.models[model.id].runs.map(run => {
      const [passed, total] = (run.scores[0]?.value || '').split('/').map(Number);
      return {model, run, passed, total, rate: total ? 100 * passed / total : null};
    }));
    return rows.sort((a, b) => (a.rate === null) - (b.rate === null) || b.rate - a.rate || a.model.name.localeCompare(b.model.name));
  }

  function renderResults(task) {
    const rows = rowsFor(task);
    const tests = Math.max(...rows.map(r => r.total || 0));
    $('#task-facts').innerHTML = `<li><b>${count(tests)}</b> hidden tests</li><li><b>${rows[0].rate.toFixed(1)}%</b> best pass rate</li>`;
    const body = rows.map(r => {
      const selected = r.model.id === linked.model && (!linked.run || r.run.id === linked.run);
      const context = r.run.context ? contextLabel(r.run.context) : '';
      const name = `<span class="t-model"><img class="model-logo" src="${escape(r.model.logo)}" alt="" width="16" height="16">${escape(r.model.name)}${context ? `<small>${escape(context)}</small>` : ''}</span>`;
      if (r.rate === null) return `<tr><th scope="row">${name}</th><td>—</td><td><span class="pct"><span>—</span></span></td></tr>`;
      return `<tr${selected ? ' class="is-selected"' : ''}><th scope="row">${name}</th><td>${count(r.passed)}/${count(r.total)}</td><td><span class="pct"><span>${r.rate.toFixed(1)}</span><i aria-hidden="true"><b style="width:${r.rate.toFixed(2)}%"></b></i></span></td></tr>`;
    }).join('');
    $('#task-results').innerHTML = `<div class="task-results-card"><table class="task-results"><caption class="sr-only">Every model and run on ${escape(task.name)}</caption><thead><tr><th scope="col">Model and context</th><th scope="col">Tests passed</th><th scope="col">Pass rate, %</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function renderShots(task) {
    const view = task.views.find(v => v.id === statePicker.value) || task.views[0];
    const [modelId, rebuild] = Object.entries(view.models)[0];
    $('#candidate-model-name').textContent = catalog.models.find(m => m.id === modelId).name + (rebuild.context ? `, ${contextLabel(rebuild.context)}` : '');
    for (const [side, image, label] of [['reference', view.reference, 'reference'], ['candidate', rebuild, 'rebuild']]) {
      const img = new Image(view.viewport.width, view.viewport.height);
      img.src = image.image; img.alt = `${task.name}, ${label}, ${view.label}`; img.loading = 'lazy';
      $(`#${side}-preview`).replaceChildren(img);
    }
  }

  function render() {
    const task = catalog.tasks.find(t => t.id === picker.value), index = catalog.tasks.indexOf(task);
    const shot = task.views.length > 0;
    $('#explorer-task-name').textContent = task.name;
    document.title = `${task.name} | WebsiteBench`;
    $('#explorer-task-position').textContent = `Task ${index + 1} of ${catalog.tasks.length}`;
    $('#previous-task').disabled = index === 0;
    $('#next-task').disabled = index === catalog.tasks.length - 1;
    renderResults(task);
    $('#task-shots').hidden = !shot;
    if (shot) {
      statePicker.replaceChildren(...task.views.map(v => new Option(v.label, v.id)));
      renderShots(task);
    }
  }

  function choose(id) {
    picker.value = id;
    linked.model = linked.run = null;
    const url = new URL(location.href);
    url.search = `?task=${encodeURIComponent(id)}`;
    history.replaceState(null, '', url);
    render();
  }
  picker.addEventListener('change', () => choose(picker.value));
  $('#previous-task').addEventListener('click', () => choose(catalog.tasks[picker.selectedIndex - 1].id));
  $('#next-task').addEventListener('click', () => choose(catalog.tasks[picker.selectedIndex + 1].id));
  statePicker.addEventListener('change', () => renderShots(catalog.tasks.find(t => t.id === picker.value)));
  render();
})();
