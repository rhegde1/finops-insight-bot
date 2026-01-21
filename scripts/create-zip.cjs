#!/usr/bin/env node
/**
 * Cross-platform zip utility for creating deployment packages
 * Usage: node create-zip.cjs <output-zip> <source-dir>
 */

const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

const [outputZip, sourceDir] = process.argv.slice(2);

if (!sourceDir || !outputZip) {
  console.error('Usage: node create-zip.cjs <output-zip> <source-dir>');
  process.exit(1);
}

const outputStream = fs.createWriteStream(outputZip);
const archive = archiver('zip', { zlib: { level: 9 } });

archive.on('error', (err) => {
  console.error('Archive error:', err);
  process.exit(1);
});

outputStream.on('error', (err) => {
  console.error('Stream error:', err);
  process.exit(1);
});

outputStream.on('close', () => {
  console.log(`✓ Created ${outputZip} (${archive.pointer()} bytes)`);
  process.exit(0);
});

archive.pipe(outputStream);
archive.directory(sourceDir + '/', false);
archive.finalize();
