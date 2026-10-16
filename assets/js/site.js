/* Progressive enhancement only: the full benchmark and leaderboard are static HTML. */
(() => {
  'use strict';
  const root = document.documentElement;
  if (location.pathname.endsWith('/') || location.pathname.endsWith('index.html')) {
    const legacy = {'#task':'tasks.html','#benchmark':'analysis.html#benchmark','#findings':'analysis.html#findings','#why':'analysis.html#findings','#run':'run.html','#cite':'analysis.html#cite'};
    if (legacy[location.hash]) { location.replace(legacy[location.hash]); return; }
  }
  const themeButton = document.getElementById('theme-toggle');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const updateTheme = () => {
    const dark = root.dataset.theme === 'dark';
    themeButton.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} theme`);
    themeMeta.content = dark ? '#191a18' : '#fafaf8';
  };
  themeButton.hidden = false;
  themeButton.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('wb-theme', root.dataset.theme); } catch (_) { /* Storage is optional. */ }
    updateTheme();
  });
  updateTheme();

  const board = document.getElementById('board');
  const body = document.getElementById('board-body');
  const columns = { overall: 2, request: 3, browser: 4, system: 5, cost: 6, tokens: 7, turns: 8 };
  const scoreKeys = ['overall', 'request', 'browser', 'system'];
  if (board && body) {
  const rows = Array.from(body.rows);
  let sortKey = 'overall';
  let descending = true;
  board.querySelectorAll('[data-sort]').forEach(button => {
    button.hidden = false;
    button.previousElementSibling.hidden = true;
    button.addEventListener('click', () => {
      const key = button.dataset.sort;
      descending = key === sortKey ? !descending : scoreKeys.includes(key);
      sortKey = key;
      const value = (row, column) => Number(row.cells[column].dataset.value);
      rows.sort((a, b) => (value(a, columns[key]) - value(b, columns[key])) * (descending ? -1 : 1) || value(b, 2) - value(a, 2));
      rows.forEach((row, index) => {
        row.cells[0].textContent = index + 1;
        body.appendChild(row);
      });
      board.querySelectorAll('thead th').forEach(th => th.removeAttribute('aria-sort'));
      button.parentElement.setAttribute('aria-sort', descending ? 'descending' : 'ascending');
      board.querySelectorAll('.sort-arrow').forEach(arrow => { arrow.textContent = '↕'; });
      button.querySelector('.sort-arrow').textContent = descending ? '↓' : '↑';
    });
  });

  }
  document.querySelectorAll('[data-copy]').forEach(button => {
    if (!navigator.clipboard || !window.isSecureContext) return;
    button.hidden = false;
    button.addEventListener('click', async () => {
      const text = document.getElementById(button.dataset.copy).textContent;
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = 'Copied';
        document.getElementById('copy-status').textContent = 'Copied to clipboard.';
      } catch (_) {
        button.textContent = 'Select text';
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(document.getElementById(button.dataset.copy));
        selection.removeAllRanges();
        selection.addRange(range);
        document.getElementById('copy-status').textContent = 'Select the highlighted text and copy it manually.';
      }
      setTimeout(() => { button.textContent = 'Copy'; }, 2000);
    });
  });
})();
