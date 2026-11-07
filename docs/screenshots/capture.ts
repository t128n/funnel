/** Capture guide images from a fresh, isolated Funnel demo. Run from any directory. */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, copyFile, access, readFile, readdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const assets = path.join(root, 'docs/assets/screenshots');
type Step = { action: string; path?: string; selector?: string; text?: string; file?: string; state?: string; value?: string };
type Scenario = { id: string; guides: string[]; mode?: 'demo' | 'fresh'; steps: Step[] };
const manifest = JSON.parse(await readFile(path.join(root, 'docs/screenshots/manifest.json'), 'utf8')) as Scenario[];
const args = process.argv.slice(2);
const command = args.shift();
const exists = async (p: string) => access(p).then(() => true, () => false);
const outputPattern = /^[a-z0-9-]+\/\d{2}-[a-z0-9-]+-[a-z0-9-]+\.png$/;
const ids = new Set<string>();
const planned = new Set<string>();
for (const scenario of manifest) {
  if (!/^[a-z0-9-]+$/.test(scenario.id) || ids.has(scenario.id)) throw new Error(`Invalid or duplicate scenario: ${scenario.id}`);
  ids.add(scenario.id);
  if (scenario.mode && !['demo', 'fresh'].includes(scenario.mode)) throw new Error(`Invalid mode: ${scenario.mode}`);
  if (!scenario.guides.length || !scenario.steps.some(s => s.action === 'capture')) throw new Error(`Scenario ${scenario.id} needs guides and captures`);
  for (const guide of scenario.guides) if (!/^docs\/(tutorials|how-to|reference|explanation)\/[a-z0-9/-]+\.md$/.test(guide)) throw new Error(`Invalid guide: ${guide}`);
  for (const step of scenario.steps) if (step.action === 'capture') {
    if (!step.file || !step.state || !outputPattern.test(step.file) || !step.file.startsWith(scenario.id + '/')) throw new Error(`Invalid capture in ${scenario.id}`);
    if (planned.has(step.file)) throw new Error(`Duplicate output: ${step.file}`);
    planned.add(step.file);
  }
}

async function check() {
  let errors = 0;
  for (const scenario of manifest) {
    const guides = await Promise.all(scenario.guides.map(async name => ({ name, text: await readFile(path.join(root, name), 'utf8') })));
    for (const capture of scenario.steps.filter(s => s.action === 'capture')) {
      const file = capture.file!;
      if (!(await exists(path.join(assets, file)))) { console.error(`Missing: ${file}`); errors++; }
      if (!guides.some(guide => {
        const relative = path.relative(path.dirname(path.join(root, guide.name)), path.join(assets, file)).split(path.sep).join('/');
        return guide.text.includes(`](${relative})`);
      })) { console.error(`Unreferenced in mapped guides: ${file}`); errors++; }
    }
  }
  async function walk(dir: string): Promise<void> {
    if (!(await exists(dir))) return;
    for (const ent of await readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) await walk(p);
      else if (outputPattern.test(path.relative(assets, p).split(path.sep).join('/')) && !planned.has(path.relative(assets, p).split(path.sep).join('/'))) {
        console.error(`Unmanifested image: ${path.relative(assets, p)}`); errors++;
      }
    }
  }
  // Only the generated naming convention is checked; legacy images are untouched.
  await walk(assets);
  if (errors) process.exitCode = 1;
  else console.log('Screenshot manifest, images and guide references agree.');
}

async function capture(id: string, replace: boolean) {
  const scenario = manifest.find((item) => item.id === id);
  if (!scenario) throw new Error(`Unknown scenario: ${id}`);
  const captures = scenario.steps.filter(s => s.action === 'capture');
  for (const item of captures) {
    if (!replace && await exists(path.join(assets, item.file!))) throw new Error(`Refusing to overwrite ${item.file}; use --replace after review`);
  }
  const temp = await mkdtemp('/tmp/opencode/funnel-guide-shots-');
  await writeFile(path.join(temp, 'browser-config.json'), '{}');
  const session = `funnel-shots-${crypto.randomUUID()}`;
  const port = '5198';
  const url = `http://127.0.0.1:${port}`;
  // Do not inherit Funnel/GitHub credentials, database paths, proxies or .env overrides.
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8', TZ: 'UTC', FUNNEL_DEMO: scenario.mode === 'fresh' ? '0' : '1', FUNNEL_DB: path.join(temp, 'demo.db'), FUNNEL_UPLOAD_DIR: path.join(temp, 'uploads'), FUNNEL_SECRET: 'demo-only-secret-0123456789abcdef0123456789abcdef', FUNNEL_URL: scenario.mode === 'fresh' ? 'https://funnel.example.com' : url, GITHUB_URL: scenario.mode === 'fresh' ? 'http://127.0.0.1:9' : 'https://github.com', GITHUB_API_URL: 'http://127.0.0.1:9', LOG_LEVEL: 'warn' };
  if (scenario.mode === 'fresh') {
    const { runMigrations } = await import('../../src/lib/server/db/release');
    runMigrations({ dbPath: env.FUNNEL_DB, migrationsFolder: path.join(root, 'drizzle') });
  }
  const server = spawn('bun', ['--bun', 'vite', 'dev', '--host', '127.0.0.1', '--port', port, '--strictPort'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverOutput = '';
  server.stdout.on('data', (data) => { serverOutput += data; });
  server.stderr.on('data', (data) => { serverOutput += data; });
  const browser = (...parts: string[]) => {
    const result = spawnSync('agent-browser', ['--config', path.join(temp, 'browser-config.json'), '--session', session, '--no-webmcp', ...parts], { cwd: root, env: { ...env, AGENT_BROWSER_NO_VERSION_CHECK: '1' }, encoding: 'utf8', timeout: 45000 });
    if (result.status !== 0) throw new Error(`agent-browser ${parts.join(' ')} failed: ${result.stderr || result.stdout || result.error}`);
    return result.stdout;
  };
  try {
    // Vite prints this only after it owns the strict port; never attach to an existing service.
    for (let i = 0; i < 200 && !serverOutput.includes('Local:'); i++) {
      if (server.exitCode !== null) throw new Error(`Demo server exited: ${serverOutput}`);
      await Bun.sleep(100);
    }
    if (!serverOutput.includes('Local:')) throw new Error(`Demo server did not start: ${serverOutput}`);
    browser('open');
    browser('set', 'viewport', '1440', '900', '1');
    browser('set', 'media', 'light');
    browser('open', `${url}/inbox`);
    browser('storage', 'local', 'set', 'funnel:theme', 'light');
    browser('reload');
    for (const step of scenario.steps) {
      const required = (value: string | undefined) => { if (!value) throw new Error(`Missing field for ${step.action} in ${id}`); return value; };
      switch (step.action) {
        case 'open': {
          const route = required(step.path);
          if (!route.startsWith('/') || route.startsWith('//') || route.includes('\\')) throw new Error(`Invalid local route: ${route}`);
          browser('open', url + route); break;
        }
        case 'wait': browser('wait', required(step.selector)); break;
        case 'wait-text': browser('wait', '--text', required(step.text)); break;
        case 'wait-fn': browser('wait', '--fn', required(step.value)); break;
        case 'click': browser('click', required(step.selector)); break;
        case 'click-text': browser('find', 'text', required(step.text), 'click', '--exact'); break;
        case 'fill': browser('fill', required(step.selector), required(step.value)); break;
        case 'select': browser('select', required(step.selector), required(step.value)); break;
        case 'scroll': browser('scrollintoview', required(step.selector)); break;
        case 'scroll-to-selector': {
          const selector = required(step.selector);
          browser('wait', selector);
          browser('eval', `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block: 'start', behavior: 'instant'})`);
          browser('wait', '--fn', `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return false; const r = e.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight && r.bottom > 0; })()`);
          break;
        }
        case 'click-text-until': {
          const selector = required(step.selector);
          for (let attempt = 0; attempt < 20; attempt++) {
            if (Number(browser('get', 'count', selector).trim()) > 0) { browser('wait', selector); break; }
            browser('find', 'text', required(step.text), 'click', '--exact');
            await Bun.sleep(250);
            if (attempt === 19) throw new Error(`Expected state did not appear: ${selector}`);
          }
          break;
        }
        case 'click-expanded': {
          const selector = required(step.selector);
          // SSR can render controls before Svelte attaches their handlers.
          for (let attempt = 0; attempt < 20; attempt++) {
            if (browser('get', 'attr', selector, 'aria-expanded').trim() === 'true') break;
            browser('click', selector);
            if (attempt === 19) throw new Error(`Control did not expand: ${selector}`);
            await Bun.sleep(250);
          }
          break;
        }
        case 'capture': browser('screenshot', path.join(temp, path.basename(required(step.file)))); break;
        default: throw new Error(`Unknown action ${step.action} in ${id}`);
      }
    }
    // Stage the complete scenario before publishing anything to the assets tree.
    for (const item of captures) {
      const dest = path.join(assets, item.file!);
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(path.join(temp, path.basename(item.file!)), dest, replace ? 0 : constants.COPYFILE_EXCL);
      console.log(`Captured ${path.relative(root, dest)}`);
    }
  } finally {
    try { browser('close'); } catch { /* The browser may not have started. */ }
    server.kill('SIGTERM');
    await new Promise<void>((resolve) => server.exitCode !== null ? resolve() : server.once('exit', () => resolve()));
    await rm(temp, { recursive: true, force: true });
  }
}

try {
  if (command === 'check' && args.length === 0) await check();
  else if (command === 'list' && args.length === 0) {
    for (const scenario of manifest) for (const capture of scenario.steps.filter(s => s.action === 'capture')) {
      console.log(`${capture.file} -> ${scenario.guides.join(' | ')}`);
    }
  }
  else if (command === 'capture') {
    const replace = args.includes('--replace');
    const targets = args.filter((arg) => arg !== '--replace');
    if (targets.length !== 1) throw new Error('Choose one scenario ID or all');
    for (const item of targets[0] === 'all' ? manifest : [{ id: targets[0] }]) await capture(item.id, replace);
  } else throw new Error('Usage: bun docs/screenshots/capture.ts check | list | capture <scenario|all> [--replace]');
} catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
