import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

export async function sourceReceipt(root) {
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
  const files=[...new Set([
    ...git('diff','--name-only','HEAD','--','public').split('\n'),
    ...git('ls-files','--others','--exclude-standard','--','public').split('\n'),
  ].filter(Boolean))].sort();
  const modifiedSources={};
  for(const file of files){
    try {
      const bytes=await fs.readFile(path.join(root,file)),stat=await fs.stat(path.join(root,file));
      modifiedSources[file]={sha256:createHash('sha256').update(bytes).digest('hex'),modifiedAt:stat.mtime.toISOString()};
    } catch(error) {
      if(error.code!=='ENOENT')throw error;
      modifiedSources[file]={deleted:true};
    }
  }
  return {head:git('rev-parse','HEAD'),capturedAt:new Date().toISOString(),modifiedSources,
    boundary:'Local served public output with this working-tree delta; not a deployed release or physical GPU/acoustic validation.'};
}
