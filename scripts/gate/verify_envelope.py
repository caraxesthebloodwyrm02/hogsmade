"""Run the transition gate verification on the incoming envelope."""

import sys
import os
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
grid_main = root / 'GRID-main'
gate_dir = root / 'GATE'
sys.path.insert(0, str(grid_main))

from boundaries.transition_gate import GateKeeper, NonceRegistry
from boundaries.transition_gate.credential import get_secret

incoming = gate_dir / 'incoming'
matches = list(incoming.glob('envelope_GRID-main_*.json'))
assert matches, f"No envelope found in {incoming}"
path = matches[0]
print(f"Processing: {path.name}")

secret = get_secret("TransitionGate")
assert secret, "TransitionGate credential missing"

registry = NonceRegistry(
    str(gate_dir / '.nonce_registry.json'),
    max_age_seconds=600.0,
)

# Register the nonce from the envelope first (simulating it was issued)
env_data = json.loads(path.read_text())
registry._ensure_exists()
data = registry._load()
data[env_data["nonce"]] = {
    "issued_at": env_data["timestamp"],
    "burned": False,
    "burned_at": None,
}
registry._save(data)
print(f"Registered nonce: {env_data['nonce'][:16]}...")

gk = GateKeeper(
    user_secret=secret,
    nonce_registry=registry,
    audit_path=str(gate_dir / 'audit.ndjson'),
    max_age_seconds=600.0,
    require_tests=True,
    require_lint=False,
)

result = gk.verify_from_file(str(path), requested_action="read_only")
print(result.to_json())

if result.passed:
    out = gate_dir / 'results' / f'{result.envelope_id}.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, 'w') as f:
        json.dump(result.to_dict(), f, indent=2)
    path.unlink()
    print(f"\nWritten:  {out}")
    print(f"Cleaned:  {path}")
    print(f"Burned:   nonce_burned={result.nonce_burned}")
else:
    print(f"\nREJECTED at step {result.steps[-1].step}: {result.reason}")
    print("Envelope preserved for forensic review.")
