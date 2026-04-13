import sharp from 'sharp';
import { existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcImage = 'C:/Users/PC/.gemini/antigravity/brain/5f34852c-3885-4f72-918e-eae84a656ebd/countercraft_icon_1776082211382.png';
const outDir = join(__dirname, '../public/icons');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

for (const size of sizes) {
  const outPath = join(outDir, `icon-${size}x${size}.png`);
  await sharp(srcImage)
    .resize(size, size, { fit: 'contain', background: { r: 28, g: 25, b: 23, alpha: 1 } })
    .png()
    .toFile(outPath);
  console.log(`✅ Generated ${size}x${size} → ${outPath}`);
}

// Also generate apple-touch-icon (180x180)
await sharp(srcImage)
  .resize(180, 180, { fit: 'contain', background: { r: 28, g: 25, b: 23, alpha: 1 } })
  .png()
  .toFile(join(__dirname, '../public/apple-touch-icon.png'));
console.log('✅ Generated apple-touch-icon.png');

// Copy 512 as favicon.ico compatible size
await sharp(srcImage)
  .resize(32, 32)
  .png()
  .toFile(join(__dirname, '../public/favicon-32.png'));
console.log('✅ Generated favicon-32.png');

console.log('\n🎉 All icons generated successfully!');
