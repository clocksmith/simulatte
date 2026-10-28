#!/usr/bin/env python3
"""Retain upstream license notices for each published dependency and font family."""
import concurrent.futures, hashlib, io, json, pathlib, re, tarfile, urllib.request, urllib.error
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'public/simulatte/system-diagram/study/vendor/modern'
CACHE=pathlib.Path.home()/'.local/state/deco/excalidraw-esm-cache'
def download(url):
 CACHE.mkdir(parents=True,exist_ok=True);p=CACHE/hashlib.sha256(url.encode()).hexdigest()
 if not p.exists():
  with urllib.request.urlopen(url,timeout=30) as r:p.write_bytes(r.read())
 return p.read_bytes()
def collect():
 receipt=json.loads((OUT/'versions.json').read_text());receipt['files']=[row for row in receipt['files'] if not row['path'].startswith('notices/')];packages={}
 for row in receipt['files']:
  m=re.match(r'https://cdn.jsdelivr.net/npm/((?:@[^/]+/)?[^/@]+)@([^/]+)/',row['source'])
  if m:packages[m[1]+'@'+m[2]]=(m[1],m[2])
 packages['@excalidraw/excalidraw@0.18.1']=('@excalidraw/excalidraw','0.18.1')
 notices=OUT/'notices';notices.mkdir(exist_ok=True)
 def package(item):
  key,(name,version)=item
  metadata_url='https://registry.npmjs.org/'+name+'/'+version
  meta=json.loads(download(metadata_url));archive_url=meta['dist']['tarball'];archive=tarfile.open(fileobj=io.BytesIO(download(archive_url)),mode='r:gz')
  members=[m for m in archive.getmembers() if m.isfile() and re.match(r'^(?:package/)?(?:LICEN[CS]E|COPYING|NOTICE)[^/]*$',m.name,re.I)]
  rows=[]
  for m in members:
   data=archive.extractfile(m).read();filename=re.sub('[^A-Za-z0-9._-]','_',key)+'-'+m.name.split('/')[-1];(notices/filename).write_bytes(data);rows.append({'path':'notices/'+filename,'source':archive_url+'#'+m.name,'sha256':hashlib.sha256(data).hexdigest(),'change':'Unmodified upstream license notice.'})
  if not rows:
   repo=meta.get('repository',{});repo=repo.get('url','') if isinstance(repo,dict) else repo
   match=re.search(r'github.com[/:]([^/]+/[^/.]+)(?:\.git)?$',repo);commit=meta.get('gitHead')
   if match and commit:
    for filename in ['LICENSE','LICENSE.md','LICENSE.txt','LICENCE']:
     url='https://raw.githubusercontent.com/'+match[1]+'/'+commit+'/'+filename
     try:data=download(url)
     except urllib.error.HTTPError:continue
     local=re.sub('[^A-Za-z0-9._-]','_',key)+'-'+filename;(notices/local).write_bytes(data);rows.append({'path':'notices/'+local,'source':url,'sha256':hashlib.sha256(data).hexdigest(),'change':'Unmodified upstream notice at the exact npm release gitHead.'});break
  if not rows:
   # The Excalidraw npm release excludes its root LICENSE; fetch the matching release tag.
   if name=='@excalidraw/excalidraw':
    url='https://raw.githubusercontent.com/excalidraw/excalidraw/v'+version+'/LICENSE';data=download(url);filename='excalidraw-LICENSE';(notices/filename).write_bytes(data);rows.append({'path':'notices/'+filename,'source':url,'sha256':hashlib.sha256(data).hexdigest(),'change':'Unmodified upstream license notice.'})
   else:
    data=download(metadata_url);filename=re.sub('[^A-Za-z0-9._-]','_',key)+'-package-metadata.json';(notices/filename).write_bytes(data);rows.append({'path':'notices/'+filename,'source':metadata_url,'sha256':hashlib.sha256(data).hexdigest(),'change':'Upstream release contains no root license notice; retained complete license metadata.'})
  return {'package':key,'license':meta.get('license'), 'archiveIntegrity':meta['dist'].get('integrity'), 'files':rows,'hasTextNotice':any(not r['path'].endswith('metadata.json') for r in rows)}
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(package,sorted(packages.items())))
 # Keep upstream's embedded font notices in readable form as well as in the font assets.
 font_rows=[]
 for family in ['Assistant','Cascadia','ComicShanns','Excalifont','Liberation','Lilita','Nunito','Virgil','Xiaolai']:
  url='https://raw.githubusercontent.com/excalidraw/excalidraw/v0.18.1/packages/excalidraw/fonts/'+family+'/index.ts'
  try:source=download(url)
  except urllib.error.HTTPError:source=b''
  comments=[m[0] for m in re.finditer(rb'/\*[\s\S]*?\*/',source) if re.search(rb'copyright|licen[cs]e|OFL',m[0],re.I)]
  if comments:
   data=b'\n\n'.join(comments)+b'\n';filename='font-'+family+'-upstream-notices.txt';(notices/filename).write_bytes(data);font_rows.append({'path':'notices/'+filename,'source':url,'sourceSha256':hashlib.sha256(source).hexdigest(),'sha256':hashlib.sha256(data).hexdigest(),'change':'Extracted upstream copyright/license comments, unchanged.'})
 font_urls={
  'Assistant':'https://raw.githubusercontent.com/google/fonts/main/ofl/assistant/OFL.txt',
  'Cascadia':'https://raw.githubusercontent.com/microsoft/cascadia-code/main/LICENSE',
  'Lilita':'https://raw.githubusercontent.com/google/fonts/main/ofl/lilitaone/OFL.txt',
  'Nunito':'https://raw.githubusercontent.com/google/fonts/main/ofl/nunito/OFL.txt',
  'Virgil':'https://raw.githubusercontent.com/excalidraw/virgil/main/LICENSE',
  'Xiaolai':'https://raw.githubusercontent.com/lxgw/kose-font/master/OFL.txt',
 }
 for family,url in font_urls.items():
  try:data=download(url)
  except urllib.error.HTTPError:continue
  filename='font-'+family+'-LICENSE.txt';(notices/filename).write_bytes(data);font_rows.append({'path':'notices/'+filename,'source':url,'sha256':hashlib.sha256(data).hexdigest(),'change':'Unmodified font license from its upstream project.'})
 for row in results:receipt['files'].extend(row['files'])
 receipt['files'].extend(font_rows);receipt['files'].sort(key=lambda r:r['path']);receipt['licenses']=[{k:v for k,v in row.items() if k!='files'} for row in results];receipt['noticeGenerator']='tools/simulatte/vendor-study-excalidraw-notices.py'
 allowed={r['path'] for r in receipt['files']}
 for file in notices.iterdir():
  if file.is_file() and 'notices/'+file.name not in allowed:file.unlink()
 (OUT/'versions.json').write_text(json.dumps(receipt,indent=2,sort_keys=True)+'\n')
 print(json.dumps({'licensePackages':len(results),'fontLicenses':len(font_rows),'metadataOnly':[r['package'] for r in results if not r['hasTextNotice']]}))
if __name__=='__main__':collect()
