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
  function title(m, key) {
    if (!finite(m[key])) return '';
    if (SCORES.includes(key)) {
      const tests = m.score_counts[key];
      return `${tests.passed.toLocaleString('en-US')} of ${tests.total.toLocaleString('en-US')} tests passed`;
    }
    return '';
  }
  function renderRows(models) {
    const best = Object.fromEntries(SCORES.map(k => [k, Math.max(...models.map(m => finite(m[k]) ? m[k] : -Infinity))]));
    const isBest = (m, key) => SCORES.includes(key) && finite(m[key]) && m[key] === best[key];
    return models.map((m, index) => {
      const open = m.group === 'open';
      const sub = SCORES.slice(1).map(k => `<span data-col="${k}"><em>${k[0].toUpperCase()}</em>${format(k, m[k])}</span>`).join('');
      const overall = finite(m.overall) ? m.overall : 0;
      const cells = ['request', 'browser', 'system', ...RESOURCES].map(k =>
        `<td data-col="${k}"${isBest(m, k) ? ' class="best"' : ''} data-value="${finite(m[k]) ? m[k] : ''}" title="${escape(title(m, k))}">${format(k, m[k])}</td>`).join('');
      return `<tr data-model="${escape(m.id)}"><td class="rank">${index + 1}</td>`
        + `<th scope="row" class="model" title="${escape(m.org)}"><span class="m-name"><img class="model-logo" src="${escape(m.logo)}" alt="" width="18" height="18">${escape(m.name)}</span>`
        + `<span class="sr-only">${escape(m.org)}, ${open ? 'open-source' : 'proprietary'} model</span>`
        + `<span class="m-sub" aria-hidden="true">${sub}</span></th>`
        + `<td class="col-overall" data-col="overall" data-value="${finite(m.overall) ? m.overall : ''}" title="${escape(title(m, 'overall'))}"><span class="ov"><span class="bar" aria-hidden="true"><i class="${open ? 'open' : 'proprietary'}" style="width:${overall.toFixed(2)}%"></i></span><b${isBest(m, 'overall') ? ' class="best"' : ''}>${format('overall', m.overall)}</b></span></td>`
        + `${cells}</tr>`;
    }).join('\n');
  }
  return {renderRows, format};
});
