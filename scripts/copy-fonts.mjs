// Copies the two typefaces out of node_modules so the app works with no signal.
import { readdirSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const out = 'www/fonts'; mkdirSync(out, { recursive: true });
function pick(dir, prefs) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter(f => f.endsWith('.woff2') && f.includes('-latin-') && !f.includes('latin-ext'));
  for (const p of prefs) { const hit = files.find(f => f.includes(p)); if (hit) return join(dir, hit); }
  return files[0] ? join(dir, files[0]) : null;
}
const vt = pick('node_modules/@fontsource/vt323/files', ['latin-400-normal']);
const mm = pick('node_modules/@fontsource-variable/martian-mono/files', ['latin-full-normal', 'latin-wdth-normal', 'latin-wght-normal', 'normal']);
if (vt) copyFileSync(vt, join(out, 'vt323.woff2')); else console.warn('VT323 not found');
if (mm) copyFileSync(mm, join(out, 'martian.woff2')); else console.warn('Martian Mono not found');
console.log('fonts:', vt, mm);
