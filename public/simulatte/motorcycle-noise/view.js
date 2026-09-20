(function (root) {
  function create(canvas) {
    const context = canvas.getContext('2d');
    let bounds = null;
    function draw(spec, output, time, mode) {
      const p = spec.params;
      const displayWidth = canvas.getBoundingClientRect().width || 1100;
      canvas.width = Math.max(320, Math.round(displayWidth)); canvas.height = Math.round(canvas.width * 650 / 1100);
      const w = canvas.width, h = canvas.height, compact = w < 600;
      bounds = { x: 24, y: p.streetHalfWidth + 5 };
      if (mode === 'local' && output?.record.localGrid.length) {
        context.fillStyle = '#eeeede'; context.fillRect(0, 0, w, h);
        for (const cell of output.record.localGrid) {
          const delta = Math.max(-12, Math.min(12, -cell.attenuation));
          context.fillStyle = delta < 0 ? `rgba(35,119,88,${.08 + Math.abs(delta) / 16})` : `rgba(201,83,65,${.08 + delta / 16})`;
          const x = (cell.point[0] - p.receiver[0] + 1) / 2.25 * w, y = (1 - cell.point[1] + p.receiver[1]) / 2.25 * h;
          context.fillRect(x, y, w / 9 + 1, h / 9 + 1);
        }
        context.fillStyle = '#142e24'; context.beginPath(); context.arc(w / 2, h / 2, 7, 0, Math.PI * 2); context.fill();
        label('RECEIVER', w / 2 + 15, h / 2 - 10);
        label(compact ? 'LOCAL CONTROL · 0.25 m GRID' : 'LOCAL CONTROL · 0.25 m SAMPLE SPACING', 16, 24);
        label(compact ? '2.25 m wide · speaker near-field excluded' : '2.25 m wide · green quieter / red louder · speaker near-field excluded', 16, 44, 11);
        return;
      }
      const X = x => (x / (2 * bounds.x) + 0.5) * w, Y = y => (0.5 - y / (2 * bounds.y)) * h;
      const rect = (x, y, dx, dy, color) => { context.fillStyle = color; context.fillRect(X(x), Y(y + dy), dx * w / (2 * bounds.x), dy * h / (2 * bounds.y)); };
      context.fillStyle = '#e9e9df'; context.fillRect(0, 0, w, h);
      for (let x = -24; x < 24; x += 2) { context.strokeStyle = '#dcded3'; context.beginPath(); context.moveTo(X(x), 0); context.lineTo(X(x), h); context.stroke(); }
      rect(-24, -3, 48, 6, '#686f69');
      context.strokeStyle = '#b6beb0'; context.lineWidth = 2; context.setLineDash([16, 13]); context.beginPath(); context.moveTo(0, Y(0)); context.lineTo(w, Y(0)); context.stroke(); context.setLineDash([]);
      if (output) for (const cell of output.record.grid) {
        const v = mode === 'difference' ? Math.max(-12, Math.min(12, -cell.attenuation)) : Math.max(50, Math.min(100, cell.result));
        const color = mode === 'difference' ? (v < 0 ? `rgba(35,119,88,${0.08 + Math.abs(v) / 20})` : `rgba(201,83,65,${0.08 + v / 20})`)
          : `hsla(${115 - (v - 50) * 2.8},55%,${76 - (v - 50) * 0.8}%,.62)`;
        const dx = 40 / (p.gridColumns - 1), dy = (2 * p.streetHalfWidth - 1) / (p.gridRows - 1);
        rect(cell.point[0] - dx / 2, cell.point[1] - dy / 2, dx + .04, dy + .04, color);
      }
      for (const side of [-1, 1]) for (let x = -23; x < 23; x += 8) {
        const y = side === 1 ? p.streetHalfWidth : -p.streetHalfWidth - 5;
        rect(x + .4, y - .2, 7.2, 5, '#a7aea1'); rect(x, y, 7.2, 5, '#c7cbbf');
        context.strokeStyle = '#909c90'; context.strokeRect(X(x), Y(y + 5), 7.2 * w / 48, 5 * h / (2 * bounds.y));
      }
      if (p.mitigation === 'barrier') { context.strokeStyle = '#424e44'; context.lineWidth = 7; context.beginPath(); context.moveTo(X(-10), Y(6)); context.lineTo(X(10), Y(6)); context.stroke(); label('BARRIER', X(-10), Y(6) - 14); }
      if (p.mitigation === 'facade') for (const y of [-p.streetHalfWidth, p.streetHalfWidth]) { context.strokeStyle = '#3a8a6a'; context.lineWidth = 7; context.beginPath(); context.moveTo(0, Y(y)); context.lineTo(w, Y(y)); context.stroke(); }
      if (p.mitigation === 'active') {
        context.fillStyle = '#e7af4f'; context.fillRect(X(p.speaker[0]) - 7, Y(p.speaker[1]) - 7, 14, 14); label('SPEAKER', X(p.speaker[0]) + 14, Y(p.speaker[1]) + 5);
        context.fillStyle = '#49756a'; context.beginPath(); context.arc(X(p.reference[0]), Y(p.reference[1]), 5, 0, Math.PI * 2); context.fill(); label('REFERENCE', X(p.reference[0]) - 70, Y(p.reference[1]) - 14);
      }
      for (const source of spec.objects) {
        const point = root.MotorcycleScene.position(source, time), x = X(point[0]), y = Y(point[1]);
        if (x < -20 || x > w + 20) continue;
        context.strokeStyle = '#e1e7c6'; context.lineWidth = 3; context.beginPath(); context.moveTo(x - 38, y); context.lineTo(x - 9, y); context.stroke();
        context.fillStyle = '#243a31'; context.beginPath(); context.roundRect(x - 9, y - 4, 23, 8, 4); context.fill();
        context.fillStyle = '#f5dd88'; context.beginPath(); context.arc(x + 2, y - 1, 4, 0, Math.PI * 2); context.fill();
      }
      const x = X(p.receiver[0]), y = Y(p.receiver[1]);
      context.strokeStyle = '#183f30'; context.lineWidth = 2; context.beginPath(); context.arc(x, y, 14, 0, Math.PI * 2); context.stroke();
      context.fillStyle = '#fffceb'; context.beginPath(); context.arc(x, y, 8, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#183f30'; context.beginPath(); context.arc(x, y, 3, 0, Math.PI * 2); context.fill(); label('RECEIVER', x + 20, y - 5);
      if (!compact) label(`${p.receiver[0].toFixed(1)}, ${p.receiver[1].toFixed(1)} m`, x + 20, y + 14, 12);
      label('CALM AIR', 12, 20); if (!compact) label(`${p.soundSpeed} m/s`, 12, 38, 12);
      context.strokeStyle = '#354c3f'; context.lineWidth = 2; context.beginPath(); context.moveTo(w - 140, 35); context.lineTo(w - 40, 35); context.stroke(); label(`${(100 / w * 48).toFixed(1)} m`, w - 112, 25, 12);
    }
    function label(text, x, y, size = 11) { context.font = `500 ${size}px "IBM Plex Sans", sans-serif`; context.fillStyle = '#2e4538'; context.fillText(text, Math.max(6, Math.min(x, canvas.width - context.measureText(text).width - 6)), y); }
    function point(event) { const box = canvas.getBoundingClientRect(); return [(event.clientX - box.left) / box.width * bounds.x * 2 - bounds.x, bounds.y - (event.clientY - box.top) / box.height * bounds.y * 2]; }
    return { draw, point };
  }
  function plate(canvas, image) {
    const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) { const shade = Math.round(image.pixels[y * image.width + x] * 255); ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fillRect(x * canvas.width / image.width, y * canvas.height / image.height, Math.ceil(canvas.width / image.width), Math.ceil(canvas.height / image.height)); }
  }
  function spectrum(canvas, record) {
    const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bands = record.baseline.spectrum, low = Math.min(...bands.map(row => row.dbZ), ...record.result.spectrum.map(row => row.dbZ)) - 5;
    const high = Math.max(...bands.map(row => row.dbZ), ...record.result.spectrum.map(row => row.dbZ)) + 5;
    ctx.font = '13px sans-serif';
    for (let i = 0; i < bands.length; i++) {
      const x = 50 + i * 135;
      for (const [offset, row, color] of [[0, bands[i], '#8b9790'], [38, record.result.spectrum[i], '#487f67']]) {
        const height = (row.dbZ - low) / (high - low) * 170; ctx.fillStyle = color; ctx.fillRect(x + offset, 205 - height, 30, height); ctx.fillText(row.dbZ.toFixed(0), x + offset, 195 - height);
      }
      ctx.fillStyle = '#78877f'; ctx.fillText(`${bands[i].hz} Hz`, x, 228);
    }
  }
  root.MotorcycleView = { create, plate, spectrum };
})(globalThis);
