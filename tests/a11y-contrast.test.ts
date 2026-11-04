import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');

function source(path: string): string {
	return readFileSync(join(root, path), 'utf8');
}

const appCss = source('src/lib/styles/app.css');
const shell = source('src/lib/components/shell/AppShell.svelte');
const composer = source('src/lib/components/detail/Composer.svelte');
const bootstrap = source('node_modules/bootstrap/dist/css/bootstrap.css');

const DARK_CANVAS = '#212529';

type Rgb = { r: number; g: number; b: number; a: number };

/** Read a Bootstrap token from the light or dark theme block. */
function token(theme: 'light' | 'dark', name: string): string {
	const darkStart = bootstrap.indexOf('[data-bs-theme=dark] {');
	const block =
		theme === 'dark'
			? bootstrap.slice(darkStart, darkStart + bootstrap.slice(darkStart).indexOf('}'))
			: bootstrap.slice(0, darkStart);
	const match = block.match(new RegExp(`${name}:\\s*([^;]+);`));
	if (!match) throw new Error(`Missing Bootstrap token ${name} (${theme})`);
	return match[1].trim();
}

function parse(value: string): Rgb {
	if (value.startsWith('#')) {
		const hex = value.slice(1);
		return {
			r: parseInt(hex.slice(0, 2), 16),
			g: parseInt(hex.slice(2, 4), 16),
			b: parseInt(hex.slice(4, 6), 16),
			a: 1
		};
	}
	const parts = value.match(/[\d.]+/g)?.map(Number) ?? [];
	return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
}

function over(foreground: Rgb, background: Rgb): Rgb {
	return {
		r: foreground.r * foreground.a + background.r * (1 - foreground.a),
		g: foreground.g * foreground.a + background.g * (1 - foreground.a),
		b: foreground.b * foreground.a + background.b * (1 - foreground.a),
		a: 1
	};
}

function luminance(color: Rgb): number {
	const [r, g, b] = [color.r, color.g, color.b].map((channel) => {
		const value = channel / 255;
		return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: Rgb, background: Rgb): number {
	const first = luminance(foreground);
	const second = luminance(background);
	return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe('dark-mode semantic text', () => {
	test('success and danger tokens clear 4.5:1 on the dark canvas', () => {
		for (const name of ['--bs-success-text-emphasis', '--bs-danger-text-emphasis']) {
			const ratio = contrast(parse(token('dark', name)), parse(DARK_CANVAS));
			expect({ name, ratio: ratio >= 4.5 }).toEqual({ name, ratio: true });
		}
	});

	test('the app maps the utilities to those theme-aware tokens', () => {
		expect(appCss).toContain("[data-bs-theme='dark'] .text-success");
		expect(appCss).toContain('var(--bs-success-text-emphasis)');
		expect(appCss).toContain("[data-bs-theme='dark'] .text-danger");
		expect(appCss).toContain('var(--bs-danger-text-emphasis)');
	});
});

describe('dark-mode secondary outline controls', () => {
	test('the enabled colour clears 4.5:1 on the dark canvas', () => {
		const ratio = contrast(parse(token('dark', '--bs-secondary-text-emphasis')), parse(DARK_CANVAS));
		expect(ratio >= 4.5).toBe(true);
	});

	test('the app overrides only the dark outline-secondary token set', () => {
		expect(appCss).toContain("[data-bs-theme='dark'] .btn-outline-secondary");
		expect(appCss).toContain('--bs-btn-color: var(--bs-secondary-text-emphasis)');
	});
});

describe('composer shortcut hint', () => {
	test('the muted chip clears 4.5:1 in both themes', () => {
		for (const theme of ['light', 'dark'] as const) {
			const background = parse(token(theme, '--bs-tertiary-bg'));
			const foreground = over(parse(token(theme, '--bs-secondary-color')), background);
			const ratio = contrast(foreground, background);
			expect({ theme, ratio: ratio >= 4.5 }).toEqual({ theme, ratio: true });
		}
	});

	test('the composer uses the theme-aware chip instead of body-secondary text', () => {
		expect(composer).toContain('class="composer-kbd');
		expect(composer).not.toContain('text-body-secondary" aria-hidden="true"');
		expect(composer).toContain('background: var(--bs-tertiary-bg)');
	});
});

describe('skip link', () => {
	test('keeps visually-hidden-focusable but adds a stacking context above the navbar', () => {
		expect(shell).toContain('class="skip-link visually-hidden-focusable"');
		const focusRule = appCss.slice(appCss.indexOf('.skip-link:focus'));
		expect(focusRule).toContain('position: fixed');
		expect(focusRule).toContain('z-index: 1035');
		expect(focusRule).toContain('outline: 3px solid var(--bs-emphasis-color)');
	});
});
