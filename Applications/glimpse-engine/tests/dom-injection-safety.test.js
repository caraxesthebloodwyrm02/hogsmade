import assert from "node:assert/strict";
import test from "node:test";

import { escHtml, sanitizeCssClass } from "../core/dom-safe.js";

test("escHtml escapes attribute-breaking characters", () => {
  assert.equal(escHtml(`a"b<c>d&e`), "a&quot;b&lt;c&gt;d&amp;e");
  assert.equal(escHtml(null), "");
  assert.equal(escHtml(undefined), "");
});

test("sanitizeCssClass strips unsafe characters", () => {
  assert.equal(sanitizeCssClass('primary"><script'), "primaryscript");
  assert.equal(sanitizeCssClass("valid-token_01"), "valid-token_01");
  assert.equal(sanitizeCssClass(""), "");
});

test("preset option fragment cannot break out of value attribute", () => {
  const id = `foo" onmouseover="alert(1)`;
  const esc = escHtml;
  const frag = `<option value="${esc(id)}" selected>${esc(id)}</option>`;
  assert.ok(!frag.includes('value="foo"'));
  assert.ok(frag.includes("&quot;"));
});
