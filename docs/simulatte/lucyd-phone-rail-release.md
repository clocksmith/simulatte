# Lucyd phone component rail

Owner: public/simulatte/system-diagram/CATSCAN.md.
Source: f89e80ca6f9db3bcf344e87a60beeae2057965d1.

On screens up to 700px, expanding components overlays the workspace while its
layout footprint stays 56px. Expanded width remains independently adjustable
on desktop. Saved expansion and explicit choices survive resize/orientation;
layout updates do not repeatedly collapse the user's choice. Escape and workspace
interaction dismiss the overlay; Escape returns focus to the toggle.

Focused shell, rail, viewport, editor and solution-navigation checks pass 43/43.
Local browser checks at 390x844 and 320x740 verified expansion, saved-state reload,
keyboard Escape/focus, stage navigation, node selection and background drag/pan.
An 844x390 orientation transition preserved expansion and returned to a 334px
canvas at 390px, rather than squeezing it to 182px. At 320px the canvas remains
264px regardless of rail expansion. Screenshots were visually inspected.

World qualification, Firebase deployment and HTTP verification passed for build
f89e80ca6f9db3bcf344e87a60beeae2057965d1-e2f65b3c77e4.
Live browser checks confirmed the fresh build, saved expanded overlay, 320px
canvas width, Escape dismissal/focus and no console errors. A build query was
used to bypass a previously cached entry document.

Public live catalogue fetch confirms 31 problems, 62 approaches, 496 runnable
stages, zero problems without solutions. All eight originally missing IDs are
present; each now has two approaches of eight executable v4 stages. Exact rows:
artifacts/live-release/2026-10-27T14-49-45-526Z/catalogue-counts.json.
No encrypted collection was accessed or counted. Simulation semantics unchanged.
