// Compatibility entry; live release verification is owned by repository release tools.
import { main } from '../verify-hosting-release.mjs';
const args = process.argv.slice(2);
if (args.some(arg => arg.startsWith('--base-url=')) && !args.some(arg => arg.startsWith('--surface='))) args.push('--surface=world');
main(args).catch(error => { console.error(error.message); process.exitCode = 1; });
