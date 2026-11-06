/* WebsiteBench site: theme, navigation, the task demo, the failure tree, figures and copy buttons. No dependencies. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Sections that moved off the homepage keep working from their old addresses.
  const cleanPath = location.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  if (cleanPath !== location.pathname) history.replaceState(history.state, '', cleanPath + location.search + location.hash);
  if (location.pathname === '/') {
    const moved = location.hash.slice(1);
    const page = moved === 'run' ? '/run' : ['task', 'benchmark', 'tests'].includes(moved) ? `/eval#${moved}` : (moved === 'why' || moved === 'findings' || /^f\d/.test(moved)) ? `/analysis#${moved}` : '';
    if (page) { location.replace(page); return; }
  }

  /* ------------------------------------------------------------------ theme */
  const root = document.documentElement;
  const themeBtn = $('#theme-toggle');
  const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : darkMQ.matches);
  const syncTheme = () => {
    if (themeBtn) themeBtn.setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme');
    if (root.dataset.theme) $$('meta[name="theme-color"]').forEach(m => m.setAttribute('content', isDark() ? '#0D1015' : '#FFFFFF'));
  };
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('wb-theme', next); } catch (e) { /* storage unavailable */ }
      syncTheme();
    });
  }
  if (darkMQ.addEventListener) darkMQ.addEventListener('change', syncTheme);
  syncTheme();

  /* ------------------------------------------------------------- top bar */
  const menuBtn = $('#menu-btn');
  const toc = $('#toc');
  if (menuBtn && toc) {
    const setMenu = open => { toc.classList.toggle('is-open', open); menuBtn.setAttribute('aria-expanded', String(open)); };
    menuBtn.addEventListener('click', e => { e.stopPropagation(); setMenu(!toc.classList.contains('is-open')); });
    toc.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('click', e => { if (!toc.contains(e.target) && e.target !== menuBtn) setMenu(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && toc.classList.contains('is-open')) { setMenu(false); menuBtn.focus(); } });
  }

  // Tables that scroll sideways show a fade until the reader reaches their last column.
  const scrollers = $$('.board-wrap, .design-wrap, pre.code');
  const markScroll = el => el.classList.toggle('can-scroll', el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  scrollers.forEach(el => { markScroll(el); el.addEventListener('scroll', () => markScroll(el), { passive: true }); });
  if ('ResizeObserver' in window) { const ro = new ResizeObserver(() => scrollers.forEach(markScroll)); scrollers.forEach(el => ro.observe(el)); }

  // On the homepage, a section link stays active until the reader reaches the next one.
  const tocMarks = (location.pathname === '/' ? $$('.toc a[href^="/#"]').map(a => [a, $(a.getAttribute('href').slice(1))]) : []).filter(([, section]) => section);
  if (tocMarks.length) {
    const follow = () => {
      const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
      let current = atEnd ? tocMarks[tocMarks.length - 1][0] : null;
      if (!atEnd) tocMarks.forEach(([a, section]) => { if (section.getBoundingClientRect().top <= innerHeight * .4) current = a; });
      tocMarks.forEach(([a]) => a.classList.toggle('is-active', a === current));
    };
    addEventListener('scroll', follow, { passive: true });
    addEventListener('resize', follow);
    follow();
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
        : { src: `${base}-1240.webp`, srcset: `${base}-1240.webp 1240w, ${base}-2480.webp 2480w`, sizes: '(max-width: 1320px) 100vw, 1240px' };
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
      Promise.race([preload(p), new Promise(done => setTimeout(done, 2500))]).then(apply);
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
      if (!m) return;
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
      const row = $(`[data-test="${test.id}"]`, list);
      if (row) row.classList.add('is-hot');
      const m = D.markers.find(x => x.test === test.id);
      if (!m) return;
      const box = $(`[data-box="${m.n}"]`, boxes);
      if (box) box.classList.add('is-hot');
      if (!fromMarker) { const b = $(`[data-bug="${m.n}"]`, marks); if (b) b.classList.add('is-hot'); }
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
        const el = m && $(`[data-bug="${m.n}"]`, marks);
        if (!el) return;
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
    function runTests(walk) {
      if (running) return;
      running = true;
      runBtn.disabled = true;
      hideTip();
      touched = false;
      let passed = 0;
      const setScore = n => { score.innerHTML = `<b>${n}</b> of ${D.tests.length} shown tests passed`; };
      setScore(0);
      rows.forEach(r => { r.classList.remove('is-done', 'is-running'); r.classList.add('is-pending'); });
      const walking = walk && !reduceMotion && stage.clientWidth >= 600;
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
    let userRan = false;
    runBtn.addEventListener('click', () => { userRan = true; stopIntro(); runTests(true); });
    // Play the run once, the first time the tests panel is in view, so the score is earned on screen.
    if (!reduceMotion && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => {
        if (!es.some(e => e.isIntersecting)) return;
        io.disconnect();
        setTimeout(() => { if (!userRan && !touched) runTests(false); }, 400);
      }, { threshold: 0.6 });
      io.observe(list);
    }

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
    const ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); ready.then(intro); } }, { threshold: 0.35 });
      io.observe(stage);
    } else ready.then(intro);
    setSplit(restSplit(current));
    let rt = null;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { hideTip(); setSplit(split); }, 80); });
  }

  /* ======================================================= failure tree */
  // Nine observed defects converge into the three failure modes, which converge into WebsiteBench.
  const tree = $('#tree');
  if (tree) {
    const grid = $('#tree-grid', tree);
    const svg = $('#tree-lines', tree);
    const rootNode = $('#root-node', grid);
    const big = $('.root-big', rootNode);
    const cats = $$('.cat-node', grid).map(el => ({ el, group: $(`.group[data-cat="${el.dataset.cat}"]`, grid), leaves: $$(`.group[data-cat="${el.dataset.cat}"] .leaf`, grid) }));
    const NS = 'http://www.w3.org/2000/svg';
    const isWide = () => getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length > 1;
    let owners = new Map();
    let timers = [];
    let done = false;

    const rel = (el, gr) => { const r = el.getBoundingClientRect(); return { x: r.left - gr.left, y: r.top - gr.top, w: r.width, h: r.height, cx: r.left - gr.left + r.width / 2, cy: r.top - gr.top + r.height / 2 }; };
    const curveH = (a, b) => { const dx = Math.max(24, (b.x - (a.x + a.w)) / 2); return `M${a.x + a.w} ${a.cy} C ${a.x + a.w + dx} ${a.cy}, ${b.x - dx} ${b.cy}, ${b.x} ${b.cy}`; };

    function build() {
      const gr = grid.getBoundingClientRect();
      svg.setAttribute('width', gr.width);
      svg.setAttribute('height', gr.height);
      svg.setAttribute('viewBox', `0 0 ${gr.width} ${gr.height}`);
      svg.innerHTML = '';
      owners = new Map();
      const add = (owner, d, cls) => {
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', d);
        p.setAttribute('class', cls);
        svg.appendChild(p);
        const len = p.getTotalLength();
        p.style.strokeDasharray = String(len);
        p.dataset.len = String(len);
        owners.set(owner, (owners.get(owner) || []).concat(p));
      };
      const wide = isWide();
      const r = rel(rootNode, gr);
      cats.forEach(c => {
        const cr = rel(c.el, gr);
        if (wide) {
          c.leaves.forEach(leaf => add(leaf, curveH(rel(leaf, gr), cr), 'to-cat'));
          add(c.el, curveH(cr, r), 'to-root');
        }
      });
      if (!wide) {
        // A trunk on the left rail joins the three modes to the root.
        const x = 9;
        const first = rel(cats[0].el, gr);
        const stubs = cats.map(c => { const cr = rel(c.el, gr); return `M${x} ${cr.cy} H${cr.x}`; }).join(' ');
        add(rootNode, `M${x} ${first.cy} V${r.cy} H${r.x} ${stubs}`, 'to-root');
      }
    }
    const nodes = () => $$('.leaf, .cat-node, .root-node', grid);
    const target = big.textContent.trim();
    const targetValue = Number(target.replace(/[^0-9.]/g, ''));
    function showAll() {
      nodes().forEach(el => el.classList.add('is-on'));
      rootNode.classList.add('is-punch');
      big.textContent = target;
      $$('path', svg).forEach(p => { p.style.transition = 'none'; p.style.strokeDashoffset = '0'; });
      void svg.offsetWidth;
      $$('path', svg).forEach(p => { p.style.transition = ''; });
    }
    function arm() {
      tree.classList.add('is-armed');
      nodes().forEach(el => el.classList.remove('is-on'));
      rootNode.classList.remove('is-punch');
      $$('path', svg).forEach(p => { p.style.transition = 'none'; p.style.strokeDashoffset = p.dataset.len; });
      void svg.offsetWidth;
      $$('path', svg).forEach(p => { p.style.transition = ''; });
    }
    const draw = owner => (owners.get(owner) || []).forEach(p => { p.style.strokeDashoffset = '0'; });
    function play() {
      timers.forEach(clearTimeout);
      timers = [];
      done = false;
      build();
      if (reduceMotion) { tree.classList.add('is-armed'); showAll(); done = true; return; }
      arm();
      const at = (ms, fn) => timers.push(setTimeout(fn, ms));
      const wide = isWide();
      let t = 250;
      cats.forEach(c => {
        c.leaves.forEach(leaf => {
          at(t, () => leaf.classList.add('is-on'));
          if (wide) at(t + 40, () => draw(leaf));
          t += 110;
        });
        if (!wide) at(t, () => draw(c.group));
        t += 230;
        at(t, () => c.el.classList.add('is-on'));
        t += 150;
      });
      t += 150;
      cats.forEach(c => at(t, () => draw(c.el)));
      if (!wide) at(t, () => draw(rootNode));
      t += 520;
      at(t, () => { rootNode.classList.add('is-on'); if (Number.isFinite(targetValue) && targetValue > 0) countUp(big, targetValue, 800); });
      at(t + 800 + 350, () => { rootNode.classList.add('is-punch'); done = true; });
    }
    function countUp(el, to, ms) {
      const start = performance.now();
      const fmt = n => Math.round(n).toLocaleString('en-US');
      const tick = now => {
        const x = Math.min(1, (now - start) / ms);
        el.textContent = fmt(to * (1 - Math.pow(1 - x, 3)));
        if (x < 1) requestAnimationFrame(tick); else el.textContent = target;
      };
      requestAnimationFrame(tick);
    }
    $('#tree-replay').addEventListener('click', play);
    const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    Promise.race([fontsReady, new Promise(r => setTimeout(r, 1200))]).then(play);
    let lastW = grid.clientWidth;
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => {
        if (grid.clientWidth === lastW) return;
        lastW = grid.clientWidth;
        if (done) { build(); showAll(); }
      }).observe(grid);
    }
  }

  /* =============================================================== tabs */
  function tabset(list, onSelect) {
    if (!list) return;
    const tabs = $$('[role="tab"]', list);
    const select = (t, focus) => {
      tabs.forEach(x => {
        const on = x === t;
        x.setAttribute('aria-selected', String(on));
        x.tabIndex = on ? 0 : -1;
      });
      onSelect(t);
      if (focus) t.focus();
    };
    tabs.forEach(t => t.addEventListener('click', () => select(t)));
    list.addEventListener('keydown', e => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      let j = null;
      if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = tabs.length - 1;
      if (j === null) return;
      e.preventDefault();
      select(tabs[j], true);
    });
  }

  /* =========================================================== lightbox */
  const lb = $('#lightbox');
  const lbImg = $('#lb-img');
  if (lb && lbImg) {
    $$('[data-zoom]').forEach(b => b.addEventListener('click', () => {
      lbImg.src = b.dataset.zoom;
      lbImg.alt = b.dataset.alt || '';
      if (typeof lb.showModal === 'function') lb.showModal(); else lb.setAttribute('open', '');
    }));
    $('#lb-close').addEventListener('click', () => lb.close());
    lb.addEventListener('click', e => { if (e.target === lb) lb.close(); });
  }

  /* ========================================================= copy text */
  function copyText(button, text, label, restore, target) {
    const done = msg => {
      label.textContent = msg;
      button.classList.add('is-done');
      setTimeout(() => { label.textContent = restore(); button.classList.remove('is-done'); }, 2200);
    };
    const fallback = () => {
      const range = document.createRange();
      range.selectNodeContents(target);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      done('Selected, press Ctrl+C');
    };
    try { navigator.clipboard.writeText(text).then(() => done('Copied'), fallback); } catch (e) { fallback(); }
  }
  const copyBtn = $('#copy-bib');
  if (copyBtn) {
    const bib = $('#bibtex');
    copyBtn.addEventListener('click', () => copyText(copyBtn, bib.textContent, $('span', copyBtn), () => 'Copy BibTeX', bib));
  }
  $$('[data-copy-target]').forEach(button => {
    const target = document.getElementById(button.dataset.copyTarget);
    if (!target) return;
    button.addEventListener('click', () => copyText(button, target.textContent, $('span', button) || button, () => 'Copy', target));
  });
})();
