/**
 * Generate the raster icon set from the Funnel mark.
 *
 * The repo has no image/rasterizer dependency, so this is a tiny, dependency-free
 * PNG encoder plus a supersampled shape rasterizer. It draws the same mark as
 * `static/favicon.svg`: a rounded primary-coloured tile with a white funnel.
 *
 * Usage:  bun scripts/generate-icons.ts
 * Output: static/favicon.ico, static/apple-touch-icon.png,
 *         static/icon-192.png, static/icon-512.png
 *
 * The outputs are committed, so this only has to run when the mark changes.
 * `favicon.svg` and `site.webmanifest` are hand-written and not emitted here.
 */
import { deflateSync } from "node:zlib";
import { join } from "node:path";
import { writeFileSync } from "node:fs";

const ROOT = process.cwd();
const STATIC = join(ROOT, "static");

/** Design tokens, kept in sync with the icon SVG and the app's `--primary`. */
const PRIMARY = [0x35, 0x74, 0xf0] as const;
const WHITE = [0xff, 0xff, 0xff] as const;

/** Corner radius as a fraction of the tile size (matches the SVG `rx="7"`). */
const RADIUS_RATIO = 7 / 32;

/**
 * The funnel silhouette in unit coordinates, a simple wide-top/stem shape.
 * Rasterized with an even-odd polygon test (anti-aliased by supersampling).
 */
const FUNNEL: ReadonlyArray<[number, number]> = [
	[0.24, 0.28],
	[0.76, 0.28],
	[0.6, 0.5],
	[0.6, 0.74],
	[0.4, 0.74],
	[0.4, 0.5],
];

// ---- PNG encoding ---------------------------------------------------------

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n += 1) {
		let c = n;
		for (let k = 0; k < 8; k += 1) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(buf: Buffer): number {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i += 1) {
		c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	}
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length, 0);
	const typeBuf = Buffer.from(type, "ascii");
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
	return Buffer.concat([length, typeBuf, data, crc]);
}

/** Encode an RGBA pixel buffer as a PNG. */
function encodePng(size: number, rgba: Buffer): Buffer {
	const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // colour type: RGBA
	ihdr[10] = 0; // compression
	ihdr[11] = 0; // filter
	ihdr[12] = 0; // interlace

	// One filter byte (0 = none) per scanline.
	const raw = Buffer.alloc((size * 4 + 1) * size);
	for (let y = 0; y < size; y += 1) {
		const rowStart = y * (size * 4 + 1);
		raw[rowStart] = 0;
		rgba.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
	}

	return Buffer.concat([
		signature,
		chunk("IHDR", ihdr),
		chunk("IDAT", deflateSync(raw, { level: 9 })),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

// ---- Rasterizing ----------------------------------------------------------

interface Shade {
	r: number;
	g: number;
	b: number;
	a: number;
}

function insideFunnel(x: number, y: number): boolean {
	// Standard even-odd ray cast in unit space.
	let inside = false;
	for (let i = 0, j = FUNNEL.length - 1; i < FUNNEL.length; j = i, i += 1) {
		const [xi, yi] = FUNNEL[i];
		const [xj, yj] = FUNNEL[j];
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
			inside = !inside;
		}
	}
	return inside;
}

function insideRoundedTile(px: number, py: number, size: number, radius: number): boolean {
	const cx = Math.min(Math.max(px, radius), size - radius);
	const cy = Math.min(Math.max(py, radius), size - radius);
	const dx = px - cx;
	const dy = py - cy;
	return dx * dx + dy * dy <= radius * radius;
}

/** The colour at one sub-sample, or null when fully transparent. */
function sample(px: number, py: number, size: number, full: boolean): [number, number, number] | null {
	if (insideFunnel(px / size, py / size)) return [WHITE[0], WHITE[1], WHITE[2]];
	if (full) return [PRIMARY[0], PRIMARY[1], PRIMARY[2]];
	const radius = RADIUS_RATIO * size;
	if (insideRoundedTile(px, py, size, radius)) {
		return [PRIMARY[0], PRIMARY[1], PRIMARY[2]];
	}
	return null;
}

/** Rasterize a size×size RGBA buffer with 4×4 supersampling. */
function render(size: number, full: boolean): Buffer {
	const ss = 4;
	const out = Buffer.alloc(size * size * 4);
	for (let y = 0; y < size; y += 1) {
		for (let x = 0; x < size; x += 1) {
			let r = 0;
			let g = 0;
			let b = 0;
			let a = 0;
			for (let sy = 0; sy < ss; sy += 1) {
				for (let sx = 0; sx < ss; sx += 1) {
					const px = x + (sx + 0.5) / ss;
					const py = y + (sy + 0.5) / ss;
					const colour = sample(px, py, size, full);
					if (!colour) continue;
					// Premultiplied accumulation avoids fringes on the alpha edge.
					r += colour[0];
					g += colour[1];
					b += colour[2];
					a += 1;
				}
			}
			const i = (y * size + x) * 4;
			if (a > 0) {
				const coverage = (a / (ss * ss)) * 255;
				out[i] = Math.round((r / a));
				out[i + 1] = Math.round((g / a));
				out[i + 2] = Math.round((b / a));
				out[i + 3] = Math.round(coverage);
			}
		}
	}
	return out;
}

// ---- ICO container --------------------------------------------------------

/** Wrap PNG images in an ICO container (PNG payloads are valid since Vista). */
function encodeIco(images: Array<{ size: number; png: Buffer }>): Buffer {
	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0); // reserved
	header.writeUInt16LE(1, 2); // type: icon
	header.writeUInt16LE(images.length, 4);

	const directory = Buffer.alloc(16 * images.length);
	let offset = 6 + directory.length;
	images.forEach((image, index) => {
		const base = index * 16;
		directory[base] = image.size >= 256 ? 0 : image.size;
		directory[base + 1] = image.size >= 256 ? 0 : image.size;
		directory[base + 2] = 0; // palette
		directory[base + 3] = 0; // reserved
		directory.writeUInt16LE(1, base + 4); // colour planes
		directory.writeUInt16LE(32, base + 6); // bits per pixel
		directory.writeUInt32LE(image.png.length, base + 8);
		directory.writeUInt32LE(offset, base + 12);
		offset += image.png.length;
	});

	return Buffer.concat([header, directory, ...images.map((i) => i.png)]);
}

// ---- Emit -----------------------------------------------------------------

function writePng(name: string, size: number, full: boolean): Buffer {
	const png = encodePng(size, render(size, full));
	writeFileSync(join(STATIC, name), png);
	console.log(`[icons] ${name} (${size}x${size}, ${png.length} bytes)`);
	return png;
}

// Rounded tile for the browser favicon and manifest icons.
const favicon16 = encodePng(16, render(16, false));
const favicon32 = encodePng(32, render(32, false));
const favicon48 = encodePng(48, render(48, false));
const ico = encodeIco([
	{ size: 16, png: favicon16 },
	{ size: 32, png: favicon32 },
	{ size: 48, png: favicon48 },
]);
writeFileSync(join(STATIC, "favicon.ico"), ico);
console.log(`[icons] favicon.ico (16/32/48, ${ico.length} bytes)`);

// Full-bleed tile for the iOS home-screen icon (iOS applies its own mask).
writePng("apple-touch-icon.png", 180, true);
writePng("icon-192.png", 192, false);
writePng("icon-512.png", 512, false);
