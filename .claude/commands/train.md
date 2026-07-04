---
description: Launch Simulatte training mode in Chrome
argument-hint: "[--no-open] [--stop] [--check]"
allowed-tools: [Bash]
---

Run the Simulatte training launcher from the repository root.

If the user supplied arguments, pass them through after `--`:

```bash
npm run train -- $ARGUMENTS
```

If there are no arguments, run:

```bash
npm run train
```

Report the app URL, review server URL, and review records path printed by the command. Mention that the browser stores reviews locally first and can export JSONL from the Training panel. Do not deploy.
