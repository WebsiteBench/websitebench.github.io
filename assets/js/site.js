/* WebsiteBench site: theme, navigation, the task demo, the failure tree, figures and copy buttons. No dependencies. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ------------------------------------------------------------------ theme */
  const root = document.documentElement;
  const themeBtn = $('#theme-toggle');
  const darkMQ = matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : darkMQ.matches);
  const syncTheme = () => {
    themeBtn.setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme');
    if (root.dataset.theme) $$('meta[name="theme-color"]').forEach(m => m.setAttribute('content', isDark() ? '#22252E' : '#FFFFFF'));
  };
  themeBtn.addEventListener('click', () => {
    root.dataset.theme = isDark() ? 'light' : 'dark';
    syncTheme();
    try { localStorage.setItem('wb-theme', root.dataset.theme); } catch (e) { /* blocked site data */ }
  });
  darkMQ.addEventListener('change', syncTheme);
  syncTheme();

  /* ------------------------------------------------------------- top bar */
  const topbar = $('#topbar');
  const onScroll = () => topbar.classList.toggle('is-scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const menuBtn = $('#menu-btn');
  if (menuBtn) {
    const toc = $('#toc');
    const setMenu = open => { toc.classList.toggle('is-open', open); menuBtn.setAttribute('aria-expanded', String(open)); };
    menuBtn.addEventListener('click', e => { e.stopPropagation(); setMenu(!toc.classList.contains('is-open')); });
    toc.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('click', e => { if (!toc.contains(e.target)) setMenu(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && toc.classList.contains('is-open')) { setMenu(false); menuBtn.focus(); } });

    // On the homepage, the section links follow the reader.
    const tocLinks = $$('a[href^="#"]', toc);
    const spy = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) tocLinks.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + e.target.id));
    }), { rootMargin: '-40% 0px -55% 0px' });
    tocLinks.forEach(a => spy.observe($(a.getAttribute('href'))));
  }

  /* ============================================================ the demo */
  // One recorded run: screenshots of the reference and the rebuild, the differences visible in them, and real hidden test results.
  // The content comes from data/demo-task.json; tools/prerender.js writes the tabs, the test rows and this data into index.html.
  const stage = $('#stage');
  if (stage) initDemo();

  function initDemo() {
    const D = JSON.parse($('#demo-data').textContent);
    const PREVIEWS = 'assets/previews/' + D.task + '/';
    const pageById = id => D.pages.find(p => p.id === id);
    const frame = $('#frame');
    const wrap = $('#stage-wrap');
    const divider = $('#divider');
    const cursor = $('#demo-cursor');
    const tip = $('#tip');
    const marks = $('#marks');
    const boxes = $('#boxes');
    const list = $('#dt-list');
    const score = $('#dt-score');
    const runBtn = $('#run-tests');
    const note = $('#demo-note');
    const tabs = $$('#demo-tabs [role="tab"]');
    const shots = { reference: $('#shot-reference'), rebuild: $('#shot-rebuild') };
    const paths = { reference: $('.layer.is-ref [data-path]', frame), rebuild: $('.layer.is-cand [data-path]', frame) };
    const sideRef = $('.side-ref', divider);
    const sideCand = $('.side-cand', divider);
    const SIDE_NAME = { reference: `Reference: the local copy of ${D.site}`, rebuild: `Rebuild by ${D.model}` };

    const shotAttrs = (p, side) => {
      const base = `${PREVIEWS}${p.id}-${side}`;
      return p.phone
        ? { src: `${base}-780.webp`, srcset: '', sizes: '' }
        : { src: `${base}-1240.webp`, srcset: `${base}-1240.webp 1240w, ${base}-2480.webp 2480w`, sizes: '(max-width: 1040px) 100vw, 1000px' };
    };
    // Both sides swap together, once both are ready, so a comparison is never half old.
    const loaded = new Map();
    function preload(p) {
      if (loaded.has(p.id)) return loaded.get(p.id);
      const ready = Promise.all(Object.keys(shots).map(side => new Promise(done => {
        const a = shotAttrs(p, side), im = new Image();
        im.onload = im.onerror = done;
        if (a.srcset) { im.sizes = a.sizes; im.srcset = a.srcset; }
        im.src = a.src;
      })));
      loaded.set(p.id, ready);
      return ready;
    }

    /* ---------- divider ---------- */
    let split = 62;
    let current = pageById(stage.dataset.page);
    const minSplit = () => (stage.clientWidth < 600 ? 7 : 0);
    const restSplit = p => Math.max(p.split, minSplit());
    function setSplit(v) {
      split = Math.max(0, Math.min(100, v));
      frame.style.setProperty('--split', split + '%');
      divider.setAttribute('aria-valuenow', String(Math.round(split)));
      divider.setAttribute('aria-valuetext', Math.round(split) + ' percent reference');
      // A side label stays only while it fits on its own side of the divider.
      const w = frame.clientWidth, x = w * split / 100;
      sideRef.classList.toggle('is-off', x < sideRef.offsetWidth + 44);
      sideCand.classList.toggle('is-off', w - x < sideCand.offsetWidth + 44);
    }
    divider.addEventListener('pointerdown', e => {
      e.preventDefault();
      stopIntro();
      touched = true;
      divider.setPointerCapture(e.pointerId);
      divider.classList.add('is-dragging');
      hideTip();
      const move = ev => { const r = frame.getBoundingClientRect(); setSplit((ev.clientX - r.left) / r.width * 100); };
      const up = () => {
        divider.classList.remove('is-dragging');
        divider.removeEventListener('pointermove', move);
        divider.removeEventListener('pointerup', up);
        divider.removeEventListener('pointercancel', up);
      };
      divider.addEventListener('pointermove', move);
      divider.addEventListener('pointerup', up);
      divider.addEventListener('pointercancel', up);
    });
    divider.addEventListener('keydown', e => {
      const step = e.shiftKey ? 10 : 2;
      let v = split;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v -= step;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v += step;
      else if (e.key === 'PageDown') v -= 10;
      else if (e.key === 'PageUp') v += 10;
      else if (e.key === 'Home') v = 0;
      else if (e.key === 'End') v = 100;
      else return;
      e.preventDefault();
      stopIntro();
      touched = true;
      setSplit(v);
    });

    /* ---------- pages ---------- */
    function renderMarks(p) {
      const ms = D.markers.filter(m => m.page === p.id);
      marks.innerHTML = ms.map(m => `<button type="button" class="bug is-${m.align}" data-bug="${m.n}" style="left:${m.x}%;top:${m.y}%" aria-label="Difference ${m.n}: ${esc(m.title)}"><i class="bug-n">${m.n}</i><span class="bug-l">${esc(m.label)}</span></button>`).join('');
      boxes.innerHTML = ms.filter(m => m.box).map(m => `<span class="bug-box" data-box="${m.n}" style="left:${m.box.x}%;top:${m.box.y}%;width:${m.box.w}%;height:${m.box.h}%"></span>`).join('');
    }
    let swapToken = 0;
    function showPage(p, after) {
      const token = ++swapToken;
      tabs.forEach(t => {
        const on = t.dataset.page === p.id;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        if (on && t.parentElement.scrollWidth > t.parentElement.clientWidth) t.parentElement.scrollLeft = t.offsetLeft - 16;
      });
      stage.setAttribute('aria-labelledby', `demo-tab-${p.id}`);
      hideTip();
      const apply = () => {
        if (token !== swapToken) return;
        current = p;
        stage.dataset.page = p.id;
        stage.classList.toggle('is-phone', Boolean(p.phone));
        Object.keys(shots).forEach(side => {
          const a = shotAttrs(p, side), img = shots[side];
          img.loading = 'eager';
          img.sizes = a.sizes;
          img.srcset = a.srcset;
          img.src = a.src;
          img.width = p.width;
          img.height = p.height;
          img.alt = `${SIDE_NAME[side]}, ${p.label}`;
          paths[side].textContent = p.urls[side];
        });
        note.textContent = p.note;
        renderMarks(p);
        setSplit(restSplit(p));
        if (after) after();
      };
      if (p === current) { apply(); return; }
      preload(p).then(apply);
    }
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => { stopIntro(); touched = true; showPage(pageById(t.dataset.page)); });
      // Fetch a page's pair as soon as a reader shows interest in its tab.
      t.addEventListener('pointerenter', () => preload(pageById(t.dataset.page)), { once: true });
      t.addEventListener('focus', () => preload(pageById(t.dataset.page)), { once: true });
      t.addEventListener('keydown', e => {
        const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        const next = tabs[(to + tabs.length) % tabs.length];
        next.focus();
        next.click();
      });
    });

    /* ---------- marker tooltips and the tests panel ---------- */
    const markerByN = n => D.markers.find(m => m.n === Number(n));
    function showTip(el) {
      const m = markerByN(el.dataset.bug);
      tip.innerHTML = `<b>${esc(m.title)}</b>${esc(m.body)}<small>${esc(m.cite)}</small>`;
      tip.hidden = false;
      const wr = wrap.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let left = r.left - wr.left + r.width / 2 - tw / 2;
      left = Math.max(8, Math.min(wr.width - tw - 8, left));
      let top = r.bottom - wr.top + 10;
      if (top + th > wr.height - 8 && r.top - wr.top - th - 10 >= 0) top = r.top - wr.top - th - 10;
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
      hot(D.tests.find(t => t.id === m.test), true);
    }
    function hideTip() { tip.hidden = true; hot(null); }

    marks.addEventListener('click', e => { const g = e.target.closest('.bug'); if (g) { touched = true; showTip(g); } });
    marks.addEventListener('pointerover', e => { const g = e.target.closest('.bug'); if (g) showTip(g); });
    marks.addEventListener('pointerout', e => { const g = e.target.closest('.bug'); if (g && !g.contains(e.relatedTarget)) hideTip(); });
    marks.addEventListener('focusin', e => { const g = e.target.closest('.bug'); if (g) showTip(g); });
    marks.addEventListener('focusout', hideTip);
    // Touch screens never send pointerout, so any tap outside a marker closes its tooltip.
    document.addEventListener('pointerdown', e => { if (!tip.hidden && !e.target.closest('.bug, .dt-go')) hideTip(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !tip.hidden) hideTip(); });

    let hotTest = null;
    function hot(test, fromMarker) {
      if (hotTest) {
        $$('.dt-row.is-hot', list).forEach(r => r.classList.remove('is-hot'));
        $$('.bug.is-hot', marks).forEach(el => el.classList.remove('is-hot'));
        $$('.bug-box.is-hot', boxes).forEach(el => el.classList.remove('is-hot'));
      }
      hotTest = test || null;
      if (!test) return;
      $(`[data-test="${test.id}"]`, list).classList.add('is-hot');
      const m = D.markers.find(x => x.test === test.id);
      if (!m) return;
      $(`[data-box="${m.n}"]`, boxes)?.classList.add('is-hot');
      if (!fromMarker) $(`[data-bug="${m.n}"]`, marks)?.classList.add('is-hot');
    }
    const testOf = row => D.tests.find(t => t.id === row.dataset.test);
    list.addEventListener('pointerover', e => { const row = e.target.closest('.dt-row'); if (row) hot(testOf(row)); });
    list.addEventListener('pointerleave', () => { if (tip.hidden) hot(null); });
    list.addEventListener('click', e => {
      const go = e.target.closest('.dt-go');
      if (!go) return;
      stopIntro();
      touched = true;
      const test = testOf(go.closest('.dt-row'));
      showPage(pageById(go.dataset.page), () => {
        const m = D.markers.find(x => x.test === test.id);
        if (!m) return;
        const el = $(`[data-bug="${m.n}"]`, marks);
        const top = stage.getBoundingClientRect().top;
        if (top < 0 || top > window.innerHeight * 0.6) stage.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
        showTip(el);
      });
    });

    // Replays the run's recorded results. Replay tests also walks through the pages each result belongs to.
    const rows = $$('.dt-row', list);
    const isPassed = t => t.functional && (t.ssim === undefined || t.ssim >= D.threshold);
    let running = false;
    let touched = false;
    function runTests() {
      if (running) return;
      running = true;
      runBtn.disabled = true;
      hideTip();
      touched = false;
      let passed = 0;
      const setScore = n => { score.innerHTML = `<b>${n}</b> of ${D.tests.length} shown tests passed`; };
      setScore(0);
      rows.forEach(r => { r.classList.remove('is-done', 'is-running'); r.classList.add('is-pending'); });
      const walking = !reduceMotion && stage.clientWidth >= 600;
      if (walking) D.tests.forEach(t => { if (t.page) preload(pageById(t.page)); });
      const finish = () => { hot(null); running = false; runBtn.disabled = false; };
      const step = i => {
        if (i === D.tests.length) { setTimeout(finish, reduceMotion ? 0 : 700); return; }
        const t = D.tests[i], row = rows[i];
        const showsPage = walking && t.page && !touched;
        row.classList.remove('is-pending');
        row.classList.add('is-running');
        hot(null);
        if (showsPage) showPage(pageById(t.page), () => hot(t));
        else if (t.page === current.id) hot(t);
        setTimeout(() => {
          row.classList.remove('is-running');
          row.classList.add('is-done');
          if (isPassed(t)) passed += 1;
          setScore(passed);
          setTimeout(() => step(i + 1), reduceMotion ? 0 : (showsPage ? 1000 : 140));
        }, reduceMotion ? 0 : 380);
      };
      step(0);
    }
    runBtn.addEventListener('click', () => { stopIntro(); runTests(); });

    /* ---------- intro: a cursor drags the divider in once ---------- */
    let raf = null;
    let introDismissed = false;
    function stopIntro() {
      introDismissed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      cursor.style.opacity = '0';
      stage.classList.add('show-bugs');
    }
    function intro() {
      if (introDismissed) return;
      const to = restSplit(current);
      if (reduceMotion) { setSplit(to); stage.classList.add('show-bugs'); return; }
      const from = 97, delay = 700, dur = 1500;
      setSplit(from);
      const start = performance.now();
      const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      const tick = now => {
        const el = now - start;
        const t = Math.min(1, Math.max(0, (el - delay) / dur));
        const v = from + (to - from) * ease(t);
        setSplit(v);
        cursor.style.left = v + '%';
        cursor.style.opacity = el < delay - 350 ? '0' : el < delay ? String((el - (delay - 350)) / 350) : (t < 1 ? '1' : '0');
        if (t < 1) { raf = requestAnimationFrame(tick); }
        else { raf = null; stage.classList.add('show-bugs'); }
      };
      raf = requestAnimationFrame(tick);
    }

    renderMarks(current);
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); document.fonts.ready.then(intro); } }, { threshold: 0.35 });
    io.observe(stage);
    setSplit(restSplit(current));
    let rt = null;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { hideTip(); setSplit(split); }, 80); });
  }

  /* ======================================================= failure tree */
  // Observed defects converge into the three failure modes, which converge into the result.
  // The connecting lines draw left to right the first time the figure enters view.
  const tree = $('#tree');
  if (tree) {
    const grid = $('#tree-grid', tree);
    const svg = $('#tree-lines', tree);
    const rootNode = $('#root-node', grid);
    const isWide = () => getComputedStyle(svg).display !== 'none';
    const curve = (a, b, g) => {
      const x1 = a.right - g.left, y1 = a.top + a.height / 2 - g.top, x2 = b.left - g.left, y2 = b.top + b.height / 2 - g.top, dx = (x2 - x1) / 2;
      return `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    };
    const build = () => {
      if (!isWide()) return;
      const g = grid.getBoundingClientRect(), box = el => el.getBoundingClientRect(), armed = tree.classList.contains('is-armed');
      svg.setAttribute('width', g.width);
      svg.setAttribute('height', g.height);
      svg.innerHTML = $$('.cat-node', grid).map(cat => {
        const leaves = $$(`.group[data-cat="${cat.dataset.cat}"] .leaf`, grid);
        return leaves.map(leaf => `<path class="to-cat" d="${curve(box(leaf), box(cat), g)}"/>`).join('') + `<path class="to-root" d="${curve(box(cat), box(rootNode), g)}"/>`;
      }).join('');
      $$('path', svg).forEach(path => {
        const length = path.getTotalLength();
        path.style.strokeDasharray = length;
        path.style.strokeDashoffset = armed ? length : 0;
      });
    };
    document.fonts.ready.then(() => {
      if (!reduceMotion && isWide() && tree.getBoundingClientRect().top > innerHeight * .6) {
        tree.classList.add('is-armed');
        const io = new IntersectionObserver(es => {
          if (!es.some(e => e.isIntersecting)) return;
          io.disconnect();
          tree.classList.remove('is-armed');
          $$('path', svg).forEach(path => { path.style.strokeDashoffset = 0; });
        }, { threshold: .4 });
        io.observe(tree);
      }
      build();
      let width = grid.clientWidth;
      new ResizeObserver(() => { if (grid.clientWidth !== width) { width = grid.clientWidth; build(); } }).observe(grid);
    });
  }

  /* =========================================================== lightbox */
  const lb = $('#lightbox');
  if (lb) {
    const lbImg = $('#lb-img');
    $$('[data-zoom]').forEach(b => b.addEventListener('click', () => {
      lbImg.src = b.dataset.zoom;
      lbImg.alt = b.dataset.alt;
      lb.showModal();
    }));
    $('#lb-close').addEventListener('click', () => lb.close());
    lb.addEventListener('click', e => { if (e.target === lb) lb.close(); });
  }

  /* ========================================================= copy text */
  function copyText(button, text, restore) {
    const label = $('span', button);
    navigator.clipboard.writeText(text).then(() => {
      label.textContent = 'Copied';
      setTimeout(() => { label.textContent = restore(); }, 2000);
    });
  }
  const citeTabs = $('#cite-tabs');
  if (citeTabs) {
    const tabs = $$('[role="tab"]', citeTabs), panels = $$('.cite-panel'), copy = $('#copy-bib');
    const selected = () => tabs.find(t => t.getAttribute('aria-selected') === 'true');
    const select = tab => {
      tabs.forEach(t => { t.setAttribute('aria-selected', String(t === tab)); t.tabIndex = t === tab ? 0 : -1; });
      panels.forEach(p => { p.hidden = p.id !== tab.getAttribute('aria-controls'); });
      $('span', copy).textContent = tab.dataset.copy;
    };
    tabs.forEach(t => t.addEventListener('click', () => select(t)));
    citeTabs.addEventListener('keydown', e => {
      const i = tabs.indexOf(document.activeElement);
      const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (j === undefined) return;
      e.preventDefault();
      const next = tabs[(j + tabs.length) % tabs.length];
      select(next);
      next.focus();
    });
    copy.addEventListener('click', () => copyText(copy, panels.find(p => !p.hidden).textContent, () => selected().dataset.copy));
  }
  $$('[data-copy-target]').forEach(button => {
    button.addEventListener('click', () => copyText(button, $('#' + button.dataset.copyTarget).textContent, () => 'Copy'));
  });
})();
