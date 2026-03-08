import { readFileSync, writeFileSync } from "fs";

const yaml = readFileSync("./glimpse.master.yaml", "utf8");
const escaped = yaml.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
const content = `export const DEFAULT_MASTER_YAML = \`${escaped}\`;\n`;
writeFileSync("./glimpse-engine/default-master.js", content);
console.log("default-master.js synced:", content.length, "bytes");
