/** Check local site links, fragments and assets in generated HTML. */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(import.meta.dir, 'dist');
const missing = new Set<string>();
const pages = new Map<string, string>();

async function visit(dir: string): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await visit(file);
    else if (entry.name.endsWith('.html')) {
      const html = await readFile(file, 'utf8');
      pages.set(file, html);
      for (const match of html.matchAll(/\b(?:href|src)="(\/funnel\/[^"?#]*)/g)) {
        const url = decodeURIComponent(match[1]);
        const destination = path.resolve(root, '.' + url.slice('/funnel'.length));
        if (!destination.startsWith(root + path.sep) && destination !== root) {
          missing.add(url);
          continue;
        }
        try {
          const info = await stat(destination);
          if (info.isDirectory()) await stat(path.join(destination, 'index.html'));
        } catch { missing.add(url); }
      }
    }
  }
}

await visit(root);
for (const [file, html] of pages) {
  for (const match of html.matchAll(/\bhref="([^"]*#[^"]+)"/g)) {
    const href = match[1];
    const [url, encodedFragment] = href.split('#', 2);
    if (!encodedFragment || (url && !url.startsWith('/funnel/'))) continue;
    const fragment = decodeURIComponent(encodedFragment);
    let destination = url ? path.resolve(root, '.' + decodeURIComponent(url.slice('/funnel'.length))) : file;
    if (destination.startsWith(root + path.sep) || destination === root) {
      try { if ((await stat(destination)).isDirectory()) destination = path.join(destination, 'index.html'); }
      catch { continue; } // The missing path is already reported above.
      const target = pages.get(destination);
      if (target && ![...target.matchAll(/\bid="([^"]+)"/g)].some((id) => id[1] === fragment)) {
        missing.add(`${path.relative(root, file)}: ${href}`);
      }
    }
  }
}
if (missing.size) {
  console.error('Missing site links or assets:\n' + [...missing].sort().join('\n'));
  process.exitCode = 1;
} else console.log('Site links, fragments and assets exist.');
