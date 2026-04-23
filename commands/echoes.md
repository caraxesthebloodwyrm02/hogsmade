Activate the Echoes workstream (software-engineering domain).

Usage: /echoes [task]

First read the echoes-dev skill if present. Apply gated-execution for
any behavioral change to canopy/echoes.

Constraints (from CHAIN):

- always python -m pip, never bare pip
- always --no-cov on test runs
- Ruff rules: E,W,F,I,B,C4,UP — ignores E501,B008,C901
- lint only files actively being modified

Output contract: Test output + lint clean before reporting done.

Domain: software-engineering
