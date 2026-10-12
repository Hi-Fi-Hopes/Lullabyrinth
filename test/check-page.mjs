// Fails the build if the app page's inline script doesn't parse.
import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync(new URL('../app/src/main/assets/index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (!scripts.length) { console.error('no inline script found'); process.exit(1); }
for (const [i, code] of scripts.entries()) new vm.Script(code, { filename: `index.html#script${i}` });
new vm.Script(fs.readFileSync(new URL('../app/src/main/assets/engine.js', import.meta.url), 'utf8'), { filename: 'engine.js' });
console.log('page scripts parse OK');
