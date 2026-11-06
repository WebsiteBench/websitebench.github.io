/* Leaderboard rows, shared by tools/prerender.js (static HTML) and results.js (browser). */
((root, factory) => {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WebsiteBenchLeaderboard = factory();
})(globalThis, () => {
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const SCORES = ['overall', 'request', 'browser', 'system'];
  const RESOURCES = ['cost', 'tokens', 'turns'];
  const oneDecimal = {minimumFractionDigits: 1, maximumFractionDigits: 1};
  function format(key, value) {
    if (value === null) return '—';
    if (SCORES.includes(key)) return value.toFixed(1);
    if (key === 'cost') return '$' + value.toLocaleString('en-US', oneDecimal);
    if (key === 'tokens') return value.toLocaleString('en-US', oneDecimal) + 'M';
    return value.toLocaleString('en-US', oneDecimal);
  }
  function title(m, key) {
    if (m[key] === null) return '';
    if (SCORES.includes(key)) {
      const tests = m.score_counts[key];
      return ` title="${tests.passed.toLocaleString('en-US')} of ${tests.total.toLocaleString('en-US')} tests passed"`;
    }
    return '';
  }
  function renderRows(models) {
    const best = Object.fromEntries(SCORES.map(k => [k, Math.max(...models.map(m => m[k]))]));
    return models.map((m, index) => {
      const context = /^recorded$/i.test(m.context_label) ? '' : `, ${escape(m.context_label)}`;
      const cells = ['request', 'browser', 'system', ...RESOURCES].map(k =>
        `<td${m[k] === best[k] ? ' class="best"' : ''}${title(m, k)}>${format(k, m[k])}</td>`).join('');
      return `<tr data-model="${escape(m.id)}"><td class="rank">${index + 1}</td>`
        + `<th scope="row" class="model" title="${escape(m.org)}${context}"><span class="m-name"><img class="model-logo" src="${escape(m.logo)}" alt="" width="16" height="16">${escape(m.name)}</span>`
        + `<span class="sr-only">${escape(m.org)}${context}, ${m.group === 'open' ? 'open-source' : 'frontier'} model</span></th>`
        + `<td class="col-overall"${title(m, 'overall')}><span class="ov"><b${m.overall === best.overall ? ' class="best"' : ''}>${format('overall', m.overall)}</b><span class="bar" aria-hidden="true"><i class="${m.group === 'open' ? 'open' : 'frontier'}" style="width:${m.overall.toFixed(2)}%"></i></span></span></td>`
        + `${cells}</tr>`;
    }).join('\n');
  }
  return {renderRows};
});
