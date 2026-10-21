/* Shared static/browser table rendering from the canonical HF export. */
((root, factory) => {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WebsiteBenchLeaderboard = factory();
})(globalThis, () => {
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const keys = ['overall','request','browser','system','cost','tokens','turns'];
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  function renderRows(models) {
    const best = Object.fromEntries(keys.slice(0,4).map(k => [k, Math.max(...models.map(m => finite(m[k]) ? m[k] : -Infinity))]));
    return models.map((m,index) => {
      const cells = keys.map(key => {
        const value=m[key], count=m.coverage[key], score=keys.indexOf(key)<4;
        const label=!finite(value)?'—':score?value.toFixed(1)+'%':key==='cost'?'$'+value.toFixed(2):key==='tokens'?value.toFixed(1)+'M':value.toLocaleString('en-US',{maximumFractionDigits:1});
        const coverage=key==='overall'||(score&&count<m.coverage.overall)?`<small class="metric-coverage">${count}/${m.total_tasks}</small>`:'';
        const tests=score&&finite(value)?` · ${m.score_counts[key].passed}/${m.score_counts[key].total} tests (pooled)`:'';
        const title=`${count}/${m.total_tasks} tasks with ${score?'published scores':'reported resource values'}${tests}${score?'':'. Estimates and partial usage remain qualified.'}`;
        return `<td data-value="${finite(value)?value:''}" data-coverage="${count}" class="${key==='overall'?'overall ':''}${score&&value===best[key]?'best':''}" title="${escape(title)}">${key==='overall'&&finite(value)?`<span class="score-track" aria-hidden="true"><span style="width:${value}%"></span></span>`:''}<span>${label}</span>${coverage}</td>`;
      }).join('');
      return `<tr data-model="${escape(m.id)}" data-short="${escape(m.short)}" data-org="${escape(m.org)}"><td class="rank">${index+1}</td><th scope="row"><span class="model-name"><img class="model-logo" src="${escape(m.logo)}" alt="" width="18" height="18">${escape(m.name)}</span><span class="model-meta">${escape(m.context_label)}</span></th>${cells}</tr>`;
    }).join('\n');
  }
  return {renderRows};
});
