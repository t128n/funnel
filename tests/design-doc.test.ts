import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const doc = readFileSync(join(root, 'docs/DESIGN.md'), 'utf8');

describe('DESIGN.md', () => {
  test('documents Bootstrap and Sveltestrap as the UI foundation', () => {
    expect(doc).toContain('Bootstrap 5');
    expect(doc).toContain('Sveltestrap');
    expect(doc).toContain('Bootstrap Icons');
    expect(doc).toContain('src/lib/styles/app.css');
  });

  test('documents the shell and layout conventions', () => {
    expect(doc).toContain('navbar-dark bg-dark');
    expect(doc).toContain('container-xl');
    expect(doc).toContain('container-lg');
    expect(doc).toContain('IssueDetailPage');
    expect(doc).toContain('IssueTable');
    expect(doc).toContain('InboxTable');
    expect(doc).toContain('no persistent application sidebar');
    expect(doc).toContain('col-lg-8');
    expect(doc).toContain('18rem');
  });

  test('documents the shared application components', () => {
    expect(doc).toContain('PageHeader');
    expect(doc).toContain('StatusText');
    expect(doc).toContain('PriorityText');
    expect(doc).toContain('InlineStatus');
    expect(doc).toContain('EmptyState');
  });

  test('uses the current vocabulary and no retired design system', () => {
    expect(doc).toContain('issue');
    expect(doc).toContain('P1');
    expect(doc).not.toContain('t128n');
    expect(doc).not.toContain('shadcn');
    expect(doc).not.toContain('Tailwind');
    expect(doc).not.toContain('bits-ui');
    expect(doc).not.toContain('Lucide');
  });
});
