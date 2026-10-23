# System Diagram editor ownership

Owner: [canonical diagram charter](../../public/simulatte/system-diagram/CATSCAN.md).

The canonical [document, class, kernel, runner and editor contracts](system-diagram.md)
own `/system-diagram`. The local `a84aea1` editor supplied interaction and
causal/resource regression cases; its separate v2 graph runtime was removed during
convergence. It is preserved in Git history, not shipped as a competing engine.

The original [lease/redelivery experiment](distributed-workload-workbench.md)
remains at `/simulatte/distributed-repair/repair.html` with its own model and
coordinator tests. Neither model predicts production capacity or invokes live services.
