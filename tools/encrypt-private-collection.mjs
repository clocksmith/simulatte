#!/usr/bin/env node
// Owner: public/simulatte/system-diagram/CATSCAN.md.
// Reads a private JSON input and a local password file; publishes ciphertext only.
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const crypto = createRequire(import.meta.url)('../public/simulatte/system-diagram/private-crypto.js');
const args = process.argv.slice(2), options = {};
for (let i=0;i<args.length;i+=2) {
  if (!['--input','--output','--password-file'].includes(args[i]) || !args[i+1]) throw Error('Use --input PRIVATE.json --output ENCRYPTED.json --password-file LOCAL.txt');
  options[args[i].slice(2)] = path.resolve(args[i+1]);
}
if (Object.keys(options).length !== 3) throw Error('Input, output and password file are required.');
const publicRoot = path.join(root, 'public');
for (const key of ['input','password-file']) {
  const file = fs.existsSync(options[key]) ? fs.realpathSync(options[key]) : options[key];
  if (file === publicRoot || file.startsWith(publicRoot + path.sep)) throw Error(`${key} must remain outside public hosting.`);
}
if (fs.statSync(options.input).size > 4*1024*1024) throw Error('Input exceeds 4 MB.');
const value = JSON.parse(fs.readFileSync(options.input, 'utf8'));
if (value.schema !== 'simulatte.privatePracticeCollection.v1' || typeof value.notesMarkdown !== 'string' || !Array.isArray(value.exercises)) throw Error('Invalid private practice collection.');
if (!fs.existsSync(options['password-file'])) {
  fs.mkdirSync(path.dirname(options['password-file']), {recursive:true, mode:0o700});
  fs.writeFileSync(options['password-file'], randomBytes(24).toString('base64url')+'\n', {flag:'wx', mode:0o600});
}
const password = fs.readFileSync(options['password-file'], 'utf8').trimEnd();
if (!password.length) throw Error('The password file is empty.');
const envelope = await crypto.encrypt(value, password);
const session = await crypto.unlock(envelope, password);
if (JSON.stringify(session.value) !== JSON.stringify(value)) throw Error('Encrypted round trip did not match input.');
session.lock();
fs.mkdirSync(path.dirname(options.output), {recursive:true});
fs.writeFileSync(options.output, JSON.stringify(envelope, null, 2)+'\n');
console.log(`Wrote authenticated ciphertext: ${options.output}`);
console.log(`Password stays in local file: ${options['password-file']}`);
