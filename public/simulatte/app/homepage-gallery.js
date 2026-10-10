(function () {
  'use strict';
  const gallery = document.querySelector('.simulation-gallery');
  if (!gallery || document.documentElement.hasAttribute('data-world-runtime')
      || globalThis.SimulattePublicRoutes.forPath(location.pathname)) return;
  const track = gallery.querySelector('.launch-simulations');
  const cards = [...track.querySelectorAll('.simulation-preview')];
  const controls = gallery.querySelector('.gallery-controls');
  const previous = controls.querySelector('[data-gallery-previous]');
  const next = controls.querySelector('[data-gallery-next]');
  const status = controls.querySelector('.gallery-status');
  const columns = () => Number(getComputedStyle(track).getPropertyValue('--preview-columns'));
  const step = () => cards[1] ? cards[1].offsetLeft - cards[0].offsetLeft : track.clientWidth;

  function update() {
    const first = Math.round(track.scrollLeft / step());
    const last = Math.min(cards.length, first + columns());
    status.textContent = `${first + 1}–${last} of ${cards.length} simulations`;
    previous.disabled = track.scrollLeft < 2;
    next.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
  }

  function move(direction) {
    track.scrollBy({ left: direction * columns() * step(),
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  track.addEventListener('scroll', update, { passive: true });
  track.addEventListener('keydown', event => {
    if (event.target !== track || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home' || event.key === 'End') {
      track.scrollTo({ left: event.key === 'Home' ? 0 : track.scrollWidth, behavior: 'instant' });
    } else move(event.key === 'ArrowRight' ? 1 : -1);
  });
  new ResizeObserver(update).observe(track);
  controls.hidden = false;
  update();
})();
