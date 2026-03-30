.PHONY: test test-drift test-validators ci check smoke

test:
	node --test tests/*.test.js tests/**/*.test.js

test-drift:
	node --test tests/drift-guard/*.test.js

test-validators:
	node --test tests/validators/*.test.js

ci:
	node scripts/ci-check.mjs --strict

check: test ci

smoke:
	node scripts/smoke-test.mjs
