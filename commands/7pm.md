Start the 7PM review session (product-management domain).

Usage: /7pm

Follow the strict sequence from CHAIN:
19:00 — git status both repos (orient only, no edits)
19:05 — CascadeProjects parked batch
19:20 — submodule bump
19:25 — outer workspace parked batch
19:40 — open debt triage
19:55 — close + session log

Classification gate per parked item: coupled? intentional? complete? correct repo?

End with a session log entry appended to the ori notebook:
Call mcp**ori-server**notebook_add with category "decision",
title "7PM session log YYYY-MM-DD", body containing the classified items,
tags ["7pm", "session-log"].

Output contract: Session log entry. No open items left unclassified.

Domain: product-management
