/**
 * One-shot codemod: point every app/component file at '@/lib/rn' instead of
 * 'react-native', so they pick up the custom <Text> (General Sans / Clash).
 *
 * Run once from the repo root:  node scripts/apply-font-imports.mjs
 * It's safe to re-run (idempotent) and fully reversible via git.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const DIRS = ['app', 'components'];
// Must keep the REAL react-native Text (would otherwise import itself):
const EXCLUDE = ['components/ui/app-text.tsx'];

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(p);
  }
  return acc;
}

let changed = 0;
for (const d of DIRS) {
  for (const file of walk(join(ROOT, d))) {
    const rel = file.slice(ROOT.length + 1);
    if (EXCLUDE.some((e) => rel.endsWith(e))) continue;
    const src = readFileSync(file, 'utf8');
    if (!/from ['"]react-native['"]/.test(src)) continue;
    const out = src.replace(/from ['"]react-native['"]/g, "from '@/lib/rn'");
    if (out !== src) {
      writeFileSync(file, out);
      changed++;
      console.log('  •', rel);
    }
  }
}
console.log(`\nDone — updated ${changed} file(s) to import from '@/lib/rn'.`);
