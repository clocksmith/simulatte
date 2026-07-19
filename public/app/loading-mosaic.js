(function attachLoadingMosaic(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteLoadingMosaic = api;
  if (typeof document !== 'undefined') {
    const start = () => api.mount(document.getElementById('loading-mosaic'));
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function createLoadingMosaic() {
  const DEFAULT_SIZE = 7;
  const ROYGBIV_HUES = Object.freeze([0, 28, 56, 120, 210, 250, 290]);

  function spiralCells(size) {
    if (!Number.isInteger(size) || size < 1) throw new Error(`Loading mosaic expected a positive integer size, received ${size}`);
    const cells = [];
    let top = 0;
    let right = size - 1;
    let bottom = size - 1;
    let left = 0;
    while (top <= bottom && left <= right) {
      for (let column = left; column <= right; column += 1) cells.push([top, column]);
      top += 1;
      for (let row = top; row <= bottom; row += 1) cells.push([row, right]);
      right -= 1;
      if (top <= bottom) {
        for (let column = right; column >= left; column -= 1) cells.push([bottom, column]);
        bottom -= 1;
      }
      if (left <= right) {
        for (let row = bottom; row >= top; row -= 1) cells.push([row, left]);
        left += 1;
      }
    }
    return cells;
  }

  function orientedSpiralCells(size, quarterTurns = 0, outward = false) {
    const turns = ((quarterTurns % 4) + 4) % 4;
    const rotate = ([row, column]) => {
      let next = [row, column];
      for (let turn = 0; turn < turns; turn += 1) next = [next[1], size - 1 - next[0]];
      return next;
    };
    const cells = spiralCells(size).map(rotate);
    return outward ? cells.reverse() : cells;
  }

  function mount(container, size = DEFAULT_SIZE, random = Math.random) {
    if (!container) throw new Error('Loading mosaic expected #loading-mosaic');
    const quarterTurns = Math.floor(random() * 4) % 4;
    const outward = random() >= 0.5;
    const orderByCell = new Map(orientedSpiralCells(size, quarterTurns, outward).map(([row, column], index) => [`${row}:${column}`, index]));
    const tiles = [];
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        const tile = document.createElement('i');
        const step = orderByCell.get(`${row}:${column}`);
        const tone = ROYGBIV_HUES[step % ROYGBIV_HUES.length];
        const restingOpacity = 0.025 + (((row + column * 2) % 5) * 0.012);
        tile.style.setProperty('--spiral-step', step);
        tile.style.setProperty('--tile-hue', tone);
        tile.style.setProperty('--tile-opacity', restingOpacity.toFixed(3));
        tiles.push(tile);
      }
    }
    container.style.setProperty('--mosaic-size', size);
    container.replaceChildren(...tiles);
    return Object.freeze({ size, tileCount: tiles.length, quarterTurns, direction: outward ? 'outward' : 'inward' });
  }

  return { DEFAULT_SIZE, ROYGBIV_HUES, mount, orientedSpiralCells, spiralCells };
});
