// Renders SVGs as PNGs with resvg, for `Ssg.rasterizeWith`.
//
// Reads images from stdin, each as the path to write its PNG to and its SVG, each followed by a NUL.
// The SVGs can use IBM Plex Sans and IBM Plex Mono, which are the only fonts that resvg loads, so
// that the images are the same on every machine.

import { Resvg } from "@resvg/resvg-js";
import { rmSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { text } from "node:stream/consumers";
import { inflateSync } from "node:zlib";

/**
 * Converts a WOFF font into the TrueType or OpenType font that it compresses. Fontsource only ships
 * WOFF and WOFF2, and resvg only reads uncompressed fonts.
 */
function decodeWoff(woff) {
  const numTables = woff.readUInt16BE(12);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const entry = 44 + i * 20;
    const offset = woff.readUInt32BE(entry + 4);
    const compLength = woff.readUInt32BE(entry + 8);
    const origLength = woff.readUInt32BE(entry + 12);
    const stored = woff.subarray(offset, offset + compLength);
    tables.push({
      tag: woff.readUInt32BE(entry),
      checksum: woff.readUInt32BE(entry + 16),
      // Tables that compression wouldn't shrink are stored as is.
      data: compLength < origLength ? inflateSync(stored) : stored,
    });
  }

  const pad = (n) => (n + 3) & ~3;
  const headerLength = 12 + numTables * 16;
  const font = Buffer.alloc(
    tables.reduce((length, t) => length + pad(t.data.length), headerLength),
  );
  const entrySelector = Math.floor(Math.log2(numTables));
  font.writeUInt32BE(woff.readUInt32BE(4), 0);
  font.writeUInt16BE(numTables, 4);
  font.writeUInt16BE(16 << entrySelector, 6);
  font.writeUInt16BE(entrySelector, 8);
  font.writeUInt16BE(numTables * 16 - (16 << entrySelector), 10);
  let offset = headerLength;
  tables.forEach((table, i) => {
    font.writeUInt32BE(table.tag, 12 + i * 16);
    font.writeUInt32BE(table.checksum, 16 + i * 16);
    font.writeUInt32BE(offset, 20 + i * 16);
    font.writeUInt32BE(table.data.length, 24 + i * 16);
    table.data.copy(font, offset);
    offset += pad(table.data.length);
  });
  return font;
}

const fontFiles = [
  "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff",
  "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff",
  "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff",
  "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff",
  "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff",
  "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-700-normal.woff",
];
// resvg only loads fonts from files in Node, so the decoded fonts are written to a directory that's
// removed afterward.
const fontDir = await mkdtemp(join(tmpdir(), "leanscript-site-fonts-"));
process.on("exit", () => rmSync(fontDir, { recursive: true, force: true }));
const fontPaths = await Promise.all(
  fontFiles.map(async (file) => {
    const path = join(fontDir, basename(file, ".woff") + ".ttf");
    await writeFile(path, decodeWoff(await readFile(new URL(import.meta.resolve(file)))));
    return path;
  }),
);

const fields = (await text(process.stdin)).split("\0");
fields.pop();
if (fields.length % 2 !== 0) {
  throw new Error("Expected a path and an SVG for each image.");
}

for (let i = 0; i < fields.length; i += 2) {
  const resvg = new Resvg(fields[i + 1], {
    font: { fontFiles: fontPaths, loadSystemFonts: false, defaultFontFamily: "IBM Plex Sans" },
  });
  await mkdir(dirname(fields[i]), { recursive: true });
  await writeFile(fields[i], resvg.render().asPng());
}
