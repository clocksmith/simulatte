#!/usr/bin/env python3
"""Pin ELK's prebuilt distributions and derive Excalifont advance metrics, without a bundler."""
import base64
import hashlib
import io
import json
from pathlib import Path
import tarfile
import urllib.request
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
VENDOR = ROOT / 'public/simulatte/system-diagram/study/vendor'
URL = 'https://registry.npmjs.org/elkjs/-/elkjs-0.12.0.tgz'
INTEGRITY = 'YZcKynxVxYoKIOEpywEPwCFdg+BTbxQRNf3pbwdDCvc8O3kQD8bmIwSxKU1eOTVc4Xo+VG9Te+575mlfvOrhEQ=='
data = urllib.request.urlopen(URL, timeout=30).read()
if base64.b64encode(hashlib.sha512(data).digest()).decode() != INTEGRITY:
    raise ValueError('ELK tarball integrity mismatch')
target = VENDOR / 'elk'
target.mkdir(exist_ok=True)
receipt = {'version': '0.12.0', 'source': URL, 'license': 'EPL-2.0', 'sha256': {}}
with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
    for source, name in [('lib/elk-api.js', 'elk-api.js'), ('lib/elk-worker.min.js', 'elk-worker.min.js'), ('lib/elk.bundled.js', 'elk.bundled.js'), ('LICENSE.md', 'LICENSE.md')]:
        content = archive.extractfile('package/' + source).read()
        (target / name).write_bytes(content)
        receipt['sha256'][name] = hashlib.sha256(content).hexdigest()
(target / 'versions.json').write_text(json.dumps(receipt, indent=2, sort_keys=True) + '\n')
font_paths = sorted((VENDOR / 'modern/fonts/Excalifont').glob('*.woff2'))
if not font_paths:
    raise ValueError('Vendor modern Excalidraw before deriving font metrics')
advances = {}
font_hashes = {}
units = None
for font_path in font_paths:
    font = TTFont(font_path)
    if units is not None and units != font['head'].unitsPerEm:
        raise ValueError('Font subsets disagree on unitsPerEm')
    units = font['head'].unitsPerEm
    font_hashes[str(font_path.relative_to(VENDOR))] = hashlib.sha256(font_path.read_bytes()).hexdigest()
    for code, glyph in font.getBestCmap().items():
        advance = font['hmtx'].metrics[glyph][0]
        if str(code) in advances and advances[str(code)] != advance:
            raise ValueError('Conflicting font subset advance')
        advances[str(code)] = advance
metrics = {'schema': 'simulatte.studyFontMetrics.v1', 'fontFamily': 5, 'fontName': 'Excalifont', 'fontHashes': font_hashes, 'unitsPerEm': units, 'advances': advances, 'unknownAdvance': units, 'generator': 'tools/simulatte/vendor-study-layout.py'}
(ROOT / 'public/data/system-diagram/study-font-metrics.json').write_text(json.dumps(metrics, indent=2, sort_keys=True) + '\n')
print('Pinned ELK 0.12.0; derived', len(advances), 'Excalifont glyph advances')
