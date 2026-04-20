.PHONY: test lint format run check

test:
	uv run pytest tests/ -v

lint:
	uv run ruff check src/ tests/

format:
	uv run ruff format src/ tests/

run:
	uv run harness

check: lint test
	@echo "gate-harness: all checks passed"

generate:
	uv run python -m harness.runner --generate

verify:
	uv run python -m harness.runner --verify
