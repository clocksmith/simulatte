# Lucyd readable walkthrough release

Owner: public/simulatte/system-diagram/CATSCAN.md.

Source commit: ada31f1bcfdeee50b1ac3c03b783dfe1009fbb94.
Base: c4da668406232f7260b378ad3419ba746487e933. Prior solution commits were
already integrated in main with equivalent patches; no duplicate integration.

Walkthroughs open at natural component scale near their first visible node.
Explicit Fit retains whole-graph overview behavior. Resize and HUD inset changes
preserve the reading view. Simulation graphs and engine behavior are unchanged.

Focused viewport, navigation, rail and editor checks pass 39/39. Local and live
browser screenshots were inspected at 1280x720 and 390x844 using social-feed
stages 1 and 2. Node labels are readable; stage progression works and browser
error logs are empty. Phone checks use the collapsed component rail. A retained
expanded rail leaves less canvas space and should be collapsed for reading.
Large diagrams require panning; overview Fit may intentionally reduce text size.

`npm run deploy:hosting:world` passed all qualification checks and Firebase release.
Build: ada31f1bcfdeee50b1ac3c03b783dfe1009fbb94-b96187ae81fb.
HTTP identity/entry-assets verification passed; report:
artifacts/live-release/2026-10-27T14-43-01-942Z/report.json.
Live route: https://simulatte-world.web.app/system-diagram.

The isolated worktree needed the existing ignored Doppler vendor package and a
link to the existing sibling Doppler checkout to run unchanged package-pin checks.
No checks were bypassed, no security settings changed, and no Create deployment ran.
