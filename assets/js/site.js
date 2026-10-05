/* WebsiteBench project page. No dependencies. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ------------------------------------------------------------------ theme */
  const root = document.documentElement;
  const themeBtn = $('#theme-toggle');
  const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : darkMQ.matches);
  const syncThemeLabel = () => themeBtn && themeBtn.setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('wb-theme', next); } catch (e) { /* storage unavailable */ }
      syncThemeLabel();
    });
  }
  if (darkMQ.addEventListener) darkMQ.addEventListener('change', syncThemeLabel);
  syncThemeLabel();

  /* ------------------------------------------------------------- top bar */
  const topbar = $('#topbar');
  const onScroll = () => topbar && topbar.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Phone menu for the section links.
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
  const scrollers = $$('.board-wrap, .rel-wrap, .design-wrap');
  const markScroll = el => el.classList.toggle('can-scroll', el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  scrollers.forEach(el => { markScroll(el); el.addEventListener('scroll', () => markScroll(el), { passive: true }); });
  window.addEventListener('resize', () => scrollers.forEach(markScroll));

  const tocLinks = $$('.toc a');
  if ('IntersectionObserver' in window && tocLinks.length) {
    const spy = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        tocLinks.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + e.target.id));
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    tocLinks.map(a => $(a.getAttribute('href'))).filter(Boolean).forEach(s => spy.observe(s));
    const heroEl = $('#top');
    if (heroEl) {
      new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) tocLinks.forEach(a => a.classList.remove('is-active')); }), { rootMargin: '-40% 0px -55% 0px' }).observe(heroEl);
    }
  }

  /* ============================================================ the demo */
  const SVG = {
    paw: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="16" rx="5.2" ry="4.4"/><circle cx="5.6" cy="10.2" r="2.3"/><circle cx="9.4" cy="6.2" r="2.3"/><circle cx="14.6" cy="6.2" r="2.3"/><circle cx="18.4" cy="10.2" r="2.3"/></svg>',
    cart: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2.5l2.2 10.5h10.3l2-7.5H7"/><circle cx="9.5" cy="19" r="1.5"/><circle cx="16.5" cy="19" r="1.5"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    fwd: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    reload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  };

  const ANIMAL = {
    dog: '<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="16" cy="29" rx="8" ry="15" fill="#7A4A2A" transform="rotate(20 16 29)"/><ellipse cx="48" cy="29" rx="8" ry="15" fill="#7A4A2A" transform="rotate(-20 48 29)"/><circle cx="32" cy="33" r="17" fill="#C98D58"/><ellipse cx="32" cy="41" rx="10" ry="7.5" fill="#F2DCC2"/><circle cx="25.5" cy="30" r="2.5" fill="#23160E"/><circle cx="38.5" cy="30" r="2.5" fill="#23160E"/><ellipse cx="32" cy="37.5" rx="4" ry="2.8" fill="#23160E"/><path d="M28.5 43q3.5 3 7 0" fill="none" stroke="#23160E" stroke-width="1.8" stroke-linecap="round"/></svg>',
    dog2: '<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="16" cy="30" rx="8" ry="14" fill="#B7832F" transform="rotate(24 16 30)"/><ellipse cx="48" cy="30" rx="8" ry="14" fill="#B7832F" transform="rotate(-24 48 30)"/><circle cx="32" cy="33" r="17" fill="#E6B865"/><ellipse cx="32" cy="41" rx="10" ry="7.5" fill="#FBEBCF"/><circle cx="25.5" cy="30" r="2.5" fill="#23160E"/><circle cx="38.5" cy="30" r="2.5" fill="#23160E"/><ellipse cx="32" cy="37.5" rx="4" ry="2.8" fill="#23160E"/><path d="M30 42.5v4a2.5 2.5 0 0 0 5 0v-4" fill="#E27B7B"/></svg>',
    dalm: '<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="16" cy="29" rx="8" ry="15" fill="#1E1E24" transform="rotate(20 16 29)"/><ellipse cx="48" cy="29" rx="8" ry="15" fill="#1E1E24" transform="rotate(-20 48 29)"/><circle cx="32" cy="33" r="17" fill="#FBFBF8" stroke="#D5D5CF"/><circle cx="23" cy="22.5" r="3" fill="#1E1E24"/><circle cx="41.5" cy="21.5" r="2.2" fill="#1E1E24"/><circle cx="44" cy="40" r="2.6" fill="#1E1E24"/><circle cx="20" cy="40" r="2" fill="#1E1E24"/><circle cx="25.5" cy="30" r="2.5" fill="#1E1E24"/><circle cx="38.5" cy="30" r="2.5" fill="#1E1E24"/><ellipse cx="32" cy="37.5" rx="4" ry="2.8" fill="#1E1E24"/></svg>',
    fish: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M44 32L59 19v26z" fill="#E9782F"/><ellipse cx="29" cy="32" rx="20" ry="14" fill="#F59A45"/><path d="M22 19q7-7 14 0" fill="#E9782F"/><path d="M24 45q6 5 11 0" fill="#E9782F"/><circle cx="18" cy="29" r="3" fill="#fff"/><circle cx="18.5" cy="29.5" r="1.8" fill="#1E2A38"/><path d="M31 21q5 11 0 22" fill="none" stroke="#E07024" stroke-width="2"/></svg>',
    bird: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 38q-8 8 0 12l10-6z" fill="#2F6FC4"/><circle cx="31" cy="33" r="17" fill="#4C8DDB"/><ellipse cx="31" cy="40" rx="10.5" ry="9" fill="#F7D774"/><path d="M46 29l10 3.5-10 4z" fill="#F2A33A"/><circle cx="38" cy="27" r="3" fill="#fff"/><circle cx="38.6" cy="27.4" r="1.8" fill="#1E2A38"/><path d="M20 34q2 9 11 8" fill="none" stroke="#2F6FC4" stroke-width="3" stroke-linecap="round"/><path d="M27 16q3-6 7-2" fill="none" stroke="#2F6FC4" stroke-width="2.6" stroke-linecap="round"/></svg>',
    ham: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="19" cy="19" r="6.5" fill="#D39A62"/><circle cx="45" cy="19" r="6.5" fill="#D39A62"/><circle cx="19" cy="19" r="3.4" fill="#F2B3AC"/><circle cx="45" cy="19" r="3.4" fill="#F2B3AC"/><ellipse cx="32" cy="36" rx="21" ry="18" fill="#E6B47C"/><ellipse cx="32" cy="43" rx="12.5" ry="9.5" fill="#FBEBD6"/><circle cx="24.5" cy="32" r="2.5" fill="#23160E"/><circle cx="39.5" cy="32" r="2.5" fill="#23160E"/><ellipse cx="32" cy="37.5" rx="2.6" ry="1.9" fill="#E07B72"/><circle cx="18" cy="39" r="3.2" fill="#F2B3AC" opacity=".75"/><circle cx="46" cy="39" r="3.2" fill="#F2B3AC" opacity=".75"/></svg>',
    cat: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 13l12 11-13 6z" fill="#8C95A3"/><path d="M50 13L38 24l13 6z" fill="#8C95A3"/><circle cx="32" cy="35" r="18" fill="#A9B1BD"/><path d="M24 31q2.5-3 5 0M35 31q2.5-3 5 0" fill="none" stroke="#1E2430" stroke-width="2.2" stroke-linecap="round"/><path d="M29.5 37h5l-2.5 3z" fill="#E28A8A"/><path d="M14 38l9 1M14 43l9-1M50 38l-9 1M50 43l-9-1" stroke="#6E7785" stroke-width="1.4" stroke-linecap="round"/></svg>',
  };

  const TILES = [
    { key: 'dog', label: 'Dogs', bg: '#FDEBD8' },
    { key: 'fish', label: 'Fish', bg: '#DDF0FA' },
    { key: 'bird', label: 'Birds', bg: '#FFF3CF' },
    { key: 'ham', label: 'Small pets', bg: '#F1E6FA' },
  ];
  // The candidate's catalogue points three categories at unrelated images (after the PetSmart case).
  const CAND_IMG = { dog: 'dog', fish: 'dog', bird: 'dog2', ham: 'dalm' };
  const TAB_LABEL = { all: 'All', deals: 'Deals', new: 'New' };
  const PRODUCTS = {
    all: [
      { n: 'Rope chew toy', p: '$6.99', icon: 'dog', bg: '#FDEBD8' },
      { n: 'Aquarium starter kit', p: '$49.99', icon: 'fish', bg: '#DDF0FA' },
      { n: 'Cat tunnel', p: '$17.49', icon: 'cat', bg: '#ECEFF4' },
    ],
    deals: [
      { n: 'Aquarium starter kit', p: '$39.99', was: '$49.99', icon: 'fish', bg: '#DDF0FA' },
      { n: 'Wild bird seed, 5 lb', p: '$11.99', was: '$14.99', icon: 'bird', bg: '#FFF3CF' },
      { n: 'Quiet hamster wheel', p: '$15.99', was: '$19.99', icon: 'ham', bg: '#F1E6FA' },
    ],
    new: [
      { n: 'Smart pet feeder', p: '$89.00', icon: 'cat', bg: '#ECEFF4' },
      { n: 'Rope bird swing', p: '$7.25', icon: 'bird', bg: '#FFF3CF' },
      { n: 'Dental chews, 30 ct', p: '$12.50', icon: 'dog', bg: '#FDEBD8' },
    ],
  };

  const BUGS = {
    tiles: { n: 1, label: 'wrong images', title: 'Correct labels, wrong images', body: 'In this mock, the rebuild points Fish, Birds and Small pets at dog photos. One visual checkpoint scores 0.41, under the 0.75 threshold, so the whole test earns zero.', cite: 'The paper’s PetSmart run shows the same defect, Appendix I.2' },
    tabs: { n: 2, label: 'tab ignored', title: 'URL query ignored', body: 'Clicking the tabs works, but opening /shop?tab=deals always shows All. The rebuild never reads the query string.', cite: 'The paper’s AMC Theatres run shows the same defect, Appendix I.2' },
    book: { n: 3, label: '404', title: 'Missing route', body: 'The booking button leads to a route the rebuild never implemented, so the journey ends in a 404 before any confirmation.', cite: 'In the paper, a Fandango rebuild returned 404 for seat selection, Appendix I.3' },
    cart: { n: 4, label: 'lost on restart', title: 'State lost on restart', body: 'The cart lives only in memory. Restart the servers below: the reference keeps its items, the rebuild comes back empty.', cite: 'In the paper, a Tripadvisor rebuild failed its review checks, including after a restart, Appendix I.3' },
  };

  const TESTS = [
    { id: 't-header', ok: true, group: 'Browser L1', text: 'Header and navigation match the reference', detail: 'similarity 0.93 ≥ 0.75', target: 'header' },
    { id: 't-tiles', ok: false, group: 'Browser L1', text: 'Category tiles match the reference', detail: 'similarity 0.41 < 0.75', target: 'tiles', bug: 'tiles' },
    { id: 't-tab', ok: false, group: 'Request', text: 'GET /shop?tab=deals opens the Deals tab', detail: 'opened All', target: 'tabs', bug: 'tabs' },
    { id: 't-book', ok: false, group: 'Browser L2', text: 'Book grooming, then see the confirmation', detail: '404 /grooming/book', target: 'book', bug: 'book' },
    { id: 't-restart', ok: false, group: 'Browser L3', text: 'Cart items survive a server restart', detail: '2 items became 0', target: 'cart', bug: 'cart' },
    { id: 't-health', ok: true, group: 'System', text: 'Builds offline and answers /healthz', detail: '{"status":"ok"}', target: null },
  ];

  const stage = $('#stage');
  if (stage) initDemo();

  function initDemo() {
    const layers = { reference: $('.layer.is-ref', stage), candidate: $('.layer.is-cand', stage) };
    const divider = $('#divider');
    const ghost = $('#ghost');
    const tip = $('#tip');
    const titleIn = $('#title');
    const titleCand = $('.title-cand');
    const titleRef = $('.title-ref');

    const fresh = () => ({
      reference: { tab: 'deals', cart: 2, page: 'shop', booked: false, restarting: false },
      candidate: { tab: 'all', cart: 2, page: 'shop', booked: false, restarting: false },
    });
    let S = fresh();

    const bug = key => `<span class="bug at-${key}" data-bug="${key}"><i class="bug-n">${BUGS[key].n}</i>${esc(BUGS[key].label)}</span>`;

    function tileHTML(t, cand) {
      const img = cand ? CAND_IMG[t.key] : t.key;
      const wrong = cand && img !== t.key;
      return `<div class="s-tile" style="--tile:${t.bg}">${wrong ? '<span class="bug-box" style="inset:-3px"></span>' : ''}${ANIMAL[img]}<span>${t.label}</span></div>`;
    }

    function productsHTML(tab, cand) {
      const ti = cand ? ' tabindex="-1"' : '';
      return PRODUCTS[tab].map(p => `<div class="s-card"><span class="s-thumb" style="background:${p.bg}">${ANIMAL[p.icon]}</span><span><span class="s-name">${esc(p.n)}</span><span class="s-price${p.was ? ' deal' : ''}">${p.p}${p.was ? `<s>${p.was}</s>` : ''}</span></span><button class="s-add" type="button" data-act="add" aria-label="Add ${esc(p.n)} to cart"${ti}>+</button></div>`).join('');
    }

    function groomHTML(st, cand) {
      if (!cand && st.booked) {
        return '<div class="s-booked" style="display:flex;align-items:center;gap:12px"><span class="s-ok">' + SVG.check + '</span><p><b>Booked for Saturday, 10:00.</b> <span>It is listed under My appointments.</span></p></div>';
      }
      const ti = cand ? ' tabindex="-1"' : '';
      return `<p><b>Grooming this Saturday.</b> <span>10:00 and 14:30 are open.</span></p><span style="position:relative;flex:none"><button class="s-book" type="button" data-act="book" data-t="book"${ti}>Book grooming</button>${cand ? bug('book') : ''}</span>`;
    }

    function siteHTML(impl) {
      const cand = impl === 'candidate';
      const ti = cand ? ' tabindex="-1"' : '';
      const host = cand ? 'candidate.local' : 'reference.local';
      return `
        <div class="chrome"><span class="dots"><i></i><i></i><i></i></span><span class="navs">${SVG.back}${SVG.fwd}</span><span class="url"><span class="host">${host}</span><span class="path" data-path>/shop?tab=deals</span></span></div>
        <div class="site">
          <header class="s-head" data-t="header">
            <span class="s-logo">${SVG.paw}petshop</span>
            <span class="s-nav"><span>Dogs</span><span>Cats</span><span>Fish</span><span>Birds</span><span>Grooming</span></span>
            <span class="s-cart" data-t="cart" role="img" aria-label="Cart">${SVG.cart}<b data-cart>2</b>${cand ? bug('cart') : ''}</span>
          </header>
          <div class="s-page" data-page="shop">
            <div class="s-main">
              <section class="s-cats">
                <p class="s-h">Shop by pet</p>
                <div class="s-tiles" data-t="tiles">${TILES.map(t => tileHTML(t, cand)).join('')}</div>
                ${cand ? bug('tiles') : ''}
              </section>
              <section class="s-shop">
                <div class="s-shop-head">
                  <p class="s-h">This week</p>
                  <div class="s-tabs" role="tablist" aria-label="Product list" data-t="tabs">${Object.keys(TAB_LABEL).map(k => `<button type="button" role="tab" data-act="tab" data-arg="${k}"${ti}>${TAB_LABEL[k]}</button>`).join('')}${cand ? '<span class="bug-box" style="inset:-5px;border-radius:12px"></span>' + bug('tabs') : ''}</div>
                </div>
                <div class="s-products" data-products></div>
              </section>
              <section class="s-groom" data-groom></section>
            </div>
          </div>
          ${cand ? `<div class="s-404" data-page="404" hidden><span class="code404">404</span><p>Not Found</p><p class="p404">POST /grooming/book</p><button type="button" data-act="back" tabindex="-1">Back to the shop</button></div>` : ''}
          <div class="s-restart" data-restarting hidden><span class="spin"></span>Restarting the server</div>
        </div>`;
    }

    function update(impl) {
      const L = layers[impl];
      const st = S[impl];
      const cand = impl === 'candidate';
      $$('.s-tabs [data-arg]', L).forEach(b => b.setAttribute('aria-selected', String(b.dataset.arg === st.tab)));
      const prods = $('[data-products]', L);
      if (prods.dataset.tab !== st.tab) { prods.innerHTML = productsHTML(st.tab, cand); prods.dataset.tab = st.tab; }
      const badge = $('[data-cart]', L);
      if (badge.textContent !== String(st.cart)) {
        badge.textContent = st.cart;
        if (!reduceMotion) { badge.classList.add('bump'); setTimeout(() => badge.classList.remove('bump'), 180); }
      }
      badge.classList.toggle('is-zero', st.cart === 0);
      const groom = $('[data-groom]', L);
      const gk = st.booked && !cand ? 'booked' : 'open';
      if (groom.dataset.k !== gk) { groom.innerHTML = groomHTML(st, cand); groom.dataset.k = gk; groom.classList.toggle('is-booked', gk === 'booked'); }
      const shop = $('[data-page="shop"]', L);
      const nf = $('[data-page="404"]', L);
      shop.hidden = st.page !== 'shop';
      if (nf) nf.hidden = st.page !== '404';
      $('[data-path]', L).textContent = st.page === '404' ? '/grooming/book' : '/shop?tab=deals';
      $('[data-restarting]', L).hidden = !st.restarting;
      if (stage.classList.contains('show-bugs')) $$('.bug', L).forEach(b => b.classList.add('is-in'));
    }

    function renderAll() {
      Object.keys(layers).forEach(impl => { layers[impl].innerHTML = siteHTML(impl); update(impl); });
    }
    const updateAll = () => { update('reference'); update('candidate'); };

    // One user action is replayed on both sites, as a hidden test would do.
    function act(type, arg) {
      const r = S.reference, c = S.candidate;
      if (r.restarting) return;
      if (type === 'tab') { r.tab = arg; c.tab = arg; }
      else if (type === 'add') { r.cart += 1; c.cart += 1; }
      else if (type === 'book') { r.booked = true; c.page = '404'; flash('t-book'); }
      else if (type === 'back') { c.page = 'shop'; }
      updateAll();
    }

    function restart() {
      if (S.reference.restarting) return;
      S.reference.restarting = S.candidate.restarting = true;
      updateAll();
      setTimeout(() => {
        Object.assign(S.reference, { restarting: false, page: 'shop', tab: 'deals' });
        Object.assign(S.candidate, { restarting: false, page: 'shop', tab: 'all', cart: 0 });
        updateAll();
        flash('t-restart');
      }, reduceMotion ? 60 : 950);
    }

    stage.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (b && stage.contains(b)) { e.preventDefault(); hideTip(); act(b.dataset.act, b.dataset.arg); return; }
      const g = e.target.closest('.bug');
      if (g) showTip(g); else hideTip();
    });
    // Touch screens never send pointerout, so any tap outside a marker closes its tooltip.
    document.addEventListener('pointerdown', e => { if (!tip.hidden && !e.target.closest('.bug')) hideTip(); });
    $('#restart').addEventListener('click', restart);
    $('#reset').addEventListener('click', () => { S = fresh(); updateAll(); setSplit(restSplit()); hideTip(); });

    /* ---------- divider ---------- */
    let split = stage.clientWidth < 600 ? 44 : 62;
    function setSplit(v) {
      split = Math.max(0, Math.min(100, v));
      stage.style.setProperty('--split', split + '%');
      divider.setAttribute('aria-valuenow', String(Math.round(split)));
      divider.setAttribute('aria-valuetext', Math.round(split) + ' percent reference');
      syncTitle();
    }

    // Match the fallback layer's width and baseline to the real title, so the seam lines up.
    function fitTitle() {
      if (!titleCand || !titleRef) return;
      titleCand.style.letterSpacing = '0px';
      titleCand.style.transform = '';
      const rw = titleRef.getBoundingClientRect().width;
      const cw = titleCand.getBoundingClientRect().width;
      const n = titleCand.textContent.length || 1;
      titleCand.style.letterSpacing = ((rw - cw) / n) + 'px';
      const probe = () => { const p = document.createElement('span'); p.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline'; return p; };
      const pr = probe(), pc = probe();
      titleRef.appendChild(pr);
      titleCand.appendChild(pc);
      const dy = pr.getBoundingClientRect().top - pc.getBoundingClientRect().top;
      pr.remove();
      pc.remove();
      titleCand.style.transform = `translateY(${dy}px)`;
    }

    const heroEl = $('.hero') || stage;
    function syncTitle() {
      if (!titleIn) return;
      const sr = heroEl.getBoundingClientRect();
      const tr = titleIn.getBoundingClientRect();
      const x = sr.left + sr.width * split / 100 - tr.left;
      titleIn.style.setProperty('--split-px', x + 'px');
      const inside = x > 6 && x < tr.width - 6;
      titleIn.classList.toggle('no-split', !inside);
      titleIn.classList.toggle('is-split', inside);
      const tag = $('.title-tag', titleIn);
      if (tag) {
        const room = document.documentElement.clientWidth - (tr.left + x) - 16;
        titleIn.classList.toggle('tag-left', tag.offsetWidth + 12 > room);
      }
    }
    // Where the divider rests: further left on narrow screens so the rebuild's defects stay in view.
    const restSplit = () => (stage.clientWidth < 600 ? 44 : 62);

    divider.addEventListener('pointerdown', e => {
      e.preventDefault();
      stopIntro();
      divider.setPointerCapture(e.pointerId);
      divider.classList.add('is-dragging');
      hideTip();
      const move = ev => { const r = stage.getBoundingClientRect(); setSplit((ev.clientX - r.left) / r.width * 100); };
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
      setSplit(v);
    });

    /* ---------- defect tooltips and the tests panel ---------- */
    function showTip(el) {
      const key = el.dataset.bug;
      const d = BUGS[key];
      if (!d) return;
      tip.innerHTML = `<b>${esc(d.title)}</b>${esc(d.body)}<small>${esc(d.cite)}</small>`;
      tip.hidden = false;
      const sr = stage.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let left = r.left - sr.left + r.width / 2 - tw / 2;
      left = Math.max(10, Math.min(sr.width - tw - 10, left));
      let top = r.bottom - sr.top + 10;
      if (top + th > sr.height - 8) top = r.top - sr.top - th - 10;
      tip.style.left = left + 'px';
      tip.style.top = Math.max(8, top) + 'px';
      hot(TESTS.find(t => t.bug === key), true);
    }
    function hideTip() { tip.hidden = true; hot(null); }

    stage.addEventListener('pointerover', e => { const g = e.target.closest('.bug'); if (g) showTip(g); });
    stage.addEventListener('pointerout', e => { const g = e.target.closest('.bug'); if (g && !g.contains(e.relatedTarget)) hideTip(); });

    const list = $('#dt-list');
    list.innerHTML = TESTS.map(t => `<li class="dt-row ${t.ok ? 'ok' : 'bad'}" data-test="${t.id}"><span class="dt-ico" aria-hidden="true">${t.ok ? SVG.check : SVG.x}</span><span class="dt-group">${esc(t.group)}</span><span class="dt-text"><span class="sr-only">${t.ok ? 'Passed. ' : 'Failed. '}</span>${t.bug ? `<i class="dt-n" aria-hidden="true">${BUGS[t.bug].n}</i>` : ''}${esc(t.text)}</span><span class="dt-detail">${esc(t.detail)}</span></li>`).join('');

    let hotTest = null;
    function hot(test, fromBug, neutral) {
      if (hotTest) {
        $$('.dt-row.is-hot', list).forEach(r => r.classList.remove('is-hot'));
        $$('.hot-ring, .hot-ring-bad', stage).forEach(el => el.classList.remove('hot-ring', 'hot-ring-bad'));
        $$('.bug.is-hot', stage).forEach(el => el.classList.remove('is-hot'));
      }
      hotTest = test || null;
      if (!test) return;
      const row = $(`[data-test="${test.id}"]`, list);
      if (row) row.classList.add('is-hot');
      if (test.target) {
        const refEl = $(`[data-t="${test.target}"]`, layers.reference);
        const candEl = $(`[data-t="${test.target}"]`, layers.candidate);
        if (refEl) refEl.classList.add('hot-ring');
        if (candEl) candEl.classList.add(test.ok || neutral ? 'hot-ring' : 'hot-ring-bad');
      }
      if (test.bug && !fromBug && !neutral) { const b = $(`.bug[data-bug="${test.bug}"]`, layers.candidate); if (b) b.classList.add('is-hot'); }
    }
    list.addEventListener('pointerover', e => { const row = e.target.closest('.dt-row'); if (row) hot(TESTS.find(t => t.id === row.dataset.test)); });
    list.addEventListener('pointerleave', () => hot(null));

    // Replays the evaluator: each test runs in turn and lights up the region it checks on both sites.
    const score = $('#dt-score');
    const runBtn = $('#run-tests');
    let running = false;
    function runTests() {
      if (running) return;
      running = true;
      runBtn.disabled = true;
      hideTip();
      const rows = $$('.dt-row', list);
      let passed = 0;
      const setScore = n => { score.innerHTML = `<b>${n}</b> of ${TESTS.length} hidden tests passed`; };
      setScore(0);
      rows.forEach(r => { r.classList.remove('is-done'); r.classList.add('is-pending'); });
      const step = reduceMotion ? 0 : 520;
      TESTS.forEach((t, i) => {
        const row = rows[i];
        setTimeout(() => {
          row.classList.remove('is-pending');
          row.classList.add('is-running');
          hot(t, false, true);
        }, i * step);
        setTimeout(() => {
          row.classList.remove('is-running');
          row.classList.add('is-done');
          hot(t);
          if (t.ok) passed += 1;
          setScore(passed);
          if (i === TESTS.length - 1) {
            setTimeout(() => { hot(null); running = false; runBtn.disabled = false; }, reduceMotion ? 0 : 700);
          }
        }, i * step + (reduceMotion ? 0 : 380));
      });
    }
    let userRan = false;
    runBtn.addEventListener('click', () => { userRan = true; runTests(); });
    // Play the run once, the first time the tests panel is in view, so the score is earned on screen.
    if (!reduceMotion && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => {
        if (!es.some(e => e.isIntersecting)) return;
        io.disconnect();
        if (!userRan) setTimeout(runTests, 400);
      }, { threshold: 0.6 });
      io.observe(list);
    }

    function flash(id) {
      const row = $(`[data-test="${id}"]`, list);
      if (!row || reduceMotion) return;
      row.animate([{ background: 'var(--fail-soft)' }, { background: 'transparent' }], { duration: 1400, easing: 'ease-out' });
    }

    /* ---------- intro: a cursor drags the divider in once ---------- */
    let raf = null;
    function stopIntro() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      ghost.style.opacity = '0';
      stage.classList.add('show-bugs');
    }
    function intro() {
      const to = restSplit();
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
        ghost.style.left = v + '%';
        ghost.style.opacity = el < delay - 350 ? '0' : el < delay ? String((el - (delay - 350)) / 350) : (t < 1 ? '1' : '0');
        if (t < 1) { raf = requestAnimationFrame(tick); }
        else { raf = null; stage.classList.add('show-bugs'); }
      };
      raf = requestAnimationFrame(tick);
    }

    renderAll();
    const ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(() => { fitTitle(); setSplit(split); });
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); ready.then(intro); } }, { threshold: 0.35 });
      io.observe(stage);
    } else ready.then(intro);
    setSplit(split);
    let rt = null;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { fitTitle(); syncTitle(); hideTip(); }, 80); });
  }

  /* ======================================================= failure tree */
  // Nine observed defects converge into the three failure modes, which converge into WebsiteBench.
  const tree = $('#tree');
  if (tree) {
    const grid = $('#tree-grid', tree);
    const svg = $('#tree-lines', tree);
    const root = $('#root-node', grid);
    const big = $('.root-big', root);
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
      const r = rel(root, gr);
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
        add(root, `M${x} ${first.cy} V${r.cy} H${r.x} ${stubs}`, 'to-root');
      }
    }
    const nodes = () => $$('.leaf, .cat-node, .root-node', grid);
    function showAll() {
      nodes().forEach(el => el.classList.add('is-on'));
      root.classList.add('is-punch');
      big.textContent = '2,107';
      $$('path', svg).forEach(p => { p.style.transition = 'none'; p.style.strokeDashoffset = '0'; });
      void svg.offsetWidth;
      $$('path', svg).forEach(p => { p.style.transition = ''; });
    }
    function arm() {
      tree.classList.add('is-armed');
      nodes().forEach(el => el.classList.remove('is-on'));
      root.classList.remove('is-punch');
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
      if (!wide) at(t, () => draw(root));
      t += 520;
      at(t, () => { root.classList.add('is-on'); countUp(big, 2107, 800); });
      at(t + 800 + 350, () => { root.classList.add('is-punch'); done = true; });
    }
    function countUp(el, to, ms) {
      const start = performance.now();
      const fmt = n => Math.round(n).toLocaleString('en-US');
      const tick = now => {
        const x = Math.min(1, (now - start) / ms);
        el.textContent = fmt(to * (1 - Math.pow(1 - x, 3)));
        if (x < 1) requestAnimationFrame(tick); else el.textContent = fmt(to);
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

  /* ======================================================== leaderboard */
  const MODELS = [
    { id: 'opus55', name: 'Claude Opus 5.5', short: 'Opus 5.5', org: 'Anthropic', group: 'frontier', overall: 22.5, request: 63.5, browser: 18.0, system: 34.8, cost: 261.1, costStr: '$261.1', tokens: 930.5, turns: 2107.1 },
    { id: 'opus5', name: 'Claude Opus 5', short: 'Opus 5', org: 'Anthropic', group: 'frontier', overall: 18.7, request: 43.1, browser: 14.0, system: 33.2, cost: 221.7, costStr: '$221.7', tokens: 429.2, turns: 980.5 },
    { id: 'sol', name: 'GPT 5.6 Sol', short: 'GPT 5.6 Sol', org: 'OpenAI', group: 'frontier', overall: 15.6, request: 38.2, browser: 10.1, system: 37.4, cost: 115, costStr: '$115', tokens: 20.5, turns: 212.3 },
    { id: 'luna', name: 'GPT 5.6 Luna', short: 'GPT 5.6 Luna', org: 'OpenAI', group: 'frontier', overall: 13.2, request: 29.8, browser: 8.9, system: 30.0, cost: 3.8, costStr: '$3.8', tokens: 14.3, turns: 174.0 },
    { id: 'grok', name: 'Grok 4.6', short: 'Grok 4.6', org: 'xAI', group: 'frontier', overall: 11.6, request: 37.8, browser: 7.8, system: 29.6, cost: 76.9, costStr: '$76.9', tokens: 38.0, turns: 403.9 },
    { id: 'glm', name: 'GLM 5.3 Flash', short: 'GLM 5.3 Flash', org: 'Z.ai', group: 'open', overall: 9.7, request: 20.4, browser: 6.6, system: 23.1, cost: 2.4, costStr: '$2.4', tokens: 37.0, turns: 318.8 },
    { id: 'kimi', name: 'Kimi K3', short: 'Kimi K3', org: 'Kimi', group: 'open', overall: 8.9, request: 22.6, browser: 4.7, system: 27.1, cost: 37.2, costStr: '$37.2', tokens: 91.6, turns: 604.3 },
    { id: 'deepseek', name: 'DeepSeek V4.1 Flash', short: 'DeepSeek V4.1 Flash', org: 'DeepSeek', group: 'open', overall: 8.5, request: 23.7, browser: 4.2, system: 26.5, cost: 4.6, costStr: '$4.6', tokens: 167.8, turns: 572.6 },
    { id: 'qwen', name: 'Qwen 3.8 Max', short: 'Qwen 3.8 Max', org: 'Qwen Team', group: 'open', overall: 5.7, request: 22.6, browser: 1.8, system: 20.2, cost: 9.5, costStr: '$9.5', tokens: 38.3, turns: 252.1 },
  ];
  const SCORE_KEYS = ['overall', 'request', 'browser', 'system'];
  const best = {};
  SCORE_KEYS.forEach(k => { best[k] = Math.max(...MODELS.map(m => m[k])); });

  const boardBody = $('#board-body');
  if (boardBody) {
    let sortKey = 'overall';
    let sortDir = 'desc';
    const fmtTurns = v => v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const renderBoard = () => {
      const rows = [...MODELS].sort((a, b) => (sortDir === 'desc' ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]) || b.overall - a.overall);
      boardBody.innerHTML = rows.map((m, i) => {
        const g = m.group === 'open' ? 'open' : 'frontier';
        const cell = k => `<td${m[k] === best[k] ? ' class="best"' : ''}>${m[k].toFixed(1)}</td>`;
        return `<tr data-model="${m.id}">
          <td class="rank">${i + 1}</td>
          <td class="model"><span class="m-name"><i class="dot g-${g}" aria-hidden="true"></i>${esc(m.name)}</span><span class="m-org">${esc(m.org)}<span class="sr-only">, ${g === 'open' ? 'open-source' : 'frontier'} model</span></span><span class="m-sub" aria-hidden="true"><span><em>R</em>${m.request.toFixed(1)}</span><span><em>B</em>${m.browser.toFixed(1)}</span><span><em>S</em>${m.system.toFixed(1)}</span></span></td>
          <td class="col-overall"><span class="ov"><span class="bar" aria-hidden="true"><i class="${g}" style="width:${m.overall}%"></i></span><b${m.overall === best.overall ? ' class="best"' : ''}>${m.overall.toFixed(1)}</b></span></td>
          ${cell('request')}${cell('browser')}${cell('system')}
          <td>${m.costStr}</td><td>${m.tokens.toFixed(1)}M</td><td>${fmtTurns(m.turns)}</td>
        </tr>`;
      }).join('');
      // A heavier rule between frontier and open-source models when a score sort separates them cleanly.
      const firstOpen = rows.findIndex(m => m.group === 'open');
      const clean = SCORE_KEYS.includes(sortKey) && sortDir === 'desc' && rows.slice(firstOpen).every(m => m.group === 'open');
      if (clean && firstOpen > 0) boardBody.children[firstOpen].classList.add('group-break');
      $$('#board thead th').forEach(th => {
        const b = $('button', th);
        if (!b) return;
        if (b.dataset.sort === sortKey) th.setAttribute('aria-sort', sortDir === 'desc' ? 'descending' : 'ascending');
        else th.removeAttribute('aria-sort');
      });
    };
    $$('#board thead button').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.sort;
      if (k === sortKey) sortDir = sortDir === 'desc' ? 'asc' : 'desc';
      else { sortKey = k; sortDir = SCORE_KEYS.includes(k) ? 'desc' : 'asc'; }
      renderBoard();
    }));
    renderBoard();
    /* site-only:start (CSV export; the preview build drops this block) */
    const csvBtn = $('#board-csv');
    if (csvBtn) csvBtn.addEventListener('click', () => {
      const head = ['model', 'organization', 'group', 'overall_pct', 'request_pct', 'browser_pct', 'system_pct', 'cost_usd_per_task', 'tokens_m_per_task', 'turns_per_task'];
      const rows = MODELS.map(m => [m.name, m.org, m.group === 'open' ? 'open-source' : 'frontier', m.overall, m.request, m.browser, m.system, m.cost, m.tokens, m.turns]);
      const csv = [head, ...rows].map(r => r.map(v => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\n') + '\n';
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'websitebench-leaderboard.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    /* site-only:end */
  }

  /* ============================================================ scatter */
  const METRICS = {
    cost: { dom: [1.6, 420], ticks: [2, 5, 10, 20, 50, 100, 200], ticksNarrow: [2, 10, 50, 200], fmt: v => '$' + v, title: 'Mean cost per task, USD (log scale)', val: m => m.costStr },
    tokens: { dom: [9, 1500], ticks: [10, 20, 50, 100, 200, 500, 1000], ticksNarrow: [10, 100, 1000], fmt: v => (v >= 1000 ? (v / 1000) + 'B' : v + 'M'), title: 'Mean tokens per task (log scale)', val: m => m.tokens.toFixed(1) + 'M' },
    turns: { dom: [140, 3000], ticks: [200, 500, 1000, 2000], fmt: v => v.toLocaleString('en-US'), title: 'Mean turns per task (log scale)', val: m => m.turns.toLocaleString('en-US', { minimumFractionDigits: 1 }) },
  };
  const scatterBox = $('#scatter');
  let metric = 'cost';
  let scatterW = 0;
  const measureCtx = document.createElement('canvas').getContext('2d');
  const textW = (s, size) => { measureCtx.font = `600 ${size}px "Schibsted Grotesk", Helvetica, Arial, sans-serif`; return measureCtx.measureText(s).width; };

  function renderScatter(animate) {
    if (!scatterBox) return;
    const W = scatterBox.clientWidth;
    if (!W) return;
    const narrow = W < 600;
    const H = Math.round(Math.max(330, Math.min(460, W * 0.52)));
    const mg = { l: narrow ? 34 : 56, r: narrow ? 14 : 28, t: 18, b: 56 };
    const iw = W - mg.l - mg.r, ih = H - mg.t - mg.b;
    const M = METRICS[metric];
    const l0 = Math.log10(M.dom[0]), l1 = Math.log10(M.dom[1]);
    const X = v => mg.l + (Math.log10(v) - l0) / (l1 - l0) * iw;
    const Y = v => mg.t + ih - (v / 25) * ih;
    const fontSize = narrow ? 11.5 : 12.5;
    const rebuild = !animate || W !== scatterW || !$('svg', scatterBox);
    scatterW = W;

    const grid = [0, 5, 10, 15, 20, 25].map(v => `<line x1="${mg.l}" x2="${W - mg.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="axis-t" x="${mg.l - 10}" y="${Y(v) + 4}" text-anchor="end">${v}%</text>`).join('');
    const ticks = narrow ? (M.ticksNarrow || M.ticks) : M.ticks;
    const xt = ticks.map(v => `<line x1="${X(v)}" x2="${X(v)}" y1="${mg.t}" y2="${mg.t + ih}" stroke-dasharray="2 4"/><text class="axis-t" x="${X(v)}" y="${mg.t + ih + 20}" text-anchor="middle">${M.fmt(v)}</text>`).join('');
    const axes = `<g class="grid">${grid}${xt}</g><text class="axis-title" x="${mg.l + iw / 2}" y="${H - 10}" text-anchor="middle">${M.title}</text>${narrow ? '' : `<text class="axis-title" transform="translate(14 ${mg.t + ih / 2}) rotate(-90)" text-anchor="middle">Overall score</text>`}`;

    const pts = MODELS.map(m => ({ m, x: X(m[metric]), y: Y(m.overall), label: narrow ? m.short.replace('Claude ', '').replace(' Flash', '') : m.name }));
    // Efficiency frontier: models that no cheaper model (on this axis) out-scores.
    let bestSoFar = -1;
    const frontier = [...pts].sort((a, b) => a.m[metric] - b.m[metric]).filter(p => (p.m.overall > bestSoFar ? ((bestSoFar = p.m.overall), true) : false));
    const frontierD = frontier.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    // Greedy label placement that avoids other labels and points.
    const boxes = pts.map(p => ({ x: p.x - 8, y: p.y - 8, w: 16, h: 16 }));
    const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const order = [...pts].sort((a, b) => b.m.overall - a.m.overall);
    const placed = [];
    // Cost view: a bracket that says what the eye should compare. Its lines and text are
    // reserved before labels are placed, so no label can touch them.
    const luna = pts.find(p => p.m.id === 'luna'), grok = pts.find(p => p.m.id === 'grok');
    const showNote = metric === 'cost' && !narrow;
    const noteGeo = showNote ? (() => {
      const yb = Math.max(luna.y, grok.y) + 22;
      const text = `${Math.round(grok.m.cost / luna.m.cost)}× the cost, lower score`;
      const tw = textW(text, 13);
      const mid = (luna.x + grok.x) / 2;
      placed.push({ x: luna.x - 4, y: luna.y + 13, w: 8, h: yb - luna.y - 9 });
      placed.push({ x: luna.x - 4, y: yb - 4, w: grok.x - luna.x + 8, h: 8 });
      placed.push({ x: mid - tw / 2 - 4, y: yb + 3, w: tw + 8, h: 18 });
      return { yb, text, mid };
    })() : null;
    order.forEach(p => {
      const w = textW(p.label, fontSize), h = fontSize + 4;
      const opts = [
        { dx: 13, dy: 4, a: 'start', bx: p.x + 12, by: p.y - h / 2 - 1 },
        { dx: -13, dy: 4, a: 'end', bx: p.x - 12 - w, by: p.y - h / 2 - 1 },
        { dx: 0, dy: -13, a: 'middle', bx: p.x - w / 2, by: p.y - 13 - h + 3 },
        { dx: 0, dy: 22, a: 'middle', bx: p.x - w / 2, by: p.y + 9 },
        { dx: 11, dy: -9, a: 'start', bx: p.x + 10, by: p.y - 9 - h + 3 },
        { dx: 11, dy: 17, a: 'start', bx: p.x + 10, by: p.y + 4 },
        { dx: -11, dy: -9, a: 'end', bx: p.x - 10 - w, by: p.y - 9 - h + 3 },
        { dx: -11, dy: 17, a: 'end', bx: p.x - 10 - w, by: p.y + 4 },
      ];
      p.lab = null;
      for (const o of opts) {
        const r = { x: o.bx, y: o.by, w, h };
        if (r.x < mg.l + 2 || r.x + r.w > W - 2 || r.y < 0 || r.y + r.h > mg.t + ih + 4) continue;
        if (placed.some(q => hit(q, r))) continue;
        if (boxes.some((q, i) => pts[i] !== p && hit(q, r))) continue;
        placed.push(r);
        p.lab = o;
        break;
      }
    });

    if (rebuild) {
      // Labels live in their own layer, after the points, so no label shares a group with a filled mark.
      scatterBox.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Scatter plot of overall score against ${metric}."><g class="axes">${axes}</g><path class="frontier" d="${frontierD}"/><g class="pts">${pts.map(p => `<g class="pt g-${p.m.group}" data-id="${p.m.id}" style="transform:translate(${p.x}px,${p.y}px)"><circle class="hit" r="16"/><circle class="mark" r="7"/></g>`).join('')}</g><g class="labs">${pts.map(p => `<text class="lab" data-id="${p.m.id}" style="transform:translate(${p.x}px,${p.y}px)"></text>`).join('')}</g></svg><div class="chart-tip" hidden></div>`;
      if (!animate) $$('.pt, .lab', scatterBox).forEach(g => { g.style.transition = 'none'; requestAnimationFrame(() => { g.style.transition = ''; }); });
    } else {
      $('.axes', scatterBox).innerHTML = axes;
      $('svg', scatterBox).setAttribute('aria-label', `Scatter plot of overall score against ${metric}.`);
      const fp = $('.frontier', scatterBox);
      fp.classList.add('is-moving');
      clearTimeout(fp._t);
      fp._t = setTimeout(() => { fp.setAttribute('d', frontierD); fp.classList.remove('is-moving'); }, reduceMotion ? 0 : 450);
    }
    let note = $('.note', scatterBox);
    if (!note) { $('svg', scatterBox).insertAdjacentHTML('beforeend', '<g class="note"><path/><text text-anchor="middle"></text></g>'); note = $('.note', scatterBox); }
    note.classList.toggle('is-off', !noteGeo);
    if (noteGeo) {
      $('path', note).setAttribute('d', `M${luna.x} ${luna.y + 17} V${noteGeo.yb} H${grok.x} V${grok.y + 11}`);
      const t = $('text', note);
      t.setAttribute('x', noteGeo.mid);
      t.setAttribute('y', noteGeo.yb + 17);
      t.textContent = noteGeo.text;
    }
    pts.forEach(p => {
      const g = $(`.pt[data-id="${p.m.id}"]`, scatterBox);
      g.style.transform = `translate(${p.x}px,${p.y}px)`;
      const t = $(`.lab[data-id="${p.m.id}"]`, scatterBox);
      t.style.transform = `translate(${p.x}px,${p.y}px)`;
      t.textContent = p.label;
      t.style.fontSize = fontSize + 'px';
      if (p.lab) { t.setAttribute('x', p.lab.dx); t.setAttribute('y', p.lab.dy); t.setAttribute('text-anchor', p.lab.a); }
      t.classList.toggle('is-hidden', !p.lab);
    });
  }

  if (scatterBox) {
    const tipEl = () => $('.chart-tip', scatterBox);
    scatterBox.addEventListener('pointerover', e => {
      const g = e.target.closest('.pt');
      if (!g) return;
      const m = MODELS.find(x => x.id === g.dataset.id);
      const t = tipEl();
      t.innerHTML = `<b>${esc(m.name)}</b><dl><dt>Overall</dt><dd>${m.overall.toFixed(1)}%</dd><dt>Cost per task</dt><dd>${m.costStr}</dd><dt>Tokens per task</dt><dd>${m.tokens.toFixed(1)}M</dd><dt>Turns per task</dt><dd>${m.turns.toLocaleString('en-US', { minimumFractionDigits: 1 })}</dd></dl>`;
      t.hidden = false;
      const br = scatterBox.getBoundingClientRect();
      const pr = $('circle.mark', g).getBoundingClientRect();
      let left = pr.left - br.left + 16, top = pr.top - br.top - t.offsetHeight / 2;
      if (left + t.offsetWidth > br.width) left = pr.left - br.left - t.offsetWidth - 10;
      t.style.left = Math.max(0, left) + 'px';
      t.style.top = Math.max(0, top) + 'px';
      $$('.pt, .lab', scatterBox).forEach(x => x.classList.toggle('is-dim', x.dataset.id !== g.dataset.id));
      linkModel(g.dataset.id, 'scatter');
    });
    scatterBox.addEventListener('pointerout', e => {
      const g = e.target.closest('.pt');
      if (g && !g.contains(e.relatedTarget)) { tipEl().hidden = true; $$('.pt, .lab', scatterBox).forEach(x => x.classList.remove('is-dim')); linkModel(null, 'scatter'); }
    });
    const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { if (scatterBox.clientWidth !== scatterW) renderScatter(false); }) : null;
    if (ro) ro.observe(scatterBox); else window.addEventListener('resize', () => renderScatter(false));
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => renderScatter(false));
    renderScatter(false);
  }

  /* ================================================= test-group bars */
  const gbars = $('#gbars');
  if (gbars) {
    const MAX = 80;
    const head = '<div class="gb-row gb-head"><span></span><span>Request</span><span>Browser</span><span>System</span></div>';
    gbars.innerHTML = head + MODELS.map(m => {
      const g = m.group === 'open' ? 'open' : 'frontier';
      const cell = k => `<span class="gb-cell" style="--w:${(m[k] / MAX * 100).toFixed(2)}%"><span class="gb-track"><i class="${g}"></i></span><b${m[k] === best[k] ? ' class="best"' : ''}>${m[k].toFixed(1)}</b></span>`;
      return `<div class="gb-row" data-model="${m.id}"><span class="gb-name"><i class="dot g-${g}" aria-hidden="true"></i>${esc(m.name)}</span>${cell('request')}${cell('browser')}${cell('system')}</div>`;
    }).join('') + '<div class="gb-row gb-axis" aria-hidden="true"><span></span>' + '<span class="gb-cell"><span class="gb-ticks"><em>0%</em><em>40%</em><em>80%</em></span><b></b></span>'.repeat(3) + '</div>';
  }

  /* ============================================ case-study evidence */
  const EV = {
    petsmart: () => {
      const tiles = list => `<div class="ev-tiles">${list.map(([k, l, bg]) => `<span class="ev-tile" style="background:${bg}">${ANIMAL[k]}<b>${l}</b></span>`).join('')}</div>`;
      return `<figure class="ev"><figcaption>Reference homepage</figcaption><div class="ev-frame"><div class="ev-url"><b>reference.local</b>/</div>${tiles([['fish', 'Fish', '#DDF0FA'], ['bird', 'Bird', '#FFF3CF'], ['ham', 'Small Pet', '#F1E6FA']])}</div></figure>
        <figure class="ev is-bad"><figcaption>Rebuilt homepage at s324</figcaption><div class="ev-frame"><div class="ev-url"><b>candidate.local</b>/</div>${tiles([['dog', 'Fish', '#DDF0FA'], ['dog2', 'Bird', '#FFF3CF'], ['dalm', 'Small Pet', '#F1E6FA']])}</div></figure>`;
    },
    amc: () => {
      const posters = hues => `<div class="ev-posters">${hues.map(hh => `<i style="background:linear-gradient(160deg,hsl(${hh} 55% 62%),hsl(${hh} 45% 34%))"></i>`).join('')}</div>`;
      const tabs = on => `<div class="ev-tabs"><span${on === 0 ? ' class="on"' : ''}>All movies</span><span${on === 1 ? ' class="on"' : ''}>Coming Soon</span></div>`;
      return `<figure class="ev"><figcaption>Reference</figcaption><div class="ev-frame"><div class="ev-url"><b>reference.local</b>/movies?tab=coming-soon</div>${tabs(1)}${posters([200, 280, 20, 160])}</div></figure>
        <figure class="ev is-bad"><figcaption>Rebuild, same URL</figcaption><div class="ev-frame"><div class="ev-url"><b>candidate.local</b>/movies?tab=coming-soon</div>${tabs(0)}${posters([40, 330, 120, 250])}</div></figure>`;
    },
    fandango: () => {
      const rows = ['D', 'E', 'F'];
      const seats = rows.map(r => `<div class="ev-seatrow"><em>${r}</em>${[1, 2, 3, 4, 5, 6].map(n => `<i class="${r === 'E' && n >= 2 && n <= 4 ? 'sel' : ''}"></i>`).join('')}</div>`).join('');
      return `<figure class="ev"><figcaption>Reference booking</figcaption><div class="ev-frame"><div class="ev-url"><b>reference.local</b></div><div class="ev-screen">Screen</div><div class="ev-seats">${seats}</div><p class="ev-total"><span>Seats E2 to E4</span><b>$67.87</b></p></div></figure>
        <figure class="ev is-good"><figcaption>Agent’s own check at s233 to s235</figcaption><div class="ev-term"><p><span class="k">confirm checkout</span> HTTP 201</p><p><span class="k">total</span> 6,787 cents</p><p><span class="ok">✓</span> booking stored</p><p><span class="ok">✓</span> selection cleared</p><p><span class="ok">✓</span> stored booking read back</p></div></figure>`;
    },
  };
  $$('[data-ev]').forEach(el => {
    const f = EV[el.dataset.ev];
    if (f) el.innerHTML = f();
  });

  /* ================================================== scoring widget */
  const tryBox = $('#try');
  if (tryBox) {
    const f = $('#try-f'), v1 = $('#try-v1'), v2 = $('#try-v2'), o1 = $('#try-o1'), o2 = $('#try-o2'), out = $('#try-out');
    const upd = () => {
      const a = +v1.value, b = +v2.value;
      o1.textContent = a.toFixed(2);
      o2.textContent = b.toFixed(2);
      const why = [];
      if (!f.checked) why.push('a functional check failed');
      if (a < 0.75) why.push('checkpoint 1 is below 0.75');
      if (b < 0.75) why.push('checkpoint 2 is below 0.75');
      const pt = why.length ? 0 : 1;
      out.innerHTML = `<span class="try-p p${pt}">${pt}</span><span>${pt ? 'Every condition holds, so the test earns its point.' : 'No point, because ' + why.join(' and ') + '.'}</span>`;
      v1.classList.toggle('below', a < 0.75);
      v2.classList.toggle('below', b < 0.75);
    };
    [f, v1, v2].forEach(el => el.addEventListener('input', upd));
    upd();
  }

  /* ================================================ linked highlight */
  // Hovering a model anywhere in Results highlights it in the table, the group bars and the scatter.
  const resultsEl = $('#results');
  function linkModel(id, from) {
    if (!resultsEl) return;
    resultsEl.classList.toggle('is-linked', !!id);
    $$('#board tbody tr, #gbars .gb-row[data-model]').forEach(r => r.classList.toggle('is-hl', r.dataset.model === id));
    if (from !== 'scatter' && scatterBox) $$('.pt, .lab', scatterBox).forEach(x => x.classList.toggle('is-dim', !!id && x.dataset.id !== id));
  }
  if (resultsEl) {
    const over = e => { const r = e.target.closest('#board tbody tr, #gbars .gb-row[data-model]'); if (r) linkModel(r.dataset.model, 'rows'); };
    const out = e => { const r = e.target.closest('#board tbody tr, #gbars .gb-row[data-model]'); if (r && !r.contains(e.relatedTarget)) linkModel(null, 'rows'); };
    ['#board', '#gbars'].forEach(sel => { const el = $(sel); if (el) { el.addEventListener('pointerover', over); el.addEventListener('pointerout', out); } });
  }

  /* ===================================================== table labels */
  // Phone layouts show each table row as a card, so every cell carries its column name.
  $$('table.design, table.rel').forEach(t => {
    const heads = $$('thead th', t).map(th => th.textContent.trim());
    $$('tbody tr', t).forEach(tr => Array.from(tr.children).forEach((cell, i) => { if (cell.tagName === 'TD') cell.dataset.label = heads[i] || ''; }));
  });

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
  tabset($('#scatter-tabs'), t => {
    metric = t.dataset.metric;
    if (scatterBox) scatterBox.setAttribute('aria-labelledby', t.id);
    renderScatter(true);
  });
  tabset($('#case-tabs'), t => {
    $$('#cases .case').forEach(p => { p.hidden = p.id !== t.getAttribute('aria-controls'); });
  });

  /* ========================================================= unit charts */
  const waffle = $('#waffle');
  if (waffle) waffle.innerHTML = '<span class="u ok"></span>' + '<span class="u bad"></span>'.repeat(110);
  const wf = $('#wf-grid');
  if (wf) wf.innerHTML = '<span class="u wf-done"></span>'.repeat(4) + '<span class="u wf-started"></span>'.repeat(117) + '<span class="u wf-none"></span>';

  const corpus = $('#corpus');
  if (corpus) {
    const CATS = [['E-commerce & retail', 22], ['Food & dining', 11], ['Content & community', 9], ['Professional services', 9], ['Productivity & SaaS', 5], ['Travel & outdoors', 5], ['Events & entertainment', 5], ['Education', 5], ['Jobs & careers', 3]];
    corpus.innerHTML = CATS.map(([n, c]) => `<div class="cat"><span class="cat-name">${esc(n)}</span><span class="cat-n">${c}</span><span class="wins" aria-hidden="true">${'<i class="win"></i>'.repeat(c)}</span></div>`).join('');
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

  /* ========================================================== copy bib */
  tabset($('#cite-tabs'), t => {
    $$('.cite-panel').forEach(p => { p.hidden = p.id !== t.getAttribute('aria-controls'); });
    const lab = $('#copy-bib span');
    if (lab) lab.textContent = t.dataset.copy;
  });
  const copyBtn = $('#copy-bib');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const pre = $$('.cite-panel').find(p => !p.hidden) || $('#bibtex');
      const label = $('span', copyBtn);
      const done = msg => {
        label.textContent = msg;
        copyBtn.classList.add('is-done');
        const sel = $('#cite-tabs [aria-selected="true"]');
        setTimeout(() => { label.textContent = sel ? sel.dataset.copy : 'Copy BibTeX'; copyBtn.classList.remove('is-done'); }, 2200);
      };
      const fallback = () => {
        const r = document.createRange();
        r.selectNodeContents(pre);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
        done('Selected, press Ctrl+C');
      };
      try {
        navigator.clipboard.writeText(pre.textContent).then(() => done('Copied'), fallback);
      } catch (e) { fallback(); }
    });
  }
})();
