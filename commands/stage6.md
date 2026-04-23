Generate a Stage 6 report for the current session (product-management domain).

Usage: /stage6 [row-title]

Produce a Stage 6 report using the standard fence convention:

<!-- STAGE-6-REPORT-BEGIN -->

## Row N — <row-title or "Session summary">

**What changed:** <files touched, one line each>
**Context used:** <existing assets reused, with paths>
**Gates:** <gated-execution stages passed / lint+test evidence>
**Verification:** <what was verified and how>
**Remaining:** <downstream tasks unblocked; any debt introduced>

<!-- STAGE-6-REPORT-END -->

The Stop hook will automatically capture this fence into the ori notebook
as a category:"decision" entry when the session ends.

Domain: product-management
