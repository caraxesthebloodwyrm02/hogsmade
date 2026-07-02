/**
 * Escape text for insertion into HTML text nodes and double-quoted attributes.
 */
export function escHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Restrict a token used in the class attribute to [a-zA-Z0-9_-].
 */
export function sanitizeCssClass(value) {
  const cleaned = String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
  return cleaned;
}
