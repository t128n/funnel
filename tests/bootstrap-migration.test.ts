import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (/\.(svelte|ts)$/.test(entry)) files.push(path);
  }
  return files;
}

const sourceFiles = walk(join(root, 'src'));
const appCss = readFileSync(join(root, 'src/lib/styles/app.css'), 'utf8');
const appHtml = readFileSync(join(root, 'src/app.html'), 'utf8');
const layout = readFileSync(join(root, 'src/routes/+layout.svelte'), 'utf8');

describe('Bootstrap migration', () => {
  test('installs Bootstrap, Sveltestrap, and Bootstrap Icons', () => {
    expect(pkg.dependencies?.['bootstrap']).toBeDefined();
    expect(pkg.dependencies?.['@sveltestrap/sveltestrap']).toBeDefined();
    expect(pkg.dependencies?.['bootstrap-icons']).toBeDefined();
  });

  test('removes the retired design-system dependencies', () => {
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const retired of [
      'tailwindcss',
      '@tailwindcss/vite',
      'shadcn-svelte',
      'bits-ui',
      '@lucide/svelte',
      'tailwind-variants',
      'tw-animate-css'
    ]) {
      expect(all[retired]).toBeUndefined();
    }
  });

  test('loads Bootstrap CSS and icons once at the root', () => {
    expect(layout).toContain('bootstrap/dist/css/bootstrap.min.css');
    expect(layout).toContain('bootstrap-icons/font/bootstrap-icons.css');
    expect(layout).toContain('#lib/styles/app.css');
  });

  test('dark mode is driven by data-bs-theme', () => {
    expect(appHtml).toContain('data-bs-theme');
    expect(appCss).toContain('--bs-body-bg');
    expect(appCss).toContain('--bs-border-color');
  });

  test('no source imports the retired UI layer or icon library', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      if (source.includes('#lib/components/ui')) offenders.push(`${file}: ui primitive`);
      if (source.includes('@lucide/svelte')) offenders.push(`${file}: lucide`);
      if (/from ['"]#lib\/utils['"]/.test(source)) offenders.push(`${file}: cn util`);
    }
    expect(offenders).toEqual([]);
  });

  test('the old token, theme, and shadcn files are gone', () => {
    const styles = readdirSync(join(root, 'src/lib/styles'));
    expect(styles).not.toContain('tokens.css');
    expect(styles).not.toContain('theme.css');
    expect(styles).not.toContain('global.css');
    expect(() => readFileSync(join(root, 'components.json'))).toThrow();
  });
});
