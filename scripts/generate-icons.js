// Generate PWA icons as simple colored squares with "B" letter
// Run: node scripts/generate-icons.js

const fs = require('fs');
const path = require('path');

function generateSVGIcon(size) {
  const fontSize = Math.floor(size * 0.55);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4a9eff"/>
      <stop offset="100%" style="stop-color:#a855f7"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.floor(size * 0.15)}" fill="url(#bg)"/>
  <text x="${size/2}" y="${size/2}" font-family="Inter, Arial, sans-serif" font-size="${fontSize}" font-weight="800" fill="white" text-anchor="middle" dominant-baseline="central">B</text>
</svg>`;
}

// Write SVG icons (browsers can use them directly)
const publicDir = path.join(__dirname, '..', 'public');

fs.writeFileSync(path.join(publicDir, 'icon-192.svg'), generateSVGIcon(192));
fs.writeFileSync(path.join(publicDir, 'icon-512.svg'), generateSVGIcon(512));
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), generateSVGIcon(32));

console.log('Icons generated (SVG format)');
