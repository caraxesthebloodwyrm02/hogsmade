import { readFileSync, writeFileSync } from "fs";

import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const yaml = readFileSync(resolve(ROOT, "Applications/glimpse-engine/glimpse.master.yaml"), "utf8");
const escaped = yaml.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
const content = `export const DEFAULT_MASTER_YAML = \`${escaped}\`;\n`;
writeFileSync(resolve(ROOT, "Applications/glimpse-engine/default-master.js"), content);
console.log("default-master.js synced:", content.length, "bytes");
