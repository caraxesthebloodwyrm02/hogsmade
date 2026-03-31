import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const bundlePath = join(process.cwd(), 'dist', 'assets');
const entries = readdirSync(bundlePath).filter((file) => file.endsWith('.js') || file.endsWith('.css'));
const sizes = entries.map((file) => {
  const fullPath = join(bundlePath, file);
  return { file, size: statSync(fullPath).size };
});

for (const entry of sizes) {
  console.log(`${entry.file}: ${entry.size} bytes`);
}
