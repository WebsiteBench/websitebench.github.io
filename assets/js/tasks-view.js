/* The Tasks pages' data and markup, shared by tools/prerender.js (static HTML) and tasks.js (browser). */
((root, factory) => {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WebsiteBenchTasks = factory();
})(globalThis, () => {
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const count = value => value.toLocaleString('en-US');
  const rooted = file => '/' + String(file).replace(/^\/+/, '');
  // Addresses that read better than the task id.
  const SLUG = {'33': 'coursera', 'breakoutgames-2': 'breakout-games'};
  const taskPath = id => `/task/${encodeURIComponent(SLUG[id] || id)}`;
  const taskUrl = (id, extra = {}) => { const query = new URLSearchParams(extra).toString(); return taskPath(id) + (query ? `?${query}` : ''); };
  const shot = (view, run) => view.runs[run.id] && view.runs[run.id].image;
  const testsPassed = run => `${count(run.passed)} of ${count(run.total)} tests passed`;
  const failure = run => run.status === 'timeout' ? 'Timeout' : 'Error';
  const SPLIT_GLYPH = '<svg class="split-glyph" viewBox="0 0 16 13" aria-hidden="true"><rect x=".75" y=".75" width="14.5" height="11.5" rx="2.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path class="split-half" d="M8 .75h5a2.25 2.25 0 0 1 2.25 2.25v7a2.25 2.25 0 0 1-2.25 2.25H8z" fill="currentColor"/><path d="M8 .75v11.5" stroke="currentColor" stroke-width="1.5"/></svg>';

  // One website: its runs from best to worst, its test count, and its screenshots.
  function buildTask(task, models, views) {
    const runs = models.map(model => {
      const {runs: [run], status} = task.models[model.id];
      const [passed, total] = run && run.scores.length ? run.scores[0].value.split('/').map(Number) : [null, null];
      return {id: run ? run.id : `${model.id}-none`, model: {id: model.id, name: model.name, org: model.org, logo: rooted(model.logo), group: model.group}, status, passed, total, rate: total ? 100 * passed / total : null};
    }).sort((a, b) => (a.rate === null) - (b.rate === null) || b.rate - a.rate || a.model.name.localeCompare(b.model.name));
    // A task's hidden test count is the total used by most of its scored runs.
    const totals = new Map();
    for (const run of runs) if (run.total) totals.set(run.total, (totals.get(run.total) || 0) + 1);
    const tests = [...totals].sort((a, b) => b[1] - a[1])[0][0];
    const rootedViews = views.map(view => ({...view, reference: {...view.reference, image: rooted(view.reference.image)},
      runs: Object.fromEntries(Object.entries(view.runs).map(([id, entry]) => [id, {...entry, image: rooted(entry.image)}]))}));
    return {id: task.id, name: task.name, runs, tests, best: runs[0], views: rootedViews};
  }

  function cardHtml(task, index) {
    const best = task.best;
    return `<li data-id="${escape(task.id)}" data-i="${index}" data-name="${escape(task.name.toLowerCase())}" data-best="${best.rate.toFixed(4)}" data-tests="${task.tests}"><a class="task-card" href="${taskPath(task.id)}">`
      + `<span class="task-thumb"><img src="/assets/previews/${escape(task.id)}/thumb.webp" width="400" height="250" loading="${index < 14 ? 'eager' : 'lazy'}" decoding="async" alt=""></span>`
      + `<span class="rate-rule${best.model.group === 'open' ? ' is-open' : ''}" style="--rate:${best.rate.toFixed(2)}" aria-hidden="true"></span>`
      + `<span class="task-card-name" title="${escape(task.name)}">${escape(task.name)}</span>`
      + `<span class="task-card-meta"><span>${count(task.tests)} tests</span><span class="task-card-best" title="${escape(best.model.name)}: ${testsPassed(best)}"><img class="model-logo" src="${escape(best.model.logo)}" width="13" height="13" alt=""><span class="sr-only">${escape(best.model.name)}, best pass rate </span>${best.rate.toFixed(1)}%</span></span>`
      + '</a></li>';
  }

  function runRowHtml(run, view, selected) {
    const scored = run.rate !== null, on = selected && selected.id === run.id, pic = shot(view, run);
    const pick = `<input class="sr-only" type="radio" name="run" value="${escape(run.id)}" aria-label="${pic ? `Compare ${escape(run.model.name)} with the reference` : `Show the result of ${escape(run.model.name)}`}"${on ? ' checked' : ''}>${pic ? SPLIT_GLYPH : '—'}`;
    return `<tr data-run="${escape(run.id)}"${on ? ' class="is-on"' : ''}>`
      + `<th scope="row" title="${escape(run.model.org)}"><span class="m-name"><img class="model-logo" src="${escape(run.model.logo)}" alt="" width="16" height="16">${escape(run.model.name)}</span></th>`
      + (scored ? `<td class="run-bar" aria-hidden="true"><span class="ov"><span class="bar"><i class="${run.model.group === 'open' ? 'open' : 'proprietary'}" style="width:${run.rate.toFixed(2)}%"></i></span></span></td><td class="run-passed" title="${testsPassed(run)}">${count(run.passed)}</td><td title="${testsPassed(run)}">${run.rate.toFixed(1)}</td>` : `<td class="run-bar" aria-hidden="true"></td><td class="run-passed"></td><td class="run-failed">${failure(run)}</td>`)
      + `<td class="run-shot">${pick}</td></tr>`;
  }
  const runRowsHtml = (task, view, selected) => task.runs.map(run => runRowHtml(run, view, selected)).join('');
  const viewTabsHtml = (task, active) => task.views.map(v => `<button type="button" data-view="${escape(v.id)}" aria-pressed="${v.id === active.id}">${escape(v.label)}</button>`).join('');
  const runSentence = (view, run) => `${shot(view, run) ? 'Rebuilt by ' : ''}${run.model.name}: ${run.rate === null ? failure(run) : `${count(run.passed)} of ${count(run.total)} hidden tests passed (${run.rate.toFixed(1)}%)`}`;
  const shotAlt = (task, view, run) => (run ? `Rebuild by ${run.model.name}, ${view.label}` : `Reference for ${task.name}, ${view.label}`);

  return {escape, count, taskPath, taskUrl, shot, testsPassed, buildTask, cardHtml, runRowsHtml, viewTabsHtml, runSentence, shotAlt};
});
