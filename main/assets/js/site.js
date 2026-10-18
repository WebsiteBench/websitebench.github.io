/* Progressive enhancement only: the full benchmark and leaderboard are static HTML. */
(() => {
  'use strict';
  const root = document.documentElement;
  if (location.pathname.endsWith('/') || location.pathname.endsWith('index.html')) {
    const legacy = {'#task':'tasks.html','#benchmark':'analysis.html#benchmark','#findings':'analysis.html#findings','#why':'analysis.html#findings','#run':'run.html'};
    if (legacy[location.hash]) { location.replace(legacy[location.hash]); return; }
  }
  const openCitation = () => {
    if (location.hash !== '#cite') return;
    const details = document.querySelector('#cite details');
    if (details) details.open = true;
  };
  openCitation();
  window.addEventListener('hashchange', openCitation);
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
