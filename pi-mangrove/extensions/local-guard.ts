import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { resolve } from "node:path";

const dangerousCommandPatterns = [
  /\brm\s+(-rf?|--recursive)\b/i,
  /\bsudo\b/i,
  /\b(chmod|chown)\b.*\b777\b/i,
  /\bcurl\b.+\|\s*(sh|bash)\b/i,
  /\bwget\b.+\|\s*(sh|bash)\b/i,
  /\b(?:mkfs|fdisk|parted|dd)\b/i
];

const protectedPathFragments = [
  "/.env",
  "/.env.",
  "/.git/",
  "/node_modules/",
  "/.ssh/",
  "/.gnupg/",
  "/.aws/",
  "/.openclaw/",
  "/.pi/agent/",
  "/exec-approvals.json"
];

function normalizeTargetPath(inputPath: string, cwd: string): string {
  return resolve(cwd, inputPath);
}

function isProtectedPath(targetPath: string): boolean {
  return protectedPathFragments.some((fragment) => targetPath.includes(fragment));
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash") {
      const command = String(event.input.command ?? "");
      const isDangerous = dangerousCommandPatterns.some((pattern) => pattern.test(command));

      if (isDangerous) {
        if (!ctx.hasUI) {
          return { block: true, reason: "Dangerous command blocked (no UI for confirmation)" };
        }

        const choice = await ctx.ui.select(`Dangerous command:\n\n${command}\n\nAllow?`, ["Allow", "Block"]);

        if (choice !== "Allow") {
          return { block: true, reason: "Blocked by user" };
        }
      }

      return undefined;
    }

    if (event.toolName === "write" || event.toolName === "edit") {
      const inputPath = String(event.input.path ?? "");
      const targetPath = normalizeTargetPath(inputPath, ctx.cwd);

      if (isProtectedPath(targetPath)) {
        if (ctx.hasUI) {
          ctx.ui.notify(`Blocked write to protected path: ${targetPath}`, "warning");
        }
        return { block: true, reason: `Path "${targetPath}" is protected` };
      }
    }

    return undefined;
  });
}
