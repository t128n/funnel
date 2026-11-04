import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { placeMenu } from './fixed-menu';

const viewport = { width: 1440, height: 900 };
const menu = { width: 224, height: 373 };

describe('placeMenu', () => {
	test('opens below the trigger when there is room', () => {
		const placement = placeMenu({ top: 300, bottom: 328, right: 400 }, menu, viewport);
		expect(placement.top).toBe(332);
		expect(placement.left).toBe(176);
		expect(placement.maxHeight).toBe(884);
	});

	test('flips above the trigger near the bottom of the viewport', () => {
		const placement = placeMenu({ top: 820, bottom: 848, right: 400 }, menu, viewport);
		expect(placement.top).toBe(443);
	});

	test('stays inside the right and left viewport gutters', () => {
		const right = placeMenu({ top: 100, bottom: 128, right: 1438 }, menu, viewport);
		expect(right.left).toBe(1208);
		const left = placeMenu({ top: 100, bottom: 128, right: 100 }, menu, viewport);
		expect(left.left).toBe(8);
	});

	test('caps an oversized menu to the viewport and scrolls it', () => {
		const short = { width: 390, height: 320 };
		const placement = placeMenu({ top: 180, bottom: 208, right: 380 }, menu, short);
		expect(placement.maxHeight).toBe(304);
		expect(placement.top).toBe(8);
	});
});

describe('fixedMenu', () => {
	const source = readFileSync(new URL('./fixed-menu.ts', import.meta.url), 'utf8');

	test('moves the menu out of the lane and closes on Escape', () => {
		expect(source).toContain('document.body.appendChild(node)');
		expect(source).toContain("event.key !== 'Escape'");
		expect(source).toContain("document.addEventListener('pointerdown'");
	});
});
