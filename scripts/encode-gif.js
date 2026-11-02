const fs = require('fs');
const path = require('path');
const { GIFEncoder, quantize, applyPalette } = require('./node_modules/gifenc');

function encodeGifFromFrames(manifestPath, outputPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const { width, height, frames } = manifest;

  const gif = GIFEncoder();
  const dir = path.dirname(manifestPath);

  for (const f of frames) {
    const rawPath = path.join(dir, f.file);
    const bgra = fs.readFileSync(rawPath);
    // Convert BGRA to RGBA
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0; i < bgra.length; i += 4) {
      rgba[i] = bgra[i + 2];     // R
      rgba[i + 1] = bgra[i + 1]; // G
      rgba[i + 2] = bgra[i];     // B
      rgba[i + 3] = bgra[i + 3]; // A
    }

    const palette = quantize(rgba, 256);
    const index = applyPalette(rgba, palette);

    gif.writeFrame(index, width, height, {
      palette,
      delay: f.delay || 500,
      repeat: 0
    });
  }

  gif.finish();
  fs.writeFileSync(outputPath, Buffer.from(gif.bytes()));
  console.log(`Generated: ${outputPath} (${fs.statSync(outputPath).size} bytes)`);
}

const args = process.argv.slice(2);
if (args.length >= 2) {
  encodeGifFromFrames(args[0], args[1]);
} else {
  console.log('Usage: node encode-gif.js <manifest.json> <output.gif>');
}
