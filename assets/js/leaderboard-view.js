/* Leaderboard rows, shared by tools/prerender.js (static HTML) and results.js (browser). */
((root, factory) => {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WebsiteBenchLeaderboard = factory();
})(globalThis, () => {
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const SCORES = ['overall', 'request', 'browser', 'system'];
  const RESOURCES = ['cost', 'tokens', 'turns'];
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const oneDecimal = {minimumFractionDigits: 1, maximumFractionDigits: 1};
  function format(key, value) {
    if (!finite(value)) return '—';
    if (SCORES.includes(key)) return value.toFixed(1);
    if (key === 'cost') return '$' + value.toLocaleString('en-US', oneDecimal);
    if (key === 'tokens') return value.toLocaleString('en-US', oneDecimal) + 'M';
    return value.toLocaleString('en-US', oneDecimal);
  }
  // Rank and best scores come from all the models by Overall. Sorting and filtering change only order and visibility.
  function standing(models) {
    const rank = Object.fromEntries(models.slice().sort((a, b) => b.overall - a.overall).map((m, index) => [m.id, index + 1]));
    const best = Object.fromEntries(SCORES.map(k => [k, Math.max(...models.map(m => finite(m[k]) ? m[k] : -Infinity))]));
    return {rank, isBest: (m, key) => SCORES.includes(key) && finite(m[key]) && m[key] === best[key]};
  }
  const tip = (m, key) => {
    if (!SCORES.includes(key) || !finite(m[key])) return '';
    const tests = m.score_counts[key];
    return ` data-tip="${tests.passed.toLocaleString('en-US')} of ${tests.total.toLocaleString('en-US')} tests passed"`;
  };
  function renderRows(models, {rank, isBest} = standing(models)) {
    return models.map(m => {
      const open = m.group === 'open';
      const overall = finite(m.overall) ? m.overall : 0;
      const cells = ['request', 'browser', 'system', ...RESOURCES].map(k =>
        `<td data-col="${k}"${isBest(m, k) ? ' class="best"' : ''} data-value="${finite(m[k]) ? m[k] : ''}"${tip(m, k)}>${format(k, m[k])}</td>`).join('');
      return `<tr data-model="${escape(m.id)}"><td class="rank">${rank[m.id]}</td>`
        + `<th scope="row" class="model" title="${escape(m.org)}"><span class="m-name"><img class="model-logo" src="${escape(m.logo)}" alt="" width="18" height="18">${escape(m.name)}</span>`
        + `<span class="sr-only">${escape(m.org)}, ${open ? 'open-source' : 'proprietary'} model</span>`
        + '</th>'
        + `<td class="col-overall" data-col="overall" data-value="${finite(m.overall) ? m.overall : ''}"${tip(m, 'overall')}><span class="ov"><span class="bar" aria-hidden="true"><i class="${open ? 'open' : 'proprietary'}" style="width:${overall.toFixed(2)}%"></i></span><b${isBest(m, 'overall') ? ' class="best"' : ''}>${format('overall', m.overall)}</b></span></td>`
        + `${cells}</tr>`;
    }).join('\n');
  }
  return {renderRows, standing, format};
});
