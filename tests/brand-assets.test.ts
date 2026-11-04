import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

const root = join(import.meta.dir, "..");
const BRAND = "#0060df";
const RETIRED = "3574f0";

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

interface Png {
  width: number;
  height: number;
  rows: Buffer[];
}

/** Decode the RGBA, 8-bit, non-interlaced PNGs that the icon generator emits. */
function decodePng(data: Buffer): Png {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!data.subarray(0, 8).equals(signature)) throw new Error("not a PNG");

  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  for (let offset = 8; offset < data.length; ) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    const payload = data.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = payload.readUInt32BE(0);
      height = payload.readUInt32BE(4);
      depth = payload[8];
      colorType = payload[9];
    } else if (type === "IDAT") {
      idat.push(payload);
    }
  }
  if (depth !== 8 || colorType !== 6) throw new Error("expected 8-bit RGBA PNG");

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const rows: Buffer[] = [];
  let previous = Buffer.alloc(stride);
  for (let y = 0, offset = 0; y < height; y += 1) {
    const filter = raw[offset];
    const row = Buffer.from(raw.subarray(offset + 1, offset + 1 + stride));
    offset += 1 + stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? row[x - 4] : 0;
      const up = previous[x];
      const upLeft = x >= 4 ? previous[x - 4] : 0;
      if (filter === 1) row[x] = (row[x] + left) & 0xff;
      else if (filter === 2) row[x] = (row[x] + up) & 0xff;
      else if (filter === 3) row[x] = (row[x] + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const pa = Math.abs(estimate - left);
        const pb = Math.abs(estimate - up);
        const pc = Math.abs(estimate - upLeft);
        const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        row[x] = (row[x] + predictor) & 0xff;
      } else if (filter !== 0) throw new Error(`unknown PNG filter ${filter}`);
    }
    rows.push(row);
    previous = row;
  }
  return { width, height, rows };
}

/** The tile is solid brand blue left of the funnel; sample well inside it. */
function tileColour(png: Png): string {
  const x = Math.floor(png.width * 0.1) * 4;
  const y = Math.floor(png.height / 2);
  const [r, g, b] = png.rows[y].subarray(x, x + 3);
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function icoPngs(data: Buffer): Array<{ size: number; png: Png }> {
  expect(data.readUInt16LE(2)).toBe(1);
  const count = data.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const entry = 6 + 16 * index;
    const size = data[entry] || 256;
    const length = data.readUInt32LE(entry + 8);
    const offset = data.readUInt32LE(entry + 12);
    return { size, png: decodePng(data.subarray(offset, offset + length)) };
  });
}

describe("brand assets", () => {
  test("favicon.svg declares the current brand blue", () => {
    const svg = read("static/favicon.svg");
    expect(svg).toContain(`fill="${BRAND}"`);
    expect(svg.toLowerCase()).not.toContain(RETIRED);
  });

  test("the web manifest themes the app with the brand blue", () => {
    const manifest = JSON.parse(read("static/site.webmanifest")) as {
      theme_color: string;
      background_color: string;
    };
    expect(manifest.theme_color.toLowerCase()).toBe(BRAND);
    expect(manifest.background_color.toLowerCase()).toBe("#212529");
  });

  test("the offline error page uses the brand blue", () => {
    const error = read("src/error.html");
    expect(error).toContain(`--primary: ${BRAND};`);
    expect(error.toLowerCase()).not.toContain(RETIRED);
  });

  test("no retired blue remains in the scoped static and head files", () => {
    const scoped = readdirSync(join(root, "static"))
      .filter((name) => !/\.(png|ico)$/.test(name))
      .map((name) => `static/${name}`)
      .concat(["src/error.html", "src/app.html"]);
    for (const file of scoped) {
      expect(read(file).toLowerCase()).not.toContain(RETIRED);
    }
  });

  test("the raster icons are the expected size and brand colour", () => {
    for (const [file, size] of [
      ["static/apple-touch-icon.png", 180],
      ["static/icon-192.png", 192],
      ["static/icon-512.png", 512],
    ] as const) {
      const png = decodePng(readFileSync(join(root, file)));
      expect({ file, width: png.width, height: png.height }).toEqual({
        file,
        width: size,
        height: size,
      });
      expect({ file, colour: tileColour(png) }).toEqual({ file, colour: BRAND });
    }
  });

  test("the ICO carries 16, 32 and 48 px brand tiles", () => {
    const images = icoPngs(readFileSync(join(root, "static/favicon.ico")));
    expect(images.map((image) => image.size)).toEqual([16, 32, 48]);
    for (const image of images) {
      expect(image.png.width).toBe(image.size);
      expect(image.png.height).toBe(image.size);
      expect(tileColour(image.png)).toBe(BRAND);
    }
  });
});
