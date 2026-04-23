Show the ecosystem health score trend for the last N days (data domain).

Usage: /seeds-trend [N days, default 7]

1. Call `mcp__seeds-server__ecosystem_scan` with saveSnapshot false to get
   current scores.
2. List existing snapshots from ~/.seeds-server/snapshots/ sorted by date.
3. Show a compact trend table: date | overallScore | delta | notable repos.
4. If any ori recommendations tagged "seeds-drift" exist, surface the most
   recent one via mcp**ori-server**notebook_query with tag "seeds-drift".

Keep the output under 30 lines. Flag score drops > 5 points as notable.

Domain: data
