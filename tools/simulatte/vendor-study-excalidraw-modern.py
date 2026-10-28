#!/usr/bin/env python3
"""Vendor upstream's prebuilt ESM and published browser dependency modules; no local bundler.
Regeneration verifies the immutable release archive and records original/patched hashes.
"""
import base64, hashlib, io, json, pathlib, re, tarfile, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'public/simulatte/system-diagram/study/vendor/modern'
CACHE=pathlib.Path.home()/'.local/state/deco/excalidraw-esm-cache'
VERSION='0.18.1'
ARCHIVE='https://registry.npmjs.org/@excalidraw/excalidraw/-/excalidraw-0.18.1.tgz'
INTEGRITY='6i5Gt7IDTOH//qa0Z315Ly5iVRhjWpu2whrlQFqkuwrkKUWgRsMk0P5qdE7bpyDpai7jeLeWYkyj1eVAfni1lw=='
IMPORT=re.compile(r'''(?P<prefix>\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(?P<quote>['"])(?P<spec>[^'"\n]+)(?P=quote)''')
records=[]; visited={}
previous=json.loads((OUT/'versions.json').read_text()) if (OUT/'versions.json').exists() else {}
source_locks={r['source']:r.get('sourceSha256',r['sha256']) for r in previous.get('files',[]) if r.get('source','').startswith('https://cdn.jsdelivr.net/')}
def download(url):
 CACHE.mkdir(parents=True,exist_ok=True)
 p=CACHE/hashlib.sha256(url.encode()).hexdigest()
 if not p.exists():
  try:
   with urllib.request.urlopen(url) as response: p.write_bytes(response.read())
  except Exception as error: raise RuntimeError('Could not download '+url) from error
 data=p.read_bytes()
 if url in source_locks and sha(data)!=source_locks[url]:raise RuntimeError('Published browser module changed: '+url)
 return data
def sha(b):return hashlib.sha256(b).hexdigest()
def package_name(spec):return '/'.join(spec.split('/')[:2]) if spec.startswith('@') else spec.split('/')[0]
def react_module(spec):
 normalized=spec.removeprefix('https://cdn.jsdelivr.net/npm/')
 if re.fullmatch(r'react(?:@[^/]+)?/jsx-runtime(?:/\+esm)?',normalized):return 'jsx-runtime.js'
 if re.fullmatch(r'react-dom(?:@[^/]+)?(?:/\+esm)?',normalized):return 'react-dom.js'
 if re.fullmatch(r'react(?:@[^/]+)?(?:/\+esm)?',normalized):return 'react.js'
 return None
def dependency(url):
 bridge=react_module(url)
 if bridge:return '../'+bridge
 if url in visited:return './'+visited[url]
 name=hashlib.sha256(url.encode()).hexdigest()[:20]+'.js';visited[url]=name
 raw=download(url);text=raw.decode()
 if 'Failed to fetch version info' in text or text.startswith('Couldn\'t find'):raise RuntimeError('Invalid dependency '+url)
 def rewrite(m):
  spec=m['spec']
  if not spec.startswith(('/npm/','https://cdn.jsdelivr.net/','./','../')):return m[0]
  full='https://cdn.jsdelivr.net'+spec if spec.startswith('/') else urllib.parse.urljoin(url,spec)
  value=dependency(full)
  return m['prefix']+m['quote']+value+m['quote']
 transformed=IMPORT.sub(rewrite,text).encode()
 (OUT/'deps'/name).write_bytes(transformed)
 records.append({'path':'deps/'+name,'source':url,'sourceSha256':sha(raw),'sha256':sha(transformed),'change':'Only module specifiers resolve to pinned local dependencies and shared React18 globals.'})
 return './'+name
raw=download(ARCHIVE)
if base64.b64encode(hashlib.sha512(raw).digest()).decode()!=INTEGRITY:raise RuntimeError('Upstream archive integrity mismatch')
archive=tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz')
meta=json.load(archive.extractfile('package/package.json'))
OUT.mkdir(parents=True,exist_ok=True);(OUT/'deps').mkdir(exist_ok=True)
for member in archive.getmembers():
 prefix='package/dist/prod/'
 if not member.isfile() or not member.name.startswith(prefix) or member.name.endswith('.map'):continue
 relative=member.name[len(prefix):]
 if '..' in pathlib.PurePosixPath(relative).parts:raise RuntimeError('Unsafe release path')
 data=archive.extractfile(member).read();original=data
 if relative.endswith('.js'):
  def rewrite(m):
   spec=m['spec']
   if spec.startswith('.') or spec.startswith('data:'):return m[0]
   bridge=react_module(spec)
   dest=OUT/relative
   if bridge:target=OUT/bridge
   else:
    package=package_name(spec);version=meta['dependencies'].get(package)
    if not version:raise RuntimeError('Unpinned dependency '+spec)
    suffix=spec[len(package):]
    url='https://cdn.jsdelivr.net/npm/'+package+'@'+version+suffix+'/+esm'
    dep=dependency(url);target=OUT/'deps'/dep[2:]
   import os
   local=os.path.relpath(target,dest.parent).replace('\\','/')
   if not local.startswith('.'):local='./'+local
   return m['prefix']+m['quote']+local+m['quote']
  text=IMPORT.sub(rewrite,data.decode())
  if relative=='index.js':
   for action in ['sendBackward','bringForward']:
    start=text.index('name:"'+action+'"');end=text.index('PanelComponent:',start);snippet=text[start:end]
    if snippet.count('&&!e.shiftKey&&e.code')!=1:raise RuntimeError('Re-review upstream layer shortcut '+action)
    text=text[:start]+snippet.replace('&&!e.shiftKey&&e.code','&&!e.shiftKey&&!e.altKey&&e.code')+text[end:]
  if relative=='chunk-K2UTITRG.js':
   old='if(he.generateElementShape(e,i),i.isExporting){'
   if text.count(old)!=1:raise RuntimeError('Re-review upstream text rasterization boundary')
   text=text.replace(old,'if(he.generateElementShape(e,i),i.isExporting||e.type==="text"){')
  data=text.encode()
 target=OUT/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
 records.append({'path':relative,'source':ARCHIVE+'#'+member.name,'sourceSha256':sha(original),'sha256':sha(data),'change':('Bare module specifiers are rewritten; two single-step layer shortcuts reject Alt to preserve native front/back shortcuts.' if relative=='index.js' else ('Bare module specifiers are rewritten; text draws directly at display resolution instead of resampling cached bitmaps.' if relative=='chunk-K2UTITRG.js' else 'Only bare module specifiers are rewritten.')) if original!=data else 'Unmodified published asset.'})
# All modules share the existing, pinned React18.2 UMD instance.
react=['Children','Component','Fragment','Profiler','PureComponent','StrictMode','Suspense','__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED','cloneElement','createContext','createElement','createFactory','createRef','forwardRef','isValidElement','lazy','memo','startTransition','unstable_act','useCallback','useContext','useDebugValue','useDeferredValue','useEffect','useId','useImperativeHandle','useInsertionEffect','useLayoutEffect','useMemo','useReducer','useRef','useState','useSyncExternalStore','useTransition','version']
dom=['__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED','createPortal','createRoot','findDOMNode','flushSync','hydrate','hydrateRoot','render','unmountComponentAtNode','unstable_batchedUpdates','unstable_renderSubtreeIntoContainer','version']
for name,global_name,exports in [('react.js','React',react),('react-dom.js','ReactDOM',dom)]:
 (OUT/name).write_text('const instance=globalThis.'+global_name+';\nif(!instance)throw Error("Load pinned '+global_name+' before Excalidraw modules");\n'+''.join('export const '+key+'=instance.'+key+';\n' for key in exports)+'export default instance;\n')
# Official React18 production JSX runtime, enclosed in a static CommonJS module adapter.
jsx_url='https://cdn.jsdelivr.net/npm/react@18.2.0/cjs/react-jsx-runtime.production.min.js'
jsx=download(jsx_url)
(OUT/'jsx-runtime.js').write_text('import React from "./react.js";\nconst exports={},require=id=>{if(id!=="react")throw Error("Unexpected JSX runtime dependency "+id);return React;};\n'+jsx.decode()+'\nexport const Fragment=exports.Fragment,jsx=exports.jsx,jsxs=exports.jsxs;\n')
records.append({'path':'jsx-runtime.js','source':jsx_url,'sourceSha256':sha(jsx),'sha256':sha((OUT/'jsx-runtime.js').read_bytes()),'change':'Static module adapter around upstream production JSX runtime.'})
for name in ['react.js','react-dom.js']:records.append({'path':name,'source':'local adapter to vendored React18.2.0 UMD','sha256':sha((OUT/name).read_bytes()),'change':'Named ESM exports of existing React globals; no second React instance.'})
receipt={'schema':'simulatte.vendoredBrowserModules.v1','package':'@excalidraw/excalidraw','version':VERSION,'archive':{'url':ARCHIVE,'sha512':INTEGRITY},'generator':'tools/simulatte/vendor-study-excalidraw-modern.py','react':'18.2.0, shared UMD globals','runtimeNetwork':'Same-origin only. Upstream CDN fallbacks are disallowed by the browser audit.','compatibilityPatches':[{'id':'layer-shortcut-modifier-priority','asset':'index.js','actions':['sendBackward','bringForward'],'upstreamSource':'https://github.com/excalidraw/excalidraw/blob/v0.18.1/packages/excalidraw/actions/actionZindex.tsx','reason':'Single-step actions must not shadow native Alt/Option front/back actions.'}],'files':sorted(records,key=lambda r:r['path'])}
receipt['compatibilityPatches'].append({'id':'direct-text-rasterization','asset':'chunk-K2UTITRG.js','upstreamSource':'https://github.com/excalidraw/excalidraw/blob/v0.18.1/packages/excalidraw/renderer/renderElement.ts','reason':'Text bypasses nearest-neighbor cached bitmap resampling and draws at the canvas device-pixel ratio and current zoom; shapes and images retain upstream caching.'})
(OUT/'versions.json').write_text(json.dumps(receipt,indent=2,sort_keys=True)+'\n')
print(json.dumps({'version':VERSION,'files':len(records),'dependencies':len(visited),'directory':str(OUT.relative_to(ROOT))}))

import runpy
runpy.run_path(str(ROOT/'tools/simulatte/vendor-study-excalidraw-notices.py'))['collect']()
