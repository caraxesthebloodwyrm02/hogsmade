# Security

If you believe you have found a security vulnerability in Glimpse Engine, please report it responsibly to the repository maintainers (private channel or security contact for your organization). Do not open a public issue for undisclosed vulnerabilities.

## Hardening summary

The browser app applies HTML escaping and CSS class sanitization for dynamic UI (`core/dom-safe.js`), validates pipeline invocation with a session digest and ceremony checks (`core/digest-validator.js`, `core/ceremony-validator.js`), and redacts pathway telemetry by default (`pathway-logger.js`). Exported JSON uses path sanitization (`core/config-sanitizer.js`). The main shell still builds markup via `innerHTML`; sensitive interpolations are escaped but a full migration to DOM APIs would further reduce residual XSS risk.
