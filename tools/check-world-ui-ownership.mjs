import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export function forbiddenRules(css) {
  const clean=css.replace(/\/\*[\s\S]*?\*\//g,'');
  return [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(match=>{
    const selector=match[1].trim();if(selector.startsWith('@'))return [];
    const native=/(^|[\s,>+~(])(?:button|select|summary)(?=$|[\s,.#:[>+~)])/i.test(selector);
    const shared=/\.wui-[\w-]+|\[data-wui(?:[\s=\]])/.test(selector);
    if(!native&&!shared)return [];
    const normalized=selector.replace(/\s+/g,' ')+'{'+match[2].replace(/\s+/g,' ').trim()+'}';
    return [{selector,shared,hash:crypto.createHash('sha256').update(normalized).digest('hex')}];
  });
}
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):e.name.endsWith('.css')?[path.join(dir,e.name)]:[]);}
export function inspect(){
  const paths=[...files(path.join(root,'public/simulatte')),path.join(root,'public/styles.css'),path.join(root,'public/world-tiers.css')];
  return paths.flatMap(file=>forbiddenRules(fs.readFileSync(file,'utf8')).map(rule=>({...rule,file:path.relative(root,file)})));
}
export function validate(rows){return rows;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const rows=inspect(),failures=validate(rows);
  for(const row of failures)console.error(`${row.file}: shared World UI must own ${row.selector}`);
  console.log(`World UI ownership: ${failures.length} violations; ${rows.length} page-owned control rules.`);
  if(failures.length)process.exitCode=1;
}
