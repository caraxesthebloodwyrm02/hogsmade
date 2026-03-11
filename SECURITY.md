# Security

## Reporting a vulnerability

If you believe you've found a security issue in this repository or its dependencies:

1. **Do not** open a public issue.
2. Report it privately (e.g. via the repository owner or GitHub Security Advisories if enabled).
3. Include steps to reproduce, impact, and any suggested fix if possible.

We will acknowledge and respond as soon as we can.

## Scope

This repo is a multi-project workspace. Report issues in the context of the specific project (e.g. afloat-server, pulse-server) when relevant. For dependency vulnerabilities, prefer upstream reporting and/or Dependabot where applicable.

## AI review availability

- AI review is required on pull requests where enabled. If the AI review system is unavailable for more than 24 hours, a documented human code review is sufficient. Record the outage window and the human reviewer in the PR discussion or description.

## Bot token hygiene

- Bot tokens are least-privilege, stored only in secret storage (never in repo files), and rotated every 90 days.
- On suspected compromise: revoke the token, rotate, re-authenticate dependent jobs, and backfill audit logs with the incident and remediation steps.
