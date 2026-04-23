Query the ori persistent notebook for decisions, trends, and observations.

Usage: /notebook-query [filter]

Call `mcp__ori-server__notebook_query` with the filter text as a tag or
category filter. If the argument looks like a category name (decision,
trend, observation, anomaly, cross-run-context), filter by category.
Otherwise search by tag.

Show results as a numbered list: timestamp, title, tags, one-line body
summary. Limit to 15 entries by default. Offer to show the full body of
any entry on request.

Domain: enterprise-search
