// Regenerate the static leaderboard and CSV after editing data/leaderboard.json.
// No server, browser, or npm dependencies are needed.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const models = JSON.parse(fs.readFileSync(path.join(root, 'data/leaderboard.json'), 'utf8'));
const logos = {Anthropic: 'anthropic', OpenAI: 'openai', xAI: 'xai', 'Z.ai': 'zai', Kimi: 'kimi', DeepSeek: 'deepseek', 'Qwen Team': 'qwen'};
const scores = ['overall', 'request', 'browser', 'system'];
const best = Object.fromEntries(scores.map(key => [key, Math.max(...models.map(m => m[key]))]));
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const rows = [...models].sort((a, b) => b.overall - a.overall).map((m, index) => {
  const scoreCell = key => `<td data-value="${m[key]}"${m[key] === best[key] ? ' class="best"' : ''}>${m[key].toFixed(1)}%</td>`;
  return `        <tr data-model="${escape(m.id)}" data-logo="${logos[m.org]}" data-short="${escape(m.short)}" data-org="${escape(m.org)}">
          <td class="rank">${index + 1}</td>
          <th scope="row"><span class="model-name"><img class="model-logo" src="assets/logos/${logos[m.org]}.svg" alt="" width="18" height="18">${escape(m.name)}</span><span class="model-meta">${escape(m.org)}</span></th>
          <td class="overall${m.overall === best.overall ? ' best' : ''}" data-value="${m.overall}"><span class="score-track" aria-hidden="true"><span style="width:${m.overall}%"></span></span><span>${m.overall.toFixed(1)}%</span></td>
          ${['request', 'browser', 'system'].map(scoreCell).join('')}
          <td data-value="${m.cost}">${escape(m.costStr)}</td><td data-value="${m.tokens}">${m.tokens.toFixed(1)}M</td><td data-value="${m.turns}">${m.turns.toLocaleString('en-US', {minimumFractionDigits: 1, maximumFractionDigits: 1})}</td>
        </tr>`;
}).join('\n');
const file = path.join(root, 'index.html');
let html = fs.readFileSync(file, 'utf8');
const marker = /(<tbody id="board-body">)[\s\S]*?(<\/tbody><!--\/board-body-->)/;
if (!marker.test(html)) throw new Error('Leaderboard marker missing');
html = html.replace(marker, (_, start, end) => `${start}\n${rows}\n      ${end}`);
const taskData = JSON.parse(fs.readFileSync(path.join(root, 'data/task-results.json'), 'utf8'));
if (!['awaiting_evaluated_cohort', 'evaluated_cohort'].includes(taskData.scope) || !Array.isArray(taskData.tasks)) throw new Error('Invalid task data scope or tasks');
if (taskData.scope === 'evaluated_cohort' && taskData.tasks.length !== 74) throw new Error('The official evaluated cohort must contain exactly 74 tasks');
if (taskData.scope === 'awaiting_evaluated_cohort' && taskData.tasks.length !== 0) throw new Error('Awaiting data must not contain example tasks');
const modelIDs = new Set(models.map(model => model.id));
const taskIDs = new Set();
for (const task of taskData.tasks) {
  if (typeof task.id !== 'string' || !task.id || taskIDs.has(task.id) || typeof task.name !== 'string' || !task.name) throw new Error('Task IDs and names must be present and IDs unique');
  if (Object.keys(task).some(key => !['id', 'name', 'results'].includes(key))) throw new Error(`Unsupported task field: ${task.id}`);
  taskIDs.add(task.id);
  if (!task.results || typeof task.results !== 'object' || Array.isArray(task.results)) throw new Error(`Missing results map: ${task.id}`);
  for (const [model, trials] of Object.entries(task.results)) {
    if (!modelIDs.has(model) || !Array.isArray(trials)) throw new Error(`Invalid model or trials: ${task.id}/${model}`);
    const trialIDs = new Set();
    for (const trial of trials) {
      if (typeof trial.id !== 'string' || !trial.id || trialIDs.has(trial.id) || !['valid', 'invalid', 'missing'].includes(trial.status)) throw new Error(`Invalid or duplicate trial: ${task.id}/${model}`);
      trialIDs.add(trial.id);
      if (trial.outcome !== undefined && !['timeout', 'error'].includes(trial.outcome)) throw new Error(`Invalid trial outcome: ${task.id}/${model}`);
      if (Object.keys(trial).some(key => !['id', 'status', 'outcome', 'context', 'source_sheet', 'source_row', 'source', 'passed', 'total', 'reward', 'metric_note', ...scores].includes(key))) throw new Error(`Unsupported trial field: ${task.id}/${model}`);
      if (trial.source_row !== undefined && (!Number.isInteger(trial.source_row) || trial.source_row < 1)) throw new Error('Invalid workbook row');
      for (const key of ['context', 'source_sheet', 'source', 'metric_note']) if (trial[key] !== undefined && typeof trial[key] !== 'string') throw new Error(`Invalid provenance field: ${key}`);
      if (trial.reward !== undefined && (typeof trial.reward !== 'number' || !Number.isFinite(trial.reward) || trial.reward < 0 || trial.reward > 1)) throw new Error('Invalid workbook reward');
      if (trial.passed !== undefined || trial.total !== undefined) {
        if (!Number.isInteger(trial.passed) || !Number.isInteger(trial.total) || trial.total <= 0 || trial.passed < 0 || trial.passed > trial.total) throw new Error('Invalid reported test counts');
        if (typeof trial.overall !== 'number' || Math.abs(trial.overall - 100 * trial.passed / trial.total) > 1e-8) throw new Error('Reported fraction does not match counts');
      }
      for (const key of scores) if (trial[key] !== undefined && trial[key] !== null && (typeof trial[key] !== 'number' || !Number.isFinite(trial[key]) || trial[key] < 0 || trial[key] > 100)) throw new Error(`Score must be a percentage in [0, 100]: ${task.id}/${model}/${key}`);
    }
  }
}
const finalRuns = JSON.parse(fs.readFileSync(path.join(root, 'data/final-runs.json'), 'utf8'));
if (!['awaiting_final_manifest', 'selected'].includes(finalRuns.status) || !finalRuns.selections || typeof finalRuns.selections !== 'object') throw new Error('Invalid final run manifest');
for (const [taskID, selections] of Object.entries(finalRuns.selections)) {
  const task = taskData.tasks.find(task => task.id === taskID);
  if (!task || !selections || typeof selections !== 'object') throw new Error(`Unknown final task: ${taskID}`);
  for (const [modelID, runID] of Object.entries(selections)) {
    if (!modelIDs.has(modelID) || typeof runID !== 'string' || !(task.results[modelID] || []).some(run => run.id === runID)) throw new Error(`Unknown final run: ${taskID}/${modelID}`);
  }
}
taskData.final_selection = finalRuns;
// Waffle is a current per-context export, independent of the historical
// aggregate leaderboard and its model IDs. Never reuse an old model's scores.
const waffle = JSON.parse(fs.readFileSync(path.join(root, 'data/waffle.json'), 'utf8'));
if (waffle.version !== 1 || waffle.tasks.length !== 74 || waffle.models.length !== 9) throw new Error('Invalid current Waffle cohort');
const waffleModels = new Set(waffle.models.map(m => m.id));
if (!waffleModels.has('sol61') || waffleModels.has('sol') || !waffle.tasks.some(t => t.id === 'untappd') || waffle.tasks.some(t => t.id === 'samsung')) throw new Error('Waffle contains an obsolete model or task');
for (const task of waffle.tasks) {
  if (Object.keys(task.results).length !== waffleModels.size) throw new Error('Incomplete Waffle matrix');
  for (const [model, result] of Object.entries(task.results)) {
    if (!waffleModels.has(model)) throw new Error('Unknown Waffle model');
    for (const entry of Object.values(result.contexts)) {
      if (entry.status === 'scored' && (!Number.isInteger(entry.passed) || !Number.isInteger(entry.total) || entry.total <= 0 || entry.passed < 0 || entry.passed > entry.total)) throw new Error('Invalid Waffle fraction');
    }
  }
}
const waffleMarker = /(<script type="application\/json" id="waffle-data">)[\s\S]*?(<\/script><!--\/waffle-data-->)/;
if (!waffleMarker.test(html)) throw new Error('Waffle data marker missing');
html = html.replace(waffleMarker, (_, start, end) => start + JSON.stringify(waffle).replace(/</g, '\\u003c') + end);
fs.writeFileSync(file, html);
const columns = ['model', 'organization', 'group', 'overall_pct', 'request_pct', 'browser_pct', 'system_pct', 'cost_usd_per_task', 'tokens_m_per_task', 'turns_per_task'];
const csvRows = models.map(m => [m.name, m.org, m.group === 'open' ? 'open-source' : 'frontier', m.overall, m.request, m.browser, m.system, m.cost, m.tokens, m.turns]);
const csv = [columns, ...csvRows].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n') + '\n';
fs.writeFileSync(path.join(root, 'data/leaderboard.csv'), csv);
console.log(`Generated ${models.length} leaderboard rows and data/leaderboard.csv.`);

// Only explicitly curated, task/run-bound ATIF assets belong in the static site.
const trajectories = JSON.parse(fs.readFileSync(path.join(root, 'data/trajectories.json'), 'utf8'));
if (trajectories.version !== 1 || !Array.isArray(trajectories.runs)) throw new Error('Invalid trajectory index');
const traceIDs = new Set();
for (const run of trajectories.runs) {
  const task = taskData.tasks.find(task => task.id === run.task);
  const key = `${run.task}/${run.model}/${run.run_id}`;
  if (!task || !modelIDs.has(run.model) || !(task.results[run.model] || []).some(trial => trial.id === run.run_id) || traceIDs.has(key) || typeof run.label !== 'string') throw new Error('Trajectory needs a unique known task/model/run binding');
  if (typeof run.url !== 'string' || !/^data\/trajectories\/[\w/-]+\.json$/.test(run.url) || run.url.includes('..') || !fs.existsSync(path.join(root, run.url))) throw new Error('Trajectory must be a curated local JSON asset');
  if (fs.statSync(path.join(root, run.url)).size > 64 * 1024 * 1024) throw new Error('Trajectory asset exceeds viewer size limit');
  const document = JSON.parse(fs.readFileSync(path.join(root, run.url), 'utf8'));
  if (!/^ATIF-v1\.[0-8]$/.test(document.schema_version || '') || !Array.isArray(document.steps) || !document.steps.length) throw new Error('Invalid ATIF asset');
  traceIDs.add(key);
}

// Build the task browser from the accepted cohort and explicitly supplied visual assets.
const previewData = JSON.parse(fs.readFileSync(path.join(root, 'data/task-previews.json'), 'utf8'));
if (!previewData.tasks || typeof previewData.tasks !== 'object') throw new Error('Missing task preview map');
for (const id of Object.keys(previewData.tasks)) if (!taskIDs.has(id)) throw new Error(`Preview outside accepted cohort: ${id}`);
const asset = media => {
  if (!media || typeof media.image !== 'string' || !media.image.startsWith('assets/previews/') || media.image.includes('..') || !/\.(png|webp|jpe?g)$/i.test(media.image)) throw new Error('Preview must be a local screenshot asset');
  if (!fs.existsSync(path.join(root, media.image))) throw new Error(`Missing preview image: ${media.image}`);
};
const catalog = { models: models.map(model => ({id:model.id, name:model.name, short:model.short, org:model.org, logo:`assets/logos/${logos[model.org]}.svg`})), tasks: taskData.tasks.map(task => {
  const views = previewData.tasks[task.id]?.views || [];
  const viewIDs = new Set();
  const safeViews = views.map(view => {
    if (typeof view.id !== 'string' || viewIDs.has(view.id) || typeof view.route !== 'string' || !view.route.startsWith('/') || !Number.isInteger(view.viewport?.width) || !Number.isInteger(view.viewport?.height) || view.viewport.width < 320 || view.viewport.height < 200) throw new Error(`Invalid preview view: ${task.id}`);
    viewIDs.add(view.id);
    if (view.reference) asset(view.reference);
    const reconstructions = {};
    for (const [modelID, media] of Object.entries(view.models || {})) {
      if (!modelIDs.has(modelID) || !(task.results[modelID] || []).some(run => run.id === media.run_id)) throw new Error(`Preview needs an actual run ID: ${task.id}/${modelID}`);
      asset(media);
      reconstructions[modelID] = {...media, is_final: finalRuns.selections[task.id]?.[modelID] === media.run_id};
    }
    return {id:view.id, label:view.label || view.route, route:view.route, viewport:view.viewport, reference:view.reference || null, models:reconstructions};
  });
  return {id:task.id, name:task.name, views:safeViews};
})};
fs.writeFileSync(path.join(root, 'data/task-catalog.json'), JSON.stringify(catalog,null,2)+'\n');
console.log(`Generated ${catalog.tasks.length} tasks for the comparison browser (${catalog.tasks.filter(task=>task.views.length).length} with visual assets).`);
