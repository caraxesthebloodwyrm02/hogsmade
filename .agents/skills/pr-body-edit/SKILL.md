# Skill: Edit PR Body (Post-Merge or Mid-Flight)

**Trigger:** Need to add, correct, or append content to a GitHub PR body — especially after merge (e.g. adding a root-cause section once discovered) or when `gh pr edit` silently fails.

**Critical context:** `gh pr edit --body-file <file>` on this host returns exit code 0 with a deprecation warning about "Projects (classic)" but **does not actually update the PR body**. This has been empirically reproduced (PR #127, 2026-04-23). The workaround is a direct REST API PATCH.

---

## Recommended path — `gh api PATCH`

```bash
# 1. Fetch current body to verify starting state
gh pr view <NUM> --repo <OWNER>/<REPO> --json body -q .body > /tmp/pr_body_before.md
md5sum /tmp/pr_body_before.md   # remember this hash

# 2. Edit /tmp/pr_body_before.md to produce the target body
cp /tmp/pr_body_before.md /tmp/pr_body_new.md
# ... your edits ...

# 3. PATCH via REST (bypasses gh pr edit's silent failure)
BODY=$(jq -Rs . < /tmp/pr_body_new.md)
printf '{"body": %s}' "$BODY" > /tmp/pr_patch.json
gh api -X PATCH repos/<OWNER>/<REPO>/pulls/<NUM> --input /tmp/pr_patch.json

# 4. Verify the update actually landed
gh pr view <NUM> --repo <OWNER>/<REPO> --json body -q .body > /tmp/pr_body_after.md
md5sum /tmp/pr_body_after.md /tmp/pr_body_before.md /tmp/pr_body_new.md
# Expected: after.md hash == new.md hash, both != before.md hash
```

If `after.md == before.md` (no change) and you used `gh pr edit`, you hit the silent-failure bug. Switch to `gh api PATCH`.

## What not to do

- **Do not trust `gh pr edit` exit code alone.** Always verify via a post-edit `gh pr view` + hash compare.
- **Do not assume the deprecation warning is the failure.** The warning is about Projects (classic) GraphQL fields in the response; the actual PATCH failure is silent. The API call succeeds at the HTTP layer but the body doesn't update — likely a server-side validation path that returns success without applying the change.
- **Do not retry `gh pr edit` with different flags.** Same bug regardless of `--body`, `--body-file`, or `--editor`. Go direct to REST.

## When `gh pr edit` does work

It works reliably for non-body fields (title, labels, assignees, milestones, reviewers). The silent failure appears specific to the body field on this host configuration. Still verify.

## Reference

- Reproducible case: PR #127 (2026-04-23), commit `5cf5242`, reproduced twice with md5sum evidence.
- GitHub API docs: https://docs.github.com/en/rest/pulls/pulls#update-a-pull-request
- Related skill: `.agents/skills/mcp-health-check/SKILL.md`
