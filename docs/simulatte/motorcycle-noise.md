# Motorcycle Noise

Owner: [Motorcycle Noise charter](../../public/simulatte/motorcycle-noise/CATSCAN.md).
Open `/simulatte/motorcycle-noise/` from Simulatte's main chooser. This is a
dedicated domain simulation using the shared WorldSpec contract, not a prompt
compiler profile. It runs locally without a model download or account.

## Use

Change the group, engine and road speed. Compare a barrier, absorbing facades,
or local active control. Click the street or use its arrow keys to move the
receiver, then run again. Exposure shows the complete interval's A-weighted
energy. Change shows calculated improvement or worsening. Local control adds
a receiver-centered map with 0.25 m sample spacing; it does not imply a continuous
quiet zone between samples. Playback renders the computed receiver pressure
with the same fixed gain for both versions and a sample limiter.

The timeline replays prescribed positions independently of solver time. Model
settings, spectra, sensing results and assumptions expand below the main controls.
Export creates a signed simulated event containing the exact WorldSpec, seed,
parameters, units, solver settings and results. Import verifies the signature and
program before replay. A local ephemeral signer proves neither physical identity
nor a violation. Imported measurements are not counted as another execution.

## Model

`scene.js` owns validated WorldSpec inputs and straight trajectories with bounded
speed and acceleration. RPM is independently prescribed; no speed-to-RPM or gear
inference is made. Four-stroke firing-event rate is RPM × cylinders / 120.
Crank-angle pulses distinguish 270-degree twins, evenly firing twins and inline
fours. Each source has a separate phase, RPM offset and seeded broadband component.
The declared reference is unweighted pressure at 1 m over the scenario interval,
normalized before propagation. It is a scenario assumption, not a recording or
a claimed universal motorcycle emission limit.

`propagation.js` propagates signed pressure through direct, ground-image and a
bounded number of parallel-wall image paths in three dimensions. Retarded source
time is solved iteratively; fractional sample delays preserve travel time. The
path approximation interpolates geometry between declared sample steps. Walls
are infinite and specular. Ground/wall combinations and diffraction around building
corners are not included. Ground coefficients and frequency-dependent one-pole
losses are assumed material responses, not measured acoustic impedances.

An obstructed direct path crosses a finite barrier via its top edge. Attenuation
uses a 500 Hz Fresnel approximation plus a declared spectral low-pass; it is not
a full broadband diffraction solver. Facade absorption changes reflection gains.
Neither mechanism changes the vehicles or scripts a decibel reduction.

`control.js` owns normalized filtered-x LMS using noisy/clipped reference and
error microphones, processing latency, a finite filter, secondary-path impulse
response and actuator limit. It cannot read future microphone samples. The ideal
mode instead uses the entire target disturbance for a regularized offline inverse.
It may produce very large point attenuation with exact paths; that is an
idealized numerical bound, not a prediction of an outdoor controller. Both modes
propagate the actual speaker command to other receivers, including worsening.

`signal.js` sums pressure before measurement. A-weighting uses its frequency
response on a zero-padded transform, followed by mean-square averaging and
125 ms Fast integration. The meter starts from zero; finite-window edge effects
and finite bandwidth remain limitations. Reported spectra are unweighted octave
bands. The reference checks follow the distinct energy and pressure relationships
in [FHWA noise fundamentals](https://www.fhwa.dot.gov/environMent/noise/regulations_and_guidance/polguide/polguide02.cfm)
and the measurement definitions in the
[FHWA Noise Measurement Handbook](https://www.fhwa.dot.gov/environment/noise/measurement/handbook.cfm).

Local control is position-dependent. Published
[open-window active-control research](https://www.nature.com/articles/s41598-020-66563-z)
does not validate this moving-source street model. Web Audio only plays already
computed pressure; its spatialization is not used as the propagation solver.
Actual ear-level pressure cannot be derived from browser volume, consistent with
the separate playback facilities of the [Web Audio API](https://www.w3.org/TR/webaudio/).

## Sensing and evidence

`sensing.js` estimates location using GCC-PHAT correlations and a bounded acoustic
map from eight microphone waveforms and their geometry. It reports alternatives
and abstains for weak or ambiguous peaks. Acoustic-to-camera association adjusts
for sound travel time; clock offsets and camera synchronization error can defeat
association. The estimator never receives a true source identifier.

The camera experiment generates six-digit synthetic plates, applies finite
pixel-area sampling, horizontal blur and noise, then matches observed pixels to
an explicit glyph alphabet. Low-resolution or ambiguous images remain unreadable.
It is not real-world OCR or super-resolution. Originals, degraded observations,
predictions and character correctness remain separate. No synthetic plate result
identifies a real rider.

## Acceptance

Run `node --test tests/motorcycle-noise.test.cjs` for free-field loss, independent
energy addition, impulse travel time, image geometry, phase-error interference,
controller causality, weighting, path refinement, sensing abstention, WorldSpec
replay and signature tampering. Run
`node tools/simulatte/audit-motorcycle-noise.mjs` for desktop/mobile execution,
audio activation, edits, cancellation, signed import and screenshots.

These establish bounded analytical and browser behavior. No independent
motorcycle recordings or urban measurements have calibrated or validated this
release. Engine-disabling mechanisms and enforcement claims are excluded.
