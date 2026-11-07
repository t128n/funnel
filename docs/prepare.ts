/** Generate the Starlight content tree from the canonical repository Markdown. */
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = import.meta.dir;
const target = path.join(root, 'src/content/docs');
const sections = ['tutorials', 'how-to', 'reference', 'explanation'];
const base = '/funnel/';
const assets = new Set<string>();

async function visit(directory: string): Promise<void> {
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(relative);
    // This is a historical research note, not current product explanation.
    else if (entry.name.endsWith('.md') && relative !== 'explanation/forges-migration-assessment.md') await convert(relative);
  }
}

async function convert(relative: string, output = relative): Promise<void> {
  const source = await readFile(path.join(root, relative), 'utf8');
  const title = source.match(/^#\s+(.+)$/m)?.[1];
  if (!title) throw new Error(`Missing title: ${relative}`);
  let inFence = false;
  const body = source.replace(/^#\s+.+\n/, '').split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return line; }
    if (inFence) return line;
    const withVideoSources = line.replace(/(<video\b[^>]*\bsrc=")([^"]+)(")/g, (match, prefix, href, suffix) => {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relative), href));
      if (!resolved.startsWith('assets/')) return match;
      assets.add(resolved);
      return prefix + base + resolved + suffix;
    });
    return withVideoSources.replace(/(!?\[[^\]]*\]\()([^\s)]+)(\))/g, (match, prefix, href, suffix) => {
      if (/^(?:[a-z]+:|\/|#)/i.test(href)) return match;
      const [pathname, fragment] = href.split('#', 2);
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relative), pathname));
      let url: string;
      if (resolved.startsWith('assets/')) { assets.add(resolved); url = base + resolved; }
      else if (sections.some((section) => resolved.startsWith(section + '/')) && resolved.endsWith('.md')) {
        url = base + resolved.slice(0, -3) + '/';
      } else {
        url = 'https://github.com/t128n/funnel/blob/main/' + (resolved.startsWith('../') ? resolved.slice(3) : 'docs/' + resolved);
      }
      return prefix + url + (fragment ? '#' + fragment : '') + suffix;
    });
  }).join('\n');
  const destination = path.join(target, output);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, `---\ntitle: ${JSON.stringify(title)}\n---\n${body}`);
}

// These directories contain generated output only; remove stale pages and assets.
await rm(target, { recursive: true, force: true });
await rm(path.join(root, 'public/assets'), { recursive: true, force: true });
await mkdir(target, { recursive: true });
await convert('home.md', 'index.md');
for (const section of sections) await visit(section);
await mkdir(path.join(root, 'public'), { recursive: true });
await cp(path.join(root, '../static/favicon.svg'), path.join(root, 'public/favicon.svg'));
for (const asset of assets) {
  const destination = path.join(root, 'public', asset);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(root, asset), destination);
}
