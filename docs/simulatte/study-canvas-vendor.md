# Study canvas distribution

Owner: [study workspace charter](../../public/simulatte/system-diagram/study/CATSCAN.md).

Lucyd loads the official Excalidraw 0.18.1 production ESM distribution through
[canvas-loader.js](../../public/simulatte/system-diagram/study/canvas-loader.js).
The release owns the native drawing interface and font picker. Its primary
choices are Excalifont, Nunito and Comic Shanns; the expanded picker also offers
Lilita One. Legacy Virgil, Helvetica and Cascadia identifiers remain readable.
The surrounding interface uses Assistant. Liberation Sans and Xiaolai are
upstream fallback fonts, not additional primary picker choices.

## Source and reproduction

[versions.json](../../public/simulatte/system-diagram/study/vendor/modern/versions.json)
records the npm release archive SHA-512, every original module URL, source and
served SHA-256 hashes, compatibility patches, and retained license notices.

```sh
python3 tools/simulatte/vendor-study-excalidraw-modern.py
node --test tests/study-modern-fonts.test.cjs
LUCYD_PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
  node tools/simulatte/audit-study-fonts.cjs --url http://127.0.0.1:4173/lucyd
```

The generator copies upstream production JavaScript, CSS, fonts, workers and
locales without a local bundler, transpiler or runtime compilation. Bare module
imports resolve to vendored browser ESM dependency distributions. Original
published dependency responses are hash-locked against the committed receipt;
changed responses fail regeneration rather than silently upgrading dependencies.
The download cache lives outside the repository under
`~/.local/state/deco/excalidraw-esm-cache/`.

Static module adapters expose the existing React 18.2 UMD instance. The entire
workspace shares one React instance. Upstream's production JSX runtime has a
static CommonJS adapter; authored application code remains ordinary JavaScript.
All runtime module and font requests use the site's origin. The browser audit
blocks external requests and reports any attempted CDN fallback.

The two single-step layer actions reject Alt/Option, preserving Excalidraw's
Help-listed front/back shortcuts. The patch changes only those two predicates
and is reproduced by the vendor generator. The older 0.17.6 distribution remains
as historical compatibility-test input; the workspace does not load it.

[The notice collector](../../tools/simulatte/vendor-study-excalidraw-notices.py)
retains root notices from each dependency's npm release, exact release-commit
notices when available, font notices, and complete license metadata where a
published package supplied no root license text. The receipt distinguishes
those cases; it does not invent missing notices.

## Evidence boundary

[modern-fonts.json](../../artifacts/composable-study/modern-fonts.json) records
native picker changes to all four new fonts, loaded browser font faces and an
exact workspace JSON round-trip retaining the selected font. That audit covers
one desktop Chromium; it does not establish physical-device behavior or all
scripts' glyph coverage. Spatial geometry, drawing gestures and file interaction
checks have separate receipts.
