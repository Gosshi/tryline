import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const sizes = [
  { maskable: false, name: "icon-192.png", size: 192 },
  { maskable: false, name: "icon-512.png", size: 512 },
  { maskable: true, name: "icon-maskable-512.png", size: 512 },
];

async function main() {
  await mkdir("public/icons", { recursive: true });

  for (const { maskable, name, size } of sizes) {
    const padding = maskable ? Math.round(size * 0.1) : 0;
    const inner = size - padding * 2;
    const radius = Math.round(inner * 0.12);

    await sharp({
      create: {
        background: { alpha: 1, b: 74, g: 163, r: 22 },
        channels: 4,
        height: size,
        width: size,
      },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="${inner}" height="${inner}" xmlns="http://www.w3.org/2000/svg">
              <circle cx="${inner / 2}" cy="${inner / 2}" r="${radius}" fill="white"/>
            </svg>`,
          ),
          left: padding,
          top: padding,
        },
      ])
      .png()
      .toFile(path.join("public/icons", name));

    console.log(`Generated ${name}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
