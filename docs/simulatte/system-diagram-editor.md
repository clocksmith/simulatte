# System Diagram editor ownership

Owner: [canonical diagram charter](../../public/simulatte/system-diagram/CATSCAN.md).

The canonical [document, class, kernel, runner and editor contracts](system-diagram.md)
own `/system-diagram`. The local `a84aea1` editor supplied interaction and
causal/resource regression cases; its separate v2 graph runtime was removed during
convergence. It is preserved in Git history, not shipped as a competing engine.

The editor fills the viewport. Components and Properties edge tabs open drawers
without moving the diagram; Escape or a canvas-background click dismisses them.
One closed Menu contains document actions, edits, presets, zoom and JSON tools on
desktop and narrow screens. Fit frames
the whole architecture below the floating controls, and bounded navigation keeps
visible content in reach even when components are far apart. Typed ports choose
facing sides from the connected components' geometry. Rounded orthogonal paths
minimize Manhattan distance plus a bend penalty while avoiding visible component
and note bodies. Moving and folding recompute the presentation without changing
endpoint identities. Overlapping nodes that enclose a port mark the route as blocked.

Save records the document, camera and detached subsystem draft in this browser's
storage. Reload restores that record automatically. Storage errors remain visible
and preserve existing saved bytes; export JSON for a portable copy across browsers
or machines. Folding groups only changes their presentation and connection anchors.
It never changes execution identity or published subsystem version pins.

The original [lease/redelivery experiment](distributed-workload-workbench.md)
remains at `/simulatte/distributed-repair/repair.html` with its own model and
coordinator tests. Neither model predicts production capacity or invokes live services.
