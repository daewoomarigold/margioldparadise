// Scans public/sprites and writes public/sprite-manifest.json: a flat list of
// { file, width, height } for every sprite PNG, read straight from each
// file's PNG header (no image library needed).
//
// Re-run this any time files are added to or removed from public/sprites:
//   npm run sprites:manifest
//
// The sprite browser dev tool (src/dev/SpriteBrowser.jsx) fetches this file
// at runtime to know what's available to tag.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const spritesDir = join(__dirname, '..', 'public', 'sprites');
const outFile = join(__dirname, '..', 'public', 'sprite-manifest.json');

const PNG_SIGNATURE = '89504e470d0a1a0a';

function readPngSize(filePath) {
  const buf = readFileSync(filePath);
  if (buf.length < 24 || buf.toString('hex', 0, 8) !== PNG_SIGNATURE) {
    return null;
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

function naturalIndex(filename) {
  const match = filename.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

const files = readdirSync(spritesDir)
  .filter((f) => f.endsWith('.png'))
  .sort((a, b) => naturalIndex(a) - naturalIndex(b));

const manifest = [];
let skipped = 0;

for (const file of files) {
  const size = readPngSize(join(spritesDir, file));
  if (!size) {
    console.warn(`skipping unreadable PNG: ${file}`);
    skipped += 1;
    continue;
  }
  manifest.push({ file, width: size.width, height: size.height });
}

writeFileSync(outFile, JSON.stringify(manifest, null, 2));
console.log(`wrote ${manifest.length} entries to ${outFile}${skipped ? ` (skipped ${skipped})` : ''}`);
