#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
const builder=path.join(root,'tools/interstellar-relay/fetch-stellar-relay-data.mjs');
const result=spawnSync(process.execPath,[builder,...process.argv.slice(2)],{stdio:'inherit',cwd:root});
if(result.error)throw result.error;
process.exit(result.status??1);
