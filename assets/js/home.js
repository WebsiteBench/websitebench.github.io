/* Optional homepage motion. No animation runs when hidden, paused, or reduced. */
(() => {
  'use strict';
  const showcase = document.querySelector('.wb-showcase');
  if (!showcase) return;
  const scene = showcase.querySelector('.wb-scene');
  const plane = showcase.querySelector('.wb-plane');
  const button = showcase.querySelector('.wb-motion-toggle');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  let paused = false;
  let visible = true;
  let frame = 0;
  const entrances = new Set();
  const canAnimate = () => !paused && !reduced.matches && !document.hidden;
  // Animate the illustration, never the reported values or the layout dimensions.
  const enter = (element, keyframes, delay = 0, duration = 700) => {
    if (!canAnimate() || !element.animate) return;
    const animation = element.animate(keyframes, {
      duration, delay, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'backwards'
    });
    entrances.add(animation);
    animation.finished.then(() => entrances.delete(animation), () => entrances.delete(animation));
  };
  const resetTilt = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    plane.style.removeProperty('--tilt-x');
    plane.style.removeProperty('--tilt-y');
  };
  const sync = () => {
    const running = !paused && !reduced.matches && visible && !document.hidden;
    showcase.dataset.running = String(running);
    button.hidden = reduced.matches;
    button.setAttribute('aria-pressed', String(paused));
    button.textContent = paused ? 'Resume motion ▷' : 'Pause motion Ⅱ';
    if (!running) resetTilt();
    if (!canAnimate()) {
      entrances.forEach(animation => animation.cancel());
      entrances.clear();
    }
    document.body.classList.toggle('wb-motion-paused', paused || reduced.matches);
  };
  button.addEventListener('click', () => { paused = !paused; sync(); });
  reduced.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      sync();
    });
    observer.observe(showcase);
    const reveals = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const element = entry.target;
        enter(element, [
          { opacity: .25, translate: '0 22px' },
          { opacity: 1, translate: '0 0' }
        ]);
        reveals.unobserve(element);
      });
    }, { threshold: .12 });
    document.querySelectorAll('.hero h1, .hero .question, .hero .actions, .wb-showcase, .sec-head, .finding-viz, .access-col, .plate, .scoring-short, .bib').forEach(el => reveals.observe(el));

    const charts = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const chart = entry.target;
        chart.querySelectorAll('.bar > i, .pb-track > i, .tl-bar, .seg').forEach((bar, index) => {
          bar.style.transformOrigin = 'left center';
          enter(bar, [{ transform: 'scaleX(.02)' }, { transform: 'scaleX(1)' }], index * 65, 1000);
        });
        chart.querySelectorAll('.u, .win').forEach((cell, index) => {
          enter(cell, [
            { opacity: 0, transform: 'scale(.35)' },
            { opacity: getComputedStyle(cell).opacity, transform: 'scale(1)' }
          ], Math.min(index * 12, 900), 500);
        });
        chart.querySelectorAll('.grp, .levels li').forEach((card, index) => {
          enter(card, [{ opacity: .2, translate: '0 18px' }, { opacity: 1, translate: '0 0' }], index * 110);
        });
        charts.unobserve(chart);
      });
    }, { threshold: .15 });
    document.querySelectorAll('.board-wrap, .pair-bars, .timeline, .stack, .units, .waffle, .corpus-viz, .groups-grid').forEach(el => charts.observe(el));
  }
  scene.addEventListener('pointermove', event => {
    if (!pointer.matches || showcase.dataset.running !== 'true') return;
    const bounds = scene.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - .5;
    const y = (event.clientY - bounds.top) / bounds.height - .5;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      plane.style.setProperty('--tilt-x', `${x * 5}deg`);
      plane.style.setProperty('--tilt-y', `${y * -8}px`);
      frame = 0;
    });
  });
  scene.addEventListener('pointerleave', resetTilt);
  sync();
})();
