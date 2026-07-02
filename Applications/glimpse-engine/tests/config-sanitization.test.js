import assert from "node:assert/strict";
import test from "node:test";

import { basenameOnly, deepSanitizePaths, maskPathsInString } from "../core/config-sanitizer.js";

test("basenameOnly extracts tail", () => {
  assert.equal(basenameOnly("/a/b/c.yaml"), "c.yaml");
  assert.equal(basenameOnly(String.raw`D:\data\out.json`), "out.json");
});

test("maskPathsInString replaces unix paths", () => {
  const s = "Read /home/user/proj/README.md now";
  assert.ok(!maskPathsInString(s).includes("/home/"));
  assert.ok(maskPathsInString(s).includes("README.md"));
});

test("deepSanitizePaths walks nested objects", () => {
  const raw = {
    note: "Path /mnt/data/secret.csv",
    nested: { p: String.raw`E:\Users\x\y.zip` },
    n: 42,
  };
  const out = deepSanitizePaths(raw);
  assert.ok(!JSON.stringify(out).includes("/mnt/"));
  assert.ok(!JSON.stringify(out).includes(String.raw`E:\Users`));
  assert.equal(out.n, 42);
});
