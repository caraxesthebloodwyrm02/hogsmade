import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

try {
  require("rollup/dist/native.js");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  if (!message.includes("@rollup/rollup-")) {
    throw error;
  }

  console.error(
    [
      "Rollup native package is missing for this shell.",
      `Detected platform: ${process.platform}/${process.arch}.`,
      "This usually means `node_modules` was installed from a different OS (for example Windows) and then reused from WSL.",
      "Reinstall dependencies from the current shell so optional native packages match this platform:",
      "  Remove the node_modules folder, then run: npm install",
      "  (On Unix: rm -rf node_modules && npm install)",
    ].join("\n"),
  );

  process.exit(1);
}
