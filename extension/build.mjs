// يبني نسختين من نفس المصدر: dist/chrome و dist/firefox، مع ملف zip لكل منهما.
// المصدر نفسه (manifest.json فيه المفتاحان) يُحمَّل مباشرة في المتصفحين أثناء التطوير.
//   node extension/build.mjs
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
const files = ['manifest.json', 'popup.html', 'options.html', 'src', 'assets', 'fonts', 'data'];
const base = JSON.parse(readFileSync(join(here, 'manifest.json'), 'utf8'));

const targets = {
  chrome: (m) => {
    m.background = { service_worker: m.background.service_worker };
    delete m.browser_specific_settings;
    return m;
  },
  firefox: (m) => {
    m.background = { scripts: m.background.scripts };
    return m;
  },
};

rmSync(dist, { recursive: true, force: true });
for (const [name, adapt] of Object.entries(targets)) {
  const out = join(dist, name);
  mkdirSync(out, { recursive: true });
  for (const f of files) cpSync(join(here, f), join(out, f), { recursive: true });
  const manifest = adapt(structuredClone(base));
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const zip = join(dist, `feniq-order-catcher-${name}-${base.version}.zip`);
  execFileSync('zip', ['-qr', '-X', zip, '.'], { cwd: out });
  console.log('✓', zip.replace(here + '/', ''));
}
