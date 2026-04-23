Summarize the ori notebook by category and source.

Usage: /notebook-summary [category]

Call `mcp__ori-server__notebook_summary` to get counts by category,
source, date range, unique projects, and unique tags.

If a category is specified, also call `mcp__ori-server__notebook_query`
with that category and show the 5 most recent entries as context.

Present as a compact dashboard: totals row, then per-category breakdown,
then recent highlights. Keep it under one screen.

Domain: enterprise-search
