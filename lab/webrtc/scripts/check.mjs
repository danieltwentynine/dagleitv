// Syntax-check every lab script without running it (node --check parses ES modules).
// Browser globals are not executed, so DOM code is fine here.
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name === 'certs') continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(m?js)$/.test(name)) files.push(p);
  }
})(root);

let failed = 0;
for (const file of files) {
  try {
    // Browser modules are .js in a "type": "module" package, so Node parses them as ES modules.
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    failed++;
    console.error(`✖ ${file}\n${err.stderr?.toString() ?? err.message}`);
  }
}
console.log(`${files.length - failed}/${files.length} files parse${failed ? ` · ${failed} failed` : ''}`);
process.exit(failed ? 1 : 0);
