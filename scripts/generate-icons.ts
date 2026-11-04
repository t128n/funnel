/**
 * Regenerate the raster icon set from `static/favicon.svg`.
 *
 * The SVG is the single source of truth for the mark and its colour. Run this
 * only when the mark changes:
 *
 *   bun scripts/generate-icons.ts
 *
 * Outputs `static/favicon.ico` (16, 32 and 48 px), `static/apple-touch-icon.png`
 * (180 px), `static/icon-192.png` and `static/icon-512.png`. The manifest and
 * the error page carry their own copy of the hex; `tests/brand-assets.test.ts`
 * keeps them in sync.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const ROOT = join(import.meta.dir, "..");
const STATIC = join(ROOT, "static");
const svg = readFileSync(join(STATIC, "favicon.svg"), "utf8");

const fill = svg.match(/<rect[^>]*\bfill="(#[0-9a-f]{6})"/i)?.[1];
if (!fill) throw new Error("favicon.svg has no six-digit rect fill");

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

async function render(size: number): Promise<Buffer> {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;overflow:hidden"><img src="${dataUrl}" width="${size}" height="${size}" style="display:block"></body></html>`,
  );
  await page.waitForLoadState("networkidle");
  return page.screenshot({ omitBackground: true });
}

function ico(images: Array<{ size: number; data: Buffer }>): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

try {
  const apple = await render(180);
  const icon192 = await render(192);
  const icon512 = await render(512);
  const icoImages: Array<{ size: number; data: Buffer }> = [];
  for (const size of [16, 32, 48]) {
    icoImages.push({ size, data: await render(size) });
  }

  writeFileSync(join(STATIC, "apple-touch-icon.png"), apple);
  writeFileSync(join(STATIC, "icon-192.png"), icon192);
  writeFileSync(join(STATIC, "icon-512.png"), icon512);
  writeFileSync(join(STATIC, "favicon.ico"), ico(icoImages));
  console.log(`Generated the icon set from favicon.svg (${fill}).`);
} finally {
  await browser.close();
}
