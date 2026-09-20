(async function (root) {
  const $ = id => document.getElementById(id), form = $('controls'), canvas = $('street'), view = root.MotorcycleView.create(canvas);
  let params, spec, output = null, worker = null, generation = 0, playing = false, frame = null, audio = null, audioSource = null;
  let time = 1.5, map = 'result';
  const status = (text, error = false) => { $('status').textContent = text; $('status').dataset.error = String(error); };
  const paint = () => { if (spec) view.draw(spec, output, time, map); $('time').textContent = `${time.toFixed(2)} s`; };
  const labelValues = () => { $('count-value').textContent = form.elements.count.value; $('rpm-value').textContent = `${Number(form.elements.rpm.value).toLocaleString()} RPM`; $('speed-value').textContent = `${form.elements.speed.value} m/s`; };
  function stopAudio() { audioSource?.stop(); audioSource = null; $('listen').textContent = 'Listen'; }
  function stopPlayback() { playing = false; cancelAnimationFrame(frame); $('play').textContent = 'Play'; }
  function readForm() {
    const next = structuredClone(params);
    for (const [key, value] of new FormData(form)) next[key] = typeof params[key] === 'number' ? Number(value) : value;
    return next;
  }
  function install(p, recovered = null) {
    const nextSpec = recovered || (spec ? root.MotorcycleScene.edit(spec, p) : root.MotorcycleScene.create(p));
    params = structuredClone(p); spec = nextSpec;
    for (const [key, value] of Object.entries(params)) if (form.elements[key] && !Array.isArray(value)) form.elements[key].value = String(value);
    labelValues(); $('controller-fields').hidden = params.mitigation !== 'active';
    $('local-map').hidden = params.mitigation !== 'active';
    if (params.mitigation !== 'active' && map === 'local') { map = 'result'; document.querySelector('[data-map=result]').click(); }
    $('mode-note').textContent = params.mitigation === 'active' ? (params.controller === 'causal'
      ? 'Microphones drive local control. Other locations may get louder.' : 'Offline scene knowledge. An ideal comparison, not a causal controller.')
      : params.mitigation === 'barrier' ? `A ${params.barrierHeight} m barrier changes the direct acoustic path.`
        : params.mitigation === 'facade' ? 'Absorption changes reflected paths, not the motorcycles.' : 'No mitigation. Both measurements should agree.';
    $('timeline').max = String(params.duration); time = Math.min(time, params.duration); $('timeline').value = String(time);
    $('map-caption').textContent = `${params.mitigation === 'active' ? (params.controller === 'ideal' ? 'Ideal offline · ' : 'Causal control · ') : ''}Full-pass LAeq · ${params.duration} s · height ${params.receiver[2]} m`;
    $('receiver-context').textContent = params.mitigation === 'active' && params.controller === 'ideal' ? 'Ideal offline bound' : 'At this receiver';
  }
  function invalidate() {
    generation++; worker?.terminate(); worker = null; stopAudio(); stopPlayback(); output = null; root.motorcycleNoiseState = null; document.body.dataset.state = 'changed';
    $('localization').textContent = 'Run the updated sensing experiment.'; $('plate-result').textContent = ''; $('peak-levels').textContent = '';
    for (const id of ['plate-original', 'plate-observed', 'spectrum']) { const c = $(id); c.getContext('2d').clearRect(0, 0, c.width, c.height); }
    $('assumptions').replaceChildren();
    for (const id of ['before', 'after', 'difference']) $(id).textContent = '—';
    for (const id of ['listen', 'export', 'play']) $(id).disabled = true;
    $('run').disabled = false; $('cancel').hidden = true; $('progress').hidden = true;
    $('off-target').textContent = 'Run the updated scene to compare.';
  }
  function run() {
    try { const next = readForm(); root.MotorcycleScene.validateParams(next); invalidate(); install(next); }
    catch (error) { status(error.message, true); return; }
    const token = generation;
    $('run').disabled = true; $('cancel').hidden = false; $('progress').hidden = false; $('progress').value = 0;
    status('Computing pressure paths'); paint();
    worker = new Worker('./worker.js');
    const fail = message => { if (token !== generation) return; worker?.terminate(); worker = null;
      $('run').disabled = false; $('cancel').hidden = true; $('progress').hidden = true; document.body.dataset.state = 'error'; status(message, true); };
    worker.onerror = event => fail(event.message);
    worker.onmessage = ({ data }) => {
      if (token !== generation) return;
      if (data.type === 'progress') { $('progress').value = data.fraction; status(data.phase); return; }
      if (data.type === 'error') { fail(data.message); return; }
      output = data.output; worker.terminate(); worker = null;
      $('run').disabled = false; $('cancel').hidden = true; $('progress').hidden = true;
      for (const id of ['listen', 'export', 'play']) $(id).disabled = false;
      const r = output.record;
      $('before').textContent = r.baseline.laeq.toFixed(1); $('after').textContent = r.result.laeq.toFixed(1);
      $('difference').textContent = `${Math.abs(r.attenuation).toFixed(1)} dB`;
      $('difference').className = r.attenuation >= 0 ? 'improved' : 'worse';
      $('difference-label').textContent = Math.abs(r.attenuation) < 0.05 ? 'No change' : r.attenuation > 0 ? 'Quieter here' : 'Louder here';
      $('off-target').textContent = `${r.offTarget.improved} locations quieter · ${r.offTarget.worsened} louder · ${r.offTarget.unchanged} unchanged`;
      $('peak-levels').textContent = `Fast maximum: ${r.baseline.lafmax.toFixed(1)} → ${r.result.lafmax.toFixed(1)} dBA. Gray: baseline. Green: mitigation.`;
      $('localization').textContent = `Acoustic location: ${r.sensing.localization.status}. Vehicle association: ${r.sensing.association.status}.`;
      $('plate-result').textContent = r.sensing.recognition.text ? `Synthetic reading ${r.sensing.recognition.text}. ${r.sensing.evaluation.charactersCorrect}/6 characters correct.` : 'Unreadable. No plate identity assigned.';
      root.MotorcycleView.plate($('plate-original'), output.originalPlate); root.MotorcycleView.plate($('plate-observed'), output.degradedPlate);
      root.MotorcycleView.spectrum($('spectrum'), r);
      $('assumptions').replaceChildren(...r.assumptions.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
      status('Comparison ready'); document.body.dataset.state = 'ready'; paint();
      root.motorcycleNoiseState = { spec, record: r };
    };
    document.body.dataset.state = 'running'; worker.postMessage({ spec });
  }
  form.addEventListener('submit', event => { event.preventDefault(); run(); });
  form.addEventListener('input', () => { invalidate(); try { install(readForm()); status('Scene changed. Run to compare.'); paint(); } catch (error) { status(error.message, true); } });
  $('cancel').addEventListener('click', () => { invalidate(); status('Cancelled. No result was published.'); document.body.dataset.state = 'cancelled'; paint(); });
  $('timeline').addEventListener('input', () => { stopPlayback(); time = Number($('timeline').value); paint(); });
  $('play').addEventListener('click', () => {
    if (playing) { stopPlayback(); return; }
    playing = true; $('play').textContent = 'Pause'; const start = performance.now() - time * 1000;
    const tick = now => { if (!playing) return; time = ((now - start) / 1000) % params.duration; $('timeline').value = String(time); paint(); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
  });
  for (const button of document.querySelectorAll('[data-map]')) button.addEventListener('click', () => {
    map = button.dataset.map;
    for (const item of document.querySelectorAll('[data-map]')) item.setAttribute('aria-pressed', String(item === button));
    $('legend-gradient').classList.toggle('difference', map !== 'result'); $('legend-low').textContent = map !== 'result' ? 'Quieter' : '50'; $('legend-high').textContent = map !== 'result' ? 'Louder' : '100 dBA'; paint();
  });
  function moveReceiver(x, y) {
    const next = readForm(); next.receiver = [Math.max(-20, Math.min(20, x)), Math.max(-params.streetHalfWidth + .5, Math.min(params.streetHalfWidth - .5, y)), params.receiver[2]];
    try { root.MotorcycleScene.validateParams(next); invalidate(); install(next); status('Receiver moved. Run to compare.'); paint(); } catch (error) { status(error.message, true); }
  }
  canvas.addEventListener('click', event => { if (map !== 'local') moveReceiver(...view.point(event)); });
  canvas.addEventListener('keydown', event => { const directions = { ArrowLeft: [-.5, 0], ArrowRight: [.5, 0], ArrowUp: [0, .5], ArrowDown: [0, -.5] };
    if (directions[event.key]) { event.preventDefault(); const d = directions[event.key]; moveReceiver(params.receiver[0] + d[0], params.receiver[1] + d[1]); } });
  $('listen').addEventListener('click', async () => {
    if (audioSource) { stopAudio(); return; }
    try {
      if (!audio) audio = new AudioContext(); await audio.resume();
      if (!output) return;
      const samples = output[$('listen-mode').value], buffer = audio.createBuffer(1, samples.length, params.sampleRate), channel = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) channel[i] = Math.max(-.5, Math.min(.5, samples[i] * .03));
      audioSource = audio.createBufferSource(); audioSource.buffer = buffer; audioSource.connect(audio.destination);
      const source = audioSource; source.onended = () => { if (audioSource === source) { audioSource = null; $('listen').textContent = 'Listen'; } };
      audioSource.start(); $('listen').textContent = 'Stop audio';
    } catch (error) { status(`Playback unavailable: ${error.message}`, true); }
  });
  $('listen-mode').addEventListener('change', stopAudio);
  $('export').addEventListener('click', async () => {
    try {
      const signed = await root.MotorcycleRecords.sign(spec, output.record), blob = new Blob([JSON.stringify(signed, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `motorcycle-noise-${signed.payload.spec.params.seed}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      $('record-status').textContent = 'Signed simulated event exported. No real-world identity claim.';
    } catch (error) { $('record-status').textContent = error.message; }
  });
  $('import').addEventListener('change', async event => {
    try {
      const file = event.target.files[0]; if (!file) return;
      if (file.size > 2000000) throw new Error('Simulation file exceeds 2 MB');
      const imported = JSON.parse(await file.text());
      const recovered = imported.schema === 'simulatte.signedSimulatedEvent.v1' ? (await root.MotorcycleRecords.verify(imported)).spec : root.MotorcycleScene.validate(imported);
      invalidate(); install(recovered.params, recovered); paint(); status('Simulation loaded. Run to replay.'); $('record-status').textContent = 'Program verified; imported results are not a new execution.';
    } catch (error) { $('record-status').textContent = `Import rejected: ${error.message}`; }
  });
  root.addEventListener('pagehide', () => { worker?.terminate(); stopPlayback(); stopAudio(); audio?.close(); });
  $('docs-link').href = 'https://github.com/clocksmith/simulatte/blob/main/docs/simulatte/motorcycle-noise.md';
  try { const response = await fetch('./scenario.json'); if (!response.ok) throw new Error(`Scenario HTTP ${response.status}`); install(await response.json()); paint(); run(); }
  catch (error) { status(error.message, true); }
})(globalThis);
