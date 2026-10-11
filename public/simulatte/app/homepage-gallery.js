(function () {
  'use strict';
  const track = document.querySelector('.launch-simulations');
  if (!track || document.documentElement.hasAttribute('data-world-runtime')
      || globalThis.SimulattePublicRoutes.forPath(location.pathname)) return;
  const cards = [...track.querySelectorAll('.simulation-preview')];
  // Tab follows document order; arrow keys step between complete spotlights.
  track.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const current = cards.indexOf(document.activeElement);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1
      : Math.max(0, Math.min(cards.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
    event.preventDefault();
    cards[index].focus({ preventScroll: true });
    cards[index].scrollIntoView({ block: 'center',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  });
})();
